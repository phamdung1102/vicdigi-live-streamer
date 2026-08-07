// UI Controller - Handles UI updates and animations
class UIController {
    constructor() {
        this.init();
    }

    init() {
        this.initializeAnimations();
        this.initializeTooltips();
        this.initializeModals();
        this.initializeDragAndDrop();
        this.initializeKeyboardShortcuts();
    }

    initializeAnimations() {
        // Add smooth transitions to all interactive elements
        document.querySelectorAll('button, .nav-item, .stat-card, .stream-card').forEach(element => {
            element.addEventListener('mouseenter', (e) => {
                e.target.style.transform = 'scale(1.02)';
            });
            
            element.addEventListener('mouseleave', (e) => {
                e.target.style.transform = 'scale(1)';
            });
        });

        // Animate stats values changes
        this.animateValue = (element, start, end, duration) => {
            const range = end - start;
            const increment = range / (duration / 10);
            let current = start;
            
            const timer = setInterval(() => {
                current += increment;
                if ((increment > 0 && current >= end) || (increment < 0 && current <= end)) {
                    element.textContent = end;
                    clearInterval(timer);
                } else {
                    element.textContent = Math.round(current);
                }
            }, 10);
        };
    }

    initializeTooltips() {
        // Create tooltip element
        const tooltip = document.createElement('div');
        tooltip.className = 'tooltip';
        tooltip.style.cssText = `
            position: absolute;
            background: var(--bg-tertiary);
            color: var(--text-primary);
            padding: 0.5rem 0.75rem;
            border-radius: 6px;
            font-size: 0.75rem;
            pointer-events: none;
            z-index: 9999;
            opacity: 0;
            transition: opacity 0.2s;
            box-shadow: var(--shadow-md);
        `;
        document.body.appendChild(tooltip);

        // Add tooltip to elements with title attribute
        document.querySelectorAll('[title]').forEach(element => {
            const titleText = element.getAttribute('title');
            element.removeAttribute('title');
            
            element.addEventListener('mouseenter', (e) => {
                tooltip.textContent = titleText;
                tooltip.style.opacity = '1';
                
                const rect = e.target.getBoundingClientRect();
                tooltip.style.left = rect.left + rect.width / 2 - tooltip.offsetWidth / 2 + 'px';
                tooltip.style.top = rect.bottom + 8 + 'px';
            });
            
            element.addEventListener('mouseleave', () => {
                tooltip.style.opacity = '0';
            });
        });
    }

    initializeModals() {
        // Close modals when clicking outside
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });

        // ESC key to close modals
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal.active').forEach(modal => {
                    modal.classList.remove('active');
                });
            }
        });
    }

    initializeDragAndDrop() {
        // Video drag and drop for playlist
        const videoList = document.getElementById('video-list');
        if (videoList) {
            videoList.addEventListener('dragover', (e) => {
                e.preventDefault();
                videoList.classList.add('drag-over');
            });

            videoList.addEventListener('dragleave', () => {
                videoList.classList.remove('drag-over');
            });

            videoList.addEventListener('drop', (e) => {
                e.preventDefault();
                videoList.classList.remove('drag-over');
                
                const files = Array.from(e.dataTransfer.files);
                const videoFiles = files.filter(file => {
                    const ext = file.name.split('.').pop().toLowerCase();
                    return ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm'].includes(ext);
                });

                if (videoFiles.length > 0) {
                    // TODO: Add videos to playlist
                    console.log('Dropped video files:', videoFiles);
                    if (window.app) {
                        window.app.showToast(`Đã thêm ${videoFiles.length} video`, 'success');
                    }
                }
            });
        }
    }

    initializeKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + N: New stream
            if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
                e.preventDefault();
                document.getElementById('add-stream')?.click();
            }
            
            // Ctrl/Cmd + O: Open folder
            if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
                e.preventDefault();
                document.getElementById('select-folder')?.click();
            }
            
            // Ctrl/Cmd + S: Save settings
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                document.getElementById('save-settings')?.click();
            }
            
            // F5: Refresh
            if (e.key === 'F5') {
                e.preventDefault();
                location.reload();
            }
            
            // Ctrl/Cmd + 1-5: Switch pages
            if (e.ctrlKey || e.metaKey) {
                const pageNumbers = {
                    '1': 'dashboard',
                    '2': 'streams',
                    '3': 'playlist',
                    '4': 'schedule',
                    '5': 'settings'
                };
                
                if (pageNumbers[e.key]) {
                    e.preventDefault();
                    if (window.app) {
                        window.app.showPage(pageNumbers[e.key]);
                    }
                }
            }
        });
    }

    // Update stream card with animation
    updateStreamCard(streamId, data) {
        const card = document.querySelector(`[data-stream-id="${streamId}"]`);
        if (!card) return;

        // Animate stat changes
        Object.keys(data).forEach(key => {
            const element = card.querySelector(`[data-stat="${key}"]`);
            if (element) {
                const currentValue = parseInt(element.textContent) || 0;
                const newValue = data[key];
                
                if (currentValue !== newValue) {
                    this.animateValue(element, currentValue, newValue, 500);
                }
            }
        });

        // Flash card on update
        card.style.animation = 'flash 0.5s';
        setTimeout(() => {
            card.style.animation = '';
        }, 500);
    }

    // Show loading overlay
    showLoading(message = 'Đang xử lý...') {
        const overlay = document.createElement('div');
        overlay.className = 'loading-overlay';
        overlay.innerHTML = `
            <div class="loading-content">
                <div class="spinner"></div>
                <p>${message}</p>
            </div>
        `;
        
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        `;
        
        document.body.appendChild(overlay);
        return overlay;
    }

    hideLoading(overlay) {
        if (overlay && overlay.parentNode) {
            overlay.remove();
        }
    }

    // Create confirmation dialog
    async confirm(message, title = 'Xác nhận') {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'modal active';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 400px;">
                    <div class="modal-header">
                        <h2>${title}</h2>
                    </div>
                    <div class="modal-body">
                        <p>${message}</p>
                    </div>
                    <div class="modal-footer" style="display: flex; justify-content: flex-end; gap: 1rem; padding: 1rem;">
                        <button class="btn btn-secondary" onclick="this.closest('.modal').remove(); window.confirmResult = false;">Hủy</button>
                        <button class="btn btn-primary" onclick="this.closest('.modal').remove(); window.confirmResult = true;">Xác nhận</button>
                    </div>
                </div>
            `;
            
            document.body.appendChild(modal);
            
            // Wait for user action
            const checkInterval = setInterval(() => {
                if (window.confirmResult !== undefined) {
                    clearInterval(checkInterval);
                    const result = window.confirmResult;
                    delete window.confirmResult;
                    resolve(result);
                }
            }, 100);
        });
    }

    // Create custom alert dialog
    alert(message, title = 'Thông báo', type = 'info') {
        const modal = document.createElement('div');
        modal.className = 'modal active';
        
        const iconMap = {
            'success': '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>',
            'error': '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>',
            'warning': '<path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>',
            'info': '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>'
        };
        
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h2 style="display: flex; align-items: center; gap: 0.5rem;">
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--accent-${type === 'error' ? 'danger' : type === 'warning' ? 'warning' : type === 'success' ? 'success' : 'primary'})">
                            ${iconMap[type]}
                        </svg>
                        ${title}
                    </h2>
                    <button class="close-modal" onclick="this.closest('.modal').remove()">&times;</button>
                </div>
                <div class="modal-body">
                    <p>${message}</p>
                </div>
                <div class="modal-footer" style="display: flex; justify-content: flex-end; padding: 1rem;">
                    <button class="btn btn-primary" onclick="this.closest('.modal').remove()">OK</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
    }

    // Format time duration
    formatDuration(seconds) {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        
        const parts = [];
        if (hours > 0) parts.push(`${hours}h`);
        if (minutes > 0) parts.push(`${minutes}m`);
        if (secs > 0 || parts.length === 0) parts.push(`${secs}s`);
        
        return parts.join(' ');
    }

    // Format file size
    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Format bitrate
    formatBitrate(bps) {
        if (bps < 1000) return bps + ' bps';
        if (bps < 1000000) return (bps / 1000).toFixed(1) + ' Kbps';
        return (bps / 1000000).toFixed(1) + ' Mbps';
    }

    // Update system tray icon
    updateTrayIcon(status) {
        // This would communicate with main process to update tray
        // For now, just log
        console.log('Tray status:', status);
    }
}

// Add CSS for animations
const style = document.createElement('style');
style.textContent = `
    @keyframes flash {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
    }
    
    @keyframes slideOut {
        to {
            transform: translateX(100%);
            opacity: 0;
        }
    }
    
    .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid var(--bg-tertiary);
        border-top: 4px solid var(--accent-primary);
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 1rem;
    }
    
    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }
    
    .drag-over {
        background: var(--bg-hover) !important;
        border: 2px dashed var(--accent-primary) !important;
    }
    
    .video-item.current {
        background: var(--bg-tertiary);
        border-left: 3px solid var(--accent-primary);
    }
    
    .video-number {
        width: 30px;
        text-align: center;
        color: var(--text-tertiary);
        font-size: 0.875rem;
    }
`;
document.head.appendChild(style);

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = UIController;
}

// Initialize when loaded
const uiController = new UIController();