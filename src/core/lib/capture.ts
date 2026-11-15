import { addDays, ymd } from './dates';
import { guessCategory } from './importers';
import { parseQuickTask } from './quickadd';

/**
 * Smart capture: one line in, the right kind of record out — without any AI service. "spent 450 on dinner at Toit"
 * is an expense, "lunch with Ravi tomorrow 1pm" an event, "remind me to call mom at 6pm" a reminder, a URL a link,
 * "idea: …" an idea; anything else is a task (with dates, priorities and #tags understood).
 */

export type CaptureKind = 'task' | 'note' | 'idea' | 'reminder' | 'expense' | 'event' | 'link' | 'goal';

export interface SmartCapture {
  kind: CaptureKind;
  title: string;
  /** ISO date-time or YYYY-MM-DD */
  when?: string;
  amount?: number;
  category?: string;
  priority?: number;
  tags?: string[];
  url?: string;
}

const MONEY = String.raw`(?:₹|rs\.?|inr|\$|usd|€|eur|£|gbp)`;
// "1,200" and Indian "1,20,000" group thousands; a decimal part uses a dot.
const AMOUNT = String.raw`(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;
const EVENT_WORDS = /\b(meet(ing)?|lunch with|dinner with|breakfast with|coffee with|drinks with|call with|appointment|interview|party|wedding|flight|class|lecture|session|webinar|conference|standup|catch[- ]up|date with|birthday|concert|match|dentist|doctor)\b/i;

const num = (s: string) => Number(s.replace(/,/g, ''));

export function classifyCapture(input: string, now: Date = new Date()): SmartCapture {
  const text = input.trim();
  if (!text) return { kind: 'task', title: '' };

  // Links
  const url = /^(https?:\/\/\S+|www\.\S+)/i.exec(text);
  if (url) return { kind: 'link', title: text.slice(url[0].length).trim(), url: url[0].startsWith('http') ? url[0] : `https://${url[0]}` };

  // Explicit prefixes
  const prefixed = /^(idea|note|goal|task|todo|event|reminder)\s*[:\-–]\s*(.+)$/i.exec(text);
  if (prefixed) {
    const k = prefixed[1].toLowerCase();
    const rest = prefixed[2].trim();
    if (k === 'idea' || k === 'note' || k === 'goal') return { kind: k, title: rest };
    if (k === 'reminder') return reminder(rest, now);
    if (k === 'event') return event(rest, now) ?? { kind: 'event', title: rest };
    return task(rest, now);
  }

  // Expenses: an amount with spending words or a currency mark
  const spentWords = /\b(spent|paid|pay(ed)?|bought|cost|for|on|bill)\b/i;
  const withCurrency = new RegExp(String.raw`(?:${MONEY}\s*${AMOUNT}|${AMOUNT}\s*(?:${MONEY}|rupees|bucks|dollars))`, 'i').exec(text);
  const plain = new RegExp(String.raw`^(?:spent|paid|bought\s.+?\sfor)\s+${AMOUNT}\b|\b(?:spent|paid)\s+${AMOUNT}\b|^${AMOUNT}\s+(?:on|for)\b`, 'i').exec(text);
  if (withCurrency || (plain && spentWords.test(text))) {
    const m = withCurrency ?? plain!;
    const amount = num(m.slice(1).find((g) => g !== undefined) ?? '0');
    if (amount > 0) {
      let rest = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/\b(spent|paid|bought|on|for|rupees|bucks|dollars)\b/gi, ' ');
      let when: string | undefined;
      if (/\byesterday\b/i.test(rest)) { when = ymd(addDays(now, -1)); rest = rest.replace(/\byesterday\b/i, ' '); }
      else if (/\btoday\b/i.test(rest)) rest = rest.replace(/\btoday\b/i, ' ');
      const title = rest.replace(/\s+/g, ' ').replace(/^(at|to)\s+/i, '').trim();
      return { kind: 'expense', title: title || 'Expense', amount, category: guessCategory(title, 'expense'), when: when ?? ymd(now) };
    }
  }

  // Reminders
  const remind = /^(?:remind me(?:\s+to)?|don'?t forget(?:\s+to)?)\s+(.+)$/i.exec(text);
  if (remind) return reminder(remind[1], now);

  // Goals
  if (/^(?:i want to|my goal is to|goal\b)/i.test(text)) return { kind: 'goal', title: text.replace(/^(?:i want to|my goal is to|goal)\s*/i, '').replace(/^./, (c) => c.toUpperCase()) };

  // Events: meeting-like words plus a date or time
  if (EVENT_WORDS.test(text)) {
    const e = event(text, now);
    if (e) return e;
  }
  return task(text, now);
}

function task(text: string, now: Date): SmartCapture {
  const p = parseQuickTask(text, now);
  return { kind: 'task', title: p.title || text, ...(p.dueAt ? { when: p.dueAt } : {}), ...(p.priority ? { priority: p.priority } : {}), ...(p.tags ? { tags: p.tags } : {}) };
}

function reminder(text: string, now: Date): SmartCapture {
  const p = parseQuickTask(text, now);
  let when = p.dueAt;
  // A reminder without a time is for 9:00 on that day (or in an hour when no day is given).
  if (!when) { const d = new Date(now); d.setHours(d.getHours() + 1, 0, 0, 0); when = d.toISOString(); }
  else if (when.length === 10) when = new Date(`${when}T09:00:00`).toISOString();
  return { kind: 'reminder', title: (p.title || text).replace(/^./, (c) => c.toUpperCase()), when };
}

function event(text: string, now: Date): SmartCapture | null {
  const p = parseQuickTask(text, now);
  if (!p.dueAt) return null;
  return { kind: 'event', title: (p.title || text).replace(/^./, (c) => c.toUpperCase()), when: p.dueAt };
}
