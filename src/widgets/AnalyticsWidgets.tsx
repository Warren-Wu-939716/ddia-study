import { useState } from 'react';
import { StepControls } from '../components/StepControls.tsx';
import { useStepper } from '../lib/useStepper.ts';
import { columnValues, distinctValues, evaluateFilter, generateSales, runLengthEncode, sortRows } from '../sims/columnar.ts';
import { Bits } from '../sims/ui/Bits.tsx';
import { bitmapFrames, rowColumnFrames, type BitmapFrame, type DiskReadFrame } from './logic/analytics.ts';
import { answerFromCube, answerFromRaw, buildCube, cubeFrames, revenue, type CubeFilter, type CubeFrame, type Sale } from './logic/search.ts';

// ── Row vs column layout ─────────────────────────────────────────────

const COLS = ['date', 'store', 'product', 'qty', 'price', 'discount', 'customer', 'channel'];
const SHORT = ['dt', 'st', 'pr', 'qt', 'pc', 'ds', 'cu', 'ch'];
const ROW_COUNT = 6;

export function RowColumnWidget() {
  const [layout, setLayout] = useState<'row' | 'column'>('row');
  const [used, setUsed] = useState<number[]>([0, 1, 4]);
  const stepper = useStepper<DiskReadFrame>();
  const frame = stepper.frame;

  const run = (l: 'row' | 'column', u: number[]) => {
    setLayout(l);
    setUsed(u);
    stepper.start(rowColumnFrames(l, u, COLS, ROW_COUNT));
  };
  const toggle = (c: number) => run(layout, used.includes(c) ? used.filter((x) => x !== c) : [...used, c].sort((a, b) => a - b));

  const lines =
    layout === 'row'
      ? Array.from({ length: ROW_COUNT }, (_, r) => ({ label: `row ${r + 1}`, cells: COLS.map((_, c) => ({ r, c })) }))
      : COLS.map((name, c) => ({ label: `${name} column`, cells: Array.from({ length: ROW_COUNT }, (_, r) => ({ r, c })) }));
  const isRead = (c: number) => layout === 'row' || used.includes(c);
  const reached = (line: number) => !frame || line <= frame.line;
  const total = COLS.length * ROW_COUNT;
  const read = lines.reduce((sum, line, li) => sum + (reached(li) ? line.cells.filter(({ c }) => isRead(c)).length : 0), 0);

  return (
    <div className="widget-body">
      <div className="toolbar">
        <span className="small">Query uses:</span>
        {COLS.map((name, c) => (
          <label key={name} className={`check col-chip col-${c}`}>
            <input type="checkbox" checked={used.includes(c)} onChange={() => toggle(c)} />
            {name}
          </label>
        ))}
      </div>
      <div className="toolbar">
        <div className="segmented" role="radiogroup" aria-label="Layout on disk">
          {(['row', 'column'] as const).map((l) => (
            <button key={l} role="radio" aria-checked={layout === l} className={layout === l ? 'selected' : ''} onClick={() => run(l, used)}>
              {l}-oriented
            </button>
          ))}
        </div>
        <button onClick={() => run(layout, used)}>run query</button>
        <span className="small mono">
          values read: {read} / {total}
        </span>
      </div>
      <div className="disk-lines" aria-label={`${read} of ${total} values read`}>
        {lines.map((line, li) => (
          <div key={line.label} className={`disk-line ${frame?.line === li ? 'current' : ''} ${reached(li) ? '' : 'pending'}`}>
            <span className="disk-label">{line.label}</span>
            {line.cells.map(({ r, c }) => (
              <span key={`${r}-${c}`} className={`disk-cell col-${c} ${reached(li) && isRead(c) ? 'read' : ''}`} data-flip={`cell${r}-${c}`} data-flip-state={reached(li) && isRead(c) ? 'read' : ''}>
                {SHORT[c]}
                {r + 1}
              </span>
            ))}
          </div>
        ))}
      </div>
      <StepControls
        stepper={stepper}
        idle={
          layout === 'row'
            ? `Each row is stored contiguously, so the ${used.length} wanted values are interleaved with everything else: the whole file is read — ${read} of ${total} values. Switch layouts or columns to watch the read step by step.`
            : `Each column is its own contiguous region: read only the ${used.length} wanted column${used.length === 1 ? '' : 's'} — ${read} of ${total} values.`
        }
      />
    </div>
  );
}

// ── Bitmaps, sort order and run-length encoding ─────────────────────

const ROWS = generateSales(12, 9);
const PRODUCTS = distinctValues(columnValues(ROWS, 'product_sk'));
const STORES = distinctValues(columnValues(ROWS, 'store_sk'));

export function BitmapWidget() {
  const [products, setProducts] = useState<number[]>([PRODUCTS[1], PRODUCTS[3]]);
  const [store, setStore] = useState<number | null>(null);
  const [sorted, setSorted] = useState(false);
  const stepper = useStepper<BitmapFrame>();
  const rows = sorted ? sortRows(ROWS, ['product_sk']) : ROWS;
  const evaluation = evaluateFilter(rows, products, store);
  const productRuns = runLengthEncode(columnValues(rows, 'product_sk')).length;

  const run = (p: number[], s: number | null, sort: boolean) => {
    setProducts(p);
    setStore(s);
    setSorted(sort);
    stepper.start(bitmapFrames(evaluateFilter(sort ? sortRows(ROWS, ['product_sk']) : ROWS, p, s), s, sort));
  };

  const items = [
    ...evaluation.productBitmaps.map((b) => ({ bits: b.bits, label: `product=${b.value}` })),
    ...(evaluation.productBitmaps.length > 1 ? [{ bits: evaluation.productMatch, label: 'OR' }] : []),
    ...(evaluation.storeBitmap ? [{ bits: evaluation.storeBitmap, label: `store=${store}` }, { bits: evaluation.result, label: 'AND' }] : []),
  ];
  const frame = stepper.frame;
  const shown = frame ? frame.shown : items.length;
  const finished = !frame || stepper.atEnd;

  return (
    <div className="widget-body">
      <div className="toolbar">
        <span className="small">product IN</span>
        {PRODUCTS.map((p) => (
          <label key={p} className="check">
            <input
              type="checkbox"
              checked={products.includes(p)}
              onChange={(e) => run(e.target.checked ? [...products, p].sort((a, b) => a - b) : products.filter((x) => x !== p), store, sorted)}
            />
            {p}
          </label>
        ))}
        <label>
          AND store =
          <select value={store ?? ''} onChange={(e) => run(products, e.target.value === '' ? null : Number(e.target.value), sorted)}>
            <option value="">(any)</option>
            {STORES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={sorted} onChange={(e) => run(products, store, e.target.checked)} />
          sort rows by product
        </label>
        <button onClick={() => run(products, store, sorted)}>run filter</button>
      </div>
      <div className="bitmaps">
        <div className="bitmap-row">
          <span className="bitmap-label mono">product col</span>
          <span className="bitmap values">
            {rows.map((r, i) => (
              <span
                key={ROWS.indexOf(r)}
                className={finished && evaluation.matchingRows.includes(i) ? 'match' : ''}
                data-flip={`row${ROWS.indexOf(r)}`}
                data-flip-state={finished && evaluation.matchingRows.includes(i) ? 'match' : ''}
              >
                {r.product_sk}
              </span>
            ))}
          </span>
          <span className="muted small mono" data-flip="product-runs">
            {productRuns} runs
          </span>
        </div>
        {items.slice(0, shown).map((item, i) => (
          <Bits key={item.label} bits={item.bits} label={item.label} current={frame !== undefined && !stepper.atEnd && i === shown - 1} />
        ))}
      </div>
      <StepControls
        stepper={stepper}
        idle={
          products.length === 0
            ? 'Tick at least one product.'
            : `${evaluation.matchingRows.length} matching row${evaluation.matchingRows.length === 1 ? '' : 's'}. Change the filter to watch the bitmaps get built and combined.`
        }
      />
    </div>
  );
}

// ── Data cube ────────────────────────────────────────────────────────

const FACTS: Sale[] = [
  { date: '03-01', product: 'p31', store: 's3', price: 4, qty: 3 },
  { date: '03-01', product: 'p68', store: 's4', price: 12, qty: 1 },
  { date: '03-01', product: 'p31', store: 's4', price: 4, qty: 2 },
  { date: '03-01', product: 'p69', store: 's3', price: 25, qty: 1 },
  { date: '03-02', product: 'p68', store: 's3', price: 12, qty: 2 },
  { date: '03-02', product: 'p31', store: 's3', price: 4, qty: 1 },
  { date: '03-02', product: 'p69', store: 's4', price: 25, qty: 2 },
  { date: '03-03', product: 'p31', store: 's4', price: 4, qty: 5 },
  { date: '03-03', product: 'p68', store: 's3', price: 12, qty: 1 },
  { date: '03-03', product: 'p69', store: 's3', price: 25, qty: 1 },
];
const CUBE = buildCube(FACTS);

const QUESTIONS: { label: string; filter: CubeFilter; missing?: string }[] = [
  { label: 'Total revenue on 03-02', filter: { date: '03-02' } },
  { label: 'Revenue from p68 across all dates', filter: { product: 'p68' } },
  { label: 'Revenue from p31 on 03-01', filter: { date: '03-01', product: 'p31' } },
  { label: 'Revenue in store s4', filter: { store: 's4' }, missing: 'store' },
  { label: 'Revenue from items priced over $10', filter: { minPrice: 10 }, missing: 'price' },
];

export function DataCubeWidget() {
  const [q, setQ] = useState(0);
  const stepper = useStepper<CubeFrame>();
  const { filter, missing } = QUESTIONS[q];
  const fromCube = answerFromCube(CUBE, filter);
  const fromRaw = answerFromRaw(FACTS, filter);
  const frame = stepper.frame;

  // With totals precomputed, a one-dimension question reads a single total cell.
  const cell = (date: string, product: string) => {
    if (frame) return frame.cells.some(([d, p]) => d === date && p === product) ? 'hl' : '';
    return fromCube !== null && (filter.date ?? 'total') === date && (filter.product ?? 'total') === product ? 'hl' : '';
  };
  const rowClass = (i: number) => {
    if (!frame) return !fromCube && fromRaw.rows.includes(i) ? 'hl' : '';
    const current = frame.scanned.at(-1) === i && !stepper.atEnd ? 'current' : '';
    return `${frame.matched.includes(i) ? 'hl' : frame.scanned.includes(i) ? 'examined' : ''} ${current}`;
  };
  const choose = (i: number) => {
    setQ(i);
    stepper.start(cubeFrames(CUBE, FACTS, QUESTIONS[i].filter, QUESTIONS[i].missing));
  };

  return (
    <div className="widget-body">
      <fieldset className="radio-row">
        <legend>Question</legend>
        {QUESTIONS.map((question, i) => (
          <label key={question.label} className="check">
            <input type="radio" name="cube-q" checked={q === i} onChange={() => choose(i)} />
            {question.label}
          </label>
        ))}
      </fieldset>
      <div className="cube-grid">
        <section className={`panel ${frame && !fromCube ? 'faded' : ''}`}>
          <h4>
            data cube <span className="muted small">SUM(revenue) by date × product</span>
          </h4>
          <table className="mini cube">
            <thead>
              <tr>
                <th />
                {CUBE.products.map((p) => (
                  <th key={p}>{p}</th>
                ))}
                <th>total</th>
              </tr>
            </thead>
            <tbody>
              {CUBE.dates.map((d) => (
                <tr key={d}>
                  <th>{d}</th>
                  {CUBE.products.map((p) => (
                    <td key={p} className={cell(d, p)} data-flip={`cube:${d}:${p}`} data-flip-state={cell(d, p)}>
                      {CUBE.cells[d][p]}
                    </td>
                  ))}
                  <td className={`total ${cell(d, 'total')}`} data-flip={`cube:${d}:total`} data-flip-state={cell(d, 'total')}>
                    {CUBE.dateTotals[d]}
                  </td>
                </tr>
              ))}
              <tr>
                <th>total</th>
                {CUBE.products.map((p) => (
                  <td key={p} className={`total ${cell('total', p)}`} data-flip={`cube:total:${p}`} data-flip-state={cell('total', p)}>
                    {CUBE.productTotals[p]}
                  </td>
                ))}
                <td className={`total ${cell('total', 'total')}`} data-flip="cube:total:total" data-flip-state={cell('total', 'total')}>
                  {CUBE.total}
                </td>
              </tr>
            </tbody>
          </table>
        </section>
        <section className={`panel ${fromCube ? 'faded' : ''}`}>
          <h4>
            raw fact rows <span className="muted small">{fromCube ? 'not needed' : 'scanned'}</span>
          </h4>
          <table className="mini">
            <thead>
              <tr>
                <th>date</th>
                <th>product</th>
                <th>store</th>
                <th>price</th>
                <th>qty</th>
              </tr>
            </thead>
            <tbody>
              {FACTS.map((s, i) => (
                <tr key={i} className={rowClass(i)}>
                  <td data-flip={`fact${i}`} data-flip-state={rowClass(i).trim()}>
                    {s.date}
                  </td>
                  <td>{s.product}</td>
                  <td>{s.store}</td>
                  <td>${s.price}</td>
                  <td>{s.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      <StepControls
        stepper={stepper}
        tone={stepper.atEnd && frame ? (fromCube ? 'ok' : undefined) : undefined}
        idle={
          fromCube
            ? `Answered from the cube by reading one precomputed cell: $${fromCube.value}. No raw rows scanned. Pick another question to see how it is answered.`
            : `The cube can’t answer: ${missing} isn’t one of its dimensions. Scanning all ${FACTS.length} raw rows instead: ${fromRaw.rows.length} match, $${fromRaw.value} (${fromRaw.rows
                .map((i) => `$${revenue(FACTS[i])}`)
                .join(' + ')}).`
        }
      />
    </div>
  );
}
