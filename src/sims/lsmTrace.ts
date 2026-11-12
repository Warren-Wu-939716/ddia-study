import type { StepFrame } from '../lib/steps.ts';
import { bloomPositions } from './bloom.ts';
import {
  appendWal,
  applyOp,
  compactTierOnce,
  entryFor,
  findEntry,
  flushMemtable,
  insertMemtable,
  lookup,
  mergeTrace,
  type LookupResult,
  type LsmEntry,
  type LsmOp,
  type LsmState,
  type StepOutcome,
} from './lsm.ts';

export interface LsmFocus {
  /** Index of the WAL record just appended. */
  wal?: number;
  /** Key highlighted in the memtable. */
  memKey?: string;
  /** Segments being looked at (merge inputs, lookup target). */
  segments?: number[];
  /** Segment that was just written. */
  fresh?: number;
  /** Bloom filter bits highlighted for a segment. */
  bloom?: { segmentId: number; positions: number[] };
  /** Lookup outcome for the memtable or a segment. */
  outcome?: { source: 'memtable' | 'segment'; segmentId?: number; outcome: StepOutcome; key: string };
  /** Key currently being merged. */
  mergeKey?: string;
}

export interface LsmFrame extends StepFrame {
  state: LsmState;
  /** A memtable that has been frozen and is being written out. */
  frozen?: LsmEntry[];
  /** Output of a merge that is still being written. */
  building?: LsmEntry[];
  focus?: LsmFocus;
}

const show = (e: LsmEntry) => (e.value === null ? `${e.key} ✝` : `${e.key}=${e.value}`);
const setBits = (bits: readonly number[]) => bits.flatMap((b, i) => (b ? [i] : []));
const list = (ids: number[]) => ids.map((id) => `#${id}`).join(', ');

function memtableCaption(before: readonly LsmEntry[], after: readonly LsmEntry[], entry: LsmEntry, limit: number): string {
  if (findEntry(before, entry.key)) {
    return `\`${entry.key}\` is already in the memtable, so its value is simply replaced in memory. (The older WAL record stays — the WAL is append-only.)`;
  }
  const i = after.findIndex((e) => e.key === entry.key);
  const prev = after[i - 1]?.key;
  const next = after[i + 1]?.key;
  const where = prev && next ? ` between \`${prev}\` and \`${next}\`` : prev ? ` after \`${prev}\`` : next ? ` before \`${next}\`` : '';
  return `Insert \`${entry.key}\` into the **memtable** in sorted position${where}. Keys can arrive in any order — the memtable keeps them sorted. It now holds ${after.length}/${limit}.`;
}

/** Freeze → write SSTable → build Bloom filter → truncate WAL, then any size-tiered compactions. */
export function flushFrames(state: LsmState): LsmFrame[] {
  if (state.memtable.length === 0) return [{ state, caption: 'The memtable is empty — there is nothing to flush.' }];
  const { memtableLimit: limit, autoCompact } = state.config;
  const full = state.memtable.length >= limit;
  const frames: LsmFrame[] = [
    {
      state: { ...state, memtable: [] },
      frozen: state.memtable,
      caption: full
        ? `The memtable is full (${limit}/${limit}). Freeze it — it becomes read-only — and give new writes a fresh, empty memtable.`
        : `Flush: freeze the memtable (${state.memtable.length} key${state.memtable.length === 1 ? '' : 's'}) and give new writes a fresh, empty one.`,
    },
  ];
  const flushed = flushMemtable(state);
  const segment = flushed.segments[0];
  const walKept = { ...flushed, wal: state.wal };
  frames.push({
    state: walKept,
    focus: { fresh: segment.id },
    caption: `Write the frozen memtable to disk in one sequential pass as **SSTable #${segment.id}**. It's already sorted, so nothing needs sorting — and this file will never be modified.`,
  });
  frames.push({
    state: walKept,
    focus: { fresh: segment.id, bloom: { segmentId: segment.id, positions: setBits(segment.bloom.bits) } },
    caption: `Build #${segment.id}'s **Bloom filter**: hash each of its ${segment.entries.length} keys and set those bits. Reads will use it to skip #${segment.id} when a key can't be in it.`,
  });
  frames.push({
    state: flushed,
    focus: { fresh: segment.id },
    caption: `Everything the WAL protected is now safely in #${segment.id}, so the WAL is cleared.`,
  });
  if (!autoCompact) return frames;
  let current = flushed;
  for (let round = compactTierOnce(current); round; round = compactTierOnce(current)) {
    const inputs = round.inputs.map((s) => s.id);
    frames.push({
      state: current,
      focus: { segments: inputs },
      caption: `Size-tiered compaction: ${inputs.length} segments of the same size tier (${list(inputs)}) have piled up, so a background merge combines them.`,
    });
    frames.push({
      state: round.state,
      focus: { fresh: round.output.id },
      caption: `Merged into **#${round.output.id}** (${round.output.entries.length} keys): for every key only the newest value survives${
        round.droppedTombstones ? ', and tombstones are dropped because nothing older is left to hide' : ''
      }. Then ${list(inputs)} are deleted.`,
    });
    current = round.state;
  }
  return frames;
}

function majorCompactionFrames(state: LsmState, final: LsmState): LsmFrame[] {
  // compactAll() returns the same segment list when it refuses to run.
  if (final.segments === state.segments) {
    return [{ state, caption: 'Major compaction needs at least two segments (or a tombstone to purge).' }];
  }
  const ids = state.segments.map((s) => s.id);
  const frames: LsmFrame[] = [
    {
      state,
      focus: { segments: ids },
      building: [],
      caption: `Major compaction: merge all ${ids.length} segments into one. Each is sorted, so they're read side by side like mergesort, comparing the front key of each.`,
    },
  ];
  let output: LsmEntry[] = [];
  for (const step of mergeTrace(state.segments.map((s) => s.entries), true)) {
    const [winner, ...older] = step.candidates;
    const where = `#${state.segments[winner.run].id}`;
    const others = older.map((c) => `#${state.segments[c.run].id}`);
    if (!step.dropped) output = [...output, winner.entry];
    frames.push({
      state,
      building: output,
      focus: { segments: step.candidates.map((c) => state.segments[c.run].id), mergeKey: step.key },
      caption: step.dropped
        ? `\`${step.key}\`: the newest version (in ${where}) is a tombstone, and this output will be the oldest data → drop it${others.length ? ` together with the older version${others.length > 1 ? 's' : ''} in ${others.join(', ')}` : ''}.`
        : others.length
          ? `\`${step.key}\` appears in ${[where, ...others].join(', ')} → keep the newest, ${show(winner.entry)} from ${where}, and discard the rest.`
          : `\`${step.key}\` appears only in ${where} → copy ${show(winner.entry)} to the output.`,
    });
  }
  frames.push({
    state: final,
    focus: { fresh: final.segments[0].id },
    caption: `Write the merged output as **#${final.segments[0].id}** (${final.segments[0].entries.length} live keys) and delete the old segments. Stale versions and tombstones are gone for good.`,
  });
  return frames;
}

/** Every intermediate stage of a write, flush or compaction. The last frame shows the final state. */
export function traceOp(state: LsmState, op: LsmOp): { frames: LsmFrame[]; final: LsmState } {
  const final = applyOp(state, op);
  if (op.type === 'flush') return { frames: flushFrames(state), final };
  if (op.type === 'compact') return { frames: majorCompactionFrames(state, final), final };

  const entry = entryFor(op);
  const what = op.type === 'put' ? `\`${op.key}=${op.value}\`` : `a **tombstone** for \`${op.key}\` (deletes are writes too)`;
  const afterWal = appendWal(state, entry);
  const afterMem = insertMemtable(afterWal, entry);
  const frames: LsmFrame[] = [
    {
      state: afterWal,
      focus: { wal: afterWal.wal.length - 1 },
      caption: `Append ${what} to the end of the **WAL** on disk — a cheap sequential write that lets the memtable be rebuilt after a crash.`,
    },
    { state: afterMem, focus: { memKey: entry.key }, caption: memtableCaption(state.memtable, afterMem.memtable, entry, state.config.memtableLimit) },
  ];
  if (afterMem.memtable.length >= state.config.memtableLimit) frames.push(...flushFrames(afterMem));
  return { frames, final };
}

/** A read, one place at a time: memtable, then each segment newest → oldest via its Bloom filter. */
export function traceGet(state: LsmState, key: string): { frames: LsmFrame[]; result: LookupResult } {
  const result = lookup(state, key);
  const frames: LsmFrame[] = [];
  const inMemory = findEntry(state.memtable, key);
  if (inMemory) {
    frames.push({
      state,
      focus: { memKey: key, outcome: { source: 'memtable', outcome: 'hit', key } },
      caption:
        inMemory.value === null
          ? `Check the memtable (in memory): it holds a tombstone for \`${key}\` → the key is deleted. Done, without touching the disk.`
          : `Check the memtable (in memory): \`${key}=${inMemory.value}\` is there, and it's the newest version. Done, without touching the disk.`,
    });
    return { frames, result };
  }
  frames.push({
    state,
    focus: { outcome: { source: 'memtable', outcome: 'miss', key } },
    caption: `Check the memtable (in memory): \`${key}\` isn't there. Next, the SSTables on disk — newest first, because the first match wins.`,
  });
  for (const segment of state.segments) {
    const positions = bloomPositions(key, segment.bloom.bits.length, segment.bloom.hashes);
    const bloom = { segmentId: segment.id, positions };
    const zero = positions.find((p) => segment.bloom.bits[p] === 0);
    if (zero !== undefined) {
      frames.push({
        state,
        focus: { segments: [segment.id], bloom, outcome: { source: 'segment', segmentId: segment.id, outcome: 'bloom-skip', key } },
        caption: `#${segment.id}: its Bloom filter maps \`${key}\` to bits ${positions.join(', ')}. Bit ${zero} is 0 → \`${key}\` is definitely not here. Skip it without reading the disk.`,
      });
      continue;
    }
    frames.push({
      state,
      focus: { segments: [segment.id], bloom },
      caption: `#${segment.id}: Bloom filter bits ${positions.join(', ')} are all 1 → \`${key}\` might be here. Read the block from disk…`,
    });
    const entry = findEntry(segment.entries, key);
    if (entry) {
      frames.push({
        state,
        focus: { segments: [segment.id], outcome: { source: 'segment', segmentId: segment.id, outcome: 'hit', key } },
        caption:
          entry.value === null
            ? `…it holds a **tombstone**: \`${key}\` was deleted. Stop here — older versions further down no longer count.`
            : `…found \`${key}=${entry.value}\`. #${segment.id} is the newest segment containing \`${key}\`, so this is the current value. Stop.`,
      });
      return { frames, result };
    }
    frames.push({
      state,
      focus: { segments: [segment.id], outcome: { source: 'segment', segmentId: segment.id, outcome: 'false-positive', key } },
      caption: `…\`${key}\` isn't in the block — the Bloom filter gave a **false positive**. One wasted read; continue with the next-older segment.`,
    });
  }
  frames.push({
    state,
    caption: state.segments.length ? `Checked every segment: \`${key}\` doesn't exist.` : `There are no SSTables yet, so \`${key}\` doesn't exist.`,
  });
  return { frames, result };
}
