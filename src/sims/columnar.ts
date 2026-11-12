import { createRng, randomInt } from '../lib/random.ts';

export interface SalesRow {
  row: number;
  date_key: number;
  product_sk: number;
  store_sk: number;
  quantity: number;
}

export type SalesColumn = 'date_key' | 'product_sk' | 'store_sk' | 'quantity';

export const SALES_COLUMNS: readonly SalesColumn[] = ['date_key', 'product_sk', 'store_sk', 'quantity'];

const DATES = [240101, 240102, 240103];
const PRODUCTS = [29, 30, 31, 68, 69];
const STORES = [3, 4, 5];

/** Small, deterministic fact table in insertion order. */
export function generateSales(count = 18, seed = 4): SalesRow[] {
  const rng = createRng(seed);
  const rows: SalesRow[] = [];
  for (let i = 0; i < count; i++) {
    rows.push({
      row: i,
      // Rows arrive roughly in time order, as they would from an ETL load.
      date_key: DATES[Math.min(DATES.length - 1, Math.floor((i / count) * DATES.length))],
      product_sk: PRODUCTS[randomInt(rng, 0, PRODUCTS.length - 1)],
      store_sk: STORES[randomInt(rng, 0, STORES.length - 1)],
      quantity: randomInt(rng, 1, 4),
    });
  }
  return rows;
}

export function columnValues(rows: readonly SalesRow[], column: SalesColumn): number[] {
  return rows.map((r) => r[column]);
}

/** Sorts whole rows (never individual columns) by the given keys, then by original position. */
export function sortRows(rows: readonly SalesRow[], keys: readonly SalesColumn[]): SalesRow[] {
  return [...rows].sort((a, b) => {
    for (const key of keys) {
      if (a[key] !== b[key]) return a[key] - b[key];
    }
    return a.row - b.row;
  });
}

export interface Run {
  value: number;
  length: number;
}

export function runLengthEncode(values: readonly number[]): Run[] {
  const runs: Run[] = [];
  for (const value of values) {
    const last = runs[runs.length - 1];
    if (last && last.value === value) last.length++;
    else runs.push({ value, length: 1 });
  }
  return runs;
}

export function distinctValues(values: readonly number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

/** One bit per row: 1 where the column equals `target`. */
export function bitmapFor(values: readonly number[], target: number): number[] {
  return values.map((v) => (v === target ? 1 : 0));
}

/** Book-style run lengths: alternating counts of 0s then 1s, always starting with zeros. */
export function bitmapRunLengths(bits: readonly number[]): number[] {
  const runs: number[] = [];
  let current = 0;
  let length = 0;
  for (const bit of bits) {
    if (bit === current) {
      length++;
    } else {
      runs.push(length);
      current = bit;
      length = 1;
    }
  }
  runs.push(length);
  // A trailing run of zeros is implied by the row count, so it's omitted.
  if (current === 0 && runs.length > 1) runs.pop();
  return runs;
}

export function bitwiseAnd(a: readonly number[], b: readonly number[]): number[] {
  return a.map((bit, i) => bit & (b[i] ?? 0));
}

export function bitwiseOr(bitmaps: readonly (readonly number[])[], length: number): number[] {
  const out = new Array<number>(length).fill(0);
  for (const bitmap of bitmaps) bitmap.forEach((bit, i) => (out[i] |= bit));
  return out;
}

export interface FilterEvaluation {
  productBitmaps: { value: number; bits: number[] }[];
  productMatch: number[];
  storeBitmap: number[] | null;
  result: number[];
  matchingRows: number[];
}

/** WHERE product_sk IN (...) [AND store_sk = s], answered with bitmap OR and AND. */
export function evaluateFilter(rows: readonly SalesRow[], productIn: readonly number[], storeEq: number | null): FilterEvaluation {
  const products = columnValues(rows, 'product_sk');
  const productBitmaps = productIn.map((value) => ({ value, bits: bitmapFor(products, value) }));
  const productMatch = bitwiseOr(productBitmaps.map((p) => p.bits), rows.length);
  const storeBitmap = storeEq === null ? null : bitmapFor(columnValues(rows, 'store_sk'), storeEq);
  const result = storeBitmap ? bitwiseAnd(productMatch, storeBitmap) : productMatch;
  const matchingRows = result.flatMap((bit, i) => (bit ? [rows[i].row] : []));
  return { productBitmaps, productMatch, storeBitmap, result, matchingRows };
}

export interface ScanInput {
  rows: number;
  totalColumns: number;
  columnsUsed: number;
  bytesPerValue: number;
}

/** A row store must read whole rows; a column store reads only the columns the query touches. */
export function scanBytes({ rows, totalColumns, columnsUsed, bytesPerValue }: ScanInput): { row: number; column: number } {
  return {
    row: rows * totalColumns * bytesPerValue,
    column: rows * columnsUsed * bytesPerValue,
  };
}

/** Human-readable byte size (decimal units, as storage vendors quote them). */
export function formatBytes(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < units.length - 1) {
    value /= 1000;
    unit++;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}
