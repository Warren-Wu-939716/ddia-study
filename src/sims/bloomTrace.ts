import type { StepFrame } from '../lib/steps.ts';
import { bloomAdd, bloomPositions, type BloomFilter } from './bloom.ts';

export interface BloomFrame extends StepFrame {
  bits: readonly number[];
  /** Bit positions the current key hashes to. */
  positions: number[];
  /** How many of those positions have been visited so far. */
  visited: number;
  verdict?: 'added' | 'absent' | 'maybe-true' | 'maybe-false';
  /** A position found to be 0 during a check. */
  zero?: number;
}

const ordinal = (i: number) => ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'][i] ?? `#${i + 1}`;

function hashFrame(filter: BloomFilter, key: string, positions: number[]): BloomFrame {
  const unique = new Set(positions).size;
  return {
    bits: filter.bits,
    positions,
    visited: 0,
    caption: `Run \`${key}\` through ${filter.hashes} hash function${filter.hashes === 1 ? '' : 's'} → bit${positions.length === 1 ? '' : 's'} ${positions.join(', ')}.${
      unique < positions.length ? ' Two hashes landed on the same bit — that happens.' : ''
    }`,
  };
}

/** Adding a key: hash it, then set each of its bits to 1. */
export function bloomAddFrames(filter: BloomFilter, key: string): { frames: BloomFrame[]; final: BloomFilter } {
  const final = bloomAdd(filter, key);
  const positions = bloomPositions(key, filter.bits.length, filter.hashes);
  const frames: BloomFrame[] = [hashFrame(filter, key, positions)];
  const bits = [...filter.bits];
  positions.forEach((p, i) => {
    const already = bits[p] === 1;
    bits[p] = 1;
    const last = i === positions.length - 1;
    frames.push({
      bits: [...bits],
      positions,
      visited: i + 1,
      verdict: last ? 'added' : undefined,
      caption: `${already ? `Bit ${p} (${ordinal(i)} hash) is already 1 — another key set it. Bits are shared between keys.` : `Set bit ${p} (${ordinal(i)} hash) to 1.`}${
        last ? ` \`${key}\` is now in the filter. The filter never stores the key itself — only these bits.` : ''
      }`,
    });
  });
  return { frames, final };
}

/** Checking a key: visit its bits in order and stop at the first 0. */
export function bloomCheckFrames(filter: BloomFilter, key: string, wasAdded: boolean): BloomFrame[] {
  const positions = bloomPositions(key, filter.bits.length, filter.hashes);
  const frames: BloomFrame[] = [hashFrame(filter, key, positions)];
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    if (filter.bits[p] === 0) {
      frames.push({
        bits: filter.bits,
        positions,
        visited: i + 1,
        zero: p,
        verdict: 'absent',
        caption: `Bit ${p} is **0**. Had \`${key}\` been added, this bit would be 1 → \`${key}\` is **definitely not** present. Stop: no disk read needed.`,
      });
      return frames;
    }
    if (i < positions.length - 1) {
      frames.push({ bits: filter.bits, positions, visited: i + 1, caption: `Bit ${p} is 1 — consistent with \`${key}\` being present. Check the next bit.`, quick: true });
    }
  }
  frames.push({
    bits: filter.bits,
    positions,
    visited: positions.length,
    verdict: wasAdded ? 'maybe-true' : 'maybe-false',
    caption: wasAdded
      ? `All ${positions.length} bits are 1 → **maybe present**, so the engine reads the block — and \`${key}\` really is there.`
      : `All ${positions.length} bits are 1 → **maybe present**, but \`${key}\` was never added: a **false positive**. Other keys happened to set these bits. The engine reads one block for nothing — the answer is still correct.`,
  });
  return frames;
}
