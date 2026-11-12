import { LABS } from '../content/index.ts';
import type { Chapter, Problem } from '../content/types.ts';
import type { ProblemAttemptRecord, ResponseRecord } from './db.ts';
import { dueRetries } from './problems.ts';
import { CHALLENGES_BY_LAB } from '../sims/challenges.ts';

export interface StepLink {
  title: string;
  detail: string;
  href: string;
}

type Responses = ReadonlyMap<string, ResponseRecord>;

const has = (responses: Responses, kind: string, refId: string) => responses.has(`${kind}:${refId}`);
const isComplete = (responses: Responses, kind: string, refId: string) => Boolean(responses.get(`${kind}:${refId}`)?.completedAt);

export function completedSectionIds(chapter: Chapter, responses: Responses): string[] {
  return chapter.sections.filter((s) => isComplete(responses, 'checkpoint', s.id)).map((s) => s.id);
}

/** The single most useful next thing to do in a chapter's study path. */
export function nextStep(chapter: Chapter, responses: Responses, doneChallenges: ReadonlySet<string>): StepLink | null {
  const base = `/chapters/${chapter.id}`;
  if (!chapter.pretest.some((q) => has(responses, 'pretest', q.id))) {
    return { title: 'Take the pretest', detail: `Guess answers before reading chapter ${chapter.number}.`, href: `${base}/pretest` };
  }
  const section = chapter.sections.find((s) => !isComplete(responses, 'checkpoint', s.id));
  if (section) {
    const hasLesson = chapter.lessons.some((l) => l.sectionId === section.id);
    return {
      title: `${hasLesson ? 'Learn' : 'Read'}: ${section.title}`,
      detail: hasLesson ? 'Work through the lesson, take its challenges, then write the checkpoint from memory.' : `pp. ${section.pages}, then write the checkpoint from memory.`,
      href: `${base}/sections/${section.id}`,
    };
  }
  const lab = LABS.find((l) => l.chapterId === chapter.id && CHALLENGES_BY_LAB[l.id].some((c) => !doneChallenges.has(c.id)));
  if (lab) return { title: lab.title, detail: 'Finish the predict-then-run challenges.', href: `/labs/${lab.id}` };
  const tradeoffsDone = chapter.tradeoffs.every((m) => m.rows.every((r) => has(responses, 'tradeoff', `${m.id}.${r.id}`)));
  const teachDone = chapter.teachBack.every((t) => isComplete(responses, 'teachback', t.id));
  if (!tradeoffsDone || !teachDone) return { title: 'Synthesis', detail: 'Fill the trade-off matrices and teach it back.', href: `${base}/synthesis` };
  if (!chapter.scenarios.every((s) => isComplete(responses, 'scenario', s.id))) {
    return { title: 'Design scenarios', detail: 'Apply the chapter to realistic systems.', href: `${base}/scenarios` };
  }
  return null;
}

/**
 * One "deep" task for the end of a review session: a lab challenge, teach-back or scenario
 * whose sections you've already read and that you haven't completed yet.
 */
export interface RetryInput {
  problems: readonly Problem[];
  attempts: ReadonlyMap<string, ProblemAttemptRecord>;
}

export function suggestDeepTask(
  chapter: Chapter,
  responses: Responses,
  doneChallenges: ReadonlySet<string>,
  retry: RetryInput = { problems: [], attempts: new Map() },
  now = new Date(),
): StepLink | null {
  const retries = dueRetries(retry.problems, retry.attempts, now);
  const retrySection = chapter.sections.find((s) => retries.some((p) => p.sectionId === s.id));
  if (retrySection) {
    const count = retries.filter((p) => p.sectionId === retrySection.id).length;
    return {
      title: `Retry ${count} missed challenge${count === 1 ? '' : 's'}`,
      detail: `${retrySection.title} — a day later, can you get ${count === 1 ? 'it' : 'them'} right, and be sure of it?`,
      href: `/chapters/${chapter.id}/sections/${retrySection.id}`,
    };
  }
  const done = new Set(completedSectionIds(chapter, responses));
  if (done.size === 0) return null;
  for (const lab of LABS.filter((l) => l.chapterId === chapter.id && done.has(l.sectionId))) {
    const challenge = CHALLENGES_BY_LAB[lab.id].find((c) => !doneChallenges.has(c.id));
    if (challenge) return { title: challenge.title, detail: `${lab.title} — predict, then run.`, href: `/labs/${lab.id}` };
  }
  const teach = chapter.teachBack.find((t) => t.sectionIds.every((s) => done.has(s)) && !isComplete(responses, 'teachback', t.id));
  if (teach) return { title: 'Teach it back', detail: teach.prompt, href: `/chapters/${chapter.id}/synthesis` };
  const scenario = chapter.scenarios.find((s) => s.sectionIds.every((id) => done.has(id)) && !isComplete(responses, 'scenario', s.id));
  if (scenario) return { title: `Scenario: ${scenario.title}`, detail: scenario.brief, href: `/chapters/${chapter.id}/scenarios` };
  return null;
}
