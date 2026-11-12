import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card as FsrsCard,
  type FSRS,
  type Grade,
  type ReviewLog,
} from 'ts-fsrs';
import type { Confidence } from './db.ts';

export { Rating, State };
export type { FsrsCard, Grade };

export const GRADES: readonly Grade[] = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy];

export const GRADE_LABELS: Record<Grade, string> = {
  [Rating.Again]: 'Again',
  [Rating.Hard]: 'Hard',
  [Rating.Good]: 'Good',
  [Rating.Easy]: 'Easy',
};

export interface SchedulerOptions {
  requestRetention?: number;
  fuzz?: boolean;
}

const engines = new Map<string, FSRS>();

/** Returns a cached FSRS engine for the given retention target. */
export function getScheduler({ requestRetention = 0.9, fuzz = true }: SchedulerOptions = {}): FSRS {
  const cacheKey = `${requestRetention}:${fuzz}`;
  let engine = engines.get(cacheKey);
  if (!engine) {
    engine = fsrs(generatorParameters({ request_retention: requestRetention, enable_fuzz: fuzz }));
    engines.set(cacheKey, engine);
  }
  return engine;
}

/** A brand-new card that is due immediately. */
export function newFsrsCard(now: Date): FsrsCard {
  return createEmptyCard(now);
}

/** Applies a grade and returns the rescheduled card plus FSRS's review log. */
export function applyGrade(
  card: FsrsCard,
  grade: Grade,
  now: Date,
  options?: SchedulerOptions,
): { card: FsrsCard; log: ReviewLog } {
  return getScheduler(options).next(card, now, grade);
}

/** Next due date for each grade, so buttons can show "Good · 3d". */
export function previewDueDates(card: FsrsCard, now: Date, options?: SchedulerOptions): Record<Grade, Date> {
  const preview = getScheduler(options).repeat(card, now);
  return {
    [Rating.Again]: preview[Rating.Again].card.due,
    [Rating.Hard]: preview[Rating.Hard].card.due,
    [Rating.Good]: preview[Rating.Good].card.due,
    [Rating.Easy]: preview[Rating.Easy].card.due,
  };
}

/** Probability (0–1) you can recall the card right now; 0 for unseen cards. */
export function retrievability(card: FsrsCard, now: Date, options?: SchedulerOptions): number {
  if (card.state === State.New) return 0;
  return getScheduler(options).get_retrievability(card, now, false);
}

/** Compact human label for the gap between two instants, e.g. "10m", "4d", "3mo". */
export function formatInterval(from: Date, to: Date): string {
  const minutes = Math.max(0, (to.getTime() - from.getTime()) / 60_000);
  if (minutes < 60) return `${Math.max(1, Math.round(minutes))}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

/**
 * Suggests a grade from rubric coverage. Full coverage while certain earns Easy;
 * missing half or more of the key points counts as a lapse.
 */
export function suggestGrade(coverage: number, confidence: Confidence): Grade {
  if (coverage < 0.5) return Rating.Again;
  if (coverage < 0.8) return Rating.Hard;
  if (coverage >= 1 && confidence === 3) return Rating.Easy;
  return Rating.Good;
}

/** Choice cards: wrong is Again; right is Good, or Easy when you were certain. */
export function suggestChoiceGrade(correct: boolean, confidence: Confidence): Grade {
  if (!correct) return Rating.Again;
  return confidence === 3 ? Rating.Easy : Rating.Good;
}
