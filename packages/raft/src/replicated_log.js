/**
 * @file replicated_log.js
 * In-memory and WAL-backed replicated log for Raft consensus with index mapping.
 */

import { LogEntry, ConsensusEntryType } from '@krono/protocol';

export class ReplicatedLog {
  /**
   * @param {Object} [options]
   * @param {number} [options.lastIncludedIndex=0]
   * @param {number} [options.lastIncludedTerm=0]
   */
  constructor(options = {}) {
    this.lastIncludedIndex = options.lastIncludedIndex ?? 0;
    this.lastIncludedTerm = options.lastIncludedTerm ?? 0;

    // Log array stores entries starting from lastIncludedIndex + 1
    // Index 0 in this.entries corresponds to (this.lastIncludedIndex + 1)
    /** @type {LogEntry[]} */
    this.entries = [];
  }

  get lastLogIndex() {
    if (this.entries.length === 0) return this.lastIncludedIndex;
    return this.entries[this.entries.length - 1].index;
  }

  get lastLogTerm() {
    if (this.entries.length === 0) return this.lastIncludedTerm;
    return this.entries[this.entries.length - 1].term;
  }

  get length() {
    return this.entries.length;
  }

  /**
   * Translates 1-based virtual log index to array index.
   * @param {number} index
   * @returns {number}
   */
  _toArrayIndex(index) {
    return index - (this.lastIncludedIndex + 1);
  }

  /**
   * Retrieves log entry by virtual index.
   * @param {number} index
   * @returns {LogEntry | null}
   */
  getEntry(index) {
    if (index <= this.lastIncludedIndex) return null;
    const arrayIdx = this._toArrayIndex(index);
    if (arrayIdx >= 0 && arrayIdx < this.entries.length) {
      return this.entries[arrayIdx];
    }
    return null;
  }

  /**
   * Gets term of entry at virtual index.
   * @param {number} index
   * @returns {number}
   */
  getTerm(index) {
    if (index === 0) return 0;
    if (index === this.lastIncludedIndex) return this.lastIncludedTerm;
    const entry = this.getEntry(index);
    return entry ? entry.term : 0;
  }

  /**
   * Appends an entry.
   * @param {LogEntry} entry
   */
  append(entry) {
    this.entries.push(entry);
    return entry.index;
  }

  /**
   * Slices entries starting from startIndex.
   * @param {number} startIndex
   * @param {number} [maxEntries=256]
   * @returns {LogEntry[]}
   */
  getEntriesFrom(startIndex, maxEntries = 256) {
    const arrayIdx = Math.max(0, this._toArrayIndex(startIndex));
    return this.entries.slice(arrayIdx, arrayIdx + maxEntries);
  }

  /**
   * Truncates uncommitted log entries starting at fromIndex.
   * @param {number} fromIndex
   */
  truncate(fromIndex) {
    if (fromIndex <= this.lastIncludedIndex) {
      this.entries = [];
      return;
    }
    const arrayIdx = this._toArrayIndex(fromIndex);
    if (arrayIdx >= 0 && arrayIdx < this.entries.length) {
      this.entries = this.entries.slice(0, arrayIdx);
    }
  }

  /**
   * Compacts entries up to snapshotIndex.
   * @param {number} snapshotIndex
   * @param {number} snapshotTerm
   */
  compact(snapshotIndex, snapshotTerm) {
    if (snapshotIndex <= this.lastIncludedIndex) return;

    const arrayIdx = this._toArrayIndex(snapshotIndex);
    if (arrayIdx >= 0 && arrayIdx < this.entries.length) {
      this.entries = this.entries.slice(arrayIdx + 1);
    } else {
      this.entries = [];
    }

    this.lastIncludedIndex = snapshotIndex;
    this.lastIncludedTerm = snapshotTerm;
  }
}
