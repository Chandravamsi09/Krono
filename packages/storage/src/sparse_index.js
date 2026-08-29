/**
 * @file sparse_index.js
 * High-performance sparse index file (.idx) mapping virtual message offsets
 * to 64-bit physical byte positions in the append-only log file.
 * Each entry is 16 bytes: [VirtualOffset: 8 bytes] + [PhysicalPosition: 8 bytes].
 */

import fs from 'node:fs';
import path from 'node:path';

export const INDEX_ENTRY_SIZE = 16;

export class SparseIndex {
  /**
   * @param {string} filepath Absolute path to index file (.idx)
   * @param {bigint} baseOffset Starting offset of this segment
   */
  constructor(filepath, baseOffset = 0n) {
    this.filepath = filepath;
    this.baseOffset = BigInt(baseOffset);
    this.fd = null;
    /** @type {Array<{ offset: bigint, position: number }>} In-memory index cache */
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
      const count = Math.floor(this.size / INDEX_ENTRY_SIZE);
      this.entries = new Array(count);

      for (let i = 0; i < count; i++) {
        const pos = i * INDEX_ENTRY_SIZE;
        const offset = buffer.readBigUInt64BE(pos);
        const position = Number(buffer.readBigUInt64BE(pos + 8));
        this.entries[i] = { offset, position };
      }
    }
  }

  append(offset, position) {
    if (this.fd === null) throw new Error('Index file not open');

    const off = BigInt(offset);
    const buf = Buffer.allocUnsafe(INDEX_ENTRY_SIZE);
    buf.writeBigUInt64BE(off, 0);
    buf.writeBigUInt64BE(BigInt(position), 8);

    fs.writeSync(this.fd, buf, 0, INDEX_ENTRY_SIZE, this.size);
    this.size += INDEX_ENTRY_SIZE;
    this.entries.push({ offset: off, position });
  }

  lookup(targetOffset) {
    const target = BigInt(targetOffset);
    if (this.entries.length === 0) return null;

    let low = 0;
    let high = this.entries.length - 1;
    let best = null;

    while (low <= high) {
      const mid = (low + high) >>> 1;
      const entry = this.entries[mid];

      if (entry.offset === target) {
        return entry;
      } else if (entry.offset < target) {
        best = entry;
        low = mid + 1;
      } else {
        high = mid - 1;
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
    this.size = keepCount * INDEX_ENTRY_SIZE;
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
