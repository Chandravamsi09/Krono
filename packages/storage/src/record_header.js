/**
 * @file record_header.js
 * On-disk binary record format for persistent commit logs:
 * [0..1]   Record Magic (0x5243 = "RC")
 * [2..5]   CRC-32 Checksum (covers bytes 6..31 + Key + Value)
 * [6..13]  Monotonic Virtual Offset (8 bytes BigInt UInt64)
 * [14..21] Timestamp (8 bytes BigInt UInt64 ms)
 * [22..25] Key Size (4 bytes UInt32)
 * [26..29] Value Size (4 bytes UInt32)
 * [30..31] Flags / Attributes (2 bytes UInt16)
 * [32..]   Key payload (KeySize bytes)
 * [...]    Value payload (ValueSize bytes)
 */

import { crc32 } from '@krono/core';

export const RECORD_MAGIC = 0x5243;
export const RECORD_HEADER_SIZE = 32;

export const RecordFlags = {
  NONE: 0x0000,
  TOMBSTONE: 0x0001,
  CONTROL_BATCH: 0x0002,
  COMPRESSED: 0x0004
};

export class RecordHeader {
  constructor({
    offset = 0n,
    timestamp = BigInt(Date.now()),
    keySize = 0,
    valueSize = 0,
    flags = RecordFlags.NONE,
    crc = 0
  }) {
    this.magic = RECORD_MAGIC;
    this.offset = BigInt(offset);
    this.timestamp = BigInt(timestamp);
    this.keySize = keySize;
    this.valueSize = valueSize;
    this.flags = flags;
    this.crc = crc;
  }

  get totalRecordSize() {
    return RECORD_HEADER_SIZE + this.keySize + this.valueSize;
  }

  /**
   * Serializes a record (header + key + value) into a buffer with computed CRC.
   * @param {Buffer} key
   * @param {Buffer} value
   * @param {bigint} offset
   * @param {number} [flags=RecordFlags.NONE]
   * @param {bigint} [timestamp]
   * @returns {Buffer}
   */
  static serializeRecord(key, value, offset, flags = RecordFlags.NONE, timestamp = BigInt(Date.now())) {
    const keyBuf = key ? (Buffer.isBuffer(key) ? key : Buffer.from(key)) : Buffer.alloc(0);
    const valBuf = value ? (Buffer.isBuffer(value) ? value : Buffer.from(value)) : Buffer.alloc(0);
    const totalSize = RECORD_HEADER_SIZE + keyBuf.length + valBuf.length;
    const buf = Buffer.allocUnsafe(totalSize);

    // Magic
    buf.writeUInt16BE(RECORD_MAGIC, 0);
    // CRC will be filled at [2..5]
    buf.writeBigUInt64BE(BigInt(offset), 6);
    buf.writeBigUInt64BE(BigInt(timestamp), 14);
    buf.writeUInt32BE(keyBuf.length, 22);
    buf.writeUInt32BE(valBuf.length, 26);
    buf.writeUInt16BE(flags, 30);

    // Copy payload
    if (keyBuf.length > 0) keyBuf.copy(buf, RECORD_HEADER_SIZE);
    if (valBuf.length > 0) valBuf.copy(buf, RECORD_HEADER_SIZE + keyBuf.length);

    // Compute CRC32 over bytes 6..31 + key + value
    const checksum = crc32(buf.subarray(6));
    buf.writeUInt32BE(checksum, 2);

    return buf;
  }

  /**
   * Parses and validates a record from buffer at position.
   * @param {Buffer} buffer
   * @param {number} [position=0]
   * @returns {{ header: RecordHeader, key: Buffer, value: Buffer, recordBytes: number }}
   */
  static deserializeRecord(buffer, position = 0) {
    if (buffer.length - position < RECORD_HEADER_SIZE) {
      throw new RangeError(`Buffer underflow: remaining ${buffer.length - position} bytes < ${RECORD_HEADER_SIZE}`);
    }

    const magic = buffer.readUInt16BE(position);
    if (magic !== RECORD_MAGIC) {
      throw new Error(`Invalid record magic 0x${magic.toString(16)} at position ${position}`);
    }

    const expectedCrc = buffer.readUInt32BE(position + 2);
    const offset = buffer.readBigUInt64BE(position + 6);
    const timestamp = buffer.readBigUInt64BE(position + 14);
    const keySize = buffer.readUInt32BE(position + 22);
    const valueSize = buffer.readUInt32BE(position + 26);
    const flags = buffer.readUInt16BE(position + 30);

    const totalRecordSize = RECORD_HEADER_SIZE + keySize + valueSize;
    if (buffer.length - position < totalRecordSize) {
      throw new RangeError(`Incomplete record: need ${totalRecordSize} bytes, have ${buffer.length - position}`);
    }

    // Verify CRC32
    const actualCrc = crc32(buffer.subarray(position + 6, position + totalRecordSize));
    if (expectedCrc !== actualCrc) {
      throw new Error(`Record CRC mismatch at offset ${offset}: expected 0x${expectedCrc.toString(16)}, got 0x${actualCrc.toString(16)}`);
    }

    const key = buffer.subarray(position + RECORD_HEADER_SIZE, position + RECORD_HEADER_SIZE + keySize);
    const value = buffer.subarray(position + RECORD_HEADER_SIZE + keySize, position + totalRecordSize);

    const header = new RecordHeader({ offset, timestamp, keySize, valueSize, flags, crc: expectedCrc });

    return {
      header,
      key: Buffer.from(key),
      value: Buffer.from(value),
      recordBytes: totalRecordSize
    };
  }
}
