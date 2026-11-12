import { useState } from 'react';
import { StepControls } from '../components/StepControls.tsx';
import { useStepper } from '../lib/useStepper.ts';
import { addGroup, createBroker, getGroup, produce, type BrokerState } from '../sims/broker.ts';
import { traceAddConsumer, traceAddGroup, traceCrash, traceProduce, traceReset, traceRestart, traceTick, type BrokerFrame } from '../sims/brokerTrace.ts';
import { BrokerView } from '../sims/ui/BrokerView.tsx';

const KEYS = ['user:1', 'user:2', 'user:3', 'user:4'];

function initial(): BrokerState {
  const seeded = KEYS.concat(KEYS.slice(0, 2)).reduce((s, k, i) => produce(s, k, `event ${i + 1}`), createBroker({ partitions: 2, retention: 7, commitEvery: 3 }));
  return addGroup(seeded, 'billing', 2);
}

/** A two-partition topic with a consumer group: produce, consume, crash, scale and replay. */
export function BrokerMiniWidget() {
  const [state, setState] = useState(initial);
  const [next, setNext] = useState(0);
  const stepper = useStepper<BrokerFrame>();

  const play = ({ frames, final }: { frames: BrokerFrame[]; final: BrokerState }) => {
    setState(final);
    stepper.start(frames);
  };

  const billing = getGroup(state, 'billing');
  const c2 = billing.consumers.find((c) => c.id === 'c2');
  const hasAudit = state.groups.some((g) => g.id === 'audit');
  const frame = stepper.frame;

  return (
    <div className="widget-body">
      <div className="toolbar">
        <button
          className="primary"
          onClick={() => {
            play(traceProduce(state, KEYS[next % KEYS.length], `event ${state.produced + 1}`));
            setNext(next + 1);
          }}
        >
          produce {KEYS[next % KEYS.length]}
        </button>
        <button onClick={() => play(traceTick(state, 'billing'))}>billing: each consumer reads one</button>
        {hasAudit && <button onClick={() => play(traceTick(state, 'audit'))}>audit: read one</button>}
        <button onClick={() => play(c2?.alive ? traceCrash(state, 'billing', 'c2') : traceRestart(state, 'billing', 'c2'))}>{c2?.alive ? 'crash c2' : 'restart c2'}</button>
      </div>
      <div className="toolbar">
        <button onClick={() => play(traceAddConsumer(state, 'billing'))} disabled={billing.consumers.length >= 4}>
          add a consumer to billing
        </button>
        <button onClick={() => play(traceAddGroup(state, 'audit', 1, 'earliest'))} disabled={hasAudit}>
          add group “audit”
        </button>
        <button onClick={() => play(traceReset(state, 'billing', 'earliest'))}>replay billing from the start</button>
        <button
          onClick={() => {
            setState(initial());
            setNext(0);
            stepper.clear();
          }}
        >
          reset
        </button>
      </div>
      <BrokerView state={frame?.state ?? state} focus={frame?.focus} />
      <StepControls
        stepper={stepper}
        idle="Two partitions, one consumer group (billing) with two consumers. Consumers commit after every 3 messages; each partition keeps its newest 7. Read a few, then crash c2 between commits."
      />
    </div>
  );
}
