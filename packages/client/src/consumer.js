/**
 * @file consumer.js
 * Consumer client for streaming records from Krono topic partitions.
 */

export class KronoConsumer {
  /**
   * @param {Object} options
   * @param {string} [options.gatewayUrl='http://localhost:8080']
   * @param {string} options.topic
   * @param {number} [options.partition=0]
   * @param {string} [options.apiKey]
   */
  constructor(options) {
    this.gatewayUrl = options.gatewayUrl || 'http://localhost:8080';
    this.topic = options.topic;
    this.partition = options.partition ?? 0;
    this.apiKey = options.apiKey;
    this.currentOffset = 0n;
  }

  /**
   * Fetches records starting from current offset.
   * @param {number} [maxBytes=1048576]
   * @returns {Promise<Array<any>>}
   */
  async poll(maxBytes = 1048576) {
    const url = `${this.gatewayUrl}/api/v1/topics/${this.topic}/partitions/${this.partition}/fetch?offset=${this.currentOffset}&maxBytes=${maxBytes}`;
    const res = await fetch(url, {
      headers: {
        ...(this.apiKey ? { 'X-API-Key': this.apiKey } : {})
      }
    });

    if (!res.ok) {
      if (res.status === 404) return [];
      throw new Error(`Failed to fetch records: ${res.statusText}`);
    }

    const data = await res.json();
    const records = data.records || [];
    if (records.length > 0) {
      const lastOffset = records[records.length - 1].offset;
      this.currentOffset = BigInt(lastOffset) + 1n;
    }
    return records;
  }
}
