/**
 * @file gateway.test.js
 * Unit and HTTP API tests for @krono/gateway:
 * Auth, RateLimiter, and REST API routes.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

import { AuthManager, RateLimiter, RestServer, Roles } from '../src/index.js';

describe('Auth & Rate Limiting', () => {
  it('should generate and validate multi-tenant HMAC API keys', () => {
    const auth = new AuthManager({ secret: 'test-secret' });
    const key = auth.generateApiKey('tenant-alpha', Roles.PRODUCER);

    assert.ok(key.startsWith('kr_tenant-alpha_'));

    const validation = auth.validateApiKey(key);
    assert.ok(validation);
    assert.equal(validation.tenantId, 'tenant-alpha');
    assert.equal(validation.role, Roles.PRODUCER);

    assert.equal(auth.validateApiKey('invalid-key'), null);
  });

  it('should throttle requests once token capacity is exhausted', () => {
    const limiter = new RateLimiter({ capacity: 3, refillRatePerSec: 1 });

    assert.equal(limiter.tryConsume('client-1'), true);
    assert.equal(limiter.tryConsume('client-1'), true);
    assert.equal(limiter.tryConsume('client-1'), true);
    assert.equal(limiter.tryConsume('client-1'), false); // Exhausted
  });
});

describe('REST Server API Endpoints', () => {
  let server;
  const port = 9182;

  before(async () => {
    server = new RestServer({
      port,
      engine: {
        cluster: { getClusterTopology: () => ({ members: [] }) },
        raft: { nodeId: 'test-node', role: 'LEADER', currentTerm: 1, commitIndex: 10, leaderId: 'test-node' }
      }
    });
    await server.start();
  });

  after(async () => {
    if (server) await server.stop();
  });

  it('should respond to GET /health', async () => {
    const res = await fetch(`http://localhost:${port}/health`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.status, 'UP');
  });

  it('should respond to GET /api/v1/cluster/status', async () => {
    const res = await fetch(`http://localhost:${port}/api/v1/cluster/status`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.raft.nodeId, 'test-node');
    assert.equal(data.raft.role, 'LEADER');
  });
});
