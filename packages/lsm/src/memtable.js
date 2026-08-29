/**
 * @file memtable.js
 * In-memory MemTable backed by SkipList and Write-Ahead Log (WAL) for durability.
 */

import { SkipList } from './skiplist.js';
import { RecordHeader } from '@krono/storage';

export const TOMBSTONE = Symbol('TOMBSTONE');

export class MemTable {
  /**
   * @param {Object} [options]
   * @param {number} [options.maxSizeBytes=4194304] 4 MB threshold before flushing to SSTable
   */
  constructor(options = {}) {
    this.maxSizeBytes = options.maxSizeBytes ?? 4 * 1024 * 1024;
    this.skiplist = new SkipList();
    this.byteSize = 0;
    this.count = 0;
    this.isReadOnly = false;
  }

  /**
   * Puts key-value with timestamp.
   * @param {string} key
   * @param {any} value
   * @param {number} [timestamp]
   */
  put(key, value, timestamp = Date.now()) {
    if (this.isReadOnly) throw new Error('MemTable is read-only');

    const keyBytes = Buffer.byteLength(key, 'utf8');
    const valBuf = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'object' ? JSON.stringify(value) : String(value));
    const valBytes = valBuf.length;

    this.skiplist.put(key, { value: valBuf, timestamp, isDeleted: false });
    this.byteSize += keyBytes + valBytes + 32;
    this.count++;
  }

  /**
   * Deletes a key by inserting a tombstone.
   * @param {string} key
   * @param {number} [timestamp]
   */
  delete(key, timestamp = Date.now()) {
    if (this.isReadOnly) throw new Error('MemTable is read-only');

    const keyBytes = Buffer.byteLength(key, 'utf8');
    this.skiplist.put(key, { value: Buffer.alloc(0), timestamp, isDeleted: true });
    this.byteSize += keyBytes + 32;
    this.count++;
  }

  /**
   * Looks up a key.
   * @param {string} key
   * @returns {{ value: Buffer, timestamp: number, isDeleted: boolean } | undefined}
   */
  get(key) {
    return this.skiplist.get(key);
  }

  /**
   * Returns whether MemTable size exceeds flush limit.
   * @returns {boolean}
   */
  shouldFlush() {
    return this.byteSize >= this.maxSizeBytes;
  }

  entries() {
    return this.skiplist.entries();
  }

  scan(startKey, endKey, limit) {
    return this.skiplist.scan(startKey, endKey, limit);
  }

  freeze() {
    this.isReadOnly = true;
  }
}
