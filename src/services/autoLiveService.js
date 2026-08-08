const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const schedule = require('node-schedule');
const CDP = require('chrome-remote-interface');

class AutoLiveService extends EventEmitter {
    constructor(streamManager, database) {
        super();
        this.streamManager = streamManager;
        this.database = database;
        this.jobs = new Map();
        this.executedAutoRows = new Set();
        this.pollTimer = null;
        this.settingsKey = 'autoLive';
    }

    async getSettings() {
        const saved = await this.database.getSetting(this.settingsKey);
        const defaultChromeUserDataDir = path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data');
        const appChromeUserDataDir = this.getAppChromeUserDataDir();
        const migratedSaved = { ...(saved || {}) };
        if (!migratedSaved.chromeUserDataDir || migratedSaved.chromeUserDataDir === defaultChromeUserDataDir) {
            migratedSaved.chromeUserDataDir = appChromeUserDataDir;
        }

        return {
            enabled: false,
            googleScheduleUrl: '',
            pollMinutes: 1,
            catchUpMinutes: 5,
            chromePath: this.findChromePath(),
            chromeUserDataDir: appChromeUserDataDir,
            chromeProfile: 'Default',
            chromeDebugPort: 9223,
            facebookLiveUrl: 'https://www.facebook.com/live/producer',
            selectedFacebookPageName: '',
            selectedFacebookPageUrl: '',
            scannedFacebookPages: [],
            defaultVideoPath: '',
            defaultQuality: '720p',
            defaultBitrate: 4000,
            defaultFps: 30,
            keyScanTimeoutSeconds: 180,
            ...migratedSaved
        };
    }

    async saveSettings(settings) {
        const merged = { ...(await this.getSettings()), ...settings };
        await this.database.saveSetting(this.settingsKey, merged);
        if (merged.enabled) await this.reload();
        else this.stopAll();
        return merged;
    }

    async reload() {
        this.stopJobs();
        const settings = await this.getSettings();
        if (!settings.enabled || !settings.googleScheduleUrl) return [];

        const rows = await this.fetchGoogleSchedule(settings.googleScheduleUrl);
        const now = new Date();
        const catchUpWindow = new Date(now.getTime() - (Number(settings.catchUpMinutes) || 5) * 60 * 1000);
        const upcoming = rows.filter(row => row.scheduledAt && row.scheduledAt > now);
        const missed = rows.filter(row => row.scheduledAt && row.scheduledAt <= now && row.scheduledAt >= catchUpWindow && !this.executedAutoRows.has(row.id));

        for (const row of upcoming) {
            const job = schedule.scheduleJob(row.scheduledAt, () => this.executeScheduledRow(row));
            this.jobs.set(row.id, job);
        }

        for (const row of missed) {
            const job = setTimeout(() => this.executeScheduledRow(row), 1000);
            this.jobs.set(row.id, { cancel: () => clearTimeout(job) });
        }

        this.emit('autoLive:reloaded', { total: rows.length, scheduled: upcoming.length, catchUp: missed.length });
        this.startPolling(settings);
        return upcoming;
    }

    stopAll() {
        this.stopJobs();
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    stopJobs() {
        for (const job of this.jobs.values()) job.cancel();
        this.jobs.clear();
    }

    startPolling(settings) {
        if (this.pollTimer) clearInterval(this.pollTimer);
        const minutes = Math.max(1, Number(settings.pollMinutes) || 10);
        this.pollTimer = setInterval(() => {
            this.reload().catch(error => this.emit('autoLive:error', { error: error.message }));
        }, minutes * 60 * 1000);
    }

    async fetchGoogleSchedule(url) {
        const csvUrl = this.toCsvUrl(url);
        const text = await this.fetchText(csvUrl);
        const trimmed = text.trim();

        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            const parsed = JSON.parse(trimmed);
            const items = Array.isArray(parsed) ? parsed : (parsed.rows || parsed.data || parsed.items || []);
            return items.map((row, index) => this.normalizeRow(this.normalizeObjectKeys(row), index)).filter(Boolean);
        }

        return this.parseCsv(text).map((row, index) => this.normalizeRow(row, index)).filter(Boolean);
    }

    toCsvUrl(url) {
        const text = String(url || '').trim();
        const match = text.match(/\/spreadsheets\/d\/([^/]+)/);
        if (!match) return text;

        const gid = (text.match(/[?&]gid=([^&]+)/) || [])[1] || '0';
        return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`;
    }

    fetchText(url, redirects = 0) {
        return new Promise((resolve, reject) => {
            if (redirects > 5) {
                reject(new Error('Too many redirects when loading schedule'));
                return;
            }

            const client = url.startsWith('https:') ? https : http;
            const request = client.get(url, response => {
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    const nextUrl = new URL(response.headers.location, url).toString();
                    response.resume();
                    this.fetchText(nextUrl, redirects + 1).then(resolve, reject);
                    return;
                }
                if (response.statusCode !== 200) {
                    reject(new Error(`HTTP ${response.statusCode} when loading schedule`));
                    response.resume();
                    return;
                }
                let body = '';
                response.setEncoding('utf8');
                response.on('data', chunk => { body += chunk; });
                response.on('end', () => resolve(body));
            }).on('error', reject);

            request.setTimeout(30000, () => {
                request.destroy(new Error('Timeout when loading schedule'));
            });
        });
    }

    parseCsv(csv) {
        const rows = [];
        let row = [];
        let field = '';
        let quoted = false;

        for (let i = 0; i < csv.length; i++) {
            const char = csv[i];
            const next = csv[i + 1];

            if (quoted) {
                if (char === '"' && next === '"') {
                    field += '"';
                    i++;
                } else if (char === '"') {
                    quoted = false;
                } else {
                    field += char;
                }
            } else if (char === '"') {
                quoted = true;
            } else if (char === ',') {
                row.push(field);
                field = '';
            } else if (char === '\n') {
                row.push(field);
                rows.push(row);
                row = [];
                field = '';
            } else if (char !== '\r') {
                field += char;
            }
        }

        if (field || row.length) {
            row.push(field);
            rows.push(row);
        }

        if (rows.length < 2) return [];
        const headers = rows[0].map(h => this.normalizeHeader(h));
        return rows.slice(1).map(values => {
            const item = {};
            headers.forEach((header, index) => { item[header] = (values[index] || '').trim(); });
            return item;
        });
    }

    normalizeHeader(header) {
        return String(header || '')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '');
    }

    normalizeObjectKeys(row) {
        const normalized = {};
        for (const [key, value] of Object.entries(row || {})) {
            normalized[this.normalizeHeader(key)] = value == null ? '' : String(value);
        }
        return normalized;
    }

    normalizeRow(row, index) {
        const title = row.title || row.tieude || row.name || row.ten || '';
        const dateValue = this.normalizeDateCell(row.datetime || row.scheduledat || row.ngaydang || row.ngaygio || row.date || row.ngay || '');
        const timeValue = this.normalizeTimeCell(row.time || row.gio || '');
        const scheduledAt = this.parseDateTime(dateValue, timeValue);
        if (!title || !scheduledAt) return null;

        return {
            id: row.id || `google_${scheduledAt.getTime()}_${index}`,
            title,
            description: row.description || row.mota || '',
            scheduledAt,
            facebookLiveUrl: row.facebookliveurl || row.liveurl || row.linklive || row.pageurl || row.facebookpageurl || '',
            facebookPageName: row.facebookpagename || row.pagename || row.page || '',
            videoPath: row.videopath || row.video || row.file || '',
            quality: row.quality || row.chatluong || '',
            bitrate: Number(row.bitrate || row.bitratekbps || 0) || null,
            fps: Number(row.fps || 0) || null,
            stopAfterMinutes: Number(row.duration || row.thoiluong || row.sophut || 0) || null
        };
    }

    parseDateTime(dateValue, timeValue) {
        const raw = [dateValue, timeValue].filter(Boolean).join(' ').trim();
        if (!raw) return null;

        const match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?$/);
        if (match) {
            const [, day, month, year, hour = '0', minute = '0'] = match;
            return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute));
        }

        const direct = new Date(raw);
        if (!Number.isNaN(direct.getTime())) return direct;

        return null;
    }

    normalizeDateCell(value) {
        const text = String(value || '').trim();
        const match = text.match(/^(\d{1,2}[/-]\d{1,2}[/-]\d{4})(?:\s+00:00)?$/);
        return match ? match[1] : text;
    }

    normalizeTimeCell(value) {
        const text = String(value || '').trim();
        const match = text.match(/(?:^|\s)(\d{1,2}:\d{2})(?:\s|$)/);
        return match ? match[1] : text;
    }

    async executeRow(row) {
        const settings = await this.getSettings();
        this.emit('autoLive:status', { status: 'opening-chrome', row });
        const keyInfo = await this.getFacebookStreamInfo(row, settings);
        const videoConfig = await this.resolveVideoConfig(row.videoPath || settings.defaultVideoPath);

        const config = {
            name: row.title,
            platform: 'facebook',
            rtmpUrl: keyInfo.rtmpUrl,
            streamKey: keyInfo.streamKey,
            ...videoConfig,
            quality: row.quality || settings.defaultQuality,
            bitrate: row.bitrate || settings.defaultBitrate,
            fps: row.fps || settings.defaultFps,
            stopAfterMinutes: row.stopAfterMinutes || undefined,
            autoRestart: true
        };

        const streamId = await this.streamManager.startStream(config);
        await this.finishFacebookGoLive(row, settings);
        this.emit('autoLive:started', { row, streamId });
        return streamId;
    }

    async executeScheduledRow(row) {
        if (this.executedAutoRows.has(row.id)) return null;
        this.executedAutoRows.add(row.id);
        try {
            return await this.executeRow(row);
        } catch (error) {
            this.emit('autoLive:error', { row, error: error.message });
            throw error;
        }
    }

    async resolveVideoConfig(inputPath) {
        const source = String(inputPath || '').trim();
        if (!source) throw new Error('No videoPath in Google row or Auto Live settings');

        const stat = await fs.promises.stat(source).catch(() => null);
        if (!stat) throw new Error(`Video path not found: ${source}`);

        if (stat.isDirectory()) {
            if (!this.streamManager || typeof this.streamManager.scanVideoFolder !== 'function') {
                throw new Error('Cannot scan video folder without StreamManager');
            }
            const videos = await this.streamManager.scanVideoFolder(source);
            const paths = videos.map(video => video.path).filter(Boolean);
            if (!paths.length) throw new Error(`No supported video files in folder: ${source}`);
            return {
                playlist: {
                    videos: paths,
                    mode: 'sequential',
                    skipErrors: true
                },
                videoSource: paths[0]
            };
        }

        if (!stat.isFile()) throw new Error(`Video path is not a file or folder: ${source}`);
        return { videoSource: source };
    }

    async getFacebookStreamInfo(row, settings) {
        const port = Number(settings.chromeDebugPort) || 9223;
        await this.ensureChrome(settings, port, null, { visible: false });

        const client = await this.connectChromePage(port, /facebook\.com/i);
        try {
            const { Page, Runtime, Input } = client;
            await Page.enable();
            await this.minimizeChromeWindow(client);

            const liveUrl = this.normalizeFacebookLiveUrl(row.facebookLiveUrl, settings)
                || this.buildPageLiveUrl(settings)
                || this.normalizeFacebookLiveUrl(settings.facebookLiveUrl, settings)
                || settings.facebookLiveUrl;
            await Page.navigate({ url: liveUrl });
            await this.delay(3000);

            await this.trySetLiveText(Runtime, row);
            const deadline = Date.now() + (Number(settings.keyScanTimeoutSeconds) || 180) * 1000;
            while (Date.now() < deadline) {
                const result = await Runtime.evaluate({
                    returnByValue: true,
                    expression: `(() => {
                        const text = document.body ? document.body.innerText : '';
                        const values = Array.from(document.querySelectorAll('input, textarea'))
                          .map(el => el.value || el.getAttribute('value') || el.innerText || '')
                          .filter(Boolean);
                        const all = [text, ...values].join('\\n');
                        const rtmp = all.match(/rtmps?:\\/\\/[^\\s"'<>]+/i);
                        const fbKey = all.match(/FB-[A-Za-z0-9_\\-]+/);
                        return { url: location.href, title: document.title, rtmpUrl: rtmp && rtmp[0], streamKey: fbKey && fbKey[0], text: all.slice(0, 4000) };
                    })()`
                });

                const value = result.result && result.result.value;
                if (value && !value.streamKey) {
                    await this.prepareFacebookLiveProducer(Runtime, Input);
                }
                if (value && value.streamKey) {
                    const rtmpUrl = value.rtmpUrl || 'rtmps://live-api-s.facebook.com:443/rtmp/';
                    return { rtmpUrl: rtmpUrl.replace(/\/$/, ''), streamKey: value.streamKey };
                }

                this.emit('autoLive:status', { status: 'waiting-for-key', row, pageTitle: value?.title });
                await this.delay(5000);
            }

            throw new Error('Could not find RTMP URL and stream key. Chrome may need manual login/setup.');
        } finally {
            await client.close();
        }
    }

    async finishFacebookGoLive(row, settings) {
        const port = Number(settings.chromeDebugPort) || 9223;
        const client = await this.connectChromePage(port, /facebook\.com/i);
        try {
            const { Runtime, Input } = client;
            await this.waitForFacebookSourceConnected(Runtime, row);
            await this.ensureFacebookPostDetails(Runtime, Input, row);
            await this.clickFacebookGoLive(Runtime, Input, row);
            await this.waitForFacebookLiveDashboard(Runtime, row);
        } finally {
            await client.close();
        }
    }

    async waitForFacebookSourceConnected(Runtime, row) {
        const deadline = Date.now() + 120000;
        while (Date.now() < deadline) {
            const snapshot = await this.getFacebookLiveProducerSnapshot(Runtime);
            const text = snapshot.text || '';
            if (/dang phat truc tiep|ban dang phat truc tiep/.test(text)) return snapshot;
            if (/\b1\/3\b|\b2\/3\b|toc do bit|ty le khung hinh|fps|mbps|kbps|1080p|720p/.test(text)) return snapshot;
            this.emit('autoLive:status', { status: 'waiting-for-facebook-signal', row });
            await this.delay(3000);
        }
        throw new Error('Facebook did not detect the stream source after ffmpeg started');
    }

    async ensureFacebookPostDetails(Runtime, Input, row) {
        const title = String(row.title || '').trim();
        const description = String(row.description || '').trim();
        const before = await this.getFacebookLiveProducerSnapshot(Runtime);
        if ((before.text || '').includes(this.normalizeText(title)) && !/video truc tiep cua ban noi ve dieu gi/.test(before.text || '')) {
            return true;
        }

        await this.clickFacebookText(Runtime, Input, [
            'video truc tiep cua ban noi ve dieu gi',
            'chinh sua chi tiet bai viet',
            'edit post details',
            'what is your live video about'
        ]);
        await this.delay(1200);

        const titleFilled = await this.fillFacebookField(Runtime, Input, {
            kind: 'title',
            value: title,
            selectorExpression: `(() => {
                const visible = rect => rect && rect.width > 120 && rect.height > 20;
                const normalize = value => String(value || '')
                    .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
                    .replace(/\\u0111/g, 'd').replace(/\\u0110/g, 'D')
                    .replace(/\\s+/g, ' ').trim().toLowerCase();
                const items = Array.from(document.querySelectorAll('input[type="text"], input:not([type]), textarea'))
                    .map(el => ({ el, rect: el.getBoundingClientRect(), label: normalize([el.placeholder, el.getAttribute('aria-label'), el.name].join(' ')) }))
                    .filter(item => visible(item.rect) && !/khoa luong|stream key|url|rtmp/.test(item.label))
                    .sort((a, b) => (a.rect.top - b.rect.top) || (b.rect.width - a.rect.width));
                const item = items[0];
                if (!item) return null;
                return { x: item.rect.left + item.rect.width / 2, y: item.rect.top + item.rect.height / 2 };
            })()`
        });

        if (!titleFilled && title) {
            await this.trySetLiveText(Runtime, row);
        }

        if (description) {
            await this.fillFacebookField(Runtime, Input, {
                kind: 'description',
                value: description,
                selectorExpression: `(() => {
                    const visible = rect => rect && rect.width > 120 && rect.height > 40;
                    const normalize = value => String(value || '')
                        .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')
                        .replace(/\\u0111/g, 'd').replace(/\\u0110/g, 'D')
                        .replace(/\\s+/g, ' ').trim().toLowerCase();
                    const items = Array.from(document.querySelectorAll('[contenteditable="true"], textarea'))
                        .map(el => ({ el, rect: el.getBoundingClientRect(), label: normalize([el.getAttribute('aria-label'), el.getAttribute('aria-placeholder'), el.placeholder].join(' ')) }))
                        .filter(item => visible(item.rect) && !/tieu de|title|khoa luong|stream key/.test(item.label))
                        .sort((a, b) => (a.rect.top - b.rect.top) || (b.rect.height - a.rect.height));
                    const item = items[0];
                    if (!item) return null;
                    return { x: item.rect.left + item.rect.width / 2, y: item.rect.top + Math.min(item.rect.height / 2, 70) };
                })()`
            });
        }

        const saved = await this.clickFacebookButton(Runtime, Input, ['luu', 'save'], { preferLowest: false });
        if (saved) await this.delay(2500);
        return true;
    }

    async fillFacebookField(Runtime, Input, options) {
        if (!options.value) return false;
        const result = await Runtime.evaluate({ returnByValue: true, expression: options.selectorExpression });
        const point = result.result && result.result.value;
        if (!point) return false;

        await Input.dispatchMouseEvent({ type: 'mouseMoved', x: point.x, y: point.y });
        await Input.dispatchMouseEvent({ type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
        await Input.dispatchMouseEvent({ type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
        await this.delay(200);
        await Input.dispatchKeyEvent({ type: 'keyDown', key: 'Control', windowsVirtualKeyCode: 17, nativeVirtualKeyCode: 17, modifiers: 2 });
        await Input.dispatchKeyEvent({ type: 'keyDown', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65, modifiers: 2 });
        await Input.dispatchKeyEvent({ type: 'keyUp', key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, nativeVirtualKeyCode: 65, modifiers: 2 });
        await Input.dispatchKeyEvent({ type: 'keyUp', key: 'Control', windowsVirtualKeyCode: 17, nativeVirtualKeyCode: 17 });
        await Input.insertText({ text: options.value });
        await this.delay(300);
        return true;
    }

    async clickFacebookGoLive(Runtime, Input, row) {
        const clicked = await this.clickFacebookButton(Runtime, Input, ['phat truc tiep', 'go live'], { preferLowest: true, minWidth: 100 });
        if (!clicked) throw new Error('Could not click the final Facebook Go Live button');
        this.emit('autoLive:status', { status: 'facebook-go-live-clicked', row });
    }

    async waitForFacebookLiveDashboard(Runtime, row) {
        const deadline = Date.now() + 60000;
        while (Date.now() < deadline) {
            const snapshot = await this.getFacebookLiveProducerSnapshot(Runtime);
            const text = snapshot.text || '';
            if (/dang phat truc tiep|ban dang phat truc tiep/.test(text)) return snapshot;
            this.emit('autoLive:status', { status: 'waiting-for-facebook-live', row });
            await this.delay(3000);
        }
        throw new Error('Facebook Go Live was clicked, but live dashboard was not confirmed');
    }

    async clickFacebookButton(Runtime, Input, labels, options = {}) {
        const expression = `(() => {
            const labels = ${JSON.stringify(labels)};
            const minWidth = ${Number(options.minWidth || 0)};
            const preferLowest = ${options.preferLowest ? 'true' : 'false'};
            const normalize = value => String(value || '')
                .normalize('NFD')
                .replace(/[\\u0300-\\u036f]/g, '')
                .replace(/\\u0111/g, 'd')
                .replace(/\\u0110/g, 'D')
                .replace(/\\s+/g, ' ')
                .trim()
                .toLowerCase();
            const isDisabled = el => el.matches('[aria-disabled="true"], [disabled]') || el.getAttribute('tabindex') === '-1';
            const elements = Array.from(document.querySelectorAll('[role="button"], button, a[role="link"]'));
            const candidates = elements
                .map(el => {
                    const rect = el.getBoundingClientRect();
                    const text = normalize([el.innerText, el.textContent, el.getAttribute('aria-label')].join(' '));
                    return { el, rect, text };
                })
                .filter(item => item.rect.width >= minWidth && item.rect.height > 15 && item.rect.top >= 0 && item.rect.left >= 0)
                .filter(item => labels.some(label => item.text === label || item.text.includes(label)))
                .filter(item => !isDisabled(item.el));
            candidates.sort((a, b) => {
                if (preferLowest) return b.rect.top - a.rect.top;
                return (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height);
            });
            const item = candidates[0];
            if (!item) return null;
            item.el.scrollIntoView({ block: 'center', inline: 'center' });
            item.el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
            item.el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
            item.el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
            item.el.click();
            return { x: item.rect.left + item.rect.width / 2, y: item.rect.top + item.rect.height / 2 };
        })()`;
        const result = await Runtime.evaluate({ returnByValue: true, expression });
        const point = result.result && result.result.value;
        if (!point) return false;
        await Input.dispatchMouseEvent({ type: 'mouseMoved', x: point.x, y: point.y }).catch(() => {});
        await Input.dispatchMouseEvent({ type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 }).catch(() => {});
        await Input.dispatchMouseEvent({ type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 }).catch(() => {});
        return true;
    }

    normalizeText(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\u0111/g, 'd')
            .replace(/\u0110/g, 'D')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    buildPageLiveUrl(settings) {
        const pageUrl = String(settings.selectedFacebookPageUrl || '').replace(/\/$/, '');
        if (!pageUrl) return '';
        const profileMatch = pageUrl.match(/profile\.php\?id=([^&/]+)/);
        if (profileMatch) return `https://www.facebook.com/${profileMatch[1]}/live/producer`;
        return `${pageUrl}/live/producer`;
    }

    normalizeFacebookLiveUrl(inputUrl, settings = {}) {
        const raw = String(inputUrl || '').trim();
        if (!raw) return 'https://www.facebook.com/live/producer';

        const profileMatch = raw.match(/profile\.php\?id=([^&/]+)/);
        if (profileMatch) return 'https://www.facebook.com/live/producer';

        let parsed;
        try { parsed = new URL(raw); } catch (_) { return raw; }
        if (!/(^|\.)facebook\.com$/i.test(parsed.hostname)) return raw;
        if (/\/live\/producer\/?$/i.test(parsed.pathname)) return raw;
        if (/\/live\/producer\/v2\/?/i.test(parsed.pathname)) return raw;

        const path = parsed.pathname.replace(/\/$/, '');
        if (!path || path === '/') return 'https://www.facebook.com/live/producer';
        return 'https://www.facebook.com/live/producer';
    }

    async prepareFacebookLiveProducer(Runtime, Input) {
        const snapshot = await this.getFacebookLiveProducerSnapshot(Runtime);
        const text = snapshot.text || '';

        if (/thiet lap video truc tiep|set up live video/.test(text)) {
            const clicked = await this.clickFacebookText(Runtime, Input, ['thiet lap video truc tiep', 'set up live video']);
            if (clicked) await this.delay(10000);
        }

        const afterSetup = await this.getFacebookLiveProducerSnapshot(Runtime);
        if (!afterSetup.streamKey && /phan mem phat truc tiep|streaming software/.test(afterSetup.text || '')) {
            const clicked = await this.clickFacebookStreamingSoftware(Runtime, Input)
                || await this.clickFacebookText(Runtime, Input, ['phan mem phat truc tiep', 'streaming software']);
            if (clicked) await this.delay(8000);
        }
    }

    async getFacebookLiveProducerSnapshot(Runtime) {
        const result = await Runtime.evaluate({
            returnByValue: true,
            expression: `(() => {
                const normalize = value => String(value || '')
                    .normalize('NFD')
                    .replace(/[\\u0300-\\u036f]/g, '')
                    .replace(/đ/g, 'd')
                    .replace(/Đ/g, 'D')
                    .replace(/\\s+/g, ' ')
                    .trim()
                    .toLowerCase();
                const text = document.body ? document.body.innerText : '';
                const values = Array.from(document.querySelectorAll('input, textarea'))
                    .map(el => el.value || el.getAttribute('value') || el.innerText || '')
                    .filter(Boolean);
                const all = [text, ...values].join('\\n');
                const rtmp = all.match(/rtmps?:\\/\\/[^\\s"'<>]+/i);
                const key = all.match(/FB-[A-Za-z0-9_\\-]+/);
                return { text: normalize(all), rtmpUrl: rtmp && rtmp[0], streamKey: key && key[0] };
            })()`
        });
        return (result.result && result.result.value) || {};
    }

    async clickFacebookStreamingSoftware(Runtime, Input) {
        const result = await Runtime.evaluate({
            returnByValue: true,
            expression: `(() => {
                const normalize = value => String(value || '')
                    .normalize('NFD')
                    .replace(/[\\u0300-\\u036f]/g, '')
                    .replace(/đ/g, 'd')
                    .replace(/Đ/g, 'D')
                    .replace(/\\s+/g, ' ')
                    .trim()
                    .toLowerCase();
                const elements = Array.from(document.querySelectorAll('div, section, main'));
                const source = elements
                    .map(el => ({ el, text: normalize(el.innerText || el.textContent || ''), rect: el.getBoundingClientRect() }))
                    .filter(item => item.text.includes('chon nguon video') && item.text.includes('webcam') && item.text.includes('phan mem phat truc tiep') && item.rect.width > 250 && item.rect.height > 80)
                    .sort((a, b) => (a.rect.width * a.rect.height) - (b.rect.width * b.rect.height))[0];
                if (!source) return null;
                return {
                    x: source.rect.left + source.rect.width * 0.62,
                    y: source.rect.top + Math.min(120, source.rect.height * 0.58)
                };
            })()`
        });
        const point = result.result && result.result.value;
        if (!point) return false;
        await Input.dispatchMouseEvent({ type: 'mouseMoved', x: point.x, y: point.y });
        await Input.dispatchMouseEvent({ type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
        await Input.dispatchMouseEvent({ type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
        return true;
    }

    async clickFacebookText(Runtime, Input, needles) {
        const expression = `(() => {
            const needles = ${JSON.stringify(needles)};
            const normalize = value => String(value || '')
                .normalize('NFD')
                .replace(/[\\u0300-\\u036f]/g, '')
                .replace(/đ/g, 'd')
                .replace(/Đ/g, 'D')
                .replace(/\\s+/g, ' ')
                .trim()
                .toLowerCase();
            const isVisible = rect => rect && rect.width > 0 && rect.height > 0;
            const candidates = [];
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            while (walker.nextNode()) {
                const node = walker.currentNode;
                const text = normalize(node.nodeValue);
                if (!text || !needles.some(needle => text.includes(needle))) continue;
                let element = node.parentElement;
                for (let depth = 0; element && depth < 5; depth++, element = element.parentElement) {
                    const rect = element.getBoundingClientRect();
                    if (!isVisible(rect)) continue;
                    candidates.push({
                        x: rect.left + rect.width / 2,
                        y: rect.top + rect.height / 2,
                        area: rect.width * rect.height,
                        text: normalize(element.innerText || element.textContent || '')
                    });
                }
            }
            candidates.sort((a, b) => a.area - b.area);
            return candidates[0] || null;
        })()`;

        const result = await Runtime.evaluate({ returnByValue: true, expression });
        const point = result.result && result.result.value;
        if (!point) return false;
        await Runtime.evaluate({ expression: `window.scrollBy(0, ${Math.max(0, point.y - 360)})` }).catch(() => {});
        await this.delay(300);
        const adjusted = await Runtime.evaluate({ returnByValue: true, expression });
        const finalPoint = (adjusted.result && adjusted.result.value) || point;
        await Input.dispatchMouseEvent({ type: 'mouseMoved', x: finalPoint.x, y: finalPoint.y });
        await Input.dispatchMouseEvent({ type: 'mousePressed', x: finalPoint.x, y: finalPoint.y, button: 'left', clickCount: 1 });
        await Input.dispatchMouseEvent({ type: 'mouseReleased', x: finalPoint.x, y: finalPoint.y, button: 'left', clickCount: 1 });
        return true;
    }

    getAppChromeUserDataDir() {
        const base = process.env.APPDATA || process.cwd();
        return path.join(base, 'VICdigi Live Streamer', 'ChromeProfile');
    }

    async openChromeLogin() {
        const settings = await this.getSettings();
        await this.ensureChrome(settings, Number(settings.chromeDebugPort) || 9223, 'https://www.facebook.com/', { visible: true });
        return { success: true };
    }

    async scanFacebookPages() {
        const settings = await this.getSettings();
        const port = Number(settings.chromeDebugPort) || 9223;
        await this.ensureChrome(settings, port, 'https://www.facebook.com/pages/?category=your_pages', { visible: false });

        const client = await this.connectChromePage(port, /facebook\.com/i);
        try {
            const { Page, Runtime } = client;
            await Page.enable();
            await this.minimizeChromeWindow(client);
            const sources = [
                'https://www.facebook.com/pages/?category=your_pages',
                'https://www.facebook.com/pages/manage',
                'https://www.facebook.com/bookmarks/pages'
            ];
            const pages = [];
            const seen = new Set();

            for (const url of sources) {
                this.emit('autoLive:status', { status: 'scanning-pages', url });
                await Page.navigate({ url });
                await this.delay(5000);
                for (let i = 0; i < 5; i++) {
                    await Runtime.evaluate({ expression: 'window.scrollTo(0, document.body.scrollHeight)' }).catch(() => {});
                    await this.delay(1000);
                }

                const result = await Runtime.evaluate({
                    returnByValue: true,
                    expression: this.getFacebookPageScanExpression()
                });

                const items = (result.result && result.result.value) || [];
                for (const page of items) {
                    if (!page.url || seen.has(page.url)) continue;
                    seen.add(page.url);
                    pages.push(page);
                }
            }

            const limited = pages.slice(0, 50);
            const latestSettings = await this.getSettings();
            await this.database.saveSetting(this.settingsKey, {
                ...latestSettings,
                scannedFacebookPages: limited
            });
            return limited;
        } finally {
            await client.close();
        }
    }

    getFacebookPageScanExpression() {
        return `(() => {
            const reserved = new Set([
                'home','watch','marketplace','friends','notifications','messages','groups','events','gaming',
                'reel','reels','stories','help','privacy','policies','settings','login','recover','pages',
                'ads','business','commerce','fundraisers','memories','saved','videos','live','professional_dashboard',
                'latest','ad_center'
            ]);
            const badTextTokens = new Set([
                'home','watch','marketplace','friends','notifications','messages','groups','create',
                'see more','menu','search','settings','help','privacy','terms','meta','facebook',
                'trang','trang chu','thuoc phim','cong cu chuyen nghiep','trung tam quang cao',
                'meta business suite','kham pha','followed pages','followed page','tin nhan',
                'tao bai viet','quang cao','dashboard'
            ]);
            const pages = [];
            const seen = new Set();
            const anchors = Array.from(document.querySelectorAll('a[href]'));
            const normalizeText = (value) => String(value || '')
                .normalize('NFD')
                .replace(/[\\u0300-\\u036f]/g, '')
                .replace(/đ/g, 'd')
                .replace(/Đ/g, 'D')
                .replace(/\\s+/g, ' ')
                .trim()
                .toLowerCase();

            const cleanName = (value) => {
                let text = String(value || '').replace(/\\s+/g, ' ').trim();
                const prefixes = ['switch to ', 'go to ', 'open ', 'anh dai dien cua ', 'profile picture of '];
                for (const prefix of prefixes) {
                    if (normalizeText(text).startsWith(prefix)) {
                        text = text.slice(prefix.length).trim();
                        break;
                    }
                }
                return text;
            };

            for (const a of anchors) {
                const href = a.href || '';
                let parsed;
                try { parsed = new URL(href); } catch (_) { continue; }
                if (!/(^|\\.)facebook\\.com$/i.test(parsed.hostname)) continue;

                let name = cleanName(a.innerText || a.textContent || a.getAttribute('aria-label') || a.title);
                const normalizedName = normalizeText(name);
                if (!name || name.length < 2 || name.length > 120 || badTextTokens.has(normalizedName)) continue;
                if (normalizedName.includes('facebook') && normalizedName.length < 20) continue;
                if (/^\\d+$/.test(name) || !/[\\p{L}\\p{N}]/u.test(name)) continue;

                const path = parsed.pathname.replace(/\\/$/, '');
                const parts = path.split('/').filter(Boolean);
                if (!parts.length) continue;
                if (reserved.has(parts[0].toLowerCase())) continue;
                if (['groups','events','watch','reel','reels','stories','plugins','sharer'].includes(parts[0].toLowerCase())) continue;
                if (parsed.searchParams.has('sk') || parsed.searchParams.has('story_fbid') || parsed.searchParams.has('comment_id')) continue;

                let url = '';
                if (parts[0].toLowerCase() === 'profile.php') {
                    const id = parsed.searchParams.get('id');
                    if (!id) continue;
                    url = 'https://www.facebook.com/profile.php?id=' + encodeURIComponent(id);
                } else if (parts.length === 1) {
                    url = 'https://www.facebook.com/' + parts[0];
                } else {
                    continue;
                }

                if (seen.has(url)) continue;
                seen.add(url);
                pages.push({ name, url });
            }

            return pages;
        })()`;
    }

    async connectChromePage(port, preferredUrlPattern = null) {
        const targets = await CDP.List({ port });
        const pages = targets.filter(target => target.type === 'page');
        const target = pages.find(item => preferredUrlPattern && preferredUrlPattern.test(item.url || ''))
            || pages.find(item => item.url && !item.url.startsWith('chrome://'))
            || pages[0];
        if (!target) throw new Error('No Chrome page target found');
        return CDP({ port, target });
    }

    async minimizeChromeWindow(client) {
        try {
            const { Browser } = client;
            if (!Browser) return;
            const { windowId } = await Browser.getWindowForTarget();
            if (windowId) {
                await Browser.setWindowBounds({ windowId, bounds: { windowState: 'minimized' } });
            }
        } catch (_) {
            // Headless Chrome has no visible window.
        }
    }

    async trySetLiveText(Runtime, row) {
        const title = JSON.stringify(row.title || '');
        const description = JSON.stringify(row.description || '');
        await Runtime.evaluate({
            expression: `(() => {
                const title = ${title};
                const description = ${description};
                const fields = Array.from(document.querySelectorAll('input, textarea, [contenteditable="true"]'));
                const setValue = (el, value) => {
                    if (!el || !value) return false;
                    el.focus();
                    if (el.isContentEditable) el.innerText = value;
                    else el.value = value;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                    return true;
                };
                setValue(fields[0], title);
                setValue(fields[1], description);
            })()`
        }).catch(() => {});
    }

    async ensureChrome(settings, port, startUrl = null, options = {}) {
        try {
            await this.fetchJson(`http://127.0.0.1:${port}/json/version`);
            return;
        } catch (_) {
            // Start Chrome below.
        }

        const chromePath = settings.chromePath || this.findChromePath();
        if (!chromePath || !fs.existsSync(chromePath)) {
            throw new Error('Chrome path not found');
        }

        const args = [
            `--remote-debugging-port=${port}`,
            `--user-data-dir=${settings.chromeUserDataDir}`,
            `--profile-directory=${settings.chromeProfile || 'Default'}`,
            '--no-first-run',
            '--no-default-browser-check'
        ];

        if (options.visible === false) {
            args.push('--headless=new', '--disable-gpu', '--window-size=1365,900');
        } else {
            args.push('--start-maximized');
        }

        args.push(startUrl || settings.facebookLiveUrl || 'https://www.facebook.com/live/producer');

        spawn(chromePath, args, { detached: true, stdio: 'ignore' }).unref();
        const deadline = Date.now() + 30000;
        while (Date.now() < deadline) {
            try {
                await this.fetchJson(`http://127.0.0.1:${port}/json/version`);
                return;
            } catch (_) {
                await this.delay(1000);
            }
        }

        throw new Error('Chrome remote debugging did not start');
    }

    fetchJson(url) {
        return this.fetchText(url).then(text => JSON.parse(text));
    }

    findChromePath() {
        const candidates = [
            path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
            path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe')
        ];
        return candidates.find(candidate => candidate && fs.existsSync(candidate)) || '';
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = { AutoLiveService };
