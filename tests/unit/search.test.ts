import { describe, expect, it } from 'vitest';
import type { Rec } from '@/core/data/db';
import { scoreRecord, withinEdits } from '@/core/lib/search';

const rec = (title: string, body = ''): Rec => ({ id: title, _c: 'notes', _ca: Date.now(), _ua: Date.now(), title, content: body, _s: `${title} ${body}`.toLowerCase() }) as Rec;

describe('typo-tolerant search', () => {
  it('measures edits with swaps counted once', () => {
    expect(withinEdits('meeting', 'metting', 1)).toBe(true);
    expect(withinEdits('recieve', 'receive', 1)).toBe(true); // swapped letters
    expect(withinEdits('budget', 'budgte', 1)).toBe(true);
    expect(withinEdits('budget', 'gadget', 1)).toBe(false);
    expect(withinEdits('cat', 'cart', 1)).toBe(true);
    expect(withinEdits('calendar', 'kalender', 2)).toBe(true);
  });

  it('finds a record despite a typo, but ranks exact matches first', () => {
    const exact = rec('Team meeting notes');
    const typo = scoreRecord(exact, ['metting']);
    expect(typo).toBeGreaterThan(0);
    expect(scoreRecord(exact, ['meeting'])).toBeGreaterThan(typo);
  });

  it('matches the start of longer words with a typo', () => {
    expect(scoreRecord(rec('Quarterly planning'), ['plnan'])).toBeGreaterThan(0);
  });

  it('does not let short words match loosely, and still needs every word', () => {
    expect(scoreRecord(rec('Buy milk'), ['bus'])).toBe(0);
    expect(scoreRecord(rec('Dentist appointment'), ['dentst', 'tomorrow'])).toBe(0);
    expect(scoreRecord(rec('Dentist appointment'), ['dentst', 'apointment'])).toBeGreaterThan(0);
  });

  it('prefers a typo in the title over a typo in the body', () => {
    expect(scoreRecord(rec('Holiday plans'), ['holyday'])).toBeGreaterThan(scoreRecord(rec('Notes', 'ideas for the holiday'), ['holyday']));
  });
});
