import type { Concept } from '../content/types.ts';

export interface PositionedConcept {
  id: string;
  depth: number;
  x: number;
  y: number;
  lines: string[];
}

export interface ConceptLayout {
  nodes: PositionedConcept[];
  edges: { from: string; to: string }[];
  width: number;
  height: number;
  nodeWidth: number;
  nodeHeight: number;
}

export interface LayoutOptions {
  nodeWidth?: number;
  nodeHeight?: number;
  gapX?: number;
  gapY?: number;
  maxLineChars?: number;
}

/** Longest prerequisite chain above each concept; throws on cycles. Unknown prerequisites are ignored. */
export function conceptDepths(concepts: readonly Concept[]): Map<string, number> {
  const byId = new Map(concepts.map((c) => [c.id, c]));
  const depths = new Map<string, number>();
  const visiting = new Set<string>();
  const visit = (id: string): number => {
    const known = depths.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) throw new Error(`Prerequisite cycle involving "${id}"`);
    visiting.add(id);
    const prereqs = (byId.get(id)?.prerequisites ?? []).filter((p) => byId.has(p));
    const depth = prereqs.length === 0 ? 0 : 1 + Math.max(...prereqs.map(visit));
    visiting.delete(id);
    depths.set(id, depth);
    return depth;
  };
  concepts.forEach((c) => visit(c.id));
  return depths;
}

/** Greedy word wrap into at most `maxLines` lines. */
export function wrapLabel(text: string, maxChars: number, maxLines = 2): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    if (current && (current + ' ' + word).length > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]}…`;
    return kept;
  }
  return lines;
}

/**
 * Top-down layered layout: rows by prerequisite depth, ordered within a row by the
 * average position of each node's prerequisites (barycenter heuristic) to reduce crossings.
 */
export function layoutConcepts(concepts: readonly Concept[], options: LayoutOptions = {}): ConceptLayout {
  const { nodeWidth = 150, nodeHeight = 46, gapX = 14, gapY = 34, maxLineChars = 19 } = options;
  const depths = conceptDepths(concepts);
  const ids = new Set(concepts.map((c) => c.id));
  const maxDepth = Math.max(0, ...depths.values());
  const rows: Concept[][] = Array.from({ length: maxDepth + 1 }, () => []);
  concepts.forEach((c) => rows[depths.get(c.id) ?? 0].push(c));

  const order = new Map<string, number>();
  rows[0].forEach((c, i) => order.set(c.id, i - (rows[0].length - 1) / 2));
  for (let d = 1; d <= maxDepth; d++) {
    const scored = rows[d].map((c, i) => {
      const prereqs = c.prerequisites.filter((p) => ids.has(p));
      const center = prereqs.reduce((sum, p) => sum + (order.get(p) ?? 0), 0) / Math.max(1, prereqs.length);
      return { c, center, i };
    });
    scored.sort((a, b) => a.center - b.center || a.i - b.i);
    rows[d] = scored.map((s) => s.c);
    rows[d].forEach((c, i) => order.set(c.id, i - (rows[d].length - 1) / 2));
  }

  const widest = Math.max(...rows.map((r) => r.length));
  const width = widest * nodeWidth + (widest - 1) * gapX;
  const nodes: PositionedConcept[] = rows.flatMap((row, depth) => {
    const rowWidth = row.length * nodeWidth + (row.length - 1) * gapX;
    const offset = (width - rowWidth) / 2;
    return row.map((c, i) => ({
      id: c.id,
      depth,
      x: offset + i * (nodeWidth + gapX),
      y: depth * (nodeHeight + gapY),
      lines: wrapLabel(c.name, maxLineChars),
    }));
  });
  const edges = concepts.flatMap((c) => c.prerequisites.filter((p) => ids.has(p)).map((p) => ({ from: p, to: c.id })));
  return { nodes, edges, width, height: (maxDepth + 1) * nodeHeight + maxDepth * gapY, nodeWidth, nodeHeight };
}
