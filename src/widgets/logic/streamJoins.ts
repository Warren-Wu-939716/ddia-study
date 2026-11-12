import type { StepFrame } from '../../lib/steps.ts';

export type JoinMode = 'stream-stream' | 'stream-table' | 'table-table';
export type JoinVariant = 'as-sent' | 'update-first';

export interface JoinInput {
  stream: string;
  text: string;
}

export interface JoinState {
  label: string;
  rows: string[];
}

export interface JoinFrame extends StepFrame {
  inputs: JoinInput[];
  /** How many inputs have been processed (the last one is current). */
  processed: number;
  state: JoinState[];
  output: string[];
  /** Index of the output line added in this step, or -1. */
  fresh: number;
}

interface Builder {
  frames: JoinFrame[];
  inputs: JoinInput[];
  output: string[];
}

function builder(inputs: JoinInput[]): Builder {
  return { frames: [], inputs, output: [] };
}

function push(b: Builder, processed: number, state: JoinState[], caption: string, emit?: string) {
  if (emit) b.output.push(emit);
  b.frames.push({ inputs: b.inputs, processed, state: state.map((s) => ({ ...s, rows: [...s.rows] })), output: [...b.output], fresh: emit ? b.output.length - 1 : -1, caption });
}

/** Search and click events joined by session id within a one-hour window. */
function streamStream(): JoinFrame[] {
  const b = builder([
    { stream: 'searches', text: '10:00 s1 searched “red shoes”' },
    { stream: 'searches', text: '10:02 s2 searched “rain jacket”' },
    { stream: 'clicks', text: '10:04 s1 clicked result #3' },
    { stream: 'clicks', text: '10:05 s3 clicked result #1' },
    { stream: 'searches', text: '10:05 s3 searched “tent” (arrives late)' },
    { stream: 'clock', text: 'time passes to 11:03' },
  ]);
  const searches: string[] = [];
  const clicks: string[] = [];
  const st = () => [
    { label: 'searches from the last hour', rows: searches },
    { label: 'clicks waiting for their search', rows: clicks },
  ];
  b.frames.push({ inputs: b.inputs, processed: 0, state: st(), output: [], fresh: -1, caption: 'Two streams: searches and clicks, linked by session id. Goal: for every search, did the user click a result within an hour?' });
  searches.push('s1 “red shoes” 10:00');
  push(b, 1, st(), 'A search arrives. Remember it for up to an hour, indexed by session id, in case a click follows.');
  searches.push('s2 “rain jacket” 10:02');
  push(b, 2, st(), 'Another search; remember it too. The processor’s memory grows with the window size.');
  searches[0] = 's1 “red shoes” 10:00 (clicked)';
  push(b, 3, st(), 'A click for s1: look up s1 among the remembered searches — found, so emit a joined event.', 's1 “red shoes” → clicked #3 after 4 min');
  clicks.push('s3 clicked #1 10:05');
  push(b, 4, st(), 'A click for s3 — but no search for s3 has arrived yet (network delays can reorder streams). Keep the click and wait.');
  searches.push('s3 “tent” 10:05 (clicked)');
  clicks.length = 0;
  push(b, 5, st(), 'The s3 search finally arrives and finds the waiting click. Emit the join.', 's3 “tent” → clicked #1 (click arrived first)');
  searches.splice(0, 2);
  push(
    b,
    6,
    st(),
    'An hour has passed since s1 and s2. s1 was clicked; s2 never was, so emit a “not clicked” event. That’s the half you’d miss if you only looked at clicks.',
    's2 “rain jacket” → no result clicked',
  );
  push(b, 6, st(), 'Click-through rate: 2 of 3 searches. A stream–stream join needs state for both inputs and a window that bounds how long to wait.');
  return b.frames;
}

/** Activity events enriched with a local copy of the profile table, kept fresh by a changelog. */
function streamTable(variant: JoinVariant): JoinFrame[] {
  const update = { stream: 'profile changes', text: 'u7 moves to Rome' };
  const view = { stream: 'activity', text: 'u7 viewed “hiking boots”' };
  const ordered = variant === 'as-sent' ? [view, update] : [update, view];
  const b = builder([{ stream: 'profile changes', text: 'u7 lives in Oslo' }, ...ordered, { stream: 'activity', text: 'u7 bought “hiking boots”' }, { stream: 'activity', text: 'u9 viewed “tent”' }]);
  const table: Record<string, string> = {};
  const st = () => [{ label: 'local copy of the profile table', rows: Object.entries(table).map(([u, c]) => `${u}: ${c}`) }];
  b.frames.push({
    inputs: b.inputs,
    processed: 0,
    state: st(),
    output: [],
    fresh: -1,
    caption: 'Goal: add each user’s city to their activity events. Instead of querying the profile database for every event, keep a local copy of it, updated from its changelog (CDC).',
  });
  table.u7 = 'Oslo';
  push(b, 1, st(), 'A profile change: store u7 → Oslo in the local copy.');
  b.inputs.slice(1, 3).forEach((input, i) => {
    if (input === update) {
      table.u7 = 'Rome';
      push(b, i + 2, st(), 'Another profile change: u7 → Rome. Newer versions overwrite older ones; the table side keeps everything “since the beginning of time”.');
    } else {
      push(b, i + 2, st(), `An activity event: look up u7 locally — currently ${table.u7} — and emit an enriched event. No network call needed.`, `u7 viewed “hiking boots” · ${table.u7}`);
    }
  });
  push(b, 4, st(), 'u7 buys the boots → enriched with the current value, Rome.', 'u7 bought “hiking boots” · Rome');
  push(b, 5, st(), 'u9 has no profile in the table yet → enrich with “unknown” (or hold the event briefly).', 'u9 viewed “tent” · city unknown');
  push(
    b,
    5,
    st(),
    variant === 'as-sent'
      ? 'The view was joined with Oslo. Switch to “update arrives first” to see the same events give a different answer: the result depends on how the two streams interleave.'
      : 'Now the view was joined with Rome. Same events, different interleaving, different output — the join is nondeterministic unless each event records which profile version it should use.',
  );
  return b.frames;
}

/** Follows and posts joined into home timelines: each change joins with the current state of the other side. */
function tableTable(): JoinFrame[] {
  const b = builder([
    { stream: 'follows', text: 'ann follows bob' },
    { stream: 'posts', text: 'bob posts p1 “Hello”' },
    { stream: 'follows', text: 'cy follows bob' },
    { stream: 'posts', text: 'dan posts p2 “Hi all”' },
    { stream: 'posts', text: 'bob posts p3 “Lunch?”' },
    { stream: 'follows', text: 'ann unfollows bob' },
    { stream: 'posts', text: 'bob deletes p1' },
  ]);
  const followers: Record<string, string[]> = {};
  const posts: Record<string, string[]> = {};
  const timelines: Record<string, string[]> = {};
  const st = () => [
    { label: 'followers', rows: Object.entries(followers).map(([u, f]) => `${u} ← ${f.join(', ') || '—'}`) },
    { label: 'posts', rows: Object.entries(posts).map(([u, p]) => `${u}: ${p.join(', ') || '—'}`) },
    { label: 'home timelines (the materialized view)', rows: Object.entries(timelines).map(([u, t]) => `${u}: ${t.join(', ') || '—'}`) },
  ];
  b.frames.push({ inputs: b.inputs, processed: 0, state: st(), output: [], fresh: -1, caption: 'Two changelogs — follows and posts — maintain every user’s home timeline: the join of the two tables, kept up to date.' });
  followers.bob = ['ann'];
  timelines.ann = [];
  push(b, 1, st(), 'ann follows bob. A follow change is joined with bob’s current posts — he has none, so ann’s timeline stays empty.');
  posts.bob = ['p1'];
  timelines.ann = ['p1'];
  push(b, 2, st(), 'bob posts p1. A post change is joined with bob’s current followers: add p1 to ann’s timeline.', 'ann’s timeline + p1');
  followers.bob = ['ann', 'cy'];
  timelines.cy = ['p1'];
  push(b, 3, st(), 'cy follows bob → copy bob’s recent posts into cy’s timeline.', 'cy’s timeline + p1');
  posts.dan = ['p2'];
  push(b, 4, st(), 'dan posts p2, but nobody follows dan → no timeline changes.');
  posts.bob = ['p1', 'p3'];
  timelines.ann = ['p3', 'p1'];
  timelines.cy = ['p3', 'p1'];
  push(b, 5, st(), 'bob posts p3 → added to the timelines of both followers.', 'ann’s and cy’s timelines + p3');
  followers.bob = ['cy'];
  timelines.ann = [];
  push(b, 6, st(), 'ann unfollows bob → remove bob’s posts from ann’s timeline.', 'ann’s timeline − p1, p3');
  posts.bob = ['p3'];
  timelines.cy = ['p3'];
  push(b, 7, st(), 'bob deletes p1 → remove it from every follower’s timeline.', 'cy’s timeline − p1');
  push(b, 7, st(), 'Every post change was joined with the current followers, and every follow change with the current posts. Reading a timeline is now a single lookup.');
  return b.frames;
}

export function joinFrames(mode: JoinMode, variant: JoinVariant = 'as-sent'): JoinFrame[] {
  if (mode === 'stream-stream') return streamStream();
  if (mode === 'stream-table') return streamTable(variant);
  return tableTable();
}
