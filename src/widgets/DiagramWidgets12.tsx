import { StepControls } from '../components/StepControls.tsx';
import { useStepper } from '../lib/useStepper.ts';
import { BoardWidget } from './FlowBoard.tsx';
import { LESSON_1_4_SCENARIOS as A } from './logic/diagrams12a.ts';
import { CLOCK_EVENTS, clockAt, LESSON_5_9_SCENARIOS as B, twoClocksFrames, type ClockFrame } from './logic/diagrams12b.ts';

export const BatchVsStreamWidget = () => (
  <BoardWidget scenarios={A['batch-vs-stream']} label="Processing style" idle="The same four orders, counted by a nightly batch job or by a stream processor. Pick one and run." />
);
export const PubSubWidget = () => <BoardWidget scenarios={A.pubsub} idle="Run to follow two events from their producers, through the topic, to every consumer." />;
export const PollingWidget = () => (
  <BoardWidget scenarios={A.polling} label="How the consumer finds out" idle="Two events arrive, at 2 s and 7 s. Compare how quickly the consumer notices them, and how many trips it wastes." />
);
export const OverloadWidget = () => (
  <BoardWidget scenarios={A.overload} label="What to do with the extra" idle="The producer is faster than the consumer. Pick what to do with the extra messages, then run." />
);
export const DirectVsBrokerWidget = () => (
  <BoardWidget scenarios={A['direct-vs-broker']} label="Delivery path" idle="The consumer goes offline in the middle. Compare sending directly with going through a broker." />
);
export const PartitionOrderWidget = () => (
  <BoardWidget scenarios={A['partition-order']} label="Partitioning" idle="Will each order’s status end up right? Run with a partition key, then without." />
);
export const HolBlockingWidget = () => (
  <BoardWidget scenarios={A['hol-blocking']} label="How work is shared" idle="One slow message among fast ones. Compare a log’s partitions with a shared queue." />
);
export const RetentionWidget = () => <BoardWidget scenarios={A.retention} idle="Run to watch a slow consumer fall behind a log that only keeps its newest messages." />;
export const CdcSnapshotWidget = () => (
  <BoardWidget scenarios={A['cdc-snapshot']} label="Where to start following the log" idle="Build a new search index from a snapshot plus the change log. Does it end up matching the database?" />
);
export const OutboxWidget = () => (
  <BoardWidget scenarios={A.outbox} label="What CDC publishes" idle="Another team reads your data through CDC. What happens when you rename a column — or crash mid-write?" />
);
export const LedgerWidget = () => (
  <BoardWidget scenarios={B.ledger} label="How changes are stored" idle="A bug charges £50 for a £5 coffee. Compare an overwritten balance with an append-only ledger." />
);
export const CryptoShreddingWidget = () => (
  <BoardWidget scenarios={B['crypto-shredding']} label="How to forget" idle="User 7 asks to be forgotten. Their data is in the log, a replica and a backup." />
);
export const AsyncViewWidget = () => (
  <BoardWidget scenarios={B['async-view']} label="Concurrency" idle="Views are updated a moment after the log. See what that breaks, and what one-event-per-action makes easy." />
);
export const CepWidget = () => <BoardWidget scenarios={B.cep} idle="Run to send five card payments past a stored fraud query." />;
export const StreamSearchWidget = () => <BoardWidget scenarios={B['stream-search']} idle="Run to check four new listings against two saved searches." />;
export const StreamAnalyticsWidget = () => <BoardWidget scenarios={B['stream-analytics']} idle="Run to summarise two minutes of requests, one window at a time." />;
export const IvmWidget = () => (
  <BoardWidget scenarios={B.ivm} label="How the view is kept current" idle="Three changes hit the orders table. Count the work needed to keep the view up to date." />
);
export const StragglersWidget = () => (
  <BoardWidget scenarios={B.stragglers} label="Late events" idle="Server B’s network has trouble during 10:57. Choose what to do about its late events, then run." />
);
export const ClockSkewWidget = () => <BoardWidget scenarios={B['clock-skew']} label="Whose clock" idle="When did the tap really happen? Compare three ways of deciding." />;
export const VersionedJoinWidget = () => (
  <BoardWidget scenarios={B['versioned-join']} label="Join with" idle="Sales are joined with a tax rate that changes; later, every sale is reprocessed." />
);
export const CheckpointWidget = () => (
  <BoardWidget scenarios={B.checkpoint} label="Recovery mechanism" idle="The job crashes part-way. Does the count come out right? What about the email?" />
);
export const StateRecoveryWidget = () => (
  <BoardWidget scenarios={B['state-recovery']} label="Where the state lives" idle="The node holding the state crashes. How does its replacement get the state back?" />
);
export const FencingWidget = () => <BoardWidget scenarios={B.fencing} label="Protection" idle="Node 1 freezes, is replaced, then wakes up and writes. Which write wins?" />;

// ── Event time vs processing time: two timelines ─────────────────────

const W = 600;
const SPAN = 50;
const TOP = 52;
const BOTTOM = 132;
const x = (t: number) => 30 + (t / SPAN) * (W - 60);

export function TwoClocksWidget() {
  const stepper = useStepper<ClockFrame>();
  const frame = stepper.frame;
  const happened = frame?.happened ?? [];
  const processed = frame?.processed ?? [];
  const byEventTime = [...CLOCK_EVENTS].sort((a, b) => a.happened - b.happened).map((e) => e.id);

  return (
    <div className="widget-body">
      <div className="toolbar">
        <button className="primary" onClick={() => stepper.start(twoClocksFrames())}>
          run
        </button>
      </div>
      <div className="timeline-wrap">
        <svg className="clocks" viewBox={`0 0 ${W} 176`} role="img" aria-label="Each event placed on an event-time line and a processing-time line">
          <text x={30} y={16} className="axis-title">
            event time — when it happened (stamped in the event)
          </text>
          <text x={30} y={172} className="axis-title">
            processing time — when the processor handled it
          </text>
          {[TOP, BOTTOM].map((y) => (
            <line key={y} x1={x(0)} y1={y} x2={x(SPAN)} y2={y} className="axis-line" />
          ))}
          {Array.from({ length: SPAN / 10 + 1 }, (_, i) => i * 10).map((t) => (
            <g key={t}>
              <line x1={x(t)} y1={TOP - 4} x2={x(t)} y2={TOP + 4} className="tick" />
              <line x1={x(t)} y1={BOTTOM - 4} x2={x(t)} y2={BOTTOM + 4} className="tick" />
              <text x={x(t)} y={TOP + 17} textAnchor="middle" className="tick-label">
                {clockAt(t)}
              </text>
              <text x={x(t)} y={BOTTOM - 9} textAnchor="middle" className="tick-label">
                {clockAt(t)}
              </text>
            </g>
          ))}
          {frame && frame.now > 0 && <line x1={x(frame.now)} y1={TOP - 14} x2={x(frame.now)} y2={BOTTOM + 8} className="now" data-flip="now" />}
          {CLOCK_EVENTS.filter((e) => processed.includes(e.id)).map((e) => {
            const lag = e.processed - e.happened;
            const late = CLOCK_EVENTS.some((o) => o.happened > e.happened && o.processed < e.processed);
            return (
              <g key={e.id} className={`link ${late ? 'late' : ''}`}>
                <line x1={x(e.happened)} y1={TOP + 7} x2={x(e.processed)} y2={BOTTOM - 7} />
                <text x={(x(e.happened) + x(e.processed)) / 2 + 4} y={late ? 80 : 98} className="lag">
                  +{lag} s
                </text>
              </g>
            );
          })}
          {CLOCK_EVENTS.map((e) => {
            const cls = `ev ${frame?.current === e.id ? 'current' : ''}`;
            const stuck = happened.includes(e.id) && !processed.includes(e.id) && (frame?.now ?? 0) - e.happened > 5;
            return (
              <g key={e.id}>
                {happened.includes(e.id) && (
                  <g className={`${cls} ${stuck ? 'stuck' : ''}`} data-flip={`happened:${e.id}`}>
                    <circle cx={x(e.happened)} cy={TOP} r={6} />
                    <text x={x(e.happened)} y={TOP - 11} textAnchor="middle" className="ev-label">
                      {e.id}
                    </text>
                  </g>
                )}
                {processed.includes(e.id) && (
                  <g className={cls} data-flip={`processed:${e.id}`} data-flip-from={`happened:${e.id}`}>
                    <circle cx={x(e.processed)} cy={BOTTOM} r={6} />
                    <text x={x(e.processed)} y={BOTTOM + 20} textAnchor="middle" className="ev-label">
                      {e.id}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="small mono">
        by event time: {byEventTime.filter((id) => happened.includes(id)).join(', ') || '—'}
        <br />
        processed so far: {processed.join(', ') || '—'}
      </p>
      <StepControls stepper={stepper} tone={frame?.tone} idle="Five events, each placed on two clocks. Run and step through to see the gap between them open up." />
    </div>
  );
}
