/**
 * @file krono_client.js
 * Unified Krono Client SDK providing access to Key-Value store,
 * Event Streaming Producer/Consumer, and DAG Workflow execution.
 */

import { KronoProducer } from './producer.js';
import { KronoConsumer } from './consumer.js';
import { WorkflowBuilder } from './workflow_builder.js';

export class KronoClient {
  /**
   * @param {Object} [options]
   * @param {string} [options.gatewayUrl='http://localhost:8080']
   * @param {string} [options.apiKey]
   */
  constructor(options = {}) {
    this.gatewayUrl = options.gatewayUrl || 'http://localhost:8080';
    this.apiKey = options.apiKey;
  }

  createProducer() {
    return new KronoProducer({ gatewayUrl: this.gatewayUrl, apiKey: this.apiKey });
  }

  createConsumer(topic, partition = 0) {
    return new KronoConsumer({ gatewayUrl: this.gatewayUrl, topic, partition, apiKey: this.apiKey });
  }

  workflow(name) {
    return new WorkflowBuilder(name);
  }

  async submitWorkflow(workflowSpec) {
    const spec = workflowSpec instanceof WorkflowBuilder ? workflowSpec.build() : workflowSpec;
    const res = await fetch(`${this.gatewayUrl}/api/v1/jobs/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'X-API-Key': this.apiKey } : {})
      },
      body: JSON.stringify(spec)
    });

    if (!res.ok) {
      throw new Error(`Failed to submit workflow: ${res.statusText}`);
    }

    return await res.json();
  }

  // Key-Value operations
  async kvGet(key) {
    const res = await fetch(`${this.gatewayUrl}/api/v1/kv/${encodeURIComponent(key)}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`KV Get failed: ${res.statusText}`);
    const data = await res.json();
    return data.value;
  }

  async kvPut(key, value) {
    const res = await fetch(`${this.gatewayUrl}/api/v1/kv/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    });
    if (!res.ok) throw new Error(`KV Put failed: ${res.statusText}`);
    return await res.json();
  }

  async kvDelete(key) {
    const res = await fetch(`${this.gatewayUrl}/api/v1/kv/${encodeURIComponent(key)}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error(`KV Delete failed: ${res.statusText}`);
    return await res.json();
  }
}
