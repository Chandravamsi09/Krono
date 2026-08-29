/**
 * @file lsm_tree.js
 * High-performance LSM-Tree Key-Value Engine combining active MemTable,
 * immutable MemTables, leveled SSTable files, Bloom Filters, and background compaction.
 */

import fs from 'node:fs';
import path from 'node:path';
import { MemTable } from './memtable.js';
import { SSTableReader, SSTableWriter } from './sstable.js';
import { Compactor } from './compactor.js';

export class LSMTree {
  /**
   * @param {Object} options
   * @param {string} options.dataDir Root directory for LSM-Tree files
   * @param {number} [options.memTableMaxBytes=1048576] 1 MB threshold for MemTable flush
   * @param {number} [options.compactionThreshold=4] Trigger compaction when Level 0 has >= N files
   */
  constructor(options) {
    this.dataDir = options.dataDir;
    this.memTableMaxBytes = options.memTableMaxBytes ?? 1024 * 1024;
    this.compactionThreshold = options.compactionThreshold ?? 4;

    this.memTable = new MemTable({ maxSizeBytes: this.memTableMaxBytes });
    /** @type {MemTable[]} */
    this.immutableMemTables = [];
    /** @type {SSTableReader[]} Level 0 readers (newest first) */
    this.level0Readers = [];
    /** @type {SSTableReader[]} Level 1 readers */
    this.level1Readers = [];

    this.compactor = new Compactor(this.dataDir);
    this.isOpen = false;
    this.nextSSTableId = 1;
  }

  open() {
    if (this.isOpen) return;

    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }

    // Scan existing SSTables
    const files = fs.readdirSync(this.dataDir).filter((f) => f.endsWith('.sst'));
    
    // Sort files by SSTable ID descending so newest files are first
    const parsedFiles = files.map((f) => {
      const match = f.match(/^(l\d+)_(\d+)_(\d+)\.sst$/);
      const level = match ? match[1] : 'l0';
      const id = match ? parseInt(match[3], 10) : 0;
      return { filename: f, level, id };
    }).sort((a, b) => b.id - a.id);

    for (const item of parsedFiles) {
      const fullPath = path.join(this.dataDir, item.filename);
      const reader = new SSTableReader(fullPath);
      reader.open();
      if (item.level === 'l1') {
        this.level1Readers.push(reader);
      } else {
        this.level0Readers.push(reader);
      }
      this.nextSSTableId = Math.max(this.nextSSTableId, item.id + 1);
    }

    this.isOpen = true;
  }

  /**
   * Puts a key-value pair.
   * @param {string} key
   * @param {any} value
   */
  put(key, value) {
    if (!this.isOpen) throw new Error('LSMTree is not open');

    this.memTable.put(key, value);

    if (this.memTable.shouldFlush()) {
      this.flushMemTable();
    }
  }

  /**
   * Deletes a key by inserting tombstone.
   * @param {string} key
   */
  delete(key) {
    if (!this.isOpen) throw new Error('LSMTree is not open');

    this.memTable.delete(key);

    if (this.memTable.shouldFlush()) {
      this.flushMemTable();
    }
  }

  /**
   * Retrieves value for key.
   * @param {string} key
   * @returns {Buffer | null}
   */
  get(key) {
    if (!this.isOpen) throw new Error('LSMTree is not open');

    // 1. Check active MemTable
    const inMem = this.memTable.get(key);
    if (inMem !== undefined) {
      return inMem.isDeleted ? null : inMem.value;
    }

    // 2. Check immutable MemTables (newest first)
    for (const imm of this.immutableMemTables) {
      const entry = imm.get(key);
      if (entry !== undefined) {
        return entry.isDeleted ? null : entry.value;
      }
    }

    // 3. Check Level 0 SSTables (newest first)
    for (const reader of this.level0Readers) {
      const entry = reader.get(key);
      if (entry !== null) {
        return entry.isDeleted ? null : entry.value;
      }
    }

    // 4. Check Level 1 SSTables
    for (const reader of this.level1Readers) {
      const entry = reader.get(key);
      if (entry !== null) {
        return entry.isDeleted ? null : entry.value;
      }
    }

    return null;
  }

  /**
   * Flushes active MemTable to an immutable SSTable file on disk.
   */
  flushMemTable() {
    if (this.memTable.count === 0) return;

    this.memTable.freeze();
    this.immutableMemTables.unshift(this.memTable);

    const sstablePath = path.join(this.dataDir, `l0_${Date.now()}_${this.nextSSTableId++}.sst`);
    const entries = this.memTable.entries();

    const writer = new SSTableWriter(sstablePath);
    writer.write(entries);

    const reader = new SSTableReader(sstablePath);
    reader.open();
    this.level0Readers.unshift(reader);

    // Remove from immutable list
    this.immutableMemTables = this.immutableMemTables.filter((m) => m !== this.memTable);

    // Reset new active MemTable
    this.memTable = new MemTable({ maxSizeBytes: this.memTableMaxBytes });

    // Check compaction trigger
    if (this.level0Readers.length >= this.compactionThreshold) {
      this.triggerCompaction();
    }
  }

  /**
   * Compacts Level 0 SSTables into Level 1.
   */
  triggerCompaction() {
    if (this.level0Readers.length === 0) return;

    const inputPaths = this.level0Readers.map((r) => r.filepath);
    const outputPath = path.join(this.dataDir, `l1_${Date.now()}_${this.nextSSTableId++}.sst`);

    this.compactor.compact(inputPaths, outputPath, false);

    const newReader = new SSTableReader(outputPath);
    newReader.open();

    this.level0Readers = [];
    this.level1Readers.unshift(newReader);
  }

  close() {
    if (this.isOpen) {
      if (this.memTable.count > 0) {
        this.flushMemTable();
      }
      this.isOpen = false;
    }
  }
}
