/**
 * @file task_executor.js
 * Sandboxed TaskExecutor supporting JS functions, command execution,
 * and structured artifact capturing.
 */

import { ProcessSupervisor } from './process_supervisor.js';
import { TaskResultArgs, TaskState } from '@krono/protocol';

export class TaskExecutor {
  /**
   * @param {string} workerId
   */
  constructor(workerId) {
    this.workerId = workerId;
  }

  /**
   * Runs a task specification inside execution sandbox.
   * @param {Object} taskItem
   * @returns {Promise<TaskResultArgs>}
   */
  async runTask(taskItem) {
    const { jobId, taskId, spec } = taskItem;
    const startTime = Date.now();

    try {
      // Execute command via ProcessSupervisor
      const result = await ProcessSupervisor.execute({
        taskId,
        command: spec.command,
        args: spec.args,
        env: spec.env,
        timeoutMs: spec.timeoutMs
      });

      const state = result.exitCode === 0 ? TaskState.COMPLETED : TaskState.FAILED;
      return new TaskResultArgs({
        jobId,
        taskId,
        workerId: this.workerId,
        state,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        durationMs: result.durationMs,
        error: result.exitCode === 0 ? null : `Process exited with code ${result.exitCode}`
      });
    } catch (err) {
      return new TaskResultArgs({
        jobId,
        taskId,
        workerId: this.workerId,
        state: TaskState.FAILED,
        exitCode: 1,
        stdout: '',
        stderr: err.message,
        durationMs: Date.now() - startTime,
        error: err.message
      });
    }
  }
}
