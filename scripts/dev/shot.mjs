import { chromium, devices } from '@playwright/test';
const [,, path = '/app', name = 'shot', mode = 'desktop', setup = 'local'] = process.argv;
const out = '/tmp/claude-0/-home-user-lifeOS/5957aea3-35c2-541d-abcb-d0efbf7f99b6/scratchpad/';
const browser = await chromium.launch();
const ctx = await browser.newContext(mode === 'mobile' ? { ...devices['Pixel 7'] } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
await page.goto('http://localhost:3100/app');
if (setup === 'local') {
  await page.evaluate(() => localStorage.setItem('lifeos.identity', JSON.stringify({ mode: 'local' })));
  await page.goto('http://localhost:3100' + path);
  await page.waitForTimeout(1500);
  const start = page.getByRole('button', { name: 'Continue' });
  if (await start.count()) { await page.getByRole('button', { name: 'Work', exact: true }).click(); await page.getByRole('button', { name: 'Money', exact: true }).click(); await page.getByRole('button', { name: 'Health', exact: true }).click(); await page.getByRole('button', { name: 'Study', exact: true }).click(); await page.getByRole('button', { name: 'Travel', exact: true }).click(); await page.getByRole('button', { name: 'Home', exact: true }).last().click(); await start.click(); await page.getByRole('button', { name: 'Continue' }).click(); await page.getByRole('button', { name: 'Start using LIFEOS' }).click(); await page.waitForTimeout(800); }
}
await page.waitForTimeout(1500);
await page.screenshot({ path: out + name + '.png' });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log(JSON.stringify({ overflow, errors: errors.slice(0, 8) }));
await browser.close();
