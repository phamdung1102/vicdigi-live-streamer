// Main App Controller
class App {
    constructor() {
        this.currentPage = 'dashboard';
        this.activeStreams = new Map();
        this.schedules = [];
        this.autoLiveRows = [];
        this.playlistVideos = [];
        this.init();
    }

    async init() {
        console.log('🚀 VICdigi Live Streamer initializing...');
        
        // Initialize navigation
        this.initNavigation();
        
        // Initialize event listeners
        this.initEventListeners();
        
        // Load initial data
        await this.loadInitialData();
        await this.loadAppVersion();
        
        // Start monitoring
        this.startMonitoring();
        
        // Listen to stream events
        this.listenToStreamEvents();
        
        console.log('✅ App initialized successfully');
    }

    async loadAppVersion() {
        if (!window.api.updater) return;
        const result = await window.api.updater.getSettings();
        if (!result.success || !result.version) return;

        const versionText = `v${result.version}`;
        const versionEl = document.getElementById('app-version');
        if (versionEl) versionEl.textContent = versionText;
        document.title = `VICdigi Live Streamer ${versionText}`;
    }

    initNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const page = item.dataset.page;
                this.showPage(page);
            });
        });
    }

    showPage(pageId) {
        // Update navigation
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.page === pageId);
        });

        // Update pages
        document.querySelectorAll('.page').forEach(page => {
            page.classList.toggle('active', page.id === pageId);
        });

        this.currentPage = pageId;

        // Page-specific actions
        switch(pageId) {
            case 'dashboard':
                this.updateDashboard();
                break;
            case 'streams':
                this.loadStreams();
                break;
            case 'playlist':
                this.loadPlaylist();
                break;
            case 'schedule':
                this.loadSchedules();
                break;
            case 'settings':
                this.loadSettings();
                break;
            case 'history':
                this.loadHistoryPage();
                break;
        }
    }

    initEventListeners() {
        // Quick stream button
        const quickStreamBtn = document.getElementById('quick-stream');
        if (quickStreamBtn) {
            quickStreamBtn.addEventListener('click', () => {
                this.showQuickStreamDialog();
            });
        }

        // Add stream button
        const addStreamBtn = document.getElementById('add-stream');
        if (addStreamBtn) {
            addStreamBtn.addEventListener('click', () => {
                this.showAddStreamModal();
            });
        }

        // Add first stream button
        const addFirstStreamBtn = document.getElementById('add-first-stream');
        if (addFirstStreamBtn) {
            addFirstStreamBtn.addEventListener('click', () => {
                this.showAddStreamModal();
            });
        }

        // Modal close buttons
        document.querySelectorAll('.close-modal, .cancel-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                this.closeModals();
            });
        });

        // Stream form submission
        const streamForm = document.getElementById('stream-form');
        if (streamForm) {
            streamForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleStreamFormSubmit(streamForm);
            });
        }

        // Platform select change
        const platformSelect = document.getElementById('platform-select');
        if (platformSelect) {
            platformSelect.addEventListener('change', (e) => {
                this.updateRTMPUrl(e.target.value);
            });
        }

        // Select folder button
        const selectFolderBtn = document.getElementById('select-folder');
        if (selectFolderBtn) {
            selectFolderBtn.addEventListener('click', async () => {
                console.log('Select folder button clicked');
                await this.selectVideoFolder();
            });
        }

        // Empty state select folder
        const selectFolderEmpty = document.getElementById('select-folder-empty');
        if (selectFolderEmpty) {
            selectFolderEmpty.addEventListener('click', async () => {
                console.log('Select folder empty button clicked');
                await this.selectVideoFolder();
            });
        }

        // Add schedule button
        const addScheduleBtn = document.getElementById('add-schedule');
        if (addScheduleBtn) {
            addScheduleBtn.addEventListener('click', () => {
                this.showAddScheduleModal();
            });
        }

        // Select video file button
        const selectVideoBtn = document.getElementById('select-video-file');
        if (selectVideoBtn) {
            selectVideoBtn.addEventListener('click', async () => {
                const result = await this.selectVideoFile();
                if (result) {
                    document.getElementById('video-path').value = result;
                }
            });
        }

        // Video source type radio buttons
        document.querySelectorAll('input[name="videoSourceType"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const videoFileInput = document.getElementById('video-file-input');
                const playlistSelectInput = document.getElementById('playlist-select-input');
                
                if (e.target.value === 'file') {
                    videoFileInput.style.display = 'flex';
                    playlistSelectInput.style.display = 'none';
                } else {
                    videoFileInput.style.display = 'none';
                    playlistSelectInput.style.display = 'flex';
                    this.updatePlaylistSelect();
                }
            });
        });

        // Timer type radio buttons
        document.querySelectorAll('input[name="timerType"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                const durationInput = document.getElementById('timer-duration-input');
                const specificInput = document.getElementById('timer-specific-input');
                
                // Hide all timer inputs first
                if (durationInput) durationInput.style.display = 'none';
                if (specificInput) specificInput.style.display = 'none';
                
                // Show the selected input
                if (e.target.value === 'duration' && durationInput) {
                    durationInput.style.display = 'flex';
                } else if (e.target.value === 'specific' && specificInput) {
                    specificInput.style.display = 'flex';
                }
            });
        });

        // Save settings button
        const saveSettingsBtn = document.getElementById('save-settings');
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener('click', () => {
                this.saveSettings();
            });
        }

        const saveAutoLiveBtn = document.getElementById('save-auto-live-settings');
        if (saveAutoLiveBtn) {
            saveAutoLiveBtn.addEventListener('click', () => this.saveAutoLiveSettings());
        }

        const previewAutoLiveBtn = document.getElementById('preview-auto-live-sheet');
        if (previewAutoLiveBtn) {
            previewAutoLiveBtn.addEventListener('click', () => this.previewAutoLiveSheet());
        }

        const syncAutoLiveBtn = document.getElementById('sync-auto-live-sheet');
        if (syncAutoLiveBtn) {
            syncAutoLiveBtn.addEventListener('click', () => this.syncAutoLiveSheet());
        }

        const schedulePreviewAutoLiveBtn = document.getElementById('schedule-preview-auto-live-sheet');
        if (schedulePreviewAutoLiveBtn) {
            schedulePreviewAutoLiveBtn.addEventListener('click', () => this.previewAutoLiveSheet());
        }

        const scheduleSyncAutoLiveBtn = document.getElementById('schedule-sync-auto-live-sheet');
        if (scheduleSyncAutoLiveBtn) {
            scheduleSyncAutoLiveBtn.addEventListener('click', () => this.syncAutoLiveSheet());
        }

        const openAutoLiveChromeBtn = document.getElementById('open-auto-live-chrome');
        if (openAutoLiveChromeBtn) {
            openAutoLiveChromeBtn.addEventListener('click', () => this.openAutoLiveChromeLogin());
        }

        const scanFacebookPagesBtn = document.getElementById('scan-facebook-pages');
        if (scanFacebookPagesBtn) {
            scanFacebookPagesBtn.addEventListener('click', () => this.scanFacebookPages());
        }

        const pageSelect = document.getElementById('auto-live-facebook-page');
        if (pageSelect) {
            pageSelect.addEventListener('change', () => this.selectAutoLiveFacebookPage());
        }

        const saveUpdaterBtn = document.getElementById('save-updater-settings');
        if (saveUpdaterBtn) {
            saveUpdaterBtn.addEventListener('click', () => this.saveUpdaterSettings());
        }

        const checkUpdateBtn = document.getElementById('check-update');
        if (checkUpdateBtn) {
            checkUpdateBtn.addEventListener('click', () => this.checkForUpdates());
        }

        const downloadUpdateBtn = document.getElementById('download-update');
        if (downloadUpdateBtn) {
            downloadUpdateBtn.addEventListener('click', () => this.downloadUpdate());
        }

        const installUpdateBtn = document.getElementById('install-update');
        if (installUpdateBtn) {
            installUpdateBtn.addEventListener('click', () => this.installUpdate());
        }

        // ✅ Overlay toggle — show/hide overlay options when checkbox changes
        document.addEventListener('change', (e) => {
            if (e.target && e.target.name === 'overlayEnabled') {
                const opts = document.getElementById('overlay-options');
                if (opts) opts.style.display = e.target.checked ? 'block' : 'none';
            }
        });

        // ✅ Hot reload toggle
        const hotReloadCheckbox = document.getElementById('hot-reload');
        if (hotReloadCheckbox) {
            hotReloadCheckbox.addEventListener('change', async (e) => {
                if (e.target.checked && this.currentPlaylistFolder) {
                    await window.api.playlist.watchFolder(this.currentPlaylistFolder);
                    this.showToast('🔄 Hot reload bật — tự nhận video mới', 'success');
                } else {
                    await window.api.playlist.unwatchFolder();
                    this.showToast('Hot reload đã tắt', 'info');
                }
            });
        }
    }

    async loadInitialData() {
        try {
            // Get all stream statuses
            const statusResult = await window.api.stream.getAllStatus();
            if (statusResult.success) {
                statusResult.statuses.forEach(status => {
                    this.activeStreams.set(status.id, status);
                });
            }

            // Get all schedules
            const schedulesResult = await window.api.schedule.getAll();
            if (schedulesResult.success) {
                this.schedules = schedulesResult.schedules;
            }

            // Update dashboard
            this.updateDashboard();
        } catch (error) {
            console.error('Failed to load initial data:', error);
        }
    }

    startMonitoring() {
        // ✅ Real system metrics pushed from main process every 2s
        if (window.api.system && window.api.system.onMetrics) {
            window.api.system.onMetrics((metrics) => {
                this.updateSystemInfoReal(metrics);
            });
        }

        // Update stream stats every second
        setInterval(() => {
            this.updateStreamStats();
        }, 1000);
    }

    listenToStreamEvents() {
        // Stream started
        window.api.stream.onStarted((data) => {
            console.log('Stream started:', data);
            
            // Create proper stream object with timer info
            const streamInfo = {
                id: data.streamId,
                streamId: data.streamId,
                name: data.config?.name || 'Stream',
                platform: data.config?.platform || 'custom',
                config: data.config || {},
                status: data.status || 'running',
                stats: data.stats || {},
                timerInfo: data.timerInfo || null,
                startTime: Date.now()
            };
            
            this.activeStreams.set(data.streamId, streamInfo);
            this.updateDashboard();
            this.loadStreams();
            this.showToast(`Stream "${streamInfo.name}" đã bắt đầu`, 'success');
        });

        // Stream stopped
        window.api.stream.onStopped((data) => {
            console.log('Stream stopped:', data);
            this.activeStreams.delete(data.streamId);
            this.updateDashboard();
            this.showToast('Stream đã dừng', 'info');
        });

        // Stream error
        window.api.stream.onError((data) => {
            console.error('Stream error:', data);
            this.showToast(`Lỗi stream: ${data.error}`, 'error');
        });

        // Stream stats update
        window.api.stream.onStats((data) => {
            if (this.activeStreams.has(data.streamId)) {
                const stream = this.activeStreams.get(data.streamId);
                stream.stats = data.stats;
                if (data.timerInfo) {
                    stream.timerInfo = data.timerInfo;
                }
                this.activeStreams.set(data.streamId, stream);
                
                // Update UI if on dashboard or streams page
                if (this.currentPage === 'dashboard' || this.currentPage === 'streams') {
                    this.updateStreamCard(data.streamId);
                }
            }
        });

        // Stream countdown update
        window.api.stream.onCountdown && window.api.stream.onCountdown((data) => {
            if (this.activeStreams.has(data.streamId)) {
                const stream = this.activeStreams.get(data.streamId);
                stream.countdown = data.remaining;
                this.activeStreams.set(data.streamId, stream);
                this.updateStreamTimer(data.streamId, data.remaining);
            }
        });

        // Stream health warning
        window.api.stream.onHealthWarning && window.api.stream.onHealthWarning((data) => {
            console.warn(`Stream health warning: ${data.streamId} - ${data.health}%`);
            if (data.health < 30) {
                this.showToast(`⚠️ Stream health is low: ${data.health}%`, 'warning');
            }
        });

        // Stream restarting
        window.api.stream.onRestarting && window.api.stream.onRestarting((data) => {
            this.showToast(`🔄 Restarting stream (attempt ${data.attempt})...`, 'info');
        });

        // ✅ Next video in playlist
        if (window.api.stream.onNextVideo) {
            window.api.stream.onNextVideo((data) => {
                const { streamId, videoName, playlistMode, playlistIndex } = data;
                this.showToast(`▶️ [${playlistMode}] → ${videoName}`, 'info');
                // Update card title if visible
                const card = document.querySelector(`[data-stream-id="${streamId}"]`);
                if (card) {
                    const nowPlaying = card.querySelector('.now-playing');
                    if (nowPlaying) {
                        nowPlaying.textContent = `▶️ ${videoName}`;
                    } else {
                        const info = card.querySelector('.stream-info');
                        if (info) {
                            const div = document.createElement('div');
                            div.className = 'now-playing';
                            div.style.cssText = 'font-size:12px;color:var(--accent-primary);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
                            div.textContent = `▶️ ${videoName}`;
                            info.appendChild(div);
                        }
                    }
                }
            });
        }

        // ✅ Stream preview thumbnail
        if (window.api.stream.onThumbnail) {
            window.api.stream.onThumbnail((data) => {
                const { streamId, thumbnail } = data;
                const card = document.querySelector(`[data-stream-id="${streamId}"]`);
                if (!card) return;
                let img = card.querySelector('.preview-img');
                if (!img) {
                    const previewDiv = card.querySelector('.no-preview');
                    if (previewDiv) {
                        img = document.createElement('img');
                        img.className = 'preview-img';
                        img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:6px;';
                        previewDiv.replaceWith(img);
                    }
                }
                if (img) img.src = thumbnail;
            });
        }

        // ✅ Hot reload — folder changed event
        if (window.api.playlist && window.api.playlist.onFolderChanged) {
            window.api.playlist.onFolderChanged((data) => {
                const prevCount = this.playlistVideos.length;
                this.playlistVideos = data.videos || [];
                this.updatePlaylistUI();
                const diff = this.playlistVideos.length - prevCount;
                if (diff > 0) {
                    this.showToast(`🔄 Playlist tự động cập nhật: +${diff} video mới`, 'success');
                } else if (diff < 0) {
                    this.showToast(`🔄 Playlist cập nhật: ${Math.abs(diff)} video đã xóa`, 'info');
                } else {
                    this.showToast('🔄 Playlist đã cập nhật', 'info');
                }
            });
        }

        if (window.api.autoLive) {
            window.api.autoLive.onStatus((data) => {
                const title = data?.row?.title ? `: ${data.row.title}` : '';
                this.setAutoLiveStatus(`Auto Live ${data.status}${title}`);
            });
            window.api.autoLive.onStarted((data) => {
                this.showToast(`Auto Live đã start: ${data?.row?.title || data.streamId}`, 'success');
            });
            window.api.autoLive.onError((data) => {
                this.showToast(`Auto Live lỗi: ${data.error}`, 'error');
                this.setAutoLiveStatus(`Auto Live lỗi: ${data.error}`);
            });
            window.api.autoLive.onReloaded((data) => {
                this.setAutoLiveStatus(`Auto Live đã đọc ${data.total} dòng, hẹn ${data.scheduled} lịch.`);
            });
        }

        if (window.api.updater) {
            window.api.updater.onStatus((data) => {
                const status = data.status;
                const state = data.state || {};
                if (status === 'available') {
                    this.showToast(`Có bản mới ${state.version || ''}`, 'info');
                    this.setUpdaterStatus(`Có bản mới ${state.version || ''}. Bấm tải bản mới.`);
                } else if (status === 'download-progress') {
                    const pct = Math.round(data.progress?.percent || 0);
                    this.setUpdaterStatus(`Đang tải update: ${pct}%`);
                } else if (status === 'downloaded') {
                    this.showToast('Đã tải xong bản cập nhật', 'success');
                    this.setUpdaterStatus('Đã tải xong. Bấm Cài và khởi động lại.');
                } else if (status === 'not-available') {
                    this.setUpdaterStatus('Đang dùng phiên bản mới nhất.');
                } else if (status === 'error') {
                    this.setUpdaterStatus(`Lỗi update: ${state.error || data.error}`);
                } else {
                    this.setUpdaterStatus(`Update: ${status}`);
                }
            });
        }
    }

    updateDashboard() {
        // Update stats
        const autoLiveUpcoming = this.autoLiveRows.filter(row => row.scheduledAt && new Date(row.scheduledAt).getTime() > Date.now()).length;
        document.getElementById('active-streams').textContent = this.activeStreams.size;
        document.getElementById('scheduled-streams').textContent = this.schedules.length + autoLiveUpcoming;
        document.getElementById('playlist-count').textContent = this.playlistVideos.length;
        
        // Update active streams list
        const streamsList = document.getElementById('active-streams-list');
        if (streamsList) {
            if (this.activeStreams.size === 0) {
                streamsList.innerHTML = `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                        </svg>
                        <p>Không có luồng nào đang phát</p>
                        <button class="btn btn-primary" onclick="app.showPage('streams')">Bắt đầu stream</button>
                    </div>
                `;
            } else {
                streamsList.innerHTML = '';
                this.activeStreams.forEach(stream => {
                    streamsList.appendChild(this.createStreamCard(stream));
                });
            }
        }
    }

    createStreamCard(stream) {
        const card = document.createElement('div');
        card.className = 'stream-card';
        card.dataset.streamId = stream.id || stream.streamId;
        
        const stats = stream.stats || {};
        const config = stream.config || {};
        const streamName = config.name || stream.name || 'Unnamed Stream';
        const platform = config.platform || stream.platform || 'custom';
        
        // Timer info
        let timerInfo = '';
        if (config.stopAfterMinutes) {
            const hours = Math.floor(config.stopAfterMinutes / 60);
            const minutes = config.stopAfterMinutes % 60;
            timerInfo = `⏱️ Tự tắt sau: ${hours > 0 ? hours + 'h ' : ''}${minutes}m`;
        } else if (config.stopAtTime) {
            timerInfo = `⏰ Tự tắt lúc: ${config.stopAtTime}`;
        }
        
        card.innerHTML = `
            <div class="stream-preview">
                <div class="no-preview">
                    <svg viewBox="0 0 24 24">
                        <path d="M21 3H3c-1.11 0-2 .89-2 2v12c0 1.1.89 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.11-.9-2-2-2zm0 14H3V5h18v12z"/>
                    </svg>
                    <p>Preview không khả dụng</p>
                </div>
                <span class="stream-badge live">LIVE</span>
            </div>
            <div class="stream-info">
                <div class="stream-header">
                    <div class="stream-title">
                        <h3>${streamName}</h3>
                        <span class="stream-platform">
                            ${platform}
                        </span>
                    </div>
                </div>
                ${timerInfo ? `<div class="stream-timer" style="color: #ffa500; padding: 5px 0; font-size: 14px;">${timerInfo}</div>` : ''}
                <div class="stream-stats">
                    <div class="stat-item">
                        <span class="value">${stats.fps || 0}</span>
                        <span class="label">FPS</span>
                    </div>
                    <div class="stat-item">
                        <span class="value">${stats.bitrate || 0}</span>
                        <span class="label">Kbps</span>
                    </div>
                    <div class="stat-item">
                        <span class="value">${this.formatUptime(stats.uptime || 0)}</span>
                        <span class="label">Uptime</span>
                    </div>
                </div>
                <div class="stream-controls">
                    <button class="btn btn-danger" onclick="window.app.stopStream('${stream.id || stream.streamId}')">
                        <svg class="icon" viewBox="0 0 24 24">
                            <path d="M6 6h12v12H6z"/>
                        </svg>
                        Dừng
                    </button>
                    <button class="btn btn-secondary" onclick="window.app.showStreamDetails('${stream.id || stream.streamId}')">
                        <svg class="icon" viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                        </svg>
                        Chi tiết
                    </button>
                </div>
            </div>
        `;
        
        return card;
    }

    updateStreamCard(streamId) {
        const card = document.querySelector(`[data-stream-id="${streamId}"]`);
        if (card && this.activeStreams.has(streamId)) {
            const stream = this.activeStreams.get(streamId);
            const stats = stream.stats || {};
            
            // Update stats
            const statsDiv = card.querySelector('.stream-stats');
            if (statsDiv) {
                statsDiv.innerHTML = `
                    <div class="stat-item">
                        <span class="value">${stats.fps || 0}</span>
                        <span class="label">FPS</span>
                    </div>
                    <div class="stat-item">
                        <span class="value">${stats.bitrate || 0}</span>
                        <span class="label">Kbps</span>
                    </div>
                    <div class="stat-item">
                        <span class="value">${this.formatUptime(stats.uptime || 0)}</span>
                        <span class="label">Uptime</span>
                    </div>
                `;
            }
            
            // Update health indicator if available
            if (stats.health !== undefined) {
                const healthIndicator = card.querySelector('.stream-health');
                if (healthIndicator) {
                    healthIndicator.textContent = `Health: ${stats.health}%`;
                    healthIndicator.style.color = stats.health >= 70 ? '#4caf50' : 
                                                  stats.health >= 40 ? '#ff9800' : '#f44336';
                } else {
                    // Add health indicator
                    const headerDiv = card.querySelector('.stream-header');
                    if (headerDiv) {
                        const healthDiv = document.createElement('div');
                        healthDiv.className = 'stream-health';
                        healthDiv.style.cssText = 'font-size: 12px; padding: 2px 0;';
                        healthDiv.textContent = `Health: ${stats.health}%`;
                        healthDiv.style.color = stats.health >= 70 ? '#4caf50' : 
                                               stats.health >= 40 ? '#ff9800' : '#f44336';
                        headerDiv.appendChild(healthDiv);
                    }
                }
            }
        }
    }

    updateStreamTimer(streamId, remaining) {
        const card = document.querySelector(`[data-stream-id="${streamId}"]`);
        if (card) {
            let timerDiv = card.querySelector('.stream-timer');
            
            if (remaining.totalSeconds <= 0) {
                if (timerDiv) {
                    timerDiv.textContent = '⏱️ Đang dừng stream...';
                    timerDiv.style.color = '#f44336';
                }
                return;
            }
            
            const countdown = `⏱️ Còn lại: ${remaining.formatted}`;
            
            if (timerDiv) {
                timerDiv.textContent = countdown;
                // Change color based on remaining time
                if (remaining.totalSeconds < 60) {
                    timerDiv.style.color = '#f44336'; // Red for last minute
                } else if (remaining.totalSeconds < 300) {
                    timerDiv.style.color = '#ff9800'; // Orange for last 5 minutes
                } else {
                    timerDiv.style.color = '#ffa500'; // Normal orange
                }
            } else {
                // Add timer div if not exists
                const headerDiv = card.querySelector('.stream-header');
                if (headerDiv) {
                    const newTimerDiv = document.createElement('div');
                    newTimerDiv.className = 'stream-timer';
                    newTimerDiv.style.cssText = 'color: #ffa500; padding: 5px 0; font-size: 14px; font-weight: 500;';
                    newTimerDiv.textContent = countdown;
                    headerDiv.parentNode.insertBefore(newTimerDiv, headerDiv.nextSibling);
                }
            }
        }
    }

    async stopStream(streamId) {
        if (confirm('Bạn có chắc chắn muốn dừng stream này?')) {
            const result = await window.api.stream.stop(streamId);
            if (!result.success) {
                this.showToast(`Lỗi: ${result.error}`, 'error');
            }
        }
    }

    showStreamDetails(streamId) {
        const stream = this.activeStreams.get(streamId);
        if (stream) {
            console.log('Stream details:', stream);
            // TODO: Show detailed modal
        }
    }

    formatUptime(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${secs}s`;
        } else {
            return `${secs}s`;
        }
    }

    // ✅ Real system metrics — called via IPC event from main process
    updateSystemInfoReal(metrics) {
        if (!metrics) return;
        const cpuEl  = document.getElementById('cpu-usage');
        const ramEl  = document.getElementById('ram-usage');
        const upEl   = document.getElementById('upload-speed');
        if (cpuEl) cpuEl.textContent = `${metrics.cpu}%`;
        if (ramEl) ramEl.textContent = `${metrics.memory.used} MB`;
        // Upload speed not available from os module — show active stream count instead
        if (upEl) {
            const count = this.activeStreams.size;
            upEl.textContent = count > 0 ? `${count} luồng` : '—';
        }
    }

    // Keep old stub so nothing crashes if called directly
    updateSystemInfo() {}

    updateStreamStats() {
        // Update total uptime
        let totalUptime = 0;
        this.activeStreams.forEach(stream => {
            if (stream.stats && stream.stats.uptime) {
                totalUptime += stream.stats.uptime;
            }
        });
        
        const hours = Math.floor(totalUptime / 3600);
        document.getElementById('total-uptime').textContent = `${hours}h`;
    }

    showAddStreamModal() {
        const modal = document.getElementById('add-stream-modal');
        if (modal) {
            modal.classList.add('active');
        }
    }

    showQuickStreamDialog() {
        // For quick stream, show modal with preset values
        this.showAddStreamModal();
        // Pre-fill with common settings
        document.querySelector('[name="name"]').value = 'Quick Stream';
        document.querySelector('[name="quality"]').value = '720p';
    }

    closeModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.remove('active');
        });
    }

    updateRTMPUrl(platform) {
        const rtmpInput = document.getElementById('rtmp-url');
        switch(platform) {
            case 'facebook':
                rtmpInput.value = 'rtmps://live-api-s.facebook.com:443/rtmp/';
                rtmpInput.placeholder = 'rtmps://live-api-s.facebook.com:443/rtmp/';
                break;
            case 'youtube':
                rtmpInput.value = 'rtmp://a.rtmp.youtube.com/live2/';
                rtmpInput.placeholder = 'rtmp://a.rtmp.youtube.com/live2/';
                break;
            case 'tiktok':
                rtmpInput.value = '';
                rtmpInput.placeholder = 'URL từ TikTok Studio (VD: rtmp://push.tiktok.com/live)';
                break;
            default:
                rtmpInput.value = '';
                rtmpInput.placeholder = 'rtmp://...';
        }
    }

    updatePlaylistSelect() {
        const playlistSelect = document.getElementById('playlist-select');
        if (!playlistSelect) return;
        
        const playlists = playlistManager.getAllPlaylists();
        
        playlistSelect.innerHTML = '<option value="">-- Chọn playlist --</option>';
        
        playlists.forEach(playlist => {
            const option = document.createElement('option');
            option.value = playlist.id;
            option.textContent = `${playlist.name} (${playlist.videos ? playlist.videos.length : 0} video)`;
            playlistSelect.appendChild(option);
        });
        
        // Pre-select current playlist if exists
        const currentPlaylist = playlistManager.getCurrentPlaylist();
        if (currentPlaylist) {
            playlistSelect.value = currentPlaylist.id;
        }
    }

    async handleStreamFormSubmit(form) {
        const formData = new FormData(form);

        // Get video source
        let videoSource = null;
        const sourceType = formData.get('videoSourceType');

        if (sourceType === 'file') {
            videoSource = formData.get('videoPath');
            if (!videoSource) {
                this.showToast('Vui lòng chọn file video', 'error');
                return;
            }
        } else if (sourceType === 'playlist') {
            // Get selected playlist
            const playlistId = formData.get('playlistId');
            if (!playlistId) {
                this.showToast('Vui lòng chọn playlist', 'error');
                return;
            }
            videoSource = null; // Will be handled by playlist
        }

        const config = {
            name: formData.get('name'),
            platform: formData.get('platform'),
            rtmpUrl: formData.get('rtmpUrl'),
            streamKey: formData.get('streamKey'),
            quality: formData.get('quality'),
            fps: parseInt(formData.get('fps')),
            bitrate: parseInt(formData.get('bitrate')),
            autoRestart: formData.get('autoRestart') === 'on',
            loopVideo:   formData.get('loopVideo')   === 'on',
            videoSource: videoSource,
            // ✅ Overlay / watermark
            overlay: formData.get('overlayEnabled') === 'on' ? {
                enabled: true,
                text:     formData.get('overlayText')     || 'VICdigi Live',
                position: formData.get('overlayPosition') || 'top-left',
                fontSize: parseInt(formData.get('overlayFontSize') || 28),
                color:    formData.get('overlayColor')    || 'white'
            } : { enabled: false }
        };

        // Handle timer settings - IMPROVED with logging
        const timerType = formData.get('timerType');
        console.log('📝 Timer settings from form:', {
            timerType,
            timerHours: formData.get('timerHours'),
            timerMinutes: formData.get('timerMinutes'),
            timerTime: formData.get('timerTime')
        });

        if (timerType === 'duration') {
            const hours = parseInt(formData.get('timerHours') || 0);
            const minutes = parseInt(formData.get('timerMinutes') || 0);
            if (hours > 0 || minutes > 0) {
                config.stopAfterMinutes = hours * 60 + minutes;
                console.log(`⏱️ Timer duration set: ${hours}h ${minutes}m = ${config.stopAfterMinutes} minutes`);
            } else {
                console.log('⚠️ Timer duration selected but no time specified');
            }
        } else if (timerType === 'specific') {
            const timerTime = formData.get('timerTime');
            if (timerTime) {
                config.stopAtTime = timerTime;
                console.log(`⏰ Timer specific time set: ${timerTime}`);
            } else {
                console.log('⚠️ Timer specific selected but no time specified');
            }
        } else {
            console.log('ℹ️ No timer selected (timerType = none or not set)');
        }
        
        // If using playlist, add playlist config
        if (sourceType === 'playlist') {
            const playlistId = formData.get('playlistId');
            const playlistConfig = playlistManager.getPlaylistForStream(playlistId);
            
            if (!playlistConfig) {
                this.showToast('Playlist không hợp lệ', 'error');
                return;
            }
            
            config.playlist = playlistConfig;
        }

        // Log final config before sending
        console.log('🚀 Final stream config:', {
            name: config.name,
            platform: config.platform,
            stopAfterMinutes: config.stopAfterMinutes,
            stopAtTime: config.stopAtTime,
            hasTimer: !!(config.stopAfterMinutes || config.stopAtTime)
        });

        const result = await window.api.stream.start(config);
        if (result.success) {
            console.log(`✅ Stream started successfully with ID: ${result.streamId}`);

            // Reset form BEFORE closing modal
            form.reset();

            // Reset timer radio buttons to 'none'
            const noneRadio = form.querySelector('input[name="timerType"][value="none"]');
            if (noneRadio) {
                noneRadio.checked = true;
            }

            // Hide timer input sections
            const durationInput = document.getElementById('timer-duration-input');
            const specificInput = document.getElementById('timer-specific-input');
            if (durationInput) durationInput.style.display = 'none';
            if (specificInput) specificInput.style.display = 'none';

            this.closeModals();
            this.showToast('Stream đã được thêm thành công', 'success');

            // If timer is set, show notification
            if (config.stopAfterMinutes) {
                const hours = Math.floor(config.stopAfterMinutes / 60);
                const mins = config.stopAfterMinutes % 60;
                const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                this.showToast(`⏱️ Stream "${config.name}" sẽ tự động tắt sau ${timeStr}`, 'info');
            } else if (config.stopAtTime) {
                this.showToast(`⏰ Stream "${config.name}" sẽ tự động tắt lúc ${config.stopAtTime}`, 'info');
            }
        } else {
            console.error('❌ Failed to start stream:', result.error);
            this.showToast(`Lỗi: ${result.error}`, 'error');
        }
    }

    async selectVideoFile() {
        try {
            console.log('Requesting video file selection...');
            const result = await window.api.video.selectFile();
            console.log('Video selection result:', result);
            
            if (result.success) {
                return result.path;
            } else if (result.error) {
                this.showToast(`Lỗi: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Error selecting video:', error);
            this.showToast('Không thể chọn file video', 'error');
        }
        return null;
    }

    async selectVideoFolder() {
        try {
            console.log('Requesting folder selection...');
            const result = await window.api.playlist.selectFolder();
            console.log('Folder selection result:', result);
            
            if (result.success) {
                this.currentPlaylistFolder = result.path;
                const videos = await window.api.playlist.getVideos(result.path);
                if (videos.success) {
                    this.playlistVideos = videos.videos;
                    this.updatePlaylistUI();
                    this.showToast(`Đã tải ${videos.videos.length} video`, 'success');

                    // ✅ Start hot reload if checkbox is checked
                    const hotReloadCheckbox = document.getElementById('hot-reload');
                    if (hotReloadCheckbox && hotReloadCheckbox.checked) {
                        await window.api.playlist.watchFolder(result.path);
                        this.showToast('🔄 Hot reload đang bật — tự nhận video mới', 'info');
                    }
                } else {
                    this.showToast(`Lỗi: ${videos.error}`, 'error');
                }
            } else if (result.error) {
                this.showToast(`Lỗi: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Error selecting folder:', error);
            this.showToast('Không thể chọn thư mục', 'error');
        }
    }

    updatePlaylistUI() {
        const videoList = document.getElementById('video-list');
        if (videoList) {
            if (this.playlistVideos.length === 0) {
                videoList.innerHTML = `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24">
                            <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z"/>
                        </svg>
                        <p>Chưa chọn thư mục video</p>
                    </div>
                `;
            } else {
                videoList.innerHTML = '';
                this.playlistVideos.forEach((video, index) => {
                    const item = document.createElement('div');
                    item.className = 'video-item';
                    item.innerHTML = `
                        <div class="video-thumbnail">
                            <svg viewBox="0 0 24 24">
                                <path d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/>
                            </svg>
                        </div>
                        <div class="video-info">
                            <h4>${video.name}</h4>
                            <div class="video-meta">
                                <span>Kích thước: ${this.formatFileSize(video.size)}</span>
                                <span>Thời lượng: ${video.duration || 'N/A'}</span>
                            </div>
                        </div>
                        <div class="video-actions">
                            <button title="Xóa khỏi playlist">
                                <svg width="16" height="16" viewBox="0 0 24 24">
                                    <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                                </svg>
                            </button>
                        </div>
                    `;
                    videoList.appendChild(item);
                });
            }
        }
        
        // Update playlist count on dashboard
        document.getElementById('playlist-count').textContent = this.playlistVideos.length;
    }

    formatFileSize(bytes) {
        const sizes = ['B', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 B';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }

    loadStreams() {
        console.log('Loading streams page');
        const streamCards = document.getElementById('stream-cards');
        if (!streamCards) return;
        
        if (this.activeStreams.size === 0) {
            streamCards.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24">
                        <path d="M21 3H3c-1.11 0-2 .89-2 2v12c0 1.1.89 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.11-.9-2-2-2zm0 14H3V5h18v12z"/>
                    </svg>
                    <p>Chưa có stream nào đang chạy</p>
                    <button class="btn btn-primary" onclick="document.getElementById('add-stream').click();">Thêm stream</button>
                </div>
            `;
        } else {
            streamCards.innerHTML = '';
            this.activeStreams.forEach(stream => {
                streamCards.appendChild(this.createStreamCard(stream));
            });
        }
    }

    loadPlaylist() {
        console.log('Loading playlist page');
        this.updatePlaylistUI();
    }

    loadSchedules() {
        console.log('Loading schedules page');
        if (typeof scheduleManager !== 'undefined' && scheduleManager.loadSchedules) {
            scheduleManager.loadSchedules();
        }
        this.loadAutoLiveSchedulePanel();
    }

    async loadSettings() {
        console.log('Loading settings');
        const settings = await window.api.settings.getAll();
        
        // Apply settings to form
        if (settings) {
            Object.keys(settings).forEach(key => {
                const input = document.getElementById(key);
                if (input) {
                    if (input.type === 'checkbox') {
                        input.checked = settings[key];
                    } else {
                        input.value = settings[key];
                    }
                }
            });
        }

        await this.loadAutoLiveSettings();
        await this.loadUpdaterSettings();
    }

    async saveSettings() {
        const settings = {
            'start-minimized': document.getElementById('start-minimized').checked,
            'auto-start': document.getElementById('auto-start').checked,
            'show-notifications': document.getElementById('show-notifications').checked,
            'thread-count': document.getElementById('thread-count').value,
            'cpu-limit': document.getElementById('cpu-limit').value,
            'ram-limit': document.getElementById('ram-limit').value
        };

        for (const [key, value] of Object.entries(settings)) {
            await window.api.settings.set(key, value);
        }

        this.showToast('Cài đặt đã được lưu', 'success');
    }

    async loadAutoLiveSettings() {
        if (!window.api.autoLive) return;
        const result = await window.api.autoLive.getSettings();
        if (!result.success) return;

        const s = result.settings || {};
        const set = (id, value) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (el.type === 'checkbox') el.checked = !!value;
            else el.value = value ?? '';
        };

        set('auto-live-enabled', s.enabled);
        set('auto-live-google-url', s.googleScheduleUrl);
        set('auto-live-facebook-url', s.facebookLiveUrl);
        set('auto-live-facebook-page', s.selectedFacebookPageUrl);
        set('auto-live-chrome-path', s.chromePath);
        set('auto-live-chrome-user-data', s.chromeUserDataDir);
        set('auto-live-chrome-profile', s.chromeProfile);
        set('auto-live-default-video', s.defaultVideoPath);
        set('auto-live-quality', s.defaultQuality);
        set('auto-live-bitrate', s.defaultBitrate);
        set('auto-live-poll', s.pollMinutes);
        this.populateFacebookPageSelect(s.scannedFacebookPages || [], s.selectedFacebookPageUrl);
        this.updateSelectedFacebookPageLabel(s.selectedFacebookPageName, s.selectedFacebookPageUrl);
        this.setAutoLiveStatus('Auto Live settings loaded');
    }

    collectAutoLiveSettings() {
        const value = (id) => document.getElementById(id)?.value || '';
        const checked = (id) => !!document.getElementById(id)?.checked;

        return {
            enabled: checked('auto-live-enabled'),
            googleScheduleUrl: value('auto-live-google-url'),
            facebookLiveUrl: value('auto-live-facebook-url') || 'https://www.facebook.com/live/producer',
            selectedFacebookPageUrl: value('auto-live-facebook-page'),
            selectedFacebookPageName: document.getElementById('auto-live-facebook-page')?.selectedOptions?.[0]?.textContent || '',
            chromePath: value('auto-live-chrome-path'),
            chromeUserDataDir: value('auto-live-chrome-user-data'),
            chromeProfile: value('auto-live-chrome-profile') || 'Default',
            defaultVideoPath: value('auto-live-default-video'),
            defaultQuality: value('auto-live-quality') || '720p',
            defaultBitrate: Number(value('auto-live-bitrate')) || 4000,
            pollMinutes: Number(value('auto-live-poll')) || 10
        };
    }

    async saveAutoLiveSettings() {
        const result = await window.api.autoLive.saveSettings(this.collectAutoLiveSettings());
        if (!result.success) {
            this.showToast(result.error || 'Không lưu được Auto Live', 'error');
            return;
        }
        this.showToast('Đã lưu Auto Live', 'success');
        this.setAutoLiveStatus('Saved. Nếu bật Auto Live, lịch sẽ được đồng bộ từ Google Sheet.');
    }

    async previewAutoLiveSheet() {
        const url = document.getElementById('auto-live-google-url')?.value;
        if (!url) {
            this.showToast('Nhập link Google Sheet trước', 'warning');
            return;
        }

        this.setAutoLiveStatus('Đang đọc Google Sheet...');
        const result = await window.api.autoLive.previewGoogle(url);
        if (!result.success) {
            this.showToast(result.error || 'Không đọc được Google Sheet', 'error');
            this.setAutoLiveStatus(result.error || 'Preview failed');
            return;
        }

        const rows = result.rows || [];
        this.autoLiveRows = rows;
        this.renderAutoLiveScheduleList(rows, { mode: 'preview' });
        this.updateDashboard();
        this.setAutoLiveStatus(`Đọc được ${rows.length} dòng hợp lệ. Dòng kế tiếp: ${rows[0]?.title || 'không có'}`);
    }

    async syncAutoLiveSheet() {
        await this.saveAutoLiveSettings();
        this.setAutoLiveStatus('Đang đồng bộ lịch...');
        const result = await window.api.autoLive.sync();
        if (!result.success) {
            this.showToast(result.error || 'Không đồng bộ được lịch', 'error');
            this.setAutoLiveStatus(result.error || 'Sync failed');
            return;
        }

        const count = (result.upcoming || []).length;
        this.autoLiveRows = result.upcoming || [];
        this.renderAutoLiveScheduleList(this.autoLiveRows, { mode: 'sync' });
        this.updateDashboard();
        this.showToast(`Đã đồng bộ ${count} lịch sắp chạy`, 'success');
        this.setAutoLiveStatus(`Đã hẹn ${count} lịch sắp chạy từ Google Sheet.`);
    }

    async loadAutoLiveSchedulePanel() {
        if (!window.api.autoLive) return;
        const settingsResult = await window.api.autoLive.getSettings();
        const settings = settingsResult.settings || {};
        if (!settings.googleScheduleUrl) {
            this.renderAutoLiveScheduleList([], { mode: 'empty', message: 'Chưa cấu hình link Google Sheet trong Cài đặt.' });
            return;
        }

        const result = await window.api.autoLive.previewGoogle(settings.googleScheduleUrl);
        if (!result.success) {
            this.renderAutoLiveScheduleList([], { mode: 'error', message: result.error || 'Không đọc được Google Sheet.' });
            return;
        }

        this.autoLiveRows = result.rows || [];
        this.renderAutoLiveScheduleList(this.autoLiveRows, { mode: 'preview' });
        this.updateDashboard();
    }

    renderAutoLiveScheduleList(rows, options = {}) {
        const list = document.getElementById('auto-live-schedule-list');
        const summary = document.getElementById('auto-live-schedule-summary');
        if (!list) return;

        const now = Date.now();
        const upcoming = rows.filter(row => row.scheduledAt && new Date(row.scheduledAt).getTime() > now);
        if (summary) {
            if (options.mode === 'error' || options.mode === 'empty') summary.textContent = options.message || '';
            else summary.textContent = `Đọc được ${rows.length} dòng hợp lệ, ${upcoming.length} lịch sắp chạy.`;
        }

        if (!rows.length) {
            list.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
                    <p>${this.escapeHtml(options.message || 'Chưa có dòng lịch hợp lệ')}</p>
                </div>
            `;
            return;
        }

        list.innerHTML = rows.map(row => {
            const scheduledAt = row.scheduledAt ? new Date(row.scheduledAt) : null;
            const isUpcoming = scheduledAt && scheduledAt.getTime() > now;
            const timeText = scheduledAt ? scheduledAt.toLocaleString('vi-VN') : 'Chưa có giờ';
            const pageText = row.facebookPageName || row.facebookLiveUrl || 'Page mặc định';
            const videoText = row.videoPath || 'Video mặc định';
            return `
                <div class="auto-live-row ${isUpcoming ? 'upcoming' : 'past'}">
                    <div class="auto-live-row-main">
                        <strong>${this.escapeHtml(row.title || 'Không có tiêu đề')}</strong>
                        <span>${this.escapeHtml(timeText)}</span>
                    </div>
                    <div class="auto-live-row-meta">
                        <span>${this.escapeHtml(pageText)}</span>
                        <span>${this.escapeHtml(videoText)}</span>
                        <span>${row.stopAfterMinutes ? `${row.stopAfterMinutes} phút` : 'Không hẹn tắt'}</span>
                    </div>
                    <span class="auto-live-row-status ${isUpcoming ? 'active' : 'inactive'}">${isUpcoming ? 'Sắp chạy' : 'Đã qua'}</span>
                </div>
            `;
        }).join('');
    }

    async openAutoLiveChromeLogin() {
        await this.saveAutoLiveSettings();
        this.setAutoLiveStatus('Đang mở Chrome. Hãy đăng nhập Facebook nếu cần.');
        const result = await window.api.autoLive.openChromeLogin();
        if (!result.success) {
            this.showToast(result.error || 'Không mở được Chrome', 'error');
            this.setAutoLiveStatus(result.error || 'Open Chrome failed');
            return;
        }
        this.showToast('Đã mở Chrome profile', 'info');
    }

    async scanFacebookPages() {
        await this.saveAutoLiveSettings();
        this.setAutoLiveStatus('Đang quét Facebook Page từ Chrome profile...');
        const result = await window.api.autoLive.scanFacebookPages();
        if (!result.success) {
            this.showToast(result.error || 'Không quét được Page', 'error');
            this.setAutoLiveStatus(result.error || 'Scan page failed');
            return;
        }

        const pages = result.pages || [];
        this.populateFacebookPageSelect(pages, document.getElementById('auto-live-facebook-page')?.value || '');

        this.showToast(`Quét được ${pages.length} page`, pages.length ? 'success' : 'warning');
        this.setAutoLiveStatus(`Quét được ${pages.length} page. Chọn page trong danh sách.`);
    }

    async selectAutoLiveFacebookPage() {
        const select = document.getElementById('auto-live-facebook-page');
        const url = select?.value || '';
        const name = select?.selectedOptions?.[0]?.textContent || '';
        if (!url) return;

        const result = await window.api.autoLive.selectFacebookPage({ name, url });
        if (!result.success) {
            this.showToast(result.error || 'Không lưu được page', 'error');
            return;
        }

        const liveUrl = result.settings?.facebookLiveUrl || `${url.replace(/\/$/, '')}/live/producer`;
        const liveUrlInput = document.getElementById('auto-live-facebook-url');
        if (liveUrlInput) liveUrlInput.value = liveUrl;
        this.updateSelectedFacebookPageLabel(name, url);
        this.showToast(`Đã chọn page: ${name}`, 'success');
    }

    populateFacebookPageSelect(pages, selectedUrl = '') {
        const select = document.getElementById('auto-live-facebook-page');
        if (!select) return;

        const existing = Array.from(select.options)
            .filter(option => option.value)
            .map(option => ({ name: option.textContent, url: option.value }));
        const merged = new Map();
        [...existing, ...(pages || [])].forEach(page => {
            if (page?.url) merged.set(page.url, page);
        });

        select.innerHTML = '<option value="">-- Chọn page mặc định --</option>';
        for (const page of merged.values()) {
            const option = document.createElement('option');
            option.value = page.url;
            option.textContent = page.name || page.url;
            option.selected = page.url === selectedUrl;
            select.appendChild(option);
        }
    }

    updateSelectedFacebookPageLabel(name, url) {
        const label = document.getElementById('auto-live-selected-page');
        if (label) label.textContent = url ? `Đang chọn: ${name || url}` : '';

        const select = document.getElementById('auto-live-facebook-page');
        if (select && url && !Array.from(select.options).some(option => option.value === url)) {
            const option = document.createElement('option');
            option.value = url;
            option.textContent = name || url;
            option.selected = true;
            select.appendChild(option);
        }
    }

    setAutoLiveStatus(message) {
        const el = document.getElementById('auto-live-status');
        if (el) el.textContent = message || '';
    }

    escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    async loadUpdaterSettings() {
        if (!window.api.updater) return;
        const result = await window.api.updater.getSettings();
        if (!result.success) return;

        const s = result.settings || {};
        const set = (id, value) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (el.type === 'checkbox') el.checked = !!value;
            else el.value = value ?? '';
        };

        set('updater-enabled', s.enabled);
        set('updater-url', s.updateUrl);
        set('updater-check-on-start', s.checkOnStart);
        set('updater-auto-download', s.autoDownload);
        if (result.version) {
            const versionText = `v${result.version}`;
            const versionEl = document.getElementById('app-version');
            if (versionEl) versionEl.textContent = versionText;
            document.title = `VICdigi Live Streamer ${versionText}`;
        }
        this.setUpdaterStatus(`Phiên bản hiện tại: ${result.version || ''}`);
    }

    collectUpdaterSettings() {
        return {
            enabled: !!document.getElementById('updater-enabled')?.checked,
            updateUrl: document.getElementById('updater-url')?.value || '',
            checkOnStart: !!document.getElementById('updater-check-on-start')?.checked,
            autoDownload: !!document.getElementById('updater-auto-download')?.checked
        };
    }

    async saveUpdaterSettings() {
        const result = await window.api.updater.saveSettings(this.collectUpdaterSettings());
        if (!result.success) {
            this.showToast(result.error || 'Không lưu được cấu hình update', 'error');
            return;
        }

        this.showToast('Đã lưu cấu hình update', 'success');
        this.setUpdaterStatus('Đã lưu. Upload latest.yml + installer lên Update URL để app tự cập nhật.');
    }

    async checkForUpdates() {
        await this.saveUpdaterSettings();
        this.setUpdaterStatus('Đang kiểm tra cập nhật...');
        const result = await window.api.updater.check();
        if (!result.success) {
            this.showToast(result.error || 'Không kiểm tra được update', 'error');
            this.setUpdaterStatus(result.error || 'Check update failed');
        }
    }

    async downloadUpdate() {
        this.setUpdaterStatus('Đang tải bản cập nhật...');
        const result = await window.api.updater.download();
        if (!result.success) {
            this.showToast(result.error || 'Không tải được update', 'error');
            this.setUpdaterStatus(result.error || 'Download update failed');
        }
    }

    async installUpdate() {
        const result = await window.api.updater.install();
        if (!result.success) {
            this.showToast(result.error || 'Không cài được update', 'error');
        }
    }

    setUpdaterStatus(message) {
        const el = document.getElementById('updater-status');
        if (el) el.textContent = message || '';
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <svg class="icon" viewBox="0 0 24 24">
                ${this.getToastIcon(type)}
            </svg>
            <span>${message}</span>
        `;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    getToastIcon(type) {
        switch(type) {
            case 'success':
                return '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>';
            case 'error':
                return '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>';
            case 'warning':
                return '<path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>';
            default:
                return '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>';
        }
    }

    async showAddScheduleModal(existingSchedule = null) {
        try {
            const isEditing = !!existingSchedule;
            const result = await window.api.stream.getSavedConfigs();
            if (!result.success) {
                this.showToast(result.error || 'Khong tai duoc danh sach stream', 'error');
                return;
            }

            const streams = result.streams || [];
            if (streams.length === 0) {
                this.showToast('Chua co stream da luu. Hay tao va chay stream truoc.', 'warning');
                return;
            }

            const existing = document.getElementById('add-schedule-modal');
            if (existing) existing.remove();

            const escapeHtml = (value) => String(value || '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');

            const modal = document.createElement('div');
            modal.id = 'add-schedule-modal';
            modal.className = 'modal active';
            modal.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h2>${isEditing ? 'Sua lich phat' : 'Tao lich phat'}</h2>
                        <button class="close-modal" type="button">&times;</button>
                    </div>
                    <div class="modal-body">
                        <form id="schedule-form">
                            <div class="form-group">
                                <label>Ten lich</label>
                                <input type="text" name="name" placeholder="Vi du: Live moi ngay 20h" value="${escapeHtml(existingSchedule?.name || '')}" required>
                            </div>
                            <div class="form-group">
                                <label>Stream</label>
                                <select name="streamId" required>
                                    ${streams.map(stream => `
                                        <option value="${escapeHtml(stream.id)}" ${stream.id === existingSchedule?.streamId ? 'selected' : ''}>
                                            ${escapeHtml(stream.name)} - ${escapeHtml(stream.platform)} - ${escapeHtml(stream.quality)}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Gio bat dau</label>
                                    <input type="time" name="time" value="${escapeHtml(existingSchedule?.time || '')}" required>
                                </div>
                                <div class="form-group">
                                    <label>Tu dong tat sau phut</label>
                                    <input type="number" name="duration" min="1" max="1440" value="${escapeHtml(existingSchedule?.duration || '')}" placeholder="Bo trong neu khong tat">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Lap lai</label>
                                <select name="repeatType">
                                    <option value="none" ${!existingSchedule?.repeat ? 'selected' : ''}>Mot lan</option>
                                    <option value="daily" ${existingSchedule?.repeatType === 'daily' ? 'selected' : ''}>Hang ngay</option>
                                </select>
                            </div>
                            <div class="modal-footer">
                                <button type="button" class="btn btn-secondary cancel-modal">Huy</button>
                                <button type="submit" class="btn btn-primary">${isEditing ? 'Cap nhat' : 'Luu lich'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            const close = () => modal.remove();
            modal.querySelector('.close-modal').addEventListener('click', close);
            modal.querySelector('.cancel-modal').addEventListener('click', close);
            modal.addEventListener('click', (event) => {
                if (event.target === modal) close();
            });

            modal.querySelector('#schedule-form').addEventListener('submit', async (event) => {
                event.preventDefault();
                const formData = new FormData(event.target);
                const repeatType = formData.get('repeatType');
                const durationValue = formData.get('duration');
                const config = {
                    name: formData.get('name'),
                    streamId: formData.get('streamId'),
                    time: formData.get('time'),
                    repeat: repeatType !== 'none',
                    repeatType: repeatType === 'none' ? null : repeatType,
                    active: true
                };

                if (durationValue) {
                    config.duration = Number(durationValue);
                }

                const saveResult = isEditing
                    ? await window.api.schedule.update(existingSchedule.id, config)
                    : await window.api.schedule.create(config);

                if (!saveResult.success) {
                    this.showToast(saveResult.error || 'Khong luu duoc lich phat', 'error');
                    return;
                }

                close();
                this.showToast(isEditing ? 'Da cap nhat lich phat' : 'Da tao lich phat', 'success');
                if (typeof scheduleManager !== 'undefined' && scheduleManager.loadSchedules) {
                    await scheduleManager.loadSchedules();
                }
                await this.loadDashboardData();
            });
        } catch (error) {
            this.showToast(error.message || 'Khong tao duoc lich phat', 'error');
        }
    }

    // ✅ Load history page
    async loadHistoryPage() {
        const container = document.getElementById('history-list');
        if (!container) return;
        container.innerHTML = '<p style="padding:1rem;color:var(--text-secondary)">Đang tải...</p>';

        try {
            const result = await window.api.history.getAll(100);
            if (!result.success || result.history.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24"><path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>
                        <p>Chưa có lịch sử stream nào</p>
                    </div>`;
                return;
            }

            container.innerHTML = '';
            result.history.forEach(h => {
                const dur = this._formatDurationSec(h.duration || 0);
                const start = h.startTime ? new Date(h.startTime).toLocaleString('vi-VN') : '—';
                const reasonBadge = h.exitReason === 'error'
                    ? `<span style="color:#f44336;font-size:12px">● Lỗi</span>`
                    : `<span style="color:#4caf50;font-size:12px">● Dừng bình thường</span>`;
                const platformIcon = { facebook: '📘', youtube: '🔴', tiktok: '🎵' }[h.platform] || '📡';

                const row = document.createElement('div');
                row.className = 'history-row';
                row.innerHTML = `
                    <div class="history-icon">${platformIcon}</div>
                    <div class="history-info">
                        <strong>${h.name || 'Stream'}</strong>
                        <span>${h.platform || ''} · ${h.quality || ''}</span>
                    </div>
                    <div class="history-time">
                        <span>${start}</span>
                        <span>⏱ ${dur}</span>
                    </div>
                    <div class="history-status">${reasonBadge}</div>
                    ${h.errorMessage ? `<div class="history-error" title="${h.errorMessage}">⚠️</div>` : '<div></div>'}
                `;
                container.appendChild(row);
            });
        } catch (err) {
            container.innerHTML = `<p style="color:#f44336;padding:1rem">Lỗi tải lịch sử: ${err.message}</p>`;
        }
    }

    async exportHistory() {
        const result = await window.api.history.exportJson();
        if (result.success) {
            this.showToast(`✅ Đã xuất lịch sử: ${result.path}`, 'success');
        } else {
            this.showToast('Huỷ hoặc lỗi khi xuất', 'info');
        }
    }

    async clearHistory() {
        if (!confirm('Xoá toàn bộ lịch sử stream?')) return;
        await window.api.history.clear();
        this.showToast('Đã xoá lịch sử', 'success');
        this.loadHistoryPage();
    }

    async exportConfig() {
        const result = await window.api.config.exportStreams();
        if (result.success) {
            this.showToast(`✅ Đã xuất ${result.count} cấu hình stream (không bao gồm stream key)`, 'success');
        } else {
            this.showToast('Huỷ hoặc lỗi khi xuất', 'info');
        }
    }

    async importConfig() {
        const result = await window.api.config.importStreams();
        if (!result.success) {
            this.showToast('Huỷ hoặc file không hợp lệ', 'info');
            return;
        }
        // Show imported streams — user still needs to fill stream keys
        this.showToast(`✅ Nhập ${result.streams.length} cấu hình. Vui lòng điền stream key cho mỗi luồng.`, 'success');
        console.log('Imported stream configs:', result.streams);
    }

    _formatDurationSec(sec) {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = sec % 60;
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m ${s}s`;
        return `${s}s`;
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.app = new App();
});

// Handle window visibility for navigation
window.showPage = (pageId) => {
    if (window.app) {
        window.app.showPage(pageId);
    }
};

