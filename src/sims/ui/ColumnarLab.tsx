import { useMemo, useState } from 'react';
import { ChallengeList } from '../../components/ChallengeList.tsx';
import type { Challenge } from '../challenges.ts';
import {
  columnValues,
  distinctValues,
  evaluateFilter,
  formatBytes,
  generateSales,
  runLengthEncode,
  SALES_COLUMNS,
  scanBytes,
  sortRows,
  type SalesColumn,
} from '../columnar.ts';
import { Bits } from './Bits.tsx';

const SALES = generateSales();
const PRODUCTS = distinctValues(columnValues(SALES, 'product_sk'));
const STORES = distinctValues(columnValues(SALES, 'store_sk'));
const ROW_OPTIONS: [number, string][] = [
  [1e6, '1 million'],
  [1e8, '100 million'],
  [1e9, '1 billion'],
  [1e10, '10 billion'],
];

export function ColumnarLab() {
  const [rows, setRows] = useState(1e9);
  const [totalColumns, setTotalColumns] = useState(100);
  const [columnsUsed, setColumnsUsed] = useState(3);
  const [sortKeys, setSortKeys] = useState<SalesColumn[]>([]);
  const [products, setProducts] = useState<number[]>([31, 68]);
  const [store, setStore] = useState<number | null>(null);

  const bytes = scanBytes({ rows, totalColumns, columnsUsed: Math.min(columnsUsed, totalColumns), bytesPerValue: 8 });
  const sorted = useMemo(() => sortRows(SALES, sortKeys), [sortKeys]);
  const runsPerColumn = useMemo(
    () => Object.fromEntries(SALES_COLUMNS.map((c) => [c, runLengthEncode(columnValues(sorted, c))])) as Record<SalesColumn, ReturnType<typeof runLengthEncode>>,
    [sorted],
  );
  const evaluation = useMemo(() => evaluateFilter(sorted, products, store), [sorted, products, store]);

  const setSortKey = (position: 0 | 1, value: string) => {
    const next = [...sortKeys];
    if (value === '') next.splice(position);
    else next[position] = value as SalesColumn;
    setSortKeys(next.filter((k, i) => k && next.indexOf(k) === i));
  };

  const runChallenge = async (challenge: Challenge) => {
    if (challenge.id === 'columnar.bytes-read') {
      setRows(1e9);
      setTotalColumns(100);
      setColumnsUsed(3);
    } else if (challenge.id === 'columnar.first-sort-key') {
      setSortKeys(['date_key', 'product_sk']);
    } else if (challenge.id === 'columnar.bitmap-or') {
      setProducts([31, 68, 69]);
      setStore(null);
    }
  };

  return (
    <div className="lab">
      <div className="lab-main">
        <section className="panel">
          <h4>1 · Bytes scanned by a query</h4>
          <div className="toolbar">
            <label>
              rows
              <select value={rows} onChange={(e) => setRows(Number(e.target.value))}>
                {ROW_OPTIONS.map(([n, label]) => (
                  <option key={n} value={n}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              columns in table
              <input type="range" min={10} max={300} step={10} value={totalColumns} onChange={(e) => setTotalColumns(Number(e.target.value))} />
              <span className="mono">{totalColumns}</span>
            </label>
            <label>
              columns used
              <input type="range" min={1} max={20} value={columnsUsed} onChange={(e) => setColumnsUsed(Number(e.target.value))} />
              <span className="mono">{columnsUsed}</span>
            </label>
          </div>
          <div className="bars">
            <div className="bar-row">
              <span>Row store</span>
              <span className="bar" style={{ width: '100%' }} />
              <span className="mono">{formatBytes(bytes.row)}</span>
            </div>
            <div className="bar-row">
              <span>Column store</span>
              <span className="bar column" style={{ width: `${Math.max(0.5, (bytes.column / bytes.row) * 100)}%` }} />
              <span className="mono">{formatBytes(bytes.column)}</span>
            </div>
          </div>
          <p className="muted small">
            {(bytes.row / bytes.column).toFixed(1)}× less data, before compression. 8 bytes per value.
          </p>
        </section>

        <section className="panel">
          <h4>2 · Sort order and run-length encoding</h4>
          <div className="toolbar">
            {[0, 1].map((position) => (
              <label key={position}>
                {position === 0 ? 'first sort key' : 'then by'}
                <select
                  value={sortKeys[position] ?? ''}
                  onChange={(e) => setSortKey(position as 0 | 1, e.target.value)}
                  disabled={position === 1 && sortKeys.length === 0}
                >
                  <option value="">{position === 0 ? 'insertion order' : '—'}</option>
                  {SALES_COLUMNS.filter((c) => position === 0 || c !== sortKeys[0]).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="columns-view">
            {SALES_COLUMNS.map((column) => {
              const runs = runsPerColumn[column];
              return (
                <div key={column} className={`column-file ${sortKeys[0] === column ? 'primary-sort' : ''}`}>
                  <div className="column-head">
                    <span className="mono">{column}</span>
                    <span className="small muted">{runs.length} runs</span>
                  </div>
                  <ol>
                    {runs.flatMap((run, r) =>
                      Array.from({ length: run.length }, (_, i) => (
                        <li key={`${r}-${i}`} className={`${r % 2 ? 'alt' : ''} ${i === 0 ? 'run-start' : ''}`}>
                          {run.value}
                        </li>
                      )),
                    )}
                  </ol>
                  <p className="mono small rle" title="run-length encoding">
                    {runs.map((r) => `${r.value}×${r.length}`).join(' ')}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="muted small">
            Whole rows move together, so position k in every column is still the same row. Fewer runs = better compression.
          </p>
        </section>

        <section className="panel">
          <h4>3 · Bitmap filter evaluation</h4>
          <div className="toolbar">
            <span>product_sk IN</span>
            {PRODUCTS.map((p) => (
              <label key={p} className="check">
                <input
                  type="checkbox"
                  checked={products.includes(p)}
                  onChange={(e) => setProducts((prev) => (e.target.checked ? [...prev, p].sort((a, b) => a - b) : prev.filter((x) => x !== p)))}
                />
                {p}
              </label>
            ))}
            <label>
              AND store_sk =
              <select value={store ?? ''} onChange={(e) => setStore(e.target.value === '' ? null : Number(e.target.value))}>
                <option value="">(any)</option>
                {STORES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="bitmaps">
            {evaluation.productBitmaps.map((b) => (
              <Bits key={b.value} bits={b.bits} label={`product=${b.value}`} />
            ))}
            {evaluation.productBitmaps.length > 1 && <Bits bits={evaluation.productMatch} label="OR" />}
            {evaluation.storeBitmap && (
              <>
                <Bits bits={evaluation.storeBitmap} label={`store=${store}`} />
                <Bits bits={evaluation.result} label="AND" />
              </>
            )}
          </div>
          <p className="small">
            Matching rows: <span className="mono">{evaluation.matchingRows.length ? evaluation.matchingRows.map((r) => `#${r}`).join(', ') : 'none'}</span>
          </p>
          <p className="muted small">Bitmaps follow the current sort order from panel 2. Run lengths alternate zeros, ones, zeros… (trailing zeros omitted).</p>
        </section>
      </div>
      <aside className="lab-side">
        <ChallengeList labId="columnar" onRun={runChallenge} />
      </aside>
    </div>
  );
}
