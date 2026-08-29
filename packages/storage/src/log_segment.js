/**
 * @file log_segment.js
 * LogSegment encapsulating .log, .idx, and .timeidx files for a base offset chunk.
 */

import fs from 'node:fs';
import path from 'node:path';
import { RecordHeader, RECORD_HEADER_SIZE, RecordFlags } from './record_header.js';
import { SparseIndex } from './sparse_index.js';
import { TimeIndex } from './time_index.js';

export class LogSegment {
  /**
   * @param {Object} options
   * @param {string} options.dir Base directory for partition segments
   * @param {bigint|number} options.baseOffset Monotonic base offset of segment
   * @param {number} [options.indexIntervalBytes=4096] Frequency of sparse index entries
   * @param {number} [options.maxSegmentBytes=536870912] 512 MB max segment size
   */
  constructor(options) {
    this.dir = options.dir;
    this.baseOffset = BigInt(options.baseOffset);
    this.indexIntervalBytes = options.indexIntervalBytes ?? 4096;
    this.maxSegmentBytes = options.maxSegmentBytes ?? 536870912;

    const offsetStr = this.baseOffset.toString().padStart(20, '0');
    this.logFile = path.join(this.dir, `${offsetStr}.log`);
    this.idxFile = path.join(this.dir, `${offsetStr}.idx`);
    this.timeIdxFile = path.join(this.dir, `${offsetStr}.timeidx`);

    this.fd = null;
    this.size = 0;
    this.bytesSinceLastIndex = 0;
    this.nextOffset = this.baseOffset;
    this.isOpen = false;

    this.index = new SparseIndex(this.idxFile, this.baseOffset);
    this.timeIndex = new TimeIndex(this.timeIdxFile);
  }

  open() {
    if (this.isOpen) return;

    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }

    const flag = fs.existsSync(this.logFile) ? 'r+' : 'w+';
    this.fd = fs.openSync(this.logFile, flag);
    const stats = fs.fstatSync(this.fd);
    this.size = stats.size;

    this.index.open();
    this.timeIndex.open();
    this.isOpen = true;

    this._recoverNextOffset();
  }

  _recoverNextOffset() {
    if (this.size === 0) {
      this.nextOffset = this.baseOffset;
      return;
    }

    const lastEntry = this.index.entries.length > 0
      ? this.index.entries[this.index.entries.length - 1]
      : { offset: this.baseOffset, position: 0 };

    let pos = lastEntry.position;
    const buf = Buffer.allocUnsafe(Math.min(1024 * 1024, this.size - pos));

    while (pos < this.size) {
      const bytesToRead = Math.min(buf.length, this.size - pos);
      fs.readSync(this.fd, buf, 0, bytesToRead, pos);

      let bufOffset = 0;
      while (bufOffset + RECORD_HEADER_SIZE <= bytesToRead) {
        try {
          const { header, recordBytes } = RecordHeader.deserializeRecord(buf, bufOffset);
          this.nextOffset = header.offset + 1n;
          bufOffset += recordBytes;
          pos += recordBytes;
        } catch (err) {
          fs.ftruncateSync(this.fd, pos);
          this.size = pos;
          this.index.truncate(this.nextOffset);
          this.timeIndex.truncate(this.nextOffset);
          return;
        }
      }
      if (bufOffset === 0) break;
    }
  }

  append(key, value, flags = RecordFlags.NONE, timestamp = BigInt(Date.now())) {
    if (!this.isOpen) throw new Error('Segment is not open');

    const offset = this.nextOffset;
    const ts = BigInt(timestamp);
    const serialized = RecordHeader.serializeRecord(key, value, offset, flags, ts);

    const position = this.size;
    fs.writeSync(this.fd, serialized, 0, serialized.length, position);
    this.size += serialized.length;
    this.nextOffset = offset + 1n;

    this.bytesSinceLastIndex += serialized.length;
    if (this.bytesSinceLastIndex >= this.indexIntervalBytes || this.index.entries.length === 0) {
      this.index.append(offset, position);
      this.timeIndex.append(ts, offset);
      this.bytesSinceLastIndex = 0;
    }

    return offset;
  }

  read(targetOffset) {
    const target = BigInt(targetOffset);
    if (target < this.baseOffset || target >= this.nextOffset) {
      return null;
    }

    const indexEntry = this.index.lookup(target);
    let pos = indexEntry ? indexEntry.position : 0;

    const readBuf = Buffer.allocUnsafe(65536);

    while (pos < this.size) {
      const bytesToRead = Math.min(readBuf.length, this.size - pos);
      fs.readSync(this.fd, readBuf, 0, bytesToRead, pos);

      let bufOffset = 0;
      while (bufOffset + RECORD_HEADER_SIZE <= bytesToRead) {
        const { header, key, value, recordBytes } = RecordHeader.deserializeRecord(readBuf, bufOffset);
        if (header.offset === target) {
          return {
            offset: header.offset,
            timestamp: header.timestamp,
            key,
            value,
            flags: header.flags
          };
        }
        if (header.offset > target) {
          return null;
        }
        bufOffset += recordBytes;
        pos += recordBytes;
      }
    }

    return null;
  }

  readRange(fromOffset, maxBytes = 1048576, maxCount = 1000) {
    const start = BigInt(fromOffset);
    if (start >= this.nextOffset) return [];

    const indexEntry = this.index.lookup(start);
    let pos = indexEntry ? indexEntry.position : 0;

    const results = [];
    let accumulatedBytes = 0;
    const readBuf = Buffer.allocUnsafe(Math.min(maxBytes + 65536, 4 * 1024 * 1024));

    while (pos < this.size && results.length < maxCount && accumulatedBytes < maxBytes) {
      const bytesToRead = Math.min(readBuf.length, this.size - pos);
      if (bytesToRead < RECORD_HEADER_SIZE) break;

      fs.readSync(this.fd, readBuf, 0, bytesToRead, pos);

      let bufOffset = 0;
      while (bufOffset + RECORD_HEADER_SIZE <= bytesToRead && results.length < maxCount && accumulatedBytes < maxBytes) {
        try {
          const { header, key, value, recordBytes } = RecordHeader.deserializeRecord(readBuf, bufOffset);
          if (header.offset >= start) {
            results.push({
              offset: header.offset,
              timestamp: header.timestamp,
              key,
              value,
              flags: header.flags
            });
            accumulatedBytes += recordBytes;
          }
          bufOffset += recordBytes;
          pos += recordBytes;
        } catch (err) {
          break;
        }
      }
      if (bufOffset === 0) break;
    }

    return results;
  }

  truncate(targetOffset) {
    const target = BigInt(targetOffset);
    if (target <= this.baseOffset) {
      this.size = 0;
      this.nextOffset = this.baseOffset;
      fs.ftruncateSync(this.fd, 0);
      this.index.truncate(this.baseOffset);
      this.timeIndex.truncate(this.baseOffset);
      return;
    }

    if (target >= this.nextOffset) return;

    const indexEntry = this.index.lookup(target);
    let pos = indexEntry ? indexEntry.position : 0;
    const readBuf = Buffer.allocUnsafe(65536);

    while (pos < this.size) {
      const bytesToRead = Math.min(readBuf.length, this.size - pos);
      fs.readSync(this.fd, readBuf, 0, bytesToRead, pos);

      let bufOffset = 0;
      while (bufOffset + RECORD_HEADER_SIZE <= bytesToRead) {
        const { header, recordBytes } = RecordHeader.deserializeRecord(readBuf, bufOffset);
        if (header.offset === target) {
          fs.ftruncateSync(this.fd, pos);
          this.size = pos;
          this.nextOffset = target;
          this.index.truncate(target);
          this.timeIndex.truncate(target);
          return;
        }
        bufOffset += recordBytes;
        pos += recordBytes;
      }
    }
  }

  isFull() {
    return this.size >= this.maxSegmentBytes;
  }

  flush() {
    if (this.isOpen && this.fd !== null) {
      fs.fsyncSync(this.fd);
      this.index.flush();
      this.timeIndex.flush();
    }
  }

  close() {
    if (this.isOpen) {
      this.flush();
      if (this.fd !== null) fs.closeSync(this.fd);
      this.index.close();
      this.timeIndex.close();
      this.isOpen = false;
    }
  }

  delete() {
    this.close();
    if (fs.existsSync(this.logFile)) fs.unlinkSync(this.logFile);
    this.index.deleteFile();
    this.timeIndex.deleteFile();
  }
}
