import { fromRRule, toRRule, type Recurrence } from './recurrence';

/** iCalendar (RFC 5545) import/export for the event fields LIFEOS uses. */

export interface IcsEvent {
  uid?: string;
  title: string;
  description?: string;
  location?: string;
  startAt: string;
  endAt?: string | null;
  allDay?: boolean;
  recurrence?: Recurrence | null;
}

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
const unesc = (s: string) => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
const pad = (n: number) => String(n).padStart(2, '0');
const utc = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const day = (d: Date) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;

/** Lines longer than 75 octets must be folded. */
const fold = (line: string) => line.match(/.{1,73}/gu)?.join('\r\n ') ?? line;

export function toIcs(events: IcsEvent[], calendarName = 'LIFEOS'): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LIFEOS//Calendar//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(calendarName)}`];
  const stamp = utc(new Date());
  for (const e of events) {
    const start = new Date(e.startAt);
    if (Number.isNaN(start.getTime())) continue;
    lines.push('BEGIN:VEVENT', `UID:${e.uid ?? `${start.getTime()}-${Math.random().toString(36).slice(2)}`}@lifeos`, `DTSTAMP:${stamp}`);
    if (e.allDay) {
      const end = e.endAt ? new Date(e.endAt) : start;
      const next = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${day(start)}`, `DTEND;VALUE=DATE:${day(next)}`);
    } else {
      lines.push(`DTSTART:${utc(start)}`);
      if (e.endAt) lines.push(`DTEND:${utc(new Date(e.endAt))}`);
    }
    lines.push(`SUMMARY:${esc(e.title || 'Untitled')}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    if (e.recurrence) lines.push(`RRULE:${toRRule(e.recurrence)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

function parseStamp(value: string, params: string): { iso: string; allDay: boolean } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined || /VALUE=DATE(?!-)/i.test(params)) {
    return { iso: new Date(Number(y), Number(mo) - 1, Number(d)).toISOString(), allDay: true };
  }
  const date = z
    ? new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0)))
    : new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0)); // floating / TZID times are read as local
  return { iso: date.toISOString(), allDay: false };
}

export function parseIcs(text: string): IcsEvent[] {
  const unfolded = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '');
  const events: IcsEvent[] = [];
  let cur: (Partial<IcsEvent> & { _end?: string }) | null = null;
  for (const line of unfolded.split('\n')) {
    if (line === 'BEGIN:VEVENT') cur = {};
    else if (line === 'END:VEVENT') {
      if (cur?.startAt) {
        let endAt = cur.endAt ?? null;
        if (cur.allDay && endAt) {
          // DTEND is exclusive for all-day events
          const e = new Date(endAt);
          endAt = new Date(e.getFullYear(), e.getMonth(), e.getDate() - 1).toISOString();
          if (new Date(endAt) < new Date(cur.startAt)) endAt = cur.startAt;
        }
        events.push({ uid: cur.uid, title: cur.title || 'Untitled', description: cur.description, location: cur.location, startAt: cur.startAt, endAt, allDay: !!cur.allDay, recurrence: cur.recurrence ?? null });
      }
      cur = null;
    } else if (cur) {
      const i = line.indexOf(':');
      if (i < 0) continue;
      const head = line.slice(0, i);
      const value = line.slice(i + 1);
      const [name, ...rest] = head.split(';');
      const params = rest.join(';');
      switch (name.toUpperCase()) {
        case 'UID': cur.uid = value.replace(/@lifeos$/, ''); break;
        case 'SUMMARY': cur.title = unesc(value); break;
        case 'DESCRIPTION': cur.description = unesc(value); break;
        case 'LOCATION': cur.location = unesc(value); break;
        case 'DTSTART': {
          const p = parseStamp(value, params);
          if (p) {
            cur.startAt = p.iso;
            cur.allDay = p.allDay;
          }
          break;
        }
        case 'DTEND': {
          const p = parseStamp(value, params);
          if (p) cur.endAt = p.iso;
          break;
        }
        case 'RRULE': cur.recurrence = fromRRule(value); break;
      }
    }
  }
  return events;
}
