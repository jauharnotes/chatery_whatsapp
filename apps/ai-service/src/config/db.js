const { Pool } = require('pg');
const env = require('./env');

const pool = new Pool({
  connectionString: env.DATABASE_URL
});

// Sensitive tables that should be excluded from AI access
const SENSITIVE_TABLES = [
  'users',
  'admins',
  'passwords',
  'tokens',
  'sessions',
  'api_keys',
  'credentials',
  'secrets',
  'SequelizeMeta'
];

// Test connection and init tables
const initDB = async () => {
  try {
    const client = await pool.connect();
    console.log('Connected to PostgreSQL');
    
    // Enable pgvector extension (optional, for future RAG features)
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      console.log('pgvector extension enabled');
    } catch (err) {
      console.log('pgvector not available, skipping (SQL Agent mode will work fine)');
    }

    // Create database_connections table for multi-database SaaS
    await client.query(`
      CREATE TABLE IF NOT EXISTS database_connections (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        host VARCHAR(255) NOT NULL,
        port INTEGER DEFAULT 5432,
        database_name VARCHAR(255) NOT NULL,
        username VARCHAR(255) NOT NULL,
        password_encrypted TEXT NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('database_connections table checked/created');

    // Create table_configs for per-connection table selection
    await client.query(`
      CREATE TABLE IF NOT EXISTS table_configs (
        id SERIAL PRIMARY KEY,
        connection_id INTEGER REFERENCES database_connections(id) ON DELETE CASCADE,
        table_name VARCHAR(255) NOT NULL,
        display_name VARCHAR(255),
        description TEXT,
        searchable_columns TEXT[] DEFAULT '{}',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(connection_id, table_name)
      )
    `);
    console.log('table_configs table checked/created');

    // Keep documents table for backward compatibility / knowledge base
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
    // Don't exit on pgvector error, only on critical errors
    if (err.code !== '0A000') {
      process.exit(1);
    }
  }
};

module.exports = {
  pool,
  initDB,
  SENSITIVE_TABLES
};
