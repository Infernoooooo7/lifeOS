import { parseCsv } from './csv';

/**
 * Importers for data from other apps. Pure parsers: file text in, LIFEOS records out. Every record gets a
 * deterministic id derived from its source, so importing the same file twice updates instead of duplicating.
 */

export interface ImportRecord {
  collection: string;
  id: string;
  data: Record<string, unknown>;
}

export interface ImportResult {
  records: ImportRecord[];
  /** human-readable notes about what was skipped or approximated */
  warnings: string[];
}

/** Small stable hash (FNV-1a, 32-bit) for ids. */
export function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (y: number, m: number, d: number) => (y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : null);
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Dates as exports write them: 2026-11-20, 20261120, 20 Nov 2026, Nov 20, 11/20/2026 (order given by `order`). */
export function parseLooseDate(text: string, now = new Date(), order: 'dmy' | 'mdy' = 'dmy'): string | null {
  const t = text.trim().toLowerCase();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return isoDate(+m[1], +m[2], +m[3]);
  m = /^(\d{4})(\d{2})(\d{2})/.exec(t);
  if (m) return isoDate(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.'-](\d{2,4})$/.exec(t.replace(/\s/g, ''));
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return order === 'mdy' ? isoDate(y, +m[1], +m[2]) : isoDate(y, +m[2], +m[1]);
  }
  m = /^(\d{1,2})\s+([a-z]{3})[a-z]*\.?,?\s*(\d{4})?$/.exec(t);
  if (m && MONTHS.includes(m[2])) return isoDate(m[3] ? +m[3] : now.getFullYear(), MONTHS.indexOf(m[2]) + 1, +m[1]);
  m = /^([a-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s*(\d{4})?$/.exec(t);
  if (m && MONTHS.includes(m[1])) return isoDate(m[3] ? +m[3] : now.getFullYear(), MONTHS.indexOf(m[1]) + 1, +m[2]);
  return null;
}

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

// ── Todoist (CSV export of a project) ──────────────────────────────────────────────────────────────

/** Todoist writes priority 1 for its highest (red) priority and 4 for none. */
const TODOIST_PRIORITY: Record<string, number> = { '1': 3, '2': 2, '3': 1, '4': 0 };

export function importTodoistCsv(text: string, fileName = 'Todoist', now = new Date()): ImportResult {
  const rows = parseCsv(text.replace(/^﻿/, ''));
  const warnings: string[] = [];
  if (!rows.length) return { records: [], warnings: ['The file is empty.'] };
  const head = rows[0].map((h) => h.trim().toUpperCase());
  const col = (name: string) => head.indexOf(name);
  if (col('TYPE') < 0 || col('CONTENT') < 0) return { records: [], warnings: ['This does not look like a Todoist CSV export (no TYPE and CONTENT columns).'] };
  const projectName = fileName.replace(/\.csv$/i, '').replace(/[_-]+/g, ' ').trim() || 'Todoist';
  const projectId = `pj:todoist:${hash(projectName)}`;
  const records: ImportRecord[] = [{ collection: 'projects', id: projectId, data: { name: projectName, status: 'active' } }];
  const parents: string[] = [];
  let section = '';
  let lastTask: ImportRecord | null = null;
  let repeating = 0;
  rows.slice(1).forEach((row, index) => {
    const get = (name: string) => (col(name) >= 0 ? (row[col(name)] ?? '').trim() : '');
    const type = get('TYPE').toLowerCase();
    const content = get('CONTENT');
    if (!content && type !== 'note') return;
    if (type === 'section') {
      section = content;
      return;
    }
    if (type === 'note' && lastTask) {
      lastTask.data.notes = [lastTask.data.notes, content].filter(Boolean).join('\n\n');
      return;
    }
    if (type !== 'task') return;
    const labels = [...content.matchAll(/(?:^|\s)@([\p{L}\p{N}_-]+)/gu)].map((m) => m[1].toLowerCase());
    const title = content.replace(/(?:^|\s)@[\p{L}\p{N}_-]+/gu, '').trim() || content;
    const indent = Math.max(1, Number(get('INDENT')) || 1);
    parents.length = indent - 1;
    const parentId = indent > 1 ? parents[indent - 2] : undefined;
    const rawDate = get('DATE');
    let dueAt: string | null = null;
    let notes = get('DESCRIPTION');
    if (rawDate) {
      if (/^every\b|^ev\b/i.test(rawDate)) {
        repeating++;
        notes = [notes, `Repeated in Todoist: ${rawDate}`].filter(Boolean).join('\n\n');
      } else dueAt = /^today$/i.test(rawDate) ? new Date(now).toISOString().slice(0, 10) : parseLooseDate(rawDate, now);
    }
    const id = `tk:todoist:${hash(`${projectName}|${index}|${content}`)}`;
    const task: ImportRecord = {
      collection: 'tasks', id,
      data: {
        title, status: 'todo', priority: TODOIST_PRIORITY[get('PRIORITY')] ?? 0, dueAt, projectId, ...(parentId ? { parentId } : {}),
        tags: [...new Set([...labels, ...(section ? [slug(section)] : [])])].filter(Boolean), ...(notes ? { notes } : {}),
      },
    };
    parents[indent - 1] = id;
    records.push(task);
    lastTask = task;
  });
  if (repeating) warnings.push(`${repeating} repeating task${repeating === 1 ? '' : 's'} came in without a repeat rule; the original rule is kept in the task notes.`);
  return { records, warnings };
}

// ── Google Keep (Takeout JSON, one file per note) ──────────────────────────────────────────────────

interface KeepNote {
  title?: string;
  textContent?: string;
  listContent?: { text?: string; isChecked?: boolean }[];
  labels?: { name?: string }[];
  annotations?: { url?: string; title?: string }[];
  isTrashed?: boolean;
  isArchived?: boolean;
  isPinned?: boolean;
  createdTimestampUsec?: number;
}

export function importKeepNotes(files: { name: string; text: string }[]): ImportResult {
  const records: ImportRecord[] = [];
  const warnings: string[] = [];
  let trashed = 0;
  let unreadable = 0;
  for (const f of files) {
    if (!/\.json$/i.test(f.name)) continue;
    let note: KeepNote;
    try {
      note = JSON.parse(f.text);
    } catch {
      unreadable++;
      continue;
    }
    if (!note || typeof note !== 'object' || (!('textContent' in note) && !('listContent' in note))) {
      unreadable++;
      continue;
    }
    if (note.isTrashed) {
      trashed++;
      continue;
    }
    const parts: string[] = [];
    if (note.textContent) parts.push(note.textContent);
    if (note.listContent?.length) parts.push(note.listContent.map((i) => `- [${i.isChecked ? 'x' : ' '}] ${i.text ?? ''}`).join('\n'));
    if (note.annotations?.length) parts.push(note.annotations.filter((a) => a.url).map((a) => `- [${a.title || a.url}](${a.url})`).join('\n'));
    const title = note.title?.trim() || (note.textContent ?? note.listContent?.[0]?.text ?? '').split('\n')[0].slice(0, 80) || 'Untitled';
    records.push({
      collection: 'notes',
      id: `nt:keep:${hash(`${note.createdTimestampUsec ?? ''}|${f.name}`)}`,
      data: {
        title, content: parts.join('\n\n'), pinned: !!note.isPinned, archived: !!note.isArchived,
        tags: [...new Set((note.labels ?? []).map((l) => slug(l.name ?? '')).filter(Boolean)), 'keep'],
      },
    });
  }
  if (trashed) warnings.push(`${trashed} note${trashed === 1 ? '' : 's'} in Keep's trash ${trashed === 1 ? 'was' : 'were'} skipped.`);
  if (unreadable) warnings.push(`${unreadable} file${unreadable === 1 ? '' : 's'} did not look like Keep notes and ${unreadable === 1 ? 'was' : 'were'} skipped.`);
  return { records, warnings };
}

// ── Markdown (Notion, Obsidian, Bear, plain files) ─────────────────────────────────────────────────

export function importMarkdownNotes(files: { name: string; text: string }[]): ImportResult {
  const records: ImportRecord[] = [];
  for (const f of files) {
    if (!/\.(md|markdown|txt)$/i.test(f.name)) continue;
    let body = f.text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
    let title = f.name.replace(/^.*[\\/]/, '').replace(/\.(md|markdown|txt)$/i, '').replace(/\s+[0-9a-f]{32}$/i, '').trim();
    const tags: string[] = [];
    const front = /^---\n([\s\S]*?)\n---\n?/.exec(body);
    if (front) {
      body = body.slice(front[0].length);
      const fm = front[1];
      const t = /^title:\s*["']?(.+?)["']?\s*$/m.exec(fm);
      if (t) title = t[1];
      const inline = /^tags:\s*\[(.*)\]\s*$/m.exec(fm);
      if (inline) tags.push(...inline[1].split(',').map((x) => x.trim().replace(/^["'#]|["']$/g, '')));
      const block = /^tags:\s*\n((?:\s*-\s*.+\n?)+)/m.exec(fm);
      if (block) tags.push(...block[1].split('\n').map((x) => x.replace(/^\s*-\s*/, '').trim().replace(/^["'#]|["']$/g, '')));
    }
    const heading = /^#\s+(.+)\n+/.exec(body);
    if (heading) {
      title = heading[1].trim();
      body = body.slice(heading[0].length);
    }
    records.push({ collection: 'notes', id: `nt:md:${hash(f.name)}`, data: { title: title || 'Untitled', content: body.trim(), tags: [...new Set(tags.map(slug).filter(Boolean))] } });
  }
  return { records, warnings: [] };
}

// ── Bank statements (OFX / QFX and QIF) ────────────────────────────────────────────────────────────

const CATEGORY_HINTS: [RegExp, string][] = [
  [/grocer|supermarket|bigbasket|blinkit|zepto|dmart|reliance fresh|whole foods|tesco|walmart|kroger|aldi|lidl/i, 'Groceries'],
  [/swiggy|zomato|restaurant|cafe|coffee|starbucks|domino|pizza|mcdonald|kfc|burger|bistro|diner|dinner|lunch|breakfast|brunch|snacks?\b/i, 'Dining'],
  [/uber|ola\b|lyft|rapido|metro|railway|irctc|fuel|petrol|diesel|shell|parking|toll|bus\b|taxi|cab\b|auto\b|train ticket/i, 'Transport'],
  [/netflix|spotify|prime video|hotstar|youtube premium|apple\.com\/bill|icloud|subscription/i, 'Subscriptions'],
  [/\brent\b|landlord|housing society/i, 'Rent'],
  [/electric|water bill|gas bill|broadband|airtel|jio|vodafone|internet|utility/i, 'Utilities'],
  [/pharma|chemist|hospital|clinic|doctor|apollo|medical|dental/i, 'Health'],
  [/amazon|flipkart|myntra|ajio|ebay|ikea|mall/i, 'Shopping'],
  [/school|college|tuition|udemy|coursera|books?\b/i, 'Education'],
  [/insurance|lic\b|premium/i, 'Insurance'],
  [/airline|indigo|air india|vistara|hotel|airbnb|booking\.com|makemytrip/i, 'Travel'],
  [/movie|cinema|pvr|inox|bookmyshow|concert|steam|playstation/i, 'Entertainment'],
];
const INCOME_HINTS: [RegExp, string][] = [
  [/salary|payroll|wages/i, 'Salary'],
  [/interest/i, 'Interest'],
  [/dividend/i, 'Dividends'],
  [/refund|reversal|cashback/i, 'Refund'],
];

/** A first guess at a category from the payee text; anything unrecognised is "Other". */
export function guessCategory(text: string, type: 'expense' | 'income'): string {
  for (const [re, cat] of type === 'income' ? INCOME_HINTS : CATEGORY_HINTS) if (re.test(text)) return cat;
  return 'Other';
}

function transaction(source: string, key: string, date: string, signed: number, payee: string, memo: string, extra: Record<string, unknown> = {}): ImportRecord {
  const type = signed < 0 ? 'expense' : 'income';
  return {
    collection: 'transactions',
    id: `tx:${source}:${hash(key)}`,
    data: { type, amount: Math.round(Math.abs(signed) * 100) / 100, date, payee: payee || memo || 'Bank transaction', ...(memo && memo !== payee ? { note: memo } : {}), category: guessCategory(`${payee} ${memo}`, type), tags: ['imported'], ...extra },
  };
}

const ofxField = (block: string, tag: string) => {
  const m = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i').exec(block);
  return m ? m[1].trim().replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') : '';
};

export function importOfx(text: string): ImportResult {
  const warnings: string[] = [];
  const currency = ofxField(text, 'CURDEF');
  const account = ofxField(text, 'ACCTID');
  const records: ImportRecord[] = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>/i)[0]);
  if (!blocks.length) return { records, warnings: ['No transactions found. Is this an OFX or QFX statement?'] };
  for (const b of blocks) {
    const date = parseLooseDate(ofxField(b, 'DTPOSTED'));
    const amount = Number(ofxField(b, 'TRNAMT').replace(',', '.'));
    if (!date || !Number.isFinite(amount) || amount === 0) continue;
    const fitid = ofxField(b, 'FITID') || `${date}|${amount}|${ofxField(b, 'NAME')}`;
    records.push(transaction('ofx', `${account}|${fitid}`, date, amount, ofxField(b, 'NAME'), ofxField(b, 'MEMO'), currency ? { currency } : {}));
  }
  if (records.length < blocks.length) warnings.push(`${blocks.length - records.length} line${blocks.length - records.length === 1 ? '' : 's'} without a date or amount ${blocks.length - records.length === 1 ? 'was' : 'were'} skipped.`);
  return { records, warnings };
}

export function importQif(text: string, order: 'dmy' | 'mdy' = 'mdy'): ImportResult {
  const records: ImportRecord[] = [];
  const warnings: string[] = [];
  const seen = new Map<string, number>();
  let skipped = 0;
  const entries = text.replace(/\r\n/g, '\n').split(/^\^\s*$/m);
  for (const entry of entries) {
    const lines = entry.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('!'));
    if (!lines.length) continue;
    const field = (code: string) => lines.find((l) => l.startsWith(code))?.slice(1).trim() ?? '';
    const date = parseLooseDate(field('D'), new Date(), order);
    const amount = Number((field('T') || field('U')).replace(/,/g, ''));
    if (!date || !Number.isFinite(amount) || amount === 0) {
      skipped++;
      continue;
    }
    const payee = field('P');
    const key = `${date}|${amount}|${payee}|${field('N')}`;
    const n = (seen.get(key) ?? 0) + 1;
    seen.set(key, n);
    const rec = transaction('qif', `${key}|${n}`, date, amount, payee, field('M'));
    const category = field('L');
    if (category && !category.startsWith('[')) rec.data.category = category.split(':')[0];
    records.push(rec);
  }
  if (skipped) warnings.push(`${skipped} entr${skipped === 1 ? 'y' : 'ies'} without a date or amount ${skipped === 1 ? 'was' : 'were'} skipped.`);
  return { records, warnings };
}
