/**
 * @file lock.test.js
 * Unit tests for DistributedLockManager.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DistributedLockManager } from '../src/index.js';

describe('DistributedLockManager', () => {
  it('should acquire, verify, renew, and release distributed locks with monotonic fencing tokens', async () => {
    const dlm = new DistributedLockManager({ defaultTtlMs: 2000 });
    dlm.start();

    // 1. Acquire lock
    const lock = await dlm.acquire('database:user:42', 'node-1', 1500);
    assert.ok(lock);
    assert.ok(lock.token.startsWith('dlk_'));
    assert.equal(lock.fencingToken, 1);
    assert.equal(dlm.isLocked('database:user:42'), true);

    // 2. Competing acquire should fail
    const competing = await dlm.acquire('database:user:42', 'node-2', 1500);
    assert.equal(competing, null);

    // 3. Renew lock
    const renewed = dlm.renew('database:user:42', lock.token, 3000);
    assert.equal(renewed, true);

    // 4. Release lock
    const released = await dlm.release('database:user:42', lock.token);
    assert.equal(released, true);
    assert.equal(dlm.isLocked('database:user:42'), false);

    // 5. Subsequent acquire should succeed with incremented fencing token
    const lock2 = await dlm.acquire('database:user:42', 'node-2', 1500);
    assert.ok(lock2);
    assert.equal(lock2.fencingToken, 2);

    await dlm.release('database:user:42', lock2.token);
    dlm.stop();
  });
});
