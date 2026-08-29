/**
 * @file server.js
 * Unified Krono Cluster Server Daemon.
 * Integrates:
 * - Segmented Append-Only Log Storage Engine
 * - LSM-Tree Key-Value State Machine
 * - Raft Consensus Node
 * - SWIM Failure Detector & Consistent Hash Coordinator
 * - Distributed DAG Workflow Scheduler
 * - REST / WebSocket API Gateway
 */

import path from 'node:path';
import { PartitionStore } from '@krono/storage';
import { LSMTree } from '@krono/lsm';
import { RaftNode } from '@krono/raft';
import { ClusterCoordinator } from '@krono/cluster';
import { DAGScheduler } from '@krono/scheduler';
import { WorkerDaemon } from '@krono/worker';
import { RestServer } from '@krono/gateway';
import { Logger, defaultLogger } from '@krono/core';

export class KronoServer {
  constructor(config) {
    this.config = config;
    this.logger = new Logger({ module: `krono-server:${config.nodeId}` });

    const storageDir = path.join(config.dataDir, 'storage');
    const lsmDir = path.join(config.dataDir, 'lsm');
    const raftStateFile = path.join(config.dataDir, 'raft.state');

    // 1. Initialize Storage Subsystems
    this.storage = new PartitionStore({ dataDir: storageDir });
    this.lsm = new LSMTree({ dataDir: lsmDir });

    // 2. Initialize Cluster & Consensus Subsystems
    this.cluster = new ClusterCoordinator({
      nodeId: config.nodeId,
      port: config.clusterPort,
      seedNodes: config.seedNodes,
      logger: this.logger
    });

    this.raft = new RaftNode({
      nodeId: config.nodeId,
      peers: config.peers,
      stateFilePath: raftStateFile,
      logger: this.logger
    });

    // 3. Initialize DAG Scheduler & Local Worker
    this.scheduler = new DAGScheduler({ logger: this.logger });
    this.worker = new WorkerDaemon({
      workerId: `worker-${config.nodeId}`,
      concurrency: 4,
      reportResult: async (res) => {
        this.scheduler.handleTaskResult(res);
      },
      logger: this.logger
    });

    // Connect Scheduler to Worker dispatch
    this.scheduler.on('dispatchTask', (task) => {
      this.worker.assignTask(task);
    });

    // 4. Initialize Gateway
    this.gateway = new RestServer({
      port: config.httpPort,
      engine: {
        storage: this.storage,
        lsm: this.lsm,
        raft: this.raft,
        cluster: this.cluster,
        scheduler: this.scheduler
      },
      logger: this.logger
    });

    this.isRunning = false;
  }

  async start() {
    if (this.isRunning) return;
    this.logger.info('Bootstrapping Krono Distributed Engine...', { nodeId: this.config.nodeId });

    this.storage.open();
    this.lsm.open();
    this.cluster.start();
    this.raft.start();
    this.scheduler.start();
    this.worker.start();
    await this.gateway.start();

    this.isRunning = true;
    this.logger.info('Krono Server is online and ready for traffic!');
  }

  async stop() {
    if (!this.isRunning) return;
    this.logger.info('Shutting down Krono Server...');

    await this.gateway.stop();
    this.worker.stop();
    this.scheduler.stop();
    this.raft.stop();
    this.cluster.stop();
    this.lsm.close();
    this.storage.close();

    this.isRunning = false;
    this.logger.info('Krono Server shutdown completed');
  }
}
