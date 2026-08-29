/**
 * @file segmented_log.js
 * Multi-segment append-only commit log manager with automatic segment rolling,
 * sparse index lookups, time-based & size-based retention, and crash recovery.
 */

import fs from 'node:fs';
import path from 'node:path';
import { LogSegment } from './log_segment.js';
import { RecordFlags } from './record_header.js';

export class SegmentedLog {
  /**
   * @param {Object} options
   * @param {string} options.dir Directory where partition segments reside
   * @param {number} [options.maxSegmentBytes=10485760] Max size per segment (default 10 MB)
   * @param {number} [options.indexIntervalBytes=4096] Sparse index interval
   * @param {number} [options.retentionMs=604800000] Retention time (default 7 days)
   * @param {number} [options.retentionBytes=10737418240] Retention max bytes (default 10 GB)
   */
  constructor(options) {
    this.dir = options.dir;
    this.maxSegmentBytes = options.maxSegmentBytes ?? 10 * 1024 * 1024;
    this.indexIntervalBytes = options.indexIntervalBytes ?? 4096;
    this.retentionMs = options.retentionMs ?? 7 * 24 * 3600 * 1000;
    this.retentionBytes = options.retentionBytes ?? 10 * 1024 * 1024 * 1024;

    /** @type {LogSegment[]} Sorted list of segments by baseOffset */
    this.segments = [];
    this.activeSegment = null;
    this.isOpen = false;
  }

  /**
   * Initializes or recovers the segmented log from disk.
   */
  open() {
    if (this.isOpen) return;

    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true });
    }

    const files = fs.readdirSync(this.dir);
    const logFiles = files.filter((f) => f.endsWith('.log'));

    // Extract base offsets and sort
    const baseOffsets = logFiles
      .map((f) => BigInt(f.replace('.log', '')))
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

    if (baseOffsets.length === 0) {
      // Create initial segment starting at offset 0
      const initialSeg = new LogSegment({
        dir: this.dir,
        baseOffset: 0n,
        maxSegmentBytes: this.maxSegmentBytes,
        indexIntervalBytes: this.indexIntervalBytes
      });
      initialSeg.open();
      this.segments.push(initialSeg);
      this.activeSegment = initialSeg;
    } else {
      for (const baseOffset of baseOffsets) {
        const seg = new LogSegment({
          dir: this.dir,
          baseOffset,
          maxSegmentBytes: this.maxSegmentBytes,
          indexIntervalBytes: this.indexIntervalBytes
        });
        seg.open();
        this.segments.push(seg);
      }
      this.activeSegment = this.segments[this.segments.length - 1];
    }

    this.isOpen = true;
  }

  get nextOffset() {
    return this.activeSegment ? this.activeSegment.nextOffset : 0n;
  }

  get baseOffset() {
    return this.segments.length > 0 ? this.segments[0].baseOffset : 0n;
  }

  get totalBytes() {
    return this.segments.reduce((acc, s) => acc + s.size, 0);
  }

  get segmentCount() {
    return this.segments.length;
  }

  /**
   * Appends a message to the active log segment, rolling if necessary.
   * @param {Buffer|string} key
   * @param {Buffer|string} value
   * @param {number} [flags=RecordFlags.NONE]
   * @param {bigint|number} [timestamp]
   * @returns {bigint} Assigned monotonic offset
   */
  append(key, value, flags = RecordFlags.NONE, timestamp = BigInt(Date.now())) {
    if (!this.isOpen) throw new Error('SegmentedLog is not open');

    if (this.activeSegment.isFull()) {
      this._rollActiveSegment();
    }

    return this.activeSegment.append(key, value, flags, timestamp);
  }

  _rollActiveSegment() {
    this.activeSegment.flush();
    const newBaseOffset = this.activeSegment.nextOffset;

    const newSegment = new LogSegment({
      dir: this.dir,
      baseOffset: newBaseOffset,
      maxSegmentBytes: this.maxSegmentBytes,
      indexIntervalBytes: this.indexIntervalBytes
    });
    newSegment.open();
    this.segments.push(newSegment);
    this.activeSegment = newSegment;
  }

  /**
   * Finds the segment containing targetOffset via binary search.
   * @param {bigint} targetOffset
   * @returns {LogSegment | null}
   */
  _findSegmentForOffset(targetOffset) {
    if (this.segments.length === 0) return null;
    const target = BigInt(targetOffset);

    let low = 0;
    let high = this.segments.length - 1;
    let best = null;

    while (low <= high) {
      const mid = (low + high) >>> 1;
      const seg = this.segments[mid];

      if (seg.baseOffset <= target) {
        best = seg;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    if (best && target < best.nextOffset) {
      return best;
    }
    return null;
  }

  /**
   * Reads a single record by offset.
   * @param {bigint|number} offset
   * @returns {{ offset: bigint, timestamp: bigint, key: Buffer, value: Buffer, flags: number } | null}
   */
  read(offset) {
    const target = BigInt(offset);
    const seg = this._findSegmentForOffset(target);
    if (!seg) return null;
    return seg.read(target);
  }

  /**
   * Reads a batch of records starting from target offset across segments.
   * @param {bigint|number} fromOffset
   * @param {number} [maxBytes=1048576]
   * @param {number} [maxCount=1000]
   * @returns {Array<{ offset: bigint, timestamp: bigint, key: Buffer, value: Buffer, flags: number }>}
   */
  readRange(fromOffset, maxBytes = 1048576, maxCount = 1000) {
    const start = BigInt(fromOffset);
    let currentOffset = start;
    const results = [];
    let accumulatedBytes = 0;

    let segIdx = this._findSegmentIndex(currentOffset);
    if (segIdx === -1) {
      // If start is before first segment, start at first segment
      if (this.segments.length > 0 && start <= this.segments[0].baseOffset) {
        segIdx = 0;
      } else {
        return [];
      }
    }

    while (segIdx < this.segments.length && results.length < maxCount && accumulatedBytes < maxBytes) {
      const seg = this.segments[segIdx];
      const chunk = seg.readRange(currentOffset, maxBytes - accumulatedBytes, maxCount - results.length);
      if (chunk.length === 0) {
        // Jump to next segment base offset
        segIdx++;
        if (segIdx < this.segments.length) {
          currentOffset = this.segments[segIdx].baseOffset;
        }
        continue;
      }

      for (const rec of chunk) {
        results.push(rec);
        accumulatedBytes += rec.key.length + rec.value.length + 32;
        currentOffset = rec.offset + 1n;
      }
      segIdx++;
    }

    return results;
  }

  _findSegmentIndex(targetOffset) {
    const target = BigInt(targetOffset);
    for (let i = 0; i < this.segments.length; i++) {
      if (target >= this.segments[i].baseOffset && target < this.segments[i].nextOffset) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Truncates log back to targetOffset (used during Raft uncommitted log rollback).
   * @param {bigint|number} targetOffset
   */
  truncate(targetOffset) {
    const target = BigInt(targetOffset);
    const retainSegments = [];
    const deleteSegments = [];

    for (const seg of this.segments) {
      if (seg.baseOffset < target) {
        retainSegments.push(seg);
        if (target < seg.nextOffset) {
          seg.truncate(target);
        }
      } else {
        deleteSegments.push(seg);
      }
    }

    for (const dead of deleteSegments) {
      dead.delete();
    }

    this.segments = retainSegments;
    if (this.segments.length === 0) {
      const initial = new LogSegment({
        dir: this.dir,
        baseOffset: target,
        maxSegmentBytes: this.maxSegmentBytes,
        indexIntervalBytes: this.indexIntervalBytes
      });
      initial.open();
      this.segments.push(initial);
    }
    this.activeSegment = this.segments[this.segments.length - 1];
  }

  /**
   * Applies retention policies: deletes expired segments and enforces size limits.
   * @returns {number} Number of deleted segments
   */
  applyRetention() {
    if (this.segments.length <= 1) return 0; // Keep at least active segment

    const now = Date.now();
    let deletedCount = 0;
    let currentTotalSize = this.totalBytes;

    const keptSegments = [];

    for (let i = 0; i < this.segments.length - 1; i++) {
      const seg = this.segments[i];
      const isSizeExpired = currentTotalSize > this.retentionBytes;
      // Check last record timestamp in segment
      const lastRec = seg.read(seg.nextOffset - 1n);
      const isTimeExpired = lastRec ? (now - Number(lastRec.timestamp) > this.retentionMs) : false;

      if (isSizeExpired || isTimeExpired) {
        currentTotalSize -= seg.size;
        seg.delete();
        deletedCount++;
      } else {
        keptSegments.push(seg);
      }
    }

    // Always keep active segment
    keptSegments.push(this.activeSegment);
    this.segments = keptSegments;

    return deletedCount;
  }

  flush() {
    for (const seg of this.segments) {
      seg.flush();
    }
  }

  close() {
    if (this.isOpen) {
      for (const seg of this.segments) {
        seg.close();
      }
      this.isOpen = false;
    }
  }
}
