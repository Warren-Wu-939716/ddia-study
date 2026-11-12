import type { Problem } from '../types.ts';

/** End-of-lesson problems for lessons 6–10. */
export const analyticsProblems: Problem[] = [
  // ── 6 · Analytics and data warehouses ────────────────────────────────
  {
    id: 'p04.olap.1',
    sectionId: 'analytics-storage',
    skill: 'predict',
    kind: 'choice',
    prompt: 'A query sums one column over 2 billion rows to produce a single number. What mainly decides how long it takes?',
    options: [
      { text: 'How quickly the database can answer each of many small requests.', why: 'That’s what limits OLTP. This is one huge request.' },
      { text: 'How many bytes have to be read from disk, and how much CPU work is spent per row.', correct: true, why: 'Scanning billions of rows is bound by data volume and per-row processing.' },
      { text: 'How many indexes the table has on its primary key.', why: 'A key index helps find a few rows; this query touches nearly all of them.' },
      { text: 'How many users are logged in to the application.', why: 'The application’s users don’t run warehouse scans.' },
    ],
    explanation: 'Analytics queries read huge amounts of data to produce a few aggregates, so storage layouts and execution engines for analytics focus on reading fewer bytes and spending less CPU per row.',
  },
  {
    id: 'p04.olap.2',
    sectionId: 'analytics-storage',
    skill: 'design',
    kind: 'justify',
    prompt:
      'Analysts run “sales per region last quarter” reports directly against the shop’s production database. At month-end, when they all run reports, checkout becomes slow. What do you do?',
    options: [
      { text: 'Copy the data into a separate data warehouse (for example with ETL jobs) and point the analysts there.', correct: true, why: 'Analytics gets its own system, organised for its kind of query.' },
      { text: 'Add indexes on every column of the production tables.', why: 'Every checkout write now updates many more indexes — slower still — and the reports still scan most rows.' },
      { text: 'Ask the analysts to run their reports at night.', why: 'A workaround, not a fix: the two workloads still fight over one system, just at different times.' },
    ],
    reasons: [
      { text: 'Reports read millions of rows while checkout needs quick replies to many small requests; separating them stops one from slowing the other, and lets each be stored the way it is used.', correct: true, why: 'Different access patterns are why OLTP and OLAP systems diverged.' },
      { text: 'Warehouses don’t speak SQL, so analysts can’t accidentally slow anything down.', why: 'Warehouses speak SQL too; the difference is inside.' },
      { text: 'Production databases can’t compute sums.', why: 'They can — the problem is the cost of doing it on the same machine as checkout.' },
    ],
    explanation: 'OLTP and analytics compete badly on one system. A warehouse loaded in batches keeps reports away from the checkout and can be optimised for scans.',
  },
  {
    id: 'p04.olap.3',
    sectionId: 'analytics-storage',
    skill: 'predict',
    kind: 'choice',
    prompt:
      'Your cloud warehouse keeps its data in object storage, separate from the machines that run queries. For three days at month-end, queries become ten times heavier, but the amount of data doesn’t change. What do you scale?',
    options: [
      { text: 'Both compute and storage, by moving to bigger machines with bigger disks.', why: 'That’s what you’d do if they were tied together; here they aren’t.' },
      { text: 'Only storage, so more data can be read at once.', why: 'The data hasn’t grown; the work of answering queries has.' },
      { text: 'Only compute, temporarily, then shrink it back afterwards.', correct: true, why: 'Separating compute from storage lets each grow and shrink on its own — elastic.' },
      { text: 'Nothing — cloud warehouses run every query at the same speed regardless of load.', why: 'More concurrent heavy queries need more processing power.' },
    ],
    explanation: 'Because data lives in object storage, you can add query-processing machines for a busy period without copying or moving any data.',
  },
  {
    id: 'p04.olap.4',
    sectionId: 'analytics-storage',
    skill: 'predict',
    kind: 'multi',
    prompt: 'A team stores tables as Parquet files, tracks them with Iceberg, registers them in a data catalog, and queries them with Trino. Which statements are true?',
    options: [
      { text: 'Rows can be deleted even though Parquet files can’t change, because Iceberg records which files make up each version of the table.', correct: true, why: 'The table format handles inserts, deletes and versions.' },
      { text: 'They could switch from Trino to another query engine without rewriting their Parquet files.', correct: true, why: 'The components are separate and swappable.' },
      { text: 'Querying the table as it was last week is a feature of the Parquet file format.', why: 'Time travel comes from the table format, which remembers older sets of files.' },
      { text: 'The data catalog decides how each SQL query is executed.', why: 'Execution plans are the query engine’s job; the catalog lists tables.' },
      { text: 'Another tool can discover which tables exist by asking the catalog, without involving Trino.', correct: true, why: 'Keeping the catalog separate lets other tools share it.' },
    ],
    explanation: 'Storage format = how bytes sit in a file. Table format = which files make up the table (and its history). Catalog = which tables exist. Query engine = plans and runs SQL.',
  },
  {
    id: 'p04.olap.5',
    sectionId: 'analytics-storage',
    skill: 'explain',
    kind: 'explain',
    prompt: 'A data warehouse and a checkout database both understand SQL. Why do they end up built so differently inside?',
    keyPoints: [
      'Checkout (OLTP) handles many small requests that each read or write a few records by key and need a quick reply',
      'Analytics reads millions of rows but only a few columns, to compute a handful of aggregates',
      'So OLTP optimises the wait of each small request, while analytics optimises bytes read and CPU time per row',
      'Analytics data arrives in big batches rather than as a stream of small writes, which allows different storage layouts',
    ],
    explanation:
      'SQL is only the front door. Behind it, a checkout database serves **many small requests by key**, each needing a fast reply, with a steady stream of small writes. A warehouse answers **few, huge queries** that scan millions of rows but only a few columns, and it is loaded in **big batches**. What limits one (the wait per request) is not what limits the other (bytes read and CPU per row), so their storage layouts and execution engines are designed differently.',
  },

  // ── 7 · Column-oriented storage ──────────────────────────────────────
  {
    id: 'p04.col.1',
    sectionId: 'columnar',
    skill: 'calculate',
    kind: 'numeric',
    prompt:
      'A fact table has 200 columns of equal size. A query uses 4 of them and must look at every row. Ignoring compression, how many times fewer bytes does a column store read than a row store?',
    answer: 50,
    unit: '×',
    explanation: 'A row store loads every row in full — all 200 columns — while a column store reads just the 4 it needs: 200 ÷ 4 = **50×** fewer bytes. Compression then widens the gap further.',
  },
  {
    id: 'p04.col.2',
    sectionId: 'columnar',
    skill: 'calculate',
    kind: 'choice',
    prompt: 'Here is the bitmap for one product across 12 rows. Using run-length encoding as in the lesson (alternate counts of 0s and 1s, starting with 0s; trailing 0s are dropped), how is it stored?',
    figure: 'bitmap:  0 0 0 1 1 0 0 0 0 0 1 0',
    options: [
      { text: '3, 2, 5, 1', correct: true, why: 'Three 0s, two 1s, five 0s, one 1 — and the final 0 is implied.' },
      { text: '3, 2, 5, 1, 1', why: 'That also encodes the trailing 0, which the scheme drops.' },
      { text: '4, 5, 11', why: 'Those are the positions of the 1s, not run lengths.' },
      { text: '2, 3, 1, 5', why: 'Runs start with the count of 0s, not 1s.' },
    ],
    explanation: 'Run-length encoding stores how long each run is instead of every bit. It shines when bitmaps are mostly 0s — and even more after sorting, when runs get long.',
  },
  {
    id: 'p04.col.3',
    sectionId: 'columnar',
    skill: 'predict',
    kind: 'choice',
    prompt: 'Which rows match `WHERE product IN (31, 68) AND store = 3`?',
    figure: `row:      1   2   3   4   5   6   7   8
product: 31  68  69  31  31  68  30  31
store:    3   4   3   3   4   3   3   4`,
    options: [
      { text: 'Rows 1, 4 and 6', correct: true, why: 'OR the bitmaps for 31 and 68 (rows 1, 2, 4, 5, 6, 8), then AND with store = 3 (rows 1, 3, 4, 6, 7).' },
      { text: 'Rows 1, 3, 4, 6 and 7', why: 'That’s only the store = 3 condition.' },
      { text: 'Rows 1 and 4', why: 'That forgets product 68 — IN means either value.' },
      { text: 'Rows 1, 2, 4, 5, 6 and 8', why: 'That’s only the product condition; the AND with store is missing.' },
    ],
    explanation: '`IN` combines bitmaps of one column with OR; conditions on different columns combine with AND. It works because bit k means row k in every column.',
  },
  {
    id: 'p04.col.4',
    sectionId: 'columnar',
    skill: 'diagnose',
    kind: 'choice',
    prompt:
      'To squeeze out more compression, an engineer sorts **each column of a column store separately**. Afterwards, queries return combinations that never happened — a product sold in a store that never stocked it. Why?',
    options: [
      { text: 'Compression lost some values.', why: 'Compression here is lossless; the values are all still there.' },
      { text: 'Rows are rebuilt by position, so sorting columns independently pairs up values from different rows.', correct: true, why: 'The k-th value of each column no longer belongs to the same row.' },
      { text: 'Bitmaps can’t be used on sorted data.', why: 'They work even better on sorted data, which has longer runs.' },
      { text: 'The query engine needs an index to read sorted columns.', why: 'The problem is the data itself, not how it’s read.' },
    ],
    explanation: 'Sort **whole rows** by a chosen sort key, never columns on their own. Position is the only thing tying a row’s values together.',
  },
  {
    id: 'p04.col.5',
    sectionId: 'columnar',
    skill: 'design',
    kind: 'justify',
    prompt: 'Most queries on a sales table ask about a range of dates; many of them then group by product. How should the rows be sorted?',
    options: [
      { text: 'By date, then by product.', correct: true, why: 'Date narrows most queries; product orders rows within each date.' },
      { text: 'By product, then by date.', why: 'A date-range query would then touch every product’s stretch of rows.' },
      { text: 'In arrival order, with no sort key.', why: 'Every query would scan the whole table, and columns would compress worse.' },
    ],
    reasons: [
      { text: 'The first sort key lets range queries read one contiguous stretch of rows, and it compresses into long runs; the second key orders rows that share a date.', correct: true, why: 'Pick sort keys from the most common queries.' },
      { text: 'The second sort key compresses better than the first.', why: 'It’s the reverse: the first key has the longest runs.' },
      { text: 'Sorting by product lets each column be sorted independently.', why: 'Columns must never be sorted independently.' },
    ],
    explanation: 'Sort order works like an index for column stores: put the column most queries filter by first.',
  },
  {
    id: 'p04.col.6',
    sectionId: 'columnar',
    skill: 'predict',
    kind: 'multi',
    prompt: 'A column store receives a steady trickle of single-row inserts during the day. Which statements are true?',
    options: [
      { text: 'Putting each new row straight into the sorted, compressed column files would mean rewriting each column from that point on.', correct: true, why: 'Like inserting a page into a bound book.' },
      { text: 'New rows first collect in a sorted, row-oriented store in memory, and are later merged into new column files in bulk.', correct: true, why: 'The LSM idea, reused.' },
      { text: 'Queries combine the column files on disk with the recent rows in memory, so new data is visible right away.', correct: true, why: 'Analysts don’t have to wait for the bulk merge.' },
      { text: 'Existing column files are edited in place to add each row.', why: 'They’re immutable; new files are written instead.' },
      { text: 'New rows are invisible to queries until the next bulk merge.', why: 'Queries also read the in-memory store.' },
    ],
    explanation: 'Column stores handle writes the LSM way: buffer in memory, write new immutable files in bulk, and read from both.',
  },

  // ── 8 · Query execution and precomputed results ──────────────────────
  {
    id: 'p04.exec.1',
    sectionId: 'query-execution',
    skill: 'diagnose',
    kind: 'choice',
    prompt:
      'A query filters 500 million rows with `price > 100 AND store = 7`. The engine is a plain interpreter that handles one row at a time. Where does most of the time go?',
    options: [
      { text: 'Working out, again for every row, which comparison to do on which column.', correct: true, why: 'The per-row overhead of consulting the query description dwarfs the comparison itself.' },
      { text: 'Reading the query text from disk 500 million times.', why: 'The plan is in memory; the cost is interpreting it per row, not reading it.' },
      { text: 'Sorting the rows before filtering them.', why: 'A filter doesn’t need the rows sorted.' },
      { text: 'Waiting for other users’ queries to finish.', why: 'Nothing in the question involves other queries.' },
    ],
    explanation: 'Query compilation removes that overhead by generating code for this query; vectorized execution spreads it over a whole batch of values per call.',
  },
  {
    id: 'p04.exec.2',
    sectionId: 'query-execution',
    skill: 'sequence',
    kind: 'order',
    prompt: 'Order the steps a vectorized engine takes to compute “total quantity of bananas sold in store 7”.',
    steps: [
      'Take the next batch of rows from the column files',
      'Compare the batch’s product values with bananas and its store values with 7, producing two bitmaps',
      'Combine the two bitmaps with AND',
      'Add up the quantity values at the positions where the result bitmap is 1',
      'Once every batch is done, return the running total',
    ],
    explanation: 'Each operator call handles a whole batch of column values, so the cost of interpreting the query is paid once per batch rather than once per row.',
  },
  {
    id: 'p04.exec.3',
    sectionId: 'query-execution',
    skill: 'predict',
    kind: 'multi',
    prompt: 'Which of these make a scan loop run faster on a modern CPU?',
    options: [
      { text: 'Reading a column’s values in order through memory.', correct: true, why: 'Keeps the next values ready in the CPU’s cache.' },
      { text: 'Calling a function for each row to decide which comparison to run.', why: 'Per-row overhead and function calls are what slow interpreters down.' },
      { text: 'Using SIMD instructions so one instruction compares several values.', correct: true, why: 'More work per instruction.' },
      { text: 'Running comparisons directly on compressed values.', correct: true, why: 'Saves unpacking, memory and copying.' },
      { text: 'Jumping between rows scattered all over memory.', why: 'Causes cache misses.' },
      { text: 'Lots of data-dependent if/else decisions inside the loop.', why: 'Each unpredictable branch risks a misprediction that throws work away.' },
    ],
    explanation: 'Both compiled and vectorized engines get their speed from the same things: sequential memory access, tight loops with few branches, parallelism, and working on compressed data.',
  },
  {
    id: 'p04.exec.4',
    sectionId: 'query-execution',
    skill: 'calculate',
    kind: 'numeric',
    prompt:
      'A data cube has three dimensions: date (365 values), product (1,000 values) and store (50 values), with no precomputed totals. How many cells must be added up to get one product’s total sales for the whole year across all stores?',
    answer: 18_250,
    unit: 'cells',
    explanation: 'Fix the product; sum over every date and every store: 365 × 50 = **18,250** cells. Precomputing totals along dimensions (the “total” rows and columns) would turn this into a single lookup.',
  },
  {
    id: 'p04.exec.5',
    sectionId: 'query-execution',
    skill: 'design',
    kind: 'justify',
    prompt:
      'A dashboard shows sales per store per day and is refreshed 500 times an hour. Occasionally analysts ask one-off questions, such as what share of sales came from items over $100. What do you build?',
    options: [
      { text: 'A data cube (date × store) for the dashboard, and keep the raw fact table for one-off questions.', correct: true, why: 'Fast for the common question, flexible for the rest.' },
      { text: 'A data cube, and delete the raw data to save space.', why: 'Price isn’t a dimension of the cube, so the one-off question becomes impossible.' },
      { text: 'Nothing precomputed; scan the raw rows on every refresh.', why: 'Correct, but recomputes the same totals 500 times an hour.' },
    ],
    reasons: [
      { text: 'A cube answers questions along its own dimensions with a lookup, but can’t answer anything else — so the raw data must stay.', correct: true, why: 'That’s the cube trade-off.' },
      { text: 'Once built, a cube can answer any question about the data.', why: 'Only questions along its dimensions.' },
      { text: 'Raw data is never needed again after it has been loaded.', why: 'New questions keep coming; only the raw data can answer them all.' },
    ],
    explanation: 'Precompute what is asked over and over; keep the raw data for everything else.',
  },
  {
    id: 'p04.exec.6',
    sectionId: 'query-execution',
    skill: 'diagnose',
    kind: 'choice',
    prompt:
      'A dashboard reads from a database view. Every refresh takes 40 seconds and puts heavy load on the warehouse, even though the underlying data only changes once a day. What is the likely cause and fix?',
    options: [
      { text: 'It’s a normal (virtual) view, so every read reruns the whole query; make it a materialized view that is updated when the daily data arrives.', correct: true, why: 'A materialized view stores the results, so reads become cheap.' },
      { text: 'It’s a materialized view that is out of date; switch to a virtual view.', why: 'A materialized view would make reads fast, not slow.' },
      { text: 'The warehouse lacks a B-tree index on every column.', why: 'The issue is repeating the same expensive computation, not finding rows.' },
      { text: 'Views always take 40 seconds; use a table instead.', why: 'A virtual view costs whatever its query costs, each time it is read.' },
    ],
    explanation: 'Virtual view = saved query, recomputed on every read. Materialized view = stored results, updated when the data changes. With daily changes and constant reads, materialize.',
  },

  // ── 9 · Multi-column, full-text and fuzzy indexes ────────────────────
  {
    id: 'p04.md.1',
    sectionId: 'multidim',
    skill: 'predict',
    kind: 'multi',
    prompt: 'A table has a concatenated index on (last_name, first_name, birth_year). Which `WHERE` clauses can use it to narrow the search efficiently?',
    options: [
      { text: "`last_name = 'Okafor'`", correct: true, why: 'The first field is a prefix.' },
      { text: "`last_name = 'Okafor' AND first_name = 'Ada'`", correct: true, why: 'The first two fields are a prefix.' },
      { text: "`first_name = 'Ada'`", why: 'Not a prefix: Adas are scattered across every last name.' },
      { text: '`birth_year = 1990`', why: 'Not a prefix either.' },
      { text: "`last_name = 'Okafor' AND first_name = 'Ada' AND birth_year = 1990`", correct: true, why: 'All three fields, in order.' },
      { text: "`first_name = 'Ada' AND birth_year = 1990`", why: 'Skips the first field, so the sort order can’t help.' },
    ],
    explanation: 'A concatenated index is sorted like a phone book: by the first field, then the second within it, and so on. Only a prefix of the fields can narrow the search.',
  },
  {
    id: 'p04.md.2',
    sectionId: 'multidim',
    skill: 'calculate',
    kind: 'numeric',
    prompt: 'A sorted index holds 64 million entries. At most how many halving steps does binary search need to find the starting point of a key?',
    answer: 26,
    tolerance: 1,
    unit: 'steps',
    explanation: 'Each step halves what’s left: 2²⁶ ≈ 67 million ≥ 64 million, so about **26** steps. Even a million entries need only about 20.',
  },
  {
    id: 'p04.md.3',
    sectionId: 'multidim',
    skill: 'design',
    kind: 'justify',
    prompt: 'A map app shows the restaurants inside the rectangle on screen, out of 50 million worldwide. Which index do you use?',
    options: [
      { text: 'A concatenated B-tree index on (latitude, longitude).', why: 'It narrows latitude only; you still read every restaurant in a strip around the globe.' },
      { text: 'Two separate indexes, one on latitude and one on longitude, and intersect their results.', why: 'Each index returns a whole strip around the globe; you read both strips to throw most of them away.' },
      { text: 'A two-dimensional spatial index, such as an R-tree.', correct: true, why: 'It narrows both directions at once.' },
    ],
    reasons: [
      { text: 'It groups nearby points into nested boxes, so a search only opens the boxes that overlap the view.', correct: true, why: 'Both ranges are narrowed together.' },
      { text: 'B-trees can’t store decimal numbers like coordinates.', why: 'They can; the problem is that one sort order can only narrow one range.' },
      { text: 'R-trees keep restaurants sorted by name.', why: 'They group by location, which is what this query needs.' },
    ],
    explanation: 'Queries with ranges on two attributes at once need a multidimensional index: an R-tree, a Bkd-tree, a grid, or a space-filling curve over a B-tree.',
  },
  {
    id: 'p04.md.4',
    sectionId: 'multidim',
    skill: 'predict',
    kind: 'choice',
    prompt: 'An inverted index holds these postings lists. Which documents does the search “red apples” (all terms required) return?',
    figure: `red     → 1, 4, 7, 9
apples  → 2, 4, 9, 12
green   → 3, 4, 12`,
    options: [
      { text: 'Documents 4 and 9', correct: true, why: 'The documents in both the red and the apples lists.' },
      { text: 'Document 4', why: 'That also requires green, which isn’t in the search.' },
      { text: 'Documents 1, 2, 4, 7, 9 and 12', why: 'That’s OR (either word), not AND.' },
      { text: 'Documents 4, 9 and 12', why: 'Document 12 contains apples but not red.' },
    ],
    explanation: 'A multi-word search intersects postings lists — a bitwise AND if they are stored as bitmaps.',
  },
  {
    id: 'p04.md.5',
    sectionId: 'multidim',
    skill: 'calculate',
    kind: 'numeric',
    prompt: 'What is the edit distance between “recieve” and “receive”, counting single-letter insertions, deletions and substitutions?',
    answer: 2,
    explanation:
      'The words differ only by swapped letters (“ie” vs “ei”), but a swap isn’t one of the allowed edits. It takes **2** substitutions (i → e, then e → i), or a deletion plus an insertion. A typo-tolerant search set to distance 1 would miss this one.',
  },
  {
    id: 'p04.md.6',
    sectionId: 'multidim',
    skill: 'explain',
    kind: 'explain',
    prompt: 'Why can’t a B-tree index on (latitude, longitude) efficiently answer “restaurants inside this map rectangle”, and how does an R-tree avoid the problem?',
    keyPoints: [
      'The B-tree is sorted by latitude first, so it can only narrow the latitude range',
      'Within that latitude band, matching longitudes are scattered, so it reads a whole strip around the globe and filters it',
      'An R-tree groups nearby points into nested bounding boxes covering both directions',
      'A search opens only the boxes that overlap the rectangle, narrowing latitude and longitude at the same time',
    ],
    explanation:
      'A concatenated B-tree sorts by latitude first, so a rectangle query can only use it to find the right **latitude band** — every restaurant in a strip wrapping around the globe — and must then throw away everything outside the longitude range. An **R-tree** groups nearby points into nested **bounding boxes** in both directions, so a search descends only into boxes that overlap the rectangle and narrows both ranges at once.',
  },

  // ── 10 · Vector embeddings and semantic search ───────────────────────
  {
    id: 'p04.vec.1',
    sectionId: 'vectors',
    skill: 'predict',
    kind: 'choice',
    prompt: 'Query vector q = [2, 0]. Which stored vector(s) are most similar by cosine similarity, and which is nearest by Euclidean distance?',
    figure: `A = [1, 0]
B = [10, 0]
C = [0.9, 0.9]`,
    options: [
      { text: 'Cosine: A and B tie. Euclidean: A.', correct: true, why: 'A and B point exactly the same way as q; A is also the closest point (distance 1).' },
      { text: 'Cosine: A only. Euclidean: A.', why: 'B points in exactly the same direction as q; cosine ignores length, so it ties with A.' },
      { text: 'Cosine: A and B tie. Euclidean: B.', why: 'B is 8 away from q; A is only 1 away.' },
      { text: 'Cosine: C. Euclidean: C.', why: 'C points 45° away from q (cosine ≈ 0.71), and it is about 1.42 away — further than A.' },
    ],
    explanation: 'Cosine similarity compares direction only; Euclidean distance compares position. The same data can rank differently depending on which you use.',
  },
  {
    id: 'p04.vec.2',
    sectionId: 'vectors',
    skill: 'calculate',
    kind: 'numeric',
    prompt:
      'An IVF index holds 1,000,000 vectors in 1,000 partitions of about equal size. A search compares the query with every centroid and then with every vector in the 10 nearest partitions (probes = 10). About how many comparisons is that in total?',
    answer: 11_000,
    tolerance: 100,
    unit: 'comparisons',
    explanation: '1,000 centroids + 10 partitions × 1,000 vectors = **11,000** comparisons, versus 1,000,000 for a flat search. More probes raise accuracy and cost in proportion.',
  },
  {
    id: 'p04.vec.3',
    sectionId: 'vectors',
    skill: 'design',
    kind: 'justify',
    prompt: 'A small catalogue of 5,000 products gets about 10 searches a minute, and you want exactly the closest matches every time. Which vector index do you use?',
    options: [
      { text: 'A flat index (compare with every vector).', correct: true, why: 'Exact, and cheap at this size.' },
      { text: 'HNSW.', why: 'Fast at scale but approximate — and speed isn’t a problem here.' },
      { text: 'IVF with 1 probe.', why: 'Approximate: a match just across a partition boundary can be missed.' },
    ],
    reasons: [
      { text: 'At this size, comparing against every vector is quick enough and is the only option guaranteed to find the true closest matches.', correct: true, why: 'Approximate indexes earn their keep on large collections.' },
      { text: 'HNSW and IVF can’t handle more than 1,000 vectors.', why: 'They’re designed for millions and more.' },
      { text: 'A flat index uses an R-tree internally, which is exact.', why: 'Flat means brute force; R-trees don’t work for high-dimensional vectors.' },
    ],
    explanation: 'Approximate indexes trade a little accuracy for a lot of speed. When the collection is small, that trade isn’t needed.',
  },
  {
    id: 'p04.vec.4',
    sectionId: 'vectors',
    skill: 'predict',
    kind: 'multi',
    prompt: 'Which statements about semantic search are true?',
    options: [
      { text: 'The query must be embedded with the same model that embedded the documents.', correct: true, why: 'Different models place meaning at different coordinates.' },
      { text: 'Each individual number in an embedding has a fixed meaning, such as “how sporty”.', why: 'Only distances between vectors carry meaning.' },
      { text: 'A multimodal model can place a photo of a beach and the words “sunny beach” close together.', correct: true, why: 'Several kinds of content share one space.' },
      { text: 'An R-tree is a good index for 1,000-dimensional embeddings.', why: 'With that many dimensions, bounding boxes stop ruling much out.' },
      { text: 'Both IVF and HNSW can occasionally miss the true closest vector.', correct: true, why: 'Both are approximate.' },
    ],
    explanation: 'Embeddings are coordinates for meaning: comparable only within one model’s space, searched with indexes built for many dimensions.',
  },
  {
    id: 'p04.vec.5',
    sectionId: 'vectors',
    skill: 'sequence',
    kind: 'order',
    prompt: 'Order the steps of a search in an HNSW index.',
    steps: [
      'Start at an entry node in the sparse top layer',
      'Hop to whichever linked node is closer to the query, until no neighbour is closer',
      'Drop down to the next, denser layer from the node you reached',
      'Keep hopping and dropping until you reach the bottom layer',
      'Return the closest nodes found in the bottom layer',
    ],
    explanation: 'Each layer gets you closer with finer steps — cities, then neighbourhoods, then houses.',
  },
  {
    id: 'p04.vec.6',
    sectionId: 'vectors',
    skill: 'explain',
    kind: 'explain',
    prompt: 'A user searches “end my contract”. Why does semantic search find the help page “Cancelling your subscription” when an inverted index does not?',
    keyPoints: [
      'An inverted index matches terms, and the query and the page share no words, so their postings lists don’t overlap',
      'An embedding model maps text to vectors so that similar meanings get nearby coordinates',
      'The query is embedded with the same model, landing close to the page’s vector',
      'A nearest-neighbour search over the vectors therefore returns the page',
    ],
    explanation:
      'An **inverted index** can only return documents that contain the query’s terms; “end my contract” and “Cancelling your subscription” share none. Semantic search runs both through the **same embedding model**, which places texts with similar meaning at nearby coordinates. A **nearest-neighbour** search around the query’s vector then finds the page, even with no words in common.',
  },
];
