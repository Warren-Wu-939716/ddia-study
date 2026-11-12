import { chips, recorder, type Board, type BoardFrame, type Box, type Chip, type Scenario, type Tone } from './board.ts';

// ── Lesson 1: batch vs stream ────────────────────────────────────────

const ORDERS = [
  { id: 'o1', at: 9 },
  { id: 'o2', at: 13 },
  { id: 'o3', at: 18 },
  { id: 'o4', at: 23 },
];
const hour = (h: number) => `${String(h % 24).padStart(2, '0')}:00`;

export function batchStreamFrames(mode: 'batch' | 'stream'): BoardFrame[] {
  const happened: string[] = [];
  let pile: string[] = [];
  let processing: string[] = [];
  const waited = new Map<string, number>();
  let updated = 'yesterday';
  let focus: string | undefined;
  const view = (): Board => ({
    columns: [
      [
        {
          id: 'source',
          title: 'orders placed today',
          chips: ORDERS.filter((o) => happened.includes(o.id)).map((o) => ({ text: o.id, tag: hour(o.at), tone: focus === o.id ? 'focus' : undefined })),
          empty: 'none yet',
        },
      ],
      [
        mode === 'batch'
          ? { id: 'proc', title: 'today’s pile (waits for midnight)', chips: pile.map((id) => ({ text: id, tone: 'warn', to: 'report' })), empty: 'empty' }
          : { id: 'proc', title: 'stream processor', chips: processing.map((id) => ({ text: id, tone: 'focus', to: 'report' })), empty: 'idle — handles each order as it arrives' },
      ],
      [
        {
          id: 'report',
          title: 'sales report',
          lines: [
            `orders counted: **${waited.size}**`,
            `last updated: ${updated}`,
            ...[...waited].map(([id, h]) => `${id} waited ${h === 0 ? 'moments' : `${h} h`}`),
          ],
        },
      ],
    ],
  });
  const { frames, step } = recorder(view);

  step(
    mode === 'batch'
      ? 'Orders are placed through the day. A nightly **batch** job will count them all at midnight.'
      : 'Orders are placed through the day. A **stream** processor counts each one as soon as it arrives.',
  );
  for (const o of ORDERS) {
    happened.push(o.id);
    focus = o.id;
    if (mode === 'batch') {
      pile.push(o.id);
      step(`${hour(o.at)}: ${o.id} is placed. It joins today’s pile and waits — the report still says ${waited.size}.`);
    } else {
      processing = [o.id];
      waited.set(o.id, 0);
      updated = hour(o.at);
      step(`${hour(o.at)}: ${o.id} is placed and counted straight away. The report says ${waited.size}.`);
    }
  }
  focus = undefined;
  processing = [];
  if (mode === 'batch') {
    step('Midnight. The day is over, so the pile is **bounded**: it has a known end. The batch job reads the whole pile in one go.');
    for (const o of ORDERS) waited.set(o.id, 24 - o.at);
    pile = [];
    updated = '00:00';
    step('The report jumps to 4 orders. o1 waited 15 hours to be counted — and an order placed at 00:01 will wait almost a whole day.', { tone: 'warn' });
  } else {
    step(
      'There is no “end of the day” for a stream: orders keep coming for as long as the shop exists, so the input is **unbounded**. In return, the report is never more than moments behind.',
      { tone: 'ok' },
    );
  }
  return frames;
}

// ── Lesson 1: producers, a topic and consumers ───────────────────────

const CONSUMERS = [
  { id: 'emails', title: 'consumer: send emails' },
  { id: 'search', title: 'consumer: update search' },
  { id: 'fraud', title: 'consumer: fraud checks' },
];

export function pubsubFrames(): BoardFrame[] {
  const produced = { checkout: [] as Chip[], app: [] as Chip[] };
  const topic: Chip[] = [];
  const received: Chip[] = [];
  let delivering = false;
  const view = (): Board => ({
    columns: [
      [
        { id: 'checkout', title: 'producer: checkout website', chips: produced.checkout, empty: 'nothing sent yet' },
        { id: 'app', title: 'producer: phone app', chips: produced.app, empty: 'nothing sent yet' },
      ],
      [{ id: 'topic', title: 'topic “orders”', chips: topic, empty: 'empty' }],
      CONSUMERS.map((c) => ({
        id: c.id,
        title: c.title,
        chips: received.map((r, i) => ({ ...r, tone: delivering && i === received.length - 1 ? ('focus' as const) : ('ok' as const) })),
        empty: 'waiting',
      })),
    ],
    links: [{ label: 'publish' }, { label: 'every subscriber gets a copy' }],
  });
  const { frames, step } = recorder(view);
  const settle = () => {
    for (const list of [produced.checkout, produced.app, topic]) for (const c of list) c.tone = undefined;
  };

  step('Two producers, one topic called “orders”, and three consumers that each want to hear about new orders.');
  produced.checkout.push({ id: 'order1', text: 'order 1 placed', tag: '10:03:12', tone: 'focus' });
  step('Someone places order 1 on the website. The checkout code records that fact as an **event**: a small record of something that happened, with a timestamp.');
  produced.checkout[0] = { id: 'order1', text: '{"order":1,"type":"placed","at":"10:03:12"}', tone: 'focus' };
  step('To send it, the event is **encoded** as bytes — here as JSON text.');
  settle();
  topic.push({ id: 'order1', text: 'order 1 placed', tag: '10:03:12', tone: 'focus' });
  step('The producer sends the event once, to the topic. It doesn’t know or care who will read it.');
  settle();
  received.push({ id: 'order1', text: 'order 1 placed' });
  delivering = true;
  step('Every consumer subscribed to “orders” receives the same event and does its own job with it: email a receipt, update the search index, check for fraud.');
  delivering = false;
  produced.app.push({ id: 'order2', text: 'order 2 placed', tag: '10:03:15', tone: 'focus' });
  topic.push({ id: 'order2', text: 'order 2 placed', tag: '10:03:15', tone: 'focus' });
  step('The phone app is a second producer writing to the same topic. Order 2 goes in after order 1.');
  settle();
  received.push({ id: 'order2', text: 'order 2 placed' });
  delivering = true;
  step('Again, each consumer gets its own copy.');
  delivering = false;
  step('Adding a fourth consumer later wouldn’t change either producer. Producers and consumers only need to agree on the topic.', { tone: 'ok' });
  return frames;
}

// ── Lesson 1: polling vs notification ────────────────────────────────

export type PollMode = 'poll-3' | 'poll-1' | 'notify';
const ARRIVALS = [
  { id: 'e1', t: 2 },
  { id: 'e2', t: 7 },
];
const POLL_SECONDS = 9;

export function pollingFrames(mode: PollMode): BoardFrame[] {
  const every = mode === 'poll-3' ? 3 : 1;
  const inTable: string[] = [];
  const seenAt = new Map<string, number>();
  let checks = 0;
  let empty = 0;
  let ringing = false;
  const view = (): Board => ({
    columns: [
      [
        {
          id: 'table',
          title: 'events table',
          chips: ARRIVALS.filter((a) => inTable.includes(a.id)).map((a) => ({ text: a.id, tag: `${a.t}s`, tone: seenAt.has(a.id) ? 'ok' : 'warn' })),
          empty: 'empty',
        },
      ],
      [
        {
          id: 'consumer',
          title: mode === 'notify' ? 'consumer (waits for the doorbell)' : `consumer (checks every ${every} s)`,
          tone: ringing ? 'focus' : undefined,
          chips: ARRIVALS.filter((a) => seenAt.has(a.id)).map((a) => ({ text: a.id, tone: 'ok' })),
          lines: [
            mode === 'notify' ? `woken up: **${checks}** times (${empty} for nothing)` : `checks: **${checks}** (${empty} found nothing)`,
            ...ARRIVALS.filter((a) => seenAt.has(a.id)).map((a) => `${a.id} noticed ${seenAt.get(a.id)! - a.t === 0 ? 'immediately' : `${seenAt.get(a.id)! - a.t} s late`}`),
          ],
        },
      ],
    ],
    links: [{ label: mode === 'notify' ? 'doorbell' : '“anything new?”' }],
  });
  const { frames, step } = recorder(view);

  step(
    mode === 'notify'
      ? 'A producer writes events into a table. This time the database **notifies** the consumer whenever a row is added.'
      : `A producer writes events into a table. The consumer **polls**: every ${every} s it asks “anything new?”.`,
  );
  for (let t = 1; t <= POLL_SECONDS; t++) {
    const arrival = ARRIVALS.find((a) => a.t === t);
    if (arrival) {
      inTable.push(arrival.id);
      if (mode === 'notify') {
        checks++;
        seenAt.set(arrival.id, t);
        ringing = true;
        step(`${t} s: ${arrival.id} is written and the consumer’s doorbell rings. It reads ${arrival.id} at once.`);
        ringing = false;
      } else {
        step(`${t} s: ${arrival.id} is written to the table. The consumer doesn’t know yet.`);
      }
    }
    if (mode !== 'notify' && t % every === 0) {
      checks++;
      const fresh = inTable.filter((id) => !seenAt.has(id));
      ringing = true;
      if (fresh.length) {
        for (const id of fresh) seenAt.set(id, t);
        step(`${t} s: check — found ${fresh.join(', ')}.`);
      } else {
        empty++;
        step(`${t} s: check — nothing new. A wasted trip.`, { quick: true });
      }
      ringing = false;
    }
  }
  const latest = Math.max(...ARRIVALS.map((a) => seenAt.get(a.id)! - a.t));
  step(
    mode === 'notify'
      ? 'Done: the consumer woke only when there was something to read, and noticed every event immediately.'
      : mode === 'poll-3'
        ? `Done: ${checks} checks, ${empty} wasted, and events waited up to ${latest} s. To react faster you’d have to check more often…`
        : `Done: no waiting any more, but ${empty} of ${checks} checks found nothing. With hundreds of consumers checking every second, most of the database’s work is wasted.`,
    { tone: mode === 'notify' ? 'ok' : 'warn' },
  );
  return frames;
}

// ── Lesson 2: producer faster than consumer ──────────────────────────

export type OverloadMode = 'drop' | 'buffer' | 'backpressure';
const RATE_IN = 3;
const RATE_OUT = 2;
const OVERLOAD_SECONDS = 4;
const ROOM = 2;

export function overloadFrames(mode: OverloadMode): BoardFrame[] {
  let next = 1;
  const held: string[] = [];
  let queue: string[] = [];
  const done: string[] = [];
  const lost: string[] = [];
  let latest: string[] = [];
  const view = (): Board => ({
    columns: [
      [
        {
          id: 'producer',
          title: `producer (${RATE_IN} per second)`,
          tone: held.length ? 'warn' : undefined,
          chips: chips(held, 'warn'),
          empty: mode === 'backpressure' ? 'nothing held back' : 'sends as fast as it likes',
          lines: held.length ? ['**blocked**: holding these until there is room'] : [],
        },
      ],
      [
        mode === 'drop'
          ? { id: 'buffer', title: 'no buffer', chips: [], empty: 'extra messages have nowhere to wait' }
          : {
              id: 'buffer',
              title: mode === 'buffer' ? 'queue (grows as needed)' : `queue (room for ${ROOM})`,
              chips: queue.map((text) => ({ text, from: 'producer' })),
              empty: 'empty',
              lines: [`waiting: **${queue.length}**`],
            },
        ...(mode === 'drop' ? [{ id: 'lost', title: 'dropped', chips: lost.map((text) => ({ text, tone: 'bad' as const, from: 'producer' })), empty: 'none' }] : []),
      ],
      [
        {
          id: 'consumer',
          title: `consumer (${RATE_OUT} per second)`,
          chips: done.map((m) => ({ text: m, tone: latest.includes(m) ? ('focus' as const) : ('ok' as const), from: 'producer' })),
          empty: 'nothing yet',
          lines: [`processed: **${done.length}**`],
        },
      ],
    ],
  });
  const { frames, step } = recorder(view);
  const make = (n: number) => Array.from({ length: n }, () => `m${next++}`);

  step(`A producer makes ${RATE_IN} messages per second, but the consumer can only handle ${RATE_OUT}. What happens to the extra one each second?`);
  for (let t = 1; t <= OVERLOAD_SECONDS; t++) {
    const fresh = make(RATE_IN);
    if (mode === 'drop') {
      latest = fresh.slice(0, RATE_OUT);
      done.push(...latest);
      lost.push(...fresh.slice(RATE_OUT));
      step(`Second ${t}: ${fresh.join(', ')} arrive. The consumer takes ${RATE_OUT}; ${fresh.slice(RATE_OUT).join(', ')} has nowhere to go and is **dropped**.`);
    } else if (mode === 'buffer') {
      queue.push(...fresh);
      latest = queue.slice(0, RATE_OUT);
      queue = queue.slice(RATE_OUT);
      done.push(...latest);
      step(`Second ${t}: ${RATE_IN} more arrive and ${RATE_OUT} are processed. The queue now holds ${queue.length}.`);
    } else {
      held.push(...fresh);
      const room = ROOM - queue.length;
      queue.push(...held.splice(0, room));
      latest = queue.slice(0, RATE_OUT);
      queue = queue.slice(RATE_OUT);
      done.push(...latest);
      step(
        `Second ${t}: the producer wants to send ${RATE_IN}, but the queue only has room for ${room}. It is **blocked** and holds ${held.length} back — nothing lost, just slowed down.`,
      );
    }
  }
  latest = [];
  step(
    mode === 'drop'
      ? `After ${OVERLOAD_SECONDS} s: ${done.length} processed, ${lost.length} lost for good. Fine for a temperature reading that will be sent again in a minute; not for payments.`
      : mode === 'buffer'
        ? `After ${OVERLOAD_SECONDS} s: nothing lost, but the queue grows by 1 every second for as long as the producer is faster. Sooner or later memory runs out — does it spill to disk, and what happens when that fills?`
        : `After ${OVERLOAD_SECONDS} s: nothing lost and the queue never grew past ${ROOM}. The price: the producer was slowed to the consumer’s pace (${held.length} messages still waiting at the source).`,
    { tone: mode === 'backpressure' ? 'ok' : 'warn' },
  );
  return frames;
}

// ── Lesson 2: direct messaging vs a broker ───────────────────────────

export type DeliveryPath = 'direct' | 'broker';
const SENT = ['m1', 'm2', 'm3', 'm4'];
const OFFLINE = ['m2', 'm3'];

export function directBrokerFrames(mode: DeliveryPath): BoardFrame[] {
  const sent: string[] = [];
  let stored: string[] = [];
  const received: string[] = [];
  const lost: string[] = [];
  let online = true;
  let focus: string | undefined;
  const tone = (m: string): Tone | undefined => (m === focus ? 'focus' : undefined);
  const consumer: () => Box = () => ({
    id: 'consumer',
    title: `consumer (${online ? 'online' : 'offline'})`,
    tone: online ? undefined : 'muted',
    chips: received.map((m) => ({ text: m, tone: tone(m) ?? 'ok' })),
    empty: 'nothing yet',
  });
  const producer: () => Box = () => ({ id: 'producer', title: 'producer', chips: sent.map((m) => ({ text: m, tone: tone(m) })), empty: 'nothing sent yet' });
  const view = (): Board =>
    mode === 'direct'
      ? {
          columns: [[producer()], [consumer(), { id: 'lost', title: 'lost', chips: chips(lost, 'bad'), empty: 'none' }]],
          links: [{ label: 'direct call', tone: online ? undefined : 'bad' }],
        }
      : {
          columns: [[producer()], [{ id: 'broker', title: 'message broker (stores)', chips: stored.map((m) => ({ text: m, tone: tone(m) ?? 'warn' })), empty: 'nothing waiting' }], [consumer()]],
          links: [{ label: 'send' }, { label: 'deliver', tone: online ? undefined : 'bad' }],
        };
  const { frames, step } = recorder(view);

  step(
    mode === 'direct'
      ? 'The producer sends 4 messages straight to the consumer, like a webhook call. Part-way through, the consumer restarts for a deploy.'
      : 'The producer sends 4 messages to a **message broker**, which stores them and passes them on. Part-way through, the consumer restarts for a deploy.',
  );
  for (const m of SENT) {
    if (m === OFFLINE[0]) {
      online = false;
      focus = undefined;
      step('The consumer goes offline for a deploy.');
    }
    if (m === SENT[OFFLINE.length + 1]) {
      online = true;
      focus = undefined;
      if (mode === 'broker') {
        received.push(...stored);
        stored = [];
        step(`The consumer is back. The broker hands over what it kept while the consumer was away: ${OFFLINE.join(', ')}.`);
      } else {
        step('The consumer is back. Nothing tells it that it missed anything.');
      }
    }
    sent.push(m);
    focus = m;
    if (mode === 'direct') {
      if (online) {
        received.push(m);
        step(`${m} is sent directly, and the consumer handles it.`);
      } else {
        lost.push(m);
        step(
          m === OFFLINE[0]
            ? `${m} is sent, but nobody is listening. The producer could retry — for as long as it remembers to. If it restarts too, the retry is forgotten and ${m} is gone.`
            : `${m}: same story — lost.`,
          { quick: m !== OFFLINE[0] },
        );
      }
    } else if (online) {
      stored.push(m);
      step(`${m} goes to the broker, which writes it down and confirms. The producer moves on straight away.`);
      stored = stored.filter((x) => x !== m);
      received.push(m);
      step(`The broker delivers ${m} to the consumer.`);
    } else {
      stored.push(m);
      step(
        m === OFFLINE[0]
          ? `${m} goes to the broker, which stores it and confirms. The producer doesn’t know or care that the consumer is down: delivery is **asynchronous**.`
          : `${m} is stored too.`,
        { quick: m !== OFFLINE[0] },
      );
    }
  }
  focus = undefined;
  step(
    mode === 'direct'
      ? `Result: ${received.length} of ${SENT.length} messages arrived. Direct delivery is fast, but only works while both sides are up.`
      : `Result: ${received.length} of ${SENT.length} arrived, in order. The broker absorbed the outage; the price is an extra hop and one more server to run.`,
    { tone: mode === 'direct' ? 'error' : 'ok' },
  );
  return frames;
}

// ── Lesson 3: partition keys and ordering ────────────────────────────

export type KeyMode = 'keyed' | 'round-robin';
const ORDER_EVENTS = [
  { id: 'A placed', key: 'A', status: 'placed' },
  { id: 'B placed', key: 'B', status: 'placed' },
  { id: 'A paid', key: 'A', status: 'paid' },
  { id: 'A shipped', key: 'A', status: 'shipped' },
  { id: 'B paid', key: 'B', status: 'paid' },
];
const KEY_HASH: Record<string, number> = { A: 0, B: 1 };
/** Seconds each consumer needs per event: c1 (partition 0) is slow, c2 (partition 1) is fast. */
const COST = [2, 1];

export function partitionOrderFrames(mode: KeyMode): BoardFrame[] {
  const pending = ORDER_EVENTS.map((e) => e.id);
  const partitions: string[][] = [[], []];
  const done = new Set<string>();
  const working: (string | undefined)[] = [undefined, undefined];
  const status: Record<string, string> = {};
  const applied: Record<string, number> = {};
  let focus: string | undefined;
  let compare = false;
  const truth = (key: string) => ORDER_EVENTS.filter((e) => e.key === key).at(-1)!.status;
  const view = (): Board => ({
    columns: [
      [{ id: 'producer', title: 'events to send (in order)', chips: chips(pending), empty: 'all sent' }],
      partitions.map((p, i) => ({
        id: `p${i}`,
        title: `partition ${i} → c${i + 1} (${i === 0 ? 'slow' : 'fast'})`,
        chips: p.map((id, offset) => ({
          text: id,
          tag: String(offset),
          tone: id === focus ? 'focus' : working[i] === id ? 'warn' : done.has(id) ? 'ok' : undefined,
        })),
        empty: 'empty',
      })),
      [
        {
          id: 'status',
          title: 'order status table',
          lines: ['A', 'B'].map((k) => {
            const s = status[k] ?? '—';
            return compare ? `${k}: **${s}** ${s === truth(k) ? '✓' : `✗ (really ${truth(k)})`}` : `${k}: ${s}`;
          }),
        },
      ],
    ],
    links: [{ label: mode === 'keyed' ? 'hash(key)' : 'next in turn' }, { label: 'consume' }],
  });
  const { frames, step } = recorder(view);

  step('Five events about two orders, A and B, sent in this order. The topic has 2 partitions; c1 reads partition 0 slowly, c2 reads partition 1 quickly. Each event sets its order’s status.');
  ORDER_EVENTS.forEach((e, i) => {
    const p = mode === 'keyed' ? KEY_HASH[e.key] : i % 2;
    pending.shift();
    partitions[p].push(e.id);
    focus = e.id;
    step(
      mode === 'keyed'
        ? `“${e.id}” has key ${e.key}. Hashing “${e.key}” always gives partition ${p}, so it lands there at offset ${partitions[p].length - 1}.`
        : `“${e.id}” has no key, so it goes to the next partition in turn: partition ${p}, offset ${partitions[p].length - 1}.`,
      { quick: i > 1 },
    );
  });
  focus = undefined;

  const next = [0, 0];
  const finish = [0, 0];
  const start = (c: number, now: number) => {
    working[c] = partitions[c][next[c]++];
    finish[c] = now + COST[c];
  };
  start(0, 0);
  start(1, 0);
  let wentBack = false;
  for (let t = 1; done.size < ORDER_EVENTS.length; t++) {
    const notes: string[] = [];
    for (const c of [0, 1]) {
      const id = working[c];
      if (!id || finish[c] !== t) continue;
      const e = ORDER_EVENTS.find((x) => x.id === id)!;
      const index = ORDER_EVENTS.indexOf(e);
      done.add(id);
      working[c] = undefined;
      const backwards = (applied[e.key] ?? -1) > index;
      status[e.key] = e.status;
      applied[e.key] = Math.max(applied[e.key] ?? -1, index);
      notes.push(`c${c + 1} finishes “${id}” → order ${e.key} is now **${e.status}**${backwards ? ' — but it had already shipped! The status just went backwards' : ''}`);
      wentBack ||= backwards;
      if (next[c] < partitions[c].length) start(c, t);
    }
    if (notes.length) step(`${t} s: ${notes.join('; ')}.`, { tone: notes.some((n) => n.includes('backwards')) ? 'error' : undefined });
  }
  compare = true;
  step(
    wentBack
      ? 'Without a key, A’s events were spread over both partitions. There is no order between partitions, so the fast consumer applied “A shipped” before the slow one applied “A paid”. A is stuck at **paid**.'
      : 'All of an order’s events shared a key, so they sat in one partition and were read in order. The partitions ran at different speeds, and it didn’t matter.',
    { tone: wentBack ? 'error' : 'ok' },
  );
  return frames;
}

// ── Lesson 3: head-of-line blocking ──────────────────────────────────

export type HolMode = 'log' | 'queue';
const HOL_MESSAGES = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'];
const SLOW = 'm2';
const SLOW_COST = 4;

export function holFrames(mode: HolMode): BoardFrame[] {
  const sources = mode === 'log' ? [HOL_MESSAGES.slice(0, 3), HOL_MESSAGES.slice(3)] : [[...HOL_MESSAGES]];
  const taken = new Set<string>();
  const finished: string[] = [];
  const working: (string | undefined)[] = [undefined, undefined];
  const since = [0, 0];
  const until = [0, 0];
  let now = 0;
  let blocked: string | undefined;
  const cost = (m: string) => (m === SLOW ? SLOW_COST : 1);
  const view = (): Board => ({
    columns: [
      sources.map((list, i) => ({
        id: mode === 'log' ? `p${i}` : 'queue',
        title: mode === 'log' ? `partition ${i} → c${i + 1} only` : 'shared queue → any free consumer',
        chips: list.map((m) => ({
          id: m,
          text: m === SLOW ? `${m} (slow)` : m,
          tone: finished.includes(m) ? 'ok' : working.includes(m) ? 'focus' : m === blocked ? 'bad' : undefined,
        })),
      })),
      [0, 1].map((c) => ({
        id: `c${c + 1}`,
        title: `consumer c${c + 1}`,
        tone: working[c] ? undefined : 'muted',
        lines: [working[c] ? `working on **${working[c]}** (${now - since[c]} of ${cost(working[c]!)} s)` : 'idle'],
      })),
      [{ id: 'done', title: 'finished, in order', chips: chips(finished, 'ok'), empty: 'nothing yet' }],
    ],
  });
  const { frames, step } = recorder(view);
  const nextFor = (c: number) => (mode === 'log' ? sources[c] : sources[0]).find((m) => !taken.has(m));
  const assign = () => {
    for (const c of [0, 1]) {
      if (working[c]) continue;
      const m = nextFor(c);
      if (!m) continue;
      taken.add(m);
      working[c] = m;
      since[c] = now;
      until[c] = now + cost(m);
    }
  };

  step(
    mode === 'log'
      ? `Six messages; ${SLOW} is slow (${SLOW_COST} s), the rest take 1 s. In a log-based broker each consumer owns a partition and reads it strictly in order.`
      : `Six messages; ${SLOW} is slow (${SLOW_COST} s), the rest take 1 s. In a traditional queue, whichever consumer is free takes the next message.`,
  );
  assign();
  step(`0 s: c1 starts ${working[0]}, c2 starts ${working[1]}.`);
  while (finished.length < HOL_MESSAGES.length) {
    now++;
    const completed: string[] = [];
    for (const c of [0, 1]) {
      if (working[c] && until[c] === now) {
        completed.push(working[c]!);
        finished.push(working[c]!);
        working[c] = undefined;
      }
    }
    assign();
    const waitingBehind = mode === 'log' && working[0] === SLOW ? sources[0].find((m) => !taken.has(m)) : undefined;
    blocked = waitingBehind;
    const parts = [
      completed.length ? `${completed.join(' and ')} finished` : '',
      working.some(Boolean) ? `now working: ${working.map((m, c) => (m ? `c${c + 1} on ${m}` : `c${c + 1} idle`)).join(', ')}` : '',
    ].filter(Boolean);
    const caption = `${now} s: ${parts.join('; ')}.${
      waitingBehind && !working[1] ? ` ${waitingBehind} is stuck behind ${SLOW} while c2 has nothing to do — **head-of-line blocking**.` : ''
    }`;
    step(caption, { tone: waitingBehind && !working[1] ? 'warn' : undefined });
  }
  blocked = undefined;
  step(
    mode === 'log'
      ? `All done after ${now} s. m3 waited behind ${SLOW} while c2 sat idle — but each partition was processed strictly in order.`
      : `All done after ${now} s, and nothing waited behind ${SLOW}. But the finish order was ${finished.join(', ')}: fine for independent tasks, a problem if order matters.`,
    { tone: mode === 'log' ? 'warn' : 'ok' },
  );
  return frames;
}

// ── Lesson 3: retention and consumer lag ─────────────────────────────

export const RETAIN = 5;
const RETENTION_SECONDS = 10;
export const LAG_ALERT = 3;

export function retentionFrames(): BoardFrame[] {
  let end = 0;
  let start = 0;
  let fast = 0;
  let slow = 0;
  let missed = 0;
  let alerted = false;
  let appended: number | undefined;
  const view = (): Board => ({
    columns: [
      [{ id: 'producer', title: 'producer', lines: ['writes 1 message per second'] }],
      [
        {
          id: 'log',
          title: `log (keeps the newest ${RETAIN})`,
          chips: [
            ...(start > 0 ? [{ text: `#0–${start - 1}`, tag: 'deleted', tone: 'muted' as const }] : []),
            ...Array.from({ length: end - start }, (_, i) => start + i).map((o) => ({ text: `#${o}`, tone: o === appended ? ('focus' as const) : undefined, from: 'producer' })),
          ],
          empty: 'empty',
          lines: [`reports ▸ next #${fast}`, `archive ▸ next #${slow}`],
        },
      ],
      [
        { id: 'reports', title: 'consumer “reports” (keeps up)', lines: [`lag: **${end - fast}**`] },
        {
          id: 'archive',
          title: 'consumer “archive” (1 every 2 s)',
          tone: missed ? 'bad' : end - slow >= LAG_ALERT ? 'warn' : undefined,
          lines: [`lag: **${end - slow}**${end - slow >= LAG_ALERT ? ' — alert!' : ''}`, `lost: ${missed}`],
        },
      ],
    ],
  });
  const { frames, step } = recorder(view);

  step(`A log that keeps only its newest ${RETAIN} messages (real logs keep days’ worth). “reports” reads every message at once; “archive” manages one every 2 seconds. Lag alerts fire at ${LAG_ALERT}.`);
  for (let t = 1; t <= RETENTION_SECONDS; t++) {
    appended = end;
    end++;
    const notes = [`#${appended} is appended`];
    if (end - start > RETAIN) {
      start = end - RETAIN;
      notes.push(`the log is full, so the oldest (#${start - 1}) is deleted`);
    }
    fast = end;
    let tone: BoardFrame['tone'];
    if (t % 2 === 0) {
      if (slow < start) {
        const gone = start - slow;
        missed += gone;
        notes.push(`archive needs #${slow}, but it was deleted — ${gone} message lost for good, so it skips to #${start}`);
        slow = start;
        tone = 'error';
      }
      notes.push(`archive reads #${slow}`);
      slow++;
    }
    const lag = end - slow;
    if (lag >= LAG_ALERT && !alerted) {
      alerted = true;
      notes.push(`archive is now ${lag} behind: **lag alert** — time for a human to look`);
      tone ??= 'warn';
    }
    step(`${t} s: ${notes.join('; ')}.`, { tone, quick: !tone && t > 2 });
  }
  appended = undefined;
  step(
    `The fast consumer never noticed the deletions. The slow one lost ${missed} message because it fell further behind than the log keeps. With a real log holding days of data, the lag alert would have given people days to react.`,
    { tone: 'warn' },
  );
  return frames;
}

// ── Lesson 4: initial snapshot for CDC ───────────────────────────────

export type SnapshotMode = 'naive' | 'tied';
interface Change {
  n: number;
  key: string;
  value: number;
}
const LATER: Change[] = [
  { n: 4, key: 'c', value: 1 },
  { n: 5, key: 'b', value: 2 },
];
const AFTER: Change = { n: 6, key: 'a', value: 3 };

export function snapshotFrames(mode: SnapshotMode): BoardFrame[] {
  const db: Record<string, number> = { a: 2, b: 1 };
  const log: Change[] = [{ n: 3, key: 'a', value: 2 }];
  let snapshot: Record<string, number> | undefined;
  let index: Record<string, number> | undefined;
  const applied = new Set<number>();
  const skipped = new Set<number>();
  let focus: number | undefined;
  let compare = false;
  const show = (o: Record<string, number>) => Object.keys(o).sort().map((k) => `${k} = ${o[k]}`);
  const view = (): Board => ({
    columns: [
      [
        { id: 'db', title: 'database', lines: show(db) },
        {
          id: 'log',
          title: 'change log',
          chips: [
            { text: '#1–#2', tag: 'deleted', tone: 'muted' },
            ...log.map((c) => ({
              text: `#${c.n} ${c.key}=${c.value}`,
              from: 'db',
              tone: c.n === focus ? ('focus' as const) : applied.has(c.n) ? ('ok' as const) : skipped.has(c.n) ? ('bad' as const) : undefined,
            })),
          ],
        },
      ],
      [{ id: 'snapshot', title: 'snapshot', lines: snapshot ? [...show(snapshot), ...(mode === 'tied' ? ['**as of change #3**'] : [])] : [], empty: 'not taken yet' }],
      [
        {
          id: 'index',
          title: 'new search index',
          tone: compare ? (Object.keys(db).every((k) => index?.[k] === db[k]) ? 'ok' : 'bad') : undefined,
          lines: index
            ? Object.keys({ ...db, ...index })
                .sort()
                .map((k) => `${k} = ${index![k] ?? '—'}${compare ? (index![k] === db[k] ? ' ✓' : ' ✗') : ''}`)
            : [],
          empty: 'empty',
        },
      ],
    ],
    links: [{ label: 'copy' }, { label: 'load' }],
  });
  const { frames, step } = recorder(view);
  const write = (c: Change) => {
    db[c.key] = c.value;
    log.push(c);
    focus = c.n;
  };
  const apply = (c: Change) => {
    index![c.key] = c.value;
    applied.add(c.n);
    focus = c.n;
  };

  step('A new search index needs a full copy of the database. The change log no longer goes back to the start (#1–#2 were deleted), so replaying it isn’t enough.');
  snapshot = { ...db };
  step(
    mode === 'tied'
      ? 'Take a **snapshot** — a consistent copy of the whole database — and note where the log was when it was taken: just after change #3.'
      : 'Take a **snapshot**: a consistent copy of the whole database as it is right now.',
  );
  write(LATER[0]);
  step('Copying a big database takes a while. Meanwhile, change #4 happens: c = 1.');
  write(LATER[1]);
  step('And change #5: b = 2.');
  focus = undefined;
  index = { ...snapshot };
  step('The snapshot finishes and is loaded into the search index.');
  if (mode === 'naive') {
    for (const c of LATER) skipped.add(c.n);
    step('Now follow the change log. The snapshot doesn’t say where it ended, so the only choice is to start from the newest entry — after #5.', { tone: 'warn' });
    write(AFTER);
    apply(AFTER);
    step('Change #6 (a = 3) arrives and is applied to the index too.');
  } else {
    for (const c of LATER) {
      apply(c);
      step(
        c === LATER[0]
          ? `The snapshot reflects everything up to #3, so start applying changes from #4: ${c.key} = ${c.value}.`
          : `Then #${c.n}: ${c.key} = ${c.value}.`,
        { quick: c !== LATER[0] },
      );
    }
    write(AFTER);
    apply(AFTER);
    step('Change #6 (a = 3) arrives and is applied as normal.');
  }
  focus = undefined;
  compare = true;
  step(
    mode === 'naive'
      ? 'Compare: the index has no c and an old b. Changes #4 and #5 fell into the gap between snapshot and log, and nothing will ever fix them.'
      : 'The index matches the database exactly. Tying the snapshot to a log position closes the gap: no change missed, none applied twice.',
    { tone: mode === 'naive' ? 'error' : 'ok' },
  );
  return frames;
}

// ── Lesson 4: the outbox pattern ─────────────────────────────────────

export type OutboxMode = 'raw' | 'outbox' | 'crash';

export function outboxFrames(mode: OutboxMode): BoardFrame[] {
  let column = 'cust_nm';
  const rows: { line: string; tone?: Tone }[] = [];
  const outbox: Chip[] = [];
  const stream: Chip[] = [];
  const shipping: string[] = [];
  let service = 'idle';
  let failed = false;
  const view = (): Board => ({
    columns: [
      [{ id: 'service', title: 'orders service', tone: service === 'crashed' ? 'bad' : undefined, lines: [service] }],
      [
        { id: 'orders', title: 'orders table (private)', lines: [`\`id · ${column} · total\``, ...rows.map((r) => r.line)], tone: rows.some((r) => r.tone === 'warn') ? 'warn' : undefined },
        ...(mode === 'raw' ? [] : [{ id: 'outbox', title: 'outbox table (public shape)', chips: outbox, empty: 'empty' }]),
      ],
      [{ id: 'stream', title: mode === 'raw' ? 'change stream (every orders row)' : 'change stream (outbox only)', chips: stream, empty: 'nothing published' }],
      [{ id: 'shipping', title: 'shipping service (another team)', tone: failed ? 'bad' : undefined, lines: shipping.length ? shipping : ['waiting'] }],
    ],
    links: [{ label: mode === 'raw' ? 'write' : 'one transaction' }, { label: 'CDC' }, { label: 'consume' }],
  });
  const { frames, step } = recorder(view);
  const settle = () => {
    for (const c of [...outbox, ...stream]) c.tone = undefined;
  };

  if (mode === 'raw') {
    step('The orders service owns an orders table. CDC publishes every change to it, and the shipping team’s service reads the customer name from those changes.');
    service = 'insert order 1';
    rows.push({ line: '1 · Ann · 20' });
    stream.push({ text: '{id:1, cust_nm:"Ann"}', tone: 'focus', from: 'orders' });
    step('Order 1 is inserted. CDC publishes the row exactly as stored: {id:1, cust_nm:"Ann"}.');
    settle();
    shipping.push('order 1 → label for Ann ✓');
    step('Shipping reads the field cust_nm and prints a label for Ann.');
    service = 'rename column';
    column = 'customer_name';
    step('The orders team renames cust_nm to customer_name. To them it’s a private tidy-up.');
    service = 'insert order 2';
    rows.push({ line: '2 · Bo · 35' });
    stream.push({ text: '{id:2, customer_name:"Bo"}', tone: 'focus', from: 'orders' });
    step('Order 2 is inserted. CDC faithfully publishes the new shape: {id:2, customer_name:"Bo"}.');
    settle();
    failed = true;
    shipping.push('order 2 → no cust_nm field ✗');
    step('Shipping still looks for cust_nm, finds nothing, and fails. A private rename broke another team’s service: CDC made the table’s **schema** public.', { tone: 'error' });
    return frames;
  }

  step('The orders service writes its own tables and, **in the same transaction**, adds an event to an **outbox** table. CDC publishes only the outbox.');
  if (mode === 'crash') {
    service = 'transaction: insert order 3…';
    rows.push({ line: '3 · Cy · 12 (not committed)', tone: 'warn' });
    step('Order 3: the transaction begins and the orders row is written…');
    service = 'crashed';
    step('…then the service crashes before the transaction commits.', { tone: 'warn' });
    rows.pop();
    service = 'restarted';
    step('The database rolls back the whole transaction: no orders row and no outbox event. Nothing is published, so nothing disagrees.');
    step(
      'With dual writes, the row could have been saved while the message was never sent. Here both writes go to one database in one transaction, so they succeed or fail together.',
      { tone: 'ok' },
    );
    return frames;
  }
  service = 'transaction: order 1';
  rows.push({ line: '1 · Ann · 20' });
  outbox.push({ text: 'OrderPlaced {customer:"Ann"}', tone: 'focus', from: 'service' });
  step('Order 1: one transaction writes the orders row and the outbox event OrderPlaced {customer:"Ann"}.');
  settle();
  stream.push({ text: 'OrderPlaced {customer:"Ann"}', tone: 'focus' });
  shipping.push('order 1 → label for Ann ✓');
  step('CDC publishes the outbox event, and shipping prints a label for Ann.');
  settle();
  service = 'rename column';
  column = 'customer_name';
  step('The orders team renames cust_nm to customer_name — and updates the one line of code that fills in the outbox event. The event’s shape stays the same.');
  service = 'transaction: order 2';
  rows.push({ line: '2 · Bo · 35' });
  outbox.push({ text: 'OrderPlaced {customer:"Bo"}', tone: 'focus', from: 'service' });
  step('Order 2: same transaction, same event shape.');
  settle();
  stream.push({ text: 'OrderPlaced {customer:"Bo"}', tone: 'focus' });
  shipping.push('order 2 → label for Bo ✓');
  step('Shipping prints a label for Bo. The private table changed freely; the published events didn’t.', { tone: 'ok' });
  return frames;
}

export const LESSON_1_4_SCENARIOS = {
  'batch-vs-stream': [
    { id: 'batch', label: 'nightly batch', frames: () => batchStreamFrames('batch') },
    { id: 'stream', label: 'stream', frames: () => batchStreamFrames('stream') },
  ],
  pubsub: [{ id: 'pubsub', label: 'publish/subscribe', frames: pubsubFrames }],
  polling: [
    { id: 'poll-3', label: 'poll every 3 s', frames: () => pollingFrames('poll-3') },
    { id: 'poll-1', label: 'poll every 1 s', frames: () => pollingFrames('poll-1') },
    { id: 'notify', label: 'get notified', frames: () => pollingFrames('notify') },
  ],
  overload: [
    { id: 'drop', label: 'drop', frames: () => overloadFrames('drop') },
    { id: 'buffer', label: 'buffer', frames: () => overloadFrames('buffer') },
    { id: 'backpressure', label: 'backpressure', frames: () => overloadFrames('backpressure') },
  ],
  'direct-vs-broker': [
    { id: 'direct', label: 'direct (webhook)', frames: () => directBrokerFrames('direct') },
    { id: 'broker', label: 'through a broker', frames: () => directBrokerFrames('broker') },
  ],
  'partition-order': [
    { id: 'keyed', label: 'key = order id', frames: () => partitionOrderFrames('keyed') },
    { id: 'round-robin', label: 'no key', frames: () => partitionOrderFrames('round-robin') },
  ],
  'hol-blocking': [
    { id: 'log', label: 'log partitions', frames: () => holFrames('log') },
    { id: 'queue', label: 'shared queue', frames: () => holFrames('queue') },
  ],
  retention: [{ id: 'retention', label: 'retention', frames: retentionFrames }],
  'cdc-snapshot': [
    { id: 'naive', label: 'start from “now”', frames: () => snapshotFrames('naive') },
    { id: 'tied', label: 'snapshot tied to a log position', frames: () => snapshotFrames('tied') },
  ],
  outbox: [
    { id: 'raw', label: 'CDC on the table', frames: () => outboxFrames('raw') },
    { id: 'outbox', label: 'outbox', frames: () => outboxFrames('outbox') },
    { id: 'crash', label: 'outbox + crash', frames: () => outboxFrames('crash') },
  ],
} satisfies Record<string, Scenario[]>;
