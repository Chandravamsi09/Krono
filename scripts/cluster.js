/**
 * @file cluster.js
 * Spawns a 3-node local Krono cluster for testing and dashboard observation.
 */

import { KronoServer } from '../apps/server/src/server.js';
import path from 'node:path';
import os from 'node:os';

async function startCluster() {
  const baseDir = path.join(os.tmpdir(), `krono-local-cluster-${Date.now()}`);

  const node1 = new KronoServer({
    nodeId: 'krono-01',
    httpPort: 8081,
    clusterPort: 9001,
    dataDir: path.join(baseDir, 'n1'),
    seedNodes: ['krono-01', 'krono-02', 'krono-03'],
    peers: ['krono-02', 'krono-03']
  });

  const node2 = new KronoServer({
    nodeId: 'krono-02',
    httpPort: 8082,
    clusterPort: 9002,
    dataDir: path.join(baseDir, 'n2'),
    seedNodes: ['krono-01', 'krono-02', 'krono-03'],
    peers: ['krono-01', 'krono-03']
  });

  const node3 = new KronoServer({
    nodeId: 'krono-03',
    httpPort: 8083,
    clusterPort: 9003,
    dataDir: path.join(baseDir, 'n3'),
    seedNodes: ['krono-01', 'krono-02', 'krono-03'],
    peers: ['krono-01', 'krono-02']
  });

  console.log('🚀 Starting 3-node Krono Cluster...');
  await node1.start();
  await node2.start();
  await node3.start();

  console.log('\n======================================================');
  console.log('✨ Krono Cluster Running:');
  console.log('   - Node 01: http://localhost:8081 (Cluster: :9001)');
  console.log('   - Node 02: http://localhost:8082 (Cluster: :9002)');
  console.log('   - Node 03: http://localhost:8083 (Cluster: :9003)');
  console.log('======================================================\n');
}

startCluster().catch(console.error);
