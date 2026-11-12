import { describe, expect, it } from 'vitest';
import { createRng, shuffle } from '../lib/random.ts';
import { createBTree, depth, insertKey, insertMany } from './btree.ts';
import { layoutTree } from './btreeLayout.ts';
import { routeText, traceFind, traceInsert, treeModel } from './btreeTrace.ts';

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

describe('traceInsert', () => {
  it('shows overflow, split and a new root as separate steps', () => {
    const { frames, final } = traceInsert(insertMany(createBTree(3), [10, 20, 30]), 40);
    expect(frames.map((f) => f.caption.split(' ')[0])).toEqual(['Read', 'Split', 'p1', 'Done:']);
    expect(frames[0].overflow).toBe(1);
    expect(frames[0].tree.pages[1].keys).toEqual([10, 20, 30, 40]);
    expect(frames[1].tree.levels).toEqual([[1, 2]]);
    expect(frames[1].tree.pending).toEqual([]);
    expect(frames[2].tree.levels).toEqual([[3], [1, 2]]);
    expect(frames.at(-1)?.tree.pages).toEqual(final.pages);
  });

  it('routes through internal pages, then splits upward with a pending link first', () => {
    const start = insertMany(createBTree(3), range(9).map((n) => n * 10));
    const { frames, final } = traceInsert(start, 95);
    const reads = frames.filter((f) => f.caption.startsWith('Read'));
    expect(reads).toHaveLength(depth(start));
    expect(reads[0].caption).toMatch(/≥/);
    const firstSplit = frames.findIndex((f) => f.caption.startsWith('Split'));
    expect(frames[firstSplit].tree.pending).toHaveLength(1);
    expect(frames[firstSplit + 1].tree.pending).toEqual([]);
    expect(frames[firstSplit + 1].overflow).toBeDefined();
    expect(frames.filter((f) => f.caption.startsWith('Split'))).toHaveLength(2);
    expect(frames.at(-1)?.tree.pages).toEqual(final.pages);
    expect(final).toEqual(insertKey(start, 95));
  });

  it('reports a single page write for a key that fits or already exists', () => {
    const start = insertMany(createBTree(4), [10, 20]);
    expect(traceInsert(start, 15).frames.at(-1)?.caption).toMatch(/It fits/);
    expect(traceInsert(start, 20).frames.at(-1)?.caption).toMatch(/already in leaf/);
  });

  it('ends at the real tree for many random inserts, and every frame can be laid out', () => {
    for (const maxKeys of [2, 3, 4]) {
      let state = createBTree(maxKeys);
      for (const key of shuffle(range(60), createRng(maxKeys))) {
        const { frames, final } = traceInsert(state, key);
        expect(final).toEqual(insertKey(state, key));
        for (const frame of frames) {
          const layout = layoutTree(frame.tree);
          expect(layout.boxes).toHaveLength(frame.tree.levels.flat().length);
        }
        const last = frames.at(-1)!;
        for (const id of last.tree.levels.flat()) expect(last.tree.pages[id]).toEqual(final.pages[id]);
        state = final;
      }
    }
  });
});

describe('traceFind', () => {
  it('reads one page per level', () => {
    const state = insertMany(createBTree(3), range(30));
    const { frames, result } = traceFind(state, 17);
    expect(frames).toHaveLength(result.path.length);
    expect(frames.map((f) => f.read.length)).toEqual(result.path.map((_, i) => i + 1));
    expect(frames.at(-1)?.caption).toMatch(/17 is here/);
    expect(traceFind(state, 99).frames.at(-1)?.caption).toMatch(/isn't in the tree/);
  });
});

describe('routeText and pending layout', () => {
  it('describes which child range a key falls into', () => {
    const page = { id: 1, type: 'internal' as const, keys: [10, 20], children: [2, 3, 4] };
    expect(routeText(page, 5, 0)).toBe('5 < 10');
    expect(routeText(page, 15, 1)).toBe('10 ≤ 15 < 20');
    expect(routeText(page, 25, 2)).toBe('25 ≥ 20');
  });

  it('draws pending edges dashed and widens overflowing pages', () => {
    const start = insertMany(createBTree(3), range(9).map((n) => n * 10));
    const { frames } = traceInsert(start, 95);
    const split = frames.find((f) => f.tree.pending.length > 0)!;
    expect(layoutTree(split.tree).edges.some((e) => e.pending)).toBe(true);
    const overflowing = frames.find((f) => f.overflow !== undefined)!;
    const box = layoutTree(overflowing.tree).boxes.find((b) => b.page.id === overflowing.overflow)!;
    expect(box.width).toBeGreaterThan(layoutTree(treeModel(start)).boxes[0].width);
  });
});
