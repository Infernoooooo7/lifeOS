import { expect, test } from '@playwright/test';
import { restoreSample, startLocal } from './helpers';

test('ships a valid web app manifest and icons', async ({ page, request }) => {
  await page.goto('/app');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({ name: expect.stringContaining('LIFEOS'), short_name: 'LIFEOS', start_url: '/app', display: 'standalone' });
  expect(manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')).toBe(true);
  for (const icon of manifest.icons) {
    const res = await request.get(icon.src);
    expect(res.status(), icon.src).toBe(200);
    expect(res.headers()['content-type']).toContain('image/png');
  }
  expect((await request.get('/icons/apple-touch-icon.png')).status()).toBe(200);
  await expect(page.locator('meta[name="theme-color"]').first()).toHaveAttribute('content', /#/);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/);
});

test('serves security headers and never caches the service worker or the API', async ({ request }) => {
  const res = await request.get('/app');
  const h = res.headers();
  expect(h['content-security-policy']).toContain("default-src 'self'");
  expect(h['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(h['x-content-type-options']).toBe('nosniff');
  expect(h['x-frame-options']).toBe('DENY');
  expect(h['referrer-policy']).toBeTruthy();
  expect((await request.get('/sw.js')).headers()['cache-control']).toContain('no-cache');
  expect((await request.get('/api/health')).headers()['cache-control']).toContain('no-store');
});

test('works offline: reloads, navigates between modules and keeps saving', async ({ page, context }) => {
  test.setTimeout(120_000);
  await startLocal(page);
  await restoreSample(page);
  // the service worker installs, takes control and the module chunks are cached in the background
  await page.goto('/app');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller), { timeout: 20_000 }).toBe(true);
  await expect.poll(() => page.evaluate(async () => { let n = 0; for (const name of await caches.keys()) n += (await (await caches.open(name)).keys()).length; return n; }), { timeout: 60_000 }).toBeGreaterThan(40);
  await page.waitForTimeout(6000);

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening|night)/ })).toBeVisible();
  // deep link straight into a module while offline
  await page.goto('/app/tasks');
  await expect(page.locator('#main-scroll').getByRole('button', { name: /^Write homepage copy/ })).toBeVisible();
  for (const route of ['calendar', 'notes/n-1', 'finance', 'habits', 'projects/p-web']) {
    await page.goto(`/app/${route}`);
    await expect(page.locator('#main-scroll h1').first(), route).toBeVisible();
    await expect(page.getByText('not available offline'), route).toHaveCount(0);
  }
  // writing still works offline and survives a reload
  await page.goto('/app/tasks');
  await page.getByLabel('Quick add task').fill('Added while offline');
  await page.getByLabel('Quick add task').press('Enter');
  await expect(page.locator('#main-scroll').getByRole('button', { name: /^Added while offline/ })).toBeVisible();
  await page.reload();
  await expect(page.locator('#main-scroll').getByRole('button', { name: /^Added while offline/ })).toBeVisible();
  // pages outside the app get the offline fallback instead of a browser error
  await page.goto('/some-page-that-is-not-cached');
  await expect(page.getByRole('heading', { name: 'You are offline' })).toBeVisible();
  await context.setOffline(false);
});
