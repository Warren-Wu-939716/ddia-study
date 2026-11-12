import type { StepFrame } from '../../lib/steps.ts';

// ── Load balancing vs fan-out ────────────────────────────────────────

export type DeliveryMode = 'load-balance' | 'fan-out' | 'groups';

export interface DeliveryConsumer {
  id: string;
  group: string;
}

export const DELIVERY_CONSUMERS: Record<DeliveryMode, DeliveryConsumer[]> = {
  'load-balance': [
    { id: 'A', group: 'workers' },
    { id: 'B', group: 'workers' },
  ],
  'fan-out': [
    { id: 'A', group: 'email' },
    { id: 'B', group: 'search' },
  ],
  groups: [
    { id: 'A', group: 'billing' },
    { id: 'B', group: 'billing' },
    { id: 'C', group: 'audit' },
  ],
};

export interface DeliveryFrame extends StepFrame {
  /** Messages sent so far (1-based message numbers). */
  sent: number;
  /** Message numbers each consumer has received. */
  received: Record<string, number[]>;
  /** Consumers that received the current message. */
  current: string[];
}

/** Who gets each message: one member per group, round-robin inside a group. */
export function deliveryFrames(mode: DeliveryMode, messages = 6): DeliveryFrame[] {
  const consumers = DELIVERY_CONSUMERS[mode];
  const groups = [...new Set(consumers.map((c) => c.group))];
  const received: Record<string, number[]> = Object.fromEntries(consumers.map((c) => [c.id, []]));
  const frames: DeliveryFrame[] = [];
  for (let m = 1; m <= messages; m++) {
    const targets = groups.map((g) => {
      const members = consumers.filter((c) => c.group === g);
      return members[(m - 1) % members.length].id;
    });
    for (const t of targets) received[t] = [...received[t], m];
    const caption =
      mode === 'load-balance'
        ? `m${m} goes to **${targets[0]}** only. A and B share one queue, so they split the work between them.`
        : mode === 'fan-out'
          ? `m${m} goes to **both** A and B. Each has its own subscription and gets its own copy.`
          : `m${m} goes to **${targets[0]}** (one member of the billing group) and to **C** (the audit group). Inside a group the work is shared; across groups everyone gets a copy.`;
    frames.push({ sent: m, received: structuredClone(received), current: targets, caption, quick: m > 2 });
  }
  const totals = consumers.map((c) => `${c.id}: ${received[c.id].length}`).join(', ');
  frames.push({
    sent: messages,
    received,
    current: [],
    caption: `Done — ${messages} messages sent. Received: ${totals}. ${
      mode === 'load-balance' ? 'Adding consumers spreads the work further.' : mode === 'fan-out' ? 'Adding a consumer adds another full copy.' : 'Consumer groups combine both patterns.'
    }`,
  });
  return frames;
}

// ── Acknowledgments, redelivery and dead letters ─────────────────────

export type RedeliveryMode = 'crash' | 'poison';

export interface QueueFrame extends StepFrame {
  /** Messages waiting in the broker, front first. */
  queue: string[];
  /** Message each consumer is currently working on. */
  inFlight: Record<string, string | null>;
  /** Messages each consumer finished and acknowledged, in order. */
  done: Record<string, string[]>;
  down: string[];
  dlq: string[];
}

/** Scripted AMQP-style queue: a crash causes reordering; a malformed message ends in the dead-letter queue. */
export function redeliveryFrames(mode: RedeliveryMode): QueueFrame[] {
  const frames: QueueFrame[] = [];
  let state: Omit<QueueFrame, 'caption'> = { queue: [], inFlight: { C1: null, C2: null }, done: { C1: [], C2: [] }, down: [], dlq: [] };
  const step = (patch: Partial<Omit<QueueFrame, 'caption'>>, caption: string) => {
    state = { ...state, ...patch };
    frames.push({ ...structuredClone(state), caption });
  };

  if (mode === 'crash') {
    step({ queue: ['m1', 'm2', 'm3', 'm4', 'm5'] }, 'Five messages wait in one queue. C1 and C2 share it (load balancing).');
    step({ queue: ['m3', 'm4', 'm5'], inFlight: { C1: 'm1', C2: 'm2' } }, 'The broker hands m1 to C1 and m2 to C2.');
    step({ inFlight: { C1: null, C2: null }, done: { C1: ['m1'], C2: ['m2'] } }, 'Both finish and send an **acknowledgment** (“done with it”). The broker deletes m1 and m2.');
    step({ queue: ['m5'], inFlight: { C1: 'm4', C2: 'm3' } }, 'Next, m3 goes to C2 and m4 to C1.');
    step({ inFlight: { C1: 'm4', C2: null }, down: ['C2'] }, '**C2 crashes** halfway through m3, before acknowledging it.');
    step({ inFlight: { C1: null, C2: null }, done: { C1: ['m1', 'm4'], C2: ['m2'] } }, 'Meanwhile C1 finishes m4 and acknowledges it.');
    step({ queue: ['m3', 'm5'] }, 'The broker notices C2’s connection is gone. m3 was never acknowledged, so it goes **back in the queue** to be delivered again.');
    step({ queue: ['m5'], inFlight: { C1: 'm3', C2: null } }, 'm3 is **redelivered** to C1.');
    step({ queue: [], inFlight: { C1: 'm5', C2: null }, done: { C1: ['m1', 'm4', 'm3'], C2: ['m2'] } }, 'C1 acknowledges m3 and takes m5.');
    step(
      { inFlight: { C1: null, C2: null }, done: { C1: ['m1', 'm4', 'm3', 'm5'], C2: ['m2'] } },
      'All done. Sent in order m1…m5, but **processed m1, m2, m4, m3, m5**: redelivery plus load balancing reorders messages. Fine if they’re independent; a problem if m4 depends on m3.',
    );
    return frames;
  }

  step({ queue: ['m1', 'm2', 'm3'] }, 'Three messages wait. m2 is malformed — the producer left out a required field.');
  step({ queue: ['m3'], inFlight: { C1: 'm1', C2: 'm2' } }, 'm1 goes to C1, m2 to C2.');
  step({ inFlight: { C1: null, C2: null }, done: { C1: ['m1'], C2: [] }, down: ['C2'] }, 'C1 handles m1. **C2 crashes** trying to read m2, so m2 is never acknowledged (attempt 1).');
  step({ queue: ['m2', 'm3'], down: [] }, 'C2 restarts. The broker puts m2 back to be delivered again.');
  step({ queue: ['m3'], inFlight: { C1: 'm2', C2: null } }, 'm2 is redelivered — this time to C1.');
  step({ inFlight: { C1: null, C2: null }, down: ['C1'] }, '**C1 crashes** on m2 as well (attempt 2). Retrying will never help: the message itself is broken.');
  step({ queue: ['m2', 'm3'], down: [] }, 'Without a limit this loops forever — a **poison message**. If the queue kept strict order, m3 would be stuck behind it for good.');
  step(
    { queue: ['m3'], dlq: ['m2'] },
    'After the retry limit, the broker moves m2 to a **dead letter queue (DLQ)**: a side queue for messages that can’t be processed. An alert fires; a person can fix and resend it, or drop it.',
  );
  step({ queue: [], inFlight: { C1: 'm3', C2: null } }, 'The main queue is unblocked: m3 goes to C1.');
  step({ inFlight: { C1: null, C2: null }, done: { C1: ['m1', 'm3'], C2: [] } }, 'Done: m1 and m3 processed, m2 parked in the DLQ for a human to look at.');
  return frames;
}

// ── Keeping two systems in sync ──────────────────────────────────────

export type SyncMode = 'race' | 'partial-failure' | 'cdc';

export interface SyncFrame extends StepFrame {
  db: string;
  index: string;
  /** The database's own change log (CDC mode). */
  log: string[];
  /** How many log entries the index has applied. */
  applied: number;
  actor?: 'client 1' | 'client 2' | 'CDC';
  target?: 'db' | 'index';
  failed?: boolean;
}

export function syncFrames(mode: SyncMode): SyncFrame[] {
  const frames: SyncFrame[] = [];
  let s: Omit<SyncFrame, 'caption'> = { db: 'old', index: 'old', log: [], applied: 0 };
  const step = (patch: Partial<Omit<SyncFrame, 'caption'>>, caption: string) => {
    s = { db: s.db, index: s.index, log: s.log, applied: s.applied, ...patch };
    frames.push({ ...s, log: [...s.log], caption });
  };
  if (mode === 'race') {
    step({}, 'Client 1 wants X = A; client 2, at the same moment, wants X = B. Each writes to the database, then to the search index (**dual writes**).');
    step({ db: 'A', actor: 'client 1', target: 'db' }, 'Client 1 writes X = A to the database.');
    step({ db: 'B', actor: 'client 2', target: 'db' }, 'Client 2 writes X = B to the database. The database ends at **B**.');
    step({ index: 'B', actor: 'client 2', target: 'index' }, 'Client 2 is quick: it writes X = B to the search index.');
    step({ index: 'A', actor: 'client 1', target: 'index' }, 'Client 1’s index write was delayed and lands last: X = A.');
    step({}, 'Result: database says **B**, search index says **A** — and no error was raised anywhere. They stay different until X is written again.');
    return frames;
  }
  if (mode === 'partial-failure') {
    step({}, 'Client 1 wants X = A, written to the database and then to the search index.');
    step({ db: 'A', actor: 'client 1', target: 'db' }, 'The database write succeeds: X = A.');
    step({ actor: 'client 1', target: 'index', failed: true }, 'The search-index write **fails** — a timeout, or the client crashes first.');
    step({}, 'Result: database says **A**, index still says **old**. Making both writes succeed or fail together is the atomic-commit problem, which is expensive to solve across two systems.');
    return frames;
  }
  step({}, 'Same two clients — but now they write **only to the database**. The search index follows the database’s change log (**change data capture**, CDC).');
  step({ db: 'A', log: ['X = A'], actor: 'client 1', target: 'db' }, 'Client 1’s write commits first. The database records it as entry #1 in its log.');
  step({ db: 'B', log: ['X = A', 'X = B'], actor: 'client 2', target: 'db' }, 'Client 2’s write commits second: entry #2. **The database alone decides the order.**');
  step({ index: 'A', applied: 1, actor: 'CDC', target: 'index' }, 'The CDC consumer reads entry #1 and applies it to the index.');
  step({ index: 'B', applied: 2, actor: 'CDC', target: 'index' }, 'Then entry #2 — in the same order the database used.');
  step({}, 'Result: both say **B**. The index may lag a moment behind, but it can’t disagree for good: it’s a follower replaying the leader’s log.');
  return frames;
}

// ── Log compaction ───────────────────────────────────────────────────

export interface KeyedRecord {
  key: string;
  /** null is a tombstone (the key was deleted). */
  value: string | null;
}

export interface CompactionFrame extends StepFrame {
  cursor?: number;
  kept: number[];
  dropped: number[];
  /** Set once compaction has finished: the compacted log, with original offsets. */
  compacted?: { offset: number; record: KeyedRecord }[];
  /** Set on the final frame: what a new consumer rebuilds by reading from offset 0. */
  rebuilt?: Record<string, string>;
}

/** Keep only the newest record for each key; drop tombstoned keys entirely. */
export function compactionFrames(log: readonly KeyedRecord[]): CompactionFrame[] {
  const keys = new Set(log.map((r) => r.key));
  const frames: CompactionFrame[] = [
    { kept: [], dropped: [], caption: `The log holds ${log.length} records but only ${keys.size} different keys. Compaction keeps just the newest record per key.` },
  ];
  const kept: number[] = [];
  const dropped: number[] = [];
  log.forEach((record, i) => {
    const newer = log.findIndex((r, j) => j > i && r.key === record.key);
    if (newer !== -1) {
      dropped.push(i);
      frames.push({ cursor: i, kept: [...kept], dropped: [...dropped], quick: true, caption: `Offset ${i}: \`${record.key}\` is overwritten later (offset ${newer}) → drop it.` });
    } else if (record.value === null) {
      dropped.push(i);
      frames.push({
        cursor: i,
        kept: [...kept],
        dropped: [...dropped],
        caption: `Offset ${i}: the newest record for \`${record.key}\` is a **tombstone** (the key was deleted) → after a grace period it is removed too, so the key disappears completely.`,
      });
    } else {
      kept.push(i);
      frames.push({ cursor: i, kept: [...kept], dropped: [...dropped], caption: `Offset ${i}: \`${record.key} = ${record.value}\` is the newest value for its key → keep it.` });
    }
  });
  const compacted = kept.map((offset) => ({ offset, record: log[offset] }));
  frames.push({
    kept,
    dropped,
    compacted,
    caption: `Compacted: ${compacted.length} records instead of ${log.length}. Offsets don’t change, there are just gaps. The size now depends on how many keys exist, not on how many writes ever happened.`,
  });
  const rebuilt = Object.fromEntries(compacted.map(({ record }) => [record.key, record.value as string]));
  frames.push({
    kept,
    dropped,
    compacted,
    rebuilt,
    caption: `A brand-new consumer reads the compacted log from offset 0 and ends with the full current state (${Object.entries(rebuilt)
      .map(([k, v]) => `${k} = ${v}`)
      .join(', ')}) — no separate database snapshot needed.`,
  });
  return frames;
}

// ── Deriving state (and new views) from an event log ─────────────────

export interface CartEvent {
  type: 'added' | 'removed' | 'checked-out';
  item?: string;
}

export interface CartViews {
  cart: string[];
  removed: string[];
  status: 'open' | 'checked out';
  /** Built later by replaying the log: how often each item was ever added. */
  popularity?: Record<string, number>;
}

export interface EventLogFrame extends StepFrame {
  applied: number;
  views: CartViews;
  replaying: boolean;
}

const describe = (e: CartEvent) => (e.type === 'checked-out' ? 'CheckedOut' : `${e.type === 'added' ? 'ItemAdded' : 'ItemRemoved'}(${e.item})`);

function apply(views: CartViews, e: CartEvent, withPopularity: boolean): CartViews {
  const next: CartViews = { ...views, cart: [...views.cart], removed: [...views.removed], popularity: views.popularity && { ...views.popularity } };
  if (e.type === 'added' && e.item) {
    next.cart.push(e.item);
    if (withPopularity && next.popularity) next.popularity[e.item] = (next.popularity[e.item] ?? 0) + 1;
  }
  if (e.type === 'removed' && e.item) {
    next.cart = next.cart.filter((i) => i !== e.item);
    next.removed.push(e.item);
  }
  if (e.type === 'checked-out') next.status = 'checked out';
  return next;
}

/** Apply events one by one to two views; optionally replay the whole log into a brand-new third view. */
export function eventLogFrames(events: readonly CartEvent[], replay = false): EventLogFrame[] {
  let views: CartViews = { cart: [], removed: [], status: 'open' };
  const frames: EventLogFrame[] = [];
  events.forEach((e, i) => {
    views = apply(views, e, false);
    frames.push({
      applied: i + 1,
      views,
      replaying: false,
      caption:
        e.type === 'removed'
          ? `Apply \`${describe(e)}\`: the cart drops ${e.item} — but the event stays in the log, and the analytics view records that ${e.item} was considered and removed.`
          : e.type === 'checked-out'
            ? `Apply \`${describe(e)}\`: the order is placed. The cart view is what fulfilment needs; it no longer shows anything about what was removed.`
            : `Apply \`${describe(e)}\`: both views update. The event itself is never changed.`,
    });
  });
  if (!replay) return frames;
  views = { ...views, popularity: {} };
  frames.push({ applied: 0, views, replaying: true, caption: 'Months later you want a new feature: “how often is each item added to carts?”. Start a new consumer at the **beginning** of the log.' });
  events.forEach((e, i) => {
    views = apply(views, e, true);
    frames.push({ applied: i + 1, views, replaying: true, quick: true, caption: `Replay \`${describe(e)}\` into the new view.` });
  });
  frames.push({
    applied: events.length,
    views,
    replaying: true,
    caption: 'The new view is built from history the old views had thrown away — without touching them. Run it alongside, switch readers over, then retire what you no longer need.',
  });
  return frames;
}

// ── Event time vs processing time ────────────────────────────────────

export interface RateFrame extends StepFrame {
  minute: number;
  processorUp: boolean;
  backlog: number;
  byEventTime: number[];
  byProcessingTime: number[];
}

/** Ten requests arrive every minute; the processor is down for one minute and then catches up. */
export function eventTimeFrames(minutes = 6, perMinute = 10, downMinute = 3): RateFrame[] {
  const byEventTime = new Array<number>(minutes).fill(0);
  const byProcessingTime = new Array<number>(minutes).fill(0);
  let backlog = 0;
  const frames: RateFrame[] = [];
  for (let m = 0; m < minutes; m++) {
    const up = m !== downMinute;
    if (up) {
      // The backlog was produced during the down minute, so event time puts it back there.
      if (backlog) byEventTime[downMinute] += backlog;
      byEventTime[m] += perMinute;
      byProcessingTime[m] = backlog + perMinute;
      backlog = 0;
    } else {
      backlog += perMinute;
    }
    frames.push({
      minute: m,
      processorUp: up,
      backlog,
      byEventTime: [...byEventTime],
      byProcessingTime: [...byProcessingTime],
      caption: !up
        ? `Minute ${m}: the stream processor is being redeployed. ${perMinute} requests still happen; they wait in the broker.`
        : m === downMinute + 1
          ? `Minute ${m}: it’s back and works through the backlog plus this minute’s requests: **${byProcessingTime[m]}** processed. Counting by processing time shows a fake spike; counting by event time puts each request back in the minute it really happened.`
          : `Minute ${m}: ${perMinute} requests happen and are processed straight away. Both charts agree.`,
    });
  }
  frames.push({
    minute: minutes - 1,
    processorUp: true,
    backlog: 0,
    byEventTime,
    byProcessingTime,
    caption: 'Real traffic was a steady 10 per minute. Only the **event-time** chart says so; the processing-time chart shows a dip and a spike that never happened.',
  });
  return frames;
}

// ── Exactly-once effects ─────────────────────────────────────────────

export type EffectMode = 'naive' | 'idempotent' | 'atomic';

export interface EffectFrame extends StepFrame {
  /** Next offset the consumer will read. */
  position: number;
  committed: number;
  balance: number;
  /** Offset of the last deposit applied, stored next to the balance (idempotent mode). */
  lastApplied: number | null;
  phase: 'read' | 'write' | 'commit' | 'crash' | 'restart' | 'skip' | 'abort' | 'done';
  current?: number;
}

export const DEPOSITS = [10, 20, 5];

/** Deposits arrive on a log; the consumer crashes after applying one but before committing its offset. */
export function effectFrames(mode: EffectMode, crashAt = 1): EffectFrame[] {
  const frames: EffectFrame[] = [];
  let s: Omit<EffectFrame, 'caption' | 'phase'> = { position: 0, committed: 0, balance: 0, lastApplied: null };
  const push = (phase: EffectFrame['phase'], patch: Partial<typeof s>, caption: string, quick = false) => {
    s = { ...s, ...patch };
    frames.push({ ...s, phase, caption, quick });
  };
  const correct = DEPOSITS.reduce((a, b) => a + b, 0);
  let crashed = false;

  for (let offset = 0; offset < DEPOSITS.length; ) {
    const amount = DEPOSITS[offset];
    push('read', { current: offset }, `Read offset ${offset}: deposit **+${amount}**.`, offset !== crashAt);
    if (mode === 'idempotent' && s.lastApplied !== null && offset <= s.lastApplied) {
      push('skip', {}, `The balance row says offset ${s.lastApplied} was already applied, so this is a repeat → **skip** the write.`);
    } else if (mode === 'atomic' && offset === crashAt && !crashed) {
      push('write', { balance: s.balance + amount }, `Inside one transaction: add ${amount} to the balance and move the offset to ${offset + 1}…`);
      crashed = true;
      push('crash', { balance: s.balance - amount }, '**Crash** before the transaction commits. Both changes are thrown away together — the balance is back where it was.');
      push('restart', { position: s.committed }, `Restart from the committed offset ${s.committed}.`);
      offset = s.committed;
      continue;
    } else {
      push(
        'write',
        mode === 'atomic'
          ? { balance: s.balance + amount, committed: offset + 1, position: offset + 1 }
          : { balance: s.balance + amount, lastApplied: mode === 'idempotent' ? offset : s.lastApplied },
        mode === 'idempotent'
          ? `Write balance = ${s.balance + amount} **together with** “last applied offset = ${offset}” in the same row.`
          : mode === 'atomic'
            ? `In one transaction: balance = ${s.balance + amount} and committed offset = ${offset + 1}. Both are saved together.`
            : `Write balance = ${s.balance + amount} to the database.`,
      );
    }
    if (offset === crashAt && !crashed) {
      crashed = true;
      push('crash', {}, `**Crash** after writing to the database but before committing offset ${offset + 1}. The broker still thinks offset ${offset} is unprocessed.`);
      push('restart', { position: s.committed }, `Restart from the committed offset **${s.committed}** — offset ${offset} will be read again.`);
      offset = s.committed;
      continue;
    }
    if (mode !== 'atomic') push('commit', { committed: offset + 1, position: offset + 1 }, `Commit offset ${offset + 1}.`, true);
    offset++;
  }
  const ok = s.balance === correct;
  push(
    'done',
    { current: undefined },
    ok
      ? `Finished: balance **${s.balance}**, exactly right. ${mode === 'idempotent' ? 'The repeat was detected because the offset was stored with the data.' : 'The write and the offset commit succeeded or failed as one.'}`
      : `Finished: balance **${s.balance}**, but the deposits add up to ${correct}. The redelivered deposit was applied twice — at-least-once delivery with a non-idempotent write.`,
  );
  return frames;
}
