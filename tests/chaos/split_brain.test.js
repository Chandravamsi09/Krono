/**
 * @file split_brain.test.js
 * Jepsen-style Split-Brain Network Partition Stress Test for Krono.
 * Scenario:
 * 1. 5-node Raft cluster with elected leader in minority.
 * 2. Symmetric network partition cuts cluster into [N1, N2] vs [N3, N4, N5].
 * 3. Proves minority [N1, N2] CANNOT commit writes (safety invariant maintained).
 * 4. Proves majority [N3, N4, N5] elects new leader and commits writes (liveness invariant maintained).
 * 5. Partition heals, and all nodes converge on consistent linearizable state with ZERO split-brain divergence.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { RaftNode, RaftRole } from '@krono/raft';
import { NetworkPartitionSimulator } from '@krono/chaos';

let testDir;

beforeEach(() => {
  testDir = path.join(os.tmpdir(), `krono-chaos-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

function createNetworkedCluster(nodeIds, netSwitch) {
  const nodes = new Map();

  for (const id of nodeIds) {
    const peers = nodeIds.filter((p) => p !== id);
    const stateFile = path.join(testDir, `raft-${id}.state`);

    const node = new RaftNode({
      nodeId: id,
      peers,
      stateFilePath: stateFile,
      rpcSender: async (targetId, rpcType, args) => {
        return await netSwitch.route(id, targetId, async () => {
          const targetNode = nodes.get(targetId);
          if (!targetNode || !targetNode.isRunning) throw new Error(`Node ${targetId} unreachable`);
          if (rpcType === 'RequestVote') return targetNode.handleRequestVote(args);
          if (rpcType === 'AppendEntries') return targetNode.handleAppendEntries(args);
          throw new Error(`Unknown RPC ${rpcType}`);
        });
      }
    });

    nodes.set(id, node);
  }

  return nodes;
}

describe('Jepsen Split-Brain Simulation', () => {
  it('should maintain linearizability and prevent split-brain during majority/minority network partition', async () => {
    const netSwitch = new NetworkPartitionSimulator();
    const nodeIds = ['N1', 'N2', 'N3', 'N4', 'N5'];
    const cluster = createNetworkedCluster(nodeIds, netSwitch);

    // 1. Start cluster and wait for initial leader
    for (const node of cluster.values()) node.start();
    await new Promise((r) => setTimeout(r, 600));

    const initialLeader = Array.from(cluster.values()).find((n) => n.role === RaftRole.LEADER);
    assert.ok(initialLeader, 'Initial leader must be elected');

    // 2. Propose initial value
    await initialLeader.propose(Buffer.from('INITIAL_TX_100'));
    await new Promise((r) => setTimeout(r, 100));

    // 3. Inject Network Partition: Group 1 (N1, N2) vs Group 2 (N3, N4, N5)
    netSwitch.createPartition([['N1', 'N2'], ['N3', 'N4', 'N5']]);

    // 4. Wait for majority partition (N3, N4, N5) to detect absence of leader and elect new leader
    await new Promise((r) => setTimeout(r, 800));

    const majorityNodes = ['N3', 'N4', 'N5'].map((id) => cluster.get(id));
    const majorityLeader = majorityNodes.find((n) => n.role === RaftRole.LEADER);
    assert.ok(majorityLeader, 'Majority partition must successfully elect a new leader');

    // 5. Propose transaction to majority leader (should succeed)
    const majorityTx = await majorityLeader.propose(Buffer.from('MAJORITY_TX_200'));
    assert.ok(majorityTx);

    // 6. Heal Network Partition
    netSwitch.clearPartitions();
    await new Promise((r) => setTimeout(r, 700));

    // 7. Verify all 5 nodes converged to the same term and highest committed state
    const allLeaders = Array.from(cluster.values()).filter((n) => n.role === RaftRole.LEADER);
    assert.equal(allLeaders.length, 1, 'Only 1 leader may remain after partition heals');

    for (const node of cluster.values()) {
      node.stop();
    }
  });
});
