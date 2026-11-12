import type { PretestQuestion, Scenario, TeachBackPrompt, TradeoffMatrix } from '../types.ts';

/** Answer before reading. Wrong guesses are expected — they prime you for the explanation. */
export const pretest: PretestQuestion[] = [
  {
    id: 'pre.append-only',
    sectionId: 'log-structured',
    prompt: 'Suppose you may only ever append to files, never modify them. How would you make key lookups fast, and what problems would you run into over time?',
    answer:
      'Keep an index (e.g. an in-memory map from key to file offset, or better, sorted files with sparse indexes). Problems: the files grow forever with stale versions, so you need background merging/compaction; restarts must rebuild in-memory indexes; and reads may have to look in many files.',
  },
  {
    id: 'pre.delete',
    sectionId: 'log-structured',
    prompt: 'How would you delete a key from a database whose files are never modified?',
    answer: 'Append a special deletion marker (a tombstone). Reads treat it as “not found”, and background merges use it to drop older values — eventually dropping the tombstone itself.',
  },
  {
    id: 'pre.btree-depth',
    sectionId: 'btrees',
    prompt: 'Relational databases index rows with a tree of fixed-size pages. Guess how many page reads it takes to find one row among billions.',
    answer: 'About 3–4. Each page has hundreds of children, so the tree is extremely shallow: depth grows with log(n).',
  },
  {
    id: 'pre.sequential',
    sectionId: 'comparing',
    prompt: 'Why might writing data in large sequential chunks be faster than many small scattered writes — even on an SSD with no moving parts?',
    answer:
      'Flash can only be erased in large blocks. Scattered writes leave blocks with a mix of live and dead pages, forcing the SSD’s garbage collector to copy data around before erasing — consuming bandwidth and wearing the drive.',
  },
  {
    id: 'pre.in-memory',
    sectionId: 'secondary-indexes',
    prompt: 'If a database fits entirely in RAM, where do you think its main speed advantage over a disk-based database comes from?',
    answer:
      'Not from avoiding disk reads — a disk-based engine with enough RAM serves hot data from the OS cache anyway. The gain is avoiding the overhead of encoding data structures into a disk-friendly format.',
  },
  {
    id: 'pre.columnar',
    sectionId: 'columnar',
    prompt: 'An analytics query sums one column over a billion rows of a 100-column table. How would you lay the data out on disk to make this fast?',
    answer:
      'Store each column separately (column-oriented), so the query reads only the needed column — then compress it, since a single column is highly repetitive, and sort rows so common filters prune data.',
  },
  {
    id: 'pre.map-search',
    sectionId: 'multidim',
    prompt: 'How would you index restaurants so you can quickly find every one inside a rectangle on a map?',
    answer:
      'A plain index on (latitude, longitude) only narrows one dimension. Use a multidimensional index such as an R-tree, a space-filling curve mapped into a B-tree, or a grid of cells.',
  },
  {
    id: 'pre.semantic',
    sectionId: 'vectors',
    prompt: 'How could a search for “close my account” find a help page titled “canceling your subscription”, which shares no words with it?',
    answer: 'Turn both texts into vector embeddings with a model that places similar meanings close together, then search for the nearest vectors using a vector index.',
  },
];

export const teachBack: TeachBackPrompt[] = [
  {
    id: 'tb.lsm',
    prompt:
      'Explain to a junior engineer how an LSM-tree turns random writes into sequential ones — and what that costs on the read side and in background work.',
    sectionIds: ['log-structured', 'comparing'],
    keyPoints: [
      'Writes buffer in a sorted memtable (plus WAL for durability)',
      'Memtable flushes as one sequential, immutable SSTable',
      'Reads may need to check memtable plus several SSTables',
      'Bloom filters skip segments for point reads; ranges still merge across segments',
      'Compaction rewrites data repeatedly → write amplification and competition for disk bandwidth',
      'Can stall writes (backpressure) if compaction falls behind',
    ],
  },
  {
    id: 'tb.btree-wal',
    prompt: 'Explain why a B-tree needs a write-ahead log. What exactly could go wrong without one?',
    sectionIds: ['btrees'],
    keyPoints: [
      'B-trees overwrite pages in place',
      'A split changes several pages (two halves + parent, maybe more)',
      'Crash mid-way → orphaned pages / inconsistent tree',
      'Torn pages if a page write isn’t atomic',
      'WAL appended and fsynced before page writes; replayed on recovery',
      'Also lets dirty pages be buffered in memory safely',
    ],
  },
  {
    id: 'tb.columnar',
    prompt: 'Explain why analytics databases store data by column, and how compression and sort order multiply the benefit.',
    sectionIds: ['columnar', 'query-execution'],
    keyPoints: [
      'Queries read a few columns of very wide tables',
      'Column layout reads only those columns',
      'Columns are repetitive → bitmap + run-length encoding',
      'Sorting rows by a common filter key prunes scans and creates long runs',
      'Bitmaps turn filters into fast AND/OR; vectorized execution works on compressed data',
      'Writes are batched (in-memory store merged into new files)',
    ],
  },
];

export const scenarios: Scenario[] = [
  {
    id: 'sc.telemetry',
    title: 'Fleet telemetry ingest',
    brief:
      'You ingest ~200,000 sensor readings per second from delivery vans. Each reading is (van_id, timestamp, metrics). The app shows each van’s latest reading and its last hour of readings. Data older than 30 days is deleted.',
    requirements: ['Sustain very high write throughput', 'Fast “last hour for van X” range reads', 'Bulk expiry of old data'],
    questions: [
      'LSM-based or B-tree-based storage engine? Why?',
      'How would you design the key so the per-van range query is efficient?',
      'Which compaction strategy, and what are the risks?',
      'How would you benchmark this before committing?',
    ],
    keyPoints: [
      'Write-heavy → LSM engine (sequential writes, lower write amplification)',
      'Concatenated key (van_id, timestamp) keeps each van’s readings contiguous for range scans',
      'Bloom filters help point lookups but not the range scan',
      'Size-tiered favours write throughput; watch temporary disk space',
      'Expiry via deletes/TTL creates tombstones; space reclaimed only through compaction',
      'Benchmark long enough for compaction (and backpressure) to appear',
    ],
    sectionIds: ['log-structured', 'comparing', 'multidim'],
  },
  {
    id: 'sc.ledger',
    title: 'Account balance service',
    brief:
      'A payments service mostly reads account balances by account_id with a strict p99 latency target; writes are moderate. Ops occasionally needs balance-by-customer lookups too.',
    requirements: ['Predictable low read latency', 'Durable writes', 'Secondary lookup by customer'],
    questions: [
      'Which storage engine family fits, and why?',
      'How do you guarantee committed writes survive a crash?',
      'How would you support lookup by customer efficiently, and what does it cost?',
    ],
    keyPoints: [
      'Read-heavy with tight tail latency → B-tree (one page per level, predictable)',
      'Avoids LSM backpressure stalls and multi-segment reads',
      'WAL + fsync before acknowledging writes',
      'Secondary index on customer_id (non-unique: row-ID lists or appended row IDs)',
      'A covering index can answer balance lookups without touching the row',
      'Every extra index slows writes and uses space',
    ],
    sectionIds: ['btrees', 'comparing', 'secondary-indexes'],
  },
  {
    id: 'sc.analytics',
    title: 'Product analytics dashboard',
    brief:
      'Five billion click events with 150 columns. Dashboards filter by date range and event type and sum a few numeric columns. New events arrive continuously from an ETL pipeline. The home page shows the same few charts to everyone.',
    requirements: ['Interactive aggregate queries', 'Continuous ingestion', 'Cheap, elastic storage'],
    questions: [
      'How would you lay out and sort the data?',
      'How do filters on event type get fast?',
      'How do new events get in without rewriting everything?',
      'Should the home-page charts read raw data?',
    ],
    keyPoints: [
      'Column-oriented storage: read only the few columns used',
      'Blocks by time range; sort by date first, then event type',
      'Bitmap/RLE encoding; filters as bitmap AND/OR; vectorized or compiled execution',
      'Writes buffered in memory and merged into new immutable column files in bulk',
      'Object storage + table format (e.g. Iceberg) for elasticity',
      'Materialized aggregates/data cube for the fixed charts, keeping raw data for ad hoc queries',
    ],
    sectionIds: ['analytics-storage', 'columnar', 'query-execution'],
  },
  {
    id: 'sc.help-search',
    title: 'Help-center search',
    brief: 'Users search help articles with typos (“pasword”), partial words (“subscr”) and different phrasing (“close my account” for “canceling your subscription”).',
    requirements: ['Typo tolerance', 'Substring matches', 'Meaning-based matches'],
    questions: ['Which index handles each requirement?', 'What are the accuracy/speed trade-offs of the vector index you pick?'],
    keyPoints: [
      'Inverted index (term → postings) for keyword search',
      'Edit-distance search (Levenshtein automaton) for typos',
      'Trigram index for substrings (larger index)',
      'Embeddings + vector index for semantic matches',
      'IVF/HNSW are approximate; more probes = more accurate but slower; flat is exact but slow',
    ],
    sectionIds: ['multidim', 'vectors'],
  },
];

export const tradeoffs: TradeoffMatrix[] = [
  {
    id: 'tm.lsm-btree',
    title: 'LSM-tree vs B-tree',
    columns: [
      { id: 'lsm', label: 'LSM-tree' },
      { id: 'btree', label: 'B-tree' },
    ],
    rows: [
      { id: 'write-throughput', dimension: 'Sustained write throughput', answer: 'lsm', why: 'Large sequential segment writes and typically lower write amplification.' },
      { id: 'point-reads', dimension: 'Predictable point-read latency', answer: 'btree', why: 'One page per level, few levels. LSM may consult several SSTables (Bloom filters mitigate).' },
      { id: 'range', dimension: 'Range queries', answer: 'btree', why: 'Walk sorted leaves. LSM must merge across all segments and Bloom filters can’t help.' },
      { id: 'write-amp', dimension: 'Lower write amplification (typical)', answer: 'lsm', why: 'No whole-page rewrites and compressed blocks — though it depends on key/value sizes and overwrite patterns.' },
      { id: 'space', dimension: 'Disk footprint & fragmentation', answer: 'lsm', why: 'Compaction defragments and compresses; B-trees leave free pages mid-file. (Size-tiered needs temporary space.)' },
      { id: 'snapshots', dimension: 'Cheap snapshots', answer: 'lsm', why: 'Immutable segment files: record the list and keep them.' },
      { id: 'deletion', dimension: 'Prompt physical deletion', answer: 'btree', why: 'LSM copies survive until the tombstone propagates through all levels.' },
      { id: 'burst-latency', dimension: 'Latency under write bursts', answer: 'btree', why: 'LSM engines may apply backpressure and stall when the memtable can’t flush.' },
      { id: 'ssd-wear', dimension: 'SSD wear', answer: 'lsm', why: 'Sequential writes and lower write amplification mean less flash garbage collection.' },
    ],
  },
  {
    id: 'tm.row-column',
    title: 'Row-oriented vs column-oriented storage',
    columns: [
      { id: 'row', label: 'Row store' },
      { id: 'column', label: 'Column store' },
    ],
    rows: [
      { id: 'fetch-record', dimension: 'Fetch one full record by key', answer: 'row', why: 'The whole row is contiguous; a column store must gather it from every column.' },
      { id: 'aggregate', dimension: 'Aggregate 3 of 150 columns over a billion rows', answer: 'column', why: 'Reads only the 3 columns needed.' },
      { id: 'single-insert', dimension: 'Frequent single-row inserts/updates', answer: 'row', why: 'Column stores must batch writes and rewrite compressed column files.' },
      { id: 'compression', dimension: 'Compression ratio', answer: 'column', why: 'Values in one column are similar and repetitive; sorting creates long runs.' },
      { id: 'filters', dimension: 'Filters on low-cardinality columns', answer: 'column', why: 'Bitmap indexes turn filters into bitwise AND/OR.' },
      { id: 'cpu', dimension: 'CPU efficiency of large scans', answer: 'column', why: 'Tight loops over contiguous values, SIMD, operating on compressed data.' },
    ],
  },
];
