import { useMemo, useState } from 'react';
import { ChallengeList } from '../../components/ChallengeList.tsx';
import { StepControls } from '../../components/StepControls.tsx';
import { useStepper } from '../../lib/useStepper.ts';
import type { Challenge } from '../challenges.ts';
import {
  bloomAdd,
  createBloom,
  falsePositiveRateForBitsPerKey,
  measureFalsePositiveRate,
  optimalHashCount,
  theoreticalFalsePositiveRate,
  type BloomFilter,
} from '../bloom.ts';
import { bloomAddFrames, bloomCheckFrames, type BloomFrame } from '../bloomTrace.ts';
import { BloomBits } from './BloomBits.tsx';

const formatRate = (rate: number) => (rate === 0 ? '0%' : rate < 0.001 ? `${(rate * 100).toFixed(3)}%` : `${(rate * 100).toFixed(1)}%`);

export function BloomLab() {
  const [size, setSize] = useState(32);
  const [hashes, setHashes] = useState(3);
  const [filter, setFilter] = useState<BloomFilter>(() => createBloom(32, 3));
  const [keys, setKeys] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [measured, setMeasured] = useState<number | null>(null);
  const stepper = useStepper<BloomFrame>();

  const rebuild = (nextSize: number, nextHashes: number, nextKeys: string[]) => {
    setSize(nextSize);
    setHashes(nextHashes);
    setKeys(nextKeys);
    setFilter(nextKeys.reduce(bloomAdd, createBloom(nextSize, nextHashes)));
    stepper.clear();
    setMeasured(null);
  };

  const add = (key: string) => {
    const k = key.trim().slice(0, 32);
    if (!k) return;
    if (keys.includes(k)) {
      stepper.start([{ bits: filter.bits, positions: [], visited: 0, caption: `\`${k}\` is already in the filter.` }]);
      return;
    }
    const { frames, final } = bloomAddFrames(filter, k);
    setKeys([...keys, k]);
    setFilter(final);
    stepper.start(frames);
    setMeasured(null);
  };

  const check = (key: string) => {
    const k = key.trim().slice(0, 32);
    if (k) stepper.start(bloomCheckFrames(filter, k, keys.includes(k)));
  };

  const addRandom = () => {
    const fresh = Array.from({ length: 5 }, () => `user:${Math.floor(Math.random() * 100000)}`).filter((k) => !keys.includes(k));
    setKeys((prev) => [...prev, ...fresh]);
    setFilter((f) => fresh.reduce(bloomAdd, f));
    stepper.clear();
    setMeasured(null);
  };

  const theory = theoreticalFalsePositiveRate(size, keys.length, hashes);
  const rules = useMemo(() => [5, 10, 15, 20].map((bits) => ({ bits, rate: falsePositiveRateForBitsPerKey(bits) })), []);
  const onBits = filter.bits.filter(Boolean).length;
  const frame = stepper.frame;

  const runChallenge = async (challenge: Challenge) => {
    if (challenge.id === 'bloom.overfull') {
      const demoKeys = Array.from({ length: 12 }, (_, i) => `key-${i + 1}`);
      rebuild(16, 3, demoKeys);
      const demo = demoKeys.reduce(bloomAdd, createBloom(16, 3));
      setMeasured(measureFalsePositiveRate(demo, new Set(demoKeys)));
    } else if (challenge.id === 'bloom.ten-bits' || challenge.id === 'bloom.plus-five') {
      const demoKeys = Array.from({ length: 6 }, (_, i) => `key-${i + 1}`);
      rebuild(60, optimalHashCount(60, 6), demoKeys);
    }
  };

  return (
    <div className="lab">
      <div className="lab-main">
        <div className="toolbar">
          <label>
            bits (m)
            <input type="range" min={8} max={128} step={8} value={size} onChange={(e) => rebuild(Number(e.target.value), hashes, keys)} />
            <span className="mono">{size}</span>
          </label>
          <label>
            hash functions (k)
            <input type="range" min={1} max={8} value={hashes} onChange={(e) => rebuild(size, Number(e.target.value), keys)} />
            <span className="mono">{hashes}</span>
          </label>
          <button onClick={() => rebuild(size, hashes, [])}>clear</button>
        </div>
        <div className="toolbar">
          <label>
            key
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. handbag" maxLength={32} />
          </label>
          <button className="primary" onClick={() => add(input)} disabled={!input.trim()}>
            add
          </button>
          <button onClick={() => check(input)} disabled={!input.trim()}>
            check
          </button>
          <button onClick={addRandom}>add 5 random keys</button>
        </div>

        <BloomBits bits={frame?.bits ?? filter.bits} frame={frame} />
        <StepControls
          stepper={stepper}
          tone={frame?.verdict === 'maybe-false' ? 'warn' : undefined}
          idle="Add a key to watch its bits being set, then check keys you did and didn't add."
        />

        <dl className="stats">
          <div>
            <dt>Keys (n)</dt>
            <dd>{keys.length}</dd>
          </div>
          <div>
            <dt>Bits per key</dt>
            <dd>{keys.length ? (size / keys.length).toFixed(1) : '—'}</dd>
          </div>
          <div>
            <dt>Bits set</dt>
            <dd>
              {onBits}/{size}
            </dd>
          </div>
          <div>
            <dt>Theoretical FP rate</dt>
            <dd>{formatRate(theory)}</dd>
          </div>
          <div>
            <dt>Best k for this n</dt>
            <dd>{optimalHashCount(size, keys.length)}</dd>
          </div>
          <div>
            <dt>Measured FP rate</dt>
            <dd>
              {measured === null ? (
                <button className="link" onClick={() => setMeasured(measureFalsePositiveRate(filter, new Set(keys)))}>
                  probe 2,000 keys
                </button>
              ) : (
                formatRate(measured)
              )}
            </dd>
          </div>
        </dl>

        <section className="panel">
          <h4>Rule of thumb (optimal k)</h4>
          <table className="mini">
            <thead>
              <tr>
                <th>bits per key</th>
                {rules.map((r) => (
                  <th key={r.bits}>{r.bits}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>false positives</th>
                {rules.map((r) => (
                  <td key={r.bits}>{formatRate(r.rate)}</td>
                ))}
              </tr>
            </tbody>
          </table>
          <p className="muted small">Formula: (1 − e^(−k·n/m))^k. Each extra ~5 bits per key buys about a 10× improvement.</p>
        </section>

        {keys.length > 0 && (
          <p className="muted small">
            Added: <span className="mono">{keys.join(', ')}</span>
          </p>
        )}
      </div>
      <aside className="lab-side">
        <ChallengeList labId="bloom" onRun={runChallenge} />
      </aside>
    </div>
  );
}
