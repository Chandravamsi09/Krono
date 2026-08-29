/**
 * @file time_index.js
 * Time-based index file (.timeidx) mapping record timestamps to virtual offsets.
 * Each entry is 16 bytes: [Timestamp: 8 bytes] + [VirtualOffset: 8 bytes].
 */

import fs from 'node:fs';
import path from 'node:path';

export const TIME_INDEX_ENTRY_SIZE = 16;

export class TimeIndex {
  /**
   * @param {string} filepath Absolute path to time index file (.timeidx)
   */
  constructor(filepath) {
    this.filepath = filepath;
    this.fd = null;
    /** @type {Array<{ timestamp: bigint, offset: bigint }>} */
    this.entries = [];
    this.size = 0;
  }

  open() {
    const dir = path.dirname(this.filepath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const flag = fs.existsSync(this.filepath) ? 'r+' : 'w+';
    this.fd = fs.openSync(this.filepath, flag);
    const stats = fs.fstatSync(this.fd);
    this.size = stats.size;

    if (this.size > 0) {
      const buffer = Buffer.allocUnsafe(this.size);
      fs.readSync(this.fd, buffer, 0, this.size, 0);
      const count = Math.floor(this.size / TIME_INDEX_ENTRY_SIZE);
      this.entries = new Array(count);

      for (let i = 0; i < count; i++) {
        const pos = i * TIME_INDEX_ENTRY_SIZE;
        const timestamp = buffer.readBigUInt64BE(pos);
        const offset = buffer.readBigUInt64BE(pos + 8);
        this.entries[i] = { timestamp, offset };
      }
    }
  }

  append(timestamp, offset) {
    if (this.fd === null) throw new Error('TimeIndex file not open');

    const ts = BigInt(timestamp);
    const off = BigInt(offset);
    const buf = Buffer.allocUnsafe(TIME_INDEX_ENTRY_SIZE);
    buf.writeBigUInt64BE(ts, 0);
    buf.writeBigUInt64BE(off, 8);

    fs.writeSync(this.fd, buf, 0, TIME_INDEX_ENTRY_SIZE, this.size);
    this.size += TIME_INDEX_ENTRY_SIZE;
    this.entries.push({ timestamp: ts, offset: off });
  }

  lookup(targetTimestamp) {
    const target = BigInt(targetTimestamp);
    if (this.entries.length === 0) return null;

    let low = 0;
    let high = this.entries.length - 1;
    let best = null;

    while (low <= high) {
      const mid = (low + high) >>> 1;
      const entry = this.entries[mid];

      if (entry.timestamp >= target) {
        best = entry.offset;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    return best;
  }

  truncate(targetOffset) {
    const target = BigInt(targetOffset);
    let keepCount = 0;
    for (let i = 0; i < this.entries.length; i++) {
      if (this.entries[i].offset < target) {
        keepCount++;
      } else {
        break;
      }
    }

    this.entries = this.entries.slice(0, keepCount);
    this.size = keepCount * TIME_INDEX_ENTRY_SIZE;
    if (this.fd !== null) {
      fs.ftruncateSync(this.fd, this.size);
    }
  }

  flush() {
    if (this.fd !== null) {
      fs.fsyncSync(this.fd);
    }
  }

  close() {
    if (this.fd !== null) {
      this.flush();
      fs.closeSync(this.fd);
      this.fd = null;
    }
  }

  deleteFile() {
    this.close();
    if (fs.existsSync(this.filepath)) {
      fs.unlinkSync(this.filepath);
    }
  }
}
