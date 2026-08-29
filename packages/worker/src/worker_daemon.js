/**
 * @file worker_daemon.js
 * Standalone WorkerDaemon managing local Chase-Lev task deques,
 * concurrent executor threads, cluster heartbeats, and peer work-stealing.
 */

import { EventEmitter } from 'node:events';
import { ChaseLevDeque } from './chase_lev_deque.js';
import { TaskExecutor } from './task_executor.js';
import { defaultLogger } from '@krono/core';

export class WorkerDaemon extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} options.workerId Unique worker node identifier
   * @param {number} [options.concurrency=4] Concurrent executor slots
   * @param {Function} [options.reportResult] Callback to report task result to cluster scheduler
   * @param {Object} [options.logger]
   */
  constructor(options) {
    super();
    this.workerId = options.workerId;
    this.concurrency = options.concurrency || 4;
    this.reportResult = options.reportResult || (async () => {});
    this.logger = (options.logger || defaultLogger).child(`worker:${this.workerId}`);

    this.localDeque = new ChaseLevDeque();
    this.executor = new TaskExecutor(this.workerId);
    this.activeTasks = new Map();
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.logger.info('Worker daemon started', { concurrency: this.concurrency });
  }

  stop() {
    this.isRunning = false;
    this.logger.info('Worker daemon stopped');
  }

  /**
   * Accepts and enqueues a dispatched task from cluster scheduler.
   * @param {Object} taskItem
   */
  assignTask(taskItem) {
    this.localDeque.push(taskItem);
    this._processNext();
  }

  async _processNext() {
    if (!this.isRunning || this.activeTasks.size >= this.concurrency) return;

    // Pop task from local deque (LIFO)
    const taskItem = this.localDeque.pop();
    if (!taskItem) return;

    this.activeTasks.set(taskItem.taskId, taskItem);
    this.emit('taskStarted', taskItem);

    try {
      const result = await this.executor.runTask(taskItem);
      this.activeTasks.delete(taskItem.taskId);
      this.emit('taskFinished', result);
      await this.reportResult(result);
    } catch (err) {
      this.activeTasks.delete(taskItem.taskId);
      this.logger.error('Error executing task', { taskId: taskItem.taskId, error: err.message });
    }

    // Trigger next task if available
    this._processNext();
  }

  /**
   * Allows other idle worker daemons to steal a pending task from this worker's deque (FIFO).
   * @returns {any|undefined}
   */
  stealTask() {
    return this.localDeque.steal();
  }
}
