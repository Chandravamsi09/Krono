/**
 * @file cluster_coordinator.js
 * High-level ClusterCoordinator integrating SWIM failure detection,
 * Consistent Hash ring partition assignment, and distributed leases.
 */

import { EventEmitter } from 'node:events';
import { SWIMFailureDetector } from './swim_detector.js';
import { ConsistentHashRing } from './consistent_hash_ring.js';
import { LeaseManager } from './lease_manager.js';
import { defaultLogger } from '@krono/core';

export class ClusterCoordinator extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} options.nodeId
   * @param {string} [options.address='127.0.0.1']
   * @param {number} [options.port=9000]
   * @param {string[]} [options.seedNodes=[]]
   * @param {Function} [options.transport]
   * @param {Object} [options.logger]
   */
  constructor(options) {
    super();
    this.nodeId = options.nodeId;
    this.address = options.address || '127.0.0.1';
    this.port = options.port || 9000;
    this.seedNodes = options.seedNodes || [];
    this.logger = (options.logger || defaultLogger).child(`cluster:${this.nodeId}`);

    this.swim = new SWIMFailureDetector({
      localNodeId: this.nodeId,
      localAddress: this.address,
      localPort: this.port,
      transport: options.transport,
      logger: this.logger
    });

    this.hashRing = new ConsistentHashRing({ vnodesPerNode: 64, replicationFactor: 3 });
    this.leaseManager = new LeaseManager();

    this.hashRing.addNode(this.nodeId);

    // Bind SWIM events
    this.swim.on('nodeAlive', (node) => {
      this.hashRing.addNode(node.nodeId);
      this.emit('topologyChange', { type: 'JOIN', nodeId: node.nodeId });
    });

    this.swim.on('nodeDead', (node) => {
      this.hashRing.removeNode(node.nodeId);
      this.emit('topologyChange', { type: 'LEAVE', nodeId: node.nodeId });
    });
  }

  start() {
    this.swim.start();
    for (const seed of this.seedNodes) {
      if (seed !== this.nodeId) {
        this.swim.addMember(seed);
      }
    }
  }

  stop() {
    this.swim.stop();
  }

  /**
   * Resolves target owner node for topic partition.
   * @param {string} topic
   * @param {number} partitionId
   * @returns {string | null}
   */
  getPartitionOwner(topic, partitionId) {
    const partitionKey = `${topic}/${partitionId}`;
    return this.hashRing.getNode(partitionKey);
  }

  getClusterTopology() {
    return {
      localNodeId: this.nodeId,
      members: this.swim.getAliveMembers(),
      activeNodes: Array.from(this.hashRing.nodes)
    };
  }
}
