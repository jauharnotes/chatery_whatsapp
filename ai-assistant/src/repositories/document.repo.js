const { pool } = require('../config/db');

class DocumentRepository {
  async saveDocument(content, embedding, metadata = {}) {
    const query = `
      INSERT INTO documents (content, embedding, metadata)
      VALUES ($1, $2, $3)
      RETURNING id
    `;
    // pgvector needs formatting as a string like '[0.1, 0.2, ...]'
    // The pg driver + pgvector usually handles arrays if configured, 
    // but explicit string formatting is safer if unsure of driver extensions.
    // However, latest 'pg' usually handles array for vector type if we pass it correctly.
    // Let's assume standard array passing works with pgvector-pg generic support or stringify it.
    // Safest for raw SQL without specific pg-vector helper lib is formatted string.
    const vectorStr = `[${embedding.join(',')}]`;
    
    const values = [content, vectorStr, metadata];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  async findSimilarDocuments(embedding, limit = 5) {
    const vectorStr = `[${embedding.join(',')}]`;
    // Cosine distance operator is <=>
    const query = `
      SELECT id, content, metadata, 1 - (embedding <=> $1) as similarity
      FROM documents
      ORDER BY embedding <=> $1
      LIMIT $2
    `;
    const result = await pool.query(query, [vectorStr, limit]);
    return result.rows;
  }
}

module.exports = new DocumentRepository();
