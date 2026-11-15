import { expect, test, type Browser, type Page } from '@playwright/test';
import { totpAt } from '../../src/server/totp';
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
    await expect(page.getByText('This device', { exact: true })).toBeVisible();
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

test.describe('two-step verification', () => {
  test('turn it on with a QR key, then signing in asks for a code', async ({ page, browser }) => {
    const email = uniqueEmail();
    await register(page, email);
    await page.goto('/app/settings/account');
    await page.getByRole('button', { name: 'Turn on' }).click();
    await page.getByRole('dialog').getByLabel('Password').fill(PASSWORD);
    await page.getByRole('dialog').getByRole('button', { name: 'Continue' }).click();
    await expect(page.getByRole('img', { name: 'QR code for your authenticator app' })).toBeVisible();
    const secret = (await page.locator('span.select-all').first().innerText()).replace(/\s/g, '');
    await page.getByLabel('Authentication code').fill(totpAt(secret, Date.now()));
    await page.getByRole('button', { name: 'Turn on' }).last().click();
    await expect(page.getByText('Two-step verification is on.')).toBeVisible();
    await expect(page.getByText('Protected')).toBeVisible();

    // A new device: password first, then the code.
    const other = await browser.newContext({ extraHTTPHeaders: { 'x-real-ip': randomIp() } });
    const phone = await other.newPage();
    await phone.goto('/app');
    await phone.getByLabel('E-mail').fill(email);
    await phone.getByLabel('Password').fill(PASSWORD);
    await phone.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(phone.getByText(/uses two-step verification/)).toBeVisible();
    await phone.getByLabel('Authentication code').fill('000000');
    await phone.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(phone.getByRole('alert').filter({ hasText: 'That code is not right' })).toBeVisible();
    await phone.getByLabel('Authentication code').fill(totpAt(secret, Date.now() + 30_000));
    await phone.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(phone.getByRole('heading', { name: /Good (morning|afternoon|evening|night)/ })).toBeVisible();
    await other.close();
  });
});

test.describe('journal lock', () => {
  test('private entries are encrypted before they sync, and open on another device with the passphrase', async ({ page, browser }) => {
    test.setTimeout(90_000);
    const email = uniqueEmail();
    await register(page, email);
    await page.goto('/app/journal');
    await page.getByLabel('Journal entry').fill('The secret plan for the surprise party');
    await page.getByRole('button', { name: 'Private' }).click();
    await expect(page.getByText(/Entry is private/)).toBeVisible();

    await page.goto('/app/settings/privacy');
    await page.getByRole('button', { name: 'Turn on journal lock' }).click();
    await page.getByPlaceholder('New passphrase').fill('purple mango river');
    await page.getByRole('button', { name: 'Next' }).click();
    await page.getByPlaceholder('Same passphrase').fill('purple mango river');
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('Journal lock is on. 1 private entry encrypted.')).toBeVisible();
    await waitForSync(page);

    // What the server holds for this account: ciphertext, never the words.
    const stored = await page.evaluate(async () => (await fetch('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cursor: 0, changes: [] }) })).text());
    expect(stored).toContain('"sealed"');
    expect(stored).not.toContain('surprise party');

    const phone = await secondDevice(browser, email, true);
    await phone.goto('/app/journal');
    await expect(phone.getByText('This entry is encrypted. Unlock your journal to read or change it.')).toBeVisible({ timeout: 20_000 });
    await phone.getByRole('button', { name: 'Unlock', exact: true }).first().click();
    await phone.getByPlaceholder('Journal passphrase').fill('wrong guess');
    await phone.getByRole('button', { name: 'Unlock', exact: true }).last().click();
    await expect(phone.getByText('That passphrase did not open your journal. Try again.')).toBeVisible();
    await phone.getByPlaceholder('Journal passphrase').fill('purple mango river');
    await phone.getByRole('button', { name: 'Unlock', exact: true }).last().click();
    await expect(phone.getByLabel('Journal entry')).toHaveValue('The secret plan for the surprise party');

    // Edits on the phone are sealed too, and the first device reads them after unlocking.
    await phone.getByLabel('Journal entry').fill('The secret plan, now with cake');
    await phone.waitForTimeout(1200);
    await syncNow(phone);
    const after = await phone.evaluate(async () => (await fetch('/api/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ cursor: 0, changes: [] }) })).text());
    expect(after).not.toContain('with cake');
    await syncNow(page);
    await page.goto('/app/journal'); // a reload forgets the key: the journal is locked again
    await expect(page.getByText('This entry is encrypted. Unlock your journal to read or change it.')).toBeVisible();
    await page.getByRole('button', { name: 'Unlock', exact: true }).first().click();
    await page.getByPlaceholder('Journal passphrase').fill('purple mango river');
    await page.getByRole('button', { name: 'Unlock', exact: true }).last().click();
    await expect(page.getByLabel('Journal entry')).toHaveValue('The secret plan, now with cake');
    await page.getByRole('button', { name: 'Lock', exact: true }).click();
    await expect(page.getByText('This entry is encrypted. Unlock your journal to read or change it.')).toBeVisible();
    await phone.context().close();
  });
});
