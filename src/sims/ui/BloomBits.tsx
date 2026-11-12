import type { BloomFrame } from '../bloomTrace.ts';

/** Numbered bit cells; the current key's bits are outlined and the ones already visited are emphasised. */
export function BloomBits({ bits, frame }: { bits: readonly number[]; frame?: BloomFrame }) {
  const visited = new Set(frame?.positions.slice(0, frame.visited));
  const current = frame && frame.visited > 0 ? frame.positions[frame.visited - 1] : undefined;
  return (
    <div className="bloom-bits" role="img" aria-label={`${bits.filter(Boolean).length} of ${bits.length} bits set`}>
      {bits.map((bit, i) => (
        <span
          key={i}
          className={[bit ? 'on' : '', frame?.positions.includes(i) ? 'probe' : '', visited.has(i) ? 'visited' : '', current === i ? 'current' : '', frame?.zero === i ? 'zero' : ''].join(' ')}
          data-flip={`bit${i}`}
          data-flip-state={bit ? 'on' : 'off'}
        >
          {i}
        </span>
      ))}
    </div>
  );
}
