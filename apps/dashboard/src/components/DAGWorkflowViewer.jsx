import React from 'react';

export default function DAGWorkflowViewer({ activeWorkflow }) {
  const sampleStages = [
    [
      { id: 'extract-postgres', name: 'Extract DB', status: 'COMPLETED', duration: '142ms' },
      { id: 'extract-s3', name: 'Extract S3', status: 'COMPLETED', duration: '280ms' }
    ],
    [
      { id: 'transform-normalize', name: 'Normalize', status: 'RUNNING', duration: '85ms' }
    ],
    [
      { id: 'train-model', name: 'Train Predictor', status: 'PENDING', duration: '-' },
      { id: 'publish-metrics', name: 'Publish Telemetry', status: 'PENDING', duration: '-' }
    ]
  ];

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
          <span>⚡</span> DAG Workflow Orchestrator
        </h3>
        <span className="text-xs font-mono text-cyan-400">Job: #etl-ml-pipeline-01</span>
      </div>

      <div className="flex items-center justify-between gap-4 overflow-x-auto py-4 px-2">
        {sampleStages.map((stage, sIdx) => (
          <React.Fragment key={sIdx}>
            <div className="flex flex-col gap-3 min-w-[140px]">
              <div className="text-[10px] font-mono text-slate-500 uppercase tracking-wider text-center">
                Stage 0{sIdx + 1}
              </div>
              {stage.map((task) => (
                <div
                  key={task.id}
                  className={`p-3 rounded-lg border flex flex-col gap-1 transition ${
                    task.status === 'COMPLETED'
                      ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300'
                      : task.status === 'RUNNING'
                      ? 'bg-indigo-950/40 border-indigo-500/60 text-indigo-200 animate-pulse'
                      : 'bg-slate-950/40 border-slate-800 text-slate-400'
                  }`}
                >
                  <div className="text-xs font-bold font-mono truncate">{task.name}</div>
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span>{task.status}</span>
                    <span>{task.duration}</span>
                  </div>
                </div>
              ))}
            </div>

            {sIdx < sampleStages.length - 1 && (
              <div className="text-slate-600 font-bold text-lg select-none">➔</div>
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
