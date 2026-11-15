import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { restoreSample, startLocal } from './helpers';

/** WCAG 2.1 A/AA checks with axe-core on the main screens, with realistic data, in both themes. */
const ROUTES = ['', 'tasks', 'tasks/board', 'calendar', 'projects/p-web', 'notes/n-1', 'habits', 'finance', 'journal', 'people', 'people/pe-asha', 'meals', 'meals/rc-dal', 'digital', 'insights/review', 'marketplace', 'settings/data'];

async function audit(page: Page) {
  const failures: string[] = [];
  for (const route of ROUTES) {
    await page.goto(`/app/${route}`);
    await page.waitForTimeout(700);
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    for (const v of r.violations) failures.push(`/${route}: ${v.id} (${v.impact}) — ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
  }
  return failures;
}

test('no WCAG 2.1 AA violations on the main screens (dark theme)', async ({ page }) => {
  test.setTimeout(120_000);
  await startLocal(page);
  await restoreSample(page);
  expect(await audit(page)).toEqual([]);
});

test('no WCAG 2.1 AA violations on the main screens (light theme)', async ({ page }) => {
  test.setTimeout(120_000);
  await startLocal(page);
  await page.goto('/app/settings/appearance');
  await page.getByRole('radio', { name: 'Light' }).click();
  await restoreSample(page);
  expect(await audit(page)).toEqual([]);
});
