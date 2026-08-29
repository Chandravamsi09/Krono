/**
 * @file storage.test.js
 * Comprehensive unit & integration tests for @krono/storage:
 * SegmentedLog, SparseIndex, TimeIndex, Record framing with CRC32,
 * automatic segment rolling, and crash recovery.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  RecordHeader,
  SparseIndex,
  TimeIndex,
  LogSegment,
  SegmentedLog,
  PartitionStore,
  RecordFlags
} from '../src/index.js';

let testDir;

beforeEach(() => {
  testDir = path.join(os.tmpdir(), `krono-storage-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

describe('Record Framing & Serialization', () => {
  it('should serialize and deserialize binary records with CRC32 integrity validation', () => {
    const key = Buffer.from('user-456');
    const value = Buffer.from(JSON.stringify({ action: 'purchase', amount: 199.99 }));
    const offset = 42n;

    const serialized = RecordHeader.serializeRecord(key, value, offset, RecordFlags.NONE);
    assert.ok(Buffer.isBuffer(serialized));

    const { header, key: decodedKey, value: decodedVal, recordBytes } = RecordHeader.deserializeRecord(serialized, 0);

    assert.equal(header.offset, 42n);
    assert.equal(decodedKey.toString(), 'user-456');
    assert.deepEqual(JSON.parse(decodedVal.toString()), { action: 'purchase', amount: 199.99 });
    assert.equal(recordBytes, serialized.length);
  });
});

describe('SparseIndex & TimeIndex', () => {
  it('should correctly index offsets and perform binary search lookups', () => {
    const idxPath = path.join(testDir, 'test.idx');
    const index = new SparseIndex(idxPath, 0n);
    index.open();

    index.append(0n, 0);
    index.append(10n, 512);
    index.append(20n, 1024);
    index.append(30n, 1536);

    const lookup1 = index.lookup(15n);
    assert.equal(lookup1.offset, 10n);
    assert.equal(lookup1.position, 512);

    const lookupExact = index.lookup(20n);
    assert.equal(lookupExact.offset, 20n);
    assert.equal(lookupExact.position, 1024);

    index.close();

    // Reopen and verify persistence
    const reopened = new SparseIndex(idxPath, 0n);
    reopened.open();
    assert.equal(reopened.entries.length, 4);
    assert.equal(reopened.lookup(25n).offset, 20n);
    reopened.close();
  });
});

describe('SegmentedLog Append, Rolling & Read', () => {
  it('should append records, automatically roll segments, and read across segment boundaries', () => {
    const logDir = path.join(testDir, 'partition-0');
    // Small 512-byte segment limit to force rolling
    const log = new SegmentedLog({
      dir: logDir,
      maxSegmentBytes: 512,
      indexIntervalBytes: 128
    });
    log.open();

    const recordCount = 50;
    const writtenOffsets = [];

    for (let i = 0; i < recordCount; i++) {
      const key = `key-${i}`;
      const value = `value-payload-data-${i}-long-string-to-consume-bytes`;
      const off = log.append(key, value);
      writtenOffsets.push(off);
    }

    assert.equal(writtenOffsets.length, recordCount);
    assert.equal(writtenOffsets[0], 0n);
    assert.equal(writtenOffsets[recordCount - 1], BigInt(recordCount - 1));
    assert.ok(log.segmentCount > 1, `Expected multiple segments rolled, got ${log.segmentCount}`);

    // Read single record
    const rec25 = log.read(25n);
    assert.ok(rec25);
    assert.equal(rec25.offset, 25n);
    assert.equal(rec25.key.toString(), 'key-25');
    assert.ok(rec25.value.toString().includes('value-payload-data-25'));

    // Read batch range across segments
    const range = log.readRange(10n, 1048576, 30);
    assert.equal(range.length, 30);
    assert.equal(range[0].offset, 10n);
    assert.equal(range[29].offset, 39n);

    log.close();

    // Reopen log from disk and verify full state recovery
    const recoveredLog = new SegmentedLog({
      dir: logDir,
      maxSegmentBytes: 512
    });
    recoveredLog.open();
    assert.equal(recoveredLog.nextOffset, BigInt(recordCount));
    const rec49 = recoveredLog.read(49n);
    assert.equal(rec49.offset, 49n);
    assert.equal(rec49.key.toString(), 'key-49');
    recoveredLog.close();
  });

  it('should handle log truncation during consensus rollbacks', () => {
    const logDir = path.join(testDir, 'rollback-partition');
    const log = new SegmentedLog({
      dir: logDir,
      maxSegmentBytes: 512
    });
    log.open();

    for (let i = 0; i < 30; i++) {
      log.append(`k-${i}`, `v-${i}`);
    }
    assert.equal(log.nextOffset, 30n);

    // Truncate back to offset 15
    log.truncate(15n);
    assert.equal(log.nextOffset, 15n);

    // Overwrite from 15
    const newOff = log.append('k-15-new', 'v-15-new');
    assert.equal(newOff, 15n);

    const rec = log.read(15n);
    assert.equal(rec.key.toString(), 'k-15-new');
    log.close();
  });
});

describe('PartitionStore Multi-Topic Management', () => {
  it('should coordinate multiple topics and partition streams', () => {
    const store = new PartitionStore({ dataDir: testDir });
    store.open();

    const batch = [
      { key: 'order-1', value: 'created' },
      { key: 'order-2', value: 'paid' }
    ];

    const res = store.appendBatch('orders', 0, batch);
    assert.equal(res.count, 2);
    assert.equal(res.baseOffset, 0n);

    const fetched = store.fetch('orders', 0, 0n, 1048576, 10);
    assert.equal(fetched.length, 2);
    assert.equal(fetched[0].key.toString(), 'order-1');
    assert.equal(fetched[1].key.toString(), 'order-2');

    store.close();
  });
});
