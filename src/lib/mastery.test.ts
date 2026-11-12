import { describe, expect, it } from 'vitest';
import type { Concept, StudyCard } from '../content/types.ts';
import { makeState, reviewedState } from '../test/factories.ts';
import type { ReviewLogRecord } from './db.ts';
import { averageStrength, calibration, cardStrength, conceptMastery, findLeeches, reviewForecast } from './mastery.ts';
import { Rating, State } from './scheduler.ts';

const now = new Date(2026, 2, 10, 12);
const options = { requestRetention: 0.9, fuzz: false };

const card = (id: string, conceptIds: string[]): StudyCard => ({
  id,
  chapterId: 'ch04',
  sectionId: 's',
  conceptIds,
  kind: 'recall',
  prompt: 'p',
  answer: 'a',
  keyPoints: ['k'],
});

const concept: Concept = { id: 'c1', name: 'C1', sectionId: 's', summary: '', prerequisites: [] };

describe('cardStrength', () => {
  it('is 0 for missing or new cards', () => {
    expect(cardStrength(undefined, now, options)).toBe(0);
    expect(cardStrength(makeState({ cardId: 'x' }), now, options)).toBe(0);
  });

  it('grows with stability and caps at 1', () => {
    const weak = reviewedState('a', new Date(now.getTime() + 86_400_000), { stability: 2, last_review: now });
    const strong = reviewedState('b', new Date(now.getTime() + 86_400_000), { stability: 60, last_review: now });
    expect(cardStrength(weak, now, options)).toBeLessThan(cardStrength(strong, now, options));
    expect(cardStrength(strong, now, options)).toBeLessThanOrEqual(1);
  });
});

describe('conceptMastery', () => {
  it('averages over linked cards and counts reviewed ones', () => {
    const cards = [card('a', ['c1']), card('b', ['c1']), card('c', ['other'])];
    const states = new Map([['a', reviewedState('a', now, { stability: 60, last_review: now })]]);
    const summary = conceptMastery(concept, cards, states, now, options);
    expect(summary.totalCards).toBe(2);
    expect(summary.reviewedCards).toBe(1);
    expect(summary.mastery).toBeGreaterThan(0.4);
    expect(summary.mastery).toBeLessThanOrEqual(0.5);
  });

  it('is zero with no linked cards', () => {
    expect(conceptMastery(concept, [], new Map(), now, options)).toEqual({ mastery: 0, totalCards: 0, reviewedCards: 0 });
  });
});

describe('averageStrength', () => {
  it('returns 0 for an empty set', () => {
    expect(averageStrength([], new Map(), now, options)).toBe(0);
  });
});

describe('calibration', () => {
  const log = (confidence: 1 | 2 | 3, correct: boolean): ReviewLogRecord => ({
    cardId: 'a',
    chapterId: 'ch04',
    reviewedAt: now,
    grade: Rating.Good,
    confidence,
    correct,
    coverage: null,
    answer: '',
    stateBefore: State.Review,
    scheduledDays: 1,
  });

  it('computes accuracy per confidence bucket', () => {
    const buckets = calibration([log(3, true), log(3, false), log(1, false)]);
    expect(buckets.find((b) => b.confidence === 3)?.accuracy).toBe(0.5);
    expect(buckets.find((b) => b.confidence === 1)?.accuracy).toBe(0);
    expect(buckets.find((b) => b.confidence === 2)?.accuracy).toBeNull();
  });
});

describe('findLeeches', () => {
  it('returns cards with many lapses, worst first', () => {
    const states = [reviewedState('a', now, { lapses: 3 }), reviewedState('b', now, { lapses: 5 }), reviewedState('c', now, { lapses: 1 })];
    expect(findLeeches(states).map((s) => s.cardId)).toEqual(['b', 'a']);
  });
});

describe('reviewForecast', () => {
  it('buckets due reviews per day, folding overdue cards into today', () => {
    const states = [
      reviewedState('overdue', new Date(2026, 2, 8, 9)),
      reviewedState('today', new Date(2026, 2, 10, 18)),
      reviewedState('in2', new Date(2026, 2, 12, 9)),
      reviewedState('far', new Date(2026, 3, 30, 9)),
      makeState({ cardId: 'new' }),
    ];
    const forecast = reviewForecast(states, now);
    expect(forecast).toHaveLength(7);
    expect(forecast.map((d) => d.count)).toEqual([2, 0, 1, 0, 0, 0, 0]);
  });
});
