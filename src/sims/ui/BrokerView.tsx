import { duplicateCount, lag, type BrokerState } from '../broker.ts';
import type { BrokerFocus } from '../brokerTrace.ts';

/** Partitions as rows of offsets, with each group's committed offset (✓) and each consumer's read position (▸). */
export function BrokerView({ state, focus }: { state: BrokerState; focus?: BrokerFocus }) {
  return (
    <div className="broker">
      <div className="broker-partitions">
        {state.partitions.map((p) => {
          const slots = Array.from({ length: p.endOffset - p.startOffset + 1 }, (_, i) => p.startOffset + i);
          return (
            <div key={p.id} className={`broker-partition ${focus?.partition === p.id ? 'focus' : ''}`} data-flip-anchor={`P${p.id}`}>
              <span className="broker-label">P{p.id}</span>
              <div className="broker-cells">
                {p.startOffset > 0 && (
                  <span className="broker-msg deleted" title="Deleted by retention" data-flip={`P${p.id}-deleted`}>
                    0–{p.startOffset - 1} deleted
                  </span>
                )}
                {slots.map((offset) => {
                  const message = p.messages[offset - p.startOffset];
                  const hit = focus?.partition === p.id && focus.offset === offset;
                  const markers = state.groups.flatMap((g, gi) => {
                    const owner = g.consumers.find((c) => c.alive && c.partitions.includes(p.id));
                    return [
                      ...(owner && owner.positions[p.id] === offset
                        ? [{ id: `pos:${g.id}:P${p.id}`, text: `${owner.id} ▸`, kind: 'position', gi, title: `${g.id}/${owner.id} reads this next` }]
                        : []),
                      ...(g.committed[p.id] === offset ? [{ id: `commit:${g.id}:P${p.id}`, text: `✓ ${g.id}`, kind: 'committed', gi, title: `${g.id} committed offset ${offset}` }] : []),
                    ];
                  });
                  return (
                    <span key={offset} className={`broker-slot ${message ? '' : 'end'}`}>
                      <span
                        className={`broker-msg ${message ? '' : 'next'} ${hit ? `hit ${focus?.kind ?? ''}` : ''}`}
                        title={message ? `${message.key} = ${message.value}` : 'Next offset to be written'}
                        data-flip={message ? `P${p.id}@${offset}` : `P${p.id}-next`}
                        data-flip-to={message ? `P${p.id}-deleted` : undefined}
                      >
                        <sup>{offset}</sup>
                        {message ? message.key : '…'}
                      </span>
                      {markers.map((m) => (
                        <span key={m.text} className={`broker-marker ${m.kind} g${m.gi % 3}`} title={m.title} data-flip={m.id}>
                          {m.text}
                        </span>
                      ))}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="broker-groups">
        {state.groups.map((g, gi) => (
          <section key={g.id} className={`panel broker-group g${gi % 3} ${focus?.group === g.id ? 'focus' : ''}`} data-flip-anchor={`group:${g.id}`}>
            <h4>
              group <code>{g.id}</code>
              <span className="muted small" data-flip={`stats:${g.id}`}>
                {' '}
                processed {g.deliveries.length} · duplicates {duplicateCount(g)} · lost to retention {g.missed} · lag {lag(state, g.id)}
              </span>
            </h4>
            <ul className="broker-consumers">
              {g.consumers.map((c) => {
                const last = g.deliveries.findLast((d) => d.consumer === c.id);
                return (
                  <li key={c.id} className={`${c.alive ? '' : 'down'} ${focus?.group === g.id && focus.consumer === c.id ? 'focus' : ''}`}>
                    <strong>{c.id}</strong>{' '}
                    <span data-flip={`${g.id}/${c.id}`}>
                      {!c.alive
                        ? 'crashed'
                        : c.partitions.length
                          ? c.partitions.map((p) => `P${p} @ ${c.positions[p]}`).join(', ')
                          : 'idle — no partition'}
                    </span>
                    {c.alive && last && (
                      <span className="broker-last" title="Last message this consumer read" data-flip={`P${last.partition}@${last.offset}`} data-flip-to={`stats:${g.id}`}>
                        <sup>{last.offset}</sup>
                        {last.key}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="small muted" data-flip={`committed:${g.id}`}>
              committed: {state.partitions.map((p) => `P${p.id} → ${g.committed[p.id]}`).join(', ')}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
