/**
 * @file consensus_messages.js
 * Serializers & deserializers for Raft consensus RPC messages.
 */

import { ByteBuffer } from '@krono/core';

export const ConsensusEntryType = {
  NORMAL: 0x00,
  NOOP: 0x01,
  CONFIGURATION: 0x02,
  CHECKPOINT: 0x03
};

export class LogEntry {
  /**
   * @param {Object} opts
   * @param {number} opts.term
   * @param {number} opts.index
   * @param {number} [opts.type=ConsensusEntryType.NORMAL]
   * @param {Buffer} opts.data
   * @param {number} [opts.timestamp]
   */
  constructor(opts) {
    this.term = opts.term;
    this.index = opts.index;
    this.type = opts.type ?? ConsensusEntryType.NORMAL;
    this.data = opts.data ? (Buffer.isBuffer(opts.data) ? opts.data : Buffer.from(opts.data)) : Buffer.alloc(0);
    this.timestamp = opts.timestamp ?? Date.now();
  }

  encode(bb = ByteBuffer.allocate()) {
    bb.writeVarint(this.term);
    bb.writeVarint(this.index);
    bb.writeUInt8(this.type);
    bb.writeDoubleBE(this.timestamp);
    bb.writePrefixedBytes(this.data);
    return bb;
  }

  static decode(bb) {
    const term = bb.readVarint();
    const index = bb.readVarint();
    const type = bb.readUInt8();
    const timestamp = bb.readDoubleBE();
    const data = bb.readPrefixedBytes();
    return new LogEntry({ term, index, type, timestamp, data });
  }
}

export class RequestVoteArgs {
  constructor({ term, candidateId, lastLogIndex, lastLogTerm, isPreVote = false }) {
    this.term = term;
    this.candidateId = candidateId;
    this.lastLogIndex = lastLogIndex;
    this.lastLogTerm = lastLogTerm;
    this.isPreVote = Boolean(isPreVote);
  }

  encode() {
    const bb = ByteBuffer.allocate();
    bb.writeVarint(this.term);
    bb.writeString(this.candidateId);
    bb.writeVarint(this.lastLogIndex);
    bb.writeVarint(this.lastLogTerm);
    bb.writeUInt8(this.isPreVote ? 1 : 0);
    return bb.toBuffer();
  }

  static decode(buf) {
    const bb = ByteBuffer.from(buf);
    const term = bb.readVarint();
    const candidateId = bb.readString();
    const lastLogIndex = bb.readVarint();
    const lastLogTerm = bb.readVarint();
    const isPreVote = bb.readUInt8() === 1;
    return new RequestVoteArgs({ term, candidateId, lastLogIndex, lastLogTerm, isPreVote });
  }
}

export class RequestVoteResult {
  constructor({ term, voteGranted, isPreVote = false }) {
    this.term = term;
    this.voteGranted = Boolean(voteGranted);
    this.isPreVote = Boolean(isPreVote);
  }

  encode() {
    const bb = ByteBuffer.allocate();
    bb.writeVarint(this.term);
    bb.writeUInt8(this.voteGranted ? 1 : 0);
    bb.writeUInt8(this.isPreVote ? 1 : 0);
    return bb.toBuffer();
  }

  static decode(buf) {
    const bb = ByteBuffer.from(buf);
    const term = bb.readVarint();
    const voteGranted = bb.readUInt8() === 1;
    const isPreVote = bb.readUInt8() === 1;
    return new RequestVoteResult({ term, voteGranted, isPreVote });
  }
}

export class AppendEntriesArgs {
  constructor({ term, leaderId, prevLogIndex, prevLogTerm, entries = [], leaderCommit }) {
    this.term = term;
    this.leaderId = leaderId;
    this.prevLogIndex = prevLogIndex;
    this.prevLogTerm = prevLogTerm;
    this.entries = entries;
    this.leaderCommit = leaderCommit;
  }

  encode() {
    const bb = ByteBuffer.allocate();
    bb.writeVarint(this.term);
    bb.writeString(this.leaderId);
    bb.writeVarint(this.prevLogIndex);
    bb.writeVarint(this.prevLogTerm);
    bb.writeVarint(this.leaderCommit);
    bb.writeVarint(this.entries.length);
    for (const entry of this.entries) {
      entry.encode(bb);
    }
    return bb.toBuffer();
  }

  static decode(buf) {
    const bb = ByteBuffer.from(buf);
    const term = bb.readVarint();
    const leaderId = bb.readString();
    const prevLogIndex = bb.readVarint();
    const prevLogTerm = bb.readVarint();
    const leaderCommit = bb.readVarint();
    const entriesCount = bb.readVarint();
    const entries = [];
    for (let i = 0; i < entriesCount; i++) {
      entries.push(LogEntry.decode(bb));
    }
    return new AppendEntriesArgs({ term, leaderId, prevLogIndex, prevLogTerm, leaderCommit, entries });
  }
}

export class AppendEntriesResult {
  constructor({ term, success, matchIndex, conflictIndex = 0, conflictTerm = 0 }) {
    this.term = term;
    this.success = Boolean(success);
    this.matchIndex = matchIndex;
    this.conflictIndex = conflictIndex;
    this.conflictTerm = conflictTerm;
  }

  encode() {
    const bb = ByteBuffer.allocate();
    bb.writeVarint(this.term);
    bb.writeUInt8(this.success ? 1 : 0);
    bb.writeVarint(this.matchIndex);
    bb.writeVarint(this.conflictIndex);
    bb.writeVarint(this.conflictTerm);
    return bb.toBuffer();
  }

  static decode(buf) {
    const bb = ByteBuffer.from(buf);
    const term = bb.readVarint();
    const success = bb.readUInt8() === 1;
    const matchIndex = bb.readVarint();
    const conflictIndex = bb.readVarint();
    const conflictTerm = bb.readVarint();
    return new AppendEntriesResult({ term, success, matchIndex, conflictIndex, conflictTerm });
  }
}

export class InstallSnapshotArgs {
  constructor({ term, leaderId, lastIncludedIndex, lastIncludedTerm, offset, data, done }) {
    this.term = term;
    this.leaderId = leaderId;
    this.lastIncludedIndex = lastIncludedIndex;
    this.lastIncludedTerm = lastIncludedTerm;
    this.offset = offset;
    this.data = data ? (Buffer.isBuffer(data) ? data : Buffer.from(data)) : Buffer.alloc(0);
    this.done = Boolean(done);
  }

  encode() {
    const bb = ByteBuffer.allocate();
    bb.writeVarint(this.term);
    bb.writeString(this.leaderId);
    bb.writeVarint(this.lastIncludedIndex);
    bb.writeVarint(this.lastIncludedTerm);
    bb.writeVarint(this.offset);
    bb.writeUInt8(this.done ? 1 : 0);
    bb.writePrefixedBytes(this.data);
    return bb.toBuffer();
  }

  static decode(buf) {
    const bb = ByteBuffer.from(buf);
    const term = bb.readVarint();
    const leaderId = bb.readString();
    const lastIncludedIndex = bb.readVarint();
    const lastIncludedTerm = bb.readVarint();
    const offset = bb.readVarint();
    const done = bb.readUInt8() === 1;
    const data = bb.readPrefixedBytes();
    return new InstallSnapshotArgs({ term, leaderId, lastIncludedIndex, lastIncludedTerm, offset, data, done });
  }
}
