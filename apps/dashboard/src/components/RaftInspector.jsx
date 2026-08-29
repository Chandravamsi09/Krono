import React from 'react';

export default function RaftInspector({ raftState }) {
  const { nodeId = 'krono-01', role = 'LEADER', term = 12, commitIndex = 1450, leaderId = 'krono-01' } = raftState || {};

  const sampleLogs = [
    { index: commitIndex, term, type: 'NORMAL', command: 'PUT user:session:4892' },
    { index: commitIndex - 1, term, type: 'NORMAL', command: 'APPEND orders.events:p0' },
    { index: commitIndex - 2, term, type: 'NORMAL', command: 'SCHEDULE workflow:etl-analytics' },
    { index: commitIndex - 3, term: term - 1, type: 'NOOP', command: 'LEADER_INITIAL_SYNC' }
  ];

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <span>📜</span> Raft Consensus State Machine
        </h3>
        <span className={`px-2.5 py-1 text-xs font-mono font-bold rounded-full ${role === 'LEADER' ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40' : 'bg-slate-800 text-slate-300'}`}>
          {role}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/60">
          <div className="text-[11px] text-slate-400 font-mono">Current Term</div>
          <div className="text-lg font-bold font-mono text-indigo-400">{term}</div>
        </div>
        <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/60">
          <div className="text-[11px] text-slate-400 font-mono">Commit Index</div>
          <div className="text-lg font-bold font-mono text-emerald-400">#{commitIndex}</div>
        </div>
        <div className="bg-slate-950/70 p-3 rounded-lg border border-slate-800/60">
          <div className="text-[11px] text-slate-400 font-mono">Cluster Leader</div>
          <div className="text-sm font-bold font-mono text-slate-200 truncate">{leaderId}</div>
        </div>
      </div>

      <div>
        <div className="text-xs font-mono text-slate-400 mb-2 flex items-center justify-between">
          <span>Replicated Commit Log Tail</span>
          <span className="text-[10px] text-indigo-400">Linearizable Quorum</span>
        </div>
        <div className="space-y-1.5 font-mono text-xs">
          {sampleLogs.map((log) => (
            <div key={log.index} className="flex items-center justify-between p-2 rounded bg-slate-950/40 border border-slate-800/50 hover:border-slate-700 transition">
              <div className="flex items-center gap-3">
                <span className="text-emerald-400 font-bold">#{log.index}</span>
                <span className="text-slate-500 text-[10px]">T:{log.term}</span>
                <span className="text-slate-200">{log.command}</span>
              </div>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">{log.type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
