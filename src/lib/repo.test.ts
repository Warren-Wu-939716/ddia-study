import { beforeEach, describe, expect, it } from 'vitest';
import { chapter4 } from '../content/ch04/index.ts';
import { db, DEFAULT_SETTINGS } from './db.ts';
import {
  addCustomCard,
  addJournalEntry,
  completeCheckpoint,
  deleteCustomCard,
  loadSettings,
  normalizeSettings,
  recordChallenge,
  recordReview,
  resetAllProgress,
  saveResponse,
  saveSettings,
  setCardSuspended,
  toStudyCard,
  unlockCards,
} from './repo.ts';
import { Rating, State } from './scheduler.ts';

const now = new Date('2026-03-10T12:00:00Z');
const sectionCards = chapter4.cards.filter((c) => c.sectionId === 'btrees');

beforeEach(async () => {
  await resetAllProgress();
});

describe('unlockCards', () => {
  it('creates new states once and never resets existing progress', async () => {
    expect(await unlockCards(sectionCards, now)).toBe(sectionCards.length);
    await recordReview({ cardId: sectionCards[0].id, grade: Rating.Good, confidence: 2, correct: true, coverage: 1, answer: 'x' }, 0.9, now);
    expect(await unlockCards(sectionCards, now)).toBe(0);
    const state = await db.cardStates.get(sectionCards[0].id);
    expect(state?.fsrs.state).not.toBe(State.New);
  });

  it('is a no-op for an empty list', async () => {
    expect(await unlockCards([], now)).toBe(0);
  });
});

describe('saveResponse', () => {
  it('upserts by key and keeps the first completion time', async () => {
    const first = await saveResponse({ chapterId: 'ch04', kind: 'teachback', refId: 'tb.lsm', text: 'v1', complete: true }, now);
    const later = new Date(now.getTime() + 60_000);
    const second = await saveResponse({ chapterId: 'ch04', kind: 'teachback', refId: 'tb.lsm', text: 'v2', covered: [0, 2] }, later);
    expect(second.key).toBe(first.key);
    expect(second.text).toBe('v2');
    expect(second.covered).toEqual([0, 2]);
    expect(second.completedAt).toEqual(now);
    expect(await db.responses.count()).toBe(1);
  });
});

describe('completeCheckpoint', () => {
  it('records the checkpoint and unlocks the section cards', async () => {
    const unlocked = await completeCheckpoint('ch04', 'btrees', 'summary', [0, 1], sectionCards, now);
    expect(unlocked).toBe(sectionCards.length);
    const response = await db.responses.get('ch04:checkpoint:btrees');
    expect(response?.completedAt).toEqual(now);
    expect(await db.cardStates.where('sectionId').equals('btrees').count()).toBe(sectionCards.length);
  });
});

describe('recordReview', () => {
  it('reschedules, marks the introduction time and logs the review', async () => {
    await unlockCards(sectionCards.slice(0, 1), now);
    const updated = await recordReview(
      { cardId: sectionCards[0].id, grade: Rating.Easy, confidence: 3, correct: true, coverage: 1, answer: 'answer' },
      0.9,
      now,
    );
    expect(updated.introducedAt).toEqual(now);
    expect(updated.fsrs.due.getTime()).toBeGreaterThan(now.getTime());
    const logs = await db.reviewLogs.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ cardId: sectionCards[0].id, grade: Rating.Easy, confidence: 3, stateBefore: State.New });
  });

  it('rejects cards that were never unlocked', async () => {
    await expect(
      recordReview({ cardId: 'nope', grade: Rating.Good, confidence: 1, correct: true, coverage: null, answer: '' }, 0.9, now),
    ).rejects.toThrow(/not unlocked/);
  });
});

describe('setCardSuspended', () => {
  it('toggles suspension', async () => {
    await unlockCards(sectionCards.slice(0, 1), now);
    await setCardSuspended(sectionCards[0].id, true);
    expect((await db.cardStates.get(sectionCards[0].id))?.suspended).toBe(true);
  });
});

describe('custom cards', () => {
  it('adds a trimmed card, unlocks it, and deletes it with its state', async () => {
    const card = await addCustomCard({ chapterId: 'ch04', sectionId: 'btrees', prompt: '  Why? ', answer: ' Because. ', keyPoints: ['', ' a '] }, now);
    expect(card.id).toMatch(/^custom\./);
    expect(card.prompt).toBe('Why?');
    expect(card.keyPoints).toEqual(['a']);
    expect(await db.cardStates.get(card.id)).toBeDefined();
    expect(toStudyCard(card)).not.toHaveProperty('createdAt');
    await deleteCustomCard(card.id);
    expect(await db.customCards.count()).toBe(0);
    expect(await db.cardStates.get(card.id)).toBeUndefined();
  });

  it('falls back to the answer as the only key point', async () => {
    const card = await addCustomCard({ chapterId: 'ch04', sectionId: 'btrees', prompt: 'Q', answer: 'A', keyPoints: [] }, now);
    expect(card.keyPoints).toEqual(['A']);
  });

  it('requires a prompt and an answer', async () => {
    await expect(addCustomCard({ chapterId: 'ch04', sectionId: 'btrees', prompt: ' ', answer: 'A', keyPoints: [] })).rejects.toThrow();
  });
});

describe('challenges and journal', () => {
  it('stores challenge outcomes and journal entries', async () => {
    await recordChallenge('lsm.flush-count', 'lsm', '1', true, now);
    await addJournalEntry('  confused about tombstones  ', 10, 7, now);
    expect(await db.challenges.get('lsm.flush-count')).toMatchObject({ correct: true, prediction: '1' });
    expect((await db.journal.toArray())[0]).toMatchObject({ text: 'confused about tombstones', reviewed: 10, correct: 7 });
  });
});

describe('settings', () => {
  it('returns defaults, then saved values', async () => {
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
    await saveSettings({ newCardsPerDay: 20, requestRetention: 0.92 });
    expect(await loadSettings()).toEqual({ newCardsPerDay: 20, requestRetention: 0.92 });
  });

  it('clamps out-of-range and invalid values', () => {
    expect(normalizeSettings({ newCardsPerDay: 500, requestRetention: 0.5 })).toEqual({ newCardsPerDay: 100, requestRetention: 0.8 });
    expect(normalizeSettings({ newCardsPerDay: Number.NaN, requestRetention: Number.NaN })).toEqual(DEFAULT_SETTINGS);
  });
});
