import { describe, expect, it } from 'vitest';
import { parseAmount, parseCsv, parseCsvObjects, toCsv } from '@/core/lib/csv';
import { parseIcs, toIcs } from '@/core/lib/ics';
import { parseBackup } from '@/core/lib/backup';

describe('CSV', () => {
  it('parses quoted fields, escaped quotes, embedded newlines and CRLF', () => {
    const rows = parseCsv('name,note\r\n"Smith, J","said ""hi""\nthere"\r\nplain,\r\n');
    expect(rows).toEqual([['name', 'note'], ['Smith, J', 'said "hi"\nthere'], ['plain', '']]);
    expect(parseCsvObjects('a, b\n1,2\n')).toEqual([{ a: '1', b: '2' }]);
  });

  it('round-trips through toCsv and neutralises formula injection', () => {
    const rows = [{ title: 'Milk, 2L', tags: ['a', 'b'], n: 3, f: '=HYPERLINK("x")' }];
    const csv = toCsv(rows);
    expect(parseCsvObjects(csv)[0]).toEqual({ title: 'Milk, 2L', tags: 'a; b', n: '3', f: `'=HYPERLINK("x")` });
    expect(toCsv([{ n: -5 }])).toBe('n\r\n-5');
  });

  it('parses money strings', () => {
    expect(parseAmount('₹1,499.50')).toBe(1499.5);
    expect(parseAmount('(200)')).toBe(-200);
    expect(parseAmount('-45')).toBe(-45);
    expect(parseAmount('n/a')).toBeNull();
  });
});

describe('iCalendar', () => {
  it('exports and re-imports timed, all-day and recurring events', () => {
    const events = [
      { uid: 'a', title: 'Dentist; bring card', startAt: '2026-11-12T09:00:00.000Z', endAt: '2026-11-12T10:00:00.000Z', location: 'Clinic, 2nd floor', description: 'Line 1\nLine 2' },
      { uid: 'b', title: 'Holiday', startAt: new Date(2026, 11, 25).toISOString(), endAt: new Date(2026, 11, 26).toISOString(), allDay: true },
      { uid: 'c', title: 'Standup', startAt: '2026-11-09T04:30:00.000Z', recurrence: { freq: 'weekly' as const, byDay: [1, 2, 3, 4, 5] } },
    ];
    const ics = toIcs(events);
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
    const back = parseIcs(ics);
    expect(back).toHaveLength(3);
    expect(back[0]).toMatchObject({ uid: 'a', title: 'Dentist; bring card', startAt: events[0].startAt, endAt: events[0].endAt, location: 'Clinic, 2nd floor', description: 'Line 1\nLine 2', allDay: false });
    expect(back[1]).toMatchObject({ title: 'Holiday', allDay: true, startAt: events[1].startAt, endAt: events[1].endAt });
    expect(back[2].recurrence).toEqual({ freq: 'weekly', byDay: [1, 2, 3, 4, 5] });
  });

  it('reads files from other calendars (folded lines, TZID, VALUE=DATE)', () => {
    const src = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:x1', 'SUMMARY:A very long', '  title', 'DTSTART;TZID=Asia/Kolkata:20261112T093000', 'DTEND;TZID=Asia/Kolkata:20261112T103000', 'END:VEVENT',
      'BEGIN:VEVENT', 'SUMMARY:Birthday', 'DTSTART;VALUE=DATE:20261201', 'DTEND;VALUE=DATE:20261202', 'RRULE:FREQ=YEARLY', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const events = parseIcs(src);
    expect(events[0].title).toBe('A very long title');
    expect(new Date(events[0].startAt).getHours()).toBe(9);
    expect(events[1]).toMatchObject({ allDay: true, recurrence: { freq: 'yearly' } });
    expect(events[1].endAt).toBe(events[1].startAt);
  });
});

describe('backup validation', () => {
  it('rejects files that are not LIFEOS backups', () => {
    expect(parseBackup('not json').ok).toBe(false);
    expect(parseBackup('{"format":"other"}').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ format: 'lifeos-backup', version: 99, records: [] })).ok).toBe(false);
  });

  it('accepts valid records and skips malformed ones', () => {
    const res = parseBackup(JSON.stringify({ format: 'lifeos-backup', version: 1, records: [
      { id: 'a', c: 'tasks', ca: 1, ua: 2, data: { title: 'ok' } },
      { id: '../bad', c: 'tasks', data: {} },
      { id: 'b', c: 'Bad Name', data: {} },
      { id: 'c', c: 'notes', data: 'nope' },
    ] }));
    expect(res.ok && res.file.records.map((r) => r.id)).toEqual(['a']);
    expect(res.ok && res.skipped).toBe(3);
  });
});
