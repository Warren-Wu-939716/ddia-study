import { describe, expect, it } from 'vitest';
import { createRng, shuffle } from '../lib/random.ts';
import {
  capacityBytes,
  childIndex,
  createBTree,
  depth,
  inOrderKeys,
  insertKey,
  insertMany,
  levels,
  lookupKey,
  pageCount,
  type BTreeState,
  type InternalPage,
} from './btree.ts';
import { layoutBTree } from './btreeLayout.ts';

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

/** Every leaf at the same depth, keys sorted, internal boundaries consistent with children. */
function assertValid(state: BTreeState) {
  const rows = levels(state);
  const leafDepth = rows.length - 1;
  rows.forEach((row, d) => row.forEach((p) => expect(p.type === 'leaf').toBe(d === leafDepth)));
  for (const page of Object.values(state.pages)) {
    expect(page.keys.length).toBeLessThanOrEqual(state.maxKeys);
    expect([...page.keys].sort((a, b) => a - b)).toEqual(page.keys);
    if (page.type === 'internal') {
      expect(page.children).toHaveLength(page.keys.length + 1);
      page.children.forEach((childId, i) => {
        const child = state.pages[childId];
        if (i > 0) expect(Math.min(...child.keys)).toBeGreaterThanOrEqual(page.keys[i - 1]);
        if (i < page.keys.length && child.type === 'leaf') expect(Math.max(...child.keys)).toBeLessThan(page.keys[i]);
      });
    }
  }
}

describe('createBTree', () => {
  it('starts as one empty leaf and validates page capacity', () => {
    const tree = createBTree(3);
    expect(depth(tree)).toBe(1);
    expect(pageCount(tree)).toBe(1);
    expect(() => createBTree(1)).toThrow(RangeError);
  });
});

describe('insertKey', () => {
  it('splits a full leaf and grows a new root', () => {
    const tree = insertMany(createBTree(3), [10, 20, 30, 40]);
    expect(depth(tree)).toBe(2);
    const root = tree.pages[tree.rootId] as InternalPage;
    expect(root.type).toBe('internal');
    expect(root.keys).toEqual([30]);
    expect(tree.lastInsert).toMatchObject({ key: 40, splits: 1 });
    expect(tree.lastInsert?.touched).toHaveLength(3);
  });

  it('rewrites one page when updating an existing key', () => {
    const tree = insertKey(insertMany(createBTree(3), range(12)), 5);
    expect(tree.lastInsert).toMatchObject({ duplicate: true, splits: 0 });
    expect(tree.lastInsert?.touched).toHaveLength(1);
    expect(inOrderKeys(tree)).toEqual(range(12));
  });

  it('cascades splits up to a new root', () => {
    const tree = insertMany(createBTree(3), [...range(9).map((n) => n * 10), 95]);
    expect(tree.lastInsert?.splits).toBe(2);
    expect(tree.lastInsert?.touched).toHaveLength(5);
    assertValid(tree);
  });

  it('stays balanced and sorted for random inserts', () => {
    for (const maxKeys of [2, 3, 4, 6]) {
      const keys = shuffle(range(200), createRng(maxKeys));
      const tree = insertMany(createBTree(maxKeys), keys);
      assertValid(tree);
      expect(inOrderKeys(tree)).toEqual(range(200));
      expect(tree.stats).toMatchObject({ inserts: 200, walRecords: 200 });
      expect(tree.stats.pageWrites).toBeGreaterThanOrEqual(200);
    }
  });

  it('does not mutate the previous state', () => {
    const before = insertMany(createBTree(3), [1, 2, 3]);
    const snapshot = JSON.stringify(before.pages);
    insertKey(before, 4);
    expect(JSON.stringify(before.pages)).toBe(snapshot);
  });
});

describe('lookupKey', () => {
  it('reads one page per level', () => {
    const tree = insertMany(createBTree(3), range(30));
    const result = lookupKey(tree, 17);
    expect(result.found).toBe(true);
    expect(result.path).toHaveLength(depth(tree));
    expect(result.path[0]).toBe(tree.rootId);
    expect(lookupKey(tree, 999).found).toBe(false);
  });
});

describe('childIndex', () => {
  it('routes keys equal to a boundary to the right child', () => {
    const page: InternalPage = { id: 1, type: 'internal', keys: [10, 20], children: [2, 3, 4] };
    expect(childIndex(page, 5)).toBe(0);
    expect(childIndex(page, 10)).toBe(1);
    expect(childIndex(page, 25)).toBe(2);
  });
});

describe('capacityBytes', () => {
  it('reproduces the book-style estimate of ~250 TB', () => {
    const bytes = capacityBytes(500, 4, 4096);
    expect(bytes).toBeGreaterThan(2.5e14);
    expect(bytes).toBeLessThan(2.6e14);
  });
});

describe('layoutBTree', () => {
  it('centres parents over children without overlapping pages', () => {
    const tree = insertMany(createBTree(3), range(20));
    const layout = layoutBTree(tree);
    expect(layout.boxes).toHaveLength(pageCount(tree));
    const byRow = new Map<number, number[]>();
    for (const box of layout.boxes) byRow.set(box.y, [...(byRow.get(box.y) ?? []), box.x]);
    for (const xs of byRow.values()) {
      const sorted = xs.sort((a, b) => a - b);
      for (let i = 1; i < sorted.length; i++) expect(sorted[i] - sorted[i - 1]).toBeGreaterThanOrEqual(layout.pageWidth);
    }
    expect(layout.edges).toHaveLength(pageCount(tree) - 1);
  });
});
