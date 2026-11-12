import { useEffect, useMemo, useRef, useState } from 'react';
import { StepControls } from '../components/StepControls.tsx';
import { useStepper } from '../lib/useStepper.ts';
import {
  buildHashIndex,
  indexReadFrames,
  lineOffsets,
  rebuildFrames,
  recordLine,
  scanFrames,
  setFrames,
  staleLines,
  type LogFrame,
  type LogRecord,
} from './logic/storage.ts';

const SEED: LogRecord[] = [
  { key: 'user:7', value: '{"name":"Ana"}' },
  { key: 'user:9', value: '{"name":"Bo"}' },
  { key: 'user:3', value: '{"name":"Cy"}' },
  { key: 'user:7', value: '{"name":"Ana Li"}' },
];

interface AppendLogWidgetProps {
  /** Start with an in-memory hash index switched on. */
  withIndex?: boolean;
  /** Offer "crash & restart" to show the index is lost and must be rebuilt. */
  allowCrash?: boolean;
}

/** The two-function key-value store: append on write, scan (or use a hash index) on read. */
export function AppendLogWidget({ withIndex = false, allowCrash = false }: AppendLogWidgetProps) {
  const [log, setLog] = useState<LogRecord[]>(SEED);
  const [indexOn, setIndexOn] = useState(withIndex);
  const [index, setIndex] = useState<Map<string, number> | null>(() => buildHashIndex(SEED));
  const [key, setKey] = useState('user:7');
  const [value, setValue] = useState('{"name":"Ana Lee"}');
  const stepper = useStepper<LogFrame>();
  const listRef = useRef<HTMLOListElement>(null);
  const focusRef = useRef<HTMLLIElement>(null);

  const frame = stepper.frame;
  const view = frame ?? { log, index };
  // A sentinel record makes the last offset equal to the file size.
  const offsets = useMemo(() => lineOffsets([...view.log, { key: '', value: '' }]), [view.log]);
  const stale = useMemo(() => staleLines(view.log), [view.log]);
  const totalBytes = offsets[view.log.length];
  const cleanKey = key.replace(/,/g, '').trim().slice(0, 20);
  const focusLine = frame?.cursor ?? frame?.hit ?? frame?.fresh;

  useEffect(() => {
    // Scroll the list itself; scrollIntoView would also yank the page while auto-playing.
    const list = listRef.current;
    const item = focusRef.current;
    if (!list || !item) return;
    const outer = list.getBoundingClientRect();
    const inner = item.getBoundingClientRect();
    if (inner.top < outer.top) list.scrollTop -= outer.top - inner.top;
    else if (inner.bottom > outer.bottom) list.scrollTop += inner.bottom - outer.bottom;
  }, [focusLine, stepper.index]);

  const write = () => {
    if (!cleanKey) return;
    const record = { key: cleanKey, value: value.trim().slice(0, 30) || '1' };
    const run = setFrames(log, index, record, indexOn);
    setLog(run.log);
    setIndex(run.index);
    stepper.start(run.frames);
  };

  const read = () => {
    if (!cleanKey) return;
    stepper.start(indexOn && index ? indexReadFrames(log, index, cleanKey) : scanFrames(log, indexOn ? index : null, cleanKey));
  };

  const addMany = () => {
    const extra = Array.from({ length: 20 }, () => ({
      key: `user:${Math.floor(Math.random() * 40) + 1}`,
      value: `{"visits":${Math.floor(Math.random() * 90) + 1}}`,
    }));
    const next = [...log, ...extra];
    const nextIndex = index && buildHashIndex(next);
    setLog(next);
    setIndex(nextIndex);
    stepper.start([
      { log: next, index: nextIndex, caption: `Appended ${extra.length} records in one go. Now try get again and watch how much longer the scan takes.` },
    ]);
  };

  const reset = () => {
    setLog(SEED);
    setIndex(buildHashIndex(SEED));
    setIndexOn(withIndex);
    stepper.clear();
  };

  const crash = () => {
    setIndex(null);
    stepper.start([
      {
        log,
        index: null,
        caption: '**Crash!** The process dies and its memory is wiped. data.log survived on disk, but the hash map is gone — reads have to scan until it is rebuilt.',
      },
    ]);
  };

  const rebuild = () => {
    const run = rebuildFrames(log);
    setIndex(run.index);
    stepper.start(run.frames);
  };

  const entries = view.index;

  return (
    <div className="widget-body">
      <div className="toolbar">
        <label>
          key
          <input value={key} onChange={(e) => setKey(e.target.value)} maxLength={20} />
        </label>
        <label>
          value
          <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={30} />
        </label>
        <button className="primary" onClick={write} disabled={!cleanKey}>
          set (append)
        </button>
        <button onClick={read} disabled={!cleanKey}>
          get
        </button>
        <button onClick={addMany}>+ 20 records</button>
        <button onClick={reset}>reset</button>
      </div>
      <div className="toolbar">
        <label className="check">
          <input
            type="checkbox"
            checked={indexOn}
            onChange={(e) => {
              setIndexOn(e.target.checked);
              // Turning the index on builds it with one pass over the data (unless it was lost in a crash).
              if (e.target.checked) setIndex((current) => (current === null ? null : buildHashIndex(log)));
              stepper.clear();
            }}
          />
          keep a hash index in memory
        </label>
        {allowCrash && indexOn && (
          <>
            <button onClick={crash} disabled={index === null}>
              crash &amp; restart
            </button>
            <button onClick={rebuild} disabled={index !== null}>
              rebuild index by scanning
            </button>
          </>
        )}
      </div>

      <div className={`append-log ${indexOn ? 'with-index' : ''}`}>
        <section className="panel">
          <h4>
            data.log <span className="muted small">disk · append-only · {totalBytes} bytes</span>
          </h4>
          <ol className="log-lines" ref={listRef}>
            {view.log.map((record, i) => {
              const classes = [
                stale.has(i) ? 'stale' : '',
                frame?.cursor === i ? 'cursor' : '',
                frame?.matches?.includes(i) ? 'match' : '',
                frame?.hit === i || frame?.fresh === i ? 'result' : '',
              ].join(' ');
              return (
                <li key={i} ref={focusLine === i ? focusRef : undefined} className={classes}>
                  <span className="offset">{offsets[i]}</span>
                  <span className="line">{recordLine(record)}</span>
                  {stale.has(i) && <span className="tag">old version</span>}
                </li>
              );
            })}
            {frame?.eof && (
              <li ref={focusRef} className="eof">
                <span className="offset">{totalBytes}</span>
                <span className="line">▏ next write goes here</span>
              </li>
            )}
          </ol>
        </section>
        {indexOn && (
          <section className="panel">
            <h4>
              hash map <span className="muted small">memory</span>
            </h4>
            {entries === null ? (
              <p className="muted small">Empty — the map lived in RAM and was lost in the crash.</p>
            ) : (
              <table className="mini hash-map">
                <thead>
                  <tr>
                    <th>key</th>
                    <th>byte offset</th>
                  </tr>
                </thead>
                <tbody>
                  {[...entries.entries()]
                    .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
                    .map(([k, line]) => (
                      <tr key={k} className={k === frame?.mapKey ? 'hl' : ''}>
                        <td className="mono">{k}</td>
                        <td className="mono">{offsets[line]}</td>
                      </tr>
                    ))}
                  {entries.size === 0 && (
                    <tr>
                      <td colSpan={2} className="muted small">
                        (empty)
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </section>
        )}
      </div>

      <StepControls stepper={stepper} idle="Try set, then get. Old versions stay in the file — reads must find the newest one." />
    </div>
  );
}

/** Lesson 2 variant: index on, with crash & restart. */
export function HashIndexWidget() {
  return <AppendLogWidget withIndex allowCrash />;
}
