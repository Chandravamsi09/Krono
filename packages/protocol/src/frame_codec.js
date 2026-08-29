/**
 * @file frame_codec.js
 * Streaming frame decoder for TCP sockets that buffers incoming chunks,
 * detects frame boundaries, validates CRCs, and emits parsed KronoFrames.
 */

import { EventEmitter } from 'node:events';
import { KronoFrame } from './frame.js';
import {
  PROTOCOL_MAGIC,
  FRAME_HEADER_SIZE,
  FRAME_TRAILER_SIZE,
  MAX_FRAME_PAYLOAD_SIZE
} from './constants.js';
import { crc32 } from '@krono/core';

export class FrameStreamDecoder extends EventEmitter {
  constructor() {
    super();
    this.buffer = Buffer.alloc(0);
  }

  /**
   * Pushes incoming raw TCP data chunk into stream buffer and emits parsed frames.
   * @param {Buffer} chunk
   */
  push(chunk) {
    if (!chunk || chunk.length === 0) return;

    this.buffer = this.buffer.length === 0 ? chunk : Buffer.concat([this.buffer, chunk]);

    this._processBuffer();
  }

  _processBuffer() {
    while (this.buffer.length >= FRAME_HEADER_SIZE + FRAME_TRAILER_SIZE) {
      // 1. Search for protocol magic if out-of-sync
      const magic = this.buffer.readUInt32BE(0);
      if (magic !== PROTOCOL_MAGIC) {
        // Find next magic in buffer
        const nextMagicIdx = this.buffer.indexOf(Buffer.from([0x4B, 0x52, 0x4F, 0x4E]), 1);
        if (nextMagicIdx === -1) {
          // No magic found, keep last 3 bytes in case magic spans across chunk boundary
          this.buffer = this.buffer.subarray(Math.max(0, this.buffer.length - 3));
          return;
        } else {
          this.buffer = this.buffer.subarray(nextMagicIdx);
          continue;
        }
      }

      // 2. Validate Header CRC
      const expectedHeaderCrc = this.buffer.readUInt32BE(20);
      const actualHeaderCrc = crc32(this.buffer.subarray(0, 20));
      if (expectedHeaderCrc !== actualHeaderCrc) {
        // Corrupted header, skip 4 bytes to find next sync magic
        this.emit('error', new Error(`Header CRC mismatch at offset`));
        this.buffer = this.buffer.subarray(4);
        continue;
      }

      const payloadLen = this.buffer.readUInt32BE(16);
      if (payloadLen > MAX_FRAME_PAYLOAD_SIZE) {
        this.emit('error', new Error(`Payload length ${payloadLen} exceeds limit ${MAX_FRAME_PAYLOAD_SIZE}`));
        this.buffer = this.buffer.subarray(4);
        continue;
      }

      const totalFrameSize = FRAME_HEADER_SIZE + payloadLen + FRAME_TRAILER_SIZE;
      if (this.buffer.length < totalFrameSize) {
        // Wait for more chunks to arrive
        return;
      }

      // 3. Extract and parse frame
      const frameBuffer = this.buffer.subarray(0, totalFrameSize);
      try {
        const frame = KronoFrame.decode(frameBuffer);
        this.buffer = this.buffer.subarray(totalFrameSize);
        this.emit('frame', frame);
      } catch (err) {
        this.emit('error', err);
        this.buffer = this.buffer.subarray(4);
      }
    }
  }

  reset() {
    this.buffer = Buffer.alloc(0);
  }
}
