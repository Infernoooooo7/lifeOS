// Sky probe: forces the animated sky on (even on software WebGL, i.e. a slow GPU), hides the page content, and saves a
// screenshot every ~200 ms while resizing the viewport like a phone's address bar. Prints the quality level the sky
// settled on and how often the canvas was resized; check the frames for black ones (see docs/ARCHITECTURE.md).
// Usage: node scripts/dev/sky-probe.mjs <out-dir>   [VP=2560x1440] [THROTTLE=6]   (a server on :3100)
import { chromium } from 'playwright';
const out = process.argv[2];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const [VW, VH] = (process.env.VP ?? '900x700').split('x').map(Number);
const p = await b.newPage({ viewport: { width: VW, height: VH } });
await p.addInitScript(() => localStorage.setItem('lifeos.cosmos', 'force'));
await p.goto('http://localhost:3100/app');
await p.evaluate(() => localStorage.setItem('lifeos.identity', JSON.stringify({ mode: 'local' })));
await p.goto('http://localhost:3100/app');
await p.locator('section').getByRole('button', { name: 'Work', exact: true }).click();
await p.getByRole('button', { name: 'Continue' }).click();
await p.getByRole('button', { name: 'Continue' }).click();
await p.getByRole('button', { name: 'Start using LIFEOS' }).click();
await p.waitForTimeout(1500);
await p.addStyleTag({ content: '.app-canvas:not(.fixed) > *, [role=status], .toast, section[aria-label] { visibility: hidden !important; }' });
await p.waitForFunction(() => document.documentElement.classList.contains('cosmos'), null, { timeout: 20000 });
await p.evaluate(() => {
  window.__resizes = 0;
  new MutationObserver(() => window.__resizes++).observe(document.querySelector('canvas.cosmos-canvas'), { attributes: true, attributeFilter: ['width', 'height'] });
});
if (process.env.THROTTLE) { const cdp = await p.context().newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.THROTTLE) }); }
await p.waitForTimeout(1000);
const t0 = Date.now();
for (let i = 0; i < 60; i++) {
  if (i === 20) await p.setViewportSize({ width: VW, height: VH - 60 }); // address bar shows
  if (i === 24) await p.setViewportSize({ width: VW, height: VH }); // and hides again
  await p.screenshot({ path: `${out}/f${String(i).padStart(2, '0')}.png` });
  await p.waitForTimeout(150);
}
const lv = []; for (let k = 0; k < 6; k++) { lv.push(await p.locator('canvas.cosmos-canvas').getAttribute('data-level')); await p.waitForTimeout(1500); }
console.log('levels after', lv.join(','), 'canvas resizes', await p.evaluate(() => window.__resizes), 'seconds', ((Date.now() - t0) / 1000).toFixed(1), 'level', await p.locator('canvas.cosmos-canvas').getAttribute('data-level'));
await b.close();
