import { useMemo, useState } from 'react';
import { StepControls } from '../components/StepControls.tsx';
import { useStepper } from '../lib/useStepper.ts';
import { createBTree, insertMany } from '../sims/btree.ts';
import { traceFind, traceInsert, treeModel, type BTreeFrame } from '../sims/btreeTrace.ts';
import { TreeView } from '../sims/ui/TreeView.tsx';
import { crashFrames, SPLIT_STEP_LABELS, splitSteps, type CrashFrame, type SplitPages, type WalRecordState } from './logic/storage.ts';

const START_KEYS = [10, 20, 30, 40, 50, 60, 70];

export function BTreeMiniWidget() {
  const [tree, setTree] = useState(() => insertMany(createBTree(3), START_KEYS));
  const [input, setInput] = useState('25');
  const stepper = useStepper<BTreeFrame>();
  const committed = useMemo(() => treeModel(tree), [tree]);

  const parsed = Number.parseInt(input, 10);
  const valid = Number.isInteger(parsed) && parsed >= 0 && parsed <= 999;

  const insert = (key: number) => {
    const { frames, final } = traceInsert(tree, key);
    setTree(final);
    stepper.start(frames);
  };

  const find = (key: number) => stepper.start(traceFind(tree, key).frames);

  const maxKey = Math.max(...Object.values(tree.pages).flatMap((p) => (p.type === 'leaf' ? p.keys : [0])));
  const frame = stepper.frame;

  return (
    <div className="widget-body">
      <div className="toolbar">
        <label>
          key
          <input inputMode="numeric" value={input} onChange={(e) => setInput(e.target.value)} maxLength={3} />
        </label>
        <button className="primary" disabled={!valid} onClick={() => insert(parsed)}>
          insert
        </button>
        <button disabled={!valid} onClick={() => find(parsed)}>
          find
        </button>
        <button onClick={() => insert(maxKey + 10)}>insert {maxKey + 10}</button>
        <button
          onClick={() => {
            setTree(insertMany(createBTree(3), START_KEYS));
            stepper.clear();
          }}
        >
          reset
        </button>
      </div>
      <TreeView tree={frame?.tree ?? committed} read={frame?.read} written={frame?.written} overflow={frame?.overflow} maxWidth={640} />
      <p className="legend small muted">
        <span className="swatch read" /> read so far <span className="swatch written" /> written in this step <span className="swatch overflow" /> too full — must split
      </p>
      <StepControls stepper={stepper} idle="Pages hold at most 3 keys here (real pages hold hundreds). Insert keys to see splits, or find one to see the path." />
    </div>
  );
}

const PAGE_TEXT = {
  parent: { old: '… │ 333 │ 345 │ …', new: '… │ 333 │ 337 │ 345 │ …' },
  left: { old: '333 │ 335 │ 337 │ 340', new: '333 │ 334 │ 335' },
  right: { missing: '(never written)', new: '337 │ 340' },
} as const;

const WAL_TEXT: Record<WalRecordState, string> = {
  none: 'empty',
  buffered: 'split record written — but only to the operating system’s buffer, not yet on disk',
  durable: 'split record durable (fsynced)',
  lost: 'empty — the record was still in the operating system’s buffer and was lost in the crash',
};

function Pages({ pages, title, orphan }: { pages: SplitPages; title: string; orphan?: boolean }) {
  return (
    <div className="split-pages">
      <h5>{title}</h5>
      <div className={`split-page ${pages.parent}`} data-flip="split-P" data-flip-state={pages.parent}>
        <span className="name">P</span> {PAGE_TEXT.parent[pages.parent]}
      </div>
      <div className="split-children">
        <div className={`split-page ${pages.left}`} data-flip="split-L" data-flip-state={pages.left}>
          <span className="name">L</span> {PAGE_TEXT.left[pages.left]}
        </div>
        <div className={`split-page ${pages.right} ${orphan ? 'orphan' : ''}`} data-flip="split-R" data-flip-state={pages.right} data-flip-from="split-L">
          <span className="name">R</span> {PAGE_TEXT.right[pages.right]}
          {orphan && <em> orphan</em>}
        </div>
      </div>
    </div>
  );
}

const PHASE_TITLE: Record<CrashFrame['phase'], string> = {
  write: 'On disk',
  crash: 'On disk at the crash',
  restart: 'On disk at restart',
  result: 'After recovery',
};

/** Crash a page split at any point, with or without a write-ahead log, and see what survives. */
export function WalCrashWidget() {
  const [withWal, setWithWal] = useState(false);
  const [crashAfter, setCrashAfter] = useState<number | null>(null);
  const stepper = useStepper<CrashFrame>();
  const steps = splitSteps(withWal);
  const frame = stepper.frame;

  const crashAt = (completed: number) => {
    setCrashAfter(completed);
    stepper.start(crashFrames(withWal, completed));
  };

  const pages: SplitPages = frame?.pages ?? { parent: 'old', left: 'old', right: 'missing' };
  // R is only an orphan once nothing more will be written.
  const orphan = frame !== undefined && frame.phase !== 'write' && pages.right === 'new' && pages.parent === 'old';
  const tone = frame?.outcome ? (frame.outcome.consistent ? 'ok' : 'error') : undefined;

  return (
    <div className="widget-body">
      <p className="small">
        Inserting <strong>334</strong> into the full leaf <strong>L</strong> splits it: L keeps the left half, a new page <strong>R</strong> gets
        the right half, and the parent <strong>P</strong> gains the boundary 337. Pick a moment to pull the plug.
      </p>
      <div className="toolbar">
        <label className="check">
          <input
            type="checkbox"
            checked={withWal}
            onChange={(e) => {
              setWithWal(e.target.checked);
              setCrashAfter(null);
              stepper.clear();
            }}
          />
          use a write-ahead log
        </label>
      </div>
      <ol className="crash-steps">
        <li>
          <button className={crashAfter === 0 ? 'selected' : ''} onClick={() => crashAt(0)}>
            crash before anything
          </button>
        </li>
        {steps.map((step, i) => {
          const done = frame !== undefined && i < frame.done;
          const current = frame?.phase === 'write' && i === frame.done - 1;
          return (
            <li key={step} className={`${done ? 'done' : ''} ${current ? 'current' : ''}`}>
              <span className="step-label">
                {i + 1}. {SPLIT_STEP_LABELS[step]}
              </span>
              <button className={crashAfter === i + 1 ? 'selected' : ''} onClick={() => crashAt(i + 1)}>
                {i === steps.length - 1 ? 'finish, then crash' : 'crash after this'}
              </button>
            </li>
          );
        })}
      </ol>
      {frame && (
        <div className={`split-compare phase-${frame.phase}`}>
          <Pages pages={pages} title={PHASE_TITLE[frame.phase]} orphan={orphan} />
          {withWal && (
            <div className={`split-pages wal-box wal-${frame.wal}`} data-flip="split-WAL" data-flip-state={frame.wal}>
              <h5>WAL</h5>
              <p className="small">{WAL_TEXT[frame.wal]}</p>
            </div>
          )}
        </div>
      )}
      <StepControls stepper={stepper} tone={tone} idle="Choose a crash point. Try it without the WAL first, then switch the WAL on." />
    </div>
  );
}
