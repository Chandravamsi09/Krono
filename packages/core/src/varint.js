/**
 * @file varint.js
 * Variable-length integer (Varint / LEB128) encoding and decoding routines.
 * Optimized for compact binary wire protocol representations of integers & BigInts.
 */

const REST = 0x7F;
const MSB = 0x80;
const MSB_BIG = 0x80n;
const REST_BIG = 0x7Fn;

/**
 * Encodes a JavaScript number as an unsigned Varint into a target buffer.
 * @param {number} value Non-negative integer (0 <= value <= 2^53 - 1)
 * @param {Uint8Array|Buffer} [buffer] Optional target buffer
 * @param {number} [offset=0] Byte offset to begin writing
 * @returns {Buffer|Uint8Array} Buffer with encoded bytes
 */
export function encodeVarint(value, buffer, offset = 0) {
  if (value < 0) {
    throw new RangeError(`encodeVarint: value must be non-negative, got ${value}`);
  }
  
  if (!buffer) {
    buffer = Buffer.alloc(varintLength(value));
    offset = 0;
  }
  
  let val = value;
  let cursor = offset;
  
  while (val >= 0x80) {
    buffer[cursor++] = (val & REST) | MSB;
    val = Math.floor(val / 128);
  }
  buffer[cursor++] = val & REST;
  
  return buffer;
}

/**
 * Decodes an unsigned Varint from a buffer starting at offset.
 * @param {Uint8Array|Buffer} buffer
 * @param {number} [offset=0]
 * @returns {{ value: number, bytesRead: number }}
 */
export function decodeVarint(buffer, offset = 0) {
  let res = 0;
  let shift = 0;
  let cursor = offset;
  const len = buffer.length;
  
  while (cursor < len) {
    const byte = buffer[cursor++];
    res += (byte & REST) * Math.pow(2, shift);
    shift += 7;
    if ((byte & MSB) === 0) {
      return { value: res, bytesRead: cursor - offset };
    }
    if (shift > 56) {
      throw new RangeError('decodeVarint: Varint exceeds 64-bit bounds');
    }
  }
  
  throw new RangeError('decodeVarint: Unexpected end of buffer while decoding varint');
}

/**
 * Encodes a 64-bit BigInt as an unsigned Varint.
 * @param {bigint} value Non-negative BigInt
 * @param {Uint8Array|Buffer} [buffer]
 * @param {number} [offset=0]
 * @returns {Buffer|Uint8Array}
 */
export function encodeVarint64(value, buffer, offset = 0) {
  if (value < 0n) {
    throw new RangeError(`encodeVarint64: value must be non-negative, got ${value}`);
  }
  
  if (!buffer) {
    buffer = Buffer.alloc(varint64Length(value));
    offset = 0;
  }
  
  let val = value;
  let cursor = offset;
  
  while (val >= MSB_BIG) {
    buffer[cursor++] = Number((val & REST_BIG) | MSB_BIG);
    val >>= 7n;
  }
  buffer[cursor++] = Number(val & REST_BIG);
  
  return buffer;
}

/**
 * Decodes a 64-bit BigInt Varint from a buffer.
 * @param {Uint8Array|Buffer} buffer
 * @param {number} [offset=0]
 * @returns {{ value: bigint, bytesRead: number }}
 */
export function decodeVarint64(buffer, offset = 0) {
  let res = 0n;
  let shift = 0n;
  let cursor = offset;
  const len = buffer.length;
  
  while (cursor < len) {
    const byte = BigInt(buffer[cursor++]);
    res |= (byte & REST_BIG) << shift;
    shift += 7n;
    if ((byte & MSB_BIG) === 0n) {
      return { value: res, bytesRead: cursor - offset };
    }
    if (shift > 64n) {
      throw new RangeError('decodeVarint64: Varint exceeds 64-bit boundary');
    }
  }
  
  throw new RangeError('decodeVarint64: Unexpected end of buffer');
}

/**
 * Computes byte length required to store a number as a Varint.
 * @param {number} value
 * @returns {number}
 */
export function varintLength(value) {
  if (value < 0) throw new RangeError('value must be positive');
  if (value < 0x80) return 1;
  if (value < 0x4000) return 2;
  if (value < 0x200000) return 3;
  if (value < 0x10000000) return 4;
  if (value < 0x800000000) return 5;
  if (value < 0x40000000000) return 6;
  if (value < 0x2000000000000) return 7;
  return 8;
}

/**
 * Computes byte length for BigInt Varint.
 * @param {bigint} value
 * @returns {number}
 */
export function varint64Length(value) {
  let len = 0;
  let v = value;
  do {
    len++;
    v >>= 7n;
  } while (v > 0n);
  return len;
}
