const app = require('./app');
const env = require('./config/env');
const { initDB } = require('./config/db');
const logger = require('./utils/logger');

// Initialize Database then start server
initDB().then(() => {
  app.listen(env.PORT, () => {
    logger.info(`Server running on port ${env.PORT}`);
    logger.info(`Environment: ${env.NODE_ENV}`);
  });
}).catch((err) => {
  logger.error('Failed to start server:', err);
  process.exit(1);
});
