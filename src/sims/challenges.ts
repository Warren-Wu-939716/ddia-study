import type { LabId } from '../content/types.ts';
import { bloomFromKeys, bloomMightContain, falsePositiveRateForBitsPerKey, theoreticalFalsePositiveRate } from './bloom.ts';
import {
  addGroup,
  crash,
  createBroker,
  drain,
  duplicateCount,
  getGroup,
  idleConsumers,
  keyProcessedInOrder,
  poll,
  produce,
  type BrokerState,
} from './broker.ts';
import { createBTree, depth, insertMany, lookupKey, type BTreeState } from './btree.ts';
import { columnValues, evaluateFilter, generateSales, runLengthEncode, SALES_COLUMNS, scanBytes, sortRows } from './columnar.ts';
import { applyOp, createLsm, diskEntries, liveKeyCount, lookup, writeAmplification, type LsmConfig, type LsmOp, type LsmState } from './lsm.ts';

/**
 * Predict → run → explain. Every answer is *computed by running the simulator*,
 * so the explanation always matches what you see on screen.
 */
interface ChallengeBase {
  id: string;
  title: string;
  prompt: string;
  options: string[];
  explanation: string;
}

export interface LsmChallenge extends ChallengeBase {
  labId: 'lsm';
  config: LsmConfig;
  ops: LsmOp[];
  lookupKey?: string;
  answer: (state: LsmState) => string;
}

export interface BTreeChallenge extends ChallengeBase {
  labId: 'btree';
  maxKeys: number;
  inserts: number[];
  lookupKey?: number;
  answer: (state: BTreeState) => string;
}

export interface CalcChallenge extends ChallengeBase {
  labId: 'bloom' | 'columnar';
  answer: () => string;
}

/** The lab shows the state that `setup` builds; the answer is read from that same state. */
export interface BrokerChallenge extends ChallengeBase {
  labId: 'broker';
  setup: () => BrokerState;
  /** Group shown in the lab after setup. */
  group: string;
  answer: (state: BrokerState) => string;
}

export type Challenge = LsmChallenge | BTreeChallenge | CalcChallenge | BrokerChallenge;

const put = (key: string, value: string): LsmOp => ({ type: 'put', key, value });
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/** Picks the option closest to `value` on a log scale (options are labels like "1%" or "10×"). */
export function nearestOnLogScale(value: number, options: readonly string[], parse: (option: string) => number): string {
  let best = options[0];
  let bestDistance = Infinity;
  for (const option of options) {
    const distance = Math.abs(Math.log(value) - Math.log(parse(option)));
    if (distance < bestDistance) {
      best = option;
      bestDistance = distance;
    }
  }
  return best;
}

const percent = (o: string) => Number.parseFloat(o.replace(/[^0-9.]/g, '')) / 100;
const times = (o: string) => Number.parseFloat(o.replace(/[^0-9.]/g, ''));

export const LSM_CHALLENGES: LsmChallenge[] = [
  {
    id: 'lsm.flush-count',
    labId: 'lsm',
    title: 'When does the memtable flush?',
    prompt: 'The memtable flushes at 3 keys. You write five distinct keys a–e. How many SSTable segments are on disk afterwards?',
    options: ['0', '1', '2', '5'],
    config: { memtableLimit: 3, tierThreshold: 4, bloomBits: 16, bloomHashes: 2, autoCompact: true },
    ops: ['a', 'b', 'c', 'd', 'e'].map((k) => put(k, '1')),
    answer: (s) => String(s.segments.length),
    explanation:
      'Writes accumulate in the sorted in-memory memtable. When it hits the threshold (a–c) it is written out in one sequential pass as a new SSTable. d and e are still in memory — protected only by the WAL.',
  },
  {
    id: 'lsm.newest-wins',
    labId: 'lsm',
    title: 'Which version does a read return?',
    prompt: 'k=v1 is flushed, then k=v2 is flushed, then k=v3 is written (not flushed). Where does get(k) find its answer?',
    options: ['memtable: v3', 'segment #2: v2', 'segment #1: v1', 'it merges all three'],
    config: { memtableLimit: 3, tierThreshold: 4, bloomBits: 32, bloomHashes: 2, autoCompact: true },
    ops: [put('k', 'v1'), { type: 'flush' }, put('k', 'v2'), { type: 'flush' }, put('k', 'v3')],
    lookupKey: 'k',
    answer: (s) => {
      const hit = lookup(s, 'k').steps.find((step) => step.outcome === 'hit');
      const value = lookup(s, 'k').value;
      return hit?.source === 'memtable' ? `memtable: ${value}` : `segment #${hit?.segmentId}: ${value}`;
    },
    explanation:
      'Reads search newest → oldest and stop at the first hit. Older versions still sit on disk (wasting space) until compaction discards them.',
  },
  {
    id: 'lsm.tombstone-major',
    labId: 'lsm',
    title: 'What happens to a deleted key in a major compaction?',
    prompt:
      'user:7=alice is flushed, then delete(user:7) is flushed, then everything is compacted into one segment. How many entries for user:7 remain on disk?',
    options: ['0', '1 (the tombstone)', '1 (alice)', '2'],
    config: { memtableLimit: 3, tierThreshold: 4, bloomBits: 16, bloomHashes: 2, autoCompact: true },
    ops: [put('user:7', 'alice'), { type: 'flush' }, { type: 'delete', key: 'user:7' }, { type: 'flush' }, { type: 'compact' }],
    answer: (s) => {
      const left = s.segments.flatMap((seg) => seg.entries).filter((e) => e.key === 'user:7');
      if (left.length === 0) return '0';
      if (left.length === 2) return '2';
      return left[0].value === null ? '1 (the tombstone)' : '1 (alice)';
    },
    explanation:
      'The tombstone shadows alice during the merge, so alice is discarded. Because the output is now the oldest data, there is nothing older left to shadow — the tombstone itself can be dropped.',
  },
  {
    id: 'lsm.tombstone-minor',
    labId: 'lsm',
    title: 'Can a tombstone be dropped early?',
    prompt:
      'Memtable limit 2, size-tiered threshold 3. alice is written early and ends up in an older tier-1 segment. Later delete(user:7) is merged with other new segments. Does the merged newest segment still contain the tombstone?',
    options: ['Yes — an older segment still holds alice', 'No — compaction always drops tombstones'],
    config: { memtableLimit: 2, tierThreshold: 3, bloomBits: 32, bloomHashes: 2, autoCompact: true },
    ops: [
      put('user:7', 'alice'),
      put('a', '1'),
      put('b', '1'),
      put('c', '1'),
      put('d', '1'),
      put('e', '1'),
      { type: 'delete', key: 'user:7' },
      put('f', '1'),
      put('g', '1'),
      put('h', '1'),
      put('i', '1'),
      put('j', '1'),
    ],
    lookupKey: 'user:7',
    answer: (s) =>
      s.segments[0]?.entries.some((e) => e.key === 'user:7' && e.value === null)
        ? 'Yes — an older segment still holds alice'
        : 'No — compaction always drops tombstones',
    explanation:
      'Dropping the tombstone here would resurrect alice from the older segment. It must survive until it is merged into the oldest data. This is why "really deleted" can take a long time in LSM engines.',
  },
  {
    id: 'lsm.bloom-skip',
    labId: 'lsm',
    title: 'Looking up a key that never existed',
    prompt:
      'Several SSTables, each with a generously sized Bloom filter (64 bits). You call get(zebra), a key never written. How many segments have to be read from disk?',
    options: ['0', '1', 'half of them', 'all of them'],
    config: { memtableLimit: 3, tierThreshold: 5, bloomBits: 64, bloomHashes: 4, autoCompact: true },
    ops: ['apple', 'bagel', 'cider', 'dates', 'eggs', 'flour', 'grape', 'honey', 'icing', 'jelly', 'kiwi', 'lemon'].map((k) => put(k, '1')),
    lookupKey: 'zebra',
    answer: (s) => {
      const read = lookup(s, 'zebra').segmentsRead;
      return read === 0 ? '0' : read === 1 ? '1' : read === s.segments.length ? 'all of them' : 'half of them';
    },
    explanation:
      'Without Bloom filters a missing key is the worst case: every segment must be checked. A filter answers "definitely not here" from a few bits in memory, so each segment is skipped without any disk I/O.',
  },
  {
    id: 'lsm.write-amp',
    labId: 'lsm',
    title: 'Write amplification',
    prompt:
      'Memtable limit 3, size-tiered threshold 4. You write 12 distinct keys. Counting the WAL, flushes and compactions, what is the write amplification?',
    options: ['1.0', '2.0', '3.0', '4.0'],
    config: { memtableLimit: 3, tierThreshold: 4, bloomBits: 16, bloomHashes: 2, autoCompact: true },
    ops: range(1, 12).map((n) => put(`k${String(n).padStart(2, '0')}`, '1')),
    answer: (s) => writeAmplification(s.stats).toFixed(1),
    explanation:
      'Each key is written once to the WAL, once when its memtable is flushed and once more when the four tier-0 segments are merged. Every additional compaction level adds another rewrite.',
  },
  {
    id: 'lsm.space',
    labId: 'lsm',
    title: 'Overwrites and disk space',
    prompt: 'Auto-compaction off. Keys a, b, c are each written three times, with a flush after every round. How many entries are on disk, and how many live keys are there?',
    options: ['3 on disk, 3 live', '6 on disk, 3 live', '9 on disk, 3 live', '9 on disk, 9 live'],
    config: { memtableLimit: 3, tierThreshold: 4, bloomBits: 16, bloomHashes: 2, autoCompact: false },
    ops: [1, 2, 3].flatMap((v) => ['a', 'b', 'c'].map((k) => put(k, String(v)))),
    answer: (s) => `${diskEntries(s)} on disk, ${liveKeyCount(s)} live`,
    explanation:
      'Immutable segments mean overwritten values keep using disk space until compaction rewrites the files. Press "Compact all" afterwards to watch it shrink to 3.',
  },
];

export const BTREE_CHALLENGES: BTreeChallenge[] = [
  {
    id: 'btree.first-split',
    labId: 'btree',
    title: 'The first split',
    prompt: 'Pages hold at most 3 keys. Insert 10, 20, 30, 40 into an empty tree. How many levels does the tree have afterwards?',
    options: ['1', '2', '3', '4'],
    maxKeys: 3,
    inserts: [10, 20, 30, 40],
    answer: (s) => String(depth(s)),
    explanation:
      'The single leaf overflows on 40 and splits into two half-full pages. A new root is created above them holding the boundary key — B-trees grow at the top, which keeps them balanced.',
  },
  {
    id: 'btree.lookup-cost',
    labId: 'btree',
    title: 'Cost of a lookup',
    prompt: 'Pages hold at most 3 keys. After inserting 1…30, how many pages must be read to find key 17?',
    options: ['2', '3', '4', '30'],
    maxKeys: 3,
    inserts: range(1, 30),
    lookupKey: 17,
    answer: (s) => String(lookupKey(s, 17).path.length),
    explanation:
      'A lookup reads exactly one page per level. Real pages hold hundreds of boundary keys, so even billions of rows need only 3–4 levels: depth grows with log(n).',
  },
  {
    id: 'btree.update-cost',
    labId: 'btree',
    title: 'Updating one small value',
    prompt: 'Overwrite an existing key (no split needed). How many tree pages are written to disk, not counting the WAL?',
    options: ['0 — only the WAL', '1 — the whole leaf page', 'one per level'],
    maxKeys: 3,
    inserts: [...range(1, 12), 5],
    answer: (s) => {
      const touched = s.lastInsert?.touched.length ?? 0;
      return touched === 0 ? '0 — only the WAL' : touched === 1 ? '1 — the whole leaf page' : 'one per level';
    },
    explanation:
      'B-trees update in place at page granularity: changing a few bytes rewrites a whole page (4–16 KiB), after first writing the change to the WAL. That is a big part of B-tree write amplification.',
  },
  {
    id: 'btree.cascade',
    labId: 'btree',
    title: 'A cascading split',
    prompt:
      'Pages hold at most 3 keys. After inserting 10, 20, …, 90, you insert 95 — which lands in a full leaf whose parent is also full. How many pages does that single insert write (modified or new)?',
    options: ['1', '2', '4', '5'],
    maxKeys: 3,
    inserts: [...range(1, 9).map((n) => n * 10), 95],
    answer: (s) => String(s.lastInsert?.touched.length ?? 0),
    explanation:
      'Leaf split (2 pages) → parent gains a key and overflows → parent split (2 pages) → a new root. Every page must be written together; a crash midway would corrupt the tree, which is why the WAL exists.',
  },
];

const sales = generateSales();

export const BLOOM_CHALLENGES: CalcChallenge[] = [
  {
    id: 'bloom.ten-bits',
    labId: 'bloom',
    title: 'Sizing rule of thumb',
    prompt: 'With 10 bits of filter per key (and the best number of hash functions), the false-positive rate is about…',
    options: ['10%', '1%', '0.1%', '0.01%'],
    answer: () => nearestOnLogScale(falsePositiveRateForBitsPerKey(10), ['10%', '1%', '0.1%', '0.01%'], percent),
    explanation: 'About 1%. That is cheap: 10 bits per key is tiny compared with the keys and values themselves.',
  },
  {
    id: 'bloom.plus-five',
    labId: 'bloom',
    title: 'Buying accuracy',
    prompt: 'Going from 10 to 15 bits per key cuts false positives by roughly…',
    options: ['2×', '10×', '100×', '1000×'],
    answer: () =>
      nearestOnLogScale(falsePositiveRateForBitsPerKey(10) / falsePositiveRateForBitsPerKey(15), ['2×', '10×', '100×', '1000×'], times),
    explanation: 'Each extra 5 bits per key buys roughly a tenfold reduction — accuracy is exponential in memory.',
  },
  {
    id: 'bloom.overfull',
    labId: 'bloom',
    title: 'An overloaded filter',
    prompt: 'A 16-bit filter with 3 hash functions holds 12 keys. Roughly what share of absent keys get "maybe present"?',
    options: ['~1%', '~10%', '~30%', '~70%'],
    answer: () => nearestOnLogScale(theoreticalFalsePositiveRate(16, 12, 3), ['~1%', '~10%', '~30%', '~70%'], percent),
    explanation:
      'With ~1.3 bits per key most bits are already 1, so almost any probe matches. In an LSM engine that just means wasted reads — results stay correct, performance degrades.',
  },
  {
    id: 'bloom.no-false-negatives',
    labId: 'bloom',
    title: 'False negatives?',
    prompt: 'Can a Bloom filter ever answer "definitely absent" for a key that IS in the SSTable?',
    options: ['Yes, occasionally', 'No, never'],
    answer: () => {
      const keys = Array.from({ length: 200 }, (_, i) => `key-${i}`);
      const filter = bloomFromKeys(keys, 256, 3);
      return keys.every((k) => bloomMightContain(filter, k)) ? 'No, never' : 'Yes, occasionally';
    },
    explanation:
      'Inserting a key sets all its bits to 1 and bits are never cleared, so a present key always matches. Errors only go one way: false positives.',
  },
];

export const COLUMNAR_CHALLENGES: CalcChallenge[] = [
  {
    id: 'columnar.bytes-read',
    labId: 'columnar',
    title: 'Reading only what you need',
    prompt: 'A fact table has 1 billion rows and 100 columns of 8 bytes. A query touches 3 columns. How much less data does a column store read than a row store?',
    options: ['3×', '~33×', '100×', '300×'],
    answer: () => {
      const { row, column } = scanBytes({ rows: 1e9, totalColumns: 100, columnsUsed: 3, bytesPerValue: 8 });
      return nearestOnLogScale(row / column, ['3×', '~33×', '100×', '300×'], times);
    },
    explanation: '800 GB vs 24 GB, before compression. Compression usually widens the gap further, because a single column is very repetitive.',
  },
  {
    id: 'columnar.first-sort-key',
    labId: 'columnar',
    title: 'Which column compresses best?',
    prompt: 'The sample table is sorted by (date_key, product_sk). Which column ends up with the fewest runs of repeated values?',
    options: ['date_key', 'product_sk', 'store_sk', 'quantity'],
    answer: () => {
      const sorted = sortRows(sales, ['date_key', 'product_sk']);
      const runs = SALES_COLUMNS.map((c) => ({ c, runs: runLengthEncode(columnValues(sorted, c)).length }));
      return runs.reduce((best, r) => (r.runs < best.runs ? r : best)).c;
    },
    explanation:
      'The first sort key forms long runs, so run-length encoding shrinks it dramatically. The second key is only sorted within each first-key group; later columns look random.',
  },
  {
    id: 'columnar.bitmap-or',
    labId: 'columnar',
    title: 'Evaluating IN (…)',
    prompt: 'To evaluate WHERE product_sk IN (31, 68, 69), what do you do with the three per-value bitmaps?',
    options: ['bitwise AND', 'bitwise OR', 'XOR', 'concatenate them'],
    answer: () => {
      const evaluation = evaluateFilter(sales, [31, 68, 69], null);
      const expected = sales.map((r) => ([31, 68, 69].includes(r.product_sk) ? 1 : 0));
      return evaluation.productMatch.every((bit, i) => bit === expected[i]) ? 'bitwise OR' : 'bitwise AND';
    },
    explanation:
      'A row matches if it has any of the values → OR. Combining conditions on different columns (product AND store) uses AND, which works because every column stores rows in the same order.',
  },
  {
    id: 'columnar.independent-sort',
    labId: 'columnar',
    title: 'Sorting columns independently',
    prompt: 'Someone sorts every column on its own to maximize compression. Afterwards, the 5th value in each column…',
    options: ['still describes row 5', 'no longer describes the same row'],
    answer: () => {
      const independent = SALES_COLUMNS.map((c) => [...columnValues(sales, c)].sort((a, b) => a - b));
      const consistent = sales.every((row, i) => SALES_COLUMNS.every((c, ci) => independent[ci][i] === row[c]));
      return consistent ? 'still describes row 5' : 'no longer describes the same row';
    },
    explanation: 'Rows are reconstructed by position: the k-th entry of every column is row k. So you sort whole rows, even though they are stored column by column.',
  },
];

const userKeys = (n: number) => Array.from({ length: n }, (_, i) => `user:${(i % 5) + 1}`);
const produceKeys = (state: BrokerState, keys: readonly string[]) => keys.reduce((s, k, i) => produce(s, k, `v${i}`), state);

export const BROKER_CHALLENGES: BrokerChallenge[] = [
  {
    id: 'broker.idle',
    labId: 'broker',
    title: 'More consumers than partitions',
    prompt: 'A topic has 3 partitions. A consumer group with 4 consumers subscribes. How many consumers get nothing to do?',
    options: ['0', '1', '3', '4'],
    group: 'orders',
    setup: () => addGroup(produceKeys(createBroker({ partitions: 3, retention: 20, commitEvery: 2 }), userKeys(9)), 'orders', 4),
    answer: (s) => String(idleConsumers(getGroup(s, 'orders')).length),
    explanation:
      'Within a group, each partition is read by exactly one consumer, so the useful parallelism is capped by the number of partitions. The fourth consumer is idle (a hot standby). To scale further, add partitions.',
  },
  {
    id: 'broker.duplicates',
    labId: 'broker',
    title: 'Crash between commits',
    prompt: 'Consumers commit their offsets after every 4 messages. One consumer processes 6 messages from its partition, then crashes. After the rebalance, how many messages are processed a second time?',
    options: ['0', '2', '4', '6'],
    group: 'orders',
    setup: () => {
      let s = addGroup(produceKeys(createBroker({ partitions: 1, retention: 20, commitEvery: 4 }), userKeys(10)), 'orders', 2);
      const owner = getGroup(s, 'orders').consumers.find((c) => c.partitions.length > 0)!.id;
      for (let i = 0; i < 6; i++) s = poll(s, 'orders', owner).state;
      return drain(crash(s, 'orders', owner), 'orders');
    },
    answer: (s) => String(duplicateCount(getGroup(s, 'orders'))),
    explanation:
      'The commit after message 4 recorded offset 4. Messages 5 and 6 were processed but never committed, so the new owner starts at offset 4 and processes them again. Committing more often shrinks the window but never closes it — consumers must tolerate duplicates.',
  },
  {
    id: 'broker.fanout',
    labId: 'broker',
    title: 'Two groups, one topic',
    prompt: 'Groups “billing” and “audit” both subscribe to a topic holding 8 messages and read to the end. How many times is each message processed in total?',
    options: ['1', '2', '8', '16'],
    group: 'audit',
    setup: () => {
      const s = addGroup(addGroup(produceKeys(createBroker({ partitions: 2, retention: 20, commitEvery: 2 }), userKeys(8)), 'billing', 2), 'audit', 1);
      return drain(drain(s, 'billing'), 'audit');
    },
    answer: (s) => String((getGroup(s, 'billing').deliveries.length + getGroup(s, 'audit').deliveries.length) / 8),
    explanation: 'Each group has its own offsets, so each gets every message (fan-out), while members within a group share the partitions (load balancing). Reading never deletes anything from the log.',
  },
  {
    id: 'broker.key-order',
    labId: 'broker',
    title: 'Per-key ordering',
    prompt: 'Every message for user:3 uses “user:3” as its key. With 3 partitions and 3 consumers, are user:3’s messages processed in the order they were produced?',
    options: ['yes', 'no'],
    group: 'orders',
    setup: () => drain(addGroup(produceKeys(createBroker({ partitions: 3, retention: 30, commitEvery: 3 }), userKeys(15)), 'orders', 3), 'orders'),
    answer: (s) => (keyProcessedInOrder(getGroup(s, 'orders'), 'user:3') ? 'yes' : 'no'),
    explanation:
      'The key decides the partition, so every user:3 message lands in the same partition, which one consumer reads in offset order. There is no ordering across partitions — so anything that must stay in order needs the same key.',
  },
  {
    id: 'broker.retention',
    labId: 'broker',
    title: 'Starting after retention kicked in',
    prompt: 'A one-partition topic keeps only the newest 5 messages. 9 messages have been written. A new group starts from the earliest offset. How many of the 9 can it process?',
    options: ['0', '4', '5', '9'],
    group: 'late',
    setup: () => drain(addGroup(produceKeys(createBroker({ partitions: 1, retention: 5, commitEvery: 2 }), userKeys(9)), 'late', 1), 'late'),
    answer: (s) => String(getGroup(s, 'late').deliveries.length),
    explanation:
      'The log is a big but bounded buffer: offsets 0–3 were already deleted. A consumer that falls behind further than the retention window silently loses messages — so alert on consumer lag long before that happens.',
  },
];

export const CHALLENGES_BY_LAB: Record<LabId, readonly Challenge[]> = {
  lsm: LSM_CHALLENGES,
  btree: BTREE_CHALLENGES,
  bloom: BLOOM_CHALLENGES,
  columnar: COLUMNAR_CHALLENGES,
  broker: BROKER_CHALLENGES,
};

export const ALL_CHALLENGES: readonly Challenge[] = Object.values(CHALLENGES_BY_LAB).flat();

/** Runs a challenge's script from scratch and returns the correct option. */
export function solveChallenge(challenge: Challenge): string {
  switch (challenge.labId) {
    case 'lsm':
      return challenge.answer(challenge.ops.reduce(applyOp, createLsm(challenge.config)));
    case 'btree':
      return challenge.answer(insertMany(createBTree(challenge.maxKeys), challenge.inserts));
    case 'broker':
      return challenge.answer(challenge.setup());
    default:
      return challenge.answer();
  }
}
