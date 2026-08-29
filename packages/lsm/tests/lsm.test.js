/**
 * @file lsm.test.js
 * Unit and integration tests for @krono/lsm:
 * BloomFilter, SkipList, MemTable, SSTables, Leveled Compaction, and LSMTree.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  BloomFilter,
  SkipList,
  MemTable,
  SSTableWriter,
  SSTableReader,
  LSMTree
} from '../src/index.js';

let testDir;

beforeEach(() => {
  testDir = path.join(os.tmpdir(), `krono-lsm-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

describe('BloomFilter Probabilistic Index', () => {
  it('should accurately test membership with minimal false positive rate', () => {
    const bf = new BloomFilter(1000, 0.01);
    for (let i = 0; i < 500; i++) {
      bf.add(`item-${i}`);
    }

    // Check true positives
    for (let i = 0; i < 500; i++) {
      assert.equal(bf.mightContain(`item-${i}`), true);
    }

    // Check false positives on absent items
    let falsePositives = 0;
    for (let i = 500; i < 1500; i++) {
      if (bf.mightContain(`item-${i}`)) {
        falsePositives++;
      }
    }
    assert.ok(falsePositives < 25, `Expected < 2.5% false positives, got ${falsePositives}`);

    // Test buffer serialization
    const buf = bf.toBuffer();
    const restored = BloomFilter.fromBuffer(buf);
    assert.equal(restored.mightContain('item-0'), true);
    assert.equal(restored.mightContain('item-499'), true);
  });
});

describe('SkipList Sorted Index', () => {
  it('should maintain sorted order and support insertion, deletion, and scans', () => {
    const sl = new SkipList();
    sl.put('user:100', { name: 'Alice' });
    sl.put('user:050', { name: 'Bob' });
    sl.put('user:200', { name: 'Charlie' });
    sl.put('user:075', { name: 'Diana' });

    assert.equal(sl.get('user:050').name, 'Bob');
    assert.equal(sl.get('user:100').name, 'Alice');
    assert.equal(sl.get('user:999'), undefined);

    const scanRes = sl.scan('user:060', 'user:150');
    assert.equal(scanRes.length, 2);
    assert.equal(scanRes[0].key, 'user:075');
    assert.equal(scanRes[1].key, 'user:100');

    sl.delete('user:100');
    assert.equal(sl.get('user:100'), undefined);
  });
});

describe('SSTable On-Disk Format', () => {
  it('should write and read SSTables with embedded Bloom filters and sparse index', () => {
    const sstPath = path.join(testDir, 'test.sst');
    const entries = [];

    for (let i = 0; i < 100; i++) {
      const key = `key:${String(i).padStart(4, '0')}`;
      const value = Buffer.from(`value-data-${i}`);
      entries.push({
        key,
        value: { value, timestamp: Date.now(), isDeleted: false }
      });
    }

    const writer = new SSTableWriter(sstPath);
    writer.write(entries);

    const reader = new SSTableReader(sstPath);
    reader.open();

    const row0 = reader.get('key:0000');
    assert.ok(row0);
    assert.equal(row0.value.toString(), 'value-data-0');

    const row50 = reader.get('key:0050');
    assert.ok(row50);
    assert.equal(row50.value.toString(), 'value-data-50');

    const rowAbsent = reader.get('key:9999');
    assert.equal(rowAbsent, null);
  });
});

describe('LSMTree Integrated Engine & Compaction', () => {
  it('should handle put, get, delete, flush, and leveled compaction', () => {
    // Low threshold of 200 bytes to force frequent flushes & compaction
    const lsm = new LSMTree({
      dataDir: testDir,
      memTableMaxBytes: 300,
      compactionThreshold: 2
    });
    lsm.open();

    for (let i = 0; i < 50; i++) {
      lsm.put(`metric:${i}`, `value-${i}`);
    }

    // Verify all keys can be fetched regardless of whether in MemTable, L0, or L1
    for (let i = 0; i < 50; i++) {
      const val = lsm.get(`metric:${i}`);
      assert.ok(val, `Missing key metric:${i}`);
      assert.equal(val.toString(), `value-${i}`);
    }

    // Delete a key
    lsm.delete('metric:10');
    assert.equal(lsm.get('metric:10'), null);

    // Overwrite a key
    lsm.put('metric:20', 'updated-value-20');
    assert.equal(lsm.get('metric:20').toString(), 'updated-value-20');

    lsm.close();

    // Reopen LSMTree from disk
    const reopened = new LSMTree({ dataDir: testDir });
    reopened.open();
    assert.equal(reopened.get('metric:10'), null);
    assert.equal(reopened.get('metric:20').toString(), 'updated-value-20');
    assert.equal(reopened.get('metric:40').toString(), 'value-40');
    reopened.close();
  });
});
