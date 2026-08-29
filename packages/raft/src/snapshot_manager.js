/**
 * @file snapshot_manager.js
 * Snapshot creation, storage, and streaming engine for Raft state machine compaction.
 */

import fs from 'node:fs';
import path from 'node:path';
import { crc32 } from '@krono/core';
import { InstallSnapshotArgs } from '@krono/protocol';

export const SNAPSHOT_CHUNK_SIZE = 64 * 1024; // 64 KB per chunk

export class SnapshotManager {
  /**
   * @param {string} snapshotDir Directory to store snapshots
   */
  constructor(snapshotDir) {
    this.snapshotDir = snapshotDir;
    this.latestSnapshot = null;
  }

  open() {
    if (!fs.existsSync(this.snapshotDir)) {
      fs.mkdirSync(this.snapshotDir, { recursive: true });
    }
    this._loadLatestSnapshot();
  }

  _loadLatestSnapshot() {
    const files = fs.readdirSync(this.snapshotDir).filter((f) => f.endsWith('.snap'));
    if (files.length === 0) return;

    // Parse snapshot metadata from filename: snapshot_{index}_{term}.snap
    const parsed = files.map((f) => {
      const match = f.match(/^snapshot_(\d+)_(\d+)\.snap$/);
      if (!match) return null;
      return {
        filename: f,
        filepath: path.join(this.snapshotDir, f),
        lastIncludedIndex: parseInt(match[1], 10),
        lastIncludedTerm: parseInt(match[2], 10)
      };
    }).filter(Boolean).sort((a, b) => b.lastIncludedIndex - a.lastIncludedIndex);

    if (parsed.length > 0) {
      this.latestSnapshot = parsed[0];
    }
  }

  /**
   * Saves a new state machine snapshot to disk.
   * @param {number} lastIncludedIndex
   * @param {number} lastIncludedTerm
   * @param {Buffer} stateData Serialized state machine data
   */
  saveSnapshot(lastIncludedIndex, lastIncludedTerm, stateData) {
    const filename = `snapshot_${lastIncludedIndex}_${lastIncludedTerm}.snap`;
    const filepath = path.join(this.snapshotDir, filename);

    const header = Buffer.allocUnsafe(20);
    header.writeUInt32BE(lastIncludedIndex, 0);
    header.writeUInt32BE(lastIncludedTerm, 4);
    header.writeDoubleBE(Date.now(), 8);
    const checksum = crc32(stateData);
    header.writeUInt32BE(checksum, 16);

    const fullSnapshot = Buffer.concat([header, stateData]);
    const tmpPath = `${filepath}.tmp`;
    fs.writeFileSync(tmpPath, fullSnapshot);
    fs.renameSync(tmpPath, filepath);

    this.latestSnapshot = {
      filename,
      filepath,
      lastIncludedIndex,
      lastIncludedTerm
    };

    // Clean up older snapshots
    this._cleanupOldSnapshots(filepath);
  }

  _cleanupOldSnapshots(currentFilepath) {
    const files = fs.readdirSync(this.snapshotDir).filter((f) => f.endsWith('.snap'));
    for (const f of files) {
      const fp = path.join(this.snapshotDir, f);
      if (fp !== currentFilepath) {
        try { fs.unlinkSync(fp); } catch (e) {}
      }
    }
  }

  /**
   * Reads the latest snapshot state data.
   * @returns {{ lastIncludedIndex: number, lastIncludedTerm: number, data: Buffer } | null}
   */
  readSnapshot() {
    if (!this.latestSnapshot) return null;

    const full = fs.readFileSync(this.latestSnapshot.filepath);
    const lastIncludedIndex = full.readUInt32BE(0);
    const lastIncludedTerm = full.readUInt32BE(4);
    const expectedCrc = full.readUInt32BE(16);
    const data = full.subarray(20);

    const actualCrc = crc32(data);
    if (expectedCrc !== actualCrc) {
      throw new Error(`Snapshot CRC mismatch in ${this.latestSnapshot.filename}`);
    }

    return { lastIncludedIndex, lastIncludedTerm, data: Buffer.from(data) };
  }

  /**
   * Generates chunked streaming RPC args for InstallSnapshot.
   * @param {string} leaderId
   * @param {number} term
   * @param {number} offset
   * @returns {InstallSnapshotArgs | null}
   */
  getSnapshotChunk(leaderId, term, offset) {
    const snap = this.readSnapshot();
    if (!snap) return null;

    const totalLen = snap.data.length;
    const chunkEnd = Math.min(totalLen, offset + SNAPSHOT_CHUNK_SIZE);
    const chunkData = snap.data.subarray(offset, chunkEnd);
    const done = chunkEnd >= totalLen;

    return new InstallSnapshotArgs({
      term,
      leaderId,
      lastIncludedIndex: snap.lastIncludedIndex,
      lastIncludedTerm: snap.lastIncludedTerm,
      offset,
      data: Buffer.from(chunkData),
      done
    });
  }
}
