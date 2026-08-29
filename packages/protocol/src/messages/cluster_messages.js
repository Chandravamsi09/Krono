/**
 * @file cluster_messages.js
 * Serializers & deserializers for SWIM Gossip protocol and distributed leases.
 */

import { ByteBuffer } from '@krono/core';

export const NodeStatus = {
  ALIVE: 0x01,
  SUSPECT: 0x02,
  DEAD: 0x03,
  LEFT: 0x04
};

export class NodeState {
  constructor({ nodeId, address, port, status = NodeStatus.ALIVE, incarnation = 0, metadata = {} }) {
    this.nodeId = nodeId;
    this.address = address;
    this.port = port;
    this.status = status;
    this.incarnation = incarnation;
    this.metadata = metadata;
  }

  encode(bb = ByteBuffer.allocate()) {
    bb.writeString(this.nodeId);
    bb.writeString(this.address);
    bb.writeUInt16BE(this.port);
    bb.writeUInt8(this.status);
    bb.writeVarint(this.incarnation);
    bb.writeString(JSON.stringify(this.metadata));
    return bb;
  }

  static decode(bb) {
    const nodeId = bb.readString();
    const address = bb.readString();
    const port = bb.readUInt16BE();
    const status = bb.readUInt8();
    const incarnation = bb.readVarint();
    const metadataRaw = bb.readString();
    const metadata = metadataRaw ? JSON.parse(metadataRaw) : {};
    return new NodeState({ nodeId, address, port, status, incarnation, metadata });
  }
}

export class GossipPayload {
  constructor({ senderId, updates = [] }) {
    this.senderId = senderId;
    this.updates = updates;
  }

  encode() {
    const bb = ByteBuffer.allocate();
    bb.writeString(this.senderId);
    bb.writeVarint(this.updates.length);
    for (const update of this.updates) {
      update.encode(bb);
    }
    return bb.toBuffer();
  }

  static decode(buf) {
    const bb = ByteBuffer.from(buf);
    const senderId = bb.readString();
    const count = bb.readVarint();
    const updates = [];
    for (let i = 0; i < count; i++) {
      updates.push(NodeState.decode(bb));
    }
    return new GossipPayload({ senderId, updates });
  }
}

export class LeaseAcquireArgs {
  constructor({ leaseKey, holderNodeId, ttlMs, epoch = 0 }) {
    this.leaseKey = leaseKey;
    this.holderNodeId = holderNodeId;
    this.ttlMs = ttlMs;
    this.epoch = epoch;
  }

  encode() {
    const bb = ByteBuffer.allocate();
    bb.writeString(this.leaseKey);
    bb.writeString(this.holderNodeId);
    bb.writeVarint(this.ttlMs);
    bb.writeVarint(this.epoch);
    return bb.toBuffer();
  }

  static decode(buf) {
    const bb = ByteBuffer.from(buf);
    const leaseKey = bb.readString();
    const holderNodeId = bb.readString();
    const ttlMs = bb.readVarint();
    const epoch = bb.readVarint();
    return new LeaseAcquireArgs({ leaseKey, holderNodeId, ttlMs, epoch });
  }
}

export class LeaseGrantResult {
  constructor({ granted, leaseKey, holderNodeId, expiresAt, epoch, fencingToken }) {
    this.granted = Boolean(granted);
    this.leaseKey = leaseKey;
    this.holderNodeId = holderNodeId;
    this.expiresAt = expiresAt;
    this.epoch = epoch;
    this.fencingToken = fencingToken;
  }

  encode() {
    const bb = ByteBuffer.allocate();
    bb.writeUInt8(this.granted ? 1 : 0);
    bb.writeString(this.leaseKey);
    bb.writeString(this.holderNodeId);
    bb.writeDoubleBE(this.expiresAt);
    bb.writeVarint(this.epoch);
    bb.writeVarint64(this.fencingToken);
    return bb.toBuffer();
  }

  static decode(buf) {
    const bb = ByteBuffer.from(buf);
    const granted = bb.readUInt8() === 1;
    const leaseKey = bb.readString();
    const holderNodeId = bb.readString();
    const expiresAt = bb.readDoubleBE();
    const epoch = bb.readVarint();
    const fencingToken = bb.readVarint64();
    return new LeaseGrantResult({ granted, leaseKey, holderNodeId, expiresAt, epoch, fencingToken });
  }
}
