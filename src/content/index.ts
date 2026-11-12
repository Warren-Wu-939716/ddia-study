import { chapter4 } from './ch04/index.ts';
import { chapter12 } from './ch12/index.ts';
import type { Chapter, LabId, StudyCard } from './types.ts';

/** 2nd-edition table of contents. Add a chapter by creating src/content/chNN and registering it here. */
export const BOOK_CHAPTERS: readonly { number: number; title: string }[] = [
  { number: 1, title: 'Trade-Offs in Data Systems Architecture' },
  { number: 2, title: 'Defining Nonfunctional Requirements' },
  { number: 3, title: 'Data Models and Query Languages' },
  { number: 4, title: 'Storage and Retrieval' },
  { number: 5, title: 'Encoding and Evolution' },
  { number: 6, title: 'Replication' },
  { number: 7, title: 'Sharding' },
  { number: 8, title: 'Transactions' },
  { number: 9, title: 'The Trouble with Distributed Systems' },
  { number: 10, title: 'Consistency and Consensus' },
  { number: 11, title: 'Batch Processing' },
  { number: 12, title: 'Stream Processing' },
  { number: 13, title: 'A Philosophy of Streaming Systems' },
  { number: 14, title: 'Doing the Right Thing' },
];

export const CHAPTERS: readonly Chapter[] = [chapter4, chapter12];

export function getChapter(id: string | undefined): Chapter | undefined {
  return CHAPTERS.find((c) => c.id === id);
}

export function chapterByNumber(number: number): Chapter | undefined {
  return CHAPTERS.find((c) => c.number === number);
}

export const CONTENT_CARDS: readonly StudyCard[] = CHAPTERS.flatMap((c) => c.cards);

const contentCardIndex = new Map(CONTENT_CARDS.map((c) => [c.id, c]));

/** Looks up a card among built-in content and (optionally) your custom cards. */
export function findCard(id: string, custom: readonly StudyCard[] = []): StudyCard | undefined {
  return contentCardIndex.get(id) ?? custom.find((c) => c.id === id);
}

export interface LabInfo {
  id: LabId;
  title: string;
  sectionId: string;
  chapterId: string;
  blurb: string;
}

export const LABS: readonly LabInfo[] = [
  {
    id: 'lsm',
    title: 'LSM-tree simulator',
    sectionId: 'log-structured',
    chapterId: 'ch04',
    blurb: 'Write, delete and read keys; watch the WAL, memtable flushes, Bloom filters and size-tiered compaction.',
  },
  {
    id: 'bloom',
    title: 'Bloom filter lab',
    sectionId: 'log-structured',
    chapterId: 'ch04',
    blurb: 'Tune bits and hash functions, probe keys, and measure false positives against the theory.',
  },
  {
    id: 'btree',
    title: 'B-tree simulator',
    sectionId: 'btrees',
    chapterId: 'ch04',
    blurb: 'Insert keys into fixed-size pages, watch splits cascade to a new root, and count pages read and written.',
  },
  {
    id: 'columnar',
    title: 'Column store lab',
    sectionId: 'columnar',
    chapterId: 'ch04',
    blurb: 'Compare bytes scanned, sort rows to create runs, and evaluate filters with bitmap AND/OR.',
  },
  {
    id: 'broker',
    title: 'Log-based broker lab',
    sectionId: 'log-brokers',
    chapterId: 'ch12',
    blurb: 'Produce keyed messages into partitions, run consumer groups, crash consumers between commits, and watch duplicates, retention and replay.',
  },
];

export function getLab(id: string | undefined): LabInfo | undefined {
  return LABS.find((l) => l.id === id);
}
