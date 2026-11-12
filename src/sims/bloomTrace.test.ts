import { describe, expect, it } from 'vitest';
import { bloomAdd, bloomPositions, createBloom } from './bloom.ts';
import { bloomAddFrames, bloomCheckFrames } from './bloomTrace.ts';

describe('bloomAddFrames', () => {
  it('hashes, then sets one bit per hash, ending at the real filter', () => {
    const filter = createBloom(32, 3);
    const { frames, final } = bloomAddFrames(filter, 'cat');
    expect(frames).toHaveLength(4);
    expect(frames[0].bits).toEqual(filter.bits);
    expect(frames.map((f) => f.visited)).toEqual([0, 1, 2, 3]);
    expect(frames.at(-1)?.bits).toEqual(final.bits);
    expect(final).toEqual(bloomAdd(filter, 'cat'));
    expect(frames.at(-1)?.verdict).toBe('added');
  });

  it('notices bits that another key already set', () => {
    const filter = bloomAdd(createBloom(16, 2), 'dog');
    const { frames } = bloomAddFrames(filter, 'dog');
    expect(frames.slice(1).every((f) => /already 1/.test(f.caption))).toBe(true);
  });
});

describe('bloomCheckFrames', () => {
  it('stops at the first zero bit', () => {
    const empty = createBloom(16, 3);
    const positions = bloomPositions('owl', 16, 3);
    const first = bloomCheckFrames(empty, 'owl', false);
    expect(first).toHaveLength(2);
    expect(first[1]).toMatchObject({ verdict: 'absent', zero: positions[0], visited: 1 });

    expect(positions[1]).not.toBe(positions[0]);
    const oneSet = { ...empty, bits: empty.bits.map((_, i) => (i === positions[0] ? 1 : 0)) };
    const second = bloomCheckFrames(oneSet, 'owl', false);
    expect(second.map((f) => f.visited)).toEqual([0, 1, 2]);
    expect(second[1].quick).toBe(true);
    expect(second.at(-1)).toMatchObject({ verdict: 'absent', zero: positions[1] });
  });

  it('says maybe for an added key, and flags a false positive for a key that was not added', () => {
    const filter = bloomAdd(createBloom(16, 2), 'cat');
    expect(bloomCheckFrames(filter, 'cat', true).at(-1)?.verdict).toBe('maybe-true');
    const positions = bloomPositions('cat', 16, 2);
    const full = { ...filter, bits: filter.bits.map(() => 1) };
    const frames = bloomCheckFrames(full, 'other', false);
    expect(frames).toHaveLength(positions.length + 1);
    expect(frames.at(-1)?.verdict).toBe('maybe-false');
    expect(frames.at(-1)?.caption).toMatch(/false positive/);
  });
});
