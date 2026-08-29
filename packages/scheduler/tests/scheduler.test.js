/**
 * @file scheduler.test.js
 * Unit and workflow integration tests for @krono/scheduler:
 * DAG compilation, cycle detection, topological stages, Saga compensations, and DAG execution.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DAGCompiler,
  DAGScheduler,
  SagaOrchestrator,
  SagaStep,
  WorkflowState
} from '../src/index.js';
import { DAGTaskSpec } from '@krono/protocol';
import { DAGCycleError } from '@krono/core';

describe('DAG Compiler & Topological Resolution', () => {
  it('should compile valid DAG and group tasks into parallel execution stages', () => {
    // Tasks: A -> B -> D, A -> C -> D
    const tasks = [
      new DAGTaskSpec({ taskId: 'A', name: 'Task A', command: 'echo', dependencies: [] }),
      new DAGTaskSpec({ taskId: 'B', name: 'Task B', command: 'echo', dependencies: ['A'] }),
      new DAGTaskSpec({ taskId: 'C', name: 'Task C', command: 'echo', dependencies: ['A'] }),
      new DAGTaskSpec({ taskId: 'D', name: 'Task D', command: 'echo', dependencies: ['B', 'C'] })
    ];

    const { sortedTaskIds, stages } = DAGCompiler.compile(tasks);

    assert.equal(stages.length, 3);
    assert.deepEqual(stages[0], ['A']);
    assert.deepEqual(stages[1].sort(), ['B', 'C'].sort());
    assert.deepEqual(stages[2], ['D']);
    assert.equal(sortedTaskIds.length, 4);
  });

  it('should detect cycles and throw DAGCycleError', () => {
    // Cyclic tasks: A -> B -> C -> A
    const cyclicTasks = [
      new DAGTaskSpec({ taskId: 'A', name: 'Task A', command: 'echo', dependencies: ['C'] }),
      new DAGTaskSpec({ taskId: 'B', name: 'Task B', command: 'echo', dependencies: ['A'] }),
      new DAGTaskSpec({ taskId: 'C', name: 'Task C', command: 'echo', dependencies: ['B'] })
    ];

    assert.throws(() => DAGCompiler.compile(cyclicTasks), DAGCycleError);
  });
});

describe('Saga Distributed Compensation Orchestrator', () => {
  it('should execute forward transaction successfully when no errors occur', async () => {
    const executed = [];
    const steps = [
      new SagaStep({
        stepId: 'reserve-stock',
        execute: async (ctx) => { executed.push('stock-reserved'); return { reservedId: 101 }; }
      }),
      new SagaStep({
        stepId: 'charge-card',
        execute: async (ctx) => { executed.push('card-charged'); return { paymentId: 202 }; }
      })
    ];

    const saga = new SagaOrchestrator(steps);
    const result = await saga.execute({ orderId: 'ord-1' });

    assert.equal(result.success, true);
    assert.equal(result.context.reservedId, 101);
    assert.equal(result.context.paymentId, 202);
    assert.deepEqual(executed, ['stock-reserved', 'card-charged']);
  });

  it('should rollback and compensate completed steps in reverse order upon step failure', async () => {
    const compensated = [];
    const steps = [
      new SagaStep({
        stepId: 'reserve-inventory',
        execute: async () => ({ inventoryHeld: true }),
        compensate: async () => compensated.push('release-inventory')
      }),
      new SagaStep({
        stepId: 'charge-payment',
        execute: async () => ({ paymentHeld: true }),
        compensate: async () => compensated.push('refund-payment')
      }),
      new SagaStep({
        stepId: 'dispatch-delivery',
        execute: async () => { throw new Error('Courier API unavailable'); },
        compensate: async () => compensated.push('cancel-delivery')
      })
    ];

    const saga = new SagaOrchestrator(steps);
    const result = await saga.execute({ orderId: 'ord-fail' });

    assert.equal(result.success, false);
    assert.match(result.error.message, /Courier API unavailable/);
    assert.deepEqual(compensated, ['refund-payment', 'release-inventory']);
  });
});

describe('DAGScheduler End-to-End Execution Flow', () => {
  it('should schedule ready tasks and progress workflow to COMPLETED', () => {
    const scheduler = new DAGScheduler();
    scheduler.start();

    const tasks = [
      new DAGTaskSpec({ taskId: 'extract', name: 'Extract', command: 'node', dependencies: [] }),
      new DAGTaskSpec({ taskId: 'transform', name: 'Transform', command: 'node', dependencies: ['extract'] })
    ];

    const dispatched = [];
    scheduler.on('dispatchTask', (task) => dispatched.push(task));

    const wf = scheduler.submitWorkflow({
      jobId: 'job-101',
      name: 'ETL Test',
      priority: 5,
      tasks
    });

    assert.equal(wf.state, WorkflowState.RUNNING);
    // Initially only 'extract' is ready
    assert.equal(dispatched.length, 1);
    assert.equal(dispatched[0].taskId, 'extract');

    // Simulate worker completes 'extract'
    scheduler.handleTaskResult({
      jobId: 'job-101',
      taskId: 'extract',
      exitCode: 0,
      stdout: 'Extracted 100 rows'
    });

    // Now 'transform' should be dispatched
    assert.equal(dispatched.length, 2);
    assert.equal(dispatched[1].taskId, 'transform');

    // Simulate worker completes 'transform'
    scheduler.handleTaskResult({
      jobId: 'job-101',
      taskId: 'transform',
      exitCode: 0,
      stdout: 'Transformed 100 rows'
    });

    assert.equal(wf.state, WorkflowState.COMPLETED);
    scheduler.stop();
  });
});
