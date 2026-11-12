import { describe, expect, it } from 'vitest';
import { ALL_CHALLENGES, CHALLENGES_BY_LAB, nearestOnLogScale, solveChallenge } from './challenges.ts';

describe('lab challenges', () => {
  it.each(ALL_CHALLENGES.map((c) => [c.id, c] as const))('%s has a computed answer among its options', (_id, challenge) => {
    const answer = solveChallenge(challenge);
    expect(challenge.options).toContain(answer);
    expect(new Set(challenge.options).size).toBe(challenge.options.length);
    expect(challenge.explanation.length).toBeGreaterThan(20);
  });

  it('uses unique ids that are prefixed by their lab', () => {
    const ids = ALL_CHALLENGES.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const [lab, list] of Object.entries(CHALLENGES_BY_LAB)) {
      for (const c of list) {
        expect(c.labId).toBe(lab);
        expect(c.id.startsWith(`${lab}.`)).toBe(true);
      }
    }
  });
});

describe('nearestOnLogScale', () => {
  it('picks the closest option by ratio', () => {
    const parse = (o: string) => Number.parseFloat(o) / 100;
    expect(nearestOnLogScale(0.008, ['10%', '1%', '0.1%'], parse)).toBe('1%');
    expect(nearestOnLogScale(0.04, ['10%', '1%', '0.1%'], parse)).toBe('10%');
  });
});
