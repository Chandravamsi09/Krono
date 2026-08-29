/**
 * @file consistent_hash_ring.js
 * Consistent Hashing Ring with Virtual Nodes (vNodes) for partition assignment,
 * minimal rebalance delta calculation, and multi-replica placement.
 */

import { crc32 } from '@krono/core';

export class ConsistentHashRing {
  /**
   * @param {Object} [options]
   * @param {number} [options.vnodesPerNode=128] Number of virtual node tokens per physical node
   * @param {number} [options.replicationFactor=3] Number of replicas per partition
   */
  constructor(options = {}) {
    this.vnodesPerNode = options.vnodesPerNode ?? 128;
    this.replicationFactor = options.replicationFactor ?? 3;

    /** @type {Array<{ hash: number, nodeId: string }>} Sorted ring tokens */
    this.ring = [];
    /** @type {Set<string>} Active physical nodes */
    this.nodes = new Set();
  }

  _hashKey(str) {
    return crc32(Buffer.from(String(str)));
  }

  /**
   * Adds a physical node and creates its vNodes on the ring.
   * @param {string} nodeId
   */
  addNode(nodeId) {
    if (this.nodes.has(nodeId)) return;
    this.nodes.add(nodeId);

    for (let i = 0; i < this.vnodesPerNode; i++) {
      const vnodeToken = `${nodeId}#vn${i}`;
      const hash = this._hashKey(vnodeToken);
      this.ring.push({ hash, nodeId });
    }

    this.ring.sort((a, b) => a.hash - b.hash);
  }

  /**
   * Removes a physical node and its vNodes.
   * @param {string} nodeId
   */
  removeNode(nodeId) {
    if (!this.nodes.has(nodeId)) return;
    this.nodes.delete(nodeId);
    this.ring = this.ring.filter((vn) => vn.nodeId !== nodeId);
  }

  /**
   * Locates the primary owner node for a key/partition.
   * @param {string} key
   * @returns {string | null}
   */
  getNode(key) {
    const nodes = this.getPreferenceList(key, 1);
    return nodes.length > 0 ? nodes[0] : null;
  }

  /**
   * Gets N unique physical nodes (preference list) for replication.
   * @param {string} key
   * @param {number} [count]
   * @returns {string[]}
   */
  getPreferenceList(key, count) {
    if (this.ring.length === 0) return [];

    const reqCount = count ?? this.replicationFactor;
    const keyHash = this._hashKey(key);

    // Binary search for first vnode with hash >= keyHash
    let low = 0;
    let high = this.ring.length - 1;
    let startIdx = 0;

    while (low <= high) {
      const mid = (low + high) >>> 1;
      if (this.ring[mid].hash >= keyHash) {
        startIdx = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    const matchedNodes = [];
    const seen = new Set();
    const totalVNodes = this.ring.length;

    for (let i = 0; i < totalVNodes && matchedNodes.length < reqCount; i++) {
      const idx = (startIdx + i) % totalVNodes;
      const candidate = this.ring[idx].nodeId;
      if (!seen.has(candidate)) {
        seen.add(candidate);
        matchedNodes.push(candidate);
      }
    }

    return matchedNodes;
  }

  /**
   * Computes partition migration diff between current ring and new node set.
   * @param {string[]} partitions
   * @param {string[]} newNodeSet
   * @returns {Array<{ partition: string, oldOwner: string, newOwner: string }>}
   */
  computeMigrationPlan(partitions, newNodeSet) {
    const tempRing = new ConsistentHashRing({
      vnodesPerNode: this.vnodesPerNode,
      replicationFactor: this.replicationFactor
    });
    for (const n of newNodeSet) tempRing.addNode(n);

    const plan = [];
    for (const p of partitions) {
      const oldOwner = this.getNode(p);
      const newOwner = tempRing.getNode(p);
      if (oldOwner && newOwner && oldOwner !== newOwner) {
        plan.push({ partition: p, oldOwner, newOwner });
      }
    }
    return plan;
  }
}
