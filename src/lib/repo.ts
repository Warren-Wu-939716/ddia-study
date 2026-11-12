import type { FreeTextCard, StudyCard } from '../content/types.ts';
import {
  db,
  DEFAULT_SETTINGS,
  responseKey,
  type CardStateRecord,
  type Confidence,
  type CustomCardRecord,
  type ProblemAttemptRecord,
  type ReviewLogRecord,
  type ResponseKind,
  type ResponseRecord,
  type Settings,
} from './db.ts';
import { applyGrade, newFsrsCard, type Grade } from './scheduler.ts';

/** Adds scheduling state for cards that aren't tracked yet; existing progress is never reset. */
export async function unlockCards(cards: readonly StudyCard[], now = new Date()): Promise<number> {
  if (cards.length === 0) return 0;
  return db.transaction('rw', db.cardStates, async () => {
    const existing = await db.cardStates.bulkGet(cards.map((c) => c.id));
    const fresh: CardStateRecord[] = cards
      .filter((_, i) => !existing[i])
      .map((card) => ({
        cardId: card.id,
        chapterId: card.chapterId,
        sectionId: card.sectionId,
        fsrs: newFsrsCard(now),
        suspended: false,
        unlockedAt: now,
        introducedAt: null,
      }));
    await db.cardStates.bulkAdd(fresh);
    return fresh.length;
  });
}

export interface ResponseInput {
  chapterId: string;
  kind: ResponseKind;
  refId: string;
  text: string;
  covered?: number[];
  choice?: string | null;
  complete?: boolean;
}

/** Upserts the single saved answer for an exercise, keeping the first completion time. */
export async function saveResponse(input: ResponseInput, now = new Date()): Promise<ResponseRecord> {
  const key = responseKey(input.chapterId, input.kind, input.refId);
  return db.transaction('rw', db.responses, async () => {
    const previous = await db.responses.get(key);
    const record: ResponseRecord = {
      key,
      chapterId: input.chapterId,
      kind: input.kind,
      refId: input.refId,
      text: input.text,
      covered: input.covered ?? [],
      choice: input.choice ?? null,
      updatedAt: now,
      completedAt: input.complete ? (previous?.completedAt ?? now) : (previous?.completedAt ?? null),
    };
    await db.responses.put(record);
    return record;
  });
}

/** Saves a section checkpoint and unlocks that section's cards into the review pool. */
export async function completeCheckpoint(
  chapterId: string,
  sectionId: string,
  text: string,
  covered: number[],
  sectionCards: readonly StudyCard[],
  now = new Date(),
): Promise<number> {
  await saveResponse({ chapterId, kind: 'checkpoint', refId: sectionId, text, covered, complete: true }, now);
  return unlockCards(sectionCards, now);
}

export async function setCardSuspended(cardId: string, suspended: boolean): Promise<void> {
  await db.cardStates.update(cardId, { suspended });
}

export interface ReviewInput {
  cardId: string;
  grade: Grade;
  confidence: Confidence;
  correct: boolean;
  coverage: number | null;
  answer: string;
}

/** Applies FSRS to a graded review, persists the new schedule and appends to the review log. */
export async function recordReview(input: ReviewInput, retention: number, now = new Date()): Promise<CardStateRecord> {
  return db.transaction('rw', db.cardStates, db.reviewLogs, async () => {
    const state = await db.cardStates.get(input.cardId);
    if (!state) throw new Error(`Card ${input.cardId} is not unlocked`);
    const { card, log } = applyGrade(state.fsrs, input.grade, now, { requestRetention: retention });
    const updated: CardStateRecord = { ...state, fsrs: card, introducedAt: state.introducedAt ?? now };
    const entry: ReviewLogRecord = {
      cardId: input.cardId,
      chapterId: state.chapterId,
      reviewedAt: now,
      grade: input.grade,
      confidence: input.confidence,
      correct: input.correct,
      coverage: input.coverage,
      answer: input.answer.slice(0, 5000),
      stateBefore: state.fsrs.state,
      scheduledDays: log.scheduled_days,
    };
    await db.cardStates.put(updated);
    await db.reviewLogs.add(entry);
    return updated;
  });
}

export interface CustomCardInput {
  chapterId: string;
  sectionId: string;
  prompt: string;
  answer: string;
  keyPoints: string[];
}

/** Creates your own free-text card for a section; it joins the review pool immediately. */
export async function addCustomCard(input: CustomCardInput, now = new Date()): Promise<CustomCardRecord> {
  const prompt = input.prompt.trim();
  const answer = input.answer.trim();
  const keyPoints = input.keyPoints.map((k) => k.trim()).filter(Boolean);
  if (!prompt || !answer) throw new Error('A card needs both a prompt and an answer.');
  const card: CustomCardRecord = {
    id: `custom.${crypto.randomUUID()}`,
    chapterId: input.chapterId,
    sectionId: input.sectionId,
    conceptIds: [],
    kind: 'explain',
    prompt,
    answer,
    keyPoints: keyPoints.length > 0 ? keyPoints : [answer],
    createdAt: now,
  };
  await db.transaction('rw', db.customCards, db.cardStates, async () => {
    await db.customCards.add(card);
    await unlockCards([card], now);
  });
  return card;
}

/** Removes a custom card and its schedule; its review history is kept for statistics. */
export async function deleteCustomCard(id: string): Promise<void> {
  await db.transaction('rw', db.customCards, db.cardStates, async () => {
    await db.customCards.delete(id);
    await db.cardStates.delete(id);
  });
}

export async function recordChallenge(
  challengeId: string,
  labId: string,
  prediction: string,
  correct: boolean,
  now = new Date(),
): Promise<void> {
  await db.challenges.put({ challengeId, labId, prediction, correct, completedAt: now });
}

export interface ProblemAttemptInput {
  problemId: string;
  chapterId: string;
  sectionId: string;
  answer: string;
  correct: boolean;
  confidence: Confidence;
}

/** Saves the latest attempt at a problem, keeping how the first attempt went. */
export async function recordProblemAttempt(input: ProblemAttemptInput, now = new Date()): Promise<ProblemAttemptRecord> {
  return db.transaction('rw', db.problemAttempts, async () => {
    const previous = await db.problemAttempts.get(input.problemId);
    const record: ProblemAttemptRecord = {
      ...input,
      answer: input.answer.slice(0, 5000),
      firstCorrect: previous?.firstCorrect ?? input.correct,
      attempts: (previous?.attempts ?? 0) + 1,
      firstAt: previous?.firstAt ?? now,
      updatedAt: now,
    };
    await db.problemAttempts.put(record);
    return record;
  });
}

export async function addJournalEntry(text: string, reviewed: number, correct: number, now = new Date()): Promise<void> {
  await db.journal.add({ createdAt: now, text: text.trim().slice(0, 5000), reviewed, correct });
}

export async function loadSettings(): Promise<Settings> {
  const record = await db.settings.get('prefs');
  return record ? { newCardsPerDay: record.newCardsPerDay, requestRetention: record.requestRetention } : DEFAULT_SETTINGS;
}

/** Clamps to sane ranges so a bad value can't break scheduling. */
export function normalizeSettings(settings: Settings): Settings {
  const newCardsPerDay = Math.round(Number.isFinite(settings.newCardsPerDay) ? settings.newCardsPerDay : DEFAULT_SETTINGS.newCardsPerDay);
  const retention = Number.isFinite(settings.requestRetention) ? settings.requestRetention : DEFAULT_SETTINGS.requestRetention;
  return {
    newCardsPerDay: Math.min(100, Math.max(0, newCardsPerDay)),
    requestRetention: Math.min(0.97, Math.max(0.8, retention)),
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await db.settings.put({ key: 'prefs', ...normalizeSettings(settings) });
}

/** Builds a typed custom card from a stored record (drops the storage-only timestamp). */
export function toStudyCard(record: CustomCardRecord): FreeTextCard {
  const { createdAt: _createdAt, ...card } = record;
  return card;
}

/** Deletes all progress. */
export async function resetAllProgress(): Promise<void> {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map((t) => t.clear()));
  });
}
