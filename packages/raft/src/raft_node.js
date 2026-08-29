/**
 * @file raft_node.js
 * Full-featured Raft Consensus Node implementing Leader Election, Pre-Vote,
 * Log Replication, Dynamic Quorums, Linearizable Reads, and State Machine application.
 */

import { EventEmitter } from 'node:events';
import { RaftRole, RaftDefaults } from './types.js';
import { ElectionTimer } from './election_timer.js';
import { PersistentState } from './persistent_state.js';
import { ReplicatedLog } from './replicated_log.js';
import { PeerManager } from './peer_manager.js';
import { ReadIndexManager } from './linearizable_read.js';
import {
  RequestVoteArgs,
  RequestVoteResult,
  AppendEntriesArgs,
  AppendEntriesResult,
  LogEntry,
  ConsensusEntryType
} from '@krono/protocol';
import { NotLeaderError, RaftError, QuorumLostError, defaultLogger } from '@krono/core';

export class RaftNode extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} options.nodeId Unique cluster node ID
   * @param {string[]} [options.peers=[]] Array of peer node IDs
   * @param {string} [options.stateFilePath] Path for durable state
   * @param {Function} [options.rpcSender] Custom async RPC transport sender function: (peerId, rpcType, args) => Promise<result>
   * @param {Object} [options.logger] Structured logger
   */
  constructor(options) {
    super();
    this.nodeId = options.nodeId;
    this.role = RaftRole.FOLLOWER;
    this.leaderId = null;
    this.logger = (options.logger || defaultLogger).child(`raft:${this.nodeId}`);

    this.persistentState = new PersistentState(options.stateFilePath || `./data/raft-${this.nodeId}.state`);
    this.persistentState.load();

    this.log = new ReplicatedLog();
    this.peerManager = new PeerManager(options.peers || []);
    this.electionTimer = new ElectionTimer();
    this.readIndexManager = new ReadIndexManager();

    this.commitIndex = 0;
    this.lastApplied = 0;

    this.rpcSender = options.rpcSender || (async () => { throw new Error('No RPC sender configured'); });
    this.heartbeatTimer = null;
    this.isRunning = false;

    /** @type {Map<number, { resolve: Function, reject: Function }>} Track uncommitted client proposals */
    this.pendingProposals = new Map();

    // Hook election timeout
    this.electionTimer.on('timeout', () => this._handleElectionTimeout());
  }

  get currentTerm() {
    return this.persistentState.currentTerm;
  }

  get votedFor() {
    return this.persistentState.votedFor;
  }

  get clusterSize() {
    return this.peerManager.peerCount + 1;
  }

  get quorumSize() {
    return Math.floor(this.clusterSize / 2) + 1;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.role = RaftRole.FOLLOWER;
    this.leaderId = null;
    this.electionTimer.start();
    this.logger.info('Raft node started', { term: this.currentTerm, peers: this.peerManager.peerList.map(p => p.peerId) });
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    this.electionTimer.stop();
    this._stopHeartbeat();
    this.readIndexManager.abortAll(new RaftError('Raft node stopped'));
    for (const p of this.pendingProposals.values()) {
      p.reject(new RaftError('Raft node stopped'));
    }
    this.pendingProposals.clear();
    this.logger.info('Raft node stopped');
  }

  // --- Election & Term Progression ---

  _handleElectionTimeout() {
    if (!this.isRunning || this.role === RaftRole.LEADER) return;
    this.logger.debug('Election timeout triggered, starting Pre-Vote phase');
    this._startPreVote();
  }

  async _startPreVote() {
    this.role = RaftRole.PRE_CANDIDATE;
    const nextTerm = this.currentTerm + 1;
    const preVotes = new Set([this.nodeId]);

    // If single-node cluster, become leader immediately
    if (preVotes.size >= this.quorumSize) {
      this._becomeCandidate();
      return;
    }

    const preVoteArgs = new RequestVoteArgs({
      term: nextTerm,
      candidateId: this.nodeId,
      lastLogIndex: this.log.lastLogIndex,
      lastLogTerm: this.log.lastLogTerm,
      isPreVote: true
    });

    for (const peer of this.peerManager.peerList) {
      this._sendRequestVote(peer.peerId, preVoteArgs).then((res) => {
        if (res && res.voteGranted && this.role === RaftRole.PRE_CANDIDATE) {
          preVotes.add(peer.peerId);
          if (preVotes.size >= this.quorumSize) {
            this._becomeCandidate();
          }
        }
      }).catch(() => {});
    }
  }

  _becomeCandidate() {
    this.role = RaftRole.CANDIDATE;
    const newTerm = this.currentTerm + 1;
    this.persistentState.save(newTerm, this.nodeId);
    this.electionTimer.reset();
    this.logger.info('Became candidate for term', { term: newTerm });

    const votes = new Set([this.nodeId]);

    if (votes.size >= this.quorumSize) {
      this._becomeLeader();
      return;
    }

    const voteArgs = new RequestVoteArgs({
      term: newTerm,
      candidateId: this.nodeId,
      lastLogIndex: this.log.lastLogIndex,
      lastLogTerm: this.log.lastLogTerm,
      isPreVote: false
    });

    for (const peer of this.peerManager.peerList) {
      this._sendRequestVote(peer.peerId, voteArgs).then((res) => {
        if (!res || !this.isRunning) return;

        if (res.term > this.currentTerm) {
          this._stepDown(res.term);
          return;
        }

        if (res.voteGranted && this.role === RaftRole.CANDIDATE && res.term === this.currentTerm) {
          votes.add(peer.peerId);
          if (votes.size >= this.quorumSize) {
            this._becomeLeader();
          }
        }
      }).catch(() => {});
    }
  }

  _becomeLeader() {
    this.role = RaftRole.LEADER;
    this.leaderId = this.nodeId;
    this.electionTimer.stop();
    this.peerManager.initLeaderProgress(this.log.lastLogIndex);
    this.logger.info('Elected LEADER for term', { term: this.currentTerm, lastLogIndex: this.log.lastLogIndex });

    // Append initial No-Op entry to commit entries from prior terms
    const noopEntry = new LogEntry({
      term: this.currentTerm,
      index: this.log.lastLogIndex + 1,
      type: ConsensusEntryType.NOOP,
      data: Buffer.alloc(0)
    });
    this.log.append(noopEntry);

    this._startHeartbeat();
    this._broadcastAppendEntries();
    this.emit('leaderElected', { term: this.currentTerm, leaderId: this.nodeId });
  }

  _stepDown(newTerm, newLeaderId = null) {
    this.logger.info('Stepping down to FOLLOWER', { oldTerm: this.currentTerm, newTerm, leader: newLeaderId });
    this.role = RaftRole.FOLLOWER;
    this.leaderId = newLeaderId;
    this.persistentState.save(newTerm, null);
    this._stopHeartbeat();
    this.electionTimer.start();
    this.readIndexManager.abortAll(new NotLeaderError(this.leaderId));
    this.emit('roleChange', { role: RaftRole.FOLLOWER, term: newTerm, leaderId: newLeaderId });
  }

  // --- Heartbeat & Replication ---

  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.role === RaftRole.LEADER) {
        this._broadcastAppendEntries();
      }
    }, RaftDefaults.HEARTBEAT_INTERVAL_MS);
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  _broadcastAppendEntries() {
    for (const peer of this.peerManager.peerList) {
      this._replicateToPeer(peer);
    }
  }

  async _replicateToPeer(peer) {
    if (peer.isPaused || this.role !== RaftRole.LEADER) return;

    const prevLogIndex = peer.nextIndex - 1;
    const prevLogTerm = this.log.getTerm(prevLogIndex);
    const entries = this.log.getEntriesFrom(peer.nextIndex, RaftDefaults.MAX_ENTRIES_PER_RPC);

    const args = new AppendEntriesArgs({
      term: this.currentTerm,
      leaderId: this.nodeId,
      prevLogIndex,
      prevLogTerm,
      leaderCommit: this.commitIndex,
      entries
    });

    try {
      const res = await this.rpcSender(peer.peerId, 'AppendEntries', args);
      if (!res || !this.isRunning) return;

      if (res.term > this.currentTerm) {
        this._stepDown(res.term);
        return;
      }

      if (this.role !== RaftRole.LEADER) return;

      if (res.success) {
        peer.updateProgress(res.matchIndex);
        this.readIndexManager.recordHeartbeatAck(peer.peerId, this.quorumSize);
        this._checkCommitIndex();
      } else {
        peer.decrementNextIndex();
        if (res.conflictIndex > 0) {
          peer.nextIndex = Math.min(peer.nextIndex, res.conflictIndex);
        }
      }
    } catch (err) {
      // Peer unreachable, retry next heartbeat
    }
  }

  _checkCommitIndex() {
    const quorumMatch = this.peerManager.computeQuorumMatchIndex(this.log.lastLogIndex);
    if (quorumMatch > this.commitIndex && this.log.getTerm(quorumMatch) === this.currentTerm) {
      const oldCommit = this.commitIndex;
      this.commitIndex = quorumMatch;
      this.logger.debug('Commit index advanced', { oldCommit, newCommit: this.commitIndex });
      this._applyEntries();
    }
  }

  _applyEntries() {
    while (this.lastApplied < this.commitIndex) {
      this.lastApplied++;
      const entry = this.log.getEntry(this.lastApplied);
      if (entry) {
        this.emit('apply', entry);

        // Resolve client proposal if pending
        const proposal = this.pendingProposals.get(entry.index);
        if (proposal) {
          proposal.resolve(entry);
          this.pendingProposals.delete(entry.index);
        }
      }
    }
  }

  // --- Client Proposals & RPC Handling ---

  /**
   * Proposes a new command to the Raft cluster.
   * @param {Buffer|string} command
   * @returns {Promise<LogEntry>} Resolves when committed to quorum
   */
  async propose(command) {
    if (this.role !== RaftRole.LEADER) {
      throw new NotLeaderError(this.leaderId);
    }

    const dataBuf = Buffer.isBuffer(command) ? command : Buffer.from(command);
    const entry = new LogEntry({
      term: this.currentTerm,
      index: this.log.lastLogIndex + 1,
      type: ConsensusEntryType.NORMAL,
      data: dataBuf
    });

    this.log.append(entry);

    const promise = new Promise((resolve, reject) => {
      this.pendingProposals.set(entry.index, { resolve, reject });
    });

    // Replicate immediately
    this._broadcastAppendEntries();

    // Single-node quorum check
    if (this.peerManager.peerCount === 0) {
      this._checkCommitIndex();
    }

    return promise;
  }

  /**
   * RequestVote RPC Handler
   * @param {RequestVoteArgs} args
   * @returns {RequestVoteResult}
   */
  handleRequestVote(args) {
    if (args.term > this.currentTerm) {
      if (!args.isPreVote) {
        this._stepDown(args.term);
      }
    }

    // Rule 1: Reject if term < currentTerm
    if (args.term < this.currentTerm) {
      return new RequestVoteResult({ term: this.currentTerm, voteGranted: false, isPreVote: args.isPreVote });
    }

    // Rule 2: Check if votedFor is null or candidateId
    const canVote = args.isPreVote || this.votedFor === null || this.votedFor === args.candidateId;

    // Rule 3: Check candidate log is up-to-date
    const isLogUpToDate =
      args.lastLogTerm > this.log.lastLogTerm ||
      (args.lastLogTerm === this.log.lastLogTerm && args.lastLogIndex >= this.log.lastLogIndex);

    if (canVote && isLogUpToDate) {
      if (!args.isPreVote) {
        this.persistentState.save(this.currentTerm, args.candidateId);
        this.electionTimer.reset();
      }
      return new RequestVoteResult({ term: this.currentTerm, voteGranted: true, isPreVote: args.isPreVote });
    }

    return new RequestVoteResult({ term: this.currentTerm, voteGranted: false, isPreVote: args.isPreVote });
  }

  /**
   * AppendEntries RPC Handler
   * @param {AppendEntriesArgs} args
   * @returns {AppendEntriesResult}
   */
  handleAppendEntries(args) {
    if (args.term > this.currentTerm) {
      this._stepDown(args.term, args.leaderId);
    }

    // Reply false if term < currentTerm
    if (args.term < this.currentTerm) {
      return new AppendEntriesResult({
        term: this.currentTerm,
        success: false,
        matchIndex: this.log.lastLogIndex
      });
    }

    // Valid leader contact, reset election timer
    this.leaderId = args.leaderId;
    this.electionTimer.reset();

    // Reply false if log doesn't contain entry at prevLogIndex matching prevLogTerm
    if (args.prevLogIndex > 0) {
      const termAtPrev = this.log.getTerm(args.prevLogIndex);
      if (termAtPrev !== args.prevLogTerm) {
        return new AppendEntriesResult({
          term: this.currentTerm,
          success: false,
          matchIndex: this.log.lastLogIndex,
          conflictIndex: Math.max(1, this.log.lastLogIndex)
        });
      }
    }

    // Append new entries not already in the log
    for (const entry of args.entries) {
      const existing = this.log.getEntry(entry.index);
      if (existing) {
        if (existing.term !== entry.term) {
          // Conflict: truncate uncommitted entries from here
          this.log.truncate(entry.index);
          this.log.append(entry);
        }
      } else {
        this.log.append(entry);
      }
    }

    // Update commit index
    if (args.leaderCommit > this.commitIndex) {
      this.commitIndex = Math.min(args.leaderCommit, this.log.lastLogIndex);
      this._applyEntries();
    }

    return new AppendEntriesResult({
      term: this.currentTerm,
      success: true,
      matchIndex: this.log.lastLogIndex
    });
  }

  async _sendRequestVote(peerId, args) {
    try {
      return await this.rpcSender(peerId, 'RequestVote', args);
    } catch (err) {
      return null;
    }
  }
}
