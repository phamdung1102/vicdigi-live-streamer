// Enhanced Playlist Manager with multiple playlists support
class PlaylistManager {
    constructor() {
        this.playlists = new Map(); // Store multiple playlists
        this.currentPlaylistId = null;
        this.currentIndex = 0;
        this.playbackMode = 'sequential';
        this.skipErrors = true;
        this.hotReload = false;
        this.watchInterval = null;
        
        this.initializeEventHandlers();
        this.loadSavedPlaylists();
    }

    initializeEventHandlers() {
        // Playback mode selector
        const playbackModeSelect = document.getElementById('playback-mode');
        if (playbackModeSelect) {
            playbackModeSelect.addEventListener('change', (e) => {
                this.playbackMode = e.target.value;
                this.saveSettings();
            });
        }

        // Auto skip error checkbox
        const autoSkipError = document.getElementById('auto-skip-error');
        if (autoSkipError) {
            autoSkipError.addEventListener('change', (e) => {
                this.skipErrors = e.target.checked;
                this.saveSettings();
            });
        }

        // Hot reload checkbox
        const hotReloadCheckbox = document.getElementById('hot-reload');
        if (hotReloadCheckbox) {
            hotReloadCheckbox.addEventListener('change', (e) => {
                this.hotReload = e.target.checked;
                if (this.hotReload) {
                    this.startWatching();
                } else {
                    this.stopWatching();
                }
                this.saveSettings();
            });
        }
    }

    // Create a new playlist
    async createPlaylist(name, folderPath) {
        const playlistId = `playlist_${Date.now()}`;
        
        try {
            // Load videos from folder
            const result = await window.api.playlist.getVideos(folderPath);
            if (!result.success) {
                throw new Error(result.error || 'Failed to load videos');
            }

            const playlist = {
                id: playlistId,
                name: name,
                folderPath: folderPath,
                videos: result.videos,
                mode: this.playbackMode,
                skipErrors: this.skipErrors,
                hotReload: this.hotReload,
                createdAt: new Date().toISOString()
            };

            this.playlists.set(playlistId, playlist);
            await this.savePlaylists();
            
            return playlistId;
        } catch (error) {
            console.error('Failed to create playlist:', error);
            throw error;
        }
    }

    // Delete a playlist
    async deletePlaylist(playlistId) {
        if (this.playlists.has(playlistId)) {
            this.playlists.delete(playlistId);
            
            // If this was the current playlist, clear it
            if (this.currentPlaylistId === playlistId) {
                this.currentPlaylistId = null;
                this.currentIndex = 0;
            }
            
            await this.savePlaylists();
            return true;
        }
        return false;
    }

    // Rename a playlist
    async renamePlaylist(playlistId, newName) {
        const playlist = this.playlists.get(playlistId);
        if (playlist) {
            playlist.name = newName;
            await this.savePlaylists();
            return true;
        }
        return false;
    }

    // Set current active playlist
    setCurrentPlaylist(playlistId) {
        if (this.playlists.has(playlistId)) {
            this.currentPlaylistId = playlistId;
            this.currentIndex = 0;
            return true;
        }
        return false;
    }

    // Get current playlist
    getCurrentPlaylist() {
        if (this.currentPlaylistId) {
            return this.playlists.get(this.currentPlaylistId);
        }
        return null;
    }

    // Get all playlists
    getAllPlaylists() {
        return Array.from(this.playlists.values());
    }

    // Refresh videos in a playlist
    async refreshPlaylist(playlistId) {
        const playlist = this.playlists.get(playlistId);
        if (!playlist) return false;

        try {
            const result = await window.api.playlist.getVideos(playlist.folderPath);
            if (result.success) {
                playlist.videos = result.videos;
                await this.savePlaylists();
                this.updateUI();
                return true;
            }
        } catch (error) {
            console.error('Failed to refresh playlist:', error);
        }
        return false;
    }

    // Get next video from current playlist
    getNextVideo() {
        const playlist = this.getCurrentPlaylist();
        if (!playlist || playlist.videos.length === 0) return null;

        let nextIndex;
        
        switch (playlist.mode || this.playbackMode) {
            case 'random':
                nextIndex = Math.floor(Math.random() * playlist.videos.length);
                break;
                
            case 'loop':
                nextIndex = this.currentIndex;
                break;
                
            case 'sequential':
            default:
                nextIndex = (this.currentIndex + 1) % playlist.videos.length;
                break;
        }

        this.currentIndex = nextIndex;
        return playlist.videos[nextIndex];
    }

    // Save playlists to storage
    async savePlaylists() {
        const playlistsData = Array.from(this.playlists.entries()).map(([id, playlist]) => ({
            ...playlist,
            id
        }));
        
        await window.api.settings.set('playlists', playlistsData);
        await window.api.settings.set('currentPlaylistId', this.currentPlaylistId);
    }

    // Load saved playlists
    async loadSavedPlaylists() {
        const savedPlaylists = await window.api.settings.get('playlists');
        const currentId = await window.api.settings.get('currentPlaylistId');
        
        if (savedPlaylists && Array.isArray(savedPlaylists)) {
            savedPlaylists.forEach(playlist => {
                this.playlists.set(playlist.id, playlist);
            });
        }
        
        if (currentId && this.playlists.has(currentId)) {
            this.currentPlaylistId = currentId;
        }
        
        this.updateUI();
    }

    // Update UI to show all playlists
    updateUI() {
        const container = document.getElementById('playlists-container');
        if (!container) {
            // Create main playlist UI if it doesn't exist
            this.createPlaylistUI();
            return;
        }

        const playlists = this.getAllPlaylists();
        
        if (playlists.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24">
                        <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z"/>
                    </svg>
                    <p>Chưa có playlist nào</p>
                    <button class="btn btn-primary" onclick="playlistManager.showCreatePlaylistDialog()">Tạo playlist đầu tiên</button>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="playlists-grid">
                    ${playlists.map(playlist => this.createPlaylistCard(playlist)).join('')}
                </div>
            `;
            
            // Add event listeners to playlist cards
            this.attachPlaylistCardEvents();
        }
        
        // Update video list if a playlist is selected
        if (this.currentPlaylistId) {
            this.updateVideoList();
        }
    }

    // Create playlist card HTML
    createPlaylistCard(playlist) {
        const isActive = this.currentPlaylistId === playlist.id;
        const videoCount = playlist.videos ? playlist.videos.length : 0;
        
        return `
            <div class="playlist-card ${isActive ? 'active' : ''}" data-playlist-id="${playlist.id}">
                <div class="playlist-header">
                    <h3>${playlist.name}</h3>
                    <div class="playlist-actions">
                        <button class="btn-icon" onclick="playlistManager.refreshPlaylist('${playlist.id}')" title="Làm mới">
                            <svg width="16" height="16" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>
                            </svg>
                        </button>
                        <button class="btn-icon" onclick="playlistManager.editPlaylist('${playlist.id}')" title="Sửa">
                            <svg width="16" height="16" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                            </svg>
                        </button>
                        <button class="btn-icon" onclick="playlistManager.deletePlaylist('${playlist.id}')" title="Xóa">
                            <svg width="16" height="16" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="playlist-info">
                    <p>${videoCount} video</p>
                    <p class="playlist-path">${playlist.folderPath}</p>
                </div>
                <div class="playlist-footer">
                    <button class="btn ${isActive ? 'btn-secondary' : 'btn-primary'}" 
                            onclick="playlistManager.selectPlaylist('${playlist.id}')">
                        ${isActive ? 'Đang chọn' : 'Chọn playlist'}
                    </button>
                </div>
            </div>
        `;
    }

    // Show create playlist dialog
    showCreatePlaylistDialog() {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        modal.id = 'create-playlist-modal';
        
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Tạo Playlist Mới</h2>
                    <button class="close-modal" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>Tên playlist</label>
                        <input type="text" id="new-playlist-name" placeholder="VD: Playlist Sáng" required>
                    </div>
                    <div class="form-group">
                        <label>Thư mục video</label>
                        <div class="input-group">
                            <input type="text" id="new-playlist-path" placeholder="Chọn thư mục chứa video..." readonly>
                            <button class="btn btn-secondary" onclick="playlistManager.browseForPlaylistFolder()">Chọn thư mục</button>
                        </div>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Hủy</button>
                    <button class="btn btn-primary" onclick="playlistManager.confirmCreatePlaylist()">Tạo playlist</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }

    // Browse for playlist folder
    async browseForPlaylistFolder() {
        try {
            const result = await window.api.playlist.selectFolder();
            if (result && result.success) {
                const pathInput = document.getElementById('new-playlist-path');
                if (pathInput) {
                    pathInput.value = result.path;
                }
            }
        } catch (error) {
            console.error('Error selecting folder:', error);
            // If error, show message
            if (window.app) {
                window.app.showToast('Lỗi khi chọn thư mục', 'error');
            }
        }
    }

    // Confirm create playlist
    async confirmCreatePlaylist() {
        const nameInput = document.getElementById('new-playlist-name');
        const pathInput = document.getElementById('new-playlist-path');
        
        if (!nameInput.value || !pathInput.value) {
            if (window.app) {
                window.app.showToast('Vui lòng nhập tên và chọn thư mục', 'error');
            }
            return;
        }
        
        try {
            const playlistId = await this.createPlaylist(nameInput.value, pathInput.value);
            
            // Close modal
            const modal = document.getElementById('create-playlist-modal');
            if (modal) modal.remove();
            
            // Update UI
            this.updateUI();
            
            if (window.app) {
                window.app.showToast(`Đã tạo playlist "${nameInput.value}"`, 'success');
            }
        } catch (error) {
            if (window.app) {
                window.app.showToast(`Lỗi: ${error.message}`, 'error');
            }
        }
    }

    // Select a playlist
    selectPlaylist(playlistId) {
        this.setCurrentPlaylist(playlistId);
        this.updateUI();
        
        if (window.app) {
            const playlist = this.playlists.get(playlistId);
            if (playlist) {
                window.app.showToast(`Đã chọn playlist: ${playlist.name}`, 'success');
            }
        }
    }

    // Edit playlist (rename)
    async editPlaylist(playlistId) {
        const playlist = this.playlists.get(playlistId);
        if (!playlist) return;
        
        const newName = prompt('Nhập tên mới cho playlist:', playlist.name);
        if (newName && newName !== playlist.name) {
            await this.renamePlaylist(playlistId, newName);
            this.updateUI();
            
            if (window.app) {
                window.app.showToast(`Đã đổi tên playlist thành "${newName}"`, 'success');
            }
        }
    }

    // Attach event listeners to playlist cards
    attachPlaylistCardEvents() {
        // Cards are already handled with onclick attributes
    }

    // Create the main playlist UI structure
    createPlaylistUI() {
        const playlistSection = document.getElementById('playlist');
        if (!playlistSection) return;
        
        // Update the playlist section HTML
        const currentHTML = playlistSection.innerHTML;
        const headerEnd = currentHTML.indexOf('</header>') + 9;
        const header = currentHTML.substring(0, headerEnd);
        
        playlistSection.innerHTML = header + `
            <div class="playlist-container">
                <div class="playlist-toolbar">
                    <h3>Playlists của bạn</h3>
                    <button class="btn btn-primary" onclick="playlistManager.showCreatePlaylistDialog()">
                        <svg class="icon" viewBox="0 0 24 24">
                            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                        </svg>
                        Tạo playlist
                    </button>
                </div>
                <div id="playlists-container"></div>
                
                <div class="playlist-settings">
                    <div class="setting-card">
                        <h3>Cài đặt phát</h3>
                        <div class="form-group">
                            <label>Chế độ phát</label>
                            <select id="playback-mode">
                                <option value="sequential">Tuần tự</option>
                                <option value="random">Ngẫu nhiên</option>
                                <option value="loop">Lặp lại</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="auto-skip-error" checked>
                                Tự động bỏ qua file lỗi
                            </label>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="hot-reload">
                                Tự động nhận video mới
                            </label>
                        </div>
                    </div>
                </div>

                <div class="video-list-container">
                    <h3>Video trong playlist đang chọn</h3>
                    <div id="video-list" class="video-list">
                        <div class="empty-state">
                            <p>Chọn một playlist để xem danh sách video</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Re-initialize event handlers
        this.initializeEventHandlers();
        
        // Update UI
        this.updateUI();
    }

    // Update video list for current playlist
    updateVideoList() {
        const videoList = document.getElementById('video-list');
        if (!videoList) return;
        
        const playlist = this.getCurrentPlaylist();
        if (!playlist || !playlist.videos || playlist.videos.length === 0) {
            videoList.innerHTML = `
                <div class="empty-state">
                    <p>${playlist ? 'Playlist không có video' : 'Chọn một playlist để xem danh sách video'}</p>
                </div>
            `;
            return;
        }
        
        videoList.innerHTML = '';
        playlist.videos.forEach((video, index) => {
            const item = this.createVideoElement(video, index);
            videoList.appendChild(item);
        });
    }

    // Create video element (reuse existing method)
    createVideoElement(video, index) {
        const item = document.createElement('div');
        item.className = 'video-item';
        if (index === this.currentIndex) {
            item.classList.add('current');
        }

        item.innerHTML = `
            <div class="video-number">${index + 1}</div>
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
                    <span>Định dạng: ${video.extension || 'N/A'}</span>
                </div>
            </div>
        `;

        return item;
    }

    formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Get playlist for stream configuration
    getPlaylistForStream(playlistId = null) {
        const playlist = playlistId ? this.playlists.get(playlistId) : this.getCurrentPlaylist();

        if (!playlist || !playlist.videos) return null;

        // Create a clean copy for each stream (avoid shared state)
        // ✅ Read playback-mode selector at call time so it reflects current UI state
        const uiMode = document.getElementById('playback-mode')?.value || this.playbackMode;
        const playlistConfig = {
            videos: playlist.videos.map(v => v.path || v), // support both {path} objects and raw strings
            mode: uiMode,
            currentIndex: 0, // Always start from beginning for each stream
            skipErrors: playlist.skipErrors !== false,
            _playlistId: playlist.id,
            _playlistName: playlist.name
        };

        console.log(`📋 Created playlist config for stream:`, {
            name: playlist.name,
            videos: playlistConfig.videos.length,
            mode: playlistConfig.mode,
            startIndex: playlistConfig.currentIndex
        });

        return playlistConfig;
    }

    async saveSettings() {
        const settings = {
            playbackMode: this.playbackMode,
            skipErrors: this.skipErrors,
            hotReload: this.hotReload
        };

        await window.api.settings.set('playlistSettings', settings);
    }

    async loadSettings() {
        const settings = await window.api.settings.get('playlistSettings');
        if (settings) {
            this.playbackMode = settings.playbackMode || 'sequential';
            this.skipErrors = settings.skipErrors !== false;
            this.hotReload = settings.hotReload || false;

            // Update UI elements
            const playbackModeSelect = document.getElementById('playback-mode');
            if (playbackModeSelect) playbackModeSelect.value = this.playbackMode;

            const autoSkipError = document.getElementById('auto-skip-error');
            if (autoSkipError) autoSkipError.checked = this.skipErrors;

            const hotReloadCheckbox = document.getElementById('hot-reload');
            if (hotReloadCheckbox) hotReloadCheckbox.checked = this.hotReload;
        }
    }

    // Watching methods (reuse existing)
    startWatching() {
        // Implementation remains the same
    }

    stopWatching() {
        if (this.watchInterval) {
            clearInterval(this.watchInterval);
            this.watchInterval = null;
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PlaylistManager;
}

// Initialize when loaded
const playlistManager = new PlaylistManager();

// Load settings on startup
document.addEventListener('DOMContentLoaded', () => {
    playlistManager.loadSettings();
    playlistManager.createPlaylistUI();
});