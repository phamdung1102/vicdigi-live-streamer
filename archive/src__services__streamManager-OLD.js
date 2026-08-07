// OPTIMIZED streamManager.js with improved performance and timer fixes
const { EventEmitter } = require('events');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs').promises;
const { getFFmpegPath, getFFprobePath } = require('../utils/ffmpegPath');

class StreamManager extends EventEmitter {
    constructor(database) {
        super();
        this.database = database;
        this.activeStreams = new Map();
        this.ffmpegPath = null;
        this.reconnectAttempts = new Map();
        this.streamHealthChecks = new Map();
        this.initializeFfmpeg();
    }

    async initializeFfmpeg() {
        const ffmpegPath = getFFmpegPath();
        const ffprobePath = getFFprobePath();
        
        if (ffmpegPath !== 'ffmpeg') {
            ffmpeg.setFfmpegPath(ffmpegPath);
            ffmpeg.setFfprobePath(ffprobePath);
            this.ffmpegPath = ffmpegPath;
            console.log('✅ FFmpeg configured at:', ffmpegPath);
        } else {
            console.log('⚠️ Using system FFmpeg from PATH');
            this.ffmpegPath = 'ffmpeg';
        }
    }

    async startStream(config) {
        const streamId = this.generateStreamId();
        
        try {
            // Validate configuration
            if (!config.rtmpUrl || !config.streamKey) {
                throw new Error('Missing RTMP URL or Stream Key');
            }

            // Get video source
            let inputSource = config.videoSource;
            if (!inputSource && config.playlist) {
                inputSource = await this.getPlaylistInput(config.playlist);
            }
            
            if (!inputSource) {
                throw new Error('No video source specified');
            }

            // Create optimized FFmpeg command
            const command = this.createOptimizedFFmpegCommand(inputSource, config);
            
            // Store stream info with enhanced timer data
            const streamInfo = {
                id: streamId,
                config,
                command,
                status: 'starting',
                stats: {
                    fps: 0,
                    bitrate: 0,
                    totalFrames: 0,
                    droppedFrames: 0,
                    uptime: 0,
                    health: 100
                },
                startTime: Date.now(),
                restartAttempts: 0,
                lastHealthCheck: Date.now(),
                timerInfo: null
            };

            // Setup auto-stop timer with proper countdown
            if (config.stopAfterMinutes) {
                const stopTimeMs = config.stopAfterMinutes * 60 * 1000;
                const stopTime = Date.now() + stopTimeMs;
                
                streamInfo.timerInfo = {
                    type: 'duration',
                    stopTime: stopTime,
                    duration: config.stopAfterMinutes,
                    originalMinutes: config.stopAfterMinutes
                };

                streamInfo.stopTimer = setTimeout(() => {
                    console.log(`⏰ Auto-stopping stream ${streamId} after ${config.stopAfterMinutes} minutes`);
                    this.stopStream(streamId);
                }, stopTimeMs);
                
                // Setup countdown update interval
                streamInfo.countdownInterval = setInterval(() => {
                    this.updateTimerCountdown(streamId);
                }, 1000);
                
                console.log(`✅ Timer set: Stream will stop after ${config.stopAfterMinutes} minutes`);
                
            } else if (config.stopAtTime) {
                const [hours, minutes] = config.stopAtTime.split(':').map(Number);
                const now = new Date();
                const stopDate = new Date();
                stopDate.setHours(hours, minutes, 0, 0);
                
                if (stopDate <= now) {
                    stopDate.setDate(stopDate.getDate() + 1);
                }
                
                streamInfo.timerInfo = {
                    type: 'specific',
                    stopTime: stopDate.getTime(),
                    targetTime: config.stopAtTime
                };
                
                const delay = stopDate - now;
                streamInfo.stopTimer = setTimeout(() => {
                    console.log(`⏰ Auto-stopping stream ${streamId} at scheduled time ${config.stopAtTime}`);
                    this.stopStream(streamId);
                }, delay);
                
                // Setup countdown update interval for specific time
                streamInfo.countdownInterval = setInterval(() => {
                    this.updateTimerCountdown(streamId);
                }, 1000);
                
                console.log(`✅ Timer set: Stream will stop at ${config.stopAtTime}`);
            }
            
            this.activeStreams.set(streamId, streamInfo);

            // Enhanced event handlers
            command.on('start', (commandLine) => {
                console.log(`Stream ${streamId} started successfully`);
                streamInfo.status = 'running';
                streamInfo.restartAttempts = 0;
                this.emit('stream:started', { 
                    streamId, 
                    config,
                    timerInfo: streamInfo.timerInfo
                });
                
                // Start health monitoring
                this.startHealthMonitoring(streamId);
            });

            command.on('progress', (progress) => {
                this.updateStreamStats(streamId, progress);
            });

            command.on('error', (error) => {
                console.error(`Stream ${streamId} error:`, error.message);
                streamInfo.status = 'error';
                
                // Check if should auto-restart
                if (this.shouldAutoRestart(streamInfo, error)) {
                    this.scheduleRestart(streamId);
                } else {
                    this.emit('stream:error', { streamId, error: error.message });
                    this.stopStream(streamId);
                }
            });

            command.on('end', () => {
                console.log(`Stream ${streamId} ended`);
                
                if (config.playlist && config.playlist.mode !== 'single') {
                    this.playNextVideo(streamId);
                } else if (streamInfo.status !== 'stopping') {
                    // Unexpected end - try to restart
                    if (this.shouldAutoRestart(streamInfo)) {
                        this.scheduleRestart(streamId);
                    } else {
                        this.stopStream(streamId);
                    }
                }
            });

            // Run the command
            command.run();

            // Save to database
            await this.database.saveStream(streamId, config);

            return streamId;

        } catch (error) {
            console.error('Failed to start stream:', error);
            this.activeStreams.delete(streamId);
            throw error;
        }
    }

    createOptimizedFFmpegCommand(input, config) {
        // Build optimized RTMP URL
        let outputUrl = this.buildRTMPUrl(config);
        
        console.log('\n========== Optimized Stream Configuration ==========');
        console.log('Platform:', config.platform);
        console.log('Input:', input);
        console.log('Output URL:', outputUrl);
        console.log('Quality:', config.quality || '720p');
        console.log('Bitrate:', config.bitrate || this.getQualitySettings(config.quality || '720p').videoBitrate);
        console.log('====================================================\n');
        
        const quality = this.getQualitySettings(config.quality || '720p');
        const fps = config.fps || 30;
        
        // Use input directly - fluent-ffmpeg handles paths with spaces
        const command = ffmpeg(input)
            .inputOptions([
                '-re',                          // Read input at native frame rate
                '-stream_loop', config.loop ? '-1' : '0'
            ])
            .outputOptions([
                // Video encoding
                '-c:v', 'libx264',
                '-preset', 'veryfast',
                '-b:v', `${config.bitrate || quality.videoBitrate}k`,
                '-maxrate', `${config.bitrate || quality.videoBitrate}k`,
                '-bufsize', `${(config.bitrate || quality.videoBitrate) * 2}k`,
                '-g', `${fps * 2}`,             // Keyframe interval (2 seconds)
                '-keyint_min', `${fps}`,
                '-sc_threshold', '0',
                '-pix_fmt', 'yuv420p',
                
                // Audio encoding
                '-c:a', 'aac',
                '-b:a', `${quality.audioBitrate}k`,
                '-ar', '44100',
                '-ac', '2',
                
                // Output format
                '-f', 'flv'
            ])
            .size(`${quality.width}x${quality.height}`)
            .fps(fps);

        // Platform-specific optimizations
        if (config.platform === 'facebook') {
            command.outputOptions([
                '-strict', 'experimental'
            ]);
        } else if (config.platform === 'youtube') {
            command.outputOptions([
                '-profile:v', 'main',
                '-level', '4.1'
            ]);
        } else if (config.platform === 'tiktok') {
            command.outputOptions([
                '-profile:v', 'baseline',       // TikTok compatibility
                '-level', '3.1'
            ]);
        }

        // Add verbose error logging with filtering
        command.on('stderr', (stderrLine) => {
            if (stderrLine.includes('error') || stderrLine.includes('Error')) {
                console.error('FFmpeg Error:', stderrLine);
            } else if (stderrLine.includes('Warning')) {
                console.warn('FFmpeg Warning:', stderrLine);
            }
        });

        command.output(outputUrl);
        
        return command;
    }

    buildRTMPUrl(config) {
        let rtmpUrl = config.rtmpUrl.trim();
        let streamKey = config.streamKey.trim();
        
        // Remove trailing slash if exists
        rtmpUrl = rtmpUrl.replace(/\/$/, '');
        
        // For Facebook, ensure rtmps:// protocol
        if (config.platform === 'facebook') {
            // Facebook uses rtmps://live-api-s.facebook.com:443/rtmp/
            if (!rtmpUrl.startsWith('rtmps://')) {
                rtmpUrl = rtmpUrl.replace('rtmp://', 'rtmps://');
            }
            // Remove /rtmp if it's already in the URL (user might have included it)
            rtmpUrl = rtmpUrl.replace(/\/rtmp\/?$/, '');
            return `${rtmpUrl}/rtmp/${streamKey}`;
        } else if (config.platform === 'youtube') {
            // YouTube format: rtmp://a.rtmp.youtube.com/live2/stream-key
            if (!rtmpUrl.includes('/live2')) {
                return `${rtmpUrl}/live2/${streamKey}`;
            }
            return `${rtmpUrl}/${streamKey}`;
        } else if (config.platform === 'tiktok') {
            // TikTok format varies, just append key
            return `${rtmpUrl}/${streamKey}`;
        } else {
            // Generic format
            return `${rtmpUrl}/${streamKey}`;
        }
    }

    updateTimerCountdown(streamId) {
        const streamInfo = this.activeStreams.get(streamId);
        if (!streamInfo || !streamInfo.timerInfo) return;

        const now = Date.now();
        const { stopTime, type } = streamInfo.timerInfo;
        const remainingMs = stopTime - now;

        if (remainingMs <= 0) {
            // Timer expired
            clearInterval(streamInfo.countdownInterval);
            this.emit('stream:timer-expired', { streamId });
            return;
        }

        // Calculate remaining time
        const remainingSeconds = Math.floor(remainingMs / 1000);
        const hours = Math.floor(remainingSeconds / 3600);
        const minutes = Math.floor((remainingSeconds % 3600) / 60);
        const seconds = remainingSeconds % 60;

        // Emit countdown update
        this.emit('stream:countdown', {
            streamId,
            remaining: {
                hours,
                minutes,
                seconds,
                totalSeconds: remainingSeconds,
                formatted: this.formatCountdown(hours, minutes, seconds)
            },
            timerType: type
        });
    }

    formatCountdown(hours, minutes, seconds) {
        if (hours > 0) {
            return `${hours}h ${minutes}m ${seconds}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        } else {
            return `${seconds}s`;
        }
    }

    shouldAutoRestart(streamInfo, error = null) {
        // Don't restart if manually stopping
        if (streamInfo.status === 'stopping') return false;
        
        // Don't restart if max attempts reached
        if (streamInfo.restartAttempts >= 5) return false;
        
        // Check if auto-restart is enabled
        if (!streamInfo.config.autoRestart) return false;
        
        // Restart on recoverable errors
        if (error) {
            const recoverableErrors = [
                'EPIPE',
                'ECONNRESET',
                'ETIMEDOUT',
                'Connection reset',
                'Broken pipe'
            ];
            
            const errorString = error.toString();
            return recoverableErrors.some(e => errorString.includes(e));
        }
        
        return true;
    }

    async scheduleRestart(streamId) {
        const streamInfo = this.activeStreams.get(streamId);
        if (!streamInfo) return;

        streamInfo.restartAttempts++;
        const delay = Math.min(streamInfo.restartAttempts * 2000, 10000); // Max 10s delay

        console.log(`🔄 Scheduling restart for stream ${streamId} (attempt ${streamInfo.restartAttempts}) in ${delay}ms`);
        
        streamInfo.status = 'restarting';
        this.emit('stream:restarting', { 
            streamId, 
            attempt: streamInfo.restartAttempts,
            delay 
        });

        setTimeout(async () => {
            if (this.activeStreams.has(streamId)) {
                try {
                    // Kill old command if exists
                    if (streamInfo.command) {
                        streamInfo.command.kill();
                    }

                    // Create new command
                    const newCommand = this.createOptimizedFFmpegCommand(
                        streamInfo.config.videoSource || await this.getPlaylistInput(streamInfo.config.playlist),
                        streamInfo.config
                    );
                    
                    streamInfo.command = newCommand;
                    streamInfo.status = 'running';
                    
                    // Re-attach event handlers
                    this.attachCommandHandlers(newCommand, streamId);
                    
                    // Run new command
                    newCommand.run();
                    
                    console.log(`✅ Stream ${streamId} restarted successfully`);
                    this.emit('stream:restarted', { streamId });
                    
                } catch (error) {
                    console.error(`Failed to restart stream ${streamId}:`, error);
                    this.emit('stream:error', { streamId, error: 'Failed to restart' });
                    this.stopStream(streamId);
                }
            }
        }, delay);
    }

    attachCommandHandlers(command, streamId) {
        command.on('progress', (progress) => {
            this.updateStreamStats(streamId, progress);
        });

        command.on('error', (error) => {
            const streamInfo = this.activeStreams.get(streamId);
            if (streamInfo && this.shouldAutoRestart(streamInfo, error)) {
                this.scheduleRestart(streamId);
            } else {
                this.emit('stream:error', { streamId, error: error.message });
                this.stopStream(streamId);
            }
        });

        command.on('end', () => {
            const streamInfo = this.activeStreams.get(streamId);
            if (streamInfo && streamInfo.config.playlist && streamInfo.config.playlist.mode !== 'single') {
                this.playNextVideo(streamId);
            } else if (streamInfo && streamInfo.status !== 'stopping') {
                if (this.shouldAutoRestart(streamInfo)) {
                    this.scheduleRestart(streamId);
                } else {
                    this.stopStream(streamId);
                }
            }
        });
    }

    startHealthMonitoring(streamId) {
        const checkInterval = setInterval(() => {
            const streamInfo = this.activeStreams.get(streamId);
            if (!streamInfo) {
                clearInterval(checkInterval);
                return;
            }

            const health = this.calculateStreamHealth(streamInfo);
            streamInfo.stats.health = health;

            if (health < 50 && streamInfo.status === 'running') {
                console.warn(`⚠️ Stream ${streamId} health is low: ${health}%`);
                this.emit('stream:health-warning', { streamId, health });
                
                // Consider restart if health is critically low
                if (health < 20 && streamInfo.config.autoRestart) {
                    console.log(`🔄 Restarting unhealthy stream ${streamId}`);
                    this.scheduleRestart(streamId);
                }
            }

            streamInfo.lastHealthCheck = Date.now();
        }, 5000); // Check every 5 seconds

        this.streamHealthChecks.set(streamId, checkInterval);
    }

    calculateStreamHealth(streamInfo) {
        const { stats, config } = streamInfo;
        let health = 100;

        // Check FPS (weight: 40%)
        const targetFps = config.fps || 30;
        const fpsRatio = stats.fps / targetFps;
        if (fpsRatio < 0.8) health -= 40 * (1 - fpsRatio);

        // Check bitrate (weight: 30%)
        const targetBitrate = config.bitrate || 3000;
        const bitrateRatio = stats.bitrate / targetBitrate;
        if (bitrateRatio < 0.7) health -= 30 * (1 - bitrateRatio);

        // Check dropped frames (weight: 30%)
        if (stats.totalFrames > 0) {
            const droppedRatio = stats.droppedFrames / stats.totalFrames;
            if (droppedRatio > 0.01) health -= Math.min(30, droppedRatio * 300);
        }

        return Math.max(0, Math.round(health));
    }

    updateStreamStats(streamId, progress) {
        const streamInfo = this.activeStreams.get(streamId);
        if (!streamInfo) return;

        const uptime = Math.floor((Date.now() - streamInfo.startTime) / 1000);
        
        streamInfo.stats = {
            ...streamInfo.stats,
            fps: progress.currentFps || streamInfo.stats.fps,
            bitrate: progress.currentKbps || streamInfo.stats.bitrate,
            totalFrames: progress.frames || streamInfo.stats.totalFrames,
            droppedFrames: progress.drop || streamInfo.stats.droppedFrames,
            uptime,
            percent: progress.percent || 0,
            time: progress.timemark || '00:00:00'
        };

        this.emit('stream:stats', { 
            streamId, 
            stats: streamInfo.stats,
            timerInfo: streamInfo.timerInfo
        });
    }

    async stopStream(streamId) {
        const streamInfo = this.activeStreams.get(streamId);
        if (!streamInfo) return;

        try {
            streamInfo.status = 'stopping';

            // Clear all timers and intervals
            if (streamInfo.stopTimer) {
                clearTimeout(streamInfo.stopTimer);
                console.log(`⏱️ Timer cleared for stream ${streamId}`);
            }

            if (streamInfo.countdownInterval) {
                clearInterval(streamInfo.countdownInterval);
            }

            // Clear health check
            const healthCheck = this.streamHealthChecks.get(streamId);
            if (healthCheck) {
                clearInterval(healthCheck);
                this.streamHealthChecks.delete(streamId);
            }

            // Kill FFmpeg process gracefully
            if (streamInfo.command) {
                streamInfo.command.kill('SIGTERM');
                // Force kill after 5 seconds if still running
                setTimeout(() => {
                    if (streamInfo.command) {
                        streamInfo.command.kill('SIGKILL');
                    }
                }, 5000);
            }

            // Remove from active streams
            this.activeStreams.delete(streamId);
            this.reconnectAttempts.delete(streamId);

            // Update database
            await this.database.updateStreamStatus(streamId, 'stopped');

            this.emit('stream:stopped', { streamId });
            console.log(`✅ Stream ${streamId} stopped successfully`);

        } catch (error) {
            console.error(`Error stopping stream ${streamId}:`, error);
        }
    }

    async stopAllStreams() {
        const promises = [];
        
        for (const streamId of this.activeStreams.keys()) {
            promises.push(this.stopStream(streamId));
        }

        await Promise.all(promises);
        console.log('✅ All streams stopped');
    }

    async restartStream(streamId) {
        const streamInfo = this.activeStreams.get(streamId);
        if (!streamInfo) return;

        console.log(`Attempting to restart stream ${streamId}`);
        
        // Stop current stream
        if (streamInfo.command) {
            streamInfo.command.kill();
        }

        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Start again with same config
        try {
            await this.startStream(streamInfo.config);
            console.log(`Stream ${streamId} restarted successfully`);
        } catch (error) {
            console.error(`Failed to restart stream ${streamId}:`, error);
            this.emit('stream:error', { streamId, error: 'Failed to restart' });
        }
    }

    getStreamStatus(streamId) {
        const streamInfo = this.activeStreams.get(streamId);
        if (!streamInfo) return null;

        return {
            id: streamId,
            status: streamInfo.status,
            stats: streamInfo.stats,
            config: streamInfo.config,
            uptime: Math.floor((Date.now() - streamInfo.startTime) / 1000),
            timerInfo: streamInfo.timerInfo,
            restartAttempts: streamInfo.restartAttempts
        };
    }

    getAllStreamStatus() {
        const statuses = [];
        
        for (const [streamId, streamInfo] of this.activeStreams) {
            statuses.push({
                id: streamId,
                name: streamInfo.config.name,
                platform: streamInfo.config.platform,
                status: streamInfo.status,
                stats: streamInfo.stats,
                uptime: Math.floor((Date.now() - streamInfo.startTime) / 1000),
                timerInfo: streamInfo.timerInfo,
                health: streamInfo.stats.health || 100
            });
        }

        return statuses;
    }

    async getPlaylistInput(playlist) {
        if (!playlist.videos || playlist.videos.length === 0) {
            return null;
        }

        let videoPath;
        
        switch (playlist.mode) {
            case 'random':
                const randomIndex = Math.floor(Math.random() * playlist.videos.length);
                videoPath = playlist.videos[randomIndex];
                break;
                
            case 'sequential':
            default:
                const currentIndex = playlist.currentIndex || 0;
                videoPath = playlist.videos[currentIndex];
                playlist.currentIndex = (currentIndex + 1) % playlist.videos.length;
                break;
        }

        // Verify file exists
        try {
            await fs.access(videoPath);
            return videoPath;
        } catch (error) {
            console.error(`Video file not accessible: ${videoPath}`);
            
            // Try next video if skip errors is enabled
            if (playlist.skipErrors && playlist.videos.length > 1) {
                playlist.videos = playlist.videos.filter(v => v !== videoPath);
                return this.getPlaylistInput(playlist);
            }
            
            return null;
        }
    }

    async playNextVideo(streamId) {
        const streamInfo = this.activeStreams.get(streamId);
        if (!streamInfo || !streamInfo.config.playlist) return;

        const nextVideo = await this.getPlaylistInput(streamInfo.config.playlist);
        if (!nextVideo) {
            console.log(`No more videos in playlist for stream ${streamId}`);
            this.stopStream(streamId);
            return;
        }

        // Stop current command
        if (streamInfo.command) {
            streamInfo.command.kill();
        }

        // Create new optimized command
        const newCommand = this.createOptimizedFFmpegCommand(nextVideo, streamInfo.config);
        streamInfo.command = newCommand;
        
        // Re-attach event handlers
        this.attachCommandHandlers(newCommand, streamId);

        newCommand.run();
        
        console.log(`📹 Playing next video in playlist for stream ${streamId}`);
        this.emit('stream:next-video', { streamId, video: nextVideo });
    }

    getQualitySettings(quality) {
        const settings = {
            '360p': {
                width: 640,
                height: 360,
                videoBitrate: 1000,
                audioBitrate: 96
            },
            '480p': {
                width: 854,
                height: 480,
                videoBitrate: 2000,
                audioBitrate: 128
            },
            '720p': {
                width: 1280,
                height: 720,
                videoBitrate: 3000,
                audioBitrate: 128
            },
            '1080p': {
                width: 1920,
                height: 1080,
                videoBitrate: 4500,
                audioBitrate: 192
            }
        };

        return settings[quality] || settings['720p'];
    }

    async scanVideoFolder(folderPath) {
        const videoExtensions = ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm'];
        const videos = [];

        try {
            const files = await fs.readdir(folderPath);
            
            for (const file of files) {
                const filePath = path.join(folderPath, file);
                const stat = await fs.stat(filePath);
                
                if (stat.isFile()) {
                    const ext = path.extname(file).toLowerCase();
                    
                    if (videoExtensions.includes(ext)) {
                        videos.push({
                            name: file,
                            path: filePath,
                            size: stat.size,
                            extension: ext,
                            modified: stat.mtime
                        });
                    }
                }
            }

            // Get duration for each video using ffprobe
            if (this.ffmpegPath) {
                for (const video of videos) {
                    try {
                        await new Promise((resolve) => {
                            ffmpeg.ffprobe(video.path, (err, metadata) => {
                                if (err) {
                                    video.duration = 'N/A';
                                } else {
                                    video.duration = this.formatDuration(metadata.format.duration);
                                }
                                resolve();
                            });
                        });
                    } catch (error) {
                        video.duration = 'N/A';
                    }
                }
            }

            return videos;

        } catch (error) {
            console.error('Error scanning video folder:', error);
            throw error;
        }
    }

    formatDuration(seconds) {
        if (!seconds || isNaN(seconds)) return 'N/A';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        
        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }

    generateStreamId() {
        return `stream_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    isStreamHealthy(streamId) {
        const streamInfo = this.activeStreams.get(streamId);
        return streamInfo && streamInfo.stats.health >= 70;
    }

    getSystemStats() {
        let totalBitrate = 0;
        let healthyStreams = 0;
        
        for (const [streamId, streamInfo] of this.activeStreams) {
            totalBitrate += streamInfo.stats?.bitrate || 0;
            if (streamInfo.stats?.health >= 70) {
                healthyStreams++;
            }
        }
        
        return {
            activeStreams: this.activeStreams.size,
            totalBitrate,
            healthy: healthyStreams,
            avgHealth: this.activeStreams.size > 0 
                ? Math.round(Array.from(this.activeStreams.values())
                    .reduce((sum, s) => sum + (s.stats?.health || 0), 0) / this.activeStreams.size)
                : 100
        };
    }
}

module.exports = { StreamManager };