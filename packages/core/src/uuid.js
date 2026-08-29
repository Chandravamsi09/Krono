/**
 * @file uuid.js
 * High-performance UUIDv7 generator for monotonically ordered distributed IDs.
 * Format: 48-bit timestamp (ms) | 12-bit sequence counter | 62-bit entropy
 */

import crypto from 'node:crypto';

let lastTimestamp = -1;
let sequence = 0;

/**
 * Generates a standard RFC 9562 UUIDv7 string.
 * @returns {string} e.g. '018f2d5a-73b0-7a31-8c43-4e891b0f5892'
 */
export function generateUUIDv7() {
  const now = Date.now();

  if (now === lastTimestamp) {
    sequence = (sequence + 1) & 0xFFF; // 12-bit sequence roll
    if (sequence === 0) {
      // Busy spin wait for next millisecond if sequence overflows
      while (Date.now() <= now) {}
    }
  } else {
    lastTimestamp = now;
    sequence = crypto.randomInt(0, 0x100); // randomize sequence start
  }

  const bytes = Buffer.allocUnsafe(16);

  // 48-bit timestamp
  bytes.writeUIntBE(Math.floor(now / 0x100000000), 0, 2);
  bytes.writeUInt32BE(now >>> 0, 2);

  // 4-bit version (0x7) + 12-bit sequence
  const verAndSeq = 0x7000 | (sequence & 0x0FFF);
  bytes.writeUInt16BE(verAndSeq, 6);

  // 2-bit variant (0b10) + 62-bit randomness
  const randomBytes = crypto.randomBytes(8);
  randomBytes.copy(bytes, 8);
  bytes[8] = (bytes[8] & 0x3F) | 0x80; // Variant RFC 4122

  return bytes.toString('hex').replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
}

/**
 * Extracts Unix timestamp (milliseconds) from UUIDv7 string.
 * @param {string} uuid
 * @returns {number}
 */
export function extractTimestampFromUUIDv7(uuid) {
  const hex = uuid.replace(/-/g, '').slice(0, 12);
  return parseInt(hex, 16);
}
