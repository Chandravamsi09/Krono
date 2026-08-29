/**
 * @file persistent_state.js
 * Persistent state for Raft node (currentTerm, votedFor) stored durably on disk.
 */

import fs from 'node:fs';
import path from 'node:path';

export class PersistentState {
  /**
   * @param {string} stateFilePath Filepath to state file
   */
  constructor(stateFilePath) {
    this.stateFilePath = stateFilePath;
    this.currentTerm = 0;
    this.votedFor = null;
  }

  load() {
    const dir = path.dirname(this.stateFilePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(this.stateFilePath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.stateFilePath, 'utf8'));
        this.currentTerm = data.currentTerm ?? 0;
        this.votedFor = data.votedFor ?? null;
      } catch (err) {
        this.currentTerm = 0;
        this.votedFor = null;
      }
    }
  }

  save(term, votedFor) {
    this.currentTerm = term;
    this.votedFor = votedFor;

    const payload = JSON.stringify({
      currentTerm: this.currentTerm,
      votedFor: this.votedFor,
      updatedAt: new Date().toISOString()
    });

    const tmpPath = `${this.stateFilePath}.tmp`;
    fs.writeFileSync(tmpPath, payload, 'utf8');
    fs.renameSync(tmpPath, this.stateFilePath);
  }
}
