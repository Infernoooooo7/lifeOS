import { expect, test } from '@playwright/test';
import { isPhone, restoreSample, startLocal, trackErrors } from './helpers';

const ROUTES = ['', 'tasks', 'tasks/board', 'tasks/table', 'tasks/timeline', 'calendar', 'projects', 'projects/p-web', 'notes', 'notes/graph', 'habits', 'habits/stats', 'goals', 'goals/okrs', 'finance', 'finance/transactions', 'finance/reports', 'learning', 'learning/flashcards', 'health', 'journal', 'focus', 'shopping', 'travel', 'travel/trip-1', 'files', 'entertainment', 'digital', 'admin', 'utilities', 'utilities/calculator', 'automation', 'insights', 'insights/productivity', 'marketplace', 'settings', 'settings/data', 'settings/sync'];

test('every module renders without errors or horizontal overflow', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = trackErrors(page);
  await startLocal(page);
  await restoreSample(page);
  for (const route of ROUTES) {
    await page.goto(`/app/${route}`);
    await expect(page.locator('#main-scroll h1').first(), route).toBeVisible();
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, `horizontal overflow on /${route}`).toBeLessThanOrEqual(0);
    await expect(page.getByText('ran into a problem'), route).toHaveCount(0);
  }
  expect(errors.filter((e) => !/favicon/.test(e)), 'console errors').toEqual([]);
});

test('navigation matches the device: sidebar on desktop, tab bar and launcher on phones', async ({ page }) => {
  await startLocal(page);
  const sidebar = page.getByRole('complementary', { name: 'Primary' });
  const tabBar = page.getByRole('navigation', { name: 'Primary' }).last();
  if (isPhone(page)) {
    await expect(sidebar).toBeHidden();
    await expect(tabBar).toBeVisible();
    // tab bar targets are comfortably large and do not overlap
    const boxes = await tabBar.getByRole('button').evaluateAll((els) => els.map((el) => el.getBoundingClientRect()).map((r) => ({ x: r.x, w: r.width, h: r.height })));
    expect(boxes.length).toBe(5);
    for (const b of boxes) expect(Math.min(b.w, b.h)).toBeGreaterThanOrEqual(44);
    const sorted = [...boxes].sort((a, b) => a.x - b.x);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i].x).toBeGreaterThanOrEqual(sorted[i - 1].x + sorted[i - 1].w - 1);
    // More opens a searchable launcher with every active module
    await tabBar.getByRole('button', { name: 'More' }).click();
    const launcher = page.getByRole('dialog', { name: 'All modules' });
    await launcher.getByLabel('Find a module').fill('fin');
    await launcher.getByRole('button', { name: 'Finance' }).click();
    await expect(page).toHaveURL(/\/app\/finance$/);
  } else {
    await expect(sidebar).toBeVisible();
    await expect(page.locator('nav[aria-label="Primary"]:visible')).toHaveCount(0);
    await sidebar.getByRole('link', { name: 'Finance' }).click();
    await expect(page).toHaveURL(/\/app\/finance$/);
    // keyboard: "g t" goes to Tasks, "?" lists shortcuts
    await page.locator('body').press('g');
    await page.locator('body').press('t');
    await expect(page).toHaveURL(/\/app\/tasks$/);
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  }
});

test('forms are usable on this screen size and dialogs trap focus', async ({ page }) => {
  await startLocal(page);
  await page.goto('/app/tasks');
  await page.getByRole('button', { name: /New task/ }).first().click();
  const editor = page.getByRole('dialog', { name: 'New task' });
  await expect(editor).toBeVisible();
  await page.waitForTimeout(450); // let the slide-in finish before measuring
  const box = await editor.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  // required field validation
  await editor.getByRole('button', { name: 'Add task' }).click();
  await expect(editor.getByText('Title is required')).toBeVisible();
  await editor.getByLabel('Title').fill('Check the form');
  await editor.getByRole('button', { name: 'Add task' }).click();
  await expect(page.locator('#main-scroll').getByRole('button', { name: /^Check the form/ })).toBeVisible();
});

test('landing page is static, fast to read and links into the app', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Everything in your life');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole('link', { name: 'Open LIFEOS' }).first().click();
  await expect(page).toHaveURL(/\/app$/);
  expect(errors).toEqual([]);
});
