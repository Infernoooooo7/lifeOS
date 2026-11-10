import { addDays, ymd } from './dates';

/**
 * Parses a quick-add line such as "Pay rent tomorrow 9am !high #home" into task fields.
 * Recognised: today / tomorrow / weekday names / "next week" / "in N days" / YYYY-MM-DD,
 * an optional clock time, !low !medium !high (or p1–p3), and #tags. Everything else is the title.
 */
export interface QuickTask {
  title: string;
  dueAt?: string;
  priority?: number;
  tags?: string[];
}

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const PRIORITY: Record<string, number> = { low: 1, l: 1, medium: 2, med: 2, m: 2, high: 3, h: 3, urgent: 3 };

export function parseQuickTask(input: string, now: Date = new Date()): QuickTask {
  let text = ` ${input.trim()} `;
  const out: QuickTask = { title: '' };
  const tags: string[] = [];

  text = text.replace(/\s#([\p{L}\p{N}_-]+)/gu, (_, tag: string) => {
    if (!tags.includes(tag)) tags.push(tag);
    return ' ';
  });
  text = text.replace(/\s!(low|l|medium|med|m|high|h|urgent)(?=\s)/i, (_, p: string) => {
    out.priority = PRIORITY[p.toLowerCase()];
    return ' ';
  });
  text = text.replace(/\sp([123])(?=\s)/i, (_, n: string) => {
    out.priority = 4 - Number(n);
    return ' ';
  });

  let date: Date | null = null;
  const take = (re: RegExp, fn: (m: RegExpExecArray) => Date | null) => {
    if (date) return;
    const m = re.exec(text);
    if (!m) return;
    const d = fn(m);
    if (d) {
      date = d;
      text = text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length);
    }
  };
  take(/\s(\d{4})-(\d{2})-(\d{2})(?=\s)/, (m) => new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  take(/\s(today|tonight)(?=\s)/i, () => now);
  take(/\s(tomorrow|tmrw|tmr)(?=\s)/i, () => addDays(now, 1));
  take(/\snext week(?=\s)/i, () => addDays(now, 7));
  take(/\sin (\d{1,3}) days?(?=\s)/i, (m) => addDays(now, Number(m[1])));
  take(new RegExp(`\\s(?:on |next )?(${WEEKDAYS.join('|')}|${WEEKDAYS.map((d) => d.slice(0, 3)).join('|')})(?=\\s)`, 'i'), (m) => {
    const target = WEEKDAYS.findIndex((d) => d.startsWith(m[1].toLowerCase().slice(0, 3)));
    const delta = (target - now.getDay() + 7) % 7 || 7;
    return addDays(now, delta);
  });

  let time: { h: number; m: number } | null = null;
  const tm = /\s(?:at )?(\d{1,2})(?::(\d{2}))?\s?(am|pm)(?=\s)/i.exec(text) ?? /\s(?:at )(\d{1,2}):(\d{2})(?=\s)/.exec(text);
  if (tm) {
    let h = Number(tm[1]);
    const mins = Number(tm[2] ?? 0);
    const ap = tm[3]?.toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (h < 24 && mins < 60) {
      time = { h, m: mins };
      text = text.slice(0, tm.index) + ' ' + text.slice(tm.index + tm[0].length);
    }
  }
  if (time) {
    const base: Date = date ?? now;
    out.dueAt = new Date(base.getFullYear(), base.getMonth(), base.getDate(), time.h, time.m).toISOString();
  } else if (date) out.dueAt = ymd(date);

  if (tags.length) out.tags = tags;
  out.title = text.replace(/\s+/g, ' ').trim();
  return out;
}
