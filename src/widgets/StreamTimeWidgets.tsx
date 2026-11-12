import { useState } from 'react';
import { Segmented } from '../components/Segmented.tsx';
import { StepControls } from '../components/StepControls.tsx';
import { useStepper } from '../lib/useStepper.ts';
import { joinFrames, type JoinFrame, type JoinMode, type JoinVariant } from './logic/streamJoins.ts';
import { DEPOSITS, effectFrames, eventTimeFrames, type EffectFrame, type EffectMode, type RateFrame } from './logic/streams.ts';
import { clock, GRACE, span, WINDOW_EVENTS, WINDOW_RULES, windowFrames, type LatePolicy, type WindowFrame, type WindowKind } from './logic/streamTime.ts';

// ── Event time vs processing time ────────────────────────────────────

function Bars({ title, values, highlight }: { title: string; values: readonly number[]; highlight?: number }) {
  const max = 20;
  return (
    <section className="panel">
      <h4>{title}</h4>
      <div className="rate-bars" role="img" aria-label={`${title}: ${values.join(', ')}`}>
        {values.map((v, i) => (
          <div key={i} className={`rate-bar ${highlight === i ? 'current' : ''}`}>
            <span className="rate-fill" style={{ height: `${(v / max) * 100}%` }} />
            <span className="rate-value" data-flip={`${title}:${i}`}>
              {v}
            </span>
            <span className="rate-minute">{i}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function EventTimeWidget() {
  const stepper = useStepper<RateFrame>();
  const frame = stepper.frame;
  const empty = new Array<number>(6).fill(0);

  return (
    <div className="widget-body">
      <div className="toolbar">
        <button className="primary" onClick={() => stepper.start(eventTimeFrames())}>
          run six minutes
        </button>
        {frame && (
          <span className="small">
            processor: <strong className={frame.processorUp ? 'ok' : 'error'}>{frame.processorUp ? 'running' : 'down (redeploy)'}</strong> · waiting in broker: {frame.backlog}
          </span>
        )}
      </div>
      <div className="rate-layout">
        <Bars title="requests per minute, by processing time" values={frame?.byProcessingTime ?? empty} highlight={frame?.minute} />
        <Bars title="requests per minute, by event time" values={frame?.byEventTime ?? empty} highlight={frame?.minute} />
      </div>
      <StepControls stepper={stepper} idle="Ten requests happen every minute. The stream processor that counts them is redeployed during minute 3." />
    </div>
  );
}

// ── Window types and stragglers ──────────────────────────────────────

const TIMELINE = 330;
const W = 600;
const x = (t: number) => ((t + 60) / (TIMELINE + 60)) * W;

export function WindowsWidget() {
  const [kind, setKind] = useState<WindowKind>('tumbling');
  const [policy, setPolicy] = useState<LatePolicy>('drop');
  const stepper = useStepper<WindowFrame>();
  const frame = stepper.frame;
  const run = (k: WindowKind, p: LatePolicy) => stepper.start(windowFrames(k, p));
  const windows = frame?.windows ?? [];
  const rowH = 18;
  const top = 46;
  const height = top + Math.max(1, windows.length) * rowH + 10;

  return (
    <div className="widget-body">
      <div className="toolbar">
        <Segmented
          label="Window type"
          value={kind}
          options={[
            ['tumbling', 'tumbling'],
            ['hopping', 'hopping'],
            ['sliding', 'sliding'],
            ['session', 'session'],
          ]}
          onChange={(k) => {
            setKind(k);
            run(k, policy);
          }}
        />
        <Segmented
          label="Late events"
          value={policy}
          options={[
            ['drop', 'drop stragglers'],
            ['correct', 'publish corrections'],
          ]}
          onChange={(p) => {
            setPolicy(p);
            run(kind, p);
          }}
        />
        <button className="primary" onClick={() => run(kind, policy)}>
          run
        </button>
      </div>
      <p className="small muted">
        {WINDOW_RULES[kind].label}. A window is reported once events have moved {GRACE}s past its end. Arrival order: {WINDOW_EVENTS.map((e) => e.id).join(', ')}.
      </p>
      <div className="timeline-wrap">
        <svg className="timeline" viewBox={`0 0 ${W} ${height}`} role="img" aria-label="Events placed by event time, with windows below">
          {Array.from({ length: 7 }, (_, i) => (i - 1) * 60).map((t) => (
            <g key={t}>
              <line x1={x(t)} y1={14} x2={x(t)} y2={height} className="grid" />
              <text x={x(t) + 2} y={10} className="axis">
                {clock(t).slice(0, -3)}
              </text>
            </g>
          ))}
          {frame && <line x1={x(frame.watermark)} y1={14} x2={x(frame.watermark)} y2={height} className="watermark" data-flip="watermark" />}
          {WINDOW_EVENTS.map((e) => {
            const arrived = frame?.arrived.includes(e.id);
            const dropped = frame?.dropped.includes(e.id);
            return (
              <g key={e.id} className={`ev ${arrived ? 'arrived' : ''} ${frame?.current === e.id ? 'current' : ''} ${dropped ? 'dropped' : ''}`} data-flip={`ev:${e.id}`}>
                <circle cx={x(e.t)} cy={30} r={6} />
                <text x={x(e.t)} y={44} textAnchor="middle" className="ev-label">
                  {e.id}
                </text>
              </g>
            );
          })}
          {windows.map((w, i) => (
            <g key={w.id} className={`win ${w.emitted ? 'emitted' : 'open'} ${w.corrected ? 'corrected' : ''}`} data-flip={`win:${w.id}`} data-flip-from={frame?.current ? `ev:${frame.current}` : undefined}>
              <rect x={x(w.start)} y={top + i * rowH} width={Math.max(4, x(w.end) - x(w.start))} height={rowH - 4} rx={3} />
              <text x={x(w.start) + 4} y={top + i * rowH + 11} className="win-label">
                {w.events.length} {w.emitted ? (w.corrected ? '(corrected)' : '(reported)') : ''}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <p className="legend small muted">
        Bars are windows (solid = reported, dashed = still open, orange = corrected). The red line is how far event time has progressed minus the grace period.
        {frame && frame.dropped.length > 0 && ` Dropped: ${frame.dropped.join(', ')}.`}
      </p>
      {frame && windows.length > 0 && (
        <p className="small mono">{windows.map((w) => `${span(w.start, w.end)}: ${w.events.join(' ') || '—'}`).join(' · ')}</p>
      )}
      <StepControls stepper={stepper} idle="Seven events, placed by when they happened. The last one to arrive (e7) actually happened early — a straggler." />
    </div>
  );
}

// ── Stream joins ─────────────────────────────────────────────────────

export function StreamJoinsWidget() {
  const [mode, setMode] = useState<JoinMode>('stream-stream');
  const [variant, setVariant] = useState<JoinVariant>('as-sent');
  const stepper = useStepper<JoinFrame>();
  const frame = stepper.frame;

  return (
    <div className="widget-body">
      <div className="toolbar">
        <Segmented
          label="Join type"
          value={mode}
          options={[
            ['stream-stream', 'stream–stream'],
            ['stream-table', 'stream–table'],
            ['table-table', 'table–table'],
          ]}
          onChange={(m) => {
            setMode(m);
            stepper.start(joinFrames(m, variant));
          }}
        />
        {mode === 'stream-table' && (
          <Segmented
            label="Arrival order"
            value={variant}
            options={[
              ['as-sent', 'view arrives first'],
              ['update-first', 'update arrives first'],
            ]}
            onChange={(v) => {
              setVariant(v);
              stepper.start(joinFrames(mode, v));
            }}
          />
        )}
        <button className="primary" onClick={() => stepper.start(joinFrames(mode, variant))}>
          run
        </button>
      </div>
      {frame && (
        <div className="join-layout">
          <section className="panel">
            <h4>inputs, in arrival order</h4>
            <ol className="small change-log">
              {frame.inputs.map((input, i) => (
                <li key={i} className={`${i < frame.processed ? 'applied' : ''} ${i === frame.processed - 1 ? 'current' : ''}`} data-flip={`in${i}`}>
                  <span className={`stream-tag s-${input.stream.replace(/\s/g, '-')}`}>{input.stream}</span> {input.text}
                </li>
              ))}
            </ol>
          </section>
          <section className="panel">
            {frame.state.map((s) => (
              <div key={s.label}>
                <h4>{s.label}</h4>
                <ul className="small mono join-state">
                  {s.rows.length ? (
                    s.rows.map((r) => (
                      <li key={r} data-flip={`state:${s.label}:${r}`} data-flip-from={`in${frame.processed - 1}`}>
                        {r}
                      </li>
                    ))
                  ) : (
                    <li className="muted">empty</li>
                  )}
                </ul>
              </div>
            ))}
          </section>
          <section className="panel">
            <h4>output stream</h4>
            <ol className="small change-log">
              {frame.output.map((o, i) => (
                <li key={i} className={i === frame.fresh ? 'current' : 'applied'} data-flip={`out${i}`} data-flip-from={`in${frame.processed - 1}`}>
                  {o}
                </li>
              ))}
              {frame.output.length === 0 && <li className="muted">nothing yet</li>}
            </ol>
          </section>
        </div>
      )}
      <StepControls stepper={stepper} idle="Pick a join type and run it. Watch what the processor has to remember (its state) to produce each output." />
    </div>
  );
}

// ── Exactly-once effects ─────────────────────────────────────────────

export function ExactlyOnceWidget() {
  const [mode, setMode] = useState<EffectMode>('naive');
  const stepper = useStepper<EffectFrame>();
  const frame = stepper.frame;
  const correct = DEPOSITS.reduce((a, b) => a + b, 0);
  const done = frame?.phase === 'done';

  return (
    <div className="widget-body">
      <div className="toolbar">
        <Segmented
          label="How the write is made safe"
          value={mode}
          options={[
            ['naive', 'plain write'],
            ['idempotent', 'idempotent write'],
            ['atomic', 'atomic commit'],
          ]}
          onChange={(m) => {
            setMode(m);
            stepper.start(effectFrames(m));
          }}
        />
        <button className="primary" onClick={() => stepper.start(effectFrames(mode))}>
          run
        </button>
      </div>
      <div className="effect-layout">
        <section className="panel">
          <h4>deposits topic</h4>
          <div className="stream-row">
            {DEPOSITS.map((amount, offset) => (
              <span key={offset} className="broker-slot">
                <span className={`chip-static msg-chip ${frame?.current === offset ? 'current' : ''} ${frame && offset < frame.committed ? 'sent' : ''}`} data-flip={`dep${offset}`}>
                  <sup>{offset}</sup>+{amount}
                </span>
                {frame?.committed === offset && (
                  <span className="broker-marker committed g0" data-flip="committed">
                    ✓ committed
                  </span>
                )}
              </span>
            ))}
            {frame?.committed === DEPOSITS.length && (
              <span className="broker-marker committed g0" data-flip="committed">
                ✓ all committed
              </span>
            )}
          </div>
        </section>
        <section className={`panel store-box ${frame?.phase === 'crash' ? 'failed' : frame?.phase === 'write' ? 'active' : ''}`}>
          <h4>accounts database</h4>
          <p className="store-value">
            balance = <strong data-flip="balance">{frame?.balance ?? 0}</strong>
          </p>
          {mode === 'idempotent' && (
            <p className="small mono" data-flip="last-applied">
              last applied offset = {frame?.lastApplied ?? '—'}
            </p>
          )}
          {frame && (
            <p className={`small phase phase-${frame.phase}`} data-flip="phase">
              {frame.phase}
            </p>
          )}
        </section>
      </div>
      <StepControls
        stepper={stepper}
        tone={done ? (frame.balance === correct ? 'ok' : 'error') : undefined}
        idle={`Three deposits (+${DEPOSITS.join(', +')}) on a log. The consumer adds each to a balance, then commits the offset. It will crash once, at the worst moment.`}
      />
    </div>
  );
}
