const fs = require('fs');
const path = require('path');

/**
 * AI Service
 * Handles AI chatbot integration with OpenAI and Google Gemini
 */
class AIService {
    constructor() {
        this.configFile = path.join(process.cwd(), 'data', 'ai-config.json');
        this.conversationHistory = new Map(); // chatId -> messages array
        this.sessionConfigs = new Map(); // sessionId -> AI config
        this.whatsappManager = null;
        
        // Default configuration
        this.defaultConfig = {
            enabled: false,
            provider: 'openai', // 'openai', 'gemini', or 'rag'
            model: 'gpt-3.5-turbo',
            apiKey: '',
            systemPrompt: 'Kamu adalah asisten virtual yang ramah dan membantu. Jawab pertanyaan dengan singkat dan jelas dalam Bahasa Indonesia.',
            maxTokens: 500,
            temperature: 0.7,
            contextLimit: 10, // Max conversation history to keep
            triggerMode: 'all', // 'all', 'keyword', 'mention'
            triggerKeywords: ['ai', 'bot', 'assistant'],
            excludeGroups: false,
            typingDelay: 1000,
            // RAG (Knowledge Base) / SQL Agent settings
            ragEnabled: false,
            ragApiUrl: 'http://localhost:3000/api', // ai-assistant API URL
            connectionId: null // Database connection ID for SQL Agent mode
        };
        
        this._loadConfig();
    }

    setWhatsAppManager(manager) {
        this.whatsappManager = manager;
    }

    _loadConfig() {
        try {
            if (fs.existsSync(this.configFile)) {
                const data = JSON.parse(fs.readFileSync(this.configFile, 'utf8'));
                if (data.sessions) {
                    Object.entries(data.sessions).forEach(([sessionId, config]) => {
                        this.sessionConfigs.set(sessionId, { ...this.defaultConfig, ...config });
                    });
                    console.log(`🤖 Loaded AI config for ${Object.keys(data.sessions).length} sessions`);
                }
            }
        } catch (error) {
            console.error('Error loading AI config:', error);
        }
    }

    _saveConfig() {
        try {
            const data = {
                sessions: Object.fromEntries(this.sessionConfigs)
            };
            fs.writeFileSync(this.configFile, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('Error saving AI config:', error);
        }
    }

    /**
     * Get or create config for a session
     */
    getConfig(sessionId) {
        if (!this.sessionConfigs.has(sessionId)) {
            return { ...this.defaultConfig };
        }
        return this.sessionConfigs.get(sessionId);
    }

    /**
     * Update config for a session
     */
    updateConfig(sessionId, updates) {
        const currentConfig = this.getConfig(sessionId);
        const newConfig = { ...currentConfig, ...updates };
        this.sessionConfigs.set(sessionId, newConfig);
        this._saveConfig();
        return { success: true, message: 'Config updated', data: newConfig };
    }

    /**
     * Enable AI for a session
     */
    enable(sessionId, apiKey, provider = 'openai') {
        const config = this.getConfig(sessionId);
        config.enabled = true;
        config.apiKey = apiKey;
        config.provider = provider;
        
        // Set default model based on provider
        if (provider === 'gemini') {
            config.model = 'gemini-pro';
        } else if (provider === 'rag') {
            config.model = 'knowledge-base';
            config.ragEnabled = true;
        } else {
            config.model = 'gpt-3.5-turbo';
        }
        
        this.sessionConfigs.set(sessionId, config);
        this._saveConfig();
        return { success: true, message: `AI enabled for session ${sessionId}`, data: config };
    }

    /**
     * Disable AI for a session
     */
    disable(sessionId) {
        const config = this.getConfig(sessionId);
        config.enabled = false;
        this.sessionConfigs.set(sessionId, config);
        this._saveConfig();
        return { success: true, message: `AI disabled for session ${sessionId}` };
    }

    /**
     * Check if AI should process this message
     */
    shouldProcess(sessionId, message, isGroup) {
        const config = this.getConfig(sessionId);
        
        if (!config.enabled || !config.apiKey) {
            return false;
        }

        // Skip groups if configured
        if (isGroup && config.excludeGroups) {
            return false;
        }

        const messageText = message.toLowerCase();

        // Check trigger mode
        switch (config.triggerMode) {
            case 'all':
                return true;
            case 'keyword':
                return config.triggerKeywords.some(kw => messageText.includes(kw.toLowerCase()));
            case 'mention':
                // Check if bot is mentioned (for groups)
                return messageText.includes('@bot') || messageText.includes('@ai');
            default:
                return true;
        }
    }

    /**
     * Get conversation history for context
     */
    _getHistory(chatId, config) {
        if (!this.conversationHistory.has(chatId)) {
            this.conversationHistory.set(chatId, []);
        }
        const history = this.conversationHistory.get(chatId);
        // Keep only last N messages
        return history.slice(-config.contextLimit);
    }

    /**
     * Add message to conversation history
     */
    _addToHistory(chatId, role, content) {
        if (!this.conversationHistory.has(chatId)) {
            this.conversationHistory.set(chatId, []);
        }
        this.conversationHistory.get(chatId).push({ role, content });
    }

    /**
     * Generate AI response using OpenAI
     */
    async _generateOpenAI(config, messages) {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify({
                model: config.model,
                messages: [
                    { role: 'system', content: config.systemPrompt },
                    ...messages
                ],
                max_tokens: config.maxTokens,
                temperature: config.temperature
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'OpenAI API error');
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    /**
     * Generate AI response using Google Gemini
     */
    async _generateGemini(config, messages) {
        // Format messages for Gemini
        const contents = messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

        // Add system instruction as first user message if needed
        if (config.systemPrompt) {
            contents.unshift({
                role: 'user',
                parts: [{ text: `Instructions: ${config.systemPrompt}` }]
            });
            contents.splice(1, 0, {
                role: 'model',
                parts: [{ text: 'Understood. I will follow these instructions.' }]
            });
        }

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:generateContent?key=${config.apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents,
                    generationConfig: {
                        maxOutputTokens: config.maxTokens,
                        temperature: config.temperature
                    }
                })
            }
        );

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Gemini API error');
        }

        const data = await response.json();
        return data.candidates[0].content.parts[0].text;
    }

    /**
     * Generate AI response using RAG (ai-assistant knowledge base) or SQL Agent
     */
    async _generateRAG(config, messageText) {
        const ragUrl = config.ragApiUrl || 'http://localhost:3000/api';
        
        // Build request body with optional connectionId for SQL Agent mode
        const requestBody = {
            question: messageText
        };
        
        // If connectionId is configured, use SQL Agent mode
        if (config.connectionId) {
            requestBody.connectionId = config.connectionId;
        }
        
        const response = await fetch(`${ragUrl}/ask`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: 'RAG API error' }));
            throw new Error(error.message || error.error || 'RAG API error');
        }

        const data = await response.json();
        
        // ai-assistant returns { answer, usage, debug }
        if (data.answer) {
            return data.answer;
        }
        
        // Handle string response
        if (typeof data === 'string') {
            return data;
        }
        
        throw new Error('Invalid RAG response format');
    }

    /**
     * Process a message and generate AI response
     */
    async processMessage(sessionId, chatId, messageText, senderName) {
        const config = this.getConfig(sessionId);

        if (!config.enabled || !config.apiKey) {
            return null;
        }

        try {
            // Get conversation history
            const history = this._getHistory(chatId, config);
            
            // Add user message to history
            this._addToHistory(chatId, 'user', messageText);
            
            // Prepare messages for API
            const messages = [
                ...history,
                { role: 'user', content: messageText }
            ];

            // Generate response based on provider
            let aiResponse;
            if (config.provider === 'rag' || config.ragEnabled) {
                // Use RAG (knowledge base) - no history needed
                aiResponse = await this._generateRAG(config, messageText);
            } else if (config.provider === 'gemini') {
                aiResponse = await this._generateGemini(config, messages);
            } else {
                aiResponse = await this._generateOpenAI(config, messages);
            }

            // Add AI response to history
            this._addToHistory(chatId, 'assistant', aiResponse);

            return {
                success: true,
                message: aiResponse,
                provider: config.provider,
                model: config.model
            };
        } catch (error) {
            console.error(`[AI] Error generating response:`, error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Clear conversation history for a chat
     */
    clearHistory(chatId) {
        this.conversationHistory.delete(chatId);
        return { success: true, message: 'Conversation history cleared' };
    }

    /**
     * Get all session configs
     */
    getAllConfigs() {
        const configs = {};
        this.sessionConfigs.forEach((config, sessionId) => {
            // Don't expose API key
            const { apiKey, ...safeConfig } = config;
            configs[sessionId] = {
                ...safeConfig,
                hasApiKey: !!apiKey
            };
        });
        return configs;
    }

    /**
     * Get AI stats
     */
    getStats() {
        return {
            enabledSessions: Array.from(this.sessionConfigs.values()).filter(c => c.enabled).length,
            totalSessions: this.sessionConfigs.size,
            activeConversations: this.conversationHistory.size
        };
    }
}

// Singleton instance
const aiService = new AIService();

module.exports = aiService;
