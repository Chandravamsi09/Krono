/**
 * @file constants.js
 * Krono binary wire protocol magic numbers, frame types, flags, and headers.
 */

// Magic prefix: "KRON" (0x4B524F4E)
export const PROTOCOL_MAGIC = 0x4B524F4E;
export const PROTOCOL_VERSION_1 = 0x01;

// Frame Header Size: Magic(4) + Ver(1) + Flags(1) + Type(2) + CorrId(8) + Len(4) + HdrCrc(4) = 24 bytes
export const FRAME_HEADER_SIZE = 24;
export const FRAME_TRAILER_SIZE = 4; // Payload CRC32 (4 bytes)
export const MAX_FRAME_PAYLOAD_SIZE = 64 * 1024 * 1024; // 64 MB max payload

export const FrameFlags = {
  NONE: 0x00,
  COMPRESSED_SNAPPY: 0x01,
  COMPRESSED_GZIP: 0x02,
  ENCRYPTED_TLS: 0x04,
  ONEWAY: 0x08,
  IS_RESPONSE: 0x10,
  IS_ERROR: 0x20
};

export const FrameType = {
  // Consensus / Raft (0x01 - 0x0F)
  REQUEST_VOTE: 0x01,
  REQUEST_VOTE_RESP: 0x02,
  APPEND_ENTRIES: 0x03,
  APPEND_ENTRIES_RESP: 0x04,
  INSTALL_SNAPSHOT: 0x05,
  INSTALL_SNAPSHOT_RESP: 0x06,
  PRE_VOTE: 0x07,
  PRE_VOTE_RESP: 0x08,
  READ_INDEX: 0x09,
  READ_INDEX_RESP: 0x0A,

  // Cluster / SWIM Gossip / Leases (0x10 - 0x1F)
  PING: 0x10,
  PONG: 0x11,
  PING_REQ: 0x12,
  GOSSIP_MEMBERSHIP: 0x13,
  LEASE_ACQUIRE: 0x14,
  LEASE_GRANT: 0x15,
  LEASE_RENEW: 0x16,
  TOPOLOGY_SYNC: 0x17,

  // Event Broker / PubSub (0x20 - 0x2F)
  PRODUCE_RECORD: 0x20,
  PRODUCE_ACK: 0x21,
  FETCH_RECORDS: 0x22,
  FETCH_RESP: 0x23,
  OFFSET_COMMIT: 0x24,
  OFFSET_COMMIT_ACK: 0x25,
  TOPIC_METADATA_REQ: 0x26,
  TOPIC_METADATA_RESP: 0x27,

  // DAG Workflow Scheduler & Worker (0x30 - 0x3F)
  JOB_SUBMIT: 0x30,
  JOB_SUBMIT_ACK: 0x31,
  TASK_DISPATCH: 0x32,
  TASK_HEARTBEAT: 0x33,
  TASK_RESULT: 0x34,
  JOB_CANCEL: 0x35,
  JOB_STATUS_REQ: 0x36,
  JOB_STATUS_RESP: 0x37,

  // Telemetry & Control (0x40 - 0x4F)
  CLUSTER_STATE_REQ: 0x40,
  CLUSTER_STATE_RESP: 0x41,
  CHAOS_INJECT: 0x42,
  METRICS_SNAPSHOT: 0x43
};
