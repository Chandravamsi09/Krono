/**
 * @file dag_compiler.js
 * Directed Acyclic Graph (DAG) compiler, cycle validator using Kahn's algorithm,
 * and parallel execution stage resolution.
 */

import { DAGCycleError } from '@krono/core';
import { DAGTaskSpec } from '@krono/protocol';

export class DAGCompiler {
  /**
   * Validates tasks form a valid DAG and generates execution stages.
   * @param {DAGTaskSpec[]} tasks
   * @returns {{ sortedTaskIds: string[], stages: string[][], taskMap: Map<string, DAGTaskSpec> }}
   */
  static compile(tasks) {
    /** @type {Map<string, DAGTaskSpec>} */
    const taskMap = new Map();
    /** @type {Map<string, Set<string>>} Key: TaskId -> Set of tasks that depend on it */
    const outgoing = new Map();
    /** @type {Map<string, number>} Key: TaskId -> in-degree count */
    const inDegree = new Map();

    for (const task of tasks) {
      taskMap.set(task.taskId, task);
      outgoing.set(task.taskId, new Set());
      inDegree.set(task.taskId, 0);
    }

    // Populate graph edges and in-degrees
    for (const task of tasks) {
      for (const depId of task.dependencies) {
        if (!taskMap.has(depId)) {
          throw new Error(`Task ${task.taskId} references non-existent dependency ${depId}`);
        }
        outgoing.get(depId).add(task.taskId);
        inDegree.set(task.taskId, (inDegree.get(task.taskId) || 0) + 1);
      }
    }

    // Kahn's Algorithm for Topological Sort & Stage Grouping
    const readyQueue = [];
    for (const [taskId, deg] of inDegree.entries()) {
      if (deg === 0) {
        readyQueue.push(taskId);
      }
    }

    const sortedTaskIds = [];
    const stages = [];
    let currentStage = [...readyQueue];

    while (currentStage.length > 0) {
      stages.push(currentStage);
      const nextStage = [];

      for (const taskId of currentStage) {
        sortedTaskIds.push(taskId);

        for (const dependentId of outgoing.get(taskId)) {
          const newDeg = inDegree.get(dependentId) - 1;
          inDegree.set(dependentId, newDeg);
          if (newDeg === 0) {
            nextStage.push(dependentId);
          }
        }
      }

      currentStage = nextStage;
    }

    // Cycle check: If sorted count < total tasks, a cycle exists
    if (sortedTaskIds.length < tasks.length) {
      const remainingNodes = Array.from(inDegree.entries())
        .filter(([_, deg]) => deg > 0)
        .map(([id]) => id);
      throw new DAGCycleError(remainingNodes);
    }

    return { sortedTaskIds, stages, taskMap };
  }
}
