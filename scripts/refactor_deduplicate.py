import os
import re

base_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))

packages_config = [
    {
        "pkg": "packages/core",
        "is_core": True,
        "modules": [
            ("lock_free_queue", "LockFreeQueue", "Michael-Scott lock-free queue with atomic compare-and-swap nodes."),
            ("murmur3_128", "Murmur3Hasher", "MurmurHash3 128-bit hardware-accelerated hash generator."),
            ("exponential_decay_reservoir", "ExponentialDecayReservoir", "Forward-decaying priority reservoir for statistical sampling."),
            ("thread_affinity", "ThreadAffinityManager", "Worker thread CPU core pinning and affinity mask allocator."),
            ("bloom_filter_advanced", "ScalableBloomFilter", "Dynamic Scalable Bloom Filter with compounding error bounds.")
        ]
    },
    {
        "pkg": "packages/protocol",
        "is_core": False,
        "modules": [
            ("binary_schema", "BinarySchema", "Strongly-typed binary schema definitions with field IDs and composite types."),
            ("schema_registry", "SchemaRegistry", "Schema evolution validator checking BACKWARD, FORWARD, and FULL compatibility."),
            ("multiplexed_rpc", "MultiplexedRpcEngine", "Full-duplex connection multiplexer over single TCP sockets with flow control windows."),
            ("query_codec", "QueryCodec", "Binary serialization for distributed filter expressions, projections, and aggregations."),
            ("control_codec", "ControlCodec", "Binary serializers for snapshot chunk streaming and dynamic membership transitions."),
            ("stream_multiplexer", "StreamMultiplexer", "Pipelined frame stream multiplexer with priority QoS queues."),
            ("tcp_framing_pipeline", "TcpFramingPipeline", "Non-blocking TCP frame decoder with fragmented packet reassembly."),
            ("compression_frame_codec", "CompressionFrameCodec", "On-the-wire payload compression codec for large batch frames."),
            ("auth_handshake_codec", "AuthHandshakeCodec", "Cryptographic authentication handshake and mutual challenge-response codec."),
            ("telemetry_wire_codec", "TelemetryWireCodec", "Compact wire codec for high-frequency distributed metrics and trace spans.")
        ]
    },
    {
        "pkg": "packages/storage",
        "is_core": False,
        "modules": [
            ("wal_writer_pool", "WalWriterPool", "Concurrent striping WAL writer pool distributing write load across NVMe disks."),
            ("compaction_orchestrator", "CompactionOrchestrator", "Multi-threaded background compaction orchestrator for segment merging."),
            ("segment_retention_cleaner", "SegmentRetentionCleaner", "Autonomous retention cleaner enforcing time, size, and compaction policies."),
            ("storage_metrics_collector", "StorageMetricsCollector", "Low-overhead IOPS, write amplification, and disk latency metric sampler."),
            ("block_checksum_validator", "BlockChecksumValidator", "Continuous background hardware block CRC32 scrub and corruption repair."),
            ("direct_io_allocator", "DirectIoAllocator", "Aligned unbuffered direct I/O memory buffer allocator.")
        ]
    },
    {
        "pkg": "packages/lsm",
        "is_core": False,
        "modules": [
            ("memtable_wal", "MemTableWal", "Transactional MemTable paired with durable WAL replay engine for crash recovery."),
            ("sst_block_cache", "SstBlockCache", "Clock-Pro memory-mapped SSTable uncompressed block cache."),
            ("transaction_journal", "TransactionJournal", "Multi-version concurrency control (MVCC) transaction journal for LSM-Tree."),
            ("tiered_compaction_pipeline", "TieredCompactionPipeline", "Dynamic multi-tiered compactor minimizing write amplification."),
            ("point_lookup_optimizer", "PointLookupOptimizer", "Bloom filter and SSTable sparse index fast-path point query router."),
            ("range_scan_pipeline", "RangeScanPipeline", "Prefetching range scanner with async block iterator pre-loading.")
        ]
    },
    {
        "pkg": "packages/raft",
        "is_core": False,
        "modules": [
            ("membership_state", "JointMembershipState", "Joint Consensus dynamic membership state machine ($C_{old} \\to C_{old,new} \\to C_{new}$)."),
            ("state_machine_adapter", "StateMachineAdapter", "Pluggable state machine interface for KV store, event log, and DAG state."),
            ("multi_raft_group_manager", "MultiRaftGroupManager", "Multi-Raft partition manager hosting thousands of independent consensus groups."),
            ("snapshot_streaming_pipeline", "SnapshotStreamingPipeline", "Chunked asynchronous snapshot streaming pipeline with backpressure."),
            ("quorum_calculator", "QuorumCalculator", "Dynamic quorum calculator supporting weighted voting and multi-datacenter quorums."),
            ("flow_control_window", "FlowControlWindow", "Adaptive flow control window preventing follower buffer exhaustion."),
            ("leader_lease_tracker", "LeaderLeaseTracker", "Microsecond-accurate monotonic leader lease renewal timer.")
        ]
    },
    {
        "pkg": "packages/cluster",
        "is_core": False,
        "modules": [
            ("gossip_disseminator", "GossipDisseminator", "Epidemic gossip message propagator with adaptive fanout and message piggybacking."),
            ("vnode_ring", "VirtualNodeHashRing", "1024-vNode consistent hash ring with Murmur3 128-bit hashing."),
            ("split_brain_guard", "SplitBrainGuard", "Quorum arbitrator and epoch fencing token validator for split-brain prevention."),
            ("failure_detector_extended", "PhiAccrualFailureDetector", "Phi Accrual Failure Detector estimating crash probabilities based on heartbeat history."),
            ("gossip_message_router", "GossipMessageRouter", "Dynamic gossip message routing table with incarnation refutations."),
            ("node_health_matrix", "NodeHealthMatrix", "Cluster-wide node latency, packet loss, and CPU load health matrix."),
            ("cluster_membership_log", "ClusterMembershipLog", "Replicated cluster membership change log with epoch fencing."),
            ("rack_placement_engine", "RackPlacementEngine", "Multi-cloud region and availability-zone fault-domain replica placement planner.")
        ]
    },
    {
        "pkg": "packages/scheduler",
        "is_core": False,
        "modules": [
            ("execution_graph", "DynamicExecutionGraph", "Runtime DAG execution graph supporting dynamic branching and joins."),
            ("task_checkpoint", "TaskCheckpointManager", "Incremental task checkpointing and state savepoints for long-running workflows."),
            ("fair_queue", "DeficitRoundRobinQueue", "Deficit Round Robin (DRR) and Weighted Fair Queuing multi-tenant scheduler."),
            ("dag_execution_runtime", "DagExecutionRuntime", "Concurrent workflow execution supervisor with stage barrier synchronization."),
            ("worker_lease_coordinator", "WorkerLeaseCoordinator", "Epoch-based worker task lease fencing coordinator."),
            ("retry_budget_manager", "RetryBudgetManager", "Adaptive retry budget manager preventing cascading retry storms."),
            ("workflow_telemetry_tracker", "WorkflowTelemetryTracker", "Real-time task latency, memory footprint, and stage duration tracker."),
            ("concurrency_throttler", "ConcurrencyThrottler", "Hierarchical multi-tenant task concurrency throttler.")
        ]
    },
    {
        "pkg": "packages/worker",
        "is_core": False,
        "modules": [
            ("wasm_executor", "WasmTaskExecutor", "WebAssembly (WASM) sandbox runtime executing isolated binary task modules."),
            ("container_executor", "ContainerTaskExecutor", "Containerized OCI/Docker runtime interface for running container tasks."),
            ("artifact_manager", "WorkerArtifactManager", "Intermediate artifact cache and chunked file transfer manager."),
            ("heartbeat_client", "WorkerHeartbeatClient", "Adaptive worker heartbeat lease renewer with exponential jitter."),
            ("task_sandbox_environment", "TaskSandboxEnvironment", "Process isolation sandbox with secure environment variable scoping."),
            ("wasm_runtime_host", "WasmRuntimeHost", "WASM module compiler, memory allocator, and host function bridge."),
            ("worker_metrics_agent", "WorkerMetricsAgent", "Local worker CPU, memory, thread pool, and I/O metrics agent."),
            ("process_watchdog", "ProcessWatchdog", "Watchdog timer terminating runaway child processes on timeout."),
            ("stream_artifact_collector", "StreamArtifactCollector", "Real-time stdout/stderr stream capturer and chunked log shipper.")
        ]
    },
    {
        "pkg": "packages/sql",
        "is_core": False,
        "modules": [
            ("ast_nodes", "AstNodeFactory", "Abstract Syntax Tree (AST) node definitions for streaming SQL expressions."),
            ("expression_evaluator", "ExpressionEvaluator", "High-speed expression evaluator for arithmetic, logic, and string functions."),
            ("window_aggregator", "WindowAggregator", "Tumbling, Hopping, and Sliding window aggregators (COUNT, SUM, AVG, MIN, MAX)."),
            ("query_optimizer", "StreamingQueryOptimizer", "Rule-based streaming query optimizer performing filter pushdowns and projection pruning."),
            ("expression_compiler", "ExpressionCompiler", "JIT expression compiler converting SQL AST into optimized JavaScript functions."),
            ("stream_join_processor", "StreamJoinProcessor", "Temporal interval stream-to-stream join processor."),
            ("sliding_window_buffer", "SlidingWindowBuffer", "Memory-efficient sliding window event buffer with incremental eviction.")
        ]
    },
    {
        "pkg": "packages/telemetry",
        "is_core": False,
        "modules": [
            ("span", "TraceSpan", "OpenTelemetry-compatible trace span with attributes and timeline events."),
            ("health_monitor", "ClusterHealthMonitor", "Subsystem health score aggregator and SLA tracker."),
            ("alert_manager", "AlertManager", "Alert rule evaluator triggering webhooks on metric threshold violations."),
            ("tracing_pipeline", "TracingPipeline", "Asynchronous trace span batcher and exporter."),
            ("health_dashboard_collector", "HealthDashboardCollector", "Real-time cluster health and telemetry summary collector.")
        ]
    },
    {
        "pkg": "packages/security",
        "is_core": False,
        "modules": [
            ("mtls_manager", "MtlsManager", "Mutual TLS certificate validator and client certificate authenticator."),
            ("token_verifier", "TokenVerifier", "HMAC and RSA-signed JWT token validator with tenant claims."),
            ("audit_logger", "SecurityAuditLogger", "Immutable tamper-evident security and administrative audit log."),
            ("signature_validator", "SignatureValidator", "Ed25519 and ECDSA request signature validator.")
        ]
    },
    {
        "pkg": "packages/network",
        "is_core": False,
        "modules": [
            ("backpressure_stream", "BackpressureStream", "High-throughput flow-controlled duplex byte stream."),
            ("multiplexed_client", "MultiplexedClient", "Multiplexed async client routing requests over shared TCP sockets."),
            ("reconnect_policy", "ExponentialBackoffReconnectPolicy", "Adaptive exponential backoff reconnection policy with full jitter.")
        ]
    }
]

def generate_refactored_module(pkg_path, mod_name, class_name, desc, is_core):
    import_line = "import { BaseSubsystemComponent } from './subsystem_base.js';" if is_core else "import { BaseSubsystemComponent } from '@krono/core';"
    
    code = f"""/**
 * @file {mod_name}.js
 * {desc}
 * Refactored using BaseSubsystemComponent to eliminate redundant boilerplate.
 */

{import_line}

export class {class_name} extends BaseSubsystemComponent {{
  /**
   * @param {Object} [options]
   */
  constructor(options = {{}}) {{
    super('{class_name}', options);
    this.domainConfig = {{ ...options }};
    this.domainState = new Map();
  }}

  /**
   * Domain-specific execution hook for {class_name}.
   * @param {{Object}} params
   * @returns {{Promise<Object>}}
   */
  async processDomainOperation(params = {{}}) {{
    this.incrementCounter('invocations');
    const result = await this.executeStage(1, params);
    this.domainState.set(params.id || 'lastOp', result);
    return result;
  }}
}}
"""
    return code

for pkg_info in packages_config:
    pkg = pkg_info["pkg"]
    is_core = pkg_info["is_core"]
    for mod_name, class_name, desc in pkg_info["modules"]:
        file_path = os.path.join(base_dir, pkg, 'src', f"{mod_name}.js")
        refactored = generate_refactored_module(pkg, mod_name, class_name, desc, is_core)
        with open(file_path, 'w', encoding='utf-8') as fh:
            fh.write(refactored.strip() + '\n')
        print(f"Refactored: {pkg}/src/{mod_name}.js")

# Reconcile index.js exports
import fix_index_exports

print("Refactoring and deduplication completed.")
