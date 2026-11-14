import { describe, expect, it } from 'vitest';
import { nextAnnual } from '@/core/lib/dates';
import { contactStatus, lastContacts, reconnectQueue, upcomingBirthdays } from '@/core/lib/people';

const day = (s: string) => new Date(`${s}T12:00:00`);
const now = day('2026-11-14');

describe('keep in touch', () => {
  it('uses the latest of logged interactions and a manually entered last contact', () => {
    const people = [{ id: 'a', lastContactAt: '2026-10-01' }, { id: 'b' }];
    const last = lastContacts(people, [
      { personId: 'a', date: '2026-09-01' },
      { personId: 'a', date: '2026-11-01' },
      { personId: 'b', date: '2026-08-08' },
      { personId: 'b', date: '2026-11-10', deletedAt: '2026-11-11' },
    ]);
    expect(last.get('a')?.getDate()).toBe(1);
    expect(last.get('a')?.getMonth()).toBe(10);
    expect(last.get('b')?.getMonth()).toBe(7);
  });

  it('classifies overdue, due, soon and fine, and ignores people without a cadence', () => {
    expect(contactStatus({ id: 'x', cadenceDays: 30 }, day('2026-10-01'), now)).toMatchObject({ state: 'overdue', daysLeft: -14, sinceDays: 44 });
    expect(contactStatus({ id: 'x', cadenceDays: 30 }, day('2026-10-15'), now).state).toBe('due');
    expect(contactStatus({ id: 'x', cadenceDays: 30 }, day('2026-10-18'), now)).toMatchObject({ state: 'soon', daysLeft: 3 });
    expect(contactStatus({ id: 'x', cadenceDays: 30 }, day('2026-11-10'), now).state).toBe('ok');
    expect(contactStatus({ id: 'x', cadenceDays: 0 }, day('2026-01-01'), now)).toMatchObject({ state: 'none', dueAt: null });
  });

  it('starts the clock when a person is added, so new people are not instantly overdue', () => {
    expect(contactStatus({ id: 'x', cadenceDays: 7, _ca: now.getTime() }, null, now)).toMatchObject({ state: 'ok', daysLeft: 7, sinceDays: null });
  });

  it('orders the reconnect queue most overdue first and skips archived people', () => {
    const people = [
      { id: 'soon', cadenceDays: 30 },
      { id: 'late', cadenceDays: 7 },
      { id: 'fine', cadenceDays: 365 },
      { id: 'gone', cadenceDays: 7, archived: true },
    ];
    const last = new Map([['soon', day('2026-10-18')], ['late', day('2026-10-20')], ['fine', day('2026-11-01')], ['gone', day('2026-01-01')]]);
    expect(reconnectQueue(people, last, now).map((x) => x.person.id)).toEqual(['late', 'soon']);
  });
});

describe('birthdays', () => {
  it('lists birthdays in the window with the age they turn', () => {
    const list = upcomingBirthdays([{ id: 'a', birthday: '1992-11-20' }, { id: 'b', birthday: '1990-01-05' }, { id: 'c', birthday: '1985-11-14' }], now, 30);
    expect(list.map((b) => [b.person.id, b.daysLeft, b.turning])).toEqual([['c', 0, 41], ['a', 6, 34]]);
  });

  it('treats a birth year before 1900 as unknown', () => {
    expect(upcomingBirthdays([{ id: 'a', birthday: '1800-11-20' }], now)[0].turning).toBeNull();
  });

  it('celebrates 29 February on 28 February in common years', () => {
    expect(nextAnnual('2000-02-29', day('2027-01-10'))?.getDate()).toBe(28);
    expect(nextAnnual('2000-02-29', day('2028-01-10'))?.getDate()).toBe(29);
    expect(nextAnnual('2000-02-29', day('2027-03-01'))?.getFullYear()).toBe(2028);
  });
});
