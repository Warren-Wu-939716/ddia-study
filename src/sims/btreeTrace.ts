import type { StepFrame } from '../lib/steps.ts';
import { childIndex, insertKey, levels, lookupKey, type BTreeState, type InternalPage, type LookupPath, type Page } from './btree.ts';

/**
 * What to draw: pages arranged in explicit levels. Unlike a BTreeState this can show
 * in-between moments, such as a freshly split page its parent doesn't point to yet.
 */
export interface TreeModel {
  pages: Readonly<Record<number, Page>>;
  levels: number[][];
  maxKeys: number;
  /** Edges drawn dashed: parent → child links that are about to be added. */
  pending: { from: number; to: number }[];
}

export interface BTreeFrame extends StepFrame {
  tree: TreeModel;
  /** Pages read so far in this operation. */
  read: number[];
  /** Pages changed in this step. */
  written: number[];
  /** Page currently holding more keys than fit. */
  overflow?: number;
}

export function treeModel(state: BTreeState): TreeModel {
  return { pages: state.pages, levels: levels(state).map((row) => row.map((p) => p.id)), maxKeys: state.maxKeys, pending: [] };
}

const keysText = (keys: readonly number[]) => `[${keys.join(', ')}]`;

/** Why a lookup for `key` follows child `i` of `page`. */
export function routeText(page: InternalPage, key: number, i: number): string {
  if (i === 0) return `${key} < ${page.keys[0]}`;
  if (i === page.keys.length) return `${key} ≥ ${page.keys[i - 1]}`;
  return `${page.keys[i - 1]} ≤ ${key} < ${page.keys[i]}`;
}

function insertAfter(rows: number[][], sibling: number, id: number): number[][] {
  return rows.map((row) => {
    const i = row.indexOf(sibling);
    return i === -1 ? row : [...row.slice(0, i + 1), id, ...row.slice(i + 1)];
  });
}

/** An insert, one page at a time: descend, add to the leaf, then split and push up as needed. */
export function traceInsert(state: BTreeState, key: number): { frames: BTreeFrame[]; final: BTreeState } {
  const final = insertKey(state, key);
  const frames: BTreeFrame[] = [];
  const base = treeModel(state);
  const path: number[] = [];

  let page = state.pages[state.rootId];
  for (;;) {
    path.push(page.id);
    if (page.type === 'leaf') break;
    const i = childIndex(page, key);
    frames.push({
      tree: base,
      read: [...path],
      written: [],
      caption: `Read ${page.id === state.rootId ? 'the root, ' : ''}page p${page.id} ${keysText(page.keys)}: ${routeText(page, key, i)} → follow the pointer to p${page.children[i]}.`,
    });
    page = state.pages[page.children[i]];
  }

  const leaf = page;
  if (leaf.keys.includes(key)) {
    frames.push({
      tree: base,
      read: [...path],
      written: [leaf.id],
      caption: `${key} is already in leaf p${leaf.id}. Updating its value still means overwriting the whole page — 1 page write.`,
    });
    return { frames, final };
  }

  const pages: Record<number, Page> = { ...state.pages };
  let rows = base.levels.map((r) => [...r]);
  const leafKeys = [...leaf.keys, key].sort((a, b) => a - b);
  pages[leaf.id] = { ...leaf, keys: leafKeys };
  const overflows = leafKeys.length > state.maxKeys;
  frames.push({
    tree: { ...base, pages: { ...pages } },
    read: [...path],
    written: [leaf.id],
    overflow: overflows ? leaf.id : undefined,
    caption: overflows
      ? `Read leaf p${leaf.id} and add ${key} in order → ${keysText(leafKeys)}. That's ${leafKeys.length} keys, but a page holds ${state.maxKeys}: it overflows and must split.`
      : `Read leaf p${leaf.id} and add ${key} in order → ${keysText(leafKeys)}. It fits, so only this one page is rewritten.`,
  });

  let nextId = state.nextId;
  let level = path.length - 1;
  let currentId = leaf.id;
  while (pages[currentId].keys.length > state.maxKeys) {
    const current = pages[currentId];
    const rightId = nextId++;
    const parentId = level > 0 ? path[level - 1] : null;
    let boundary: number;
    let caption: string;
    if (current.type === 'leaf') {
      const mid = Math.ceil(current.keys.length / 2);
      boundary = current.keys[mid];
      pages[currentId] = { ...current, keys: current.keys.slice(0, mid) };
      pages[rightId] = { id: rightId, type: 'leaf', keys: current.keys.slice(mid) };
      caption = `Split p${currentId} into two half-full pages: it keeps ${keysText(current.keys.slice(0, mid))} and new page p${rightId} takes ${keysText(current.keys.slice(mid))}.`;
    } else {
      const mid = Math.floor(current.keys.length / 2);
      boundary = current.keys[mid];
      pages[currentId] = { ...current, keys: current.keys.slice(0, mid), children: current.children.slice(0, mid + 1) };
      pages[rightId] = { id: rightId, type: 'internal', keys: current.keys.slice(mid + 1), children: current.children.slice(mid + 1) };
      caption = `Split p${currentId}: it keeps ${keysText(current.keys.slice(0, mid))}, new page p${rightId} takes ${keysText(current.keys.slice(mid + 1))} with their children, and the middle key ${boundary} moves up — it stays in neither half.`;
    }
    rows = insertAfter(rows, currentId, rightId);
    frames.push({
      tree: { pages: { ...pages }, levels: rows.map((r) => [...r]), maxKeys: state.maxKeys, pending: parentId === null ? [] : [{ from: parentId, to: rightId }] },
      read: [...path],
      written: [currentId, rightId],
      caption: parentId === null ? caption : `${caption} The parent doesn't know about p${rightId} yet (dashed line).`,
    });

    if (parentId === null) {
      const rootId = nextId++;
      pages[rootId] = { id: rootId, type: 'internal', keys: [boundary], children: [currentId, rightId] };
      rows = [[rootId], ...rows];
      frames.push({
        tree: { pages: { ...pages }, levels: rows.map((r) => [...r]), maxKeys: state.maxKeys, pending: [] },
        read: [...path],
        written: [rootId],
        caption: `p${currentId} was the root, so create a new root p${rootId} holding ${boundary}, pointing to p${currentId} and p${rightId}. The tree grows one level — at the top, so every leaf stays at the same depth.`,
      });
      break;
    }

    const parent = pages[parentId] as InternalPage;
    const at = parent.children.indexOf(currentId);
    const keys = [...parent.keys];
    const children = [...parent.children];
    keys.splice(at, 0, boundary);
    children.splice(at + 1, 0, rightId);
    pages[parentId] = { ...parent, keys, children };
    const parentOverflows = keys.length > state.maxKeys;
    frames.push({
      tree: { pages: { ...pages }, levels: rows.map((r) => [...r]), maxKeys: state.maxKeys, pending: [] },
      read: [...path],
      written: [parentId],
      overflow: parentOverflows ? parentId : undefined,
      caption: `Add boundary ${boundary} and a pointer to p${rightId} to parent p${parentId} → ${keysText(keys)}.${
        parentOverflows ? ` Now the parent has ${keys.length} keys — it overflows too, so the split continues upward.` : ' It fits, so the split stops here.'
      }`,
    });
    currentId = parentId;
    level--;
  }

  const report = final.lastInsert;
  if (report && report.splits > 0) {
    frames.push({
      tree: treeModel(final),
      read: [],
      written: report.touched,
      caption: `Done: ${report.touched.length} pages written for one insert (${report.splits} split${report.splits > 1 ? 's' : ''}). A real database writes all of them to the WAL first, so a crash can't leave the tree half-split.`,
    });
  }
  return { frames, final };
}

/** A lookup, one page read per level. */
export function traceFind(state: BTreeState, key: number): { frames: BTreeFrame[]; result: LookupPath } {
  const result = lookupKey(state, key);
  const tree = treeModel(state);
  const frames = result.path.map((id, i): BTreeFrame => {
    const page = state.pages[id];
    const read = result.path.slice(0, i + 1);
    if (page.type === 'internal') {
      const c = childIndex(page, key);
      return {
        tree,
        read,
        written: [],
        caption: `Read ${i === 0 ? 'the root, ' : ''}page p${id} ${keysText(page.keys)}: ${routeText(page, key, c)} → follow the pointer to p${page.children[c]}.`,
      };
    }
    const n = result.path.length;
    return {
      tree,
      read,
      written: [],
      caption: `Read leaf p${id} ${keysText(page.keys)}: ${result.found ? `${key} is here.` : `${key} isn't here, so it isn't in the tree.`} That took ${n} page read${n === 1 ? '' : 's'} — one per level.`,
    };
  });
  return { frames, result };
}
