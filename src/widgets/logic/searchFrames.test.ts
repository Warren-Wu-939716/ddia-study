import { describe, expect, it } from 'vitest';
import { bitmapFrames, rowColumnFrames } from './analytics.ts';
import { evaluateFilter, generateSales, columnValues, distinctValues } from '../../sims/columnar.ts';
import {
  buildCube,
  buildInvertedIndex,
  cubeFrames,
  flatSearch,
  invertedFrames,
  ivfSearch,
  phoneBookFrames,
  phoneBookLookup,
  rangeFrames,
  sortPeople,
  vectorFrames,
  type Sale,
} from './search.ts';
import { CENTROIDS, DEMO_QUERIES, DOC_VECTORS, TOPICS } from './vectorDemo.ts';

const PEOPLE = sortPeople([
  { last: 'Kim', first: 'Ana' },
  { last: 'Kim', first: 'Min' },
  { last: 'Lee', first: 'Bo' },
  { last: 'Nguyen', first: 'Ana' },
  { last: 'Nguyen', first: 'Bao' },
  { last: 'Patel', first: 'Ravi' },
  { last: 'Smith', first: 'Jo' },
  { last: 'Weber', first: 'Ana' },
]);

describe('phoneBookFrames', () => {
  it('binary-searches to the run of matches, reads it, and stops', () => {
    const frames = phoneBookFrames(PEOPLE, { by: 'last', last: 'Nguyen' });
    const last = frames.at(-1)!;
    expect(last.matches).toEqual(phoneBookLookup(PEOPLE, { by: 'last', last: 'Nguyen' }).matches);
    expect(last.examined.length).toBeLessThan(PEOPLE.length);
    const ranges = frames.flatMap((f) => (f.range ? [f.range[1] - f.range[0]] : []));
    for (let i = 1; i < ranges.length; i++) expect(ranges[i]).toBeLessThan(ranges[i - 1]);
    expect(frames.some((f) => /past `Nguyen`/.test(f.caption))).toBe(true);
  });

  it('reports a missing name after a few probes', () => {
    const last = phoneBookFrames(PEOPLE, { by: 'last-first', last: 'Kim', first: 'Bo' }).at(-1)!;
    expect(last.matches).toEqual([]);
    expect(last.caption).toMatch(/No `Kim, Bo` entry/);
  });

  it('scans every entry for first-name queries', () => {
    const frames = phoneBookFrames(PEOPLE, { by: 'first', first: 'Ana' });
    expect(frames).toHaveLength(PEOPLE.length + 1);
    expect(frames.at(-1)?.matches).toEqual([0, 3, 7]);
    expect(frames.at(-1)?.caption).toMatch(/must be scanned/);
  });
});

describe('rangeFrames', () => {
  it('narrows first, then filters', () => {
    expect(rangeFrames('lat', 20, 6).map((f) => f.phase)).toEqual(['narrow', 'filter']);
    expect(rangeFrames('lon', 20, 6)[1].caption).toMatch(/14 were read for nothing/);
    expect(rangeFrames('2d', 6, 6)[1].caption).toMatch(/just the 6/);
  });
});

describe('invertedFrames', () => {
  const docs = ['red apple', 'green tea', 'red wine'];
  const index = buildInvertedIndex(docs);

  it('tokenizes, fetches each posting list, then combines', () => {
    const frames = invertedFrames(index, docs.length, ['red', 'wine'], 'and');
    expect(frames.map((f) => [f.looked, f.combined])).toEqual([
      [0, false],
      [1, false],
      [2, false],
      [2, true],
    ]);
    expect(frames[1].caption).toMatch(/\[1, 3\]/);
    expect(frames.at(-1)?.caption).toMatch(/doc 3/);
  });

  it('handles unknown terms and empty queries', () => {
    expect(invertedFrames(index, docs.length, ['zzz'], 'or')[1].caption).toMatch(/isn't in the index/);
    expect(invertedFrames(index, docs.length, [], 'and')).toHaveLength(1);
  });
});

describe('vectorFrames', () => {
  const demo = DEMO_QUERIES.find((q) => q.label.includes('protein'))!;
  const base = { label: demo.label, query: demo.vec, partitionNames: TOPICS, total: DOC_VECTORS.length, metric: 'euclidean' as const };

  it('flat search compares everything, then ranks', () => {
    const search = flatSearch(DOC_VECTORS, demo.vec, 3, 'euclidean');
    expect(vectorFrames({ ...base, index: 'flat', search, missed: [] }).map((f) => f.phase)).toEqual(['embed', 'compare', 'results']);
  });

  it('IVF compares centroids, probes partitions, ranks, and reports a miss', () => {
    const exact = flatSearch(DOC_VECTORS, demo.vec, 3, 'euclidean');
    const search = ivfSearch(DOC_VECTORS, CENTROIDS, demo.vec, 3, 1, 'euclidean');
    const missed = exact.results.filter((r) => !search.results.some((s) => s.id === r.id));
    const frames = vectorFrames({ ...base, index: 'ivf', search, missed });
    expect(frames.map((f) => f.phase)).toEqual(['embed', 'centroids', 'probe', 'results', 'missed']);
    expect(frames[2].caption).toContain(`${search.compared} vectors`);
  });
});

describe('cubeFrames', () => {
  const sales: Sale[] = [
    { date: 'd1', product: 'p1', store: 's1', price: 2, qty: 1 },
    { date: 'd1', product: 'p2', store: 's2', price: 5, qty: 2 },
    { date: 'd2', product: 'p1', store: 's2', price: 2, qty: 3 },
  ];
  const cube = buildCube(sales);

  it('reads one cell when the question fits the cube', () => {
    const frames = cubeFrames(cube, sales, { date: 'd1' });
    expect(frames).toHaveLength(2);
    expect(frames[1].cells).toEqual([['d1', 'total']]);
    expect(frames[1].caption).toMatch(/\$12/);
  });

  it('scans every raw row with a running total otherwise', () => {
    const frames = cubeFrames(cube, sales, { store: 's2' }, 'store');
    expect(frames).toHaveLength(sales.length + 2);
    expect(frames.at(-1)?.matched).toEqual([1, 2]);
    expect(frames[3].caption).toMatch(/Running total \$16/);
    expect(frames.at(-1)?.caption).toMatch(/store isn’t one of its dimensions/);
  });
});

describe('rowColumnFrames', () => {
  const cols = ['a', 'b', 'c'];

  it('reads every row in a row store', () => {
    const frames = rowColumnFrames('row', [0], cols, 4);
    expect(frames).toHaveLength(5);
    expect(frames.at(-1)?.caption).toMatch(/12 of 12 values/);
  });

  it('reads only the used columns in a column store and skips the rest quickly', () => {
    const frames = rowColumnFrames('column', [0, 2], cols, 4);
    expect(frames.map((f) => f.quick ?? false)).toEqual([false, true, false, false]);
    expect(frames.at(-1)?.caption).toMatch(/8 of 12 values/);
  });
});

describe('bitmapFrames', () => {
  const rows = generateSales(12, 9);
  const products = distinctValues(columnValues(rows, 'product_sk'));
  const stores = distinctValues(columnValues(rows, 'store_sk'));

  it('builds each bitmap, ORs products, then ANDs with the store', () => {
    const evaluation = evaluateFilter(rows, [products[0], products[1]], stores[0]);
    const frames = bitmapFrames(evaluation, stores[0], false);
    expect(frames.map((f) => f.shown)).toEqual([1, 2, 3, 4, 5, 5]);
    expect(frames[2].caption).toMatch(/^OR/);
    expect(frames[4].caption).toMatch(/^AND/);
  });

  it('asks for a product when none is ticked', () => {
    expect(bitmapFrames(evaluateFilter(rows, [], null), null, false)).toHaveLength(1);
  });
});
