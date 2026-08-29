/**
 * @file swim_detector.js
 * SWIM (Structured Weakly-Consistent Infection-Style Process Group Membership Protocol)
 * failure detector with indirect ping-req and configurable suspicion timers.
 */

import { EventEmitter } from 'node:events';
import { NodeStatus, NodeState, GossipPayload } from '@krono/protocol';
import { defaultLogger } from '@krono/core';

export class SWIMFailureDetector extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} options.localNodeId Local node identifier
   * @param {string} [options.localAddress='127.0.0.1']
   * @param {number} [options.localPort=9000]
   * @param {number} [options.pingIntervalMs=100] Periodic probe period
   * @param {number} [options.pingTimeoutMs=40] Probe timeout before ping-req
   * @param {number} [options.suspicionTimeoutMs=150] Suspicion decay timeout before marking dead
   * @param {number} [options.indirectPingCount=3] Number of random helper nodes for indirect ping
   * @param {Function} [options.transport] (targetNodeId, messageType, payload) => Promise<response>
   * @param {Object} [options.logger]
   */
  constructor(options) {
    super();
    this.localNodeId = options.localNodeId;
    this.localAddress = options.localAddress || '127.0.0.1';
    this.localPort = options.localPort || 9000;
    this.pingIntervalMs = options.pingIntervalMs ?? 100;
    this.pingTimeoutMs = options.pingTimeoutMs ?? 40;
    this.suspicionTimeoutMs = options.suspicionTimeoutMs ?? 150;
    this.indirectPingCount = options.indirectPingCount ?? 3;
    this.transport = options.transport || (async () => { throw new Error('No transport configured'); });
    this.logger = (options.logger || defaultLogger).child(`swim:${this.localNodeId}`);

    /** @type {Map<string, { state: NodeState, suspicionTimer: any, lastSeen: number }>} */
    this.members = new Map();
    this.localIncarnation = 0;

    this.probeTimer = null;
    this.probeIndex = 0;
    this.isRunning = false;

    // Register self as ALIVE
    this.members.set(this.localNodeId, {
      state: new NodeState({
        nodeId: this.localNodeId,
        address: this.localAddress,
        port: this.localPort,
        status: NodeStatus.ALIVE,
        incarnation: 0
      }),
      suspicionTimer: null,
      lastSeen: Date.now()
    });
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this._startProbeLoop();
  }

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.probeTimer) {
      clearInterval(this.probeTimer);
      this.probeTimer = null;
    }
    for (const m of this.members.values()) {
      if (m.suspicionTimer) clearTimeout(m.suspicionTimer);
    }
  }

  addMember(nodeId, address = '127.0.0.1', port = 9000) {
    if (!this.members.has(nodeId)) {
      const state = new NodeState({
        nodeId,
        address,
        port,
        status: NodeStatus.ALIVE,
        incarnation: 0
      });
      this.members.set(nodeId, {
        state,
        suspicionTimer: null,
        lastSeen: Date.now()
      });
      this.emit('nodeAlive', state);
    }
  }

  getAliveMembers() {
    const list = [];
    for (const m of this.members.values()) {
      if (m.state.status === NodeStatus.ALIVE) {
        list.push(m.state);
      }
    }
    return list;
  }

  _startProbeLoop() {
    this.probeTimer = setInterval(() => {
      this._probeNextMember();
    }, this.pingIntervalMs);
  }

  async _probeNextMember() {
    const candidateMembers = Array.from(this.members.values()).filter(
      (m) => m.state.nodeId !== this.localNodeId && m.state.status !== NodeStatus.DEAD
    );

    if (candidateMembers.length === 0) return;

    this.probeIndex = (this.probeIndex + 1) % candidateMembers.length;
    const target = candidateMembers[this.probeIndex];

    // 1. Direct Ping
    try {
      const directAck = await Promise.race([
        this.transport(target.state.nodeId, 'PING', { from: this.localNodeId }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('PING_TIMEOUT')), this.pingTimeoutMs))
      ]);

      if (directAck) {
        this._markAlive(target.state.nodeId, target.state.incarnation);
        return;
      }
    } catch (err) {
      // Direct ping failed, attempt indirect ping-req
      await this._indirectPing(target, candidateMembers);
    }
  }

  async _indirectPing(target, allCandidates) {
    const helpers = allCandidates
      .filter((m) => m.state.nodeId !== target.state.nodeId && m.state.status === NodeStatus.ALIVE)
      .sort(() => Math.random() - 0.5)
      .slice(0, this.indirectPingCount);

    if (helpers.length === 0) {
      this._markSuspect(target.state.nodeId, target.state.incarnation);
      return;
    }

    let acked = false;
    const helperPromises = helpers.map(async (helper) => {
      try {
        const res = await this.transport(helper.state.nodeId, 'PING_REQ', {
          targetNodeId: target.state.nodeId,
          from: this.localNodeId
        });
        if (res && res.success) acked = true;
      } catch (e) {}
    });

    await Promise.all(helperPromises);

    if (acked) {
      this._markAlive(target.state.nodeId, target.state.incarnation);
    } else {
      this._markSuspect(target.state.nodeId, target.state.incarnation);
    }
  }

  _markAlive(nodeId, incarnation) {
    const member = this.members.get(nodeId);
    if (!member) return;

    if (member.suspicionTimer) {
      clearTimeout(member.suspicionTimer);
      member.suspicionTimer = null;
    }

    if (member.state.status !== NodeStatus.ALIVE || incarnation > member.state.incarnation) {
      member.state.status = NodeStatus.ALIVE;
      member.state.incarnation = Math.max(member.state.incarnation, incarnation);
      member.lastSeen = Date.now();
      this.emit('nodeAlive', member.state);
    }
  }

  _markSuspect(nodeId, incarnation) {
    const member = this.members.get(nodeId);
    if (!member || member.state.status === NodeStatus.DEAD) return;

    if (member.state.status === NodeStatus.ALIVE && incarnation >= member.state.incarnation) {
      member.state.status = NodeStatus.SUSPECT;
      this.emit('nodeSuspect', member.state);

      // Start suspicion decay timer
      if (member.suspicionTimer) clearTimeout(member.suspicionTimer);
      member.suspicionTimer = setTimeout(() => {
        if (member.state.status === NodeStatus.SUSPECT) {
          this._markDead(nodeId, incarnation);
        }
      }, this.suspicionTimeoutMs);
    }
  }

  _markDead(nodeId, incarnation) {
    const member = this.members.get(nodeId);
    if (!member) return;

    if (member.suspicionTimer) {
      clearTimeout(member.suspicionTimer);
      member.suspicionTimer = null;
    }

    if (member.state.status !== NodeStatus.DEAD) {
      member.state.status = NodeStatus.DEAD;
      this.logger.warn('Node declared DEAD by SWIM failure detector', { nodeId });
      this.emit('nodeDead', member.state);
    }
  }

  /**
   * Applies incoming Gossip payload updates.
   * @param {GossipPayload} payload
   */
  handleGossip(payload) {
    for (const update of payload.updates) {
      // If someone claims self is SUSPECT or DEAD, refute by incrementing incarnation and declaring ALIVE
      if (update.nodeId === this.localNodeId) {
        if (update.status !== NodeStatus.ALIVE && update.incarnation >= this.localIncarnation) {
          this.localIncarnation = update.incarnation + 1;
          const self = this.members.get(this.localNodeId);
          self.state.incarnation = this.localIncarnation;
          self.state.status = NodeStatus.ALIVE;
          this.emit('nodeAlive', self.state);
        }
        continue;
      }

      const existing = this.members.get(update.nodeId);
      if (!existing) {
        if (update.status !== NodeStatus.DEAD) {
          this.members.set(update.nodeId, {
            state: update,
            suspicionTimer: null,
            lastSeen: Date.now()
          });
          if (update.status === NodeStatus.ALIVE) this.emit('nodeAlive', update);
          else if (update.status === NodeStatus.SUSPECT) this._markSuspect(update.nodeId, update.incarnation);
        }
      } else {
        if (update.incarnation > existing.state.incarnation) {
          if (update.status === NodeStatus.ALIVE) this._markAlive(update.nodeId, update.incarnation);
          else if (update.status === NodeStatus.SUSPECT) this._markSuspect(update.nodeId, update.incarnation);
          else if (update.status === NodeStatus.DEAD) this._markDead(update.nodeId, update.incarnation);
        }
      }
    }
  }
}
