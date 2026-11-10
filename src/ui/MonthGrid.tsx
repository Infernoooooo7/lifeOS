'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { addMonths, monthGrid, sameDay, ymd } from '@/core/lib/dates';
import { IconButton, cx, useIsMobile } from './kit';

export interface CalItem {
  id: string;
  date: Date;
  title: string;
  color?: string;
  done?: boolean;
  time?: string;
  onClick?: () => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function MonthNav({ month, onChange, children }: { month: Date; onChange: (d: Date) => void; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <IconButton icon="chevronLeft" label="Previous month" onClick={() => onChange(addMonths(month, -1))} />
      <h3 className="min-w-36 text-center font-display text-[1.05rem] font-semibold">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
      <IconButton icon="chevronRight" label="Next month" onClick={() => onChange(addMonths(month, 1))} />
      <button type="button" className="btn btn-sm btn-ghost" onClick={() => onChange(new Date())}>Today</button>
      {children}
    </div>
  );
}

/**
 * Month calendar. On wide screens each cell lists its items; on phones cells show dots and the
 * selected day's items are listed underneath, so nothing overflows.
 */
export function MonthGrid({ month, items, weekStart = 1, onDayClick, selected, onSelect }: { month: Date; items: CalItem[]; weekStart?: number; onDayClick?: (day: Date) => void; selected?: Date; onSelect?: (day: Date) => void }) {
  const mobile = useIsMobile();
  const [localSelected, setLocalSelected] = useState(new Date());
  const sel = selected ?? localSelected;
  const select = onSelect ?? setLocalSelected;
  const days = useMemo(() => monthGrid(month, weekStart), [month, weekStart]);
  const byDay = useMemo(() => {
    const map = new Map<string, CalItem[]>();
    for (const item of items) {
      const k = ymd(item.date);
      (map.get(k) ?? map.set(k, []).get(k)!).push(item);
    }
    for (const list of map.values()) list.sort((a, b) => a.date.getTime() - b.date.getTime());
    return map;
  }, [items]);
  const today = new Date();
  const selectedItems = byDay.get(ymd(sel)) ?? [];
  return (
    <div>
      <div className="grid grid-cols-7 text-center text-[0.72rem] font-medium uppercase tracking-wide text-faint">
        {Array.from({ length: 7 }, (_, i) => <div key={i} className="py-1.5">{WEEKDAYS[(i + weekStart) % 7]}</div>)}
      </div>
      <div className="grid grid-cols-7 overflow-hidden rounded-xl border border-line">
        {days.map((day, i) => {
          const list = byDay.get(ymd(day)) ?? [];
          const inMonth = day.getMonth() === month.getMonth();
          const isToday = sameDay(day, today);
          return (
            <div
              key={i} role="button" tabIndex={0} aria-label={`${day.toDateString()}, ${list.length} item${list.length === 1 ? '' : 's'}`}
              onClick={() => (mobile ? select(day) : onDayClick?.(day))}
              onKeyDown={(e) => e.key === 'Enter' && (mobile ? select(day) : onDayClick?.(day))}
              className={cx('min-h-14 cursor-pointer border-b border-r border-line p-1 text-left transition-colors hover:bg-surface-2 md:min-h-24', (i + 1) % 7 === 0 && 'border-r-0', i >= 35 && 'border-b-0', !inMonth && 'bg-surface/40 text-faint', mobile && sameDay(day, sel) && 'bg-accent-soft')}
            >
              <span className={cx('num inline-grid size-6 place-items-center rounded-full text-[0.8rem]', isToday && 'bg-accent font-semibold text-accent-ink')}>{day.getDate()}</span>
              {mobile ? (
                <div className="mt-0.5 flex flex-wrap gap-0.5 px-0.5">
                  {list.slice(0, 4).map((it) => <span key={it.id} className="size-1.5 rounded-full" style={{ background: it.color ?? 'var(--accent)' }} />)}
                </div>
              ) : (
                <div className="mt-0.5 space-y-0.5">
                  {list.slice(0, 3).map((it) => (
                    <button
                      key={it.id} type="button" title={it.title}
                      onClick={(e) => {
                        e.stopPropagation();
                        it.onClick?.();
                      }}
                      className={cx('block w-full truncate rounded-md px-1.5 py-0.5 text-left text-[0.74rem] hover:brightness-125', it.done && 'line-through opacity-60')}
                      style={{ background: `color-mix(in oklab, ${it.color ?? 'var(--accent)'} 20%, transparent)`, color: 'var(--text)' }}
                    >
                      {it.time && <span className="mr-1 text-faint">{it.time}</span>}
                      {it.title}
                    </button>
                  ))}
                  {list.length > 3 && <div className="px-1.5 text-[0.7rem] text-faint">+{list.length - 3} more</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {mobile && (
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between">
            <h4 className="text-sm font-semibold">{sel.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</h4>
            {onDayClick && <button type="button" className="btn btn-sm" onClick={() => onDayClick(sel)}>Add</button>}
          </div>
          {selectedItems.length === 0 ? (
            <p className="py-3 text-sm text-faint">Nothing on this day.</p>
          ) : (
            selectedItems.map((it) => (
              <button key={it.id} type="button" onClick={it.onClick} className="row w-full text-left">
                <span className="h-6 w-1 flex-none rounded-full" style={{ background: it.color ?? 'var(--accent)' }} />
                <span className={cx('min-w-0 flex-1 truncate', it.done && 'text-faint line-through')}>{it.title}</span>
                {it.time && <span className="text-xs text-faint">{it.time}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
