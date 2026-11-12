import { describe, expect, it } from 'vitest';
import {
  applyOp,
  compareKeys,
  createLsm,
  DEFAULT_LSM_CONFIG,
  diskEntries,
  findEntry,
  liveKeyCount,
  lookup,
  mergeRuns,
  runOps,
  upsertSorted,
  writeAmplification,
  type LsmConfig,
  type LsmOp,
} from './lsm.ts';

const config: LsmConfig = { memtableLimit: 3, tierThreshold: 3, bloomBits: 64, bloomHashes: 3, autoCompact: true };
const put = (key: string, value = '1'): LsmOp => ({ type: 'put', key, value });

describe('helpers', () => {
  it('compares keys by code unit, independent of locale', () => {
    expect(compareKeys('B', 'a')).toBeLessThan(0);
    expect(compareKeys('k10', 'k2')).toBeLessThan(0);
    expect(compareKeys('x', 'x')).toBe(0);
  });

  it('upsertSorted keeps order and replaces existing keys', () => {
    let entries = upsertSorted([], { key: 'm', value: '1' });
    entries = upsertSorted(entries, { key: 'a', value: '1' });
    entries = upsertSorted(entries, { key: 'z', value: '1' });
    entries = upsertSorted(entries, { key: 'm', value: '2' });
    expect(entries).toEqual([
      { key: 'a', value: '1' },
      { key: 'm', value: '2' },
      { key: 'z', value: '1' },
    ]);
    expect(findEntry(entries, 'm')?.value).toBe('2');
    expect(findEntry(entries, 'q')).toBeUndefined();
  });

  it('mergeRuns keeps the newest value per key and optionally drops tombstones', () => {
    const newest = [{ key: 'a', value: null }, { key: 'c', value: '3' }];
    const oldest = [{ key: 'a', value: '1' }, { key: 'b', value: '2' }, { key: 'c', value: 'old' }];
    expect(mergeRuns([newest, oldest], false)).toEqual([
      { key: 'a', value: null },
      { key: 'b', value: '2' },
      { key: 'c', value: '3' },
    ]);
    expect(mergeRuns([newest, oldest], true).map((e) => e.key)).toEqual(['b', 'c']);
  });
});

describe('write path', () => {
  it('appends to the WAL and memtable until the threshold, then flushes', () => {
    let state = createLsm(config);
    state = applyOp(state, put('b'));
    state = applyOp(state, put('a'));
    expect(state.wal.map((e) => e.key)).toEqual(['b', 'a']);
    expect(state.memtable.map((e) => e.key)).toEqual(['a', 'b']);
    state = applyOp(state, put('c'));
    expect(state.memtable).toEqual([]);
    expect(state.wal).toEqual([]);
    expect(state.segments).toHaveLength(1);
    expect(state.segments[0].entries.map((e) => e.key)).toEqual(['a', 'b', 'c']);
  });

  it('flushing an empty memtable is a no-op with a message', () => {
    const state = applyOp(createLsm(config), { type: 'flush' });
    expect(state.segments).toHaveLength(0);
    expect(state.events.at(-1)).toMatch(/empty/);
  });

  it('size-tiered compaction merges a run of same-tier segments', () => {
    const state = runOps(config, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((k) => put(k)));
    expect(state.segments).toHaveLength(1);
    expect(state.segments[0].tier).toBe(1);
    expect(state.stats.compactions).toBe(1);
    expect(state.segments[0].entries).toHaveLength(9);
  });

  it('does not compact automatically when disabled', () => {
    const state = runOps({ ...config, autoCompact: false }, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((k) => put(k)));
    expect(state.segments).toHaveLength(3);
  });

  it('major compaction removes stale versions and tombstones', () => {
    const state = runOps({ ...config, autoCompact: false }, [
      put('a', '1'),
      { type: 'flush' },
      put('a', '2'),
      { type: 'delete', key: 'b' },
      { type: 'flush' },
      { type: 'compact' },
    ]);
    expect(state.segments).toHaveLength(1);
    expect(state.segments[0].entries).toEqual([{ key: 'a', value: '2' }]);
  });

  it('refuses to compact a single tombstone-free segment', () => {
    const state = runOps(config, [put('a'), { type: 'flush' }, { type: 'compact' }]);
    expect(state.stats.compactions).toBe(0);
  });
});

describe('read path', () => {
  it('prefers the memtable, then newer segments', () => {
    const state = runOps({ ...config, autoCompact: false }, [put('k', 'v1'), { type: 'flush' }, put('k', 'v2'), { type: 'flush' }, put('k', 'v3')]);
    expect(lookup(state, 'k')).toMatchObject({ found: true, value: 'v3', segmentsRead: 0 });
    const flushed = applyOp(state, { type: 'flush' });
    const result = lookup(flushed, 'k');
    expect(result.value).toBe('v3');
    expect(result.steps.find((s) => s.outcome === 'hit')?.segmentId).toBe(flushed.segments[0].id);
  });

  it('reports tombstoned keys as deleted', () => {
    const state = runOps(config, [put('k'), { type: 'flush' }, { type: 'delete', key: 'k' }]);
    expect(lookup(state, 'k')).toMatchObject({ found: false, deleted: true });
  });

  it('skips segments using Bloom filters for missing keys', () => {
    const state = runOps({ ...config, autoCompact: false }, ['apple', 'bagel', 'cider', 'dates', 'eggs', 'flour'].map((k) => put(k)));
    const result = lookup(state, 'zebra');
    expect(result.found).toBe(false);
    expect(result.steps.filter((s) => s.outcome === 'bloom-skip').length).toBeGreaterThan(0);
    expect(result.segmentsRead).toBeLessThan(state.segments.length);
  });
});

describe('accounting', () => {
  it('computes write amplification from WAL, flush and compaction writes', () => {
    expect(writeAmplification(createLsm().stats)).toBe(0);
    const state = runOps({ ...config, tierThreshold: 4 }, Array.from({ length: 12 }, (_, i) => put(`k${i}`)));
    expect(writeAmplification(state.stats)).toBe(3);
  });

  it('distinguishes entries on disk from live keys', () => {
    const state = runOps({ ...DEFAULT_LSM_CONFIG, memtableLimit: 2, autoCompact: false }, [put('a', '1'), put('b', '1'), put('a', '2'), put('b', '2')]);
    expect(diskEntries(state)).toBe(4);
    expect(liveKeyCount(state)).toBe(2);
  });
});
