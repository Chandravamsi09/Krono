/**
 * @file frame.js
 * Krono Binary Frame container with serialization, deserialization,
 * dual-stage CRC32 header and payload integrity validation.
 */

import { crc32, verifyCrc32 } from '@krono/core';
import {
  PROTOCOL_MAGIC,
  PROTOCOL_VERSION_1,
  FRAME_HEADER_SIZE,
  FRAME_TRAILER_SIZE,
  FrameFlags,
  FrameType
} from './constants.js';

export class KronoFrame {
  /**
   * @param {Object} options
   * @param {number} [options.version=PROTOCOL_VERSION_1]
   * @param {number} [options.flags=FrameFlags.NONE]
   * @param {number} options.type FrameType
   * @param {bigint|number} options.correlationId Unique RPC correlation ID
   * @param {Buffer} [options.payload] Binary payload Buffer
   */
  constructor(options) {
    this.magic = PROTOCOL_MAGIC;
    this.version = options.version ?? PROTOCOL_VERSION_1;
    this.flags = options.flags ?? FrameFlags.NONE;
    this.type = options.type;
    this.correlationId = BigInt(options.correlationId ?? 0);
    this.payload = options.payload ?? Buffer.alloc(0);
  }

  /**
   * Serializes the frame into a single contiguous binary Buffer.
   * Format:
   * [0..3]   Magic (0x4B524F4E)
   * [4]      Version (1)
   * [5]      Flags (1 byte)
   * [6..7]   Type (2 bytes Big-Endian)
   * [8..15]  CorrelationId (8 bytes Big-Endian UInt64)
   * [16..19] PayloadLength (4 bytes Big-Endian UInt32)
   * [20..23] Header CRC32 (computed over bytes 0..19)
   * [24..N]  Payload (N bytes)
   * [N..N+3] Payload CRC32 (computed over Payload bytes)
   * @returns {Buffer}
   */
  encode() {
    const payloadLen = this.payload.length;
    const totalSize = FRAME_HEADER_SIZE + payloadLen + FRAME_TRAILER_SIZE;
    const buf = Buffer.allocUnsafe(totalSize);

    // Write header fields except Header CRC
    buf.writeUInt32BE(this.magic, 0);
    buf.writeUInt8(this.version, 4);
    buf.writeUInt8(this.flags, 5);
    buf.writeUInt16BE(this.type, 6);
    buf.writeBigUInt64BE(this.correlationId, 8);
    buf.writeUInt32BE(payloadLen, 16);

    // Compute and write Header CRC (first 20 bytes)
    const headerCrc = crc32(buf.subarray(0, 20));
    buf.writeUInt32BE(headerCrc, 20);

    // Copy payload
    if (payloadLen > 0) {
      this.payload.copy(buf, FRAME_HEADER_SIZE);
    }

    // Compute and write Payload CRC
    const payloadCrc = crc32(this.payload);
    buf.writeUInt32BE(payloadCrc, FRAME_HEADER_SIZE + payloadLen);

    return buf;
  }

  /**
   * Decodes a binary frame from a Buffer.
   * @param {Buffer} buffer Contiguous buffer containing a complete frame
   * @returns {KronoFrame}
   */
  static decode(buffer) {
    if (buffer.length < FRAME_HEADER_SIZE + FRAME_TRAILER_SIZE) {
      throw new RangeError(
        `Frame buffer too small: expected at least ${FRAME_HEADER_SIZE + FRAME_TRAILER_SIZE} bytes, got ${buffer.length}`
      );
    }

    const magic = buffer.readUInt32BE(0);
    if (magic !== PROTOCOL_MAGIC) {
      throw new Error(`Invalid protocol magic: expected 0x${PROTOCOL_MAGIC.toString(16)}, got 0x${magic.toString(16)}`);
    }

    // Validate Header CRC
    const expectedHeaderCrc = buffer.readUInt32BE(20);
    const actualHeaderCrc = crc32(buffer.subarray(0, 20));
    if (expectedHeaderCrc !== actualHeaderCrc) {
      throw new Error(`Header CRC mismatch: expected 0x${expectedHeaderCrc.toString(16)}, got 0x${actualHeaderCrc.toString(16)}`);
    }

    const version = buffer.readUInt8(4);
    const flags = buffer.readUInt8(5);
    const type = buffer.readUInt16BE(6);
    const correlationId = buffer.readBigUInt64BE(8);
    const payloadLen = buffer.readUInt32BE(16);

    if (buffer.length < FRAME_HEADER_SIZE + payloadLen + FRAME_TRAILER_SIZE) {
      throw new RangeError(`Frame buffer incomplete: required ${FRAME_HEADER_SIZE + payloadLen + FRAME_TRAILER_SIZE} bytes, got ${buffer.length}`);
    }

    const payload = buffer.subarray(FRAME_HEADER_SIZE, FRAME_HEADER_SIZE + payloadLen);

    // Validate Payload CRC
    const expectedPayloadCrc = buffer.readUInt32BE(FRAME_HEADER_SIZE + payloadLen);
    const actualPayloadCrc = crc32(payload);
    if (expectedPayloadCrc !== actualPayloadCrc) {
      throw new Error(`Payload CRC mismatch: expected 0x${expectedPayloadCrc.toString(16)}, got 0x${actualPayloadCrc.toString(16)}`);
    }

    return new KronoFrame({
      version,
      flags,
      type,
      correlationId,
      payload: Buffer.from(payload)
    });
  }
}
