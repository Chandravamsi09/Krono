/**
 * @file raft.test.js
 * Multi-node consensus tests for @krono/raft:
 * Leader election, log replication, commit progression, and leader failover simulation.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { RaftNode, RaftRole } from '../src/index.js';

let testDir;

beforeEach(() => {
  testDir = path.join(os.tmpdir(), `krono-raft-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  fs.mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

/**
 * Creates an in-memory networked cluster of Raft nodes.
 */
function createCluster(nodeIds) {
  const nodes = new Map();

  for (const id of nodeIds) {
    const peers = nodeIds.filter((p) => p !== id);
    const stateFile = path.join(testDir, `raft-${id}.state`);

    const node = new RaftNode({
      nodeId: id,
      peers,
      stateFilePath: stateFile,
      rpcSender: async (targetId, rpcType, args) => {
        const targetNode = nodes.get(targetId);
        if (!targetNode || !targetNode.isRunning) {
          throw new Error(`Node ${targetId} unreachable`);
        }
        if (rpcType === 'RequestVote') {
          return targetNode.handleRequestVote(args);
        } else if (rpcType === 'AppendEntries') {
          return targetNode.handleAppendEntries(args);
        }
        throw new Error(`Unknown RPC ${rpcType}`);
      }
    });

    nodes.set(id, node);
  }

  return nodes;
}

describe('Raft Consensus Cluster', () => {
  it('should elect a single leader among a 3-node cluster', async () => {
    const cluster = createCluster(['node-1', 'node-2', 'node-3']);

    for (const node of cluster.values()) {
      node.start();
    }

    // Wait for election to resolve (up to 1.5s)
    await new Promise((resolve) => setTimeout(resolve, 600));

    const leaders = Array.from(cluster.values()).filter((n) => n.role === RaftRole.LEADER);
    const followers = Array.from(cluster.values()).filter((n) => n.role === RaftRole.FOLLOWER);

    assert.equal(leaders.length, 1, 'Expected exactly 1 elected leader');
    assert.equal(followers.length, 2, 'Expected 2 followers');

    const leader = leaders[0];
    assert.ok(leader.currentTerm >= 1);

    for (const node of cluster.values()) {
      node.stop();
    }
  });

  it('should replicate client command proposals across quorum', async () => {
    const cluster = createCluster(['node-1', 'node-2', 'node-3']);

    for (const node of cluster.values()) {
      node.start();
    }

    // Wait for leader
    await new Promise((resolve) => setTimeout(resolve, 600));
    const leader = Array.from(cluster.values()).find((n) => n.role === RaftRole.LEADER);
    assert.ok(leader, 'Leader must be elected');

    const appliedEntries = [];
    for (const node of cluster.values()) {
      node.on('apply', (entry) => {
        if (entry.data.length > 0) {
          appliedEntries.push({ nodeId: node.nodeId, data: entry.data.toString() });
        }
      });
    }

    // Propose command to leader
    const committedEntry = await leader.propose(Buffer.from('SET key=krono-consensus-value'));
    assert.ok(committedEntry);
    assert.equal(committedEntry.data.toString(), 'SET key=krono-consensus-value');

    // Give peers a moment to receive commit index
    await new Promise((resolve) => setTimeout(resolve, 150));

    // Verify all active nodes applied the state update
    assert.ok(appliedEntries.length >= 2, 'Quorum must have applied the entry');
    assert.ok(appliedEntries.some((e) => e.data === 'SET key=krono-consensus-value'));

    for (const node of cluster.values()) {
      node.stop();
    }
  });

  it('should handle leader failure and trigger re-election', async () => {
    const cluster = createCluster(['node-1', 'node-2', 'node-3']);

    for (const node of cluster.values()) {
      node.start();
    }

    await new Promise((resolve) => setTimeout(resolve, 600));
    const firstLeader = Array.from(cluster.values()).find((n) => n.role === RaftRole.LEADER);
    assert.ok(firstLeader);

    // Crash the first leader
    firstLeader.stop();

    // Wait for remaining followers to detect timeout and elect new leader
    await new Promise((resolve) => setTimeout(resolve, 700));

    const remainingNodes = Array.from(cluster.values()).filter((n) => n !== firstLeader);
    const newLeaders = remainingNodes.filter((n) => n.role === RaftRole.LEADER);

    assert.equal(newLeaders.length, 1, 'A new leader must be elected');
    assert.notEqual(newLeaders[0].nodeId, firstLeader.nodeId);
    assert.ok(newLeaders[0].currentTerm > firstLeader.currentTerm);

    for (const node of cluster.values()) {
      node.stop();
    }
  });
});
