/**
 * @file bitset.js
 * High-performance dynamic bitset using Uint32Array backing buffers.
 * Used for Bloom filters, partition allocation maps, and quorum bitmaps.
 */

export class BitSet {
  /**
   * @param {number} size Number of bits to allocate
   */
  constructor(size = 64) {
    if (size <= 0) throw new RangeError('BitSet size must be > 0');
    this.size = size;
    const words = Math.ceil(size / 32);
    this.words = new Uint32Array(words);
  }

  /**
   * Sets bit at specified index to 1 (or 0 if value is false).
   * @param {number} index
   * @param {boolean} [value=true]
   */
  set(index, value = true) {
    if (index < 0 || index >= this.size) {
      throw new RangeError(`BitSet index out of bounds: ${index} (size: ${this.size})`);
    }
    const wordIdx = index >>> 5;
    const bitMask = 1 << (index & 31);
    if (value) {
      this.words[wordIdx] |= bitMask;
    } else {
      this.words[wordIdx] &= ~bitMask;
    }
  }

  /**
   * Gets boolean state of bit at specified index.
   * @param {number} index
   * @returns {boolean}
   */
  get(index) {
    if (index < 0 || index >= this.size) return false;
    const wordIdx = index >>> 5;
    const bitMask = 1 << (index & 31);
    return (this.words[wordIdx] & bitMask) !== 0;
  }

  /**
   * Clears bit at index (sets to 0).
   * @param {number} index
   */
  clearBit(index) {
    this.set(index, false);
  }

  /**
   * Resets all bits to 0.
   */
  clear() {
    this.words.fill(0);
  }

  /**
   * Counts total number of set bits (popcount).
   * @returns {number}
   */
  cardinality() {
    let count = 0;
    for (let i = 0; i < this.words.length; i++) {
      let v = this.words[i];
      // Hamming weight 32-bit integer popcount
      v = v - ((v >>> 1) & 0x55555555);
      v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
      count += (((v + (v >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
    }
    return count;
  }

  /**
   * Performs bitwise AND in-place with another BitSet.
   * @param {BitSet} other
   */
  and(other) {
    const len = Math.min(this.words.length, other.words.length);
    for (let i = 0; i < len; i++) {
      this.words[i] &= other.words[i];
    }
    for (let i = len; i < this.words.length; i++) {
      this.words[i] = 0;
    }
  }

  /**
   * Performs bitwise OR in-place with another BitSet.
   * @param {BitSet} other
   */
  or(other) {
    const len = Math.min(this.words.length, other.words.length);
    for (let i = 0; i < len; i++) {
      this.words[i] |= other.words[i];
    }
  }

  toBuffer() {
    const buf = Buffer.allocUnsafe(this.words.length * 4);
    for (let i = 0; i < this.words.length; i++) {
      buf.writeUInt32LE(this.words[i], i * 4);
    }
    return buf;
  }

  static fromBuffer(buffer, size) {
    const bitset = new BitSet(size);
    const wordCount = Math.min(bitset.words.length, Math.floor(buffer.length / 4));
    for (let i = 0; i < wordCount; i++) {
      bitset.words[i] = buffer.readUInt32LE(i * 4);
    }
    return bitset;
  }
}
