/**
 * @file lease_manager.js
 * Distributed Epoch-based Lease Manager with fencing tokens to prevent
 * split-brain duplicate task executions and resource ownership conflicts.
 */

import { LeaseGrantResult } from '@krono/protocol';

export class LeaseManager {
  /**
   * @param {Object} [options]
   * @param {number} [options.defaultTtlMs=5000] Default lease TTL
   * @param {number} [options.clockDriftAllowanceMs=50]
   */
  constructor(options = {}) {
    this.defaultTtlMs = options.defaultTtlMs ?? 5000;
    this.clockDriftAllowanceMs = options.clockDriftAllowanceMs ?? 50;

    /** @type {Map<string, { holderNodeId: string, expiresAt: number, epoch: number, fencingToken: bigint }>} */
    this.leases = new Map();
    this.globalFencingCounter = 1n;
  }

  /**
   * Attempts to acquire or renew a distributed lease.
   * @param {string} leaseKey
   * @param {string} candidateNodeId
   * @param {number} [ttlMs]
   * @param {number} [expectedEpoch]
   * @returns {LeaseGrantResult}
   */
  acquireLease(leaseKey, candidateNodeId, ttlMs = this.defaultTtlMs, expectedEpoch = 0) {
    const now = Date.now();
    const existing = this.leases.get(leaseKey);

    // Case 1: Lease is unheld or has expired
    if (!existing || now >= existing.expiresAt) {
      const epoch = (existing ? existing.epoch : 0) + 1;
      const fencingToken = ++this.globalFencingCounter;
      const expiresAt = now + ttlMs;

      const leaseInfo = {
        holderNodeId: candidateNodeId,
        expiresAt,
        epoch,
        fencingToken
      };
      this.leases.set(leaseKey, leaseInfo);

      return new LeaseGrantResult({
        granted: true,
        leaseKey,
        holderNodeId: candidateNodeId,
        expiresAt,
        epoch,
        fencingToken
      });
    }

    // Case 2: Renewal by current holder
    if (existing.holderNodeId === candidateNodeId) {
      existing.expiresAt = now + ttlMs;
      return new LeaseGrantResult({
        granted: true,
        leaseKey,
        holderNodeId: candidateNodeId,
        expiresAt: existing.expiresAt,
        epoch: existing.epoch,
        fencingToken: existing.fencingToken
      });
    }

    // Case 3: Lease is actively held by another node
    return new LeaseGrantResult({
      granted: false,
      leaseKey,
      holderNodeId: existing.holderNodeId,
      expiresAt: existing.expiresAt,
      epoch: existing.epoch,
      fencingToken: existing.fencingToken
    });
  }

  /**
   * Validates if a fencing token is currently valid and fresh for a lease.
   * @param {string} leaseKey
   * @param {bigint|number} token
   * @returns {boolean}
   */
  validateFencingToken(leaseKey, token) {
    const existing = this.leases.get(leaseKey);
    if (!existing) return false;
    const now = Date.now();
    if (now >= existing.expiresAt) return false;
    return existing.fencingToken === BigInt(token);
  }

  /**
   * Explicitly releases a lease.
   * @param {string} leaseKey
   * @param {string} holderNodeId
   * @returns {boolean}
   */
  releaseLease(leaseKey, holderNodeId) {
    const existing = this.leases.get(leaseKey);
    if (existing && existing.holderNodeId === holderNodeId) {
      this.leases.delete(leaseKey);
      return true;
    }
    return false;
  }
}
