const schedule = require('node-schedule');

class ScheduleService {
    constructor(streamManager, database) {
        this.streamManager = streamManager;
        this.database = database;
        this.activeJobs = new Map();
    }

    async loadSchedules() {
        try {
            const schedules = await this.database.getAllSchedules();
            
            for (const scheduleConfig of schedules) {
                if (scheduleConfig.active) {
                    this.createJob(scheduleConfig);
                }
            }
            
            console.log(`✅ Loaded ${schedules.length} schedules`);
        } catch (error) {
            console.error('Failed to load schedules:', error);
        }
    }

    async createSchedule(config) {
        try {
            // Save to database
            const scheduleId = await this.database.saveSchedule(config);
            
            // Create job if active
            if (config.active !== false) {
                config.id = scheduleId;
                this.createJob(config);
            }
            
            return scheduleId;
        } catch (error) {
            console.error('Failed to create schedule:', error);
            throw error;
        }
    }

    createJob(scheduleConfig) {
        if (!scheduleConfig.id) {
            throw new Error('Schedule id is required');
        }

        this.cancelJob(scheduleConfig.id);

        const cronExpression = this.toCronExpression(scheduleConfig);
        
        if (!cronExpression) {
            // One-time schedule
            const scheduleTime = this.parseTime(scheduleConfig.time);
            
            if (scheduleTime > new Date()) {
                const job = schedule.scheduleJob(scheduleTime, async () => {
                    await this.executeSchedule(scheduleConfig);
                });
                
                this.activeJobs.set(scheduleConfig.id, job);
            }
        } else {
            // Recurring schedule
            const job = schedule.scheduleJob(cronExpression, async () => {
                await this.executeSchedule(scheduleConfig);
            });
            
            this.activeJobs.set(scheduleConfig.id, job);
        }
        
        console.log(`📅 Schedule created: ${scheduleConfig.name}`);
    }

    async executeSchedule(scheduleConfig) {
        console.log(`⏰ Executing schedule: ${scheduleConfig.name}`);
        
        try {
            // Get stream configuration
            const sourceStreamId = scheduleConfig.streamId || scheduleConfig.stream_id;
            const streamConfig = await this.database.getStream(sourceStreamId);
            
            if (!streamConfig) {
                console.error(`Stream not found for schedule: ${sourceStreamId}`);
                return;
            }
            
            // Start the stream
            const streamId = await this.streamManager.startStream(streamConfig);
            
            // Set auto-stop timer if duration is specified
            if (scheduleConfig.duration) {
                setTimeout(async () => {
                    await this.streamManager.stopStream(streamId);
                    console.log(`⏹️ Stream stopped after ${scheduleConfig.duration} minutes`);
                }, scheduleConfig.duration * 60 * 1000);
            }
            
        } catch (error) {
            console.error('Failed to execute schedule:', error);
        }
    }

    async updateSchedule(scheduleId, updates) {
        try {
            // Update database
            await this.database.updateSchedule(scheduleId, updates);
            
            // Cancel existing job
            this.cancelJob(scheduleId);
            
            // Recreate job if active
            if (updates.active !== false && updates.active !== 0) {
                const scheduleConfig = await this.database.getSchedule(scheduleId);
                this.createJob(scheduleConfig);
            }
            
        } catch (error) {
            console.error('Failed to update schedule:', error);
            throw error;
        }
    }

    async deleteSchedule(scheduleId) {
        try {
            // Cancel job
            this.cancelJob(scheduleId);
            
            // Delete from database
            await this.database.deleteSchedule(scheduleId);
            
            console.log(`🗑️ Schedule deleted: ${scheduleId}`);
        } catch (error) {
            console.error('Failed to delete schedule:', error);
            throw error;
        }
    }

    cancelJob(scheduleId) {
        const job = this.activeJobs.get(scheduleId);
        
        if (job) {
            job.cancel();
            this.activeJobs.delete(scheduleId);
            console.log(`❌ Job cancelled: ${scheduleId}`);
        }
    }

    stopAll() {
        for (const [scheduleId, job] of this.activeJobs) {
            job.cancel();
        }
        
        this.activeJobs.clear();
        console.log('All scheduled jobs stopped');
    }

    toCronExpression(scheduleConfig) {
        if (!scheduleConfig.repeat) {
            return null;
        }
        
        const [hours, minutes] = scheduleConfig.time.split(':').map(Number);
        
        switch (scheduleConfig.repeat_type || scheduleConfig.repeatType) {
            case 'daily':
                return `${minutes} ${hours} * * *`;
                
            case 'weekly':
                const days = scheduleConfig.repeat_days || scheduleConfig.repeatDays;
                if (days && days.length > 0) {
                    const daysStr = days.join(',');
                    return `${minutes} ${hours} * * ${daysStr}`;
                }
                return `${minutes} ${hours} * * 0`; // Default to Sunday
                
            case 'custom':
                // Custom interval - use specific cron format based on unit
                const interval = scheduleConfig.repeat_interval || scheduleConfig.repeatInterval;
                const unit = scheduleConfig.repeat_unit || scheduleConfig.repeatUnit;
                
                switch (unit) {
                    case 'hours':
                        return `${minutes} */${interval} * * *`;
                    case 'days':
                        return `${minutes} ${hours} */${interval} * *`;
                    case 'weeks':
                        return `${minutes} ${hours} * * 0`; // Weekly on Sunday
                    default:
                        return null;
                }
                
            default:
                return null;
        }
    }

    parseTime(timeString) {
        const [hours, minutes] = timeString.split(':').map(Number);
        const date = new Date();
        date.setHours(hours, minutes, 0, 0);
        
        // If time has passed today, schedule for tomorrow
        if (date <= new Date()) {
            date.setDate(date.getDate() + 1);
        }
        
        return date;
    }

    getNextRunTime(scheduleId) {
        const job = this.activeJobs.get(scheduleId);
        
        if (job && job.nextInvocation) {
            return job.nextInvocation();
        }
        
        return null;
    }

    getAllActiveJobs() {
        const jobs = [];
        
        for (const [scheduleId, job] of this.activeJobs) {
            jobs.push({
                scheduleId,
                nextRun: job.nextInvocation ? job.nextInvocation() : null
            });
        }
        
        return jobs;
    }

    isJobActive(scheduleId) {
        return this.activeJobs.has(scheduleId);
    }

    async toggleSchedule(scheduleId) {
        const scheduleConfig = await this.database.getSchedule(scheduleId);
        
        if (!scheduleConfig) {
            throw new Error('Schedule not found');
        }
        
        if (this.isJobActive(scheduleId)) {
            // Deactivate
            this.cancelJob(scheduleId);
            await this.database.updateSchedule(scheduleId, { active: false });
            return false;
        } else {
            // Activate
            scheduleConfig.active = true;
            this.createJob(scheduleConfig);
            await this.database.updateSchedule(scheduleId, { active: true });
            return true;
        }
    }

    // Get upcoming schedules for the next N hours
    getUpcomingSchedules(hours = 24) {
        const upcoming = [];
        const endTime = new Date();
        endTime.setHours(endTime.getHours() + hours);
        
        for (const [scheduleId, job] of this.activeJobs) {
            const nextRun = job.nextInvocation ? job.nextInvocation() : null;
            
            if (nextRun && nextRun <= endTime) {
                upcoming.push({
                    scheduleId,
                    nextRun
                });
            }
        }
        
        // Sort by next run time
        upcoming.sort((a, b) => a.nextRun - b.nextRun);
        
        return upcoming;
    }

    // Check if any schedule is currently running
    async isAnyScheduleRunning() {
        const systemStats = this.streamManager.getSystemStats();
        return systemStats.activeStreams > 0;
    }
}

module.exports = { ScheduleService };
