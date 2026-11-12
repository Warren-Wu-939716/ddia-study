import type { StepFrame } from '../../lib/steps.ts';

export type WindowKind = 'tumbling' | 'hopping' | 'sliding' | 'session';
export type LatePolicy = 'drop' | 'correct';

export interface TimedEvent {
  id: string;
  /** Event time: seconds after 10:00:00. */
  t: number;
}

/** In arrival order. e7 happened early but arrives last — a straggler. */
export const WINDOW_EVENTS: TimedEvent[] = [
  { id: 'e1', t: 5 },
  { id: 'e2', t: 30 },
  { id: 'e3', t: 50 },
  { id: 'e4', t: 130 },
  { id: 'e5', t: 160 },
  { id: 'e6', t: 260 },
  { id: 'e7', t: 40 },
];

export const WINDOW_RULES = {
  tumbling: { size: 60, label: '1-minute tumbling windows' },
  hopping: { size: 120, hop: 60, label: '2-minute windows that hop every minute' },
  sliding: { size: 120, label: '2-minute sliding windows' },
  session: { gap: 60, label: 'sessions that end after 1 minute of inactivity' },
} as const;

/** How long after a window's end we keep waiting for late events before emitting its result. */
export const GRACE = 30;

export interface WindowSpan {
  id: string;
  start: number;
  end: number;
  events: string[];
  emitted: boolean;
  corrected: boolean;
}

export interface WindowFrame extends StepFrame {
  arrived: string[];
  current?: string;
  windows: WindowSpan[];
  /** Highest event time seen, minus the grace period: windows ending before this are complete. */
  watermark: number;
  dropped: string[];
}

export function clock(t: number): string {
  const total = 10 * 3600 + t;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const span = (start: number, end: number) =>
  start % 60 === 0 && end % 60 === 0 ? `${clock(start).slice(0, -3)}–${clock(end).slice(0, -3)}` : `${clock(start)}–${clock(end)}`;

function fixedWindows(kind: 'tumbling' | 'hopping', t: number): [number, number][] {
  if (kind === 'tumbling') {
    const start = Math.floor(t / 60) * 60;
    return [[start, start + 60]];
  }
  const { size, hop } = WINDOW_RULES.hopping;
  const out: [number, number][] = [];
  for (let start = Math.floor((t - size) / hop + 1) * hop; start <= t; start += hop) out.push([start, start + size]);
  return out;
}

const closes = (kind: WindowKind, w: WindowSpan) => (kind === 'session' ? w.end + WINDOW_RULES.session.gap : w.end);

/** Assign each arriving event to windows, emit windows once the watermark passes them, and handle the straggler. */
export function windowFrames(kind: WindowKind, policy: LatePolicy, events: readonly TimedEvent[] = WINDOW_EVENTS): WindowFrame[] {
  const byId = new Map(events.map((e) => [e.id, e]));
  let windows: WindowSpan[] = [];
  const arrived: string[] = [];
  const dropped: string[] = [];
  let maxT = -Infinity;
  const frames: WindowFrame[] = [];
  const snapshot = () => windows.map((w) => ({ ...w, events: [...w.events] }));

  for (const e of events) {
    arrived.push(e.id);
    const targets: WindowSpan[] = [];
    let created = false;
    if (kind === 'tumbling' || kind === 'hopping') {
      for (const [start, end] of fixedWindows(kind, e.t)) {
        let w = windows.find((x) => x.start === start);
        if (!w) {
          w = { id: `w${start}`, start, end, events: [], emitted: false, corrected: false };
          windows.push(w);
        }
        targets.push(w);
      }
    } else if (kind === 'sliding') {
      targets.push(...windows.filter((w) => w.start <= e.t && e.t <= w.end));
      const own: WindowSpan = {
        id: `w-${e.id}`,
        start: e.t - WINDOW_RULES.sliding.size,
        end: e.t,
        events: arrived.filter((id) => {
          const t = byId.get(id)!.t;
          return id !== e.id && t >= e.t - WINDOW_RULES.sliding.size && t <= e.t;
        }),
        emitted: false,
        corrected: false,
      };
      if (own.end > maxT - GRACE || policy === 'correct') {
        windows.push(own);
        targets.push(own);
      }
    } else {
      const gap = WINDOW_RULES.session.gap;
      const near = windows.filter((w) => w.start - gap <= e.t && e.t <= w.end + gap);
      if (near.length === 0) {
        created = true;
        const w: WindowSpan = { id: `s${windows.length + 1}`, start: e.t, end: e.t, events: [], emitted: false, corrected: false };
        windows.push(w);
        targets.push(w);
      } else {
        targets.push(near[0]);
        // An event can bridge two sessions; merge them into the first.
        for (const other of near.slice(1)) {
          near[0].events.push(...other.events);
          near[0].start = Math.min(near[0].start, other.start);
          near[0].end = Math.max(near[0].end, other.end);
        }
        windows = windows.filter((w) => !near.slice(1).includes(w));
      }
    }

    const late = targets.filter((w) => w.emitted);
    const onTime = targets.filter((w) => !w.emitted);
    for (const w of onTime) w.events.push(e.id);
    if (late.length && policy === 'correct') {
      for (const w of late) {
        w.events.push(e.id);
        w.corrected = true;
      }
    }
    if (kind === 'session') for (const w of targets) if (!late.includes(w) || policy === 'correct') {
      w.start = Math.min(w.start, e.t);
      w.end = Math.max(w.end, e.t);
    }
    const isStraggler = e.t < maxT - GRACE;
    if (isStraggler && (policy === 'drop' ? late.length > 0 || onTime.length === 0 : false)) dropped.push(e.id);
    maxT = Math.max(maxT, e.t);

    const own = targets.find((w) => w.id === `w-${e.id}`);
    const where =
      kind === 'sliding'
        ? own
          ? `its window is the 2 minutes up to it (${span(own.start, own.end)}), which holds ${own.events.length} event${own.events.length === 1 ? '' : 's'}`
          : 'no window that is still open'
        : kind === 'session'
          ? created
            ? 'more than a minute after any earlier activity, so it **starts a new session**'
            : `within a minute of earlier activity, so it extends that session to ${span(targets[0].start, targets[0].end)}`
          : `it belongs to ${targets.map((w) => span(w.start, w.end)).join(' and ')}`;
    frames.push({
      arrived: [...arrived],
      current: e.id,
      windows: snapshot(),
      watermark: maxT - GRACE,
      dropped: [...dropped],
      caption: isStraggler
        ? late.length
          ? policy === 'drop'
            ? `${e.id} arrives now, but it happened at **${clock(e.t)}** — its window${late.length > 1 ? 's were' : ' was'} already reported. Policy “drop”: ignore it and count it as dropped.`
            : `${e.id} arrives now, but it happened at **${clock(e.t)}** — its window${late.length > 1 ? 's were' : ' was'} already reported. Policy “correct”: add it and publish a **corrected** result (retracting the old one).`
          : `${e.id} is a straggler from ${clock(e.t)}, but its window hasn’t been reported yet, so it’s simply added.`
        : `${e.id} happened at ${clock(e.t)} → ${where}.`,
    });

    const ready = windows.filter((w) => !w.emitted && closes(kind, w) <= maxT - GRACE);
    if (ready.length) {
      for (const w of ready) w.emitted = true;
      frames.push({
        arrived: [...arrived],
        windows: snapshot(),
        watermark: maxT - GRACE,
        dropped: [...dropped],
        caption: `Events have now reached ${clock(maxT)}. Allowing ${GRACE}s for late arrivals, nothing earlier than ${clock(maxT - GRACE)} is expected, so emit: ${ready
          .map((w) => `${span(w.start, w.end)} → **${w.events.length}**`)
          .join(', ')}.`,
      });
    }
  }
  frames.push({
    arrived: [...arrived],
    windows: snapshot(),
    watermark: maxT - GRACE,
    dropped: [...dropped],
    caption: `${WINDOW_RULES[kind].label}: ${windows.length} window${windows.length === 1 ? '' : 's'}. ${
      dropped.length ? `${dropped.length} straggler dropped — track that number and alert if it grows.` : policy === 'correct' ? 'Late data was folded in with corrections.' : ''
    }`,
  });
  return frames;
}
