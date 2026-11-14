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
    // Wait until the app is on screen (as a person would) before using the keyboard shortcut.
    await expect(page.getByRole('heading', { name: /Good (morning|afternoon|evening|night)/ })).toBeVisible();
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
    await expect(page.locator('#main-scroll .card', { hasText: 'Quarterly planning' })).toBeVisible();
    await expect(page.locator('#main-scroll').getByText('Overlaps').first()).toBeVisible();
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

test.describe('people', () => {
  test('keep-in-touch: a person becomes due, one tap logs a call and resets the clock', async ({ page }) => {
    await startLocal(page);
    await restoreSample(page);
    await page.goto('/app/people');
    // Asha (every 2 weeks, last met 20 days ago) is overdue; her birthday is in 6 days.
    const reconnect = page.locator('section', { has: page.getByRole('heading', { name: 'Reconnect' }) });
    await expect(reconnect.getByText('Asha Rao')).toBeVisible();
    await expect(reconnect.getByText('6 days overdue')).toBeVisible();
    await expect(page.locator('section', { has: page.getByRole('heading', { name: 'Birthdays coming up' }) }).getByText('Asha Rao')).toBeVisible();

    await reconnect.getByRole('button', { name: 'Log call with Asha Rao' }).click();
    await expect(page.getByText('Called · Asha Rao')).toBeVisible();
    await expect(reconnect.getByText('Asha Rao')).toHaveCount(0);

    // The person page shows the history, newest first, and the next catch-up.
    await page.goto('/app/people/pe-asha');
    await expect(page.getByRole('heading', { name: 'Asha Rao', level: 1 })).toBeVisible();
    await expect(page.getByText(/next catch-up in 14 days/i)).toBeVisible();
    await expect(page.locator('#main-scroll .row').first()).toContainText('Called');
    await expect(page.getByText('Trail running vest')).toBeVisible();
  });

  test('a new person can be added with a rhythm and found through search', async ({ page }) => {
    await startLocal(page);
    await page.goto('/app/people');
    await page.getByRole('button', { name: 'Add someone' }).click();
    const editor = page.getByRole('dialog', { name: 'New person' });
    await editor.getByLabel('Name').fill('Kabir Shah');
    await editor.getByLabel('Keep in touch').selectOption({ label: 'Every week' });
    await editor.getByRole('button', { name: 'Add person' }).click();
    await expect(page.getByText('Person added')).toBeVisible();
    await page.getByRole('tab', { name: 'People' }).click();
    await expect(page.locator('#main-scroll .row', { hasText: 'Kabir Shah' })).toContainText('In 7 days');
    await page.keyboard.press('Control+k');
    await page.keyboard.type('kabir');
    await page.getByRole('option', { name: /Kabir Shah/ }).click();
    await expect(page).toHaveURL(/\/app\/people\/[^/]+$/);
    await expect(page.getByRole('heading', { name: 'Kabir Shah', level: 1 })).toBeVisible();
  });
});

test.describe('weekly review', () => {
  test('triage an overdue task, reflect, pick priorities and save to the journal', async ({ page }) => {
    await startLocal(page);
    await restoreSample(page);
    await page.goto('/app/insights/review');
    await expect(page.getByRole('heading', { name: 'Look back at the week' })).toBeVisible();
    await page.getByRole('button', { name: 'Next: Overdue' }).click();
    const overdue = page.locator('section[aria-labelledby="review-step-title"] .row', { hasText: 'Pay electricity bill' });
    await overdue.getByRole('button', { name: 'Next week' }).click();
    await expect(page.getByText('“Pay electricity bill” moved to next week')).toBeVisible();
    await expect(overdue).toHaveCount(0);
    await page.getByRole('button', { name: /Reflect/ }).click();
    await page.getByLabel('What went well?').fill('Shipped the homepage draft.');
    await page.getByRole('checkbox', { name: 'Priority: Write homepage copy' }).click();
    await page.getByRole('button', { name: 'Finish review' }).click();
    await expect(page.getByText('Weekly review saved to your journal')).toBeVisible();
    await expect(page.getByText(/Done today/)).toBeVisible();
    await page.goto('/app/journal/entries');
    await expect(page.locator('#main-scroll .row', { hasText: 'Weekly review' }).first()).toBeVisible();
  });
});

test.describe('imports from other apps', () => {
  test('a bank statement imports once; importing it again adds nothing', async ({ page }) => {
    await startLocal(page);
    await page.goto('/app/settings/data');
    await page.getByRole('radio', { name: 'Bank statement' }).click();
    const qif = '!Type:Bank\nD02/11/2026\nT-640.00\nPSwiggy order\n^\nD03/11/2026\nT52000\nPAcme salary\n^\n';
    await page.getByLabel('Bank statement files').setInputFiles({ name: 'statement.qif', mimeType: 'text/plain', buffer: Buffer.from(qif) });
    await expect(page.getByText(/2\s*transactions/)).toBeVisible();
    await page.getByRole('button', { name: 'Import 2 items' }).click();
    await expect(page.getByText('Imported 2 items from Bank statement')).toBeVisible();
    await page.getByLabel('Bank statement files').setInputFiles({ name: 'statement.qif', mimeType: 'text/plain', buffer: Buffer.from(qif) });
    await expect(page.getByText('Update the 2 already imported')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nothing new to import' })).toBeDisabled();
    await page.goto('/app/finance/transactions');
    await expect(page.locator('#main-scroll').getByText('Swiggy order')).toBeVisible();
  });

  test('Google Keep checklists arrive as notes', async ({ page }) => {
    await startLocal(page);
    await page.goto('/app/settings/data');
    await page.getByRole('radio', { name: 'Google Keep' }).click();
    const note = JSON.stringify({ title: 'Packing list', listContent: [{ text: 'Charger', isChecked: false }], labels: [{ name: 'Travel' }], createdTimestampUsec: 1700000000000000 });
    await page.getByLabel('Google Keep files').setInputFiles([{ name: 'Packing list.json', mimeType: 'application/json', buffer: Buffer.from(note) }]);
    await page.getByRole('button', { name: 'Import 1 item' }).click();
    await expect(page.getByText('Imported 1 item from Google Keep')).toBeVisible();
    await page.goto('/app/notes');
    await expect(page.locator('#main-scroll').getByText('Packing list').first()).toBeVisible();
  });
});

test.describe('repeating events', () => {
  test('one occurrence of a series can be skipped from the calendar, and restored', async ({ page }) => {
    await startLocal(page);
    await restoreSample(page);
    await page.goto('/app/calendar');
    await page.getByRole('radio', { name: 'Agenda' }).click();
    const standups = page.locator('#main-scroll').getByRole('button', { name: /Standup/ });
    await standups.nth(1).click();
    const editor = page.getByRole('dialog', { name: 'Edit event' });
    await expect(editor.getByText('Changes here apply to the whole series.')).toBeVisible();
    const when = (await editor.locator('b').first().textContent())!.trim();
    await editor.getByRole('button', { name: 'Skip this one' }).click();
    await expect(page.getByText(/^Skipped /)).toBeVisible();
    // The series now lists the skipped date; restoring it from the editor brings the occurrence back.
    await standups.first().click();
    const chip = page.getByRole('dialog', { name: 'Edit event' }).getByRole('button', { name: /^Restore / });
    await expect(chip).toHaveCount(1);
    expect(when).toContain((await chip.textContent())!.trim().split(' ')[0]);
    await chip.click();
    await page.getByRole('dialog', { name: 'Edit event' }).getByRole('button', { name: 'Save' }).click();
    await standups.first().click();
    await expect(page.getByRole('dialog', { name: 'Edit event' }).getByRole('button', { name: /^Restore / })).toHaveCount(0);
  });

  test('a monthly event can repeat on the same weekday position', async ({ page }) => {
    await startLocal(page);
    await page.goto('/app/calendar');
    await page.locator('main').getByRole('button', { name: 'Event', exact: true }).click();
    const editor = page.getByRole('dialog', { name: 'New event' });
    await editor.getByLabel('Title').fill('Book club');
    await editor.getByLabel('Starts').fill('2026-11-14T19:00');
    await editor.getByLabel('Repeat', { exact: true }).selectOption('monthly');
    await editor.getByLabel('Repeats on').selectOption({ label: 'On the second Saturday' });
    await expect(editor.getByText('Every month on the second Saturday')).toBeVisible();
  });
});

test.describe('plan my day', () => {
  test('fits urgent tasks into free time and adds the blocks to the calendar', async ({ page }) => {
    await startLocal(page);
    await restoreSample(page);
    await page.goto('/app/calendar/plan');
    const sheet = page.getByRole('dialog', { name: 'Plan my day' });
    // Plan tomorrow so the test does not depend on the time of day it runs.
    const t = new Date(Date.now() + 86_400_000);
    await sheet.getByLabel('Day').fill(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`);
    const blocks = sheet.getByRole('list', { name: 'Proposed time blocks' }).getByRole('listitem');
    await expect(blocks.first()).toBeVisible();
    await expect(sheet.getByText('Pay electricity bill')).toBeVisible(); // overdue tasks are planned first
    const count = await blocks.count();
    await blocks.first().getByRole('button', { name: /^Leave out/ }).click();
    await expect(blocks).toHaveCount(count - 1);
    await sheet.getByRole('button', { name: /^Add \d+ time block/ }).click();
    await expect(page.getByText(/^Added \d+ time block/)).toBeVisible();
    await expect(page.locator('#main-scroll').getByRole('button', { name: /Write homepage copy|Review pull requests/ }).first()).toBeVisible();
  });
});
