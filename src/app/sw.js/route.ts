/**
 * The service worker, generated at build time so that every deployment ships a different file
 * (that is what makes browsers install the new version and lets the app offer "Update").
 *
 * Caching strategy
 *  - /app and /app/*  the cached app shell first (one document serves every route), refreshed in the background:
 *                     the installed app opens instantly, offline, and while the server is asleep
 *  - /                the landing page, the same way
 *  - /_next/static/*  cache first (file names are content-hashed, so they never change)
 *  - /api/*           never cached and never intercepted
 *  - other GETs       stale-while-revalidate
 * Only responses that carry LIFEOS's own X-LifeOS-App header are ever stored, so a hosting provider's "waking up" page
 * (Render's free tier serves one while the server starts) can never take the place of the app.
 */
export const dynamic = 'force-static';

const BUILD = (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.RENDER_GIT_COMMIT ?? Date.now().toString(36)).slice(0, 12);

const source = `
const BUILD = ${JSON.stringify(BUILD)};
const SHELL = 'lifeos-shell-' + BUILD;
const STATIC = 'lifeos-static-' + BUILD;
const RUNTIME = 'lifeos-runtime-' + BUILD;
const PRECACHE = ['/offline.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png'];
const ASSET_RE = /\\/_next\\/static\\/[^"'\\\\\\s)]+/g;
const ours = (res) => !!res && res.ok && res.headers.get('x-lifeos-app') === '1';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await Promise.all(PRECACHE.map(async (url) => { const r = await fetch(url, { cache: 'no-store' }).catch(() => null); if (ours(r)) await shell.put(url, r); }));
    // Cache the app shell, the landing page and every script and stylesheet they reference, so both start offline
    // after one visit.
    const cache = await caches.open(STATIC);
    for (const page of ['/app', '/']) {
      const res = await fetch(page, { cache: 'no-store' }).catch(() => null);
      if (!ours(res)) continue;
      const html = await res.clone().text();
      await shell.put(page, res);
      const assets = [...new Set(html.match(ASSET_RE) || [])];
      await Promise.all(assets.map(async (url) => { const r = await fetch(url).catch(() => null); if (ours(r)) await cache.put(url, r); }));
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, STATIC, RUNTIME]);
    for (const name of await caches.keys()) if (name.startsWith('lifeos-') && !keep.has(name)) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/** A page document: the cached copy at once, refreshed in the background; the network only when nothing is cached. */
async function page(event, key) {
  const cache = await caches.open(SHELL);
  const refresh = fetch(event.request).then(async (res) => {
    if (!ours(res)) return res;
    // Keep the fresh copy only when every script it needs is already cached (same version). A newer deployment is
    // left to the new service worker, which caches it complete; the app then offers "Update".
    const html = await res.clone().text();
    const statics = await caches.open(STATIC);
    const assets = [...new Set(html.match(ASSET_RE) || [])];
    if ((await Promise.all(assets.map((u) => statics.match(u)))).every(Boolean)) await cache.put(key, res.clone());
    else self.registration.update().catch(() => undefined);
    return res;
  }).catch(() => null);
  const hit = await cache.match(key);
  if (hit) {
    event.waitUntil(refresh);
    return hit;
  }
  const res = await Promise.race([refresh, new Promise((r) => setTimeout(() => r(null), 8000))]);
  // Not cached yet: whatever the network gave (even a host's "waking up" page, which reloads itself) beats nothing.
  return res || (await cache.match('/offline.html')) || Response.error();
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (ours(res)) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  const hit = (await cache.match(request)) || (await caches.match(request));
  const fresh = fetch(request).then((res) => { if (ours(res)) cache.put(request, res.clone()); return res; }).catch(() => undefined);
  return hit || (await fresh) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return;
  if (request.mode === 'navigate') {
    if (url.pathname === '/app' || url.pathname.startsWith('/app/')) event.respondWith(page(event, '/app'));
    else if (url.pathname === '/') event.respondWith(page(event, '/'));
    else event.respondWith(fetch(request).catch(async () => (await caches.match('/offline.html')) || Response.error()));
    return;
  }
  if (url.pathname.startsWith('/_next/static/')) { event.respondWith(cacheFirst(request)); return; }
  if (url.searchParams.has('_rsc')) return;
  event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (windows.length) return windows[0].focus();
    return self.clients.openWindow('/app');
  })());
});
`;

export function GET() {
  return new Response(source, { headers: { 'content-type': 'application/javascript; charset=utf-8', 'cache-control': 'no-cache, no-store, must-revalidate', 'service-worker-allowed': '/' } });
}
