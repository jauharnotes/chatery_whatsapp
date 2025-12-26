const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool({
  connectionString: env.DATABASE_URL
});

// Test connection and init pgvector
const initDB = async () => {
  try {
    const client = await pool.connect();
    console.log('Connected to PostgreSQL');
    
    // Enable pgvector extension
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    console.log('pgvector extension enabled');

    // Create documents table if not exists - SIMPLE schema for MVP
    // metadata is JSONB for flexibility
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        content TEXT NOT NULL,
        metadata JSONB,
        embedding vector(1536),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Documents table checked/created');

    client.release();
  } catch (err) {
    console.error('Database initialization error:', err);
    process.exit(1);
  }
};

module.exports = {
  pool,
  initDB
};
