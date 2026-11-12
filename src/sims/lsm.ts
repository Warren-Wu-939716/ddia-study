import { bloomFromKeys, bloomMightContain, type BloomFilter } from './bloom.ts';

/** A key-value pair; a null value is a tombstone (deletion marker). */
export interface LsmEntry {
  key: string;
  value: string | null;
}

export interface Segment {
  id: number;
  /** 0 for memtable flushes; merging N tier-t segments produces one tier t+1 segment. */
  tier: number;
  entries: LsmEntry[];
  bloom: BloomFilter;
  origin: 'flush' | 'compaction';
}

export interface LsmConfig {
  /** The memtable is flushed once it holds this many keys. */
  memtableLimit: number;
  /** Size-tiered: merge when this many same-tier segments pile up. */
  tierThreshold: number;
  bloomBits: number;
  bloomHashes: number;
  autoCompact: boolean;
}

export interface LsmStats {
  logicalWrites: number;
  walWrites: number;
  flushWrites: number;
  compactionWrites: number;
  flushes: number;
  compactions: number;
}

export interface LsmState {
  config: LsmConfig;
  wal: LsmEntry[];
  memtable: LsmEntry[];
  /** Newest first, which is also the order reads search them. */
  segments: Segment[];
  nextSegmentId: number;
  stats: LsmStats;
  events: string[];
}

export type LsmOp =
  | { type: 'put'; key: string; value: string }
  | { type: 'delete'; key: string }
  | { type: 'flush' }
  | { type: 'compact' };

export const DEFAULT_LSM_CONFIG: LsmConfig = {
  memtableLimit: 4,
  tierThreshold: 3,
  bloomBits: 16,
  bloomHashes: 2,
  autoCompact: true,
};

const EMPTY_STATS: LsmStats = {
  logicalWrites: 0,
  walWrites: 0,
  flushWrites: 0,
  compactionWrites: 0,
  flushes: 0,
  compactions: 0,
};

export function createLsm(config: LsmConfig = DEFAULT_LSM_CONFIG): LsmState {
  return { config, wal: [], memtable: [], segments: [], nextSegmentId: 1, stats: EMPTY_STATS, events: [] };
}

/** Byte-order comparison, so ordering never depends on the browser's locale. */
export function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Binary search over key-sorted entries. */
export function findEntry(entries: readonly LsmEntry[], key: string): LsmEntry | undefined {
  let lo = 0;
  let hi = entries.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cmp = compareKeys(entries[mid].key, key);
    if (cmp === 0) return entries[mid];
    if (cmp < 0) lo = mid + 1;
    else hi = mid - 1;
  }
  return undefined;
}

/** Memtable insert: keeps keys sorted and overwrites an existing key in place. */
export function upsertSorted(entries: readonly LsmEntry[], entry: LsmEntry): LsmEntry[] {
  const out = entries.filter((e) => e.key !== entry.key);
  const index = out.findIndex((e) => compareKeys(e.key, entry.key) > 0);
  out.splice(index === -1 ? out.length : index, 0, entry);
  return out;
}

/**
 * k-way merge of sorted runs (newest first), like the merge step of mergesort.
 * When a key appears in several inputs, the newest value wins. Tombstones are
 * dropped only when the output becomes the oldest data (nothing older to shadow).
 */
export function mergeRuns(runsNewestFirst: readonly (readonly LsmEntry[])[], dropTombstones: boolean): LsmEntry[] {
  const cursors = runsNewestFirst.map(() => 0);
  const out: LsmEntry[] = [];
  for (;;) {
    let minKey: string | null = null;
    for (let r = 0; r < runsNewestFirst.length; r++) {
      const entry = runsNewestFirst[r][cursors[r]];
      if (entry && (minKey === null || compareKeys(entry.key, minKey) < 0)) minKey = entry.key;
    }
    if (minKey === null) return out;
    let winner: LsmEntry | null = null;
    for (let r = 0; r < runsNewestFirst.length; r++) {
      const entry = runsNewestFirst[r][cursors[r]];
      if (entry && entry.key === minKey) {
        winner ??= entry;
        cursors[r]++;
      }
    }
    if (winner && !(dropTombstones && winner.value === null)) out.push(winner);
  }
}

export interface MergeCandidate {
  run: number;
  entry: LsmEntry;
}

export interface MergeStep {
  key: string;
  /** Cursor position in each run before this step. */
  cursors: number[];
  /** Every run whose current head has this key; the first is the newest and wins. */
  candidates: MergeCandidate[];
  /** True when the winner is a tombstone that is discarded. */
  dropped: boolean;
}

/** The merge from mergeRuns(), recorded one output key at a time. */
export function mergeTrace(runsNewestFirst: readonly (readonly LsmEntry[])[], dropTombstones: boolean): MergeStep[] {
  const cursors = runsNewestFirst.map(() => 0);
  const steps: MergeStep[] = [];
  for (;;) {
    let key: string | null = null;
    for (let r = 0; r < runsNewestFirst.length; r++) {
      const head = runsNewestFirst[r][cursors[r]];
      if (head && (key === null || compareKeys(head.key, key) < 0)) key = head.key;
    }
    if (key === null) return steps;
    const before = [...cursors];
    const candidates: MergeCandidate[] = [];
    for (let r = 0; r < runsNewestFirst.length; r++) {
      const head = runsNewestFirst[r][cursors[r]];
      if (head && head.key === key) {
        candidates.push({ run: r, entry: head });
        cursors[r]++;
      }
    }
    steps.push({ key, cursors: before, candidates, dropped: dropTombstones && candidates[0].entry.value === null });
  }
}

export function mergeOutput(steps: readonly MergeStep[]): LsmEntry[] {
  return steps.filter((s) => !s.dropped).map((s) => s.candidates[0].entry);
}

function makeSegment(state: LsmState, entries: LsmEntry[], tier: number, origin: Segment['origin']): Segment {
  const { bloomBits, bloomHashes } = state.config;
  return {
    id: state.nextSegmentId,
    tier,
    entries,
    bloom: bloomFromKeys(entries.map((e) => e.key), bloomBits, bloomHashes),
    origin,
  };
}

function log(state: LsmState, message: string): string[] {
  return [...state.events, message].slice(-12);
}

export interface TierCompaction {
  state: LsmState;
  inputs: Segment[];
  output: Segment;
  droppedTombstones: boolean;
}

/** Size-tiered policy, one round: if the newest run of same-tier segments reaches the threshold, merge it. */
export function compactTierOnce(state: LsmState): TierCompaction | null {
  const { segments } = state;
  if (segments.length === 0) return null;
  const tier = segments[0].tier;
  let run = 0;
  while (run < segments.length && segments[run].tier === tier) run++;
  if (run < state.config.tierThreshold) return null;
  const inputs = segments.slice(0, run);
  const becomesOldest = run === segments.length;
  const merged = mergeRuns(inputs.map((s) => s.entries), becomesOldest);
  const droppedTombstones = becomesOldest && inputs.some((s) => s.entries.some((e) => e.value === null));
  const output = makeSegment(state, merged, tier + 1, 'compaction');
  return {
    inputs,
    output,
    droppedTombstones,
    state: {
      ...state,
      segments: [output, ...segments.slice(run)],
      nextSegmentId: state.nextSegmentId + 1,
      stats: {
        ...state.stats,
        compactionWrites: state.stats.compactionWrites + merged.length,
        compactions: state.stats.compactions + 1,
      },
      events: log(
        state,
        `Compacted ${inputs.map((s) => `#${s.id}`).join(', ')} → #${output.id} (${merged.length} keys${droppedTombstones ? ', tombstones dropped' : ''})`,
      ),
    },
  };
}

/** Write the memtable out as a new SSTable and truncate the WAL — without any compaction. */
export function flushMemtable(state: LsmState): LsmState {
  if (state.memtable.length === 0) return { ...state, events: log(state, 'Memtable is empty — nothing to flush') };
  const segment = makeSegment(state, state.memtable, 0, 'flush');
  return {
    ...state,
    wal: [],
    memtable: [],
    segments: [segment, ...state.segments],
    nextSegmentId: state.nextSegmentId + 1,
    stats: { ...state.stats, flushWrites: state.stats.flushWrites + segment.entries.length, flushes: state.stats.flushes + 1 },
    events: log(state, `Flushed memtable → SSTable #${segment.id} (${segment.entries.length} keys); WAL truncated`),
  };
}

function flush(state: LsmState): LsmState {
  let next = flushMemtable(state);
  if (state.memtable.length === 0 || !state.config.autoCompact) return next;
  for (let round = compactTierOnce(next); round; round = compactTierOnce(next)) next = round.state;
  return next;
}

/** Major compaction: merge every segment into one, dropping overwritten values and tombstones. */
export function compactAll(state: LsmState): LsmState {
  const hasTombstones = state.segments.some((s) => s.entries.some((e) => e.value === null));
  if (state.segments.length < 2 && !hasTombstones) {
    return { ...state, events: log(state, 'Need at least two segments (or a tombstone) to compact') };
  }
  const merged = mergeRuns(state.segments.map((s) => s.entries), true);
  const tier = Math.max(...state.segments.map((s) => s.tier)) + 1;
  const segment = makeSegment(state, merged, tier, 'compaction');
  return {
    ...state,
    segments: [segment],
    nextSegmentId: state.nextSegmentId + 1,
    stats: {
      ...state.stats,
      compactionWrites: state.stats.compactionWrites + merged.length,
      compactions: state.stats.compactions + 1,
    },
    events: log(state, `Major compaction → #${segment.id} (${merged.length} live keys)`),
  };
}

/** Step 1 of every write: append the record to the write-ahead log. */
export function appendWal(state: LsmState, entry: LsmEntry): LsmState {
  return {
    ...state,
    wal: [...state.wal, entry],
    stats: { ...state.stats, logicalWrites: state.stats.logicalWrites + 1, walWrites: state.stats.walWrites + 1 },
  };
}

/** Step 2 of every write: insert (or replace) the key in the sorted memtable. */
export function insertMemtable(state: LsmState, entry: LsmEntry): LsmState {
  return { ...state, memtable: upsertSorted(state.memtable, entry) };
}

export function entryFor(op: Extract<LsmOp, { type: 'put' | 'delete' }>): LsmEntry {
  return { key: op.key, value: op.type === 'put' ? op.value : null };
}

export function applyOp(state: LsmState, op: LsmOp): LsmState {
  switch (op.type) {
    case 'put':
    case 'delete': {
      const entry = entryFor(op);
      const next: LsmState = {
        ...insertMemtable(appendWal(state, entry), entry),
        events: log(state, op.type === 'put' ? `put ${op.key}=${op.value}` : `delete ${op.key} (tombstone)`),
      };
      return next.memtable.length >= state.config.memtableLimit ? flush(next) : next;
    }
    case 'flush':
      return flush(state);
    case 'compact':
      return compactAll(state);
  }
}

export function runOps(config: LsmConfig, ops: readonly LsmOp[]): LsmState {
  return ops.reduce(applyOp, createLsm(config));
}

export type StepOutcome = 'hit' | 'miss' | 'bloom-skip' | 'false-positive';

export interface LookupStep {
  source: 'memtable' | 'segment';
  segmentId?: number;
  outcome: StepOutcome;
}

export interface LookupResult {
  key: string;
  found: boolean;
  deleted: boolean;
  value: string | null;
  steps: LookupStep[];
  /** Segments whose blocks had to be read (Bloom filter said "maybe"). */
  segmentsRead: number;
}

/** Read path: memtable, then segments newest → oldest, skipping any whose Bloom filter rules the key out. */
export function lookup(state: LsmState, key: string): LookupResult {
  const steps: LookupStep[] = [];
  const result = (entry: LsmEntry | undefined, segmentsRead: number): LookupResult => ({
    key,
    found: entry !== undefined && entry.value !== null,
    deleted: entry?.value === null,
    value: entry?.value ?? null,
    steps,
    segmentsRead,
  });

  const inMemtable = findEntry(state.memtable, key);
  steps.push({ source: 'memtable', outcome: inMemtable ? 'hit' : 'miss' });
  if (inMemtable) return result(inMemtable, 0);

  let segmentsRead = 0;
  for (const segment of state.segments) {
    if (!bloomMightContain(segment.bloom, key)) {
      steps.push({ source: 'segment', segmentId: segment.id, outcome: 'bloom-skip' });
      continue;
    }
    segmentsRead++;
    const entry = findEntry(segment.entries, key);
    if (entry) {
      steps.push({ source: 'segment', segmentId: segment.id, outcome: 'hit' });
      return result(entry, segmentsRead);
    }
    steps.push({ source: 'segment', segmentId: segment.id, outcome: 'false-positive' });
  }
  return result(undefined, segmentsRead);
}

/** Bytes physically written ÷ bytes the application asked to write (counted in entries here). */
export function writeAmplification(stats: LsmStats): number {
  if (stats.logicalWrites === 0) return 0;
  return (stats.walWrites + stats.flushWrites + stats.compactionWrites) / stats.logicalWrites;
}

/** Total entries on disk, including stale versions and tombstones awaiting compaction. */
export function diskEntries(state: LsmState): number {
  return state.segments.reduce((sum, s) => sum + s.entries.length, 0);
}

/** Number of distinct live keys across memtable and segments. */
export function liveKeyCount(state: LsmState): number {
  const merged = mergeRuns([state.memtable, ...state.segments.map((s) => s.entries)], true);
  return merged.length;
}
