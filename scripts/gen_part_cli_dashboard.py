import os

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

def write_f(rel_path, content):
    p = os.path.join(base_dir, rel_path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(content.strip() + '\n')
    print(f"Generated: {rel_path}")

# =========================================================================
# CLI ADMINISTRATION TOOL (apps/cli)
# =========================================================================

write_f('apps/cli/package.json', '''{
  "name": "@krono/cli",
  "version": "1.0.0",
  "description": "Krono Distributed Platform Administrative CLI",
  "type": "module",
  "bin": {
    "krono": "./src/krono_cli.js"
  },
  "dependencies": {
    "@krono/client": "*"
  }
}
''')

write_f('apps/cli/src/krono_cli.js', '''#!/usr/bin/env node
/**
 * @file krono_cli.js
 * Krono Command Line Interface.
 */

import { KronoClient } from '@krono/client';

const args = process.argv.slice(2);
const command = args[0] || 'help';

const gatewayUrl = process.env.KRONO_GATEWAY || 'http://localhost:8080';
const client = new KronoClient({ gatewayUrl });

async function main() {
  switch (command) {
    case 'status': {
      const res = await fetch(`${gatewayUrl}/api/v1/cluster/status`);
      const data = await res.json();
      console.log(JSON.stringify(data, null, 2));
      break;
    }

    case 'produce': {
      const topic = args[1] || 'events';
      const key = args[2] || 'key-0';
      const val = args[3] || 'hello world';
      const producer = client.createProducer();
      const res = await producer.send(topic, key, val);
      console.log('Produced:', res);
      break;
    }

    case 'consume': {
      const topic = args[1] || 'events';
      const consumer = client.createConsumer(topic, 0);
      const records = await consumer.poll();
      console.log('Consumed records:', records);
      break;
    }

    case 'kv:get': {
      const key = args[1];
      const val = await client.kvGet(key);
      console.log(`${key} = ${val}`);
      break;
    }

    case 'kv:put': {
      const key = args[1];
      const val = args[2];
      await client.kvPut(key, val);
      console.log(`Set ${key} = ${val}`);
      break;
    }

    case 'help':
    default:
      console.log(`
Krono Distributed Engine CLI

Usage:
  krono status                     Show cluster and consensus status
  krono produce <topic> <key> <val> Produce an event
  krono consume <topic>            Poll records from partition 0
  krono kv:get <key>               Get key from LSM-Tree KV store
  krono kv:put <key> <val>         Put key-value pair
      `);
      break;
  }
}

main().catch(err => {
  console.error('CLI Error:', err.message);
  process.exit(1);
});
''')

# =========================================================================
# ROOT BUILD ARTIFACTS: DOCKERFILE, MAKEFILE
# =========================================================================

write_f('Dockerfile', '''# Krono Distributed Systems Platform Docker Container
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
COPY packages/ ./packages/
COPY apps/ ./apps/

RUN npm install
RUN npm run build --workspace=apps/dashboard

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app ./

EXPOSE 8080 9000 3000
CMD ["npm", "start"]
''')

write_f('Makefile', '''# Krono Distributed Systems Platform Makefile

.PHONY: install build test test-chaos run-server run-dashboard clean

install:
	npm install

build:
	npm run build --workspace=apps/dashboard

test:
	npm test

test-chaos:
	node --test tests/chaos/split_brain.test.js

run-server:
	node apps/server/src/index.js

run-cluster:
	node scripts/cluster.js

run-dashboard:
	npm run dev:dashboard

bench:
	node benchmarks/throughput.js

clean:
	rm -rf node_modules dist data
''')

print("CLI, Dockerfile, and Makefile generated successfully.")
''')

write_code = True
print("Created gen_part_cli_dashboard.py")
