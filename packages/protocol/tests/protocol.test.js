/**
 * @file protocol.test.js
 * Unit tests for @krono/protocol: Binary framing, CRC validation,
 * chunked streaming decoder, and RPC message serializers.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  KronoFrame,
  FrameStreamDecoder,
  FrameType,
  FrameFlags,
  RequestVoteArgs,
  RequestVoteResult,
  AppendEntriesArgs,
  AppendEntriesResult,
  LogEntry,
  GossipPayload,
  NodeState,
  NodeStatus,
  ProduceRecordArgs,
  ProduceRecordResult,
  FetchRecordsArgs,
  FetchRecordsResult,
  EventRecord,
  JobSubmitArgs,
  DAGTaskSpec,
  TaskResultArgs,
  TaskState
} from '../src/index.js';

describe('Binary Wire Framing & CRC', () => {
  it('should encode and decode a valid KronoFrame with dual CRC32 validation', () => {
    const payload = Buffer.from('Testing binary wire frame payload for Krono cluster');
    const originalFrame = new KronoFrame({
      type: FrameType.PRODUCE_RECORD,
      flags: FrameFlags.IS_RESPONSE,
      correlationId: 987654321n,
      payload
    });

    const encoded = originalFrame.encode();
    assert.ok(Buffer.isBuffer(encoded));

    const decoded = KronoFrame.decode(encoded);
    assert.equal(decoded.type, FrameType.PRODUCE_RECORD);
    assert.equal(decoded.flags, FrameFlags.IS_RESPONSE);
    assert.equal(decoded.correlationId, 987654321n);
    assert.deepEqual(decoded.payload, payload);
  });

  it('should reject frames with corrupted header or payload CRCs', () => {
    const payload = Buffer.from('Integrity verification');
    const frame = new KronoFrame({
      type: FrameType.APPEND_ENTRIES,
      correlationId: 1n,
      payload
    });

    const encoded = frame.encode();

    // Corrupt payload byte
    const corruptedPayload = Buffer.from(encoded);
    corruptedPayload[26] ^= 0xFF; // Invert bits inside payload
    assert.throws(() => KronoFrame.decode(corruptedPayload), /Payload CRC mismatch/);

    // Corrupt header byte
    const corruptedHeader = Buffer.from(encoded);
    corruptedHeader[6] ^= 0xFF; // Invert type
    assert.throws(() => KronoFrame.decode(corruptedHeader), /Header CRC mismatch/);
  });
});

describe('FrameStreamDecoder (TCP Stream Chunking)', () => {
  it('should reconstruct frames split across multiple arbitrary TCP chunks', async () => {
    const decoder = new FrameStreamDecoder();
    const framesReceived = [];

    decoder.on('frame', (f) => framesReceived.push(f));

    const frame1 = new KronoFrame({
      type: FrameType.REQUEST_VOTE,
      correlationId: 101n,
      payload: Buffer.from('VoteForMe')
    });
    const frame2 = new KronoFrame({
      type: FrameType.APPEND_ENTRIES,
      correlationId: 102n,
      payload: Buffer.from('AppendThisLogEntryDataToAllFollowers')
    });

    const combinedBytes = Buffer.concat([frame1.encode(), frame2.encode()]);

    // Split stream into small 7-byte chunks
    const chunkSize = 7;
    for (let i = 0; i < combinedBytes.length; i += chunkSize) {
      const slice = combinedBytes.subarray(i, i + chunkSize);
      decoder.push(slice);
    }

    assert.equal(framesReceived.length, 2);
    assert.equal(framesReceived[0].correlationId, 101n);
    assert.equal(framesReceived[0].payload.toString(), 'VoteForMe');
    assert.equal(framesReceived[1].correlationId, 102n);
    assert.equal(framesReceived[1].payload.toString(), 'AppendThisLogEntryDataToAllFollowers');
  });
});

describe('Consensus RPC Messages', () => {
  it('should serialize and deserialize RequestVote RPCs', () => {
    const req = new RequestVoteArgs({
      term: 5,
      candidateId: 'krono-node-02',
      lastLogIndex: 1250,
      lastLogTerm: 4,
      isPreVote: true
    });
    const buf = req.encode();
    const decoded = RequestVoteArgs.decode(buf);
    assert.equal(decoded.term, 5);
    assert.equal(decoded.candidateId, 'krono-node-02');
    assert.equal(decoded.lastLogIndex, 1250);
    assert.equal(decoded.lastLogTerm, 4);
    assert.equal(decoded.isPreVote, true);

    const resp = new RequestVoteResult({ term: 5, voteGranted: true, isPreVote: true });
    const decodedResp = RequestVoteResult.decode(resp.encode());
    assert.equal(decodedResp.term, 5);
    assert.equal(decodedResp.voteGranted, true);
  });

  it('should serialize and deserialize AppendEntries RPC with batched log entries', () => {
    const entries = [
      new LogEntry({ term: 2, index: 10, data: Buffer.from('SET key1=val1') }),
      new LogEntry({ term: 2, index: 11, data: Buffer.from('SET key2=val2') })
    ];

    const args = new AppendEntriesArgs({
      term: 2,
      leaderId: 'krono-leader-01',
      prevLogIndex: 9,
      prevLogTerm: 1,
      leaderCommit: 9,
      entries
    });

    const buf = args.encode();
    const decoded = AppendEntriesArgs.decode(buf);
    assert.equal(decoded.term, 2);
    assert.equal(decoded.leaderId, 'krono-leader-01');
    assert.equal(decoded.entries.length, 2);
    assert.equal(decoded.entries[0].index, 10);
    assert.equal(decoded.entries[0].data.toString(), 'SET key1=val1');
    assert.equal(decoded.entries[1].index, 11);
    assert.equal(decoded.entries[1].data.toString(), 'SET key2=val2');
  });
});

describe('Event Broker Messages', () => {
  it('should serialize and deserialize Produce & Fetch batches', () => {
    const records = [
      new EventRecord({ offset: 0, key: 'order-123', value: Buffer.from('{"amount": 100}'), headers: { env: 'prod' } }),
      new EventRecord({ offset: 1, key: 'order-124', value: Buffer.from('{"amount": 250}'), headers: { env: 'prod' } })
    ];

    const produceArgs = new ProduceRecordArgs({
      topic: 'orders.events',
      partitionId: 3,
      requiredAcks: 2,
      timeoutMs: 3000,
      records
    });

    const decodedProduce = ProduceRecordArgs.decode(produceArgs.encode());
    assert.equal(decodedProduce.topic, 'orders.events');
    assert.equal(decodedProduce.partitionId, 3);
    assert.equal(decodedProduce.records.length, 2);
    assert.equal(decodedProduce.records[0].key.toString(), 'order-123');
    assert.equal(decodedProduce.records[0].headers.env, 'prod');
  });
});

describe('DAG Workflow Scheduler Messages', () => {
  it('should serialize and deserialize DAG tasks & job submissions', () => {
    const task1 = new DAGTaskSpec({
      taskId: 'extract',
      name: 'Extract Data',
      command: 'node',
      args: ['extract.js'],
      dependencies: []
    });

    const task2 = new DAGTaskSpec({
      taskId: 'transform',
      name: 'Transform Data',
      command: 'node',
      args: ['transform.js'],
      dependencies: ['extract']
    });

    const job = new JobSubmitArgs({
      jobId: 'job-999',
      name: 'ETL Pipeline',
      priority: 10,
      tasks: [task1, task2]
    });

    const decoded = JobSubmitArgs.decode(job.encode());
    assert.equal(decoded.jobId, 'job-999');
    assert.equal(decoded.priority, 10);
    assert.equal(decoded.tasks.length, 2);
    assert.equal(decoded.tasks[1].taskId, 'transform');
    assert.deepEqual(decoded.tasks[1].dependencies, ['extract']);
  });
});
