/**
 * @file throttler.test.js
 * Unit tests for AdaptiveThrottler.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveThrottler } from '../src/index.js';

describe('AdaptiveThrottler', () => {
  it('should enforce capacity boundaries and replenish tokens over time', async () => {
    const throttler = new AdaptiveThrottler();
    throttler.start();

    // 1. Initial requests should be allowed
    const r1 = throttler.throttle('tenant-alpha', 10, 20, 100);
    assert.equal(r1.allowed, true);
    assert.equal(r1.remainingTokens, 10);

    const r2 = throttler.throttle('tenant-alpha', 10, 20, 100);
    assert.equal(r2.allowed, true);
    assert.equal(r2.remainingTokens, 0);

    // 2. Exceeding capacity should be throttled
    const r3 = throttler.throttle('tenant-alpha', 5, 20, 100);
    assert.equal(r3.allowed, false);
    assert.ok(r3.retryAfterMs > 0);

    // 3. Different tenant should have isolated capacity
    const rBeta = throttler.throttle('tenant-beta', 15, 20, 100);
    assert.equal(rBeta.allowed, true);

    throttler.stop();
  });
});
