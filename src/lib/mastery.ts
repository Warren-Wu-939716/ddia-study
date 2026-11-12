import type { Concept, StudyCard } from '../content/types.ts';
import type { CardStateRecord, Confidence, ReviewLogRecord } from './db.ts';
import { isSameLocalDay } from './queue.ts';
import { retrievability, State, type SchedulerOptions } from './scheduler.ts';

/** Stability (days) at which a memory counts as fully durable for mastery purposes. */
export const MATURE_STABILITY_DAYS = 21;

/**
 * Strength of one card in [0, 1]: recall probability right now, scaled by how durable
 * the memory is (capped at three weeks of stability). Unseen cards score 0.
 */
export function cardStrength(state: CardStateRecord | undefined, now: Date, options?: SchedulerOptions): number {
  if (!state || state.fsrs.state === State.New) return 0;
  const durability = Math.min(1, state.fsrs.stability / MATURE_STABILITY_DAYS);
  return retrievability(state.fsrs, now, options) * durability;
}

export interface MasterySummary {
  mastery: number;
  totalCards: number;
  reviewedCards: number;
}

/** Average strength of the cards linked to a concept. */
export function conceptMastery(
  concept: Concept,
  cards: readonly StudyCard[],
  statesById: ReadonlyMap<string, CardStateRecord>,
  now: Date,
  options?: SchedulerOptions,
): MasterySummary {
  const linked = cards.filter((c) => c.conceptIds.includes(concept.id));
  if (linked.length === 0) return { mastery: 0, totalCards: 0, reviewedCards: 0 };
  let total = 0;
  let reviewed = 0;
  for (const card of linked) {
    const state = statesById.get(card.id);
    if (state && state.fsrs.state !== State.New) reviewed++;
    total += cardStrength(state, now, options);
  }
  return { mastery: total / linked.length, totalCards: linked.length, reviewedCards: reviewed };
}

/** Average strength over a set of cards (e.g. a chapter). */
export function averageStrength(
  cards: readonly StudyCard[],
  statesById: ReadonlyMap<string, CardStateRecord>,
  now: Date,
  options?: SchedulerOptions,
): number {
  if (cards.length === 0) return 0;
  return cards.reduce((sum, c) => sum + cardStrength(statesById.get(c.id), now, options), 0) / cards.length;
}

export interface CalibrationBucket {
  confidence: Confidence;
  label: string;
  count: number;
  correct: number;
  accuracy: number | null;
}

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  1: 'Guessing',
  2: 'Fairly sure',
  3: 'Certain',
};

/** Accuracy per confidence level. Well-calibrated learners are right far more often when "Certain". */
export function calibration(logs: readonly ReviewLogRecord[]): CalibrationBucket[] {
  return ([1, 2, 3] as const).map((confidence) => {
    const bucket = logs.filter((l) => l.confidence === confidence);
    const correct = bucket.filter((l) => l.correct).length;
    return {
      confidence,
      label: CONFIDENCE_LABELS[confidence],
      count: bucket.length,
      correct,
      accuracy: bucket.length === 0 ? null : correct / bucket.length,
    };
  });
}

/** Cards you keep forgetting — a sign the card or your mental model needs rework. */
export function findLeeches(states: readonly CardStateRecord[], minLapses = 3): CardStateRecord[] {
  return states.filter((s) => s.fsrs.lapses >= minLapses).sort((a, b) => b.fsrs.lapses - a.fsrs.lapses);
}

export interface ForecastDay {
  date: Date;
  count: number;
}

/** Reviews falling due on each of the next `days` days; day 0 also includes anything overdue. */
export function reviewForecast(states: readonly CardStateRecord[], now: Date, days = 7): ForecastDay[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const result: ForecastDay[] = Array.from({ length: days }, (_, i) => ({
    date: new Date(startOfToday.getFullYear(), startOfToday.getMonth(), startOfToday.getDate() + i),
    count: 0,
  }));
  for (const state of states) {
    if (state.suspended || state.fsrs.state === State.New) continue;
    const due = state.fsrs.due;
    if (due.getTime() < startOfToday.getTime()) {
      result[0].count++;
      continue;
    }
    const day = result.find((d) => isSameLocalDay(d.date, due));
    if (day) day.count++;
  }
  return result;
}
