import { describe, expect, it } from 'vitest';
import {
  bitmapFor,
  bitmapRunLengths,
  bitwiseAnd,
  bitwiseOr,
  columnValues,
  distinctValues,
  evaluateFilter,
  formatBytes,
  generateSales,
  runLengthEncode,
  scanBytes,
  sortRows,
} from './columnar.ts';

describe('generateSales', () => {
  it('is deterministic and roughly time ordered', () => {
    const rows = generateSales(18, 4);
    expect(rows).toEqual(generateSales(18, 4));
    expect(rows).toHaveLength(18);
    const dates = columnValues(rows, 'date_key');
    expect([...dates].sort((a, b) => a - b)).toEqual(dates);
  });
});

describe('sortRows', () => {
  it('sorts whole rows lexicographically and stably', () => {
    const rows = generateSales();
    const sorted = sortRows(rows, ['product_sk', 'store_sk']);
    for (let i = 1; i < sorted.length; i++) {
      const [a, b] = [sorted[i - 1], sorted[i]];
      expect(a.product_sk < b.product_sk || (a.product_sk === b.product_sk && a.store_sk <= b.store_sk)).toBe(true);
    }
    expect(new Set(sorted.map((r) => r.row)).size).toBe(rows.length);
    expect(sortRows(rows, [])).toEqual(rows);
  });

  it('makes the first sort key compress into few runs', () => {
    const rows = generateSales();
    const unsorted = runLengthEncode(columnValues(rows, 'product_sk')).length;
    const sorted = runLengthEncode(columnValues(sortRows(rows, ['product_sk']), 'product_sk')).length;
    expect(sorted).toBe(distinctValues(columnValues(rows, 'product_sk')).length);
    expect(sorted).toBeLessThan(unsorted);
  });
});

describe('run-length and bitmap encoding', () => {
  it('encodes runs of values', () => {
    expect(runLengthEncode([1, 1, 2, 2, 2, 1])).toEqual([
      { value: 1, length: 2 },
      { value: 2, length: 3 },
      { value: 1, length: 1 },
    ]);
  });

  it('builds bitmaps and book-style run lengths', () => {
    expect(bitmapFor([5, 3, 5, 5], 5)).toEqual([1, 0, 1, 1]);
    expect(bitmapRunLengths([0, 0, 1, 1, 0, 0, 0])).toEqual([2, 2]);
    expect(bitmapRunLengths([1, 1, 0, 1])).toEqual([0, 2, 1, 1]);
    expect(bitmapRunLengths([0, 0, 0])).toEqual([3]);
  });

  it('combines bitmaps', () => {
    expect(bitwiseAnd([1, 1, 0], [1, 0, 0])).toEqual([1, 0, 0]);
    expect(bitwiseOr([[1, 0, 0], [0, 0, 1]], 3)).toEqual([1, 0, 1]);
  });
});

describe('evaluateFilter', () => {
  it('matches a direct row filter', () => {
    const rows = generateSales();
    const evaluation = evaluateFilter(rows, [31, 68], 3);
    const expected = rows.filter((r) => [31, 68].includes(r.product_sk) && r.store_sk === 3).map((r) => r.row);
    expect(evaluation.matchingRows).toEqual(expected);
    expect(evaluation.productBitmaps).toHaveLength(2);
  });

  it('skips the AND when no store is chosen', () => {
    const evaluation = evaluateFilter(generateSales(), [29], null);
    expect(evaluation.storeBitmap).toBeNull();
    expect(evaluation.result).toEqual(evaluation.productMatch);
  });
});

describe('scanBytes / formatBytes', () => {
  it('reads only used columns in a column store', () => {
    expect(scanBytes({ rows: 1e9, totalColumns: 100, columnsUsed: 3, bytesPerValue: 8 })).toEqual({ row: 8e11, column: 2.4e10 });
  });

  it('formats decimal byte sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2.4e10)).toBe('24.0 GB');
    expect(formatBytes(8e11)).toBe('800 GB');
    expect(formatBytes(2.56e14)).toBe('256 TB');
  });
});
