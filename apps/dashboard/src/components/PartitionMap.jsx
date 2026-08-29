import React from 'react';

export default function PartitionMap() {
  const partitions = [
    { topic: 'orders.events', p: 0, node: 'krono-01', records: '1.2M', rate: '4.2k/s' },
    { topic: 'orders.events', p: 1, node: 'krono-02', records: '1.1M', rate: '3.8k/s' },
    { topic: 'orders.events', p: 2, node: 'krono-03', records: '1.4M', rate: '4.5k/s' },
    { topic: 'telemetry.metrics', p: 0, node: 'krono-02', records: '8.9M', rate: '12.4k/s' },
    { topic: 'telemetry.metrics', p: 1, node: 'krono-01', records: '9.1M', rate: '12.8k/s' }
  ];

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <span>📦</span> Partition Stream & Storage Distribution
        </h3>
        <span className="text-xs font-mono text-emerald-400">Total IOPS: ~37.7k/s</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left font-mono text-xs">
          <thead>
            <tr className="text-slate-500 border-b border-slate-800/80">
              <th className="pb-2">Topic</th>
              <th className="pb-2">Partition</th>
              <th className="pb-2">Leader Replica</th>
              <th className="pb-2">Record Count</th>
              <th className="pb-2">Throughput</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {partitions.map((row, idx) => (
              <tr key={idx} className="hover:bg-slate-800/20 transition">
                <td className="py-2.5 text-slate-200">{row.topic}</td>
                <td className="py-2.5 text-indigo-400">P-{row.p}</td>
                <td className="py-2.5 text-emerald-400 font-bold">{row.node}</td>
                <td className="py-2.5 text-slate-400">{row.records}</td>
                <td className="py-2.5 text-cyan-400 font-semibold">{row.rate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
