// Schedule Manager for renderer process
class ScheduleManager {
    constructor() {
        this.schedules = [];
        this.initializeEventHandlers();
    }

    initializeEventHandlers() {
        // Add schedule button handler is in app.js
    }

    async loadSchedules() {
        try {
            const result = await window.api.schedule.getAll();
            if (result.success) {
                this.schedules = result.schedules;
                this.updateUI();
                return this.schedules;
            }
        } catch (error) {
            console.error('Failed to load schedules:', error);
        }
        return [];
    }

    async createSchedule(config) {
        try {
            // Validate schedule configuration
            if (!this.validateSchedule(config)) {
                throw new Error('Cấu hình lịch phát không hợp lệ');
            }

            const result = await window.api.schedule.create(config);
            if (result.success) {
                await this.loadSchedules();
                return result.scheduleId;
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            console.error('Failed to create schedule:', error);
            throw error;
        }
    }

    async deleteSchedule(scheduleId) {
        try {
            if (!confirm('Bạn có chắc chắn muốn xóa lịch phát này?')) {
                return false;
            }

            const result = await window.api.schedule.delete(scheduleId);
            if (result.success) {
                await this.loadSchedules();
                return true;
            }
            return false;
        } catch (error) {
            console.error('Failed to delete schedule:', error);
            return false;
        }
    }

    validateSchedule(config) {
        // Check required fields
        if (!config.name || !config.streamId || !config.time) {
            return false;
        }

        // Validate time format
        const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
        if (!timeRegex.test(config.time)) {
            return false;
        }

        // Validate repeat options
        if (config.repeat) {
            const validRepeatTypes = ['daily', 'weekly', 'custom'];
            if (!validRepeatTypes.includes(config.repeatType)) {
                return false;
            }

            if (config.repeatType === 'weekly' && (!config.repeatDays || config.repeatDays.length === 0)) {
                return false;
            }
        }

        // Validate duration
        if (config.duration && (config.duration < 1 || config.duration > 1440)) {
            return false;
        }

        return true;
    }

    updateUI() {
        const schedulesList = document.getElementById('schedules-list');
        if (!schedulesList) return;

        if (this.schedules.length === 0) {
            schedulesList.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24">
                        <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
                    </svg>
                    <p>Chưa có lịch phát nào</p>
                    <button class="btn btn-primary" onclick="scheduleManager.showAddScheduleModal()">Tạo lịch phát</button>
                </div>
            `;
        } else {
            schedulesList.innerHTML = '';
            this.schedules.forEach(schedule => {
                const item = this.createScheduleElement(schedule);
                schedulesList.appendChild(item);
            });
        }

        // Update schedule count on dashboard
        const scheduledStreams = document.getElementById('scheduled-streams');
        if (scheduledStreams) {
            scheduledStreams.textContent = this.schedules.length;
        }
    }

    createScheduleElement(schedule) {
        const item = document.createElement('div');
        item.className = 'schedule-item';
        item.dataset.scheduleId = schedule.id;

        const isActive = this.isScheduleActive(schedule);
        const nextRun = this.getNextRunTime(schedule);

        item.innerHTML = `
            <div class="schedule-icon">
                <svg viewBox="0 0 24 24">
                    <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
                </svg>
            </div>
            <div class="schedule-info">
                <h3>${schedule.name}</h3>
                <div class="schedule-details">
                    <div class="schedule-detail">
                        <svg viewBox="0 0 24 24">
                            <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>
                        </svg>
                        <span>${schedule.time}</span>
                    </div>
                    <div class="schedule-detail">
                        <svg viewBox="0 0 24 24">
                            <path d="M9 11H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2zm2-7h-1V2h-2v2H8V2H6v2H5c-1.11 0-1.99.9-1.99 2L3 20c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V9h14v11z"/>
                        </svg>
                        <span>${this.getRepeatText(schedule)}</span>
                    </div>
                    ${schedule.duration ? `
                        <div class="schedule-detail">
                            <svg viewBox="0 0 24 24">
                                <path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42C16.07 4.74 14.12 4 12 4c-4.97 0-9 4.03-9 9s4.02 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
                            </svg>
                            <span>${schedule.duration} phút</span>
                        </div>
                    ` : ''}
                </div>
                <span class="schedule-status ${isActive ? 'active' : 'inactive'}">
                    ${isActive ? 'Đang hoạt động' : 'Không hoạt động'}
                </span>
                ${nextRun ? `<small>Lần chạy tiếp theo: ${nextRun}</small>` : ''}
            </div>
            <div class="schedule-actions">
                <button class="btn btn-secondary" onclick="scheduleManager.editSchedule('${schedule.id}')" title="Chỉnh sửa">
                    <svg class="icon" viewBox="0 0 24 24">
                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                    </svg>
                </button>
                <button class="btn btn-secondary" onclick="scheduleManager.toggleSchedule('${schedule.id}')" title="${isActive ? 'Tắt' : 'Bật'}">
                    <svg class="icon" viewBox="0 0 24 24">
                        ${isActive ? 
                            '<path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>' :
                            '<path d="M8 5v14l11-7z"/>'}
                    </svg>
                </button>
                <button class="btn btn-danger" onclick="scheduleManager.deleteSchedule('${schedule.id}')" title="Xóa">
                    <svg class="icon" viewBox="0 0 24 24">
                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                    </svg>
                </button>
            </div>
        `;

        return item;
    }

    isScheduleActive(schedule) {
        return schedule.active !== false && schedule.active !== 0;
    }

    getRepeatText(schedule) {
        if (!schedule.repeat) {
            return 'Một lần';
        }

        switch (schedule.repeatType) {
            case 'daily':
                return 'Hàng ngày';
            case 'weekly':
                if (schedule.repeatDays && schedule.repeatDays.length > 0) {
                    const days = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
                    const selectedDays = schedule.repeatDays.map(d => days[d]).join(', ');
                    return `Hàng tuần (${selectedDays})`;
                }
                return 'Hàng tuần';
            case 'custom':
                return `Mỗi ${schedule.repeatInterval} ${schedule.repeatUnit}`;
            default:
                return 'Không xác định';
        }
    }

    getNextRunTime(schedule) {
        if (!this.isScheduleActive(schedule)) {
            return null;
        }

        const now = new Date();
        const [hours, minutes] = schedule.time.split(':').map(Number);
        
        let nextRun = new Date();
        nextRun.setHours(hours, minutes, 0, 0);

        // If time has passed today, move to next occurrence
        if (nextRun <= now) {
            if (!schedule.repeat) {
                return null; // One-time schedule that has passed
            }

            switch (schedule.repeatType) {
                case 'daily':
                    nextRun.setDate(nextRun.getDate() + 1);
                    break;
                case 'weekly':
                    // Find next day in repeatDays
                    if (schedule.repeatDays && schedule.repeatDays.length > 0) {
                        let daysToAdd = 1;
                        let currentDay = nextRun.getDay();
                        
                        for (let i = 1; i <= 7; i++) {
                            const checkDay = (currentDay + i) % 7;
                            if (schedule.repeatDays.includes(checkDay)) {
                                daysToAdd = i;
                                break;
                            }
                        }
                        
                        nextRun.setDate(nextRun.getDate() + daysToAdd);
                    } else {
                        nextRun.setDate(nextRun.getDate() + 7);
                    }
                    break;
            }
        }

        return this.formatDateTime(nextRun);
    }

    formatDateTime(date) {
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);

        let dateStr = '';
        if (date.toDateString() === now.toDateString()) {
            dateStr = 'Hôm nay';
        } else if (date.toDateString() === tomorrow.toDateString()) {
            dateStr = 'Ngày mai';
        } else {
            dateStr = date.toLocaleDateString('vi-VN');
        }

        const timeStr = date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
        return `${dateStr} lúc ${timeStr}`;
    }

    async toggleSchedule(scheduleId) {
        const schedule = this.schedules.find(s => s.id === scheduleId);
        if (schedule) {
            try {
                const result = await window.api.schedule.toggle(scheduleId);
                if (!result.success) {
                    throw new Error(result.error || 'Failed to toggle schedule');
                }

                schedule.active = result.active;
                await this.loadSchedules();

                if (window.app) {
                    const status = schedule.active ? 'đã bật' : 'đã tắt';
                    window.app.showToast(`Lịch phát "${schedule.name}" ${status}`, 'info');
                }
            } catch (error) {
                if (window.app) {
                    window.app.showToast(error.message || 'Không cập nhật được lịch phát', 'error');
                }
            }
        }
    }

    editSchedule(scheduleId) {
        const schedule = this.schedules.find(s => s.id === scheduleId);
        if (schedule && window.app) window.app.showAddScheduleModal(schedule);
    }

    showAddScheduleModal() {
        if (window.app) window.app.showAddScheduleModal();
    }

    // Convert schedule to cron expression for node-schedule
    toCronExpression(schedule) {
        const [hours, minutes] = schedule.time.split(':').map(Number);
        
        if (!schedule.repeat) {
            // One-time schedule
            return null;
        }

        switch (schedule.repeatType) {
            case 'daily':
                return `${minutes} ${hours} * * *`;
                
            case 'weekly':
                if (schedule.repeatDays && schedule.repeatDays.length > 0) {
                    const days = schedule.repeatDays.join(',');
                    return `${minutes} ${hours} * * ${days}`;
                }
                return `${minutes} ${hours} * * 0`; // Default to Sunday
                
            default:
                return null;
        }
    }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ScheduleManager;
}

// Initialize when loaded
const scheduleManager = new ScheduleManager();
window.scheduleManager = scheduleManager;

// Load schedules on startup
document.addEventListener('DOMContentLoaded', () => {
    scheduleManager.loadSchedules();
});

