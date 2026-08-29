/**
 * @file vector_clock.js
 * Distributed Vector Clock implementation for tracking causal relationships,
 * partial orderings, and concurrent conflict detection across cluster nodes.
 */

export const ClockComparison = {
  EQUAL: 'EQUAL',
  BEFORE: 'BEFORE',       // this clock causally precedes other
  AFTER: 'AFTER',         // this clock causally succeeds other
  CONCURRENT: 'CONCURRENT' // conflict / parallel branching
};

export class VectorClock {
  /**
   * @param {Record<string, number>} [initialMap]
   */
  constructor(initialMap = {}) {
    /** @type {Map<string, number>} */
    this.entries = new Map();
    for (const [nodeId, counter] of Object.entries(initialMap)) {
      if (typeof counter === 'number' && counter >= 0) {
        this.entries.set(nodeId, Math.floor(counter));
      }
    }
  }

  /**
   * Increments the logical counter for a given node.
   * @param {string} nodeId
   * @returns {number} The new counter value
   */
  increment(nodeId) {
    const current = this.entries.get(nodeId) || 0;
    const updated = current + 1;
    this.entries.set(nodeId, updated);
    return updated;
  }

  /**
   * Gets the counter for a node (defaults to 0).
   * @param {string} nodeId
   * @returns {number}
   */
  get(nodeId) {
    return this.entries.get(nodeId) || 0;
  }

  /**
   * Sets the counter explicitly for a node.
   * @param {string} nodeId
   * @param {number} value
   */
  set(nodeId, value) {
    this.entries.set(nodeId, Math.max(0, Math.floor(value)));
  }

  /**
   * Merges another vector clock into this one by taking pointwise maximums.
   * @param {VectorClock|Record<string, number>} other
   * @returns {VectorClock} this instance for chaining
   */
  merge(other) {
    const otherEntries = other instanceof VectorClock ? other.entries : new Map(Object.entries(other));
    for (const [nodeId, otherVal] of otherEntries.entries()) {
      const currentVal = this.entries.get(nodeId) || 0;
      this.entries.set(nodeId, Math.max(currentVal, otherVal));
    }
    return this;
  }

  /**
   * Compares this vector clock with another.
   * @param {VectorClock} other
   * @returns {string} One of ClockComparison enum values
   */
  compare(other) {
    let hasGreater = false;
    let hasLesser = false;

    // Collect all unique node IDs across both clocks
    const allNodes = new Set([...this.entries.keys(), ...other.entries.keys()]);

    for (const node of allNodes) {
      const v1 = this.get(node);
      const v2 = other.get(node);

      if (v1 > v2) hasGreater = true;
      if (v1 < v2) hasLesser = true;

      // If one is greater on one node and lesser on another, they are concurrent
      if (hasGreater && hasLesser) {
        return ClockComparison.CONCURRENT;
      }
    }

    if (hasGreater) return ClockComparison.AFTER;
    if (hasLesser) return ClockComparison.BEFORE;
    return ClockComparison.EQUAL;
  }

  isConcurrentWith(other) {
    return this.compare(other) === ClockComparison.CONCURRENT;
  }

  isBefore(other) {
    return this.compare(other) === ClockComparison.BEFORE;
  }

  isAfter(other) {
    return this.compare(other) === ClockComparison.AFTER;
  }

  clone() {
    const clone = new VectorClock();
    for (const [k, v] of this.entries.entries()) {
      clone.entries.set(k, v);
    }
    return clone;
  }

  toJSON() {
    const obj = {};
    for (const [k, v] of this.entries.entries()) {
      obj[k] = v;
    }
    return obj;
  }

  toString() {
    return JSON.stringify(this.toJSON());
  }

  static fromJSON(json) {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    return new VectorClock(parsed);
  }
}
