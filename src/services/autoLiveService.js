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
        const defaultChromeUserDataDir = path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data');
        const appChromeUserDataDir = this.getAppChromeUserDataDir();
        const migratedSaved = { ...(saved || {}) };
        if (!migratedSaved.chromeUserDataDir || migratedSaved.chromeUserDataDir === defaultChromeUserDataDir) {
            migratedSaved.chromeUserDataDir = appChromeUserDataDir;
        }

        return {
            enabled: false,
            googleScheduleUrl: '',
            pollMinutes: 10,
            chromePath: this.findChromePath(),
            chromeUserDataDir: appChromeUserDataDir,
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
        const dateValue = this.normalizeDateCell(row.datetime || row.scheduledat || row.ngaydang || row.ngaygio || row.date || row.ngay || '');
        const timeValue = this.normalizeTimeCell(row.time || row.gio || '');
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
        await this.ensureChrome(settings, port, null, { visible: false });

        const client = await this.connectChromePage(port, /facebook\.com/i);
        try {
            const { Page, Runtime } = client;
            await Page.enable();
            await this.minimizeChromeWindow(client);

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
        const profileMatch = pageUrl.match(/profile\.php\?id=([^&]+)/);
        if (profileMatch) return `https://www.facebook.com/${profileMatch[1]}/live/producer`;
        return `${pageUrl}/live/producer`;
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

            return pages.slice(0, 50);
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
