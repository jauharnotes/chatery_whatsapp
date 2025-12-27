const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const wsManager = require('../websocket');

/**
 * Broadcast Service
 * Handles bulk/mass messaging with queue management and rate limiting
 */
class BroadcastService {
    constructor() {
        this.broadcasts = new Map(); // id -> broadcast object
        this.dataFile = path.join(process.cwd(), 'data', 'broadcasts.json');
        this.whatsappManager = null;
        this.activeQueues = new Map(); // id -> queue processing state
        
        // Rate limiting config (anti-ban protection)
        this.config = {
            minDelay: 3000,      // Minimum 3 seconds between messages
            maxDelay: 8000,      // Maximum 8 seconds between messages
            batchSize: 10,       // Messages per batch
            batchDelay: 30000,   // 30 seconds pause between batches
            maxPerHour: 100      // Max messages per hour per session
        };
        
        this._loadBroadcasts();
    }

    setWhatsAppManager(manager) {
        this.whatsappManager = manager;
    }

    _loadBroadcasts() {
        try {
            if (fs.existsSync(this.dataFile)) {
                const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
                if (data.broadcasts && Array.isArray(data.broadcasts)) {
                    data.broadcasts.forEach(b => {
                        this.broadcasts.set(b.id, b);
                    });
                    console.log(`📢 Loaded ${data.broadcasts.length} broadcasts`);
                }
            }
        } catch (error) {
            console.error('Error loading broadcasts:', error);
        }
    }

    _saveBroadcasts() {
        try {
            const data = {
                broadcasts: Array.from(this.broadcasts.values())
            };
            fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Error saving broadcasts:', error);
        }
    }

    /**
     * Get random delay between min and max
     */
    _getRandomDelay() {
        return Math.floor(Math.random() * (this.config.maxDelay - this.config.minDelay + 1)) + this.config.minDelay;
    }

    /**
     * Create a new broadcast campaign
     */
    create(options) {
        const {
            name,
            sessionId,
            recipients, // Array of phone numbers or chat IDs
            message,
            mediaUrl,
            mediaType, // 'image', 'document', 'video'
            caption,
            scheduledAt
        } = options;

        // Validation
        if (!name || !sessionId || !recipients || !message) {
            return { success: false, message: 'Missing required fields: name, sessionId, recipients, message' };
        }

        if (!Array.isArray(recipients) || recipients.length === 0) {
            return { success: false, message: 'Recipients must be a non-empty array' };
        }

        const id = uuidv4();
        const broadcast = {
            id,
            name,
            sessionId,
            message,
            mediaUrl: mediaUrl || null,
            mediaType: mediaType || null,
            caption: caption || null,
            scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
            recipients: recipients.map(r => ({
                chatId: r,
                status: 'pending', // pending, sent, failed
                sentAt: null,
                error: null
            })),
            status: 'created', // created, running, paused, completed, cancelled
            stats: {
                total: recipients.length,
                sent: 0,
                failed: 0,
                pending: recipients.length
            },
            createdAt: new Date().toISOString(),
            startedAt: null,
            completedAt: null,
            currentIndex: 0
        };

        this.broadcasts.set(id, broadcast);
        this._saveBroadcasts();

        return { success: true, message: 'Broadcast created', data: broadcast };
    }

    /**
     * Start or resume a broadcast
     */
    async start(id) {
        const broadcast = this.broadcasts.get(id);
        if (!broadcast) {
            return { success: false, message: 'Broadcast not found' };
        }

        if (broadcast.status === 'running') {
            return { success: false, message: 'Broadcast is already running' };
        }

        if (broadcast.status === 'completed') {
            return { success: false, message: 'Broadcast is already completed' };
        }

        // Check session
        if (!this.whatsappManager) {
            return { success: false, message: 'WhatsApp Manager not initialized' };
        }

        const session = this.whatsappManager.getSession(broadcast.sessionId);
        if (!session) {
            return { success: false, message: `Session ${broadcast.sessionId} not found` };
        }

        if (session.connectionStatus !== 'connected') {
            return { success: false, message: `Session ${broadcast.sessionId} is not connected` };
        }

        // Update status
        broadcast.status = 'running';
        broadcast.startedAt = broadcast.startedAt || new Date().toISOString();
        this.broadcasts.set(id, broadcast);
        this._saveBroadcasts();

        // Start processing queue in background
        this._processQueue(id);

        return { success: true, message: 'Broadcast started', data: broadcast };
    }

    /**
     * Process the broadcast queue
     */
    async _processQueue(id) {
        const broadcast = this.broadcasts.get(id);
        if (!broadcast || broadcast.status !== 'running') return;

        this.activeQueues.set(id, { processing: true });

        const session = this.whatsappManager.getSession(broadcast.sessionId);
        if (!session || session.connectionStatus !== 'connected') {
            broadcast.status = 'paused';
            this.broadcasts.set(id, broadcast);
            this._saveBroadcasts();
            this.activeQueues.delete(id);
            return;
        }

        console.log(`📢 [Broadcast ${broadcast.name}] Starting from index ${broadcast.currentIndex}`);

        let messagesInBatch = 0;

        while (broadcast.currentIndex < broadcast.recipients.length) {
            // Check if paused or cancelled
            const currentBroadcast = this.broadcasts.get(id);
            if (!currentBroadcast || currentBroadcast.status !== 'running') {
                console.log(`📢 [Broadcast ${broadcast.name}] Stopped`);
                break;
            }

            const recipient = broadcast.recipients[broadcast.currentIndex];

            // Skip if already processed
            if (recipient.status !== 'pending') {
                broadcast.currentIndex++;
                continue;
            }

            try {
                // Send message
                let result;
                if (broadcast.mediaUrl && broadcast.mediaType === 'image') {
                    result = await session.sendImage(recipient.chatId, broadcast.mediaUrl, broadcast.caption || broadcast.message, 1000);
                } else if (broadcast.mediaUrl && broadcast.mediaType === 'document') {
                    result = await session.sendDocument(recipient.chatId, broadcast.mediaUrl, 'document', 'application/octet-stream', 1000);
                } else {
                    result = await session.sendTextMessage(recipient.chatId, broadcast.message, 1000);
                }

                if (result.success) {
                    recipient.status = 'sent';
                    recipient.sentAt = new Date().toISOString();
                    broadcast.stats.sent++;
                    broadcast.stats.pending--;
                    console.log(`✅ [Broadcast] Sent to ${recipient.chatId} (${broadcast.stats.sent}/${broadcast.stats.total})`);
                } else {
                    recipient.status = 'failed';
                    recipient.error = result.message;
                    broadcast.stats.failed++;
                    broadcast.stats.pending--;
                    console.log(`❌ [Broadcast] Failed to ${recipient.chatId}: ${result.message}`);
                }
            } catch (error) {
                recipient.status = 'failed';
                recipient.error = error.message;
                broadcast.stats.failed++;
                broadcast.stats.pending--;
                console.log(`❌ [Broadcast] Error sending to ${recipient.chatId}: ${error.message}`);
            }

            broadcast.currentIndex++;
            messagesInBatch++;
            this.broadcasts.set(id, broadcast);
            this._saveBroadcasts();

            // Emit real-time update via WebSocket
            wsManager.broadcast('broadcast.update', {
                broadcastId: broadcast.id,
                name: broadcast.name,
                status: broadcast.status,
                stats: broadcast.stats,
                currentIndex: broadcast.currentIndex,
                total: broadcast.recipients.length
            });

            // Check if batch complete
            if (messagesInBatch >= this.config.batchSize) {
                console.log(`⏸️ [Broadcast] Batch complete, pausing for ${this.config.batchDelay / 1000}s...`);
                await new Promise(resolve => setTimeout(resolve, this.config.batchDelay));
                messagesInBatch = 0;
            } else {
                // Random delay between messages
                const delay = this._getRandomDelay();
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        // Check if completed
        if (broadcast.currentIndex >= broadcast.recipients.length) {
            broadcast.status = 'completed';
            broadcast.completedAt = new Date().toISOString();
            console.log(`🎉 [Broadcast ${broadcast.name}] Completed! Sent: ${broadcast.stats.sent}, Failed: ${broadcast.stats.failed}`);
        }

        this.broadcasts.set(id, broadcast);
        this._saveBroadcasts();
        this.activeQueues.delete(id);

        // Emit final update via WebSocket
        wsManager.broadcast('broadcast.update', {
            broadcastId: broadcast.id,
            name: broadcast.name,
            status: broadcast.status,
            stats: broadcast.stats,
            currentIndex: broadcast.currentIndex,
            total: broadcast.recipients.length,
            completedAt: broadcast.completedAt
        });
    }

    /**
     * Pause a running broadcast
     */
    pause(id) {
        const broadcast = this.broadcasts.get(id);
        if (!broadcast) {
            return { success: false, message: 'Broadcast not found' };
        }

        if (broadcast.status !== 'running') {
            return { success: false, message: 'Broadcast is not running' };
        }

        broadcast.status = 'paused';
        this.broadcasts.set(id, broadcast);
        this._saveBroadcasts();

        return { success: true, message: 'Broadcast paused', data: broadcast };
    }

    /**
     * Cancel a broadcast
     */
    cancel(id) {
        const broadcast = this.broadcasts.get(id);
        if (!broadcast) {
            return { success: false, message: 'Broadcast not found' };
        }

        if (broadcast.status === 'completed') {
            return { success: false, message: 'Cannot cancel completed broadcast' };
        }

        broadcast.status = 'cancelled';
        this.broadcasts.set(id, broadcast);
        this._saveBroadcasts();

        return { success: true, message: 'Broadcast cancelled', data: broadcast };
    }

    /**
     * Get all broadcasts
     */
    getAll(options = {}) {
        const { sessionId, status, limit = 50, offset = 0 } = options;
        
        let broadcasts = Array.from(this.broadcasts.values());

        if (sessionId) {
            broadcasts = broadcasts.filter(b => b.sessionId === sessionId);
        }

        if (status) {
            broadcasts = broadcasts.filter(b => b.status === status);
        }

        // Sort by created date (newest first)
        broadcasts.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        const total = broadcasts.length;
        broadcasts = broadcasts.slice(offset, offset + limit);

        return {
            success: true,
            data: {
                broadcasts,
                total,
                limit,
                offset
            }
        };
    }

    /**
     * Get single broadcast by ID
     */
    getById(id) {
        const broadcast = this.broadcasts.get(id);
        if (!broadcast) {
            return { success: false, message: 'Broadcast not found' };
        }
        return { success: true, data: broadcast };
    }

    /**
     * Delete a broadcast
     */
    delete(id) {
        const broadcast = this.broadcasts.get(id);
        if (!broadcast) {
            return { success: false, message: 'Broadcast not found' };
        }

        if (broadcast.status === 'running') {
            return { success: false, message: 'Cannot delete running broadcast. Pause or cancel first.' };
        }

        this.broadcasts.delete(id);
        this._saveBroadcasts();

        return { success: true, message: 'Broadcast deleted' };
    }

    /**
     * Get broadcast stats summary
     */
    getStats() {
        const broadcasts = Array.from(this.broadcasts.values());
        return {
            total: broadcasts.length,
            running: broadcasts.filter(b => b.status === 'running').length,
            completed: broadcasts.filter(b => b.status === 'completed').length,
            paused: broadcasts.filter(b => b.status === 'paused').length,
            totalMessagesSent: broadcasts.reduce((sum, b) => sum + b.stats.sent, 0),
            totalMessagesFailed: broadcasts.reduce((sum, b) => sum + b.stats.failed, 0)
        };
    }
}

// Singleton instance
const broadcastService = new BroadcastService();

module.exports = broadcastService;
