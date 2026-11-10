'use client';

import { useMemo } from 'react';
import { addDays, diffDays, startOfDay } from '@/core/lib/dates';
import { Empty, cx } from './kit';

export interface TimelineItem {
  id: string;
  label: string;
  start: Date;
  end: Date;
  color?: string;
  done?: boolean;
  /** rendered as a diamond on its end date */
  milestone?: boolean;
  group?: string;
  onClick?: () => void;
}

const DAY_W = 30;

/** Gantt-style timeline: one row per item, a column per day, scrolls horizontally inside its own container. */
export function Timeline({ items, emptyHint }: { items: TimelineItem[]; emptyHint?: string }) {
  const today = startOfDay(new Date());
  const { from, days, rows } = useMemo(() => {
    const rows = [...items].sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '') || a.start.getTime() - b.start.getTime());
    if (!rows.length) return { from: today, days: 0, rows };
    const min = new Date(Math.min(today.getTime(), ...rows.map((r) => r.start.getTime())));
    const max = new Date(Math.max(today.getTime(), ...rows.map((r) => r.end.getTime())));
    const from = addDays(startOfDay(min), -2);
    return { from, days: Math.min(366, diffDays(from, max) + 6), rows };
  }, [items]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows.length) return <Empty icon="calendarDays" title="Nothing to place on the timeline" hint={emptyHint ?? 'Items need a start or due date to appear here.'} />;
  const dayList = Array.from({ length: days }, (_, i) => addDays(from, i));
  const todayX = diffDays(from, today) * DAY_W;
  let lastGroup: string | undefined;
  return (
    <div className="scroll-x rounded-xl border border-line" role="figure" aria-label="Timeline">
      <div style={{ width: days * DAY_W + 180 }} className="relative">
        <div className="sticky top-0 z-10 flex border-b border-line bg-solid text-[0.68rem] text-faint">
          <div className="sticky left-0 z-10 w-[180px] flex-none bg-solid px-3 py-1.5 font-medium">Item</div>
          {dayList.map((d, i) => (
            <div key={i} className={cx('flex-none border-l border-line py-1 text-center', (d.getDay() === 0 || d.getDay() === 6) && 'bg-surface')} style={{ width: DAY_W }}>
              {(d.getDate() === 1 || i === 0) && <div className="-mt-0.5 font-semibold text-muted">{d.toLocaleDateString(undefined, { month: 'short' })}</div>}
              <div className={cx(diffDays(today, d) === 0 && 'font-bold text-accent')}>{d.getDate()}</div>
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute bottom-0 top-0 z-[5] w-px bg-accent/70" style={{ left: 180 + todayX + DAY_W / 2 }} />
        {rows.map((r) => {
          const x = diffDays(from, r.start) * DAY_W;
          const w = Math.max(1, diffDays(r.start, r.end) + 1) * DAY_W;
          const header = r.group !== lastGroup && r.group ? r.group : null;
          lastGroup = r.group;
          return (
            <div key={r.id}>
              {header && <div className="sticky left-0 w-max px-3 pb-0.5 pt-2 text-[0.68rem] font-semibold uppercase tracking-wider text-faint">{header}</div>}
              <div className="flex h-9 items-center border-b border-line/60 hover:bg-surface">
                <button type="button" onClick={r.onClick} className={cx('sticky left-0 z-[6] h-full w-[180px] flex-none truncate bg-bg px-3 text-left text-sm', r.done && 'text-faint line-through')}>{r.label}</button>
                <div className="relative h-full flex-1">
                  {r.milestone ? (
                    <button type="button" onClick={r.onClick} title={r.label} aria-label={r.label} className="absolute top-1/2 size-3.5 -translate-y-1/2 rotate-45 rounded-[3px]" style={{ left: x + w - DAY_W / 2 - 7, background: r.color ?? 'var(--warn)' }} />
                  ) : (
                    <button type="button" onClick={r.onClick} title={r.label} aria-label={r.label} className={cx('absolute top-1/2 h-5 -translate-y-1/2 rounded-md', r.done && 'opacity-45')} style={{ left: x + 2, width: w - 4, background: r.color ?? 'var(--accent)' }} />
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
