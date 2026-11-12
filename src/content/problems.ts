import { analyticsProblems } from './ch04/problems-analytics.ts';
import { oltpProblems } from './ch04/problems-oltp.ts';
import { messagingProblems } from './ch12/problems-messaging.ts';
import { processingProblems } from './ch12/problems-processing.ts';
import type { Problem } from './types.ts';

// Kept out of the chapter objects so this text only loads with the pages that use it.
const PROBLEMS: Record<string, readonly Problem[]> = {
  ch04: [...oltpProblems, ...analyticsProblems],
  ch12: [...messagingProblems, ...processingProblems],
};

/** End-of-lesson problems for a chapter, in lesson order. */
export const problemsFor = (chapterId: string): readonly Problem[] => PROBLEMS[chapterId] ?? [];
