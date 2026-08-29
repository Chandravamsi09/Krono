/**
 * @file process_supervisor.js
 * Process Supervisor managing child execution runtimes, timeout watchdogs,
 * stdout/stderr streams, and resource monitoring.
 */

import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { TaskTimeoutError } from '@krono/core';

export class ProcessSupervisor extends EventEmitter {
  /**
   * Executes a command in a supervised child process.
   * @param {Object} options
   * @param {string} options.taskId
   * @param {string} options.command
   * @param {string[]} [options.args=[]]
   * @param {Record<string, string>} [options.env={}]
   * @param {number} [options.timeoutMs=30000]
   * @param {boolean} [options.shell=false]
   * @returns {Promise<{ exitCode: number, stdout: string, stderr: string, durationMs: number }>}
   */
  static execute(options) {
    return new Promise((resolve, reject) => {
      const { taskId, command, args = [], env = {}, timeoutMs = 30000, shell = false } = options;
      const startTime = Date.now();

      let stdoutAccum = '';
      let stderrAccum = '';
      let isTimedOut = false;
      let timeoutTimer = null;

      const child = spawn(command, args, {
        env: { ...process.env, ...env },
        shell
      });

      timeoutTimer = setTimeout(() => {
        isTimedOut = true;
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) child.kill('SIGKILL');
        }, 1000);
      }, timeoutMs);

      child.stdout?.on('data', (data) => {
        stdoutAccum += data.toString();
      });

      child.stderr?.on('data', (data) => {
        stderrAccum += data.toString();
      });

      child.on('error', (err) => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        reject(err);
      });

      child.on('close', (exitCode) => {
        if (timeoutTimer) clearTimeout(timeoutTimer);
        const durationMs = Date.now() - startTime;

        if (isTimedOut) {
          reject(new TaskTimeoutError(taskId, timeoutMs));
        } else {
          resolve({
            exitCode: exitCode ?? 0,
            stdout: stdoutAccum,
            stderr: stderrAccum,
            durationMs
          });
        }
      });
    });
  }
}
