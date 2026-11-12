import type { DocVector, Vec } from './search.ts';

/** Toy 2-D "embeddings" grouped by topic. Real embeddings have hundreds to thousands of dimensions. */
export const TOPICS = ['cooking', 'fitness', 'databases', 'travel'] as const;

export const DOC_VECTORS: (DocVector & { topic: (typeof TOPICS)[number] })[] = [
  { id: 'pasta', label: 'pasta recipes', topic: 'cooking', x: 0.8, y: 0.3 },
  { id: 'bread', label: 'baking bread', topic: 'cooking', x: 0.7, y: 0.12 },
  { id: 'sauce', label: 'tomato sauce', topic: 'cooking', x: 0.88, y: 0.18 },
  { id: 'knife', label: 'knife skills', topic: 'cooking', x: 0.6, y: 0.25 },
  { id: 'mealprep', label: 'meal prep', topic: 'cooking', x: 0.55, y: 0.5 },
  { id: 'running', label: 'running plans', topic: 'fitness', x: -0.15, y: 0.85 },
  { id: 'strength', label: 'strength training', topic: 'fitness', x: -0.05, y: 0.7 },
  { id: 'stretch', label: 'stretching', topic: 'fitness', x: -0.25, y: 0.65 },
  { id: 'protein', label: 'protein intake', topic: 'fitness', x: 0.28, y: 0.68 },
  { id: 'btree', label: 'B-tree indexes', topic: 'databases', x: -0.8, y: -0.25 },
  { id: 'joins', label: 'SQL joins', topic: 'databases', x: -0.7, y: -0.4 },
  { id: 'lsm', label: 'LSM compaction', topic: 'databases', x: -0.9, y: -0.1 },
  { id: 'plans', label: 'query plans', topic: 'databases', x: -0.6, y: -0.2 },
  { id: 'replication', label: 'replication', topic: 'databases', x: -0.75, y: -0.55 },
  { id: 'flights', label: 'cheap flights', topic: 'travel', x: 0.25, y: -0.85 },
  { id: 'packing', label: 'packing tips', topic: 'travel', x: 0.15, y: -0.65 },
  { id: 'visa', label: 'visa rules', topic: 'travel', x: 0.4, y: -0.7 },
  { id: 'hostels', label: 'hostels', topic: 'travel', x: 0.05, y: -0.8 },
];

/** One IVF centroid per topic: the mean of its documents. */
export const CENTROIDS: Vec[] = TOPICS.map((topic) => {
  const docs = DOC_VECTORS.filter((d) => d.topic === topic);
  return { x: docs.reduce((s, d) => s + d.x, 0) / docs.length, y: docs.reduce((s, d) => s + d.y, 0) / docs.length };
});

export const DEMO_QUERIES: { label: string; vec: Vec }[] = [
  { label: 'how do I cook spaghetti', vec: { x: 0.85, y: 0.32 } },
  { label: 'high-protein meals for runners', vec: { x: 0.4, y: 0.6 } },
  { label: 'make my SQL query faster', vec: { x: -0.65, y: -0.3 } },
  { label: 'weekend trip on a budget', vec: { x: 0.22, y: -0.78 } },
];
