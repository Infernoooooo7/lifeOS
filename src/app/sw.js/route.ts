/**
 * The service worker, generated at build time so that every deployment ships a different file
 * (that is what makes browsers install the new version and lets the app offer "Update").
 *
 * Caching strategy
 *  - /app and /app/*  network first, falling back to the cached app shell (one document serves every route)
 *  - /_next/static/*  cache first (file names are content-hashed, so they never change)
 *  - /api/*           never cached and never intercepted
 *  - other GETs       stale-while-revalidate
 */
export const dynamic = 'force-static';

const BUILD = (process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.RENDER_GIT_COMMIT ?? Date.now().toString(36)).slice(0, 12);

const source = `
const BUILD = ${JSON.stringify(BUILD)};
const SHELL = 'lifeos-shell-' + BUILD;
const STATIC = 'lifeos-static-' + BUILD;
const RUNTIME = 'lifeos-runtime-' + BUILD;
const PRECACHE = ['/offline.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const shell = await caches.open(SHELL);
    await shell.addAll(PRECACHE).catch(() => undefined);
    // Cache the app shell and every script and stylesheet it references, so the app starts offline after one visit.
    const res = await fetch('/app', { cache: 'no-store' });
    if (res.ok) {
      const html = await res.clone().text();
      await shell.put('/app', res);
      const assets = [...new Set(html.match(/\\/_next\\/static\\/[^"'\\\\\\s)]+/g) || [])];
      const cache = await caches.open(STATIC);
      await Promise.all(assets.map((url) => cache.add(url).catch(() => undefined)));
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

async function appShell(request) {
  const cache = await caches.open(SHELL);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    const res = await fetch(request, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) cache.put('/app', res.clone());
    return res;
  } catch (err) {
    return (await cache.match('/app')) || (await cache.match('/offline.html')) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(request);
  const fresh = fetch(request).then((res) => { if (res.ok) cache.put(request, res.clone()); return res; }).catch(() => undefined);
  return hit || (await fresh) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/sw.js') return;
  if (request.mode === 'navigate') {
    if (url.pathname === '/app' || url.pathname.startsWith('/app/')) event.respondWith(appShell(request));
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
