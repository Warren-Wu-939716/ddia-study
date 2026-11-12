import type { CardStateRecord } from './db.ts';
import { createRng, shuffle } from './random.ts';
import { State } from './scheduler.ts';

export interface QueueOptions {
  states: readonly CardStateRecord[];
  now: Date;
  newLimit: number;
  introducedToday: number;
  maxReviews?: number;
  seed?: number;
}

/** True when two dates fall on the same local calendar day. */
export function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** Number of cards whose first-ever review happened today. */
export function countIntroducedToday(states: readonly CardStateRecord[], now: Date): number {
  return states.filter((s) => s.introducedAt && isSameLocalDay(s.introducedAt, now)).length;
}

/** Cards already seen at least once and due now, oldest due first. */
export function dueReviews(states: readonly CardStateRecord[], now: Date): CardStateRecord[] {
  return states
    .filter((s) => !s.suspended && s.fsrs.state !== State.New && s.fsrs.due.getTime() <= now.getTime())
    .sort((a, b) => a.fsrs.due.getTime() - b.fsrs.due.getTime());
}

/** Unlocked cards never reviewed, in unlock order (then id order, which follows the book). */
export function newCards(states: readonly CardStateRecord[]): CardStateRecord[] {
  return states
    .filter((s) => !s.suspended && s.fsrs.state === State.New)
    .sort((a, b) => a.unlockedAt.getTime() - b.unlockedAt.getTime() || a.cardId.localeCompare(b.cardId));
}

/** How many new cards may still be introduced today. */
export function newAllowance(newLimit: number, introducedToday: number): number {
  return Math.max(0, newLimit - introducedToday);
}

/**
 * Shuffles, then greedily reorders so neighbours come from different groups when possible.
 * Interleaving forces you to identify *which* idea applies instead of riding momentum.
 */
export function interleave<T>(items: readonly T[], groupOf: (item: T) => string, rng: () => number): T[] {
  const pool = shuffle(items, rng);
  const out: T[] = [];
  let previous: string | null = null;
  while (pool.length > 0) {
    const index = pool.findIndex((item) => groupOf(item) !== previous);
    const [next] = pool.splice(index === -1 ? 0 : index, 1);
    out.push(next);
    previous = groupOf(next);
  }
  return out;
}

/** Builds today's review queue: due reviews plus a capped number of new cards, interleaved by section. */
export function buildSessionQueue({
  states,
  now,
  newLimit,
  introducedToday,
  maxReviews = 60,
  seed = now.getTime(),
}: QueueOptions): string[] {
  const reviews = dueReviews(states, now).slice(0, maxReviews);
  const fresh = newCards(states).slice(0, newAllowance(newLimit, introducedToday));
  const rng = createRng(seed);
  return interleave([...reviews, ...fresh], (s) => `${s.chapterId}/${s.sectionId}`, rng).map((s) => s.cardId);
}

/** Where to re-insert a card graded in-session whose next due is still within the session. */
export function requeuePosition(queueLength: number, gap = 3): number {
  return Math.min(queueLength, gap);
}

/** Learning-step cards due within this window are shown again before the session ends. */
export const REQUEUE_WINDOW_MS = 20 * 60_000;
