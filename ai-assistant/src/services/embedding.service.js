const openai = require('../config/openai');
const logger = require('../utils/logger');

class EmbeddingService {
  constructor() {
    this.model = 'text-embedding-3-small'; // Cost-effective and high performance
  }

  async generateEmbedding(text) {
    try {
      // Remove newlines to avoid interfering with the embedding
      const cleanText = text.replace(/\n/g, ' ');
      
      const response = await openai.embeddings.create({
        model: this.model,
        input: cleanText,
        encoding_format: 'float'
      });

      return response.data[0].embedding;
    } catch (error) {
      logger.error('Error generating embedding:', error);
      throw error;
    }
  }
}

module.exports = new EmbeddingService();
