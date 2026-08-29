/**
 * @file byte_buffer.js
 * Fast dynamic binary buffer with Little-Endian & Big-Endian read/write operations,
 * variable integer support, string serialization, and slice views.
 */

import { encodeVarint, decodeVarint, encodeVarint64, decodeVarint64 } from './varint.js';

export class ByteBuffer {
  /**
   * @param {number|Buffer|Uint8Array} [initial=256] Initial capacity or existing buffer
   */
  constructor(initial = 256) {
    if (typeof initial === 'number') {
      this.buffer = Buffer.allocUnsafe(Math.max(16, initial));
      this.readOffset = 0;
      this.writeOffset = 0;
    } else if (Buffer.isBuffer(initial)) {
      this.buffer = initial;
      this.readOffset = 0;
      this.writeOffset = initial.length;
    } else if (initial instanceof Uint8Array) {
      this.buffer = Buffer.from(initial.buffer, initial.byteOffset, initial.byteLength);
      this.readOffset = 0;
      this.writeOffset = initial.length;
    } else {
      throw new TypeError('ByteBuffer constructor requires initial capacity or Buffer');
    }
  }

  static from(buffer) {
    return new ByteBuffer(buffer);
  }

  static allocate(capacity = 256) {
    return new ByteBuffer(capacity);
  }

  ensureCapacity(extraBytes) {
    const required = this.writeOffset + extraBytes;
    if (required > this.buffer.length) {
      let newCapacity = Math.max(this.buffer.length * 2, required + 64);
      const newBuf = Buffer.allocUnsafe(newCapacity);
      this.buffer.copy(newBuf, 0, 0, this.writeOffset);
      this.buffer = newBuf;
    }
  }

  get readableBytes() {
    return this.writeOffset - this.readOffset;
  }

  get capacity() {
    return this.buffer.length;
  }

  get length() {
    return this.writeOffset;
  }

  reset() {
    this.readOffset = 0;
    this.writeOffset = 0;
    return this;
  }

  clear() {
    this.readOffset = 0;
    this.writeOffset = 0;
    return this;
  }

  // --- Write Primitives ---

  writeUInt8(val) {
    this.ensureCapacity(1);
    this.buffer.writeUInt8(val, this.writeOffset);
    this.writeOffset += 1;
    return this;
  }

  writeInt8(val) {
    this.ensureCapacity(1);
    this.buffer.writeInt8(val, this.writeOffset);
    this.writeOffset += 1;
    return this;
  }

  writeUInt16BE(val) {
    this.ensureCapacity(2);
    this.buffer.writeUInt16BE(val, this.writeOffset);
    this.writeOffset += 2;
    return this;
  }

  writeUInt16LE(val) {
    this.ensureCapacity(2);
    this.buffer.writeUInt16LE(val, this.writeOffset);
    this.writeOffset += 2;
    return this;
  }

  writeInt16BE(val) {
    this.ensureCapacity(2);
    this.buffer.writeInt16BE(val, this.writeOffset);
    this.writeOffset += 2;
    return this;
  }

  writeInt16LE(val) {
    this.ensureCapacity(2);
    this.buffer.writeInt16LE(val, this.writeOffset);
    this.writeOffset += 2;
    return this;
  }

  writeUInt32BE(val) {
    this.ensureCapacity(4);
    this.buffer.writeUInt32BE(val, this.writeOffset);
    this.writeOffset += 4;
    return this;
  }

  writeUInt32LE(val) {
    this.ensureCapacity(4);
    this.buffer.writeUInt32LE(val, this.writeOffset);
    this.writeOffset += 4;
    return this;
  }

  writeInt32BE(val) {
    this.ensureCapacity(4);
    this.buffer.writeInt32BE(val, this.writeOffset);
    this.writeOffset += 4;
    return this;
  }

  writeInt32LE(val) {
    this.ensureCapacity(4);
    this.buffer.writeInt32LE(val, this.writeOffset);
    this.writeOffset += 4;
    return this;
  }

  writeBigUInt64BE(val) {
    this.ensureCapacity(8);
    this.buffer.writeBigUInt64BE(BigInt(val), this.writeOffset);
    this.writeOffset += 8;
    return this;
  }

  writeBigUInt64LE(val) {
    this.ensureCapacity(8);
    this.buffer.writeBigUInt64LE(BigInt(val), this.writeOffset);
    this.writeOffset += 8;
    return this;
  }

  writeBigInt64BE(val) {
    this.ensureCapacity(8);
    this.buffer.writeBigInt64BE(BigInt(val), this.writeOffset);
    this.writeOffset += 8;
    return this;
  }

  writeBigInt64LE(val) {
    this.ensureCapacity(8);
    this.buffer.writeBigInt64LE(BigInt(val), this.writeOffset);
    this.writeOffset += 8;
    return this;
  }

  writeFloatBE(val) {
    this.ensureCapacity(4);
    this.buffer.writeFloatBE(val, this.writeOffset);
    this.writeOffset += 4;
    return this;
  }

  writeDoubleBE(val) {
    this.ensureCapacity(8);
    this.buffer.writeDoubleBE(val, this.writeOffset);
    this.writeOffset += 8;
    return this;
  }

  writeVarint(val) {
    this.ensureCapacity(10);
    const temp = encodeVarint(val);
    temp.copy(this.buffer, this.writeOffset);
    this.writeOffset += temp.length;
    return this;
  }

  writeVarint64(val) {
    this.ensureCapacity(10);
    const temp = encodeVarint64(BigInt(val));
    temp.copy(this.buffer, this.writeOffset);
    this.writeOffset += temp.length;
    return this;
  }

  writeBytes(buf) {
    if (!buf) return this;
    const src = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
    this.ensureCapacity(src.length);
    src.copy(this.buffer, this.writeOffset);
    this.writeOffset += src.length;
    return this;
  }

  writePrefixedBytes(buf) {
    const src = buf ? (Buffer.isBuffer(buf) ? buf : Buffer.from(buf)) : Buffer.alloc(0);
    this.writeVarint(src.length);
    this.writeBytes(src);
    return this;
  }

  writeString(str, encoding = 'utf8') {
    const strBuf = Buffer.from(str, encoding);
    this.writePrefixedBytes(strBuf);
    return this;
  }

  writeRawString(str, encoding = 'utf8') {
    const strBuf = Buffer.from(str, encoding);
    this.writeBytes(strBuf);
    return this;
  }

  // --- Read Primitives ---

  readUInt8() {
    this._checkReadable(1);
    const v = this.buffer.readUInt8(this.readOffset);
    this.readOffset += 1;
    return v;
  }

  readInt8() {
    this._checkReadable(1);
    const v = this.buffer.readInt8(this.readOffset);
    this.readOffset += 1;
    return v;
  }

  readUInt16BE() {
    this._checkReadable(2);
    const v = this.buffer.readUInt16BE(this.readOffset);
    this.readOffset += 2;
    return v;
  }

  readUInt16LE() {
    this._checkReadable(2);
    const v = this.buffer.readUInt16LE(this.readOffset);
    this.readOffset += 2;
    return v;
  }

  readInt16BE() {
    this._checkReadable(2);
    const v = this.buffer.readInt16BE(this.readOffset);
    this.readOffset += 2;
    return v;
  }

  readInt16LE() {
    this._checkReadable(2);
    const v = this.buffer.readInt16LE(this.readOffset);
    this.readOffset += 2;
    return v;
  }

  readUInt32BE() {
    this._checkReadable(4);
    const v = this.buffer.readUInt32BE(this.readOffset);
    this.readOffset += 4;
    return v;
  }

  readUInt32LE() {
    this._checkReadable(4);
    const v = this.buffer.readUInt32LE(this.readOffset);
    this.readOffset += 4;
    return v;
  }

  readInt32BE() {
    this._checkReadable(4);
    const v = this.buffer.readInt32BE(this.readOffset);
    this.readOffset += 4;
    return v;
  }

  readInt32LE() {
    this._checkReadable(4);
    const v = this.buffer.readInt32LE(this.readOffset);
    this.readOffset += 4;
    return v;
  }

  readBigUInt64BE() {
    this._checkReadable(8);
    const v = this.buffer.readBigUInt64BE(this.readOffset);
    this.readOffset += 8;
    return v;
  }

  readBigUInt64LE() {
    this._checkReadable(8);
    const v = this.buffer.readBigUInt64LE(this.readOffset);
    this.readOffset += 8;
    return v;
  }

  readBigInt64BE() {
    this._checkReadable(8);
    const v = this.buffer.readBigInt64BE(this.readOffset);
    this.readOffset += 8;
    return v;
  }

  readBigInt64LE() {
    this._checkReadable(8);
    const v = this.buffer.readBigInt64LE(this.readOffset);
    this.readOffset += 8;
    return v;
  }

  readFloatBE() {
    this._checkReadable(4);
    const v = this.buffer.readFloatBE(this.readOffset);
    this.readOffset += 4;
    return v;
  }

  readDoubleBE() {
    this._checkReadable(8);
    const v = this.buffer.readDoubleBE(this.readOffset);
    this.readOffset += 8;
    return v;
  }

  readVarint() {
    const { value, bytesRead } = decodeVarint(this.buffer, this.readOffset);
    this.readOffset += bytesRead;
    return value;
  }

  readVarint64() {
    const { value, bytesRead } = decodeVarint64(this.buffer, this.readOffset);
    this.readOffset += bytesRead;
    return value;
  }

  readBytes(length) {
    this._checkReadable(length);
    const slice = this.buffer.subarray(this.readOffset, this.readOffset + length);
    this.readOffset += length;
    return Buffer.from(slice);
  }

  readPrefixedBytes() {
    const length = this.readVarint();
    return this.readBytes(length);
  }

  readString(encoding = 'utf8') {
    const bytes = this.readPrefixedBytes();
    return bytes.toString(encoding);
  }

  _checkReadable(bytes) {
    if (this.readOffset + bytes > this.writeOffset) {
      throw new RangeError(
        `ByteBuffer read out of bounds: requested ${bytes} bytes, only ${this.readableBytes} available`
      );
    }
  }

  toBuffer() {
    return this.buffer.subarray(0, this.writeOffset);
  }

  toUnreadBuffer() {
    return this.buffer.subarray(this.readOffset, this.writeOffset);
  }
}
