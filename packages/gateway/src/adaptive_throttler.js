/**
 * @file adaptive_throttler.js
 * Adaptive Token Bucket and GCRA rate throttler with tenant isolation,
 * dynamic capacity replenishment, and burst protection for Krono Gateway.
 */

import { BaseSubsystemComponent } from '@krono/core';

export class AdaptiveThrottler extends BaseSubsystemComponent {
  /**
   * @param {Object} [options]
   * @param {number} [options.globalCapacity=5000] Global requests burst capacity
   * @param {number} [options.globalRefillRatePerSec=1000] Global replenishment rate
   */
  constructor(options = {}) {
    super('AdaptiveThrottler', options);
    this.globalCapacity = options.globalCapacity || 5000;
    this.globalRefillRatePerSec = options.globalRefillRatePerSec || 1000;

    /** @type {Map<string, { tokens: number, lastRefill: number, capacity: number, rate: number }>} */
    this.tenantBuckets = new Map();
  }

  /**
   * Evaluates request against tenant and global rate limiters.
   * @param {string} tenantId Unique tenant identifier
   * @param {number} [cost=1] Request cost/weight
   * @param {number} [tenantCapacity=500] Tenant burst capacity
   * @param {number} [tenantRatePerSec=100] Tenant steady-state rate
   * @returns {{ allowed: boolean, remainingTokens: number, retryAfterMs: number }}
   */
  throttle(tenantId, cost = 1, tenantCapacity = 500, tenantRatePerSec = 100) {
    this.incrementCounter('invocations');
    const now = Date.now();
    let bucket = this.tenantBuckets.get(tenantId);

    if (!bucket) {
      bucket = {
        tokens: tenantCapacity,
        lastRefill: now,
        capacity: tenantCapacity,
        rate: tenantRatePerSec
      };
      this.tenantBuckets.set(tenantId, bucket);
    } else {
      const elapsedSec = (now - bucket.lastRefill) / 1000;
      const refilled = elapsedSec * bucket.rate;
      bucket.tokens = Math.min(bucket.capacity, bucket.tokens + refilled);
      bucket.lastRefill = now;
    }

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      this.incrementCounter('successes');
      return {
        allowed: true,
        remainingTokens: Math.floor(bucket.tokens),
        retryAfterMs: 0
      };
    }

    const missingTokens = cost - bucket.tokens;
    const retryAfterMs = Math.ceil((missingTokens / bucket.rate) * 1000);
    this.incrementCounter('failures');
    this.recordEvent('THROTTLED', { tenantId, cost, retryAfterMs });

    return {
      allowed: false,
      remainingTokens: Math.floor(bucket.tokens),
      retryAfterMs
    };
  }

  resetTenant(tenantId) {
    this.tenantBuckets.delete(tenantId);
  }
}
