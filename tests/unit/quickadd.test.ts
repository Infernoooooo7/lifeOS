import { describe, expect, it } from 'vitest';
import { parseQuickTask } from '@/core/lib/quickadd';

const now = new Date(2026, 10, 10, 8, 0); // Tuesday

describe('quick add parser', () => {
  it('extracts dates, priority and tags and keeps the rest as the title', () => {
    expect(parseQuickTask('Pay rent tomorrow !high #home #bills', now)).toEqual({ title: 'Pay rent', dueAt: '2026-11-11', priority: 3, tags: ['home', 'bills'] });
    expect(parseQuickTask('Call mom friday', now)).toEqual({ title: 'Call mom', dueAt: '2026-11-13' });
    expect(parseQuickTask('Review notes next week p2', now)).toEqual({ title: 'Review notes', dueAt: '2026-11-17', priority: 2 });
    expect(parseQuickTask('Submit form 2026-12-01', now)).toEqual({ title: 'Submit form', dueAt: '2026-12-01' });
    expect(parseQuickTask('Renew passport in 10 days', now).dueAt).toBe('2026-11-20');
  });

  it('understands clock times', () => {
    const t = parseQuickTask('Standup tomorrow at 9:30am', now);
    expect(t.title).toBe('Standup');
    expect(new Date(t.dueAt!)).toEqual(new Date(2026, 10, 11, 9, 30));
    expect(new Date(parseQuickTask('Take medicine 8pm', now).dueAt!)).toEqual(new Date(2026, 10, 10, 20, 0));
  });

  it('leaves plain text alone', () => {
    expect(parseQuickTask('Buy milk', now)).toEqual({ title: 'Buy milk' });
    expect(parseQuickTask('Read chapter 12 of the monday book', now).title).toBe('Read chapter 12 of the book');
    expect(parseQuickTask('  ', now)).toEqual({ title: '' });
  });
});
