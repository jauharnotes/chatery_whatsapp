require('dotenv').config();

const requiredEnv = [
  'PORT',
  'DATABASE_URL',
  'OPENAI_API_KEY'
];

requiredEnv.forEach((key) => {
  if (!process.env[key]) {
    console.warn(`WARNING: Missing environment variable ${key}`);
  }
});

module.exports = {
  PORT: process.env.PORT || 3000,
  DATABASE_URL: process.env.DATABASE_URL,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  NODE_ENV: process.env.NODE_ENV || 'development'
};
