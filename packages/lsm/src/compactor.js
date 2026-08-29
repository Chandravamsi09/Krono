/**
 * @file compactor.js
 * Leveled Compaction Engine merging multiple SSTables into next level,
 * performing multi-way merge sort, resolving newest timestamps, and removing tombstones.
 */

import fs from 'node:fs';
import path from 'node:path';
import { SSTableReader, SSTableWriter } from './sstable.js';

export class Compactor {
  /**
   * @param {string} dataDir Directory holding SSTable files
   */
  constructor(dataDir) {
    this.dataDir = dataDir;
  }

  /**
   * Merges multiple SSTables into a single new compacted SSTable file.
   * @param {string[]} inputSSTablePaths
   * @param {string} outputPath
   * @param {boolean} [isBottomLevel=false] If bottom level, tombstones can be safely discarded
   */
  compact(inputSSTablePaths, outputPath, isBottomLevel = false) {
    if (inputSSTablePaths.length === 0) return;

    /** @type {Map<string, { value: Buffer, timestamp: number, isDeleted: boolean }>} */
    const mergedMap = new Map();

    for (const p of inputSSTablePaths) {
      const reader = new SSTableReader(p);
      const rows = reader.scan();
      for (const row of rows) {
        const existing = mergedMap.get(row.key);
        if (!existing || row.timestamp >= existing.timestamp) {
          mergedMap.set(row.key, {
            value: row.value,
            timestamp: row.timestamp,
            isDeleted: row.isDeleted
          });
        }
      }
    }

    // Sort entries by key lexicographically
    const sortedKeys = Array.from(mergedMap.keys()).sort();
    const finalEntries = [];

    for (const key of sortedKeys) {
      const entry = mergedMap.get(key);
      // Discard deleted tombstone if at bottom level
      if (isBottomLevel && entry.isDeleted) {
        continue;
      }
      finalEntries.push({ key, value: entry });
    }

    const writer = new SSTableWriter(outputPath);
    writer.write(finalEntries);

    // Delete old merged SSTable files
    for (const p of inputSSTablePaths) {
      if (p !== outputPath && fs.existsSync(p)) {
        fs.unlinkSync(p);
      }
    }
  }
}
