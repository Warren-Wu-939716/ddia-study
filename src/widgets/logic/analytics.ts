import type { StepFrame } from '../../lib/steps.ts';
import { bitmapRunLengths, type FilterEvaluation } from '../../sims/columnar.ts';

export interface DiskReadFrame extends StepFrame {
  /** Lines (rows or column files) processed so far; the last one is current. */
  line: number;
}

/** Reading the table line by line: whole rows in a row store, one file per column in a column store. */
export function rowColumnFrames(layout: 'row' | 'column', used: readonly number[], columns: readonly string[], rowCount: number): DiskReadFrame[] {
  const total = columns.length * rowCount;
  if (layout === 'row') {
    const frames = Array.from({ length: rowCount }, (_, r): DiskReadFrame => ({
      line: r,
      quick: r > 0,
      caption:
        r === 0
          ? `Read row 1. Its ${columns.length} values are stored side by side, so all ${columns.length} come off the disk together — though the query needs only ${used.length}.`
          : `Read row ${r + 1}: another ${columns.length} values, ${used.length} of them useful.`,
    }));
    frames.push({
      line: rowCount,
      caption: `Each row is stored contiguously, so the ${used.length} wanted values are interleaved with everything else: the whole file is read — ${total} of ${total} values.`,
    });
    return frames;
  }
  const frames = columns.map(
    (name, c): DiskReadFrame => ({
      line: c,
      quick: !used.includes(c),
      caption: used.includes(c)
        ? `Read the \`${name}\` column: its ${rowCount} values sit together in their own file — all needed.`
        : `Skip the \`${name}\` column entirely: the query doesn't use it, and no other column shares its file.`,
    }),
  );
  const read = used.length * rowCount;
  frames.push({
    line: columns.length,
    caption: `Each column is its own contiguous region: read only the ${used.length} wanted column${used.length === 1 ? '' : 's'} — ${read} of ${total} values${
      read ? ` (${(total / read).toFixed(1)}× less)` : ''
    }.`,
  });
  return frames;
}

export interface BitmapFrame extends StepFrame {
  /** Bitmap rows shown so far, in order: product bitmaps, OR, store, AND. */
  shown: number;
}

const ones = (bits: readonly number[]) => bits.flatMap((b, i) => (b ? [i + 1] : [])).join(', ') || 'none';

/** Build the product bitmaps, OR them, then AND with the store bitmap. */
export function bitmapFrames(evaluation: FilterEvaluation, store: number | null, sorted: boolean): BitmapFrame[] {
  const { productBitmaps, productMatch, storeBitmap, result, matchingRows } = evaluation;
  if (productBitmaps.length === 0) return [{ shown: 0, caption: 'Tick at least one product.' }];
  const frames: BitmapFrame[] = productBitmaps.map((b, i) => ({
    shown: i + 1,
    caption: `Bitmap for product = ${b.value}: bit k is 1 when row k has product ${b.value} (rows ${ones(b.bits)}). Stored as run lengths: ${bitmapRunLengths(b.bits).join(', ')}.`,
  }));
  let shown = productBitmaps.length;
  if (productBitmaps.length > 1) {
    frames.push({ shown: ++shown, caption: `OR the product bitmaps: a row passes if it has any of the products → rows ${ones(productMatch)}.` });
  }
  if (storeBitmap) {
    frames.push({ shown: ++shown, caption: `Bitmap for store = ${store}: rows ${ones(storeBitmap)}.` });
    frames.push({
      shown: ++shown,
      caption: `AND the two bitmaps. This works because bit k means row k in every column → rows ${ones(result)}.`,
    });
  }
  frames.push({
    shown,
    caption: `${matchingRows.length} matching row${matchingRows.length === 1 ? '' : 's'}, found without reading any other column. ${
      sorted ? 'Sorted by product: each bitmap is one block of 1s, so its run-length encoding is tiny.' : 'Tick “sort rows by product” and watch the run lists shrink.'
    }`,
  });
  return frames;
}
