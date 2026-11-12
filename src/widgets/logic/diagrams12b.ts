import type { StepFrame } from '../../lib/steps.ts';
import { recorder, type Board, type BoardFrame, type Chip, type Scenario, type Tone } from './board.ts';

const money = (n: number) => `£${Number.isInteger(n) ? n : n.toFixed(2)}`;

// ── Lesson 5: overwrite in place vs an append-only ledger ────────────

export type LedgerMode = 'overwrite' | 'ledger';

export function ledgerFrames(mode: LedgerMode): BoardFrame[] {
  const world: Chip[] = [];
  let balance = 100;
  const entries: { amount: number; label: string; tone?: Tone }[] = [{ amount: 100, label: 'opening' }];
  let support: string[] = [];
  const sum = () => entries.reduce((total, e) => total + e.amount, 0);
  const view = (): Board => ({
    columns: [
      [{ id: 'world', title: 'what actually happened', chips: world, empty: 'account opened with £100' }],
      [
        mode === 'overwrite'
          ? { id: 'store', title: 'accounts table (overwritten)', lines: [`balance = **${money(balance)}**`, 'no history kept'] }
          : {
              id: 'store',
              title: 'ledger (append-only)',
              chips: entries.map((e, i) => ({ text: `${e.amount < 0 ? '−' : '+'}${money(Math.abs(e.amount))} ${e.label}`, tag: `#${i + 1}`, tone: e.tone })),
            },
      ],
      [
        {
          id: 'balance',
          title: 'balance and what support can see',
          lines: [mode === 'overwrite' ? `balance: **${money(balance)}**` : `sum of entries: **${money(sum())}**`, ...support],
        },
      ],
    ],
    links: [{ label: mode === 'overwrite' ? 'overwrite' : 'append' }, { label: mode === 'overwrite' ? 'read' : 'add up' }],
  });
  const { frames, step } = recorder(view);
  const settle = () => {
    for (const c of [...world, ...entries]) if (c.tone === 'focus') c.tone = undefined;
  };
  const append = (amount: number, label: string, tone: Tone = 'focus') => entries.push({ amount, label, tone });

  step(
    mode === 'overwrite'
      ? 'An account starts with £100. Every change **overwrites** the balance in place.'
      : 'An account starts with £100. This time every change is **appended** to a ledger, and the balance is simply the sum of the entries.',
  );
  world.push({ text: 'deposit £50', tone: 'focus' });
  if (mode === 'overwrite') {
    balance = 150;
    step('A £50 deposit arrives. The balance is overwritten with £150; the old value is gone.');
  } else {
    append(50, 'deposit');
    step('A £50 deposit arrives: append +£50. Sum = £150.');
  }
  settle();
  world.push({ text: 'coffee £5', tone: 'focus' });
  if (mode === 'overwrite') {
    balance = 100;
    step('The customer buys a £5 coffee, but a buggy release charges £50. The balance is overwritten with £100.', { tone: 'warn' });
  } else {
    append(-50, 'coffee', 'bad');
    step('The customer buys a £5 coffee, but a buggy release records −£50. Sum = £100.', { tone: 'warn' });
  }
  settle();
  if (mode === 'overwrite') {
    support = ['when did it change? **unknown**', 'by how much, and why? **unknown**'];
    step('The customer complains. Support looks: the table says £100. When did it change, by how much, and why? There’s no trace.', { tone: 'warn' });
    balance = 145;
    support = ['set to £145 by hand — right? **no way to check**'];
    step('Someone fixes it by hand, setting £145. Is that right? Nobody can check — and the record of the mistake has vanished too.', { tone: 'error' });
    return frames;
  }
  support = ['entry #3: −£50 for a coffee — clearly wrong'];
  step('The customer complains. Support can see entry #3: −£50 for a coffee, and exactly when it was written.');
  append(45, 'correction for #3');
  support = ['entry #3 is still on record for audit', 'entry #4 explains the fix'];
  step('Fix: append a **compensating** entry of +£45, “correction for #3”. The mistake stays visible for audit. Sum = £145.');
  settle();
  support = ['lost the balance? add the entries up again'];
  step('The balance is just one view of the ledger: add up the entries any time and you get £145 again.', { tone: 'ok' });
  return frames;
}

// ── Lesson 5: deleting from immutable data ───────────────────────────

export type ShredMode = 'delete' | 'shred';
const USER_EVENTS = [
  { user: 'u7', text: 'address: 12 Elm St' },
  { user: 'u9', text: 'address: 4 Oak Rd' },
  { user: 'u7', text: 'phone: 0700 111' },
];
const COPIES = [
  { id: 'live', title: 'event log' },
  { id: 'replica', title: 'replica' },
  { id: 'backup', title: 'nightly backup (unchangeable)' },
];

export function shredFrames(mode: ShredMode): BoardFrame[] {
  const removed = new Set<string>();
  let keyGone = false;
  let focusCopy: string | undefined;
  const view = (): Board => ({
    columns: [
      ...(mode === 'shred'
        ? [
            [
              {
                id: 'keys',
                title: 'key store',
                chips: [{ text: 'k7 (user 7)', tone: keyGone ? ('bad' as const) : undefined, tag: keyGone ? 'deleted' : undefined }, { text: 'k9 (user 9)' }],
              },
            ],
          ]
        : []),
      COPIES.map((copy) => ({
        id: copy.id,
        title: copy.title,
        tone: focusCopy === copy.id ? ('focus' as const) : undefined,
        chips: USER_EVENTS.filter((e) => !(removed.has(copy.id) && e.user === 'u7')).map((e) => ({
          text: mode === 'shred' && keyGone && e.user === 'u7' ? `${e.user}: unreadable` : `${e.user}: ${e.text}`,
          tone: e.user !== 'u7' ? undefined : mode === 'shred' ? (keyGone ? ('muted' as const) : undefined) : ('warn' as const),
        })),
      })),
    ],
    links: mode === 'shred' ? [{ label: 'decrypt with' }] : [],
  });
  const { frames, step } = recorder(view);

  if (mode === 'delete') {
    step('User 7’s personal data sits in the event log — and, as always, in a replica and a nightly backup. User 7 asks for it to be deleted.');
    removed.add('live');
    focusCopy = 'live';
    step('The log is immutable, so “deleting” means rewriting it without user 7’s events. Slow and fiddly, but possible for the live log.');
    removed.add('replica');
    focusCopy = 'replica';
    step('The replica has to be rewritten the same way.');
    focusCopy = 'backup';
    step('The backup is unchangeable on purpose — that’s what makes it a backup. User 7’s address and phone number are still in it.', { tone: 'error' });
    return frames;
  }
  step('This time each user’s events are **encrypted** with that user’s own key, kept in a separate key store. Every copy holds only scrambled data, readable with the right key.');
  keyGone = true;
  step('User 7 asks for their data to be deleted. Delete just one thing: key k7.');
  step(
    'Every copy of user 7’s events — log, replica, even the backup — is now unreadable noise, and user 9 is untouched. This is **crypto-shredding**. The catch: you choose up front which data shares a key, because a key’s data can only be shredded all at once.',
    { tone: 'ok' },
  );
  return frames;
}

// ── Lesson 5: asynchronous views and single-event actions ────────────

export type AsyncViewMode = 'stale' | 'atomic';

export function asyncViewFrames(mode: AsyncViewMode): BoardFrame[] {
  const log: Chip[] = [];
  let userLines: string[] = [];
  let viewName = 'Ann';
  const balances = { Ann: 50, Bo: 20 };
  let boDown = false;
  let lastView: 'Ann' | 'Bo' | undefined;
  const view = (): Board =>
    mode === 'stale'
      ? {
          columns: [
            [{ id: 'user', title: 'Ann’s browser', lines: userLines.length ? userLines : ['idle'] }],
            [{ id: 'log', title: 'event log', chips: log, empty: 'empty' }],
            [{ id: 'view', title: 'profile view (updated asynchronously)', lines: [`display name: **${viewName}**`] }],
          ],
          links: [{ label: 'append' }, { label: 'a moment later' }],
        }
      : {
          columns: [
            [{ id: 'user', title: 'user action', lines: userLines.length ? userLines : ['idle'] }],
            [{ id: 'log', title: 'event log', chips: log, empty: 'empty' }],
            (['Ann', 'Bo'] as const).map((who) => ({
              id: who.toLowerCase(),
              title: `view: ${who}’s balance`,
              tone: who === 'Bo' && boDown ? ('bad' as const) : lastView === who ? ('focus' as const) : undefined,
              lines: [`£${balances[who]}`, ...(who === 'Bo' && boDown ? ['updater crashed'] : [])],
            })),
          ],
          links: [{ label: 'one append' }, { label: 'derive' }],
        };
  const { frames, step } = recorder(view);

  if (mode === 'stale') {
    step('Ann’s profile page is a view derived from the event log. The view is updated **asynchronously**: a moment after each event is written, not at the same time.');
    log.push({ text: 'NameChanged(Annie)', tone: 'focus' });
    userLines = ['changed name → “saved!”'];
    step('Ann changes her display name to “Annie”. The event is appended to the log, and she sees “saved!” straight away.');
    userLines = ['changed name → “saved!”', 'reloads profile: sees **Ann** ✗'];
    step('She reloads her profile at once. The view hasn’t processed the event yet, so it still says “Ann”. To her, the change looks lost.', { tone: 'warn' });
    log[0].tone = 'ok';
    viewName = 'Annie';
    userLines = ['changed name → “saved!”', 'reloads again: sees **Annie** ✓'];
    step('A moment later the view catches up, and a second reload shows “Annie”.');
    step(
      'Reading your own writes needs extra care here: for example, show Ann her own profile from the log’s latest state, or wait until the view has caught up with her event.',
      { tone: 'ok' },
    );
    return frames;
  }
  step('Ann sends Bo £10. With ordinary tables that means changing two rows — Ann’s and Bo’s — and a transaction to make sure both change or neither does.');
  log.push({ text: 'Transfer(Ann → Bo, £10)', tone: 'focus' });
  userLines = ['Ann sends Bo £10'];
  step('Instead, record the whole action as **one** event. Writing it is a single append: it either happens or it doesn’t.');
  balances.Ann -= 10;
  lastView = 'Ann';
  step('The views are derived from that event. Ann’s balance view applies it: £50 → £40.');
  boDown = true;
  lastView = undefined;
  step('The process that updates Bo’s view crashes before applying it.', { tone: 'warn' });
  boDown = false;
  balances.Bo += 10;
  lastView = 'Bo';
  log[0].tone = 'ok';
  step('It restarts and carries on from its saved position in the log: Bo’s balance £20 → £30. Nothing was ever half-done — the event was safely recorded all along.', { tone: 'ok' });
  return frames;
}

// ── Lesson 6: complex event processing ───────────────────────────────

const PAYMENTS = [
  { t: 0, card: 'card 1', country: 'UK' },
  { t: 3, card: 'card 2', country: 'FR' },
  { t: 6, card: 'card 1', country: 'UK' },
  { t: 8, card: 'card 1', country: 'US' },
  { t: 30, card: 'card 2', country: 'DE' },
];
const WITHIN = 10;
const at = (minutes: number) => `10:${String(minutes).padStart(2, '0')}`;

export function cepFrames(): BoardFrame[] {
  let seen = 0;
  const memory = new Map<string, { country: string; t: number }>();
  const alerts: Chip[] = [];
  const view = (): Board => ({
    columns: [
      [
        {
          id: 'stream',
          title: 'card payments flowing past',
          chips: PAYMENTS.slice(0, seen).map((p, i) => ({ text: `${p.card} · ${p.country}`, tag: at(p.t), tone: i === seen - 1 ? 'focus' : 'muted' })),
          empty: 'none yet',
        },
      ],
      [
        {
          id: 'engine',
          title: 'CEP engine',
          lines: [`stored query: **same card, two countries, within ${WITHIN} min**`, ...[...memory].map(([card, m]) => `remembers ${card}: ${m.country} at ${at(m.t)}`)],
        },
      ],
      [{ id: 'alerts', title: 'alerts (complex events)', chips: alerts, empty: 'none' }],
    ],
  });
  const { frames, step } = recorder(view);

  step(`The engine stores one standing query: “the same card used in two different countries within ${WITHIN} minutes”. Payments flow past it.`);
  for (const p of PAYMENTS) {
    seen++;
    const before = memory.get(p.card);
    memory.set(p.card, { country: p.country, t: p.t });
    if (!before) {
      step(`${at(p.t)}: ${p.card} used in ${p.country}. Nothing to compare with yet; the engine remembers it.`);
    } else if (before.country === p.country) {
      step(`${at(p.t)}: ${p.card} in ${p.country} again. Same country — no match. The memory is updated.`, { quick: true });
    } else if (p.t - before.t <= WITHIN) {
      alerts.push({ text: `${p.card}: ${before.country} → ${p.country} in ${p.t - before.t} min`, tone: 'bad' });
      step(`${at(p.t)}: ${p.card} in ${p.country}, but it was in ${before.country} ${p.t - before.t} minutes ago. The pattern matches — the engine emits an alert.`, { tone: 'warn' });
    } else {
      step(`${at(p.t)}: ${p.card} in ${p.country}. It was last in ${before.country}, but ${p.t - before.t} minutes ago — outside the window, so no match.`);
    }
  }
  step('The query was written once and never re-run; each payment was checked against it as it went by. A database does the opposite: it keeps the data and runs each query once.', {
    tone: 'ok',
  });
  return frames;
}

// ── Lesson 6: search on streams ──────────────────────────────────────

const SAVED = [
  { who: 'Ann', kind: 'flat', city: 'Leeds', max: 900 },
  { who: 'Bo', kind: 'house', city: 'York', max: 1500 },
];
const LISTINGS = [
  { kind: 'house', city: 'York', price: 1200 },
  { kind: 'flat', city: 'Leeds', price: 850 },
  { kind: 'flat', city: 'Leeds', price: 1100 },
  { kind: 'studio', city: 'York', price: 600 },
];

export function streamSearchFrames(): BoardFrame[] {
  let seen = 0;
  const sent: Chip[] = [];
  const view = (): Board => ({
    columns: [
      [
        {
          id: 'listings',
          title: 'new listings',
          chips: LISTINGS.slice(0, seen).map((l, i) => ({ text: `${l.kind}, ${l.city}, £${l.price}`, tone: i === seen - 1 ? 'focus' : 'muted' })),
          empty: 'none yet',
        },
      ],
      [{ id: 'searches', title: 'saved searches (stored)', lines: SAVED.map((s) => `${s.who}: ${s.kind} in ${s.city} under £${s.max}`) }],
      [{ id: 'notify', title: 'notifications', chips: sent, empty: 'none' }],
    ],
  });
  const { frames, step } = recorder(view);

  step('Two people have saved searches. The searches are stored, and every new listing is checked against all of them the moment it appears.');
  for (const l of LISTINGS) {
    seen++;
    const hits = SAVED.filter((s) => s.kind === l.kind && s.city === l.city && l.price <= s.max);
    for (const h of hits) sent.push({ text: `${h.who}: ${l.kind} in ${l.city}`, tone: 'ok' });
    step(
      hits.length
        ? `New listing: ${l.kind}, ${l.city}, £${l.price}. It matches ${hits.map((h) => `${h.who}’s`).join(' and ')} search → send a notification.`
        : `New listing: ${l.kind}, ${l.city}, £${l.price}. No saved search matches.`,
      { quick: !hits.length },
    );
  }
  step('Each listing was checked once, against every stored search. With millions of saved searches, the searches themselves get indexed (say, by city) so only a few need checking.', {
    tone: 'ok',
  });
  return frames;
}

// ── Lesson 6: stream analytics with a per-minute summary ─────────────

const REQUESTS = [
  { s: 5, ms: 120 },
  { s: 20, ms: 80 },
  { s: 41, ms: 900 },
  { s: 55, ms: 100 },
  { s: 70, ms: 90 },
  { s: 90, ms: 110 },
  { s: 110, ms: 95 },
];
const stamp = (s: number) => `10:0${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export function analyticsFrames(): BoardFrame[] {
  let seen = 0;
  let minute = 0;
  let count = 0;
  let total = 0;
  let slowest = 0;
  const published: string[] = [];
  const view = (): Board => ({
    columns: [
      [
        {
          id: 'requests',
          title: 'requests (response times)',
          chips: REQUESTS.slice(0, seen).map((r, i) => ({ text: `${r.ms} ms`, tag: stamp(r.s), tone: i === seen - 1 ? 'focus' : 'muted' })),
          empty: 'none yet',
        },
      ],
      [{ id: 'window', title: `window 10:0${minute} (all it remembers)`, lines: [`count = ${count}`, `total = ${total} ms`, `slowest = ${slowest} ms`] }],
      [{ id: 'published', title: 'published per minute', lines: published, empty: 'nothing yet' }],
    ],
  });
  const { frames, step } = recorder(view);
  const publish = () => {
    published.push(`10:0${minute} → ${count} requests, average **${Math.round(total / count)} ms**, slowest ${slowest} ms`);
  };

  step('Requests flow past with their response times. For each minute the processor reports how many there were, the average, and the slowest.');
  for (const r of REQUESTS) {
    const m = Math.floor(r.s / 60);
    if (m !== minute) {
      publish();
      step(`A request from 10:0${m} arrives, so the 10:0${minute} window is over: publish its summary, then forget it.`);
      minute = m;
      count = 0;
      total = 0;
      slowest = 0;
    }
    seen++;
    count++;
    total += r.ms;
    slowest = Math.max(slowest, r.ms);
    step(`${stamp(r.s)}: ${r.ms} ms. Update three numbers: count ${count}, total ${total} ms, slowest ${slowest} ms. The request itself isn’t kept.`, { quick: seen > 2 });
  }
  publish();
  step(
    'Each window needed only three numbers in memory, however many requests it saw. Real dashboards often show the 99th percentile instead of the slowest, so one freak request doesn’t dominate — that needs a bit more memory, usually a compact approximate summary.',
    { tone: 'ok' },
  );
  return frames;
}

// ── Lesson 6: full recompute vs incremental view maintenance ─────────

export type IvmMode = 'recompute' | 'incremental';
interface OrderRow {
  id: number;
  region: string;
  amount: number;
}
const START_ROWS: OrderRow[] = [
  { id: 1, region: 'North', amount: 20 },
  { id: 2, region: 'South', amount: 10 },
  { id: 3, region: 'North', amount: 15 },
  { id: 4, region: 'East', amount: 40 },
  { id: 5, region: 'South', amount: 25 },
  { id: 6, region: 'East', amount: 5 },
];
type RowChange = { kind: 'insert'; row: OrderRow } | { kind: 'update'; id: number; amount: number } | { kind: 'delete'; id: number };
const ROW_CHANGES: RowChange[] = [
  { kind: 'insert', row: { id: 7, region: 'North', amount: 30 } },
  { kind: 'update', id: 2, amount: 25 },
  { kind: 'delete', id: 4 },
];

const totals = (rows: readonly OrderRow[]) => {
  const out: Record<string, number> = { North: 0, South: 0, East: 0 };
  for (const r of rows) out[r.region] += r.amount;
  return out;
};

export function ivmFrames(mode: IvmMode): BoardFrame[] {
  let rows = [...START_ROWS];
  const view_ = totals(rows);
  let work = 0;
  let change: string | undefined;
  let touched: string | undefined;
  const view = (): Board => ({
    columns: [
      [{ id: 'orders', title: `orders table (${rows.length} rows)`, lines: rows.map((r) => `#${r.id} ${r.region} £${r.amount}`) }],
      [{ id: 'change', title: 'change', chips: change ? [{ text: change, tone: 'focus' }] : [], empty: 'none yet' }],
      [
        {
          id: 'view',
          title: 'view: revenue per region',
          lines: [...Object.entries(view_).map(([k, v]) => (k === touched ? `**${k}: £${v}**` : `${k}: £${v}`)), `work so far: **${work}** ${mode === 'recompute' ? 'rows read' : 'view rows updated'}`],
        },
      ],
    ],
  });
  const { frames, step } = recorder(view);

  step('A materialized view keeps revenue per region, computed from the orders table. Three changes are coming. How much work does each one cost?');
  for (const c of ROW_CHANGES) {
    let delta: [string, number];
    if (c.kind === 'insert') {
      rows.push(c.row);
      change = `insert #${c.row.id} ${c.row.region} £${c.row.amount}`;
      delta = [c.row.region, c.row.amount];
    } else if (c.kind === 'update') {
      const old = rows.find((r) => r.id === c.id)!;
      rows = rows.map((r) => (r.id === c.id ? { ...r, amount: c.amount } : r));
      change = `update #${c.id}: £${old.amount} → £${c.amount}`;
      delta = [old.region, c.amount - old.amount];
    } else {
      const old = rows.find((r) => r.id === c.id)!;
      rows = rows.filter((r) => r.id !== c.id);
      change = `delete #${c.id} (${old.region} £${old.amount})`;
      delta = [old.region, -old.amount];
    }
    touched = delta[0];
    if (mode === 'recompute') {
      Object.assign(view_, totals(rows));
      work += rows.length;
      step(`${change}. Re-run the whole query: read all ${rows.length} rows and add everything up again. ${touched} is now £${view_[touched]}.`);
    } else {
      view_[touched] += delta[1];
      work += 1;
      step(`${change}. This change only affects ${touched}: ${delta[1] >= 0 ? 'add' : 'subtract'} £${Math.abs(delta[1])}. One view row updated.`);
    }
  }
  change = undefined;
  touched = undefined;
  step(
    mode === 'recompute'
      ? `Work: ${work} rows read for ${ROW_CHANGES.length} changes. With a million orders it would be a million rows per change — so in practice it runs on a schedule and the view is stale in between.`
      : `Work: ${work} small updates for ${ROW_CHANGES.length} changes, whatever the table size, and the view is always current. This is **incremental view maintenance**.`,
    { tone: mode === 'recompute' ? 'warn' : 'ok' },
  );
  return frames;
}

// ── Lesson 7: event time vs processing time (two timelines) ──────────

export interface ClockEvent {
  id: string;
  /** Seconds after 10:00:00 when it happened. */
  happened: number;
  /** Seconds after 10:00:00 when the processor handled it. */
  processed: number;
}
export const CLOCK_EVENTS: ClockEvent[] = [
  { id: 'e1', happened: 5, processed: 8 },
  { id: 'e2', happened: 12, processed: 16 },
  { id: 'e3', happened: 20, processed: 45 },
  { id: 'e4', happened: 31, processed: 33 },
  { id: 'e5', happened: 40, processed: 43 },
];
export interface ClockFrame extends StepFrame {
  now: number;
  happened: string[];
  processed: string[];
  current?: string;
  tone?: 'ok' | 'warn' | 'error';
}
export const clockAt = (s: number) => `10:00:${String(s).padStart(2, '0')}`;

export function twoClocksFrames(): ClockFrame[] {
  const happened: string[] = [];
  const processed: string[] = [];
  const frames: ClockFrame[] = [];
  const push = (now: number, caption: string, current?: string, extra: Partial<ClockFrame> = {}) =>
    frames.push({ now, happened: [...happened], processed: [...processed], current, caption, ...extra });
  const moments = CLOCK_EVENTS.flatMap((e) => [
    { t: e.happened, e, kind: 'happened' as const },
    { t: e.processed, e, kind: 'processed' as const },
  ]).sort((a, b) => a.t - b.t);

  push(0, 'Two clocks for the same events. The top line is **event time**: when each event happened, stamped inside the event. The bottom line is **processing time**: when the stream processor got to it.');
  for (const m of moments) {
    const { e } = m;
    if (m.kind === 'happened') {
      happened.push(e.id);
      const stuck = e.processed - e.happened > 10;
      push(
        m.t,
        e.id === 'e1'
          ? `${clockAt(m.t)}: e1 happens. Its timestamp, ${clockAt(m.t)}, is written into the event and never changes.`
          : stuck
            ? `${clockAt(m.t)}: ${e.id} happens — but its server’s network hiccups, and the event gets stuck on the way.`
            : `${clockAt(m.t)}: ${e.id} happens.`,
        e.id,
        { quick: !stuck && e.id !== 'e1', tone: stuck ? 'warn' : undefined },
      );
    } else {
      processed.push(e.id);
      const lag = e.processed - e.happened;
      const overtook = CLOCK_EVENTS.filter((o) => o.happened < e.happened && !processed.includes(o.id));
      const late = CLOCK_EVENTS.filter((o) => o.happened > e.happened && processed.includes(o.id) && o.id !== e.id);
      push(
        m.t,
        overtook.length
          ? `${clockAt(m.t)}: ${e.id} is processed (${lag} s of lag). The processor has now seen ${e.id} but not ${overtook.map((o) => o.id).join(', ')}, which happened earlier.`
          : late.length
            ? `${clockAt(m.t)}: ${e.id} finally arrives — ${lag} s of lag. In processing order it comes **after** ${late.map((o) => o.id).join(' and ')}, yet it happened before them.`
            : e.id === 'e1'
              ? `${clockAt(m.t)}: the processor handles e1. Its processing time is ${clockAt(m.t)}: ${lag} s of lag from the network, the broker’s queue and a busy processor.`
              : `${clockAt(m.t)}: ${e.id} is processed, ${lag} s after it happened.`,
        e.id,
        { tone: overtook.length || late.length ? 'warn' : undefined },
      );
    }
  }
  push(
    50,
    `The event times never changed — replay these events tomorrow and they’d be identical. Processing times depend on queues, networks and restarts. Processing order: ${[...processed].join(', ')}.`,
    undefined,
    { tone: 'ok' },
  );
  return frames;
}

// ── Lesson 7: stragglers ─────────────────────────────────────────────

export type StragglerMode = 'drop' | 'correct' | 'watermark';
interface Straggler {
  id: string;
  src: 'A' | 'B';
  /** Event time, seconds after 10:57:00. */
  t: number;
}
const S_EVENTS: Straggler[] = [
  { id: 'a1', src: 'A', t: 10 },
  { id: 'b1', src: 'B', t: 20 },
  { id: 'a2', src: 'A', t: 40 },
  { id: 'b2', src: 'B', t: 50 },
  { id: 'a3', src: 'A', t: 90 },
  { id: 'a4', src: 'A', t: 130 },
  { id: 'b3', src: 'B', t: 140 },
];
const t57 = (s: number) => `10:${57 + Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const minuteOf = (s: number) => `10:${57 + Math.floor(s / 60)}`;

export function stragglerFrames(mode: StragglerMode): BoardFrame[] {
  const sent = { A: [] as string[], B: [] as string[] };
  let stuck: string[] = [];
  let bDown = false;
  let received: string[] = [];
  let receivedMinute = '10:57';
  const late = new Set<string>();
  const results: string[] = [];
  let dropped = 0;
  const watermarks: Record<'A' | 'B', number | undefined> = { A: undefined, B: -10 };
  const ev = (id: string) => S_EVENTS.find((e) => e.id === id)!;
  const source = (src: 'A' | 'B') => ({
    id: src,
    title: `server ${src}`,
    tone: src === 'B' && bDown ? ('bad' as const) : undefined,
    chips: sent[src].map((id) => ({ text: id, tag: t57(ev(id).t), tone: stuck.includes(id) ? ('warn' as const) : ('muted' as const) })),
    empty: 'nothing sent yet',
    lines: [
      ...(src === 'B' && bDown ? ['network trouble: events stuck'] : []),
      ...(mode === 'watermark' && watermarks[src] !== undefined ? [`watermark: ${t57(watermarks[src]!)}`] : []),
    ],
  });
  const view = (): Board => ({
    columns: [
      [source('A'), source('B')],
      [
        {
          id: 'processor',
          title: `processor — arrived during ${receivedMinute}`,
          chips: received.map((id) => ({ text: id, tag: minuteOf(ev(id).t), tone: late.has(id) ? 'bad' : undefined })),
          empty: 'nothing yet',
          lines: [
            ...(mode === 'drop' ? [`stragglers dropped: **${dropped}**`] : []),
            ...(mode === 'watermark'
              ? [`safe up to: min(A, B) = **${watermarks.A === undefined || watermarks.B === undefined ? '—' : t57(Math.min(watermarks.A, watermarks.B!))}**`]
              : []),
          ],
        },
      ],
      [{ id: 'results', title: 'published counts', lines: results, empty: 'nothing yet' }],
    ],
  });
  const { frames, step } = recorder(view);
  const send = (id: string) => sent[ev(id).src].push(id);
  const count = (minute: string) => S_EVENTS.filter((e) => minuteOf(e.t) === minute);

  step(
    `Counting events per minute by **event time**. Servers A and B both send events. Just before 10:57, B’s network starts having trouble.${mode === 'watermark' ? ' Each server also sends **watermarks**: “nothing older than this will come from me”. B’s last one said 10:56:50.' : ''}`,
  );
  bDown = true;
  for (const id of ['a1', 'b1', 'a2', 'b2']) send(id);
  stuck = ['b1', 'b2'];
  received = ['a1', 'a2'];
  watermarks.A = 40;
  step('During 10:57: a1 and a2, stamped 10:57, arrive from A. B’s 10:57 events, b1 and b2, are stuck behind the network problem.', { tone: 'warn' });

  const onTime = received.length;
  send('a3');
  received = ['a3'];
  receivedMinute = '10:58';
  watermarks.A = 90;
  if (mode === 'watermark') {
    step('10:58:31: a3 arrives, and A’s watermark moves to 10:58:30. But B is still saying 10:56:50, so the processor can’t be sure 10:57 is complete. It waits.');
  } else {
    results.push(`10:57 → **${onTime}** (published 10:58:30)`);
    step('10:58:30: the 10:57 window ended 30 s ago — the **grace period**. Nothing more is expected, so publish 10:57 → 2. (a3, stamped 10:58, also arrives.)');
  }

  bDown = false;
  stuck = [];
  receivedMinute = '10:59';
  received = ['b1', 'b2'];
  late.add('b1').add('b2');
  if (mode === 'watermark') {
    watermarks.B = 120;
    late.clear();
    results.push(`10:57 → **${count('10:57').length}** (published 10:59:05)`);
    step(
      '10:59:05: B recovers. b1 and b2 (stamped 10:57) arrive, with a watermark: “nothing older than 10:59:00 from me”. Both servers are now past 10:58, so 10:57 is complete: publish 10:57 → **4**.',
    );
  } else {
    send('a4');
    send('b3');
    received.push('a4', 'b3');
    step(
      'During 10:59: B recovers. b1 and b2 finally arrive — stamped 10:57, but mixed in with a4 and b3, which are stamped 10:59. b1 and b2 are **stragglers**.',
      { tone: 'warn' },
    );
  }
  if (mode === 'watermark') {
    send('a4');
    send('b3');
    received.push('a4', 'b3');
    watermarks.A = 130;
    watermarks.B = 140;
    results.push(`10:58 → **${count('10:58').length}** (published 10:59:11)`);
    step('10:59:11–21: a4 and b3 (stamped 10:59) arrive. Both watermarks have passed 10:59:00, so 10:58 → 1 is published too.');
    step(
      'Every count was right the first time, with no corrections. The price: 10:57’s result waited two minutes for one slow server. With many producers, the processor tracks each one’s watermark, and the slowest sets the pace.',
      { tone: 'ok' },
    );
    return frames;
  }
  if (mode === 'drop') {
    dropped = 2;
    step('10:57 has already been published, so b1 and b2 are ignored and counted as dropped. Alert if that counter jumps.', { tone: 'warn' });
  } else {
    results[0] = `10:57 → **${count('10:57').length}** (corrected 10:59:21, replacing ${onTime})`;
    step('For the stragglers, publish a **correction**: 10:57 → 4, replacing the earlier 2.');
  }
  results.push(`10:58 → **${count('10:58').length}** (published 10:59:30)`);
  step(
    mode === 'drop'
      ? '10:59:30: 10:58 → 1 is published. The 10:57 count stays wrong (2 instead of 4), but the dropped counter tells you how often that happens.'
      : '10:59:30: 10:58 → 1 is published. Every count is now right, but anyone using them must cope with numbers that change after the fact.',
    { tone: mode === 'drop' ? 'warn' : 'ok' },
  );
  return frames;
}

// ── Lesson 7: whose clock? ───────────────────────────────────────────

export type ClockTrust = 'device' | 'server' | 'three';

export function clockSkewFrames(mode: ClockTrust): BoardFrame[] {
  const phone: string[] = ['clock is 5 min fast (nobody knows)'];
  const server: string[] = [];
  const estimate: string[] = [];
  let phoneTone: Tone | undefined;
  const view = (): Board => ({
    columns: [
      [{ id: 'phone', title: 'phone', tone: phoneTone, lines: phone }],
      [{ id: 'server', title: 'server (trusted clock)', lines: server, empty: 'nothing received' }],
      [{ id: 'estimate', title: 'estimated event time', lines: estimate, empty: 'not worked out yet' }],
    ],
    links: [{ label: 'upload' }, { label: 'work out' }],
  });
  const { frames, step } = recorder(view);

  step('A user taps “like” on a phone during a flight. When did that really happen? We know the true answer — 10:00:00 — so we can check each method.');
  phone.push('happened: **10:05:00** (phone clock)');
  step('The phone stamps the event with its own clock: 10:05:00. Its clock happens to be 5 minutes fast.');
  phoneTone = 'muted';
  step('No signal, so the event waits on the phone.', { quick: true });
  phoneTone = undefined;
  phone.push('sent: **10:20:00** (phone clock)');
  step('Back online at what is really 10:15:00, the phone sends it and stamps the send time by its clock: 10:20:00.');
  server.push('received: **10:15:02** (server clock)');
  step('The server receives it 2 s later and stamps the time by its own trusted clock: 10:15:02.');
  if (mode === 'device') {
    estimate.push('= 10:05:00 (the phone’s stamp)', 'error: **5 min** ✗');
    step('Trust the phone: event time = 10:05:00. Wrong by 5 minutes, because the phone’s clock is off — and users can set it to anything.', { tone: 'error' });
  } else if (mode === 'server') {
    estimate.push('= 10:15:02 (when it arrived)', 'error: **15 min** ✗');
    step('Trust the server: event time = 10:15:02. That’s when the data arrived, not when the user acted — wrong by 15 minutes.', { tone: 'error' });
  } else {
    estimate.push('phone clock error ≈ received − sent', '= 10:15:02 − 10:20:00 = **−4 min 58 s**');
    step('Estimate the phone’s clock error: server received − phone sent = 10:15:02 − 10:20:00 = −4 min 58 s. (This assumes the upload itself was quick.)');
    estimate.push('event ≈ 10:05:00 − 4:58 = **10:00:02**', 'error: **2 s** ✓');
    step('Apply that to the phone’s event stamp: 10:05:00 − 4 min 58 s = 10:00:02. Only 2 s off — the time the upload took.', { tone: 'ok' });
  }
  return frames;
}

// ── Lesson 8: joining with a value that changes over time ────────────

export type VersionMode = 'current' | 'versioned';
const SALES = [
  { id: 's1', day: 1, amount: 100 },
  { id: 's2', day: 2, amount: 50 },
  { id: 's3', day: 3, amount: 100 },
];
const RATES = [
  { v: 'v1', rate: 20, from: 1 },
  { v: 'v2', rate: 25, from: 3 },
];

export function versionedJoinFrames(mode: VersionMode): BoardFrame[] {
  const salesSeen: Chip[] = [];
  let rates = [RATES[0]];
  const live: string[] = [];
  const rerun: string[] = [];
  let liveTotal = 0;
  let rerunTotal: number | undefined;
  const view = (): Board => ({
    columns: [
      [{ id: 'sales', title: 'sales stream', chips: salesSeen, empty: 'none yet' }],
      [
        {
          id: 'rates',
          title: mode === 'current' ? 'tax rate (latest only)' : 'tax rates (every version kept)',
          lines: mode === 'current' ? [`rate = **${rates.at(-1)!.rate}%**`] : rates.map((r) => `${r.v}: ${r.rate}% from day ${r.from}`),
        },
      ],
      [
        {
          id: 'report',
          title: 'tax report',
          lines: [
            ...live,
            ...(live.length ? [`live total: **${money(liveTotal)}**`] : []),
            ...rerun,
            ...(rerunTotal !== undefined ? [`rerun total: **${money(rerunTotal)}** ${rerunTotal === liveTotal ? '✓' : '✗'}`] : []),
          ],
          empty: 'nothing yet',
        },
      ],
    ],
    links: [{ label: 'join' }, { label: 'emit' }],
  });
  const { frames, step } = recorder(view);
  const rateFor = (day: number) => [...RATES].reverse().find((r) => r.from <= day)!;

  step('A stream of sales is joined with a tax-rate table to work out the tax on each sale. The rate goes up on day 3.');
  for (const s of SALES) {
    if (s.day === RATES[1].from) {
      rates = mode === 'current' ? [RATES[1]] : [...RATES];
      step(
        mode === 'current'
          ? 'Day 3: the rate changes to 25%. The table keeps only the latest value, so 20% is gone.'
          : 'Day 3: the rate changes to 25%. The new value is stored as version v2; v1 is kept.',
      );
    }
    const r = rateFor(s.day);
    const tax = (s.amount * r.rate) / 100;
    salesSeen.push({ text: `${s.id} £${s.amount}${mode === 'versioned' ? ` → ${r.v}` : ''}`, tag: `day ${s.day}`, tone: 'focus' });
    liveTotal += tax;
    live.push(`${s.id}: ${r.rate}% → ${money(tax)}`);
    step(`Day ${s.day}: sale ${s.id} (£${s.amount}) is joined with the rate in force now, ${r.rate}% → tax ${money(tax)}.${mode === 'versioned' ? ` The sale records which version it used: ${r.v}.` : ''}`, {
      quick: s.day === 2,
    });
    salesSeen.at(-1)!.tone = undefined;
  }
  step('Day 5: a bug fix means every sale is reprocessed from the log.');
  rerunTotal = 0;
  for (const s of SALES) {
    const r = mode === 'current' ? rates.at(-1)! : rateFor(s.day);
    const tax = (s.amount * r.rate) / 100;
    rerunTotal += tax;
    const right = tax === (s.amount * rateFor(s.day).rate) / 100;
    rerun.push(`rerun ${s.id}: ${r.rate}% → ${money(tax)} ${right ? '✓' : '✗'}`);
    step(
      mode === 'current'
        ? `Rerun ${s.id}: joined with today’s rate, ${r.rate}% → ${money(tax)}.${right ? '' : ' Wrong — on day ' + s.day + ' it was ' + rateFor(s.day).rate + '%.'}`
        : `Rerun ${s.id}: it refers to ${r.v}, so use ${r.rate}% → ${money(tax)}.`,
      { quick: right && s.id !== 's1', tone: right ? undefined : 'warn' },
    );
  }
  step(
    mode === 'current'
      ? `The rerun says ${money(rerunTotal)}, not ${money(liveTotal)}: old sales were joined with today’s rate. The join’s answer depends on **when** it runs — it isn’t deterministic.`
      : `The rerun matches: ${money(rerunTotal)}. Each sale pointed at the rate version in force when it happened, so the join gives the same answer whenever it runs. The cost: every version must be kept, so this table can’t be log-compacted.`,
    { tone: mode === 'current' ? 'error' : 'ok' },
  );
  return frames;
}

// ── Lesson 9: microbatching and checkpointing ────────────────────────

export type RecoveryMode = 'microbatch' | 'checkpoint';
const VIEWS = 8;
const EVERY = 3;
const MILESTONE = 5;
const CRASH_AFTER = 4;

export function checkpointFrames(mode: RecoveryMode): BoardFrame[] {
  let count = 0;
  let next = 0;
  let safe = 0;
  let safeCount = 0;
  let crashed = false;
  const saved: string[] = [];
  const emails: Chip[] = [];
  let batch: number[] = [];
  const view = (): Board => ({
    columns: [
      [
        {
          id: 'input',
          title: 'page views (log)',
          chips: Array.from({ length: VIEWS }, (_, o) => [
            ...(mode === 'checkpoint' && o > 0 && o % EVERY === 0 && o <= safe ? [{ text: '‖ barrier', tone: 'muted' as const }] : []),
            {
              text: `v${o}`,
              tag: String(o),
              tone: o < safe ? ('ok' as const) : o < next ? ('focus' as const) : batch.includes(o) ? ('warn' as const) : undefined,
            },
          ]).flat(),
        },
      ],
      [
        {
          id: 'operator',
          title: 'counting operator',
          tone: crashed ? 'bad' : undefined,
          lines: [crashed ? '**crashed**' : `count = **${count}**`, `next offset: ${next}`],
        },
      ],
      [{ id: 'storage', title: mode === 'microbatch' ? 'committed batches (durable)' : 'checkpoints (durable)', lines: saved, empty: 'nothing saved yet' }],
      [{ id: 'outside', title: 'outside world', chips: emails, empty: 'no emails sent' }],
    ],
  });
  const { frames, step } = recorder(view);
  const process = (o: number) => {
    count++;
    next = o + 1;
    if (count === MILESTONE) emails.push({ text: '“5 views!” email', tone: emails.length ? 'bad' : 'warn' });
  };
  const save = () => {
    safe = next;
    safeCount = count;
    batch = [];
    saved.push(mode === 'microbatch' ? `batch up to #${next - 1}: count ${count}` : `next offset ${next}, count ${count}`);
  };

  step(
    mode === 'microbatch'
      ? `An operator counts page views and emails the author when the count reaches ${MILESTONE}. The input is cut into **microbatches** of ${EVERY}; a batch’s result counts only once the whole batch completes.`
      : `An operator counts page views and emails the author when the count reaches ${MILESTONE}. The input flows continuously; every ${EVERY} events a **barrier** marker passes through, and the operator saves a **checkpoint** of its state.`,
  );
  let replaying = false;
  while (next < VIEWS) {
    const o = next;
    if (mode === 'microbatch' && o % EVERY === 0) batch = Array.from({ length: Math.min(EVERY, VIEWS - o) }, (_, i) => o + i);
    process(o);
    const hitMilestone = count === MILESTONE;
    step(
      `Offset ${o}: count = ${count}.${hitMilestone ? (replaying ? ' The email is sent **again**.' : ` The milestone email goes out.`) : ''}`,
      { quick: !hitMilestone && o !== 0, tone: hitMilestone && replaying ? 'warn' : undefined },
    );
    const boundary = next % EVERY === 0 || next === VIEWS;
    if (boundary) {
      save();
      step(
        mode === 'microbatch'
          ? `The batch is complete: its result and position are committed together (count ${count}, next offset ${next}).`
          : `Barrier! Save a checkpoint to durable storage: next offset ${next}, count ${count}.`,
      );
    }
    if (!replaying && next === CRASH_AFTER + 1) {
      crashed = true;
      step(`The machine crashes before the ${mode === 'microbatch' ? 'batch completes' : 'next checkpoint'}.`, { tone: 'warn' });
      crashed = false;
      count = safeCount;
      next = safe;
      replaying = true;
      step(
        mode === 'microbatch'
          ? `Restart from the last committed batch: count = ${count}, next offset ${next}. The unfinished batch’s work is thrown away and redone.`
          : `Restart from the last checkpoint: count = ${count}, re-read from offset ${next}. Anything produced since that checkpoint is thrown away.`,
      );
    }
  }
  step(
    `Final count: ${count} — exactly right, as if every view were counted once. But the email went out twice: once something leaves the framework, it can’t be taken back.`,
    { tone: 'warn' },
  );
  return frames;
}

// ── Lesson 9: recovering operator state ──────────────────────────────

export type StateMode = 'remote' | 'changelog' | 'replay';
const PAGE_VIEWS = ['p1', 'p2', 'p1', 'p1'];

export function stateRecoveryFrames(mode: StateMode): BoardFrame[] {
  let seen = 0;
  let local: Record<string, number> = {};
  const remote: Record<string, number> = {};
  let restored: Record<string, number> | undefined;
  let trips = 0;
  let crashed = false;
  const changelog: { key: string; value: number; tone?: Tone }[] = [];
  const show = (o: Record<string, number>) => Object.entries(o).map(([k, v]) => `${k} = ${v}`);
  const view = (): Board => ({
    columns: [
      [
        {
          id: 'input',
          title: mode === 'replay' ? 'input log (last minute)' : 'input',
          chips: PAGE_VIEWS.slice(0, seen).map((p, i) => ({ text: `view ${p}`, tag: String(i), tone: i === seen - 1 && !crashed ? 'focus' : undefined })),
          empty: 'none yet',
        },
      ],
      [
        {
          id: 'node1',
          title: 'node 1',
          tone: crashed ? 'bad' : undefined,
          lines: crashed ? ['**crashed** — memory lost'] : mode === 'remote' ? ['keeps nothing locally'] : show(local).length ? show(local) : ['state: empty'],
        },
        { id: 'node2', title: 'node 2 (standby)', tone: restored ? 'ok' : undefined, lines: restored ? show(restored) : ['waiting'] },
      ],
      ...(mode === 'remote'
        ? [[{ id: 'store', title: 'remote database', lines: [...show(remote), `network round trips: **${trips}**`] }]]
        : mode === 'changelog'
          ? [[{ id: 'store', title: 'changelog topic (log-compacted)', chips: changelog.map((c) => ({ text: `${c.key}=${c.value}`, tone: c.tone })), empty: 'empty' }]]
          : []),
    ],
  });
  const { frames, step } = recorder(view);

  step(
    mode === 'remote'
      ? 'An operator counts views per page. Here it keeps that state in a remote database rather than in its own memory.'
      : mode === 'changelog'
        ? 'An operator counts views per page in its own memory (fast). Every change is also sent to its own log-compacted **changelog topic**.'
        : 'An operator counts views per page **in the last minute** only, so its state is small and built from recent input.',
  );
  for (const p of PAGE_VIEWS) {
    seen++;
    if (mode === 'remote') {
      remote[p] = (remote[p] ?? 0) + 1;
      trips++;
      step(`View of ${p}: ask the database to add 1 — a network round trip (${trips} so far).`, { quick: trips > 2 });
    } else {
      local = { ...local, [p]: (local[p] ?? 0) + 1 };
      if (mode === 'changelog') {
        for (const c of changelog) c.tone = undefined;
        changelog.push({ key: p, value: local[p], tone: 'focus' });
        step(`View of ${p}: local ${p} = ${local[p]}; append “${p}=${local[p]}” to the changelog.`, { quick: seen > 2 });
      } else {
        step(`View of ${p}: local ${p} = ${local[p]}.`, { quick: seen > 2 });
      }
    }
  }
  for (const c of changelog) c.tone = undefined;
  crashed = true;
  local = {};
  step('Node 1 crashes. Node 2 takes over its work.', { tone: 'warn' });
  if (mode === 'remote') {
    restored = { ...remote };
    step('The state was never on node 1, so there’s nothing to rebuild: node 2 just carries on using the remote database.');
    step(`Recovery is trivial, but every single event cost a network round trip (${trips} so far). At thousands of events per second, that’s slow.`, { tone: 'warn' });
  } else if (mode === 'changelog') {
    const latest = new Map(changelog.map((c) => [c.key, c]));
    for (const c of changelog) if (latest.get(c.key) !== c) c.tone = 'muted';
    step('In the background, compaction keeps only the newest entry per key; older ones (greyed) can be deleted.', { quick: true });
    restored = Object.fromEntries([...latest].map(([k, c]) => [k, c.value]));
    for (const c of changelog) if (c.tone !== 'muted') c.tone = 'ok';
    step(`Node 2 reads the compacted changelog from the start and rebuilds the state: ${show(restored).join(', ')}. Local speed, and nothing lost.`, { tone: 'ok' });
  } else {
    restored = {};
    for (const p of PAGE_VIEWS) restored = { ...restored, [p]: (restored[p] ?? 0) + 1 };
    step(`Node 2 re-reads the last minute of input from the log and recounts: ${show(restored).join(', ')}.`);
    step('Cheap here, because the window is short. State built from all of history (like a materialized view) would take far too long to rebuild this way.', { tone: 'ok' });
  }
  return frames;
}

// ── Lesson 9: fencing a zombie ───────────────────────────────────────

export type FenceMode = 'none' | 'tokens';

export function fencingFrames(mode: FenceMode): BoardFrame[] {
  const n1 = { status: 'owner', token: 33 as number | undefined, tone: undefined as Tone | undefined };
  const n2 = { status: 'standby', token: undefined as number | undefined, tone: undefined as Tone | undefined };
  let owner = 'node 1 (token 33)';
  let total = 0;
  let highest = 0;
  const writes: Chip[] = [];
  const view = (): Board => ({
    columns: [
      [
        { id: 'node1', title: 'node 1', tone: n1.tone, lines: [n1.status, `token: ${n1.token ?? '—'}`] },
        { id: 'node2', title: 'node 2', tone: n2.tone, lines: [n2.status, `token: ${n2.token ?? '—'}`] },
      ],
      [{ id: 'coord', title: 'coordinator', lines: [`partition owner: **${owner}**`] }],
      [
        {
          id: 'db',
          title: 'database',
          chips: writes,
          lines: [`total = **${total}**`, ...(mode === 'tokens' ? [`highest token seen: ${highest || '—'}`] : [])],
        },
      ],
    ],
    links: [undefined, { label: 'writes' }],
  });
  const { frames, step } = recorder(view);
  const write = (value: number, token: number, by: string) => {
    for (const w of writes) if (w.tone === 'focus') w.tone = undefined;
    if (mode === 'tokens' && token < highest) {
      writes.push({ text: `${by}: total=${value}`, tag: `token ${token}`, tone: 'bad' });
      return false;
    }
    highest = Math.max(highest, token);
    total = value;
    writes.push({ text: `${by}: total=${value}`, tag: `token ${token}`, tone: 'focus' });
    return true;
  };

  step('Node 1 owns a partition and writes its results to a database. When the coordinator handed it the partition, it got a token: 33.');
  write(10, 33, 'node 1');
  step('Node 1 writes total = 10, tagged with token 33.');
  n1.tone = 'muted';
  n1.status = 'frozen (long pause) — doesn’t know it';
  step('Node 1 freezes — a long garbage-collection pause, or a network cut. From the inside, nothing seems to happen.', { tone: 'warn' });
  n2.status = 'owner';
  n2.token = 34;
  owner = 'node 2 (token 34)';
  step('The coordinator hears nothing from node 1 and decides it is dead. It gives the partition to node 2, with a higher token: 34.');
  write(12, 34, 'node 2');
  step('Node 2 replays the partition’s messages and writes total = 12, tagged with token 34.');
  n1.tone = undefined;
  n1.status = 'awake — still thinks it’s the owner';
  const accepted = write(11, 33, 'node 1');
  step('Node 1 wakes up, unaware that anything happened, and finishes its old work: total = 11, tagged with token 33.');
  if (accepted) {
    step('The database accepts it. The newer total (12) has been overwritten by a stale one, and nobody notices.', { tone: 'error' });
  } else {
    n1.status = 'told it is no longer the owner';
    n1.tone = 'muted';
    step('The database has already seen token 34, so it **rejects** token 33. Node 1 learns it lost the partition and stops. This is **fencing**.', { tone: 'ok' });
  }
  return frames;
}

export const LESSON_5_9_SCENARIOS = {
  ledger: [
    { id: 'overwrite', label: 'overwrite in place', frames: () => ledgerFrames('overwrite') },
    { id: 'ledger', label: 'append-only ledger', frames: () => ledgerFrames('ledger') },
  ],
  'crypto-shredding': [
    { id: 'delete', label: 'delete the events', frames: () => shredFrames('delete') },
    { id: 'shred', label: 'shred the key', frames: () => shredFrames('shred') },
  ],
  'async-view': [
    { id: 'stale', label: 'read straight after writing', frames: () => asyncViewFrames('stale') },
    { id: 'atomic', label: 'one event per action', frames: () => asyncViewFrames('atomic') },
  ],
  cep: [{ id: 'cep', label: 'fraud pattern', frames: cepFrames }],
  'stream-search': [{ id: 'search', label: 'saved searches', frames: streamSearchFrames }],
  'stream-analytics': [{ id: 'analytics', label: 'per-minute summary', frames: analyticsFrames }],
  ivm: [
    { id: 'recompute', label: 're-run the whole query', frames: () => ivmFrames('recompute') },
    { id: 'incremental', label: 'incremental', frames: () => ivmFrames('incremental') },
  ],
  stragglers: [
    { id: 'drop', label: 'drop stragglers', frames: () => stragglerFrames('drop') },
    { id: 'correct', label: 'publish corrections', frames: () => stragglerFrames('correct') },
    { id: 'watermark', label: 'wait for watermarks', frames: () => stragglerFrames('watermark') },
  ],
  'clock-skew': [
    { id: 'device', label: 'trust the phone', frames: () => clockSkewFrames('device') },
    { id: 'server', label: 'trust the server', frames: () => clockSkewFrames('server') },
    { id: 'three', label: 'three timestamps', frames: () => clockSkewFrames('three') },
  ],
  'versioned-join': [
    { id: 'current', label: 'join with the latest rate', frames: () => versionedJoinFrames('current') },
    { id: 'versioned', label: 'join with the rate version', frames: () => versionedJoinFrames('versioned') },
  ],
  checkpoint: [
    { id: 'microbatch', label: 'microbatching', frames: () => checkpointFrames('microbatch') },
    { id: 'checkpoint', label: 'checkpointing', frames: () => checkpointFrames('checkpoint') },
  ],
  'state-recovery': [
    { id: 'remote', label: 'remote database', frames: () => stateRecoveryFrames('remote') },
    { id: 'changelog', label: 'changelog topic', frames: () => stateRecoveryFrames('changelog') },
    { id: 'replay', label: 'replay the input', frames: () => stateRecoveryFrames('replay') },
  ],
  fencing: [
    { id: 'none', label: 'no fencing', frames: () => fencingFrames('none') },
    { id: 'tokens', label: 'fencing tokens', frames: () => fencingFrames('tokens') },
  ],
} satisfies Record<string, Scenario[]>;
