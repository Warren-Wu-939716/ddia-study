import { describe, expect, it } from 'vitest';
import { chapter4 } from '../content/ch04/index.ts';
import { problemsFor } from '../content/problems.ts';
import { CHALLENGES_BY_LAB } from '../sims/challenges.ts';
import type { ProblemAttemptRecord, ResponseRecord } from './db.ts';
import { completedSectionIds, nextStep, suggestDeepTask } from './progress.ts';

const at = new Date('2026-03-10T12:00:00Z');

function response(kind: ResponseRecord['kind'], refId: string, complete = true): [string, ResponseRecord] {
  return [
    `${kind}:${refId}`,
    { key: `ch04:${kind}:${refId}`, chapterId: 'ch04', kind, refId, text: '', covered: [], choice: 'lsm', updatedAt: at, completedAt: complete ? at : null },
  ];
}

const allSections = chapter4.sections.map((s) => response('checkpoint', s.id));
const allChallenges = new Set(Object.values(CHALLENGES_BY_LAB).flat().map((c) => c.id));

describe('nextStep', () => {
  it('starts with the pretest', () => {
    expect(nextStep(chapter4, new Map(), new Set())?.href).toBe('/chapters/ch04/pretest');
  });

  it('then points at the first section without a checkpoint', () => {
    const responses = new Map([response('pretest', chapter4.pretest[0].id), response('checkpoint', chapter4.sections[0].id)]);
    expect(nextStep(chapter4, responses, new Set())?.href).toBe(`/chapters/ch04/sections/${chapter4.sections[1].id}`);
  });

  it('then labs, synthesis, scenarios, and finally nothing', () => {
    const base = new Map([response('pretest', chapter4.pretest[0].id), ...allSections]);
    expect(nextStep(chapter4, base, new Set())?.href).toMatch(/^\/labs\//);
    expect(nextStep(chapter4, base, allChallenges)?.href).toBe('/chapters/ch04/synthesis');

    const synthesised = new Map([
      ...base,
      ...chapter4.tradeoffs.flatMap((m) => m.rows.map((r) => response('tradeoff', `${m.id}.${r.id}`))),
      ...chapter4.teachBack.map((t) => response('teachback', t.id)),
    ]);
    expect(nextStep(chapter4, synthesised, allChallenges)?.href).toBe('/chapters/ch04/scenarios');

    const finished = new Map([...synthesised, ...chapter4.scenarios.map((s) => response('scenario', s.id))]);
    expect(nextStep(chapter4, finished, allChallenges)).toBeNull();
  });
});

describe('completedSectionIds', () => {
  it('ignores incomplete checkpoints', () => {
    const responses = new Map([response('checkpoint', 'btrees'), response('checkpoint', 'columnar', false)]);
    expect(completedSectionIds(chapter4, responses)).toEqual(['btrees']);
  });
});

describe('suggestDeepTask', () => {
  it('suggests nothing before any section is read', () => {
    expect(suggestDeepTask(chapter4, new Map(), new Set())).toBeNull();
  });

  it('prefers an unfinished lab challenge for a read section', () => {
    const responses = new Map([response('checkpoint', 'btrees')]);
    expect(suggestDeepTask(chapter4, responses, new Set())?.href).toBe('/labs/btree');
  });

  it('falls back to teach-back once labs are done', () => {
    const responses = new Map([response('checkpoint', 'btrees')]);
    expect(suggestDeepTask(chapter4, responses, allChallenges)?.href).toBe('/chapters/ch04/synthesis');
  });

  it('suggests a scenario when its sections are read and teach-backs are done', () => {
    const responses = new Map([...allSections, ...chapter4.teachBack.map((t) => response('teachback', t.id))]);
    expect(suggestDeepTask(chapter4, responses, allChallenges)?.href).toBe('/chapters/ch04/scenarios');
  });

  it('puts missed challenges from an earlier day first, but not ones missed today', () => {
    const missed = problemsFor('ch04').filter((p) => p.sectionId === 'btrees').slice(0, 2);
    const attempt = (problemId: string, updatedAt: Date): [string, ProblemAttemptRecord] => [
      problemId,
      { problemId, chapterId: 'ch04', sectionId: 'btrees', answer: '{}', correct: false, confidence: 3, firstCorrect: false, attempts: 1, firstAt: updatedAt, updatedAt },
    ];
    const yesterday = new Date(at.getTime() - 86_400_000);
    const responses = new Map([response('checkpoint', 'btrees')]);
    const task = suggestDeepTask(chapter4, responses, new Set(), { problems: missed, attempts: new Map(missed.map((p) => attempt(p.id, yesterday))) }, at);
    expect(task).toMatchObject({ title: 'Retry 2 missed challenges', href: '/chapters/ch04/sections/btrees' });
    const today = new Map(missed.map((p) => attempt(p.id, at)));
    expect(suggestDeepTask(chapter4, responses, new Set(), { problems: missed, attempts: today }, at)?.href).toBe('/labs/btree');
  });
});
