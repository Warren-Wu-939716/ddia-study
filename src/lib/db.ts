import Dexie, { type EntityTable } from 'dexie';
import type { Card as FsrsCard, Grade, State } from 'ts-fsrs';
import type { FreeTextCard } from '../content/types.ts';

/** 1 = guessing, 2 = fairly sure, 3 = certain. Captured before the answer is revealed. */
export type Confidence = 1 | 2 | 3;

export interface CardStateRecord {
  cardId: string;
  chapterId: string;
  sectionId: string;
  fsrs: FsrsCard;
  suspended: boolean;
  unlockedAt: Date;
  /** First time the card was reviewed; used for the daily new-card limit. */
  introducedAt: Date | null;
}

export interface ReviewLogRecord {
  id?: number;
  cardId: string;
  chapterId: string;
  reviewedAt: Date;
  grade: Grade;
  confidence: Confidence;
  correct: boolean;
  /** Fraction of key points covered for free-text cards; null for choice cards. */
  coverage: number | null;
  answer: string;
  stateBefore: State;
  scheduledDays: number;
}

export type ResponseKind = 'pretest' | 'checkpoint' | 'teachback' | 'scenario' | 'tradeoff';

export interface ResponseRecord {
  key: string;
  chapterId: string;
  kind: ResponseKind;
  refId: string;
  text: string;
  /** Indexes of rubric key points the learner marked as covered. */
  covered: number[];
  choice: string | null;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface CustomCardRecord extends FreeTextCard {
  createdAt: Date;
}

export interface ChallengeRecord {
  challengeId: string;
  labId: string;
  prediction: string;
  correct: boolean;
  completedAt: Date;
}

/** Latest attempt at an end-of-lesson problem, plus how the first attempt went. */
export interface ProblemAttemptRecord {
  problemId: string;
  chapterId: string;
  sectionId: string;
  /** JSON-encoded answer of the latest attempt. */
  answer: string;
  correct: boolean;
  confidence: Confidence;
  firstCorrect: boolean;
  attempts: number;
  firstAt: Date;
  updatedAt: Date;
}

export interface JournalRecord {
  id?: number;
  createdAt: Date;
  text: string;
  reviewed: number;
  correct: number;
}

export interface Settings {
  newCardsPerDay: number;
  requestRetention: number;
}

export interface SettingsRecord extends Settings {
  key: 'prefs';
}

export const DEFAULT_SETTINGS: Settings = {
  newCardsPerDay: 12,
  requestRetention: 0.9,
};

export type StudyDb = Dexie & {
  cardStates: EntityTable<CardStateRecord, 'cardId'>;
  reviewLogs: EntityTable<ReviewLogRecord, 'id'>;
  responses: EntityTable<ResponseRecord, 'key'>;
  customCards: EntityTable<CustomCardRecord, 'id'>;
  challenges: EntityTable<ChallengeRecord, 'challengeId'>;
  problemAttempts: EntityTable<ProblemAttemptRecord, 'problemId'>;
  journal: EntityTable<JournalRecord, 'id'>;
  settings: EntityTable<SettingsRecord, 'key'>;
};

export const TABLE_NAMES = [
  'cardStates',
  'reviewLogs',
  'responses',
  'customCards',
  'challenges',
  'problemAttempts',
  'journal',
  'settings',
] as const;

export type TableName = (typeof TABLE_NAMES)[number];

/** Opens the IndexedDB database that holds all study progress (nothing leaves the browser). */
export function openStudyDb(name = 'ddia-study'): StudyDb {
  const database = new Dexie(name) as StudyDb;
  database.version(1).stores({
    cardStates: 'cardId, chapterId, sectionId',
    reviewLogs: '++id, cardId, chapterId, reviewedAt',
    responses: 'key, chapterId, kind',
    customCards: 'id, chapterId, sectionId',
    challenges: 'challengeId, labId',
    journal: '++id, createdAt',
    settings: 'key',
  });
  database.version(2).stores({ problemAttempts: 'problemId, chapterId, sectionId' });
  return database;
}

export const db = openStudyDb();

/** Asks the browser not to evict progress when disk space runs low; resolves true if storage is persistent. */
export async function requestPersistentStorage(
  storage: Pick<StorageManager, 'persist' | 'persisted'> | undefined = navigator.storage,
): Promise<boolean> {
  // The Storage API is missing on plain-http origins and in older browsers.
  if (!storage) return false;
  try {
    return (await storage.persisted()) || (await storage.persist());
  } catch {
    return false;
  }
}

/** Builds the primary key for a response so each exercise has at most one saved answer. */
export function responseKey(chapterId: string, kind: ResponseKind, refId: string): string {
  return `${chapterId}:${kind}:${refId}`;
}
