import { describe, expect, it } from 'vitest';
import type { Concept } from '../content/types.ts';
import { conceptDepths, layoutConcepts, wrapLabel } from './conceptLayout.ts';

const c = (id: string, prerequisites: string[] = []): Concept => ({ id, name: id, sectionId: 's', summary: '', prerequisites });

describe('conceptDepths', () => {
  it('uses the longest prerequisite chain and ignores unknown ids', () => {
    const depths = conceptDepths([c('a'), c('b', ['a']), c('c', ['a', 'b']), c('d', ['missing'])]);
    expect(Object.fromEntries(depths)).toEqual({ a: 0, b: 1, c: 2, d: 0 });
  });

  it('throws on cycles', () => {
    expect(() => conceptDepths([c('a', ['b']), c('b', ['a'])])).toThrow(/cycle/);
  });
});

describe('wrapLabel', () => {
  it('wraps on word boundaries and truncates extra lines', () => {
    expect(wrapLabel('Sort order in column stores', 15)).toEqual(['Sort order in', 'column stores']);
    expect(wrapLabel('one two three four five six', 7, 2)).toEqual(['one two', 'three…']);
  });
});

describe('layoutConcepts', () => {
  it('places each depth on its own row without overlapping nodes', () => {
    const layout = layoutConcepts([c('a'), c('b', ['a']), c('c', ['a']), c('d', ['b', 'c'])], { nodeWidth: 100, gapX: 10 });
    const byId = new Map(layout.nodes.map((n) => [n.id, n]));
    expect(byId.get('a')?.depth).toBe(0);
    expect(byId.get('d')?.depth).toBe(2);
    expect(byId.get('b')?.y).toBe(byId.get('c')?.y);
    expect(Math.abs((byId.get('b')?.x ?? 0) - (byId.get('c')?.x ?? 0))).toBeGreaterThanOrEqual(110);
    expect(layout.edges).toHaveLength(4);
    expect(layout.width).toBe(210);
  });
});
