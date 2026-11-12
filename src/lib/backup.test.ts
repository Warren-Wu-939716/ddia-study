import { beforeEach, describe, expect, it } from 'vitest';
import { chapter4 } from '../content/ch04/index.ts';
import { exportBackup, importBackup, parseBackup, parseBackupText } from './backup.ts';
import { db } from './db.ts';
import { recordReview, resetAllProgress, saveResponse, unlockCards } from './repo.ts';
import { Rating } from './scheduler.ts';

const now = new Date('2026-03-10T12:00:00Z');

beforeEach(async () => {
  await resetAllProgress();
});

describe('backup round trip', () => {
  it('exports, survives JSON, and restores with real Date objects', async () => {
    const card = chapter4.cards[0];
    await unlockCards([card], now);
    await recordReview({ cardId: card.id, grade: Rating.Good, confidence: 2, correct: true, coverage: 1, answer: 'a' }, 0.9, now);
    await saveResponse({ chapterId: 'ch04', kind: 'checkpoint', refId: 'oltp-intro', text: 'notes', complete: true }, now);

    const json = JSON.stringify(await exportBackup(now));
    await resetAllProgress();
    expect(await db.cardStates.count()).toBe(0);

    await importBackup(parseBackupText(json));
    const state = await db.cardStates.get(card.id);
    expect(state?.fsrs.due).toBeInstanceOf(Date);
    expect(state?.unlockedAt).toEqual(now);
    expect((await db.reviewLogs.toArray())[0].reviewedAt).toBeInstanceOf(Date);
    expect((await db.responses.get('ch04:checkpoint:oltp-intro'))?.completedAt).toEqual(now);
  });
});

describe('parseBackup validation', () => {
  const valid = { app: 'ddia-study', version: 1, exportedAt: now.toISOString(), tables: {} };

  it('accepts a minimal backup and fills missing tables', () => {
    const backup = parseBackup(valid);
    expect(backup.tables.cardStates).toEqual([]);
    expect(backup.tables.settings).toEqual([]);
  });

  it.each([
    ['not an object', [], /JSON object/],
    ['wrong app', { ...valid, app: 'other' }, /not a DDIA Study backup/],
    ['wrong version', { ...valid, version: 99 }, /Unsupported backup version/],
    ['missing tables', { ...valid, tables: undefined }, /missing its tables/],
    ['table not array', { ...valid, tables: { responses: {} } }, /must be an array/],
    ['row not object', { ...valid, tables: { responses: ['x'] } }, /must be an object/],
    ['missing primary key', { ...valid, tables: { responses: [{ text: 'x' }] } }, /missing "key"/],
    ['bad date', { ...valid, tables: { journal: [{ createdAt: 'yesterday-ish' }] } }, /not a valid date/],
  ])('rejects %s', (_label, input, message) => {
    expect(() => parseBackup(input)).toThrow(message);
  });

  it('rejects invalid JSON text', () => {
    expect(() => parseBackupText('{nope')).toThrow(/not valid JSON/);
  });

  it('does not mutate the input object', () => {
    const input = { ...valid, tables: { journal: [{ createdAt: now.toISOString(), text: 't' }] } };
    parseBackup(input);
    expect(typeof input.tables.journal[0].createdAt).toBe('string');
  });
});
