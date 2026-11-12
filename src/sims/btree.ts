/**
 * B+-tree of integer keys over fixed-size "pages". Pages are immutable objects in a
 * map so every insert yields a new state (React-friendly) and we can report exactly
 * which pages an insert had to overwrite.
 */

export interface LeafPage {
  id: number;
  type: 'leaf';
  keys: number[];
}

export interface InternalPage {
  id: number;
  type: 'internal';
  /** Boundary keys; child i holds keys < keys[i], child i+1 holds keys ≥ keys[i]. */
  keys: number[];
  children: number[];
}

export type Page = LeafPage | InternalPage;

export interface BTreeStats {
  inserts: number;
  pageWrites: number;
  walRecords: number;
  splits: number;
}

export interface InsertReport {
  key: number;
  /** Pages overwritten or created by this insert. */
  touched: number[];
  splits: number;
  duplicate: boolean;
}

export interface BTreeState {
  maxKeys: number;
  rootId: number;
  pages: Readonly<Record<number, Page>>;
  nextId: number;
  stats: BTreeStats;
  lastInsert: InsertReport | null;
}

export function createBTree(maxKeys = 3): BTreeState {
  if (!Number.isInteger(maxKeys) || maxKeys < 2) throw new RangeError('A page must hold at least two keys');
  return {
    maxKeys,
    rootId: 1,
    pages: { 1: { id: 1, type: 'leaf', keys: [] } },
    nextId: 2,
    stats: { inserts: 0, pageWrites: 0, walRecords: 0, splits: 0 },
    lastInsert: null,
  };
}

/** Index of the child whose key range contains `key`. */
export function childIndex(page: InternalPage, key: number): number {
  let i = 0;
  while (i < page.keys.length && key >= page.keys[i]) i++;
  return i;
}

interface Split {
  boundary: number;
  rightId: number;
}

interface Context {
  pages: Record<number, Page>;
  nextId: number;
  maxKeys: number;
  touched: Set<number>;
  splits: number;
  duplicate: boolean;
}

function insertInto(ctx: Context, pageId: number, key: number): Split | null {
  const page = ctx.pages[pageId];
  if (page.type === 'leaf') {
    if (page.keys.includes(key)) {
      // Updating an existing key still overwrites the whole page.
      ctx.duplicate = true;
      ctx.touched.add(page.id);
      return null;
    }
    const keys = [...page.keys, key].sort((a, b) => a - b);
    if (keys.length <= ctx.maxKeys) {
      ctx.pages[page.id] = { ...page, keys };
      ctx.touched.add(page.id);
      return null;
    }
    const mid = Math.ceil(keys.length / 2);
    const rightId = ctx.nextId++;
    ctx.pages[page.id] = { ...page, keys: keys.slice(0, mid) };
    ctx.pages[rightId] = { id: rightId, type: 'leaf', keys: keys.slice(mid) };
    ctx.touched.add(page.id).add(rightId);
    ctx.splits++;
    return { boundary: keys[mid], rightId };
  }

  const index = childIndex(page, key);
  const split = insertInto(ctx, page.children[index], key);
  if (!split) return null;
  const keys = [...page.keys];
  const children = [...page.children];
  keys.splice(index, 0, split.boundary);
  children.splice(index + 1, 0, split.rightId);
  ctx.touched.add(page.id);
  if (keys.length <= ctx.maxKeys) {
    ctx.pages[page.id] = { ...page, keys, children };
    return null;
  }
  // The middle boundary moves up to the parent; it doesn't stay in either half.
  const mid = Math.floor(keys.length / 2);
  const rightId = ctx.nextId++;
  ctx.pages[page.id] = { ...page, keys: keys.slice(0, mid), children: children.slice(0, mid + 1) };
  ctx.pages[rightId] = { id: rightId, type: 'internal', keys: keys.slice(mid + 1), children: children.slice(mid + 1) };
  ctx.touched.add(rightId);
  ctx.splits++;
  return { boundary: keys[mid], rightId };
}

/** Inserts a key. Overflowing pages split in two; splits can cascade up and grow a new root. */
export function insertKey(state: BTreeState, key: number): BTreeState {
  const ctx: Context = {
    pages: { ...state.pages },
    nextId: state.nextId,
    maxKeys: state.maxKeys,
    touched: new Set(),
    splits: 0,
    duplicate: false,
  };
  let rootId = state.rootId;
  const split = insertInto(ctx, rootId, key);
  if (split) {
    const newRootId = ctx.nextId++;
    ctx.pages[newRootId] = { id: newRootId, type: 'internal', keys: [split.boundary], children: [rootId, split.rightId] };
    ctx.touched.add(newRootId);
    rootId = newRootId;
  }
  const touched = [...ctx.touched];
  return {
    ...state,
    rootId,
    pages: ctx.pages,
    nextId: ctx.nextId,
    stats: {
      inserts: state.stats.inserts + 1,
      pageWrites: state.stats.pageWrites + touched.length,
      // Each change is appended to the write-ahead log before any page is overwritten.
      walRecords: state.stats.walRecords + 1,
      splits: state.stats.splits + ctx.splits,
    },
    lastInsert: { key, touched, splits: ctx.splits, duplicate: ctx.duplicate },
  };
}

export function insertMany(state: BTreeState, keys: readonly number[]): BTreeState {
  return keys.reduce(insertKey, state);
}

export interface LookupPath {
  found: boolean;
  /** Page ids visited from root to leaf; its length is the number of page reads. */
  path: number[];
}

export function lookupKey(state: BTreeState, key: number): LookupPath {
  const path: number[] = [];
  let page = state.pages[state.rootId];
  for (;;) {
    path.push(page.id);
    if (page.type === 'leaf') return { found: page.keys.includes(key), path };
    page = state.pages[page.children[childIndex(page, key)]];
  }
}

/** Pages grouped by depth, root first, left to right. */
export function levels(state: BTreeState): Page[][] {
  const out: Page[][] = [];
  let current: Page[] = [state.pages[state.rootId]];
  while (current.length > 0) {
    out.push(current);
    current = current.flatMap((p) => (p.type === 'internal' ? p.children.map((c) => state.pages[c]) : []));
  }
  return out;
}

export function depth(state: BTreeState): number {
  return levels(state).length;
}

export function pageCount(state: BTreeState): number {
  return Object.keys(state.pages).length;
}

/** All keys in order by walking leaves left to right. */
export function inOrderKeys(state: BTreeState): number[] {
  const all = levels(state);
  return all[all.length - 1].flatMap((p) => p.keys);
}

/** Back-of-envelope capacity: branchingFactor^levels pages of pageBytes each. */
export function capacityBytes(branchingFactor: number, levelCount: number, pageBytes: number): number {
  return branchingFactor ** levelCount * pageBytes;
}
