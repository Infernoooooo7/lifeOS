import { addDays, addMonths, inYear, parseDate, ymd } from './dates';

/**
 * "On this day": what you wrote, did and attended on this date a week, a month, a few months and one or more years
 * ago. Private and encrypted journal entries are never surfaced.
 */

export interface MemoryRecord {
  id: string;
  _c: string;
  _ca?: number;
  [key: string]: unknown;
}
export interface Memory {
  id: string;
  collection: string;
  title: string;
  snippet: string;
  /** YYYY-MM-DD the memory is from */
  date: string;
  ago: string;
}

/** The earlier dates that count as "this day", most distant first. */
export function memoryAnchors(now: Date = new Date(), maxYears = 20): { date: string; ago: string }[] {
  const out: { date: string; ago: string }[] = [];
  for (let n = maxYears; n >= 1; n--) out.push({ date: ymd(inYear(now, now.getFullYear() - n)), ago: n === 1 ? '1 year ago' : `${n} years ago` });
  for (const n of [6, 3, 1]) out.push({ date: ymd(addMonths(now, -n)), ago: n === 1 ? '1 month ago' : `${n} months ago` });
  out.push({ date: ymd(addDays(now, -7)), ago: '1 week ago' });
  return out;
}

const plain = (v: unknown, max: number): string => {
  const s = String(v ?? '').replace(/[#*_>`\[\]]/g, '').replace(/\s+/g, ' ').trim();
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};
const dayOf = (v: unknown): string | null => {
  const d = parseDate(v);
  return d ? ymd(d) : null;
};

function describe(r: MemoryRecord): { day: string | null; title: string; snippet: string } | null {
  if (r.deletedAt || r.archived) return null;
  switch (r._c) {
    case 'journal': {
      if (r.private || r.sealed) return null;
      const content = plain(r.content, 140);
      if (!content && !r.title) return null;
      return { day: dayOf(r.date), title: plain(r.title, 70) || plain(String(r.content ?? '').split('\n')[0], 70), snippet: r.title ? content : '' };
    }
    case 'achievements':
      return { day: dayOf(r.date), title: plain(r.title, 70) || 'Achievement', snippet: plain(r.description, 140) };
    case 'events':
      if (r.recurrence) return null; // a series is not a memory of one day
      return { day: dayOf(r.startAt), title: plain(r.title, 70) || 'Event', snippet: plain(r.location, 80) };
    case 'notes':
      return { day: r._ca ? ymd(new Date(r._ca)) : null, title: plain(r.title, 70) || 'Untitled note', snippet: plain(r.content, 140) };
    default:
      return null;
  }
}

export function onThisDay(records: MemoryRecord[], now: Date = new Date(), limit = 6): Memory[] {
  const byDay = new Map<string, { r: MemoryRecord; title: string; snippet: string }[]>();
  for (const r of records) {
    const d = describe(r);
    if (!d?.day) continue;
    (byDay.get(d.day) ?? byDay.set(d.day, []).get(d.day)!).push({ r, title: d.title, snippet: d.snippet });
  }
  const order = ['journal', 'achievements', 'events', 'notes'];
  const out: Memory[] = [];
  const seen = new Set<string>();
  for (const anchor of memoryAnchors(now)) {
    const found = (byDay.get(anchor.date) ?? []).sort((a, b) => order.indexOf(a.r._c) - order.indexOf(b.r._c));
    for (const f of found) {
      if (seen.has(f.r.id)) continue; // e.g. 29 February can match two anchors
      seen.add(f.r.id);
      out.push({ id: f.r.id, collection: f.r._c, title: f.title, snippet: f.snippet, date: anchor.date, ago: anchor.ago });
      if (out.length === limit) return out;
    }
  }
  return out;
}
