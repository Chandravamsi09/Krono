/**
 * @file election_timer.js
 * Randomized Raft election timer with jitter to prevent split-vote deadlocks.
 */

import { EventEmitter } from 'node:events';
import { RaftDefaults } from './types.js';

export class ElectionTimer extends EventEmitter {
  /**
   * @param {Object} [options]
   * @param {number} [options.minTimeoutMs]
   * @param {number} [options.maxTimeoutMs]
   */
  constructor(options = {}) {
    super();
    this.minTimeoutMs = options.minTimeoutMs ?? RaftDefaults.MIN_ELECTION_TIMEOUT_MS;
    this.maxTimeoutMs = options.maxTimeoutMs ?? RaftDefaults.MAX_ELECTION_TIMEOUT_MS;
    this.timer = null;
    this.isRunning = false;
  }

  _getRandomTimeout() {
    return Math.floor(this.minTimeoutMs + Math.random() * (this.maxTimeoutMs - this.minTimeoutMs));
  }

  start() {
    this.stop();
    this.isRunning = true;
    this.reset();
  }

  reset() {
    if (!this.isRunning) return;

    if (this.timer) {
      clearTimeout(this.timer);
    }

    const timeout = this._getRandomTimeout();
    this.timer = setTimeout(() => {
      if (this.isRunning) {
        this.emit('timeout');
      }
    }, timeout);
  }

  stop() {
    this.isRunning = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
