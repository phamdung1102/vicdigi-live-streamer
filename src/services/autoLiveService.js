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
        this.pollTimer = null;
        this.settingsKey = 'autoLive';
    }

    async getSettings() {
        const saved = await this.database.getSetting(this.settingsKey);
        return {
            enabled: false,
            googleScheduleUrl: '',
            pollMinutes: 10,
            chromePath: this.findChromePath(),
            chromeUserDataDir: path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data'),
            chromeProfile: 'Default',
            chromeDebugPort: 9223,
            facebookLiveUrl: 'https://www.facebook.com/live/producer',
            selectedFacebookPageName: '',
            selectedFacebookPageUrl: '',
            defaultVideoPath: '',
            defaultQuality: '720p',
            defaultBitrate: 4000,
            defaultFps: 30,
            keyScanTimeoutSeconds: 180,
            ...saved
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
        const upcoming = rows.filter(row => row.scheduledAt && row.scheduledAt > new Date());

        for (const row of upcoming) {
            const job = schedule.scheduleJob(row.scheduledAt, () => this.executeRow(row).catch(error => {
                this.emit('autoLive:error', { row, error: error.message });
            }));
            this.jobs.set(row.id, job);
        }

        this.emit('autoLive:reloaded', { total: rows.length, scheduled: upcoming.length });
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
        const dateValue = row.datetime || row.scheduledat || row.ngaydang || row.ngaygio || row.date || row.ngay || '';
        const timeValue = row.time || row.gio || '';
        const scheduledAt = this.parseDateTime(dateValue, timeValue);
        if (!title || !scheduledAt) return null;

        return {
            id: row.id || `google_${scheduledAt.getTime()}_${index}`,
            title,
            description: row.description || row.mota || '',
            scheduledAt,
            facebookLiveUrl: row.facebookliveurl || row.liveurl || row.linklive || row.pageurl || '',
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

    async executeRow(row) {
        const settings = await this.getSettings();
        this.emit('autoLive:status', { status: 'opening-chrome', row });
        const keyInfo = await this.getFacebookStreamInfo(row, settings);
        const videoSource = row.videoPath || settings.defaultVideoPath;
        if (!videoSource) throw new Error('No videoPath in Google row or Auto Live settings');

        const config = {
            name: row.title,
            platform: 'facebook',
            rtmpUrl: keyInfo.rtmpUrl,
            streamKey: keyInfo.streamKey,
            videoSource,
            quality: row.quality || settings.defaultQuality,
            bitrate: row.bitrate || settings.defaultBitrate,
            fps: row.fps || settings.defaultFps,
            stopAfterMinutes: row.stopAfterMinutes || undefined,
            autoRestart: true
        };

        const streamId = await this.streamManager.startStream(config);
        this.emit('autoLive:started', { row, streamId });
        return streamId;
    }

    async getFacebookStreamInfo(row, settings) {
        const port = Number(settings.chromeDebugPort) || 9223;
        await this.ensureChrome(settings, port);

        const client = await CDP({ port });
        try {
            const { Page, Runtime } = client;
            await Page.enable();

            const liveUrl = row.facebookLiveUrl || this.buildPageLiveUrl(settings) || settings.facebookLiveUrl;
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
                if (value && value.rtmpUrl && value.streamKey) {
                    return { rtmpUrl: value.rtmpUrl.replace(/\/$/, ''), streamKey: value.streamKey };
                }

                this.emit('autoLive:status', { status: 'waiting-for-key', row, pageTitle: value?.title });
                await this.delay(5000);
            }

            throw new Error('Could not find RTMP URL and stream key. Chrome may need manual login/setup.');
        } finally {
            await client.close();
        }
    }

    buildPageLiveUrl(settings) {
        const pageUrl = String(settings.selectedFacebookPageUrl || '').replace(/\/$/, '');
        if (!pageUrl) return '';
        return `${pageUrl}/live/producer`;
    }

    async openChromeLogin() {
        const settings = await this.getSettings();
        await this.ensureChrome(settings, Number(settings.chromeDebugPort) || 9223, 'https://www.facebook.com/');
        return { success: true };
    }

    async scanFacebookPages() {
        const settings = await this.getSettings();
        const port = Number(settings.chromeDebugPort) || 9223;
        await this.ensureChrome(settings, port, 'https://www.facebook.com/pages/?category=your_pages');

        const client = await CDP({ port });
        try {
            const { Page, Runtime } = client;
            await Page.enable();
            await Page.navigate({ url: 'https://www.facebook.com/pages/?category=your_pages' });
            await this.delay(6000);

            const result = await Runtime.evaluate({
                returnByValue: true,
                expression: `(() => {
                    const anchors = Array.from(document.querySelectorAll('a[href]'));
                    const pages = [];
                    const seen = new Set();
                    for (const a of anchors) {
                        const name = (a.innerText || a.textContent || '').trim().replace(/\\s+/g, ' ');
                        const href = a.href || '';
                        if (!name || name.length < 2 || name.length > 120) continue;
                        if (!href.startsWith('https://www.facebook.com/')) continue;
                        if (/\\/pages\\/?|\\/profile\\.php|\\/groups\\//.test(href)) continue;
                        if (/[?&](sk|ref|comment_id|story_fbid)=/.test(href)) continue;
                        const url = href.split('?')[0].replace(/\\/$/, '');
                        const slug = url.replace('https://www.facebook.com/', '');
                        if (!slug || slug.includes('/') || ['home','watch','marketplace','friends','notifications','messages'].includes(slug)) continue;
                        if (seen.has(url)) continue;
                        seen.add(url);
                        pages.push({ name, url });
                    }
                    return pages.slice(0, 50);
                })()`
            });

            return (result.result && result.result.value) || [];
        } finally {
            await client.close();
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

    async ensureChrome(settings, port, startUrl = null) {
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
            '--no-default-browser-check',
            startUrl || settings.facebookLiveUrl || 'https://www.facebook.com/live/producer'
        ];

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
