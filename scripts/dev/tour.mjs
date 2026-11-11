// Visual tour: onboard in local mode, restore the sample backup through the real UI, then screenshot routes.
// Usage: node scripts/dev/tour.mjs <outDir> <desktop|mobile> [route ...]
import { chromium, devices } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { sampleBackup } from '../../tests/e2e/sample-data.mjs';

const [, , out = '/tmp/tour', mode = 'desktop', ...only] = process.argv;
const base = process.env.BASE_URL ?? 'http://localhost:3100';
const routes = only.length ? only : ['/app', '/app/tasks', '/app/tasks/board', '/app/tasks/timeline', '/app/calendar', '/app/projects', '/app/projects/p-web', '/app/notes/n-1', '/app/notes/graph', '/app/habits', '/app/goals', '/app/goals/okrs', '/app/finance', '/app/finance/budgets', '/app/learning', '/app/health', '/app/journal', '/app/focus', '/app/shopping', '/app/travel/trip-1', '/app/files/expiring', '/app/entertainment', '/app/digital', '/app/admin', '/app/utilities', '/app/automation', '/app/insights', '/app/marketplace', '/app/settings/appearance', '/app/settings/data', '/app/spatial'];
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(mode === 'mobile' ? { ...devices['Pixel 7'] } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push({ url: page.url(), text: m.text().slice(0, 300) }));
page.on('pageerror', (e) => errors.push({ url: page.url(), text: 'PAGEERROR ' + e.message.slice(0, 300) }));

await page.goto(base + '/app');
await page.evaluate(() => localStorage.setItem('lifeos.identity', JSON.stringify({ mode: 'local' })));
await page.goto(base + '/app');
await page.getByRole('heading', { name: 'What do you want LIFEOS to help with?' }).waitFor();
for (const interest of ['Work', 'Study', 'Money', 'Health', 'Home', 'Travel', 'Creativity', 'Self-growth']) await page.locator('section').getByRole('button', { name: interest, exact: true }).click();
await page.getByRole('button', { name: 'Continue' }).click();
await page.getByRole('button', { name: 'Continue' }).click();
await page.getByRole('button', { name: 'Start using LIFEOS' }).click();
await page.getByText(/Welcome to LIFEOS/).waitFor();
await page.goto(base + '/app/settings/data');
await page.getByLabel('Backup file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(sampleBackup())) });
await page.getByRole('button', { name: 'Restore', exact: true }).click();
await page.getByText(/Restore complete/).waitFor();

const report = [];
for (const route of routes) {
  await page.goto(base + route);
  await page.waitForTimeout(route.includes('spatial') ? 3500 : 1100);
  const name = (route.replace('/app', '') || '/home').slice(1).replace(/\//g, '_');
  await page.screenshot({ path: `${out}/${mode}-${name}.png` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const text = await page.evaluate(() => document.body.innerText.slice(0, 60000));
  report.push({ route, overflow, problem: /ran into a problem|couldn’t load|not available offline/.test(text) ? 'ERROR SCREEN' : '' });
}
console.log(JSON.stringify({ report: report.filter((r) => r.overflow > 0 || r.problem), visited: report.length, errors: errors.slice(0, 25) }, null, 1));
await browser.close();
