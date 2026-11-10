'use client';

import { useMemo, useState } from 'react';
import { Empty, cx } from './kit';

export interface GraphNode {
  id: string;
  label: string;
  color?: string;
  /** relative size, 1 = normal */
  weight?: number;
  /** dimmed node (for example a link target that does not exist yet) */
  ghost?: boolean;
}
export interface GraphEdge {
  from: string;
  to: string;
  dashed?: boolean;
}

/**
 * Deterministic force-directed layout (repulsion + springs + gentle centring). Runs a fixed number
 * of iterations up front, so there is no animation loop and no per-frame cost.
 */
export function layoutGraph(nodes: GraphNode[], edges: GraphEdge[], dims: 2 | 3 = 2, iterations = 220): Map<string, [number, number, number]> {
  const n = nodes.length;
  const pos = nodes.map((_, i) => {
    // golden-angle spiral start: stable and well spread
    const a = i * 2.399963;
    const r = 30 + 14 * Math.sqrt(i);
    return [Math.cos(a) * r, Math.sin(a) * r, dims === 3 ? ((i % 7) - 3) * 12 : 0] as [number, number, number];
  });
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const links = edges.map((e) => [index.get(e.from), index.get(e.to)] as const).filter((l): l is readonly [number, number] => l[0] !== undefined && l[1] !== undefined && l[0] !== l[1]);
  const k = 70;
  for (let it = 0; it < iterations; it++) {
    const temp = 1 - it / iterations;
    const disp = pos.map(() => [0, 0, 0]);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = [pos[i][0] - pos[j][0], pos[i][1] - pos[j][1], pos[i][2] - pos[j][2]];
        const dist2 = Math.max(1, d[0] * d[0] + d[1] * d[1] + d[2] * d[2]);
        const f = (k * k) / dist2;
        for (let c = 0; c < dims; c++) {
          disp[i][c] += d[c] * f * 0.02;
          disp[j][c] -= d[c] * f * 0.02;
        }
      }
    }
    for (const [a, b] of links) {
      const d = [pos[a][0] - pos[b][0], pos[a][1] - pos[b][1], pos[a][2] - pos[b][2]];
      const dist = Math.max(1, Math.hypot(d[0], d[1], d[2]));
      const f = (dist - k) / dist;
      for (let c = 0; c < dims; c++) {
        disp[a][c] -= d[c] * f * 0.06;
        disp[b][c] += d[c] * f * 0.06;
      }
    }
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < dims; c++) {
        disp[i][c] -= pos[i][c] * 0.012;
        const step = Math.max(-18, Math.min(18, disp[i][c])) * (0.25 + temp);
        pos[i][c] += step;
      }
    }
  }
  return new Map(nodes.map((node, i) => [node.id, pos[i]]));
}

/** Interactive 2D node-link diagram rendered as SVG. Hover or focus a node to highlight its neighbours. */
export function Graph({ nodes, edges, onOpen, height = 460, emptyTitle = 'Nothing to map yet', emptyHint }: { nodes: GraphNode[]; edges: GraphEdge[]; onOpen?: (id: string) => void; height?: number; emptyTitle?: string; emptyHint?: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const { pos, box } = useMemo(() => {
    const pos = layoutGraph(nodes, edges);
    const xs = [...pos.values()].map((p) => p[0]);
    const ys = [...pos.values()].map((p) => p[1]);
    const pad = 70;
    const minX = Math.min(...xs, 0) - pad;
    const minY = Math.min(...ys, 0) - pad;
    return { pos, box: [minX, minY, Math.max(...xs, 0) + pad - minX, Math.max(...ys, 0) + pad - minY] };
  }, [nodes, edges]);
  const neighbours = useMemo(() => {
    const set = new Set<string>();
    if (hover) for (const e of edges) { if (e.from === hover) set.add(e.to); if (e.to === hover) set.add(e.from); }
    return set;
  }, [hover, edges]);
  if (!nodes.length) return <Empty icon="network" title={emptyTitle} hint={emptyHint} />;
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface/50">
      <svg viewBox={box.join(' ')} style={{ height, width: '100%' }} role="group" aria-label={`Graph with ${nodes.length} nodes and ${edges.length} links`}>
        {edges.map((e, i) => {
          const a = pos.get(e.from);
          const b = pos.get(e.to);
          if (!a || !b) return null;
          const lit = hover && (e.from === hover || e.to === hover);
          return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={lit ? 'var(--accent)' : 'var(--line-strong)'} strokeWidth={lit ? 1.8 : 1} strokeDasharray={e.dashed ? '4 4' : undefined} />;
        })}
        {nodes.map((node) => {
          const p = pos.get(node.id)!;
          const r = 6 + Math.min(10, (node.weight ?? 1) * 2.2);
          const dim = hover && hover !== node.id && !neighbours.has(node.id);
          return (
            <g
              key={node.id} transform={`translate(${p[0]} ${p[1]})`} tabIndex={0} role="button" aria-label={node.label}
              className={cx('cursor-pointer outline-none transition-opacity', dim && 'opacity-25')}
              onMouseEnter={() => setHover(node.id)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(node.id)} onBlur={() => setHover(null)}
              onClick={() => onOpen?.(node.id)} onKeyDown={(ev) => ev.key === 'Enter' && onOpen?.(node.id)}
            >
              <circle r={r + 5} fill={node.color ?? 'var(--accent)'} opacity={hover === node.id ? 0.25 : 0.1} />
              <circle r={r} fill={node.ghost ? 'transparent' : (node.color ?? 'var(--accent)')} stroke={node.color ?? 'var(--accent)'} strokeWidth={node.ghost ? 1.5 : 0} strokeDasharray={node.ghost ? '3 3' : undefined} />
              <text y={r + 13} textAnchor="middle" fontSize="10.5" fill="var(--text)" opacity={node.ghost ? 0.6 : 0.92} style={{ pointerEvents: 'none' }}>{node.label.length > 22 ? `${node.label.slice(0, 21)}…` : node.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
