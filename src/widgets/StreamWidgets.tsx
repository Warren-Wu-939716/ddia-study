import { useState } from 'react';
import { Segmented } from '../components/Segmented.tsx';
import { StepControls } from '../components/StepControls.tsx';
import { useStepper } from '../lib/useStepper.ts';
import {
  compactionFrames,
  DELIVERY_CONSUMERS,
  deliveryFrames,
  eventLogFrames,
  redeliveryFrames,
  syncFrames,
  type CartEvent,
  type CompactionFrame,
  type DeliveryFrame,
  type DeliveryMode,
  type EventLogFrame,
  type KeyedRecord,
  type QueueFrame,
  type RedeliveryMode,
  type SyncFrame,
  type SyncMode,
} from './logic/streams.ts';

// ── Load balancing vs fan-out ────────────────────────────────────────

const MESSAGES = 6;

export function FanoutWidget() {
  const [mode, setMode] = useState<DeliveryMode>('load-balance');
  const stepper = useStepper<DeliveryFrame>();
  const frame = stepper.frame;
  const consumers = DELIVERY_CONSUMERS[mode];
  const groups = [...new Set(consumers.map((c) => c.group))];

  return (
    <div className="widget-body">
      <div className="toolbar">
        <Segmented
          label="Delivery pattern"
          value={mode}
          options={[
            ['load-balance', 'load balancing'],
            ['fan-out', 'fan-out'],
            ['groups', 'consumer groups'],
          ]}
          onChange={(m) => {
            setMode(m);
            stepper.start(deliveryFrames(m, MESSAGES));
          }}
        />
        <button className="primary" onClick={() => stepper.start(deliveryFrames(mode, MESSAGES))}>
          send {MESSAGES} messages
        </button>
      </div>
      <div className="stream-row">
        <span className="stream-label">topic</span>
        {Array.from({ length: MESSAGES }, (_, i) => (
          <span key={i} className={`chip-static msg-chip ${frame && i < frame.sent ? 'sent' : ''} ${frame?.sent === i + 1 && frame.current.length ? 'current' : ''}`}>
            m{i + 1}
          </span>
        ))}
      </div>
      <div className="consumer-groups">
        {groups.map((g) => (
          <section key={g} className="panel">
            <h4>
              {mode === 'fan-out' ? 'subscriber' : 'group'} <code>{g}</code>
            </h4>
            {consumers
              .filter((c) => c.group === g)
              .map((c) => (
                <div key={c.id} className={`stream-row ${frame?.current.includes(c.id) ? 'active' : ''}`}>
                  <span className="stream-label">consumer {c.id}</span>
                  {(frame?.received[c.id] ?? []).map((m) => (
                    <span key={m} className={`chip-static msg-chip ${frame?.sent === m && frame.current.includes(c.id) ? 'current' : ''}`}>
                      m{m}
                    </span>
                  ))}
                </div>
              ))}
          </section>
        ))}
      </div>
      <StepControls stepper={stepper} idle="Pick a pattern and send six messages to see who receives each one." />
    </div>
  );
}

// ── Acknowledgments, redelivery and dead letters ─────────────────────

export function RedeliveryWidget() {
  const [mode, setMode] = useState<RedeliveryMode>('crash');
  const stepper = useStepper<QueueFrame>();
  const frame = stepper.frame;

  return (
    <div className="widget-body">
      <div className="toolbar">
        <Segmented
          label="Scenario"
          value={mode}
          options={[
            ['crash', 'a consumer crashes'],
            ['poison', 'a malformed message'],
          ]}
          onChange={(m) => {
            setMode(m);
            stepper.start(redeliveryFrames(m));
          }}
        />
        <button className="primary" onClick={() => stepper.start(redeliveryFrames(mode))}>
          run
        </button>
      </div>
      <div className="queue-layout">
        <section className="panel">
          <h4>broker queue</h4>
          <div className="stream-row">
            {(frame?.queue ?? []).map((m) => (
              <span key={m} className={`chip-static msg-chip ${mode === 'poison' && m === 'm2' ? 'bad' : ''}`}>
                {m}
              </span>
            ))}
            {frame && frame.queue.length === 0 && <span className="muted small">empty</span>}
          </div>
          {frame && frame.dlq.length > 0 && (
            <div className="dlq">
              <strong>dead letter queue</strong>{' '}
              {frame.dlq.map((m) => (
                <span key={m} className="chip-static msg-chip bad">
                  {m}
                </span>
              ))}
            </div>
          )}
        </section>
        {(['C1', 'C2'] as const).map((c) => (
          <section key={c} className={`panel consumer-box ${frame?.down.includes(c) ? 'down' : ''}`}>
            <h4>
              consumer {c} {frame?.down.includes(c) && <span className="tag-bad">crashed</span>}
            </h4>
            <p className="small">
              working on: <strong>{frame?.inFlight[c] ?? '—'}</strong>
            </p>
            <p className="small">
              done (in order): <span className="mono">{frame?.done[c].join(', ') || '—'}</span>
            </p>
          </section>
        ))}
      </div>
      <StepControls
        stepper={stepper}
        tone={frame && stepper.atEnd ? (mode === 'crash' ? 'warn' : 'ok') : undefined}
        idle="A traditional (AMQP/JMS-style) broker: two consumers share one queue, and each message must be acknowledged."
      />
    </div>
  );
}

// ── Dual writes vs change data capture ───────────────────────────────

export function DualWritesWidget() {
  const [mode, setMode] = useState<SyncMode>('race');
  const stepper = useStepper<SyncFrame>();
  const frame = stepper.frame;
  const done = frame && stepper.atEnd;
  const diverged = done && frame.db !== frame.index;

  const store = (name: string, value: string | undefined, target: 'db' | 'index') => (
    <section className={`panel store-box ${frame?.target === target ? (frame.failed ? 'failed' : 'active') : ''} ${diverged ? 'diverged' : ''}`}>
      <h4>{name}</h4>
      <p className="store-value">
        X = <strong>{value ?? 'old'}</strong>
      </p>
      {frame?.target === target && frame.actor && (
        <p className="small">
          {frame.failed ? '✗ write failed' : `written by ${frame.actor}`}
        </p>
      )}
    </section>
  );

  return (
    <div className="widget-body">
      <div className="toolbar">
        <Segmented
          label="Approach"
          value={mode}
          options={[
            ['race', 'dual writes: race'],
            ['partial-failure', 'dual writes: one fails'],
            ['cdc', 'change data capture'],
          ]}
          onChange={(m) => {
            setMode(m);
            stepper.start(syncFrames(m));
          }}
        />
        <button className="primary" onClick={() => stepper.start(syncFrames(mode))}>
          run
        </button>
      </div>
      <div className="sync-layout">
        {store('database', frame?.db, 'db')}
        {mode === 'cdc' && (
          <section className="panel">
            <h4>database change log</h4>
            <ol className="mono small change-log">
              {(frame?.log ?? []).map((entry, i) => (
                <li key={i} className={frame && i < frame.applied ? 'applied' : ''}>
                  #{i + 1} {entry}
                  {frame && i < frame.applied && ' ✓ applied to index'}
                </li>
              ))}
              {(!frame || frame.log.length === 0) && <li className="muted">empty</li>}
            </ol>
          </section>
        )}
        {store('search index', frame?.index, 'index')}
      </div>
      <StepControls
        stepper={stepper}
        tone={done ? (diverged ? 'error' : 'ok') : undefined}
        idle="Two copies of the same data — a database and a search index. Pick how they’re kept in sync, then run."
      />
    </div>
  );
}

// ── Log compaction ───────────────────────────────────────────────────

const STOCK_LOG: KeyedRecord[] = [
  { key: 'socks', value: '12' },
  { key: 'hat', value: '4' },
  { key: 'socks', value: '11' },
  { key: 'gloves', value: '7' },
  { key: 'scarf', value: '9' },
  { key: 'socks', value: '8' },
  { key: 'gloves', value: null },
  { key: 'hat', value: '3' },
];

export function LogCompactionWidget() {
  const stepper = useStepper<CompactionFrame>();
  const frame = stepper.frame;

  return (
    <div className="widget-body">
      <div className="toolbar">
        <button className="primary" onClick={() => stepper.start(compactionFrames(STOCK_LOG))}>
          compact the log
        </button>
        <span className="muted small">A topic of stock levels, keyed by product. ✝ = tombstone (product deleted).</span>
      </div>
      <div className="stream-row log-row">
        <span className="stream-label">log</span>
        {STOCK_LOG.map((r, i) => (
          <span
            key={i}
            className={`chip-static log-cell ${frame?.cursor === i ? 'current' : ''} ${frame?.kept.includes(i) ? 'kept' : ''} ${frame?.dropped.includes(i) ? 'dropped' : ''} ${r.value === null ? 'tomb' : ''}`}
          >
            <sup>{i}</sup>
            {r.key}={r.value ?? '✝'}
          </span>
        ))}
      </div>
      {frame?.compacted && (
        <div className="stream-row log-row">
          <span className="stream-label">compacted</span>
          {frame.compacted.map(({ offset, record }) => (
            <span key={offset} className="chip-static log-cell kept">
              <sup>{offset}</sup>
              {record.key}={record.value}
            </span>
          ))}
        </div>
      )}
      {frame?.rebuilt && (
        <table className="mini">
          <caption className="small muted">rebuilt by a new consumer reading from offset 0</caption>
          <tbody>
            {Object.entries(frame.rebuilt).map(([k, v]) => (
              <tr key={k}>
                <td className="mono">{k}</td>
                <td className="mono">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <StepControls stepper={stepper} idle="Eight writes, but only four products. Compact the log to keep just the latest value for each key." />
    </div>
  );
}

// ── Several views derived from one event log ─────────────────────────

const CART_EVENTS: CartEvent[] = [
  { type: 'added', item: 'socks' },
  { type: 'added', item: 'hat' },
  { type: 'added', item: 'scarf' },
  { type: 'removed', item: 'socks' },
  { type: 'added', item: 'socks' },
  { type: 'removed', item: 'scarf' },
  { type: 'checked-out' },
];

const label = (e: CartEvent) => (e.type === 'checked-out' ? 'CheckedOut' : `${e.type === 'added' ? 'ItemAdded' : 'ItemRemoved'}(${e.item})`);

export function EventLogWidget() {
  const stepper = useStepper<EventLogFrame>();
  const frame = stepper.frame;
  const views = frame?.views;

  return (
    <div className="widget-body">
      <div className="toolbar">
        <button className="primary" onClick={() => stepper.start(eventLogFrames(CART_EVENTS))}>
          apply the events
        </button>
        <button onClick={() => stepper.start(eventLogFrames(CART_EVENTS, true))}>…then build a new view later</button>
      </div>
      <div className="event-log-layout">
        <section className="panel">
          <h4>event log (append-only)</h4>
          <ol className="mono small change-log">
            {CART_EVENTS.map((e, i) => (
              <li key={i} className={`${frame && i < frame.applied ? 'applied' : ''} ${frame && i === frame.applied - 1 ? 'current' : ''}`}>
                {label(e)}
              </li>
            ))}
          </ol>
        </section>
        <section className="panel">
          <h4>view: cart</h4>
          <p className="small">{views ? `${views.cart.join(', ') || 'empty'} · ${views.status}` : '—'}</p>
          <h4>view: removed before checkout</h4>
          <p className="small">{views?.removed.join(', ') || '—'}</p>
          {views?.popularity && (
            <>
              <h4>new view: times added to a cart</h4>
              <p className="small">
                {Object.entries(views.popularity)
                  .map(([k, v]) => `${k} ×${v}`)
                  .join(', ') || '—'}
              </p>
            </>
          )}
        </section>
      </div>
      <StepControls stepper={stepper} idle="One shopper’s events. Every view is computed from the log; the log itself never changes." />
    </div>
  );
}
