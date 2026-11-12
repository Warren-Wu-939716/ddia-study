import { useState, type MouseEvent } from 'react';
import { StepControls } from '../components/StepControls.tsx';
import { useStepper } from '../lib/useStepper.ts';
import { assignPartitions, closeness, flatSearch, ivfSearch, VECTOR_PHASES, vectorFrames, type Metric, type Vec, type VectorFrame, type VectorPhase } from './logic/search.ts';
import { CENTROIDS, DEMO_QUERIES, DOC_VECTORS, TOPICS } from './logic/vectorDemo.ts';

const SIZE = 300;
const EXTENT = 1.1;
const toPx = (v: number) => ((v + EXTENT) / (2 * EXTENT)) * SIZE;
const toPy = (v: number) => SIZE - toPx(v);
const PARTITION = assignPartitions(DOC_VECTORS, CENTROIDS);
const K = 3;

interface Settings {
  queryIndex: number | null;
  custom: Vec;
  index: 'flat' | 'ivf';
  probes: number;
  metric: Metric;
}

function runSearch({ queryIndex, custom, index, probes, metric }: Settings) {
  const query = queryIndex === null ? custom : DEMO_QUERIES[queryIndex].vec;
  const exact = flatSearch(DOC_VECTORS, query, K, metric);
  const search = index === 'flat' ? exact : ivfSearch(DOC_VECTORS, CENTROIDS, query, K, probes, metric);
  const resultIds = new Set(search.results.map((r) => r.id));
  const missed = exact.results.filter((r) => !resultIds.has(r.id));
  return { query, search, resultIds, missed };
}

export function VectorSearchWidget() {
  const [settings, setSettings] = useState<Settings>({ queryIndex: 1, custom: { x: 0.4, y: 0.6 }, index: 'ivf', probes: 1, metric: 'euclidean' });
  const stepper = useStepper<VectorFrame>();
  const { queryIndex, index, probes, metric } = settings;
  const { query, search, resultIds, missed } = runSearch(settings);
  const queryLength = Math.hypot(query.x, query.y) || 1;
  const probed = new Set(search.probed);

  const at = stepper.frame ? VECTOR_PHASES.indexOf(stepper.frame.phase) : VECTOR_PHASES.length;
  const reached = (phase: VectorPhase) => at >= VECTOR_PHASES.indexOf(phase);
  const comparing = reached(index === 'flat' ? 'compare' : 'probe');
  const ranked = reached('results');

  const update = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    const run = runSearch(next);
    stepper.start(
      vectorFrames({
        label: next.queryIndex === null ? '' : DEMO_QUERIES[next.queryIndex].label,
        query: run.query,
        index: next.index,
        search: run.search,
        missed: run.missed,
        partitionNames: TOPICS,
        total: DOC_VECTORS.length,
        metric: next.metric,
      }),
    );
  };

  const onClick = (e: MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * SIZE;
    const py = ((e.clientY - rect.top) / rect.height) * SIZE;
    const fromPx = (p: number) => (p / SIZE) * 2 * EXTENT - EXTENT;
    update({ custom: { x: fromPx(px), y: -fromPx(py) }, queryIndex: null });
  };

  return (
    <div className="widget-body">
      <div className="toolbar">
        <label>
          query
          <select value={queryIndex ?? ''} onChange={(e) => update({ queryIndex: e.target.value === '' ? null : Number(e.target.value) })}>
            {DEMO_QUERIES.map((q, i) => (
              <option key={q.label} value={i}>
                “{q.label}”
              </option>
            ))}
            <option value="">(click the map to place your own)</option>
          </select>
        </label>
        <button onClick={() => update({})}>run search</button>
      </div>
      <div className="toolbar">
        <div className="segmented" role="radiogroup" aria-label="Index type">
          {(
            [
              ['flat', 'flat (exact)'],
              ['ivf', 'IVF (approximate)'],
            ] as const
          ).map(([id, label]) => (
            <button key={id} role="radio" aria-checked={index === id} className={index === id ? 'selected' : ''} onClick={() => update({ index: id })}>
              {label}
            </button>
          ))}
        </div>
        {index === 'ivf' && (
          <label>
            probes
            <input type="range" min={1} max={CENTROIDS.length} value={probes} onChange={(e) => update({ probes: Number(e.target.value) })} />
            <span className="mono">{probes}</span>
          </label>
        )}
        <label>
          distance
          <select value={metric} onChange={(e) => update({ metric: e.target.value as Metric })}>
            <option value="euclidean">Euclidean (straight line)</option>
            <option value="cosine">cosine (angle)</option>
          </select>
        </label>
      </div>
      <div className="vector-layout">
        <svg className="vector-map" viewBox={`0 0 ${SIZE} ${SIZE}`} onClick={onClick} role="img" aria-label="Two-dimensional embedding space">
          <line x1={toPx(0)} y1={0} x2={toPx(0)} y2={SIZE} className="axis-line" />
          <line x1={0} y1={toPy(0)} x2={SIZE} y2={toPy(0)} className="axis-line" />
          {metric === 'cosine' && (
            <line
              x1={toPx(0)}
              y1={toPy(0)}
              x2={toPx((query.x / queryLength) * EXTENT)}
              y2={toPy((query.y / queryLength) * EXTENT)}
              className="cosine-ray"
            />
          )}
          {stepper.frame?.phase === 'centroids' &&
            CENTROIDS.map((c, i) => <line key={i} x1={toPx(query.x)} y1={toPy(query.y)} x2={toPx(c.x)} y2={toPy(c.y)} className="centroid-link" />)}
          {ranked && search.results.map((r) => <line key={r.id} x1={toPx(query.x)} y1={toPy(query.y)} x2={toPx(r.x)} y2={toPy(r.y)} className="result-link" />)}
          {index === 'ivf' &&
            reached('centroids') &&
            CENTROIDS.map((c, i) => (
              <g
                key={i}
                className={`centroid topic-${i} ${comparing && probed.has(i) ? 'probed' : ''} ${stepper.frame?.phase === 'centroids' ? 'probing' : ''}`}
                transform={`translate(${toPx(c.x)} ${toPy(c.y)})`}
              >
                <line x1={-5} y1={-5} x2={5} y2={5} />
                <line x1={-5} y1={5} x2={5} y2={-5} />
              </g>
            ))}
          {DOC_VECTORS.map((d, i) => {
            const compared = index === 'flat' || probed.has(PARTITION[i]);
            const hit = ranked && resultIds.has(d.id);
            const miss = reached('missed') && missed.some((m) => m.id === d.id);
            const state = comparing ? (compared ? 'compared' : 'skipped') : '';
            return (
              <g key={d.id}>
                <circle cx={toPx(d.x)} cy={toPy(d.y)} r={hit ? 6 : 4.5} className={`doc topic-${PARTITION[i]} ${state} ${hit ? 'hit' : ''} ${miss ? 'missed' : ''}`}>
                  <title>{d.label}</title>
                </circle>
                {(hit || miss) && (
                  <text
                    x={toPx(d.x) + (toPx(d.x) > SIZE * 0.68 ? -8 : 8)}
                    y={toPy(d.y) + 3}
                    textAnchor={toPx(d.x) > SIZE * 0.68 ? 'end' : 'start'}
                    className={`doc-label ${miss ? 'missed' : ''}`}
                  >
                    {d.label}
                  </text>
                )}
              </g>
            );
          })}
          <path d="M0,-8 L2,-2 8,-2 3,2 5,8 0,4 -5,8 -3,2 -8,-2 -2,-2Z" transform={`translate(${toPx(query.x)} ${toPy(query.y)})`} className="query-star" />
        </svg>
        <div className="vector-side">
          <ul className="topic-legend">
            {TOPICS.map((t, i) => (
              <li key={t}>
                <span className={`dot topic-${i}`} /> {t}
              </li>
            ))}
          </ul>
          <h5>Top {K} results</h5>
          {ranked ? (
            <ol className="small">
              {search.results.map((r) => (
                <li key={r.id}>
                  {r.label}{' '}
                  <span className="muted mono">
                    {metric === 'cosine' ? `similarity ${closeness(metric, r, query).toFixed(2)}` : `distance ${(-closeness(metric, r, query)).toFixed(2)}`}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted small">(not ranked yet)</p>
          )}
          {comparing && (
            <p className="small">
              Compared <strong>{search.compared}</strong> of {DOC_VECTORS.length} vectors.
            </p>
          )}
          {index === 'ivf' && reached('missed') && (
            <p className={`small ${missed.length ? 'error' : 'ok'}`}>
              {missed.length ? `Missed true neighbour${missed.length > 1 ? 's' : ''}: ${missed.map((m) => m.label).join(', ')}` : 'Same results as exact search.'}
            </p>
          )}
        </div>
      </div>
      <StepControls
        stepper={stepper}
        idle={
          index === 'flat'
            ? `Flat index: the query is compared with every stored vector — always exact, but the work grows with the collection.`
            : `IVF: only the ${probes} partition${probes > 1 ? 's' : ''} whose centroid${probes > 1 ? 's are' : ' is'} closest (✕) ${probes > 1 ? 'are' : 'is'} searched. ${
                missed.length ? 'A close match sits just across a partition boundary, so it was never compared — raise the probes.' : 'Fewer comparisons, and this time nothing was missed.'
              } Change any setting (or press run search) to see each step.`
        }
      />
    </div>
  );
}
