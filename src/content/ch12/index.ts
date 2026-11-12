import type { Chapter } from '../types.ts';
import { cards } from './cards.ts';
import { concepts } from './concepts.ts';
import { pretest, scenarios, teachBack, tradeoffs } from './exercises.ts';
import { messagingLessons } from './lessons-messaging.ts';
import { processingLessons } from './lessons-processing.ts';
import { sections } from './sections.ts';

export const chapter12: Chapter = {
  id: 'ch12',
  number: 12,
  title: 'Stream Processing',
  pages: '487–531',
  overview:
    'Processing data continuously as it arrives. How events travel (direct messaging, traditional brokers, log-based brokers like Kafka), how databases and streams relate (change data capture, event sourcing, log compaction), and how stream processors handle time, windows, joins and failures.',
  goals: [
    'Choose between a traditional queue and a log-based broker, and reason about partitions, consumer offsets and replay',
    'Keep derived systems in sync with change data capture instead of dual writes',
    'Window events by event time and handle late arrivals',
    'Pick the right stream join and get effectively-once results with atomic commit or idempotent writes',
  ],
  sections,
  lessons: [...messagingLessons, ...processingLessons],
  concepts,
  cards: cards.map((card) => ({ ...card, chapterId: 'ch12' })),
  pretest,
  teachBack,
  scenarios,
  tradeoffs,
  labs: ['broker'],
};
