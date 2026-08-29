/**
 * @file workflow_builder.js
 * Fluent builder for constructing and submitting DAG workflows.
 */

import { generateUUIDv7 } from '@krono/core';
import { DAGTaskSpec } from '@krono/protocol';

export class WorkflowBuilder {
  /**
   * @param {string} [name='Workflow']
   */
  constructor(name = 'Workflow') {
    this.jobId = generateUUIDv7();
    this.name = name;
    this.priority = 0;
    this.tasks = [];
    this.metadata = {};
  }

  setPriority(p) {
    this.priority = p;
    return this;
  }

  setMetadata(meta) {
    this.metadata = { ...this.metadata, ...meta };
    return this;
  }

  /**
   * Adds a task to the workflow DAG.
   * @param {Object} opts
   * @param {string} opts.id
   * @param {string} [opts.name]
   * @param {string} opts.command
   * @param {string[]} [opts.args=[]]
   * @param {string[]} [opts.dependsOn=[]]
   * @param {number} [opts.timeoutMs=30000]
   * @param {number} [opts.retries=3]
   * @returns {WorkflowBuilder}
   */
  addTask({ id, name, command, args = [], dependsOn = [], timeoutMs = 30000, retries = 3 }) {
    const taskSpec = new DAGTaskSpec({
      taskId: id,
      name: name || id,
      command,
      args,
      dependencies: dependsOn,
      timeoutMs,
      maxRetries: retries
    });
    this.tasks.push(taskSpec);
    return this;
  }

  build() {
    return {
      jobId: this.jobId,
      name: this.name,
      priority: this.priority,
      metadata: this.metadata,
      tasks: this.tasks
    };
  }
}
