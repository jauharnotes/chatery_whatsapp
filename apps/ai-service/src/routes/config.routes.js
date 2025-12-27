const express = require('express');
const router = express.Router();
const connectionRepo = require('../repositories/connection.repo');
const tableConfigRepo = require('../repositories/table-config.repo');
const schemaService = require('../services/schema.service');
const logger = require('../utils/logger');

// =========================================
// DATABASE CONNECTIONS
// =========================================

/**
 * GET /api/config/connections
 * List all database connections
 */
router.get('/connections', async (req, res, next) => {
  try {
    const connections = await connectionRepo.findAll();
    res.json({ connections });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/config/connections
 * Create a new database connection
 */
router.post('/connections', async (req, res, next) => {
  try {
    const { name, host, port, database_name, username, password } = req.body;
    
    if (!name || !host || !database_name || !username || !password) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Test connection first
    const testResult = await schemaService.testConnection({
      host,
      port: port || 5432,
      database_name,
      username,
      password
    });

    if (!testResult.success) {
      return res.status(400).json({ error: `Connection failed: ${testResult.error}` });
    }

    const connection = await connectionRepo.create({
      name, host, port, database_name, username, password
    });

    res.status(201).json({ connection, message: 'Connection created and verified' });
  } catch (error) {
    next(error);
  }
});

/**
 * PUT /api/config/connections/:id
 * Update a database connection
 */
router.put('/connections/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, host, port, database_name, username, password } = req.body;

    // If password provided, test new connection
    if (password) {
      const testResult = await schemaService.testConnection({
        host,
        port: port || 5432,
        database_name,
        username,
        password
      });

      if (!testResult.success) {
        return res.status(400).json({ error: `Connection failed: ${testResult.error}` });
      }
    }

    const connection = await connectionRepo.update(id, {
      name, host, port, database_name, username, password
    });

    res.json({ connection });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/config/connections/:id
 * Delete a database connection
 */
router.delete('/connections/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    await connectionRepo.delete(id);
    res.json({ message: 'Connection deleted' });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/config/connections/:id/test
 * Test a database connection
 */
router.post('/connections/:id/test', async (req, res, next) => {
  try {
    const { id } = req.params;
    const connection = await connectionRepo.findById(id);
    
    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const result = await schemaService.testConnection(connection);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// =========================================
// TABLE DISCOVERY & CONFIGURATION
// =========================================

/**
 * GET /api/config/connections/:id/tables
 * Discover available tables in a database
 */
router.get('/connections/:id/tables', async (req, res, next) => {
  try {
    const { id } = req.params;
    const connection = await connectionRepo.findById(id);
    
    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const tables = await schemaService.discoverTables(connection);
    
    // Get current configurations for this connection
    const configs = await tableConfigRepo.findByConnectionId(id);
    const configMap = new Map(configs.map(c => [c.table_name, c]));

    // Merge discovered tables with configs
    const result = tables.map(t => ({
      ...t,
      configured: configMap.has(t.table_name),
      config: configMap.get(t.table_name) || null
    }));

    res.json({ tables: result });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/config/connections/:id/tables/:tableName/schema
 * Get schema for a specific table
 */
router.get('/connections/:id/tables/:tableName/schema', async (req, res, next) => {
  try {
    const { id, tableName } = req.params;
    const connection = await connectionRepo.findById(id);
    
    if (!connection) {
      return res.status(404).json({ error: 'Connection not found' });
    }

    const schema = await schemaService.getTableSchema(connection, tableName);
    const sample = await schemaService.getTableSample(connection, tableName, 3);

    res.json({ schema, sample });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/config/connections/:id/tables
 * Save table configurations for a connection
 */
router.post('/connections/:id/tables', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { tables } = req.body;
    
    if (!Array.isArray(tables)) {
      return res.status(400).json({ error: 'tables must be an array' });
    }

    const configs = await tableConfigRepo.saveConfigs(id, tables);
    res.json({ configs, message: `${configs.length} tables configured` });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/config/connections/:id/tables/configured
 * Get configured tables for a connection
 */
router.get('/connections/:id/tables/configured', async (req, res, next) => {
  try {
    const { id } = req.params;
    const configs = await tableConfigRepo.findByConnectionId(id);
    res.json({ tables: configs });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
