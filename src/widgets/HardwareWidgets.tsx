import { useState } from 'react';
import { StepControls } from '../components/StepControls.tsx';
import { useStepper } from '../lib/useStepper.ts';
import { btreeWriteAmplification, layoutFiles, lsmWriteAmplification, ssdDeleteFrames, type FlashCell, type FlashFile, type SsdFrame } from './logic/storage.ts';

const FILES: FlashFile[] = [
  { name: 'A', pages: 4 },
  { name: 'B', pages: 4 },
  { name: 'C', pages: 4 },
];

const same = (cell: [number, number] | undefined, b: number, i: number) => cell !== undefined && cell[0] === b && cell[1] === i;

/** Flash erases whole blocks: delete a file and watch garbage collection copy still-valid pages before erasing. */
export function SsdGcWidget() {
  const [pattern, setPattern] = useState<'sequential' | 'scattered'>('sequential');
  const stepper = useStepper<SsdFrame>();
  const layout = layoutFiles(FILES, pattern);
  const frame = stepper.frame;
  const blocks: FlashCell[][] = frame?.blocks ?? layout;

  return (
    <div className="widget-body">
      <div className="toolbar">
        <div className="segmented" role="radiogroup" aria-label="Write pattern">
          {(['sequential', 'scattered'] as const).map((p) => (
            <button
              key={p}
              role="radio"
              aria-checked={pattern === p}
              className={pattern === p ? 'selected' : ''}
              onClick={() => {
                setPattern(p);
                stepper.clear();
              }}
            >
              {p === 'sequential' ? 'sequential writes (LSM-style)' : 'scattered writes (random)'}
            </button>
          ))}
        </div>
        <button className="primary" onClick={() => (frame ? stepper.clear() : stepper.start(ssdDeleteFrames(layout, 'B')))}>
          {frame ? 'undo delete' : 'delete file B'}
        </button>
      </div>
      <div className="flash">
        {blocks.map((block, b) => (
          <div key={b} className={`flash-block ${frame?.victim === b ? 'affected' : ''}`}>
            <span className="block-label">erase block {b}</span>
            {block.map((page, i) => {
              const classes = ['flash-page', page ? `file-${page.file}` : 'free', page?.stale ? 'stale' : '', same(frame?.to, b, i) ? 'copied' : '', same(frame?.from, b, i) ? 'moved-out' : ''];
              return (
                <span key={i} className={classes.join(' ')}>
                  {page ? `${page.file}${page.part}` : 'free'}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      {frame && <p className="small muted">Extra page writes by garbage collection so far: {frame.copies}</p>}
      <StepControls
        stepper={stepper}
        idle="Each file has 4 pages; an erase block holds 4 pages. Pages can be written one at a time, but only a whole block can be erased."
      />
    </div>
  );
}

const VALUE_SIZES = [16, 100, 500, 1000, 4000];
const PAGE_SIZES = [4096, 8192, 16384];

/** Simplified model of bytes written per byte of new data. */
export function WriteAmpWidget() {
  const [valueBytes, setValueBytes] = useState(100);
  const [pageBytes, setPageBytes] = useState(8192);
  const [batched, setBatched] = useState(1);
  const [rewrites, setRewrites] = useState(3);

  const btree = btreeWriteAmplification(valueBytes, pageBytes, batched);
  const lsm = lsmWriteAmplification(rewrites);
  const max = Math.max(btree, lsm);

  return (
    <div className="widget-body">
      <div className="toolbar">
        <label>
          value size
          <select value={valueBytes} onChange={(e) => setValueBytes(Number(e.target.value))}>
            {VALUE_SIZES.map((v) => (
              <option key={v} value={v}>
                {v} bytes
              </option>
            ))}
          </select>
        </label>
        <label>
          B-tree page
          <select value={pageBytes} onChange={(e) => setPageBytes(Number(e.target.value))}>
            {PAGE_SIZES.map((v) => (
              <option key={v} value={v}>
                {v / 1024} KiB
              </option>
            ))}
          </select>
        </label>
        <label>
          updates buffered per page write
          <input type="range" min={1} max={50} value={batched} onChange={(e) => setBatched(Number(e.target.value))} />
          <span className="mono">{batched}</span>
        </label>
        <label>
          LSM compactions per key
          <input type="range" min={0} max={8} value={rewrites} onChange={(e) => setRewrites(Number(e.target.value))} />
          <span className="mono">{rewrites}</span>
        </label>
      </div>
      <div className="bars">
        <div className="bar-row">
          <span>B-tree</span>
          <span className="bar" style={{ width: `${(btree / max) * 100}%` }} />
          <span className="mono">{btree.toFixed(1)}×</span>
        </div>
        <div className="bar-row">
          <span>LSM-tree</span>
          <span className="bar column" style={{ width: `${(lsm / max) * 100}%` }} />
          <span className="mono">{lsm.toFixed(1)}×</span>
        </div>
      </div>
      <p className="widget-status" role="status">
        B-tree: 1× for the WAL + a whole {pageBytes / 1024} KiB page for a {valueBytes}-byte change
        {batched > 1 ? `, shared by ${batched} updates that landed on the same page before it was written` : ''}. LSM: 1× WAL + 1× flush +{' '}
        {rewrites}× compaction.
      </p>
      <p className="muted small">
        A teaching model: it ignores compression (which favours LSM) and caching details. Notice how small values and unbuffered page writes hurt
        B-trees, while every extra compaction level costs LSM another full rewrite.
      </p>
    </div>
  );
}
