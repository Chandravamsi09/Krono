/**
 * @file workflow_instance.js
 * Represents a live execution instance of a submitted DAG job.
 */

import { TaskState } from '@krono/protocol';

export const WorkflowState = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED'
};

export class TaskRunState {
  constructor(spec) {
    this.spec = spec;
    this.state = TaskState.PENDING;
    this.assignedWorkerId = null;
    this.attempts = 0;
    this.startTime = null;
    this.endTime = null;
    this.exitCode = null;
    this.stdout = '';
    this.stderr = '';
    this.error = null;
  }
}

export class WorkflowInstance {
  /**
   * @param {Object} options
   * @param {string} options.jobId
   * @param {string} options.name
   * @param {number} [options.priority=0]
   * @param {Array} options.tasks
   * @param {string[][]} options.stages
   * @param {Map} options.taskMap
   */
  constructor(options) {
    this.jobId = options.jobId;
    this.name = options.name;
    this.priority = options.priority ?? 0;
    this.stages = options.stages;
    this.taskMap = options.taskMap;

    this.state = WorkflowState.PENDING;
    this.startTime = null;
    this.endTime = null;

    /** @type {Map<string, TaskRunState>} */
    this.tasks = new Map();
    for (const [taskId, spec] of options.taskMap.entries()) {
      this.tasks.set(taskId, new TaskRunState(spec));
    }
  }

  start() {
    this.state = WorkflowState.RUNNING;
    this.startTime = Date.now();
  }

  /**
   * Gets list of tasks that are currently ready to execute (all dependencies completed).
   * @returns {TaskRunState[]}
   */
  getReadyTasks() {
    if (this.state !== WorkflowState.RUNNING) return [];

    const ready = [];
    for (const task of this.tasks.values()) {
      if (task.state === TaskState.PENDING) {
        // Check if all dependencies are COMPLETED
        const allDepsDone = task.spec.dependencies.every((depId) => {
          const dep = this.tasks.get(depId);
          return dep && dep.state === TaskState.COMPLETED;
        });

        if (allDepsDone) {
          ready.push(task);
        }
      }
    }
    return ready;
  }

  /**
   * Marks task completed and checks if whole workflow is complete.
   * @param {string} taskId
   * @param {Object} result
   */
  markTaskCompleted(taskId, result = {}) {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.state = TaskState.COMPLETED;
    task.endTime = Date.now();
    task.exitCode = result.exitCode ?? 0;
    task.stdout = result.stdout || '';
    task.stderr = result.stderr || '';

    this._checkWorkflowFinished();
  }

  markTaskFailed(taskId, error = null) {
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.attempts++;
    if (task.attempts <= task.spec.maxRetries) {
      task.state = TaskState.RETRYING;
    } else {
      task.state = TaskState.FAILED;
      task.endTime = Date.now();
      task.error = error;
      this.state = WorkflowState.FAILED;
      this.endTime = Date.now();
    }
  }

  _checkWorkflowFinished() {
    const allDone = Array.from(this.tasks.values()).every((t) => t.state === TaskState.COMPLETED);
    if (allDone) {
      this.state = WorkflowState.COMPLETED;
      this.endTime = Date.now();
    }
  }
}
