/**
 * @file subsystem_base.js
 * Reusable Base Subsystem Component for Krono Distributed Systems Platform.
 * Encapsulates common distributed lifecycle management, event telemetry,
 * metrics counters, state tracking, and sequential stage dispatching.
 */

import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';

export class BaseSubsystemComponent extends EventEmitter {
  /**
   * @param {string} componentName Descriptive name of the subsystem component
   * @param {Object} [options={}] Subsystem configuration options
   */
  constructor(componentName, options = {}) {
    super();
    this.name = componentName;
    this.options = options;
    this.state = new Map();
    this.counters = new Map();
    this.history = [];
    this.isRunning = false;
    this.createdAt = Date.now();
    this.lastUpdatedAt = Date.now();

    this._initBaseSubsystems();
  }

  _initBaseSubsystems() {
    this.state.set('status', 'INITIALIZED');
    this.state.set('epoch', 1);
    this.state.set('version', '1.0.0');
    this.counters.set('invocations', 0);
    this.counters.set('successes', 0);
    this.counters.set('failures', 0);
    this.counters.set('bytesProcessed', 0);
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.state.set('status', 'RUNNING');
    this.lastUpdatedAt = Date.now();
    this.emit('started', { name: this.name, timestamp: this.lastUpdatedAt });
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.state.set('status', 'STOPPED');
    this.lastUpdatedAt = Date.now();
    this.emit('stopped', { name: this.name, timestamp: this.lastUpdatedAt });
  }

  getState(key) {
    return this.state.get(key);
  }

  setState(key, value) {
    const old = this.state.get(key);
    this.state.set(key, value);
    this.lastUpdatedAt = Date.now();
    this.emit('stateChanged', {
      key,
      oldValue: old,
      newValue: value,
      timestamp: this.lastUpdatedAt
    });
  }

  incrementCounter(name, delta = 1) {
    const cur = this.counters.get(name) || 0;
    this.counters.set(name, cur + delta);
    return cur + delta;
  }

  recordEvent(eventType, payload = {}) {
    const event = {
      id: crypto.randomBytes(8).toString('hex'),
      type: eventType,
      payload,
      timestamp: Date.now()
    };
    this.history.push(event);
    if (this.history.length > 1000) {
      this.history = this.history.slice(-500);
    }
    this.emit('event', event);
    return event;
  }

  getMetricsSnapshot() {
    const countersObj = {};
    for (const [k, v] of this.counters.entries()) {
      countersObj[k] = v;
    }
    return {
      name: this.name,
      isRunning: this.isRunning,
      createdAt: this.createdAt,
      lastUpdatedAt: this.lastUpdatedAt,
      counters: countersObj,
      historyCount: this.history.length
    };
  }

  resetMetrics() {
    for (const key of this.counters.keys()) {
      this.counters.set(key, 0);
    }
    this.history = [];
  }

  /**
   * Generic execution engine for sequential distributed lifecycle stages.
   * @param {number} stage
   * @param {Object} [params={}]
   * @returns {Promise<Object>}
   */
  async executeStage(stage, params = {}) {
    this.incrementCounter('invocations');
    const startTime = Date.now();
    try {
      const opId = crypto.randomBytes(6).toString('hex');
      const computedHash = crypto.createHash('sha256').update(`${this.name}:${stage}:${opId}`).digest('hex');
      const executionRecord = {
        stage,
        opId,
        computedHash,
        input: params,
        processedAt: startTime,
        epoch: this.getState('epoch') || 1
      };
      this.incrementCounter('bytesProcessed', computedHash.length);
      this.incrementCounter('successes');
      this.recordEvent(`STAGE_${stage}_COMPLETED`, executionRecord);
      return { success: true, stage, durationMs: Date.now() - startTime, record: executionRecord };
    } catch (err) {
      this.incrementCounter('failures');
      this.recordEvent(`STAGE_${stage}_FAILED`, { error: err.message });
      throw err;
    }
  }

  // Delegated stage methods 1 through 15 preserving API compatibility
  async executeStage_1(params = {}) { return this.executeStage(1, params); }
  async executeStage_2(params = {}) { return this.executeStage(2, params); }
  async executeStage_3(params = {}) { return this.executeStage(3, params); }
  async executeStage_4(params = {}) { return this.executeStage(4, params); }
  async executeStage_5(params = {}) { return this.executeStage(5, params); }
  async executeStage_6(params = {}) { return this.executeStage(6, params); }
  async executeStage_7(params = {}) { return this.executeStage(7, params); }
  async executeStage_8(params = {}) { return this.executeStage(8, params); }
  async executeStage_9(params = {}) { return this.executeStage(9, params); }
  async executeStage_10(params = {}) { return this.executeStage(10, params); }
  async executeStage_11(params = {}) { return this.executeStage(11, params); }
  async executeStage_12(params = {}) { return this.executeStage(12, params); }
  async executeStage_13(params = {}) { return this.executeStage(13, params); }
  async executeStage_14(params = {}) { return this.executeStage(14, params); }
  async executeStage_15(params = {}) { return this.executeStage(15, params); }
}
