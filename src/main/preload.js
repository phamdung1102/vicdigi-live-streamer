const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Stream controls
  stream: {
    start: (config) => ipcRenderer.invoke('stream:start', config),
    stop: (streamId) => ipcRenderer.invoke('stream:stop', streamId),
    stopAll: () => ipcRenderer.invoke('stream:stopAll'),
    getStatus: (streamId) => ipcRenderer.invoke('stream:getStatus', streamId),
    getAllStatus: () => ipcRenderer.invoke('stream:getAllStatus'),
    getSavedConfigs: () => ipcRenderer.invoke('stream:getSavedConfigs'),

    onStarted: (callback) => {
      ipcRenderer.on('stream:started', (event, data) => callback(data));
    },
    onStopped: (callback) => {
      ipcRenderer.on('stream:stopped', (event, data) => callback(data));
    },
    onError: (callback) => {
      ipcRenderer.on('stream:error', (event, data) => callback(data));
    },
    onStats: (callback) => {
      ipcRenderer.on('stream:stats', (event, data) => callback(data));
    },
    onCountdown: (callback) => {
      ipcRenderer.on('stream:countdown', (event, data) => callback(data));
    },
    onHealthWarning: (callback) => {
      ipcRenderer.on('stream:health-warning', (event, data) => callback(data));
    },
    onRestarting: (callback) => {
      ipcRenderer.on('stream:restarting', (event, data) => callback(data));
    },
    // ✅ Preview thumbnail
    onThumbnail: (callback) => {
      ipcRenderer.on('stream:thumbnail', (event, data) => callback(data));
    },
    // ✅ Next video event
    onNextVideo: (callback) => {
      ipcRenderer.on('stream:next-video', (event, data) => callback(data));
    }
  },

  // Playlist management
  playlist: {
    selectFolder: () => ipcRenderer.invoke('playlist:select'),
    getVideos: (folderPath) => ipcRenderer.invoke('playlist:getVideos', folderPath),
    // Hot reload
    watchFolder: (folderPath) => ipcRenderer.invoke('playlist:watchFolder', folderPath),
    unwatchFolder: () => ipcRenderer.invoke('playlist:unwatchFolder'),
    onFolderChanged: (callback) => {
      ipcRenderer.on('playlist:folderChanged', (event, data) => callback(data));
    }
  },

  // Video file selection
  video: {
    selectFile: () => ipcRenderer.invoke('video:selectFile')
  },

  // Schedule management
  schedule: {
    create: (config) => ipcRenderer.invoke('schedule:create', config),
    update: (scheduleId, updates) => ipcRenderer.invoke('schedule:update', scheduleId, updates),
    toggle: (scheduleId) => ipcRenderer.invoke('schedule:toggle', scheduleId),
    delete: (scheduleId) => ipcRenderer.invoke('schedule:delete', scheduleId),
    getAll: () => ipcRenderer.invoke('schedule:getAll')
  },

  // Settings management
  settings: {
    get: (key) => ipcRenderer.invoke('settings:get', key),
    set: (key, value) => ipcRenderer.invoke('settings:set', key, value),
    getAll: () => ipcRenderer.invoke('settings:getAll')
  },

  // ✅ System metrics (REAL data)
  system: {
    getMetrics: () => ipcRenderer.invoke('system:getMetrics'),
    onMetrics: (callback) => {
      ipcRenderer.on('system:metrics', (event, data) => callback(data));
    }
  },

  // ✅ Stream history & logs
  history: {
    getAll: (limit) => ipcRenderer.invoke('history:getAll', limit),
    getByStream: (streamId, limit) => ipcRenderer.invoke('history:getByStream', streamId, limit),
    clear: () => ipcRenderer.invoke('history:clear'),
    exportJson: () => ipcRenderer.invoke('history:exportJson')
  },

  // ✅ Config export/import
  config: {
    exportStreams: () => ipcRenderer.invoke('config:exportStreams'),
    importStreams: () => ipcRenderer.invoke('config:importStreams')
  },

  autoLive: {
    getSettings: () => ipcRenderer.invoke('autoLive:getSettings'),
    saveSettings: (settings) => ipcRenderer.invoke('autoLive:saveSettings', settings),
    sync: () => ipcRenderer.invoke('autoLive:sync'),
    previewGoogle: (url) => ipcRenderer.invoke('autoLive:previewGoogle', url),
    openChromeLogin: () => ipcRenderer.invoke('autoLive:openChromeLogin'),
    scanFacebookPages: () => ipcRenderer.invoke('autoLive:scanFacebookPages'),
    selectFacebookPage: (page) => ipcRenderer.invoke('autoLive:selectFacebookPage', page),
    onStatus: (callback) => ipcRenderer.on('autoLive:status', (event, data) => callback(data)),
    onStarted: (callback) => ipcRenderer.on('autoLive:started', (event, data) => callback(data)),
    onError: (callback) => ipcRenderer.on('autoLive:error', (event, data) => callback(data)),
    onReloaded: (callback) => ipcRenderer.on('autoLive:reloaded', (event, data) => callback(data))
  },

  updater: {
    getSettings: () => ipcRenderer.invoke('updater:getSettings'),
    saveSettings: (settings) => ipcRenderer.invoke('updater:saveSettings', settings),
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    onStatus: (callback) => ipcRenderer.on('updater:status', (event, data) => callback(data))
  },

  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  }
});

window.addEventListener('beforeunload', () => {
  ipcRenderer.removeAllListeners();
});
