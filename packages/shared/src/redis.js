/**
 * Shared Redis Client and Cache Utilities
 * @chatery/shared
 */

const Redis = require('ioredis');
const crypto = require('crypto');

/**
 * Create a Redis client with sensible defaults
 */
const createRedisClient = (options = {}) => {
  const client = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    enableReadyCheck: true,
    ...options
  });

  client.on('error', (err) => {
    console.error('[Redis] Connection error:', err.message);
  });

  client.on('connect', () => {
    console.log('[Redis] Connected successfully');
  });

  return client;
};

/**
 * Cache helper with automatic JSON serialization
 */
const cacheHelper = {
  /**
   * Get value from cache
   */
  async get(redis, key) {
    try {
      const data = await redis.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('[Cache] Get error:', error.message);
      return null;
    }
  },

  /**
   * Set value in cache with TTL
   */
  async set(redis, key, value, ttlSeconds = 300) {
    try {
      await redis.setex(key, ttlSeconds, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('[Cache] Set error:', error.message);
      return false;
    }
  },

  /**
   * Delete value from cache
   */
  async del(redis, key) {
    try {
      await redis.del(key);
      return true;
    } catch (error) {
      console.error('[Cache] Del error:', error.message);
      return false;
    }
  },

  /**
   * Generate hash key from string
   */
  hashKey(input) {
    return crypto.createHash('md5').update(input).digest('hex');
  },

  /**
   * Get or set pattern - fetch from cache or compute and cache
   */
  async getOrSet(redis, key, ttlSeconds, computeFn) {
    const cached = await this.get(redis, key);
    if (cached !== null) {
      return { data: cached, fromCache: true };
    }

    const computed = await computeFn();
    await this.set(redis, key, computed, ttlSeconds);
    return { data: computed, fromCache: false };
  }
};

/**
 * Rate limiter using Redis sliding window
 */
const rateLimiter = {
  /**
   * Check if request is allowed
   * @param redis - Redis client
   * @param key - Unique identifier (e.g., phone number)
   * @param limit - Max requests
   * @param windowSeconds - Time window in seconds
   * @returns {allowed: boolean, remaining: number, resetIn: number}
   */
  async check(redis, key, limit = 30, windowSeconds = 60) {
    const now = Date.now();
    const windowKey = `ratelimit:${key}`;
    
    try {
      const multi = redis.multi();
      
      // Remove old entries outside window
      multi.zremrangebyscore(windowKey, 0, now - windowSeconds * 1000);
      
      // Count current entries
      multi.zcard(windowKey);
      
      // Add current request
      multi.zadd(windowKey, now, `${now}`);
      
      // Set expiry on the key
      multi.expire(windowKey, windowSeconds);
      
      const results = await multi.exec();
      const currentCount = results[1][1];
      
      if (currentCount >= limit) {
        // Get oldest entry to calculate reset time
        const oldest = await redis.zrange(windowKey, 0, 0, 'WITHSCORES');
        const resetIn = oldest.length > 1 
          ? Math.ceil((parseInt(oldest[1]) + windowSeconds * 1000 - now) / 1000)
          : windowSeconds;
        
        return {
          allowed: false,
          remaining: 0,
          resetIn
        };
      }

      return {
        allowed: true,
        remaining: limit - currentCount - 1,
        resetIn: windowSeconds
      };
    } catch (error) {
      console.error('[RateLimiter] Error:', error.message);
      // Fail open - allow request if Redis is down
      return { allowed: true, remaining: limit, resetIn: windowSeconds };
    }
  }
};

module.exports = {
  createRedisClient,
  cacheHelper,
  rateLimiter
};
