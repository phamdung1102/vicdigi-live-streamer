// Stream Manager for renderer process
class StreamManagerUI {
    constructor() {
        this.streams = new Map();
        this.initializeEventHandlers();
    }

    initializeEventHandlers() {
        // Platform presets
        this.platformPresets = {
            facebook: {
                rtmp: 'rtmps://live-api-s.facebook.com:443/rtmp/',
                bitrate: 4000,
                quality: '1080p',
                fps: 30
            },
            youtube: {
                rtmp: 'rtmp://a.rtmp.youtube.com/live2',
                bitrate: 4500,
                quality: '1080p',
                fps: 30
            },
            tiktok: {
                rtmp: '',
                bitrate: 3000,
                quality: '720p',
                fps: 30
            }
        };
    }

    async createStream(config) {
        try {
            // Validate configuration
            if (!this.validateStreamConfig(config)) {
                throw new Error('Cấu hình stream không hợp lệ');
            }

            // Add video source to config
            if (!config.videoSource) {
                config.videoSource = await this.selectVideoSource();
                if (!config.videoSource) {
                    throw new Error('Chưa chọn nguồn video');
                }
            }

            // Start the stream
            const result = await window.api.stream.start(config);
            
            if (result.success) {
                this.streams.set(result.streamId, {
                    id: result.streamId,
                    ...config,
                    status: 'starting',
                    startTime: Date.now()
                });
                
                return result.streamId;
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Failed to create stream:', error);
            throw error;
        }
    }

    validateStreamConfig(config) {
        // Check required fields
        if (!config.name || !config.rtmpUrl || !config.streamKey) {
            return false;
        }

        // Validate bitrate
        if (config.bitrate < 1000 || config.bitrate > 10000) {
            return false;
        }

        // Validate FPS
        if (config.fps !== 30 && config.fps !== 60) {
            return false;
        }

        return true;
    }

    async selectVideoSource() {
        // Show video source selection dialog
        return new Promise((resolve) => {
            // TODO: Implement video source selection UI
            // For now, return a dummy path
            resolve(null);
        });
    }

    async stopStream(streamId) {
        try {
            const result = await window.api.stream.stop(streamId);
            if (result.success) {
                this.streams.delete(streamId);
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to stop stream:', error);
            return false;
        }
    }

    async stopAllStreams() {
        try {
            const result = await window.api.stream.stopAll();
            if (result.success) {
                this.streams.clear();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to stop all streams:', error);
            return false;
        }
    }

    getStreamInfo(streamId) {
        return this.streams.get(streamId);
    }

    getAllStreams() {
        return Array.from(this.streams.values());
    }

    updateStreamStatus(streamId, status) {
        if (this.streams.has(streamId)) {
            const stream = this.streams.get(streamId);
            stream.status = status;
            this.streams.set(streamId, stream);
        }
    }

    updateStreamStats(streamId, stats) {
        if (this.streams.has(streamId)) {
            const stream = this.streams.get(streamId);
            stream.stats = stats;
            stream.lastUpdate = Date.now();
            this.streams.set(streamId, stream);
        }
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

    formatStreamCommand(config) {
        const quality = this.getQualitySettings(config.quality);
        
        // Build FFmpeg command parameters
        return {
            input: config.videoSource,
            output: `${config.rtmpUrl}${config.streamKey}`,
            videoCodec: 'libx264',
            audioCodec: 'aac',
            videoBitrate: config.bitrate || quality.videoBitrate,
            audioBitrate: quality.audioBitrate,
            fps: config.fps,
            resolution: `${quality.width}x${quality.height}`,
            preset: 'veryfast',
            format: 'flv'
        };
    }

    calculateEstimatedBandwidth(streams) {
        let totalBandwidth = 0;
        streams.forEach(stream => {
            if (stream.stats && stream.stats.bitrate) {
                totalBandwidth += parseInt(stream.stats.bitrate);
            }
        });
        return totalBandwidth;
    }

    isStreamHealthy(streamId) {
        const stream = this.streams.get(streamId);
        if (!stream || !stream.stats) return false;

        const stats = stream.stats;
        
        // Check if FPS is stable
        if (stats.fps < stream.fps * 0.8) return false;
        
        // Check if bitrate is stable
        if (stats.bitrate < stream.bitrate * 0.7) return false;
        
        // Check dropped frames
        if (stats.droppedFrames > stats.totalFrames * 0.05) return false;
        
        return true;
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = StreamManagerUI;
}

// Initialize when loaded
const streamManagerUI = new StreamManagerUI();