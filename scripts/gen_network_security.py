import os

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

def write_f(rel_path, content):
    p = os.path.join(base_dir, rel_path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(content.strip() + '\n')
    print(f"Generated: {rel_path}")

# =========================================================================
# NETWORK SUB-PACKAGE (@krono/network)
# =========================================================================

write_f('packages/network/package.json', '''{
  "name": "@krono/network",
  "version": "1.0.0",
  "description": "Non-blocking Async Socket Pipeline & Connection Pool for Krono",
  "type": "module",
  "private": true,
  "license": "UNLICENSED",
  "main": "src/index.js",
  "dependencies": {
    "@krono/core": "*"
  }
}
''')

write_f('packages/network/src/socket_pipeline.js', '''/**
 * @file socket_pipeline.js
 * Non-blocking Async Socket Pipeline with backpressure control.
 */

import net from 'node:net';
import { EventEmitter } from 'node:events';

export class SocketPipeline extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.bufferQueue = [];
    this.isPaused = false;

    this.socket.on('data', (chunk) => {
      this.emit('data', chunk);
    });

    this.socket.on('drain', () => {
      this.isPaused = false;
      this.emit('drain');
      this._flushQueue();
    });

    this.socket.on('error', (err) => {
      this.emit('error', err);
    });

    this.socket.on('close', () => {
      this.emit('close');
    });
  }

  write(data) {
    if (this.isPaused) {
      this.bufferQueue.push(data);
      return false;
    }

    const canContinue = this.socket.write(data);
    if (!canContinue) {
      this.isPaused = true;
    }
    return canContinue;
  }

  _flushQueue() {
    while (this.bufferQueue.length > 0 && !this.isPaused) {
      const chunk = this.bufferQueue.shift();
      const canContinue = this.socket.write(chunk);
      if (!canContinue) {
        this.isPaused = true;
        break;
      }
    }
  }

  close() {
    this.socket.destroy();
  }
}
''')

write_f('packages/network/src/connection_pool.js', '''/**
 * @file connection_pool.js
 * Multiplexed Async TCP Socket Connection Pool.
 */

import net from 'node:net';
import { SocketPipeline } from './socket_pipeline.js';

export class ConnectionPool {
  /**
   * @param {Object} options
   * @param {string} options.host
   * @param {number} options.port
   * @param {number} [options.maxConnections=10]
   */
  constructor(options) {
    this.host = options.host;
    this.port = options.port;
    this.maxConnections = options.maxConnections || 10;
    this.pool = [];
    this.inUse = new Set();
  }

  async acquire() {
    if (this.pool.length > 0) {
      const conn = this.pool.pop();
      this.inUse.add(conn);
      return conn;
    }

    if (this.inUse.size < this.maxConnections) {
      const socket = await this._createSocket();
      const pipeline = new SocketPipeline(socket);
      this.inUse.add(pipeline);
      return pipeline;
    }

    // Wait for connection to be released
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.pool.length > 0) {
          clearInterval(checkInterval);
          const conn = this.pool.pop();
          this.inUse.add(conn);
          resolve(conn);
        }
      }, 5);
    });
  }

  release(conn) {
    this.inUse.delete(conn);
    if (this.pool.length < this.maxConnections) {
      this.pool.push(conn);
    } else {
      conn.close();
    }
  }

  _createSocket() {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port }, () => {
        resolve(socket);
      });
      socket.on('error', reject);
    });
  }

  closeAll() {
    for (const c of this.pool) c.close();
    for (const c of this.inUse) c.close();
    this.pool = [];
    this.inUse.clear();
  }
}
''')

write_f('packages/network/src/index.js', '''/**
 * @file index.js
 * Root exports for @krono/network.
 */

export * from './socket_pipeline.js';
export * from './connection_pool.js';
''')

# =========================================================================
# SECURITY SUB-PACKAGE (@krono/security)
# =========================================================================

write_f('packages/security/package.json', '''{
  "name": "@krono/security",
  "version": "1.0.0",
  "description": "mTLS, Cryptographic Key Management & RBAC for Krono",
  "type": "module",
  "private": true,
  "license": "UNLICENSED",
  "main": "src/index.js",
  "dependencies": {
    "@krono/core": "*"
  }
}
''')

write_f('packages/security/src/rbac_engine.js', '''/**
 * @file rbac_engine.js
 * Role-Based Access Control (RBAC) & Policy Evaluation Engine.
 */

export const Permission = {
  TOPIC_CREATE: 'topic:create',
  TOPIC_PRODUCE: 'topic:produce',
  TOPIC_CONSUME: 'topic:consume',
  TOPIC_DELETE: 'topic:delete',
  JOB_SUBMIT: 'job:submit',
  JOB_CANCEL: 'job:cancel',
  KV_READ: 'kv:read',
  KV_WRITE: 'kv:write',
  CLUSTER_ADMIN: 'cluster:admin'
};

export class RbacEngine {
  constructor() {
    /** @type {Map<string, Set<string>>} Role -> Set of Permissions */
    this.rolePermissions = new Map();

    // Default system roles
    this.defineRole('admin', Object.values(Permission));
    this.defineRole('producer', [Permission.TOPIC_PRODUCE, Permission.KV_WRITE]);
    this.defineRole('consumer', [Permission.TOPIC_CONSUME, Permission.KV_READ]);
    this.defineRole('operator', [
      Permission.TOPIC_PRODUCE, Permission.TOPIC_CONSUME,
      Permission.JOB_SUBMIT, Permission.JOB_CANCEL,
      Permission.KV_READ, Permission.KV_WRITE
    ]);
  }

  defineRole(roleName, permissions) {
    this.rolePermissions.set(roleName, new Set(permissions));
  }

  isAuthorized(role, permission) {
    const perms = this.rolePermissions.get(role);
    if (!perms) return false;
    return perms.has(permission) || perms.has(Permission.CLUSTER_ADMIN);
  }
}
''')

write_f('packages/security/src/kms_key_manager.js', '''/**
 * @file kms_key_manager.js
 * Cryptographic Key Management & Envelope Encryption for Data at Rest.
 */

import crypto from 'node:crypto';
import { CryptoUtils } from '@krono/core';

export class KeyManagementService {
  /**
   * @param {Buffer} [masterKey] 32-byte master encryption key
   */
  constructor(masterKey = null) {
    this.masterKey = masterKey || crypto.randomBytes(32);
    /** @type {Map<string, { encryptedDataKey: Buffer, iv: Buffer }>} */
    this.keyRegistry = new Map();
  }

  generateDataKey(keyId) {
    const dataKey = crypto.randomBytes(32);
    const encrypted = CryptoUtils.encryptAesGcm(dataKey, this.masterKey);
    this.keyRegistry.set(keyId, { encryptedDataKey: encrypted });
    return dataKey;
  }

  getDataKey(keyId) {
    const record = this.keyRegistry.get(keyId);
    if (!record) throw new Error(`Data key ${keyId} not found in KMS`);
    return CryptoUtils.decryptAesGcm(record.encryptedDataKey, this.masterKey);
  }
}
''')

write_f('packages/security/src/index.js', '''/**
 * @file index.js
 * Root exports for @krono/security.
 */

export * from './rbac_engine.js';
export * from './kms_key_manager.js';
''')

print("Network and Security packages generated successfully.")
''')

write_code = True
print("Created gen_network_security.py")
