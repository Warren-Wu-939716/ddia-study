import type { BTreeState, Page } from './btree.ts';
import { treeModel, type TreeModel } from './btreeTrace.ts';

export interface PageBox {
  page: Page;
  x: number;
  y: number;
  /** Drawn width: room for maxKeys keys, or more while a page is overflowing. */
  width: number;
}

export interface TreeEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  childId: number;
  parentId: number;
  pending: boolean;
}

export interface TreeLayout {
  boxes: PageBox[];
  edges: TreeEdge[];
  width: number;
  height: number;
  /** Horizontal slot reserved per page (the widest page in this view). */
  pageWidth: number;
  pageHeight: number;
  cell: number;
  pad: number;
}

/**
 * Bottom row laid out left to right; each internal page is centred over its children.
 * Pages are drawn with room for maxKeys keys, because real pages are fixed-size.
 */
export function layoutTree(model: TreeModel, cell = 30, pad = 6, gap = 12, levelGap = 44, pageHeight = 30): TreeLayout {
  const rows = model.levels;
  const capacity = (page: Page) => Math.max(model.maxKeys, page.keys.length);
  const widest = Math.max(model.maxKeys, ...rows.flat().map((id) => model.pages[id].keys.length));
  const pageWidth = widest * cell + pad * 2;
  const positions = new Map<number, PageBox>();
  const rowY = (d: number) => d * (pageHeight + levelGap);
  const box = (page: Page, x: number, d: number): PageBox => ({ page, x, y: rowY(d), width: capacity(page) * cell + pad * 2 });

  const bottom = rows.length - 1;
  rows[bottom].forEach((id, i) => positions.set(id, box(model.pages[id], i * (pageWidth + gap), bottom)));
  for (let d = bottom - 1; d >= 0; d--) {
    rows[d].forEach((id, i) => {
      const page = model.pages[id];
      const kids = [...(page.type === 'internal' ? page.children : []), ...model.pending.filter((p) => p.from === id).map((p) => p.to)]
        .map((c) => positions.get(c))
        .filter((p): p is PageBox => p !== undefined);
      const x = kids.length ? (Math.min(...kids.map((k) => k.x)) + Math.max(...kids.map((k) => k.x))) / 2 : i * (pageWidth + gap);
      positions.set(id, box(page, x, d));
    });
  }

  const edges: TreeEdge[] = [];
  const link = (parent: PageBox, childId: number, x1: number, pending: boolean) => {
    const child = positions.get(childId);
    if (!child) return;
    edges.push({
      parentId: parent.page.id,
      childId,
      pending,
      x1,
      y1: parent.y + pageHeight,
      x2: child.x + child.width / 2,
      y2: child.y,
    });
  };
  for (const parent of positions.values()) {
    // Child i's pointer sits on the boundary just left of key i.
    if (parent.page.type === 'internal') parent.page.children.forEach((c, i) => link(parent, c, parent.x + pad + i * cell, false));
  }
  for (const { from, to } of model.pending) {
    const parent = positions.get(from);
    if (parent) link(parent, to, parent.x + parent.width - pad / 2, true);
  }

  return {
    boxes: [...positions.values()],
    edges,
    width: Math.max(pageWidth, rows[bottom].length * (pageWidth + gap) - gap),
    height: rows.length * pageHeight + (rows.length - 1) * levelGap,
    pageWidth,
    pageHeight,
    cell,
    pad,
  };
}

export function layoutBTree(state: BTreeState, cell?: number, pad?: number, gap?: number, levelGap?: number, pageHeight?: number): TreeLayout {
  return layoutTree(treeModel(state), cell, pad, gap, levelGap, pageHeight);
}
