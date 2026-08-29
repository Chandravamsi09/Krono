/**
 * @file rate_limiter.js
 * Sliding Window Token Bucket rate limiter.
 */

export class RateLimiter {
  /**
   * @param {Object} [options]
   * @param {number} [options.capacity=1000] Maximum token capacity
   * @param {number} [options.refillRatePerSec=100] Tokens added per second
   */
  constructor(options = {}) {
    this.capacity = options.capacity ?? 1000;
    this.refillRatePerSec = options.refillRatePerSec ?? 100;
    /** @type {Map<string, { tokens: number, lastRefill: number }>} */
    this.buckets = new Map();
  }

  /**
   * Tries to consume tokens for a given key.
   * @param {string} key
   * @param {number} [tokens=1]
   * @returns {boolean} True if allowed, false if rate limited
   */
  tryConsume(key, tokens = 1) {
    const now = Date.now();
    let bucket = this.buckets.get(key);

    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefill: now };
      this.buckets.set(key, bucket);
    } else {
      // Refill tokens
      const elapsedSec = (now - bucket.lastRefill) / 1000;
      const refilled = elapsedSec * this.refillRatePerSec;
      bucket.tokens = Math.min(this.capacity, bucket.tokens + refilled);
      bucket.lastRefill = now;
    }

    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      return true;
    }

    return false;
  }
}
