import { useRef, useState } from 'react';
import { ChallengeList } from '../../components/ChallengeList.tsx';
import { StepControls } from '../../components/StepControls.tsx';
import { useStepper } from '../../lib/useStepper.ts';
import type { Challenge } from '../challenges.ts';
import { applyOp, createLsm, DEFAULT_LSM_CONFIG, diskEntries, liveKeyCount, writeAmplification, type LsmConfig, type LsmOp, type LsmState } from '../lsm.ts';
import { traceGet, traceOp, type LsmFrame } from '../lsmTrace.ts';
import { sleep, stepDelay } from './animation.ts';
import { LsmView } from './LsmView.tsx';

const WORDS = ['apple', 'bagel', 'cider', 'dates', 'eggs', 'flour', 'grape', 'honey', 'icing', 'jelly', 'kiwi', 'lemon', 'mango', 'nuts', 'olive', 'pear'];

/** Runs several operations back to back, numbering each one's steps. */
function traceOps(state: LsmState, ops: readonly LsmOp[]): { frames: LsmFrame[]; final: LsmState } {
  let current = state;
  const frames: LsmFrame[] = [];
  ops.forEach((op, i) => {
    const run = traceOp(current, op);
    frames.push(...run.frames.map((f) => ({ ...f, caption: `**Write ${i + 1} of ${ops.length}.** ${f.caption}` })));
    current = run.final;
  });
  return { frames, final: current };
}

export function LsmLab() {
  const [state, setState] = useState(() => createLsm(DEFAULT_LSM_CONFIG));
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const stepper = useStepper<LsmFrame>();
  const runToken = useRef(0);

  const play = ({ frames, final }: { frames: LsmFrame[]; final: LsmState }) => {
    runToken.current++;
    setState(final);
    stepper.start(frames);
  };

  const reset = (config: LsmConfig = state.config) => {
    runToken.current++;
    stepper.clear();
    setState(createLsm(config));
  };

  const write = (kind: 'put' | 'delete') => {
    const k = key.trim().slice(0, 24);
    if (!k) return;
    play(traceOp(state, kind === 'put' ? { type: 'put', key: k, value: value.trim().slice(0, 24) || '1' } : { type: 'delete', key: k }));
    setValue('');
  };

  const get = () => {
    const k = key.trim().slice(0, 24);
    if (k) stepper.start(traceGet(state, k).frames);
  };

  const randomWrites = () => {
    const ops = Array.from({ length: 5 }, (): LsmOp => ({
      type: 'put',
      key: WORDS[Math.floor(Math.random() * WORDS.length)],
      value: String(Math.floor(Math.random() * 90) + 10),
    }));
    play(traceOps(state, ops));
  };

  const runChallenge = async (challenge: Challenge) => {
    if (challenge.labId !== 'lsm') return;
    const token = ++runToken.current;
    let current = createLsm(challenge.config);
    stepper.clear();
    setState(current);
    for (const op of challenge.ops) {
      await sleep(stepDelay(260));
      if (token !== runToken.current) return;
      current = applyOp(current, op);
      setState(current);
    }
    if (challenge.lookupKey) {
      setKey(challenge.lookupKey);
      stepper.start(traceGet(current, challenge.lookupKey).frames);
    }
  };

  const view = stepper.frame ?? { state };
  const shown = view.state;
  const { stats, config } = shown;

  return (
    <div className="lab">
      <div className="lab-main">
        <div className="toolbar">
          <label>
            key
            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="e.g. apple" maxLength={24} />
          </label>
          <label>
            value
            <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. 42" maxLength={24} />
          </label>
          <button className="primary" onClick={() => write('put')} disabled={!key.trim()}>
            put
          </button>
          <button onClick={() => write('delete')} disabled={!key.trim()}>
            delete
          </button>
          <button onClick={get} disabled={!key.trim()}>
            get
          </button>
          <span className="divider" />
          <button onClick={randomWrites}>5 random writes</button>
          <button onClick={() => play(traceOp(state, { type: 'flush' }))}>flush</button>
          <button onClick={() => play(traceOp(state, { type: 'compact' }))}>compact all</button>
          <button onClick={() => reset()}>reset</button>
        </div>

        <details className="config">
          <summary>Engine settings (changing one resets the engine)</summary>
          <div className="toolbar">
            <label>
              memtable flushes at
              <select value={config.memtableLimit} onChange={(e) => reset({ ...config, memtableLimit: Number(e.target.value) })}>
                {[2, 3, 4, 5, 6, 8].map((n) => (
                  <option key={n} value={n}>
                    {n} keys
                  </option>
                ))}
              </select>
            </label>
            <label>
              size-tiered threshold
              <select value={config.tierThreshold} onChange={(e) => reset({ ...config, tierThreshold: Number(e.target.value) })}>
                {[2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} segments
                  </option>
                ))}
              </select>
            </label>
            <label>
              Bloom filter
              <select value={config.bloomBits} onChange={(e) => reset({ ...config, bloomBits: Number(e.target.value) })}>
                {[8, 16, 32, 64].map((n) => (
                  <option key={n} value={n}>
                    {n} bits
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={config.autoCompact} onChange={(e) => reset({ ...config, autoCompact: e.target.checked })} />
              auto-compact
            </label>
          </div>
        </details>

        <StepControls stepper={stepper} idle="Put a few keys to watch the write path one step at a time: WAL, memtable, flush, and compaction." />

        <LsmView frame={view} details />

        <dl className="stats">
          <div>
            <dt>App writes</dt>
            <dd>{stats.logicalWrites}</dd>
          </div>
          <div>
            <dt>WAL writes</dt>
            <dd>{stats.walWrites}</dd>
          </div>
          <div>
            <dt>Flushed entries</dt>
            <dd>{stats.flushWrites}</dd>
          </div>
          <div>
            <dt>Compacted entries</dt>
            <dd>{stats.compactionWrites}</dd>
          </div>
          <div>
            <dt>Write amplification</dt>
            <dd>{writeAmplification(stats).toFixed(2)}×</dd>
          </div>
          <div>
            <dt>On disk / live keys</dt>
            <dd>
              {diskEntries(shown)} / {liveKeyCount(shown)}
            </dd>
          </div>
        </dl>

        {state.events.length > 0 && (
          <ol className="event-log" aria-label="Recent events">
            {state.events
              .slice()
              .reverse()
              .map((event, i) => (
                <li key={`${state.events.length - i}`}>{event}</li>
              ))}
          </ol>
        )}
      </div>
      <aside className="lab-side">
        <ChallengeList labId="lsm" onRun={runChallenge} />
      </aside>
    </div>
  );
}
