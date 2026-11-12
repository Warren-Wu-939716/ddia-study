import { describe, expect, it } from 'vitest';
import {
  answerFromCube,
  answerFromRaw,
  assignPartitions,
  buildCube,
  buildInvertedIndex,
  cosineSimilarity,
  editDistance,
  euclideanDistance,
  flatSearch,
  fuzzyMatches,
  inBox,
  ivfSearch,
  phoneBookLookup,
  postingsBitmap,
  randomPoints,
  rangeScan,
  searchInvertedIndex,
  sortPeople,
  tokenize,
  trigrams,
  type DocVector,
  type Sale,
} from './search.ts';

describe('phone book (concatenated index)', () => {
  const people = sortPeople([
    { last: 'Lee', first: 'Bo' },
    { last: 'Diaz', first: 'Ana' },
    { last: 'Lee', first: 'Ana' },
    { last: 'Abe', first: 'Cy' },
    { last: 'Ng', first: 'Ana' },
  ]);

  it('sorts by last, then first name', () => {
    expect(people.map((p) => `${p.last} ${p.first}`)).toEqual(['Abe Cy', 'Diaz Ana', 'Lee Ana', 'Lee Bo', 'Ng Ana']);
  });

  it('finds a contiguous run for prefix queries', () => {
    expect(phoneBookLookup(people, { by: 'last', last: 'Lee' })).toEqual({ matches: [2, 3], examined: 5, usesIndex: true });
    expect(phoneBookLookup(people, { by: 'last-first', last: 'Lee', first: 'Bo' }).matches).toEqual([3]);
  });

  it('must scan everything for a first-name query', () => {
    expect(phoneBookLookup(people, { by: 'first', first: 'Ana' })).toEqual({ matches: [1, 2, 4], examined: 5, usesIndex: false });
  });
});

describe('range queries', () => {
  const points = randomPoints(200, 3, 100, 100);
  const box = { x0: 40, x1: 60, y0: 40, y1: 60 };

  it('generates deterministic points inside the area', () => {
    expect(points).toEqual(randomPoints(200, 3, 100, 100));
    expect(points.every((p) => p.x >= 0 && p.x <= 100 && p.y >= 0 && p.y <= 100)).toBe(true);
  });

  it('a 1-D index scans a whole stripe, a 2-D index just the box', () => {
    const lat = rangeScan(points, box, 'lat');
    const twoD = rangeScan(points, box, '2d');
    expect(lat.matches).toEqual(twoD.matches);
    expect(twoD.scanned).toEqual(twoD.matches);
    expect(lat.scanned.length).toBeGreaterThan(twoD.scanned.length);
    expect(lat.matches.every((p) => inBox(p, box))).toBe(true);
    expect(rangeScan(points, box, 'lon').scanned.every((p) => p.x >= 40 && p.x <= 60)).toBe(true);
  });
});

describe('inverted index', () => {
  const docs = ['Red apples and pears', 'green apples', 'red wine'];
  const index = buildInvertedIndex(docs);

  it('tokenizes to unique lowercase words', () => {
    expect(tokenize('Red, red apples!')).toEqual(['red', 'apples']);
  });

  it('maps terms to sorted postings lists', () => {
    expect([...index.keys()]).toEqual(['and', 'apples', 'green', 'pears', 'red', 'wine']);
    expect(index.get('apples')).toEqual([1, 2]);
    expect(postingsBitmap([1, 3], 3)).toEqual([1, 0, 1]);
  });

  it('answers AND and OR queries with bitmaps', () => {
    expect(searchInvertedIndex(index, 3, ['red', 'apples'], 'and')).toEqual([1, 0, 0]);
    expect(searchInvertedIndex(index, 3, ['green', 'wine'], 'or')).toEqual([0, 1, 1]);
    expect(searchInvertedIndex(index, 3, ['missing'], 'and')).toEqual([0, 0, 0]);
    expect(searchInvertedIndex(index, 3, [], 'and')).toEqual([0, 0, 0]);
  });
});

describe('trigrams and edit distance', () => {
  it('splits words into unique trigrams', () => {
    expect(trigrams('hello')).toEqual(['hel', 'ell', 'llo']);
    expect(trigrams('Data')).toEqual(['dat', 'ata']);
    expect(trigrams('ab')).toEqual([]);
  });

  it('computes Levenshtein distance', () => {
    expect(editDistance('pasword', 'password')).toBe(1);
    expect(editDistance('kitten', 'sitting')).toBe(3);
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('same', 'same')).toBe(0);
  });

  it('finds dictionary terms within a distance, closest first', () => {
    expect(fuzzyMatches(['password', 'passport', 'sword', 'pass'], 'pasword', 2)).toEqual([
      { term: 'password', distance: 1 },
      { term: 'sword', distance: 2 },
    ]);
  });
});

describe('vector search', () => {
  const points: DocVector[] = [
    { id: 'a', label: 'a', x: 1, y: 0.1 },
    { id: 'b', label: 'b', x: 0.9, y: -0.1 },
    { id: 'c', label: 'c', x: -1, y: 0 },
    { id: 'd', label: 'd', x: 0, y: 1 },
    { id: 'e', label: 'e', x: 0.1, y: 0.9 },
  ];
  const centroids = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
  ];

  it('measures similarity and distance', () => {
    expect(cosineSimilarity({ x: 1, y: 0 }, { x: 2, y: 0 })).toBeCloseTo(1);
    expect(cosineSimilarity({ x: 1, y: 0 }, { x: 0, y: 1 })).toBeCloseTo(0);
    expect(cosineSimilarity({ x: 0, y: 0 }, { x: 1, y: 0 })).toBe(0);
    expect(euclideanDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('flat search compares everything and returns the nearest', () => {
    const result = flatSearch(points, { x: 1, y: 0 }, 2, 'euclidean');
    expect(result.compared).toBe(5);
    expect(result.results.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('IVF compares only probed partitions and can miss near neighbours', () => {
    expect(assignPartitions(points, centroids)).toEqual([0, 0, 1, 2, 2]);
    const query = { x: 0.6, y: 0.55 };
    const one = ivfSearch(points, centroids, query, 1, 1, 'euclidean');
    expect(one.probed).toHaveLength(1);
    expect(one.compared).toBe(2);
    const all = ivfSearch(points, centroids, query, 3, 3, 'euclidean');
    expect(all.results).toEqual(flatSearch(points, query, 3, 'euclidean').results);
  });
});

describe('data cube', () => {
  const sales: Sale[] = [
    { date: 'd1', product: 'p1', store: 's1', price: 2, qty: 3 },
    { date: 'd1', product: 'p2', store: 's2', price: 20, qty: 1 },
    { date: 'd2', product: 'p1', store: 's2', price: 2, qty: 5 },
  ];
  const cube = buildCube(sales);

  it('aggregates revenue by date × product with totals', () => {
    expect(cube.cells.d1).toEqual({ p1: 6, p2: 20 });
    expect(cube.dateTotals).toEqual({ d1: 26, d2: 10 });
    expect(cube.productTotals).toEqual({ p1: 16, p2: 20 });
    expect(cube.total).toBe(36);
  });

  it('answers dimension queries from the cube and agrees with raw data', () => {
    for (const filter of [{ date: 'd1' }, { product: 'p1' }, { date: 'd2', product: 'p1' }, {}]) {
      expect(answerFromCube(cube, filter)?.value).toBe(answerFromRaw(sales, filter).value);
    }
    expect(answerFromCube(cube, { product: 'p1' })?.cells).toEqual([
      ['d1', 'p1'],
      ['d2', 'p1'],
    ]);
  });

  it('cannot answer filters on non-dimensions', () => {
    expect(answerFromCube(cube, { store: 's2' })).toBeNull();
    expect(answerFromCube(cube, { minPrice: 10 })).toBeNull();
    expect(answerFromRaw(sales, { store: 's2' })).toEqual({ value: 30, rows: [1, 2] });
    expect(answerFromRaw(sales, { minPrice: 10 })).toEqual({ value: 20, rows: [1] });
  });
});
