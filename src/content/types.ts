/**
 * Content model for a chapter. All prose is written as original study notes —
 * never copy the book's text here; reference printed page numbers instead.
 */

export type CardKind = 'recall' | 'explain' | 'compare' | 'failure' | 'scenario' | 'choice';

interface CardBase {
  id: string;
  chapterId: string;
  sectionId: string;
  conceptIds: string[];
  prompt: string;
}

/** Answered in your own words, then self-graded against key points. */
export interface FreeTextCard extends CardBase {
  kind: Exclude<CardKind, 'choice'>;
  answer: string;
  keyPoints: string[];
}

export interface ChoiceOption {
  text: string;
  correct?: boolean;
  why?: string;
}

/** Multiple choice with exactly one correct option. */
export interface ChoiceCard extends CardBase {
  kind: 'choice';
  options: ChoiceOption[];
  explanation: string;
}

export type StudyCard = FreeTextCard | ChoiceCard;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Card as authored inside a chapter file; chapterId is filled in on assembly. */
export type CardDraft = DistributiveOmit<StudyCard, 'chapterId'>;

export interface Concept {
  id: string;
  name: string;
  sectionId: string;
  summary: string;
  /** Concept ids (same chapter) that should be understood first. */
  prerequisites: string[];
}

export interface Section {
  id: string;
  title: string;
  /** Printed page range in the book, e.g. "118–125". */
  pages: string;
  /** Book headings covered, so you know exactly what to read. */
  headings: string[];
  checkpoint: {
    prompt: string;
    keyPoints: string[];
  };
}

export interface PretestQuestion {
  id: string;
  sectionId: string;
  prompt: string;
  answer: string;
}

export interface TeachBackPrompt {
  id: string;
  prompt: string;
  sectionIds: string[];
  keyPoints: string[];
}

export interface Scenario {
  id: string;
  title: string;
  brief: string;
  requirements: string[];
  questions: string[];
  keyPoints: string[];
  sectionIds: string[];
}

export interface TradeoffRow {
  id: string;
  dimension: string;
  /** Column id that generally wins, or 'depends'. */
  answer: string;
  why: string;
}

export interface TradeoffMatrix {
  id: string;
  title: string;
  columns: { id: string; label: string }[];
  rows: TradeoffRow[];
}

export type LabId = 'lsm' | 'btree' | 'bloom' | 'columnar' | 'broker';

/** The kind of thinking an end-of-lesson problem asks for (never plain recall). */
export type ProblemSkill = 'predict' | 'diagnose' | 'design' | 'calculate' | 'explain' | 'sequence';

interface ProblemBase {
  id: string;
  sectionId: string;
  skill: ProblemSkill;
  prompt: string;
  /** Optional fixed-width figure (a log, table or timeline) shown under the prompt. */
  figure?: string;
  /** Worked reasoning shown after answering. */
  explanation: string;
}

/** Exactly one correct option; every option says why it is right or wrong. */
export interface ChoiceProblem extends ProblemBase {
  kind: 'choice';
  options: ChoiceOption[];
}

/** Select all that apply; only the exact set counts as correct. */
export interface MultiProblem extends ProblemBase {
  kind: 'multi';
  options: ChoiceOption[];
}

/** Steps authored in the correct order and shown shuffled. */
export interface OrderProblem extends ProblemBase {
  kind: 'order';
  steps: string[];
}

export interface NumericProblem extends ProblemBase {
  kind: 'numeric';
  answer: number;
  /** Accepted absolute difference from the answer (default 0). */
  tolerance?: number;
  unit?: string;
}

/** Pick a decision and the reason that justifies it; both must be right. */
export interface JustifyProblem extends ProblemBase {
  kind: 'justify';
  options: ChoiceOption[];
  reasons: ChoiceOption[];
}

/** Written answer, self-graded against key points; `explanation` is the model answer. */
export interface ExplainProblem extends ProblemBase {
  kind: 'explain';
  keyPoints: string[];
}

export type Problem = ChoiceProblem | MultiProblem | OrderProblem | NumericProblem | JustifyProblem | ExplainProblem;

/** Interactive widgets that can be embedded in a lesson (see src/widgets/registry.ts). */
export type WidgetId =
  | 'append-log'
  | 'hash-index'
  | 'sparse-index'
  | 'lsm-mini'
  | 'merge'
  | 'bloom-mini'
  | 'btree-mini'
  | 'wal-crash'
  | 'ssd-gc'
  | 'write-amp'
  | 'index-hops'
  | 'row-column'
  | 'bitmap'
  | 'data-cube'
  | 'phone-book'
  | 'map-range'
  | 'inverted-index'
  | 'fuzzy'
  | 'vector-search'
  // Chapter 12
  | 'fanout'
  | 'redelivery'
  | 'broker-mini'
  | 'dual-writes'
  | 'log-compaction'
  | 'event-log'
  | 'event-time'
  | 'windows'
  | 'stream-joins'
  | 'exactly-once'
  | 'batch-vs-stream'
  | 'pubsub'
  | 'polling'
  | 'overload'
  | 'direct-vs-broker'
  | 'partition-order'
  | 'hol-blocking'
  | 'retention'
  | 'cdc-snapshot'
  | 'outbox'
  | 'ledger'
  | 'crypto-shredding'
  | 'async-view'
  | 'cep'
  | 'stream-search'
  | 'stream-analytics'
  | 'ivm'
  | 'two-clocks'
  | 'stragglers'
  | 'clock-skew'
  | 'versioned-join'
  | 'checkpoint'
  | 'state-recovery'
  | 'fencing';

/** Building blocks of a lesson; prose fields support the RichText subset (lists, `code`, **bold**). */
export type LessonBlock =
  | { kind: 'text'; title?: string; body: string }
  | { kind: 'steps'; title: string; steps: string[] }
  | { kind: 'diagram'; title: string; art: string; caption?: string }
  | { kind: 'table'; title: string; head: string[]; rows: string[][] }
  | { kind: 'analogy'; body: string }
  | { kind: 'pitfall'; body: string }
  | { kind: 'check'; question: string; answer: string }
  | { kind: 'try'; labId: LabId; body: string }
  | { kind: 'widget'; widget: WidgetId; title: string; body?: string };

/** Self-contained explanation of a section, so the book is optional. */
export interface Lesson {
  sectionId: string;
  intro: string;
  blocks: LessonBlock[];
  takeaways: string[];
}

export interface Chapter {
  id: string;
  number: number;
  title: string;
  pages: string;
  overview: string;
  goals: string[];
  sections: Section[];
  lessons: Lesson[];
  concepts: Concept[];
  cards: StudyCard[];
  pretest: PretestQuestion[];
  teachBack: TeachBackPrompt[];
  scenarios: Scenario[];
  tradeoffs: TradeoffMatrix[];
  labs: LabId[];
}
