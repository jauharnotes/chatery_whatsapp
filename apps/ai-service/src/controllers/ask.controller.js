const aiService = require('../services/ai.service');
const documentRepo = require('../repositories/document.repo');
const embeddingService = require('../services/embedding.service');
const logger = require('../utils/logger');

exports.askQuestion = async (req, res, next) => {
  try {
    const { question, connectionId } = req.body;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Pertanyaan harus berupa teks.' });
    }

    // Pass Redis client to AI service
    const redis = req.app.get('redis');
    aiService.setRedis(redis);

    const result = await aiService.ask(question, { connectionId });

    res.json({
      answer: result.answer,
      usage: result.usage,
      debug: result.debug,
      fromCache: result.fromCache || false,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};

// Bonus: Endpoint to ingest documents for testing
exports.ingestDocument = async (req, res, next) => {
  try {
    const { content, metadata } = req.body;
    
    if (!content) {
      return res.status(400).json({ error: 'Content required.' });
    }

    const embedding = await embeddingService.generateEmbedding(content);
    const result = await documentRepo.saveDocument(content, embedding, metadata || {});

    res.json({
      message: 'Document ingested successfully',
      id: result.id
    });
  } catch (error) {
    next(error);
  }
};

exports.generateImage = async (req, res, next) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt gambar diperlukan.' });
    }

    const { imageUrl, usage } = await aiService.generateImage(prompt);

    res.json({
      imageUrl,
      usage,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
};
