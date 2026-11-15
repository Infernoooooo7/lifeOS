import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/sw.js/route';

/**
 * Runs the real service worker source against an in-memory Cache API and a scripted network, to check what it serves
 * and what it stores, especially when the host answers with its own "waking up" page instead of the app.
 */

const ORIGIN = 'https://lifeos.test';
type Req = string | { url: string; method?: string; mode?: string };
const keyOf = (r: Req) => new URL(typeof r === 'string' ? r : r.url, ORIGIN).href;

class MemoryCache {
  entries = new Map<string, Response>();
  async match(r: Req) {
    return this.entries.get(keyOf(r))?.clone();
  }
  async put(r: Req, res: Response) {
    this.entries.set(keyOf(r), res);
  }
}

const ours = (body: string, type = 'text/html') => new Response(body, { status: 200, headers: { 'content-type': type, 'x-lifeos-app': '1' } });
const wakingUp = () => new Response('<h1>Service waking up</h1>', { status: 200, headers: { 'content-type': 'text/html' } });
const page = (version: string) => `<!doctype html><title>LIFEOS ${version}</title><script src="/_next/static/chunks/${version}.js"></script>`;

let net: (url: string) => Promise<Response>;
let stores: Map<string, MemoryCache>;
let handlers: Record<string, (e: unknown) => void>;
let update: ReturnType<typeof vi.fn>;

async function boot() {
  stores = new Map();
  handlers = {};
  update = vi.fn(async () => undefined);
  const caches = {
    open: async (name: string) => stores.get(name) ?? (stores.set(name, new MemoryCache()), stores.get(name)!),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (r: Req) => {
      for (const c of stores.values()) {
        const hit = await c.match(r);
        if (hit) return hit;
      }
      return undefined;
    },
  };
  const self = { location: { origin: ORIGIN }, registration: { update }, clients: { claim: async () => undefined, matchAll: async () => [] }, skipWaiting: () => undefined, addEventListener: (type: string, fn: (e: unknown) => void) => (handlers[type] = fn) };
  const fetch = (r: Req) => net(keyOf(r).slice(ORIGIN.length));
  const source = await GET().text();
  new Function('self', 'caches', 'fetch', source)(self, caches, fetch);
  // install: the app shell, the landing page and their scripts
  const pending: Promise<unknown>[] = [];
  handlers.install({ waitUntil: (p: Promise<unknown>) => pending.push(p) });
  await Promise.all(pending);
}

/** Dispatch a fetch event; returns what was served, after any background work has finished. */
async function request(path: string, mode = 'navigate'): Promise<string> {
  let served: Promise<Response> | undefined;
  const background: Promise<unknown>[] = [];
  handlers.fetch({ request: { url: ORIGIN + path, method: 'GET', mode }, respondWith: (p: Promise<Response>) => (served = p), waitUntil: (p: Promise<unknown>) => background.push(p) });
  const res = await served!;
  await Promise.all(background);
  await new Promise((r) => setTimeout(r, 0));
  return res.text();
}

const shell = () => [...stores.entries()].find(([k]) => k.startsWith('lifeos-shell-'))![1];

describe('service worker', () => {
  beforeEach(async () => {
    net = async (url) => {
      if (url === '/app') return ours(page('v1'));
      if (url === '/offline.html') return ours('<h1>Offline</h1>');
      if (url === '/') return ours('<h1>Landing</h1><script src="/_next/static/chunks/v1.js"></script>');
      if (url.startsWith('/_next/static/')) return ours('/* js */', 'text/javascript');
      return ours('ok', 'application/octet-stream');
    };
    await boot();
  });

  it('stores the app shell, the landing page and their scripts when it installs', async () => {
    expect(await (await shell().match('/app'))?.text()).toBe(page('v1'));
    expect(await (await shell().match('/'))?.text()).toContain('Landing');
    const statics = [...stores.entries()].find(([k]) => k.startsWith('lifeos-static-'))![1];
    expect(await statics.match('/_next/static/chunks/v1.js')).toBeTruthy();
  });

  it("serves the cached app while the host shows its 'waking up' page, and never stores that page", async () => {
    net = async () => wakingUp();
    expect(await request('/app/tasks')).toBe(page('v1'));
    expect(await request('/')).toContain('Landing');
    expect(await (await shell().match('/app'))?.text()).toBe(page('v1'));
  });

  it('opens offline from the cache', async () => {
    net = async () => {
      throw new TypeError('offline');
    };
    expect(await request('/app')).toBe(page('v1'));
  });

  it('keeps a same-version refresh, but leaves a newer deployment to the new service worker', async () => {
    net = async (url) => (url === '/app' ? ours(page('v1') + '<!-- refreshed -->') : ours('x'));
    await request('/app');
    expect(await (await shell().match('/app'))?.text()).toContain('refreshed');
    net = async (url) => (url === '/app' ? ours(page('v2')) : ours('x'));
    expect(await request('/app')).toContain('v1'); // still the complete, cached version
    expect(await (await shell().match('/app'))?.text()).not.toContain('v2'); // its scripts are not cached yet
    expect(update).toHaveBeenCalled(); // the browser is asked to fetch the new service worker instead
  });

  it('does not cache scripts or files that arrive as a waking-up page', async () => {
    net = async () => wakingUp();
    await request('/_next/static/chunks/new.js', 'no-cors');
    const statics = [...stores.entries()].find(([k]) => k.startsWith('lifeos-static-'))![1];
    expect(await statics.match('/_next/static/chunks/new.js')).toBeUndefined();
  });

  it('with the app not cached yet and no network, shows the offline page', async () => {
    shell().entries.delete(keyOf('/app'));
    net = async () => {
      throw new TypeError('offline');
    };
    expect(await request('/app')).toContain('Offline');
  });
});
