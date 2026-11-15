// Accessibility audit: axe-core (WCAG 2.1 A/AA) on every route. Usage: [THEME=light] node scripts/dev/a11y.mjs <desktop|mobile>
import AxeBuilder from '@axe-core/playwright';
import { chromium, devices } from '@playwright/test';
import { sampleBackup } from '../../src/core/sample-data.mjs';
const [, , mode = 'desktop'] = process.argv;
const base = 'http://localhost:3100';
const routes = ['/app', '/app/tasks', '/app/tasks/board', '/app/calendar', '/app/projects', '/app/projects/p-web', '/app/notes/n-1', '/app/habits', '/app/goals', '/app/finance', '/app/finance/transactions', '/app/learning', '/app/health', '/app/journal', '/app/focus', '/app/shopping', '/app/travel/trip-1', '/app/files', '/app/entertainment', '/app/digital', '/app/admin', '/app/people', '/app/people/pe-asha', '/app/utilities', '/app/automation', '/app/insights', '/app/insights/review', '/app/marketplace', '/app/settings', '/app/settings/data', '/app/settings/account'];
const browser = await chromium.launch();
const ctx = await browser.newContext(mode === 'mobile' ? { ...devices['Pixel 7'] } : { viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto(base + '/app');
await page.evaluate(() => localStorage.setItem('lifeos.identity', JSON.stringify({ mode: 'local' })));
await page.goto(base + '/app');
await page.getByRole('heading', { name: 'What do you want LIFEOS to help with?' }).waitFor();
// Audit the auth-free onboarding screen too.
const results = new Map();
const audit = async (label) => {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  for (const v of r.violations) {
    const e = results.get(v.id) ?? { impact: v.impact, help: v.help, pages: new Set(), nodes: [] };
    e.pages.add(label);
    for (const n of v.nodes.slice(0, 3)) if (e.nodes.length < 6) e.nodes.push(`${label}: ${n.target.join(' ')} — ${(n.failureSummary ?? '').split('\n').slice(1, 2).join(' ').slice(0, 160)}`);
    results.set(v.id, e);
  }
};
await audit('onboarding');
for (const i of ['Work', 'Study', 'Money', 'Health', 'Home', 'Travel', 'Relationships', 'Creativity', 'Self-growth']) await page.locator('section').getByRole('button', { name: i, exact: true }).click();
await page.getByRole('button', { name: 'Continue' }).click();
await page.getByRole('button', { name: 'Continue' }).click();
if (process.env.THEME) await page.getByRole('button', { name: process.env.THEME, exact: true }).click();
await page.getByRole('button', { name: 'Start using LIFEOS' }).click();
await page.getByText(/Welcome to LIFEOS/).waitFor();
await page.goto(base + '/app/settings/data');
await page.getByLabel('Backup file').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(sampleBackup())) });
await page.getByRole('button', { name: 'Restore', exact: true }).click();
await page.getByText(/Restore complete/).waitFor();
for (const r of routes) {
  await page.goto(base + r);
  await page.waitForTimeout(900);
  await audit(r.replace('/app', '') || '/');
}
// Open dialogs too: the record editor and the command palette.
await page.goto(base + '/app/tasks'); await page.waitForTimeout(600);
await page.locator('#main-scroll').getByRole('button', { name: /^Write homepage copy/ }).click(); await page.waitForTimeout(500);
await audit('editor');
await page.keyboard.press('Escape'); await page.keyboard.press('Control+k'); await page.waitForTimeout(400);
await audit('palette');
const sorted = [...results.entries()].sort((a, b) => b[1].pages.size - a[1].pages.size);
for (const [id, e] of sorted) {
  console.log(`\n[${e.impact}] ${id}: ${e.help} — ${e.pages.size} page(s)`);
  for (const n of e.nodes) console.log('   ', n);
}
console.log(`\n${sorted.length} rule(s) violated across ${routes.length + 3} screens (${mode}${process.env.THEME ? `, ${process.env.THEME}` : ''})`);
await browser.close();
