import type { Chapter } from '../types.ts';
import { cards } from './cards.ts';
import { concepts } from './concepts.ts';
import { pretest, scenarios, teachBack, tradeoffs } from './exercises.ts';
import { analyticsLessons } from './lessons-analytics.ts';
import { oltpLessons } from './lessons-oltp.ts';
import { sections } from './sections.ts';

export const chapter4: Chapter = {
  id: 'ch04',
  number: 4,
  title: 'Storage and Retrieval',
  pages: '115–151',
  overview:
    'How a database physically stores data and finds it again. Two families of OLTP engines — log-structured (LSM) and update-in-place (B-trees) — then column-oriented storage for analytics, and finally indexes for multidimensional, full-text and semantic (vector) search.',
  goals: [
    'Trace writes and reads through an LSM engine and a B-tree, including crash recovery',
    'Predict which engine suits a workload, using read cost, write amplification and disk-space arguments',
    'Explain why analytics systems store data by column, and how compression and sort order help',
    'Pick the right index for multi-column, geospatial, full-text and semantic queries',
  ],
  sections,
  lessons: [...oltpLessons, ...analyticsLessons],
  concepts,
  cards: cards.map((card) => ({ ...card, chapterId: 'ch04' })),
  pretest,
  teachBack,
  scenarios,
  tradeoffs,
  labs: ['lsm', 'bloom', 'btree', 'columnar'],
};
