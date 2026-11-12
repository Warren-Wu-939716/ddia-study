import { createRng } from '../../lib/random.ts';
import type { StepFrame } from '../../lib/steps.ts';

// ── Concatenated index (phone book) ──────────────────────────────────

export interface Person {
  last: string;
  first: string;
}

export function sortPeople(people: readonly Person[]): Person[] {
  return [...people].sort((a, b) => a.last.localeCompare(b.last, 'en') || a.first.localeCompare(b.first, 'en'));
}

export type PhoneQuery = { by: 'last'; last: string } | { by: 'last-first'; last: string; first: string } | { by: 'first'; first: string };

export interface PhoneResult {
  matches: number[];
  /** Entries a lookup has to look at: binary search + the matching run, or a full scan. */
  examined: number;
  usesIndex: boolean;
}

export function phoneBookLookup(sorted: readonly Person[], query: PhoneQuery): PhoneResult {
  const matches = sorted.flatMap((p, i) => {
    const hit =
      query.by === 'last' ? p.last === query.last : query.by === 'first' ? p.first === query.first : p.last === query.last && p.first === query.first;
    return hit ? [i] : [];
  });
  if (query.by === 'first') return { matches, examined: sorted.length, usesIndex: false };
  return { matches, examined: Math.ceil(Math.log2(Math.max(2, sorted.length))) + matches.length, usesIndex: true };
}

export interface PhoneFrame extends StepFrame {
  /** Entry being looked at. */
  probe?: number;
  /** Binary search: entries still in play, [lo, hi). */
  range?: [number, number];
  /** Every entry looked at so far. */
  examined: number[];
  matches: number[];
}

const personText = (p: Person) => `${p.last}, ${p.first}`;

/** Binary search to the first match, then read the run of matches — or a full scan for first-name queries. */
export function phoneBookFrames(sorted: readonly Person[], query: PhoneQuery): PhoneFrame[] {
  const n = sorted.length;
  const frames: PhoneFrame[] = [];
  const examined: number[] = [];
  const matches: number[] = [];
  const look = (i: number) => {
    if (!examined.includes(i)) examined.push(i);
  };
  if (query.by === 'first') {
    sorted.forEach((p, i) => {
      look(i);
      const hit = p.first === query.first;
      if (hit) matches.push(i);
      frames.push({
        probe: i,
        examined: [...examined],
        matches: [...matches],
        quick: !hit,
        caption: hit ? `Entry ${i + 1}: \`${personText(p)}\` — a match. Keep going: more could be anywhere.` : `Entry ${i + 1}: \`${personText(p)}\` — no.`,
      });
    });
    frames.push({
      examined: [...examined],
      matches: [...matches],
      caption: `First names are scattered throughout, so the index order doesn’t help: all ${n} entries must be scanned to find ${matches.length}.`,
    });
    return frames;
  }

  const target = query.by === 'last' ? query.last : `${query.last}, ${query.first}`;
  const cmp = (p: Person) => p.last.localeCompare(query.last, 'en') || (query.by === 'last-first' ? p.first.localeCompare(query.first, 'en') : 0);
  let lo = 0;
  let hi = n;
  frames.push({
    range: [lo, hi],
    examined: [],
    matches: [],
    caption: `The index is sorted by (last, first), so every \`${target}\` entry sits in one contiguous run. Binary-search for the start of that run among all ${n} entries.`,
  });
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    look(mid);
    const before = cmp(sorted[mid]) < 0;
    if (before) lo = mid + 1;
    else hi = mid;
    const left = lo < hi ? `${hi - lo} entr${hi - lo === 1 ? 'y' : 'ies'} left (${lo + 1}–${hi}).` : `So the run starts at entry ${lo + 1}, if it exists.`;
    frames.push({
      probe: mid,
      range: [lo, hi],
      examined: [...examined],
      matches: [],
      caption: before
        ? `Middle entry ${mid + 1}: \`${personText(sorted[mid])}\` sorts before \`${target}\` → drop it and everything above it. ${left}`
        : `Middle entry ${mid + 1}: \`${personText(sorted[mid])}\` is at or after \`${target}\` → the run starts here or above. ${left}`,
    });
  }
  for (let i = lo; i < n; i++) {
    look(i);
    if (cmp(sorted[i]) !== 0) {
      frames.push({
        probe: i,
        examined: [...examined],
        matches: [...matches],
        caption: `Entry ${i + 1}: \`${personText(sorted[i])}\` is past \`${target}\` → stop. Nothing later can match.`,
      });
      break;
    }
    matches.push(i);
    frames.push({
      probe: i,
      examined: [...examined],
      matches: [...matches],
      caption: `Entry ${i + 1}: \`${personText(sorted[i])}\` matches → read it and step to the next entry.`,
    });
  }
  frames.push({
    examined: [...examined],
    matches: [...matches],
    caption: matches.length
      ? `Matches sit next to each other: binary search jumped there, then read ${matches.length} entr${matches.length === 1 ? 'y' : 'ies'} — ${examined.length} of ${n} looked at.`
      : `No \`${target}\` entry — and binary search proved it after looking at only ${examined.length} of ${n} entries.`,
  });
  return frames;
}

// ── Two-dimensional range query ──────────────────────────────────────

export interface Point {
  id: number;
  x: number;
  y: number;
}

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export function randomPoints(count: number, seed: number, width: number, height: number): Point[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, (_, id) => ({ id, x: Math.round(rng() * width), y: Math.round(rng() * height) }));
}

export function inBox(p: Point, box: Box): boolean {
  return p.x >= box.x0 && p.x <= box.x1 && p.y >= box.y0 && p.y <= box.y1;
}

export type RangeStrategy = 'lat' | 'lon' | '2d';

/** Points an index has to read: a whole stripe for a 1-D index, roughly just the box for a 2-D one. */
export function rangeScan(points: readonly Point[], box: Box, strategy: RangeStrategy): { scanned: Point[]; matches: Point[] } {
  const matches = points.filter((p) => inBox(p, box));
  const scanned =
    strategy === 'lat'
      ? points.filter((p) => p.y >= box.y0 && p.y <= box.y1)
      : strategy === 'lon'
        ? points.filter((p) => p.x >= box.x0 && p.x <= box.x1)
        : matches;
  return { scanned, matches };
}

export interface RangeFrame extends StepFrame {
  phase: 'narrow' | 'filter';
}

/** A range query on a map: what the index narrows down to, then what is actually in view. */
export function rangeFrames(strategy: RangeStrategy, scanned: number, matches: number): RangeFrame[] {
  if (strategy === '2d') {
    return [
      {
        phase: 'narrow',
        caption: 'The R-tree groups nearby points into bounding boxes. Descend only into the boxes that overlap the view — both latitude and longitude are narrowed at once.',
      },
      { phase: 'filter', caption: `A 2-D index narrows both ranges at once: it reads just the ${matches} restaurants in the box.` },
    ];
  }
  const [axis, other, shape] = strategy === 'lat' ? ['latitude', 'longitude', 'horizontal'] : ['longitude', 'latitude', 'vertical'];
  return [
    {
      phase: 'narrow',
      caption: `The ${axis} index returns every restaurant whose ${axis} is in the view's range — a ${shape} stripe across the whole map: ${scanned} restaurants read.`,
    },
    {
      phase: 'filter',
      caption: `Check each one's ${other}: ${matches} are in view. A 1-D index can only narrow one range, so the other ${scanned - matches} were read for nothing.`,
    },
  ];
}

// ── Inverted index ───────────────────────────────────────────────────

export function tokenize(text: string): string[] {
  return [...new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean))];
}

/** Term → sorted 1-based document IDs, with terms in sorted order. */
export function buildInvertedIndex(docs: readonly string[]): Map<string, number[]> {
  const postings = new Map<string, number[]>();
  docs.forEach((doc, i) => {
    for (const term of tokenize(doc)) postings.set(term, [...(postings.get(term) ?? []), i + 1]);
  });
  return new Map([...postings.entries()].sort(([a], [b]) => a.localeCompare(b, 'en')));
}

export function postingsBitmap(postings: readonly number[], docCount: number): number[] {
  return Array.from({ length: docCount }, (_, i) => (postings.includes(i + 1) ? 1 : 0));
}

export function searchInvertedIndex(index: ReadonlyMap<string, number[]>, docCount: number, terms: readonly string[], mode: 'and' | 'or'): number[] {
  if (terms.length === 0) return new Array<number>(docCount).fill(0);
  const bitmaps = terms.map((t) => postingsBitmap(index.get(t) ?? [], docCount));
  return bitmaps.reduce((acc, bits) => acc.map((b, i) => (mode === 'and' ? b & bits[i] : b | bits[i])));
}

export interface InvertedFrame extends StepFrame {
  /** Terms whose postings have been fetched so far. */
  looked: number;
  combined: boolean;
}

const docList = (bits: readonly number[]) => bits.flatMap((bit, i) => (bit ? [i + 1] : []));

/** Tokenize the query, fetch each term's postings, then combine the bitmaps. */
export function invertedFrames(index: ReadonlyMap<string, number[]>, docCount: number, terms: readonly string[], mode: 'and' | 'or'): InvertedFrame[] {
  if (terms.length === 0) return [{ looked: 0, combined: false, caption: 'Type one or more words.' }];
  const op = mode.toUpperCase();
  const frames: InvertedFrame[] = [
    {
      looked: 0,
      combined: false,
      caption: `Tokenize the query exactly like the documents were: lowercase, split on anything that isn't a letter or digit → ${terms.map((t) => `\`${t}\``).join(', ')}.`,
    },
  ];
  terms.forEach((term, i) => {
    const postings = index.get(term) ?? [];
    frames.push({
      looked: i + 1,
      combined: false,
      caption: postings.length
        ? `Look up \`${term}\` in the index → postings [${postings.join(', ')}], i.e. bitmap ${postingsBitmap(postings, docCount).join(' ')}. No document text is read.`
        : `\`${term}\` isn't in the index → no documents, bitmap ${postingsBitmap([], docCount).join(' ')}.`,
    });
  });
  const result = searchInvertedIndex(index, docCount, terms, mode);
  const docs = docList(result);
  frames.push({
    looked: terms.length,
    combined: true,
    caption: `${terms.length > 1 ? `${op} the bitmaps bit by bit (${mode === 'and' ? 'every term must be present' : 'any term will do'}): ` : ''}${terms.join(` ${op} `)} → ${result.join(' ')} → ${
      docs.length ? `doc ${docs.join(', ')}` : 'no documents'
    }.`,
  });
  return frames;
}

// ── n-grams and edit distance ────────────────────────────────────────

export function trigrams(word: string): string[] {
  const w = word.toLowerCase();
  if (w.length < 3) return [];
  return [...new Set(Array.from({ length: w.length - 2 }, (_, i) => w.slice(i, i + 3)))];
}

/** Levenshtein distance: single-character insertions, deletions and substitutions. */
export function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = above;
    }
  }
  return prev[b.length];
}

export function fuzzyMatches(dictionary: readonly string[], word: string, maxDistance: number): { term: string; distance: number }[] {
  return dictionary
    .map((term) => ({ term, distance: editDistance(word.toLowerCase(), term) }))
    .filter((m) => m.distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance || a.term.localeCompare(b.term, 'en'));
}

// ── Vector search ────────────────────────────────────────────────────

export interface Vec {
  x: number;
  y: number;
}

export interface DocVector extends Vec {
  id: string;
  label: string;
}

export type Metric = 'cosine' | 'euclidean';

export function cosineSimilarity(a: Vec, b: Vec): number {
  const norm = Math.hypot(a.x, a.y) * Math.hypot(b.x, b.y);
  return norm === 0 ? 0 : (a.x * b.x + a.y * b.y) / norm;
}

export function euclideanDistance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Higher = closer, for either metric. */
export function closeness(metric: Metric, a: Vec, b: Vec): number {
  return metric === 'cosine' ? cosineSimilarity(a, b) : -euclideanDistance(a, b);
}

export function topK<T extends Vec>(candidates: readonly T[], query: Vec, k: number, metric: Metric): T[] {
  return [...candidates].sort((a, b) => closeness(metric, b, query) - closeness(metric, a, query)).slice(0, k);
}

export function assignPartitions(points: readonly Vec[], centroids: readonly Vec[]): number[] {
  return points.map((p) => centroids.reduce((best, c, i) => (euclideanDistance(p, c) < euclideanDistance(p, centroids[best]) ? i : best), 0));
}

export interface SearchResult<T> {
  results: T[];
  compared: number;
  probed: number[];
}

export function flatSearch<T extends Vec>(points: readonly T[], query: Vec, k: number, metric: Metric): SearchResult<T> {
  return { results: topK(points, query, k, metric), compared: points.length, probed: [] };
}

/** IVF: compare only the vectors in the `probes` partitions whose centroids are closest to the query. */
export function ivfSearch<T extends Vec>(points: readonly T[], centroids: readonly Vec[], query: Vec, k: number, probes: number, metric: Metric): SearchResult<T> {
  const partition = assignPartitions(points, centroids);
  const probed = centroids
    .map((c, i) => ({ i, score: closeness(metric, c, query) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, probes)
    .map((c) => c.i);
  const candidates = points.filter((_, i) => probed.includes(partition[i]));
  return { results: topK(candidates, query, k, metric), compared: candidates.length, probed };
}

export type VectorPhase = 'embed' | 'centroids' | 'probe' | 'compare' | 'results' | 'missed';
export const VECTOR_PHASES: readonly VectorPhase[] = ['embed', 'centroids', 'probe', 'compare', 'results', 'missed'];

export interface VectorFrame extends StepFrame {
  phase: VectorPhase;
}

export interface VectorRun<T extends DocVector> {
  label: string;
  query: Vec;
  index: 'flat' | 'ivf';
  search: SearchResult<T>;
  missed: readonly T[];
  partitionNames: readonly string[];
  total: number;
  metric: Metric;
}

/** Embed the query, narrow the candidates (all of them, or a few partitions), then rank. */
export function vectorFrames<T extends DocVector>({ label, query, index, search, missed, partitionNames, total, metric }: VectorRun<T>): VectorFrame[] {
  const measure = metric === 'cosine' ? 'cosine similarity (angle)' : 'Euclidean distance';
  const top = search.results.map((r) => r.label).join(', ');
  const frames: VectorFrame[] = [
    {
      phase: 'embed',
      caption: `An embedding model turns ${label ? `“${label}”` : 'the query'} into a vector — here the point (${query.x.toFixed(2)}, ${query.y.toFixed(2)}). Real embeddings have hundreds of dimensions.`,
    },
  ];
  if (index === 'flat') {
    frames.push(
      { phase: 'compare', caption: `Flat index: compute the ${measure} between the query and every one of the ${total} stored vectors.` },
      { phase: 'results', caption: `Keep the ${search.results.length} closest: ${top}. Always exact — but the work grows with the collection.` },
    );
    return frames;
  }
  const names = search.probed.map((p) => partitionNames[p]).join(', ');
  frames.push(
    {
      phase: 'centroids',
      caption: `IVF: the stored vectors were clustered into ${partitionNames.length} partitions ahead of time. First compare the query with just the ${partitionNames.length} partition centres (✕).`,
    },
    {
      phase: 'probe',
      caption: `Probe the ${search.probed.length} closest partition${search.probed.length > 1 ? 's' : ''} (${names}). Only ${search.probed.length > 1 ? 'their' : 'its'} ${search.compared} vectors are compared; the other ${total - search.compared} are never looked at.`,
    },
    {
      phase: 'results',
      caption: `Keep the ${search.results.length} closest candidates: ${top}.${missed.length ? '' : ' Same results as exact search, with fewer comparisons.'}`,
    },
  );
  if (missed.length) {
    frames.push({
      phase: 'missed',
      caption: `Exact search would also have returned ${missed.map((m) => `“${m.label}”`).join(', ')} — it sits just across a partition boundary, so IVF never compared it. Raise the probes to fix it.`,
    });
  }
  return frames;
}

// ── Data cube ────────────────────────────────────────────────────────

export interface Sale {
  date: string;
  product: string;
  store: string;
  price: number;
  qty: number;
}

export interface CubeFilter {
  date?: string;
  product?: string;
  store?: string;
  minPrice?: number;
}

export interface Cube {
  dates: string[];
  products: string[];
  cells: Record<string, Record<string, number>>;
  dateTotals: Record<string, number>;
  productTotals: Record<string, number>;
  total: number;
}

export const revenue = (s: Sale) => s.price * s.qty;

/** Two-dimensional cube: SUM(revenue) by date × product. */
export function buildCube(sales: readonly Sale[]): Cube {
  const dates = [...new Set(sales.map((s) => s.date))].sort();
  const products = [...new Set(sales.map((s) => s.product))].sort();
  const cells: Cube['cells'] = Object.fromEntries(dates.map((d) => [d, Object.fromEntries(products.map((p) => [p, 0]))]));
  for (const s of sales) cells[s.date][s.product] += revenue(s);
  const dateTotals = Object.fromEntries(dates.map((d) => [d, products.reduce((sum, p) => sum + cells[d][p], 0)]));
  const productTotals = Object.fromEntries(products.map((p) => [p, dates.reduce((sum, d) => sum + cells[d][p], 0)]));
  return { dates, products, cells, dateTotals, productTotals, total: dates.reduce((sum, d) => sum + dateTotals[d], 0) };
}

/** Null when the filter uses an attribute that isn't a cube dimension. */
export function answerFromCube(cube: Cube, filter: CubeFilter): { value: number; cells: [string, string][] } | null {
  if (filter.store !== undefined || filter.minPrice !== undefined) return null;
  const dates = filter.date ? [filter.date] : cube.dates;
  const products = filter.product ? [filter.product] : cube.products;
  const cells = dates.flatMap((d) => products.map((p) => [d, p] as [string, string]));
  return { value: cells.reduce((sum, [d, p]) => sum + cube.cells[d][p], 0), cells };
}

export function answerFromRaw(sales: readonly Sale[], filter: CubeFilter): { value: number; rows: number[] } {
  const rows = sales.flatMap((s, i) =>
    (filter.date === undefined || s.date === filter.date) &&
    (filter.product === undefined || s.product === filter.product) &&
    (filter.store === undefined || s.store === filter.store) &&
    (filter.minPrice === undefined || s.price > filter.minPrice)
      ? [i]
      : [],
  );
  return { value: rows.reduce((sum, i) => sum + revenue(sales[i]), 0), rows };
}

export interface CubeFrame extends StepFrame {
  /** Cube cells being read: [date or 'total', product or 'total']. */
  cells: [string, string][];
  /** Raw rows looked at so far, and the ones that matched. */
  scanned: number[];
  matched: number[];
}

const describeRow = (s: Sale, filter: CubeFilter) =>
  [
    filter.date !== undefined && `date ${s.date}`,
    filter.product !== undefined && `product ${s.product}`,
    filter.store !== undefined && `store ${s.store}`,
    filter.minPrice !== undefined && `price $${s.price}`,
  ]
    .filter(Boolean)
    .join(', ');

/** Read one precomputed cube cell if the question fits its dimensions, otherwise scan every raw row. */
export function cubeFrames(cube: Cube, sales: readonly Sale[], filter: CubeFilter, missing?: string): CubeFrame[] {
  const fromCube = answerFromCube(cube, filter);
  if (fromCube) {
    const row = filter.date ?? 'total';
    const col = filter.product ?? 'total';
    const where = [filter.date && `row ${filter.date}`, filter.product && `column ${filter.product}`].filter(Boolean).join(' and ');
    const cell: [string, string] = [row, col];
    return [
      {
        cells: [],
        scanned: [],
        matched: [],
        caption: `The question only filters on ${[filter.date && 'date', filter.product && 'product'].filter(Boolean).join(' and ')} \u2014 dimensions of the cube. Find ${where}${
          row === 'total' || col === 'total' ? ', and use the precomputed total along the other dimension' : ''
        }.`,
      },
      {
        cells: [cell],
        scanned: [],
        matched: [],
        caption: `Answered from the cube by reading one precomputed cell: $${fromCube.value}. No raw rows scanned.`,
      },
    ];
  }
  const frames: CubeFrame[] = [
    {
      cells: [],
      scanned: [],
      matched: [],
      caption: `The cube is grouped by date \u00d7 product only. The question filters on ${missing ?? 'another attribute'}, which was summed away \u2014 the cube can\u2019t answer. Fall back to the raw fact rows.`,
    },
  ];
  const scanned: number[] = [];
  const matched: number[] = [];
  let total = 0;
  const { rows } = answerFromRaw(sales, filter);
  sales.forEach((s, i) => {
    scanned.push(i);
    const hit = rows.includes(i);
    if (hit) {
      matched.push(i);
      total += revenue(s);
    }
    frames.push({
      cells: [],
      scanned: [...scanned],
      matched: [...matched],
      quick: !hit,
      caption: hit
        ? `Row ${i + 1}: ${describeRow(s, filter)} \u2713 \u2192 add $${s.price} \u00d7 ${s.qty} = $${revenue(s)}. Running total $${total}.`
        : `Row ${i + 1}: ${describeRow(s, filter)} \u2014 skip.`,
    });
  });
  frames.push({
    cells: [],
    scanned,
    matched,
    caption: `The cube can\u2019t answer: ${missing ?? 'that attribute'} isn\u2019t one of its dimensions. Scanned all ${sales.length} raw rows instead: ${matched.length} match, $${total}${
      matched.length ? ` (${matched.map((i) => `$${revenue(sales[i])}`).join(' + ')})` : ''
    }.`,
  });
  return frames;
}
