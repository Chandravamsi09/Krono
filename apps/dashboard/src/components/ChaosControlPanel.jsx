import React, { useState } from 'react';

export default function ChaosControlPanel() {
  const [partitionActive, setPartitionActive] = useState(false);
  const [latencyMs, setLatencyMs] = useState(0);
  const [killedNodes, setKilledNodes] = useState([]);

  const toggleKillNode = (nodeId) => {
    if (killedNodes.includes(nodeId)) {
      setKilledNodes(killedNodes.filter((n) => n !== nodeId));
    } else {
      setKilledNodes([...killedNodes, nodeId]);
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <span>🔥</span> Jepsen Chaos Engineering Studio
        </h3>
        <span className="text-xs font-mono text-rose-400 font-bold">Fault Injection Mode</span>
      </div>

      <div className="grid grid-cols-3 gap-4 font-mono text-xs">
        {/* Network Partition */}
        <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800 flex flex-col justify-between gap-3">
          <div>
            <div className="text-slate-200 font-bold mb-1">Split-Brain Partition</div>
            <div className="text-[11px] text-slate-500">Isolates leader into a minority sub-network</div>
          </div>
          <button
            onClick={() => setPartitionActive(!partitionActive)}
            className={`py-2 px-3 rounded text-xs font-bold transition ${
              partitionActive
                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
            }`}
          >
            {partitionActive ? 'Heal Network Partition' : 'Trigger Partition'}
          </button>
        </div>

        {/* Network Latency */}
        <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800 flex flex-col justify-between gap-3">
          <div>
            <div className="text-slate-200 font-bold mb-1">Simulated Latency: {latencyMs}ms</div>
            <div className="text-[11px] text-slate-500">Injects artificial round-trip RPC delays</div>
          </div>
          <input
            type="range"
            min="0"
            max="500"
            step="50"
            value={latencyMs}
            onChange={(e) => setLatencyMs(Number(e.target.value))}
            className="accent-indigo-500 cursor-pointer"
          />
        </div>

        {/* Node Kill Simulator */}
        <div className="bg-slate-950/60 p-3.5 rounded-lg border border-slate-800 flex flex-col justify-between gap-3">
          <div>
            <div className="text-slate-200 font-bold mb-1">Process Termination</div>
            <div className="text-[11px] text-slate-500">Simulate abrupt SIGKILL node failures</div>
          </div>
          <div className="flex gap-2">
            {['krono-01', 'krono-02', 'krono-03'].map((n) => {
              const isKilled = killedNodes.includes(n);
              return (
                <button
                  key={n}
                  onClick={() => toggleKillNode(n)}
                  className={`flex-1 py-1.5 rounded text-[11px] font-bold border transition ${
                    isKilled
                      ? 'bg-rose-950/40 border-rose-500 text-rose-300'
                      : 'bg-slate-800 border-slate-700 hover:border-slate-600 text-slate-300'
                  }`}
                >
                  {isKilled ? 'Revive' : n.replace('krono-', 'N')}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
