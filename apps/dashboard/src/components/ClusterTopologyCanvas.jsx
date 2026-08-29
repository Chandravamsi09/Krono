import React, { useEffect, useRef, useState } from 'react';

export default function ClusterTopologyCanvas({ nodes = [], onSelectNode, selectedNodeId }) {
  const canvasRef = useRef(null);
  const [particles, setParticles] = useState([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId;

    // Node positions arranged in circular layout
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) * 0.35;

    const nodePositions = nodes.map((node, index) => {
      const angle = (index / Math.max(1, nodes.length)) * 2 * Math.PI - Math.PI / 2;
      return {
        ...node,
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle)
      };
    });

    let angleTick = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // 1. Draw Mesh Connection Lines
      for (let i = 0; i < nodePositions.length; i++) {
        for (let j = i + 1; j < nodePositions.length; j++) {
          const n1 = nodePositions[i];
          const n2 = nodePositions[j];

          ctx.beginPath();
          ctx.moveTo(n1.x, n1.y);
          ctx.lineTo(n2.x, n2.y);
          ctx.strokeStyle = '#1F2937';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);

          // Draw heartbeat pulse along line
          const progress = ((angleTick * 0.02) + (i * 0.3)) % 1;
          const px = n1.x + (n2.x - n1.x) * progress;
          const py = n1.y + (n2.y - n1.y) * progress;

          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, 2 * Math.PI);
          ctx.fillStyle = '#6366F1';
          ctx.fill();
        }
      }

      // 2. Draw Cluster Nodes
      for (const node of nodePositions) {
        const isLeader = node.role === 'LEADER';
        const isSelected = node.nodeId === selectedNodeId;

        // Draw leader pulsing glow
        if (isLeader) {
          const glowSize = 35 + Math.sin(angleTick * 0.05) * 6;
          const grad = ctx.createRadialGradient(node.x, node.y, 10, node.x, node.y, glowSize);
          grad.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
          grad.addColorStop(1, 'rgba(99, 102, 241, 0)');
          ctx.beginPath();
          ctx.arc(node.x, node.y, glowSize, 0, 2 * Math.PI);
          ctx.fillStyle = grad;
          ctx.fill();
        }

        // Selection ring
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, 28, 0, 2 * Math.PI);
          ctx.strokeStyle = '#06B6D4';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Node circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, 22, 0, 2 * Math.PI);
        ctx.fillStyle = isLeader ? '#4F46E5' : '#1E293B';
        ctx.fill();
        ctx.strokeStyle = isLeader ? '#818CF8' : (node.status === 'ALIVE' ? '#10B981' : '#F43F5E');
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Node Label
        ctx.fillStyle = '#F8FAFC';
        ctx.font = '600 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(node.nodeId, node.x, node.y + 36);

        // Role Badge
        ctx.fillStyle = isLeader ? '#A5B4FC' : '#94A3B8';
        ctx.font = '500 10px "JetBrains Mono", monospace';
        ctx.fillText(node.role || 'FOLLOWER', node.x, node.y + 48);

        // Inner icon indicator
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText(isLeader ? '👑' : '⚡', node.x, node.y + 4);
      }

      angleTick++;
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [nodes, selectedNodeId]);

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center bg-slate-900/40 rounded-xl border border-slate-800/80 backdrop-blur overflow-hidden">
      <canvas
        ref={canvasRef}
        width={500}
        height={380}
        className="cursor-pointer"
        onClick={(e) => {
          const rect = canvasRef.current.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const clickY = e.clientY - rect.top;

          const width = 500;
          const height = 380;
          const centerX = width / 2;
          const centerY = height / 2;
          const radius = Math.min(width, height) * 0.35;

          nodes.forEach((node, index) => {
            const angle = (index / Math.max(1, nodes.length)) * 2 * Math.PI - Math.PI / 2;
            const nx = centerX + radius * Math.cos(angle);
            const ny = centerY + radius * Math.sin(angle);
            const dist = Math.hypot(clickX - nx, clickY - ny);
            if (dist <= 25 && onSelectNode) {
              onSelectNode(node.nodeId);
            }
          });
        }}
      />
      <div className="absolute bottom-3 left-4 text-xs font-mono text-slate-400 flex items-center gap-4">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> Alive</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-500"></span> Leader</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500"></span> Partitioned</span>
      </div>
    </div>
  );
}
