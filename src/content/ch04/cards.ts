import type { CardDraft } from '../types.ts';

/**
 * Original questions and answers in study-note form. Kinds:
 * recall (facts), explain (mechanisms), compare (trade-offs),
 * failure (what breaks and why), scenario (apply it), choice (discriminate).
 */
export const cards: CardDraft[] = [
  // ── Logs, indexes and the core trade-off ──────────────────────────────
  {
    id: 'ch04.001',
    sectionId: 'oltp-intro',
    conceptIds: ['append-only-log'],
    kind: 'explain',
    prompt: 'A key-value store appends `key,value` lines to a file and reads by searching for the key. Why are its writes fast but its reads slow?',
    answer:
      'A write is a single append to the end of the file — the simplest, cheapest disk operation. A read has to scan the entire file and keep the last match, so lookup cost grows linearly with the number of records (O(n)).',
    keyPoints: [
      'Writes are sequential appends — nothing to look up or rearrange',
      'Reads scan the whole file: O(n)',
      'The last occurrence of a key is the current value',
    ],
  },
  {
    id: 'ch04.002',
    sectionId: 'oltp-intro',
    conceptIds: ['index-tradeoff'],
    kind: 'explain',
    prompt: 'What is an index, and why don’t databases simply index every column by default?',
    answer:
      'An index is an additional structure derived from the primary data that makes certain lookups fast. Adding or dropping it never changes the data, only query performance. But every index must be updated on every write and takes disk space, so you choose indexes from your known query patterns.',
    keyPoints: [
      'Derived structure — changes performance, not the data',
      'Each index slows down writes (it must be maintained on every write)',
      'Each index consumes disk space',
      'Chosen deliberately from the application’s query patterns',
    ],
  },
  {
    id: 'ch04.003',
    sectionId: 'oltp-intro',
    conceptIds: ['append-only-log'],
    kind: 'choice',
    prompt: 'In the context of storage engines, “log” most precisely means…',
    options: [
      { text: 'Human-readable text an application prints about what it is doing', why: 'That’s an application log — a different, narrower meaning.' },
      { text: 'An append-only sequence of records on disk, possibly binary and internal to the database', correct: true },
      { text: 'A table that records who changed what, for auditing', why: 'An audit table may be built on a log, but that’s not what the term means here.' },
      { text: 'Any file that is periodically rotated and deleted', why: 'Rotation is an operational detail, not the defining property.' },
    ],
    explanation: 'The defining property is append-only. Logs show up again and again in the book: WALs, replication logs, event streams.',
  },

  // ── Log-structured storage ────────────────────────────────────────────
  {
    id: 'ch04.004',
    sectionId: 'log-structured',
    conceptIds: ['hash-index'],
    kind: 'explain',
    prompt: 'How does an in-memory hash index over an append-only log serve a read?',
    answer:
      'The hash map stores, for every key, the byte offset of its most recent record in the log. A read looks up the offset, seeks there and reads the value. On every append the map is updated with the new offset. If that part of the file is in the OS page cache, no disk I/O is needed at all.',
    keyPoints: ['Map key → byte offset of the latest value', 'Seek directly to the offset and read', 'Updated on every append'],
  },
  {
    id: 'ch04.005',
    sectionId: 'log-structured',
    conceptIds: ['hash-index'],
    kind: 'failure',
    prompt: 'List the problems with indexing an append-only log using only an in-memory hash map.',
    answer:
      'Disk space is never reclaimed from overwritten records. The map is lost on restart and must be rebuilt by scanning the log (slow restarts). All keys must fit in memory — on-disk hash maps perform poorly (random I/O, costly resizing, collision handling). And range queries are inefficient because hash order is unrelated to key order.',
    keyPoints: [
      'Old overwritten records keep consuming disk',
      'Map must be rebuilt on restart by scanning — slow',
      'All keys must fit in RAM; on-disk hash maps perform badly',
      'No efficient range queries',
    ],
  },
  {
    id: 'ch04.006',
    sectionId: 'log-structured',
    conceptIds: ['sstable'],
    kind: 'explain',
    prompt: 'What is an SSTable, and why can its index be sparse?',
    answer:
      'A Sorted String Table stores key-value pairs sorted by key, with each key appearing once. Because of the ordering, you can group records into blocks of a few KB and index only the first key of each block. To find any key you jump to the block whose range covers it and scan that block. Blocks can also be compressed.',
    keyPoints: [
      'Sorted by key, each key at most once',
      'Index only the first key per block (sparse index)',
      'Find the covering block, then scan a few KB',
      'Blocks can be compressed — less disk and I/O, a bit more CPU',
    ],
  },
  {
    id: 'ch04.007',
    sectionId: 'log-structured',
    conceptIds: ['sstable'],
    kind: 'choice',
    prompt: 'An SSTable’s sparse index contains `handbag → block A` and `handsome → block B` (adjacent). You look up `handiwork`. What happens?',
    options: [
      { text: 'Not found — the key isn’t in the index', why: 'A sparse index deliberately omits most keys.' },
      { text: 'Read block A and scan it for handiwork', correct: true },
      { text: 'Binary search the entire file', why: 'The index already narrows it to one block.' },
      { text: 'Read block B and scan backward', why: 'handiwork sorts before handsome, so it can only be in block A.' },
    ],
    explanation: 'Sort order guarantees handbag ≤ handiwork < handsome, so the key can only live in the block starting at handbag.',
  },
  {
    id: 'ch04.008',
    sectionId: 'log-structured',
    conceptIds: ['memtable'],
    kind: 'explain',
    prompt: 'Trace a write through an LSM storage engine from the moment it arrives until it is in an SSTable.',
    answer:
      'The write is appended to a WAL on disk for durability and inserted into the memtable — an in-memory ordered structure such as a red-black tree, skip list or trie. When the memtable exceeds a threshold (a few MB) it is written out in sorted order as a new SSTable segment, while new writes go to a fresh memtable. Once the flush completes, that part of the WAL can be discarded.',
    keyPoints: [
      'Append to the WAL (unsorted, only for crash recovery)',
      'Insert into the sorted in-memory memtable',
      'Past a threshold, write it out sequentially as a new immutable SSTable',
      'A new memtable takes writes during the flush; WAL is truncated afterwards',
    ],
  },
  {
    id: 'ch04.009',
    sectionId: 'log-structured',
    conceptIds: ['memtable', 'compaction'],
    kind: 'explain',
    prompt: 'How does an LSM engine answer a read for a key?',
    answer:
      'Check the memtable first, then the on-disk segments from newest to oldest, stopping at the first match (which might be a tombstone meaning “deleted”). If no segment contains the key, it doesn’t exist. Bloom filters let it skip segments that definitely don’t contain the key.',
    keyPoints: ['Memtable first', 'Then segments newest → oldest; first hit wins', 'Absent everywhere = doesn’t exist', 'Bloom filters skip segments'],
  },
  {
    id: 'ch04.010',
    sectionId: 'log-structured',
    conceptIds: ['compaction'],
    kind: 'explain',
    prompt: 'How are SSTable segments merged, and why does merging need very little memory?',
    answer:
      'Like the merge step of mergesort: read all input files side by side, repeatedly emit the smallest current key, and when a key appears in several inputs keep only the value from the most recent segment. The output is again sorted with one value per key. Since you only ever hold the current key of each input, memory use is tiny regardless of file size.',
    keyPoints: [
      'Mergesort-style streaming over sorted inputs',
      'Duplicate keys: keep the newest segment’s value',
      'Output is sorted, one entry per key',
      'Only one key per input in memory at a time',
    ],
  },
  {
    id: 'ch04.011',
    sectionId: 'log-structured',
    conceptIds: ['memtable'],
    kind: 'failure',
    prompt: 'The database crashes halfway through writing a new SSTable, and the WAL’s last record is half-written. What happens on restart?',
    answer:
      'Because segments are written in one pass and are immutable afterwards, the unfinished SSTable is simply deleted and the work restarted. The memtable is rebuilt by replaying the WAL; checksums detect the torn or corrupt last record, which is discarded.',
    keyPoints: [
      'Unfinished segment is just deleted — immutability makes this safe',
      'Memtable contents are rebuilt from the WAL',
      'Checksums detect incomplete/corrupt WAL records, which are dropped',
    ],
  },
  {
    id: 'ch04.012',
    sectionId: 'log-structured',
    conceptIds: ['tombstone'],
    kind: 'explain',
    prompt: 'How do you delete a key in an LSM-tree, and when can the deletion marker itself be removed?',
    answer:
      'Write a special tombstone record for the key. Reads that hit the tombstone report “not found”, and merges use it to discard older values. The tombstone can only be dropped once it has been merged into the oldest segment — before that, an older segment could still hold a value it needs to hide.',
    keyPoints: [
      'Append a tombstone (deletion record)',
      'Merges discard older values for that key',
      'Tombstone can be dropped only after reaching the oldest data',
    ],
  },
  {
    id: 'ch04.013',
    sectionId: 'log-structured',
    conceptIds: ['compaction', 'memtable'],
    kind: 'explain',
    prompt: 'Why are LSM segment files a natural fit for object storage, and how can reads continue during a merge?',
    answer:
      'Segments are written once in a single pass and never modified, matching object stores that favour whole-object writes (e.g. SlateDB, Delta Lake). During a merge, reads keep using the old input segments; when the merged file is complete, reads switch to it and the inputs are deleted.',
    keyPoints: [
      'Write-once immutable files suit object storage',
      'Reads use the input segments until the merge finishes',
      'Then switch to the merged segment and delete the inputs',
    ],
  },
  {
    id: 'ch04.014',
    sectionId: 'log-structured',
    conceptIds: ['bloom-filter'],
    kind: 'explain',
    prompt: 'How does a Bloom filter work, and what kind of mistake can it make?',
    answer:
      'It is a bit array. Adding a key hashes it to several bit positions and sets them to 1. To query, hash the key the same way: if any of those bits is 0, the key is definitely absent; if all are 1, it is probably present. It can give false positives (bits set by other keys), never false negatives.',
    keyPoints: [
      'Bit array; each key sets k hashed positions',
      'Any 0 bit → definitely absent',
      'All 1s → maybe present',
      'False positives possible, false negatives impossible',
    ],
  },
  {
    id: 'ch04.015',
    sectionId: 'log-structured',
    conceptIds: ['bloom-filter'],
    kind: 'choice',
    prompt: 'During an LSM read, a segment’s Bloom filter says “maybe present”, but it’s a false positive. What’s the consequence?',
    options: [
      { text: 'The read returns a wrong value', why: 'The engine still checks the actual block, so correctness is unaffected.' },
      { text: 'Some wasted work reading that block, then the search continues in the next-older segment', correct: true },
      { text: 'The read fails and must be retried', why: 'Nothing fails; it’s just slower.' },
      { text: 'The filter is rebuilt', why: 'Filters are built once with the immutable segment.' },
    ],
    explanation: 'False positives cost performance, never correctness — which is why an approximate structure is acceptable here.',
  },
  {
    id: 'ch04.016',
    sectionId: 'log-structured',
    conceptIds: ['bloom-filter'],
    kind: 'recall',
    prompt: 'Rule of thumb for Bloom filter sizing: how many bits per key give ~1% false positives, and what do more bits buy?',
    answer: 'About 10 bits per key gives roughly 1% false positives; every additional ~5 bits per key cuts the rate by about 10×.',
    keyPoints: ['~10 bits/key → ~1%', '+5 bits/key → ~10× fewer false positives'],
  },
  {
    id: 'ch04.017',
    sectionId: 'log-structured',
    conceptIds: ['compaction-strategies'],
    kind: 'compare',
    prompt: 'Compare size-tiered and leveled compaction. When would you choose each?',
    answer:
      'Size-tiered merges newer, smaller SSTables into older, larger ones. Data is rewritten only a few times, so it sustains very high write throughput, but old tables get huge and merging them needs lots of temporary disk space. Leveled compaction keeps SSTables a fixed size in levels (L0, L1, …); beyond L0 each level is partitioned by key range and is larger than the previous one; tables are pushed down incrementally. Reads check fewer tables and disk usage is lower. Choose size-tiered for write-mostly workloads, leveled for read-dominated ones (or when a few keys are written very often).',
    keyPoints: [
      'Size-tiered: merge similar-size tables into bigger ones; best write throughput',
      'Size-tiered: big tables, lots of temporary disk space',
      'Leveled: fixed-size tables in key-range-partitioned levels, each larger than the last',
      'Leveled: incremental, less disk space, fewer tables to check per read',
      'Write-heavy → size-tiered; read-heavy → leveled',
    ],
  },
  {
    id: 'ch04.018',
    sectionId: 'log-structured',
    conceptIds: ['compaction-strategies', 'compaction'],
    kind: 'choice',
    prompt: 'Four 256 MB SSTables are merged by size-tiered compaction. The result is ~900 MB, not 1,024 MB. Why?',
    options: [
      { text: 'The output is compressed more aggressively', why: 'The shrinkage comes from data that no longer needs to exist.' },
      { text: 'Overwritten values, deleted keys and expired (TTL) data are dropped during the merge', correct: true },
      { text: 'The Bloom filters are discarded', why: 'Filters are small and are rebuilt for the output.' },
      { text: 'Size-tiered compaction samples a subset of keys', why: 'No data is lost; only obsolete versions go.' },
    ],
    explanation: 'Compaction’s whole point is to reclaim space from obsolete versions, tombstoned keys and expired data.',
  },
  {
    id: 'ch04.019',
    sectionId: 'log-structured',
    conceptIds: ['embedded-db'],
    kind: 'explain',
    prompt: 'What is an embedded storage engine, and when is one a good backend choice?',
    answer:
      'A database that runs as a library inside your application process, reading and writing local files through normal function calls — no network API (RocksDB, SQLite, LMDB, DuckDB, KùzuDB). Common in mobile apps. On a backend it fits when the data fits on one machine and concurrency is modest — e.g. one embedded database per tenant when tenants are small and never queried together.',
    keyPoints: [
      'Library in the same process; function calls, local files',
      'Data fits on one machine, few concurrent transactions',
      'Per-tenant databases in multitenant systems with isolated tenants',
    ],
  },

  // ── B-trees ───────────────────────────────────────────────────────────
  {
    id: 'ch04.020',
    sectionId: 'btrees',
    conceptIds: ['btree-structure'],
    kind: 'compare',
    prompt: 'How do B-trees and LSM-trees differ in the way they break up data on disk?',
    answer:
      'LSM engines write variable-size segments (MBs or more) once and never modify them. B-trees divide the file into fixed-size pages (traditionally 4 KiB; PostgreSQL 8 KiB, MySQL 16 KiB) and overwrite pages in place. Pages reference each other by page number; page number × page size gives the byte offset.',
    keyPoints: [
      'LSM: variable-size immutable segments, written once',
      'B-tree: fixed-size pages overwritten in place',
      'Pages reference children by page number (offset = number × size)',
    ],
  },
  {
    id: 'ch04.021',
    sectionId: 'btrees',
    conceptIds: ['btree-structure'],
    kind: 'explain',
    prompt: 'Walk through looking up a key in a B-tree.',
    answer:
      'Start at the root page. Its keys are boundaries between child ranges; follow the reference whose range contains your key. Repeat at each level until you reach a leaf page, which holds the value inline or a reference to where it is stored.',
    keyPoints: ['Start at the root', 'Boundary keys select the child range', 'One page per level down to a leaf', 'Leaf holds the value or a reference to it'],
  },
  {
    id: 'ch04.022',
    sectionId: 'btrees',
    conceptIds: ['btree-structure'],
    kind: 'choice',
    prompt: 'A four-level B-tree of 4 KiB pages with a branching factor of 500 can hold roughly…',
    options: [
      { text: '250 GB', why: 'Off by a factor of ~1,000: 500⁴ × 4 KiB ≈ 2.5 × 10¹⁴ bytes.' },
      { text: '250 TB', correct: true },
      { text: '2.5 PB', why: 'Too large: 500⁴ ≈ 6 × 10¹⁰ pages of 4 KiB.' },
      { text: '25 TB', why: 'Too small by 10×.' },
    ],
    explanation: '500⁴ ≈ 6.25 × 10¹⁰ pages × 4 KiB ≈ 250 TB. That’s why most databases need only 3–4 levels.',
  },
  {
    id: 'ch04.023',
    sectionId: 'btrees',
    conceptIds: ['btree-split'],
    kind: 'explain',
    prompt: 'You insert a key whose leaf page is already full. What happens, and why does the tree stay balanced?',
    answer:
      'The page splits into two half-full pages and the parent gains a boundary key and a reference to the new page. If the parent is also full it splits too, possibly all the way up; when the root splits, a new root is created above it. Because growth happens at the top, every leaf stays at the same depth — O(log n).',
    keyPoints: [
      'Split into two half-full pages',
      'Parent gets a new boundary key + child reference',
      'Splits can cascade; a root split creates a new root',
      'Tree grows at the top, so depth is O(log n) and balanced',
    ],
  },
  {
    id: 'ch04.024',
    sectionId: 'btrees',
    conceptIds: ['btree-structure'],
    kind: 'recall',
    prompt: 'What is the branching factor of a B-tree, and how large is it typically?',
    answer:
      'The number of child references in one page. It depends on how much space references and boundary keys take, and is typically several hundred.',
    keyPoints: ['Number of child references per page', 'Typically several hundred'],
  },
  {
    id: 'ch04.025',
    sectionId: 'btrees',
    conceptIds: ['wal-btree'],
    kind: 'failure',
    prompt: 'Why is a page split dangerous if the machine crashes, and what protects against it?',
    answer:
      'A split overwrites several pages. If only some reach disk, the tree is corrupt — for example an orphan page with no parent. If the hardware can’t write a page atomically you can even get a torn (half-written) page. B-trees therefore append every change to a write-ahead log, fsynced before the pages are modified; after a crash the log is replayed to restore a consistent tree (filesystems call this journaling).',
    keyPoints: [
      'Multiple pages overwritten → partial write corrupts the tree (orphan pages)',
      'Torn pages when a page write isn’t atomic',
      'WAL: append + fsync every change before touching pages',
      'Replay the WAL on recovery',
    ],
  },
  {
    id: 'ch04.026',
    sectionId: 'btrees',
    conceptIds: ['wal-btree'],
    kind: 'explain',
    prompt: 'B-trees buffer modified pages in memory instead of writing them immediately. Why is that safe?',
    answer:
      'Durability comes from the WAL: once a change is in the log and fsynced, it can be recovered after a crash even if the page itself was never written. Delaying page writes improves performance without risking data loss.',
    keyPoints: ['WAL + fsync makes the change durable', 'Pages can be written later', 'Recovery replays the log'],
  },
  {
    id: 'ch04.027',
    sectionId: 'btrees',
    conceptIds: ['cow-btree'],
    kind: 'explain',
    prompt: 'What is a copy-on-write B-tree, and what does it buy you?',
    answer:
      'Instead of overwriting a page in place (and needing a WAL), the modified page is written to a new location and new versions of its parents are created, up to the root, pointing at it (LMDB works this way). Old versions stay intact, which also helps concurrency control such as snapshot isolation.',
    keyPoints: [
      'Modified page written to a new location',
      'New versions of parents up to the root',
      'No in-place overwrite / WAL needed for crash safety',
      'Old versions remain readable — useful for snapshots',
    ],
  },
  {
    id: 'ch04.028',
    sectionId: 'btrees',
    conceptIds: ['cow-btree'],
    kind: 'recall',
    prompt: 'Name three B-tree optimizations besides copy-on-write.',
    answer:
      'Abbreviating keys in interior pages (they only need to separate ranges), which raises the branching factor and lowers depth; laying leaf pages out sequentially on disk to speed range scans (hard to maintain as the tree grows); and sibling pointers between leaves so scans don’t climb back to parents.',
    keyPoints: ['Abbreviated keys → higher branching factor', 'Sequential leaf layout for scans', 'Sibling pointers between leaf pages'],
  },

  // ── Comparing ─────────────────────────────────────────────────────────
  {
    id: 'ch04.029',
    sectionId: 'comparing',
    conceptIds: ['read-perf', 'write-amp'],
    kind: 'compare',
    prompt: 'What’s the rule of thumb for LSM-trees vs B-trees, and what’s the important caveat?',
    answer:
      'LSM-trees tend to suit write-heavy workloads; B-trees tend to be faster for reads. But benchmarks are very sensitive to workload details — test with your own workload. It’s also not either/or: some engines blend the approaches (e.g. several B-trees merged LSM-style).',
    keyPoints: ['LSM → write-heavy', 'B-tree → read-heavy', 'Benchmark your own workload', 'Hybrids exist'],
  },
  {
    id: 'ch04.030',
    sectionId: 'comparing',
    conceptIds: ['read-perf', 'bloom-filter'],
    kind: 'explain',
    prompt: 'Why are range queries relatively more expensive than point lookups in an LSM engine?',
    answer:
      'A range scan must read every segment that might hold keys in the range and merge the results. Bloom filters can’t help, because you would need to hash every possible key in the range. A B-tree just walks its sorted leaves.',
    keyPoints: ['Must scan all segments in parallel and merge', 'Bloom filters can’t prune ranges', 'B-trees walk sorted leaves'],
  },
  {
    id: 'ch04.031',
    sectionId: 'comparing',
    conceptIds: ['read-perf', 'memtable'],
    kind: 'failure',
    prompt: 'Under a sustained burst of writes, an LSM database suddenly shows huge latency spikes on both reads and writes. Explain the mechanism.',
    answer:
      'Flushing and compaction can’t keep up with incoming writes, so the memtable fills. Engines such as RocksDB then apply backpressure: they suspend reads and writes until the memtable has been written to disk.',
    keyPoints: ['Compaction/flush falls behind', 'Memtable fills up', 'Backpressure: reads and writes stall until it flushes'],
  },
  {
    id: 'ch04.032',
    sectionId: 'comparing',
    conceptIds: ['seq-vs-random'],
    kind: 'explain',
    prompt: 'SSDs have no moving parts. Why do sequential writes still beat random writes on them?',
    answer:
      'Flash is written a page (~4 KiB) at a time but erased only a block (~512 KiB) at a time. Before erasing, the controller must copy still-valid pages elsewhere (garbage collection). Sequential writes tend to fill whole blocks with one file, which can later be erased without copying. Random writes leave blocks with a mix of valid and stale pages, so GC does more work — stealing write bandwidth and wearing out the drive faster.',
    keyPoints: [
      'Write per page, erase per block',
      'GC must relocate valid pages before erasing',
      'Sequential: whole blocks freed together, little GC',
      'Random: mixed blocks → more GC, less bandwidth, more wear',
    ],
  },
  {
    id: 'ch04.033',
    sectionId: 'comparing',
    conceptIds: ['write-amp'],
    kind: 'recall',
    prompt: 'Define write amplification and say why it matters.',
    answer:
      'Total bytes written to disk divided by the bytes you would write with a plain append-only log and no index (sometimes measured in I/O operations). If disk bandwidth is the bottleneck, higher write amplification means fewer writes per second; it also wears SSDs faster.',
    keyPoints: ['Bytes written to disk ÷ bytes of a plain append-only log', 'Limits write throughput when disk-bound', 'Increases SSD wear'],
  },
  {
    id: 'ch04.034',
    sectionId: 'comparing',
    conceptIds: ['write-amp'],
    kind: 'compare',
    prompt: 'Where does write amplification come from in an LSM-tree versus a B-tree, and which is typically lower?',
    answer:
      'LSM: once to the WAL, again when the memtable is flushed, and again in every compaction that includes the key (storing large values separately from keys reduces this). B-tree: at least twice — WAL and page — and a whole page is written even if a few bytes changed, to stay recoverable. LSM is typically lower because it avoids whole-page rewrites and compresses SSTable blocks.',
    keyPoints: [
      'LSM: WAL + flush + each compaction',
      'B-tree: WAL + page, rewriting whole pages for small changes',
      'Usually lower for LSM (no whole pages, compression)',
      'Key–value separation helps LSM with large values',
    ],
  },
  {
    id: 'ch04.035',
    sectionId: 'comparing',
    conceptIds: ['write-amp', 'compaction'],
    kind: 'failure',
    prompt: 'A 5-minute benchmark on an empty database shows an LSM engine with spectacular write throughput. What’s wrong with the test?',
    answer:
      'On an empty LSM-tree no compactions are running yet, so all disk bandwidth goes to new writes. As data grows, compaction competes for the same bandwidth. The benchmark must run long enough for write amplification to show up.',
    keyPoints: ['No compaction yet on an empty database', 'Later, compaction shares disk bandwidth', 'Run long enough to see steady-state write amplification'],
  },
  {
    id: 'ch04.036',
    sectionId: 'comparing',
    conceptIds: ['disk-space'],
    kind: 'compare',
    prompt: 'Compare disk-space behaviour of B-trees and LSM-trees (fragmentation, compression, overhead).',
    answer:
      'B-trees fragment: after many deletes, free pages sit in the middle of the file and can be reused but not easily returned to the OS, so a background process (e.g. PostgreSQL’s vacuum) reorganizes pages. LSM compaction rewrites files anyway, SSTables have no half-empty pages and compress better, so files are often smaller. But overwritten values occupy space until compacted — little overhead with leveled compaction, more (especially temporarily) with size-tiered.',
    keyPoints: [
      'B-trees: free pages mid-file, need vacuum-style maintenance',
      'LSM: compaction defragments, no empty page space, better compression',
      'LSM: stale values linger until compacted',
      'Size-tiered uses more (temporary) space than leveled',
    ],
  },
  {
    id: 'ch04.037',
    sectionId: 'comparing',
    conceptIds: ['disk-space', 'tombstone'],
    kind: 'failure',
    prompt: 'A data-protection request requires you to be sure a user’s record is gone from disk. Why is that tricky with an LSM engine?',
    answer:
      'Deleting writes a tombstone, but older copies remain in lower levels until the tombstone has been compacted through every level, which may take a long time. Specialized designs exist to propagate deletes faster.',
    keyPoints: ['Delete = tombstone, old copies still on disk', 'Gone only after the tombstone reaches all levels', 'May take a long time'],
  },
  {
    id: 'ch04.038',
    sectionId: 'comparing',
    conceptIds: ['disk-space'],
    kind: 'explain',
    prompt: 'Why are point-in-time snapshots (for backups or test copies) cheap in an LSM engine but harder in a B-tree?',
    answer:
      'Flush the memtable and record which segment files exist. Those files are immutable, so as long as you don’t delete them they are the snapshot — no copying needed. A B-tree overwrites pages in place, so the state at a moment in time isn’t preserved automatically.',
    keyPoints: ['Flush memtable + record the segment list', 'Immutable files = no copy needed', 'In-place overwrites make B-tree snapshots harder'],
  },

  // ── Secondary indexes, values, in-memory ──────────────────────────────
  {
    id: 'ch04.039',
    sectionId: 'secondary-indexes',
    conceptIds: ['secondary-index'],
    kind: 'explain',
    prompt: 'Secondary index keys aren’t unique. What are the two ways to handle that?',
    answer:
      'Either make each index value a list of matching row IDs (like a postings list in full-text search), or make each entry unique by appending the row ID to the key. Both B-trees and log-structured storage can implement either.',
    keyPoints: ['Value = list of matching row IDs', 'Or append the row ID to make keys unique', 'Works with B-trees and LSM'],
  },
  {
    id: 'ch04.040',
    sectionId: 'secondary-indexes',
    conceptIds: ['index-values'],
    kind: 'compare',
    prompt: 'Contrast a clustered index, a heap-file reference, and a covering index.',
    answer:
      'Clustered: the row itself is stored in the index (InnoDB’s primary key; SQL Server allows one per table). Reference: the index stores either the primary key (InnoDB secondary indexes) or a location in a heap file where rows are kept in no particular order (PostgreSQL). Covering (included columns): the index also stores some columns so certain queries are answered from the index alone — faster reads at the cost of space and slower writes.',
    keyPoints: [
      'Clustered: row stored inside the index',
      'Reference to primary key, or to a heap-file location',
      'Heap file: rows in no particular order',
      'Covering: extra columns in the index; faster reads, more space, slower writes',
    ],
  },
  {
    id: 'ch04.041',
    sectionId: 'secondary-indexes',
    conceptIds: ['index-values'],
    kind: 'failure',
    prompt: 'A row in a heap file is updated with a larger value that no longer fits where it is. What are the options?',
    answer:
      'The row must move to a new heap location with enough space. Then either every index pointing at it is updated to the new location, or a forwarding pointer is left at the old location. (A same-size or smaller update can be done in place.)',
    keyPoints: ['Row moves to a new location', 'Update all indexes, or', 'Leave a forwarding pointer at the old spot'],
  },
  {
    id: 'ch04.042',
    sectionId: 'secondary-indexes',
    conceptIds: ['in-memory-db'],
    kind: 'choice',
    prompt: 'The main reason in-memory databases outperform disk-based ones is that…',
    options: [
      { text: 'they never read from disk', why: 'A disk-based engine with enough RAM rarely reads from disk either — the OS caches hot blocks.' },
      { text: 'they avoid the overhead of encoding in-memory data structures into a disk-friendly form', correct: true },
      { text: 'they give up durability entirely', why: 'Many are durable via logs, snapshots or replication.' },
      { text: 'RAM has higher bandwidth than SSDs', why: 'True, but caching already captures most of that benefit.' },
    ],
    explanation: 'Counterintuitive but important: the win is in data-structure overhead, not I/O avoidance.',
  },
  {
    id: 'ch04.043',
    sectionId: 'secondary-indexes',
    conceptIds: ['in-memory-db'],
    kind: 'explain',
    prompt: 'How can an in-memory database still be durable, and what else do in-memory designs enable?',
    answer:
      'By battery-backed RAM, or more commonly an append-only log of changes on disk, periodic snapshots, or replication to other machines — reads are still served entirely from memory. Some products (e.g. Redis) write asynchronously, giving weaker durability. Keeping everything in RAM also makes data models that are awkward on disk easy to offer, such as priority queues and sets.',
    keyPoints: [
      'Durability: change log on disk, snapshots, replication, or special hardware',
      'Disk used only for durability; reads served from memory',
      'Async disk writes = weak durability',
      'Enables data structures hard to build on disk',
    ],
  },

  // ── Analytics & cloud warehouses ──────────────────────────────────────
  {
    id: 'ch04.044',
    sectionId: 'analytics-storage',
    conceptIds: ['cloud-dw'],
    kind: 'explain',
    prompt: 'Why are cloud data warehouses more elastic than traditional ones?',
    answer:
      'They decouple query compute from storage: data lives in object storage rather than on local disks, so storage capacity and compute for queries can be scaled independently. They also integrate more easily with other cloud services (log ingestion, processing frameworks).',
    keyPoints: ['Compute separated from storage', 'Data persisted in object storage', 'Scale each independently', 'Easy integration with cloud services'],
  },
  {
    id: 'ch04.045',
    sectionId: 'analytics-storage',
    conceptIds: ['cloud-dw'],
    kind: 'recall',
    prompt: 'Name the four components of a data warehouse that are now often separate systems, with an example of each.',
    answer:
      'Query engine — parses, optimizes and executes SQL (Trino, DataFusion, Presto). Storage format — encodes rows as bytes in files (Parquet, ORC, Lance, Nimble). Table format — defines which files make up a table and its schema; enables inserts/deletes, time travel and transactions (Iceberg, Delta). Data catalog — which tables exist; usually a standalone service (Polaris, Unity Catalog).',
    keyPoints: ['Query engine (Trino…)', 'Storage format (Parquet…)', 'Table format (Iceberg/Delta…)', 'Data catalog (Polaris/Unity…)'],
  },
  {
    id: 'ch04.046',
    sectionId: 'analytics-storage',
    conceptIds: ['cloud-dw'],
    kind: 'choice',
    prompt: 'Parquet files are immutable once written. Which layer lets you insert/delete rows and query a table “as of last Tuesday”?',
    options: [
      { text: 'The storage format', why: 'It defines bytes within one file, not which files form the table.' },
      { text: 'The table format (e.g. Iceberg, Delta)', correct: true },
      { text: 'The data catalog', why: 'It tracks which tables exist, not file-level versions.' },
      { text: 'The query engine', why: 'The engine reads whatever the table format says the table is.' },
    ],
    explanation: 'Table formats track the set of immutable files per table version, enabling row changes, time travel and even transactions.',
  },
  {
    id: 'ch04.047',
    sectionId: 'analytics-storage',
    conceptIds: ['cloud-dw'],
    kind: 'recall',
    prompt: 'What is the trend for HTAP (hybrid transactional/analytical) databases?',
    answer: 'They increasingly consist of two separate storage and query engines — one for OLTP and one for analytics — that happen to share a common SQL interface.',
    keyPoints: ['Two separate engines', 'One shared SQL interface'],
  },

  // ── Column-oriented storage ───────────────────────────────────────────
  {
    id: 'ch04.048',
    sectionId: 'columnar',
    conceptIds: ['column-storage'],
    kind: 'explain',
    prompt: 'Why does column-oriented storage speed up a typical warehouse query, even compared with a row store that has good indexes?',
    answer:
      'Fact tables often have 100+ columns but a query touches only a handful. A row store — even after using indexes to find the rows — must load and parse entire rows. A column store keeps each column’s values together and reads only the columns the query uses.',
    keyPoints: ['Wide tables, queries touch few columns', 'Row store loads/parses whole rows even with indexes', 'Column store reads only needed columns'],
  },
  {
    id: 'ch04.049',
    sectionId: 'columnar',
    conceptIds: ['column-storage'],
    kind: 'explain',
    prompt: 'In a column store, how is a full row reassembled, and how are columns actually laid out in practice?',
    answer:
      'Every column stores rows in the same order, so row k is the k-th value of each column. In practice tables are split into blocks of thousands to millions of rows, and within each block each column is stored separately. Blocks often cover a timestamp range so date-filtered queries load only overlapping blocks.',
    keyPoints: ['Same row order in all columns; k-th entries form row k', 'Blocks of many rows, columns separate within a block', 'Blocks by time range allow pruning'],
  },
  {
    id: 'ch04.050',
    sectionId: 'columnar',
    conceptIds: ['bitmap-encoding'],
    kind: 'explain',
    prompt: 'Explain bitmap encoding with run-length encoding for a column.',
    answer:
      'For a column with n distinct values, make n bitmaps with one bit per row: 1 if the row has that value. With many distinct values the bitmaps are mostly zeros (sparse), so store run lengths of consecutive 0s and 1s instead. Roaring bitmaps pick whichever representation is smaller.',
    keyPoints: ['One bitmap per distinct value, one bit per row', 'Sparse bitmaps → run-length encode', 'Roaring bitmaps switch representations'],
  },
  {
    id: 'ch04.051',
    sectionId: 'columnar',
    conceptIds: ['bitmap-encoding'],
    kind: 'choice',
    prompt: 'How do you evaluate `WHERE product_sk = 30 AND store_sk = 3` with bitmap indexes?',
    options: [
      { text: 'OR the product_sk=30 and store_sk=3 bitmaps', why: 'OR would match rows satisfying either condition.' },
      { text: 'AND the two bitmaps — the k-th bit in each refers to the same row', correct: true },
      { text: 'Decompress both columns and compare row by row', why: 'Bitwise ops work directly on (even compressed) bitmaps.' },
      { text: 'Not possible: bitmaps from different columns can’t be combined', why: 'They can, because all columns share the same row order.' },
    ],
    explanation: 'Same row order across columns makes cross-column AND trivially correct and very fast.',
  },
  {
    id: 'ch04.052',
    sectionId: 'columnar',
    conceptIds: ['column-storage'],
    kind: 'choice',
    prompt: 'Bigtable, HBase and Accumulo use a “wide-column” data model. Are they column-oriented storage?',
    options: [
      { text: 'Yes — that’s what wide-column means', why: 'A common confusion; the name is misleading.' },
      { text: 'No — they are row-oriented: all values of a row are stored together', correct: true },
    ],
    explanation: 'Wide-column means rows can have thousands of differing columns. Storage is still row-oriented.',
  },
  {
    id: 'ch04.053',
    sectionId: 'columnar',
    conceptIds: ['column-sort'],
    kind: 'failure',
    prompt: 'A colleague proposes sorting each column independently to maximize compression. What breaks?',
    answer:
      'You can no longer reconstruct rows: the k-th value in one column would no longer belong to the same row as the k-th value in another. Sorting must reorder entire rows, even though they’re stored column by column.',
    keyPoints: ['Row reconstruction depends on positional alignment', 'Independent sorts break alignment', 'Sort whole rows instead'],
  },
  {
    id: 'ch04.054',
    sectionId: 'columnar',
    conceptIds: ['column-sort'],
    kind: 'explain',
    prompt: 'How should you choose sort keys in a column store, and which column compresses best as a result?',
    answer:
      'Choose based on common queries: if most queries filter by date range, make date the first sort key so a query scans only the relevant rows; a second key (e.g. product) groups rows within each date. The first sort key gets long runs of repeated values and run-length encodes extremely well; later keys are progressively more jumbled and compress less.',
    keyPoints: [
      'Pick sort keys from common query filters (e.g. date first)',
      'Second key orders rows within equal first-key values',
      'First sort key compresses best (long runs)',
      'Later columns are close to random order',
    ],
  },
  {
    id: 'ch04.055',
    sectionId: 'columnar',
    conceptIds: ['column-writes'],
    kind: 'explain',
    prompt: 'Inserting one row into the middle of sorted, compressed column files would be very expensive. How do column stores handle writes?',
    answer:
      'Writes first go to a row-oriented, sorted, in-memory store. When enough accumulate they are merged with the on-disk column files and written to new files in bulk — the log-structured approach. Old files stay immutable, which suits object storage. Queries combine on-disk columns with the recent in-memory writes, so analysts see changes immediately.',
    keyPoints: [
      'Buffer writes in an in-memory, sorted row store',
      'Merge into new column files in bulk',
      'Immutable files fit object storage',
      'Queries combine disk data and recent writes transparently',
    ],
  },

  // ── Query execution & views ───────────────────────────────────────────
  {
    id: 'ch04.056',
    sectionId: 'query-execution',
    conceptIds: ['query-exec'],
    kind: 'compare',
    prompt: 'Compare query compilation and vectorized processing.',
    answer:
      'Compilation generates code specific to the query (iterate rows, compare, copy matches to an output buffer) and compiles it to machine code, e.g. with LLVM — like a JIT. Vectorized processing stays interpreted but uses a fixed set of built-in operators that process a batch of column values per call, e.g. an equality operator returning a bitmap, then a bitwise AND operator. Both are used in practice.',
    keyPoints: [
      'Compilation: generate + compile per-query code (JIT-like)',
      'Vectorization: interpreted, but operators work on batches of values',
      'Example: equality → bitmap, then AND bitmaps',
      'Both approaches are used in practice',
    ],
  },
  {
    id: 'ch04.057',
    sectionId: 'query-execution',
    conceptIds: ['query-exec'],
    kind: 'recall',
    prompt: 'Which properties of modern CPUs do both compiled and vectorized execution exploit?',
    answer:
      'Sequential rather than random memory access (fewer cache misses); tight inner loops with few instructions and no function calls (keeps the pipeline full, avoids branch mispredictions); parallelism via threads and SIMD; and operating directly on compressed data without decoding it first.',
    keyPoints: ['Sequential memory access', 'Tight inner loops, no calls/branch mispredictions', 'Threads + SIMD', 'Work directly on compressed data'],
  },
  {
    id: 'ch04.058',
    sectionId: 'query-execution',
    conceptIds: ['materialized-views'],
    kind: 'compare',
    prompt: 'What is the difference between a virtual view and a materialized view, and what does materializing cost?',
    answer:
      'A virtual view is a saved query that is expanded into the underlying query each time you read from it. A materialized view is an actual copy of the results written to disk. It speeds up repeated queries but must be updated whenever the underlying data changes — extra work on writes.',
    keyPoints: ['Virtual: alias expanded at query time', 'Materialized: stored copy of results', 'Must be maintained on writes', 'Faster repeated reads'],
  },
  {
    id: 'ch04.059',
    sectionId: 'query-execution',
    conceptIds: ['materialized-views'],
    kind: 'failure',
    prompt: 'Your data cube aggregates sales by date and product. A manager asks what share of sales comes from items over $100. Why can’t the cube answer, and what follows for warehouse design?',
    answer:
      'A cube only holds aggregates along its dimensions; price isn’t one of them, so the raw information is gone. Cubes are fast for the queries they anticipate but inflexible, so warehouses keep as much raw data as possible and use cubes only as a performance boost for common queries.',
    keyPoints: ['Cubes only answer along their dimensions', 'Price isn’t a dimension → can’t compute', 'Keep raw data; cubes as an optimization'],
  },

  // ── Multidimensional & full-text ──────────────────────────────────────
  {
    id: 'ch04.060',
    sectionId: 'multidim',
    conceptIds: ['concatenated-index'],
    kind: 'choice',
    prompt: 'Given a concatenated index on (lastname, firstname), which query can it NOT serve efficiently?',
    options: [
      { text: 'All people with last name “Lee”', why: 'A prefix of the key — works.' },
      { text: 'Last name “Lee” and first name “Ana”', why: 'The full key — works.' },
      { text: 'All people with first name “Ana”', correct: true },
    ],
    explanation: 'Like a phone book: sorted by last name first, so first-name-only lookups would need a full scan.',
  },
  {
    id: 'ch04.061',
    sectionId: 'multidim',
    conceptIds: ['spatial-index', 'concatenated-index'],
    kind: 'failure',
    prompt: 'Why can’t a concatenated index on (latitude, longitude) efficiently find all restaurants inside a map rectangle, and what are the alternatives?',
    answer:
      'It can narrow to a latitude range (at any longitude) or a longitude range (at any latitude), but not both at once. Alternatives: map 2-D points to one number with a space-filling curve and use a normal B-tree; or use spatial indexes such as R-trees or Bkd-trees that group nearby points in the same subtree (e.g. PostGIS on PostgreSQL’s GiST); or regular grids of triangles, squares or hexagons.',
    keyPoints: [
      'Concatenated index narrows only one dimension at a time',
      'Space-filling curve + B-tree',
      'R-trees / Bkd-trees group nearby points',
      'Regular grids (e.g. hexagons)',
    ],
  },
  {
    id: 'ch04.062',
    sectionId: 'multidim',
    conceptIds: ['spatial-index'],
    kind: 'scenario',
    prompt: 'A weather database must find all observations in 2024 with temperature between 25 °C and 30 °C. Why does a 2-D index on (date, temperature) beat a 1-D index on either column?',
    answer:
      'With a 1-D index you’d select all of 2024 regardless of temperature and filter, or all 25–30 °C readings from every year and filter by date — scanning far more than needed. A 2-D index narrows both ranges simultaneously.',
    keyPoints: ['1-D index: narrow one dimension, then filter the rest', 'Wastes work scanning irrelevant records', '2-D index narrows both at once'],
  },
  {
    id: 'ch04.063',
    sectionId: 'multidim',
    conceptIds: ['inverted-index'],
    kind: 'explain',
    prompt: 'How is full-text search a kind of multidimensional query, and how does an inverted index answer “red apples”?',
    answer:
      'Treat every term as a dimension: a document has 1 in dimension x if it contains term x. An inverted index maps each term to its postings list — the IDs of documents containing it — which can be stored as a sparse bitmap when IDs are sequential. “red apples” loads both postings and intersects them (bitwise AND), just like a vectorized warehouse filter.',
    keyPoints: ['Each term is a dimension', 'Inverted index: term → postings list of doc IDs', 'Postings as sparse bitmaps', 'Multi-term query = AND of postings'],
  },
  {
    id: 'ch04.064',
    sectionId: 'multidim',
    conceptIds: ['inverted-index', 'sstable'],
    kind: 'recall',
    prompt: 'How does Lucene (behind Elasticsearch and Solr) store its term → postings mapping?',
    answer: 'In SSTable-like sorted files that are merged in the background — the same log-structured approach as LSM storage engines.',
    keyPoints: ['SSTable-like sorted files', 'Merged in the background (log-structured)'],
  },
  {
    id: 'ch04.065',
    sectionId: 'multidim',
    conceptIds: ['fuzzy-search'],
    kind: 'compare',
    prompt: 'What does a trigram index enable that a word index doesn’t, and at what cost? How does Lucene handle typos?',
    answer:
      'Indexing every substring of length 3 (e.g. “hello” → hel, ell, llo) allows searching for arbitrary substrings of 3+ characters and even regular expressions, but the index is large. For typos, Lucene stores its terms as a trie-like finite state automaton and transforms it into a Levenshtein automaton to find terms within a given edit distance.',
    keyPoints: ['Trigrams: substring and regex search', 'Cost: large index', 'Typos: Levenshtein automaton over a trie-like term automaton', 'Edit distance = insertions, deletions, substitutions'],
  },

  // ── Vectors ───────────────────────────────────────────────────────────
  {
    id: 'ch04.066',
    sectionId: 'vectors',
    conceptIds: ['vector-embeddings'],
    kind: 'explain',
    prompt: 'How does semantic search find “canceling your subscription” for the query “how to close my account”?',
    answer:
      'An embedding model converts each document into a vector of floats; documents with similar meaning get nearby vectors. At query time the query (plus context) is embedded too, and a vector index returns the documents whose vectors are closest — even with no words in common.',
    keyPoints: ['Embedding model: text → float vector', 'Similar meaning → nearby vectors', 'Embed the query too', 'Vector index finds nearest documents'],
  },
  {
    id: 'ch04.067',
    sectionId: 'vectors',
    conceptIds: ['vector-embeddings'],
    kind: 'compare',
    prompt: 'Cosine similarity vs Euclidean distance — what does each measure?',
    answer: 'Cosine similarity measures the angle between two vectors (direction only). Euclidean distance measures the straight-line distance between the two points.',
    keyPoints: ['Cosine: angle between vectors', 'Euclidean: straight-line distance'],
  },
  {
    id: 'ch04.068',
    sectionId: 'vectors',
    conceptIds: ['vector-embeddings', 'query-exec'],
    kind: 'choice',
    prompt: '“Vector” in vectorized query execution and “vector” in vector embeddings mean…',
    options: [
      { text: 'The same thing — arrays processed with SIMD', why: 'Only the first is about SIMD-friendly batches.' },
      { text: 'Different things: a batch of values processed together vs. a point in a high-dimensional space', correct: true },
    ],
    explanation: 'Same word, unrelated ideas. Keep them apart when reading docs.',
  },
  {
    id: 'ch04.069',
    sectionId: 'vectors',
    conceptIds: ['vector-index'],
    kind: 'compare',
    prompt: 'Compare flat, IVF and HNSW vector indexes.',
    answer:
      'Flat: store vectors as-is and compare the query with every one — exact but slow. IVF: cluster the space into partitions around centroids and compare only within the partitions you probe; faster but approximate, since a close neighbour can sit in another partition; more probes = more accurate, slower. HNSW: several layers of proximity graphs; start at the sparse top layer, find the closest node, descend and keep following edges toward the query; also approximate.',
    keyPoints: [
      'Flat: brute force, exact, slow',
      'IVF: partitions/centroids + probes; approximate',
      'More probes → more accurate, slower',
      'HNSW: layered graphs, greedy descent; approximate',
    ],
  },
  {
    id: 'ch04.070',
    sectionId: 'vectors',
    conceptIds: ['vector-index', 'spatial-index'],
    kind: 'failure',
    prompt: 'Why not just store embeddings in an R-tree like geographic points?',
    answer: 'R-trees work for a few dimensions but break down for vectors with hundreds or thousands of dimensions, so specialized vector indexes (flat, IVF, HNSW) are used.',
    keyPoints: ['Embeddings have 1,000+ dimensions', 'R-trees don’t scale to that many', 'Use dedicated vector indexes'],
  },
];
