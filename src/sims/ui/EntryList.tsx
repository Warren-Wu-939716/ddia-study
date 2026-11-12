import type { LsmEntry } from '../lsm.ts';

/** Key-value rows for a WAL, memtable or SSTable; tombstones and a highlighted key (or row) are marked. */
export function EntryList({ entries, highlight, highlightIndex }: { entries: readonly LsmEntry[]; highlight?: string; highlightIndex?: number }) {
  if (entries.length === 0) return <p className="muted small">empty</p>;
  return (
    <ul className="kv-list">
      {entries.map((e, i) => (
        <li key={`${e.key}-${i}`} className={`${e.value === null ? 'tombstone' : ''} ${highlight === e.key || highlightIndex === i ? 'hl' : ''}`}>
          <span className="k">{e.key}</span>
          <span className="v">{e.value === null ? '✝ tombstone' : e.value}</span>
        </li>
      ))}
    </ul>
  );
}
