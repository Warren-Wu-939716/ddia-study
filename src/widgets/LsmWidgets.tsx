import { useState } from 'react';
import { StepControls } from '../components/StepControls.tsx';
import { useStepper } from '../lib/useStepper.ts';
import { bloomMightContain, createBloom, type BloomFilter } from '../sims/bloom.ts';
import { bloomAddFrames, bloomCheckFrames, type BloomFrame } from '../sims/bloomTrace.ts';
import { runOps, type LsmConfig, type LsmEntry, type LsmOp } from '../sims/lsm.ts';
import { traceGet, traceOp, type LsmFrame } from '../sims/lsmTrace.ts';
import { BloomBits } from '../sims/ui/BloomBits.tsx';
import { LsmView } from '../sims/ui/LsmView.tsx';
import { mergeFrames, sparseFrames, type MergeFrame, type SparseFrame } from './logic/storage.ts';

// ── Sparse index ─────────────────────────────────────────────────────

const BLOCKS = [
  ['apple', 'apricot', 'avocado', 'banana'],
  ['blueberry', 'cherry', 'coconut', 'date'],
  ['fig', 'grape', 'guava', 'kiwi'],
  ['lemon', 'lime', 'mango', 'melon'],
];

export function SparseIndexWidget() {
  const [key, setKey] = useState('coconut');
  const stepper = useStepper<SparseFrame>();
  const frame = stepper.frame;

  const search = (k: string) => {
    const clean = k.trim().toLowerCase().slice(0, 20);
    if (!clean) return;
    setKey(clean);
    stepper.start(sparseFrames(BLOCKS, clean));
  };

  return (
    <div className="widget-body">
      <div className="toolbar">
        <label>
          key
          <input value={key} onChange={(e) => setKey(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && search(key)} maxLength={20} />
        </label>
        <button className="primary" onClick={() => search(key)}>
          look up
        </button>
        <span className="muted small">try:</span>
        {['coconut', 'cranberry', 'fig', 'aardvark', 'zucchini'].map((k) => (
          <button key={k} className="chip" onClick={() => search(k)}>
            {k}
          </button>
        ))}
      </div>
      <div className="sparse">
        <section className="panel">
          <h4>
            sparse index <span className="muted small">memory · first key of each block</span>
          </h4>
          <table className="mini">
            <tbody>
              {BLOCKS.map((block, i) => (
                <tr key={i} className={frame?.block === i ? 'hl' : ''}>
                  <td className="mono">{block[0]}</td>
                  <td className="muted">→ block {i}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="panel">
          <h4>
            SSTable file <span className="muted small">disk · sorted · blocks of a few KB (compressible)</span>
          </h4>
          <div className="blocks">
            {BLOCKS.map((block, i) => {
              const target = frame?.block === i;
              const opened = target && frame.opened;
              const state = !frame ? '' : opened ? 'opened' : target ? 'target' : 'skipped';
              return (
                <div key={i} className={`block ${state}`}>
                  <span className="block-label">block {i}</span>
                  {block.map((k) => {
                    const order = opened ? frame.scanned.indexOf(k) : -1;
                    const hit = opened && frame.found && k === frame.scanned.at(-1);
                    return (
                      <span key={k} className={`key ${order >= 0 ? 'scanned' : ''} ${hit ? 'found' : ''}`}>
                        {order >= 0 && <sup>{order + 1}</sup>}
                        {k}
                      </span>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </section>
      </div>
      <StepControls stepper={stepper} idle="Pick a key. Only one block should ever need to be read." />
    </div>
  );
}

// ── LSM write & read path ────────────────────────────────────────────

const MINI_CONFIG: LsmConfig = { memtableLimit: 3, tierThreshold: 99, bloomBits: 32, bloomHashes: 2, autoCompact: false };
const put = (key: string, value: string): LsmOp => ({ type: 'put', key, value });
const MINI_OPS: LsmOp[] = [
  put('apple', 'red'),
  put('fig', 'purple'),
  put('kiwi', 'green'),
  put('apple', 'green'),
  { type: 'delete', key: 'fig' },
  put('lime', 'green'),
  put('date', 'brown'),
];

export function LsmMiniWidget() {
  const [state, setState] = useState(() => runOps(MINI_CONFIG, MINI_OPS));
  const [key, setKey] = useState('fig');
  const [value, setValue] = useState('');
  const stepper = useStepper<LsmFrame>();

  const apply = (op: LsmOp) => {
    const { frames, final } = traceOp(state, op);
    setState(final);
    stepper.start(frames);
  };

  const clean = key.trim().slice(0, 16);
  const get = (k: string) => {
    setKey(k);
    stepper.start(traceGet(state, k).frames);
  };

  return (
    <div className="widget-body">
      <div className="toolbar">
        <label>
          key
          <input value={key} onChange={(e) => setKey(e.target.value)} maxLength={16} />
        </label>
        <label>
          value
          <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={16} placeholder="e.g. yellow" />
        </label>
        <button className="primary" disabled={!clean} onClick={() => apply(put(clean, value.trim().slice(0, 16) || 'x'))}>
          put
        </button>
        <button disabled={!clean} onClick={() => apply({ type: 'delete', key: clean })}>
          delete
        </button>
        <button disabled={!clean} onClick={() => get(clean)}>
          get
        </button>
        <button onClick={() => apply({ type: 'compact' })}>compact all</button>
        <button
          onClick={() => {
            setState(runOps(MINI_CONFIG, MINI_OPS));
            stepper.clear();
          }}
        >
          reset
        </button>
      </div>
      <div className="toolbar">
        <span className="muted small">quick get:</span>
        {['apple', 'fig', 'kiwi', 'date', 'plum'].map((k) => (
          <button key={k} className="chip" onClick={() => get(k)}>
            {k}
          </button>
        ))}
      </div>
      <LsmView frame={stepper.frame ?? { state }} />
      <StepControls stepper={stepper} idle="The memtable holds 3 keys here. Put a key to watch the write path; the third write triggers a flush to a new sorted SSTable." />
    </div>
  );
}

// ── Merging segments step by step ────────────────────────────────────

const NEWER: LsmEntry[] = [
  { key: 'apple', value: '3' },
  { key: 'fig', value: '9' },
  { key: 'kiwi', value: null },
];
const OLDER: LsmEntry[] = [
  { key: 'apple', value: '1' },
  { key: 'banana', value: '2' },
  { key: 'kiwi', value: '5' },
];
const RUNS = [NEWER, OLDER];
const RUN_NAMES = ['newer segment', 'older segment'];

const show = (e: LsmEntry) => `${e.key}=${e.value ?? '✝'}`;

export function MergeWidget() {
  const [dropTombstones, setDropTombstones] = useState(false);
  const stepper = useStepper<MergeFrame>();
  const frame = stepper.frame;
  const heads = frame?.heads ?? RUNS.map(() => 0);
  const output = frame?.output ?? [];

  return (
    <div className="widget-body">
      <div className="toolbar">
        <button className="primary" onClick={() => stepper.start(mergeFrames(RUNS, RUN_NAMES, dropTombstones))}>
          {frame ? 'restart merge' : 'run merge'}
        </button>
        <label className="check">
          <input
            type="checkbox"
            checked={dropTombstones}
            onChange={(e) => {
              setDropTombstones(e.target.checked);
              if (frame) stepper.start(mergeFrames(RUNS, RUN_NAMES, e.target.checked));
            }}
          />
          output becomes the oldest segment
        </label>
      </div>
      <div className="merge">
        {RUNS.map((run, r) => (
          <div key={r} className="merge-row">
            <span className="merge-label">{RUN_NAMES[r]}</span>
            {run.map((entry, i) => {
              const candidate = frame?.candidates.find((c) => c.run === r && c.entry === entry);
              const role = !candidate ? '' : frame?.phase === 'compare' ? 'smallest' : frame?.candidates[0] === candidate ? 'winner' : 'loser';
              return (
                <span
                  key={entry.key}
                  className={`cell ${i < heads[r] && !candidate ? 'consumed' : ''} ${i === heads[r] && frame ? 'head' : ''} ${role} ${entry.value === null ? 'tomb' : ''}`}
                >
                  {show(entry)}
                </span>
              );
            })}
          </div>
        ))}
        <div className="merge-row output">
          <span className="merge-label">output</span>
          {output.map((entry, i) => (
            <span key={entry.key} className={`cell out ${entry.value === null ? 'tomb' : ''} ${frame?.phase === 'emit' && i === output.length - 1 && frame.candidates[0]?.entry === entry ? 'fresh' : ''}`}>
              {show(entry)}
            </span>
          ))}
          {frame?.phase === 'done' && <span className="muted small">done — sorted, one entry per key</span>}
        </div>
      </div>
      <StepControls stepper={stepper} idle="Both inputs are sorted. Run the merge: each step compares the front of each input, then copies the smallest key to the output." />
      <p className="muted small">Outlined cells are the current front of each input — the only entries the merge needs in memory. ✝ = tombstone.</p>
    </div>
  );
}

// ── Bloom filter ─────────────────────────────────────────────────────

const BITS = 16;
const HASHES = 3;
const WORDS = ['ant', 'bat', 'bee', 'cow', 'eel', 'elk', 'gnu', 'hen', 'jay', 'kid', 'koi', 'lynx', 'mole', 'newt', 'orca', 'pig', 'ram', 'seal', 'toad', 'wolf', 'yak', 'zebu'];

export function BloomMiniWidget() {
  const [filter, setFilter] = useState<BloomFilter>(() => createBloom(BITS, HASHES));
  const [keys, setKeys] = useState<string[]>([]);
  const [input, setInput] = useState('cat');
  const [batch, setBatch] = useState<{ tested: number; falsePositives: string[] } | null>(null);
  const stepper = useStepper<BloomFrame>();
  const frame = stepper.frame;

  const clean = input.trim().toLowerCase().slice(0, 16);
  const add = (k: string) => {
    if (!k) return;
    if (keys.includes(k)) {
      stepper.start([{ bits: filter.bits, positions: [], visited: 0, caption: `\`${k}\` is already in the filter — adding it again would set the same bits.` }]);
      return;
    }
    const { frames, final } = bloomAddFrames(filter, k);
    setFilter(final);
    setKeys([...keys, k]);
    setBatch(null);
    stepper.start(frames);
  };
  const check = (k: string) => {
    if (k) stepper.start(bloomCheckFrames(filter, k, keys.includes(k)));
  };
  const probeMany = () => {
    const absent = WORDS.filter((w) => !keys.includes(w));
    setBatch({ tested: absent.length, falsePositives: absent.filter((w) => bloomMightContain(filter, w)) });
  };

  const bits = frame?.bits ?? filter.bits;
  const setBits = filter.bits.filter(Boolean).length;

  return (
    <div className="widget-body">
      <div className="toolbar">
        <label>
          word
          <input value={input} onChange={(e) => setInput(e.target.value)} maxLength={16} />
        </label>
        <button className="primary" onClick={() => add(clean)} disabled={!clean}>
          add
        </button>
        <button onClick={() => check(clean)} disabled={!clean}>
          check
        </button>
        <button onClick={probeMany} disabled={keys.length === 0}>
          check {WORDS.length} other animals
        </button>
        <button
          onClick={() => {
            setFilter(createBloom(BITS, HASHES));
            setKeys([]);
            setBatch(null);
            stepper.clear();
          }}
        >
          clear
        </button>
      </div>
      <BloomBits bits={bits} frame={frame} />
      <StepControls
        stepper={stepper}
        tone={frame?.verdict === 'maybe-false' ? 'warn' : undefined}
        idle="Add a few words (cat, dog, owl…), then check words you did and didn’t add."
      />
      <p className="muted small">
        {keys.length} word{keys.length === 1 ? '' : 's'} in a {BITS}-bit filter ({keys.length ? (BITS / keys.length).toFixed(1) : '—'} bits per word), {setBits} bits set
        {batch && ` · ${batch.falsePositives.length} of ${batch.tested} absent animals got “maybe”${batch.falsePositives.length ? `: ${batch.falsePositives.join(', ')}` : ''}`}.
      </p>
    </div>
  );
}
