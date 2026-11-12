import { hash32 } from '../lib/hash.ts';
import { createRng } from '../lib/random.ts';

export interface BloomFilter {
  readonly bits: readonly number[];
  readonly hashes: number;
  readonly count: number;
}

export function createBloom(size: number, hashes: number): BloomFilter {
  if (!Number.isInteger(size) || size < 1) throw new RangeError('Bloom filter size must be a positive integer');
  if (!Number.isInteger(hashes) || hashes < 1) throw new RangeError('Bloom filter needs at least one hash');
  return { bits: new Array<number>(size).fill(0), hashes, count: 0 };
}

/** Bit indexes for a key, using double hashing (h1 + i·h2) to derive k positions from two hashes. */
export function bloomPositions(key: string, size: number, hashes: number): number[] {
  const h1 = hash32(key, 0);
  const h2 = hash32(key, 0x9747b28c) | 1;
  return Array.from({ length: hashes }, (_, i) => (((h1 + Math.imul(i, h2)) >>> 0) % size));
}

export function bloomAdd(filter: BloomFilter, key: string): BloomFilter {
  const bits = [...filter.bits];
  for (const position of bloomPositions(key, bits.length, filter.hashes)) bits[position] = 1;
  return { bits, hashes: filter.hashes, count: filter.count + 1 };
}

export function bloomFromKeys(keys: readonly string[], size: number, hashes: number): BloomFilter {
  return keys.reduce(bloomAdd, createBloom(size, hashes));
}

/** False means "definitely absent"; true means "maybe present". */
export function bloomMightContain(filter: BloomFilter, key: string): boolean {
  return bloomPositions(key, filter.bits.length, filter.hashes).every((p) => filter.bits[p] === 1);
}

/** Classic approximation: (1 − e^(−k·n/m))^k. */
export function theoreticalFalsePositiveRate(size: number, count: number, hashes: number): number {
  if (count === 0) return 0;
  return (1 - Math.exp((-hashes * count) / size)) ** hashes;
}

/** k = (m/n)·ln 2 minimizes the false-positive rate. */
export function optimalHashCount(size: number, count: number): number {
  if (count === 0) return 1;
  return Math.max(1, Math.round((size / count) * Math.LN2));
}

/** FP rate with the optimal number of hashes for a given bits-per-key budget. */
export function falsePositiveRateForBitsPerKey(bitsPerKey: number): number {
  const keys = 1000;
  const size = Math.round(bitsPerKey * keys);
  return theoreticalFalsePositiveRate(size, keys, optimalHashCount(size, keys));
}

/** Empirical FP rate: probes random keys that were never inserted. */
export function measureFalsePositiveRate(
  filter: BloomFilter,
  inserted: ReadonlySet<string>,
  trials = 2000,
  seed = 7,
): number {
  const rng = createRng(seed);
  let probes = 0;
  let positives = 0;
  while (probes < trials) {
    const key = `probe-${Math.floor(rng() * 1e9).toString(36)}`;
    if (inserted.has(key)) continue;
    probes++;
    if (bloomMightContain(filter, key)) positives++;
  }
  return positives / trials;
}
