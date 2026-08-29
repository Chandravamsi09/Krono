# Krono API Reference & Protocol Specification

## Wire Protocol Framing Format
```
+-------------------------------------------------------------------------------+
| Magic (4B) | Ver (1B) | Flags (1B) | Type (2B) | CorrID (8B) | PayloadLen (4B)|
+-------------------------------------------------------------------------------+
| Header CRC32 (4B) | Payload (NB) ...                      | Payload CRC32 (4B)|
+-------------------------------------------------------------------------------+
```

## REST API Endpoints

### 1. Cluster Health & Topology
- **`GET /health`**
  - Response: `200 OK` `{ "status": "UP", "timestamp": 1724976000000 }`
- **`GET /api/v1/cluster/status`**
  - Response: `200 OK` `{ "topology": { ... }, "raft": { "role": "LEADER", "term": 12 } }`

### 2. Distributed Key-Value Store (LSM-Tree)
- **`GET /api/v1/kv/:key`**
  - Returns value of key or 404 if absent.
- **`PUT /api/v1/kv/:key`**
  - Body: `{ "value": "my-data-payload" }`
  - Replicates key-value write through consensus.
- **`DELETE /api/v1/kv/:key`**
  - Appends tombstone to LSM MemTable.

### 3. Event Streaming
- **`POST /api/v1/topics/:topic/produce`**
  - Body: `{ "partition": 0, "records": [{ "key": "k1", "value": "v1" }] }`
  - Appends batch to topic partition segmented log.
- **`GET /api/v1/topics/:topic/partitions/:partition/fetch?offset=0&maxBytes=1048576`**
  - Streams records starting from offset.

### 4. DAG Workflow Submissions
- **`POST /api/v1/jobs/submit`**
  - Body:
    ```json
    {
      "name": "ETL Pipeline",
      "priority": 10,
      "tasks": [
        { "id": "extract", "command": "node", "args": ["extract.js"], "dependsOn": [] },
        { "id": "transform", "command": "node", "args": ["transform.js"], "dependsOn": ["extract"] }
      ]
    }
    ```
