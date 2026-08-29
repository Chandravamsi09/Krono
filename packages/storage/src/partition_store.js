/**
 * @file partition_store.js
 * Multi-topic PartitionStore managing segmented logs across partitions.
 */

import path from 'node:path';
import fs from 'node:fs';
import { SegmentedLog } from './segmented_log.js';
import { RecordFlags } from './record_header.js';

export class PartitionStore {
  /**
   * @param {Object} options
   * @param {string} options.dataDir Root data directory
   * @param {number} [options.maxSegmentBytes]
   * @param {number} [options.retentionMs]
   */
  constructor(options) {
    this.dataDir = options.dataDir;
    this.maxSegmentBytes = options.maxSegmentBytes;
    this.retentionMs = options.retentionMs;

    /** @type {Map<string, SegmentedLog>} Key: `${topic}/${partitionId}` */
    this.logs = new Map();
    this.isOpen = false;
  }

  open() {
    if (this.isOpen) return;

    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    this.isOpen = true;
  }

  /**
   * Gets or initializes the segmented log for a given topic & partition.
   * @param {string} topic
   * @param {number} partitionId
   * @returns {SegmentedLog}
   */
  getOrCreateLog(topic, partitionId) {
    const key = `${topic}/${partitionId}`;
    let log = this.logs.get(key);
    if (!log) {
      const partitionDir = path.join(this.dataDir, 'topics', topic, `partition-${partitionId}`);
      log = new SegmentedLog({
        dir: partitionDir,
        maxSegmentBytes: this.maxSegmentBytes,
        retentionMs: this.retentionMs
      });
      log.open();
      this.logs.set(key, log);
    }
    return log;
  }

  /**
   * Appends a batch of records to a partition.
   * @param {string} topic
   * @param {number} partitionId
   * @param {Array<{ key: Buffer|string, value: Buffer|string, flags?: number }>} records
   * @returns {{ baseOffset: bigint, count: number }}
   */
  appendBatch(topic, partitionId, records) {
    const log = this.getOrCreateLog(topic, partitionId);
    let baseOffset = 0n;

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const offset = log.append(r.key, r.value, r.flags ?? RecordFlags.NONE);
      if (i === 0) baseOffset = offset;
    }

    return { baseOffset, count: records.length };
  }

  /**
   * Reads records from partition starting at offset.
   * @param {string} topic
   * @param {number} partitionId
   * @param {bigint|number} fromOffset
   * @param {number} [maxBytes]
   * @param {number} [maxCount]
   * @returns {Array<any>}
   */
  fetch(topic, partitionId, fromOffset, maxBytes = 1048576, maxCount = 1000) {
    const log = this.getOrCreateLog(topic, partitionId);
    return log.readRange(fromOffset, maxBytes, maxCount);
  }

  flushAll() {
    for (const log of this.logs.values()) {
      log.flush();
    }
  }

  close() {
    if (this.isOpen) {
      for (const log of this.logs.values()) {
        log.close();
      }
      this.logs.clear();
      this.isOpen = false;
    }
  }
}
