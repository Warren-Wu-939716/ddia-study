import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import type { StudyCard } from '../content/types.ts';
import { db, DEFAULT_SETTINGS, type CardStateRecord, type ProblemAttemptRecord, type ResponseRecord, type Settings } from './db.ts';
import { toStudyCard } from './repo.ts';

export function useSettings(): Settings {
  const record = useLiveQuery(() => db.settings.get('prefs'), []);
  return record ? { newCardsPerDay: record.newCardsPerDay, requestRetention: record.requestRetention } : DEFAULT_SETTINGS;
}

export function useCustomCards(chapterId?: string): StudyCard[] {
  const records = useLiveQuery(
    () => (chapterId ? db.customCards.where('chapterId').equals(chapterId).toArray() : db.customCards.toArray()),
    [chapterId],
  );
  return useMemo(() => (records ?? []).map(toStudyCard), [records]);
}

/** Card states keyed by card id; undefined while loading. */
export function useCardStates(chapterId?: string): Map<string, CardStateRecord> | undefined {
  const states = useLiveQuery(
    () => (chapterId ? db.cardStates.where('chapterId').equals(chapterId).toArray() : db.cardStates.toArray()),
    [chapterId],
  );
  return useMemo(() => (states ? new Map(states.map((s) => [s.cardId, s])) : undefined), [states]);
}

/** Problem attempts keyed by problem id; undefined while loading. */
export function useProblemAttempts(chapterId?: string): Map<string, ProblemAttemptRecord> | undefined {
  const records = useLiveQuery(
    () => (chapterId ? db.problemAttempts.where('chapterId').equals(chapterId).toArray() : db.problemAttempts.toArray()),
    [chapterId],
  );
  return useMemo(() => (records ? new Map(records.map((r) => [r.problemId, r])) : undefined), [records]);
}

/** Responses for a chapter keyed by `${kind}:${refId}`. */
export function useResponses(chapterId: string): Map<string, ResponseRecord> | undefined {
  const responses = useLiveQuery(() => db.responses.where('chapterId').equals(chapterId).toArray(), [chapterId]);
  return useMemo(
    () => (responses ? new Map(responses.map((r) => [`${r.kind}:${r.refId}`, r])) : undefined),
    [responses],
  );
}

/** Sections whose checkpoint is complete. */
export function completedSections(responses: ReadonlyMap<string, ResponseRecord> | undefined): Set<string> {
  const done = new Set<string>();
  for (const r of responses?.values() ?? []) if (r.kind === 'checkpoint' && r.completedAt) done.add(r.refId);
  return done;
}

/** Current time, refreshed periodically so "due now" counts stay honest. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
