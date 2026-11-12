import { expect, test, type Browser, type Page } from '@playwright/test';
import { PASSWORD, onboard, randomIp, register, signIn, syncNow, uniqueEmail, waitForSync } from './helpers';

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ 'x-real-ip': randomIp() });
});

/** A second browser context is a second device: separate cookies, separate IndexedDB. */
async function secondDevice(browser: Browser, email: string, mobile = false): Promise<Page> {
  const context = await browser.newContext({ extraHTTPHeaders: { 'x-real-ip': randomIp() }, ...(mobile ? { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true } : {}) });
  const page = await context.newPage();
  await signIn(page, email);
  return page;
}
const main = (page: Page) => page.locator('#main-scroll');
const addTask = async (page: Page, title: string) => {
  await page.goto('/app/tasks');
  await page.getByLabel('Quick add task').fill(title);
  await page.getByLabel('Quick add task').press('Enter');
  await expect(main(page).getByRole('button', { name: new RegExp(`^${title}`) })).toBeVisible();
};

test.describe('accounts', () => {
  test('register, sign out, wrong password, sign in again', async ({ page }) => {
    const email = uniqueEmail();
    const code = await register(page, email);
    expect(code).toMatch(/^([A-Z0-9]{4}-){4}[A-Z0-9]{4}$/);
    await waitForSync(page);
    await page.getByRole('button', { name: /Account menu/ }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Password').fill('definitely-not-it');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Incorrect e-mail or password.')).toBeVisible();
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    // an existing account is not asked to onboard again: its preferences arrive with the first sync
    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening|night)/ })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'What do you want LIFEOS to help with?' })).toHaveCount(0);
  });

  test('password reset with the recovery code', async ({ page }) => {
    const email = uniqueEmail();
    const code = await register(page, email);
    await waitForSync(page);
    await page.getByRole('button', { name: /Account menu/ }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await page.getByRole('tab', { name: 'Reset' }).click();
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Recovery code').fill(code);
    await page.getByLabel('New password').fill('a brand new password');
    await page.getByRole('button', { name: 'Set new password' }).click();
    await expect(page.getByTestId('recovery-code')).toBeVisible(); // a fresh code replaces the used one
    await page.getByRole('button', { name: 'I have saved it' }).click();
    await page.getByLabel('E-mail').fill(email);
    await page.getByLabel('Password').fill('a brand new password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening|night)/ })).toBeVisible();
  });

  test('device sessions are listed and can be signed out remotely', async ({ page, browser }) => {
    const email = uniqueEmail();
    await register(page, email);
    const phone = await secondDevice(browser, email, true);
    await expect(phone.getByRole('heading', { name: /Good/ })).toBeVisible();
    await page.goto('/app/settings/account');
    await expect(page.getByText('This device')).toBeVisible();
    await page.getByRole('button', { name: 'Sign out', exact: true }).first().click();
    await expect(page.getByText('Device signed out')).toBeVisible();
    // the other device notices on its next sync and keeps its local data
    await phone.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(phone.getByText(/Your session has ended/)).toBeVisible({ timeout: 20_000 });
    await phone.context().close();
  });

  test('local data comes along when an account is created later', async ({ page }) => {
    await page.goto('/app');
    await page.getByRole('button', { name: 'Use on this device without an account' }).click();
    await onboard(page);
    await addTask(page, 'Created before I had an account');
    await page.getByRole('button', { name: /Account menu/ }).click();
    await page.getByRole('menuitem', { name: 'Create account or sign in' }).click();
    await page.getByRole('tab', { name: 'Create account' }).click();
    await expect(page.getByText(/Bring the \d+ items? saved on this device/)).toBeVisible();
    await page.getByLabel('E-mail').fill(uniqueEmail());
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByRole('button', { name: 'I have saved it' }).click();
    await expect(page.locator('#main-scroll')).toBeVisible();
    await page.goto('/app/tasks');
    await expect(main(page).getByRole('button', { name: /^Created before I had an account/ })).toBeVisible();
    await waitForSync(page);
  });
});

test.describe('cross-device synchronisation', () => {
  test('a task created on one device appears on the other, and edits flow back', async ({ page, browser }) => {
    const email = uniqueEmail();
    await register(page, email);
    await addTask(page, 'Buy train tickets');
    await waitForSync(page);

    const phone = await secondDevice(browser, email, true);
    await phone.goto('/app/tasks');
    await expect(main(phone).getByRole('button', { name: /^Buy train tickets/ })).toBeVisible({ timeout: 20_000 });

    // complete it on the phone → the PC sees it done
    await main(phone).locator('.row', { hasText: 'Buy train tickets' }).getByRole('checkbox').click();
    await syncNow(phone);
    await syncNow(page);
    await expect(main(page).locator('.row', { hasText: 'Buy train tickets' }).getByRole('checkbox')).toBeChecked();
    await phone.context().close();
  });

  test('changes made offline are queued, shown as pending and synchronised after reconnecting', async ({ page, browser, context }) => {
    const email = uniqueEmail();
    await register(page, email);
    await waitForSync(page);
    const other = await secondDevice(browser, email);
    await expect(other.getByRole('heading', { name: /Good/ })).toBeVisible();

    await context.setOffline(true);
    await addTask(page, 'Written on a plane');
    await page.goto('/app/settings/sync').catch(() => undefined);
    await expect(page.locator('[data-sync="offline"]')).toBeVisible();
    await expect.poll(async () => Number(await page.getByTestId('sync-pending').innerText())).toBeGreaterThan(0);

    await context.setOffline(false);
    await syncNow(page);
    await expect(page.getByTestId('sync-pending')).toHaveText('0');
    await syncNow(other);
    await other.goto('/app/tasks');
    await expect(main(other).getByRole('button', { name: /^Written on a plane/ })).toBeVisible();
    await other.context().close();
  });

  test('edits to different fields merge; edits to the same field are reported as a conflict', async ({ page, browser, context }) => {
    const email = uniqueEmail();
    await register(page, email);
    await addTask(page, 'Shared task');
    await waitForSync(page);
    const other = await secondDevice(browser, email);
    await other.goto('/app/tasks');
    await expect(main(other).getByRole('button', { name: /^Shared task/ })).toBeVisible({ timeout: 20_000 });

    // both devices go offline and edit the same task
    await context.setOffline(true);
    await other.context().setOffline(true);
    const edit = async (p: Page, fill: (dialog: ReturnType<Page['getByRole']>) => Promise<void>) => {
      await main(p).getByRole('button', { name: /^Shared task/ }).click();
      const dialog = p.getByRole('dialog', { name: 'Edit task' });
      await fill(dialog);
      await dialog.getByRole('button', { name: 'Save' }).click();
      await expect(dialog).toBeHidden();
    };
    await edit(page, async (d) => { await d.getByLabel('Title').fill('Shared task (from PC)'); await d.getByLabel('Priority').selectOption('3'); });
    await other.waitForTimeout(50);
    await edit(other, async (d) => { await d.getByLabel('Title').fill('Shared task (from laptop)'); await d.getByLabel('Notes').fill('Added on the laptop'); });

    await context.setOffline(false);
    await syncNow(page);
    await other.context().setOffline(false);
    await syncNow(other);
    await syncNow(page);

    // both devices converge on one title; the non-conflicting fields from both sides survive
    for (const p of [page, other]) {
      await p.goto('/app/tasks');
      await main(p).getByRole('button', { name: /^Shared task \(from laptop\)/ }).click();
      const dialog = p.getByRole('dialog', { name: 'Edit task' });
      await expect(dialog.getByLabel('Priority')).toHaveValue('3');
      await expect(dialog.getByLabel('Notes')).toHaveValue('Added on the laptop');
      await p.keyboard.press('Escape');
    }
    // the overwritten title is not lost: it is listed in the sync centre and can be restored
    await page.goto('/app/settings/sync');
    await expect(page.getByText('Shared task (from PC)')).toBeVisible();
    await page.getByRole('button', { name: 'Use the replaced value instead' }).first().click();
    await expect(page.getByText('Switched to the other value')).toBeVisible();
    await other.context().close();
  });

  test("one account never sees another account's data", async ({ page, browser }) => {
    await register(page, uniqueEmail());
    await addTask(page, 'Private to the first account');
    await waitForSync(page);
    const strangerContext = await browser.newContext({ extraHTTPHeaders: { 'x-real-ip': randomIp() } });
    const stranger = await strangerContext.newPage();
    await register(stranger, uniqueEmail());
    await waitForSync(stranger);
    await stranger.goto('/app/tasks');
    await expect(stranger.getByText('Private to the first account')).toHaveCount(0);
    const exported = await stranger.request.get('/api/export');
    expect(await exported.text()).not.toContain('Private to the first account');
    // without a session the API refuses
    const anonymous = await browser.newContext();
    expect((await anonymous.request.get('/api/export')).status()).toBe(401);
    expect((await anonymous.request.post('/api/sync', { data: { cursor: 0, changes: [] } })).status()).toBe(401);
    await strangerContext.close();
    await anonymous.close();
  });
});
