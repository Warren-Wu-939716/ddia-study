import { useMemo } from 'react';
import type { Concept } from '../content/types.ts';
import { layoutConcepts } from '../lib/conceptLayout.ts';

interface ConceptMapProps {
  concepts: readonly Concept[];
  mastery: ReadonlyMap<string, number>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

/** 0 → neutral grey, 1 → green. */
function masteryColor(value: number): string {
  const v = Math.max(0, Math.min(1, value));
  const hue = 210 - 70 * v;
  const saturation = 12 + 48 * v;
  const lightness = 94 - 30 * v;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

const PAD = 12;

export function ConceptMap({ concepts, mastery, selectedId, onSelect }: ConceptMapProps) {
  const layout = useMemo(() => layoutConcepts(concepts), [concepts]);
  const byId = new Map(layout.nodes.map((n) => [n.id, n]));
  const selected = selectedId ? concepts.find((c) => c.id === selectedId) : undefined;
  const related = new Set<string>(selected ? [selected.id, ...selected.prerequisites] : []);
  if (selected) for (const c of concepts) if (c.prerequisites.includes(selected.id)) related.add(c.id);

  return (
    <div className="concept-map" role="group" aria-label="Concept map">
      <svg
        viewBox={`${-PAD} ${-PAD} ${layout.width + PAD * 2} ${layout.height + PAD * 2}`}
        width={layout.width + PAD * 2}
        height={layout.height + PAD * 2}
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="arrow-head" />
          </marker>
        </defs>
        {layout.edges.map(({ from, to }) => {
          const a = byId.get(from);
          const b = byId.get(to);
          if (!a || !b) return null;
          const x1 = a.x + layout.nodeWidth / 2;
          const y1 = a.y + layout.nodeHeight;
          const x2 = b.x + layout.nodeWidth / 2;
          const y2 = b.y;
          const midY = (y1 + y2) / 2;
          const active = selected && (from === selected.id || to === selected.id);
          return (
            <path
              key={`${from}->${to}`}
              d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2 - 2}`}
              className={`edge ${active ? 'active' : ''} ${selected && !active ? 'faded' : ''}`}
              markerEnd="url(#arrow)"
            />
          );
        })}
        {layout.nodes.map((node) => {
          const value = mastery.get(node.id) ?? 0;
          const faded = selected && !related.has(node.id);
          return (
            <g
              key={node.id}
              transform={`translate(${node.x} ${node.y})`}
              className={`node ${node.id === selectedId ? 'selected' : ''} ${faded ? 'faded' : ''}`}
              role="button"
              tabIndex={0}
              aria-label={`${concepts.find((c) => c.id === node.id)?.name}, mastery ${Math.round(value * 100)}%`}
              aria-pressed={node.id === selectedId}
              onClick={() => onSelect(node.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(node.id);
                }
              }}
            >
              <rect width={layout.nodeWidth} height={layout.nodeHeight} rx={9} style={{ fill: masteryColor(value) }} />
              <text x={layout.nodeWidth / 2} y={layout.nodeHeight / 2 - (node.lines.length - 1) * 7.5} textAnchor="middle" dominantBaseline="middle">
                {node.lines.map((line, i) => (
                  <tspan key={i} x={layout.nodeWidth / 2} dy={i === 0 ? 0 : 15}>
                    {line}
                  </tspan>
                ))}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
