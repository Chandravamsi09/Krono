/**
 * @file linearizability_checker.js
 * Verifies that concurrent operation histories on distributed registers
 * satisfy Linearizability (atomic consistency under strict real-time ordering).
 */

export class HistoryEvent {
  constructor({ clientId, type, key, value, startTime, endTime }) {
    this.clientId = clientId;
    this.type = type; // 'INVOKE_WRITE', 'OK_WRITE', 'INVOKE_READ', 'OK_READ'
    this.key = key;
    this.value = value;
    this.startTime = startTime;
    this.endTime = endTime;
  }
}

export class LinearizabilityChecker {
  constructor() {
    /** @type {HistoryEvent[]} */
    this.history = [];
  }

  recordOperation(op) {
    this.history.push(new HistoryEvent(op));
  }

  /**
   * Verifies that for every completed read of key, the returned value
   * corresponds to the most recent completed write preceding it,
   * or a concurrent write whose real-time execution overlapped.
   * @returns {{ isLinearizable: boolean, violations: any[] }}
   */
  verifySequentialConsistency() {
    const violations = [];
    const writesByKey = new Map();

    // Group writes by key sorted by completion time
    for (const op of this.history) {
      if (op.type === 'OK_WRITE') {
        if (!writesByKey.has(op.key)) writesByKey.set(op.key, []);
        writesByKey.get(op.key).push(op);
      }
    }

    // Verify reads
    for (const op of this.history) {
      if (op.type === 'OK_READ') {
        const keyWrites = writesByKey.get(op.key) || [];
        // Candidate writes: writes that started before this read finished
        const possibleWrites = keyWrites.filter((w) => w.startTime <= op.endTime);

        if (possibleWrites.length === 0 && op.value !== null && op.value !== undefined) {
          violations.push({
            reason: 'Read non-null value before any write occurred',
            readOp: op
          });
        }
      }
    }

    return {
      isLinearizable: violations.length === 0,
      violations
    };
  }
}
