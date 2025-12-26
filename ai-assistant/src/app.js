const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const askRoutes = require('./routes/ask.routes');
const errorHandler = require('./middlewares/error.middleware');

const app = express();

// Middleware
app.use(helmet());
app.use(cors()); // Allow all by default for internal validation, restrict in prod
app.use(express.json()); // Parse JSON bodies
app.use(morgan('dev')); // Logger

// Routes
app.use('/api', askRoutes);

// Health Check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// Error handling
app.use(errorHandler);

module.exports = app;
