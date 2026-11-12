import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { isPhone, restoreSample, startLocal } from './helpers';
import { sampleBackup } from './sample-data.mjs';

test.describe('onboarding and modules', () => {
  test('activates only the modules that match the chosen interests', async ({ page }) => {
    await startLocal(page, ['Money']);
    await page.goto('/app/marketplace');
    await expect(page.getByRole('switch', { name: 'Deactivate Finance' })).toBeVisible();
    await expect(page.getByRole('switch', { name: 'Activate Learning' })).toBeVisible();
    await page.goto('/app/learning');
    await expect(page.getByText('Learning is switched off')).toBeVisible();
    await page.getByRole('button', { name: 'Activate Learning' }).click();
    await expect(page.getByRole('heading', { name: 'Learning', level: 1 })).toBeVisible();
  });

  test('deactivating a module removes it from navigation and keeps its data', async ({ page }) => {
    await startLocal(page);
    await page.goto('/app/journal');
    await page.getByLabel('Journal entry').fill('Kept while the module is off.');
    await page.waitForTimeout(1000);
    await page.goto('/app/marketplace');
    await page.getByRole('switch', { name: 'Deactivate Journal' }).click();
    await expect(page.getByText('Journal switched off. Your data is kept.')).toBeVisible();
    await page.goto('/app/journal');
    await expect(page.getByText('Journal is switched off')).toBeVisible();
    await page.getByRole('button', { name: 'Activate Journal' }).click();
    await expect(page.getByLabel('Journal entry')).toHaveValue('Kept while the module is off.');
  });

  test('marketplace search finds capabilities and shows honest statuses', async ({ page }) => {
    await startLocal(page);
    await page.goto('/app/marketplace');
    await page.getByLabel('Search the feature catalog').fill('spaced repetition');
    await expect(page.getByText('Matches: Spaced repetition')).toBeVisible();
    await page.getByLabel('Search the feature catalog').fill('');
    await page.getByRole('button', { name: 'Details' }).first().click();
    await expect(page.getByText(/capabilities$/).first()).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: /Planned$/ }).click();
    await expect(page.getByRole('heading', { name: /result/ })).toBeVisible();
  });
});

test.describe('tasks', () => {
  test('quick add parses dates, priority and tags; completing updates progress', async ({ page }) => {
    await startLocal(page);
    await page.goto('/app/tasks');
    await page.getByLabel('Quick add task').fill('Pay rent tomorrow !high #home');
    await page.getByLabel('Quick add task').press('Enter');
    const row = page.locator('#main-scroll .row', { hasText: 'Pay rent' });
    await expect(row).toBeVisible();
    await expect(row.getByText('Tomorrow')).toBeVisible();
    await expect(row.getByText('High')).toBeVisible();
    await expect(row.getByText('#home')).toBeVisible();
    await row.getByRole('checkbox').click();
    await expect(page.locator('.card', { hasText: 'Done today' }).locator('.num')).toHaveText('1');
  });

  test('editing, subtasks, recurring tasks and delete with undo', async ({ page }) => {
    await startLocal(page);
    await page.goto('/app/tasks');
    await page.getByLabel('Quick add task').fill('Water plants today');
    await page.getByLabel('Quick add task').press('Enter');
    await page.locator('#main-scroll').getByRole('button', { name: /^Water plants/ }).click();
    const editor = page.getByRole('dialog', { name: 'Edit task' });
    await editor.getByLabel('Repeat', { exact: true }).selectOption('weekly');
    await editor.getByLabel('New subtask').fill('Fill the can');
    await editor.getByLabel('New subtask').press('Enter');
    await expect(editor.getByText('Subtasks · 0/1')).toBeVisible();
    await editor.getByRole('button', { name: 'Save' }).click();
    const row = page.locator('#main-scroll .row', { hasText: 'Water plants' }).first();
    await expect(row.getByText('0/1')).toBeVisible();
    await expect(row.getByText('Repeats')).toBeVisible();
    // completing a recurring task schedules the next one
    await row.getByRole('checkbox').click();
    await expect(page.getByText(/Next “Water plants” scheduled/)).toBeVisible();
    await expect(page.locator('#main-scroll .row', { hasText: 'Water plants' })).toHaveCount(2);
    // delete with undo
    await page.locator('#main-scroll .row', { hasText: 'Water plants' }).first().getByRole('button', { name: /^Water plants/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'More actions' }).click();
    await page.getByRole('menuitem', { name: 'Delete' }).click();
    await expect(page.locator('#main-scroll .row', { hasText: 'Water plants' })).toHaveCount(1);
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.locator('#main-scroll .row', { hasText: 'Water plants' })).toHaveCount(2);
  });

  test('board, calendar, timeline and table views show the same tasks; bulk actions work', async ({ page }) => {
    await startLocal(page);
    await restoreSample(page);
    await page.goto('/app/tasks/board');
    await expect(page.locator('#main-scroll .snap-start', { hasText: 'In progress' })).toBeVisible();
    await expect(page.getByText('Write homepage copy').first()).toBeVisible();
    await page.goto('/app/tasks/timeline');
    await expect(page.getByRole('figure', { name: 'Timeline' })).toBeVisible();
    await page.goto('/app/tasks/calendar');
    await expect(page.locator('#main-scroll').getByRole('button', { name: 'Today', exact: true })).toBeVisible();
    await page.goto('/app/tasks/table');
    await page.getByRole('button', { name: 'More options' }).click();
    await page.getByRole('menuitem', { name: 'Select multiple' }).click();
    await page.getByRole('checkbox', { name: 'Select row' }).nth(0).click();
    await page.getByRole('checkbox', { name: 'Select row' }).nth(1).click();
    await expect(page.getByText('2 selected')).toBeVisible();
    await page.getByRole('button', { name: 'Tag', exact: true }).click();
    await page.getByPlaceholder('Tag name').fill('batch');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('Tagged 2')).toBeVisible();
    await expect(page.getByText('#batch')).toHaveCount(2);
  });
});

test.describe('capture and search', () => {
  test('quick capture creates records in several modules', async ({ page }) => {
    await startLocal(page);
    const openCapture = async () => page.getByRole('button', { name: isPhone(page) ? 'Quick capture' : 'Capture' }).first().click();
    await openCapture();
    const sheet = page.getByRole('dialog', { name: 'Quick capture' });
    await sheet.getByRole('radio', { name: 'Note' }).click();
    await sheet.getByLabel('Note', { exact: true }).fill('Captured idea about onboarding');
    await sheet.getByRole('button', { name: 'Save note' }).click();
    await expect(page.getByText('Note saved')).toBeVisible();
    await openCapture();
    await sheet.getByRole('radio', { name: 'Expense' }).click();
    await sheet.getByLabel('Amount').fill('450');
    await sheet.getByLabel('Expense', { exact: true }).fill('Coffee beans');
    await sheet.getByRole('button', { name: 'Save expense' }).click();
    await expect(page.getByText('Expense saved')).toBeVisible();
    await page.goto('/app/notes');
    await expect(page.getByText('Captured idea about onboarding').first()).toBeVisible();
    await page.goto('/app/finance');
    await expect(page.locator('.card', { hasText: 'Expenses' }).first()).toContainText('450');
  });

  test('universal search finds records across modules and opens them', async ({ page }) => {
    await startLocal(page);
    await restoreSample(page);
    await page.goto('/app');
    if (isPhone(page)) await page.getByRole('button', { name: 'Search' }).click();
    else await page.keyboard.press('Control+k');
    const box = page.getByRole('combobox', { name: 'Search everything or type a command' });
    await box.fill('passport');
    await expect(page.getByRole('option', { name: /Renew passport/ })).toBeVisible();
    await expect(page.getByRole('option', { name: /Passport.*Document/s })).toBeVisible();
    await box.fill('performance budget');
    await page.getByRole('option', { name: /Performance budget/ }).first().click();
    await expect(page).toHaveURL(/\/app\/notes\/n-2/);
    await expect(page.getByLabel('Note title')).toHaveValue('Performance budget');
  });
});

test.describe('calendar, habits, notes, finance', () => {
  test('creates an event, shows it in the agenda and flags overlapping events', async ({ page }) => {
    await startLocal(page);
    await restoreSample(page);
    await page.goto('/app/calendar');
    await expect(page.getByText('2 overlapping')).toBeVisible();
    await page.locator('#main-scroll').getByRole('button', { name: 'Event', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'New event' });
    await editor.getByLabel('Title').fill('Quarterly planning');
    await editor.getByRole('button', { name: 'Add event' }).click();
    await page.getByRole('radio', { name: 'Agenda' }).click();
    await expect(page.getByText('Quarterly planning')).toBeVisible();
    await expect(page.getByText('Overlaps').first()).toBeVisible();
  });

  test('habit check-ins update progress and streaks', async ({ page }) => {
    await startLocal(page);
    await restoreSample(page);
    await page.goto('/app/habits');
    await expect(page.getByText('0/3').first()).toBeVisible();
    await page.getByRole('button', { name: 'Check in Meditate' }).click();
    await expect(page.getByRole('button', { name: 'Check in Meditate' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByText('1/3').first()).toBeVisible();
    await page.getByRole('button', { name: 'Show details' }).first().click();
    await expect(page.getByText('Current streak')).toBeVisible();
    await expect(page.getByText('Habit calendar')).toBeVisible();
  });

  test('notes link to each other, show backlinks and keep versions', async ({ page }) => {
    await startLocal(page);
    await restoreSample(page);
    await page.goto('/app/notes/n-2');
    await expect(page.getByText('Linked from')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Redesign brief' }).last()).toBeVisible();
    await page.getByRole('radio', { name: 'Write' }).click();
    await page.getByLabel('Note content').fill('Completely new text with a [[Brand new note]] link.');
    await page.waitForTimeout(1200);
    await page.getByRole('radio', { name: 'Preview' }).click();
    await page.getByRole('link', { name: 'Brand new note' }).click();
    await expect(page.getByLabel('Note title')).toHaveValue('Brand new note');
    await page.goto('/app/notes/n-2');
    await page.getByRole('button', { name: 'Note actions' }).click();
    await page.getByRole('menuitem', { name: /Version history/ }).click();
    await expect(page.getByText('LCP under')).toBeVisible();
  });

  test('finance totals, budgets and reports are calculated from transactions', async ({ page }) => {
    await startLocal(page);
    await restoreSample(page);
    await page.goto('/app/finance');
    await expect(page.locator('.card', { hasText: 'Income' }).first()).toContainText('91,000');
    await expect(page.locator('.card', { hasText: 'Savings rate' }).first()).toContainText('60%');
    await page.goto('/app/finance/budgets');
    await expect(page.getByText('₹100 over budget')).toBeVisible();
    await expect(page.getByText(/91% used/)).toBeVisible();
    await page.goto('/app/finance/reports');
    await expect(page.getByText(/You earned/)).toBeVisible();
    await page.goto('/app/finance/accounts');
    await expect(page.locator('.card', { hasText: 'HDFC Savings' })).toContainText('transactions');
  });
});

test.describe('data ownership', () => {
  test('exports a complete backup and restores it without overwriting by default', async ({ page }) => {
    await startLocal(page);
    await restoreSample(page);
    await page.goto('/app/tasks');
    await page.locator('#main-scroll').getByRole('button', { name: /^Write homepage copy/ }).click();
    await page.getByRole('dialog', { name: 'Edit task' }).getByLabel('Title').fill('Write homepage copy (edited)');
    await page.getByRole('dialog', { name: 'Edit task' }).getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('#main-scroll').getByRole('button', { name: /^Write homepage copy \(edited\)/ })).toBeVisible();

    await page.goto('/app/settings/data');
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download complete backup' }).click();
    const file = await (await download).path();
    const backup = JSON.parse(await readFile(file, 'utf8'));
    expect(backup.format).toBe('lifeos-backup');
    expect(backup.records.length).toBeGreaterThan(150);
    expect(backup.records.some((r: { data: { title?: string } }) => r.data.title === 'Write homepage copy (edited)')).toBe(true);

    // restoring the original sample reports the edited task as "different" and leaves it alone by default
    await page.getByLabel('Backup file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(sampleBackup())) });
    await expect(page.getByText(/exist here with different content/)).toBeVisible();
    await expect(page.getByRole('radio', { name: /Keep my current versions/ })).toBeChecked();
    await page.getByRole('radio', { name: /Replace with the backup/ }).check();
    await page.getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(page.getByText(/Restore complete/)).toBeVisible();
    await page.goto('/app/tasks');
    await expect(page.locator('#main-scroll').getByRole('button', { name: /^Write homepage copy (?!\(edited\))/ })).toBeVisible();
  });

  test('rejects files that are not LIFEOS backups', async ({ page }) => {
    await startLocal(page);
    await page.goto('/app/settings/data');
    await page.getByLabel('Backup file').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":"world"}') });
    await expect(page.getByText('This file is not a LIFEOS backup.')).toBeVisible();
  });

  test('appearance settings change theme and accent immediately and persist', async ({ page }) => {
    await startLocal(page);
    await page.goto('/app/settings/appearance');
    await page.getByRole('radio', { name: 'Light' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByRole('radio', { name: 'Violet' }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.style.getPropertyValue('--accent-h'))).toBe('290');
    await page.waitForTimeout(600);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});
