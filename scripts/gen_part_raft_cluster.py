import os

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

def write_f(rel_path, content):
    p = os.path.join(base_dir, rel_path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(content.strip() + '\n')
    print(f"Generated: {rel_path}")

# =========================================================================
# RAFT CONSENSUS EXTENSIONS
# =========================================================================

write_f('packages/raft/src/lease_read.js', '''/**
 * @file lease_read.js
 * Leader Lease Read Optimization for Raft.
 * Allows linearizable read queries to be served locally by the leader
 * without quorum network roundtrips during an active lease term.
 */

export class LeaseReadManager {
  /**
   * @param {Object} options
   * @param {number} [options.leaseDurationMs=150] Max duration of leader lease
   * @param {number} [options.clockDriftAllowanceMs=15] Max assumed clock skew
   */
  constructor(options = {}) {
    this.leaseDurationMs = options.leaseDurationMs || 150;
    this.clockDriftAllowanceMs = options.clockDriftAllowanceMs || 15;
    this.leaseValidUntil = 0;
  }

  /**
   * Extends the leader lease after successful quorum heartbeat acknowledgment.
   * @param {number} quorumAckTimestamp
   */
  renewLease(quorumAckTimestamp = Date.now()) {
    const effectiveLease = this.leaseDurationMs - this.clockDriftAllowanceMs;
    this.leaseValidUntil = quorumAckTimestamp + effectiveLease;
  }

  /**
   * Checks if local leader lease is currently valid for serving linearizable reads.
   * @returns {boolean}
   */
  isLeaseValid() {
    return Date.now() < this.leaseValidUntil;
  }

  revokeLease() {
    this.leaseValidUntil = 0;
  }
}
''')

write_f('packages/raft/src/witness_node.js', '''/**
 * @file witness_node.js
 * Raft Witness & Non-Voting Learner Node.
 * Participates in log replication without contributing to quorum election majorities.
 */

import { EventEmitter } from 'node:events';

export class WitnessNode extends EventEmitter {
  constructor(nodeId, clusterPeers = []) {
    super();
    this.nodeId = nodeId;
    this.clusterPeers = clusterPeers;
    this.currentTerm = 0;
    this.replicatedLog = [];
    this.commitIndex = 0;
    this.isRunning = false;
  }

  start() {
    this.isRunning = true;
  }

  stop() {
    this.isRunning = false;
  }

  handleAppendEntries(args) {
    if (args.term < this.currentTerm) {
      return { term: this.currentTerm, success: false };
    }

    this.currentTerm = args.term;

    // Apply entries to witness mirror log
    for (const entry of args.entries || []) {
      this.replicatedLog.push(entry);
    }

    if (args.leaderCommit > this.commitIndex) {
      this.commitIndex = Math.min(args.leaderCommit, this.replicatedLog.length);
    }

    return {
      term: this.currentTerm,
      success: true,
      matchIndex: this.replicatedLog.length
    };
  }
}
''')

write_f('packages/raft/src/pipelined_appender.js', '''/**
 * @file pipelined_appender.js
 * Pipelined Log Replication for Raft consensus.
 * Dispatches concurrent AppendEntries RPCs in a sliding window to maximize network bandwidth.
 */

export class PipelinedAppender {
  /**
   * @param {Object} options
   * @param {number} [options.maxInFlight=16] Maximum pipelined AppendEntries RPCs per peer
   * @param {Function} options.sendRpc RPC sender callback
   */
  constructor(options) {
    this.maxInFlight = options.maxInFlight || 16;
    this.sendRpc = options.sendRpc;
    /** @type {Map<string, number>} In-flight RPC count per peer */
    this.inFlightCounts = new Map();
  }

  canSend(peerId) {
    const cur = this.inFlightCounts.get(peerId) || 0;
    return cur < this.maxInFlight;
  }

  async replicatePipeline(peerId, rpcArgs) {
    const cur = this.inFlightCounts.get(peerId) || 0;
    this.inFlightCounts.set(peerId, cur + 1);

    try {
      return await this.sendRpc(peerId, 'AppendEntries', rpcArgs);
    } finally {
      const active = this.inFlightCounts.get(peerId) || 1;
      this.inFlightCounts.set(peerId, Math.max(0, active - 1));
    }
  }
}
''')

# =========================================================================
# CLUSTER TOPOLOGY EXTENSIONS
# =========================================================================

write_f('packages/cluster/src/anti_entropy.js', '''/**
 * @file anti_entropy.js
 * Merkle Tree based Anti-Entropy State Synchronizer.
 * Efficiently detects range differences between replica partitions with O(log N) hash tree exchange.
 */

import crypto from 'node:crypto';

export class MerkleTreeNode {
  constructor(hash, left = null, right = null, keyRange = null) {
    this.hash = hash;
    this.left = left;
    this.right = right;
    this.keyRange = keyRange;
  }
}

export class PartitionMerkleTree {
  /**
   * Builds a Merkle Tree from sorted key-value pairs.
   * @param {Array<{ key: string, valueHash: string }>} sortedEntries
   */
  static build(sortedEntries) {
    if (!sortedEntries || sortedEntries.length === 0) {
      return new MerkleTreeNode('00000000000000000000000000000000');
    }

    let leafNodes = sortedEntries.map(e => {
      const leafHash = crypto.createHash('sha256').update(`${e.key}:${e.valueHash}`).digest('hex');
      return new MerkleTreeNode(leafHash, null, null, [e.key, e.key]);
    });

    while (leafNodes.length > 1) {
      const nextLevel = [];
      for (let i = 0; i < leafNodes.length; i += 2) {
        const left = leafNodes[i];
        const right = i + 1 < leafNodes.length ? leafNodes[i + 1] : null;

        if (right) {
          const parentHash = crypto.createHash('sha256').update(left.hash + right.hash).digest('hex');
          const minKey = left.keyRange[0];
          const maxKey = right.keyRange[1];
          nextLevel.push(new MerkleTreeNode(parentHash, left, right, [minKey, maxKey]));
        } else {
          nextLevel.push(left);
        }
      }
      leafNodes = nextLevel;
    }

    return leafNodes[0];
  }

  /**
   * Compares two Merkle trees and returns divergent key ranges.
   * @param {MerkleTreeNode} localTree
   * @param {MerkleTreeNode} remoteTree
   * @returns {Array<[string, string]>}
   */
  static findDivergentRanges(localTree, remoteTree) {
    const diffRanges = [];

    function compare(n1, n2) {
      if (!n1 && !n2) return;
      if (!n1 || !n2 || n1.hash !== n2.hash) {
        if ((!n1?.left && !n1?.right) || (!n2?.left && !n2?.right)) {
          const range = n1?.keyRange || n2?.keyRange;
          if (range) diffRanges.push(range);
          return;
        }
        compare(n1?.left, n2?.left);
        compare(n1?.right, n2?.right);
      }
    }

    compare(localTree, remoteTree);
    return diffRanges;
  }
}
''')

write_f('packages/cluster/src/partition_balancer.js', '''/**
 * @file partition_balancer.js
 * Multi-Rack Fault-Domain Aware Partition Balancer.
 */

export class PartitionBalancer {
  /**
   * Rebalances topic partitions across cluster nodes with rack-awareness.
   * @param {Array<{ nodeId: string, rackId: string, isHealthy: boolean }>} nodes
   * @param {number} totalPartitions
   * @param {number} replicationFactor
   * @returns {Map<number, string[]>} partition -> [replicaNodeIds]
   */
  static balance(nodes, totalPartitions, replicationFactor = 3) {
    const healthyNodes = nodes.filter(n => n.isHealthy);
    if (healthyNodes.length === 0) throw new Error('No healthy nodes available');

    const replicaPlacement = new Map();
    const effectiveReplicas = Math.min(replicationFactor, healthyNodes.length);

    // Group nodes by rack
    const rackMap = new Map();
    for (const node of healthyNodes) {
      if (!rackMap.has(node.rackId)) rackMap.set(node.rackId, []);
      rackMap.get(node.rackId).push(node);
    }
    const racks = Array.from(rackMap.keys());

    for (let p = 0; p < totalPartitions; p++) {
      const assignedNodes = [];
      let rackIdx = p % racks.length;

      for (let r = 0; r < effectiveReplicas; r++) {
        const curRack = racks[(rackIdx + r) % racks.length];
        const rackNodes = rackMap.get(curRack);
        const node = rackNodes[(p + r) % rackNodes.length];

        if (!assignedNodes.includes(node.nodeId)) {
          assignedNodes.push(node.nodeId);
        }
      }

      replicaPlacement.set(p, assignedNodes);
    }

    return replicaPlacement;
  }
}
''')

print("Raft and Cluster additions generated successfully.")
''')

write_code = True
print("Created gen_part_raft_cluster.py")
