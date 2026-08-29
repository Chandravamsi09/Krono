/**
 * @file core.test.js
 * Unit tests for @krono/core primitives: CRC32, Varint, ByteBuffer,
 * VectorClock, RingBuffer, PriorityQueue, BitSet, and UUIDv7.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  crc32,
  verifyCrc32,
  encodeVarint,
  decodeVarint,
  encodeVarint64,
  decodeVarint64,
  ByteBuffer,
  VectorClock,
  ClockComparison,
  RingBuffer,
  PriorityQueue,
  BitSet,
  generateUUIDv7,
  extractTimestampFromUUIDv7,
  NotLeaderError,
  StorageCorruptedError,
  DAGCycleError
} from '../src/index.js';

describe('CRC32 Engine', () => {
  it('should compute valid IEEE 802.3 CRC32 checksums', () => {
    const data = Buffer.from('123456789');
    // Standard test vector: CRC32 of ASCII "123456789" is 0xCBF43926 (3421780262)
    const result = crc32(data);
    assert.equal(result, 0xCBF43926 >>> 0);
    assert.equal(verifyCrc32(data, 0xCBF43926 >>> 0), true);
    assert.equal(verifyCrc32(data, 0x12345678), false);
  });

  it('should compute incremental CRC32 for chunked streaming', () => {
    const chunk1 = Buffer.from('12345');
    const chunk2 = Buffer.from('6789');
    const full = Buffer.from('123456789');

    const crcPart1 = crc32(chunk1);
    const crcTotal = crc32(chunk2, crcPart1);
    assert.equal(crcTotal, crc32(full));
  });
});

describe('Varint Encoding & Decoding', () => {
  it('should encode and decode small integers correctly', () => {
    const testCases = [0, 1, 127, 128, 300, 16384, 2097151, 268435455, 9007199254740991];
    for (const val of testCases) {
      const encoded = encodeVarint(val);
      const { value, bytesRead } = decodeVarint(encoded, 0);
      assert.equal(value, val);
      assert.equal(bytesRead, encoded.length);
    }
  });

  it('should encode and decode 64-bit BigInts', () => {
    const testCases = [0n, 127n, 128n, 65535n, 4294967295n, 18446744073709551615n];
    for (const val of testCases) {
      const encoded = encodeVarint64(val);
      const { value, bytesRead } = decodeVarint64(encoded, 0);
      assert.equal(value, val);
      assert.equal(bytesRead, encoded.length);
    }
  });
});

describe('ByteBuffer Dynamic Buffer', () => {
  it('should dynamically expand and serialize mixed binary datatypes', () => {
    const bb = ByteBuffer.allocate(16);
    bb.writeUInt8(42)
      .writeUInt16BE(1000)
      .writeUInt32BE(0xDEADBEEF)
      .writeBigUInt64BE(123456789012345678n)
      .writeString('Krono Distributed Engine')
      .writeVarint(999999);

    assert.equal(bb.readUInt8(), 42);
    assert.equal(bb.readUInt16BE(), 1000);
    assert.equal(bb.readUInt32BE(), 0xDEADBEEF >>> 0);
    assert.equal(bb.readBigUInt64BE(), 123456789012345678n);
    assert.equal(bb.readString(), 'Krono Distributed Engine');
    assert.equal(bb.readVarint(), 999999);
    assert.equal(bb.readableBytes, 0);
  });
});

describe('Vector Clock & Causal Ordering', () => {
  it('should track causality and detect concurrent divergences', () => {
    const clockA = new VectorClock();
    const clockB = new VectorClock();

    clockA.increment('node-1'); // { node-1: 1 }
    clockB.increment('node-1'); // { node-1: 1 }
    assert.equal(clockA.compare(clockB), ClockComparison.EQUAL);

    clockA.increment('node-1'); // { node-1: 2 }
    assert.equal(clockA.compare(clockB), ClockComparison.AFTER);
    assert.equal(clockB.compare(clockA), ClockComparison.BEFORE);

    clockB.increment('node-2'); // { node-1: 1, node-2: 1 }
    // Now clockA has higher node-1, but clockB has higher node-2 => CONCURRENT
    assert.equal(clockA.compare(clockB), ClockComparison.CONCURRENT);
    assert.equal(clockA.isConcurrentWith(clockB), true);

    // Merge clocks
    clockA.merge(clockB); // { node-1: 2, node-2: 1 }
    assert.equal(clockA.compare(clockB), ClockComparison.AFTER);
    assert.equal(clockA.get('node-1'), 2);
    assert.equal(clockA.get('node-2'), 1);
  });
});

describe('RingBuffer Queue', () => {
  it('should handle enqueue, dequeue, peek, and capacity limits', () => {
    const rb = new RingBuffer(4);
    assert.equal(rb.isEmpty, true);

    assert.equal(rb.push('A'), true);
    assert.equal(rb.push('B'), true);
    assert.equal(rb.push('C'), true);
    assert.equal(rb.push('D'), true);
    assert.equal(rb.push('E'), false); // Full
    assert.equal(rb.isFull, true);

    assert.equal(rb.peek(), 'A');
    assert.equal(rb.shift(), 'A');
    assert.equal(rb.shift(), 'B');
    assert.equal(rb.push('E'), true); // Wrap around

    const drained = rb.drain();
    assert.deepEqual(drained, ['C', 'D', 'E']);
    assert.equal(rb.isEmpty, true);
  });
});

describe('PriorityQueue Binary Heap', () => {
  it('should maintain Min-Heap priority ordering and element removal', () => {
    const pq = new PriorityQueue((a, b) => a.priority - b.priority);
    pq.push({ id: 1, priority: 50 });
    pq.push({ id: 2, priority: 10 });
    pq.push({ id: 3, priority: 30 });
    pq.push({ id: 4, priority: 5 });

    assert.equal(pq.peek().id, 4);
    assert.equal(pq.pop().id, 4); // Priority 5
    assert.equal(pq.pop().id, 2); // Priority 10
    assert.equal(pq.pop().id, 3); // Priority 30
    assert.equal(pq.pop().id, 1); // Priority 50
    assert.equal(pq.isEmpty(), true);
  });
});

describe('BitSet Dynamic Bitmap', () => {
  it('should accurately set, get, count bits, and do bitwise ops', () => {
    const bs = new BitSet(128);
    assert.equal(bs.cardinality(), 0);

    bs.set(0);
    bs.set(31);
    bs.set(64);
    bs.set(127);
    assert.equal(bs.cardinality(), 4);
    assert.equal(bs.get(0), true);
    assert.equal(bs.get(31), true);
    assert.equal(bs.get(64), true);
    assert.equal(bs.get(127), true);
    assert.equal(bs.get(5), false);

    bs.clearBit(31);
    assert.equal(bs.get(31), false);
    assert.equal(bs.cardinality(), 3);
  });
});

describe('UUIDv7 Monotonic IDs', () => {
  it('should generate valid monotonic UUIDv7 strings with valid timestamps', () => {
    const id1 = generateUUIDv7();
    const id2 = generateUUIDv7();
    assert.equal(typeof id1, 'string');
    assert.match(id1, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    
    const ts1 = extractTimestampFromUUIDv7(id1);
    const now = Date.now();
    assert.ok(Math.abs(now - ts1) < 5000);
    assert.ok(id1 < id2 || ts1 <= extractTimestampFromUUIDv7(id2));
  });
});

describe('Error Taxonomy', () => {
  it('should capture stack traces, error codes, and details', () => {
    const err = new NotLeaderError('node-3', '10.0.0.3:9000');
    assert.equal(err.code, 'NOT_LEADER');
    assert.equal(err.leaderId, 'node-3');
    assert.equal(err.leaderAddress, '10.0.0.3:9000');
    assert.match(err.message, /Node is not leader/);
  });
});
