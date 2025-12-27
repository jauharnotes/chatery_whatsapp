/**
 * Shared utilities for Chatery WhatsApp ecosystem
 */

// Common sensitive tables list
const SENSITIVE_TABLES = [
  'users', 'admins', 'passwords', 'secrets', 'tokens',
  'api_keys', 'credentials', 'sessions', 'auth',
  'SequelizeMeta', 'migrations'
];

// Format phone number for WhatsApp
const formatPhoneNumber = (phone) => {
  let formatted = phone.replace(/\D/g, '');
  if (formatted.startsWith('0')) {
    formatted = '62' + formatted.slice(1);
  }
  return formatted;
};

// Validate Indonesian phone number
const isValidIndonesianPhone = (phone) => {
  const cleaned = phone.replace(/\D/g, '');
  return /^(62|08)\d{8,13}$/.test(cleaned);
};

// Redis utilities
const { createRedisClient, cacheHelper, rateLimiter } = require('./redis');

module.exports = {
  SENSITIVE_TABLES,
  formatPhoneNumber,
  isValidIndonesianPhone,
  createRedisClient,
  cacheHelper,
  rateLimiter
};
