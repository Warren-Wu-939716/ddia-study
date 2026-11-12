import { describe, expect, it } from 'vitest';
import type { LsmEntry } from '../../sims/lsm.ts';
import {
  buildHashIndex,
  crashFrames,
  crashOutcome,
  hopFrames,
  indexHops,
  indexReadFrames,
  layoutFiles,
  mergeFrames,
  mergeOutput,
  mergeTrace,
  rebuildFrames,
  scanFrames,
  setFrames,
  sparseFrames,
  splitSteps,
  ssdDeleteFrames,
  type LogRecord,
} from './storage.ts';

const LOG: LogRecord[] = [
  { key: 'a', value: '1' },
  { key: 'b', value: '2' },
  { key: 'a', value: '3' },
];

describe('append-log frames', () => {
  it('set: end of file, append, then update the hash map', () => {
    const index = buildHashIndex(LOG);
    const run = setFrames(LOG, index, { key: 'a', value: '4' }, true);
    expect(run.frames.map((f) => f.log.length)).toEqual([3, 4, 4]);
    expect(run.frames[0].eof).toBe(true);
    expect(run.frames[1].fresh).toBe(3);
    expect(run.frames[1].caption).toMatch(/old line 3/);
    expect(run.frames[2].index?.get('a')).toBe(3);
    expect(run.frames[2].caption).toMatch(/instead of byte/);
    expect(run.index?.get('a')).toBe(3);
    expect(index.get('a')).toBe(2);
  });

  it('set without an index stops after the append; with a lost index it says so', () => {
    expect(setFrames(LOG, null, { key: 'c', value: '1' }, false).frames).toHaveLength(2);
    const lost = setFrames(LOG, null, { key: 'c', value: '1' }, true);
    expect(lost.frames.at(-1)?.caption).toMatch(/lost in the crash/);
    expect(lost.index).toBeNull();
  });

  it('scan reads every line, marks non-matches quick, and returns the last match', () => {
    const frames = scanFrames(LOG, null, 'a');
    expect(frames).toHaveLength(LOG.length + 1);
    expect(frames.map((f) => f.quick ?? false)).toEqual([false, true, false, false]);
    expect(frames[2].matches).toEqual([0, 2]);
    expect(frames.at(-1)?.hit).toBe(2);
    expect(scanFrames(LOG, null, 'zzz').at(-1)?.caption).toMatch(/isn't there/);
  });

  it('index reads take one lookup and one seek', () => {
    const index = buildHashIndex(LOG);
    const frames = indexReadFrames(LOG, index, 'b');
    expect(frames).toHaveLength(2);
    expect(frames[1].hit).toBe(1);
    expect(indexReadFrames(LOG, index, 'zzz')).toHaveLength(1);
  });

  it('rebuild grows the map line by line', () => {
    const { frames, index } = rebuildFrames(LOG);
    expect(frames.map((f) => f.index?.size)).toEqual([1, 2, 2, 2]);
    expect(frames[2].caption).toMatch(/overwrite/);
    expect(index).toEqual(buildHashIndex(LOG));
  });
});

describe('sparseFrames', () => {
  const blocks = [
    ['a', 'b', 'c'],
    ['d', 'e', 'f'],
  ];

  it('picks a block in memory, reads it, then scans keys in order', () => {
    const frames = sparseFrames(blocks, 'e');
    expect(frames.map((f) => f.opened)).toEqual([false, true, true, true]);
    expect(frames.at(-1)?.scanned).toEqual(['d', 'e']);
    expect(frames.at(-1)?.found).toBe(true);
  });

  it('stops at a larger key, or at the end of the block', () => {
    expect(sparseFrames(blocks, 'bb').at(-1)?.caption).toMatch(/isn't in the file/);
    expect(sparseFrames(blocks, 'z').at(-1)?.caption).toMatch(/end of block 1/);
    expect(sparseFrames(blocks, '0')).toHaveLength(1);
  });
});

describe('mergeFrames', () => {
  const runs: LsmEntry[][] = [
    [
      { key: 'a', value: '2' },
      { key: 'c', value: null },
    ],
    [
      { key: 'a', value: '1' },
      { key: 'b', value: '1' },
    ],
  ];

  it('compares, then emits, for every key, and ends with the merged output', () => {
    const frames = mergeFrames(runs, ['new', 'old'], false);
    const steps = mergeTrace(runs, false);
    expect(frames).toHaveLength(steps.length * 2 + 2);
    expect(frames.map((f) => f.phase).slice(0, 3)).toEqual(['start', 'compare', 'emit']);
    expect(frames[1].output).toEqual([]);
    expect(frames[2].output).toEqual([{ key: 'a', value: '2' }]);
    expect(frames[2].heads).toEqual([1, 1]);
    expect(frames.at(-1)?.output).toEqual(mergeOutput(steps));
  });

  it('drops tombstones when the output is the oldest segment', () => {
    const frames = mergeFrames(runs, ['new', 'old'], true);
    expect(frames.at(-1)?.output.map((e) => e.key)).toEqual(['a', 'b']);
    expect(frames.some((f) => /drop it/.test(f.caption))).toBe(true);
  });
});

describe('crashFrames', () => {
  it('runs the steps up to the crash, then crash, restart and the outcome', () => {
    for (const withWal of [false, true]) {
      for (let completed = 0; completed <= splitSteps(withWal).length; completed++) {
        const frames = crashFrames(withWal, completed);
        expect(frames.map((f) => f.phase)).toEqual([...Array<string>(completed).fill('write'), 'crash', 'restart', 'result']);
        expect(frames.at(-1)?.outcome).toEqual(crashOutcome(withWal, completed));
        expect(frames.at(-1)?.pages).toEqual(crashOutcome(withWal, completed).afterRestart);
      }
    }
  });

  it('loses a WAL record that was written but not fsynced', () => {
    const frames = crashFrames(true, 1);
    expect(frames[0].wal).toBe('buffered');
    expect(frames[1].wal).toBe('lost');
    expect(crashFrames(true, 2)[1].wal).toBe('durable');
  });
});

describe('ssdDeleteFrames', () => {
  const files = [
    { name: 'A', pages: 4 },
    { name: 'B', pages: 4 },
    { name: 'C', pages: 4 },
  ];

  it('erases a block of only stale pages without copying', () => {
    const frames = ssdDeleteFrames(layoutFiles(files, 'sequential'), 'B');
    expect(frames.at(-1)?.copies).toBe(0);
    expect(frames.at(-1)?.blocks[1].every((p) => p === null)).toBe(true);
  });

  it('copies every still-valid page out of mixed blocks, one frame per copy', () => {
    const frames = ssdDeleteFrames(layoutFiles(files, 'scattered'), 'B');
    expect(frames.filter((f) => f.to).length).toBe(8);
    expect(frames.at(-1)?.copies).toBe(8);
    const survivors = frames.at(-1)!.blocks.flat().filter((p) => p !== null);
    expect(survivors).toHaveLength(8);
    expect(survivors.every((p) => p.file !== 'B')).toBe(true);
  });
});

describe('hopFrames', () => {
  it('has one frame per hop and summarises on the last', () => {
    const frames = hopFrames(indexHops('heap', 'all-by-email'));
    expect(frames.map((f) => f.hop)).toEqual([0, 1]);
    expect(frames[1].caption).toMatch(/2 structures/);
  });
});
