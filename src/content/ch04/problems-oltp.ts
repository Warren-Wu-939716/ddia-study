import type { Problem } from '../types.ts';

/** End-of-lesson problems for lessons 1–5: they ask you to apply ideas to new situations, not repeat definitions. */
export const oltpProblems: Problem[] = [
  // ── 1 · How databases store and find data ────────────────────────────
  {
    id: 'p04.intro.1',
    sectionId: 'oltp-intro',
    skill: 'predict',
    kind: 'choice',
    prompt: 'A key-value store is a single append-only file. Its contents are shown below. What does `get cart:1` return?',
    figure: `cart:1,socks
cart:2,hat
cart:1,socks+scarf
cart:3,gloves
cart:1,scarf`,
    options: [
      { text: '`socks`', why: 'That’s the first match. Nothing is ever crossed out, so earlier lines are older versions.' },
      { text: '`socks+scarf`', why: 'That was the newest value only until line 5 was appended.' },
      { text: '`scarf`', correct: true, why: 'The last line for a key is its newest version, so it wins.' },
      { text: 'All three values, newest first.', why: 'A key-value store returns one value per key: the current one.' },
    ],
    explanation: 'A write never edits an old line; it appends a newer one. So a read must find the **last** line for the key — which is also why it has to read the whole file.',
  },
  {
    id: 'p04.intro.2',
    sectionId: 'oltp-intro',
    skill: 'calculate',
    kind: 'numeric',
    prompt:
      'The same store now holds 2,000,000 lines. The key you want was written once, on line 10, and never changed. With no index, how many lines must a read go through before it can be sure it has the right value?',
    answer: 2_000_000,
    unit: 'lines',
    explanation:
      'All **2,000,000**. Finding the key on line 10 isn’t enough: a newer version could have been appended on any later line, and only reading to the end rules that out. The cost of a read grows with the size of the file — O(n) — no matter where the key is.',
  },
  {
    id: 'p04.intro.3',
    sectionId: 'oltp-intro',
    skill: 'calculate',
    kind: 'numeric',
    prompt: 'Scanning the whole 1 GB file to answer a read takes 40 ms. The file grows to 3 GB. Roughly how long does a read take now?',
    answer: 120,
    tolerance: 1,
    unit: 'ms',
    explanation: 'A full scan does work in proportion to the file size, so three times the data takes about three times as long: **120 ms**. Every read gets slower as the data grows — the reason indexes exist.',
  },
  {
    id: 'p04.intro.4',
    sectionId: 'oltp-intro',
    skill: 'design',
    kind: 'justify',
    prompt:
      'An events table receives 50,000 inserts per second and must keep up. The only query the application runs looks events up by `id`. A colleague suggests indexing all six columns “just in case”. What do you do?',
    options: [
      { text: 'Index only `id`.', correct: true, why: 'It serves the one real query and adds the least work to each insert.' },
      { text: 'Index all six columns.', why: 'Five of those indexes would be updated 50,000 times a second for queries nobody runs.' },
      { text: 'Index nothing, to keep inserts as fast as possible.', why: 'Every lookup by `id` would then scan the whole table.' },
    ],
    reasons: [
      { text: 'Every index must be updated on every write and takes disk space, so only add indexes for questions the application actually asks.', correct: true, why: 'That’s the core trade-off: faster reads for those queries, slower writes for all.' },
      { text: 'Indexes change the stored data, so fewer indexes means less risk of corrupting it.', why: 'An index is derived data; adding or dropping one never changes what’s stored.' },
      { text: 'More indexes make every read slower.', why: 'Indexes don’t slow reads; they cost writes and space.' },
    ],
    explanation: 'Indexes are a deliberate trade: each one speeds up some reads and slows down every write. Pick them from the queries you really run.',
  },
  {
    id: 'p04.intro.5',
    sectionId: 'oltp-intro',
    skill: 'predict',
    kind: 'multi',
    prompt: 'You drop the index on the `email` column of a large table. Which statements are true?',
    options: [
      { text: 'No data is lost — the index could be rebuilt from the table at any time.', correct: true, why: 'An index is derived data.' },
      { text: 'Inserts and updates get a little cheaper.', correct: true, why: 'One fewer structure to update on every write.' },
      { text: 'Queries that filter by email now return different results.', why: 'Same results — they just have to scan to find them, so they’re slower.' },
      { text: 'Some disk space is freed.', correct: true, why: 'The index took space of its own.' },
      { text: 'The table’s rows have to be rewritten without the email column.', why: 'The column is still there; only the extra lookup structure is gone.' },
    ],
    explanation: 'Adding or dropping an index changes how fast you can find data and how much a write costs — never what the data is.',
  },
  {
    id: 'p04.intro.6',
    sectionId: 'oltp-intro',
    skill: 'explain',
    kind: 'explain',
    prompt: 'In the append-only key-value file, why is saving a value so cheap while reading one is so expensive? Explain in terms of what each operation has to do.',
    keyPoints: [
      'Saving just adds a few bytes at the end of the file — nothing to search for and nothing to move',
      'Changing a key doesn’t touch its old line; the new line simply wins',
      'Reading has to find the newest line for the key, which could be anywhere, so it must scan the whole file',
      'The read cost grows with the amount of data (O(n)), while the write cost stays the same',
    ],
    explanation:
      'A save only **appends**: a few bytes at the end of the file, with no searching and no shuffling, and an update leaves the old line alone because the newer line wins. A read has the opposite problem: the newest line for a key could be anywhere, so the only way to be sure is to **scan the whole file**. Writes stay cheap however big the file gets; reads get slower in proportion to its size.',
  },

  // ── 2 · Log-structured storage ───────────────────────────────────────
  {
    id: 'p04.lsm.1',
    sectionId: 'log-structured',
    skill: 'predict',
    kind: 'choice',
    prompt: 'An SSTable’s sparse index lists the first key of each block. Looking up `orange`, which blocks are read from disk?',
    figure: `block 0 starts at: apple
block 1 starts at: grape
block 2 starts at: melon
block 3 starts at: plum`,
    options: [
      { text: 'Block 2 only.', correct: true, why: 'melon ≤ orange < plum, and the file is sorted, so orange can only be in block 2.' },
      { text: 'Block 3 only, because “o” is closest to “p”.', why: 'Block 3 starts at plum; everything in it sorts at or after plum.' },
      { text: 'Blocks 2 and 3, to be safe.', why: 'Sorting guarantees orange can’t appear after plum, so block 3 can be skipped.' },
      { text: 'All four, because orange isn’t listed in the index.', why: 'A sparse index lists only some keys on purpose; the sort order does the rest.' },
    ],
    explanation: 'Because the file is sorted, the boundaries in the sparse index pin each key to exactly one block. If orange isn’t in block 2, it isn’t in this file at all.',
  },
  {
    id: 'p04.lsm.2',
    sectionId: 'log-structured',
    skill: 'sequence',
    kind: 'order',
    prompt: 'Put the life of one write in an LSM-tree in order.',
    steps: [
      'Append the write to the write-ahead log on disk',
      'Insert it into the sorted memtable in memory',
      'The memtable grows past its size limit',
      'Write the memtable to disk as a new SSTable in one sequential pass',
      'Throw away the write-ahead log entries the flush covered',
    ],
    explanation: 'The WAL protects the memtable until it is safely on disk as an immutable segment; only then is that part of the WAL no longer needed.',
  },
  {
    id: 'p04.lsm.3',
    sectionId: 'log-structured',
    skill: 'predict',
    kind: 'choice',
    prompt: 'An LSM-tree is in the state below (✝ = tombstone). What do `get apple`, `get fig` and `get kiwi` return?',
    figure: `memtable:              (empty)
segment #3 (newest):   fig=✝    kiwi=8
segment #2:            apple=4  fig=6
segment #1 (oldest):   apple=1  fig=2   kiwi=5`,
    options: [
      { text: 'apple 4 · fig not found · kiwi 8', correct: true, why: 'Search newest → oldest and stop at the first match; a tombstone match means “deleted”.' },
      { text: 'apple 1 · fig 2 · kiwi 5', why: 'That reads the oldest segment first — the opposite of the read path.' },
      { text: 'apple 4 · fig 6 · kiwi 8', why: 'That skips the tombstone. Reaching fig=✝ first means fig was deleted.' },
      { text: 'apple 4 · fig not found · kiwi 5', why: 'kiwi=8 in segment #3 is newer than kiwi=5 in segment #1.' },
    ],
    explanation: 'Reads check the memtable, then segments from newest to oldest, and the first match wins — including a tombstone, which hides every older value for that key.',
  },
  {
    id: 'p04.lsm.4',
    sectionId: 'log-structured',
    skill: 'predict',
    kind: 'choice',
    prompt:
      'Two segments are merged. A third, even older segment is **not** part of this merge and still contains `dog=0`. What does the merged output contain?',
    figure: `newer:    ant=—   cat=7   dog=✝   emu=3
older:    ant=1   cat=2   dog=4   emu=—
(oldest, not merged:  dog=0  fox=5)`,
    options: [
      { text: 'ant=1 · cat=7 · dog=✝ · emu=3', correct: true, why: 'Newest value wins, and the tombstone must stay because dog=0 still exists further down.' },
      { text: 'ant=1 · cat=7 · emu=3 (dog removed entirely)', why: 'Dropping the tombstone would let a read find dog=0 in the oldest segment: the deleted key would come back.' },
      { text: 'ant=1 · cat=2 · dog=4 · emu=3', why: 'When both inputs have a key, the newer segment’s value wins.' },
      { text: 'ant=1 · cat=7 · dog=4 · emu=3', why: 'The newer segment says dog was deleted; dog=4 is an older version.' },
    ],
    explanation: 'A tombstone can only be dropped once the merge output becomes the oldest data. Until then it is the only thing hiding older values of that key.',
  },
  {
    id: 'p04.lsm.5',
    sectionId: 'log-structured',
    skill: 'predict',
    kind: 'multi',
    prompt: 'Before reading a segment, an LSM engine checks that segment’s Bloom filter for the key `zebra`. Which statements are true?',
    options: [
      { text: 'If any of zebra’s bits is 0, the segment definitely doesn’t contain zebra and is skipped.', correct: true, why: 'Bits are only ever switched on, so a 0 rules the key out.' },
      { text: 'If all of zebra’s bits are 1, zebra is definitely in the segment.', why: 'Other keys may have switched those bits on: it’s only “maybe”.' },
      { text: 'If all of zebra’s bits are 1, the engine reads the block and may or may not find zebra.', correct: true, why: 'A false positive costs one wasted block read.' },
      { text: 'A false positive can make the engine return a wrong value.', why: 'The engine reads the block, doesn’t find zebra, and moves on to the next-older segment.' },
      { text: 'Giving the filter more bits per key lowers the false-positive rate.', correct: true, why: 'Roughly 10× fewer false positives for every extra 5 bits per key.' },
    ],
    explanation: 'Bloom filters never give false negatives, so they can safely skip work; their false positives only waste a little effort, never correctness.',
  },
  {
    id: 'p04.lsm.6',
    sectionId: 'log-structured',
    skill: 'calculate',
    kind: 'numeric',
    prompt:
      'Rule of thumb: about 10 bits per key gives roughly 1% false positives, and each extra 5 bits per key cuts that about 10×. A segment’s Bloom filter uses 20 bits per key. Out of 100,000 lookups for keys that are **not** in the segment, about how many get a wrong “maybe”?',
    answer: 10,
    tolerance: 2,
    unit: 'lookups',
    explanation: '10 bits → 1%; 15 bits → 0.1%; 20 bits → **0.01%**. 0.01% of 100,000 = **10**. Doubling the filter’s size made it 100× more selective.',
  },
  {
    id: 'p04.lsm.7',
    sectionId: 'log-structured',
    skill: 'design',
    kind: 'justify',
    prompt: 'A metrics service writes millions of data points per minute and is rarely read; old data expires after a week. Which compaction strategy would you start with?',
    options: [
      { text: 'Size-tiered compaction.', correct: true, why: 'It rewrites each value only a few times, in big sequential merges.' },
      { text: 'Leveled compaction.', why: 'It keeps reads cheap and disk use tight, but rewrites data more often — paying for reads you rarely do.' },
    ],
    reasons: [
      { text: 'The workload is almost all writes, so the strategy that rewrites data the fewest times gives the most write throughput.', correct: true, why: 'Match the strategy to the workload: write-heavy → size-tiered.' },
      { text: 'Size-tiered compaction uses less temporary disk space during big merges.', why: 'It’s the other way round: merging huge size-tiered segments needs lots of temporary space.' },
      { text: 'Leveled compaction cannot drop expired data.', why: 'Both strategies drop expired and replaced values as they merge.' },
    ],
    explanation: 'Size-tiered: few rewrites, high write throughput, but big merges and more temporary space. Leveled: more rewriting, but fewer files to check on reads and less wasted space.',
  },

  // ── 3 · B-trees ──────────────────────────────────────────────────────
  {
    id: 'p04.btree.1',
    sectionId: 'btrees',
    skill: 'calculate',
    kind: 'numeric',
    prompt:
      'Every page in a B-tree — interior or leaf — holds up to 500 entries. What is the smallest number of levels (counting the root and the leaves) that can hold 100 million keys? That’s also the number of pages a lookup reads.',
    answer: 3,
    unit: 'levels',
    explanation: 'One level holds 500 keys, two hold 500² = 250,000, three hold 500³ = 125,000,000 — enough for 100 million. So **3** levels, and each lookup reads 3 pages. A fourth level would allow 62.5 billion keys.',
  },
  {
    id: 'p04.btree.2',
    sectionId: 'btrees',
    skill: 'predict',
    kind: 'choice',
    prompt: 'Leaf pages hold at most 4 keys. You insert 25 into the full leaf below. What happens?',
    figure: `parent:  [ … │ 10 │ 50 │ … ]
                │
                ▼
leaf:    [ 10 │ 20 │ 30 │ 40 ]   (full)`,
    options: [
      { text: 'The leaf splits into [10 │ 20 │ 25] and [30 │ 40], and the parent gains a new boundary key, 30.', correct: true, why: 'Split into two half-full pages and add a tab for the new page to the parent.' },
      { text: '25 is stored in the parent page instead, since the leaf has no room.', why: 'Keys and values live in the leaves; the parent only holds boundaries and pointers.' },
      { text: 'The leaf grows to hold five keys.', why: 'Pages have a fixed size — that’s what makes page number × page size a valid address.' },
      { text: 'A new root is created above the parent.', why: 'That only happens if splits cascade all the way up and the root itself is full.' },
    ],
    explanation: 'Inserting into a full leaf splits it and adds one boundary key to the parent. Only if the parent is full too does the split cascade upward.',
  },
  {
    id: 'p04.btree.3',
    sectionId: 'btrees',
    skill: 'sequence',
    kind: 'order',
    prompt: 'Order the steps a B-tree engine with a write-ahead log follows to update a value safely.',
    steps: [
      'Append a note describing the change to the WAL',
      'fsync the WAL so the note is safely on disk',
      'Change the page in memory and confirm the write to the user',
      'Later, write the changed page to disk along with others in a batch',
      'If a crash happened before that, replay the WAL on restart to redo the change',
    ],
    explanation: 'Durability comes from the fsynced WAL, so the page itself can be written lazily and in batches. Replay covers anything that didn’t reach the disk.',
  },
  {
    id: 'p04.btree.4',
    sectionId: 'btrees',
    skill: 'diagnose',
    kind: 'choice',
    prompt:
      'A B-tree engine **without** a WAL crashes in the middle of a page split: the new right-hand page reached the disk, but the updated parent page did not. After restarting, some keys that were inserted just before the crash can’t be found, even though they are in a page on disk. What happened?',
    options: [
      { text: 'A torn page: one page was left half old and half new.', why: 'Each page here was written whole; the problem is a missing link between pages.' },
      { text: 'An orphan page: the new page exists, but no parent points to it, so lookups never reach it.', correct: true, why: 'The parent update that would have added the boundary key never happened.' },
      { text: 'A tombstone was written for those keys.', why: 'B-trees overwrite in place; nothing deleted these keys.' },
      { text: 'The keys were still in the memtable when it crashed.', why: 'That’s an LSM concept; here the page did reach the disk.' },
    ],
    explanation: 'A split changes several pages at once. Without a WAL to finish or redo it after a crash, the tree can be left with pages nobody points to.',
  },
  {
    id: 'p04.btree.5',
    sectionId: 'btrees',
    skill: 'predict',
    kind: 'multi',
    prompt: 'An engine uses copy-on-write B-tree pages, never overwriting an existing page. Which statements are true?',
    options: [
      { text: 'Updating one leaf also writes new versions of every page on the path up to the root.', correct: true, why: 'Each parent must point to the new copy of its child.' },
      { text: 'A reader holding the old root keeps seeing a consistent snapshot while the update happens.', correct: true, why: 'The old pages are untouched until nothing uses them.' },
      { text: 'It needs a write-ahead log to avoid torn and orphan pages.', why: 'Old pages are never modified, so a crash leaves the old version intact; no WAL is needed.' },
      { text: 'The keys are no longer stored in sorted order.', why: 'The new copies are still a sorted, balanced B-tree.' },
    ],
    explanation: 'Copy-on-write trades extra page writes for crash safety without a WAL and cheap, consistent snapshots.',
  },
  {
    id: 'p04.btree.6',
    sectionId: 'btrees',
    skill: 'explain',
    kind: 'explain',
    prompt: 'Interior pages often store abbreviated keys — just enough to tell ranges apart (“Sm–St”) rather than full keys. Why does that make lookups faster?',
    keyPoints: [
      'Shorter boundary keys mean more of them fit in one page',
      'More boundaries per page means a higher branching factor',
      'A higher branching factor means fewer levels for the same amount of data',
      'Fewer levels means fewer page reads per lookup; the leaves still hold full keys, so answers don’t change',
    ],
    explanation:
      'Interior pages only need to route a lookup to the right child, so they can store shortened boundary keys. Shorter keys → more of them per page → a higher **branching factor** → fewer levels for the same data → fewer pages read per lookup. The leaves still hold the full keys, so correctness is unaffected.',
  },

  // ── 4 · Comparing B-trees and LSM-trees ──────────────────────────────
  {
    id: 'p04.cmp.1',
    sectionId: 'comparing',
    skill: 'calculate',
    kind: 'numeric',
    prompt:
      'A B-tree with 4 KiB (4,096-byte) pages updates a single 100-byte value: it writes a 100-byte WAL record and then the whole page. A plain append-only log would have written just the 100 bytes. What is the write amplification?',
    answer: 41.96,
    tolerance: 0.1,
    unit: '×',
    explanation: '(100 + 4,096) ÷ 100 = **41.96**. Small changes into big pages are where B-trees pay most: the whole page is rewritten even though only 100 bytes changed.',
  },
  {
    id: 'p04.cmp.2',
    sectionId: 'comparing',
    skill: 'calculate',
    kind: 'numeric',
    prompt:
      'In an LSM-tree, a value is written once by the application. It goes to the WAL, is flushed in a new SSTable, and is then rewritten by 3 compactions before reaching the bottom level. Ignoring compression, what is its write amplification?',
    answer: 5,
    unit: '×',
    explanation: 'WAL (1) + flush (1) + 3 compactions (3) = **5** copies of the same bytes. Engines that compact many times pay here — but they never rewrite a whole page for a tiny change.',
  },
  {
    id: 'p04.cmp.3',
    sectionId: 'comparing',
    skill: 'design',
    kind: 'justify',
    prompt: 'A sensor platform ingests 200,000 small writes per second; reads are rare and fetch single recent keys. The disk’s bandwidth is the bottleneck. Which storage engine family do you start with?',
    options: [
      { text: 'An LSM-tree.', correct: true, why: 'It turns the write stream into a few big sequential writes.' },
      { text: 'A B-tree.', why: 'Its strengths — predictable reads and range scans — matter little here, and its random page writes cost bandwidth.' },
    ],
    reasons: [
      { text: 'Sequential writes and lower write amplification get more writes per second through the same disk bandwidth.', correct: true, why: 'When bandwidth is the limit, fewer bytes per write means more writes.' },
      { text: 'LSM-trees always answer reads faster.', why: 'Reads may check several segments; B-trees are usually more predictable for reads.' },
      { text: 'B-trees cannot store small values.', why: 'They can; small values just make their whole-page rewrites relatively expensive.' },
    ],
    explanation: 'Write-heavy and bandwidth-bound points to LSM. Still benchmark with your real data, for long enough that compaction is running.',
  },
  {
    id: 'p04.cmp.4',
    sectionId: 'comparing',
    skill: 'diagnose',
    kind: 'choice',
    prompt:
      'A team benchmarked an LSM-based database for 10 minutes on an empty disk and got 300,000 writes per second. A week into production, throughput has dropped and a few requests occasionally take seconds. What is the most likely explanation?',
    options: [
      { text: 'Compaction now competes with new writes for disk bandwidth, and when it falls behind the engine applies backpressure, causing latency spikes.', correct: true, why: 'An empty database has nothing to compact; the benchmark never reached a steady state.' },
      { text: 'The Bloom filters filled up and stopped working.', why: 'Each segment gets its own filter when it’s written; they don’t fill up over time.' },
      { text: 'The B-tree pages became fragmented.', why: 'This is an LSM engine; it has no pages to fragment.' },
      { text: 'The write-ahead log is never deleted and has grown too large.', why: 'WAL entries are thrown away once their memtable has been flushed.' },
    ],
    explanation: 'LSM write benchmarks on empty databases look amazing. Run them long enough for compaction to take its share of the disk, and watch the slowest requests, not just the average.',
  },
  {
    id: 'p04.cmp.5',
    sectionId: 'comparing',
    skill: 'design',
    kind: 'multi',
    prompt: 'Which of these requirements point towards a B-tree rather than an LSM-tree?',
    options: [
      { text: 'Lots of range scans over sorted keys.', correct: true, why: 'A B-tree walks its sorted leaves; an LSM engine must merge across segments.' },
      { text: 'Deleted personal data must physically disappear quickly.', correct: true, why: 'LSM data lingers in older segments until tombstones are compacted down.' },
      { text: 'Disk bandwidth limits a write-heavy workload.', why: 'That favours LSM: sequential writes, lower write amplification.' },
      { text: 'Cheap point-in-time snapshots.', why: 'LSM’s immutable files make snapshots cheap.' },
      { text: 'Steady latency even during bursts of writes.', correct: true, why: 'LSM engines can stall with backpressure when compaction falls behind.' },
      { text: 'The smallest possible files on disk.', why: 'LSM files avoid fragmentation and compress well.' },
    ],
    explanation: 'B-trees: predictable reads, range scans, prompt deletion, steady latency. LSM-trees: write throughput, compact files, cheap snapshots.',
  },
  {
    id: 'p04.cmp.6',
    sectionId: 'comparing',
    skill: 'explain',
    kind: 'explain',
    prompt: 'An SSD has no moving parts, yet random writes still hurt it more than sequential ones. Explain why.',
    keyPoints: [
      'Flash can write individual pages but can only erase a whole block at once',
      'Random writes leave each block holding a mix of live and dead pages',
      'Before erasing a block, garbage collection must copy its live pages elsewhere — extra writes that steal bandwidth',
      'Those extra writes also wear the flash out sooner; sequential writes fill blocks with one file that can later be erased without copying',
    ],
    explanation:
      'Flash writes small **pages** but can only erase whole **blocks**. Random writes scatter data from many files across each block, so when some of it is deleted the block holds a mix of live and dead pages. To reclaim it, the SSD’s **garbage collection** must first copy the live pages elsewhere — extra writes that take bandwidth from your application and wear out the flash. Sequential writes tend to fill a block with one file, which can later be erased in one go with nothing to copy.',
  },

  // ── 5 · Secondary indexes and in-memory databases ────────────────────
  {
    id: 'p04.idx.1',
    sectionId: 'secondary-indexes',
    skill: 'predict',
    kind: 'choice',
    prompt:
      'A table is stored as a clustered index on its primary key, and its secondary indexes store primary keys (as MySQL’s InnoDB does). How does `SELECT name FROM users WHERE email = ?` find the row, using the index on `email`?',
    options: [
      { text: 'One lookup: the email index stores the row’s location on disk.', why: 'That’s the heap-file design. Here secondary indexes store the primary key, not a location.' },
      { text: 'Two lookups: the email index gives the primary key, then the clustered index gives the row.', correct: true, why: 'The secondary index points to the primary key; the row lives in the clustered index.' },
      { text: 'No index lookup: the clustered index can be searched by email directly.', why: 'The clustered index is sorted by primary key, so it can’t be searched by email.' },
      { text: 'Three lookups: email index, then a heap file, then the clustered index.', why: 'There’s no heap file here — the clustered index holds the rows.' },
    ],
    explanation: 'With a clustered table, a secondary-index lookup is a two-step hop. A covering index that also stored `name` would make it one step.',
  },
  {
    id: 'p04.idx.2',
    sectionId: 'secondary-indexes',
    skill: 'design',
    kind: 'justify',
    prompt: '`SELECT status FROM orders WHERE customer_id = ?` runs 5,000 times per second. The orders table gets about 50 writes per second. Which index do you add?',
    options: [
      { text: 'An index on `customer_id` alone.', why: 'It finds the right rows, but every query then makes a second trip to fetch `status` from the row.' },
      { text: 'A covering index on `customer_id` that also stores `status`.', correct: true, why: 'The query is answered from the index alone.' },
      { text: 'No index; scan the table.', why: 'Scanning on 5,000 queries per second would be enormously wasteful.' },
    ],
    reasons: [
      { text: 'Reads outnumber writes 100 to 1, so skipping the trip to the row is worth the extra space and the slightly slower writes.', correct: true, why: 'Covering indexes duplicate data: worth it when that query is hot and writes are comparatively rare.' },
      { text: 'Covering indexes make writes faster.', why: 'They make writes slower, because more data is duplicated into the index.' },
      { text: 'Every secondary index must be a covering index.', why: 'Most aren’t; covering is a targeted optimisation for specific queries.' },
    ],
    explanation: 'Covering indexes are a read/write trade-off you make deliberately for hot queries.',
  },
  {
    id: 'p04.idx.3',
    sectionId: 'secondary-indexes',
    skill: 'predict',
    kind: 'choice',
    prompt:
      'Rows live in a heap file, and four indexes each store a row’s location in the heap. A user’s `bio` is edited and the row becomes too big to fit in its current spot. What must happen?',
    options: [
      { text: 'The row is overwritten where it is, spilling into its neighbour’s space.', why: 'That would corrupt the neighbouring row.' },
      { text: 'The row moves, and either all four indexes are updated to the new location or a forwarding pointer is left at the old one.', correct: true, why: 'Something has to tell the indexes where the row went.' },
      { text: 'Only the primary index is updated; the others find the row by scanning.', why: 'The other indexes would point at stale locations — they don’t fall back to scanning.' },
      { text: 'The update is rejected because rows can’t change size.', why: 'Rows can grow; it just costs extra work.' },
    ],
    explanation: 'Indexes that point at physical locations make moving a row expensive: update every index, or leave a “we’ve moved” sign that costs an extra hop on each read.',
  },
  {
    id: 'p04.idx.4',
    sectionId: 'secondary-indexes',
    skill: 'sequence',
    kind: 'order',
    prompt: 'In a table stored as a clustered index (secondary indexes hold primary keys), order the steps for `SELECT * FROM orders WHERE customer_id = 42`.',
    steps: [
      'Search the `customer_id` index for 42',
      'Read the primary keys stored with each matching entry',
      'Search the clustered index for each of those primary keys',
      'Read the full rows from the clustered index’s leaf pages',
      'Return the rows to the query',
    ],
    explanation: 'Secondary index → primary keys → clustered index → rows. Each matching order costs its own trip into the clustered index.',
  },
  {
    id: 'p04.idx.5',
    sectionId: 'secondary-indexes',
    skill: 'diagnose',
    kind: 'choice',
    prompt:
      'A team moves a 100 GB dataset from a disk-based database running on a machine with 256 GB of RAM to an in-memory database, and queries get much faster. A colleague says: “Because it no longer reads from disk.” What’s the better explanation?',
    options: [
      { text: 'The colleague is right: every query used to read from disk.', why: 'With 256 GB of RAM, the operating system’s cache held the busy data; few queries touched the disk.' },
      { text: 'The in-memory database skips encoding its data structures into a disk format and back.', correct: true, why: 'That conversion overhead, not disk reads, is the main cost it removes.' },
      { text: 'In-memory databases don’t need indexes, so queries do less work.', why: 'They still use indexes — they just keep them in memory.' },
      { text: 'In-memory databases never write anything to disk.', why: 'Durable ones write logs or snapshots; and writes aren’t what made these queries faster.' },
    ],
    explanation: 'A disk-based database with plenty of RAM rarely reads from disk. The in-memory win is avoiding the work of laying data out for disk and reading it back.',
  },
  {
    id: 'p04.idx.6',
    sectionId: 'secondary-indexes',
    skill: 'predict',
    kind: 'multi',
    prompt: 'Which of these in-memory setups can lose writes that were already confirmed to the user if the machine crashes?',
    options: [
      { text: 'A cache that keeps nothing on disk.', correct: true, why: 'Everything lives only in memory.' },
      { text: 'A database that writes changes to disk in the background, without waiting.', correct: true, why: 'The last few changes may not have reached the disk yet: weak durability.' },
      { text: 'A database that appends every change to a log on disk and waits for it before confirming.', why: 'Confirmed writes are on disk and are replayed on restart.' },
      { text: 'A database that copies every change to another machine before confirming.', why: 'If one machine crashes, the copy survives on the other.' },
    ],
    explanation: 'Being in memory says nothing about durability on its own. What matters is whether a write reaches durable storage — disk or another machine — before it is confirmed.',
  },
];
