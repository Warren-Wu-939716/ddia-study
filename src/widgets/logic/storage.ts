import type { StepFrame } from '../../lib/steps.ts';
import { compareKeys, mergeTrace, type LsmEntry, type MergeCandidate } from '../../sims/lsm.ts';

// ── Append-only log & hash index ─────────────────────────────────────

export interface LogRecord {
  key: string;
  value: string;
}

const encoder = new TextEncoder();

export function recordLine(record: LogRecord): string {
  return `${record.key},${record.value}`;
}

/** Byte offset at which each line starts; every line ends with a newline. */
export function lineOffsets(log: readonly LogRecord[]): number[] {
  let offset = 0;
  return log.map((record) => {
    const start = offset;
    offset += encoder.encode(recordLine(record)).length + 1;
    return start;
  });
}

/** Index of the newest line for a key, or -1. */
export function latestLine(log: readonly LogRecord[], key: string): number {
  for (let i = log.length - 1; i >= 0; i--) if (log[i].key === key) return i;
  return -1;
}

/** Key → line index of its newest value, as an in-memory hash index would hold. */
export function buildHashIndex(log: readonly LogRecord[]): Map<string, number> {
  const index = new Map<string, number>();
  log.forEach((record, i) => index.set(record.key, i));
  return index;
}

/** Lines superseded by a later write to the same key. */
export function staleLines(log: readonly LogRecord[]): Set<number> {
  const latest = buildHashIndex(log);
  return new Set(log.flatMap((record, i) => (latest.get(record.key) === i ? [] : [i])));
}

export interface LogFrame extends StepFrame {
  log: LogRecord[];
  /** In-memory hash map; null once it has been lost in a crash. */
  index: Map<string, number> | null;
  /** Line being read right now. */
  cursor?: number;
  /** Lines matching the key found so far during a scan. */
  matches?: number[];
  /** Line whose value is returned. */
  hit?: number;
  /** Line just appended. */
  fresh?: number;
  /** Hash-map entry being looked at or changed. */
  mapKey?: string;
  /** Writing position at the end of the file. */
  eof?: boolean;
}

const byteAt = (log: readonly LogRecord[], line: number) => lineOffsets([...log, { key: '', value: '' }])[line];

/** set(): find the end of the file, append one line, then (optionally) update the hash map. */
export function setFrames(
  log: LogRecord[],
  index: Map<string, number> | null,
  record: LogRecord,
  indexOn: boolean,
): { frames: LogFrame[]; log: LogRecord[]; index: Map<string, number> | null } {
  const line = log.length;
  const end = byteAt(log, line);
  const next = [...log, record];
  const previous = latestLine(log, record.key);
  const frames: LogFrame[] = [
    {
      log,
      index,
      eof: true,
      caption: `\`set(${record.key})\`: go to the end of data.log — byte ${end}. Writes only ever happen here; existing bytes are never touched.`,
    },
    {
      log: next,
      index,
      fresh: line,
      caption: `Append \`${recordLine(record)}\` as line ${line + 1}. One write at the very end of the file — the cheapest kind there is.${
        previous >= 0 ? ` The old line ${previous + 1} for \`${record.key}\` stays in the file, now an outdated version.` : ''
      }`,
    },
  ];
  if (!indexOn) return { frames, log: next, index };
  if (index === null) {
    frames.push({
      log: next,
      index,
      fresh: line,
      caption: 'The hash map was lost in the crash, so there is nothing to update. Reads have to scan until it is rebuilt.',
    });
    return { frames, log: next, index };
  }
  const updated = new Map(index).set(record.key, line);
  const old = index.get(record.key);
  frames.push({
    log: next,
    index: updated,
    fresh: line,
    mapKey: record.key,
    caption:
      old === undefined
        ? `Add \`${record.key}\` → byte ${end} to the hash map in memory. That's a little extra work per write, paid so reads can skip scanning.`
        : `Update the hash map: \`${record.key}\` now points to byte ${end} instead of byte ${byteAt(log, old)}, so reads jump straight to the newest line.`,
  });
  return { frames, log: next, index: updated };
}

/** get() without an index: read every line, remembering the last match. */
export function scanFrames(log: LogRecord[], index: Map<string, number> | null, key: string): LogFrame[] {
  const frames: LogFrame[] = [];
  const matches: number[] = [];
  log.forEach((record, i) => {
    const match = record.key === key;
    if (match) matches.push(i);
    frames.push({
      log,
      index,
      cursor: i,
      matches: [...matches],
      quick: !match,
      caption: match
        ? `Line ${i + 1}: \`${key}\` matches → remember this value. Keep reading — a later line could hold a newer one.`
        : `Line ${i + 1}: \`${record.key}\` — not it, skip.`,
    });
  });
  const hit = matches.at(-1);
  frames.push({
    log,
    index,
    matches,
    hit,
    caption:
      hit === undefined
        ? `Reached the end: scanned all ${log.length} lines and \`${key}\` isn't there. Even proving a key is absent took a full scan.`
        : `Reached the end: scanned all ${log.length} lines and kept the LAST match (line ${hit + 1}) → \`${log[hit].value}\`. Twice the data = twice the work: O(n).`,
  });
  return frames;
}

/** get() with the hash index: one map lookup, then one seek. */
export function indexReadFrames(log: LogRecord[], index: Map<string, number>, key: string): LogFrame[] {
  const line = index.get(key);
  if (line === undefined) {
    return [{ log, index, mapKey: key, caption: `Look up \`${key}\` in the in-memory hash map: no entry, so the key doesn't exist — answered without touching the disk.` }];
  }
  const at = byteAt(log, line);
  return [
    { log, index, mapKey: key, caption: `Look up \`${key}\` in the in-memory hash map → byte ${at}. No disk access yet.` },
    { log, index, mapKey: key, hit: line, caption: `Jump straight to byte ${at} in data.log and read 1 line → \`${log[line].value}\`. No scanning, however big the file grows.` },
  ];
}

/** Restart after a crash: scan the whole file, rebuilding key → offset as you go. */
export function rebuildFrames(log: LogRecord[]): { frames: LogFrame[]; index: Map<string, number> } {
  const building = new Map<string, number>();
  const frames = log.map((record, i): LogFrame => {
    const old = building.get(record.key);
    building.set(record.key, i);
    return {
      log,
      index: new Map(building),
      cursor: i,
      mapKey: record.key,
      quick: i > 0,
      caption:
        old === undefined
          ? `Line ${i + 1}: \`${record.key}\` at byte ${byteAt(log, i)} → add it to the map.`
          : `Line ${i + 1}: \`${record.key}\` at byte ${byteAt(log, i)} → overwrite its entry (byte ${byteAt(log, old)} was an older version).`,
    };
  });
  frames.push({
    log,
    index: building,
    caption: `Rebuilt the hash map by reading all ${log.length} lines. With gigabytes of log, this is why restarts are slow.`,
  });
  return { frames, index: building };
}

// ── SSTable sparse index ─────────────────────────────────────────────

export interface SparseLookup {
  /** Block whose key range covers the key, or null if the key sorts before the first block. */
  blockIndex: number | null;
  /** Keys read inside that block, in order, until the key was found or passed. */
  scanned: string[];
  found: boolean;
}

export function sparseLookup(blocks: readonly (readonly string[])[], key: string): SparseLookup {
  let blockIndex: number | null = null;
  for (let i = 0; i < blocks.length && compareKeys(blocks[i][0], key) <= 0; i++) blockIndex = i;
  if (blockIndex === null) return { blockIndex, scanned: [], found: false };
  const scanned: string[] = [];
  for (const candidate of blocks[blockIndex]) {
    scanned.push(candidate);
    const cmp = compareKeys(candidate, key);
    if (cmp === 0) return { blockIndex, scanned, found: true };
    if (cmp > 0) break;
  }
  return { blockIndex, scanned, found: false };
}

export interface SparseFrame extends StepFrame {
  /** Block the sparse index pointed to (null: the key sorts before the whole file). */
  block: number | null;
  /** Whether that block has been read from disk yet. */
  opened: boolean;
  /** Keys compared inside the block so far. */
  scanned: string[];
  found: boolean;
}

/** Sparse-index lookup: pick a block in memory, read it, then scan it in order. */
export function sparseFrames(blocks: readonly (readonly string[])[], key: string): SparseFrame[] {
  const { blockIndex: block, scanned, found } = sparseLookup(blocks, key);
  if (block === null) {
    return [
      {
        block,
        opened: false,
        scanned: [],
        found: false,
        caption: `Check the sparse index (in memory): \`${key}\` sorts before \`${blocks[0][0]}\`, the first key in the file, so it can't be here. 0 blocks read.`,
      },
    ];
  }
  const next = blocks[block + 1]?.[0];
  const frames: SparseFrame[] = [
    {
      block,
      opened: false,
      scanned: [],
      found: false,
      caption: `Check the sparse index (in memory): \`${blocks[block][0]}\` ≤ \`${key}\`${next ? ` < \`${next}\`` : ''} → if \`${key}\` exists, it must be in block ${block}. No other block needs reading.`,
    },
    { block, opened: true, scanned: [], found: false, caption: `Read block ${block} from disk (and decompress it) — the only disk read for this lookup.` },
  ];
  scanned.forEach((candidate, i) => {
    const cmp = compareKeys(candidate, key);
    const seen = scanned.slice(0, i + 1);
    frames.push({
      block,
      opened: true,
      scanned: seen,
      found: cmp === 0,
      caption:
        cmp === 0
          ? `\`${candidate}\` = \`${key}\` → found, after comparing ${seen.length} key${seen.length === 1 ? '' : 's'} in 1 block.`
          : cmp > 0
            ? `\`${candidate}\` > \`${key}\`. The block is sorted, so \`${key}\` would have appeared before this → it isn't in the file.`
            : `\`${candidate}\` < \`${key}\` → keep going.`,
    });
  });
  if (!found && scanned.length === blocks[block].length && compareKeys(scanned.at(-1)!, key) < 0) {
    frames.push({
      block,
      opened: true,
      scanned,
      found: false,
      caption: `Reached the end of block ${block} without finding \`${key}\`${next ? ` (block ${block + 1} starts at \`${next}\`)` : ''} → it isn't in the file.`,
    });
  }
  return frames;
}

// ── Segment merge, step by step ──────────────────────────────────────

export { mergeOutput, mergeTrace, type MergeCandidate, type MergeStep } from '../../sims/lsm.ts';

export interface MergeFrame extends StepFrame {
  /** Position of the front entry in each input. */
  heads: number[];
  output: LsmEntry[];
  /** Entries being compared or just resolved; the first one is the newest. */
  candidates: MergeCandidate[];
  phase: 'start' | 'compare' | 'emit' | 'done';
}

const showEntry = (e: LsmEntry) => `${e.key}=${e.value ?? '✝'}`;

/** Each merge step split in two: compare the fronts, then write (or drop) the winner. */
export function mergeFrames(runs: readonly (readonly LsmEntry[])[], names: readonly string[], dropTombstones: boolean): MergeFrame[] {
  const steps = mergeTrace(runs, dropTombstones);
  const frames: MergeFrame[] = [
    {
      heads: runs.map(() => 0),
      output: [],
      candidates: [],
      phase: 'start',
      caption: 'Both inputs are sorted. A cursor starts at the front of each; the merge only ever looks at those front entries.',
    },
  ];
  let output: LsmEntry[] = [];
  steps.forEach((step, s) => {
    const fronts = step.cursors.flatMap((c, r) => (runs[r][c] ? [`${showEntry(runs[r][c])} (${names[r]})`] : []));
    frames.push({
      heads: step.cursors,
      output,
      candidates: step.candidates,
      phase: 'compare',
      caption: `Compare the fronts: ${fronts.join(' vs ')}. The smallest key is \`${step.key}\`${
        step.candidates.length > 1 ? `, and it's at the front of ${step.candidates.length === runs.length ? 'both' : step.candidates.length} inputs.` : '.'
      }`,
    });
    const [winner, ...losers] = step.candidates;
    const where = names[winner.run];
    const discarded = losers.map((l) => showEntry(l.entry)).join(', ');
    if (!step.dropped) output = [...output, winner.entry];
    frames.push({
      heads: steps[s + 1]?.cursors ?? runs.map((r) => r.length),
      output,
      candidates: step.candidates,
      phase: 'emit',
      caption: step.dropped
        ? `${step.key}: the newest value is a tombstone, and the output is the oldest data, so nothing older can need hiding → drop it${discarded ? ` (and ${discarded})` : ''}. Advance the cursor${losers.length ? 's' : ''}.`
        : winner.entry.value === null
          ? `${step.key}: the newest value is a tombstone → write the tombstone${discarded ? ` and discard ${discarded}` : ''}. Some older segment outside this merge might still hold ${step.key}, so the tombstone must survive.`
          : losers.length
            ? `${step.key} appears in both inputs → keep the ${where}’s value (${winner.entry.value}) and discard ${discarded}. Advance both cursors.`
            : `${step.key} is only in the ${where} → copy it to the output and advance that cursor.`,
    });
  });
  frames.push({
    heads: runs.map((r) => r.length),
    output,
    candidates: [],
    phase: 'done',
    caption: `Done: the output is sorted with one entry per key (${output.length} entries). It's written sequentially as a new segment, and the inputs are deleted.`,
  });
  return frames;
}

// ── B-tree page split with and without a WAL ─────────────────────────

export type SplitStep = 'wal' | 'fsync' | 'left' | 'right' | 'parent';

export const SPLIT_STEP_LABELS: Record<SplitStep, string> = {
  wal: 'Append the change to the WAL',
  fsync: 'fsync the WAL (now durable)',
  left: 'Overwrite leaf L with its left half',
  right: 'Write new leaf R with the right half',
  parent: 'Overwrite parent P with boundary 337',
};

export function splitSteps(withWal: boolean): SplitStep[] {
  return withWal ? ['wal', 'fsync', 'left', 'right', 'parent'] : ['left', 'right', 'parent'];
}

export interface SplitPages {
  parent: 'old' | 'new';
  left: 'old' | 'new';
  right: 'missing' | 'new';
}

export interface CrashOutcome {
  onDisk: SplitPages;
  walDurable: boolean;
  afterRestart: SplitPages;
  consistent: boolean;
  insertApplied: boolean;
  orphan: boolean;
  lostKeys: number[];
  message: string;
}

/** What survives if the machine crashes after `completed` steps of the split. */
export function crashOutcome(withWal: boolean, completed: number): CrashOutcome {
  const done = new Set(splitSteps(withWal).slice(0, completed));
  const onDisk: SplitPages = {
    parent: done.has('parent') ? 'new' : 'old',
    left: done.has('left') ? 'new' : 'old',
    right: done.has('right') ? 'new' : 'missing',
  };
  const allNew: SplitPages = { parent: 'new', left: 'new', right: 'new' };
  const base = { onDisk, walDurable: withWal && done.has('fsync'), orphan: false, lostKeys: [] as number[] };

  if (base.walDurable) {
    return {
      ...base,
      afterRestart: allNew,
      consistent: true,
      insertApplied: true,
      message: 'On restart the WAL is replayed and the whole split is redone. The tree is consistent and the insert survives.',
    };
  }
  if (onDisk.left === 'old' && onDisk.right === 'missing' && onDisk.parent === 'old') {
    return {
      ...base,
      afterRestart: onDisk,
      consistent: true,
      insertApplied: false,
      message: withWal
        ? 'The WAL record never became durable, so it is discarded. No page had been touched yet: the tree is consistent, and the insert was never acknowledged.'
        : 'No page had been written yet, so the tree is fine — but the insert is simply lost.',
    };
  }
  if (onDisk.parent === 'new') {
    return { ...base, afterRestart: onDisk, consistent: true, insertApplied: true, message: 'Every page reached disk before the crash.' };
  }
  if (onDisk.right === 'missing') {
    return {
      ...base,
      afterRestart: onDisk,
      consistent: false,
      insertApplied: false,
      lostKeys: [337, 340],
      message: 'Leaf L was cut in half, but the right half was never written. Keys 337 and 340 are gone, and nothing can repair it.',
    };
  }
  return {
    ...base,
    afterRestart: onDisk,
    consistent: false,
    insertApplied: false,
    orphan: true,
    lostKeys: [337, 340],
    message: 'Page R exists, but the parent was never updated to point at it — an orphan page. Keys 337 and 340 are unreachable.',
  };
}

export type WalRecordState = 'none' | 'buffered' | 'durable' | 'lost';

export interface CrashFrame extends StepFrame {
  pages: SplitPages;
  wal: WalRecordState;
  /** Split steps completed so far. */
  done: number;
  phase: 'write' | 'crash' | 'restart' | 'result';
  outcome?: CrashOutcome;
}

const STEP_CAPTIONS: Record<SplitStep, (withWal: boolean) => string> = {
  wal: () => 'Append a record describing the whole split to the WAL. It sits in the operating system’s buffer — not on disk yet.',
  fsync: () => 'fsync the WAL: the record is now durable on disk. From here on, the split can always be redone.',
  left: (withWal) =>
    `Overwrite leaf L with its left half (333, 334, 335).${withWal ? '' : ' Keys 337 and 340 now exist only in memory until R is written.'}`,
  right: (withWal) => `Write the new leaf R with the right half (337, 340).${withWal ? '' : ' Nothing points to R yet.'}`,
  parent: () => 'Overwrite the parent P, adding boundary 337 and a pointer to R. The split is complete.',
};

const pagesAfter = (done: Set<SplitStep>): SplitPages => ({
  parent: done.has('parent') ? 'new' : 'old',
  left: done.has('left') ? 'new' : 'old',
  right: done.has('right') ? 'new' : 'missing',
});

/** Run the split up to the crash point, crash, restart, and show what survived. */
export function crashFrames(withWal: boolean, completed: number): CrashFrame[] {
  const steps = splitSteps(withWal);
  const frames: CrashFrame[] = [];
  const done = new Set<SplitStep>();
  const walAt = () => (done.has('fsync') ? 'durable' : done.has('wal') ? 'buffered' : 'none');
  steps.slice(0, completed).forEach((step, i) => {
    done.add(step);
    frames.push({ pages: pagesAfter(done), wal: walAt(), done: i + 1, phase: 'write', caption: `Step ${i + 1}: ${STEP_CAPTIONS[step](withWal)}` });
  });
  const outcome = crashOutcome(withWal, completed);
  const walAtCrash = walAt() === 'buffered' ? 'lost' : walAt();
  frames.push({
    pages: outcome.onDisk,
    wal: walAtCrash,
    done: completed,
    phase: 'crash',
    caption: `**Power cut** ${completed === 0 ? 'before the first write' : `after step ${completed}`}! Memory, including the operating system’s buffers, is wiped; only what reached the disk remains.${
      walAtCrash === 'lost' ? ' The WAL record was never fsynced, so it is gone too.' : ''
    }`,
  });
  if (withWal) {
    frames.push({
      pages: outcome.onDisk,
      wal: walAtCrash,
      done: completed,
      phase: 'restart',
      caption: outcome.walDurable
        ? 'Restart: before serving any query, read the WAL. It holds a complete record of the split → redo every step. Rewriting a page that was already written is harmless.'
        : 'Restart: before serving any query, read the WAL. There is no durable record of the split → nothing to redo. The insert was never acknowledged, so dropping it is correct.',
    });
  } else {
    frames.push({
      pages: outcome.onDisk,
      wal: 'none',
      done: completed,
      phase: 'restart',
      caption: 'Restart: with no log, the database has no record that a split was in progress. It simply uses the pages as they are on disk.',
    });
  }
  frames.push({
    pages: outcome.afterRestart,
    wal: outcome.walDurable ? 'durable' : walAtCrash,
    done: completed,
    phase: 'result',
    outcome,
    caption: `**${outcome.consistent ? (outcome.insertApplied ? 'Consistent, insert kept.' : 'Consistent.') : 'Corrupted.'}** ${outcome.message}`,
  });
  return frames;
}

// ── SSD garbage collection ───────────────────────────────────────────

export type FlashPage = { file: string; part: number } | null;

export interface FlashFile {
  name: string;
  pages: number;
}

/** Places file pages into erase blocks: one file after another, or interleaved as random writes would. */
export function layoutFiles(files: readonly FlashFile[], pattern: 'sequential' | 'scattered', blockSize = 4, blockCount = 4): FlashPage[][] {
  const order: { file: string; part: number }[] = [];
  if (pattern === 'sequential') {
    for (const f of files) for (let p = 1; p <= f.pages; p++) order.push({ file: f.name, part: p });
  } else {
    const longest = Math.max(...files.map((f) => f.pages));
    for (let p = 1; p <= longest; p++) for (const f of files) if (p <= f.pages) order.push({ file: f.name, part: p });
  }
  return Array.from({ length: blockCount }, (_, b) => Array.from({ length: blockSize }, (_, i) => order[b * blockSize + i] ?? null));
}

export interface GcCost {
  /** Blocks that contain pages of the deleted file and must eventually be erased. */
  blocks: number[];
  /** Still-valid pages that must be copied elsewhere before those blocks can be erased. */
  copies: number;
}

export function gcAfterDelete(blocks: readonly FlashPage[][], deleted: string): GcCost {
  const affected = blocks.flatMap((block, i) => (block.some((p) => p?.file === deleted) ? [i] : []));
  const copies = affected.reduce((sum, i) => sum + blocks[i].filter((p) => p && p.file !== deleted).length, 0);
  return { blocks: affected, copies };
}

export type FlashCell = { file: string; part: number; stale?: boolean } | null;

export interface SsdFrame extends StepFrame {
  blocks: FlashCell[][];
  /** Block being garbage-collected. */
  victim?: number;
  /** Page just copied: where it came from and where it went. */
  from?: [number, number];
  to?: [number, number];
  /** Extra page writes so far. */
  copies: number;
}

/** Delete a file, then garbage-collect each block it touched: copy still-valid pages out, erase the block. */
export function ssdDeleteFrames(layout: readonly FlashPage[][], deleted: string): SsdFrame[] {
  const blocks: FlashCell[][] = layout.map((block) => block.map((p) => (p ? { ...p, stale: p.file === deleted } : null)));
  const snapshot = () => blocks.map((b) => [...b]);
  const { blocks: affected, copies: totalCopies } = gcAfterDelete(layout, deleted);
  let copies = 0;
  const frames: SsdFrame[] = [
    {
      blocks: snapshot(),
      copies,
      caption: `Delete file ${deleted}: its pages are only **marked stale**. Flash can't erase a single page — only a whole block — so the space isn't free yet.`,
    },
  ];
  for (const victim of affected) {
    const valid = blocks[victim].flatMap((p, i) => (p && !p.stale ? [i] : []));
    frames.push({
      blocks: snapshot(),
      victim,
      copies,
      caption: valid.length
        ? `Garbage-collect block ${victim}: it mixes stale pages of ${deleted} with ${valid.length} still-valid page${valid.length === 1 ? '' : 's'}, which must be copied out before the block can be erased.`
        : `Garbage-collect block ${victim}: every page in it belongs to ${deleted} and is stale — nothing to copy.`,
    });
    for (const i of valid) {
      const page = blocks[victim][i]!;
      const target = blocks.findIndex((b, bi) => bi !== victim && b.includes(null));
      const slot = blocks[target].indexOf(null);
      blocks[target][slot] = page;
      blocks[victim][i] = null;
      copies++;
      frames.push({
        blocks: snapshot(),
        victim,
        from: [victim, i],
        to: [target, slot],
        copies,
        caption: `Copy ${page.file}${page.part} from block ${victim} to a free page in block ${target} — extra write #${copies}, which your application never asked for.`,
      });
    }
    blocks[victim] = blocks[victim].map(() => null);
    frames.push({ blocks: snapshot(), victim, copies, caption: `Erase block ${victim}: all ${blocks[victim].length} pages are free again.` });
  }
  frames.push({
    blocks: snapshot(),
    copies,
    caption:
      totalCopies === 0
        ? `File ${deleted} filled block ${affected[0]} on its own, so the whole block was erased directly: 0 pages copied.`
        : `${deleted}’s pages were spread over ${affected.length} blocks mixed with other files, so the SSD had to copy ${totalCopies} still-valid pages before erasing — ${totalCopies} extra writes that compete with your application and wear out the flash.`,
  });
  return frames;
}

// ── Write amplification model ────────────────────────────────────────

/** WAL + memtable flush + one rewrite per compaction the key goes through. */
export function lsmWriteAmplification(compactionRewrites: number): number {
  return 2 + compactionRewrites;
}

/** WAL record of the value + a full page write shared by the updates buffered into it. */
export function btreeWriteAmplification(valueBytes: number, pageBytes: number, updatesPerPageWrite: number): number {
  return (valueBytes + pageBytes / Math.max(1, updatesPerPageWrite)) / valueBytes;
}

// ── What an index entry points to ────────────────────────────────────

export type TableLayout = 'clustered' | 'heap' | 'covering';
export type HopQuery = 'by-id' | 'all-by-email' | 'status-by-email';
export type Structure = 'pk-index' | 'email-index' | 'heap';

export interface Hop {
  structure: Structure;
  note: string;
}

export function indexHops(layout: TableLayout, query: HopQuery): Hop[] {
  if (layout === 'clustered') {
    if (query === 'by-id') return [{ structure: 'pk-index', note: 'The primary key is a clustered index — the whole row is stored right here.' }];
    return [
      { structure: 'email-index', note: 'Finds the entry for the email. A secondary index stores the row’s primary key: id 42.' },
      { structure: 'pk-index', note: 'Looks up id 42 in the clustered primary-key index to get the row.' },
    ];
  }
  if (layout === 'covering' && query === 'status-by-email') {
    return [{ structure: 'email-index', note: 'The index also stores status, so it covers the query. Done — no row lookup.' }];
  }
  const first: Hop =
    query === 'by-id'
      ? { structure: 'pk-index', note: 'Finds id 42 → a pointer to heap location #3.' }
      : {
          structure: 'email-index',
          note:
            layout === 'covering' && query === 'all-by-email'
              ? 'Status is stored here, but the query wants every column → follow the pointer to heap location #3.'
              : 'Finds the email → a pointer to heap location #3.',
        };
  return [first, { structure: 'heap', note: 'Reads the row at location #3 of the unordered heap file.' }];
}

export interface HopFrame extends StepFrame {
  /** Index of the hop being shown (hops before it are done). */
  hop: number;
}

export function hopFrames(hops: readonly Hop[]): HopFrame[] {
  return hops.map((h, i) => ({
    hop: i,
    caption: `Hop ${i + 1} of ${hops.length}: ${h.note}${i === hops.length - 1 ? (hops.length === 1 ? ' One structure touched.' : ` ${hops.length} structures touched in total.`) : ''}`,
  }));
}
