/**
 * @file auth.js
 * Multi-tenant authentication and Role-Based Access Control (RBAC).
 */

import crypto from 'node:crypto';

export const Roles = {
  ADMIN: 'admin',
  PRODUCER: 'producer',
  CONSUMER: 'consumer',
  OPERATOR: 'operator'
};

export class AuthManager {
  /**
   * @param {Object} [options]
   * @param {string} [options.secret='krono-cluster-default-secret-key-32b']
   */
  constructor(options = {}) {
    this.secret = options.secret || 'krono-cluster-default-secret-key-32b';
    /** @type {Map<string, { tenantId: string, role: string, keyHash: string }>} */
    this.apiKeys = new Map();
  }

  generateApiKey(tenantId, role = Roles.ADMIN) {
    const rawKey = `kr_${tenantId}_${crypto.randomBytes(16).toString('hex')}`;
    const hash = crypto.createHmac('sha256', this.secret).update(rawKey).digest('hex');
    this.apiKeys.set(rawKey, { tenantId, role, keyHash: hash });
    return rawKey;
  }

  validateApiKey(rawKey) {
    if (!rawKey) return null;
    const item = this.apiKeys.get(rawKey);
    if (!item) return null;
    const computed = crypto.createHmac('sha256', this.secret).update(rawKey).digest('hex');
    return computed === item.keyHash ? { tenantId: item.tenantId, role: item.role } : null;
  }
}
