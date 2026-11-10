import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card } from 'ts-fsrs';

/**
 * Spaced repetition scheduling with FSRS (Free Spaced Repetition Scheduler) through the MIT-licensed
 * ts-fsrs library. The scheduling state is stored on each flashcard as plain JSON (`srs`).
 */

export interface SrsState {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  learning_steps: number;
  state: number;
  last_review?: string;
}

export type Grade = 'again' | 'hard' | 'good' | 'easy';
const RATING = { again: Rating.Again, hard: Rating.Hard, good: Rating.Good, easy: Rating.Easy } as const;

const scheduler = fsrs(generatorParameters({ enable_fuzz: false, request_retention: 0.9 }));

const toCard = (s: SrsState | null | undefined, now: Date): Card =>
  s ? ({ ...s, due: new Date(s.due), last_review: s.last_review ? new Date(s.last_review) : undefined } as Card) : createEmptyCard(now);

const fromCard = (c: Card): SrsState => ({
  due: c.due.toISOString(), stability: c.stability, difficulty: c.difficulty, elapsed_days: c.elapsed_days, scheduled_days: c.scheduled_days,
  reps: c.reps, lapses: c.lapses, learning_steps: c.learning_steps, state: c.state, last_review: c.last_review ? new Date(c.last_review).toISOString() : undefined,
});

/** New scheduling state after grading a card. */
export function review(state: SrsState | null | undefined, grade: Grade, now: Date = new Date()): SrsState {
  return fromCard(scheduler.next(toCard(state, now), now, RATING[grade]).card);
}

/** When the card would next be due for each possible grade (shown on the answer buttons). */
export function preview(state: SrsState | null | undefined, now: Date = new Date()): Record<Grade, Date> {
  const card = toCard(state, now);
  return {
    again: scheduler.next(card, now, Rating.Again).card.due,
    hard: scheduler.next(card, now, Rating.Hard).card.due,
    good: scheduler.next(card, now, Rating.Good).card.due,
    easy: scheduler.next(card, now, Rating.Easy).card.due,
  };
}

export const isDue = (state: SrsState | null | undefined, now: Date = new Date()): boolean => !state || new Date(state.due).getTime() <= now.getTime();
export const isNew = (state: SrsState | null | undefined): boolean => !state || state.state === State.New;

export function stageLabel(state: SrsState | null | undefined): string {
  if (!state || state.state === State.New) return 'New';
  return state.state === State.Review ? 'Review' : state.state === State.Relearning ? 'Relearning' : 'Learning';
}

export function fmtInterval(due: Date, now: Date = new Date()): string {
  const min = Math.max(1, Math.round((due.getTime() - now.getTime()) / 60_000));
  if (min < 60) return `${min}m`;
  if (min < 60 * 24) return `${Math.round(min / 60)}h`;
  const days = Math.round(min / 1440);
  return days < 31 ? `${days}d` : days < 365 ? `${Math.round(days / 30)}mo` : `${(days / 365).toFixed(1)}y`;
}
