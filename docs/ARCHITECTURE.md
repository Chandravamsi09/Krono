# Krono Distributed Systems Platform: Architecture Whitepaper

## Executive Summary
**Krono** is a distributed event broker and fault-tolerant DAG job scheduling engine engineered for high-throughput, low-latency, and partition-resilient operation across modern multi-core, multi-node cloud environments.

---

## Subsystem Deep-Dive

### 1. Consensus Plane (Raft Consensus Subsystem)
- **State Machine Safety**: Krono implements the complete Raft consensus protocol, guaranteeing state machine safety across arbitrary node failures up to $\lfloor \frac{N-1}{2} \rfloor$.
- **Pre-Vote Protocol**: To prevent network-partitioned nodes from disrupting cluster stability upon reconnection with inflated terms, candidates must achieve a Pre-Vote majority before incrementing their term.
- **Log Compaction & Snapshots**: In-memory state machine state is periodically snapshotted with 32-bit CRC verification and streamed via chunked RPC to lagging followers.
- **Dynamic Membership**: Cluster reconfiguration utilizes Joint Consensus ($C_{old} \to C_{old,new} \to C_{new}$), requiring dual-majority approval to ensure zero-downtime cluster scaling.

### 2. Storage & Log Subsystem
- **Segmented Append-Only WAL**: Monotonically indexed binary commit logs with zero-copy I/O.
- **Sparse Indexing**: 16-byte memory-mapped index records enable $O(\log N)$ point lookups across gigabyte-scale log segments.
- **LSM-Tree Key-Value Store**:
  - SkipList MemTable with lock-free concurrent navigation.
  - Multi-level SSTables with leveled compaction and tombstone pruning.
  - Kirsch-Mitzenmacher double-hashed Bloom Filters for $O(1)$ negative key rejection.

### 3. Cluster Membership & Coordination
- **SWIM Protocol**: Gossip-based failure detection utilizing direct pinging, indirect $k$-node `ping-req` routing, and exponential suspicion decay.
- **Consistent Hashing Ring**: 128 virtual nodes per physical host on a 32-bit CRC ring ensuring minimal data migration on topology rebalancing.
- **Epoch Fencing Leases**: Distributed task leases guarded by monotonic fencing tokens to eliminate dual-primary anomalies.

### 4. DAG Workflow & Execution Engine
- **Kahn's Topological Algorithm**: Graph cycle validation and parallel execution stage grouping.
- **Saga Compensation**: Forward transactional step execution with automatic reverse rollback on step failure.
- **Chase-Lev Work-Stealing**: Local worker thread pools utilize lock-free Chase-Lev deques (LIFO local pops for CPU cache locality, FIFO steals for idle peer cores).
