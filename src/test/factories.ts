import { createEmptyCard, State } from 'ts-fsrs';
import type { CardStateRecord } from '../lib/db.ts';

/** Builds a card state for tests; override any field. */
export function makeState(overrides: Partial<CardStateRecord> & { cardId: string }, fsrs: Partial<CardStateRecord['fsrs']> = {}): CardStateRecord {
  const base = createEmptyCard(new Date('2026-01-01T00:00:00Z'));
  return {
    chapterId: 'ch04',
    sectionId: 'log-structured',
    suspended: false,
    unlockedAt: new Date('2026-01-01T00:00:00Z'),
    introducedAt: null,
    ...overrides,
    fsrs: { ...base, ...fsrs },
  };
}

export function reviewedState(cardId: string, due: Date, extra: Partial<CardStateRecord['fsrs']> = {}, overrides: Partial<CardStateRecord> = {}): CardStateRecord {
  return makeState(
    { cardId, introducedAt: new Date('2026-01-01T00:00:00Z'), ...overrides },
    { state: State.Review, due, stability: 10, difficulty: 5, reps: 3, last_review: new Date(due.getTime() - 10 * 86_400_000), ...extra },
  );
}
