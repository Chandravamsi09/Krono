/**
 * @file linearizable_read.js
 * ReadIndex protocol implementation ensuring linearizable read consistency
 * without issuing disk writes.
 */

export class ReadIndexManager {
  constructor() {
    /** @type {Map<number, { readIndex: number, acks: Set<string>, resolve: Function, reject: Function }>} */
    this.pendingReads = new Map();
    this.nextReadId = 1;
  }

  /**
   * Registers a new ReadIndex request at leader's current commitIndex.
   * @param {number} currentCommitIndex
   * @param {string} leaderId
   * @returns {{ readId: number, promise: Promise<number> }}
   */
  registerRead(currentCommitIndex, leaderId) {
    const readId = this.nextReadId++;
    const acks = new Set([leaderId]);

    let resolve, reject;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });

    this.pendingReads.set(readId, {
      readIndex: currentCommitIndex,
      acks,
      resolve,
      reject
    });

    return { readId, promise };
  }

  /**
   * Records heartbeat ack from peer for pending reads.
   * @param {string} peerId
   * @param {number} requiredQuorum
   */
  recordHeartbeatAck(peerId, requiredQuorum) {
    for (const [readId, item] of this.pendingReads.entries()) {
      item.acks.add(peerId);
      if (item.acks.size >= requiredQuorum) {
        item.resolve(item.readIndex);
        this.pendingReads.delete(readId);
      }
    }
  }

  abortAll(err) {
    for (const item of this.pendingReads.values()) {
      item.reject(err);
    }
    this.pendingReads.clear();
  }
}
