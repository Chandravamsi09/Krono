/**
 * @file broker_messages.js
 * Serializers & deserializers for high-throughput event publishing, fetching, and offsets.
 */

import { ByteBuffer, crc32 } from '@krono/core';

export class EventRecord {
  /**
   * @param {Object} opts
   * @param {number} [opts.offset=0]
   * @param {number} [opts.timestamp]
   * @param {string|Buffer} [opts.key]
   * @param {Buffer} opts.value
   * @param {Record<string, string>} [opts.headers={}]
   */
  constructor(opts) {
    this.offset = opts.offset ?? 0;
    this.timestamp = opts.timestamp ?? Date.now();
    this.key = opts.key ? (Buffer.isBuffer(opts.key) ? opts.key : Buffer.from(opts.key)) : Buffer.alloc(0);
    this.value = opts.value ? (Buffer.isBuffer(opts.value) ? opts.value : Buffer.from(opts.value)) : Buffer.alloc(0);
    this.headers = opts.headers ?? {};
  }

  encode(bb = ByteBuffer.allocate()) {
    bb.writeVarint(this.offset);
    bb.writeDoubleBE(this.timestamp);
    bb.writePrefixedBytes(this.key);
    bb.writePrefixedBytes(this.value);
    bb.writeString(JSON.stringify(this.headers));
    return bb;
  }

  static decode(bb) {
    const offset = bb.readVarint();
    const timestamp = bb.readDoubleBE();
    const key = bb.readPrefixedBytes();
    const value = bb.readPrefixedBytes();
    const headersRaw = bb.readString();
    const headers = headersRaw ? JSON.parse(headersRaw) : {};
    return new EventRecord({ offset, timestamp, key, value, headers });
  }
}

export class ProduceRecordArgs {
  constructor({ topic, partitionId, records = [], requiredAcks = 1, timeoutMs = 5000 }) {
    this.topic = topic;
    this.partitionId = partitionId;
    this.records = records;
    this.requiredAcks = requiredAcks;
    this.timeoutMs = timeoutMs;
  }

  encode() {
    const bb = ByteBuffer.allocate();
    bb.writeString(this.topic);
    bb.writeVarint(this.partitionId);
    bb.writeUInt8(this.requiredAcks);
    bb.writeVarint(this.timeoutMs);
    bb.writeVarint(this.records.length);
    for (const record of this.records) {
      record.encode(bb);
    }
    return bb.toBuffer();
  }

  static decode(buf) {
    const bb = ByteBuffer.from(buf);
    const topic = bb.readString();
    const partitionId = bb.readVarint();
    const requiredAcks = bb.readUInt8();
    const timeoutMs = bb.readVarint();
    const count = bb.readVarint();
    const records = [];
    for (let i = 0; i < count; i++) {
      records.push(EventRecord.decode(bb));
    }
    return new ProduceRecordArgs({ topic, partitionId, requiredAcks, timeoutMs, records });
  }
}

export class ProduceRecordResult {
  constructor({ topic, partitionId, baseOffset, count, error = null }) {
    this.topic = topic;
    this.partitionId = partitionId;
    this.baseOffset = baseOffset;
    this.count = count;
    this.error = error;
  }

  encode() {
    const bb = ByteBuffer.allocate();
    bb.writeString(this.topic);
    bb.writeVarint(this.partitionId);
    bb.writeVarint(this.baseOffset);
    bb.writeVarint(this.count);
    bb.writeString(this.error || '');
    return bb.toBuffer();
  }

  static decode(buf) {
    const bb = ByteBuffer.from(buf);
    const topic = bb.readString();
    const partitionId = bb.readVarint();
    const baseOffset = bb.readVarint();
    const count = bb.readVarint();
    const errorStr = bb.readString();
    return new ProduceRecordResult({
      topic,
      partitionId,
      baseOffset,
      count,
      error: errorStr.length > 0 ? errorStr : null
    });
  }
}

export class FetchRecordsArgs {
  constructor({ topic, partitionId, offset, maxBytes = 1048576, maxWaitMs = 1000 }) {
    this.topic = topic;
    this.partitionId = partitionId;
    this.offset = offset;
    this.maxBytes = maxBytes;
    this.maxWaitMs = maxWaitMs;
  }

  encode() {
    const bb = ByteBuffer.allocate();
    bb.writeString(this.topic);
    bb.writeVarint(this.partitionId);
    bb.writeVarint(this.offset);
    bb.writeVarint(this.maxBytes);
    bb.writeVarint(this.maxWaitMs);
    return bb.toBuffer();
  }

  static decode(buf) {
    const bb = ByteBuffer.from(buf);
    const topic = bb.readString();
    const partitionId = bb.readVarint();
    const offset = bb.readVarint();
    const maxBytes = bb.readVarint();
    const maxWaitMs = bb.readVarint();
    return new FetchRecordsArgs({ topic, partitionId, offset, maxBytes, maxWaitMs });
  }
}

export class FetchRecordsResult {
  constructor({ topic, partitionId, highWatermark, records = [], error = null }) {
    this.topic = topic;
    this.partitionId = partitionId;
    this.highWatermark = highWatermark;
    this.records = records;
    this.error = error;
  }

  encode() {
    const bb = ByteBuffer.allocate();
    bb.writeString(this.topic);
    bb.writeVarint(this.partitionId);
    bb.writeVarint(this.highWatermark);
    bb.writeString(this.error || '');
    bb.writeVarint(this.records.length);
    for (const record of this.records) {
      record.encode(bb);
    }
    return bb.toBuffer();
  }

  static decode(buf) {
    const bb = ByteBuffer.from(buf);
    const topic = bb.readString();
    const partitionId = bb.readVarint();
    const highWatermark = bb.readVarint();
    const errorStr = bb.readString();
    const count = bb.readVarint();
    const records = [];
    for (let i = 0; i < count; i++) {
      records.push(EventRecord.decode(bb));
    }
    return new FetchRecordsResult({
      topic,
      partitionId,
      highWatermark,
      records,
      error: errorStr.length > 0 ? errorStr : null
    });
  }
}
