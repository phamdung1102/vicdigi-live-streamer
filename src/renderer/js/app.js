// Main App Controller
class App {
    constructor() {
        this.currentPage = 'dashboard';
        this.activeStreams = new Map();
        this.schedules = [];
        this.playlistVideos = [];
        this.init();
    }

    async init() {
        console.log('ðŸš€ VICdigi Live Streamer initializing...');
        
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
        
        console.log('âœ… App initialized successfully');
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

        // âœ… Overlay toggle â€” show/hide overlay options when checkbox changes
        document.addEventListener('change', (e) => {
            if (e.target && e.target.name === 'overlayEnabled') {
                const opts = document.getElementById('overlay-options');
                if (opts) opts.style.display = e.target.checked ? 'block' : 'none';
            }
        });

        // âœ… Hot reload toggle
        const hotReloadCheckbox = document.getElementById('hot-reload');
        if (hotReloadCheckbox) {
            hotReloadCheckbox.addEventListener('change', async (e) => {
                if (e.target.checked && this.currentPlaylistFolder) {
                    await window.api.playlist.watchFolder(this.currentPlaylistFolder);
                    this.showToast('ðŸ”„ Hot reload báº­t â€” tá»± nháº­n video má»›i', 'success');
                } else {
                    await window.api.playlist.unwatchFolder();
                    this.showToast('Hot reload Ä‘Ã£ táº¯t', 'info');
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
        // âœ… Real system metrics pushed from main process every 2s
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
            this.showToast(`Stream "${streamInfo.name}" Ä‘Ã£ báº¯t Ä‘áº§u`, 'success');
        });

        // Stream stopped
        window.api.stream.onStopped((data) => {
            console.log('Stream stopped:', data);
            this.activeStreams.delete(data.streamId);
            this.updateDashboard();
            this.showToast('Stream Ä‘Ã£ dá»«ng', 'info');
        });

        // Stream error
        window.api.stream.onError((data) => {
            console.error('Stream error:', data);
            this.showToast(`Lá»—i stream: ${data.error}`, 'error');
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
                this.showToast(`âš ï¸ Stream health is low: ${data.health}%`, 'warning');
            }
        });

        // Stream restarting
        window.api.stream.onRestarting && window.api.stream.onRestarting((data) => {
            this.showToast(`ðŸ”„ Restarting stream (attempt ${data.attempt})...`, 'info');
        });

        // âœ… Next video in playlist
        if (window.api.stream.onNextVideo) {
            window.api.stream.onNextVideo((data) => {
                const { streamId, videoName, playlistMode, playlistIndex } = data;
                this.showToast(`â–¶ï¸ [${playlistMode}] â†’ ${videoName}`, 'info');
                // Update card title if visible
                const card = document.querySelector(`[data-stream-id="${streamId}"]`);
                if (card) {
                    const nowPlaying = card.querySelector('.now-playing');
                    if (nowPlaying) {
                        nowPlaying.textContent = `â–¶ï¸ ${videoName}`;
                    } else {
                        const info = card.querySelector('.stream-info');
                        if (info) {
                            const div = document.createElement('div');
                            div.className = 'now-playing';
                            div.style.cssText = 'font-size:12px;color:var(--accent-primary);margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
                            div.textContent = `â–¶ï¸ ${videoName}`;
                            info.appendChild(div);
                        }
                    }
                }
            });
        }

        // âœ… Stream preview thumbnail
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

        // âœ… Hot reload â€” folder changed event
        if (window.api.playlist && window.api.playlist.onFolderChanged) {
            window.api.playlist.onFolderChanged((data) => {
                const prevCount = this.playlistVideos.length;
                this.playlistVideos = data.videos || [];
                this.updatePlaylistUI();
                const diff = this.playlistVideos.length - prevCount;
                if (diff > 0) {
                    this.showToast(`ðŸ”„ Playlist tá»± Ä‘á»™ng cáº­p nháº­t: +${diff} video má»›i`, 'success');
                } else if (diff < 0) {
                    this.showToast(`ðŸ”„ Playlist cáº­p nháº­t: ${Math.abs(diff)} video Ä‘Ã£ xÃ³a`, 'info');
                } else {
                    this.showToast('ðŸ”„ Playlist Ä‘Ã£ cáº­p nháº­t', 'info');
                }
            });
        }

        if (window.api.autoLive) {
            window.api.autoLive.onStatus((data) => {
                const title = data?.row?.title ? `: ${data.row.title}` : '';
                this.setAutoLiveStatus(`Auto Live ${data.status}${title}`);
            });
            window.api.autoLive.onStarted((data) => {
                this.showToast(`Auto Live Ä‘Ã£ start: ${data?.row?.title || data.streamId}`, 'success');
            });
            window.api.autoLive.onError((data) => {
                this.showToast(`Auto Live lá»—i: ${data.error}`, 'error');
                this.setAutoLiveStatus(`Auto Live lá»—i: ${data.error}`);
            });
            window.api.autoLive.onReloaded((data) => {
                this.setAutoLiveStatus(`Auto Live Ä‘Ã£ Ä‘á»c ${data.total} dÃ²ng, háº¹n ${data.scheduled} lá»‹ch.`);
            });
        }

        if (window.api.updater) {
            window.api.updater.onStatus((data) => {
                const status = data.status;
                const state = data.state || {};
                if (status === 'available') {
                    this.showToast(`CÃ³ báº£n má»›i ${state.version || ''}`, 'info');
                    this.setUpdaterStatus(`CÃ³ báº£n má»›i ${state.version || ''}. Báº¥m táº£i báº£n má»›i.`);
                } else if (status === 'download-progress') {
                    const pct = Math.round(data.progress?.percent || 0);
                    this.setUpdaterStatus(`Äang táº£i update: ${pct}%`);
                } else if (status === 'downloaded') {
                    this.showToast('ÄÃ£ táº£i xong báº£n cáº­p nháº­t', 'success');
                    this.setUpdaterStatus('ÄÃ£ táº£i xong. Báº¥m CÃ i vÃ  khá»Ÿi Ä‘á»™ng láº¡i.');
                } else if (status === 'not-available') {
                    this.setUpdaterStatus('Äang dÃ¹ng phiÃªn báº£n má»›i nháº¥t.');
                } else if (status === 'error') {
                    this.setUpdaterStatus(`Lá»—i update: ${state.error || data.error}`);
                } else {
                    this.setUpdaterStatus(`Update: ${status}`);
                }
            });
        }
    }

    updateDashboard() {
        // Update stats
        document.getElementById('active-streams').textContent = this.activeStreams.size;
        document.getElementById('scheduled-streams').textContent = this.schedules.length;
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
                        <p>KhÃ´ng cÃ³ luá»“ng nÃ o Ä‘ang phÃ¡t</p>
                        <button class="btn btn-primary" onclick="app.showPage('streams')">Báº¯t Ä‘áº§u stream</button>
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
            timerInfo = `â±ï¸ Tá»± táº¯t sau: ${hours > 0 ? hours + 'h ' : ''}${minutes}m`;
        } else if (config.stopAtTime) {
            timerInfo = `â° Tá»± táº¯t lÃºc: ${config.stopAtTime}`;
        }
        
        card.innerHTML = `
            <div class="stream-preview">
                <div class="no-preview">
                    <svg viewBox="0 0 24 24">
                        <path d="M21 3H3c-1.11 0-2 .89-2 2v12c0 1.1.89 2 2 2h5v2h8v-2h5c1.1 0 1.99-.9 1.99-2L23 5c0-1.11-.9-2-2-2zm0 14H3V5h18v12z"/>
                    </svg>
                    <p>Preview khÃ´ng kháº£ dá»¥ng</p>
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
                        Dá»«ng
                    </button>
                    <button class="btn btn-secondary" onclick="window.app.showStreamDetails('${stream.id || stream.streamId}')">
                        <svg class="icon" viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
                        </svg>
                        Chi tiáº¿t
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
                    timerDiv.textContent = 'â±ï¸ Äang dá»«ng stream...';
                    timerDiv.style.color = '#f44336';
                }
                return;
            }
            
            const countdown = `â±ï¸ CÃ²n láº¡i: ${remaining.formatted}`;
            
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
        if (confirm('Báº¡n cÃ³ cháº¯c cháº¯n muá»‘n dá»«ng stream nÃ y?')) {
            const result = await window.api.stream.stop(streamId);
            if (!result.success) {
                this.showToast(`Lá»—i: ${result.error}`, 'error');
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

    // âœ… Real system metrics â€” called via IPC event from main process
    updateSystemInfoReal(metrics) {
        if (!metrics) return;
        const cpuEl  = document.getElementById('cpu-usage');
        const ramEl  = document.getElementById('ram-usage');
        const upEl   = document.getElementById('upload-speed');
        if (cpuEl) cpuEl.textContent = `${metrics.cpu}%`;
        if (ramEl) ramEl.textContent = `${metrics.memory.used} MB`;
        // Upload speed not available from os module â€” show active stream count instead
        if (upEl) {
            const count = this.activeStreams.size;
            upEl.textContent = count > 0 ? `${count} luá»“ng` : 'â€”';
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
                rtmpInput.placeholder = 'URL tá»« TikTok Studio (VD: rtmp://push.tiktok.com/live)';
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
        
        playlistSelect.innerHTML = '<option value="">-- Chá»n playlist --</option>';
        
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
                this.showToast('Vui lÃ²ng chá»n file video', 'error');
                return;
            }
        } else if (sourceType === 'playlist') {
            // Get selected playlist
            const playlistId = formData.get('playlistId');
            if (!playlistId) {
                this.showToast('Vui lÃ²ng chá»n playlist', 'error');
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
            // âœ… Overlay / watermark
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
        console.log('ðŸ“ Timer settings from form:', {
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
                console.log(`â±ï¸ Timer duration set: ${hours}h ${minutes}m = ${config.stopAfterMinutes} minutes`);
            } else {
                console.log('âš ï¸ Timer duration selected but no time specified');
            }
        } else if (timerType === 'specific') {
            const timerTime = formData.get('timerTime');
            if (timerTime) {
                config.stopAtTime = timerTime;
                console.log(`â° Timer specific time set: ${timerTime}`);
            } else {
                console.log('âš ï¸ Timer specific selected but no time specified');
            }
        } else {
            console.log('â„¹ï¸ No timer selected (timerType = none or not set)');
        }
        
        // If using playlist, add playlist config
        if (sourceType === 'playlist') {
            const playlistId = formData.get('playlistId');
            const playlistConfig = playlistManager.getPlaylistForStream(playlistId);
            
            if (!playlistConfig) {
                this.showToast('Playlist khÃ´ng há»£p lá»‡', 'error');
                return;
            }
            
            config.playlist = playlistConfig;
        }

        // Log final config before sending
        console.log('ðŸš€ Final stream config:', {
            name: config.name,
            platform: config.platform,
            stopAfterMinutes: config.stopAfterMinutes,
            stopAtTime: config.stopAtTime,
            hasTimer: !!(config.stopAfterMinutes || config.stopAtTime)
        });

        const result = await window.api.stream.start(config);
        if (result.success) {
            console.log(`âœ… Stream started successfully with ID: ${result.streamId}`);

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
            this.showToast('Stream Ä‘Ã£ Ä‘Æ°á»£c thÃªm thÃ nh cÃ´ng', 'success');

            // If timer is set, show notification
            if (config.stopAfterMinutes) {
                const hours = Math.floor(config.stopAfterMinutes / 60);
                const mins = config.stopAfterMinutes % 60;
                const timeStr = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                this.showToast(`â±ï¸ Stream "${config.name}" sáº½ tá»± Ä‘á»™ng táº¯t sau ${timeStr}`, 'info');
            } else if (config.stopAtTime) {
                this.showToast(`â° Stream "${config.name}" sáº½ tá»± Ä‘á»™ng táº¯t lÃºc ${config.stopAtTime}`, 'info');
            }
        } else {
            console.error('âŒ Failed to start stream:', result.error);
            this.showToast(`Lá»—i: ${result.error}`, 'error');
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
                this.showToast(`Lá»—i: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Error selecting video:', error);
            this.showToast('KhÃ´ng thá»ƒ chá»n file video', 'error');
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
                    this.showToast(`ÄÃ£ táº£i ${videos.videos.length} video`, 'success');

                    // âœ… Start hot reload if checkbox is checked
                    const hotReloadCheckbox = document.getElementById('hot-reload');
                    if (hotReloadCheckbox && hotReloadCheckbox.checked) {
                        await window.api.playlist.watchFolder(result.path);
                        this.showToast('ðŸ”„ Hot reload Ä‘ang báº­t â€” tá»± nháº­n video má»›i', 'info');
                    }
                } else {
                    this.showToast(`Lá»—i: ${videos.error}`, 'error');
                }
            } else if (result.error) {
                this.showToast(`Lá»—i: ${result.error}`, 'error');
            }
        } catch (error) {
            console.error('Error selecting folder:', error);
            this.showToast('KhÃ´ng thá»ƒ chá»n thÆ° má»¥c', 'error');
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
                        <p>ChÆ°a chá»n thÆ° má»¥c video</p>
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
                                <span>KÃ­ch thÆ°á»›c: ${this.formatFileSize(video.size)}</span>
                                <span>Thá»i lÆ°á»£ng: ${video.duration || 'N/A'}</span>
                            </div>
                        </div>
                        <div class="video-actions">
                            <button title="XÃ³a khá»i playlist">
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
                    <p>ChÆ°a cÃ³ stream nÃ o Ä‘ang cháº¡y</p>
                    <button class="btn btn-primary" onclick="document.getElementById('add-stream').click();">ThÃªm stream</button>
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

        this.showToast('CÃ i Ä‘áº·t Ä‘Ã£ Ä‘Æ°á»£c lÆ°u', 'success');
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
            this.showToast(result.error || 'KhÃ´ng lÆ°u Ä‘Æ°á»£c Auto Live', 'error');
            return;
        }
        this.showToast('ÄÃ£ lÆ°u Auto Live', 'success');
        this.setAutoLiveStatus('Saved. Náº¿u báº­t Auto Live, lá»‹ch sáº½ Ä‘Æ°á»£c Ä‘á»“ng bá»™ tá»« Google Sheet.');
    }

    async previewAutoLiveSheet() {
        const url = document.getElementById('auto-live-google-url')?.value;
        if (!url) {
            this.showToast('Nháº­p link Google Sheet trÆ°á»›c', 'warning');
            return;
        }

        this.setAutoLiveStatus('Äang Ä‘á»c Google Sheet...');
        const result = await window.api.autoLive.previewGoogle(url);
        if (!result.success) {
            this.showToast(result.error || 'KhÃ´ng Ä‘á»c Ä‘Æ°á»£c Google Sheet', 'error');
            this.setAutoLiveStatus(result.error || 'Preview failed');
            return;
        }

        const rows = result.rows || [];
        this.setAutoLiveStatus(`Äá»c Ä‘Æ°á»£c ${rows.length} dÃ²ng há»£p lá»‡. DÃ²ng káº¿ tiáº¿p: ${rows[0]?.title || 'khÃ´ng cÃ³'}`);
    }

    async syncAutoLiveSheet() {
        await this.saveAutoLiveSettings();
        this.setAutoLiveStatus('Äang Ä‘á»“ng bá»™ lá»‹ch...');
        const result = await window.api.autoLive.sync();
        if (!result.success) {
            this.showToast(result.error || 'KhÃ´ng Ä‘á»“ng bá»™ Ä‘Æ°á»£c lá»‹ch', 'error');
            this.setAutoLiveStatus(result.error || 'Sync failed');
            return;
        }

        const count = (result.upcoming || []).length;
        this.showToast(`ÄÃ£ Ä‘á»“ng bá»™ ${count} lá»‹ch sáº¯p cháº¡y`, 'success');
        this.setAutoLiveStatus(`ÄÃ£ háº¹n ${count} lá»‹ch sáº¯p cháº¡y tá»« Google Sheet.`);
    }

    async openAutoLiveChromeLogin() {
        await this.saveAutoLiveSettings();
        this.setAutoLiveStatus('Äang má»Ÿ Chrome. HÃ£y Ä‘Äƒng nháº­p Facebook náº¿u cáº§n.');
        const result = await window.api.autoLive.openChromeLogin();
        if (!result.success) {
            this.showToast(result.error || 'KhÃ´ng má»Ÿ Ä‘Æ°á»£c Chrome', 'error');
            this.setAutoLiveStatus(result.error || 'Open Chrome failed');
            return;
        }
        this.showToast('ÄÃ£ má»Ÿ Chrome profile', 'info');
    }

    async scanFacebookPages() {
        await this.saveAutoLiveSettings();
        this.setAutoLiveStatus('Äang quÃ©t Facebook Page tá»« Chrome profile...');
        const result = await window.api.autoLive.scanFacebookPages();
        if (!result.success) {
            this.showToast(result.error || 'KhÃ´ng quÃ©t Ä‘Æ°á»£c Page', 'error');
            this.setAutoLiveStatus(result.error || 'Scan page failed');
            return;
        }

        const pages = result.pages || [];
        const select = document.getElementById('auto-live-facebook-page');
        if (select) {
            select.innerHTML = '<option value="">-- Chá»n page --</option>';
            pages.forEach(page => {
                const option = document.createElement('option');
                option.value = page.url;
                option.textContent = page.name;
                select.appendChild(option);
            });
        }

        this.showToast(`QuÃ©t Ä‘Æ°á»£c ${pages.length} page`, pages.length ? 'success' : 'warning');
        this.setAutoLiveStatus(`QuÃ©t Ä‘Æ°á»£c ${pages.length} page. Chá»n page trong danh sÃ¡ch.`);
    }

    async selectAutoLiveFacebookPage() {
        const select = document.getElementById('auto-live-facebook-page');
        const url = select?.value || '';
        const name = select?.selectedOptions?.[0]?.textContent || '';
        if (!url) return;

        const result = await window.api.autoLive.selectFacebookPage({ name, url });
        if (!result.success) {
            this.showToast(result.error || 'KhÃ´ng lÆ°u Ä‘Æ°á»£c page', 'error');
            return;
        }

        const liveUrl = result.settings?.facebookLiveUrl || `${url.replace(/\/$/, '')}/live/producer`;
        const liveUrlInput = document.getElementById('auto-live-facebook-url');
        if (liveUrlInput) liveUrlInput.value = liveUrl;
        this.updateSelectedFacebookPageLabel(name, url);
        this.showToast(`ÄÃ£ chá»n page: ${name}`, 'success');
    }

    updateSelectedFacebookPageLabel(name, url) {
        const label = document.getElementById('auto-live-selected-page');
        if (label) label.textContent = url ? `Äang chá»n: ${name || url}` : '';

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
        this.setUpdaterStatus(`PhiÃªn báº£n hiá»‡n táº¡i: ${result.version || ''}`);
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
            this.showToast(result.error || 'KhÃ´ng lÆ°u Ä‘Æ°á»£c cáº¥u hÃ¬nh update', 'error');
            return;
        }

        this.showToast('ÄÃ£ lÆ°u cáº¥u hÃ¬nh update', 'success');
        this.setUpdaterStatus('ÄÃ£ lÆ°u. Upload latest.yml + installer lÃªn Update URL Ä‘á»ƒ app tá»± cáº­p nháº­t.');
    }

    async checkForUpdates() {
        await this.saveUpdaterSettings();
        this.setUpdaterStatus('Äang kiá»ƒm tra cáº­p nháº­t...');
        const result = await window.api.updater.check();
        if (!result.success) {
            this.showToast(result.error || 'KhÃ´ng kiá»ƒm tra Ä‘Æ°á»£c update', 'error');
            this.setUpdaterStatus(result.error || 'Check update failed');
        }
    }

    async downloadUpdate() {
        this.setUpdaterStatus('Äang táº£i báº£n cáº­p nháº­t...');
        const result = await window.api.updater.download();
        if (!result.success) {
            this.showToast(result.error || 'KhÃ´ng táº£i Ä‘Æ°á»£c update', 'error');
            this.setUpdaterStatus(result.error || 'Download update failed');
        }
    }

    async installUpdate() {
        const result = await window.api.updater.install();
        if (!result.success) {
            this.showToast(result.error || 'KhÃ´ng cÃ i Ä‘Æ°á»£c update', 'error');
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

    // âœ… Load history page
    async loadHistoryPage() {
        const container = document.getElementById('history-list');
        if (!container) return;
        container.innerHTML = '<p style="padding:1rem;color:var(--text-secondary)">Äang táº£i...</p>';

        try {
            const result = await window.api.history.getAll(100);
            if (!result.success || result.history.length === 0) {
                container.innerHTML = `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24"><path d="M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0 0 13 21a9 9 0 0 0 0-18zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>
                        <p>ChÆ°a cÃ³ lá»‹ch sá»­ stream nÃ o</p>
                    </div>`;
                return;
            }

            container.innerHTML = '';
            result.history.forEach(h => {
                const dur = this._formatDurationSec(h.duration || 0);
                const start = h.startTime ? new Date(h.startTime).toLocaleString('vi-VN') : 'â€”';
                const reasonBadge = h.exitReason === 'error'
                    ? `<span style="color:#f44336;font-size:12px">â— Lá»—i</span>`
                    : `<span style="color:#4caf50;font-size:12px">â— Dá»«ng bÃ¬nh thÆ°á»ng</span>`;
                const platformIcon = { facebook: 'ðŸ“˜', youtube: 'ðŸ”´', tiktok: 'ðŸŽµ' }[h.platform] || 'ðŸ“¡';

                const row = document.createElement('div');
                row.className = 'history-row';
                row.innerHTML = `
                    <div class="history-icon">${platformIcon}</div>
                    <div class="history-info">
                        <strong>${h.name || 'Stream'}</strong>
                        <span>${h.platform || ''} Â· ${h.quality || ''}</span>
                    </div>
                    <div class="history-time">
                        <span>${start}</span>
                        <span>â± ${dur}</span>
                    </div>
                    <div class="history-status">${reasonBadge}</div>
                    ${h.errorMessage ? `<div class="history-error" title="${h.errorMessage}">âš ï¸</div>` : '<div></div>'}
                `;
                container.appendChild(row);
            });
        } catch (err) {
            container.innerHTML = `<p style="color:#f44336;padding:1rem">Lá»—i táº£i lá»‹ch sá»­: ${err.message}</p>`;
        }
    }

    async exportHistory() {
        const result = await window.api.history.exportJson();
        if (result.success) {
            this.showToast(`âœ… ÄÃ£ xuáº¥t lá»‹ch sá»­: ${result.path}`, 'success');
        } else {
            this.showToast('Huá»· hoáº·c lá»—i khi xuáº¥t', 'info');
        }
    }

    async clearHistory() {
        if (!confirm('XoÃ¡ toÃ n bá»™ lá»‹ch sá»­ stream?')) return;
        await window.api.history.clear();
        this.showToast('ÄÃ£ xoÃ¡ lá»‹ch sá»­', 'success');
        this.loadHistoryPage();
    }

    async exportConfig() {
        const result = await window.api.config.exportStreams();
        if (result.success) {
            this.showToast(`âœ… ÄÃ£ xuáº¥t ${result.count} cáº¥u hÃ¬nh stream (khÃ´ng bao gá»“m stream key)`, 'success');
        } else {
            this.showToast('Huá»· hoáº·c lá»—i khi xuáº¥t', 'info');
        }
    }

    async importConfig() {
        const result = await window.api.config.importStreams();
        if (!result.success) {
            this.showToast('Huá»· hoáº·c file khÃ´ng há»£p lá»‡', 'info');
            return;
        }
        // Show imported streams â€” user still needs to fill stream keys
        this.showToast(`âœ… Nháº­p ${result.streams.length} cáº¥u hÃ¬nh. Vui lÃ²ng Ä‘iá»n stream key cho má»—i luá»“ng.`, 'success');
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

