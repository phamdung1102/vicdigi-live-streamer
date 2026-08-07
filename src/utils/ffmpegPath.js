const path = require('path');
const fs = require('fs');

// Try to get electron app, but don't fail if not available
let app;
try {
    const electron = require('electron');
    app = electron.app || electron.remote?.app;
} catch (e) {
    // Not in Electron environment
    app = null;
}

/**
 * Get the correct FFmpeg path based on environment
 * Fixes ENOENT error in production build
 */
function getFFmpegPath() {
    let ffmpegPath;
    
    // If not in Electron, use simple path resolution
    if (!app) {
        ffmpegPath = path.join(__dirname, '..', '..', 'ffmpeg', 'ffmpeg.exe');
        if (!fs.existsSync(ffmpegPath)) {
            ffmpegPath = 'ffmpeg'; // Use system PATH
        }
        console.log('Non-Electron FFmpeg path:', ffmpegPath);
        return ffmpegPath;
    }
    
    // Check if we're in development or production
    if (app.isPackaged) {
        // Production - app is packaged
        // FFmpeg should be in resources folder
        
        // Try multiple possible locations
        const possiblePaths = [
            // Most common location for extraResources
            path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe'),
            // Alternative locations
            path.join(process.resourcesPath, 'app.asar.unpacked', 'ffmpeg', 'ffmpeg.exe'),
            path.join(process.resourcesPath, 'app', 'ffmpeg', 'ffmpeg.exe'),
            // Relative to exe location
            path.join(path.dirname(app.getPath('exe')), 'ffmpeg', 'ffmpeg.exe'),
            path.join(path.dirname(app.getPath('exe')), 'resources', 'ffmpeg', 'ffmpeg.exe'),
        ];
        
        console.log('Production mode - checking paths:');
        // Find the first existing path
        for (const testPath of possiblePaths) {
            console.log('  Checking:', testPath, 'exists:', fs.existsSync(testPath));
            if (fs.existsSync(testPath)) {
                ffmpegPath = testPath;
                console.log('✅ Found FFmpeg at:', ffmpegPath);
                break;
            }
        }
        
        if (!ffmpegPath) {
            console.error('❌ FFmpeg not found in any expected location');
            console.log('Resource path:', process.resourcesPath);
            console.log('Exe path:', app.getPath('exe'));
            // Fallback to system PATH
            ffmpegPath = 'ffmpeg';
        }
    } else {
        // Development - use relative path from project root
        ffmpegPath = path.join(__dirname, '..', '..', 'ffmpeg', 'ffmpeg.exe');
        
        // Check if exists
        if (!fs.existsSync(ffmpegPath)) {
            console.warn('FFmpeg not found at:', ffmpegPath);
            // Try system PATH as fallback
            ffmpegPath = 'ffmpeg';
        } else {
            console.log('Development FFmpeg path:', ffmpegPath);
        }
    }
    
    console.log('Final FFmpeg path:', ffmpegPath);
    return ffmpegPath;
}

/**
 * Get FFprobe path
 */
function getFFprobePath() {
    let ffprobePath;
    
    // If not in Electron, use simple path resolution
    if (!app) {
        ffprobePath = path.join(__dirname, '..', '..', 'ffmpeg', 'ffprobe.exe');
        if (!fs.existsSync(ffprobePath)) {
            ffprobePath = 'ffprobe'; // Use system PATH
        }
        return ffprobePath;
    }
    
    if (app.isPackaged) {
        const possiblePaths = [
            // Most common location for extraResources
            path.join(process.resourcesPath, 'ffmpeg', 'ffprobe.exe'),
            // Alternative locations
            path.join(process.resourcesPath, 'app.asar.unpacked', 'ffmpeg', 'ffprobe.exe'),
            path.join(process.resourcesPath, 'app', 'ffmpeg', 'ffprobe.exe'),
            // Relative to exe location
            path.join(path.dirname(app.getPath('exe')), 'ffmpeg', 'ffprobe.exe'),
            path.join(path.dirname(app.getPath('exe')), 'resources', 'ffmpeg', 'ffprobe.exe'),
        ];
        
        for (const testPath of possiblePaths) {
            if (fs.existsSync(testPath)) {
                ffprobePath = testPath;
                break;
            }
        }
        
        if (!ffprobePath) {
            ffprobePath = 'ffprobe';
        }
    } else {
        ffprobePath = path.join(__dirname, '..', '..', 'ffmpeg', 'ffprobe.exe');
        
        if (!fs.existsSync(ffprobePath)) {
            ffprobePath = 'ffprobe';
        }
    }
    
    return ffprobePath;
}

module.exports = {
    getFFmpegPath,
    getFFprobePath
};