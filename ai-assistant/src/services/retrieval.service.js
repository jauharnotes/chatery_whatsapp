const embeddingService = require('./embedding.service');
const documentRepo = require('../repositories/document.repo');
const logger = require('../utils/logger');

class RetrievalService {
  async retrieveContext(query, limit = 5) {
    try {
      const queryEmbedding = await embeddingService.generateEmbedding(query);
      const documents = await documentRepo.findSimilarDocuments(queryEmbedding, limit);
      
      return documents;
    } catch (error) {
      logger.error('Error in retrieval service:', error);
      throw error;
    }
  }

  // Helper to format context for the AI prompt
  formatContext(documents) {
    if (!documents || documents.length === 0) {
      return '';
    }
    return documents.map(doc => {
      return `--- DOCUMENT (ID: ${doc.id}) ---\n${doc.content}`;
    }).join('\n\n');
  }
}

module.exports = new RetrievalService();
