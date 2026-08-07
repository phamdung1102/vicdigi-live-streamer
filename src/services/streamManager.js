// streamManager.js — concat demuxer approach (1 FFmpeg process, không disconnect RTMP)
const { EventEmitter } = require('events');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const os = require('os');
const { spawn } = require('child_process');
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

        if (!config.rtmpUrl || !config.streamKey) {
            throw new Error('Missing RTMP URL or Stream Key');
        }
        if (!config.videoSource && (!config.playlist || !config.playlist.videos || config.playlist.videos.length === 0)) {
            throw new Error('No video source specified');
        }

        // Build stream info object
        const streamInfo = {
            id: streamId,
            config,
            command: null,
            status: 'starting',
            stats: { fps: 0, bitrate: 0, totalFrames: 0, droppedFrames: 0, uptime: 0, health: 100 },
            startTime: Date.now(),
            restartAttempts: 0,
            lastHealthCheck: Date.now(),
            timerInfo: null,
            stopFlag: false   // ✅ flag để while-loop tự dừng
        };

        // Setup auto-stop timer
        if (config.stopAfterMinutes) {
            const stopTimeMs = config.stopAfterMinutes * 60 * 1000;
            const stopTime = Date.now() + stopTimeMs;
            streamInfo.timerInfo = { type: 'duration', stopTime, duration: config.stopAfterMinutes };
            streamInfo.stopTimer = setTimeout(() => this.stopStream(streamId), stopTimeMs);
            streamInfo.countdownInterval = setInterval(() => this.updateTimerCountdown(streamId), 1000);
            console.log(`⏱️ Timer: stop after ${config.stopAfterMinutes} min`);
        } else if (config.stopAtTime) {
            const [h, m] = config.stopAtTime.split(':').map(Number);
            const stopDate = new Date();
            stopDate.setHours(h, m, 0, 0);
            if (stopDate <= new Date()) stopDate.setDate(stopDate.getDate() + 1);
            streamInfo.timerInfo = { type: 'specific', stopTime: stopDate.getTime(), targetTime: config.stopAtTime };
            streamInfo.stopTimer = setTimeout(() => this.stopStream(streamId), stopDate - new Date());
            streamInfo.countdownInterval = setInterval(() => this.updateTimerCountdown(streamId), 1000);
            console.log(`⏰ Timer: stop at ${config.stopAtTime}`);
        }

        this.activeStreams.set(streamId, streamInfo);
        await this.database.saveStream(streamId, config);

        // Emit started immediately so UI shows the stream
        this.emit('stream:started', { streamId, config, timerInfo: streamInfo.timerInfo });
        this.startHealthMonitoring(streamId);

        // ✅ Chạy stream với concat demuxer — 1 FFmpeg process duy nhất
        this._runConcatStream(streamId);

        return streamId;
    }

    // ✅ Tạo file list.txt cho concat demuxer
    async _buildConcatList(streamId) {
        const streamInfo = this.activeStreams.get(streamId);
        const config = streamInfo.config;
        const playlist = config.playlist;
        const isPlaylist = playlist && playlist.videos && playlist.videos.length > 0;

        let videos = [];

        if (isPlaylist) {
            const mode = playlist.mode || 'sequential';
            const allVideos = [...playlist.videos]; // copy tránh mutate

            if (mode === 'random') {
                // Shuffle
                for (let i = allVideos.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [allVideos[i], allVideos[j]] = [allVideos[j], allVideos[i]];
                }
                videos = allVideos;
            } else if (mode === 'loop') {
                // Lặp lại 1 video — đưa vào list nhiều lần (999 lần) để FFmpeg chạy mãi
                const first = allVideos[0];
                videos = Array(999).fill(first);
            } else {
                // sequential
                videos = allVideos;
            }
        } else {
            // Single video
            if (config.loopVideo) {
                // Lặp vô tận — 999 lần
                videos = Array(999).fill(config.videoSource);
            } else {
                videos = [config.videoSource];
            }
        }

        // Ghi list.txt vào temp dir
        const listPath = path.join(os.tmpdir(), `vic_concat_${streamId}.txt`);
        // FFmpeg concat demuxer yêu cầu escape dấu quote và backslash
        const lines = videos.map(v => {
            const escaped = v.replace(/\\/g, '/').replace(/'/g, "'\\''");
            return `file '${escaped}'`;
        }).join('\n');
        fsSync.writeFileSync(listPath, lines, 'utf8');
        console.log(`📄 Concat list: ${listPath} (${videos.length} entries)`);
        return { listPath, videos };
    }

    // ✅ Chạy 1 FFmpeg process duy nhất với concat demuxer
    async _runConcatStream(streamId) {
        const streamInfo = this.activeStreams.get(streamId);
        if (!streamInfo) return;

        const config = streamInfo.config;
        const isPlaylist = config.playlist && config.playlist.videos && config.playlist.videos.length > 0;

        try {
            // Build list.txt
            const { listPath, videos } = await this._buildConcatList(streamId);
            streamInfo.concatListPath = listPath;
            streamInfo.concatVideos = videos;

            const outputUrl = this.buildRTMPUrl(config);
            const quality = this.getQualitySettings(config.quality || '720p');
            const fps = config.fps || 30;
            const bitrate = config.bitrate || quality.videoBitrate;

            // Build FFmpeg args — dùng spawn trực tiếp để kiểm soát hoàn toàn
            const args = [
                '-re',
                '-f', 'concat',
                '-safe', '0',
                '-i', listPath,
                // video
                '-c:v', 'libx264',
                '-preset', 'veryfast',
                '-b:v', `${bitrate}k`,
                '-maxrate', `${bitrate}k`,
                '-bufsize', `${bitrate * 2}k`,
                '-g', `${fps * 2}`,
                '-keyint_min', `${fps}`,
                '-sc_threshold', '0',
                '-pix_fmt', 'yuv420p',
                '-s', `${quality.width}x${quality.height}`,
                '-r', `${fps}`,
                // audio
                '-c:a', 'aac',
                '-b:a', `${quality.audioBitrate}k`,
                '-ar', '44100',
                '-ac', '2',
                // output
                '-f', 'flv',
                outputUrl
            ];

            // Thêm overlay nếu có
            if (config.overlay && config.overlay.enabled) {
                const text = (config.overlay.text || 'VICdigi').replace(/'/g, "'");
                const posMap = {
                    'top-left': 'x=10:y=10', 'top-right': 'x=w-text_w-10:y=10',
                    'bottom-left': 'x=10:y=h-text_h-10', 'bottom-right': 'x=w-text_w-10:y=h-text_h-10',
                    'center': 'x=(w-text_w)/2:y=(h-text_h)/2'
                };
                const xy = posMap[config.overlay.position] || posMap['top-left'];
                const vf = `drawtext=text='${text}':fontsize=${config.overlay.fontSize||24}:fontcolor=${config.overlay.color||'white'}:${xy}:box=1:boxcolor=black@0.4:boxborderw=6`;
                // Chèn -vf trước -f flv
                const fIdx = args.indexOf('-f');
                args.splice(fIdx, 0, '-vf', vf);
            }

            // Platform-specific
            if (config.platform === 'youtube') {
                args.splice(args.indexOf('-f'), 0, '-profile:v', 'main', '-level', '4.1');
            } else if (config.platform === 'tiktok') {
                args.splice(args.indexOf('-f'), 0, '-profile:v', 'baseline', '-level', '3.1');
            }

            console.log(`🚀 FFmpeg concat command ready, output: ${this.maskRTMPUrl(outputUrl)}`);

            // Spawn FFmpeg
            const ffmpegExe = this.ffmpegPath || 'ffmpeg';
            const proc = spawn(ffmpegExe, args, { stdio: ['ignore', 'pipe', 'pipe'] });
            streamInfo.ffmpegProcess = proc;
            streamInfo.status = 'running';

            let stderrBuf = '';
            let lastProgress = {};

            proc.stderr.on('data', (chunk) => {
                const line = chunk.toString();
                stderrBuf += line;

                // Parse progress từ stderr
                const fpsM = line.match(/fps=\s*([\d.]+)/);
                const bitrateM = line.match(/bitrate=\s*([\d.]+)kbits/);
                const frameM = line.match(/frame=\s*(\d+)/);
                const timeM = line.match(/time=([\d:]+\.\d+)/);

                if (fpsM || bitrateM || frameM) {
                    if (fpsM) lastProgress.fps = parseFloat(fpsM[1]);
                    if (bitrateM) lastProgress.bitrate = parseFloat(bitrateM[1]);
                    if (frameM) lastProgress.frames = parseInt(frameM[1]);
                    if (timeM) lastProgress.time = timeM[1];
                    lastProgress.uptime = Math.floor((Date.now() - streamInfo.startTime) / 1000);
                    lastProgress.health = 100;
                    streamInfo.stats = { ...streamInfo.stats, ...lastProgress };
                    this.emit('stream:stats', { streamId, stats: streamInfo.stats, timerInfo: streamInfo.timerInfo });
                }

                // Log lỗi
                if (line.toLowerCase().includes('error')) {
                    console.error('FFmpeg stderr:', line.trim());
                }
            });

            proc.on('exit', (code, signal) => {
                console.log(`👋 FFmpeg process exited | code:${code} signal:${signal}`);
                // Cleanup list file
                try { fsSync.unlinkSync(listPath); } catch(_) {}

                const si = this.activeStreams.get(streamId);
                if (!si || si.stopFlag) return;

                if (code === 0) {
                    // Chạy xong tất cả video trong list
                    const mode = config.playlist?.mode;
                    if (mode === 'sequential' && !config.loopVideo) {
                        // Hết playlist — dừng
                        this.stopStream(streamId);
                    } else {
                        // Loop lại: tạo list mới rồi chạy lại
                        this._runConcatStream(streamId);
                    }
                } else {
                    const classified = this.classifyFFmpegError('exit code ' + code, stderrBuf.split('\n').slice(-20));
                    console.error(`❌ Stream error: ${classified.message}`);
                    this.emit('stream:error', { streamId, error: classified.message, errorCode: classified.code });
                    this.stopStream(streamId);
                }
            });

        } catch (err) {
            console.error('_runConcatStream error:', err);
            this.stopStream(streamId);
        }
    }

    createOptimizedFFmpegCommand(input, config) {
        // Build optimized RTMP URL
        let outputUrl = this.buildRTMPUrl(config);
        
        console.log('\n========== Optimized Stream Configuration ==========');
        console.log('Platform:', config.platform);
        console.log('Input:', input);
        console.log('Output URL:', this.maskRTMPUrl(outputUrl));
        console.log('Quality:', config.quality || '720p');
        console.log('Bitrate:', config.bitrate || this.getQualitySettings(config.quality || '720p').videoBitrate);
        console.log('====================================================\n');
        
        const quality = this.getQualitySettings(config.quality || '720p');
        const fps = config.fps || 30;
        
        // Use input directly - fluent-ffmpeg handles paths with spaces
        // ✅ NEVER use -stream_loop here — loop/playlist is handled at app level
        //    -stream_loop -1 makes FFmpeg loop forever so 'end' never fires
        const command = ffmpeg(input)
            .inputOptions([
                '-re'   // Read input at native frame rate
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

        // ✅ Text overlay / watermark
        if (config.overlay && config.overlay.enabled) {
            const text   = (config.overlay.text || 'VICdigi Live').replace(/'/g, "\\'").replace(/:/g, '\\:');
            const pos    = config.overlay.position || 'top-left';
            const size   = config.overlay.fontSize || 24;
            const color  = config.overlay.color || 'white';
            const posMap = {
                'top-left':     'x=10:y=10',
                'top-right':    'x=w-text_w-10:y=10',
                'bottom-left':  'x=10:y=h-text_h-10',
                'bottom-right': 'x=w-text_w-10:y=h-text_h-10',
                'center':       'x=(w-text_w)/2:y=(h-text_h)/2'
            };
            const xy = posMap[pos] || posMap['top-left'];
            const drawtext = `drawtext=text='${text}':fontsize=${size}:fontcolor=${color}:${xy}:box=1:boxcolor=black@0.4:boxborderw=6`;
            command.videoFilters(drawtext);
        }

        // ✅ Phân loại lỗi FFmpeg chi tiết từ stderr
        const stderrBuffer = [];
        command.on('stderr', (line) => {
            stderrBuffer.push(line);
            if (stderrBuffer.length > 40) stderrBuffer.shift();
            if (line.includes('error') || line.includes('Error')) {
                console.error('FFmpeg stderr:', line);
            }
        });

        // Store buffer ref so stopStream / error handler can read it
        command._stderrBuffer = stderrBuffer;

        command.output(outputUrl);
        
        return command;
    }

    // ✅ Classify FFmpeg error into human-readable Vietnamese message
    classifyFFmpegError(rawError, stderrLines = []) {
        const full = (rawError + '\n' + stderrLines.join('\n')).toLowerCase();

        if (full.includes('invalid data') && full.includes('flv'))
            return { code: 'BAD_STREAM_KEY', message: 'Stream key không hợp lệ hoặc sai định dạng' };
        if (full.includes('connection refused') || full.includes('connection timed out'))
            return { code: 'CONNECTION_REFUSED', message: 'Không kết nối được đến máy chủ RTMP — kiểm tra URL' };
        if (full.includes('network unreachable') || full.includes('no route'))
            return { code: 'NO_NETWORK', message: 'Không có mạng — kiểm tra kết nối Internet' };
        if (full.includes('epipe') || full.includes('broken pipe'))
            return { code: 'BROKEN_PIPE', message: 'Kết nối stream bị đứt (Broken pipe)' };
        if (full.includes('econnreset') || full.includes('connection reset'))
            return { code: 'CONN_RESET', message: 'Kết nối bị đặt lại bởi server' };
        if (full.includes('no such file') || full.includes('no such directory'))
            return { code: 'FILE_NOT_FOUND', message: 'Không tìm thấy file video — đường dẫn không tồn tại' };
        if (full.includes('permission denied'))
            return { code: 'PERMISSION', message: 'Không có quyền đọc file video' };
        if (full.includes('codec not supported') || full.includes('encoder not found'))
            return { code: 'CODEC_ERROR', message: 'Codec không được hỗ trợ — kiểm tra cài đặt chất lượng' };
        if (full.includes('out of memory') || full.includes('cannot allocate'))
            return { code: 'OOM', message: 'Không đủ RAM để encode video' };
        if (full.includes('rtmp') && full.includes('failed'))
            return { code: 'RTMP_FAIL', message: 'RTMP stream thất bại — kiểm tra Stream Key và URL' };
        if (full.includes('403') || full.includes('forbidden'))
            return { code: 'AUTH_ERROR', message: 'Bị từ chối (403) — Stream Key có thể đã hết hạn' };
        if (full.includes('maximum streams'))
            return { code: 'MAX_STREAMS', message: 'Đã đạt giới hạn số stream của nền tảng' };

        return { code: 'UNKNOWN', message: rawError || 'Lỗi không xác định' };
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

    maskRTMPUrl(url) {
        if (!url || typeof url !== 'string') return url;
        const parts = url.split('/');
        if (parts.length === 0) return url;

        const last = parts[parts.length - 1];
        if (!last) return url;

        parts[parts.length - 1] = last.length <= 8
            ? '***'
            : `${last.slice(0, 4)}...${last.slice(-4)}`;

        return parts.join('/');
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
        if (streamInfo.status === 'stopping') return false;
        if (streamInfo.restartAttempts >= 5) return false;
        if (!streamInfo.config.autoRestart) return false;

        if (error) {
            // ✅ Expanded list — I/O error = RTMP server closed (stream key expired etc)
            const recoverableErrors = [
                'EPIPE', 'ECONNRESET', 'ETIMEDOUT',
                'Connection reset', 'Broken pipe',
                'I/O error', 'Input/output error',
                'Connection timed out', 'Network unreachable'
            ];
            const errorString = error.toString();
            return recoverableErrors.some(e =>
                errorString.toLowerCase().includes(e.toLowerCase())
            );
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
            if (!this.activeStreams.has(streamId)) return;
            try {
                if (streamInfo.command) {
                    try { streamInfo.command.kill('SIGKILL'); } catch(_) {}
                }

                // ✅ For playlist: replay the CURRENT video (don't advance index on error)
                //    currentVideo was stored when playNextVideo ran
                let inputSource;
                if (streamInfo.config.playlist) {
                    // Replay whichever video was playing when error occurred
                    inputSource = streamInfo.config.playlist.currentVideo
                        || streamInfo.config.playlist.videos[0];
                } else {
                    inputSource = streamInfo.config.videoSource;
                }

                if (!inputSource) {
                    throw new Error('No input source for restart');
                }

                const newCommand = this.createOptimizedFFmpegCommand(inputSource, streamInfo.config);
                streamInfo.command = newCommand;
                streamInfo.status = 'running';
                this.attachCommandHandlers(newCommand, streamId);
                newCommand.run();

                console.log(`✅ Stream ${streamId} restarted with: ${path.basename(inputSource)}`);
                this.emit('stream:restarted', { streamId });

            } catch (error) {
                console.error(`Failed to restart stream ${streamId}:`, error);
                this.emit('stream:error', { streamId, error: 'Failed to restart' });
                this.stopStream(streamId);
            }
        }, delay);
    }

    attachCommandHandlers(command, streamId) {
        command.on('progress', (progress) => {
            this.updateStreamStats(streamId, progress);
        });

        command.on('error', (error) => {
            const streamInfo = this.activeStreams.get(streamId);
            if (!streamInfo || streamInfo.status === 'stopping') return;

            const classified = this.classifyFFmpegError(
                error.message,
                streamInfo.command?._stderrBuffer || []
            );
            console.error(`❌ Stream ${streamId} error [${classified.code}]: ${classified.message}`);

            if (this.shouldAutoRestart(streamInfo, error)) {
                this.scheduleRestart(streamId);
            } else {
                this.emit('stream:error', {
                    streamId,
                    error: classified.message,
                    errorCode: classified.code
                });
                this.stopStream(streamId);
            }
        });

        command.on('end', () => {
            const streamInfo = this.activeStreams.get(streamId);
            if (!streamInfo || streamInfo.status === 'stopping') return;

            if (streamInfo.config.playlist && streamInfo.config.playlist.videos && streamInfo.config.playlist.videos.length > 0) {
                // ✅ Playlist: delegate to playNextVideo (handles all modes)
                this.playNextVideo(streamId);
            } else if (streamInfo.config.loopVideo) {
                // ✅ Single video loop
                console.log(`🔁 Loop single video (restart): ${streamId}`);
                const loopCmd = this.createOptimizedFFmpegCommand(streamInfo.config.videoSource, streamInfo.config);
                streamInfo.command = loopCmd;
                this.attachCommandHandlers(loopCmd, streamId);
                loopCmd.run();
            } else if (this.shouldAutoRestart(streamInfo)) {
                this.scheduleRestart(streamId);
            } else {
                this.stopStream(streamId);
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
                
                if (health < 20 && streamInfo.config.autoRestart) {
                    console.log(`🔄 Restarting unhealthy stream ${streamId}`);
                    this.scheduleRestart(streamId);
                }
            }

            streamInfo.lastHealthCheck = Date.now();
        }, 5000);

        this.streamHealthChecks.set(streamId, checkInterval);

        // ✅ Preview thumbnail: capture a frame every 12 seconds
        const thumbInterval = setInterval(() => {
            this.capturePreviewThumbnail(streamId);
        }, 12000);

        // Store so we can clear on stop
        const streamInfo = this.activeStreams.get(streamId);
        if (streamInfo) streamInfo.thumbInterval = thumbInterval;
    }

    // ✅ Grab a single JPEG frame from the input video as base64 preview
    async capturePreviewThumbnail(streamId) {
        const streamInfo = this.activeStreams.get(streamId);
        if (!streamInfo || streamInfo.status !== 'running') return;

        const inputSource = streamInfo.config.videoSource
            || (streamInfo.config.playlist && streamInfo.config.playlist.currentVideo);
        if (!inputSource) return;

        const os  = require('os');
        const fsp = require('fs').promises;
        const tmpFile = require('path').join(os.tmpdir(), `vic_thumb_${streamId}.jpg`);

        try {
            await new Promise((resolve, reject) => {
                ffmpeg(inputSource)
                    .screenshots({
                        count: 1,
                        folder: os.tmpdir(),
                        filename: `vic_thumb_${streamId}.jpg`,
                        size: '320x180',
                        timemarks: ['00:00:03']
                    })
                    .on('end', resolve)
                    .on('error', reject);
            });

            const buf = await fsp.readFile(tmpFile);
            const b64 = 'data:image/jpeg;base64,' + buf.toString('base64');

            this.emit('stream:thumbnail', { streamId, thumbnail: b64 });

            // Clean up temp file
            fsp.unlink(tmpFile).catch(() => {});
        } catch (err) {
            // Silently ignore — preview not critical
        }
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
            streamInfo.stopFlag = true; // ✅ signal while-loop to exit

            // Clear all timers and intervals
            if (streamInfo.stopTimer) {
                clearTimeout(streamInfo.stopTimer);
                console.log(`⏱️ Timer cleared for stream ${streamId}`);
            }

            if (streamInfo.countdownInterval) {
                clearInterval(streamInfo.countdownInterval);
            }

            // ✅ Clear thumbnail interval
            if (streamInfo.thumbInterval) {
                clearInterval(streamInfo.thumbInterval);
            }

            // Clear health check
            const healthCheck = this.streamHealthChecks.get(streamId);
            if (healthCheck) {
                clearInterval(healthCheck);
                this.streamHealthChecks.delete(streamId);
            }

            // Kill FFmpeg process
            if (streamInfo.ffmpegProcess) {
                streamInfo.ffmpegProcess.kill('SIGTERM');
                setTimeout(() => {
                    try { streamInfo.ffmpegProcess.kill('SIGKILL'); } catch(_) {}
                }, 3000);
            } else if (streamInfo.command) {
                streamInfo.command.kill('SIGTERM');
            }
            // Cleanup concat list file
            if (streamInfo.concatListPath) {
                try { fsSync.unlinkSync(streamInfo.concatListPath); } catch(_) {}
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

        // ✅ Ensure currentIndex is a valid number (persists on the object between calls)
        if (typeof playlist.currentIndex !== 'number' || playlist.currentIndex >= playlist.videos.length) {
            playlist.currentIndex = 0;
        }

        let videoPath;

        switch (playlist.mode) {
            case 'random':
                const randomIndex = Math.floor(Math.random() * playlist.videos.length);
                videoPath = playlist.videos[randomIndex];
                // For random: advance currentIndex so next call is also random
                playlist.currentIndex = randomIndex;
                console.log(`🎲 Random mode: Selected video ${randomIndex + 1}/${playlist.videos.length}`);
                break;

            case 'loop':
                // Loop the SAME video — don't change index at all
                videoPath = playlist.videos[playlist.currentIndex];
                console.log(`🔁 Loop mode: Repeating video ${playlist.currentIndex + 1}/${playlist.videos.length}`);
                break;

            case 'sequential':
            default: {
                videoPath = playlist.videos[playlist.currentIndex];
                const nextIndex = (playlist.currentIndex + 1) % playlist.videos.length;
                console.log(`▶️ Sequential: Playing video ${playlist.currentIndex + 1}/${playlist.videos.length}, next → ${nextIndex + 1}`);
                // Advance AFTER selecting so next call gets the right one
                playlist.currentIndex = nextIndex;
                break;
            }
        }

        // Verify file exists
        try {
            await fs.access(videoPath);
            console.log(`✅ Video file accessible: ${path.basename(videoPath)}`);
            return videoPath;
        } catch (error) {
            console.error(`❌ Video file not accessible: ${videoPath}`);

            // Try next video if skip errors is enabled
            if (playlist.skipErrors && playlist.videos.length > 1) {
                console.log(`⏭️ Skipping error file, trying next video...`);

                // Create new playlist object with filtered videos (don't mutate original)
                const filteredVideos = playlist.videos.filter(v => v !== videoPath);

                if (filteredVideos.length === 0) {
                    console.error('❌ No more videos available in playlist');
                    return null;
                }

                // Create new playlist config without mutating original
                const newPlaylist = {
                    ...playlist,
                    videos: filteredVideos,
                    currentIndex: Math.min(playlist.currentIndex || 0, filteredVideos.length - 1)
                };

                return this.getPlaylistInput(newPlaylist);
            }

            return null;
        }
    }

    async playNextVideo(streamId) {
        const streamInfo = this.activeStreams.get(streamId);
        if (!streamInfo) {
            console.log(`⚠️ playNextVideo: stream ${streamId} not found`);
            return;
        }
        if (!streamInfo.config.playlist) {
            console.log(`⚠️ playNextVideo: no playlist on stream ${streamId}`);
            return;
        }
        if (streamInfo.status === 'stopping') return;

        const playlist = streamInfo.config.playlist;
        console.log(`🔄 playNextVideo | mode:${playlist.mode} | index:${playlist.currentIndex} | total:${playlist.videos?.length}`);

        // ✅ getPlaylistInput mutates playlist.currentIndex in place — that's intentional
        const nextVideo = await this.getPlaylistInput(playlist);
        if (!nextVideo) {
            console.error(`❌ No more videos in playlist for stream ${streamId}`);
            this.stopStream(streamId);
            return;
        }

        // Also update currentVideo so thumbnail capture works
        playlist.currentVideo = nextVideo;

        console.log(`📹 Next video: ${path.basename(nextVideo)}`);

        // ✅ Create new FFmpeg command BEFORE killing old one to minimise gap
        const newCommand = this.createOptimizedFFmpegCommand(nextVideo, streamInfo.config);

        // Kill previous command (it already ended, but cleanup handles edge cases)
        if (streamInfo.command) {
            try { streamInfo.command.kill('SIGKILL'); } catch(_) {}
        }

        streamInfo.command = newCommand;
        this.attachCommandHandlers(newCommand, streamId);
        newCommand.run();

        this.emit('stream:next-video', {
            streamId,
            video: nextVideo,
            videoName: path.basename(nextVideo),
            playlistMode: playlist.mode,
            playlistIndex: playlist.currentIndex
        });
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
