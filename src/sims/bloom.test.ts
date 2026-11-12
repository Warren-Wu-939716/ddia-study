import { describe, expect, it } from 'vitest';
import {
  bloomAdd,
  bloomFromKeys,
  bloomMightContain,
  bloomPositions,
  createBloom,
  falsePositiveRateForBitsPerKey,
  measureFalsePositiveRate,
  optimalHashCount,
  theoreticalFalsePositiveRate,
} from './bloom.ts';

describe('Bloom filter', () => {
  it('validates its parameters', () => {
    expect(() => createBloom(0, 1)).toThrow(RangeError);
    expect(() => createBloom(8, 0)).toThrow(RangeError);
  });

  it('produces k in-range positions per key', () => {
    const positions = bloomPositions('handbag', 16, 3);
    expect(positions).toHaveLength(3);
    expect(positions.every((p) => p >= 0 && p < 16)).toBe(true);
  });

  it('adds keys immutably and never gives false negatives', () => {
    const empty = createBloom(64, 3);
    const one = bloomAdd(empty, 'handbag');
    expect(empty.bits.every((b) => b === 0)).toBe(true);
    expect(one.count).toBe(1);
    const keys = Array.from({ length: 50 }, (_, i) => `k${i}`);
    const filter = bloomFromKeys(keys, 512, 4);
    expect(keys.every((k) => bloomMightContain(filter, k))).toBe(true);
  });

  it('says "definitely absent" for most absent keys when sized well', () => {
    const keys = Array.from({ length: 100 }, (_, i) => `key-${i}`);
    const filter = bloomFromKeys(keys, 1000, optimalHashCount(1000, 100));
    expect(measureFalsePositiveRate(filter, new Set(keys))).toBeLessThan(0.03);
  });

  it('measured false-positive rate tracks the formula', () => {
    const keys = Array.from({ length: 40 }, (_, i) => `key-${i}`);
    const filter = bloomFromKeys(keys, 128, 3);
    const measured = measureFalsePositiveRate(filter, new Set(keys), 4000);
    expect(Math.abs(measured - theoreticalFalsePositiveRate(128, 40, 3))).toBeLessThan(0.06);
  });
});

describe('sizing maths', () => {
  it('has no false positives with no keys', () => {
    expect(theoreticalFalsePositiveRate(64, 0, 3)).toBe(0);
  });

  it('matches the rule of thumb: ~1% at 10 bits/key, ~10× better per 5 extra bits', () => {
    const ten = falsePositiveRateForBitsPerKey(10);
    const fifteen = falsePositiveRateForBitsPerKey(15);
    expect(ten).toBeGreaterThan(0.005);
    expect(ten).toBeLessThan(0.015);
    expect(ten / fifteen).toBeGreaterThan(7);
    expect(ten / fifteen).toBeLessThan(15);
  });

  it('computes the optimal hash count', () => {
    expect(optimalHashCount(1000, 100)).toBe(7);
    expect(optimalHashCount(10, 0)).toBe(1);
    expect(optimalHashCount(8, 100)).toBe(1);
  });
});
