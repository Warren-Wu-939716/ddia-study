import { useState } from 'react';
import { ChallengeList } from '../../components/ChallengeList.tsx';
import { StepControls } from '../../components/StepControls.tsx';
import { useStepper } from '../../lib/useStepper.ts';
import { addGroup, createBroker, drain, getGroup, produce, type BrokerConfig, type BrokerState } from '../broker.ts';
import { traceAddConsumer, traceAddGroup, traceCrash, traceProduce, traceReset, traceRestart, traceTick, type BrokerFrame } from '../brokerTrace.ts';
import type { Challenge } from '../challenges.ts';
import { BrokerView } from './BrokerView.tsx';

const DEFAULT_CONFIG: BrokerConfig = { partitions: 3, retention: 12, commitEvery: 3 };
const EXTRA_GROUPS = ['audit', 'search', 'analytics'];
const fresh = (config: BrokerConfig, consumers: number) => addGroup(createBroker(config), 'orders', consumers);

export function BrokerLab() {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [consumers, setConsumers] = useState(2);
  const [state, setState] = useState(() => fresh(DEFAULT_CONFIG, 2));
  const [groupId, setGroupId] = useState('orders');
  const [key, setKey] = useState('user:1');
  const stepper = useStepper<BrokerFrame>();

  const play = ({ frames, final }: { frames: BrokerFrame[]; final: BrokerState }) => {
    setState(final);
    stepper.start(frames);
  };
  const jump = (final: BrokerState, caption: string) => play({ frames: [{ state: final, caption }], final });

  const reset = (next: BrokerConfig, count: number) => {
    setConfig(next);
    setConsumers(count);
    setGroupId('orders');
    setState(fresh(next, count));
    stepper.clear();
  };

  const group = state.groups.find((g) => g.id === groupId) ?? state.groups[0];
  const nextGroup = EXTRA_GROUPS.find((g) => !state.groups.some((x) => x.id === g));
  const cleanKey = key.trim().slice(0, 16);

  const runChallenge = async (challenge: Challenge) => {
    if (challenge.labId !== 'broker') return;
    const setup = challenge.setup();
    setConfig(setup.config);
    setGroupId(challenge.group);
    jump(setup, `Challenge “${challenge.title}” set up. Inspect the partitions and group stats to check your prediction.`);
  };

  return (
    <div className="lab">
      <div className="lab-main">
        <div className="toolbar">
          <label>
            key
            <input value={key} onChange={(e) => setKey(e.target.value)} maxLength={16} />
          </label>
          <button className="primary" disabled={!cleanKey} onClick={() => play(traceProduce(state, cleanKey, `msg ${state.produced + 1}`))}>
            produce
          </button>
          <button
            onClick={() => {
              const keys = Array.from({ length: 5 }, () => `user:${Math.floor(Math.random() * 6) + 1}`);
              jump(
                keys.reduce((s, k) => produce(s, k, `msg ${s.produced + 1}`), state),
                `Produced 5 messages (${keys.join(', ')}). Each key always lands in the same partition.`,
              );
            }}
          >
            produce 5 random
          </button>
          <span className="divider" />
          <label>
            group
            <select value={group.id} onChange={(e) => setGroupId(e.target.value)}>
              {state.groups.map((g) => (
                <option key={g.id}>{g.id}</option>
              ))}
            </select>
          </label>
          <button onClick={() => play(traceTick(state, group.id))}>each consumer reads one</button>
          <button onClick={() => jump(drain(state, group.id), `${group.id} read everything available.`)}>read to the end</button>
        </div>
        <div className="toolbar">
          {group.consumers.map((c) => (
            <button key={c.id} onClick={() => play(c.alive ? traceCrash(state, group.id, c.id) : traceRestart(state, group.id, c.id))}>
              {c.alive ? `crash ${c.id}` : `restart ${c.id}`}
            </button>
          ))}
          <button onClick={() => play(traceAddConsumer(state, group.id))} disabled={group.consumers.length >= 6}>
            add consumer
          </button>
          <button onClick={() => nextGroup && play(traceAddGroup(state, nextGroup, 1, 'earliest'))} disabled={!nextGroup}>
            add group {nextGroup ? `“${nextGroup}”` : ''}
          </button>
          <button onClick={() => play(traceReset(state, group.id, 'earliest'))}>replay from start</button>
          <button onClick={() => play(traceReset(state, group.id, 'latest'))}>skip to end</button>
        </div>

        <details className="config">
          <summary>Topic settings (changing one resets the lab)</summary>
          <div className="toolbar">
            <label>
              partitions
              <select value={config.partitions} onChange={(e) => reset({ ...config, partitions: Number(e.target.value) }, consumers)}>
                {[1, 2, 3, 4].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              consumers in “orders”
              <select value={consumers} onChange={(e) => reset(config, Number(e.target.value))}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              commit after every
              <select value={config.commitEvery} onChange={(e) => reset({ ...config, commitEvery: Number(e.target.value) }, consumers)}>
                {[1, 2, 3, 5].map((n) => (
                  <option key={n} value={n}>
                    {n} message{n === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              retention per partition
              <select value={config.retention} onChange={(e) => reset({ ...config, retention: Number(e.target.value) }, consumers)}>
                {[4, 8, 12, 20].map((n) => (
                  <option key={n} value={n}>
                    {n} messages
                  </option>
                ))}
              </select>
            </label>
            <button onClick={() => reset(config, consumers)}>reset</button>
          </div>
        </details>

        <StepControls stepper={stepper} idle="Produce a few keyed messages, let the “orders” group read them, then crash a consumer between commits." />
        <BrokerView state={stepper.frame?.state ?? state} focus={stepper.frame?.focus} />
        <p className="muted small">
          ✓ marks a group’s committed offset (where it resumes after a crash); ▸ marks where a live consumer will read next. Group {group.id} has{' '}
          {getGroup(state, group.id).deliveries.length} deliveries so far.
        </p>
      </div>
      <aside className="lab-side">
        <ChallengeList labId="broker" onRun={runChallenge} />
      </aside>
    </div>
  );
}
