/** Position and size relative to the animation root. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One tagged element (`data-flip`) as measured in a single state. */
export interface FlipItem {
  id: string;
  rect: Rect;
  text: string;
  /** Identity of the underlying DOM node, so a node React kept is always paired with itself. */
  key: unknown;
  /** Entering items fly in from the element with this id (`data-flip-from`). */
  from?: string;
  /** Leaving items fly towards the element with this id (`data-flip-to`). */
  to?: string;
  /** Containers (`data-flip-anchor`) can be flown from or to, but are never animated themselves. */
  anchor?: boolean;
}

export type FlipAction =
  | { type: 'move'; next: number; from: Rect }
  | { type: 'enter'; next: number; from?: Rect }
  | { type: 'exit'; prev: number; to?: Rect }
  | { type: 'pulse'; next: number };

const center = (r: Rect) => [r.x + r.w / 2, r.y + r.h / 2] as const;
const distance = (a: Rect, b: Rect) => {
  const [ax, ay] = center(a);
  const [bx, by] = center(b);
  return Math.hypot(ax - bx, ay - by);
};
const moved = (a: Rect, b: Rect) => Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) > 0.5 || Math.abs(a.w - b.w) > 0.5 || Math.abs(a.h - b.h) > 0.5;

function nearest(candidates: readonly FlipItem[], to: Rect): FlipItem | undefined {
  let best: FlipItem | undefined;
  for (const c of candidates) if (!best || distance(c.rect, to) < distance(best.rect, to)) best = c;
  return best;
}

function groupById(items: readonly FlipItem[]): Map<string, number[]> {
  const groups = new Map<string, number[]>();
  items.forEach((item, i) => groups.set(item.id, [...(groups.get(item.id) ?? []), i]));
  return groups;
}

/**
 * Decides how each element gets from the previous state to the next:
 * the same id moves; an extra copy of an id flies out of an existing one; ids that vanish
 * shrink into a surviving copy (or `data-flip-to`) or fade out; changed text pulses.
 */
export function planFlip(prevAll: readonly FlipItem[], nextAll: readonly FlipItem[]): FlipAction[] {
  const prev = prevAll.filter((i) => !i.anchor);
  const next = nextAll.filter((i) => !i.anchor);
  const pairOf = new Map<number, number>();
  const pairedPrev = new Set<number>();
  const prevById = groupById(prev);
  const nextById = groupById(next);
  const anchors = (items: readonly FlipItem[], id: string) => items.filter((i) => i.anchor && i.id === id);
  // Indexes in actions refer to the full input arrays, so map them back.
  const prevIndex = prev.map((item) => prevAll.indexOf(item));
  const nextIndex = next.map((item) => nextAll.indexOf(item));

  for (const [id, nextIdx] of nextById) {
    const prevIdx = prevById.get(id) ?? [];
    // A node React kept in place is the same element, whatever its neighbours did.
    for (const n of nextIdx) {
      const p = prevIdx.find((i) => !pairedPrev.has(i) && prev[i].key === next[n].key);
      if (p !== undefined) {
        pairOf.set(n, p);
        pairedPrev.add(p);
      }
    }
    const candidates = nextIdx
      .filter((n) => !pairOf.has(n))
      .flatMap((n) => prevIdx.filter((p) => !pairedPrev.has(p)).map((p) => ({ n, p, d: distance(prev[p].rect, next[n].rect) })))
      .sort((a, b) => a.d - b.d);
    for (const { n, p } of candidates) {
      if (pairOf.has(n) || pairedPrev.has(p)) continue;
      pairOf.set(n, p);
      pairedPrev.add(p);
    }
  }

  const actions: FlipAction[] = [];
  next.forEach((item, n) => {
    const p = pairOf.get(n);
    if (p !== undefined) {
      if (moved(prev[p].rect, item.rect)) actions.push({ type: 'move', next: nextIndex[n], from: prev[p].rect });
      if (prev[p].text !== item.text) actions.push({ type: 'pulse', next: nextIndex[n] });
      return;
    }
    const sourceId = item.from ?? item.id;
    const source =
      nearest((prevById.get(sourceId) ?? []).map((i) => prev[i]), item.rect) ??
      (item.from ? nearest([...(nextById.get(item.from) ?? []).map((i) => next[i]), ...anchors(prevAll, item.from), ...anchors(nextAll, item.from)], item.rect) : undefined);
    actions.push({ type: 'enter', next: nextIndex[n], from: source?.rect });
  });
  prev.forEach((item, p) => {
    if (pairedPrev.has(p)) return;
    const targetId = item.to ?? item.id;
    const target = nearest([...(nextById.get(targetId) ?? []).map((i) => next[i]), ...anchors(nextAll, targetId)], item.rect);
    actions.push({ type: 'exit', prev: prevIndex[p], to: target?.rect });
  });
  return actions;
}
