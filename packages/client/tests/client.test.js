/**
 * @file client.test.js
 * Unit tests for @krono/client: WorkflowBuilder and KronoClient.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { WorkflowBuilder, KronoClient } from '../src/index.js';

describe('WorkflowBuilder Fluent API', () => {
  it('should construct a valid DAG specification with tasks and dependencies', () => {
    const builder = new WorkflowBuilder('Data Pipeline')
      .setPriority(10)
      .setMetadata({ environment: 'production' })
      .addTask({
        id: 'download',
        name: 'Download Source',
        command: 'curl',
        args: ['https://example.com/data.csv']
      })
      .addTask({
        id: 'process',
        name: 'Process CSV',
        command: 'python',
        args: ['process.py'],
        dependsOn: ['download']
      })
      .addTask({
        id: 'upload',
        name: 'Upload to S3',
        command: 'aws',
        args: ['s3', 'cp'],
        dependsOn: ['process']
      });

    const spec = builder.build();

    assert.equal(spec.name, 'Data Pipeline');
    assert.equal(spec.priority, 10);
    assert.equal(spec.metadata.environment, 'production');
    assert.equal(spec.tasks.length, 3);
    assert.equal(spec.tasks[1].taskId, 'process');
    assert.deepEqual(spec.tasks[1].dependencies, ['download']);
    assert.deepEqual(spec.tasks[2].dependencies, ['process']);
  });
});
