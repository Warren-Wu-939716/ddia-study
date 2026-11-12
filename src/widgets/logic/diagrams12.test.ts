import { describe, expect, it } from 'vitest';
import { findBox, type BoardFrame } from './board.ts';
import {
  batchStreamFrames,
  directBrokerFrames,
  holFrames,
  LESSON_1_4_SCENARIOS,
  outboxFrames,
  overloadFrames,
  partitionOrderFrames,
  pollingFrames,
  pubsubFrames,
  retentionFrames,
  snapshotFrames,
} from './diagrams12a.ts';
import {
  analyticsFrames,
  asyncViewFrames,
  cepFrames,
  checkpointFrames,
  clockSkewFrames,
  fencingFrames,
  ivmFrames,
  ledgerFrames,
  LESSON_5_9_SCENARIOS,
  shredFrames,
  stateRecoveryFrames,
  stragglerFrames,
  streamSearchFrames,
  twoClocksFrames,
  versionedJoinFrames,
} from './diagrams12b.ts';

const last = (frames: BoardFrame[]) => frames.at(-1)!.board;
const texts = (frames: BoardFrame[], id: string) => (findBox(last(frames), id).chips ?? []).map((c) => c.text);
const lines = (frames: BoardFrame[], id: string) => findBox(last(frames), id).lines ?? [];

describe('chapter 12 diagram scenarios', () => {
  const all = [...Object.entries(LESSON_1_4_SCENARIOS), ...Object.entries(LESSON_5_9_SCENARIOS)].flatMap(([widget, list]) =>
    list.map((s) => [`${widget}/${s.id}`, s] as const),
  );

  it.each(all)('%s has captioned frames with uniquely named boxes', (_, scenario) => {
    const frames = scenario.frames();
    expect(frames.length).toBeGreaterThanOrEqual(3);
    for (const f of frames) {
      expect(f.caption.trim()).not.toBe('');
      const ids = f.board.columns.flat().map((b) => b.id);
      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('earlier frames are not changed by later steps', () => {
    expect(findBox(stragglerFrames('drop')[3].board, 'results').lines).toEqual(['10:57 → **2** (published 10:58:30)']);
    expect(findBox(pubsubFrames()[1].board, 'checkout').chips?.[0].tone).toBe('focus');
  });

  it('batch delays every order until midnight; streaming counts each at once', () => {
    expect(lines(batchStreamFrames('batch'), 'report')).toContain('o1 waited 15 h');
    expect(lines(batchStreamFrames('stream'), 'report')).toContain('o1 waited moments');
  });

  it('fast polling wastes most checks; notification wastes none', () => {
    expect(lines(pollingFrames('poll-1'), 'consumer')[0]).toBe('checks: **9** (7 found nothing)');
    expect(lines(pollingFrames('notify'), 'consumer')[0]).toBe('woken up: **2** times (0 for nothing)');
  });

  it('overload: drop loses, buffer grows, backpressure holds back at the source', () => {
    expect(texts(overloadFrames('drop'), 'lost')).toHaveLength(4);
    expect(lines(overloadFrames('buffer'), 'buffer')).toContain('waiting: **4**');
    const bp = overloadFrames('backpressure');
    expect(texts(bp, 'producer')).toHaveLength(4);
    expect(lines(bp, 'consumer')).toContain('processed: **8**');
  });

  it('a broker delivers what a direct call loses while the consumer is down', () => {
    expect(texts(directBrokerFrames('direct'), 'consumer')).toEqual(['m1', 'm4']);
    expect(texts(directBrokerFrames('broker'), 'consumer')).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it('keyed partitions keep each order in sequence; spreading them breaks it', () => {
    expect(lines(partitionOrderFrames('keyed'), 'status')[0]).toBe('A: **shipped** ✓');
    expect(lines(partitionOrderFrames('round-robin'), 'status')[0]).toBe('A: **paid** ✗ (really shipped)');
  });

  it('a slow message blocks its partition but not a shared queue', () => {
    expect(texts(holFrames('log'), 'done')).toEqual(['m1', 'm4', 'm5', 'm6', 'm2', 'm3']);
    expect(texts(holFrames('queue'), 'done')).toEqual(['m1', 'm3', 'm4', 'm5', 'm2', 'm6']);
  });

  it('a consumer that lags past retention loses messages', () => {
    expect(lines(retentionFrames(), 'archive')).toContain('lost: 1');
    expect(lines(retentionFrames(), 'reports')).toContain('lag: **0**');
  });

  it('only a snapshot tied to a log position yields a matching index', () => {
    expect(findBox(last(snapshotFrames('naive')), 'index').tone).toBe('bad');
    expect(findBox(last(snapshotFrames('tied')), 'index').tone).toBe('ok');
  });

  it('the outbox shields consumers from schema changes and is atomic', () => {
    expect(findBox(last(outboxFrames('raw')), 'shipping').tone).toBe('bad');
    expect(lines(outboxFrames('outbox'), 'shipping')).toEqual(['order 1 → label for Ann ✓', 'order 2 → label for Bo ✓']);
    const crash = outboxFrames('crash');
    expect(lines(crash, 'orders')).toHaveLength(1);
    expect(texts(crash, 'stream')).toEqual([]);
  });

  it('a ledger keeps the mistake and the correction', () => {
    const frames = ledgerFrames('ledger');
    expect(texts(frames, 'store')).toHaveLength(4);
    expect(lines(frames, 'balance')[0]).toBe('sum of entries: **£145**');
  });

  it('deleting leaves data in the backup; shredding the key covers every copy', () => {
    expect(texts(shredFrames('delete'), 'backup')).toContain('u7: address: 12 Elm St');
    expect(texts(shredFrames('shred'), 'backup').filter((t) => t.startsWith('u7'))).toEqual(['u7: unreadable', 'u7: unreadable']);
  });

  it('an async view can lag its own writer; one event per action stays atomic', () => {
    const stale = asyncViewFrames('stale');
    expect(stale.some((f) => findBox(f.board, 'user').lines?.includes('reloads profile: sees **Ann** ✗'))).toBe(true);
    expect(lines(stale, 'view')).toEqual(['display name: **Annie**']);
    const atomic = asyncViewFrames('atomic');
    expect(texts(atomic, 'log')).toHaveLength(1);
    expect([lines(atomic, 'ann')[0], lines(atomic, 'bo')[0]]).toEqual(['£40', '£30']);
  });

  it('standing queries match events as they pass', () => {
    expect(texts(cepFrames(), 'alerts')).toEqual(['card 1: UK → US in 2 min']);
    expect(texts(streamSearchFrames(), 'notify')).toEqual(['Bo: house in York', 'Ann: flat in Leeds']);
  });

  it('a window keeps a small summary and publishes it when the minute ends', () => {
    expect(lines(analyticsFrames(), 'published')[0]).toBe('10:00 → 4 requests, average **300 ms**, slowest 900 ms');
  });

  it('recompute and IVM agree on the view but not on the work', () => {
    const full = lines(ivmFrames('recompute'), 'view');
    const inc = lines(ivmFrames('incremental'), 'view');
    expect(full.slice(0, 3)).toEqual(['North: £65', 'South: £50', 'East: £5']);
    expect(inc.slice(0, 3)).toEqual(full.slice(0, 3));
    expect(full[3]).toContain('**20**');
    expect(inc[3]).toContain('**3**');
  });

  it('processing order differs from event order when an event is delayed', () => {
    expect(twoClocksFrames().at(-1)!.processed).toEqual(['e1', 'e2', 'e4', 'e5', 'e3']);
  });

  it('stragglers: dropped, corrected, or waited for with watermarks', () => {
    const drop = stragglerFrames('drop');
    expect(lines(drop, 'results')[0]).toContain('10:57 → **2**');
    expect(lines(drop, 'processor')).toContain('stragglers dropped: **2**');
    expect(lines(stragglerFrames('correct'), 'results')[0]).toContain('10:57 → **4**');
    expect(lines(stragglerFrames('watermark'), 'results')[0]).toContain('10:57 → **4**');
  });

  it('three timestamps correct for a wrong device clock', () => {
    expect(lines(clockSkewFrames('three'), 'estimate')).toContain('error: **2 s** ✓');
    expect(lines(clockSkewFrames('device'), 'estimate')).toContain('error: **5 min** ✗');
  });

  it('versioned joins are reproducible; joining with the latest value is not', () => {
    expect(lines(versionedJoinFrames('current'), 'report').at(-1)).toBe('rerun total: **£62.50** ✗');
    expect(lines(versionedJoinFrames('versioned'), 'report').at(-1)).toBe('rerun total: **£55** ✓');
  });

  it.each(['microbatch', 'checkpoint'] as const)('%s: exact count, but the side effect repeats', (mode) => {
    const frames = checkpointFrames(mode);
    expect(lines(frames, 'operator')[0]).toBe('count = **8**');
    expect(texts(frames, 'outside')).toHaveLength(2);
  });

  it.each(['remote', 'changelog', 'replay'] as const)('%s: the standby ends with the full state', (mode) => {
    expect(lines(stateRecoveryFrames(mode), 'node2')).toEqual(['p1 = 3', 'p2 = 1']);
  });

  it('fencing tokens stop a stale owner from overwriting newer data', () => {
    expect(lines(fencingFrames('none'), 'db')[0]).toBe('total = **11**');
    expect(lines(fencingFrames('tokens'), 'db')[0]).toBe('total = **12**');
  });
});
