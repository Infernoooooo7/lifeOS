import { describe, expect, it } from 'vitest';
import { guessCategory, importKeepNotes, importMarkdownNotes, importOfx, importQif, importTodoistCsv, parseLooseDate } from '@/core/lib/importers';

const now = new Date('2026-11-14T10:00:00');

describe('dates in exports', () => {
  it('reads the formats other apps write', () => {
    expect(parseLooseDate('2026-11-20')).toBe('2026-11-20');
    expect(parseLooseDate('20261120120000[+5.5:IST]')).toBe('2026-11-20');
    expect(parseLooseDate('20 Nov 2026')).toBe('2026-11-20');
    expect(parseLooseDate('Nov 20', now)).toBe('2026-11-20');
    expect(parseLooseDate('November 3rd, 2027')).toBe('2027-11-03');
    expect(parseLooseDate('11/20/2026', now, 'mdy')).toBe('2026-11-20');
    expect(parseLooseDate('20/11/2026', now, 'dmy')).toBe('2026-11-20');
    expect(parseLooseDate("11/20'26", now, 'mdy')).toBe('2026-11-20');
    expect(parseLooseDate('someday')).toBeNull();
  });
});

describe('Todoist', () => {
  const csv = [
    'TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE',
    'section,Errands,,,,,,,,',
    'task,Buy milk @home,Full fat,1,1,me,,Nov 20,en,Asia/Kolkata',
    'task,Check expiry,,4,2,me,,,en,',
    'note,Ask for the receipt,,,,me,,,,',
    'task,Water plants,,3,1,me,,every day,en,',
    '',
  ].join('\n');

  it('imports tasks into a project with sections, labels, sub-tasks, priorities, dates and comments', () => {
    const { records, warnings } = importTodoistCsv(csv, 'Home_chores.csv', now);
    const [project, milk, expiry, plants] = records;
    expect(project).toMatchObject({ collection: 'projects', data: { name: 'Home chores' } });
    expect(milk.data).toMatchObject({ title: 'Buy milk', priority: 3, dueAt: '2026-11-20', projectId: project.id, tags: ['home', 'errands'], notes: 'Full fat' });
    expect(expiry.data).toMatchObject({ title: 'Check expiry', parentId: milk.id, priority: 0, notes: 'Ask for the receipt' });
    expect(plants.data).toMatchObject({ dueAt: null, priority: 1 });
    expect(plants.data.notes).toContain('every day');
    expect(warnings[0]).toMatch(/1 repeating task/);
  });

  it('gives the same ids on a second import, so nothing is duplicated', () => {
    expect(importTodoistCsv(csv, 'Home_chores.csv', now).records.map((r) => r.id)).toEqual(importTodoistCsv(csv, 'Home_chores.csv', now).records.map((r) => r.id));
  });

  it('refuses files that are not Todoist exports', () => {
    expect(importTodoistCsv('a,b\n1,2', 'x.csv').warnings[0]).toMatch(/does not look like/);
  });
});

describe('Google Keep', () => {
  it('turns notes and checklists into notes with labels, and skips the trash', () => {
    const { records, warnings } = importKeepNotes([
      { name: 'Groceries.json', text: JSON.stringify({ title: 'Groceries', listContent: [{ text: 'Eggs', isChecked: true }, { text: 'Bread', isChecked: false }], labels: [{ name: 'Home Stuff' }], isPinned: true, createdTimestampUsec: 1 }) },
      { name: 'Idea.json', text: JSON.stringify({ title: '', textContent: 'A quiet app for reading\nmore text', isArchived: true, createdTimestampUsec: 2 }) },
      { name: 'Old.json', text: JSON.stringify({ title: 'Old', textContent: 'x', isTrashed: true }) },
      { name: 'Labels.json', text: '{"labels": []}' },
      { name: 'photo.png', text: '' },
    ]);
    expect(records).toHaveLength(2);
    expect(records[0].data).toMatchObject({ title: 'Groceries', content: '- [x] Eggs\n- [ ] Bread', pinned: true, tags: ['home-stuff', 'keep'] });
    expect(records[1].data).toMatchObject({ title: 'A quiet app for reading', archived: true });
    expect(warnings.join(' ')).toMatch(/1 note in Keep's trash was skipped.*1 file did not look like Keep notes/);
  });
});

describe('Markdown', () => {
  it('reads titles from front matter, headings or Notion file names, and tags from front matter', () => {
    const { records } = importMarkdownNotes([
      { name: 'Trip ideas 0123456789abcdef0123456789abcdef.md', text: '# Trip ideas\n\nKyoto in autumn.' },
      { name: 'vault/reading.md', text: '---\ntitle: Reading list\ntags: [books, "#later"]\n---\nDune' },
      { name: 'journal.md', text: '---\ntags:\n  - daily\n  - mood\n---\nGood day.' },
      { name: 'image.png', text: '' },
    ]);
    expect(records.map((r) => r.data.title)).toEqual(['Trip ideas', 'Reading list', 'journal']);
    expect(records[0].data.content).toBe('Kyoto in autumn.');
    expect(records[1].data.tags).toEqual(['books', 'later']);
    expect(records[2].data.tags).toEqual(['daily', 'mood']);
  });
});

describe('bank statements', () => {
  it('reads OFX/QFX (SGML style), with signs, currency, stable ids and category guesses', () => {
    const ofx = `OFXHEADER:100\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>INR<BANKACCTFROM><ACCTID>1234</BANKACCTFROM><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261101<TRNAMT>-450.50<FITID>A1<NAME>SWIGGY ORDER<MEMO>Dinner</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261031120000<TRNAMT>85000.00<FITID>A2<NAME>ACME PAYROLL SALARY</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    const { records } = importOfx(ofx);
    expect(records.map((r) => r.data)).toEqual([
      { type: 'expense', amount: 450.5, date: '2026-11-01', payee: 'SWIGGY ORDER', note: 'Dinner', category: 'Dining', tags: ['imported'], currency: 'INR' },
      { type: 'income', amount: 85000, date: '2026-10-31', payee: 'ACME PAYROLL SALARY', category: 'Salary', tags: ['imported'], currency: 'INR' },
    ]);
    expect(importOfx(ofx).records[0].id).toBe(records[0].id);
  });

  it('reads QIF, keeps its categories and tells identical lines apart', () => {
    const qif = '!Type:Bank\nD11/02/2026\nT-1,200.00\nPBig Bazaar\nLGroceries:Food\n^\nD11/02/2026\nT-1,200.00\nPBig Bazaar\n^\nD11/03/2026\nT-99\nPUber trip\n^\nDbad\nT5\n^\n';
    const { records, warnings } = importQif(qif, 'mdy');
    expect(records.map((r) => [r.data.date, r.data.amount, r.data.category])).toEqual([['2026-11-02', 1200, 'Groceries'], ['2026-11-02', 1200, 'Other'], ['2026-11-03', 99, 'Transport']]);
    expect(new Set(records.map((r) => r.id)).size).toBe(3);
    expect(warnings[0]).toMatch(/1 entry/);
  });

  it('guesses categories from payee text', () => {
    expect(guessCategory('NETFLIX.COM', 'expense')).toBe('Subscriptions');
    expect(guessCategory('Apollo Pharmacy', 'expense')).toBe('Health');
    expect(guessCategory('Something odd', 'expense')).toBe('Other');
    expect(guessCategory('Interest credit', 'income')).toBe('Interest');
  });
});
