import { describe, expect, it } from 'vitest';
import {
  addConsumer,
  addGroup,
  crash,
  createBroker,
  drain,
  duplicateCount,
  getGroup,
  idleConsumers,
  keyProcessedInOrder,
  lag,
  partitionFor,
  poll,
  produce,
  resetOffsets,
  restart,
  tick,
  type BrokerState,
} from './broker.ts';
import { traceAddConsumer, traceCrash, traceProduce, traceTick } from './brokerTrace.ts';

const keys = ['user:1', 'user:2', 'user:3', 'user:4', 'user:5', 'user:6'];
const fill = (state: BrokerState, count: number) =>
  Array.from({ length: count }, (_, i) => keys[i % keys.length]).reduce((s, k, i) => produce(s, k, `v${i}`), state);

describe('broker log', () => {
  it('routes a key to the same partition every time and numbers offsets per partition', () => {
    const state = fill(createBroker({ partitions: 3, retention: 100, commitEvery: 1 }), 12);
    for (const p of state.partitions) {
      expect(p.messages.map((m) => m.offset)).toEqual(p.messages.map((_, i) => i));
      for (const m of p.messages) expect(partitionFor(m.key, 3)).toBe(p.id);
    }
    expect(state.partitions.reduce((n, p) => n + p.endOffset, 0)).toBe(12);
  });

  it('retention deletes the oldest messages and a lagging group skips them', () => {
    let state = createBroker({ partitions: 1, retention: 3, commitEvery: 1 });
    state = addGroup(state, 'g', 1);
    state = fill(state, 5);
    expect(state.partitions[0].startOffset).toBe(2);
    const result = poll(state, 'g', 'c1');
    expect(result.skipped).toBe(2);
    expect(result.delivery?.offset).toBe(2);
    expect(getGroup(result.state, 'g').missed).toBe(2);
  });
});

describe('consumer groups', () => {
  it('shares partitions within a group; extra consumers are idle', () => {
    const state = addGroup(createBroker({ partitions: 2, retention: 10, commitEvery: 1 }), 'g', 3);
    expect(idleConsumers(getGroup(state, 'g'))).toEqual(['c3']);
    expect(getGroup(addConsumer(state, 'g'), 'g').consumers).toHaveLength(4);
  });

  it('delivers every message to every group (fan-out)', () => {
    let state = fill(createBroker({ partitions: 2, retention: 50, commitEvery: 1 }), 10);
    state = addGroup(addGroup(state, 'a', 2), 'b', 1);
    state = drain(drain(state, 'a'), 'b');
    expect(getGroup(state, 'a').deliveries).toHaveLength(10);
    expect(getGroup(state, 'b').deliveries).toHaveLength(10);
  });

  it('redoes uncommitted work after a crash (at-least-once)', () => {
    let state = createBroker({ partitions: 1, retention: 50, commitEvery: 3 });
    state = addGroup(fill(state, 6), 'g', 2);
    const owner = getGroup(state, 'g').consumers.find((c) => c.partitions.includes(0))!.id;
    for (let i = 0; i < 5; i++) state = poll(state, 'g', owner).state;
    expect(getGroup(state, 'g').committed[0]).toBe(3);
    state = crash(state, 'g', owner);
    expect(getGroup(state, 'g').consumers.find((c) => c.alive)!.positions[0]).toBe(3);
    state = drain(state, 'g');
    expect(duplicateCount(getGroup(state, 'g'))).toBe(2);
    expect(lag(state, 'g', 'position')).toBe(0);
  });

  it('keeps per-key order, and replay re-reads everything retained', () => {
    let state = addGroup(fill(createBroker({ partitions: 3, retention: 50, commitEvery: 2 }), 18), 'g', 2);
    state = drain(state, 'g');
    for (const k of keys) expect(keyProcessedInOrder(getGroup(state, 'g'), k)).toBe(true);
    state = drain(resetOffsets(state, 'g', 'earliest'), 'g');
    expect(duplicateCount(getGroup(state, 'g'))).toBe(18);
    expect(lag(resetOffsets(state, 'g', 'latest'), 'g')).toBe(0);
  });

  it('a restarted consumer rejoins and gets partitions back', () => {
    let state = addGroup(createBroker({ partitions: 2, retention: 10, commitEvery: 1 }), 'g', 2);
    state = crash(state, 'g', 'c2');
    expect(getGroup(state, 'g').consumers[0].partitions).toEqual([0, 1]);
    state = restart(state, 'g', 'c2');
    expect(getGroup(state, 'g').consumers[1].partitions).toEqual([1]);
    expect(tick(state, 'g')).toBeTruthy();
  });
});

describe('broker traces', () => {
  it('shows routing, append and retention as separate steps', () => {
    const state = fill(createBroker({ partitions: 1, retention: 2, commitEvery: 1 }), 2);
    const { frames, final } = traceProduce(state, 'user:1', 'x');
    expect(frames.map((f) => f.focus?.kind)).toEqual(['route', 'append', 'delete']);
    expect(frames.at(-1)?.state).toBe(final);
  });

  it('marks duplicates and commits while ticking', () => {
    let state = addGroup(fill(createBroker({ partitions: 1, retention: 50, commitEvery: 2 }), 4), 'g', 1);
    const first = traceTick(state, 'g');
    expect(first.frames[0].focus?.kind).toBe('read');
    state = traceTick(first.final, 'g').final;
    expect(traceTick(state, 'g').frames.length).toBeGreaterThan(0);
    const crashed = traceCrash(poll(state, 'g', 'c1').state, 'g', 'c1');
    expect(crashed.frames[0].caption).toMatch(/crashes/);
  });

  it('explains duplicates after a crash and idle consumers after scaling out', () => {
    let state = addGroup(fill(createBroker({ partitions: 1, retention: 50, commitEvery: 3 }), 6), 'g', 2);
    const owner = getGroup(state, 'g').consumers.find((c) => c.partitions.length)!.id;
    state = poll(poll(state, 'g', owner).state, 'g', owner).state;
    expect(traceCrash(state, 'g', owner).frames.at(-1)?.caption).toMatch(/2 messages will be processed again/);
    expect(traceAddConsumer(state, 'g').frames.at(-1)?.caption).toMatch(/idle/);
  });
});
