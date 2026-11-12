import { describe, expect, it } from 'vitest';
import { planFlip, type FlipItem } from './flipPlan.ts';

const item = (id: string, x: number, y = 0, extra: Partial<FlipItem> = {}): FlipItem => ({
  id,
  rect: { x, y, w: 10, h: 10 },
  text: id,
  key: {},
  ...extra,
});

describe('planFlip', () => {
  it('moves an element that changed position and leaves a still one alone', () => {
    const prev = [item('a', 0), item('b', 20)];
    const next = [item('a', 0), item('b', 100, 50)];
    expect(planFlip(prev, next)).toEqual([{ type: 'move', next: 1, from: prev[1].rect }]);
  });

  it('treats a new copy of an existing id as flying out of it, and a brand-new id as appearing', () => {
    const prev = [item('m1', 0)];
    const next = [item('m1', 0), item('m1', 200), item('m2', 300)];
    expect(planFlip(prev, next)).toEqual([
      { type: 'enter', next: 1, from: prev[0].rect },
      { type: 'enter', next: 2, from: undefined },
    ]);
  });

  it('pairs duplicate ids with the nearest previous copies', () => {
    const prev = [item('x', 0), item('x', 100)];
    const next = [item('x', 110), item('x', 5)];
    const plan = planFlip(prev, next);
    expect(plan).toContainEqual({ type: 'move', next: 0, from: prev[1].rect });
    expect(plan).toContainEqual({ type: 'move', next: 1, from: prev[0].rect });
  });

  it('keeps the same DOM node paired with itself even if another copy is closer', () => {
    const key = {};
    const prev = [item('x', 0), item('x', 100, 0, { key })];
    const next = [item('x', 5, 0, { key })];
    const plan = planFlip(prev, next);
    expect(plan).toContainEqual({ type: 'move', next: 0, from: prev[1].rect });
    expect(plan).toContainEqual({ type: 'exit', prev: 0, to: next[0].rect });
  });

  it('uses data-flip-from / data-flip-to to route entering and leaving elements', () => {
    const prev = [item('producer', 0), item('old', 50, 0, { to: 'archive' })];
    const next = [item('producer', 0), item('msg', 200, 0, { from: 'producer' }), item('archive', 400)];
    const plan = planFlip(prev, next);
    expect(plan).toContainEqual({ type: 'enter', next: 1, from: prev[0].rect });
    expect(plan).toContainEqual({ type: 'exit', prev: 1, to: next[2].rect });
  });

  it('can fly from an element that only exists in the new state', () => {
    const next = [item('memtable', 0), item('k', 100, 0, { from: 'memtable' })];
    expect(planFlip([], next)).toContainEqual({ type: 'enter', next: 1, from: next[0].rect });
  });

  it('flies to and from anchors without ever animating them', () => {
    const box = (x: number) => item('consumer', x, 0, { anchor: true, text: '' });
    const prev = [box(300), item('m1', 0, 0, { to: 'consumer' })];
    const next = [box(310), item('m2', 50, 0, { from: 'consumer' })];
    expect(planFlip(prev, next)).toEqual([
      { type: 'enter', next: 1, from: prev[0].rect },
      { type: 'exit', prev: 1, to: next[0].rect },
    ]);
  });

  it('pulses an element whose text changed and fades out one that vanished', () => {
    const prev = [item('count', 0, 0, { text: '3' }), item('gone', 40)];
    const next = [item('count', 0, 0, { text: '4' })];
    expect(planFlip(prev, next)).toEqual([
      { type: 'pulse', next: 0 },
      { type: 'exit', prev: 1, to: undefined },
    ]);
  });
});
