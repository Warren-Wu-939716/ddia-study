import { useMemo, useState, type FormEvent, type MouseEvent } from 'react';
import { StepControls } from '../components/StepControls.tsx';
import { useStepper } from '../lib/useStepper.ts';
import {
  buildInvertedIndex,
  editDistance,
  fuzzyMatches,
  invertedFrames,
  phoneBookFrames,
  phoneBookLookup,
  postingsBitmap,
  randomPoints,
  rangeFrames,
  rangeScan,
  searchInvertedIndex,
  sortPeople,
  tokenize,
  trigrams,
  type Box,
  type InvertedFrame,
  type PhoneFrame,
  type PhoneQuery,
  type RangeFrame,
  type RangeStrategy,
} from './logic/search.ts';
import { hopFrames, indexHops, type HopFrame, type HopQuery, type Structure, type TableLayout } from './logic/storage.ts';

// ── What does an index entry point to? ───────────────────────────────

const LAYOUTS: { id: TableLayout; label: string }[] = [
  { id: 'clustered', label: 'Clustered primary key (InnoDB-style)' },
  { id: 'heap', label: 'Heap file (PostgreSQL-style)' },
  { id: 'covering', label: 'Heap + covering email index' },
];

const QUERIES: { id: HopQuery; sql: string }[] = [
  { id: 'by-id', sql: 'SELECT * FROM users WHERE id = 42' },
  { id: 'all-by-email', sql: "SELECT * FROM users WHERE email = 'ana@x.io'" },
  { id: 'status-by-email', sql: "SELECT status FROM users WHERE email = 'ana@x.io'" },
];

function structureContent(structure: Structure, layout: TableLayout): string {
  if (structure === 'pk-index') return layout === 'clustered' ? '42 → { id: 42, email, status, name, … }' : '42 → heap #3';
  if (structure === 'email-index')
    return layout === 'clustered' ? 'ana@x.io → id 42' : layout === 'covering' ? 'ana@x.io → status: active, heap #3' : 'ana@x.io → heap #3';
  return layout === 'clustered' ? '(no heap — rows live inside the primary-key index)' : '#3: { id: 42, email, status, name, … }';
}

const STRUCTURE_NAMES: Record<Structure, string> = {
  'email-index': 'Secondary index on email',
  'pk-index': 'Primary-key index',
  heap: 'Heap file',
};

export function IndexHopsWidget() {
  const [layout, setLayout] = useState<TableLayout>('heap');
  const [query, setQuery] = useState<HopQuery>('status-by-email');
  const stepper = useStepper<HopFrame>();
  const hops = indexHops(layout, query);
  const order = (s: Structure) => hops.findIndex((h) => h.structure === s);
  const frame = stepper.frame;
  const shownUpTo = frame ? frame.hop : hops.length - 1;

  const run = (l: TableLayout, q: HopQuery) => stepper.start(hopFrames(indexHops(l, q)));

  return (
    <div className="widget-body">
      <fieldset className="radio-row">
        <legend>Table storage</legend>
        {LAYOUTS.map((l) => (
          <label key={l.id} className="check">
            <input
              type="radio"
              name="layout"
              checked={layout === l.id}
              onChange={() => {
                setLayout(l.id);
                run(l.id, query);
              }}
            />
            {l.label}
          </label>
        ))}
      </fieldset>
      <fieldset className="radio-row">
        <legend>Query</legend>
        {QUERIES.map((q) => (
          <label key={q.id} className="check">
            <input
              type="radio"
              name="query"
              checked={query === q.id}
              onChange={() => {
                setQuery(q.id);
                run(layout, q.id);
              }}
            />
            <code>{q.sql}</code>
          </label>
        ))}
      </fieldset>
      <div className="toolbar">
        <button className="primary" onClick={() => run(layout, query)}>
          run query
        </button>
      </div>
      <div className="hops">
        {(['email-index', 'pk-index', 'heap'] as const).map((s) => {
          const step = order(s);
          const active = step >= 0 && step <= shownUpTo;
          return (
            <div key={s} className={`hop-box ${active ? 'active' : ''} ${frame?.hop === step ? 'current' : ''} ${layout === 'clustered' && s === 'heap' ? 'unused' : ''}`}>
              {active && (
                <span className="hop-badge" data-flip={`hop-badge-${s}`}>
                  {step + 1}
                </span>
              )}
              <strong>{STRUCTURE_NAMES[s]}</strong>
              <code>{structureContent(s, layout)}</code>
              {frame && frame.hop === step && (
                <span className="hop-token" data-flip="hop-token">
                  ▶ lookup is here
                </span>
              )}
            </div>
          );
        })}
      </div>
      <ol className="hop-notes">
        {hops.slice(0, shownUpTo + 1).map((h, i) => (
          <li key={i} data-flip={`note${i}`}>
            {h.note}
          </li>
        ))}
      </ol>
      <StepControls
        stepper={stepper}
        idle={`${hops.length === 1 ? 'One structure touched.' : `${hops.length} structures touched.`} Change the storage or the query (or press run query) to follow the lookup hop by hop.`}
      />
      {layout === 'covering' && <p className="muted small">Trade-off: status is stored twice, so every status update must also rewrite the index entry.</p>}
    </div>
  );
}

// ── Concatenated index: the phone book ───────────────────────────────

const PEOPLE = sortPeople([
  { last: 'Garcia', first: 'Ana' },
  { last: 'Garcia', first: 'Luis' },
  { last: 'Kim', first: 'Min' },
  { last: 'Kim', first: 'Ana' },
  { last: 'Lopez', first: 'Sara' },
  { last: 'Nguyen', first: 'Ana' },
  { last: 'Nguyen', first: 'Bao' },
  { last: 'Okafor', first: 'Chidi' },
  { last: 'Patel', first: 'Ravi' },
  { last: 'Patel', first: 'Ana' },
  { last: 'Smith', first: 'Jo' },
  { last: 'Smith', first: 'Luis' },
  { last: 'Tanaka', first: 'Yuki' },
  { last: 'Weber', first: 'Sara' },
]);
const LASTS = [...new Set(PEOPLE.map((p) => p.last))];
const FIRSTS = [...new Set(PEOPLE.map((p) => p.first))].sort();

const makeQuery = (by: PhoneQuery['by'], last: string, first: string): PhoneQuery =>
  by === 'last' ? { by, last } : by === 'first' ? { by, first } : { by, last, first };

export function PhoneBookWidget() {
  const [by, setBy] = useState<PhoneQuery['by']>('last');
  const [last, setLast] = useState('Nguyen');
  const [first, setFirst] = useState('Ana');
  const stepper = useStepper<PhoneFrame>();
  const result = phoneBookLookup(PEOPLE, makeQuery(by, last, first));
  const frame = stepper.frame;
  const matches = frame?.matches ?? result.matches;

  const change = (nextBy: PhoneQuery['by'], nextLast: string, nextFirst: string) => {
    setBy(nextBy);
    setLast(nextLast);
    setFirst(nextFirst);
    stepper.start(phoneBookFrames(PEOPLE, makeQuery(nextBy, nextLast, nextFirst)));
  };

  return (
    <div className="widget-body">
      <p className="small">
        Index on <code>(last_name, first_name)</code> — sorted like a phone book.
      </p>
      <div className="toolbar">
        <div className="segmented" role="radiogroup" aria-label="Query">
          {(
            [
              ['last', 'last name ='],
              ['last-first', 'last + first ='],
              ['first', 'first name only ='],
            ] as const
          ).map(([id, label]) => (
            <button key={id} role="radio" aria-checked={by === id} className={by === id ? 'selected' : ''} onClick={() => change(id, last, first)}>
              {label}
            </button>
          ))}
        </div>
        {by !== 'first' && (
          <select aria-label="Last name" value={last} onChange={(e) => change(by, e.target.value, first)}>
            {LASTS.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        )}
        {by !== 'last' && (
          <select aria-label="First name" value={first} onChange={(e) => change(by, last, e.target.value)}>
            {FIRSTS.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        )}
        <button onClick={() => change(by, last, first)}>run lookup</button>
      </div>
      <ol className={`phone-book ${!frame && !result.usesIndex ? 'full-scan' : ''}`}>
        {PEOPLE.map((p, i) => {
          const outside = frame?.range !== undefined && (i < frame.range[0] || i >= frame.range[1]);
          const classes = [
            matches.includes(i) ? 'match' : '',
            frame?.probe === i ? 'probe' : '',
            frame?.examined.includes(i) && !matches.includes(i) ? 'examined' : '',
            outside ? 'outside' : '',
          ];
          return (
            <li key={i} className={classes.join(' ')} data-flip={`pb${i}`} data-flip-state={matches.includes(i) ? 'match' : ''}>
              <span className="mono muted">{String(i + 1).padStart(2, '0')}</span> {p.last}, {p.first}
              {frame?.probe === i && (
                <span className="pb-probe" data-flip="pb-probe">
                  ◀ checking
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <StepControls
        stepper={stepper}
        idle={
          result.usesIndex
            ? `Matches sit next to each other, so a binary search jumps straight to them. Change the query (or press run lookup) to watch it step by step.`
            : `First names are scattered throughout, so the index order doesn’t help: all ${PEOPLE.length} entries must be scanned.`
        }
      />
    </div>
  );
}

// ── Two-dimensional range query on a map ─────────────────────────────

const MAP_W = 320;
const MAP_H = 200;
const BOX_W = 90;
const BOX_H = 56;
const POINTS = randomPoints(70, 11, MAP_W, MAP_H);

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function boxAround(center: { x: number; y: number }): Box {
  const x0 = clamp(center.x - BOX_W / 2, 0, MAP_W - BOX_W);
  const y0 = clamp(center.y - BOX_H / 2, 0, MAP_H - BOX_H);
  return { x0, x1: x0 + BOX_W, y0, y1: y0 + BOX_H };
}

export function MapRangeWidget() {
  const [center, setCenter] = useState({ x: 170, y: 95 });
  const [strategy, setStrategy] = useState<RangeStrategy>('lat');
  const stepper = useStepper<RangeFrame>();
  const box = boxAround(center);
  const { scanned, matches } = rangeScan(POINTS, box, strategy);
  const scannedIds = new Set(scanned.map((p) => p.id));
  const matchIds = new Set(matches.map((p) => p.id));
  const filtered = (stepper.frame?.phase ?? 'filter') === 'filter';

  const run = (nextCenter: { x: number; y: number }, nextStrategy: RangeStrategy) => {
    setCenter(nextCenter);
    setStrategy(nextStrategy);
    const scan = rangeScan(POINTS, boxAround(nextCenter), nextStrategy);
    stepper.start(rangeFrames(nextStrategy, scan.scanned.length, scan.matches.length));
  };
  const move = (dx: number, dy: number) => run({ x: clamp(center.x + dx, 0, MAP_W), y: clamp(center.y + dy, 0, MAP_H) }, strategy);
  const onClick = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    run({ x: ((e.clientX - rect.left) / rect.width) * MAP_W, y: ((e.clientY - rect.top) / rect.height) * MAP_H }, strategy);
  };

  return (
    <div className="widget-body">
      <div className="toolbar">
        <div className="segmented" role="radiogroup" aria-label="Index">
          {(
            [
              ['lat', 'index on latitude'],
              ['lon', 'index on longitude'],
              ['2d', '2-D index (R-tree)'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} role="radio" aria-checked={strategy === id} className={strategy === id ? 'selected' : ''} onClick={() => run(center, id)}>
              {label}
            </button>
          ))}
        </div>
        <span className="muted small">move the view:</span>
        <button className="chip" aria-label="Move left" onClick={() => move(-20, 0)}>
          ←
        </button>
        <button className="chip" aria-label="Move up" onClick={() => move(0, -20)}>
          ↑
        </button>
        <button className="chip" aria-label="Move down" onClick={() => move(0, 20)}>
          ↓
        </button>
        <button className="chip" aria-label="Move right" onClick={() => move(20, 0)}>
          →
        </button>
      </div>
      <svg className="map" viewBox={`0 0 ${MAP_W} ${MAP_H}`} onClick={onClick} role="img" aria-label={`${matches.length} restaurants in view, ${scanned.length} scanned`}>
        {strategy === 'lat' && <rect className="stripe" x={0} y={box.y0} width={MAP_W} height={BOX_H} data-flip="stripe-lat" />}
        {strategy === 'lon' && <rect className="stripe" x={box.x0} y={0} width={BOX_W} height={MAP_H} data-flip="stripe-lon" />}
        <rect className="view-box" x={box.x0} y={box.y0} width={BOX_W} height={BOX_H} data-flip="view-box" />
        {POINTS.map((p) => {
          const match = filtered && matchIds.has(p.id);
          return (
            <circle
              key={p.id}
              cx={p.x}
              cy={p.y}
              r={match ? 4 : 3}
              className={match ? 'pt match' : scannedIds.has(p.id) ? 'pt scanned' : 'pt'}
              data-flip={`pt${p.id}`}
              data-flip-state={match ? 'match' : scannedIds.has(p.id) ? 'scanned' : ''}
            />
          );
        })}
        <text x={MAP_W - 4} y={MAP_H - 4} textAnchor="end" className="axis">
          longitude →
        </text>
        <text x={4} y={12} className="axis">
          latitude
        </text>
      </svg>
      <StepControls
        stepper={stepper}
        idle={
          strategy === '2d'
            ? `A 2-D index narrows both ranges at once: it reads just the ${matches.length} restaurants in the box.`
            : `A 1-D index on ${strategy === 'lat' ? 'latitude' : 'longitude'} can only narrow one range: it reads the whole ${strategy === 'lat' ? 'horizontal' : 'vertical'} stripe — ${scanned.length} restaurants — to find the ${matches.length} in view (${scanned.length - matches.length} wasted).`
        }
      />
      <p className="muted small">Click the map to move the view. Blue = read by the index, green = actually in view.</p>
    </div>
  );
}

// ── Inverted index ───────────────────────────────────────────────────

const DOCS = ['Red apples and green pears', 'Green tea with lemon', 'Red wine and cheese', 'Apple pie with cheese'];
const MAX_TERMS = 6;

export function InvertedIndexWidget() {
  const [query, setQuery] = useState('red cheese');
  const [submitted, setSubmitted] = useState('red cheese');
  const [mode, setMode] = useState<'and' | 'or'>('and');
  const stepper = useStepper<InvertedFrame>();
  const index = useMemo(() => buildInvertedIndex(DOCS), []);
  const terms = tokenize(submitted).slice(0, MAX_TERMS);
  const result = searchInvertedIndex(index, DOCS.length, terms, mode);
  const frame = stepper.frame;
  const looked = terms.slice(0, frame ? frame.looked : terms.length);
  const combined = frame ? frame.combined : true;
  const current = frame && !frame.combined && frame.looked > 0 ? terms[frame.looked - 1] : undefined;
  const currentPostings = current ? (index.get(current) ?? []) : [];

  const run = (q: string, m: 'and' | 'or') => {
    setSubmitted(q);
    setMode(m);
    stepper.start(invertedFrames(index, DOCS.length, tokenize(q).slice(0, MAX_TERMS), m));
  };
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    run(query, mode);
  };

  return (
    <div className="widget-body">
      <form className="toolbar" onSubmit={onSubmit}>
        <label>
          search
          <input value={query} onChange={(e) => setQuery(e.target.value)} maxLength={60} />
        </label>
        <button className="primary" type="submit">
          search
        </button>
        <div className="segmented" role="radiogroup" aria-label="Combine terms with">
          {(['and', 'or'] as const).map((m) => (
            <button key={m} type="button" role="radio" aria-checked={mode === m} className={mode === m ? 'selected' : ''} onClick={() => run(query, m)}>
              {m.toUpperCase()}
            </button>
          ))}
        </div>
      </form>
      <ol className="docs">
        {DOCS.map((doc, i) => (
          <li
            key={i}
            className={`${combined && result[i] ? 'match' : ''} ${currentPostings.includes(i + 1) ? 'posting' : ''}`}
            data-flip={`doc${i}`}
            data-flip-state={`${combined && result[i] ? 'match' : ''}${currentPostings.includes(i + 1) ? 'posting' : ''}`}
          >
            <span className="mono muted">doc {i + 1}</span> {doc}
          </li>
        ))}
      </ol>
      <div className="lesson-table-wrap">
        <table className="mini inverted">
          <thead>
            <tr>
              <th>term</th>
              <th>postings</th>
              <th>bitmap (docs 1–{DOCS.length})</th>
            </tr>
          </thead>
          <tbody>
            {[...index.entries()].map(([term, postings]) => (
              <tr key={term} className={`${looked.includes(term) ? 'hl' : ''} ${term === current ? 'current' : ''}`}>
                <td className="mono">{term}</td>
                <td className="mono">[{postings.join(', ')}]</td>
                <td className="mono">{postingsBitmap(postings, DOCS.length).join(' ')}</td>
              </tr>
            ))}
            {looked
              .filter((t) => !index.has(t))
              .map((t) => (
                <tr key={t} className={`hl ${t === current ? 'current' : ''}`}>
                  <td className="mono">{t}</td>
                  <td className="muted">(no documents)</td>
                  <td className="mono">{postingsBitmap([], DOCS.length).join(' ')}</td>
                </tr>
              ))}
            {combined && (
              <tr className="result-row">
                <td colSpan={2}>
                  <strong>{terms.length ? terms.join(` ${mode.toUpperCase()} `) : '(type a query)'}</strong>
                </td>
                <td className="mono">
                  <strong data-flip="result-bits">{result.join(' ')}</strong>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <StepControls
        stepper={stepper}
        idle={
          terms.length === 0
            ? 'Type one or more words.'
            : `${terms.join(` ${mode.toUpperCase()} `)} → ${result.join(' ')} → ${
                result.some(Boolean) ? `doc ${result.flatMap((bit, i) => (bit ? [i + 1] : [])).join(', ')}` : 'no documents'
              }. Search again to see each step.`
        }
      />
      <p className="muted small">Notice “apple” and “apples” are different terms here — real search engines add stemming to merge word forms.</p>
    </div>
  );
}

// ── Trigrams and edit distance ───────────────────────────────────────

const DICTIONARY = ['password', 'passport', 'passwords', 'pass', 'sword', 'postword', 'database', 'datebase', 'data', 'index', 'indexes', 'search', 'starch', 'storage'];

export function FuzzyWidget() {
  const [a, setA] = useState('pasword');
  const [b, setB] = useState('password');
  const [maxDistance, setMaxDistance] = useState(1);
  const ta = trigrams(a);
  const tb = trigrams(b);
  const shared = ta.filter((t) => tb.includes(t));
  const matches = fuzzyMatches(DICTIONARY, a.trim(), maxDistance);

  return (
    <div className="widget-body">
      <div className="toolbar">
        <label>
          typed
          <input value={a} onChange={(e) => setA(e.target.value.slice(0, 20))} />
        </label>
        <label>
          compare with
          <input value={b} onChange={(e) => setB(e.target.value.slice(0, 20))} />
        </label>
      </div>
      <div className="trigram-rows">
        {[
          { word: a, grams: ta },
          { word: b, grams: tb },
        ].map(({ word, grams }, row) => (
          <div key={row} className="trigram-row">
            <span className="mono">{word}</span>
            {grams.map((g) => (
              <span key={g} className={`chip-static ${shared.includes(g) ? 'shared' : ''}`} data-flip={`${row}:${g}`} data-flip-state={shared.includes(g) ? 'shared' : ''}>
                {g}
              </span>
            ))}
            {grams.length === 0 && <span className="muted small">(shorter than 3 letters)</span>}
          </div>
        ))}
      </div>
      <p className="widget-status" role="status">
        {shared.length} shared trigram{shared.length === 1 ? '' : 's'} · edit distance {editDistance(a.toLowerCase(), b.toLowerCase())} (single-letter inserts, deletes or
        substitutions to turn one into the other).
      </p>
      <div className="toolbar">
        <label>
          dictionary terms within distance
          <input type="range" min={0} max={3} value={maxDistance} onChange={(e) => setMaxDistance(Number(e.target.value))} />
          <span className="mono">{maxDistance}</span>
        </label>
        <span className="small">
          of “{a}”:{' '}
          {matches.length ? matches.map((m) => `${m.term} (${m.distance})`).join(', ') : <span className="muted">none</span>}
        </span>
      </div>
      <p className="muted small">That last list is what a Levenshtein automaton finds efficiently, without comparing against every word.</p>
    </div>
  );
}
