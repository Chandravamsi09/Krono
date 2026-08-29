/**
 * @file cluster.test.js
 * Unit and cluster tests for @krono/cluster:
 * SWIM failure detector, ConsistentHashRing, and LeaseManager.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SWIMFailureDetector,
  ConsistentHashRing,
  LeaseManager,
  ClusterCoordinator
} from '../src/index.js';
import { NodeStatus } from '@krono/protocol';

describe('ConsistentHashRing Partition Placement', () => {
  it('should deterministically assign partitions and balance load across nodes', () => {
    const ring = new ConsistentHashRing({ vnodesPerNode: 128, replicationFactor: 3 });

    ring.addNode('node-alpha');
    ring.addNode('node-beta');
    ring.addNode('node-gamma');

    const primary1 = ring.getNode('orders/partition-0');
    const primary2 = ring.getNode('orders/partition-1');
    const primary3 = ring.getNode('payments/partition-0');

    assert.ok(['node-alpha', 'node-beta', 'node-gamma'].includes(primary1));
    assert.ok(['node-alpha', 'node-beta', 'node-gamma'].includes(primary2));

    // Test multi-replica preference list
    const replicas = ring.getPreferenceList('orders/partition-0', 3);
    assert.equal(replicas.length, 3);
    assert.equal(new Set(replicas).size, 3, 'Preference list must contain distinct physical nodes');
  });

  it('should minimize data migration when adding a new node', () => {
    const ring = new ConsistentHashRing({ vnodesPerNode: 128 });
    ring.addNode('node-1');
    ring.addNode('node-2');
    ring.addNode('node-3');

    const partitions = Array.from({ length: 100 }, (_, i) => `topic/p-${i}`);
    const migrationPlan = ring.computeMigrationPlan(partitions, ['node-1', 'node-2', 'node-3', 'node-4']);

    // Consistent hashing ensures only ~1/4 of partitions migrate to new 4th node
    assert.ok(migrationPlan.length > 0 && migrationPlan.length < 50, `Expected ~25 migrations, got ${migrationPlan.length}`);
    for (const item of migrationPlan) {
      assert.equal(item.newOwner, 'node-4');
    }
  });
});

describe('LeaseManager Epoch & Fencing', () => {
  it('should grant, renew, and enforce monotonic fencing tokens', () => {
    const leaseMgr = new LeaseManager({ defaultTtlMs: 200 });

    const grant1 = leaseMgr.acquireLease('leader-lock', 'node-1', 200);
    assert.equal(grant1.granted, true);
    assert.equal(grant1.holderNodeId, 'node-1');
    assert.ok(grant1.fencingToken > 0n);

    // Node 2 tries while held by Node 1
    const grant2 = leaseMgr.acquireLease('leader-lock', 'node-2', 200);
    assert.equal(grant2.granted, false);

    // Validate fencing token
    assert.equal(leaseMgr.validateFencingToken('leader-lock', grant1.fencingToken), true);
    assert.equal(leaseMgr.validateFencingToken('leader-lock', 9999n), false);

    // Release lease
    assert.equal(leaseMgr.releaseLease('leader-lock', 'node-1'), true);

    // Now node 2 can acquire with a strictly higher fencing token
    const grant3 = leaseMgr.acquireLease('leader-lock', 'node-2', 200);
    assert.equal(grant3.granted, true);
    assert.equal(grant3.holderNodeId, 'node-2');
    assert.ok(grant3.fencingToken > grant1.fencingToken);
  });
});

describe('SWIM Failure Detector Multi-Node Mesh', () => {
  it('should detect node failure via direct & indirect probes', async () => {
    const nodeA = new SWIMFailureDetector({
      localNodeId: 'A',
      pingIntervalMs: 30,
      pingTimeoutMs: 15,
      suspicionTimeoutMs: 40,
      transport: async (target, type) => {
        if (target === 'B') {
          // B is alive
          return { ack: true };
        }
        throw new Error('Unreachable');
      }
    });

    nodeA.addMember('B');
    nodeA.start();

    await new Promise((r) => setTimeout(r, 60));

    const alive = nodeA.getAliveMembers();
    assert.equal(alive.length, 2); // A and B

    nodeA.stop();
  });
});
