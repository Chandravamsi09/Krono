import React, { useState, useEffect } from 'react';
import ClusterTopologyCanvas from './components/ClusterTopologyCanvas';
import RaftInspector from './components/RaftInspector';
import DAGWorkflowViewer from './components/DAGWorkflowViewer';
import PartitionMap from './components/PartitionMap';
import ChaosControlPanel from './components/ChaosControlPanel';

export default function App() {
  const [selectedNodeId, setSelectedNodeId] = useState('krono-01');
  const [clusterNodes, setClusterNodes] = useState([
    { nodeId: 'krono-01', address: '127.0.0.1:9001', role: 'LEADER', status: 'ALIVE' },
    { nodeId: 'krono-02', address: '127.0.0.1:9002', role: 'FOLLOWER', status: 'ALIVE' },
    { nodeId: 'krono-03', address: '127.0.0.1:9003', role: 'FOLLOWER', status: 'ALIVE' },
    { nodeId: 'krono-04', address: '127.0.0.1:9004', role: 'FOLLOWER', status: 'ALIVE' },
    { nodeId: 'krono-05', address: '127.0.0.1:9005', role: 'LEARNER', status: 'ALIVE' }
  ]);

  const [raftState, setRaftState] = useState({
    nodeId: 'krono-01',
    role: 'LEADER',
    term: 14,
    commitIndex: 3829,
    leaderId: 'krono-01'
  });

  return (
    <div className="min-h-screen bg-[#0B0F19] text-slate-100 p-6 flex flex-col gap-6 max-w-7xl mx-auto">
      {/* Top Navigation Bar */}
      <header className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-cyan-500 flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
            K
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              Krono <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 font-mono">v1.0.0-cluster</span>
            </h1>
            <p className="text-xs text-slate-400 font-mono">Distributed Consensus & Fault-Tolerant Engine</p>
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            <span className="text-slate-300">Cluster Quorum Healthy</span>
          </div>
          <div className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-lg text-slate-300">
            Active Nodes: <span className="text-indigo-400 font-bold">{clusterNodes.length}</span>
          </div>
        </div>
      </header>

      {/* Main Grid Layout */}
      <main className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Interactive Topology Canvas */}
        <section className="lg:col-span-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <span>🌐</span> Dynamic Mesh & Topology
            </h2>
            <span className="text-xs font-mono text-slate-400">SWIM Gossip + Virtual Ring</span>
          </div>
          <div className="h-[400px]">
            <ClusterTopologyCanvas
              nodes={clusterNodes}
              onSelectNode={(id) => setSelectedNodeId(id)}
              selectedNodeId={selectedNodeId}
            />
          </div>
          <ChaosControlPanel />
        </section>

        {/* Right Column: Raft Inspector & DAG Monitor */}
        <section className="lg:col-span-6 flex flex-col gap-6">
          <RaftInspector raftState={raftState} />
          <DAGWorkflowViewer />
          <PartitionMap />
        </section>
      </main>
    </div>
  );
}
