# Krono: Distributed Fault-Tolerant Event Broker & Job Scheduling Platform

Krono is an enterprise-grade distributed event streaming broker and fault-tolerant DAG job scheduling engine engineered with custom Raft consensus, append-only segmented commit logs, LSM-Tree key-value store, SWIM failure detector, sandboxed work-stealing worker pool, and a real-time reactive Web Dashboard.

---

## Installation

To install and set up Krono locally, clone the repository and install the dependencies:

```bash
# Clone the repository
git clone https://github.com/Chandravamsi09/Krono.git
cd Krono

# Install dependencies across all monorepo workspaces
npm install
```

---

## Dependencies

- **Node.js**: `>= 20.0.0`
- **NPM**: `>= 10.0.0`
- **Optional**: Docker & Docker Compose (for containerized cluster execution)

---

## Build

To compile and build all project artifacts and web dashboards:

```bash
# Build the production React 18 dashboard bundle
npm run build --workspace=apps/dashboard

# Or using Makefile
make build
```

---

## Run

To launch Krono in various modes:

### 1. Launch a Single Krono Node
```bash
node apps/server/src/index.js
```

### 2. Launch a 3-Node Local Raft Cluster
```bash
node scripts/cluster.js
```

### 3. Launch the Real-Time Web Dashboard
```bash
npm run dev:dashboard
```
Open `http://localhost:3000` to interact with the live cluster topology canvas and consensus inspector.

### 4. Run Test Suites & Chaos Verification
```bash
# Run all unit tests
npm test

# Run Jepsen-style network partition chaos tests
npm run test:chaos
```

### 5. Run Performance Benchmarks
```bash
node benchmarks/throughput.js
```

---

## Usage

### Event Streaming (Producer & Consumer SDK)
```javascript
import { KronoClient } from '@krono/client';

const client = new KronoClient({ gatewayUrl: 'http://localhost:8080' });

// Produce an event
const producer = client.createProducer();
await producer.send('orders.events', 'order-101', { amount: 250.00, status: 'PAID' });

// Consume events
const consumer = client.createConsumer('orders.events', 0);
const records = await consumer.poll();
console.log('Received records:', records);
```

### Distributed DAG Workflow Scheduling
```javascript
import { KronoClient } from '@krono/client';

const client = new KronoClient();

const workflow = client.workflow('Analytics Pipeline')
  .setPriority(10)
  .addTask({ id: 'extract', command: 'node', args: ['extract.js'], dependsOn: [] })
  .addTask({ id: 'transform', command: 'node', args: ['transform.js'], dependsOn: ['extract'] })
  .addTask({ id: 'load', command: 'node', args: ['load.js'], dependsOn: ['transform'] });

const job = await client.submitWorkflow(workflow);
console.log('Submitted Job ID:', job.jobId);
```

### Distributed Key-Value Store (LSM-Tree)
```javascript
import { KronoClient } from '@krono/client';

const client = new KronoClient();

// Put & Get
await client.kvPut('user:1001', JSON.stringify({ name: 'Alice', role: 'admin' }));
const val = await client.kvGet('user:1001');
console.log('Fetched Value:', val);
```

---

## License
Proprietary. All rights reserved.
