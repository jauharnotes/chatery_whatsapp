const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

/**
 * Auto-Reply Service
 * Manages auto-reply rules with trigger matching and response handling
 */
class AutoReplyService {
    constructor() {
        this.rules = new Map(); // id -> rule object
        this.dataFile = path.join(process.cwd(), 'data', 'rules.json');
        this.whatsappManager = null;
        
        // Load existing rules on startup
        this._loadRules();
    }

    /**
     * Set WhatsApp Manager reference
     * @param {WhatsAppManager} manager 
     */
    setWhatsAppManager(manager) {
        this.whatsappManager = manager;
    }

    /**
     * Load rules from file
     */
    _loadRules() {
        try {
            if (fs.existsSync(this.dataFile)) {
                const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
                if (data.rules && Array.isArray(data.rules)) {
                    data.rules.forEach(rule => {
                        this.rules.set(rule.id, rule);
                    });
                    console.log(`🤖 Loaded ${data.rules.length} auto-reply rules`);
                }
            }
        } catch (error) {
            console.error('Error loading rules:', error);
        }
    }

    /**
     * Save rules to file
     */
    _saveRules() {
        try {
            const data = {
                rules: Array.from(this.rules.values())
            };
            fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Error saving rules:', error);
        }
    }

    /**
     * Process incoming message and check for matching rules
     * @param {string} sessionId - Session that received the message
     * @param {Object} message - Message object from Baileys
     * @returns {Object|null} - Reply action if rule matched, null otherwise
     */
    async processMessage(sessionId, message) {
        // Skip if message is from self or is a status broadcast
        if (message.key.fromMe || message.key.remoteJid === 'status@broadcast') {
            return null;
        }

        const chatId = message.key.remoteJid;
        const isGroup = chatId.endsWith('@g.us');
        const messageText = this._extractMessageText(message);

        if (!messageText) {
            return null; // Skip non-text messages for now
        }

        // Get enabled rules for this session (or global rules)
        const applicableRules = Array.from(this.rules.values())
            .filter(rule => rule.enabled)
            .filter(rule => !rule.sessionId || rule.sessionId === sessionId || rule.sessionId === '*')
            .sort((a, b) => (b.priority || 0) - (a.priority || 0)); // Higher priority first

        for (const rule of applicableRules) {
            if (this._matchesRule(rule, messageText, chatId, isGroup, message)) {
                console.log(`🤖 Rule "${rule.name}" matched for message: "${messageText.substring(0, 50)}..."`);
                
                // Update rule stats
                rule.matchCount = (rule.matchCount || 0) + 1;
                rule.lastMatchedAt = new Date().toISOString();
                this.rules.set(rule.id, rule);
                this._saveRules();

                return {
                    ruleId: rule.id,
                    ruleName: rule.name,
                    chatId,
                    message: this._processReplyTemplate(rule.action.message, message),
                    delay: rule.action.delay || 1000,
                    action: rule.action
                };
            }
        }

        return null;
    }

    /**
     * Extract text content from message
     * @param {Object} message 
     * @returns {string|null}
     */
    _extractMessageText(message) {
        const msg = message.message;
        if (!msg) return null;

        return msg.conversation ||
               msg.extendedTextMessage?.text ||
               msg.imageMessage?.caption ||
               msg.videoMessage?.caption ||
               msg.documentMessage?.caption ||
               null;
    }

    /**
     * Check if message matches rule conditions
     * @param {Object} rule 
     * @param {string} messageText 
     * @param {string} chatId 
     * @param {boolean} isGroup 
     * @param {Object} message 
     * @returns {boolean}
     */
    _matchesRule(rule, messageText, chatId, isGroup, message) {
        const { trigger, conditions } = rule;

        // Check chat type condition
        if (conditions?.chatType) {
            if (conditions.chatType === 'personal' && isGroup) return false;
            if (conditions.chatType === 'group' && !isGroup) return false;
        }

        // Check time range condition
        if (conditions?.timeRange?.enabled) {
            const now = new Date();
            const currentTime = now.getHours() * 60 + now.getMinutes();
            const [startHour, startMin] = conditions.timeRange.start.split(':').map(Number);
            const [endHour, endMin] = conditions.timeRange.end.split(':').map(Number);
            const startTime = startHour * 60 + startMin;
            const endTime = endHour * 60 + endMin;

            if (currentTime < startTime || currentTime > endTime) {
                return false;
            }
        }

        // Check excluded contacts
        if (conditions?.excludeContacts?.length > 0) {
            const senderNumber = chatId.replace('@s.whatsapp.net', '').replace('@g.us', '');
            if (conditions.excludeContacts.includes(senderNumber)) {
                return false;
            }
        }

        // Check trigger
        return this._matchesTrigger(trigger, messageText);
    }

    /**
     * Check if message matches trigger
     * @param {Object} trigger 
     * @param {string} messageText 
     * @returns {boolean}
     */
    _matchesTrigger(trigger, messageText) {
        const text = messageText.toLowerCase();

        switch (trigger.type) {
            case 'all':
                return true;

            case 'keyword':
                const keywords = trigger.keywords || [];
                const matchType = trigger.matchType || 'contains';

                return keywords.some(keyword => {
                    const kw = keyword.toLowerCase();
                    switch (matchType) {
                        case 'exact':
                            return text === kw;
                        case 'startsWith':
                            return text.startsWith(kw);
                        case 'endsWith':
                            return text.endsWith(kw);
                        case 'contains':
                        default:
                            return text.includes(kw);
                    }
                });

            case 'regex':
                try {
                    const regex = new RegExp(trigger.pattern, trigger.flags || 'i');
                    return regex.test(messageText);
                } catch {
                    return false;
                }

            case 'first_message':
                // This would need additional tracking of conversation history
                // For now, we'll skip this
                return false;

            default:
                return false;
        }
    }

    /**
     * Process reply template with variables
     * @param {string} template 
     * @param {Object} message 
     * @returns {string}
     */
    _processReplyTemplate(template, message) {
        const pushName = message.pushName || 'User';
        const senderNumber = message.key.remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
        const time = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const date = new Date().toLocaleDateString('id-ID');

        return template
            .replace(/\{name\}/g, pushName)
            .replace(/\{sender\}/g, senderNumber)
            .replace(/\{time\}/g, time)
            .replace(/\{date\}/g, date);
    }

    /**
     * Create a new rule
     * @param {Object} options
     * @returns {Object}
     */
    create(options) {
        const {
            name,
            sessionId = '*', // * for all sessions
            trigger,
            conditions = {},
            action,
            priority = 0
        } = options;

        // Validation
        if (!name || !trigger || !action) {
            return { success: false, message: 'Missing required fields: name, trigger, action' };
        }

        if (!trigger.type) {
            return { success: false, message: 'Trigger must have a type' };
        }

        if (!action.message) {
            return { success: false, message: 'Action must have a message' };
        }

        const id = uuidv4();
        const rule = {
            id,
            name,
            sessionId,
            trigger: {
                type: trigger.type,
                keywords: trigger.keywords || [],
                matchType: trigger.matchType || 'contains',
                pattern: trigger.pattern || '',
                flags: trigger.flags || 'i'
            },
            conditions: {
                chatType: conditions.chatType || 'all', // 'all', 'personal', 'group'
                timeRange: {
                    enabled: conditions.timeRange?.enabled || false,
                    start: conditions.timeRange?.start || '00:00',
                    end: conditions.timeRange?.end || '23:59'
                },
                excludeContacts: conditions.excludeContacts || []
            },
            action: {
                type: action.type || 'reply',
                message: action.message,
                delay: action.delay || 1000
            },
            priority,
            enabled: true,
            createdAt: new Date().toISOString(),
            matchCount: 0,
            lastMatchedAt: null
        };

        this.rules.set(id, rule);
        this._saveRules();

        return { success: true, message: 'Rule created', data: rule };
    }

    /**
     * Get all rules
     * @param {Object} options - Filter options
     * @returns {Object}
     */
    getAll(options = {}) {
        const { sessionId, enabled, limit = 50, offset = 0 } = options;
        
        let rules = Array.from(this.rules.values());

        // Filter by sessionId
        if (sessionId) {
            rules = rules.filter(r => r.sessionId === sessionId || r.sessionId === '*');
        }

        // Filter by enabled
        if (enabled !== undefined) {
            rules = rules.filter(r => r.enabled === enabled);
        }

        // Sort by priority (higher first), then by created date
        rules.sort((a, b) => {
            if (b.priority !== a.priority) return b.priority - a.priority;
            return new Date(b.createdAt) - new Date(a.createdAt);
        });

        // Pagination
        const total = rules.length;
        rules = rules.slice(offset, offset + limit);

        return {
            success: true,
            data: {
                rules,
                total,
                limit,
                offset
            }
        };
    }

    /**
     * Get a single rule by ID
     * @param {string} id 
     * @returns {Object}
     */
    getById(id) {
        const rule = this.rules.get(id);
        if (!rule) {
            return { success: false, message: 'Rule not found' };
        }
        return { success: true, data: rule };
    }

    /**
     * Update a rule
     * @param {string} id 
     * @param {Object} updates 
     * @returns {Object}
     */
    update(id, updates) {
        const rule = this.rules.get(id);
        if (!rule) {
            return { success: false, message: 'Rule not found' };
        }

        // Apply updates
        if (updates.name !== undefined) rule.name = updates.name;
        if (updates.sessionId !== undefined) rule.sessionId = updates.sessionId;
        if (updates.priority !== undefined) rule.priority = updates.priority;
        if (updates.enabled !== undefined) rule.enabled = updates.enabled;

        // Update trigger
        if (updates.trigger) {
            rule.trigger = { ...rule.trigger, ...updates.trigger };
        }

        // Update conditions
        if (updates.conditions) {
            rule.conditions = { ...rule.conditions, ...updates.conditions };
            if (updates.conditions.timeRange) {
                rule.conditions.timeRange = { ...rule.conditions.timeRange, ...updates.conditions.timeRange };
            }
        }

        // Update action
        if (updates.action) {
            rule.action = { ...rule.action, ...updates.action };
        }

        rule.updatedAt = new Date().toISOString();
        this.rules.set(id, rule);
        this._saveRules();

        return { success: true, message: 'Rule updated', data: rule };
    }

    /**
     * Delete a rule
     * @param {string} id 
     * @returns {Object}
     */
    delete(id) {
        const rule = this.rules.get(id);
        if (!rule) {
            return { success: false, message: 'Rule not found' };
        }

        this.rules.delete(id);
        this._saveRules();

        return { success: true, message: 'Rule deleted' };
    }

    /**
     * Toggle rule enabled status
     * @param {string} id 
     * @returns {Object}
     */
    toggle(id) {
        const rule = this.rules.get(id);
        if (!rule) {
            return { success: false, message: 'Rule not found' };
        }

        rule.enabled = !rule.enabled;
        rule.updatedAt = new Date().toISOString();
        this.rules.set(id, rule);
        this._saveRules();

        return { 
            success: true, 
            message: `Rule ${rule.enabled ? 'enabled' : 'disabled'}`,
            data: rule 
        };
    }

    /**
     * Get rule stats
     * @returns {Object}
     */
    getStats() {
        const rules = Array.from(this.rules.values());
        return {
            total: rules.length,
            enabled: rules.filter(r => r.enabled).length,
            totalMatches: rules.reduce((sum, r) => sum + (r.matchCount || 0), 0)
        };
    }
}

// Singleton instance
const autoReplyService = new AutoReplyService();

module.exports = autoReplyService;
