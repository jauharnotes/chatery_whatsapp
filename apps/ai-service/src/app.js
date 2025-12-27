const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const askRoutes = require('./routes/ask.routes');
const configRoutes = require('./routes/config.routes');
const errorHandler = require('./middlewares/error.middleware');
const { createRedisClient } = require('@chatery/shared');

const app = express();

// Initialize Redis client
const redis = createRedisClient();
app.set('redis', redis);

// Middleware
app.use(helmet());
app.use(cors());
app.use(compression()); // Gzip compression
app.use(express.json());
app.use(morgan('dev'));

// Routes
app.use('/api', askRoutes);
app.use('/api/config', configRoutes);

// Health Check with cache status
app.get('/health', async (req, res) => {
  const redis = req.app.get('redis');
  let redisStatus = 'disconnected';
  
  try {
    await redis.ping();
    redisStatus = 'connected';
  } catch (e) {
    redisStatus = 'error';
  }
  
  res.json({ 
    status: 'ok', 
    uptime: process.uptime(),
    cache: redisStatus
  });
});

// Error handling
app.use(errorHandler);

module.exports = app;
