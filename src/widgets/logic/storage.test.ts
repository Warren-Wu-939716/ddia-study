import { describe, expect, it } from 'vitest';
import { mergeRuns, type LsmEntry } from '../../sims/lsm.ts';
import {
  btreeWriteAmplification,
  buildHashIndex,
  crashOutcome,
  gcAfterDelete,
  indexHops,
  latestLine,
  layoutFiles,
  lineOffsets,
  lsmWriteAmplification,
  mergeOutput,
  mergeTrace,
  sparseLookup,
  splitSteps,
  staleLines,
  type LogRecord,
} from './storage.ts';

const log: LogRecord[] = [
  { key: 'user:7', value: '{"name":"Ana"}' },
  { key: 'user:9', value: '{"name":"Bo"}' },
  { key: 'user:7', value: '{"name":"Ana Li"}' },
];

describe('append-only log helpers', () => {
  it('computes byte offsets including newlines and multi-byte characters', () => {
    expect(lineOffsets(log)).toEqual([0, 22, 43]);
    expect(lineOffsets([{ key: 'é', value: '1' }, { key: 'a', value: '1' }])).toEqual([0, 5]);
  });

  it('finds the newest line, builds the hash index and marks stale lines', () => {
    expect(latestLine(log, 'user:7')).toBe(2);
    expect(latestLine(log, 'nope')).toBe(-1);
    expect(Object.fromEntries(buildHashIndex(log))).toEqual({ 'user:7': 2, 'user:9': 1 });
    expect([...staleLines(log)]).toEqual([0]);
  });
});

describe('sparseLookup', () => {
  const blocks = [
    ['apple', 'apricot', 'avocado', 'banana'],
    ['blueberry', 'cherry', 'coconut', 'date'],
    ['fig', 'grape', 'guava', 'kiwi'],
  ];

  it('reads only the covering block and stops once the key is found', () => {
    expect(sparseLookup(blocks, 'coconut')).toEqual({ blockIndex: 1, scanned: ['blueberry', 'cherry', 'coconut'], found: true });
  });

  it('stops scanning once it passes where the key would be', () => {
    expect(sparseLookup(blocks, 'cranberry')).toEqual({ blockIndex: 1, scanned: ['blueberry', 'cherry', 'coconut', 'date'], found: false });
    expect(sparseLookup(blocks, 'apples')).toEqual({ blockIndex: 0, scanned: ['apple', 'apricot'], found: false });
  });

  it('handles keys before the first block and after the last', () => {
    expect(sparseLookup(blocks, 'aardvark')).toEqual({ blockIndex: null, scanned: [], found: false });
    expect(sparseLookup(blocks, 'zucchini').blockIndex).toBe(2);
  });
});

describe('mergeTrace', () => {
  const newer: LsmEntry[] = [
    { key: 'apple', value: '3' },
    { key: 'fig', value: '9' },
    { key: 'kiwi', value: null },
  ];
  const older: LsmEntry[] = [
    { key: 'apple', value: '1' },
    { key: 'banana', value: '2' },
    { key: 'kiwi', value: '5' },
  ];

  it('produces one step per output key with the newest value winning', () => {
    const steps = mergeTrace([newer, older], false);
    expect(steps.map((s) => s.key)).toEqual(['apple', 'banana', 'fig', 'kiwi']);
    expect(steps[0].candidates.map((c) => c.run)).toEqual([0, 1]);
    expect(steps[0].cursors).toEqual([0, 0]);
    expect(steps[3].cursors).toEqual([2, 2]);
    expect(mergeOutput(steps)).toEqual(mergeRuns([newer, older], false));
  });

  it('drops tombstones only when asked, matching mergeRuns', () => {
    const steps = mergeTrace([newer, older], true);
    expect(steps.find((s) => s.key === 'kiwi')?.dropped).toBe(true);
    expect(mergeOutput(steps)).toEqual(mergeRuns([newer, older], true));
  });
});

describe('crashOutcome', () => {
  it('lists the steps of a split with and without a WAL', () => {
    expect(splitSteps(true)).toEqual(['wal', 'fsync', 'left', 'right', 'parent']);
    expect(splitSteps(false)).toEqual(['left', 'right', 'parent']);
  });

  it('without a WAL, partial writes corrupt the tree', () => {
    expect(crashOutcome(false, 0)).toMatchObject({ consistent: true, insertApplied: false });
    expect(crashOutcome(false, 1)).toMatchObject({ consistent: false, orphan: false, lostKeys: [337, 340] });
    expect(crashOutcome(false, 2)).toMatchObject({ consistent: false, orphan: true, onDisk: { right: 'new', parent: 'old' } });
    expect(crashOutcome(false, 3)).toMatchObject({ consistent: true, insertApplied: true });
  });

  it('with a WAL, any crash after fsync is repaired by replay', () => {
    expect(crashOutcome(true, 1)).toMatchObject({ walDurable: false, consistent: true, insertApplied: false });
    for (const completed of [2, 3, 4, 5]) {
      const outcome = crashOutcome(true, completed);
      expect(outcome).toMatchObject({ walDurable: true, consistent: true, insertApplied: true });
      expect(outcome.afterRestart).toEqual({ parent: 'new', left: 'new', right: 'new' });
    }
  });
});

describe('SSD garbage collection', () => {
  const files = [
    { name: 'A', pages: 4 },
    { name: 'B', pages: 4 },
    { name: 'C', pages: 4 },
  ];

  it('lays files out sequentially or interleaved', () => {
    const seq = layoutFiles(files, 'sequential');
    expect(seq[1].map((p) => p?.file)).toEqual(['B', 'B', 'B', 'B']);
    expect(seq[3]).toEqual([null, null, null, null]);
    expect(layoutFiles(files, 'scattered')[0].map((p) => p && `${p.file}${p.part}`)).toEqual(['A1', 'B1', 'C1', 'A2']);
  });

  it('needs no copying when a deleted file owned whole blocks', () => {
    expect(gcAfterDelete(layoutFiles(files, 'sequential'), 'B')).toEqual({ blocks: [1], copies: 0 });
    expect(gcAfterDelete(layoutFiles(files, 'scattered'), 'B')).toEqual({ blocks: [0, 1, 2], copies: 8 });
  });
});

describe('write amplification model', () => {
  it('counts WAL, flush and compactions for LSM', () => {
    expect(lsmWriteAmplification(0)).toBe(2);
    expect(lsmWriteAmplification(3)).toBe(5);
  });

  it('charges B-trees a page per write, shared by buffered updates', () => {
    expect(btreeWriteAmplification(100, 4000, 1)).toBe(41);
    expect(btreeWriteAmplification(100, 4000, 40)).toBe(2);
    expect(btreeWriteAmplification(100, 4000, 0)).toBe(41);
  });
});

describe('indexHops', () => {
  it('clustered primary keys hold the row; secondary indexes go through the primary key', () => {
    expect(indexHops('clustered', 'by-id').map((h) => h.structure)).toEqual(['pk-index']);
    expect(indexHops('clustered', 'all-by-email').map((h) => h.structure)).toEqual(['email-index', 'pk-index']);
  });

  it('heap files need a second hop unless an index covers the query', () => {
    expect(indexHops('heap', 'status-by-email').map((h) => h.structure)).toEqual(['email-index', 'heap']);
    expect(indexHops('covering', 'status-by-email').map((h) => h.structure)).toEqual(['email-index']);
    expect(indexHops('covering', 'all-by-email').map((h) => h.structure)).toEqual(['email-index', 'heap']);
    expect(indexHops('heap', 'by-id').map((h) => h.structure)).toEqual(['pk-index', 'heap']);
  });
});
