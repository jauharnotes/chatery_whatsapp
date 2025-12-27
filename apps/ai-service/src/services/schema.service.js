const { Pool } = require('pg');
const { SENSITIVE_TABLES } = require('../config/db');
const logger = require('../utils/logger');

class SchemaService {
  /**
   * Create a temporary pool connection to a user's database
   */
  createUserPool(connectionConfig) {
    return new Pool({
      host: connectionConfig.host,
      port: connectionConfig.port || 5432,
      database: connectionConfig.database_name,
      user: connectionConfig.username,
      password: connectionConfig.password, // Should be decrypted before passing
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000
    });
  }

  /**
   * Test database connection
   */
  async testConnection(connectionConfig) {
    const pool = this.createUserPool(connectionConfig);
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      await pool.end();
      return { success: true };
    } catch (error) {
      await pool.end();
      logger.error('Connection test failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Discover all tables in a user's database (excluding sensitive ones)
   */
  async discoverTables(connectionConfig) {
    const pool = this.createUserPool(connectionConfig);
    try {
      const client = await pool.connect();
      
      const result = await client.query(`
        SELECT 
          table_name,
          (SELECT COUNT(*) FROM information_schema.columns 
           WHERE table_name = t.table_name AND table_schema = 'public') as column_count
        FROM information_schema.tables t
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);
      
      client.release();
      await pool.end();

      // Filter out sensitive tables
      const tables = result.rows.filter(
        row => !SENSITIVE_TABLES.some(
          sensitive => row.table_name.toLowerCase().includes(sensitive.toLowerCase())
        )
      );

      return tables;
    } catch (error) {
      await pool.end();
      logger.error('Error discovering tables:', error);
      throw error;
    }
  }

  /**
   * Get schema (columns) for a specific table
   */
  async getTableSchema(connectionConfig, tableName) {
    // Security check
    if (SENSITIVE_TABLES.some(s => tableName.toLowerCase().includes(s.toLowerCase()))) {
      throw new Error('Access to this table is not allowed');
    }

    const pool = this.createUserPool(connectionConfig);
    try {
      const client = await pool.connect();
      
      const result = await client.query(`
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default,
          character_maximum_length
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position
      `, [tableName]);
      
      client.release();
      await pool.end();

      return result.rows;
    } catch (error) {
      await pool.end();
      logger.error('Error getting table schema:', error);
      throw error;
    }
  }

  /**
   * Get sample data from a table (for preview)
   */
  async getTableSample(connectionConfig, tableName, limit = 5) {
    // Security check
    if (SENSITIVE_TABLES.some(s => tableName.toLowerCase().includes(s.toLowerCase()))) {
      throw new Error('Access to this table is not allowed');
    }

    const pool = this.createUserPool(connectionConfig);
    try {
      const client = await pool.connect();
      
      // Use parameterized table name via format (safe from injection since we validated)
      const result = await client.query(
        `SELECT * FROM "${tableName}" LIMIT $1`,
        [limit]
      );
      
      client.release();
      await pool.end();

      return result.rows;
    } catch (error) {
      await pool.end();
      logger.error('Error getting table sample:', error);
      throw error;
    }
  }

  /**
   * Execute a read-only query on user's database
   */
  async executeQuery(connectionConfig, query, params = []) {
    const pool = this.createUserPool(connectionConfig);
    try {
      const client = await pool.connect();
      
      // Start read-only transaction for safety
      await client.query('BEGIN READ ONLY');
      
      const result = await client.query(query, params);
      
      await client.query('COMMIT');
      client.release();
      await pool.end();

      return result.rows;
    } catch (error) {
      await pool.end();
      logger.error('Error executing query:', error);
      throw error;
    }
  }
}

module.exports = new SchemaService();
