/**
 * @file types.js
 * Raft node roles, state definitions, and cluster defaults.
 */

export const RaftRole = {
  FOLLOWER: 'FOLLOWER',
  PRE_CANDIDATE: 'PRE_CANDIDATE',
  CANDIDATE: 'CANDIDATE',
  LEADER: 'LEADER',
  LEARNER: 'LEARNER'
};

export const RaftDefaults = {
  MIN_ELECTION_TIMEOUT_MS: 150,
  MAX_ELECTION_TIMEOUT_MS: 300,
  HEARTBEAT_INTERVAL_MS: 50,
  MAX_ENTRIES_PER_RPC: 256,
  SNAPSHOT_THRESHOLD_ENTRIES: 10000
};
