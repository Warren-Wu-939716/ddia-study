import type { Lesson } from '../types.ts';

/** Trims the leading newline and trailing whitespace of a template-literal diagram. */
export const art = (s: string) => s.replace(/^\n/, '').replace(/\s+$/, '');

/**
 * Lessons for the OLTP half of the chapter. Original explanations and examples.
 * Each technical term gets a plain-English analogy where it first appears (in lesson order) and is used as-is afterwards.
 */
export const oltpLessons: Lesson[] = [
  // ── 1 ─────────────────────────────────────────────────────────────────
  {
    sectionId: 'oltp-intro',
    intro:
      'A database has two jobs: hold on to the data you give it, and hand it back quickly when you ask. This lesson builds the simplest database imaginable, shows why it’s great at the first job and bad at the second, and introduces the one trade-off behind every design in this chapter.',
    blocks: [
      {
        kind: 'text',
        title: 'Where data lives: memory and disk',
        body: 'Computers keep data in two very different places, and almost every idea in this chapter comes from the tension between them:\n- **Memory (RAM)** is like your **desk**. Everything on it is within arm’s reach, but there isn’t much room, and it’s wiped clean whenever the power goes off.\n- **Disk** — a hard drive, or an **SSD** (solid-state drive: the kind built from memory chips, with no moving parts) — is like a **filing cabinet**. It holds far more and keeps its contents through a power cut, but every trip to it takes much longer than reaching across your desk.\n\nSo databases keep the real copy of your data on disk, where it’s safe, and use memory to make things fast.',
      },
      {
        kind: 'text',
        title: 'The kind of database this half of the chapter is about',
        body: 'Most apps need a database that handles lots of small, quick requests: “save this order”, “show me user 7’s profile”. This is called **OLTP** (online transaction processing). Think of a shop’s checkout: many customers, each served quickly, one at a time. (A **transaction** here just means one small unit of work, like a single purchase.)',
      },
      {
        kind: 'text',
        title: 'The simplest database you could build',
        body: 'Picture a **key-value store**: a database that remembers a **value** under a **key**, like a coat check that hands your coat (the value) back when you show your ticket (the key).\n\nThe simplest possible version is one text file:\n- To **save** a value, add the line `key,value` to the **end** of the file. Adding to the end is called **appending** — like writing the next entry in a diary.\n- To **read** a key, go through the file from top to bottom — a **scan** — and return the **last** line with that key. Nothing is ever crossed out, so a later line is simply a newer version of the same key.',
      },
      {
        kind: 'text',
        title: 'Why saving is fast',
        body: 'Appending is the cheapest thing you can ask a disk to do. There’s nothing to search for and nothing to shuffle around — you just add a few **bytes** (a byte is roughly one character of text) at the end, like adding an item to the bottom of a shopping list. Changing a key doesn’t touch its old line either: the new line simply wins.',
      },
      {
        kind: 'text',
        title: 'Why reading is slow',
        body: 'To find one key you have to read the **whole** file, because its newest version could be on any line — like finding the latest note about a topic by reading every page of a diary. Twice the data means every read takes twice as long. Programmers write this as **O(n)** (say “order n”): the work grows in step with **n**, the number of records.',
      },
      {
        kind: 'widget',
        widget: 'append-log',
        title: 'The append-only database',
        body: 'Every **set** appends a line; every **get** reads the file line by line and keeps the **last** match. The grey number at the start of each line is its **byte offset**: how many bytes from the start of the file that line begins — like a house number on a long street. Set a new version of `user:7`, then get it. Then add 20 records and get again: the scan takes much longer.',
      },
      {
        kind: 'text',
        title: 'What “log” means in databases',
        body: 'In databases, a **log** is a file you only ever add to at the end — exactly like the one above, or a ship’s logbook, where each new entry goes below the last and nothing is ever erased. It doesn’t have to be readable by people; it can be raw data that only the database understands.\n\nA real database adds plenty on top — coping with many writers at once, reclaiming disk space, dealing with a half-written last line after a crash — but the core idea stays this simple. Logs turn up all over data systems, as you’ll see throughout this book.',
      },
      {
        kind: 'pitfall',
        body: '“Log” here is not “logging”. It doesn’t mean the messages an app prints while it runs; it means an append-only file of records.',
      },
      {
        kind: 'text',
        title: 'Indexes',
        body: 'To avoid scanning everything, databases build an **index**: an extra structure, built from the main data, that lets you jump straight to what you want. An index is **derived data** — it can be rebuilt from the main data at any time. Adding or dropping an index never changes what is stored, only how fast you can find it. If you look the same data up in different ways (by email, by date…), you may want several indexes.',
      },
      {
        kind: 'analogy',
        body: 'An index works like the index at the back of a textbook: a separate, sorted list that tells you which page to turn to. It’s built from the book — you could tear it out and make it again — and it doesn’t change the text itself. But every time the book is revised, someone has to update the index too.',
      },
      {
        kind: 'text',
        title: 'The core trade-off',
        body: 'Here’s the catch: every index has to be updated on **every write**, and every index takes up **disk space**. Think of a shop that keeps one catalogue sorted by product name, another by price and another by brand — each new product means updating all three. So a good index speeds up reads but slows down writes, sometimes a lot.\n\nThat’s why databases don’t index everything automatically. You choose indexes yourself, based on the questions your application actually asks.\n\nScroll back up to the widget and tick **keep a hash index in memory** to feel this trade-off: reads become instant, and every write does a little extra work. (The next lesson explains how that index works.)',
      },
      {
        kind: 'table',
        title: 'The trade-off at a glance',
        head: ['', 'Plain log, no index', 'With indexes'],
        rows: [
          ['Writes', 'As fast as it gets (one append)', 'Slower — every index is updated too'],
          ['Reads by key', 'Read the whole file, O(n)', 'Fast'],
          ['Disk space', 'Just the data', 'The data plus each index'],
        ],
      },
      {
        kind: 'check',
        question: 'A table receives 50,000 new rows per second, and you add three new indexes to it. What happens to the number of rows per second it can keep up with, and why?',
        answer: 'It drops: every new row now also has to be added to three more structures, which means more work and more bytes written to disk.',
      },
    ],
    takeaways: [
      'Memory is fast but small and forgetful; disk is big and permanent but slow.',
      'Appending to the end of a file is the cheapest write; reading a whole file is the most expensive read (O(n)).',
      'In databases a log is an append-only file of records — not app logging.',
      'An index is derived data, like a book’s index: it speeds up reads, slows down writes and costs space.',
      'Choose indexes from the questions your app really asks.',
    ],
  },

  // ── 2 ─────────────────────────────────────────────────────────────────
  {
    sectionId: 'log-structured',
    intro:
      'Lesson 1’s log was great at writing and bad at reading. **Log-structured** storage keeps the fast “just append” write and adds just enough organisation to make reads fast too. We’ll build it in three steps — a hash index, sorted files, then the full LSM-tree — the design inside RocksDB, Cassandra, ScyllaDB, HBase and the search library Lucene.',
    blocks: [
      {
        kind: 'text',
        title: 'Step 1 — a hash index over the log',
        body: 'Keep a **hash map** in memory: a lookup table that takes a key and instantly tells you where its data is, like a valet’s key board where each ticket number has its own hook. It’s called a “hash” map because each key is run through a **hash function** — a formula that turns any key into a number, always the same number for the same key — and that number picks the slot.\n\nFor every key, the map stores the **byte offset** of that key’s newest line in the file:\n- **Write:** append the line to the file, then update the map with the new offset.\n- **Read:** look the offset up in the map, jump straight there, and read one line.\n\nOften that read doesn’t even touch the disk. The **operating system** (Windows, macOS, Linux — the software that runs the hardware) keeps recently used parts of files in spare memory, called its **cache** — like leaving the folders you’ve just used on your desk instead of walking them back to the cabinet.',
      },
      {
        kind: 'widget',
        widget: 'hash-index',
        title: 'A hash index over the log',
        body: 'Now **get** jumps straight to a byte offset instead of scanning. Then press **crash & restart**: the file survives on disk, but the map lived only in memory, so it’s gone — like a desk wiped clean overnight. Reads fall back to scanning until you **rebuild** the index, which means reading the entire log.',
      },
      {
        kind: 'text',
        title: 'Where the hash index falls short',
        body: '- **The file grows forever.** Old versions of a key are never cleaned up.\n- **Restarts are slow.** After a crash, the map has to be rebuilt by reading the whole log.\n- **Every key must fit in memory.** Keeping the hash map on disk instead is slow, because each lookup jumps to a different spot: **random I/O** (I/O means input/output — reading from or writing to the disk). It’s like fetching books from all over a library instead of taking them from one shelf.\n- **No range queries.** A **range query** asks for every key between two values, such as “all users from user:100 to user:199”. A hash map puts neighbouring keys in unrelated slots — like a coat rack where tickets 100 and 101 hang on opposite walls — so that query turns into 100 separate lookups.',
      },
      {
        kind: 'text',
        title: 'Step 2 — keep the file sorted: the SSTable',
        body: 'Most real databases keep data **sorted by key** instead. An **SSTable** (Sorted String Table) is a file of key-value pairs in key order, with each key appearing at most once — like a phone book: alphabetical, one entry per name. Sorting brings three big wins:\n- **A small, sparse index.** Split the file into **blocks** of a few kilobytes (a few thousand characters each) and remember only the **first key of each block**. This is a **sparse index** — “sparse” because it lists only some of the keys, like the guide words at the top of each dictionary page (“lamp – lantern”). To find any key, go to the single block whose range covers it and read just that block.\n- **Compression.** Each block can be **compressed** — squeezed into fewer bytes, like vacuum-packing clothes — saving disk space and reading time, at the cost of a little work for the processor (the **CPU**, the chip that does the computing) to unpack it.\n- **Range queries.** Neighbouring keys sit next to each other in the file, so “everything from A to B” is one continuous read.',
      },
      {
        kind: 'widget',
        widget: 'sparse-index',
        title: 'Looking up a key with a sparse index',
        body: 'The index lists only the first key of each block. Pick a key: the sort order points to the one block that could hold it, and only that block is read from disk.',
      },
      {
        kind: 'check',
        question: 'Using the SSTable above, where do you look for `cranberry`, and what does it mean if it isn’t there?',
        answer: 'Only in block 1, because blueberry ≤ cranberry < fig. If it isn’t in that block, it isn’t anywhere in this file.',
      },
      {
        kind: 'text',
        title: 'Step 3 — sorted files, even though writes arrive in any order',
        body: 'There’s a snag. You can’t simply append to a sorted file (it would stop being sorted), and rewriting the whole file on every write would be far too slow. The **LSM-tree** (Log-Structured Merge-tree) gets around this by sorting in memory first and writing sorted files to disk in one go.',
      },
      {
        kind: 'analogy',
        body: 'Think of an office that handles paper forms. New forms land in an **in-tray** on the clerk’s desk, which the clerk keeps in alphabetical order. When the tray is full, the clerk files the whole sorted bundle in the cabinet as a new folder and starts an empty tray. Every so often, someone combines old folders into one, throwing away forms that were replaced by newer ones. That’s an LSM-tree: the in-tray is the **memtable**, each filed bundle is an **SSTable**, and the tidying-up is **compaction**.',
      },
      {
        kind: 'steps',
        title: 'The LSM write path',
        steps: [
          'Append the write to a **write-ahead log (WAL)** on disk. It isn’t sorted — it’s a safety copy, like jotting each order on a notepad before you start working on it, so nothing is lost if you’re interrupted. Its only job is to rebuild the memtable after a crash.',
          'Insert the write into the **memtable**: a sorted list kept in memory. Keys can arrive in any order and it keeps them sorted, like a card file that alphabetises itself. (Under the hood it’s a structure such as a **red-black tree**, a **skip list** or a **trie** — a trie stores keys letter by letter, the way autocomplete narrows its suggestions as you type. All three are just clever ways of keeping items in order as you add them.)',
          'When the memtable passes a size limit — typically a few megabytes — write it to disk as a new SSTable in **one sequential pass**: one continuous stream from start to finish, like recording onto a tape, rather than jumping around. This is called a **flush**, and each file it produces is a **segment** of the database. Meanwhile, new writes go into a fresh, empty memtable. A segment is never changed after it’s written — it is **immutable**, like a printed book: corrections go into a new edition, never into old copies.',
          'Once the flush has finished, the WAL entries it covered aren’t needed any more and are thrown away.',
        ],
      },
      {
        kind: 'diagram',
        title: 'An LSM-tree at a glance',
        art: art(`
 write ──┬──▶ WAL           (disk · append-only · crash recovery)
         └──▶ memtable      (RAM · sorted)
                  │  full? write it out sequentially
                  ▼
          ┌─────────────────┐
          │ SSTable #3      │  newest
          │ SSTable #2      │
          │ SSTable #1      │  oldest     (all immutable)
          └─────────────────┘
          background: merge & compact segments`),
      },
      {
        kind: 'steps',
        title: 'The LSM read path',
        steps: [
          'Look in the memtable first — it holds the very latest writes.',
          'Then check the segments from **newest to oldest**. Stop at the first match: it’s the most recent value.',
          'If no segment has the key, it doesn’t exist.',
        ],
      },
      {
        kind: 'text',
        title: 'Deleting with tombstones',
        body: 'Segments are immutable, so how do you delete a key? You write a special record called a **tombstone**, which means “this key has been deleted” — like a “cancelled” stamp on a form. A read that reaches the tombstone first reports “not found”, even though older segments further down still hold the old value.',
      },
      {
        kind: 'text',
        title: 'Bloom filters — skipping segments that can’t have the key',
        body: 'Looking up a key that doesn’t exist (or that was last written long ago) means checking segment after segment. To avoid most of that work, each segment comes with a **Bloom filter**: a tiny summary that answers “could this key be in this segment?” almost instantly.',
      },
      {
        kind: 'analogy',
        body: 'Imagine a bouncer who can’t memorise a whole guest list. For each guest they remember just three features — “glasses”, “red jacket”, “beard”. If you’re missing **any** of the features on the list, you’re **definitely not** a guest. If you have **all** of them, you’re **probably** a guest — or you just happen to look like some. That’s a Bloom filter: it can wrongly say “maybe”, but it never wrongly says “no”.',
      },
      {
        kind: 'steps',
        title: 'How a Bloom filter works',
        steps: [
          'Start with a row of **m** **bits**, all 0. (A bit is a single 0 or 1 — picture a row of light switches, all off.)',
          'To **add** a key, run it through **k** different hash functions to get k positions, and switch those bits to 1.',
          'To **check** a key, work out the same k positions. If **any** of them is 0, the key is **definitely not** there. If **all** are 1, it’s **probably** there.',
        ],
      },
      {
        kind: 'diagram',
        title: 'A 10-bit Bloom filter with two keys (k = 3)',
        art: art(`
position:  0 1 2 3 4 5 6 7 8 9
bits:      0 1 0 0 1 0 1 0 0 1

add   "cat" → 1, 4, 9   set to 1
add   "dog" → 4, 6, 9   set to 1
check "owl" → 2, 6, 9   bit 2 is 0  → definitely absent
check "emu" → 1, 6, 9   all are 1   → "maybe" (false positive!)`),
      },
      {
        kind: 'text',
        title: 'Why a wrong “maybe” is fine',
        body: 'Bits are only ever switched on, never off, so a key that was added always gets “maybe”. There are **no false negatives** — a false negative would be wrongly saying “not here”, like a smoke alarm staying silent during a fire. But other keys can happen to switch on every one of a key’s bits, giving a **false positive** — like a smoke alarm going off for burnt toast.\n\nIn an LSM-tree a false positive just wastes one block read: the engine looks, doesn’t find the key, and moves on to the next-older segment. The answer is still correct.\n\nRule of thumb: about **10 bits per key** gives roughly **1%** false positives, and every extra **5 bits per key** cuts that by about **10×**.',
      },
      {
        kind: 'widget',
        widget: 'bloom-mini',
        title: 'A 16-bit Bloom filter',
        body: 'Add a few words and watch their bits switch on. Then **check** words you did and didn’t add — the check stops at the first 0 bit. Keep adding until most bits are 1, then check the other animals and count the false positives.',
      },
      {
        kind: 'try',
        labId: 'bloom',
        body: 'For bigger filters, tune the number of bits and hash functions, and measure the false-positive rate against the formula.',
      },
      {
        kind: 'widget',
        widget: 'lsm-mini',
        title: 'Writes and reads in an LSM-tree',
        body: 'Now everything together. `put` appends to the WAL and inserts into the sorted memtable; every third write flushes the memtable to disk as a new SSTable, with its own Bloom filter (the strip of little bars). `get` checks the memtable, then the segments newest → oldest, skipping any whose Bloom filter says “definitely not”. Try **get apple** (two versions exist) and **get fig** (the newest segment holds a tombstone).',
      },
      {
        kind: 'text',
        title: 'Merging and compaction',
        body: 'Over time segments pile up and fill with outdated values. A background job **merges** them. Picture merging two alphabetised stacks of exam papers: look at the top paper of each stack, move whichever name comes first onto a new pile, and repeat. When both stacks have a paper for the same name, keep the one from the **newer** stack and throw the other away. The new pile is sorted too, with one entry per key. And because you only ever look at the top of each stack, merging needs very little memory, however big the files are.\n\nThis clean-up is called **compaction**. While it runs, reads keep using the old segments; when it’s done, reads switch to the new file and the old ones are deleted.',
      },
      {
        kind: 'diagram',
        title: 'Merging two segments',
        art: art(`
newer:  [ apple=3 │           │ fig=9 │ kiwi=✝ ]
older:  [ apple=1 │ banana=2  │       │ kiwi=5 ]
                         merge ▼
output: [ apple=3 │ banana=2  │ fig=9 │ kiwi=✝ ]   newest value wins
                                         ✝ = tombstone`),
      },
      {
        kind: 'text',
        title: 'When can a tombstone finally go?',
        body: 'A merge uses a tombstone to throw away older values of that key. But the tombstone itself can only be dropped once it reaches the **oldest** data. Until then, some older segment that wasn’t part of this merge might still hold the old value, and the tombstone is the only thing hiding it.',
      },
      {
        kind: 'check',
        question: 'Why can’t a merge simply drop a tombstone the first time it sees one?',
        answer: 'An older segment that isn’t part of this merge may still hold the key’s old value. Without the tombstone to hide it, reads would find that old value again — the deleted data would come back.',
      },
      {
        kind: 'widget',
        widget: 'merge',
        title: 'Merging two segments, step by step',
        body: 'Run the merge above. Then tick **output becomes the oldest segment** and run it again to see when the tombstone for `kiwi` may finally be dropped.',
      },
      {
        kind: 'text',
        title: 'Crash safety comes free with immutable files',
        body: 'Because segments are written once, in one pass, and never edited, crashes are easy to recover from. If the database dies halfway through writing a file, it simply deletes the unfinished file and starts again. The memtable is rebuilt by **replaying** the WAL: reading it from the start and redoing each write, like re-entering orders from the notepad. Each WAL record carries a **checksum** — a short fingerprint calculated from its contents, like the total at the bottom of a receipt — so a record that was only half-written when the power went out is spotted and thrown away.\n\nImmutable files also suit **object storage**: cloud services such as Amazon S3 that store whole files as “objects”, like a warehouse that keeps sealed boxes — you can swap a box, but not edit what’s inside. Some systems, such as SlateDB and Delta Lake, keep their segments there.',
      },
      {
        kind: 'text',
        title: 'Choosing what to merge: compaction strategies',
        body: 'An engine decides **which** segments to merge, and **when**, using a **compaction strategy**. The right one depends on your **workload** — the particular mix of reads and writes your application sends. The two main strategies:',
      },
      {
        kind: 'table',
        title: 'Compaction strategies',
        head: ['', 'Size-tiered', 'Leveled'],
        rows: [
          [
            'How it works',
            'Once several segments of similar size pile up, merge them into one bigger segment — like rolling loose coins into a roll, and later several rolls into a bag',
            'Segments have a fixed size and sit in **levels** (L0, L1, …), like shelves. Beyond L0, each level covers the whole key range, split between its segments, and is about 10× bigger than the one above; data moves down one level at a time',
          ],
          ['Strength', 'Very high **write throughput** (writes per second): data is rewritten only a few times, in big sequential merges', 'Reads check fewer files; less disk space; the work happens in small steps'],
          ['Weakness', 'Old segments get huge, and merging them needs lots of temporary disk space', 'More rewriting work when there are lots of writes'],
          ['Choose it when', 'Mostly writes, few reads', 'Mostly reads — or a few keys are written very often and most keys rarely'],
        ],
      },
      {
        kind: 'text',
        body: 'Merging four 256 MB files usually produces less than 1 GB, because replaced values, deleted keys and expired data are dropped along the way. (Data can be given a **time-to-live**, or TTL — an expiry date, like the one on a milk carton.) Most LSM engines let you pick the strategy that suits your workload.',
      },
      {
        kind: 'try',
        labId: 'lsm',
        body: 'Write, delete and read keys step by step. Watch the memtable flush, tombstones disappear in a major compaction, and Bloom filters skip segments.',
      },
      {
        kind: 'text',
        title: 'Side note: embedded storage engines',
        body: 'Not every database is a separate server. An **embedded** engine is a **library** — a bundle of ready-made code — that runs **inside your own application** and reads and writes local files through ordinary function calls. It’s like keeping a notebook in your pocket instead of phoning a records office. RocksDB, SQLite, LMDB, DuckDB and KùzuDB are examples, and they’re everywhere in mobile apps.\n\nOn a server they make sense when the data fits on one machine and not many people change it at the same time — for example, one small embedded database per customer account (a **tenant**, like a flat in an apartment building) when accounts never need to be queried together.',
      },
    ],
    takeaways: [
      'A hash map in memory makes reads instant, but needs every key in memory, is lost on restart and can’t do range queries.',
      'SSTables are sorted, like a phone book: a sparse index finds the right block, blocks compress well, and range queries are easy.',
      'LSM write path: WAL (safety copy) + sorted memtable → flushed in one sequential pass as an immutable SSTable segment.',
      'LSM read path: memtable, then segments newest → oldest; the first match wins.',
      'Deletes write tombstones; compaction merges segments, keeps the newest value per key, and drops a tombstone only when it reaches the oldest data.',
      'Bloom filters say “definitely not” or “maybe” — a wrong “maybe” wastes a little work but never gives a wrong answer.',
      'Size-tiered compaction favours writes; leveled favours reads and disk space.',
    ],
  },

  // ── 3 ─────────────────────────────────────────────────────────────────
  {
    sectionId: 'btrees',
    intro:
      'The **B-tree** (invented in 1970) is the most widely used index of all. Practically every **relational database** — the classic kind that stores tables of rows and columns and answers questions written in **SQL**, the standard database query language — uses one. Like an SSTable, a B-tree keeps keys sorted. But instead of writing new files and merging them, it **edits data in place**, like correcting a page in a ring binder instead of reprinting the book.',
    blocks: [
      {
        kind: 'text',
        title: 'Pages, not segments',
        body: 'A B-tree splits the database into fixed-size **pages**, like the numbered pages of a ring binder, and always reads or writes a whole page at a time. Pages are small: traditionally 4 **KiB** (a kibibyte is 1,024 bytes — essentially a kilobyte), 8 KiB in PostgreSQL and 16 KiB in MySQL. When something changes, its page is **overwritten in place**.\n\nEvery page has a number, so one page can point to another — “continued on page 37”. And since all pages are the same size, page number × page size tells you exactly where in the file a page starts.',
      },
      {
        kind: 'table',
        title: 'Two design philosophies',
        head: ['', 'LSM-tree', 'B-tree'],
        rows: [
          ['Unit on disk', 'Segments of varying size (megabytes or more)', 'Fixed-size pages (4–16 KiB)'],
          ['Changing data', 'Write new files; never touch old ones', 'Overwrite the page in place'],
          ['Sorted by key?', 'Yes', 'Yes'],
        ],
      },
      {
        kind: 'analogy',
        body: 'Think of a big library with signposts. The entrance sign says “A–H: left wing · I–P: middle · Q–Z: right wing”. In each wing, aisle signs narrow it down further, until you reach the shelf that actually holds the book. You never search the whole library — you just follow a few signs.',
      },
      {
        kind: 'text',
        title: 'The shape of the tree',
        body: 'A B-tree works the same way as those signposts:\n- One page is the **root** — the entrance sign. Every lookup starts there.\n- Each page holds a few keys and pointers to **child pages** below it. The keys act as **boundaries**: everything between two boundary keys lives in the child page between them.\n- At the bottom, **leaf pages** hold the keys themselves, each with its value (or with a pointer to where the value is stored). Pages between the root and the leaves are **interior** pages — the aisle signs.\n\n(Strictly speaking, this variant is called a **B+ tree**, but people usually just say B-tree.)',
      },
      {
        kind: 'diagram',
        title: 'Finding key 251',
        art: art(`
root       [  100  │  200  │  300  ]
                        │  200 ≤ 251 < 300
                        ▼
interior   [  220  │  240  │  260  ]
                        │  240 ≤ 251 < 260
                        ▼
leaf       [ 241 │ 247 │ 251 │ 255 ]   ← found after reading 3 pages`),
      },
      {
        kind: 'text',
        title: 'Why the tree stays shallow',
        body: 'The number of child pointers in a page is its **branching factor** — how many doors lead out of each room. Keys and pointers are small, so a page holds **several hundred** of them. Each extra level therefore multiplies the capacity by hundreds, and the number of levels grows extremely slowly as data grows. Programmers write this as **O(log n)**. Most databases fit in **3–4 levels**, and a lookup reads just one page per level.\n\nBack-of-the-envelope: 4 levels, with 500 children per page and 4 KiB pages, hold about 500⁴ pages × 4 KiB ≈ **250 TB**.',
      },
      {
        kind: 'check',
        question: 'Roughly how many page reads does it take to find one row among billions?',
        answer: 'Three or four — one per level of the tree.',
      },
      {
        kind: 'text',
        title: 'Updating and inserting: pages split',
        body: 'To **update** a value, find its leaf page and overwrite that page with the new value in it. To **insert** a new key, find the leaf whose range covers it and add the key there.\n\nIf that leaf is already full, it **splits** — like a section of a binder that has outgrown its tab. Divide it into two half-full pages, and add a new tab to the parent: a new boundary key plus a pointer to the new page. If the parent is full too, it splits as well, possibly all the way up. When the root itself splits, a **new root** is created above it and the tree grows one level taller.\n\nBecause the tree only ever grows at the top, every leaf stays the same distance from the root. The tree is always **balanced**, like a library where every book is the same number of signposts from the entrance. (Deleting is trickier, because nearly empty pages may need to be merged.)',
      },
      {
        kind: 'diagram',
        title: 'Inserting 334 into a full leaf (max 4 keys per page)',
        art: art(`
before:
  parent  [ … │ 333 │ 345 │ … ]
                    │
                    ▼
          [ 333 │ 335 │ 337 │ 340 ]   ← leaf is full

after:
  parent  [ … │ 333 │ 337 │ 345 │ … ]   ← new boundary 337
                    │     │
          ┌─────────┘     └─────────┐
          ▼                         ▼
  [ 333 │ 334 │ 335 ]         [ 337 │ 340 ]   ← two half-full pages`),
      },
      {
        kind: 'widget',
        widget: 'btree-mini',
        title: 'Insert and find in a B-tree',
        body: 'Pages here hold at most 3 keys, so splits happen quickly. Insert a few keys (try 25, 35, 45, or keep pressing the “insert” shortcut) and watch: the overflowing page turns red, splits in two, and its parent gets a new boundary key. Keep going until the root splits and the tree grows a level. Then **find** a key: one page is read per level.',
      },
      {
        kind: 'text',
        title: 'The danger of overwriting pages',
        body: 'A split overwrites several pages at once — the two halves and the parent. If the machine crashes after only some of them have reached the disk, the tree is **corrupted**:\n- You can end up with an **orphan page**: a page that exists on disk but that no parent points to — like a book on a shelf with no catalogue entry, which nobody can ever find.\n- If the hardware can’t write a whole page **atomically** — all or nothing, like a bank transfer that either fully happens or doesn’t happen at all — you can get a **torn page**: half old and half new, like a sheet that jammed halfway through the printer.',
      },
      {
        kind: 'steps',
        title: 'The fix: write to the WAL first',
        steps: [
          'Before changing any page, append a note describing the change to the WAL.',
          'Call **fsync** on the WAL. Normally, when a program writes to a file, the operating system holds the data in a memory **buffer** for a while — like letters waiting in your outbox — and sends it to the disk later. fsync forces it onto the disk right now, like walking the letters to the post office yourself. After that the change is **durable**: it will survive a power cut.',
          'Now change the pages. They may stay in memory for a while before being written to disk.',
          'After a crash, replay the WAL to finish or redo any interrupted changes, bringing the tree back to a consistent state.',
        ],
      },
      {
        kind: 'text',
        body: 'Because the WAL already guarantees durability, a B-tree engine can keep changed pages in memory and write them out later in batches, which is much faster. **File systems** — the part of the operating system that organises files on a disk — use the same trick and call it **journaling**.',
      },
      {
        kind: 'widget',
        widget: 'wal-crash',
        title: 'Pull the plug during a page split',
        body: 'Pick the moment the machine crashes, then step through what happens. Without a WAL, some crash points leave the tree permanently corrupted. Switch the WAL on and try the same moments again.',
      },
      {
        kind: 'check',
        question: 'A write was confirmed to the user, but its changed page was still only in memory when the power failed. Is the data lost?',
        answer: 'No. The change was fsynced to the WAL before the write was confirmed, so it’s replayed when the database restarts.',
      },
      {
        kind: 'text',
        title: 'Variations worth knowing',
        body: '- **Copy-on-write** (used by LMDB): never overwrite a page. Write the changed version to a **new** spot, then new versions of its parent pages pointing to it, all the way up to the root — like publishing a corrected page plus an updated table of contents instead of scribbling on the original. No WAL is needed, and the old version stays readable. That’s handy for **snapshots** (a frozen picture of the data at one moment, like a photo) and for **concurrency control**: letting many readers and writers work at the same time without tripping over each other.\n- **Abbreviated keys:** interior pages only need enough of each key to tell ranges apart — an aisle sign can say “Sm–St” instead of full names. Shorter keys mean more fit in a page → higher branching factor → fewer levels.\n- **Sequential leaf layout:** storing leaf pages on disk in key order makes **range scans** (reading a range of keys in order) faster, but it’s hard to keep up as the tree grows.\n- **Sibling pointers:** each leaf links to its left and right neighbours, like “previous page / next page” arrows, so a range scan can walk along the leaves without climbing back up the tree.',
      },
    ],
    takeaways: [
      'A B-tree is a balanced tree of fixed-size pages that are overwritten in place, like signposts leading to the right shelf.',
      'A lookup reads one page per level; hundreds of children per page keep trees at 3–4 levels (O(log n)).',
      'A full page splits in two and adds a boundary key to its parent; splits can cascade up and create a new root.',
      'The WAL — appended and fsynced before any page changes, replayed after a crash — prevents orphan and torn pages.',
      'Copy-on-write, abbreviated keys and sibling pointers are common variations.',
    ],
  },

  // ── 4 ─────────────────────────────────────────────────────────────────
  {
    sectionId: 'comparing',
    intro:
      'So which is better, the LSM-tree or the B-tree? Neither wins everywhere. This lesson gives you the vocabulary to judge which one suits a workload — and to take speed claims with a pinch of salt.',
    blocks: [
      {
        kind: 'text',
        title: 'The rule of thumb, and its catch',
        body: 'As a rule of thumb, **LSM-trees suit write-heavy workloads** and **B-trees are faster for reads**. But **benchmarks** — timed test runs that compare systems, like a test drive — are very sensitive to the details of the workload, so always test with **your own** data and queries before deciding. It isn’t strictly either/or, either: some engines blend the two, for example several B-trees merged LSM-style.',
      },
      {
        kind: 'text',
        title: 'Reading one key',
        body: 'A read of a single key is called a **point read**.\n\n**B-tree:** one page per level, and there are only a few levels, so reads are fast and **predictable** — the same number of steps every time.\n\n**LSM:** a read may have to check the memtable and several SSTables at different stages of compaction. Bloom filters cut down the disk reads. Both designs can be fast; which one wins depends on the engine and the workload. Modern **NVMe SSDs** (very fast SSDs that connect almost directly to the processor) can handle many reads at once, and both designs can take advantage of that if they’re built for it.',
      },
      {
        kind: 'text',
        title: 'Range queries',
        body: '**B-tree:** walk along the sorted leaf pages — simple and fast.\n\n**LSM:** each segment is sorted, but a range query has to read **every** segment side by side and merge the results — like collecting all the “M” entries from several separate phone books. Bloom filters can’t help: they answer “is this exact key here?”, and you can’t ask that about every possible key in a range. So range queries cost relatively more in LSM engines.',
      },
      {
        kind: 'text',
        title: 'Hiccups under heavy writes',
        body: '**Latency** is how long a single request waits for its answer. If writes arrive faster than memtables can be flushed — usually because compaction is falling behind — engines such as RocksDB apply **backpressure**: they briefly stop accepting reads and writes until they’ve caught up, like a motorway on-ramp light that holds cars back when the road is jammed. Users see this as sudden **latency spikes**: most requests are quick, then a few take ages.',
      },
      {
        kind: 'text',
        title: 'Sequential vs random writes',
        body: 'A B-tree overwrites pages wherever they happen to be on the disk, so changes to scattered keys become many small writes all over the place: **random writes**. An LSM engine writes whole segment files in one go: fewer, bigger **sequential writes**. Disks move far more data per second when writing sequentially, so an LSM engine can usually keep up with more writes on the same hardware.\n\nOn a spinning **hard disk drive (HDD)** the gap is huge: like a record player, it has to physically move an arm to the right spot before each random write, which takes milliseconds. On SSDs the gap is smaller but still real — here’s why.',
      },
      {
        kind: 'steps',
        title: 'Why SSDs still prefer sequential writes',
        steps: [
          'Flash memory works like a stack of whiteboards: you can write on any blank line (a **page**, about 4 KiB), but you can only wipe a **whole board** at once (an **erase block**, about 512 KiB).',
          'Before wiping a board, the SSD must copy any lines that are still needed onto another board. This tidying is called **garbage collection (GC)**.',
          'Sequential writes tend to fill a whole board with one file. When that file is deleted, the board can be wiped straight away — nothing to copy.',
          'Random writes leave each board with a mix of live and dead lines, so GC has to copy more. That steals write speed from your application **and** wears the flash out sooner, because each part of it survives only a limited number of wipes.',
        ],
      },
      {
        kind: 'widget',
        widget: 'ssd-gc',
        title: 'Deleting a file on flash',
        body: 'Lay out three files either one after another, or mixed together (as random writes would), then delete file B. Step through garbage collection and count how many pages the SSD must copy before it can erase blocks.',
      },
      {
        kind: 'text',
        title: 'Write amplification',
        body: 'Every storage engine turns one write from your application into several writes to disk — like changing one word in a document but having to reprint the whole page, plus a copy for the files. **Write amplification** measures this: total bytes written to disk ÷ the bytes a plain append-only log with no index would write. (Sometimes it’s counted in number of writes instead of bytes.)\n\nIf the disk’s **bandwidth** — how much data it can move per second, like the width of a pipe — is the bottleneck, higher write amplification means fewer writes per second. On SSDs it also wears the flash out faster.',
      },
      {
        kind: 'table',
        title: 'Where the extra writes come from',
        head: ['LSM-tree', 'B-tree'],
        rows: [
          ['Once to the WAL', 'Once to the WAL'],
          ['Again when the memtable is flushed', 'Again to the page itself'],
          ['Again in every compaction that includes the key', 'A whole page, even if only a few bytes changed (needed for crash recovery)'],
        ],
      },
      {
        kind: 'text',
        body: 'For typical workloads LSM-trees have **lower** write amplification: they never rewrite a whole page for a tiny change, and their SSTable blocks compress well. It still depends on the sizes of keys and values, and on how often you overwrite existing keys. When values are much bigger than keys, some engines store the values separately and compact only the keys plus pointers, cutting write amplification further.',
      },
      {
        kind: 'widget',
        widget: 'write-amp',
        title: 'Estimate write amplification',
        body: 'Change the value size, page size, buffering and compaction depth. Small values written into big pages are where B-trees pay most; many rounds of compaction are where LSM-trees pay most.',
      },
      {
        kind: 'pitfall',
        body: 'Benchmark trap: an LSM engine writing into an **empty** database looks amazing, because there’s nothing to compact yet and all the disk bandwidth goes to new writes. As data grows, compaction competes for that bandwidth. Run write benchmarks long enough to reach this “steady state”.',
      },
      {
        kind: 'try',
        labId: 'lsm',
        body: 'Do the “Write amplification” challenge: count how many times each key is written to disk.',
      },
      {
        kind: 'text',
        title: 'Disk space',
        body: '**B-trees fragment.** After lots of deletes, the file is riddled with empty pages — **fragmentation**, like a car park with empty spaces scattered between parked cars. New data can reuse those pages, but they’re stuck in the middle of the file, so the space can’t easily be handed back to the operating system. A background process (PostgreSQL calls it **vacuum**) moves pages around to tidy up.\n\n**LSM files stay compact.** Compaction rewrites the files anyway, SSTables have no half-empty pages, and blocks compress well — so the files are often smaller than a B-tree’s. But replaced values take up space until compaction removes them: not much with leveled compaction, more with size-tiered (especially during big merges).',
      },
      {
        kind: 'text',
        title: 'Deleting data for real',
        body: 'Sometimes you must be sure data is truly gone — for example, to obey privacy laws when someone asks to be forgotten. In an LSM engine a deleted value can survive in older segments until its tombstone has been compacted all the way down to the oldest level, which can take a long time. Some specialised designs push deletions through faster.',
      },
      {
        kind: 'text',
        title: 'Snapshots',
        body: 'Immutable files make LSM snapshots cheap: flush the memtable, write down which segment files exist, and simply don’t delete those files while the snapshot is in use — no copying needed. A B-tree overwrites pages in place, so capturing a point-in-time copy efficiently is harder.',
      },
      {
        kind: 'table',
        title: 'Summary',
        head: ['What matters', 'Usually better', 'Why'],
        rows: [
          ['Write throughput', 'LSM', 'Sequential writes, lower write amplification'],
          ['Predictable point reads', 'B-tree', 'One page per level'],
          ['Range queries', 'B-tree', 'Walk the sorted leaves; no merging across segments'],
          ['Disk space', 'LSM', 'No fragmentation, better compression'],
          ['Snapshots', 'LSM', 'Immutable files'],
          ['Deleting data quickly for good', 'B-tree', 'LSM tombstones take time to reach the oldest data'],
          ['Steady latency during write bursts', 'B-tree', 'LSM may stall with backpressure'],
        ],
      },
      {
        kind: 'check',
        question: 'Your service mostly runs range queries over recent data, with modest writes, and even the slowest 1% of requests must be fast (a strict **tail latency** target — the “tail” being the slowest few requests). Which family would you start with, and why?',
        answer: 'B-tree: range queries just walk the sorted leaves, reads are predictable, and there are no compaction stalls. Then benchmark it with your real workload.',
      },
    ],
    takeaways: [
      'Rule of thumb: LSM for write-heavy, B-tree for read-heavy — but always benchmark your own workload.',
      'Range queries are cheap on B-trees; LSM engines must merge across segments, and Bloom filters can’t help.',
      'Sequential writes beat random writes on HDDs, and still on SSDs, because flash wipes whole blocks and GC must copy live pages.',
      'Write amplification = bytes written to disk ÷ bytes the app wrote; usually lower for LSM. Benchmark long enough to include compaction.',
      'B-trees fragment; LSM compresses better, but deleted data lingers until compacted; LSM snapshots are cheap.',
    ],
  },

  // ── 5 ─────────────────────────────────────────────────────────────────
  {
    sectionId: 'secondary-indexes',
    intro:
      'Real applications look records up by more than one thing — a user by email, an order by customer. This lesson covers secondary indexes, what an index entry can point to, and why in-memory databases are fast (the reason may surprise you).',
    blocks: [
      {
        kind: 'text',
        title: 'Primary and secondary indexes',
        body: 'A **primary key** is the value that uniquely identifies one record — like a passport number for a person. The record might be a **row** in a table, a **document** (a self-contained record, like a filled-in form) or a **vertex** in a graph (one dot in a network of connected things). Other records refer to it by that key, and the **primary index** finds a record from its key.\n\nA **secondary index** lets you search by other fields — for example, “all orders where `customer_id = 42`”. It’s like a library that catalogues books by title but also keeps a second catalogue by author. In SQL you create one with `CREATE INDEX`, and a table can have several.',
      },
      {
        kind: 'text',
        title: 'Many records, same key',
        body: 'Primary keys are unique, but secondary keys usually aren’t: lots of orders share `customer_id = 42`. There are two common fixes, and both B-trees and LSM-trees can use either one:',
      },
      {
        kind: 'diagram',
        title: 'Two ways to store keys that repeat',
        art: art(`
A) one entry per key → list of row IDs     B) make each key unique
   customer 42 → [r17, r93, r205]             (42, r17)
   customer 43 → [r18]                        (42, r93)
                                              (42, r205)
                                              (43, r18)`),
        caption: 'Option A is like a book-index entry listing several page numbers. Option B makes every key unique by tacking the row’s ID onto the end.',
      },
      {
        kind: 'text',
        title: 'What does an index entry point to?',
        body: '- **Clustered index:** the whole row lives **inside** the index — like a dictionary, where each definition sits right next to its word. MySQL’s InnoDB engine always stores a table this way, organised by primary key; SQL Server lets you choose one clustered index per table.\n- **Reference:** the index entry holds directions to the row instead. Either the row’s **primary key** (InnoDB’s secondary indexes do this, so you then look the row up again in the clustered index), or its location in a **heap file** — an area where rows sit in no particular order, wherever there was room, like a warehouse floor where the index tells you the bay number. PostgreSQL works this way.\n- **Covering index:** a middle ground that copies **some** columns into the index, so certain queries can be answered from the index alone — the index **covers** the query, like a cheat sheet that already holds the answer so you never open the textbook. Reads get faster, but the duplicated data takes more space and slows down writes.',
      },
      {
        kind: 'diagram',
        title: 'Three layouts',
        art: art(`
clustered:   index ──▶ [ key │ entire row ]
heap:        index ──▶ [ key │ ptr ] ──▶ heap file: row
covering:    index ──▶ [ key │ email, status │ ptr ] ──▶ heap (only if needed)`),
      },
      {
        kind: 'check',
        question: '`SELECT status FROM users WHERE email = ?` runs millions of times a day. Which index lets it skip reading the row entirely?',
        answer: 'A covering index on `email` that also stores `status`.',
      },
      {
        kind: 'widget',
        widget: 'index-hops',
        title: 'Follow a query through the indexes',
        body: 'Pick how the table is stored and which query runs, then step through the structures the lookup has to visit.',
      },
      {
        kind: 'text',
        title: 'When a row grows',
        body: 'If an updated row is no bigger than before, it can be overwritten where it is in the heap. If it’s bigger, it may not fit and has to **move** somewhere else. Then either **every index** pointing to it must be updated, or a **forwarding pointer** is left at the old spot — like a “we’ve moved” sign on an old shop door.',
      },
      {
        kind: 'text',
        title: 'Keeping everything in memory',
        body: 'Everything so far exists because disks are awkward: data has to be laid out carefully to be fast. We put up with that because disks are durable and **cheap per gigabyte**. But memory keeps getting cheaper, and many datasets now fit entirely in RAM (perhaps spread over several machines). Hence **in-memory databases**:\n- Some, like the cache **Memcached**, are fine with losing their data on a restart — like sticky notes you can always rewrite.\n- **Durable** in-memory databases protect their data by writing a log of changes to disk, saving regular snapshots, or keeping copies on other machines (**replication** — like leaving a spare house key with a neighbour). On restart they reload from disk or from a copy. Reads are still served entirely from memory; the disk is only a safety net (and handy for backups).\n- Examples: VoltDB, SingleStore and Oracle TimesTen (relational), and RAMCloud (key-value). Redis and Couchbase offer only **weak durability**: they write to disk **asynchronously** — in the background, without waiting for it to finish, like posting a letter without waiting for delivery confirmation — so the last few changes can be lost in a crash.',
      },
      {
        kind: 'pitfall',
        body: 'Surprise: in-memory databases are **not** fast mainly because they avoid reading from disk. A disk-based database with plenty of RAM rarely reads from disk either, because the operating system’s cache already holds the busy parts. The real win is skipping **encoding**: converting in-memory structures into a byte format that can be written to disk and read back — like flat-packing furniture for shipping and reassembling it at the other end. An in-memory database keeps everything assembled.',
      },
      {
        kind: 'text',
        body: 'Living in memory also makes it easy to offer data structures that are hard to build on disk. Redis, for example, offers **priority queues** (a line where the most urgent item always comes out first, like hospital triage) and **sets** (collections without duplicates, like a guest list).',
      },
    ],
    takeaways: [
      'A primary key identifies one record; a secondary index lets you search by other fields.',
      'Secondary keys repeat: store a list of row IDs per key, or tack the row ID onto the key to make it unique.',
      'An index can hold the whole row (clustered), directions to it (primary key or heap location), or some extra columns (covering).',
      'A row that grows may move: update every index, or leave a forwarding pointer.',
      'In-memory databases can be durable (log, snapshots, replication); their speed comes from skipping encoding, not from avoiding disk reads.',
    ],
  },
];
