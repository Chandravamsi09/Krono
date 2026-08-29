/**
 * @file scheduler_messages.js
 * Serializers & deserializers for DAG workflow execution and worker tasks.
 */

import { ByteBuffer } from '@krono/core';

export const TaskState = {
  PENDING: 0x00,
  RUNNING: 0x01,
  COMPLETED: 0x02,
  FAILED: 0x03,
  RETRYING: 0x04,
  CANCELLED: 0x05
};

export class DAGTaskSpec {
  constructor({
    taskId,
    name,
    command,
    args = [],
    dependencies = [],
    env = {},
    timeoutMs = 60000,
    maxRetries = 3,
    retryBackoffMs = 1000
  }) {
    this.taskId = taskId;
    this.name = name;
    this.command = command;
    this.args = args;
    this.dependencies = dependencies;
    this.env = env;
    this.timeoutMs = timeoutMs;
    this.maxRetries = maxRetries;
    this.retryBackoffMs = retryBackoffMs;
  }

  encode(bb = ByteBuffer.allocate()) {
    bb.writeString(this.taskId);
    bb.writeString(this.name);
    bb.writeString(this.command);
    bb.writeString(JSON.stringify(this.args));
    bb.writeString(JSON.stringify(this.dependencies));
    bb.writeString(JSON.stringify(this.env));
    bb.writeVarint(this.timeoutMs);
    bb.writeVarint(this.maxRetries);
    bb.writeVarint(this.retryBackoffMs);
    return bb;
  }

  static decode(bb) {
    const taskId = bb.readString();
    const name = bb.readString();
    const command = bb.readString();
    const args = JSON.parse(bb.readString() || '[]');
    const dependencies = JSON.parse(bb.readString() || '[]');
    const env = JSON.parse(bb.readString() || '{}');
    const timeoutMs = bb.readVarint();
    const maxRetries = bb.readVarint();
    const retryBackoffMs = bb.readVarint();
    return new DAGTaskSpec({
      taskId,
      name,
      command,
      args,
      dependencies,
      env,
      timeoutMs,
      maxRetries,
      retryBackoffMs
    });
  }
}

export class JobSubmitArgs {
  constructor({ jobId, name, tasks = [], priority = 0, metadata = {} }) {
    this.jobId = jobId;
    this.name = name;
    this.tasks = tasks;
    this.priority = priority;
    this.metadata = metadata;
  }

  encode() {
    const bb = ByteBuffer.allocate();
    bb.writeString(this.jobId);
    bb.writeString(this.name);
    bb.writeInt16BE(this.priority);
    bb.writeString(JSON.stringify(this.metadata));
    bb.writeVarint(this.tasks.length);
    for (const task of this.tasks) {
      task.encode(bb);
    }
    return bb.toBuffer();
  }

  static decode(buf) {
    const bb = ByteBuffer.from(buf);
    const jobId = bb.readString();
    const name = bb.readString();
    const priority = bb.readInt16BE();
    const metadata = JSON.parse(bb.readString() || '{}');
    const count = bb.readVarint();
    const tasks = [];
    for (let i = 0; i < count; i++) {
      tasks.push(DAGTaskSpec.decode(bb));
    }
    return new JobSubmitArgs({ jobId, name, priority, metadata, tasks });
  }
}

export class TaskResultArgs {
  constructor({ jobId, taskId, workerId, state, exitCode = 0, stdout = '', stderr = '', durationMs = 0, error = null }) {
    this.jobId = jobId;
    this.taskId = taskId;
    this.workerId = workerId;
    this.state = state;
    this.exitCode = exitCode;
    this.stdout = stdout;
    this.stderr = stderr;
    this.durationMs = durationMs;
    this.error = error;
  }

  encode() {
    const bb = ByteBuffer.allocate();
    bb.writeString(this.jobId);
    bb.writeString(this.taskId);
    bb.writeString(this.workerId);
    bb.writeUInt8(this.state);
    bb.writeInt32BE(this.exitCode);
    bb.writeString(this.stdout);
    bb.writeString(this.stderr);
    bb.writeVarint(this.durationMs);
    bb.writeString(this.error || '');
    return bb.toBuffer();
  }

  static decode(buf) {
    const bb = ByteBuffer.from(buf);
    const jobId = bb.readString();
    const taskId = bb.readString();
    const workerId = bb.readString();
    const state = bb.readUInt8();
    const exitCode = bb.readInt32BE();
    const stdout = bb.readString();
    const stderr = bb.readString();
    const durationMs = bb.readVarint();
    const errorStr = bb.readString();
    return new TaskResultArgs({
      jobId,
      taskId,
      workerId,
      state,
      exitCode,
      stdout,
      stderr,
      durationMs,
      error: errorStr.length > 0 ? errorStr : null
    });
  }
}
