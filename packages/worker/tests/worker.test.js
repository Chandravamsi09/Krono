/**
 * @file worker.test.js
 * Unit and execution tests for @krono/worker:
 * Chase-Lev work stealing deque, ProcessSupervisor, and WorkerDaemon.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  ChaseLevDeque,
  ProcessSupervisor,
  TaskExecutor,
  WorkerDaemon
} from '../src/index.js';
import { DAGTaskSpec, TaskState } from '@krono/protocol';

describe('Chase-Lev Work-Stealing Deque', () => {
  it('should push and pop locally in LIFO order while allowing work stealing in FIFO order', () => {
    const deque = new ChaseLevDeque(4);
    assert.equal(deque.isEmpty, true);

    deque.push('task-1');
    deque.push('task-2');
    deque.push('task-3');

    assert.equal(deque.size, 3);

    // Concurrent stealer steals from top (FIFO: task-1)
    const stolen = deque.steal();
    assert.equal(stolen, 'task-1');
    assert.equal(deque.size, 2);

    // Owner thread pops from bottom (LIFO: task-3)
    const popped = deque.pop();
    assert.equal(popped, 'task-3');
    assert.equal(deque.size, 1);

    const last = deque.pop();
    assert.equal(last, 'task-2');
    assert.equal(deque.isEmpty, true);
  });
});

describe('ProcessSupervisor Sandbox Execution', () => {
  it('should execute node command and capture stdout output', async () => {
    const res = await ProcessSupervisor.execute({
      taskId: 'test-echo',
      command: 'node',
      args: ['-e', 'console.log("Krono Worker Output")'],
      timeoutMs: 5000
    });

    assert.equal(res.exitCode, 0);
    assert.match(res.stdout, /Krono Worker Output/);
    assert.ok(res.durationMs >= 0);
  });

  it('should capture failure exit codes', async () => {
    const res = await ProcessSupervisor.execute({
      taskId: 'test-fail',
      command: 'node',
      args: ['-e', 'process.exit(2)'],
      timeoutMs: 5000
    });

    assert.equal(res.exitCode, 2);
  });
});

describe('WorkerDaemon End-to-End Task Runner', () => {
  it('should process assigned tasks and report results', async () => {
    const results = [];
    const worker = new WorkerDaemon({
      workerId: 'worker-01',
      concurrency: 2,
      reportResult: async (res) => {
        results.push(res);
      }
    });

    worker.start();

    const spec = new DAGTaskSpec({
      taskId: 'compute-hash',
      name: 'Hash Task',
      command: 'node',
      args: ['-e', 'console.log("HASH_RESULT_123")'],
      timeoutMs: 5000
    });

    worker.assignTask({
      jobId: 'job-55',
      taskId: 'compute-hash',
      spec
    });

    // Wait for task completion
    await new Promise((r) => setTimeout(r, 400));

    assert.equal(results.length, 1);
    assert.equal(results[0].jobId, 'job-55');
    assert.equal(results[0].taskId, 'compute-hash');
    assert.equal(results[0].state, TaskState.COMPLETED);
    assert.match(results[0].stdout, /HASH_RESULT_123/);

    worker.stop();
  });
});
