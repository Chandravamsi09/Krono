/**
 * @file throughput.js
 * High-throughput benchmark tool measuring write IOPS, segment rolling,
 * and LSM-Tree throughput.
 */

import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { SegmentedLog } from '@krono/storage';
import { LSMTree } from '@krono/lsm';

async function runStorageBenchmark() {
  const benchDir = path.join(os.tmpdir(), `krono-bench-${Date.now()}`);
  fs.mkdirSync(benchDir, { recursive: true });

  console.log('====================================================');
  console.log('⚡ Krono Distributed Storage & LSM Engine Benchmark');
  console.log('====================================================\n');

  // 1. Benchmark Segmented WAL Append Throughput
  const log = new SegmentedLog({
    dir: path.join(benchDir, 'wal'),
    maxSegmentBytes: 10 * 1024 * 1024,
    indexIntervalBytes: 4096
  });
  log.open();

  const ITERATIONS = 50000;
  const payload = Buffer.from('x'.repeat(256)); // 256 bytes

  console.log(`[1/2] Appending ${ITERATIONS.toLocaleString()} records (256 B each) to SegmentedLog...`);
  const t0 = performance.now();

  for (let i = 0; i < ITERATIONS; i++) {
    log.append(`bench-key-${i}`, payload);
  }
  log.flush();

  const t1 = performance.now();
  const durationSec = (t1 - t0) / 1000;
  const iops = Math.round(ITERATIONS / durationSec);
  const throughputMB = ((ITERATIONS * 256) / (1024 * 1024) / durationSec).toFixed(2);

  console.log(`  ✔ Completed in: ${durationSec.toFixed(3)}s`);
  console.log(`  ✔ Append Rate:  ${iops.toLocaleString()} ops/sec`);
  console.log(`  ✔ Throughput:   ${throughputMB} MB/sec\n`);

  log.close();

  // 2. Benchmark LSM-Tree Writes & Compaction
  const lsm = new LSMTree({
    dataDir: path.join(benchDir, 'lsm'),
    memTableMaxBytes: 1024 * 1024,
    compactionThreshold: 4
  });
  lsm.open();

  console.log(`[2/2] Writing ${ITERATIONS.toLocaleString()} keys into LSM-Tree (with MemTable flushes)...`);
  const t2 = performance.now();

  for (let i = 0; i < ITERATIONS; i++) {
    lsm.put(`user:${i}`, `payload-value-string-${i}`);
  }
  lsm.flushMemTable();

  const t3 = performance.now();
  const lsmDuration = (t3 - t2) / 1000;
  const lsmIops = Math.round(ITERATIONS / lsmDuration);

  console.log(`  ✔ Completed in: ${lsmDuration.toFixed(3)}s`);
  console.log(`  ✔ LSM Put Rate: ${lsmIops.toLocaleString()} ops/sec\n`);

  lsm.close();
  fs.rmSync(benchDir, { recursive: true, force: true });

  console.log('====================================================');
  console.log('🎉 Benchmark completed successfully!');
  console.log('====================================================');
}

runStorageBenchmark().catch(console.error);
