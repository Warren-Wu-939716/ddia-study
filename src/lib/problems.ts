import type { ChoiceOption, OrderProblem, Problem } from '../content/types.ts';
import type { Confidence, ProblemAttemptRecord } from './db.ts';
import { hash32 } from './hash.ts';
import { createRng, shuffle } from './random.ts';

export type ProblemAnswer =
  | { kind: 'choice'; option: number }
  | { kind: 'multi'; options: number[] }
  | { kind: 'order'; order: number[] }
  | { kind: 'numeric'; value: number }
  | { kind: 'justify'; option: number; reason: number }
  | { kind: 'explain'; text: string; covered: number[] };

/** Share of key points a written answer must cover to count as correct. */
export const EXPLAIN_PASS = 2 / 3;

export const correctIndexes = (options: readonly ChoiceOption[]): number[] => options.flatMap((o, i) => (o.correct ? [i] : []));

export const explainPassMark = (keyPoints: number) => Math.ceil(keyPoints * EXPLAIN_PASS);

export function gradeProblem(problem: Problem, answer: ProblemAnswer): boolean {
  switch (answer.kind) {
    case 'choice':
      return problem.kind === 'choice' && Boolean(problem.options[answer.option]?.correct);
    case 'multi': {
      if (problem.kind !== 'multi') return false;
      const want = correctIndexes(problem.options);
      const got = [...new Set(answer.options)].sort((a, b) => a - b);
      return want.length === got.length && want.every((v, i) => v === got[i]);
    }
    case 'order':
      return problem.kind === 'order' && answer.order.length === problem.steps.length && answer.order.every((step, i) => step === i);
    case 'numeric':
      return problem.kind === 'numeric' && Math.abs(answer.value - problem.answer) <= (problem.tolerance ?? 0) + 1e-9;
    case 'justify':
      return problem.kind === 'justify' && Boolean(problem.options[answer.option]?.correct && problem.reasons[answer.reason]?.correct);
    case 'explain': {
      if (problem.kind !== 'explain') return false;
      const covered = new Set(answer.covered.filter((i) => i >= 0 && i < problem.keyPoints.length));
      return covered.size >= explainPassMark(problem.keyPoints.length);
    }
  }
}

/** A stable shuffle of the steps that is never already in the right order. */
export function initialOrder(problem: OrderProblem): number[] {
  const identity = problem.steps.map((_, i) => i);
  const order = shuffle(identity, createRng(hash32(problem.id)));
  return order.every((v, i) => v === i) ? [...order.slice(1), order[0]] : order;
}

/** Accepts "1,200", "1 200", "12.5", "1e6" and "25%"; returns null for anything else. */
export function parseNumber(text: string): number | null {
  const cleaned = text.trim().replace(/[\s,_]/g, '').replace(/%$/, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

export type ProblemStatus = 'new' | 'mastered' | 'shaky' | 'missed';

/** A correct answer that was a guess still counts as shaky, so it comes back for a retry. */
export function problemStatus(record?: Pick<ProblemAttemptRecord, 'correct' | 'confidence'>): ProblemStatus {
  if (!record) return 'new';
  if (!record.correct) return 'missed';
  return record.confidence === 1 ? 'shaky' : 'mastered';
}

export interface ProblemSummary {
  total: number;
  answered: number;
  firstTry: number;
  mastered: number;
  shaky: number;
  missed: number;
  confidentlyWrong: number;
}

export function summarizeProblems(problems: readonly Problem[], attempts: ReadonlyMap<string, ProblemAttemptRecord>): ProblemSummary {
  const summary: ProblemSummary = { total: problems.length, answered: 0, firstTry: 0, mastered: 0, shaky: 0, missed: 0, confidentlyWrong: 0 };
  for (const p of problems) {
    const record = attempts.get(p.id);
    const status = problemStatus(record);
    if (!record || status === 'new') continue;
    summary.answered++;
    if (record.firstCorrect) summary.firstTry++;
    summary[status]++;
    if (!record.correct && record.confidence === 3) summary.confidentlyWrong++;
  }
  return summary;
}

export const needsRetry = (problems: readonly Problem[], attempts: ReadonlyMap<string, ProblemAttemptRecord>): Problem[] =>
  problems.filter((p) => ['missed', 'shaky'].includes(problemStatus(attempts.get(p.id))));

/** Missed or shaky problems last tried before today, so retries are spaced rather than immediate. */
export function dueRetries(problems: readonly Problem[], attempts: ReadonlyMap<string, ProblemAttemptRecord>, now: Date): Problem[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return needsRetry(problems, attempts).filter((p) => attempts.get(p.id)!.updatedAt.getTime() < startOfToday);
}

export function calibrationNote(correct: boolean, confidence: Confidence): string | null {
  if (!correct && confidence === 3) return 'You were certain — and wrong. That gap is the most valuable thing to fix: work through the explanation, then retry this one on another day.';
  if (correct && confidence === 1) return 'Right, but it was a guess. It stays on your retry list until you can answer it with confidence.';
  if (!correct && confidence === 1) return 'You knew you were unsure — that’s good calibration. Read the explanation closely before moving on.';
  return null;
}
