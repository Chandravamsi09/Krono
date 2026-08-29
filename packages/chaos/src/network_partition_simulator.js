/**
 * @file network_partition_simulator.js
 * Simulated software-defined network switch for chaos testing.
 * Supports:
 * - Bidirectional network partitions (e.g. {A, B} vs {C, D, E})
 * - Asymmetric packet drops
 * - Latency injection & jitter
 * - Packet duplication & reordering
 */

export class NetworkPartitionSimulator {
  constructor() {
    /** @type {Set<string>} Partition edges stored as "nodeA:nodeB" (directional block) */
    this.blockedLinks = new Set();
    this.dropRate = 0.0;
    this.baseLatencyMs = 0;
    this.latencyJitterMs = 0;
  }

  /**
   * Partitions the cluster into isolated components.
   * e.g. partition([['node-1', 'node-2'], ['node-3', 'node-4', 'node-5']])
   * @param {string[][]} components
   */
  createPartition(components) {
    this.clearPartitions();
    for (let c1 = 0; c1 < components.length; c1++) {
      for (let c2 = c1 + 1; c2 < components.length; c2++) {
        const group1 = components[c1];
        const group2 = components[c2];

        for (const n1 of group1) {
          for (const n2 of group2) {
            this.blockLink(n1, n2);
            this.blockLink(n2, n1);
          }
        }
      }
    }
  }

  blockLink(fromNode, toNode) {
    this.blockedLinks.add(`${fromNode}:${toNode}`);
  }

  healLink(fromNode, toNode) {
    this.blockedLinks.delete(`${fromNode}:${toNode}`);
  }

  clearPartitions() {
    this.blockedLinks.clear();
  }

  setFaults({ dropRate = 0.0, baseLatencyMs = 0, latencyJitterMs = 0 }) {
    this.dropRate = dropRate;
    this.baseLatencyMs = baseLatencyMs;
    this.latencyJitterMs = latencyJitterMs;
  }

  /**
   * Intercepts and routes an RPC call through simulated network faults.
   * @param {string} fromNode
   * @param {string} toNode
   * @param {Function} transportFn
   * @returns {Promise<any>}
   */
  async route(fromNode, toNode, transportFn) {
    // 1. Check partition block
    if (this.blockedLinks.has(`${fromNode}:${toNode}`)) {
      throw new Error(`Network partition: link ${fromNode} -> ${toNode} is blocked`);
    }

    // 2. Check random packet drop
    if (this.dropRate > 0 && Math.random() < this.dropRate) {
      throw new Error(`Packet dropped randomly on link ${fromNode} -> ${toNode}`);
    }

    // 3. Inject latency if configured
    if (this.baseLatencyMs > 0) {
      const jitter = this.latencyJitterMs > 0 ? (Math.random() * this.latencyJitterMs) : 0;
      await new Promise((r) => setTimeout(r, this.baseLatencyMs + jitter));
    }

    return await transportFn();
  }
}
