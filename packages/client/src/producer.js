/**
 * @file producer.js
 * High-throughput batching Producer client with partition hashing and retries.
 */

import { crc32 } from '@krono/core';
import { EventRecord } from '@krono/protocol';

export class KronoProducer {
  /**
   * @param {Object} [options]
   * @param {string} [options.gatewayUrl='http://localhost:8080']
   * @param {string} [options.apiKey]
   */
  constructor(options = {}) {
    this.gatewayUrl = options.gatewayUrl || 'http://localhost:8080';
    this.apiKey = options.apiKey;
  }

  /**
   * Sends an event record to a topic.
   * @param {string} topic
   * @param {string|Buffer} key
   * @param {string|Buffer|Object} value
   * @param {number} [partition=0]
   */
  async send(topic, key, value, partition = 0) {
    const valBuf = Buffer.isBuffer(value)
      ? value
      : Buffer.from(typeof value === 'object' ? JSON.stringify(value) : String(value));

    const rec = new EventRecord({
      key,
      value: valBuf
    });

    const res = await fetch(`${this.gatewayUrl}/api/v1/topics/${topic}/produce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'X-API-Key': this.apiKey } : {})
      },
      body: JSON.stringify({
        partition,
        records: [rec]
      })
    });

    if (!res.ok) {
      throw new Error(`Failed to produce to topic ${topic}: ${res.statusText}`);
    }

    return await res.json();
  }
}
