const { pool } = require('../config/db');
const crypto = require('crypto');

// Simple encryption for database passwords (in production, use a proper secrets manager)
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-in-production!';

const encrypt = (text) => {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
};

const decrypt = (text) => {
  const [ivHex, encrypted] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const key = crypto.scryptSync(ENCRYPTION_KEY, 'salt', 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
};

class ConnectionRepository {
  /**
   * Create a new database connection
   */
  async create({ name, host, port, database_name, username, password }) {
    const encryptedPassword = encrypt(password);
    const result = await pool.query(`
      INSERT INTO database_connections (name, host, port, database_name, username, password_encrypted)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, name, host, port, database_name, username, is_active, created_at
    `, [name, host, port || 5432, database_name, username, encryptedPassword]);
    
    return result.rows[0];
  }

  /**
   * Get all connections (without passwords)
   */
  async findAll() {
    const result = await pool.query(`
      SELECT id, name, host, port, database_name, username, is_active, created_at, updated_at
      FROM database_connections
      ORDER BY created_at DESC
    `);
    return result.rows;
  }

  /**
   * Get connection by ID (with decrypted password for internal use)
   */
  async findById(id) {
    const result = await pool.query(`
      SELECT * FROM database_connections WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) return null;
    
    const conn = result.rows[0];
    return {
      ...conn,
      password: decrypt(conn.password_encrypted)
    };
  }

  /**
   * Update connection
   */
  async update(id, { name, host, port, database_name, username, password }) {
    let query, values;
    
    if (password) {
      const encryptedPassword = encrypt(password);
      query = `
        UPDATE database_connections 
        SET name = $1, host = $2, port = $3, database_name = $4, username = $5, 
            password_encrypted = $6, updated_at = CURRENT_TIMESTAMP
        WHERE id = $7
        RETURNING id, name, host, port, database_name, username, is_active, updated_at
      `;
      values = [name, host, port || 5432, database_name, username, encryptedPassword, id];
    } else {
      query = `
        UPDATE database_connections 
        SET name = $1, host = $2, port = $3, database_name = $4, username = $5, 
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
        RETURNING id, name, host, port, database_name, username, is_active, updated_at
      `;
      values = [name, host, port || 5432, database_name, username, id];
    }
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Delete connection
   */
  async delete(id) {
    await pool.query('DELETE FROM database_connections WHERE id = $1', [id]);
  }

  /**
   * Toggle active status
   */
  async setActive(id, isActive) {
    const result = await pool.query(`
      UPDATE database_connections 
      SET is_active = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [isActive, id]);
    return result.rows[0];
  }
}

module.exports = new ConnectionRepository();
