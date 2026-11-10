'use client';

import { useMemo } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { addDays, startOfWeek, ymd } from '@/core/lib/dates';
import { cx } from './kit';

/** Chart wrappers (Recharts, MIT) themed through the design tokens so they follow dark / light and the accent. */

export const SERIES = ['var(--accent)', 'var(--violet)', 'var(--good)', 'var(--warn)', 'var(--bad)', 'var(--cyan)', 'var(--blue)', '#f472b6', '#a3e635', '#94a3b8'];

export interface Series {
  key: string;
  name?: string;
  color?: string;
}
type Row = Record<string, string | number>;
type Fmt = (v: number) => string;

const tooltipStyle = { background: 'var(--solid)', border: '1px solid var(--line-strong)', borderRadius: 10, fontSize: 12, color: 'var(--text)', boxShadow: '0 12px 30px -12px rgb(0 0 0 / 0.6)' };
const axis = { tick: { fill: 'var(--faint)', fontSize: 11 }, axisLine: false, tickLine: false } as const;
const compact: Fmt = (v) => (Math.abs(v) >= 1e7 ? `${(v / 1e7).toFixed(1)}Cr` : Math.abs(v) >= 1e5 ? `${(v / 1e5).toFixed(1)}L` : Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : String(Math.round(v * 10) / 10));

function Frame({ height, children, label, empty }: { height: number; children: React.ReactElement; label: string; empty?: boolean }) {
  if (empty) return <div className="grid place-items-center text-sm text-faint" style={{ height }}>Not enough data yet</div>;
  return (
    <div role="img" aria-label={label} style={{ height }} className="w-full min-w-0">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>{children}</ResponsiveContainer>
    </div>
  );
}

export function Bars({ data, series, x = 'label', height = 200, fmt = compact, stacked, label }: { data: Row[]; series: Series[]; x?: string; height?: number; fmt?: Fmt; stacked?: boolean; label: string }) {
  const empty = !data.some((d) => series.some((s) => Number(d[s.key]) > 0));
  return (
    <Frame height={height} label={label} empty={empty}>
      <BarChart data={data} margin={{ top: 6, right: 4, left: -18, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid stroke="var(--line)" vertical={false} />
        <XAxis dataKey={x} {...axis} interval="preserveStartEnd" />
        <YAxis {...axis} tickFormatter={fmt} width={52} />
        <Tooltip cursor={{ fill: 'var(--surface-2)' }} contentStyle={tooltipStyle} formatter={(v) => fmt(Number(v))} />
        {series.map((s, i) => <Bar key={s.key} dataKey={s.key} name={s.name ?? s.key} fill={s.color ?? SERIES[i % SERIES.length]} radius={stacked ? 0 : [5, 5, 0, 0]} stackId={stacked ? 'a' : undefined} maxBarSize={38} isAnimationActive={false} />)}
      </BarChart>
    </Frame>
  );
}

export function Lines({ data, series, x = 'label', height = 200, fmt = compact, label }: { data: Row[]; series: Series[]; x?: string; height?: number; fmt?: Fmt; label: string }) {
  const empty = data.filter((d) => series.some((s) => d[s.key] != null)).length < 2;
  return (
    <Frame height={height} label={label} empty={empty}>
      <AreaChart data={data} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={s.key} id={`grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color ?? SERIES[i % SERIES.length]} stopOpacity={0.35} />
              <stop offset="100%" stopColor={s.color ?? SERIES[i % SERIES.length]} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid stroke="var(--line)" vertical={false} />
        <XAxis dataKey={x} {...axis} interval="preserveStartEnd" minTickGap={24} />
        <YAxis {...axis} tickFormatter={fmt} width={52} domain={['auto', 'auto']} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmt(Number(v))} />
        {series.map((s, i) => <Area key={s.key} type="monotone" dataKey={s.key} name={s.name ?? s.key} stroke={s.color ?? SERIES[i % SERIES.length]} strokeWidth={2} fill={`url(#grad-${s.key})`} connectNulls dot={data.length < 20 ? { r: 2.5 } : false} isAnimationActive={false} />)}
      </AreaChart>
    </Frame>
  );
}

export function Donut({ data, height = 190, fmt = compact, label, center }: { data: { name: string; value: number; color?: string }[]; height?: number; fmt?: Fmt; label: string; center?: React.ReactNode }) {
  const rows = data.filter((d) => d.value > 0);
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative mx-auto flex-none" style={{ width: height, height }}>
        <Frame height={height} label={label} empty={!rows.length}>
          <PieChart>
            <Pie data={rows} dataKey="value" nameKey="name" innerRadius="64%" outerRadius="96%" paddingAngle={rows.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
              {rows.map((d, i) => <Cell key={d.name} fill={d.color ?? SERIES[i % SERIES.length]} />)}
            </Pie>
            <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmt(Number(v))} />
          </PieChart>
        </Frame>
        {center && rows.length > 0 && <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">{center}</div>}
      </div>
      <ul className="min-w-36 flex-1 space-y-1.5 text-sm">
        {rows.slice(0, 7).map((d, i) => (
          <li key={d.name} className="flex items-center gap-2">
            <span className="size-2.5 flex-none rounded-full" style={{ background: d.color ?? SERIES[i % SERIES.length] }} />
            <span className="min-w-0 flex-1 truncate text-muted">{d.name}</span>
            <span className="num font-medium">{fmt(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** GitHub-style activity heat-map: one cell per day, weeks as columns. `values` maps YYYY-MM-DD → 0…1 intensity. */
export function Heatmap({ values, weeks = 18, color = 'var(--accent)', onPick, label }: { values: Map<string, number>; weeks?: number; color?: string; onPick?: (date: string) => void; label: string }) {
  const days = useMemo(() => {
    const start = addDays(startOfWeek(new Date(), 1), -(weeks - 1) * 7);
    return Array.from({ length: weeks * 7 }, (_, i) => addDays(start, i));
  }, [weeks]);
  const today = ymd();
  return (
    <div className="scroll-x no-scrollbar" role="img" aria-label={label}>
      <div className="grid w-max grid-flow-col grid-rows-7 gap-[3px]">
        {days.map((d) => {
          const key = ymd(d);
          const v = values.get(key) ?? 0;
          const future = key > today;
          return (
            <button
              key={key} type="button" disabled={future || !onPick} title={`${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}${v ? ' · done' : ''}`} aria-label={`${key}${v ? ', done' : ''}`}
              onClick={() => onPick?.(key)}
              className={cx('size-[13px] rounded-[3px] sm:size-[14px]', key === today && 'ring-1 ring-text/60', future && 'opacity-30')}
              style={{ background: v > 0 ? `color-mix(in oklab, ${color} ${Math.round(35 + Math.min(1, v) * 65)}%, transparent)` : 'var(--surface-3)' }}
            />
          );
        })}
      </div>
    </div>
  );
}

export function Spark({ values, color = 'var(--accent)', width = 96, height = 28 }: { values: number[]; color?: string; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * width},${height - 2 - ((v - min) / span) * (height - 4)}`).join(' ');
  return (
    <svg width={width} height={height} aria-hidden="true" className="flex-none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
