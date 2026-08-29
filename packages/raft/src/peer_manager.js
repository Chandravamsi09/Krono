/**
 * @file peer_manager.js
 * Manages Raft cluster peer states, nextIndex / matchIndex progress trackers,
 * and quorum calculation.
 */

export class PeerTracker {
  constructor(peerId, lastLogIndex = 0) {
    this.peerId = peerId;
    this.nextIndex = lastLogIndex + 1;
    this.matchIndex = 0;
    this.lastContactTime = Date.now();
    this.isPaused = false;
  }

  reset(lastLogIndex) {
    this.nextIndex = lastLogIndex + 1;
    this.matchIndex = 0;
    this.lastContactTime = Date.now();
  }

  updateProgress(matchedIndex) {
    this.matchIndex = Math.max(this.matchIndex, matchedIndex);
    this.nextIndex = this.matchIndex + 1;
    this.lastContactTime = Date.now();
  }

  decrementNextIndex() {
    this.nextIndex = Math.max(1, this.nextIndex - 1);
  }
}

export class PeerManager {
  /**
   * @param {string[]} peerIds
   */
  constructor(peerIds = []) {
    /** @type {Map<string, PeerTracker>} */
    this.peers = new Map();
    for (const id of peerIds) {
      this.peers.set(id, new PeerTracker(id));
    }
  }

  get peerList() {
    return Array.from(this.peers.values());
  }

  get peerCount() {
    return this.peers.size;
  }

  get(peerId) {
    return this.peers.get(peerId);
  }

  addPeer(peerId, lastLogIndex = 0) {
    if (!this.peers.has(peerId)) {
      this.peers.set(peerId, new PeerTracker(peerId, lastLogIndex));
    }
  }

  removePeer(peerId) {
    this.peers.delete(peerId);
  }

  initLeaderProgress(lastLogIndex) {
    for (const tracker of this.peers.values()) {
      tracker.reset(lastLogIndex);
    }
  }

  /**
   * Computes median matchIndex across quorum (including leader's own lastLogIndex).
   * @param {number} leaderMatchIndex
   * @returns {number}
   */
  computeQuorumMatchIndex(leaderMatchIndex) {
    const matchIndices = [leaderMatchIndex];
    for (const peer of this.peers.values()) {
      matchIndices.push(peer.matchIndex);
    }

    matchIndices.sort((a, b) => b - a); // Descending
    const quorumIndex = Math.floor(matchIndices.length / 2);
    return matchIndices[quorumIndex];
  }
}
