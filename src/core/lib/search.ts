import { getDb, type Rec } from '@/core/data/db';
import { GLOBAL_COLLECTIONS, ctx, titleOf } from '@/core/data/store';

export interface SearchHit {
  rec: Rec;
  title: string;
  snippet: string;
  score: number;
}

const HIDDEN = new Set(['conflicts', 'settings', 'modulePrefs', 'activity', 'noteVersions', 'habitLogs', 'workspaces', 'dashboards', 'waterLogs', 'focusSessions']);

/**
 * True when `a` and `b` are within `k` edits (insert, delete, substitute, or swap two neighbours).
 * Bounded and early-exiting, so it stays cheap when run against every word of every record.
 */
export function withinEdits(a: string, b: string, k: number): boolean {
  if (Math.abs(a.length - b.length) > k) return false;
  if (a === b) return true;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < best) best = v;
    }
    if (best > k) return false;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length] <= k;
}

/** Typos allowed for a query word of this length: none for short words, one from 4 letters, two from 7. */
const allowance = (term: string) => (term.length >= 7 ? 2 : term.length >= 4 ? 1 : 0);
const WORD = /[\p{L}\p{N}]+/gu;

/** Distinct words of a text, cached per record version so repeated keystrokes do not re-tokenise everything. */
const wordCache = new Map<string, string[]>();
function wordsOf(text: string, key?: string): string[] {
  if (key) {
    const hit = wordCache.get(key);
    if (hit) return hit;
  }
  const words = [...new Set(Array.from(text.matchAll(WORD), (m) => m[0]))].filter((w) => w.length >= 3);
  if (key) {
    if (wordCache.size > 20_000) wordCache.clear();
    wordCache.set(key, words);
  }
  return words;
}

/** Does any word in `text` match `term` with typos, either whole or as the start of a longer word? */
function fuzzyIn(text: string, term: string, key?: string): boolean {
  const k = allowance(term);
  if (!k) return false;
  let memo = verdicts.get(term);
  if (!memo) {
    if (verdicts.size > 16) verdicts.clear();
    verdicts.set(term, (memo = new Map()));
  }
  for (const word of wordsOf(text, key)) {
    if (word.length < term.length - k) continue;
    let yes = memo.get(word);
    if (yes === undefined) {
      // Whole word, or its beginning ("calend" typed as "calnd" still finds "calendar").
      yes = withinEdits(term, word, k) || (word.length > term.length && withinEdits(term, word.slice(0, term.length), k));
      memo.set(word, yes);
    }
    if (yes) return true;
  }
  return false;
}

/** Per query word: which vocabulary words it matches. Records share most words, so each is compared once. */
const verdicts = new Map<string, Map<string, boolean>>();

/**
 * Score a record against query terms. Every term must match. Exact matches rank above typo-tolerant ones,
 * and matches in the title rank above matches in the body; recently touched records get a slight lift.
 */
export function scoreRecord(rec: Rec, terms: string[]): number {
  const text = rec._s ?? '';
  const title = titleOf(rec).toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (text.includes(term)) {
      if (title === term) score += 12;
      else if (title.startsWith(term)) score += 8;
      else if (title.includes(` ${term}`)) score += 6;
      else if (title.includes(term)) score += 4;
      else score += 1;
    } else if (fuzzyIn(title, term)) score += 3;
    else if (fuzzyIn(text, term, `${rec.id}@${rec._ua}`)) score += 0.5;
    else return 0;
  }
  const ageDays = (Date.now() - rec._ua) / 86_400_000;
  return score + Math.max(0, 1 - ageDays / 365);
}

export function snippetFor(rec: Rec, terms: string[]): string {
  const body = String(rec.content ?? rec.notes ?? rec.description ?? rec.note ?? rec.body ?? '').replace(/\s+/g, ' ');
  if (!body) return '';
  const lower = body.toLowerCase();
  const at = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, at - 30);
  return (start > 0 ? '…' : '') + body.slice(start, start + 110) + (body.length > start + 110 ? '…' : '');
}

/**
 * Universal search across every collection on this device (active workspace only, enabled modules only).
 * Runs entirely against IndexedDB, so it works offline.
 */
export async function search(query: string, opts: { limit?: number; collections?: Set<string> } = {}): Promise<SearchHit[]> {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  if (!terms.length) return [];
  const scored: { rec: Rec; score: number }[] = [];
  await getDb().records.each((rec) => {
    if (rec.deletedAt || HIDDEN.has(rec._c)) return;
    if (opts.collections && !opts.collections.has(rec._c)) return;
    if (!GLOBAL_COLLECTIONS.has(rec._c) && rec.ws && rec.ws !== ctx.ws) return;
    const score = scoreRecord(rec, terms);
    if (score > 0) scored.push({ rec, score });
  });
  scored.sort((a, b) => b.score - a.score);
  // Titles and snippets only for the hits that are shown.
  return scored.slice(0, opts.limit ?? 40).map(({ rec, score }) => ({ rec, score, title: titleOf(rec), snippet: snippetFor(rec, terms) }));
}
