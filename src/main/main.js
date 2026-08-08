const { app, BrowserWindow, ipcMain, dialog, Menu, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.setName('VICdigi Live Streamer');
const UPDATE_FEED_URL = 'https://github.com/phamdung1102/vicdigi-live-streamer/releases/latest/download/';
if (!app.isPackaged) {
  app.commandLine.appendSwitch('ignore-certificate-errors');
  app.commandLine.appendSwitch('allow-insecure-localhost', 'true');
}

if (process.platform === 'win32') {
  app.disableHardwareAcceleration();
}

Menu.setApplicationMenu(null);

let mainWindow;
let streamManager;
let scheduleService;
let autoLiveService;
let db;
let updateState = {
  checking: false,
  available: false,
  downloaded: false,
  version: null,
  error: null
};

// ✅ Hot reload watcher
let folderWatcher = null;
let watchedFolder = null;

// ✅ System metrics: track previous CPU values for delta calculation
let prevCpuInfo = os.cpus().map(cpu => ({ ...cpu.times }));
let prevNetStats = { rx: 0, tx: 0, time: Date.now() };

function getCpuPercent() {
  const cpus = os.cpus();
  let totalIdle = 0, totalTick = 0;
  cpus.forEach((cpu, i) => {
    const prev = prevCpuInfo[i] || cpu.times;
    const dIdle = cpu.times.idle - (prev.idle || 0);
    const dTotal = Object.values(cpu.times).reduce((a, b) => a + b, 0)
                 - Object.values(prev).reduce((a, b) => a + b, 0);
    totalIdle += dIdle;
    totalTick += dTotal || 1;
  });
  prevCpuInfo = cpus.map(cpu => ({ ...cpu.times }));
  return Math.round((1 - totalIdle / totalTick) * 100);
}

function getMemoryInfo() {
  const total = os.totalmem();
  const free  = os.freemem();
  const used  = total - free;
  return {
    used: Math.round(used / 1024 / 1024),    // MB
    total: Math.round(total / 1024 / 1024),  // MB
    percent: Math.round((used / total) * 100)
  };
}

function sendUpdateStatus(status, extra = {}) {
  updateState = { ...updateState, ...extra };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:status', { status, state: updateState, ...extra });
  }
}

async function getUpdaterSettings() {
  const saved = db ? await db.getSetting('updater') : null;
  return {
    enabled: true,
    autoDownload: true,
    updateUrl: UPDATE_FEED_URL,
    checkOnStart: true,
    ...saved
  };
}

async function saveUpdaterSettings(settings) {
  const merged = { ...(await getUpdaterSettings()), ...settings };
  if (!merged.updateUrl) merged.updateUrl = UPDATE_FEED_URL;
  if (db) await db.saveSetting('updater', merged);
  configureAutoUpdater(merged);
  return merged;
}

function configureAutoUpdater(settings) {
  autoUpdater.autoDownload = !!settings.autoDownload;
  autoUpdater.autoInstallOnAppQuit = false;

  const updateUrl = settings.updateUrl || UPDATE_FEED_URL;
  if (updateUrl) {
    autoUpdater.setFeedURL({
      provider: 'generic',
      url: updateUrl
    });
  }
}

function setupAutoUpdaterEvents() {
  autoUpdater.on('checking-for-update', () => {
    sendUpdateStatus('checking', { checking: true, error: null });
  });

  autoUpdater.on('update-available', (info) => {
    sendUpdateStatus('available', {
      checking: false,
      available: true,
      downloaded: false,
      version: info.version
    });
  });

  autoUpdater.on('update-not-available', (info) => {
    sendUpdateStatus('not-available', {
      checking: false,
      available: false,
      downloaded: false,
      version: info.version || app.getVersion()
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendUpdateStatus('download-progress', { progress });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendUpdateStatus('downloaded', {
      checking: false,
      available: true,
      downloaded: true,
      version: info.version
    });
  });

  autoUpdater.on('error', (error) => {
    sendUpdateStatus('error', {
      checking: false,
      error: error.message
    });
  });
}

// Broadcast real system metrics every 2 seconds
function startSystemMetricsBroadcast() {
  setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const metrics = {
      cpu: getCpuPercent(),
      memory: getMemoryInfo(),
      timestamp: Date.now()
    };
    mainWindow.webContents.send('system:metrics', metrics);
  }, 2000);
}

function createWindow() {
  const isProduction = app.isPackaged;

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: isProduction
    },
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../../assets/icon.ico'),
    titleBarStyle: 'default',
    frame: true,
    backgroundColor: '#1a1b26',
    title: `${app.getName()} v${app.getVersion()}`
  });

  const indexPath = path.join(__dirname, '../renderer/pages/index.html');

  if (!fs.existsSync(indexPath)) {
    console.error('Index file not found:', indexPath);
    mainWindow.loadURL(`data:text/html,<html><body style="font-family:Arial;padding:20px"><h1>Error Loading Application</h1><p>Could not find index.html at: ${indexPath}</p></body></html>`);
  } else {
    mainWindow.loadFile(indexPath);
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.setTitle(`${app.getName()} v${app.getVersion()}`);
    mainWindow.show();
    if (!isProduction) {
      mainWindow.webContents.openDevTools();
    }
  });

  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.removeMenu();
  mainWindow.setMenuBarVisibility(false);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  setupAutoUpdaterEvents();
  createWindow();
  initializeServices();
  startSystemMetricsBroadcast();
});

async function initializeServices() {
  if (db && streamManager && scheduleService && autoLiveService) return;

  try {
    const { DatabaseService } = require('../database/database');
    const { StreamManager } = require('../services/streamManager');
    const { ScheduleService } = require('../services/scheduleService');
    const { AutoLiveService } = require('../services/autoLiveService');

    db = new DatabaseService();
    await db.initialize();

    streamManager = new StreamManager(db);
    scheduleService = new ScheduleService(streamManager, db);
    autoLiveService = new AutoLiveService(streamManager, db);
    await scheduleService.loadSchedules();
    const autoLiveSettings = await autoLiveService.getSettings();
    if (autoLiveSettings.enabled) await autoLiveService.reload();
    const updaterSettings = await getUpdaterSettings();
    configureAutoUpdater(updaterSettings);
    if (app.isPackaged && updaterSettings.enabled && updaterSettings.checkOnStart) {
      setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
    }

    const send = (channel, data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(channel, data);
      }
    };

    streamManager.on('stream:started',      (d) => send('stream:started', d));
    streamManager.on('stream:stats',        (d) => send('stream:stats', d));
    streamManager.on('stream:stopped',      (d) => {
      // ✅ Save history on stop
      if (d && d.streamId) {
        saveStreamHistory(d.streamId, d);
      }
      send('stream:stopped', d);
    });
    streamManager.on('stream:error',        (d) => {
      if (d && d.streamId) {
        saveStreamHistory(d.streamId, { ...d, exitReason: 'error' });
      }
      send('stream:error', d);
    });
    streamManager.on('stream:countdown',    (d) => send('stream:countdown', d));
    streamManager.on('stream:health-warning',(d) => send('stream:health-warning', d));
    streamManager.on('stream:restarting',   (d) => send('stream:restarting', d));
    // ✅ Preview thumbnail
    streamManager.on('stream:thumbnail',    (d) => send('stream:thumbnail', d));
    // ✅ Next video in playlist
    streamManager.on('stream:next-video',   (d) => send('stream:next-video', d));
    autoLiveService.on('autoLive:status',    (d) => send('autoLive:status', d));
    autoLiveService.on('autoLive:started',   (d) => send('autoLive:started', d));
    autoLiveService.on('autoLive:error',     (d) => send('autoLive:error', d));
    autoLiveService.on('autoLive:reloaded',  (d) => send('autoLive:reloaded', d));

    console.log('Services initialized');
  } catch (error) {
    console.error('Service initialization error:', error);
  }
}

// ✅ Save stream history to database
async function saveStreamHistory(streamId, data) {
  try {
    if (!db) return;
    const streamInfo = streamManager ? streamManager.getStreamStatus(streamId) : null;
    const config = streamInfo?.config || data.config || {};
    const startTime = streamInfo?.startTime || data.startTime || Date.now();
    const duration = Math.round((Date.now() - startTime) / 1000); // seconds

    await db.saveStreamHistory(streamId, {
      name: config.name || 'Unknown',
      platform: config.platform || 'custom',
      quality: config.quality || '720p',
      startTime: new Date(startTime).toISOString(),
      endTime: new Date().toISOString(),
      duration,
      exitReason: data.exitReason || 'stopped',
      errorMessage: data.error || null,
      avgFps: data.stats?.fps || 0,
      avgBitrate: data.stats?.bitrate || 0
    });
  } catch (err) {
    console.error('Failed to save stream history:', err);
  }
}

// ──────────────────────────────────────────────
// IPC: Playlist
// ──────────────────────────────────────────────
ipcMain.handle('playlist:select', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Chọn thư mục video'
    });
    if (!result.canceled) return { success: true, path: result.filePaths[0] };
    return { success: false };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('playlist:getVideos', async (event, folderPath) => {
  try {
    if (streamManager) {
      const videos = await streamManager.scanVideoFolder(folderPath);
      return { success: true, videos };
    }
    const fsp = require('fs').promises;
    const files = await fsp.readdir(folderPath);
    const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv'];
    const videos = [];
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (videoExtensions.includes(ext)) {
        const filePath = path.join(folderPath, file);
        const stat = await fsp.stat(filePath);
        videos.push({ name: file, path: filePath, size: stat.size, extension: ext });
      }
    }
    return { success: true, videos };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ✅ Hot reload: watch folder for new/removed video files
ipcMain.handle('playlist:watchFolder', async (event, folderPath) => {
  try {
    // Stop previous watcher
    if (folderWatcher) {
      folderWatcher.close();
      folderWatcher = null;
    }

    watchedFolder = folderPath;
    const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm'];

    folderWatcher = fs.watch(folderPath, { persistent: false }, async (eventType, filename) => {
      if (!filename) return;
      const ext = path.extname(filename).toLowerCase();
      if (!videoExtensions.includes(ext)) return;

      // Debounce — wait 500ms before scanning
      clearTimeout(folderWatcher._debounce);
      folderWatcher._debounce = setTimeout(async () => {
        try {
          const fsp = require('fs').promises;
          const files = await fsp.readdir(folderPath);
          const videos = [];
          for (const f of files) {
            const fext = path.extname(f).toLowerCase();
            if (!videoExtensions.includes(fext)) continue;
            const fp = path.join(folderPath, f);
            const stat = await fsp.stat(fp).catch(() => null);
            if (stat) videos.push({ name: f, path: fp, size: stat.size, extension: fext });
          }
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('playlist:folderChanged', { videos, eventType, filename });
          }
        } catch (e) {
          console.error('Hot reload scan error:', e);
        }
      }, 500);
    });

    console.log('✅ Watching folder for changes:', folderPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('playlist:unwatchFolder', () => {
  if (folderWatcher) {
    folderWatcher.close();
    folderWatcher = null;
    watchedFolder = null;
  }
  return { success: true };
});

// ──────────────────────────────────────────────
// IPC: Video
// ──────────────────────────────────────────────
ipcMain.handle('video:selectFile', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      title: 'Chọn file video',
      filters: [{ name: 'Video Files', extensions: ['mp4', 'mkv', 'avi', 'mov'] }]
    });
    if (!result.canceled) return { success: true, path: result.filePaths[0] };
    return { success: false };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ──────────────────────────────────────────────
// IPC: Stream
// ──────────────────────────────────────────────
ipcMain.handle('stream:start', async (event, config) => {
  try {
    if (!config.rtmpUrl || !config.streamKey) {
      return { success: false, error: 'Thiếu RTMP URL hoặc Stream Key' };
    }
    if (!streamManager) {
      await initializeServices();
      if (!streamManager) return { success: false, error: 'Stream manager not initialized' };
    }
    const streamId = await streamManager.startStream(config);
    setTimeout(() => {
      const status = streamManager.getStreamStatus(streamId);
      if (status && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('stream:started', { streamId, config: status.config, status: status.status });
      }
    }, 500);
    return { success: true, streamId };
  } catch (error) {
    console.error('Stream start error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stream:stop', async (event, streamId) => {
  try {
    if (streamManager) {
      await streamManager.stopStream(streamId);
      return { success: true };
    }
    return { success: false, error: 'Stream manager not initialized' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stream:stopAll', async () => {
  try {
    if (streamManager) { await streamManager.stopAllStreams(); return { success: true }; }
    return { success: false, error: 'Stream manager not initialized' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stream:getStatus', async (event, streamId) => {
  try {
    if (streamManager) {
      const status = streamManager.getStreamStatus(streamId);
      return { success: true, status };
    }
    return { success: false, error: 'Stream manager not initialized' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stream:getAllStatus', async () => {
  try {
    if (streamManager) {
      const statuses = streamManager.getAllStreamStatus();
      return { success: true, statuses };
    }
    return { success: true, statuses: [] };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stream:getSavedConfigs', async () => {
  try {
    if (!db) return { success: true, streams: [] };
    const streams = await db.getAllStreams();
    const sanitized = streams.map((stream) => ({
      id: stream.id,
      name: stream.name || stream.id,
      platform: stream.platform || 'custom',
      quality: stream.quality || '720p',
      status: stream.status || 'unknown',
      createdAt: stream.createdAt,
      updatedAt: stream.updatedAt
    }));
    return { success: true, streams: sanitized };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ──────────────────────────────────────────────
// IPC: Schedule
// ──────────────────────────────────────────────
ipcMain.handle('schedule:getAll', async () => {
  try {
    if (!db) return { success: true, schedules: [] };
    const schedules = await db.getAllSchedules();
    return { success: true, schedules };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('schedule:create', async (event, scheduleConfig) => {
  try {
    if (!scheduleService) {
      await initializeServices();
      if (!scheduleService) return { success: false, error: 'Schedule service not initialized' };
    }

    const scheduleId = await scheduleService.createSchedule(scheduleConfig);
    return { success: true, scheduleId };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('schedule:update', async (event, scheduleId, updates) => {
  try {
    if (!scheduleService) return { success: false, error: 'Schedule service not initialized' };
    await scheduleService.updateSchedule(scheduleId, updates);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('schedule:toggle', async (event, scheduleId) => {
  try {
    if (!scheduleService) return { success: false, error: 'Schedule service not initialized' };
    const active = await scheduleService.toggleSchedule(scheduleId);
    return { success: true, active };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('schedule:delete', async (event, scheduleId) => {
  try {
    if (!scheduleService) return { success: false, error: 'Schedule service not initialized' };
    await scheduleService.deleteSchedule(scheduleId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
ipcMain.handle('autoLive:getSettings', async () => {
  try {
    if (!autoLiveService) await initializeServices();
    return { success: true, settings: await autoLiveService.getSettings() };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('autoLive:saveSettings', async (event, settings) => {
  try {
    if (!autoLiveService) await initializeServices();
    return { success: true, settings: await autoLiveService.saveSettings(settings) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('autoLive:sync', async () => {
  try {
    if (!autoLiveService) await initializeServices();
    const upcoming = await autoLiveService.reload();
    return { success: true, upcoming };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('autoLive:previewGoogle', async (event, url) => {
  try {
    if (!autoLiveService) await initializeServices();
    const rows = await autoLiveService.fetchGoogleSchedule(url);
    return { success: true, rows };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// ──────────────────────────────────────────────
// IPC: Settings
// ──────────────────────────────────────────────


ipcMain.handle('autoLive:openChromeLogin', async () => {
  try {
    if (!autoLiveService) await initializeServices();
    await autoLiveService.openChromeLogin();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('autoLive:scanFacebookPages', async () => {
  try {
    if (!autoLiveService) await initializeServices();
    const pages = await autoLiveService.scanFacebookPages();
    return { success: true, pages };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('autoLive:selectFacebookPage', async (event, page) => {
  try {
    if (!autoLiveService) await initializeServices();
    const current = await autoLiveService.getSettings();
    const cleanUrl = String(page.url || '').replace(/\/$/, '');
    const facebookLiveUrl = autoLiveService.buildPageLiveUrl({ selectedFacebookPageUrl: cleanUrl }) || current.facebookLiveUrl;
    const settings = await autoLiveService.saveSettings({
      ...current,
      selectedFacebookPageName: page.name,
      selectedFacebookPageUrl: cleanUrl,
      facebookLiveUrl
    });
    return { success: true, settings };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
ipcMain.handle('updater:getSettings', async () => {
  try {
    return { success: true, settings: await getUpdaterSettings(), state: updateState, version: app.getVersion() };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('updater:saveSettings', async (event, settings) => {
  try {
    return { success: true, settings: await saveUpdaterSettings(settings) };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('updater:check', async () => {
  try {
    const settings = await getUpdaterSettings();
    if (!app.isPackaged) return { success: false, error: 'Auto update only works in packaged app' };
    configureAutoUpdater(settings);
    await autoUpdater.checkForUpdates();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('updater:download', async () => {
  try {
    await autoUpdater.downloadUpdate();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('updater:install', () => {
  try {
    autoUpdater.quitAndInstall(false, true);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
ipcMain.handle('settings:get', async (event, key) => {
  if (db) return await db.getSetting(key);
  return null;
});
ipcMain.handle('settings:set', async (event, key, value) => {
  if (db) await db.saveSetting(key, value);
  return true;
});
ipcMain.handle('settings:getAll', async () => {
  if (db) return await db.getAllSettings();
  return {};
});

// ──────────────────────────────────────────────
// ✅ IPC: System metrics (on-demand)
// ──────────────────────────────────────────────
ipcMain.handle('system:getMetrics', () => {
  return {
    cpu: getCpuPercent(),
    memory: getMemoryInfo(),
    timestamp: Date.now()
  };
});

// ──────────────────────────────────────────────
// ✅ IPC: Stream History
// ──────────────────────────────────────────────
ipcMain.handle('history:getAll', async (event, limit = 100) => {
  try {
    if (!db) return { success: true, history: [] };
    // Retrieve all history entries (no streamId filter)
    const raw = db.data.streamHistory || [];
    const history = raw.slice(-limit).reverse();
    return { success: true, history };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('history:getByStream', async (event, streamId, limit = 20) => {
  try {
    if (!db) return { success: true, history: [] };
    const history = await db.getStreamHistory(streamId, limit);
    return { success: true, history };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('history:clear', async () => {
  try {
    if (db) {
      db.data.streamHistory = [];
      await db.save();
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('history:exportJson', async () => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Xuất lịch sử stream',
      defaultPath: `stream-history-${new Date().toISOString().slice(0,10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled) return { success: false };
    const history = db?.data?.streamHistory || [];
    fs.writeFileSync(result.filePath, JSON.stringify(history, null, 2), 'utf8');
    return { success: true, path: result.filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ──────────────────────────────────────────────
// ✅ IPC: Config Export / Import
// ──────────────────────────────────────────────
ipcMain.handle('config:exportStreams', async () => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Xuất cấu hình stream',
      defaultPath: `vic-streams-config-${new Date().toISOString().slice(0,10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    if (result.canceled) return { success: false };

    // Export stream configs WITHOUT stream keys (security)
    const streams = db?.data?.streams || {};
    const exported = Object.values(streams).map(s => ({
      name: s.name,
      platform: s.platform,
      rtmpUrl: s.rtmpUrl,
      // streamKey intentionally omitted for security
      quality: s.quality,
      fps: s.fps,
      bitrate: s.bitrate
    }));
    fs.writeFileSync(result.filePath, JSON.stringify({ version: '1.0', streams: exported }, null, 2), 'utf8');
    return { success: true, path: result.filePath, count: exported.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('config:importStreams', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Nhập cấu hình stream',
      filters: [{ name: 'JSON', extensions: ['json'] }],
      properties: ['openFile']
    });
    if (result.canceled) return { success: false };
    const content = fs.readFileSync(result.filePaths[0], 'utf8');
    const parsed = JSON.parse(content);
    if (!parsed.streams || !Array.isArray(parsed.streams)) {
      return { success: false, error: 'File không hợp lệ' };
    }
    return { success: true, streams: parsed.streams };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ──────────────────────────────────────────────
// Cleanup
// ──────────────────────────────────────────────
app.on('before-quit', async () => {
  if (folderWatcher) { folderWatcher.close(); folderWatcher = null; }
  if (scheduleService) {
    scheduleService.stopAll();
  }
  if (autoLiveService) {
    autoLiveService.stopAll();
  }
  if (streamManager) {
    console.log('Stopping all streams before quit...');
    await streamManager.stopAllStreams();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});




