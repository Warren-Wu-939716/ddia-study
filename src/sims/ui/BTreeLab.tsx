import { useMemo, useRef, useState } from 'react';
import { ChallengeList } from '../../components/ChallengeList.tsx';
import { StepControls } from '../../components/StepControls.tsx';
import { useStepper } from '../../lib/useStepper.ts';
import { formatBytes } from '../columnar.ts';
import type { Challenge } from '../challenges.ts';
import { capacityBytes, createBTree, depth, insertKey, pageCount } from '../btree.ts';
import { traceFind, traceInsert, treeModel, type BTreeFrame } from '../btreeTrace.ts';
import { sleep, stepDelay } from './animation.ts';
import { TreeView } from './TreeView.tsx';

export function BTreeLab() {
  const [state, setState] = useState(() => createBTree(3));
  const [input, setInput] = useState('');
  const [branching, setBranching] = useState(500);
  const [levelCount, setLevelCount] = useState(4);
  const [pageKiB, setPageKiB] = useState(4);
  const stepper = useStepper<BTreeFrame>();
  const runToken = useRef(0);
  const committed = useMemo(() => treeModel(state), [state]);

  const parsed = Number.parseInt(input, 10);
  const valid = Number.isInteger(parsed) && parsed >= 0 && parsed <= 9999;
  const leafKeys = useMemo(() => Object.values(state.pages).flatMap((p) => (p.type === 'leaf' ? p.keys : [])), [state]);
  const keyCount = leafKeys.length;
  const maxKey = leafKeys.length > 0 ? Math.max(...leafKeys) : 0;

  const insertOne = (key: number) => {
    runToken.current++;
    const { frames, final } = traceInsert(state, key);
    setState(final);
    stepper.start(frames);
  };

  const insertMany = (keys: number[]) => {
    runToken.current++;
    const final = keys.reduce(insertKey, state);
    setState(final);
    stepper.start([
      {
        tree: treeModel(final),
        read: [],
        written: [],
        caption: `Inserted ${keys.length} keys at once (${keys.join(', ')}). Insert a single key to watch each step.`,
      },
    ]);
  };

  const reset = (maxKeys = state.maxKeys) => {
    runToken.current++;
    stepper.clear();
    setState(createBTree(maxKeys));
  };

  const runChallenge = async (challenge: Challenge) => {
    if (challenge.labId !== 'btree') return;
    const token = ++runToken.current;
    let current = createBTree(challenge.maxKeys);
    stepper.clear();
    setState(current);
    const delay = stepDelay(challenge.inserts.length > 15 ? 80 : 300);
    for (const key of challenge.inserts) {
      await sleep(delay);
      if (token !== runToken.current) return;
      current = insertKey(current, key);
      setState(current);
    }
    if (challenge.lookupKey !== undefined) stepper.start(traceFind(current, challenge.lookupKey).frames);
  };

  const frame = stepper.frame;

  return (
    <div className="lab">
      <div className="lab-main">
        <div className="toolbar">
          <label>
            key (0–9999)
            <input inputMode="numeric" value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. 42" maxLength={4} />
          </label>
          <button className="primary" disabled={!valid} onClick={() => insertOne(parsed)}>
            insert
          </button>
          <button disabled={!valid} onClick={() => stepper.start(traceFind(state, parsed).frames)}>
            find
          </button>
          <span className="divider" />
          <button onClick={() => insertMany(Array.from({ length: 5 }, () => Math.floor(Math.random() * 1000)))}>5 random keys</button>
          <button onClick={() => insertMany(Array.from({ length: 10 }, (_, i) => maxKey + i + 1))}>10 ascending keys</button>
          <label>
            keys per page
            <select value={state.maxKeys} onChange={(e) => reset(Number(e.target.value))}>
              {[2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => reset()}>reset</button>
        </div>

        <StepControls stepper={stepper} idle="Insert a key to watch the descent, the insert and any splits one step at a time; find a key to follow its path." />

        <TreeView tree={frame?.tree ?? committed} read={frame?.read} written={frame?.written} overflow={frame?.overflow} />
        <p className="legend small muted">
          <span className="swatch read" /> read so far <span className="swatch written" /> written in this step <span className="swatch overflow" /> too full — must split
        </p>

        <dl className="stats">
          <div>
            <dt>Keys</dt>
            <dd>{keyCount}</dd>
          </div>
          <div>
            <dt>Pages</dt>
            <dd>{pageCount(state)}</dd>
          </div>
          <div>
            <dt>Depth</dt>
            <dd>{depth(state)}</dd>
          </div>
          <div>
            <dt>Splits</dt>
            <dd>{state.stats.splits}</dd>
          </div>
          <div>
            <dt>WAL records</dt>
            <dd>{state.stats.walRecords}</dd>
          </div>
          <div>
            <dt>Page writes</dt>
            <dd>{state.stats.pageWrites}</dd>
          </div>
        </dl>

        <section className="panel">
          <h4>How big can a shallow tree get?</h4>
          <div className="toolbar">
            <label>
              branching factor
              <input type="number" min={2} max={2000} value={branching} onChange={(e) => setBranching(Math.min(2000, Math.max(2, Number(e.target.value) || 2)))} />
            </label>
            <label>
              levels
              <input type="number" min={1} max={6} value={levelCount} onChange={(e) => setLevelCount(Math.min(6, Math.max(1, Number(e.target.value) || 1)))} />
            </label>
            <label>
              page size
              <select value={pageKiB} onChange={(e) => setPageKiB(Number(e.target.value))}>
                {[4, 8, 16].map((n) => (
                  <option key={n} value={n}>
                    {n} KiB
                  </option>
                ))}
              </select>
            </label>
            <strong className="mono">≈ {formatBytes(capacityBytes(branching, levelCount, pageKiB * 1024))}</strong>
          </div>
          <p className="muted small">The simulator uses tiny pages so splits are visible; real pages hold hundreds of keys.</p>
        </section>
      </div>
      <aside className="lab-side">
        <ChallengeList labId="btree" onRun={runChallenge} />
      </aside>
    </div>
  );
}
