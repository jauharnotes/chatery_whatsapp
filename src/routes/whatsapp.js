const express = require('express');
const router = express.Router();
const whatsappManager = require('../services/whatsapp');
const schedulerService = require('../services/scheduler');
const autoReplyService = require('../services/autoreply');
const broadcastService = require('../services/broadcast');
const aiService = require('../services/ai');

// Initialize services with WhatsApp manager
schedulerService.setWhatsAppManager(whatsappManager);
autoReplyService.setWhatsAppManager(whatsappManager);
broadcastService.setWhatsAppManager(whatsappManager);
aiService.setWhatsAppManager(whatsappManager);

// Get all sessions
router.get('/sessions', (req, res) => {
    try {
        const sessions = whatsappManager.getAllSessions();
        res.json({
            success: true,
            message: 'Sessions retrieved',
            data: sessions.map(s => ({
                sessionId: s.sessionId,
                status: s.status,
                isConnected: s.isConnected,
                phoneNumber: s.phoneNumber,
                name: s.name
            }))
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Create/Connect a session
router.post('/sessions/:sessionId/connect', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const { metadata, webhooks } = req.body;
        
        const options = {};
        if (metadata) options.metadata = metadata;
        if (webhooks) options.webhooks = webhooks;
        
        const result = await whatsappManager.createSession(sessionId, options);
        
        res.json({
            success: result.success,
            message: result.message,
            data: result.data
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get session status
router.get('/sessions/:sessionId/status', (req, res) => {
    try {
        const { sessionId } = req.params;
        const session = whatsappManager.getSession(sessionId);
        
        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }

        const info = session.getInfo();
        res.json({
            success: true,
            message: 'Status retrieved',
            data: {
                sessionId: info.sessionId,
                status: info.status,
                isConnected: info.isConnected,
                phoneNumber: info.phoneNumber,
                name: info.name,
                metadata: info.metadata,
                webhooks: info.webhooks
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Update session config (metadata, webhooks)
router.patch('/sessions/:sessionId/config', (req, res) => {
    try {
        const { sessionId } = req.params;
        const { metadata, webhooks } = req.body;
        
        const session = whatsappManager.getSession(sessionId);
        
        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }
        
        const options = {};
        if (metadata !== undefined) options.metadata = metadata;
        if (webhooks !== undefined) options.webhooks = webhooks;
        
        const updatedInfo = session.updateConfig(options);
        
        res.json({
            success: true,
            message: 'Session config updated',
            data: {
                sessionId: updatedInfo.sessionId,
                metadata: updatedInfo.metadata,
                webhooks: updatedInfo.webhooks
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Add a webhook to session
router.post('/sessions/:sessionId/webhooks', (req, res) => {
    try {
        const { sessionId } = req.params;
        const { url, events } = req.body;
        
        if (!url) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: url'
            });
        }
        
        const session = whatsappManager.getSession(sessionId);
        
        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }
        
        const updatedInfo = session.addWebhook(url, events || ['all']);
        
        res.json({
            success: true,
            message: 'Webhook added',
            data: {
                sessionId: updatedInfo.sessionId,
                webhooks: updatedInfo.webhooks
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Remove a webhook from session
router.delete('/sessions/:sessionId/webhooks', (req, res) => {
    try {
        const { sessionId } = req.params;
        const { url } = req.body;
        
        if (!url) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: url'
            });
        }
        
        const session = whatsappManager.getSession(sessionId);
        
        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }
        
        const updatedInfo = session.removeWebhook(url);
        
        res.json({
            success: true,
            message: 'Webhook removed',
            data: {
                sessionId: updatedInfo.sessionId,
                webhooks: updatedInfo.webhooks
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get QR Code for session
router.get('/sessions/:sessionId/qr', (req, res) => {
    try {
        const { sessionId } = req.params;
        const sessionInfo = whatsappManager.getSessionQR(sessionId);
        
        if (!sessionInfo) {
            return res.status(404).json({
                success: false,
                message: 'Session not found. Please create session first.'
            });
        }

        if (sessionInfo.isConnected) {
            return res.json({
                success: true,
                message: 'Already connected to WhatsApp',
                data: { 
                    sessionId: sessionInfo.sessionId,
                    status: 'connected', 
                    qrCode: null 
                }
            });
        }

        if (!sessionInfo.qrCode) {
            return res.status(404).json({
                success: false,
                message: 'QR Code not available yet. Please wait...',
                data: { status: sessionInfo.status }
            });
        }

        res.json({
            success: true,
            message: 'QR Code ready',
            data: {
                sessionId: sessionInfo.sessionId,
                qrCode: sessionInfo.qrCode,
                status: sessionInfo.status
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get QR Code as Image for session
router.get('/sessions/:sessionId/qr/image', (req, res) => {
    try {
        const { sessionId } = req.params;
        const sessionInfo = whatsappManager.getSessionQR(sessionId);
        
        if (!sessionInfo || !sessionInfo.qrCode) {
            return res.status(404).send('QR Code not available');
        }

        // Konversi base64 ke buffer dan kirim sebagai image
        const base64Data = sessionInfo.qrCode.replace(/^data:image\/png;base64,/, '');
        const imgBuffer = Buffer.from(base64Data, 'base64');
        
        res.set('Content-Type', 'image/png');
        res.send(imgBuffer);
    } catch (error) {
        res.status(500).send('Error generating QR image');
    }
});

// Delete/Logout a session
router.delete('/sessions/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const result = await whatsappManager.deleteSession(sessionId);
        
        res.json({
            success: result.success,
            message: result.message
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== CHAT API ====================

// Middleware untuk check session dari body
const checkSession = (req, res, next) => {
    if (!req.body) {
        return res.status(400).json({
            success: false,
            message: 'Request body is required'
        });
    }
    
    const { sessionId } = req.body;
    
    if (!sessionId) {
        return res.status(400).json({
            success: false,
            message: 'Missing required field: sessionId'
        });
    }
    
    const session = whatsappManager.getSession(sessionId);
    
    if (!session) {
        return res.status(404).json({
            success: false,
            message: 'Session not found'
        });
    }
    
    if (session.connectionStatus !== 'connected') {
        return res.status(400).json({
            success: false,
            message: 'Session not connected. Please scan QR code first.'
        });
    }
    
    req.session = session;
    next();
};

// Send text message
router.post('/chats/send-text', checkSession, async (req, res) => {
    try {
        const { chatId, message, typingTime = 0 } = req.body;
        
        if (!chatId || !message) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: chatId, message'
            });
        }

        const result = await req.session.sendTextMessage(chatId, message, typingTime);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Send image
router.post('/chats/send-image', checkSession, async (req, res) => {
    try {
        const { chatId, imageUrl, caption, typingTime = 0 } = req.body;
        
        if (!chatId || !imageUrl) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: chatId, imageUrl'
            });
        }

        const result = await req.session.sendImage(chatId, imageUrl, caption || '', typingTime);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Send document
router.post('/chats/send-document', checkSession, async (req, res) => {
    try {
        const { chatId, documentUrl, filename, mimetype, typingTime = 0 } = req.body;
        
        if (!chatId || !documentUrl || !filename) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: chatId, documentUrl, filename'
            });
        }

        const result = await req.session.sendDocument(chatId, documentUrl, filename, mimetype, typingTime);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Send location
router.post('/chats/send-location', checkSession, async (req, res) => {
    try {
        const { chatId, latitude, longitude, name, typingTime = 0 } = req.body;
        
        if (!chatId || latitude === undefined || longitude === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: chatId, latitude, longitude'
            });
        }

        const result = await req.session.sendLocation(chatId, latitude, longitude, name || '', typingTime);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Send contact
router.post('/chats/send-contact', checkSession, async (req, res) => {
    try {
        const { chatId, contactName, contactPhone, typingTime = 0 } = req.body;
        
        if (!chatId || !contactName || !contactPhone) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: chatId, contactName, contactPhone'
            });
        }

        const result = await req.session.sendContact(chatId, contactName, contactPhone, typingTime);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Send button message
router.post('/chats/send-button', checkSession, async (req, res) => {
    try {
        const { chatId, text, footer, buttons, typingTime = 0 } = req.body;
        
        if (!chatId || !text || !buttons || !Array.isArray(buttons)) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: chatId, text, buttons (array)'
            });
        }

        const result = await req.session.sendButton(chatId, text, footer || '', buttons, typingTime);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Send presence update (typing indicator)
router.post('/chats/presence', checkSession, async (req, res) => {
    try {
        const { chatId, presence = 'composing' } = req.body;
        
        if (!chatId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: chatId'
            });
        }
        
        const validPresences = ['composing', 'recording', 'paused', 'available', 'unavailable'];
        if (!validPresences.includes(presence)) {
            return res.status(400).json({
                success: false,
                message: `Invalid presence. Must be one of: ${validPresences.join(', ')}`
            });
        }
        
        const result = await req.session.sendPresenceUpdate(chatId, presence);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Check if number is registered on WhatsApp
router.post('/chats/check-number', checkSession, async (req, res) => {
    try {
        const { phone } = req.body;
        
        if (!phone) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: phone'
            });
        }
        
        const result = await req.session.isRegistered(phone);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Get profile picture
router.post('/chats/profile-picture', checkSession, async (req, res) => {
    try {
        const { phone } = req.body;
        
        if (!phone) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: phone'
            });
        }
        
        const result = await req.session.getProfilePicture(phone);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== CHAT HISTORY API ====================

/**
 * Get chats overview - hanya chat yang punya pesan
 * Body: { sessionId, limit?, offset?, type? }
 * type: 'all' | 'personal' | 'group'
 */
router.post('/chats/overview', checkSession, async (req, res) => {
    try {
        const { limit = 50, offset = 0, type = 'all' } = req.body;
        const result = await req.session.getChatsOverview(limit, offset, type);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Get contacts list - semua kontak yang tersimpan
 * Body: { sessionId, limit?, offset?, search? }
 */
router.post('/contacts', checkSession, async (req, res) => {
    try {
        const { limit = 100, offset = 0, search = '' } = req.body;
        const result = await req.session.getContacts(limit, offset, search);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Get messages from any chat (personal or group)
 * Body: { sessionId, chatId, limit?, cursor? }
 * chatId: phone number (628xxx) or group id (xxx@g.us)
 */
router.post('/chats/messages', checkSession, async (req, res) => {
    try {
        const { chatId, limit = 50, cursor = null } = req.body;
        
        if (!chatId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: chatId'
            });
        }
        
        const result = await req.session.getChatMessages(chatId, limit, cursor);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Get chat info/detail (personal or group)
 * Body: { sessionId, chatId }
 */
router.post('/chats/info', checkSession, async (req, res) => {
    try {
        const { chatId } = req.body;
        
        if (!chatId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: chatId'
            });
        }
        
        const result = await req.session.getChatInfo(chatId);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Mark a chat as read
 * Body: { sessionId, chatId, messageId? }
 */
router.post('/chats/mark-read', checkSession, async (req, res) => {
    try {
        const { chatId, messageId } = req.body;
        
        if (!chatId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: chatId'
            });
        }
        
        const result = await req.session.markChatRead(chatId, messageId);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== GROUP MANAGEMENT ====================

/**
 * Create a new group
 * Body: { sessionId, name, participants: ['628xxx', '628yyy'] }
 */
router.post('/groups/create', checkSession, async (req, res) => {
    try {
        const { name, participants } = req.body;
        
        if (!name || !participants) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: name, participants'
            });
        }
        
        const result = await req.session.createGroup(name, participants);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Get all participating groups
 * Body: { sessionId }
 */
router.post('/groups', checkSession, async (req, res) => {
    try {
        const result = await req.session.getAllGroups();
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Get group metadata
 * Body: { sessionId, groupId }
 */
router.post('/groups/metadata', checkSession, async (req, res) => {
    try {
        const { groupId } = req.body;
        
        if (!groupId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: groupId'
            });
        }
        
        const result = await req.session.groupGetMetadata(groupId);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Add participants to a group
 * Body: { sessionId, groupId, participants: ['628xxx', '628yyy'] }
 */
router.post('/groups/participants/add', checkSession, async (req, res) => {
    try {
        const { groupId, participants } = req.body;
        
        if (!groupId || !participants) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: groupId, participants'
            });
        }
        
        const result = await req.session.groupAddParticipants(groupId, participants);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Remove participants from a group
 * Body: { sessionId, groupId, participants: ['628xxx', '628yyy'] }
 */
router.post('/groups/participants/remove', checkSession, async (req, res) => {
    try {
        const { groupId, participants } = req.body;
        
        if (!groupId || !participants) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: groupId, participants'
            });
        }
        
        const result = await req.session.groupRemoveParticipants(groupId, participants);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Promote participants to admin
 * Body: { sessionId, groupId, participants: ['628xxx', '628yyy'] }
 */
router.post('/groups/participants/promote', checkSession, async (req, res) => {
    try {
        const { groupId, participants } = req.body;
        
        if (!groupId || !participants) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: groupId, participants'
            });
        }
        
        const result = await req.session.groupPromoteParticipants(groupId, participants);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Demote participants from admin
 * Body: { sessionId, groupId, participants: ['628xxx', '628yyy'] }
 */
router.post('/groups/participants/demote', checkSession, async (req, res) => {
    try {
        const { groupId, participants } = req.body;
        
        if (!groupId || !participants) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: groupId, participants'
            });
        }
        
        const result = await req.session.groupDemoteParticipants(groupId, participants);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Update group subject (name)
 * Body: { sessionId, groupId, subject }
 */
router.post('/groups/subject', checkSession, async (req, res) => {
    try {
        const { groupId, subject } = req.body;
        
        if (!groupId || !subject) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: groupId, subject'
            });
        }
        
        const result = await req.session.groupUpdateSubject(groupId, subject);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Update group description
 * Body: { sessionId, groupId, description }
 */
router.post('/groups/description', checkSession, async (req, res) => {
    try {
        const { groupId, description } = req.body;
        
        if (!groupId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: groupId'
            });
        }
        
        const result = await req.session.groupUpdateDescription(groupId, description);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Update group settings
 * Body: { sessionId, groupId, setting: 'announcement'|'not_announcement'|'locked'|'unlocked' }
 */
router.post('/groups/settings', checkSession, async (req, res) => {
    try {
        const { groupId, setting } = req.body;
        
        if (!groupId || !setting) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: groupId, setting'
            });
        }
        
        const result = await req.session.groupUpdateSettings(groupId, setting);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Update group profile picture
 * Body: { sessionId, groupId, imageUrl }
 */
router.post('/groups/picture', checkSession, async (req, res) => {
    try {
        const { groupId, imageUrl } = req.body;
        
        if (!groupId || !imageUrl) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: groupId, imageUrl'
            });
        }
        
        const result = await req.session.groupUpdateProfilePicture(groupId, imageUrl);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Leave a group
 * Body: { sessionId, groupId }
 */
router.post('/groups/leave', checkSession, async (req, res) => {
    try {
        const { groupId } = req.body;
        
        if (!groupId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: groupId'
            });
        }
        
        const result = await req.session.groupLeave(groupId);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Join a group using invitation code/link
 * Body: { sessionId, inviteCode } - Can be full URL or just the code
 */
router.post('/groups/join', checkSession, async (req, res) => {
    try {
        const { inviteCode } = req.body;
        
        if (!inviteCode) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: inviteCode'
            });
        }
        
        const result = await req.session.groupJoinByInvite(inviteCode);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Get group invitation code/link
 * Body: { sessionId, groupId }
 */
router.post('/groups/invite-code', checkSession, async (req, res) => {
    try {
        const { groupId } = req.body;
        
        if (!groupId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: groupId'
            });
        }
        
        const result = await req.session.groupGetInviteCode(groupId);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Revoke group invitation code
 * Body: { sessionId, groupId }
 */
router.post('/groups/revoke-invite', checkSession, async (req, res) => {
    try {
        const { groupId } = req.body;
        
        if (!groupId) {
            return res.status(400).json({
                success: false,
                message: 'Missing required field: groupId'
            });
        }
        
        const result = await req.session.groupRevokeInvite(groupId);
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== SCHEDULER API ====================

/**
 * Get all scheduled messages
 * Query: ?sessionId=xxx&status=pending&limit=50&offset=0
 */
router.get('/schedules', (req, res) => {
    try {
        const { sessionId, status, limit, offset } = req.query;
        const result = schedulerService.getAll({
            sessionId,
            status,
            limit: limit ? parseInt(limit) : 50,
            offset: offset ? parseInt(offset) : 0
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Get scheduler stats
 */
router.get('/schedules/stats', (req, res) => {
    try {
        const stats = schedulerService.getStats();
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Get a single scheduled message
 */
router.get('/schedules/:id', (req, res) => {
    try {
        const { id } = req.params;
        const result = schedulerService.getById(id);
        
        if (!result.success) {
            return res.status(404).json(result);
        }
        
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Create a new scheduled message
 * Body: { sessionId, chatId, message, scheduledAt, repeat?, name?, typingTime?, timezone? }
 */
router.post('/schedules', (req, res) => {
    try {
        const { sessionId, chatId, message, scheduledAt, repeat, name, typingTime, timezone } = req.body;
        
        // Validate session exists
        const session = whatsappManager.getSession(sessionId);
        if (!session) {
            return res.status(404).json({
                success: false,
                message: 'Session not found'
            });
        }
        
        const result = schedulerService.create({
            sessionId,
            chatId,
            message,
            scheduledAt,
            repeat: repeat || 'once',
            name,
            typingTime: typingTime || 0,
            timezone: timezone || 'Asia/Jakarta'
        });
        
        if (!result.success) {
            return res.status(400).json(result);
        }
        
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Update a scheduled message
 * Body: { name?, chatId?, message?, scheduledAt?, repeat?, typingTime?, timezone?, enabled? }
 */
router.patch('/schedules/:id', (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        const result = schedulerService.update(id, updates);
        
        if (!result.success) {
            return res.status(result.message === 'Schedule not found' ? 404 : 400).json(result);
        }
        
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Toggle schedule enabled/disabled
 */
router.post('/schedules/:id/toggle', (req, res) => {
    try {
        const { id } = req.params;
        const result = schedulerService.toggle(id);
        
        if (!result.success) {
            return res.status(404).json(result);
        }
        
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Delete a scheduled message
 */
router.delete('/schedules/:id', (req, res) => {
    try {
        const { id } = req.params;
        const result = schedulerService.delete(id);
        
        if (!result.success) {
            return res.status(404).json(result);
        }
        
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== AUTO-REPLY RULES API ====================

/**
 * Get all auto-reply rules
 * Query: ?sessionId=xxx&enabled=true&limit=50&offset=0
 */
router.get('/rules', (req, res) => {
    try {
        const { sessionId, enabled, limit, offset } = req.query;
        const result = autoReplyService.getAll({
            sessionId,
            enabled: enabled !== undefined ? enabled === 'true' : undefined,
            limit: limit ? parseInt(limit) : 50,
            offset: offset ? parseInt(offset) : 0
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Get auto-reply stats
 */
router.get('/rules/stats', (req, res) => {
    try {
        const stats = autoReplyService.getStats();
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Get a single rule
 */
router.get('/rules/:id', (req, res) => {
    try {
        const { id } = req.params;
        const result = autoReplyService.getById(id);
        
        if (!result.success) {
            return res.status(404).json(result);
        }
        
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Create a new auto-reply rule
 * Body: { name, sessionId?, trigger, conditions?, action, priority? }
 */
router.post('/rules', (req, res) => {
    try {
        const { name, sessionId, trigger, conditions, action, priority } = req.body;
        
        const result = autoReplyService.create({
            name,
            sessionId: sessionId || '*',
            trigger,
            conditions,
            action,
            priority: priority || 0
        });
        
        if (!result.success) {
            return res.status(400).json(result);
        }
        
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Update an auto-reply rule
 */
router.patch('/rules/:id', (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;
        
        const result = autoReplyService.update(id, updates);
        
        if (!result.success) {
            return res.status(result.message === 'Rule not found' ? 404 : 400).json(result);
        }
        
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Toggle rule enabled/disabled
 */
router.post('/rules/:id/toggle', (req, res) => {
    try {
        const { id } = req.params;
        const result = autoReplyService.toggle(id);
        
        if (!result.success) {
            return res.status(404).json(result);
        }
        
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

/**
 * Delete an auto-reply rule
 */
router.delete('/rules/:id', (req, res) => {
    try {
        const { id } = req.params;
        const result = autoReplyService.delete(id);
        
        if (!result.success) {
            return res.status(404).json(result);
        }
        
        res.json(result);
    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// ==================== BROADCAST API ====================

/**
 * Get all broadcasts
 */
router.get('/broadcasts', (req, res) => {
    try {
        const { sessionId, status, limit, offset } = req.query;
        const result = broadcastService.getAll({
            sessionId,
            status,
            limit: limit ? parseInt(limit) : 50,
            offset: offset ? parseInt(offset) : 0
        });
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Get broadcast stats
 */
router.get('/broadcasts/stats', (req, res) => {
    try {
        const stats = broadcastService.getStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Get single broadcast
 */
router.get('/broadcasts/:id', (req, res) => {
    try {
        const result = broadcastService.getById(req.params.id);
        if (!result.success) return res.status(404).json(result);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Create a new broadcast
 */
router.post('/broadcasts', (req, res) => {
    try {
        const { name, sessionId, recipients, message, mediaUrl, mediaType, caption, scheduledAt } = req.body;
        
        // Validate session exists
        const session = whatsappManager.getSession(sessionId);
        if (!session) {
            return res.status(404).json({ success: false, message: 'Session not found' });
        }
        
        const result = broadcastService.create({
            name,
            sessionId,
            recipients,
            message,
            mediaUrl,
            mediaType,
            caption,
            scheduledAt
        });
        
        if (!result.success) return res.status(400).json(result);
        res.status(201).json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Start a broadcast
 */
router.post('/broadcasts/:id/start', async (req, res) => {
    try {
        const result = await broadcastService.start(req.params.id);
        if (!result.success) {
            return res.status(result.message.includes('not found') ? 404 : 400).json(result);
        }
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Pause a broadcast
 */
router.post('/broadcasts/:id/pause', (req, res) => {
    try {
        const result = broadcastService.pause(req.params.id);
        if (!result.success) {
            return res.status(result.message.includes('not found') ? 404 : 400).json(result);
        }
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Cancel a broadcast
 */
router.post('/broadcasts/:id/cancel', (req, res) => {
    try {
        const result = broadcastService.cancel(req.params.id);
        if (!result.success) {
            return res.status(result.message.includes('not found') ? 404 : 400).json(result);
        }
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Delete a broadcast
 */
router.delete('/broadcasts/:id', (req, res) => {
    try {
        const result = broadcastService.delete(req.params.id);
        if (!result.success) {
            return res.status(result.message.includes('not found') ? 404 : 400).json(result);
        }
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== AI CHATBOT API ====================

/**
 * Get AI config for a session
 */
router.get('/ai/config/:sessionId', (req, res) => {
    try {
        const config = aiService.getConfig(req.params.sessionId);
        // Don't expose API key
        const { apiKey, ...safeConfig } = config;
        res.json({ 
            success: true, 
            data: { ...safeConfig, hasApiKey: !!apiKey } 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Get all AI configs
 */
router.get('/ai/configs', (req, res) => {
    try {
        const configs = aiService.getAllConfigs();
        res.json({ success: true, data: configs });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Get AI stats
 */
router.get('/ai/stats', (req, res) => {
    try {
        const stats = aiService.getStats();
        res.json({ success: true, data: stats });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Enable AI for a session
 */
router.post('/ai/enable/:sessionId', (req, res) => {
    try {
        const { apiKey, provider = 'openai' } = req.body;
        
        if (!apiKey) {
            return res.status(400).json({ success: false, message: 'API key is required' });
        }
        
        const result = aiService.enable(req.params.sessionId, apiKey, provider);
        // Don't expose API key in response
        const { apiKey: _, ...safeData } = result.data;
        res.json({ ...result, data: { ...safeData, hasApiKey: true } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Disable AI for a session
 */
router.post('/ai/disable/:sessionId', (req, res) => {
    try {
        const result = aiService.disable(req.params.sessionId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Update AI config for a session
 */
router.patch('/ai/config/:sessionId', (req, res) => {
    try {
        const result = aiService.updateConfig(req.params.sessionId, req.body);
        // Don't expose API key in response
        const { apiKey, ...safeData } = result.data;
        res.json({ ...result, data: { ...safeData, hasApiKey: !!apiKey } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

/**
 * Clear conversation history for a chat
 */
router.delete('/ai/history/:chatId', (req, res) => {
    try {
        const result = aiService.clearHistory(req.params.chatId);
        res.json(result);
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;