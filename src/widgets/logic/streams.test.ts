import { describe, expect, it } from 'vitest';
import { joinFrames } from './streamJoins.ts';
import { clock, windowFrames, type WindowKind } from './streamTime.ts';
import {
  compactionFrames,
  DEPOSITS,
  deliveryFrames,
  effectFrames,
  eventLogFrames,
  eventTimeFrames,
  redeliveryFrames,
  syncFrames,
} from './streams.ts';

describe('deliveryFrames', () => {
  it('splits messages under load balancing and copies them under fan-out', () => {
    expect(deliveryFrames('load-balance', 6).at(-1)?.received).toEqual({ A: [1, 3, 5], B: [2, 4, 6] });
    expect(deliveryFrames('fan-out', 4).at(-1)?.received).toEqual({ A: [1, 2, 3, 4], B: [1, 2, 3, 4] });
    const groups = deliveryFrames('groups', 4).at(-1)!.received;
    expect(groups.A.length + groups.B.length).toBe(4);
    expect(groups.C).toEqual([1, 2, 3, 4]);
  });
});

describe('redeliveryFrames', () => {
  it('reorders m3 and m4 after a crash', () => {
    expect(redeliveryFrames('crash').at(-1)?.done.C1).toEqual(['m1', 'm4', 'm3', 'm5']);
  });

  it('parks a poison message in the dead letter queue', () => {
    const last = redeliveryFrames('poison').at(-1)!;
    expect(last.dlq).toEqual(['m2']);
    expect(last.done.C1).toEqual(['m1', 'm3']);
  });
});

describe('syncFrames', () => {
  it('dual writes can diverge without any error', () => {
    const last = syncFrames('race').at(-1)!;
    expect([last.db, last.index]).toEqual(['B', 'A']);
    expect(syncFrames('partial-failure').at(-1)).toMatchObject({ db: 'A', index: 'old' });
  });

  it('CDC applies the database order to the index', () => {
    const last = syncFrames('cdc').at(-1)!;
    expect(last).toMatchObject({ db: 'B', index: 'B', applied: 2 });
  });
});

describe('compactionFrames', () => {
  it('keeps the newest value per key and removes tombstoned keys', () => {
    const frames = compactionFrames([
      { key: 'socks', value: '3' },
      { key: 'hat', value: '1' },
      { key: 'socks', value: '2' },
      { key: 'gloves', value: '5' },
      { key: 'gloves', value: null },
    ]);
    const last = frames.at(-1)!;
    expect(last.compacted?.map((c) => c.offset)).toEqual([1, 2]);
    expect(last.rebuilt).toEqual({ hat: '1', socks: '2' });
    expect(last.dropped).toEqual([0, 3, 4]);
  });
});

describe('eventLogFrames', () => {
  const events = [
    { type: 'added', item: 'socks' },
    { type: 'added', item: 'hat' },
    { type: 'removed', item: 'socks' },
    { type: 'checked-out' },
  ] as const;

  it('derives a cart view and an analytics view from the same events', () => {
    const last = eventLogFrames(events).at(-1)!;
    expect(last.views).toMatchObject({ cart: ['hat'], removed: ['socks'], status: 'checked out' });
  });

  it('replays the log into a brand-new view', () => {
    const frames = eventLogFrames(events, true);
    expect(frames.at(-1)?.views.popularity).toEqual({ socks: 1, hat: 1 });
    expect(frames.some((f) => f.replaying && f.applied === 0)).toBe(true);
  });
});

describe('eventTimeFrames', () => {
  it('shows a fake spike by processing time but steady traffic by event time', () => {
    const last = eventTimeFrames(6, 10, 3).at(-1)!;
    expect(last.byEventTime).toEqual([10, 10, 10, 10, 10, 10]);
    expect(last.byProcessingTime).toEqual([10, 10, 10, 0, 20, 10]);
  });
});

describe('effectFrames', () => {
  const correct = DEPOSITS.reduce((a, b) => a + b, 0);

  it('double-applies a redelivered deposit when the write is not idempotent', () => {
    expect(effectFrames('naive').at(-1)?.balance).toBe(correct + DEPOSITS[1]);
  });

  it('gets the right balance with idempotent writes or atomic commit', () => {
    const idempotent = effectFrames('idempotent');
    expect(idempotent.at(-1)?.balance).toBe(correct);
    expect(idempotent.some((f) => f.phase === 'skip')).toBe(true);
    const atomic = effectFrames('atomic');
    expect(atomic.at(-1)?.balance).toBe(correct);
    expect(atomic.find((f) => f.phase === 'crash')?.balance).toBe(DEPOSITS[0]);
  });
});

describe('windowFrames', () => {
  const finalWindows = (kind: WindowKind, policy: 'drop' | 'correct') => windowFrames(kind, policy).at(-1)!;

  it('formats event times as clock times', () => {
    expect(clock(5)).toBe('10:00:05');
    expect(clock(-60)).toBe('9:59:00');
  });

  it('puts each event in exactly one tumbling window and emits completed windows', () => {
    const last = finalWindows('tumbling', 'drop');
    expect(last.windows.map((w) => [w.start, w.events.length])).toEqual([
      [0, 3],
      [120, 2],
      [240, 1],
    ]);
    expect(last.dropped).toEqual(['e7']);
    expect(last.windows[0].emitted).toBe(true);
  });

  it('corrects an already-reported window when asked to', () => {
    const last = finalWindows('tumbling', 'correct');
    expect(last.windows[0]).toMatchObject({ events: ['e1', 'e2', 'e3', 'e7'], corrected: true });
    expect(last.dropped).toEqual([]);
  });

  it('places events in two overlapping hopping windows', () => {
    const last = finalWindows('hopping', 'drop');
    const e1Windows = last.windows.filter((w) => w.events.includes('e1'));
    expect(e1Windows.map((w) => [w.start, w.end])).toEqual([
      [-60, 60],
      [0, 120],
    ]);
  });

  it('groups sessions by inactivity gaps', () => {
    const last = finalWindows('session', 'correct');
    expect(last.windows.map((w) => w.events)).toEqual([['e1', 'e2', 'e3', 'e7'], ['e4', 'e5'], ['e6']]);
  });

  it('gives each sliding window the events of the two minutes before it', () => {
    const last = finalWindows('sliding', 'drop');
    const e4 = last.windows.find((w) => w.id === 'w-e4')!;
    expect(e4.events).toEqual(['e2', 'e3', 'e4']);
    expect(last.dropped).toEqual(['e7']);
  });
});

describe('joinFrames', () => {
  it('stream–stream: emits clicked joins and a not-clicked result on expiry', () => {
    const last = joinFrames('stream-stream').at(-1)!;
    expect(last.output).toHaveLength(3);
    expect(last.output[2]).toMatch(/no result clicked/);
  });

  it('stream–table: the interleaving changes the enrichment', () => {
    expect(joinFrames('stream-table', 'as-sent').at(-1)?.output[0]).toMatch(/Oslo/);
    expect(joinFrames('stream-table', 'update-first').at(-1)?.output[0]).toMatch(/Rome/);
  });

  it('table–table: timelines follow posts and follows', () => {
    const last = joinFrames('table-table').at(-1)!;
    const timelines = last.state.find((s) => s.label.startsWith('home'))!.rows;
    expect(timelines).toEqual(['ann: —', 'cy: p3']);
  });
});
