/**
 * @file dead_letter_queue.js
 * Dead-Letter Queue (DLQ) with Exponential Backoff + Full Jitter calculation
 * and poison pill quarantining.
 */

export class DeadLetterQueue {
  /**
   * @param {Object} [options]
   * @param {number} [options.baseBackoffMs=1000]
   * @param {number} [options.maxBackoffMs=60000]
   */
  constructor(options = {}) {
    this.baseBackoffMs = options.baseBackoffMs ?? 1000;
    this.maxBackoffMs = options.maxBackoffMs ?? 60000;

    /** @type {Map<string, { item: any, failures: number, lastError: any, quarantinedAt: number }>} */
    this.quarantined = new Map();
  }

  /**
   * Computes exponential backoff with full jitter.
   * Backoff = Uniform(0, min(maxBackoff, base * 2^attempt))
   * @param {number} attempt
   * @returns {number} Delay in milliseconds
   */
  calculateBackoff(attempt) {
    const exp = Math.min(this.maxBackoffMs, this.baseBackoffMs * Math.pow(2, attempt));
    return Math.floor(Math.random() * exp);
  }

  /**
   * Quarantines a poisoned item.
   * @param {string} id
   * @param {any} item
   * @param {any} error
   */
  quarantine(id, item, error) {
    const existing = this.quarantined.get(id);
    const failures = (existing ? existing.failures : 0) + 1;

    this.quarantined.set(id, {
      item,
      failures,
      lastError: error,
      quarantinedAt: Date.now()
    });
  }

  getQuarantinedItems() {
    return Array.from(this.quarantined.entries()).map(([id, meta]) => ({
      id,
      ...meta
    }));
  }

  retryQuarantined(id) {
    const meta = this.quarantined.get(id);
    if (meta) {
      this.quarantined.delete(id);
      return meta.item;
    }
    return null;
  }
}
