const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

/**
 * Scheduler Service
 * Manages scheduled WhatsApp messages with persistent storage
 */
class SchedulerService {
    constructor() {
        this.schedules = new Map(); // id -> schedule object
        this.jobs = new Map(); // id -> cron job instance
        this.dataFile = path.join(process.cwd(), 'data', 'schedules.json');
        this.whatsappManager = null;
        
        // Load existing schedules on startup
        this._loadSchedules();
    }

    /**
     * Set WhatsApp Manager reference
     * @param {WhatsAppManager} manager 
     */
    setWhatsAppManager(manager) {
        this.whatsappManager = manager;
        // Start all active schedules after manager is set
        this._startAllSchedules();
    }

    /**
     * Load schedules from file
     */
    _loadSchedules() {
        try {
            if (fs.existsSync(this.dataFile)) {
                const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
                if (data.schedules && Array.isArray(data.schedules)) {
                    data.schedules.forEach(schedule => {
                        this.schedules.set(schedule.id, schedule);
                    });
                    console.log(`📅 Loaded ${data.schedules.length} scheduled messages`);
                }
            }
        } catch (error) {
            console.error('Error loading schedules:', error);
        }
    }

    /**
     * Save schedules to file
     */
    _saveSchedules() {
        try {
            const data = {
                schedules: Array.from(this.schedules.values())
            };
            fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Error saving schedules:', error);
        }
    }

    /**
     * Start all active schedules
     */
    _startAllSchedules() {
        for (const [id, schedule] of this.schedules) {
            if (schedule.enabled && schedule.status !== 'completed') {
                this._startSchedule(schedule);
            }
        }
    }

    /**
     * Start a single schedule
     * @param {Object} schedule 
     */
    _startSchedule(schedule) {
        // Stop existing job if any
        if (this.jobs.has(schedule.id)) {
            this.jobs.get(schedule.id).stop();
            this.jobs.delete(schedule.id);
        }

        const cronExpression = this._getCronExpression(schedule);
        if (!cronExpression) {
            console.error(`Invalid schedule configuration for ${schedule.id}`);
            return;
        }

        try {
            const job = cron.schedule(cronExpression, async () => {
                await this._executeSchedule(schedule);
            }, {
                timezone: schedule.timezone || 'Asia/Jakarta'
            });

            this.jobs.set(schedule.id, job);
            console.log(`⏰ Scheduled message "${schedule.name}" started`);
        } catch (error) {
            console.error(`Error starting schedule ${schedule.id}:`, error);
        }
    }

    /**
     * Get cron expression from schedule config
     * @param {Object} schedule 
     * @returns {string|null}
     */
    _getCronExpression(schedule) {
        const scheduledAt = new Date(schedule.scheduledAt);
        const minute = scheduledAt.getMinutes();
        const hour = scheduledAt.getHours();
        const dayOfMonth = scheduledAt.getDate();
        const month = scheduledAt.getMonth() + 1;
        const dayOfWeek = scheduledAt.getDay();

        switch (schedule.repeat) {
            case 'once':
                // For one-time schedules, we'll use a different approach
                return `${minute} ${hour} ${dayOfMonth} ${month} *`;
            case 'daily':
                return `${minute} ${hour} * * *`;
            case 'weekly':
                return `${minute} ${hour} * * ${dayOfWeek}`;
            case 'monthly':
                return `${minute} ${hour} ${dayOfMonth} * *`;
            default:
                return `${minute} ${hour} ${dayOfMonth} ${month} *`;
        }
    }

    /**
     * Execute a scheduled message
     * @param {Object} schedule 
     */
    async _executeSchedule(schedule) {
        console.log(`📤 Executing scheduled message: ${schedule.name}`);
        
        try {
            if (!this.whatsappManager) {
                throw new Error('WhatsApp Manager not initialized');
            }

            const session = this.whatsappManager.getSession(schedule.sessionId);
            if (!session) {
                throw new Error(`Session ${schedule.sessionId} not found`);
            }

            if (session.connectionStatus !== 'connected') {
                throw new Error(`Session ${schedule.sessionId} is not connected`);
            }

            // Send the message
            const result = await session.sendTextMessage(
                schedule.chatId, 
                schedule.message, 
                schedule.typingTime || 0
            );

            // Update schedule status
            const updatedSchedule = this.schedules.get(schedule.id);
            if (updatedSchedule) {
                updatedSchedule.lastExecuted = new Date().toISOString();
                updatedSchedule.executionCount = (updatedSchedule.executionCount || 0) + 1;
                
                // Mark as completed if one-time
                if (schedule.repeat === 'once') {
                    updatedSchedule.status = 'completed';
                    updatedSchedule.enabled = false;
                    
                    // Stop the cron job
                    if (this.jobs.has(schedule.id)) {
                        this.jobs.get(schedule.id).stop();
                        this.jobs.delete(schedule.id);
                    }
                }
                
                this.schedules.set(schedule.id, updatedSchedule);
                this._saveSchedules();
            }

            console.log(`✅ Scheduled message "${schedule.name}" sent successfully`);
            return { success: true, result };
        } catch (error) {
            console.error(`❌ Failed to execute scheduled message "${schedule.name}":`, error.message);
            
            // Update schedule with error
            const updatedSchedule = this.schedules.get(schedule.id);
            if (updatedSchedule) {
                updatedSchedule.lastError = error.message;
                updatedSchedule.lastErrorAt = new Date().toISOString();
                this.schedules.set(schedule.id, updatedSchedule);
                this._saveSchedules();
            }
            
            return { success: false, error: error.message };
        }
    }

    /**
     * Create a new scheduled message
     * @param {Object} options
     * @returns {Object}
     */
    create(options) {
        const { sessionId, chatId, message, scheduledAt, repeat = 'once', name, typingTime = 0, timezone = 'Asia/Jakarta' } = options;

        // Validation
        if (!sessionId || !chatId || !message || !scheduledAt) {
            return { success: false, message: 'Missing required fields: sessionId, chatId, message, scheduledAt' };
        }

        const scheduledDate = new Date(scheduledAt);
        if (isNaN(scheduledDate.getTime())) {
            return { success: false, message: 'Invalid scheduledAt date format' };
        }

        // For one-time schedules, ensure it's in the future
        if (repeat === 'once' && scheduledDate <= new Date()) {
            return { success: false, message: 'Scheduled time must be in the future' };
        }

        const id = uuidv4();
        const schedule = {
            id,
            name: name || `Schedule ${id.substring(0, 8)}`,
            sessionId,
            chatId,
            message,
            scheduledAt: scheduledDate.toISOString(),
            repeat,
            typingTime,
            timezone,
            enabled: true,
            status: 'pending',
            createdAt: new Date().toISOString(),
            executionCount: 0,
            lastExecuted: null,
            lastError: null
        };

        this.schedules.set(id, schedule);
        this._saveSchedules();

        // Start the schedule if manager is available
        if (this.whatsappManager) {
            this._startSchedule(schedule);
        }

        return { success: true, message: 'Schedule created', data: schedule };
    }

    /**
     * Get all schedules
     * @param {Object} options - Filter options
     * @returns {Object}
     */
    getAll(options = {}) {
        const { sessionId, status, limit = 50, offset = 0 } = options;
        
        let schedules = Array.from(this.schedules.values());

        // Filter by sessionId
        if (sessionId) {
            schedules = schedules.filter(s => s.sessionId === sessionId);
        }

        // Filter by status
        if (status) {
            schedules = schedules.filter(s => s.status === status);
        }

        // Sort by scheduledAt (newest first)
        schedules.sort((a, b) => new Date(b.scheduledAt) - new Date(a.scheduledAt));

        // Pagination
        const total = schedules.length;
        schedules = schedules.slice(offset, offset + limit);

        return {
            success: true,
            data: {
                schedules,
                total,
                limit,
                offset
            }
        };
    }

    /**
     * Get a single schedule by ID
     * @param {string} id 
     * @returns {Object}
     */
    getById(id) {
        const schedule = this.schedules.get(id);
        if (!schedule) {
            return { success: false, message: 'Schedule not found' };
        }
        return { success: true, data: schedule };
    }

    /**
     * Update a schedule
     * @param {string} id 
     * @param {Object} updates 
     * @returns {Object}
     */
    update(id, updates) {
        const schedule = this.schedules.get(id);
        if (!schedule) {
            return { success: false, message: 'Schedule not found' };
        }

        // Don't allow updating completed schedules
        if (schedule.status === 'completed') {
            return { success: false, message: 'Cannot update completed schedule' };
        }

        // Apply updates
        const allowedFields = ['name', 'chatId', 'message', 'scheduledAt', 'repeat', 'typingTime', 'timezone', 'enabled'];
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                schedule[field] = updates[field];
            }
        }

        // Validate scheduledAt if updated
        if (updates.scheduledAt) {
            const scheduledDate = new Date(updates.scheduledAt);
            if (isNaN(scheduledDate.getTime())) {
                return { success: false, message: 'Invalid scheduledAt date format' };
            }
            schedule.scheduledAt = scheduledDate.toISOString();
        }

        schedule.updatedAt = new Date().toISOString();
        this.schedules.set(id, schedule);
        this._saveSchedules();

        // Restart the schedule if enabled
        if (schedule.enabled && this.whatsappManager) {
            this._startSchedule(schedule);
        } else if (!schedule.enabled && this.jobs.has(id)) {
            this.jobs.get(id).stop();
            this.jobs.delete(id);
        }

        return { success: true, message: 'Schedule updated', data: schedule };
    }

    /**
     * Delete a schedule
     * @param {string} id 
     * @returns {Object}
     */
    delete(id) {
        const schedule = this.schedules.get(id);
        if (!schedule) {
            return { success: false, message: 'Schedule not found' };
        }

        // Stop the cron job if running
        if (this.jobs.has(id)) {
            this.jobs.get(id).stop();
            this.jobs.delete(id);
        }

        this.schedules.delete(id);
        this._saveSchedules();

        return { success: true, message: 'Schedule deleted' };
    }

    /**
     * Toggle schedule enabled status
     * @param {string} id 
     * @returns {Object}
     */
    toggle(id) {
        const schedule = this.schedules.get(id);
        if (!schedule) {
            return { success: false, message: 'Schedule not found' };
        }

        schedule.enabled = !schedule.enabled;
        schedule.updatedAt = new Date().toISOString();
        this.schedules.set(id, schedule);
        this._saveSchedules();

        if (schedule.enabled && this.whatsappManager) {
            this._startSchedule(schedule);
        } else if (!schedule.enabled && this.jobs.has(id)) {
            this.jobs.get(id).stop();
            this.jobs.delete(id);
        }

        return { 
            success: true, 
            message: `Schedule ${schedule.enabled ? 'enabled' : 'disabled'}`,
            data: schedule 
        };
    }

    /**
     * Get scheduler stats
     * @returns {Object}
     */
    getStats() {
        const schedules = Array.from(this.schedules.values());
        return {
            total: schedules.length,
            enabled: schedules.filter(s => s.enabled).length,
            pending: schedules.filter(s => s.status === 'pending').length,
            completed: schedules.filter(s => s.status === 'completed').length,
            activeJobs: this.jobs.size
        };
    }
}

// Singleton instance
const schedulerService = new SchedulerService();

module.exports = schedulerService;
