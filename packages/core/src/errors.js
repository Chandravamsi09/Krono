/**
 * @file errors.js
 * Domain-specific error taxonomy for Krono Distributed Engine.
 */

export class KronoError extends Error {
  constructor(message, code = 'KRONO_ERROR', details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    this.timestamp = Date.now();
    Error.captureStackTrace(this, this.constructor);
  }
}

export class RaftError extends KronoError {
  constructor(message, details = {}) {
    super(message, 'RAFT_ERROR', details);
  }
}

export class NotLeaderError extends RaftError {
  constructor(leaderId, leaderAddress, details = {}) {
    super(
      `Node is not leader. Current leader is ${leaderId || 'UNKNOWN'} (${leaderAddress || 'N/A'})`,
      { leaderId, leaderAddress, ...details }
    );
    this.code = 'NOT_LEADER';
    this.leaderId = leaderId;
    this.leaderAddress = leaderAddress;
  }
}

export class QuorumLostError extends RaftError {
  constructor(activeNodes, requiredQuorum, details = {}) {
    super(
      `Quorum lost: active nodes ${activeNodes}, required ${requiredQuorum}`,
      { activeNodes, requiredQuorum, ...details }
    );
    this.code = 'QUORUM_LOST';
  }
}

export class StorageCorruptedError extends KronoError {
  constructor(segmentId, expectedCrc, actualCrc, offset, details = {}) {
    super(
      `Data corruption in segment ${segmentId} at offset ${offset}: expected CRC 0x${expectedCrc.toString(16)}, got 0x${actualCrc.toString(16)}`,
      'STORAGE_CORRUPTED',
      { segmentId, expectedCrc, actualCrc, offset, ...details }
    );
  }
}

export class SegmentFullError extends KronoError {
  constructor(segmentId, currentBytes, maxBytes) {
    super(
      `Log segment ${segmentId} reached capacity (${currentBytes} / ${maxBytes} bytes)`,
      'SEGMENT_FULL',
      { segmentId, currentBytes, maxBytes }
    );
  }
}

export class DAGCycleError extends KronoError {
  constructor(cycleNodes) {
    super(
      `Cyclic dependency detected in workflow DAG: ${cycleNodes.join(' -> ')}`,
      'DAG_CYCLE_DETECTED',
      { cycleNodes }
    );
  }
}

export class TaskTimeoutError extends KronoError {
  constructor(taskId, timeoutMs) {
    super(
      `Task ${taskId} exceeded execution timeout of ${timeoutMs}ms`,
      'TASK_TIMEOUT',
      { taskId, timeoutMs }
    );
  }
}

export class LeaseExpiredError extends KronoError {
  constructor(leaseKey, holderNodeId) {
    super(
      `Distributed lease for ${leaseKey} held by ${holderNodeId} has expired`,
      'LEASE_EXPIRED',
      { leaseKey, holderNodeId }
    );
  }
}

export class PartitionUnavailableError extends KronoError {
  constructor(topic, partitionId) {
    super(
      `Topic partition ${topic}/${partitionId} is currently unavailable or rebalancing`,
      'PARTITION_UNAVAILABLE',
      { topic, partitionId }
    );
  }
}

export class WireProtocolError extends KronoError {
  constructor(message, frameType, details = {}) {
    super(message, 'WIRE_PROTOCOL_ERROR', { frameType, ...details });
  }
}
