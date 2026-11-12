import type { LsmFrame } from '../lsmTrace.ts';
import type { StepOutcome } from '../lsm.ts';
import { EntryList } from './EntryList.tsx';

const OUTCOME_LABEL: Record<StepOutcome, string> = {
  hit: 'found here',
  miss: 'not here',
  'bloom-skip': 'Bloom: definitely not here — skipped',
  'false-positive': 'Bloom said maybe — read, not here (false positive)',
};

interface LsmViewProps {
  frame: Pick<LsmFrame, 'state' | 'frozen' | 'building' | 'focus'>;
  /** Show each segment's tier, size and origin. */
  details?: boolean;
}

/** WAL, memtable (plus a frozen one being flushed) and SSTables, with the current step's focus highlighted. */
export function LsmView({ frame, details = false }: LsmViewProps) {
  const { state, frozen, building, focus } = frame;
  const memOutcome = focus?.outcome?.source === 'memtable' ? focus.outcome : undefined;

  return (
    <div className="lsm-grid">
      <section className="panel">
        <h4>
          WAL <span className="muted small">disk · append-only</span>
        </h4>
        <EntryList entries={state.wal} highlightIndex={focus?.wal} />
      </section>
      <section className={`panel ${memOutcome ? `step-${memOutcome.outcome}` : ''}`}>
        <h4>
          memtable{' '}
          <span className="muted small">
            memory · sorted · {state.memtable.length}/{state.config.memtableLimit}
          </span>
        </h4>
        <EntryList entries={state.memtable} highlight={focus?.memKey} />
        {frozen && (
          <div className="frozen-memtable">
            <h5>frozen · being written to disk</h5>
            <EntryList entries={frozen} />
          </div>
        )}
      </section>
      <section className="panel segments">
        <h4>
          SSTables <span className="muted small">disk · immutable · newest first</span>
        </h4>
        <div className="segment-list">
          {building && (
            <div className="segment building">
              <div className="segment-head">
                <strong>new segment</strong>
                <span className="muted small">being written…</span>
              </div>
              <EntryList entries={building} highlight={focus?.mergeKey} />
            </div>
          )}
          {state.segments.map((segment) => {
            const outcome = focus?.outcome?.source === 'segment' && focus.outcome.segmentId === segment.id ? focus.outcome : undefined;
            const probe = focus?.bloom?.segmentId === segment.id ? focus.bloom.positions : undefined;
            const classes = [
              'segment',
              outcome ? `step-${outcome.outcome}` : '',
              focus?.segments?.includes(segment.id) ? 'focus' : '',
              focus?.fresh === segment.id ? 'fresh' : '',
            ].join(' ');
            return (
              <div key={segment.id} className={classes}>
                <div className="segment-head">
                  <strong>#{segment.id}</strong>
                  {details && (
                    <span className="muted small">
                      tier {segment.tier} · {segment.entries.length} keys · {segment.origin}
                    </span>
                  )}
                  {outcome && <span className="small step-note">{OUTCOME_LABEL[outcome.outcome]}</span>}
                </div>
                <div className={`bloom-strip ${probe ? 'probing' : ''}`} aria-label="Bloom filter bits">
                  {segment.bloom.bits.map((bit, i) => (
                    <span key={i} title={`bit ${i}`} className={`${bit ? 'on' : ''} ${probe?.includes(i) ? 'probe' : ''}`} />
                  ))}
                </div>
                <EntryList entries={segment.entries} highlight={outcome?.outcome === 'hit' ? outcome.key : focus?.mergeKey} />
              </div>
            );
          })}
          {state.segments.length === 0 && !building && <p className="muted small">none yet</p>}
        </div>
      </section>
    </div>
  );
}
