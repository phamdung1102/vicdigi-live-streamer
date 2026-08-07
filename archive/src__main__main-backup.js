const { app, BrowserWindow, ipcMain, Tray, Menu, dialog } = require('electron');

// Disable GPU acceleration if having issues
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-software-rasterizer');
const path = require('path');
const { StreamManager } = require('../services/streamManager');
const { DatabaseService } = require('../database/database');
const { ScheduleService } = require('../services/scheduleService');
const Store = require('electron-store');

// Initialize store for settings
const store = new Store();

// Global references
let mainWindow;
let tray;
let streamManager;
let database;
let scheduleService;

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Create main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    icon: path.join(__dirname, '../../assets/icon.png'),
    title: 'VICdigi Live Streamer',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    frame: true,
    backgroundColor: '#1a1a1a',
    show: false  // Don't show until ready
  });

  // Load main page
  mainWindow.loadFile(path.join(__dirname, '../renderer/pages/index.html'));

  // Window events
  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });
  
  // Force show after timeout if not shown
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show();
      mainWindow.focus();
    }
  }, 1000);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open DevTools for debugging
  mainWindow.webContents.openDevTools();
  
  // Log any errors
  mainWindow.webContents.on('crashed', () => {
    console.error('Window crashed!');
  });
  
  mainWindow.webContents.on('console-message', (event, level, message) => {
    console.log('Console:', message);
  });
}

// Create system tray
function createTray() {
  try {
    const iconPath = path.join(__dirname, '../../assets/icon.png');
    if (!require('fs').existsSync(iconPath)) {
      console.error('Tray icon not found:', iconPath);
      return;
    }
    tray = new Tray(iconPath);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Hiển thị',
      click: () => {
        mainWindow.show();
      }
    },
    {
      label: 'Ẩn',
      click: () => {
        mainWindow.hide();
      }
    },
    { type: 'separator' },
    {
      label: 'Thoát',
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('VICdigi Live Streamer');
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    mainWindow.show();
  });
  } catch (error) {
    console.error('Failed to create tray:', error);
  }
}

// Initialize services
async function initializeServices() {
  try {
    // Initialize database
    database = new DatabaseService();
    await database.initialize();

    // Initialize stream manager
    streamManager = new StreamManager(database);
    
    // Initialize schedule service
    scheduleService = new ScheduleService(streamManager, database);
    await scheduleService.loadSchedules();
    
    // Setup event listeners after services are initialized
    setupStreamEventListeners();

    console.log('✅ All services initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize services:', error);
    dialog.showErrorBox('Lỗi khởi tạo', 'Không thể khởi tạo các dịch vụ cần thiết');
    app.quit();
  }
}

// App events
app.whenReady().then(async () => {
  createWindow();
  createTray();
  await initializeServices();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers for renderer communication
// Stream controls
ipcMain.handle('stream:start', async (event, config) => {
  try {
    if (!streamManager) {
      throw new Error('Stream manager not initialized');
    }
    const streamId = await streamManager.startStream(config);
    return { success: true, streamId };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stream:stop', async (event, streamId) => {
  try {
    if (!streamManager) {
      throw new Error('Stream manager not initialized');
    }
    await streamManager.stopStream(streamId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stream:stopAll', async () => {
  try {
    if (!streamManager) {
      throw new Error('Stream manager not initialized');
    }
    await streamManager.stopAllStreams();
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stream:getStatus', async (event, streamId) => {
  try {
    if (!streamManager) {
      throw new Error('Stream manager not initialized');
    }
    const status = streamManager.getStreamStatus(streamId);
    return { success: true, status };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stream:getAllStatus', async () => {
  try {
    if (!streamManager) {
      throw new Error('Stream manager not initialized');
    }
    const statuses = streamManager.getAllStreamStatus();
    return { success: true, statuses };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Playlist management
ipcMain.handle('playlist:select', async () => {
  try {
    // Get the focused window or create one if needed
    const window = BrowserWindow.getFocusedWindow() || mainWindow;
    
    if (!window) {
      console.error('No window available for dialog');
      return { success: false, error: 'No window available' };
    }
    
    const result = await dialog.showOpenDialog(window, {
      properties: ['openDirectory'],
      title: 'Chọn thư mục chứa video'
    });

    if (!result.canceled) {
      return { success: true, path: result.filePaths[0] };
    }
    return { success: false };
  } catch (error) {
    console.error('Error showing folder dialog:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('video:selectFile', async () => {
  try {
    // Get the focused window or create one if needed
    const window = BrowserWindow.getFocusedWindow() || mainWindow;
    
    if (!window) {
      console.error('No window available for dialog');
      return { success: false, error: 'No window available' };
    }
    
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      title: 'Chọn file video',
      filters: [
        { name: 'Video Files', extensions: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (!result.canceled) {
      return { success: true, path: result.filePaths[0] };
    }
    return { success: false };
  } catch (error) {
    console.error('Error showing file dialog:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('playlist:getVideos', async (event, folderPath) => {
  try {
    if (!streamManager) {
      throw new Error('Stream manager not initialized');
    }
    const videos = await streamManager.scanVideoFolder(folderPath);
    return { success: true, videos };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Schedule management
ipcMain.handle('schedule:create', async (event, scheduleConfig) => {
  try {
    if (!scheduleService) {
      throw new Error('Schedule service not initialized');
    }
    const scheduleId = await scheduleService.createSchedule(scheduleConfig);
    return { success: true, scheduleId };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('schedule:delete', async (event, scheduleId) => {
  try {
    if (!scheduleService) {
      throw new Error('Schedule service not initialized');
    }
    await scheduleService.deleteSchedule(scheduleId);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('schedule:getAll', async () => {
  try {
    if (!database) {
      throw new Error('Database not initialized');
    }
    const schedules = await database.getAllSchedules();
    return { success: true, schedules };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Settings management
ipcMain.handle('settings:get', async (event, key) => {
  return store.get(key);
});

ipcMain.handle('settings:set', async (event, key, value) => {
  store.set(key, value);
  return true;
});

ipcMain.handle('settings:getAll', async () => {
  return store.store;
});

// Function to setup stream event listeners
function setupStreamEventListeners() {
  if (!streamManager) return;
  
  streamManager.on('stream:started', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('stream:started', data);
    }
  });

  streamManager.on('stream:stopped', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('stream:stopped', data);
    }
  });

  streamManager.on('stream:error', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('stream:error', data);
    }
  });

  streamManager.on('stream:stats', (data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('stream:stats', data);
    }
  });
}

// Cleanup on exit
app.on('before-quit', async () => {
  console.log('🔄 Cleaning up before exit...');
  
  if (streamManager) {
    await streamManager.stopAllStreams();
  }
  
  if (database) {
    await database.close();
  }
  
  if (scheduleService) {
    scheduleService.stopAll();
  }
});
