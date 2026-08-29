/**
 * @file rest_server.js
 * Native HTTP/JSON REST API Server for Krono Distributed Engine.
 */

import http from 'node:http';
import { AuthManager } from './auth.js';
import { RateLimiter } from './rate_limiter.js';
import { WebSocketHub } from './websocket_hub.js';
import { defaultLogger } from '@krono/core';

export class RestServer {
  /**
   * @param {Object} options
   * @param {number} [options.port=8080]
   * @param {Object} options.engine References to core cluster components
   * @param {Object} [options.logger]
   */
  constructor(options) {
    this.port = options.port || 8080;
    this.engine = options.engine;
    this.logger = (options.logger || defaultLogger).child('gateway');

    this.auth = new AuthManager();
    this.rateLimiter = new RateLimiter();
    this.wsHub = new WebSocketHub();

    this.server = http.createServer((req, res) => this._handleRequest(req, res));
  }

  start() {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        this.logger.info(`REST API Gateway running on port ${this.port}`);
        resolve();
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      this.server.close(resolve);
    });
  }

  async _handleRequest(req, res) {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url, `http://localhost:${this.port}`);
    const pathname = url.pathname;

    try {
      if (pathname === '/health' && req.method === 'GET') {
        this._sendJson(res, 200, { status: 'UP', timestamp: Date.now() });
        return;
      }

      if (pathname === '/api/v1/cluster/status' && req.method === 'GET') {
        const topology = this.engine.cluster ? this.engine.cluster.getClusterTopology() : {};
        const raft = this.engine.raft ? {
          nodeId: this.engine.raft.nodeId,
          role: this.engine.raft.role,
          term: this.engine.raft.currentTerm,
          commitIndex: this.engine.raft.commitIndex,
          leaderId: this.engine.raft.leaderId
        } : {};

        this._sendJson(res, 200, { topology, raft });
        return;
      }

      // KV Store Routes: /api/v1/kv/:key
      if (pathname.startsWith('/api/v1/kv/') && this.engine.lsm) {
        const key = pathname.replace('/api/v1/kv/', '');

        if (req.method === 'GET') {
          const val = this.engine.lsm.get(key);
          if (val === null || val === undefined) {
            this._sendJson(res, 404, { error: `Key ${key} not found` });
          } else {
            this._sendJson(res, 200, { key, value: val.toString() });
          }
          return;
        }

        if (req.method === 'PUT') {
          const body = await this._readBodyJson(req);
          this.engine.lsm.put(key, body.value);
          this._sendJson(res, 200, { key, success: true });
          return;
        }

        if (req.method === 'DELETE') {
          this.engine.lsm.delete(key);
          this._sendJson(res, 200, { key, deleted: true });
          return;
        }
      }

      // Jobs Route: /api/v1/jobs/submit
      if (pathname === '/api/v1/jobs/submit' && req.method === 'POST' && this.engine.scheduler) {
        const body = await this._readBodyJson(req);
        const wf = this.engine.scheduler.submitWorkflow(body);
        this._sendJson(res, 201, { jobId: wf.jobId, state: wf.state });
        return;
      }

      // Topics Route: /api/v1/topics/:topic/produce
      const produceMatch = pathname.match(/^\/api\/v1\/topics\/([^/]+)\/produce$/);
      if (produceMatch && req.method === 'POST' && this.engine.storage) {
        const topic = produceMatch[1];
        const body = await this._readBodyJson(req);
        const partition = body.partition ?? 0;
        const result = this.engine.storage.appendBatch(topic, partition, body.records || []);
        this._sendJson(res, 200, { topic, partition, ...result });
        return;
      }

      this._sendJson(res, 404, { error: 'Route not found' });
    } catch (err) {
      this.logger.error('API Error', { error: err.message, path: pathname });
      this._sendJson(res, 500, { error: err.message });
    }
  }

  _sendJson(res, statusCode, data) {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  _readBodyJson(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(new Error('Invalid JSON body'));
        }
      });
      req.on('error', reject);
    });
  }
}
