import { bitmapRunLengths } from '../columnar.ts';

/** One labelled bitmap row with its run-length encoding. */
export function Bits({ bits, label, current = false }: { bits: readonly number[]; label: string; current?: boolean }) {
  return (
    <div className={`bitmap-row ${current ? 'current' : ''}`}>
      <span className="bitmap-label mono">{label}</span>
      <span className="bitmap" aria-label={`${label}: ${bits.join('')}`}>
        {bits.map((b, i) => (
          <span key={i} className={b ? 'on' : ''} data-flip={`${label}:${i}`} data-flip-state={String(b)}>
            {b}
          </span>
        ))}
      </span>
      <span className="muted small mono" data-flip={`${label}:runs`}>
        runs: {bitmapRunLengths(bits).join(', ')}
      </span>
    </div>
  );
}
