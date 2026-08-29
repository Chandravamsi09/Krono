/**
 * @file websocket_hub.js
 * Native WebSocket telemetry hub broadcasting cluster telemetry,
 * Raft metrics, DAG state changes, and live logs.
 */

import { EventEmitter } from 'node:events';

export class WebSocketHub extends EventEmitter {
  constructor() {
    super();
    /** @type {Set<any>} Active client sockets */
    this.clients = new Set();
  }

  addClient(clientSocket) {
    this.clients.add(clientSocket);
    clientSocket.on('close', () => {
      this.clients.delete(clientSocket);
    });
  }

  broadcast(topic, payload) {
    const message = JSON.stringify({
      topic,
      payload,
      timestamp: Date.now()
    });

    for (const client of this.clients) {
      try {
        if (typeof client.send === 'function') {
          client.send(message);
        }
      } catch (err) {
        this.clients.delete(client);
      }
    }
  }

  get clientCount() {
    return this.clients.size;
  }
}
