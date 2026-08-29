/**
 * @file sstable.js
 * Immutable Sorted String Table (.sst) format with embedded Bloom Filter,
 * Block Index, and CRC32 checksums.
 * Format:
 * [Data Block 0..N] (KeyLength: 2B, Key: KB, ValueLength: 4B, Value: VB, Timestamp: 8B, Deleted: 1B)
 * [Index Block] (Key: String, DataPosition: 8B)
 * [Bloom Filter Block] (Size: 4B, Hashes: 4B, Count: 4B, Bitmap: NB)
 * [Footer] (IndexOffset: 8B, BloomOffset: 8B, RecordCount: 4B, Magic: 0x53535442, CRC: 4B)
 */

import fs from 'node:fs';
import path from 'node:path';
import { BloomFilter } from './bloom_filter.js';
import { crc32 } from '@krono/core';

export const SSTABLE_MAGIC = 0x53535442; // "SSTB"
export const SSTABLE_FOOTER_SIZE = 28;

export class SSTableWriter {
  /**
   * @param {string} filepath Target path for .sst file
   */
  constructor(filepath) {
    this.filepath = filepath;
  }

  /**
   * Writes sorted entries into SSTable.
   * @param {Array<{ key: string, value: { value: Buffer, timestamp: number, isDeleted: boolean } }>} entries
   */
  write(entries) {
    const dir = path.dirname(this.filepath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const bloom = new BloomFilter(Math.max(entries.length, 100), 0.01);
    const indexEntries = [];
    const dataChunks = [];
    let currentDataOffset = 0;

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      bloom.add(entry.key);

      const keyBuf = Buffer.from(entry.key, 'utf8');
      const valBuf = entry.value.value;
      const isDel = entry.value.isDeleted ? 1 : 0;
      const ts = entry.value.timestamp;

      // Index every 16 entries for sparse block indexing
      if (i % 16 === 0) {
        indexEntries.push({ key: entry.key, position: currentDataOffset });
      }

      // Encode Data Row: KeyLen(2) + Key(K) + ValLen(4) + Val(V) + Ts(8) + Del(1)
      const rowLen = 2 + keyBuf.length + 4 + valBuf.length + 8 + 1;
      const rowBuf = Buffer.allocUnsafe(rowLen);

      rowBuf.writeUInt16BE(keyBuf.length, 0);
      keyBuf.copy(rowBuf, 2);
      let offset = 2 + keyBuf.length;

      rowBuf.writeUInt32BE(valBuf.length, offset);
      offset += 4;
      valBuf.copy(rowBuf, offset);
      offset += valBuf.length;

      rowBuf.writeDoubleBE(ts, offset);
      offset += 8;

      rowBuf.writeUInt8(isDel, offset);

      dataChunks.push(rowBuf);
      currentDataOffset += rowLen;
    }

    const allDataBuf = Buffer.concat(dataChunks);

    // Encode Index Block
    const indexChunks = [];
    for (const idx of indexEntries) {
      const kBuf = Buffer.from(idx.key, 'utf8');
      const chunk = Buffer.allocUnsafe(2 + kBuf.length + 8);
      chunk.writeUInt16BE(kBuf.length, 0);
      kBuf.copy(chunk, 2);
      chunk.writeBigUInt64BE(BigInt(idx.position), 2 + kBuf.length);
      indexChunks.push(chunk);
    }
    const indexBuf = Buffer.concat(indexChunks);
    const indexOffset = allDataBuf.length;

    // Encode Bloom Filter Block
    const bloomBuf = bloom.toBuffer();
    const bloomOffset = indexOffset + indexBuf.length;

    // Encode Footer: IndexOffset(8) + BloomOffset(8) + Count(4) + Magic(4) + CRC(4)
    const footerBuf = Buffer.allocUnsafe(SSTABLE_FOOTER_SIZE);
    footerBuf.writeBigUInt64BE(BigInt(indexOffset), 0);
    footerBuf.writeBigUInt64BE(BigInt(bloomOffset), 8);
    footerBuf.writeUInt32BE(entries.length, 16);
    footerBuf.writeUInt32BE(SSTABLE_MAGIC, 20);

    const fullWithoutCrc = Buffer.concat([allDataBuf, indexBuf, bloomBuf, footerBuf.subarray(0, 24)]);
    const fullCrc = crc32(fullWithoutCrc);
    footerBuf.writeUInt32BE(fullCrc, 24);

    const finalBuffer = Buffer.concat([allDataBuf, indexBuf, bloomBuf, footerBuf]);
    fs.writeFileSync(this.filepath, finalBuffer);
  }
}

export class SSTableReader {
  /**
   * @param {string} filepath Path to .sst file
   */
  constructor(filepath) {
    this.filepath = filepath;
    this.buffer = null;
    this.indexOffset = 0;
    this.bloomOffset = 0;
    this.recordCount = 0;
    /** @type {BloomFilter} */
    this.bloom = null;
    /** @type {Array<{ key: string, position: number }>} */
    this.index = [];
    this.isOpen = false;
  }

  open() {
    if (this.isOpen) return;

    this.buffer = fs.readFileSync(this.filepath);
    if (this.buffer.length < SSTABLE_FOOTER_SIZE) {
      throw new Error(`Invalid SSTable file size: ${this.buffer.length}`);
    }

    const footerOffset = this.buffer.length - SSTABLE_FOOTER_SIZE;
    const magic = this.buffer.readUInt32BE(footerOffset + 20);
    if (magic !== SSTABLE_MAGIC) {
      throw new Error(`Invalid SSTable magic 0x${magic.toString(16)} in ${this.filepath}`);
    }

    this.indexOffset = Number(this.buffer.readBigUInt64BE(footerOffset));
    this.bloomOffset = Number(this.buffer.readBigUInt64BE(footerOffset + 8));
    this.recordCount = this.buffer.readUInt32BE(footerOffset + 16);

    // Read Bloom Filter
    const bloomBuf = this.buffer.subarray(this.bloomOffset, footerOffset);
    this.bloom = BloomFilter.fromBuffer(bloomBuf);

    // Read Index
    const indexBuf = this.buffer.subarray(this.indexOffset, this.bloomOffset);
    let cur = 0;
    while (cur < indexBuf.length) {
      const kLen = indexBuf.readUInt16BE(cur);
      cur += 2;
      const key = indexBuf.toString('utf8', cur, cur + kLen);
      cur += kLen;
      const position = Number(indexBuf.readBigUInt64BE(cur));
      cur += 8;
      this.index.push({ key, position });
    }

    this.isOpen = true;
  }

  /**
   * Searches for a key in the SSTable.
   * @param {string} key
   * @returns {{ value: Buffer, timestamp: number, isDeleted: boolean } | null}
   */
  get(key) {
    if (!this.isOpen) this.open();

    // 1. Fast Bloom filter check
    if (!this.bloom.mightContain(key)) {
      return null;
    }

    // 2. Binary search index for starting data block position
    let low = 0;
    let high = this.index.length - 1;
    let startPos = 0;

    while (low <= high) {
      const mid = (low + high) >>> 1;
      const item = this.index[mid];
      if (item.key <= key) {
        startPos = item.position;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    // 3. Scan forward through data block
    let cur = startPos;
    const dataEnd = this.indexOffset;

    while (cur < dataEnd) {
      const kLen = this.buffer.readUInt16BE(cur);
      cur += 2;
      const rowKey = this.buffer.toString('utf8', cur, cur + kLen);
      cur += kLen;

      const vLen = this.buffer.readUInt32BE(cur);
      cur += 4;
      const value = Buffer.from(this.buffer.subarray(cur, cur + vLen));
      cur += vLen;

      const timestamp = this.buffer.readDoubleBE(cur);
      cur += 8;

      const isDeleted = this.buffer.readUInt8(cur) === 1;
      cur += 1;

      if (rowKey === key) {
        return { value, timestamp, isDeleted };
      }

      if (rowKey > key) {
        return null;
      }
    }

    return null;
  }

  /**
   * Scans all records in SSTable.
   * @returns {Array<{ key: string, value: Buffer, timestamp: number, isDeleted: boolean }>}
   */
  scan() {
    if (!this.isOpen) this.open();

    const results = [];
    let cur = 0;
    const dataEnd = this.indexOffset;

    while (cur < dataEnd) {
      const kLen = this.buffer.readUInt16BE(cur);
      cur += 2;
      const key = this.buffer.toString('utf8', cur, cur + kLen);
      cur += kLen;

      const vLen = this.buffer.readUInt32BE(cur);
      cur += 4;
      const value = Buffer.from(this.buffer.subarray(cur, cur + vLen));
      cur += vLen;

      const timestamp = this.buffer.readDoubleBE(cur);
      cur += 8;

      const isDeleted = this.buffer.readUInt8(cur) === 1;
      cur += 1;

      results.push({ key, value, timestamp, isDeleted });
    }

    return results;
  }
}
