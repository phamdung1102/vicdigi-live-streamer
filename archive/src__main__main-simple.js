const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');

// Disable GPU
app.disableHardwareAcceleration();

let mainWindow;
let streamManager; // Store global reference

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    show: true,
    autoHideMenuBar: true, // Ẩn menu bar
    icon: path.join(__dirname, '../../assets/icon.png') // Icon cho window
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/pages/index.html'));
  
  // Chỉ mở DevTools khi dev mode
  // mainWindow.webContents.openDevTools();
  
  // Ẩn menu bar hoàn toàn
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  createWindow();
  
  // Initialize services
  initializeServices();
});

async function initializeServices() {
  try {
    const { DatabaseService } = require('../database/database');
    const { StreamManager } = require('../services/streamManager');
    
    const db = new DatabaseService();
    await db.initialize();
    
    streamManager = new StreamManager(db);
    
    // Setup event listeners
    streamManager.on('stream:started', (data) => {
      console.log('Stream started event:', data);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('stream:started', data);
      }
    });
    
    streamManager.on('stream:stats', (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('stream:stats', data);
      }
    });
    
    streamManager.on('stream:stopped', (data) => {
      console.log('Stream stopped event:', data);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('stream:stopped', data);
      }
    });
    
    streamManager.on('stream:error', (data) => {
      console.error('Stream error event:', data);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('stream:error', data);
      }
    });
    
    console.log('Services initialized');
  } catch (error) {
    console.error('Service initialization error:', error);
  }
}

// IPC Handlers
ipcMain.handle('playlist:select', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Chọn thư mục video'
    });
    
    if (!result.canceled) {
      return { success: true, path: result.filePaths[0] };
    }
    return { success: false };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('video:selectFile', async () => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      title: 'Chọn file video',
      filters: [
        { name: 'Video Files', extensions: ['mp4', 'mkv', 'avi', 'mov'] }
      ]
    });
    
    if (!result.canceled) {
      return { success: true, path: result.filePaths[0] };
    }
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
    
    // Fallback if streamManager not ready
    const fs = require('fs').promises;
    const files = await fs.readdir(folderPath);
    const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv'];
    
    const videos = [];
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (videoExtensions.includes(ext)) {
        const filePath = path.join(folderPath, file);
        const stat = await fs.stat(filePath);
        videos.push({
          name: file,
          path: filePath,
          size: stat.size,
          extension: ext
        });
      }
    }
    
    return { success: true, videos };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Stream handlers
ipcMain.handle('stream:start', async (event, config) => {
  try {
    console.log('Starting stream with config:', config);
    
    // Basic validation
    if (!config.rtmpUrl || !config.streamKey) {
      return { success: false, error: 'Thiếu RTMP URL hoặc Stream Key' };
    }
    
    if (!streamManager) {
      // Try to initialize if not ready
      await initializeServices();
      
      if (!streamManager) {
        return { success: false, error: 'Stream manager not initialized' };
      }
    }
    
    const streamId = await streamManager.startStream(config);
    
    // Force send initial status
    setTimeout(() => {
      const status = streamManager.getStreamStatus(streamId);
      if (status && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('stream:started', { 
          streamId, 
          config: status.config,
          status: status.status 
        });
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
    if (streamManager) {
      await streamManager.stopAllStreams();
      return { success: true };
    }
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
      console.log('Getting all statuses:', statuses);
      return { success: true, statuses };
    }
    return { success: true, statuses: [] };
  } catch (error) {
    console.error('Error getting statuses:', error);
    return { success: false, error: error.message };
  }
});

// Schedule handlers
ipcMain.handle('schedule:getAll', () => ({ success: true, schedules: [] }));
ipcMain.handle('schedule:create', () => ({ success: false, error: 'Not implemented' }));
ipcMain.handle('schedule:delete', () => ({ success: false, error: 'Not implemented' }));

// Settings handlers
ipcMain.handle('settings:get', () => null);
ipcMain.handle('settings:set', () => true);
ipcMain.handle('settings:getAll', () => ({}));

// Cleanup on exit
app.on('before-quit', async () => {
  if (streamManager) {
    console.log('Stopping all streams before quit...');
    await streamManager.stopAllStreams();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
