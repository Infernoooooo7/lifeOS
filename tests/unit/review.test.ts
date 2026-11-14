import { describe, expect, it } from 'vitest';
import { rescheduleTargets, reviewStreak, reviewSummary, reviewWeek } from '@/core/lib/review';

const at = (s: string) => new Date(`${s}T10:00:00`);

describe('weekly review', () => {
  it('reviews the current week from Friday, the previous week earlier in the week', () => {
    expect(reviewWeek(at('2026-11-14')).key).toBe('2026-11-09'); // Saturday → this week
    expect(reviewWeek(at('2026-11-16')).key).toBe('2026-11-09'); // Monday → last week
    expect(reviewWeek(at('2026-11-12')).key).toBe('2026-11-02'); // Thursday → last week
  });

  it('summarises wins, overdue work, the unsorted inbox and the week ahead', () => {
    const now = at('2026-11-14');
    const week = reviewWeek(now);
    const t = (id: string, extra: Record<string, unknown>) => ({ id, title: id, status: 'todo', _ca: at('2026-11-01').getTime(), ...extra });
    const s = reviewSummary({
      tasks: [
        t('done-in-week', { status: 'done', completedAt: '2026-11-12T09:00:00' }),
        t('done-before', { status: 'done', completedAt: '2026-11-02T09:00:00' }),
        t('late', { dueAt: '2026-11-10' }),
        t('inbox', {}),
        t('parked', { tags: ['someday'] }),
        t('in-project', { projectId: 'p1' }),
        t('child', { parentId: 'x' }),
        t('soon', { dueAt: '2026-11-17' }),
        t('later', { dueAt: '2026-12-30' }),
        t('new', { _ca: at('2026-11-11').getTime(), dueAt: '2026-11-20' }),
        t('gone', { deletedAt: '2026-11-12' }),
      ],
      focusSessions: [{ id: 'f1', startedAt: '2026-11-10T09:00:00', minutes: 50 }, { id: 'f2', startedAt: '2026-11-10T10:00:00', minutes: 10, kind: 'break' }, { id: 'f3', startedAt: '2026-11-01T09:00:00', minutes: 25 }],
      interactions: [{ id: 'i1', date: '2026-11-13' }, { id: 'i2', date: '2026-10-01' }],
    }, now, week);
    expect(s.completed.map((x) => x.id)).toEqual(['done-in-week']);
    expect(s.created).toBe(1);
    expect(s.overdue.map((x) => x.id)).toEqual(['late']);
    expect(s.inbox.map((x) => x.id)).toEqual(['inbox']);
    expect(s.upcoming.map((x) => x.id)).toEqual(['soon', 'new']);
    expect(s.focusMinutes).toBe(50);
    expect(s.catchUps).toBe(1);
    expect(s.habitConsistency).toBeNull();
  });

  it('reschedules to tomorrow or next Monday', () => {
    expect(rescheduleTargets(at('2026-11-14'))).toEqual({ tomorrow: '2026-11-15', nextWeek: '2026-11-16' });
  });

  it('counts consecutive reviewed weeks and does not break the streak for a review still to do', () => {
    const e = (week: string) => ({ id: `jr:${week}:weekly`, kind: 'weekly', week });
    expect(reviewStreak([e('2026-11-09'), e('2026-11-02'), e('2026-10-26'), e('2026-10-12')], at('2026-11-14'))).toBe(3);
    expect(reviewStreak([e('2026-11-02'), e('2026-10-26')], at('2026-11-14'))).toBe(2);
    expect(reviewStreak([e('2026-10-19')], at('2026-11-14'))).toBe(0);
  });
});

import { dueNotifications } from '@/core/lib/reminders';

describe('review and people reminders', () => {
  const prefs = { tasks: false, events: false, habits: false, renewals: false, dates: false, review: true, reviewDay: 0, weekStart: 1 };
  it('reminds from the review day until the week is reviewed, once per week', () => {
    expect(dueNotifications({ journal: [] }, at('2026-11-14'), prefs)).toEqual([]); // Saturday: not yet
    const sunday = dueNotifications({ journal: [] }, at('2026-11-15'), prefs);
    expect(sunday.map((n) => n.id)).toEqual(['nt:review:2026-11-09']);
    expect(dueNotifications({ journal: [] }, at('2026-11-17'), prefs).map((n) => n.id)).toEqual(['nt:review:2026-11-09']); // still open on Tuesday
    expect(dueNotifications({ journal: [{ id: 'jr:2026-11-09:weekly' }] }, at('2026-11-15'), prefs)).toEqual([]);
  });

  it('reminds to reconnect once per due date and before birthdays', () => {
    const now = at('2026-11-14');
    const due = dueNotifications(
      { people: [{ id: 'a', name: 'Asha', cadenceDays: 14, birthday: '1992-11-16' }, { id: 'b', name: 'Ben', cadenceDays: 30 }], interactions: [{ id: 'i', personId: 'a', date: '2026-10-25' }, { id: 'j', personId: 'b', date: '2026-11-10' }] },
      now,
      { tasks: false, events: false, habits: false, renewals: false, dates: false, leadDays: 3 },
    );
    expect(due.map((n) => n.id)).toEqual(['nt:person:a:reconnect:2026-11-08', 'nt:person:a:birthday:2026-11-16']);
    expect(due[1].body).toBe('Asha turns 34 in 2 days');
  });
});
