const fs = require('fs').promises;
const path = require('path');

let safeStorage = null;
let electronApp = null;
try {
    const electron = require('electron');
    safeStorage = electron.safeStorage;
    electronApp = electron.app;
} catch (_) {
    safeStorage = null;
    electronApp = null;
}

/**
 * Simple JSON-based database service
 * Replaces SQLite3 to avoid native module issues
 */
class DatabaseService {
    constructor() {
        const dataDir = electronApp && electronApp.isPackaged
            ? electronApp.getPath('userData')
            : path.join(process.cwd(), 'config');

        this.dbPath = path.join(dataDir, 'database.json');
        this.data = {
            streams: {},
            schedules: {},
            playlists: {},
            streamHistory: [],
            settings: {}
        };
    }

    async initialize() {
        try {
            // Ensure config directory exists
            const configDir = path.dirname(this.dbPath);
            await fs.mkdir(configDir, { recursive: true });

            // Load existing data or create new
            try {
                const content = await fs.readFile(this.dbPath, 'utf8');
                this.data = JSON.parse(content);
                if (await this.migrateSensitiveData()) {
                    await this.save();
                }
                console.log('? Database loaded from file');
            } catch (err) {
                // File doesn't exist, create it
                await this.save();
                console.log('? New database created');
            }

        } catch (error) {
            console.error('Database initialization failed:', error);
            throw error;
        }
    }

    async save() {
        try {
            await fs.writeFile(this.dbPath, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('Failed to save database:', error);
        }
    }

    async migrateSensitiveData() {
        let changed = false;

        for (const stream of Object.values(this.data.streams || {})) {
            if (stream.streamKey && !stream.streamKeyProtected) {
                stream.streamKeyProtected = this.protectSecret(stream.streamKey);
                delete stream.streamKey;
                changed = true;
            }
        }

        return changed;
    }

    protectSecret(value) {
        const text = String(value || '');
        if (!text) return null;

        if (safeStorage && safeStorage.isEncryptionAvailable()) {
            return {
                scheme: 'electron-safe-storage',
                value: safeStorage.encryptString(text).toString('base64')
            };
        }

        return {
            scheme: 'base64',
            value: Buffer.from(text, 'utf8').toString('base64')
        };
    }

    unprotectSecret(payload) {
        if (!payload) return '';

        try {
            if (payload.scheme === 'electron-safe-storage' && safeStorage && safeStorage.isEncryptionAvailable()) {
                return safeStorage.decryptString(Buffer.from(payload.value, 'base64'));
            }

            if (payload.scheme === 'base64') {
                return Buffer.from(payload.value, 'base64').toString('utf8');
            }
        } catch (error) {
            console.error('Failed to decrypt stored stream key:', error);
        }

        return '';
    }

    protectStreamConfig(config) {
        const protectedConfig = { ...config };
        if (protectedConfig.streamKey) {
            protectedConfig.streamKeyProtected = this.protectSecret(protectedConfig.streamKey);
            delete protectedConfig.streamKey;
        }
        return protectedConfig;
    }

    unprotectStreamConfig(config) {
        if (!config) return null;
        const unprotectedConfig = { ...config };
        if (!unprotectedConfig.streamKey && unprotectedConfig.streamKeyProtected) {
            unprotectedConfig.streamKey = this.unprotectSecret(unprotectedConfig.streamKeyProtected);
        }
        return unprotectedConfig;
    }

    // Stream methods
    async saveStream(streamId, config) {
        this.data.streams[streamId] = {
            id: streamId,
            ...this.protectStreamConfig(config),
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        await this.save();
        return { id: streamId };
    }

    async getStream(streamId) {
        return this.unprotectStreamConfig(this.data.streams[streamId]);
    }

    async getAllStreams() {
        return Object.values(this.data.streams).map(stream => this.unprotectStreamConfig(stream));
    }

    async updateStreamStatus(streamId, status) {
        if (this.data.streams[streamId]) {
            this.data.streams[streamId].status = status;
            this.data.streams[streamId].updatedAt = new Date().toISOString();
            await this.save();
        }
        return { changes: 1 };
    }

    async deleteStream(streamId) {
        delete this.data.streams[streamId];
        await this.save();
        return { changes: 1 };
    }

    // Schedule methods
    async saveSchedule(schedule) {
        const scheduleId = `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        this.data.schedules[scheduleId] = {
            id: scheduleId,
            ...schedule,
            active: schedule.active !== false && schedule.active !== 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        await this.save();
        return scheduleId;
    }

    async getSchedule(scheduleId) {
        return this.data.schedules[scheduleId] || null;
    }

    async getAllSchedules() {
        return Object.values(this.data.schedules);
    }

    async updateSchedule(scheduleId, updates) {
        if (this.data.schedules[scheduleId]) {
            this.data.schedules[scheduleId] = {
                ...this.data.schedules[scheduleId],
                ...updates,
                updatedAt: new Date().toISOString()
            };
            await this.save();
        }
        return { changes: 1 };
    }

    async deleteSchedule(scheduleId) {
        delete this.data.schedules[scheduleId];
        await this.save();
        return { changes: 1 };
    }

    // Playlist methods
    async savePlaylist(playlist) {
        const playlistId = `playlist_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        this.data.playlists[playlistId] = {
            id: playlistId,
            ...playlist,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        await this.save();
        return playlistId;
    }

    async getPlaylist(playlistId) {
        return this.data.playlists[playlistId] || null;
    }

    async getAllPlaylists() {
        return Object.values(this.data.playlists);
    }

    // Stream history methods
    async saveStreamHistory(streamId, history) {
        this.data.streamHistory.push({
            streamId,
            ...history,
            timestamp: new Date().toISOString()
        });
        
        // Keep only last 1000 entries
        if (this.data.streamHistory.length > 1000) {
            this.data.streamHistory = this.data.streamHistory.slice(-1000);
        }
        
        await this.save();
        return { id: this.data.streamHistory.length };
    }

    async getStreamHistory(streamId, limit = 10) {
        return this.data.streamHistory
            .filter(h => h.streamId === streamId)
            .slice(-limit)
            .reverse();
    }

    // Settings methods
    async saveSetting(key, value) {
        this.data.settings[key] = {
            value,
            updatedAt: new Date().toISOString()
        };
        await this.save();
        return { changes: 1 };
    }

    async getSetting(key) {
        const setting = this.data.settings[key];
        return setting ? setting.value : null;
    }

    async getAllSettings() {
        const result = {};
        for (const [key, setting] of Object.entries(this.data.settings)) {
            result[key] = setting.value;
        }
        return result;
    }

    // Close database connection (compatibility method)
    async close() {
        // Save any pending changes
        await this.save();
        console.log('Database saved and closed');
        return Promise.resolve();
    }

    // Compatibility methods for SQLite-like interface
    async run(sql, params = []) {
        console.warn('SQL query not supported in JSON database:', sql);
        return { changes: 0 };
    }

    async get(sql, params = []) {
        console.warn('SQL query not supported in JSON database:', sql);
        return null;
    }

    async all(sql, params = []) {
        console.warn('SQL query not supported in JSON database:', sql);
        return [];
    }

    // Create tables (no-op for JSON database)
    async createTables() {
        console.log('? Database structure ready (JSON mode)');
        return Promise.resolve();
    }
}

module.exports = { DatabaseService };
