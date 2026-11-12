import { expect, type Page } from '@playwright/test';
import { sampleBackup } from './sample-data.mjs';

export const INTERESTS = ['Work', 'Study', 'Money', 'Health', 'Home', 'Travel', 'Creativity', 'Self-growth'];

/** Walk through onboarding, choosing the given interests. */
export async function onboard(page: Page, interests: string[] = INTERESTS) {
  await expect(page.getByRole('heading', { name: 'What do you want LIFEOS to help with?' })).toBeVisible();
  for (const interest of interests) await page.locator('section').getByRole('button', { name: interest, exact: true }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Start using LIFEOS' }).click();
  await expect(page.getByText(/Welcome to LIFEOS/)).toBeVisible();
}

/** Start in local-only mode (no account) with everything activated. */
export async function startLocal(page: Page, interests: string[] = INTERESTS) {
  await page.goto('/app');
  await page.getByRole('button', { name: 'Use on this device without an account' }).click();
  await onboard(page, interests);
}

/** Restore the sample backup through Settings → Backup & data (the real import flow). */
export async function restoreSample(page: Page) {
  await page.goto('/app/settings/data');
  await page.getByLabel('Backup file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(sampleBackup())) });
  await page.getByRole('button', { name: 'Restore', exact: true }).click();
  await expect(page.getByText(/Restore complete/)).toBeVisible();
}

let counter = 0;
export const uniqueEmail = () => `e2e_${Date.now()}_${process.pid}_${counter++}@example.com`;
export const PASSWORD = 'correct horse battery';

/** Create an account through the UI and finish onboarding. Returns the recovery code that was shown. */
export async function register(page: Page, email: string, password = PASSWORD): Promise<string> {
  await page.goto('/app');
  await page.getByRole('tab', { name: 'Create account' }).click();
  await page.getByLabel('Name').fill('Test User');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Create account' }).click();
  const code = (await page.getByTestId('recovery-code').innerText()).trim();
  await page.getByRole('button', { name: 'I have saved it' }).click();
  await onboard(page);
  return code;
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto('/app');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('#main-scroll')).toBeVisible();
}

/** Wait until this device has nothing left to upload and the last sync succeeded. */
export async function waitForSync(page: Page) {
  await expect(page.locator('[data-sync="idle"][data-pending="0"]')).toBeVisible({ timeout: 20_000 });
}

/** Trigger a sync cycle right now (the app also syncs on its own every 30 seconds and on focus). */
export async function syncNow(page: Page) {
  await page.waitForTimeout(300); // let the last local write land in IndexedDB
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(500);
  await waitForSync(page);
}

export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 1000) < 768;

/** Collect console errors and uncaught exceptions for the lifetime of a page. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`uncaught: ${e.message}`));
  return errors;
}

/** Each test acts as a different client address, the way separate people would (rate limits are per address). */
export const randomIp = () => `10.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}.${Math.floor(Math.random() * 250) + 1}`;
