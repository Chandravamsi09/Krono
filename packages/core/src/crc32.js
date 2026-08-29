/**
 * @file crc32.js
 * High-performance 32-bit Cyclic Redundancy Check (CRC-32) implementation
 * using IEEE 802.3 polynomial (0xEDB88320) with precomputed lookup table.
 * Used across Krono storage segments, wire framing, and snapshot checkpoints.
 */

// Precomputed 256-entry lookup table for polynomial 0xEDB88320
const CRC32_TABLE = new Int32Array(256);

(function initCrcTable() {
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    CRC32_TABLE[i] = c;
  }
})();

/**
 * Calculates the CRC32 checksum for a given Buffer or Uint8Array.
 * @param {Uint8Array|Buffer} buf Input data buffer
 * @param {number} [previousCrc=0] Optional initial/previous CRC for incremental computation
 * @returns {number} Unsigned 32-bit CRC checksum (0 to 4294967295)
 */
export function crc32(buf, previousCrc = 0) {
  let crc = (previousCrc ^ -1);
  const len = buf.length;
  
  // Fast 8-byte unrolled processing if length allows
  let i = 0;
  const unrolledLimit = len - 7;
  
  while (i < unrolledLimit) {
    crc = CRC32_TABLE[(crc ^ buf[i++]) & 0xFF] ^ (crc >>> 8);
    crc = CRC32_TABLE[(crc ^ buf[i++]) & 0xFF] ^ (crc >>> 8);
    crc = CRC32_TABLE[(crc ^ buf[i++]) & 0xFF] ^ (crc >>> 8);
    crc = CRC32_TABLE[(crc ^ buf[i++]) & 0xFF] ^ (crc >>> 8);
    crc = CRC32_TABLE[(crc ^ buf[i++]) & 0xFF] ^ (crc >>> 8);
    crc = CRC32_TABLE[(crc ^ buf[i++]) & 0xFF] ^ (crc >>> 8);
    crc = CRC32_TABLE[(crc ^ buf[i++]) & 0xFF] ^ (crc >>> 8);
    crc = CRC32_TABLE[(crc ^ buf[i++]) & 0xFF] ^ (crc >>> 8);
  }
  
  // Remainder bytes
  while (i < len) {
    crc = CRC32_TABLE[(crc ^ buf[i++]) & 0xFF] ^ (crc >>> 8);
  }
  
  return (crc ^ -1) >>> 0;
}

/**
 * Validates whether the computed CRC matches the expected checksum.
 * @param {Uint8Array|Buffer} buf Input data buffer
 * @param {number} expectedCrc Expected 32-bit unsigned integer checksum
 * @returns {boolean} True if checksum matches, false otherwise
 */
export function verifyCrc32(buf, expectedCrc) {
  return crc32(buf) === (expectedCrc >>> 0);
}
