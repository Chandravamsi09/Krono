/**
 * @file config.js
 * Configuration loader for Krono Cluster Node Daemon.
 */

import path from 'node:path';

export function loadConfig(overrides = {}) {
  const nodeId = process.env.KRONO_NODE_ID || overrides.nodeId || `krono-node-${Math.random().toString(36).slice(2, 6)}`;
  const httpPort = parseInt(process.env.KRONO_HTTP_PORT || overrides.httpPort || '8080', 10);
  const clusterPort = parseInt(process.env.KRONO_CLUSTER_PORT || overrides.clusterPort || '9000', 10);
  const dataDir = process.env.KRONO_DATA_DIR || overrides.dataDir || path.join(process.cwd(), 'data', nodeId);
  const seedNodes = (process.env.KRONO_SEEDS ? process.env.KRONO_SEEDS.split(',') : overrides.seedNodes || []);
  const peers = (process.env.KRONO_PEERS ? process.env.KRONO_PEERS.split(',') : overrides.peers || []);

  return {
    nodeId,
    httpPort,
    clusterPort,
    dataDir,
    seedNodes,
    peers
  };
}
