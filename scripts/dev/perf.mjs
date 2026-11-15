// Performance probe: frame times while scrolling, long tasks while navigating, with optional CSS overrides.
// Usage: node scripts/dev/perf.mjs <desktop|mobile> [label] [css-override]
import { chromium, devices } from '@playwright/test';
import { sampleBackup } from '../../src/core/sample-data.mjs';
const [, , mode = 'desktop', label = 'base', css = ''] = process.argv;
const base = process.env.BASE_URL ?? 'http://localhost:3100';
// GL=1 gives headless Chromium software WebGL (SwiftShader) so the animated sky runs; COSMOS=off switches it off.
const glArgs = process.env.GL ? ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [];
const browser = await chromium.launch({ args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist', ...glArgs] });
const ctx = await browser.newContext(mode === 'mobile' ? { ...devices['Pixel 7'] } : { viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(base + '/app');
await page.evaluate((off) => { localStorage.setItem('lifeos.identity', JSON.stringify({ mode: 'local' })); if (off) localStorage.setItem('lifeos.cosmos', 'off'); }, process.env.COSMOS === 'off');
await page.goto(base + '/app');
await page.getByRole('heading', { name: 'What do you want LIFEOS to help with?' }).waitFor();
for (const i of ['Work', 'Study', 'Money', 'Health', 'Home', 'Travel', 'Creativity', 'Self-growth']) await page.locator('section').getByRole('button', { name: i, exact: true }).click();
await page.getByRole('button', { name: 'Continue' }).click();
await page.getByRole('button', { name: 'Continue' }).click();
await page.getByRole('button', { name: 'Start using LIFEOS' }).click();
await page.getByText(/Welcome to LIFEOS/).waitFor();
await page.goto(base + '/app/settings/data');
await page.getByLabel('Backup file').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(sampleBackup())) });
await page.getByRole('button', { name: 'Restore', exact: true }).click();
await page.getByText(/Restore complete/).waitFor();
await page.goto(base + '/app');
await page.waitForTimeout(2000);
if (css) await page.addStyleTag({ content: css });
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await page.evaluate(() => {
  window.__lt = [];
  new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__lt.push(e.duration))).observe({ type: 'longtask', buffered: false });
});
async function frames(fn) {
  await page.evaluate(() => { window.__f = []; let last = performance.now(); const tick = (t) => { window.__f.push(t - last); last = t; if (window.__run) requestAnimationFrame(tick); }; window.__run = true; requestAnimationFrame(tick); });
  await fn();
  return page.evaluate(() => { window.__run = false; const f = window.__f.slice(2).sort((a, b) => a - b); const avg = f.reduce((a, b) => a + b, 0) / f.length; return { n: f.length, avg: +avg.toFixed(1), p95: +f[Math.floor(f.length * 0.95)].toFixed(1), over50: f.filter((x) => x > 50).length }; });
}
const idle = await frames(() => page.waitForTimeout(2000));
const scroll = await frames(async () => { for (let i = 0; i < 25; i++) { await page.mouse.wheel(0, i < 13 ? 220 : -220); await page.waitForTimeout(60); } });
const settled = await frames(() => page.waitForTimeout(2000));
const t0 = Date.now();
await page.evaluate(() => (window.__lt = []));
const nav = [];
for (const r of mode === 'mobile' ? ['/tasks', '/calendar', '/', '/finance', '/notes'] : ['/tasks', '/calendar', '/', '/finance', '/notes', '/habits', '/']) {
  const s = Date.now();
  await page.evaluate((r) => import('/_next/static/chunks/placeholder.js').catch(() => 0) && 0, r);
  await page.evaluate((r) => { history.pushState(null, '', '/app' + r); dispatchEvent(new PopStateEvent('popstate')); }, r);
  await page.waitForFunction(() => !document.querySelector('#main-scroll [role=status][aria-label=Loading]'), null, { timeout: 15000 });
  await page.waitForTimeout(300);
  nav.push(Date.now() - s - 300);
}
const longtasks = await page.evaluate(() => ({ count: window.__lt.length, total: Math.round(window.__lt.reduce((a, b) => a + b, 0)), max: Math.round(Math.max(0, ...window.__lt)) }));
console.log(JSON.stringify({ label, mode, idle, scroll, settled, nav, longtasks }));
await browser.close();
