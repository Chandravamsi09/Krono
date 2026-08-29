/**
 * @file index.js
 * Executable entrypoint for Krono Server Daemon.
 */

import { loadConfig } from './config.js';
import { KronoServer } from './server.js';

const config = loadConfig();
const server = new KronoServer(config);

server.start().catch((err) => {
  console.error('Fatal error starting Krono server:', err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await server.stop();
  process.exit(0);
});
