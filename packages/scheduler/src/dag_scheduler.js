/**
 * @file dag_scheduler.js
 * High-performance distributed DAG Scheduler orchestrating workflow life cycles,
 * priority task queuing, worker dispatching, and failure retries.
 */

import { EventEmitter } from 'node:events';
import { PriorityQueue, defaultLogger } from '@krono/core';
import { TaskState } from '@krono/protocol';
import { DAGCompiler } from './dag_compiler.js';
import { WorkflowInstance, WorkflowState } from './workflow_instance.js';
import { DeadLetterQueue } from './dead_letter_queue.js';

export class DAGScheduler extends EventEmitter {
  /**
   * @param {Object} [options]
   * @param {Object} [options.logger]
   */
  constructor(options = {}) {
    super();
    this.logger = (options.logger || defaultLogger).child('dag-scheduler');

    /** @type {Map<string, WorkflowInstance>} */
    this.workflows = new Map();

    // Priority Queue for ready tasks: higher priority number executed first
    this.taskQueue = new PriorityQueue((a, b) => b.priority - a.priority);

    this.dlq = new DeadLetterQueue();
    this.activeWorkers = new Set();
    this.isRunning = false;
  }

  start() {
    this.isRunning = true;
    this.logger.info('DAG Scheduler started');
  }

  stop() {
    this.isRunning = false;
    this.logger.info('DAG Scheduler stopped');
  }

  /**
   * Submits a DAG workflow for execution.
   * @param {Object} jobSpec
   * @param {string} jobSpec.jobId
   * @param {string} jobSpec.name
   * @param {number} [jobSpec.priority=0]
   * @param {Array} jobSpec.tasks
   * @returns {WorkflowInstance}
   */
  submitWorkflow(jobSpec) {
    const { sortedTaskIds, stages, taskMap } = DAGCompiler.compile(jobSpec.tasks);

    const instance = new WorkflowInstance({
      jobId: jobSpec.jobId,
      name: jobSpec.name,
      priority: jobSpec.priority ?? 0,
      tasks: jobSpec.tasks,
      stages,
      taskMap
    });

    this.workflows.set(jobSpec.jobId, instance);
    instance.start();

    this.emit('workflowStarted', instance);
    this._scheduleReadyTasks(instance);

    return instance;
  }

  _scheduleReadyTasks(workflow) {
    const readyTasks = workflow.getReadyTasks();
    for (const task of readyTasks) {
      task.state = TaskState.RUNNING;
      this.taskQueue.push({
        jobId: workflow.jobId,
        taskId: task.spec.taskId,
        priority: workflow.priority,
        spec: task.spec
      });
    }

    if (readyTasks.length > 0) {
      this.emit('tasksQueued', readyTasks.length);
      this._drainQueue();
    }
  }

  _drainQueue() {
    while (!this.taskQueue.isEmpty()) {
      const taskItem = this.taskQueue.pop();
      this.emit('dispatchTask', taskItem);
    }
  }

  /**
   * Handles task completion result from worker node.
   * @param {Object} result
   * @param {string} result.jobId
   * @param {string} result.taskId
   * @param {number} [result.exitCode=0]
   * @param {string} [result.stdout]
   * @param {string} [result.stderr]
   * @param {any} [result.error]
   */
  handleTaskResult(result) {
    const workflow = this.workflows.get(result.jobId);
    if (!workflow) return;

    if (result.exitCode === 0 && !result.error) {
      workflow.markTaskCompleted(result.taskId, result);
      this.emit('taskCompleted', { jobId: result.jobId, taskId: result.taskId });

      if (workflow.state === WorkflowState.COMPLETED) {
        this.emit('workflowCompleted', workflow);
      } else {
        // Schedule newly unblocked tasks
        this._scheduleReadyTasks(workflow);
      }
    } else {
      // Task failed
      workflow.markTaskFailed(result.taskId, result.error || `Exit code ${result.exitCode}`);
      const task = workflow.tasks.get(result.taskId);

      if (task.state === TaskState.RETRYING) {
        const delay = this.dlq.calculateBackoff(task.attempts);
        this.logger.warn('Retrying failed task after backoff', { taskId: result.taskId, attempt: task.attempts, delayMs: delay });
        setTimeout(() => {
          task.state = TaskState.PENDING;
          this._scheduleReadyTasks(workflow);
        }, delay);
      } else {
        // Quarantined in DLQ
        this.dlq.quarantine(result.taskId, task, result.error);
        this.emit('workflowFailed', { workflow, failedTaskId: result.taskId });
      }
    }
  }
}
