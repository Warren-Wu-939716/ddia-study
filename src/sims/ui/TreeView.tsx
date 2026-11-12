import { useMemo } from 'react';
import { layoutTree } from '../btreeLayout.ts';
import type { TreeModel } from '../btreeTrace.ts';

const PAD = 10;

interface TreeViewProps {
  tree: TreeModel;
  read?: readonly number[];
  written?: readonly number[];
  overflow?: number;
  maxWidth?: number;
}

/** SVG B-tree: pages read in blue, pages written in orange, an overflowing page in red, pending links dashed. */
export function TreeView({ tree, read = [], written = [], overflow, maxWidth = 960 }: TreeViewProps) {
  const layout = useMemo(() => layoutTree(tree), [tree]);
  const readSet = new Set(read);
  const writtenSet = new Set(written);
  return (
    <div className="tree-view">
      <svg
        viewBox={`${-PAD} ${-PAD} ${layout.width + PAD * 2} ${layout.height + PAD * 2}`}
        width={layout.width + PAD * 2}
        height={layout.height + PAD * 2}
        // Big trees scroll sideways rather than shrinking keys to an unreadable size.
        style={{ minWidth: Math.min(layout.width + PAD * 2, maxWidth) }}
        role="img"
        aria-label={`B-tree with ${tree.levels.length} levels and ${tree.levels.flat().length} pages`}
      >
        {layout.edges.map((e) => (
          <line
            key={`${e.parentId}-${e.childId}`}
            x1={e.x1}
            y1={e.y1}
            x2={e.x2}
            y2={e.y2}
            className={`tree-edge ${readSet.has(e.parentId) && readSet.has(e.childId) ? 'read' : ''} ${e.pending ? 'pending' : ''}`}
          />
        ))}
        {layout.boxes.map(({ page, x, y, width }) => {
          const cells = Math.max(tree.maxKeys, page.keys.length);
          return (
            <g
              key={page.id}
              transform={`translate(${x} ${y})`}
              className={`page ${page.type} ${writtenSet.has(page.id) ? 'written' : readSet.has(page.id) ? 'read' : ''} ${overflow === page.id ? 'overflow' : ''}`}
            >
              <rect width={width} height={layout.pageHeight} rx={5} />
              {Array.from({ length: cells }, (_, i) => (
                <g key={i} transform={`translate(${layout.pad + i * layout.cell} 0)`} className={i >= tree.maxKeys ? 'extra' : ''}>
                  {i > 0 && <line x1={0} y1={5} x2={0} y2={layout.pageHeight - 5} className="cell-sep" />}
                  <text x={layout.cell / 2} y={layout.pageHeight / 2} textAnchor="middle" dominantBaseline="central">
                    {page.keys[i] ?? ''}
                  </text>
                </g>
              ))}
              <text x={width - 3} y={-4} textAnchor="end" className="page-id">
                p{page.id}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
