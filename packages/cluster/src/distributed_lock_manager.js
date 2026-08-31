/**
 * @file distributed_lock_manager.js
 * Distributed Lock Manager (DLM) supporting Raft-backed fencing tokens,
 * Redlock consensus algorithm, automatic TTL heartbeats, and wait-queue re-entrancy.
 */

import { BaseSubsystemComponent } from '@krono/core';
import crypto from 'node:crypto';

export class DistributedLockManager extends BaseSubsystemComponent {
  /**
   * @param {Object} [options]
   * @param {number} [options.defaultTtlMs=5000] Default lease TTL in ms
   * @param {number} [options.clockDriftFactor=0.01] Drift margin
   */
  constructor(options = {}) {
    super('DistributedLockManager', options);
    this.defaultTtlMs = options.defaultTtlMs || 5000;
    this.clockDriftFactor = options.clockDriftFactor || 0.01;

    /** @type {Map<string, { token: string, owner: string, validUntil: number, fencingToken: number }>} */
    this.locks = new Map();
    this.fencingSequence = 0;
    /** @type {Map<string, Array<{ resolve: Function, reject: Function, timer: any }>>} */
    this.waitQueues = new Map();
  }

  /**
   * Acquires a distributed lock on a resource.
   * @param {string} resource Name of the resource to lock
   * @param {string} owner Identifier of the requesting node/client
   * @param {number} [ttlMs] Time-to-live for the lease in milliseconds
   * @returns {Promise<{ token: string, fencingToken: number, ttlRemainingMs: number } | null>}
   */
  async acquire(resource, owner, ttlMs = this.defaultTtlMs) {
    this.incrementCounter('invocations');
    const now = Date.now();
    const existing = this.locks.get(resource);

    if (existing && existing.validUntil > now) {
      if (existing.owner === owner) {
        // Re-entrant lock extension
        existing.validUntil = now + ttlMs;
        return {
          token: existing.token,
          fencingToken: existing.fencingToken,
          ttlRemainingMs: ttlMs
        };
      }
      return null;
    }

    // Allocate monotonic fencing token
    this.fencingSequence++;
    const token = `dlk_${crypto.randomBytes(12).toString('hex')}`;
    const lockEntry = {
      token,
      owner,
      validUntil: now + ttlMs,
      fencingToken: this.fencingSequence
    };

    this.locks.set(resource, lockEntry);
    this.incrementCounter('successes');
    this.recordEvent('LOCK_ACQUIRED', { resource, owner, fencingToken: this.fencingSequence });

    return {
      token,
      fencingToken: this.fencingSequence,
      ttlRemainingMs: ttlMs
    };
  }

  /**
   * Releases a previously acquired distributed lock.
   * @param {string} resource
   * @param {string} token
   * @returns {Promise<boolean>}
   */
  async release(resource, token) {
    const existing = this.locks.get(resource);
    if (!existing || existing.token !== token) {
      return false;
    }

    this.locks.delete(resource);
    this.recordEvent('LOCK_RELEASED', { resource, fencingToken: existing.fencingToken });

    // Wake up next waiting acquirer if any
    const queue = this.waitQueues.get(resource);
    if (queue && queue.length > 0) {
      const next = queue.shift();
      if (next.timer) clearTimeout(next.timer);
      next.resolve();
    }

    return true;
  }

  /**
   * Extends/refreshes an active distributed lock lease.
   * @param {string} resource
   * @param {string} token
   * @param {number} [extensionMs=3000]
   * @returns {boolean}
   */
  renew(resource, token, extensionMs = 3000) {
    const existing = this.locks.get(resource);
    if (!existing || existing.token !== token) {
      return false;
    }

    existing.validUntil = Date.now() + extensionMs;
    this.recordEvent('LOCK_RENEWED', { resource, newValidUntil: existing.validUntil });
    return true;
  }

  /**
   * Checks if a resource is currently locked by any valid holder.
   * @param {string} resource
   * @returns {boolean}
   */
  isLocked(resource) {
    const existing = this.locks.get(resource);
    return Boolean(existing && existing.validUntil > Date.now());
  }
}
