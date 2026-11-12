import { describe, expect, it } from 'vitest';
import { makeState, reviewedState } from '../test/factories.ts';
import { createRng } from './random.ts';
import {
  buildSessionQueue,
  countIntroducedToday,
  dueReviews,
  interleave,
  isSameLocalDay,
  newAllowance,
  newCards,
  requeuePosition,
} from './queue.ts';

const now = new Date(2026, 2, 10, 12, 0, 0);
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
const hoursAhead = (h: number) => new Date(now.getTime() + h * 3_600_000);

describe('isSameLocalDay', () => {
  it('compares calendar days in local time', () => {
    expect(isSameLocalDay(new Date(2026, 2, 10, 0, 1), new Date(2026, 2, 10, 23, 59))).toBe(true);
    expect(isSameLocalDay(new Date(2026, 2, 10, 23, 59), new Date(2026, 2, 11, 0, 1))).toBe(false);
  });
});

describe('dueReviews', () => {
  it('returns non-suspended reviewed cards due now, oldest first', () => {
    const states = [
      reviewedState('b', hoursAgo(1)),
      reviewedState('a', hoursAgo(5)),
      reviewedState('future', hoursAhead(2)),
      reviewedState('suspended', hoursAgo(3), {}, { suspended: true }),
      makeState({ cardId: 'new' }),
    ];
    expect(dueReviews(states, now).map((s) => s.cardId)).toEqual(['a', 'b']);
  });
});

describe('newCards', () => {
  it('orders by unlock time, then id', () => {
    const states = [
      makeState({ cardId: 'ch04.002', unlockedAt: hoursAgo(1) }),
      makeState({ cardId: 'ch04.001', unlockedAt: hoursAgo(1) }),
      makeState({ cardId: 'ch04.050', unlockedAt: hoursAgo(9) }),
      makeState({ cardId: 'ch04.003', suspended: true }),
    ];
    expect(newCards(states).map((s) => s.cardId)).toEqual(['ch04.050', 'ch04.001', 'ch04.002']);
  });
});

describe('countIntroducedToday / newAllowance', () => {
  it('counts first reviews today and caps the allowance at zero', () => {
    const states = [
      reviewedState('a', hoursAhead(1), {}, { introducedAt: hoursAgo(1) }),
      reviewedState('b', hoursAhead(1), {}, { introducedAt: new Date(2026, 2, 9, 12) }),
    ];
    expect(countIntroducedToday(states, now)).toBe(1);
    expect(newAllowance(10, 3)).toBe(7);
    expect(newAllowance(2, 5)).toBe(0);
  });
});

describe('interleave', () => {
  it('avoids adjacent items from the same group when possible', () => {
    const items = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1', 'c2'];
    const out = interleave(items, (s) => s[0], createRng(5));
    expect([...out].sort()).toEqual([...items].sort());
    for (let i = 1; i < out.length; i++) expect(out[i][0]).not.toBe(out[i - 1][0]);
  });

  it('still returns everything when separation is impossible', () => {
    const out = interleave(['a1', 'a2', 'a3', 'b1'], (s) => s[0], createRng(1));
    expect(out).toHaveLength(4);
  });
});

describe('buildSessionQueue', () => {
  it('includes due reviews and only as many new cards as allowed', () => {
    const states = [
      reviewedState('r1', hoursAgo(2)),
      reviewedState('r2', hoursAgo(1), {}, { sectionId: 'btrees' }),
      makeState({ cardId: 'n1' }),
      makeState({ cardId: 'n2' }),
      makeState({ cardId: 'n3' }),
    ];
    const queue = buildSessionQueue({ states, now, newLimit: 3, introducedToday: 1, seed: 7 });
    expect(queue).toHaveLength(4);
    expect(queue).toEqual(expect.arrayContaining(['r1', 'r2', 'n1', 'n2']));
    expect(queue).not.toContain('n3');
  });

  it('respects maxReviews', () => {
    const states = Array.from({ length: 10 }, (_, i) => reviewedState(`r${i}`, hoursAgo(i + 1)));
    expect(buildSessionQueue({ states, now, newLimit: 0, introducedToday: 0, maxReviews: 4 })).toHaveLength(4);
  });
});

describe('requeuePosition', () => {
  it('re-inserts a few cards later, or at the end of a short queue', () => {
    expect(requeuePosition(10)).toBe(3);
    expect(requeuePosition(1)).toBe(1);
    expect(requeuePosition(0)).toBe(0);
  });
});
