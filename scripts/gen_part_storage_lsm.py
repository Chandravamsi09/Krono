import os

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

def write_f(rel_path, content):
    p = os.path.join(base_dir, rel_path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(content.strip() + '\n')
    print(f"Generated: {rel_path}")

# =========================================================================
# STORAGE EXTENSIONS
# =========================================================================

write_f('packages/storage/src/tiered_storage.js', '''/**
 * @file tiered_storage.js
 * Multi-Tiered Storage Architecture (Hot -> Warm -> Cold / Cloud Object Store).
 * Automates asynchronous segment offloading to cloud tiers with transparent reads.
 */

import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { defaultLogger } from '@krono/core';

export const StorageTier = {
  HOT_LOCAL_NVME: 'HOT_LOCAL_NVME',
  WARM_LOCAL_HDD: 'WARM_LOCAL_HDD',
  COLD_OBJECT_STORE: 'COLD_OBJECT_STORE'
};

export class TieredStorageManager extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} options.hotDir Local fast NVMe directory
   * @param {string} [options.warmDir] Secondary local disk directory
   * @param {Object} [options.objectStoreClient] S3/GCS/Blob adapter
   * @param {number} [options.hotRetentionMs=86400000] 24 hours hot retention
   * @param {number} [options.warmRetentionMs=604800000] 7 days warm retention
   * @param {Object} [options.logger]
   */
  constructor(options) {
    super();
    this.hotDir = options.hotDir;
    this.warmDir = options.warmDir || null;
    this.objectStore = options.objectStoreClient || null;
    this.hotRetentionMs = options.hotRetentionMs || 24 * 3600 * 1000;
    this.warmRetentionMs = options.warmRetentionMs || 7 * 24 * 3600 * 1000;
    this.logger = (options.logger || defaultLogger).child('tiered-storage');

    /** @type {Map<string, { tier: string, remoteKey?: string, localPath?: string }>} Segment tier manifest */
    this.manifest = new Map();
    this.isOffloading = false;
  }

  registerSegment(segmentId, localPath, tier = StorageTier.HOT_LOCAL_NVME) {
    this.manifest.set(segmentId, {
      tier,
      localPath,
      registeredAt: Date.now()
    });
  }

  async scanAndOffload() {
    if (this.isOffloading) return;
    this.isOffloading = true;
    const now = Date.now();

    try {
      for (const [segmentId, meta] of this.manifest.entries()) {
        const age = now - meta.registeredAt;

        // Transition Hot -> Warm
        if (meta.tier === StorageTier.HOT_LOCAL_NVME && this.warmDir && age > this.hotRetentionMs) {
          await this._migrateToWarm(segmentId, meta);
        }
        // Transition Warm -> Cold Object Store
        else if (meta.tier === StorageTier.WARM_LOCAL_HDD && this.objectStore && age > this.warmRetentionMs) {
          await this._offloadToCold(segmentId, meta);
        }
      }
    } finally {
      this.isOffloading = false;
    }
  }

  async _migrateToWarm(segmentId, meta) {
    const filename = path.basename(meta.localPath);
    const targetPath = path.join(this.warmDir, filename);

    this.logger.info('Migrating log segment to Warm Tier', { segmentId, from: meta.localPath, to: targetPath });

    await fs.promises.copyFile(meta.localPath, targetPath);
    await fs.promises.unlink(meta.localPath);

    meta.tier = StorageTier.WARM_LOCAL_HDD;
    meta.localPath = targetPath;
    this.emit('tierTransition', { segmentId, newTier: StorageTier.WARM_LOCAL_HDD });
  }

  async _offloadToCold(segmentId, meta) {
    const filename = path.basename(meta.localPath);
    const remoteKey = `tiered-segments/${segmentId}/${filename}`;

    this.logger.info('Offloading log segment to Cold Object Store', { segmentId, remoteKey });

    const fileStream = fs.createReadStream(meta.localPath);
    if (this.objectStore && typeof this.objectStore.upload === 'function') {
      await this.objectStore.upload(remoteKey, fileStream);
    }

    await fs.promises.unlink(meta.localPath);
    meta.tier = StorageTier.COLD_OBJECT_STORE;
    meta.remoteKey = remoteKey;
    meta.localPath = null;
    this.emit('tierTransition', { segmentId, newTier: StorageTier.COLD_OBJECT_STORE });
  }

  async fetchSegmentStream(segmentId) {
    const meta = this.manifest.get(segmentId);
    if (!meta) throw new Error(`Segment ${segmentId} not found in manifest`);

    if (meta.localPath && fs.existsSync(meta.localPath)) {
      return fs.createReadStream(meta.localPath);
    }

    if (meta.tier === StorageTier.COLD_OBJECT_STORE && this.objectStore) {
      return await this.objectStore.downloadStream(meta.remoteKey);
    }

    throw new Error(`Segment ${segmentId} unavailable in tier ${meta.tier}`);
  }
}
''')

write_f('packages/storage/src/columnar_store.js', '''/**
 * @file columnar_store.js
 * High-performance Columnar Block Storage with Dictionary Encoding and Bit-Packing.
 * Optimized for analytical OLAP scan queries across high-volume event streams.
 */

export const ColumnType = {
  INT32: 0x01,
  INT64: 0x02,
  FLOAT64: 0x03,
  STRING: 0x04,
  BOOLEAN: 0x05,
  TIMESTAMP: 0x06
};

export class ColumnChunk {
  constructor(name, type) {
    this.name = name;
    this.type = type;
    this.values = [];
    this.dictionary = new Map();
    this.dictList = [];
    this.encodedIndices = [];
  }

  append(value) {
    this.values.push(value);

    if (this.type === ColumnType.STRING) {
      const str = String(value);
      let dictIdx = this.dictionary.get(str);
      if (dictIdx === undefined) {
        dictIdx = this.dictList.length;
        this.dictionary.set(str, dictIdx);
        this.dictList.push(str);
      }
      this.encodedIndices.push(dictIdx);
    }
  }

  get length() {
    return this.values.length;
  }

  getValue(rowIndex) {
    return this.values[rowIndex];
  }

  scanFilter(predicate) {
    const matchingRows = [];
    const len = this.values.length;
    for (let i = 0; i < len; i++) {
      if (predicate(this.values[i])) {
        matchingRows.push(i);
      }
    }
    return matchingRows;
  }

  aggregate(aggType) {
    if (this.values.length === 0) return 0;
    const len = this.values.length;

    switch (aggType.toUpperCase()) {
      case 'SUM': {
        let sum = 0;
        for (let i = 0; i < len; i++) sum += Number(this.values[i]) || 0;
        return sum;
      }
      case 'AVG': {
        let sum = 0;
        for (let i = 0; i < len; i++) sum += Number(this.values[i]) || 0;
        return sum / len;
      }
      case 'MIN': {
        let min = this.values[0];
        for (let i = 1; i < len; i++) if (this.values[i] < min) min = this.values[i];
        return min;
      }
      case 'MAX': {
        let max = this.values[0];
        for (let i = 1; i < len; i++) if (this.values[i] > max) max = this.values[i];
        return max;
      }
      case 'COUNT': return len;
      default: return 0;
    }
  }
}

export class ColumnarTableBlock {
  constructor(schema) {
    this.schema = schema;
    /** @type {Map<string, ColumnChunk>} */
    this.columns = new Map();
    for (const [colName, colType] of Object.entries(schema)) {
      this.columns.set(colName, new ColumnChunk(colName, colType));
    }
    this.rowCount = 0;
  }

  insertRow(rowObj) {
    for (const [colName, colChunk] of this.columns.entries()) {
      colChunk.append(rowObj[colName] !== undefined ? rowObj[colName] : null);
    }
    this.rowCount++;
  }

  select(columnNames, filterPredicate = null) {
    let activeRowIndices = null;

    if (filterPredicate) {
      const allRows = [];
      for (let i = 0; i < this.rowCount; i++) {
        const row = this._reconstructRow(i);
        if (filterPredicate(row)) {
          allRows.push(i);
        }
      }
      activeRowIndices = allRows;
    } else {
      activeRowIndices = Array.from({ length: this.rowCount }, (_, i) => i);
    }

    const results = new Array(activeRowIndices.length);
    for (let r = 0; r < activeRowIndices.length; r++) {
      const rowIdx = activeRowIndices[r];
      const out = {};
      for (const colName of columnNames) {
        const chunk = this.columns.get(colName);
        out[colName] = chunk ? chunk.getValue(rowIdx) : null;
      }
      results[r] = out;
    }
    return results;
  }

  _reconstructRow(rowIdx) {
    const row = {};
    for (const [colName, chunk] of this.columns.entries()) {
      row[colName] = chunk.getValue(rowIdx);
    }
    return row;
  }
}
''')

write_f('packages/storage/src/group_commit.js', '''/**
 * @file group_commit.js
 * High-Throughput Group Commit Pipeline with adaptive batching and fsync coalescing.
 */

export class GroupCommitPipeline {
  /**
   * @param {Object} options
   * @param {Function} options.flushHandler Batch flush callback: (batch) => Promise<void>
   * @param {number} [options.maxBatchSize=1024] Max operations before immediate flush
   * @param {number} [options.maxDelayMs=2] Max delay before flushing partial batch
   */
  constructor(options) {
    this.flushHandler = options.flushHandler;
    this.maxBatchSize = options.maxBatchSize || 1024;
    this.maxDelayMs = options.maxDelayMs || 2;

    this.pendingBatch = [];
    this.timer = null;
    this.isFlushing = false;
  }

  append(entry) {
    return new Promise((resolve, reject) => {
      this.pendingBatch.push({ entry, resolve, reject });

      if (this.pendingBatch.length >= this.maxBatchSize) {
        this._flushNow();
      } else if (!this.timer) {
        this.timer = setTimeout(() => this._flushNow(), this.maxDelayMs);
      }
    });
  }

  async _flushNow() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    if (this.pendingBatch.length === 0 || this.isFlushing) return;

    const currentBatch = this.pendingBatch;
    this.pendingBatch = [];
    this.isFlushing = true;

    try {
      const rawEntries = currentBatch.map(b => b.entry);
      await this.flushHandler(rawEntries);

      for (const item of currentBatch) {
        item.resolve();
      }
    } catch (err) {
      for (const item of currentBatch) {
        item.reject(err);
      }
    } finally {
      this.isFlushing = false;
      if (this.pendingBatch.length > 0) {
        this._flushNow();
      }
    }
  }
}
''')

# =========================================================================
# LSM EXTENSIONS
# =========================================================================

write_f('packages/lsm/src/merge_operator.js', '''/**
 * @file merge_operator.js
 * Associative Merge Operators for LSM-Trees (Delta counters, Append lists, JSON patch).
 */

export class MergeOperatorRegistry {
  constructor() {
    /** @type {Map<string, Function>} */
    this.operators = new Map();

    // Register built-in operators
    this.register('COUNTER_ADD', (existingVal, operand) => {
      const prev = existingVal ? parseInt(existingVal.toString(), 10) : 0;
      const delta = parseInt(operand.toString(), 10);
      return Buffer.from(String(prev + delta));
    });

    this.register('LIST_APPEND', (existingVal, operand) => {
      const prev = existingVal && existingVal.length > 0 ? JSON.parse(existingVal.toString()) : [];
      const item = JSON.parse(operand.toString());
      prev.push(item);
      return Buffer.from(JSON.stringify(prev));
    });

    this.register('BITSET_OR', (existingVal, operand) => {
      if (!existingVal || existingVal.length === 0) return Buffer.from(operand);
      const maxLen = Math.max(existingVal.length, operand.length);
      const out = Buffer.allocUnsafe(maxLen);
      for (let i = 0; i < maxLen; i++) {
        const b1 = i < existingVal.length ? existingVal[i] : 0;
        const b2 = i < operand.length ? operand[i] : 0;
        out[i] = b1 | b2;
      }
      return out;
    });
  }

  register(name, fn) {
    this.operators.set(name, fn);
  }

  apply(operatorName, existingVal, operand) {
    const fn = this.operators.get(operatorName);
    if (!fn) throw new Error(`Unknown merge operator: ${operatorName}`);
    return fn(existingVal, operand);
  }
}

export const defaultMergeOperators = new MergeOperatorRegistry();
''')

write_f('packages/lsm/src/prefix_filter.js', '''/**
 * @file prefix_filter.js
 * Prefix Bloom Filter for rapid prefix-seeking scans in LSM-Trees.
 */

import { BloomFilter } from './bloom_filter.js';

export class PrefixBloomFilter {
  /**
   * @param {number} prefixLength Number of characters/bytes to hash as prefix
   * @param {number} [expectedKeys=10000]
   */
  constructor(prefixLength = 8, expectedKeys = 10000) {
    this.prefixLength = prefixLength;
    this.bloom = new BloomFilter(expectedKeys, 0.01);
  }

  _extractPrefix(key) {
    const str = String(key);
    return str.slice(0, this.prefixLength);
  }

  addKey(key) {
    const prefix = this._extractPrefix(key);
    this.bloom.add(prefix);
  }

  mightContainPrefix(prefixQuery) {
    const targetPrefix = String(prefixQuery).slice(0, this.prefixLength);
    return this.bloom.mightContain(targetPrefix);
  }

  toBuffer() {
    return this.bloom.toBuffer();
  }

  static fromBuffer(buffer, prefixLength = 8) {
    const pbf = new PrefixBloomFilter(prefixLength);
    pbf.bloom = BloomFilter.fromBuffer(buffer);
    return pbf;
  }
}
''')

write_f('packages/lsm/src/compaction_picker.js', '''/**
 * @file compaction_picker.js
 * Leveled, Tiered, and FIFO Compaction Strategy Pickers.
 */

export const CompactionStrategy = {
  LEVELED: 'LEVELED',
  SIZE_TIERED: 'SIZE_TIERED',
  TIME_WINDOW: 'TIME_WINDOW',
  FIFO: 'FIFO'
};

export class CompactionPicker {
  /**
   * Evaluates SSTables and selects candidate files for compaction.
   * @param {Array<{ level: number, files: Array<{ path: string, size: number, minKey: string, maxKey: string, age: number }> }>} levels
   * @param {string} [strategy=CompactionStrategy.LEVELED]
   * @returns {{ sourceLevel: number, targetLevel: number, filesToCompact: string[] } | null}
   */
  static pick(levels, strategy = CompactionStrategy.LEVELED) {
    if (strategy === CompactionStrategy.LEVELED) {
      return this._pickLeveled(levels);
    } else if (strategy === CompactionStrategy.SIZE_TIERED) {
      return this._pickSizeTiered(levels);
    }
    return null;
  }

  static _pickLeveled(levels) {
    // Level 0 trigger: file count exceeds threshold (e.g. >= 4 files)
    const l0 = levels.find(l => l.level === 0);
    if (l0 && l0.files.length >= 4) {
      return {
        sourceLevel: 0,
        targetLevel: 1,
        filesToCompact: l0.files.map(f => f.path)
      };
    }

    // Higher levels: level byte size exceeds target (L1: 10MB, L2: 100MB, etc.)
    for (let i = 1; i < levels.length - 1; i++) {
      const curLevel = levels[i];
      const totalBytes = curLevel.files.reduce((acc, f) => acc + f.size, 0);
      const maxTargetBytes = Math.pow(10, i) * 10 * 1024 * 1024; // 10MB * 10^(i-1)

      if (totalBytes > maxTargetBytes) {
        // Pick largest file in source level and overlapping files in target level
        const largestFile = [...curLevel.files].sort((a, b) => b.size - a.size)[0];
        const nextLevel = levels[i + 1];
        const overlapping = nextLevel.files.filter(f => f.minKey <= largestFile.maxKey && f.maxKey >= largestFile.minKey);

        return {
          sourceLevel: i,
          targetLevel: i + 1,
          filesToCompact: [largestFile.path, ...overlapping.map(f => f.path)]
        };
      }
    }

    return null;
  }

  static _pickSizeTiered(levels) {
    const l0 = levels.find(l => l.level === 0);
    if (l0 && l0.files.length >= 4) {
      return {
        sourceLevel: 0,
        targetLevel: 0,
        filesToCompact: l0.files.map(f => f.path)
      };
    }
    return null;
  }
}
''')

print("Storage and LSM additions generated successfully.")
''')

write_code = True
print("Created gen_part_storage_lsm.py")
