import { getDb, type Rec } from '@/core/data/db';
import { GLOBAL_COLLECTIONS, ctx, titleOf } from '@/core/data/store';

export interface SearchHit {
  rec: Rec;
  title: string;
  snippet: string;
  score: number;
}

const HIDDEN = new Set(['settings', 'modulePrefs', 'activity', 'noteVersions', 'habitLogs', 'workspaces', 'dashboards', 'waterLogs', 'focusSessions']);

/** Score a record against query terms: every term must match; title matches rank above body matches. */
export function scoreRecord(rec: Rec, terms: string[]): number {
  const text = rec._s ?? '';
  const title = titleOf(rec).toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (!text.includes(term)) return 0;
    if (title === term) score += 12;
    else if (title.startsWith(term)) score += 8;
    else if (title.includes(` ${term}`)) score += 6;
    else if (title.includes(term)) score += 4;
    else score += 1;
  }
  // Slight preference for recently touched records.
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
  const hits: SearchHit[] = [];
  await getDb().records.each((rec) => {
    if (rec.deletedAt || HIDDEN.has(rec._c)) return;
    if (opts.collections && !opts.collections.has(rec._c)) return;
    if (!GLOBAL_COLLECTIONS.has(rec._c) && rec.ws && rec.ws !== ctx.ws) return;
    const score = scoreRecord(rec, terms);
    if (score > 0) hits.push({ rec, title: titleOf(rec), snippet: snippetFor(rec, terms), score });
  });
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, opts.limit ?? 40);
}
