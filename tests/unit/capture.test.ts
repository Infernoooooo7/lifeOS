import { describe, expect, it } from 'vitest';
import { classifyCapture } from '@/core/lib/capture';

const now = new Date('2026-11-14T10:00:00');
const c = (s: string) => classifyCapture(s, now);

describe('smart capture', () => {
  it('recognises expenses in the ways people write them', () => {
    expect(c('spent 450 on dinner at Toit')).toMatchObject({ kind: 'expense', amount: 450, title: 'dinner at Toit', category: 'Dining', when: '2026-11-14' });
    expect(c('₹1,200 groceries')).toMatchObject({ kind: 'expense', amount: 1200, category: 'Groceries' });
    expect(c('uber 230 rs yesterday')).toMatchObject({ kind: 'expense', amount: 230, category: 'Transport', when: '2026-11-13' });
    expect(c('paid 999 for netflix')).toMatchObject({ kind: 'expense', amount: 999, category: 'Subscriptions' });
    expect(c('$12.50 coffee')).toMatchObject({ kind: 'expense', amount: 12.5, category: 'Dining' });
    expect(c('rent ₹1,20,000')).toMatchObject({ kind: 'expense', amount: 120000, category: 'Rent' });
  });

  it('turns meeting-like lines with a time into events', () => {
    const e = c('Lunch with Ravi tomorrow 1pm');
    expect(e.kind).toBe('event');
    expect(e.title).toBe('Lunch with Ravi');
    expect(new Date(e.when!).getHours()).toBe(13);
    expect(c('dentist appointment friday').kind).toBe('event');
    expect(c('team meeting').kind).toBe('task'); // no date: stays a task
  });

  it('understands reminders, ideas, goals and links', () => {
    const r = c('remind me to call mom at 6pm');
    expect(r).toMatchObject({ kind: 'reminder', title: 'Call mom' });
    expect(new Date(r.when!).getHours()).toBe(18);
    expect(c('idea: a habit tracker for plants')).toMatchObject({ kind: 'idea', title: 'a habit tracker for plants' });
    expect(c('I want to run a half marathon')).toMatchObject({ kind: 'goal', title: 'Run a half marathon' });
    expect(c('https://example.com/article great read')).toMatchObject({ kind: 'link', url: 'https://example.com/article', title: 'great read' });
  });

  it('falls back to a task with dates, priority and tags', () => {
    expect(c('Pay rent tomorrow !high #home')).toMatchObject({ kind: 'task', title: 'Pay rent', when: '2026-11-15', priority: 3, tags: ['home'] });
    expect(c('Buy 2 kg rice')).toMatchObject({ kind: 'task' }); // a number is not an expense on its own
  });
});
