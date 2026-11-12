import { describe, expect, it } from 'vitest';
import { hash32 } from './hash.ts';
import { createRng, randomInt, shuffle } from './random.ts';

describe('createRng', () => {
  it('is deterministic for a seed and stays in [0, 1)', () => {
    const a = createRng(42);
    const b = createRng(42);
    const values = Array.from({ length: 100 }, () => a());
    expect(values).toEqual(Array.from({ length: 100 }, () => b()));
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it('differs between seeds', () => {
    expect(createRng(1)()).not.toEqual(createRng(2)());
  });
});

describe('shuffle', () => {
  it('returns a permutation without mutating the input', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = shuffle(input, createRng(3));
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...out].sort()).toEqual(input);
  });
});

describe('randomInt', () => {
  it('stays within inclusive bounds and hits both ends', () => {
    const rng = createRng(9);
    const seen = new Set(Array.from({ length: 500 }, () => randomInt(rng, 2, 4)));
    expect([...seen].sort()).toEqual([2, 3, 4]);
  });
});

describe('hash32', () => {
  it('is deterministic, unsigned and seed-sensitive', () => {
    expect(hash32('handbag')).toBe(hash32('handbag'));
    expect(hash32('handbag')).toBeGreaterThanOrEqual(0);
    expect(hash32('handbag', 1)).not.toBe(hash32('handbag', 2));
    expect(hash32('a')).not.toBe(hash32('b'));
  });
});
