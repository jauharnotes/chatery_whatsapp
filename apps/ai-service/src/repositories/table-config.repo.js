const { pool } = require('../config/db');

class TableConfigRepository {
  /**
   * Save table configurations for a connection
   */
  async saveConfigs(connectionId, tables) {
    // Delete existing configs for this connection
    await pool.query('DELETE FROM table_configs WHERE connection_id = $1', [connectionId]);
    
    // Insert new configs
    const results = [];
    for (const table of tables) {
      const result = await pool.query(`
        INSERT INTO table_configs (connection_id, table_name, display_name, description, searchable_columns, is_active)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `, [
        connectionId,
        table.table_name,
        table.display_name || table.table_name,
        table.description || '',
        table.searchable_columns || [],
        table.is_active !== false
      ]);
      results.push(result.rows[0]);
    }
    
    return results;
  }

  /**
   * Get all table configs for a connection
   */
  async findByConnectionId(connectionId) {
    const result = await pool.query(`
      SELECT * FROM table_configs 
      WHERE connection_id = $1 
      ORDER BY table_name
    `, [connectionId]);
    return result.rows;
  }

  /**
   * Get all active table configs for a connection
   */
  async findActiveByConnectionId(connectionId) {
    const result = await pool.query(`
      SELECT * FROM table_configs 
      WHERE connection_id = $1 AND is_active = true
      ORDER BY table_name
    `, [connectionId]);
    return result.rows;
  }

  /**
   * Toggle table active status
   */
  async setActive(id, isActive) {
    const result = await pool.query(`
      UPDATE table_configs 
      SET is_active = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `, [isActive, id]);
    return result.rows[0];
  }

  /**
   * Update a single table config
   */
  async update(id, { display_name, description, searchable_columns, is_active }) {
    const result = await pool.query(`
      UPDATE table_configs 
      SET display_name = COALESCE($1, display_name),
          description = COALESCE($2, description),
          searchable_columns = COALESCE($3, searchable_columns),
          is_active = COALESCE($4, is_active),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `, [display_name, description, searchable_columns, is_active, id]);
    return result.rows[0];
  }
}

module.exports = new TableConfigRepository();
