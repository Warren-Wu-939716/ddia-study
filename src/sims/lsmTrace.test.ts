import { describe, expect, it } from 'vitest';
import { applyOp, createLsm, lookup, runOps, type LsmConfig, type LsmOp } from './lsm.ts';
import { traceGet, traceOp } from './lsmTrace.ts';

const config: LsmConfig = { memtableLimit: 3, tierThreshold: 2, bloomBits: 64, bloomHashes: 3, autoCompact: true };
const put = (key: string, value = '1'): LsmOp => ({ type: 'put', key, value });

const comparable = (s: ReturnType<typeof createLsm>) => ({ wal: s.wal, memtable: s.memtable, segments: s.segments.map((x) => [x.id, x.entries]) });

describe('traceOp', () => {
  it('shows WAL append then memtable insert for a write that fits', () => {
    const start = runOps(config, [put('b')]);
    const { frames, final } = traceOp(start, put('a'));
    expect(frames).toHaveLength(2);
    expect(frames[0].state.wal.map((e) => e.key)).toEqual(['b', 'a']);
    expect(frames[0].state.memtable.map((e) => e.key)).toEqual(['b']);
    expect(frames[0].focus?.wal).toBe(1);
    expect(frames[1].state.memtable.map((e) => e.key)).toEqual(['a', 'b']);
    expect(frames[1].caption).toMatch(/before `b`/);
    expect(comparable(frames[1].state)).toEqual(comparable(final));
  });

  it('breaks a flush into freeze, write, Bloom filter and WAL truncation', () => {
    const start = runOps({ ...config, autoCompact: false }, [put('a'), put('b')]);
    const { frames, final } = traceOp(start, put('c'));
    expect(frames.map((f) => f.caption.split(' ').slice(0, 2).join(' '))).toEqual(['Append `c=1`', 'Insert `c`', 'The memtable', 'Write the', 'Build #1\'s', 'Everything the']);
    expect(frames[2].frozen?.map((e) => e.key)).toEqual(['a', 'b', 'c']);
    expect(frames[2].state.memtable).toEqual([]);
    expect(frames[3].state.segments).toHaveLength(1);
    expect(frames[3].state.wal).toHaveLength(3);
    expect(frames[4].focus?.bloom?.positions.length).toBeGreaterThan(0);
    expect(comparable(frames.at(-1)!.state)).toEqual(comparable(final));
  });

  it('adds size-tiered compaction rounds after a flush', () => {
    const start = runOps(config, [put('a'), put('b'), put('c'), put('d'), put('e')]);
    const { frames, final } = traceOp(start, put('f'));
    const merge = frames.findIndex((f) => f.caption.startsWith('Size-tiered'));
    expect(merge).toBeGreaterThan(0);
    expect(frames[merge].focus?.segments).toEqual([2, 1]);
    expect(comparable(frames.at(-1)!.state)).toEqual(comparable(final));
  });

  it('records deletes as tombstones', () => {
    const { frames } = traceOp(createLsm(config), { type: 'delete', key: 'x' });
    expect(frames[0].caption).toMatch(/tombstone/);
    expect(frames[1].state.memtable).toEqual([{ key: 'x', value: null }]);
  });

  it('walks a major compaction one key at a time', () => {
    const start = runOps({ ...config, autoCompact: false }, [put('a', '1'), { type: 'flush' }, put('a', '2'), { type: 'delete', key: 'b' }, { type: 'flush' }]);
    const { frames, final } = traceOp(start, { type: 'compact' });
    expect(frames[0].caption).toMatch(/Major compaction/);
    const keys = frames.flatMap((f) => (f.focus?.mergeKey ? [f.focus.mergeKey] : []));
    expect(keys).toEqual(['a', 'b']);
    expect(frames.find((f) => f.focus?.mergeKey === 'b')?.caption).toMatch(/drop it/);
    expect(frames.at(-2)?.building).toEqual([{ key: 'a', value: '2' }]);
    expect(comparable(frames.at(-1)!.state)).toEqual(comparable(final));
  });

  it('explains a no-op flush and compaction', () => {
    expect(traceOp(createLsm(config), { type: 'flush' }).frames[0].caption).toMatch(/empty/);
    expect(traceOp(createLsm(config), { type: 'compact' }).frames[0].caption).toMatch(/at least two/);
  });

  it('every frame sequence ends at the real final state for random workloads', () => {
    let state = createLsm({ ...config, memtableLimit: 2 });
    const keys = ['a', 'b', 'c', 'd'];
    for (let i = 0; i < 30; i++) {
      const op: LsmOp = i % 7 === 6 ? { type: 'compact' } : i % 5 === 4 ? { type: 'delete', key: keys[i % 4] } : put(keys[(i * 3) % 4], String(i));
      const { frames, final } = traceOp(state, op);
      expect(comparable(frames.at(-1)!.state)).toEqual(comparable(final));
      expect(final).toEqual(applyOp(state, op));
      state = final;
    }
  });
});

describe('traceGet', () => {
  const state = runOps({ ...config, autoCompact: false }, [put('apple', 'red'), put('fig', 'p'), put('kiwi', 'g'), put('apple', 'green'), { type: 'delete', key: 'fig' }, put('lime', 'g'), put('date', 'b')]);

  it('stops at the memtable when the key is there', () => {
    const { frames } = traceGet(state, 'date');
    expect(frames).toHaveLength(1);
    expect(frames[0].focus?.outcome).toMatchObject({ source: 'memtable', outcome: 'hit' });
  });

  it('checks segments newest first and stops at a tombstone', () => {
    const { frames, result } = traceGet(state, 'fig');
    expect(result.deleted).toBe(true);
    expect(frames.at(-1)?.caption).toMatch(/tombstone/);
    expect(frames.at(-1)?.focus?.outcome?.segmentId).toBe(2);
  });

  it('agrees with lookup() for every key, including missing ones', () => {
    for (const key of ['apple', 'fig', 'kiwi', 'lime', 'date', 'zebra', 'banana']) {
      const { frames, result } = traceGet(state, key);
      expect(result).toEqual(lookup(state, key));
      const outcomes = frames.flatMap((f) => (f.focus?.outcome ? [f.focus.outcome.outcome] : []));
      expect(outcomes).toEqual(result.steps.map((s) => s.outcome));
    }
  });
});
