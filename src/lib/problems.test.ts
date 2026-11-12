import { describe, expect, it } from 'vitest';
import type { ExplainProblem, MultiProblem, NumericProblem, OrderProblem, Problem } from '../content/types.ts';
import type { ProblemAttemptRecord } from './db.ts';
import { calibrationNote, dueRetries, gradeProblem, initialOrder, parseNumber, problemStatus, summarizeProblems } from './problems.ts';

const base = { sectionId: 's', skill: 'predict' as const, prompt: 'p', explanation: 'e' };
const choice: Problem = {
  ...base,
  id: 'c',
  kind: 'choice',
  options: [{ text: 'a' }, { text: 'b', correct: true }, { text: 'c' }],
};
const multi: MultiProblem = {
  ...base,
  id: 'm',
  kind: 'multi',
  options: [{ text: 'a', correct: true }, { text: 'b' }, { text: 'c', correct: true }, { text: 'd' }],
};
const order: OrderProblem = { ...base, id: 'o', kind: 'order', steps: ['one', 'two', 'three', 'four'] };
const numeric: NumericProblem = { ...base, id: 'n', kind: 'numeric', answer: 4.5, tolerance: 0.1 };
const explain: ExplainProblem = { ...base, id: 'x', kind: 'explain', keyPoints: ['a', 'b', 'c', 'd'] };

const attempt = (problemId: string, correct: boolean, confidence: 1 | 2 | 3, updatedAt = new Date('2026-01-01T12:00:00')): ProblemAttemptRecord => ({
  problemId,
  chapterId: 'ch',
  sectionId: 's',
  answer: '{}',
  correct,
  confidence,
  firstCorrect: correct,
  attempts: 1,
  firstAt: updatedAt,
  updatedAt,
});

describe('gradeProblem', () => {
  it('grades single choice and justify answers', () => {
    expect(gradeProblem(choice, { kind: 'choice', option: 1 })).toBe(true);
    expect(gradeProblem(choice, { kind: 'choice', option: 0 })).toBe(false);
    const justify: Problem = { ...base, id: 'j', kind: 'justify', options: [{ text: 'x', correct: true }, { text: 'y' }], reasons: [{ text: 'r' }, { text: 's', correct: true }] };
    expect(gradeProblem(justify, { kind: 'justify', option: 0, reason: 1 })).toBe(true);
    expect(gradeProblem(justify, { kind: 'justify', option: 0, reason: 0 })).toBe(false);
  });

  it('requires the exact set for multi-select', () => {
    expect(gradeProblem(multi, { kind: 'multi', options: [2, 0] })).toBe(true);
    expect(gradeProblem(multi, { kind: 'multi', options: [0] })).toBe(false);
    expect(gradeProblem(multi, { kind: 'multi', options: [0, 1, 2] })).toBe(false);
  });

  it('grades order, numbers within tolerance and self-graded explanations', () => {
    expect(gradeProblem(order, { kind: 'order', order: [0, 1, 2, 3] })).toBe(true);
    expect(gradeProblem(order, { kind: 'order', order: [1, 0, 2, 3] })).toBe(false);
    expect(gradeProblem(numeric, { kind: 'numeric', value: 4.55 })).toBe(true);
    expect(gradeProblem(numeric, { kind: 'numeric', value: 4.7 })).toBe(false);
    expect(gradeProblem(explain, { kind: 'explain', text: '', covered: [0, 1, 2] })).toBe(true);
    expect(gradeProblem(explain, { kind: 'explain', text: '', covered: [0, 1, 1, 9] })).toBe(false);
  });

  it('rejects an answer of the wrong kind', () => {
    expect(gradeProblem(choice, { kind: 'numeric', value: 1 })).toBe(false);
  });
});

describe('initialOrder', () => {
  it('is a stable permutation that is never already solved', () => {
    const first = initialOrder(order);
    expect([...first].sort()).toEqual([0, 1, 2, 3]);
    expect(first).not.toEqual([0, 1, 2, 3]);
    expect(initialOrder(order)).toEqual(first);
    for (let i = 0; i < 50; i++) expect(initialOrder({ ...order, id: `o${i}` })).not.toEqual([0, 1, 2, 3]);
  });
});

describe('parseNumber', () => {
  it.each([
    ['1,200', 1200],
    [' 1 200 ', 1200],
    ['12.5', 12.5],
    ['1e6', 1_000_000],
    ['25%', 25],
    ['-3', -3],
    ['.5', 0.5],
  ])('parses %s', (text, value) => {
    expect(parseNumber(text)).toBe(value);
  });

  it.each(['', 'abc', '1.2.3', '12 ms', '--1'])('rejects %j', (text) => {
    expect(parseNumber(text)).toBeNull();
  });
});

describe('status, summary and retries', () => {
  it('treats a correct guess as shaky', () => {
    expect(problemStatus()).toBe('new');
    expect(problemStatus({ correct: true, confidence: 1 })).toBe('shaky');
    expect(problemStatus({ correct: true, confidence: 2 })).toBe('mastered');
    expect(problemStatus({ correct: false, confidence: 3 })).toBe('missed');
  });

  it('summarizes first tries, current status and confident mistakes', () => {
    const attempts = new Map([
      ['c', attempt('c', true, 3)],
      ['m', attempt('m', false, 3)],
      ['o', { ...attempt('o', true, 1), firstCorrect: false }],
    ]);
    expect(summarizeProblems([choice, multi, order, numeric], attempts)).toEqual({
      total: 4,
      answered: 3,
      firstTry: 1,
      mastered: 1,
      shaky: 1,
      missed: 1,
      confidentlyWrong: 1,
    });
  });

  it('only offers retries from an earlier day', () => {
    const now = new Date('2026-01-02T09:00:00');
    const attempts = new Map([
      ['c', attempt('c', false, 2, new Date('2026-01-01T20:00:00'))],
      ['m', attempt('m', false, 2, new Date('2026-01-02T08:00:00'))],
      ['o', attempt('o', true, 3, new Date('2026-01-01T20:00:00'))],
    ]);
    expect(dueRetries([choice, multi, order], attempts, now).map((p) => p.id)).toEqual(['c']);
  });

  it('flags confident mistakes and lucky guesses', () => {
    expect(calibrationNote(false, 3)).toMatch(/certain/);
    expect(calibrationNote(true, 1)).toMatch(/guess/);
    expect(calibrationNote(true, 3)).toBeNull();
  });
});
