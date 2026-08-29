/**
 * @file bloom_filter.js
 * Probabilistic Bloom Filter with double hashing technique (Kirsch-Mitzenmacher optimization)
 * backed by BitSet for fast negative key lookups.
 */

import { BitSet, crc32 } from '@krono/core';

export class BloomFilter {
  /**
   * @param {number} [expectedElements=10000]
   * @param {number} [falsePositiveRate=0.01]
   */
  constructor(expectedElements = 10000, falsePositiveRate = 0.01) {
    this.expectedElements = Math.max(10, expectedElements);
    this.falsePositiveRate = Math.min(0.5, Math.max(0.0001, falsePositiveRate));

    // Optimal bits: m = - (n * ln(p)) / (ln(2)^2)
    const m = Math.ceil(-1 * (this.expectedElements * Math.log(this.falsePositiveRate)) / Math.pow(Math.log(2), 2));
    this.size = Math.max(64, m);

    // Optimal hash functions: k = (m / n) * ln(2)
    const k = Math.round((this.size / this.expectedElements) * Math.log(2));
    this.numHashes = Math.max(1, Math.min(16, k));

    this.bitset = new BitSet(this.size);
    this.count = 0;
  }

  /**
   * Computes hash seeds using FNV-1a and CRC-32.
   * @param {string|Buffer} key
   * @returns {[number, number]}
   */
  _hashKey(key) {
    const buf = Buffer.isBuffer(key) ? key : Buffer.from(String(key));
    // Hash 1: CRC32
    const h1 = crc32(buf);
    // Hash 2: 32-bit FNV-1a
    let h2 = 0x811c9dc5;
    for (let i = 0; i < buf.length; i++) {
      h2 ^= buf[i];
      h2 = Math.imul(h2, 0x01000193);
    }
    return [h1 >>> 0, (h2 >>> 0) || 1];
  }

  /**
   * Adds a key to the Bloom filter.
   * @param {string|Buffer} key
   */
  add(key) {
    const [h1, h2] = this._hashKey(key);
    for (let i = 0; i < this.numHashes; i++) {
      const bitIndex = (h1 + i * h2) % this.size;
      this.bitset.set(bitIndex, true);
    }
    this.count++;
  }

  /**
   * Tests whether a key might be in the set.
   * @param {string|Buffer} key
   * @returns {boolean} False = definitely not present, True = probably present
   */
  mightContain(key) {
    const [h1, h2] = this._hashKey(key);
    for (let i = 0; i < this.numHashes; i++) {
      const bitIndex = (h1 + i * h2) % this.size;
      if (!this.bitset.get(bitIndex)) {
        return false;
      }
    }
    return true;
  }

  toBuffer() {
    const bitsetBuf = this.bitset.toBuffer();
    const metaBuf = Buffer.allocUnsafe(12);
    metaBuf.writeUInt32BE(this.size, 0);
    metaBuf.writeUInt32BE(this.numHashes, 4);
    metaBuf.writeUInt32BE(this.count, 8);
    return Buffer.concat([metaBuf, bitsetBuf]);
  }

  static fromBuffer(buffer) {
    const size = buffer.readUInt32BE(0);
    const numHashes = buffer.readUInt32BE(4);
    const count = buffer.readUInt32BE(8);

    const bf = new BloomFilter(10, 0.01);
    bf.size = size;
    bf.numHashes = numHashes;
    bf.count = count;
    bf.bitset = BitSet.fromBuffer(buffer.subarray(12), size);
    return bf;
  }
}
