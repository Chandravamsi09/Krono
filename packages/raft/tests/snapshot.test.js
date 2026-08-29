/**
 * @file snapshot.test.js
 * Unit tests for SnapshotManager and JointConsensus dynamic membership.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { SnapshotManager, JointConsensusConfig, JointConsensusStage } from '../src/index.js';

let testDir;

beforeEach(() => {
  testDir = path.join(os.tmpdir(), `krono-snap-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

describe('SnapshotManager State Compaction', () => {
  it('should save, read, and chunk snapshots with CRC integrity', () => {
    const snapMgr = new SnapshotManager(testDir);
    snapMgr.open();

    const stateData = Buffer.from(JSON.stringify({ table: 'users', rows: 5000, checksum: 123456 }));
    snapMgr.saveSnapshot(100, 3, stateData);

    const loaded = snapMgr.readSnapshot();
    assert.ok(loaded);
    assert.equal(loaded.lastIncludedIndex, 100);
    assert.equal(loaded.lastIncludedTerm, 3);
    assert.deepEqual(loaded.data, stateData);

    // Chunk generation
    const chunk1 = snapMgr.getSnapshotChunk('leader-1', 3, 0);
    assert.ok(chunk1);
    assert.equal(chunk1.lastIncludedIndex, 100);
    assert.equal(chunk1.done, true);
    assert.deepEqual(chunk1.data, stateData);
  });
});

describe('JointConsensus Dynamic Membership', () => {
  it('should require dual majority during C_old,new transitions', () => {
    // Initial 3-node cluster: [N1, N2, N3]
    const config = new JointConsensusConfig(['N1', 'N2', 'N3']);
    assert.equal(config.hasQuorum(['N1', 'N2']), true);
    assert.equal(config.hasQuorum(['N1']), false);

    // Transition to 5-node cluster: [N1, N2, N3] + [N1, N2, N3, N4, N5]
    const joint = config.enterJoint(['N1', 'N2', 'N3', 'N4', 'N5']);
    assert.equal(joint.stage, JointConsensusStage.JOINT_TRANSITION);

    // N1, N2 is majority in C_old (2/3), but NOT majority in C_new (2/5 requires 3)
    assert.equal(joint.hasQuorum(['N1', 'N2']), false);

    // N1, N2, N4 is majority in both C_old (2/3) and C_new (3/5) => Quorum satisfied!
    assert.equal(joint.hasQuorum(['N1', 'N2', 'N4']), true);

    // Finalize to C_new
    const finalConfig = joint.finalizeNew();
    assert.equal(finalConfig.stage, JointConsensusStage.STABLE);
    assert.equal(finalConfig.oldNodes.length, 5);
    assert.equal(finalConfig.hasQuorum(['N1', 'N2', 'N3']), true);
  });
});
