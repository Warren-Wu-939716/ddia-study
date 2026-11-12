import { describe, expect, it } from 'vitest';
import {
  applyGrade,
  formatInterval,
  newFsrsCard,
  previewDueDates,
  Rating,
  retrievability,
  State,
  suggestChoiceGrade,
  suggestGrade,
} from './scheduler.ts';

const now = new Date('2026-03-01T09:00:00Z');
const options = { requestRetention: 0.9, fuzz: false };

describe('applyGrade', () => {
  it('moves a new card out of the New state and schedules it in the future', () => {
    const card = newFsrsCard(now);
    expect(card.state).toBe(State.New);
    const { card: next, log } = applyGrade(card, Rating.Good, now, options);
    expect(next.state).not.toBe(State.New);
    expect(next.due.getTime()).toBeGreaterThan(now.getTime());
    expect(next.reps).toBe(1);
    expect(log.rating).toBe(Rating.Good);
  });

  it('counts a lapse when a review card is forgotten', () => {
    let card = newFsrsCard(now);
    card = applyGrade(card, Rating.Easy, now, options).card;
    const later = new Date(card.due.getTime() + 86_400_000);
    const lapsed = applyGrade(card, Rating.Again, later, options).card;
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.state).toBe(State.Relearning);
  });
});

describe('previewDueDates', () => {
  it('orders intervals Again ≤ Hard ≤ Good ≤ Easy', () => {
    const card = applyGrade(newFsrsCard(now), Rating.Good, now, options).card;
    const at = new Date(card.due.getTime());
    const dates = previewDueDates(card, at, options);
    expect(dates[Rating.Again].getTime()).toBeLessThanOrEqual(dates[Rating.Hard].getTime());
    expect(dates[Rating.Hard].getTime()).toBeLessThanOrEqual(dates[Rating.Good].getTime());
    expect(dates[Rating.Good].getTime()).toBeLessThanOrEqual(dates[Rating.Easy].getTime());
  });
});

describe('retrievability', () => {
  it('is 0 for unseen cards and between 0 and 1 for reviewed ones', () => {
    const card = newFsrsCard(now);
    expect(retrievability(card, now, options)).toBe(0);
    const reviewed = applyGrade(card, Rating.Easy, now, options).card;
    const r = retrievability(reviewed, new Date(now.getTime() + 86_400_000), options);
    expect(r).toBeGreaterThan(0);
    expect(r).toBeLessThanOrEqual(1);
  });
});

describe('formatInterval', () => {
  const at = (ms: number) => new Date(now.getTime() + ms);
  it.each([
    [30_000, '1m'],
    [10 * 60_000, '10m'],
    [3 * 3_600_000, '3h'],
    [4 * 86_400_000, '4d'],
    [90 * 86_400_000, '3mo'],
    [730 * 86_400_000, '2.0y'],
  ])('formats %d ms as %s', (ms, label) => {
    expect(formatInterval(now, at(ms))).toBe(label);
  });

  it('never goes negative', () => {
    expect(formatInterval(now, at(-60_000))).toBe('1m');
  });
});

describe('suggestGrade', () => {
  it('maps rubric coverage and confidence to a grade', () => {
    expect(suggestGrade(0.2, 3)).toBe(Rating.Again);
    expect(suggestGrade(0.6, 2)).toBe(Rating.Hard);
    expect(suggestGrade(0.9, 2)).toBe(Rating.Good);
    expect(suggestGrade(1, 2)).toBe(Rating.Good);
    expect(suggestGrade(1, 3)).toBe(Rating.Easy);
  });

  it('grades choice answers by correctness and confidence', () => {
    expect(suggestChoiceGrade(false, 3)).toBe(Rating.Again);
    expect(suggestChoiceGrade(true, 1)).toBe(Rating.Good);
    expect(suggestChoiceGrade(true, 3)).toBe(Rating.Easy);
  });
});
