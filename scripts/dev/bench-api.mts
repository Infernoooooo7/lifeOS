// API benchmark against PostgreSQL (TEST_DATABASE_URL). Usage: npx tsx scripts/dev/bench-api.mts
import pg from 'pg';
import { prepareDatabase, signUp, TEST_DB } from '../../tests/api/setup';

prepareDatabase();
// Count every statement the app sends (the Prisma pg adapter goes through pg.Client#query / pg.Pool#query).
let queries = 0;
const origClient = pg.Client.prototype.query;
(pg.Client.prototype as unknown as { query: (...a: unknown[]) => unknown }).query = function (this: pg.Client, ...args: unknown[]) {
  if (this !== stats) queries++;
  const res = (origClient as (...a: unknown[]) => unknown).apply(this, args);
  if (process.env.SLOW && this !== stats && res && typeof (res as Promise<unknown>).then === 'function') {
    const t = performance.now();
    const text = typeof args[0] === 'string' ? args[0] : (args[0] as { text?: string })?.text ?? '';
    (res as Promise<unknown>).then(() => { const d = performance.now() - t; if (d > Number(process.env.SLOW)) console.log(`  slow ${d.toFixed(0)}ms ${text.slice(0, 140).replace(/\s+/g, ' ')}`); }, () => undefined);
  }
  return res;
};
const stats = new pg.Client({ connectionString: TEST_DB });
await stats.connect();

async function measure(label: string, runs: number, fn: (i: number) => Promise<unknown>) {
  const q0 = queries;
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) await fn(i);
  const ms = (performance.now() - t0) / runs;
  console.log(`${label.padEnd(34)} ${ms.toFixed(1).padStart(8)} ms   ${((queries - q0) / runs).toFixed(1).padStart(6)} queries`);
}

const a = await signUp();
const b = await signUp();
const now = Date.now();
const task = (i: number, extra: Record<string, unknown> = {}) => ({ id: `t-${i}`, c: 'tasks', base: null, patch: { title: `Task ${i}`, status: 'todo', priority: i % 4, tags: ['bench'], ...extra }, ca: now, ua: now });
const note = (i: number) => ({ id: `n-${i}`, c: 'notes', base: null, patch: { title: `Note ${i}`, content: 'x'.repeat(400) }, ca: now, ua: now });
const doc = (i: number) => ({ id: `bm-${i}`, c: 'bookmarks', base: null, patch: { title: `Link ${i}`, url: 'https://example.com' }, ca: now, ua: now });

await measure('idle poll (nothing new)', 50, () => a.client.post('sync', { cursor: 0, changes: [] }));
let cursor = 0;
await measure('push 500 new records (3 kinds)', 1, async () => {
  const changes = [...Array.from({ length: 300 }, (_, i) => task(i, i > 0 && i % 10 === 0 ? { parentId: `t-${i - 1}` } : {})), ...Array.from({ length: 100 }, (_, i) => note(i)), ...Array.from({ length: 100 }, (_, i) => doc(i))];
  for (let i = 0; i < changes.length; i += 200) {
    const r = await a.client.post('sync', { cursor, changes: changes.slice(i, i + 200) });
    if (r.status !== 200 || r.data.applied.length !== Math.min(200, changes.length - i)) throw new Error(`push failed ${r.status} ${JSON.stringify(r.data).slice(0, 300)}`);
    cursor = r.data.cursor;
  }
});
await measure('idle poll after writes', 50, () => a.client.post('sync', { cursor, changes: [] }));
await measure('push 20 edits', 5, (k) => a.client.post('sync', { cursor, changes: Array.from({ length: 20 }, (_, i) => ({ id: `t-${i}`, c: 'tasks', base: { title: k ? `Edit ${k - 1}` : `Task ${i}` }, patch: { title: `Edit ${k}` }, ca: now, ua: Date.now() })) }));
await measure('push 1 edit', 20, (k) => a.client.post('sync', { cursor, changes: [{ id: 't-200', c: 'tasks', base: null, patch: { priority: k % 4 }, ca: now, ua: Date.now() }] }));
await measure('pull everything (new device)', 3, async () => {
  let c = 0, more = true, n = 0;
  while (more) { const r = await b.client.post('sync', { cursor: c, changes: [] }); c = r.data.cursor; more = r.data.more; n += r.data.records.length; }
  return n;
});
const dev2 = { ...a.client } as typeof a.client;
await measure('pull everything, same account', 3, async () => {
  let c = 0, more = true;
  while (more) { const r = await a.client.post('sync', { cursor: c, changes: [] }); if (r.status !== 200) throw new Error(JSON.stringify(r.data)); c = r.data.cursor; more = r.data.more; }
});
void dev2;
await measure('export account', 2, () => a.client.get('export'));
await stats.end();
process.exit(0);
