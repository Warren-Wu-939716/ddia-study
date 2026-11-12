import type { Lesson } from '../types.ts';
import { art } from './lessons-oltp.ts';

/**
 * Lessons for the analytics and specialised-index half of the chapter. Original explanations and examples.
 * Terms already explained in lessons 1–5 are used as-is; new ones get a plain-English analogy where they first appear.
 */
export const analyticsLessons: Lesson[] = [
  // ── 6 ─────────────────────────────────────────────────────────────────
  {
    sectionId: 'analytics-storage',
    intro:
      'So far we’ve looked at databases that serve an app’s everyday reads and writes. **Analytics** is different: questions like “total sales per region last quarter” read huge numbers of rows to produce a few summary numbers. That changes how data should be stored. First, the big picture of how analytics systems are built today.',
    blocks: [
      {
        kind: 'text',
        title: 'Two kinds of workload',
        body: 'Lessons 1–5 were about OLTP: the shop checkout, serving one customer at a time. Analytics is **OLAP** (online analytical processing): the accountant who, at the end of the year, goes through every receipt to produce a handful of totals. Those totals are **aggregates** — summary numbers such as sums, averages and counts.\n\nAnalytics data usually arrives in big batches. **ETL** jobs (extract → transform → load) copy data out of the everyday databases, clean it up and reshape it, then load it into the analytics system — like a removals company that packs up several houses, sorts everything and unpacks it into one warehouse.',
      },
      {
        kind: 'table',
        title: 'Side by side',
        head: ['', 'Transaction processing (OLTP)', 'Analytics (OLAP)'],
        rows: [
          ['Typical query', 'Read or update a few records by key', 'Read millions of rows and summarise a few columns'],
          ['Writes', 'Many small writes, each needing a quick reply', 'Big batches, loaded now and then (for example by ETL)'],
          ['What limits speed', 'How long each of many small requests waits', 'How many bytes are read from disk, and CPU time per row'],
        ],
      },
      {
        kind: 'text',
        title: 'Same SQL, different engine',
        body: 'Analytics usually runs in a **data warehouse**: a separate database holding a read-only copy of the company’s data, organised for analysis — like a records office kept apart from the shop floor so the accountants don’t get in the cashiers’ way. Warehouses are usually relational, because SQL suits analytical questions well, and many graphical tools generate SQL when analysts **drill down** (zoom from a total into its details) or **slice and dice** (cut the data one way, then another, like cutting a cake).\n\nOn the surface a warehouse and an OLTP database look alike — both speak SQL — but inside they’re very different, because they’re asked very different questions. Most vendors now specialise in one or the other.\n\n**HTAP** (hybrid transactional/analytical processing) products such as SQL Server, SAP HANA and SingleStore try to do both — but increasingly as **two separate engines** behind one SQL front door, like a shop and an accounts office that share a reception desk.',
      },
      {
        kind: 'text',
        title: 'Cloud data warehouses',
        body: 'Long-established vendors (Teradata, Vertica, SAP HANA) sell warehouses you can run yourself, **on-premises** (in your own data centre), as well as cloud versions. Cloud-only warehouses such as BigQuery, Redshift and Snowflake are now very popular.\n\nTheir key trick is to **separate compute from storage**. The data lives in object storage rather than on the disks of the machines running queries, so you can add storage, or add query-processing power, **independently** — like a restaurant that can hire extra cooks for a busy night without building a bigger pantry. Growing and shrinking on demand like this is called being **elastic**. Cloud warehouses also plug easily into other cloud services, such as tools that automatically collect and process logs.',
      },
      {
        kind: 'text',
        title: 'The warehouse, taken apart',
        body: 'Companies started pouring analytical data into **data lakes**: big pools of raw files of every kind, kept in object storage — like a storage unit you fill up before deciding what to do with everything. Open-source warehouses then broke apart. Pieces that used to live inside one system (such as Hive) are now separate, swappable components:',
      },
      {
        kind: 'table',
        title: 'Four separate components',
        head: ['Component', 'Its job', 'Examples'],
        rows: [
          [
            'Query engine',
            'Reads your SQL, works out an efficient **execution plan** (a step-by-step recipe for answering it) and runs it — usually split into tasks running in parallel on many machines',
            'Trino, Presto, Apache DataFusion (some hand the work to Spark or Flink)',
          ],
          ['Storage format', 'How a table’s rows are laid out as bytes inside a file', 'Parquet, ORC, Lance, Nimble'],
          [
            'Table format',
            'Which (immutable) files make up a table, and its **schema** — the list of columns and their types, like a spreadsheet’s header row. This is what makes inserts and deletes possible, plus **time travel** (querying an old version, like a document’s version history) and even **transactions** (groups of changes that happen all together or not at all)',
            'Apache Iceberg, Delta',
          ],
          ['Data catalog', 'Which tables exist; creating, renaming and deleting them. Usually a separate service that other programs talk to over the web (through a **REST API**, a standard way for programs to send each other requests)', 'Polaris, Unity Catalog, Iceberg’s catalog'],
        ],
      },
      {
        kind: 'analogy',
        body: 'Think of a library. The **storage format** is how each book is printed. The **table format** is the list saying which volumes make up the current edition of a series (and which made up older editions). The **catalog** lists every series the library owns. The **query engine** is the librarian who fetches the right volumes and answers your question.',
      },
      {
        kind: 'text',
        body: 'Keeping the catalog separate from the query engine also lets other tools — for finding data, or for controlling who may see what — read the same information.',
      },
      {
        kind: 'check',
        question: 'Parquet files can’t be changed after they’re written. Which layer lets you delete a row, or query the table as it was last Tuesday?',
        answer: 'The table format (for example Iceberg or Delta): it keeps track of which files make up each version of the table.',
      },
    ],
    takeaways: [
      'OLTP serves many small requests; OLAP (analytics) reads huge numbers of rows to compute a few aggregates.',
      'Warehouses and OLTP databases both speak SQL but work very differently inside; HTAP increasingly means two engines behind one front door.',
      'Cloud warehouses separate compute from object storage, so each can grow independently (elastic).',
      'The open-source stack splits into query engine, storage format, table format and data catalog.',
    ],
  },

  // ── 7 ─────────────────────────────────────────────────────────────────
  {
    sectionId: 'columnar',
    intro:
      'The single biggest trick behind modern analytics databases: store data **column by column** instead of row by row. Compression and sorting then multiply the benefit.',
    blocks: [
      {
        kind: 'text',
        title: 'The problem',
        body: 'Analytics data usually has one enormous **fact table** with one row per event — for example, one row per item sold, like a giant pile of till receipts. Each row refers to smaller **dimension tables** (products, stores, dates) through **foreign keys**: codes that point to a row in another table, like the product code printed on a receipt that you can look up in the product catalogue.\n\nA fact table can have trillions of rows and well over 100 columns, yet a typical query uses only **4 or 5** of them — `SELECT *` (“give me every column”) is rare in analytics. “Total revenue per store last month”, for instance, needs only the date, store and price columns.',
      },
      {
        kind: 'text',
        title: 'Storing by row reads far too much',
        body: 'OLTP databases store all of a row’s values side by side (document databases do the same with whole documents). Even if an index says which rows match, a row store still has to **load every matching row in full** — all 100+ columns — then pick out the few values it needs. It’s like wanting only the total from each receipt but having to read every line of every receipt.',
      },
      {
        kind: 'analogy',
        body: 'Picture a survey of 1,000 people with 100 questions each. Filing it **by row** means one stapled form per person: to average the answers to question 7, you flip through all 1,000 forms. Filing it **by column** means one stack of answers per question: for question 7, you just pick up that one stack.',
      },
      {
        kind: 'diagram',
        title: 'Row-oriented vs column-oriented',
        art: art(`
row-oriented: one whole row after another
[03-01, p31, s3, qty 2, 4.99, … 95 more ] [03-01, p68, s4, qty 1, …] …

column-oriented: each column stored separately
date:      03-01   03-01   03-01   03-02   …
product:   p31     p68     p69     p31     …
store:     s3      s4      s3      s3      …
quantity:  2       1       5       1       …

a query on date + store + quantity reads only those three columns`),
      },
      {
        kind: 'widget',
        widget: 'row-column',
        title: 'What a query has to read',
        body: 'Tick the columns a query needs and switch layouts, then step through the read. Each line is one continuous stretch of the disk; highlighted values have to be read.',
      },
      {
        kind: 'text',
        title: 'Putting rows back together',
        body: 'Every column stores the rows in the **same order**. To rebuild row 23, take the 23rd value from each column — like matching survey answers by their position in each stack.\n\nIn practice a column isn’t one giant file. The table is cut into **blocks** of thousands to millions of rows, and inside each block every column is stored separately. Blocks often cover a **time range**, so a query about last month only loads the blocks that overlap last month.\n\nAlmost every analytics system works this way: warehouses such as Snowflake, DuckDB, Pinot and Druid; file formats such as Parquet, ORC, Lance and Nimble; in-memory formats such as Apache Arrow and pandas/NumPy; and **time-series** databases (built for timestamped measurements, like sensor readings) such as InfluxDB IOx and TimescaleDB. It even works for nested documents: Parquet splits them into columns using a technique called **shredding** (or striping) — pulling each field out into its own column, like cutting a stack of forms into strips, one strip per question.',
      },
      {
        kind: 'pitfall',
        body: '**Column-oriented ≠ wide-column.** Bigtable, HBase and Accumulo use a “wide-column” data model, where each row can have thousands of different columns — but they keep all of a row’s values together, so they are actually **row-oriented**. The names are confusingly similar.',
      },
      {
        kind: 'text',
        title: 'Compression: columns repeat themselves',
        body: 'A column usually has far fewer **distinct** (different) values than rows: a retailer might record billions of sales but stock only 100,000 products. Lots of repetition means it compresses well.\n\nOne effective technique is **bitmap encoding**. For each distinct value, keep a **bitmap**: a row of bits, one per table row, set to 1 where that row has the value — like a register with one line per product and a tick for every sale of it.',
      },
      {
        kind: 'diagram',
        title: 'Bitmap encoding of a product column (8 rows)',
        art: art(`
product:      31  68  69  31  31  68  30  31

bitmap p=30:   0   0   0   0   0   0   1   0
bitmap p=31:   1   0   0   1   1   0   0   1
bitmap p=68:   0   1   0   0   0   1   0   0
bitmap p=69:   0   0   1   0   0   0   0   0`),
      },
      {
        kind: 'text',
        title: 'Run-length encoding',
        body: 'With many distinct values, most bitmaps are mostly zeros (sparse). Instead of storing every bit, store the **lengths of the runs** — how many 0s, then how many 1s, then how many 0s, and so on. This is **run-length encoding**, like describing a bead necklace as “5 white, 2 red, 9 white” instead of naming every bead. For `p=68` above (0 1 0 0 0 1 0 0) that’s “1 zero, 1 one, 3 zeros, 1 one” → `1, 1, 3, 1` (zeros at the end are assumed).\n\n**Roaring bitmaps** switch automatically between plain bits and runs, whichever is smaller.',
      },
      {
        kind: 'text',
        title: 'Filters become operations on bits',
        body: 'Bitmaps turn query filters into very cheap work:\n- `WHERE product IN (31, 68, 69)` → take those three bitmaps and combine them with **OR**: a row passes if **any** of them has a 1 in its position.\n- `WHERE product = 31 AND store = 3` → take two bitmaps and combine them with **AND**: a row passes only if **both** have a 1. Picture two see-through sheets with dots on them, laid on top of each other: keep only the spots where dots overlap. This works across **different columns** only because every column keeps rows in the same order, so bit k always means row k.\n\nProcessors do these **bitwise** operations (working on many bits at once) extremely fast. Bitmaps can even answer some graph questions, such as “users followed by X who also follow Y”.',
      },
      {
        kind: 'check',
        question: 'Which operation evaluates `WHERE product = 31 AND store = 3`, and why is it valid even though the two bitmaps come from different columns?',
        answer: 'Bitwise AND. It works because both columns list the rows in the same order, so the k-th bit means the same row in every bitmap.',
      },
      {
        kind: 'text',
        title: 'Sort order',
        body: 'Rows can be stored in the order they arrive (adding one is then just an append to each column) — or **sorted**, which works like an index. You must sort **whole rows**, never each column on its own; otherwise the k-th values would no longer belong to the same row — like shuffling one survey stack but not the others.\n\nPick the **sort key** from your most common queries. If most queries ask about a range of dates, make **date the first sort key**, so a query reads only the relevant stretch of rows. A **second sort key** (say, product) orders rows that share a date — just as a phone book sorts by last name, then by first name within each last name.',
      },
      {
        kind: 'text',
        title: 'Sorting also helps compression',
        body: 'After sorting, the **first sort key** has long runs of identical values, so run-length encoding can squeeze it down to a few kilobytes, even for billions of rows. The second key is only sorted within each group of the first, so its runs are shorter; columns further down look essentially random and compress less. Overall it’s still a clear win.',
      },
      {
        kind: 'widget',
        widget: 'bitmap',
        title: 'Bitmaps, filters and sort order',
        body: 'Choose products (IN → OR) and a store (AND) and step through how the filter is built from bitmaps. Then sort the rows by product and watch each bitmap collapse into a single run.',
      },
      {
        kind: 'try',
        labId: 'columnar',
        body: 'Pick two sort keys and compare the number of runs in every column; estimate how many bytes a scan reads on huge tables.',
      },
      {
        kind: 'text',
        title: 'Writing to column storage',
        body: 'Warehouse writes are mostly **bulk imports** — big ETL batches. Inserting a single row into the middle of sorted, compressed columns would mean rewriting each column from that point on, like inserting a page into the middle of a bound book. Doing it for many rows at once spreads that cost out.\n\nSo column stores borrow the LSM idea. New writes first go into a **row-oriented, sorted, in-memory store**. When enough have built up, they’re merged with the column files on disk and written out as **new files** in bulk. Old files are never changed, which suits object storage. Queries read both the column files on disk and the recent writes in memory and combine them, so analysts see new data straight away. Snowflake, Vertica, Pinot and Druid all work this way.',
      },
      {
        kind: 'check',
        question: 'Which earlier design does the column store’s write path reuse?',
        answer: 'The LSM-tree: collect writes in a sorted in-memory structure, then write new immutable files and merge them in the background.',
      },
    ],
    takeaways: [
      'Store each column separately so a query reads only the columns it needs; rows are rebuilt by position.',
      'Tables are cut into blocks of rows (often by time range), with each column stored separately inside a block.',
      'Bitmaps + run-length encoding compress columns; IN becomes OR, and conditions on different columns become AND.',
      'Sort whole rows; the first sort key narrows scans and compresses best.',
      'Writes are collected in memory and merged into new immutable column files in bulk — the LSM idea again.',
      'Wide-column databases are row-oriented despite the name.',
    ],
  },

  // ── 8 ─────────────────────────────────────────────────────────────────
  {
    sectionId: 'query-execution',
    intro:
      'With data stored in columns, the next bottleneck is the CPU itself: scanning millions of values has to be extremely efficient. After that, a different strategy altogether — working out answers ahead of time.',
    blocks: [
      {
        kind: 'text',
        title: 'Query plans and operators',
        body: 'A database turns an analytical SQL query into a **query plan** (the execution plan from lesson 6): a recipe made of steps called **operators** — scan, filter, **join** (combine matching rows from two tables), aggregate — like the stations on an assembly line. These can run in parallel across many machines. The **query planner** decides which operators to use, in what order and where.\n\nThe simplest way to run an operator is as an **interpreter**: for every single row, consult a description of the query to work out which comparison or calculation to do on which column. That’s like a cook rereading the whole recipe before cracking each egg. For millions of rows, that overhead per row is far too slow.',
      },
      {
        kind: 'table',
        title: 'Two fast alternatives',
        head: ['', 'Query compilation', 'Vectorized processing'],
        rows: [
          [
            'Idea',
            'Write custom code for **this one query**, translate it into the CPU’s own instructions (**machine code** — often using a compiler toolkit called **LLVM**) and run that — like building a custom jig for one carpentry job. It’s the same trick a **JIT** (just-in-time) compiler uses: translate code at the moment it’s needed',
            'Stay an interpreter, but have each built-in operator handle a whole **batch** of column values per call — like washing a sink full of dishes in one go, instead of filling the sink once per plate',
          ],
          ['Inner loop', 'One tight loop over the rows, doing exactly this query’s comparisons and copying matches to an output area', 'Calls like `equals(column, value) → bitmap`, then `AND(bitmap, bitmap) → bitmap`'],
        ],
      },
      {
        kind: 'diagram',
        title: 'Vectorized filter: “bananas sold in store 7”',
        art: art(`
product column ─▶ [ equals bananas ] ─▶ 0 1 0 0 1 1 0
store column   ─▶ [ equals store 7 ] ─▶ 1 1 0 1 1 0 0
                                              AND
result                                ─▶ 0 1 0 0 1 0 0`),
      },
      {
        kind: 'text',
        title: 'Why both are fast',
        body: 'The two approaches are built very differently, and both are used in practice. They get their speed from the same features of modern CPUs:\n- **Reading memory in order** instead of jumping around. The CPU has its own tiny, very fast cache; reading in order keeps the next values ready there, while jumping around causes **cache misses** — like having to walk to the pantry instead of reaching for what’s already on the counter.\n- **Tight inner loops** with few instructions and no function calls. A CPU works like an assembly line that starts the next instruction before the current one has finished, guessing which way each decision (a **branch**) will go. A wrong guess — a **branch misprediction** — means throwing away work and starting again. Simple loops keep the line moving.\n- **Parallelism:** several **threads** (independent workers inside one program), plus **SIMD** instructions (“single instruction, multiple data”) that apply one operation to several values at once — like a stamp that marks eight envelopes in one press.\n- **Working directly on compressed data**, without unpacking it first — which saves memory and copying.',
      },
      {
        kind: 'pitfall',
        body: '“Vectorized” here just means processing a **batch** of values at a time. It has nothing to do with the “vectors” used for AI-style search by meaning in lesson 10.',
      },
      {
        kind: 'text',
        title: 'Materialized views',
        body: 'A **view** is a saved query that you can read from as if it were a table. A normal (**virtual**) view is just a shortcut: each time you read it, the database runs the underlying query again — like a saved search on a shopping site. A **materialized view** actually stores a **copy of the results** on disk — like a printed report.\n\nWhen the underlying data changes, a materialized view has to be updated too. Some databases do this automatically, and systems like Materialize specialise in it. That’s extra work on every write, but it makes repeated queries much faster.',
      },
      {
        kind: 'text',
        title: 'Data cubes',
        body: 'Warehouse queries often use **aggregate functions** such as `COUNT`, `SUM`, `AVG`, `MIN` and `MAX`. If many queries need the same totals, why recompute them from the raw data every time?\n\nA **data cube** (or OLAP cube) is a materialized grid of totals grouped by **dimensions** — the things you slice by, such as date and product. It’s like a spreadsheet **pivot table** worked out in advance: each cell holds the total for one combination (one date × one product), and adding up a row or a column removes one dimension.',
      },
      {
        kind: 'diagram',
        title: 'A two-dimensional cube: sum of sales (in $k)',
        art: art(`
                 p31     p68     p69   │  total
date 03-01      12.5     4.0     0.0   │   16.5
date 03-02       3.0     9.5     2.0   │   14.5
───────────────────────────────────────┼────────
total           15.5    13.5     2.0   │   31.0`),
        caption: 'Real data often has more dimensions (date, product, store, promotion, customer…), which makes a hypercube — a cube with more than three directions. Same idea.',
      },
      {
        kind: 'text',
        title: 'The cube trade-off',
        body: '**Pro:** some queries become instant because the answer is already worked out — total sales per store yesterday is a single lookup.\n\n**Con:** a cube can only answer questions along its own dimensions. “What share of sales came from items over $100?” is impossible if price isn’t a dimension. So most warehouses keep as much **raw data** as possible and use cubes only to speed up common queries.',
      },
      {
        kind: 'widget',
        widget: 'data-cube',
        title: 'Ask the cube',
        body: 'Pick a question and step through how it’s answered. Questions along the cube’s dimensions read one precomputed cell; anything else falls back to scanning the raw rows one by one.',
      },
      {
        kind: 'check',
        question: 'Your cube has the dimensions date × store × product. Can it tell you the average basket size per customer?',
        answer: 'No — customer isn’t a dimension, and which items went into the same basket isn’t recorded. You need the raw fact data.',
      },
    ],
    takeaways: [
      'Interpreting the query for every row is too slow for big scans.',
      'Query compilation writes machine code for each query; vectorized processing runs built-in operators on batches of values.',
      'Both rely on reading memory in order, tight loops, threads/SIMD and working on compressed data.',
      'A materialized view stores a query’s results and must be kept up to date on writes.',
      'Data cubes precompute totals: very fast, but only for their own dimensions — so keep the raw data too.',
    ],
  },

  // ── 9 ─────────────────────────────────────────────────────────────────
  {
    sectionId: 'multidim',
    intro:
      'B-trees and LSM-trees answer range queries on **one** attribute. Many real queries restrict several attributes at once, or look for words inside text. Those need different kinds of index.',
    blocks: [
      {
        kind: 'text',
        title: 'Concatenated indexes',
        body: 'The most common multi-column index is a **concatenated index**: it glues several fields together into one key, in a fixed order. A paper phone book is exactly this — sorted by (last name, first name). It can quickly find everyone with a given last name, or with a given last and first name. But it’s useless for “everyone called Ana”, because those entries are scattered throughout the book.\n\nIn general, a concatenated index only helps when you search by a **prefix** of its fields: the first field, the first two, and so on.',
      },
      {
        kind: 'text',
        title: 'Binary search',
        body: 'How do you find a name in a sorted list quickly? With **binary search**: open the list in the middle, check whether your name comes before or after that point, throw away the half it can’t be in, and repeat. It’s the “guess my number between 1 and 100” game, where every guess halves what’s left. Even a million sorted entries take only about 20 steps.',
      },
      {
        kind: 'check',
        question: 'An index on (country, city, street). Which lookups can use it efficiently?',
        answer: 'Country; country + city; country + city + street. Not city on its own, or street on its own.',
      },
      {
        kind: 'widget',
        widget: 'phone-book',
        title: 'A phone-book index',
        body: 'Look people up by last name, by last + first name, or by first name only. Step through binary search halving the candidates, then the matches being read one after another — or a full scan when the sort order can’t help.',
      },
      {
        kind: 'text',
        title: 'When you need two ranges at once',
        body: 'A restaurant map shows the places inside the rectangle on your screen: **latitude** (north–south position) between A and B, **and** **longitude** (east–west position) between C and D. A concatenated index on (latitude, longitude) can narrow down the latitude — but that gives you every restaurant in a strip that wraps right around the globe. It can’t narrow both directions at once.',
      },
      {
        kind: 'text',
        title: 'Multidimensional indexes',
        body: '- **Space-filling curve:** draw one long, winding path that visits every spot on the map while staying close to itself — like a snake coiling through every square of a grid. Each point’s position along the path becomes a single number, nearby points mostly get nearby numbers, and an ordinary B-tree can index that number.\n- **Spatial indexes** such as **R-trees** and **Bkd-trees** split up space so that nearby points end up in the same part of the tree. An R-tree groups points into nested rectangles called **bounding boxes** — like a map divided into countries, then regions, then towns — and a search only opens the boxes that overlap your view. (The PostGIS extension builds R-trees on PostgreSQL’s **GiST** framework, a toolkit for building custom kinds of index.)\n- **Regular grids** of triangles, squares or hexagons, like the squares on a printed map with grid references.\n\nThey aren’t only for maps. A shop could index colours by (red, green, blue). A weather database could index (date, temperature) to find all 2024 readings between 25 °C and 30 °C: with a one-dimensional index you’d read all of 2024 and then filter by temperature, while a 2-D index narrows both at once.',
      },
      {
        kind: 'widget',
        widget: 'map-range',
        title: 'Restaurants in the map view',
        body: 'Compare an index on latitude, an index on longitude and a 2-D index (R-tree) for the same view: first see what the index reads, then what’s actually inside the box. Click the map to move the view.',
      },
      {
        kind: 'text',
        title: 'Full-text search',
        body: '**Full-text search** finds documents that contain given words anywhere in their text. First, the text is split into words, or **terms** — this is **tokenizing**, like cutting a sentence into separate word tiles. Real search engines also handle different languages, typos, word forms (“apple” vs “apples”) and synonyms — a big topic of its own.\n\nAt heart, though, full-text search is a multidimensional query where **every possible word is a dimension**: a document has a 1 in the “apples” dimension if it contains that word. Searching for “red apples” means looking for documents with a 1 in **both** the red and the apples dimensions.',
      },
      {
        kind: 'text',
        title: 'The inverted index',
        body: 'An **inverted index** is exactly the index at the back of a book: for each term, it lists every document that contains it. That list is the term’s **postings list** — like the page numbers printed next to each word in a book’s index.\n\nIf documents are numbered 1, 2, 3…, a postings list can be stored as a sparse bitmap (bit n is 1 if document n contains the term) — just like the column bitmaps in lesson 7. A multi-word search is then a bitwise **AND**, which stays fast even on run-length-encoded bitmaps.',
      },
      {
        kind: 'widget',
        widget: 'inverted-index',
        title: 'Search an inverted index',
        body: 'Type words and search, then step through: tokenizing, fetching each term’s postings list (also shown as a bitmap), and combining them. **AND** keeps documents containing every term; **OR** keeps documents containing any.',
      },
      {
        kind: 'text',
        title: 'The same storage ideas, again',
        body: '**Lucene** — the search library inside Elasticsearch and Solr — stores its term → postings lists in SSTable-like sorted files that are merged in the background: the log-structured approach from lesson 2. PostgreSQL’s **GIN** index also uses postings lists, both for full-text search and for indexing inside **JSON** documents (JSON is a popular text format for nested records, like a form with sections and sub-sections).',
      },
      {
        kind: 'text',
        title: 'Substrings and typos',
        body: '- **n-grams:** instead of whole words, index every chunk of n letters. The **trigrams** (n = 3) of “hello” are `hel`, `ell`, `llo` — like sliding a three-letter window along the word. A trigram index can find any piece of text three or more letters long, and even **regular expressions** (search patterns with wildcards, such as “colou?r” to match both spellings), but the index is **large**.\n- **Typos:** the **edit distance** between two words is the number of single-letter insertions, deletions or substitutions needed to turn one into the other — how many keystrokes it takes to fix the typo. Lucene stores its list of terms as a **finite-state automaton**: a kind of flowchart that reads a word one letter at a time, similar to a trie. It turns this into a **Levenshtein automaton**, which efficiently finds every term within a given edit distance — without comparing your word against each term one by one.',
      },
      {
        kind: 'check',
        question: 'What are the trigrams of “data”, and what is the edit distance between “pasword” and “password”?',
        answer: '`dat` and `ata`. The edit distance is 1 — one missing “s” to insert.',
      },
      {
        kind: 'widget',
        widget: 'fuzzy',
        title: 'Trigrams and typos',
        body: 'Compare two words’ trigrams and edit distance, then widen the distance to see which dictionary terms a typo-tolerant search would return.',
      },
    ],
    takeaways: [
      'A concatenated index (phone-book order) only helps when you search by a prefix of its fields; binary search finds the start quickly.',
      'Queries on two ranges at once need space-filling curves, R-trees/Bkd-trees or grids.',
      'Full-text search tokenizes text into terms; an inverted index maps each term to its postings list.',
      'Postings lists can be bitmaps, so multi-word queries become bitwise AND (or OR).',
      'Lucene stores postings in SSTable-like files; trigrams allow substring search; Levenshtein automata handle typos.',
    ],
  },

  // ── 10 ────────────────────────────────────────────────────────────────
  {
    sectionId: 'vectors',
    intro:
      'Keyword search fails when people use different words for the same idea. **Semantic search** matches **meaning** instead — like asking a librarian who understands what you’re after, not just the words you used. It’s a key part of AI applications such as **retrieval-augmented generation (RAG)**, where an AI assistant first looks up relevant documents and then answers using them — like an open-book exam.',
    blocks: [
      {
        kind: 'text',
        title: 'The problem',
        body: 'A help page called “Cancelling your subscription” should be found by someone who searches “how do I close my account” or “end my contract”. They share no words, so typo tolerance and synonym lists don’t help.',
      },
      {
        kind: 'text',
        title: 'Vector embeddings',
        body: 'An **embedding model** turns a document into a **vector**: a list of decimal (**floating-point**) numbers that works like map coordinates for meaning. Just as two cafés on the same street have similar GPS coordinates, two documents about similar things get similar vectors. The result is called an **embedding**.\n\nThe model is usually a **neural network** — a program that learned patterns from huge amounts of example data — often a **large language model (LLM)** like the ones behind AI chatbots. Real embeddings have hundreds to thousands of numbers (**dimensions**), and the individual numbers don’t mean anything on their own; only the distances between vectors matter.\n\nEarly embedding models such as Word2Vec, BERT and GPT worked on text. Now there are models for images, audio and video, and **multimodal** models that place several kinds of content in one shared space — so a photo of a beach and the words “sunny beach” land close together.',
      },
      {
        kind: 'diagram',
        title: 'Toy 3-D embeddings',
        art: art(`
"gardening tips"     [ 0.71, 0.62, 0.10 ]  ┐ close together:
"growing tomatoes"   [ 0.68, 0.55, 0.22 ]  ┘ similar meaning
"database indexing"  [ 0.05, 0.12, 0.93 ]    far away`),
        caption: 'Real models use 1,000+ dimensions, but the idea is the same.',
      },
      {
        kind: 'text',
        title: 'Measuring closeness',
        body: '- **Cosine similarity:** do the two vectors point in the same **direction**? Picture each vector as an arrow from the centre: cosine similarity measures the angle between the arrows, ignoring how long they are.\n- **Euclidean distance:** the straight-line distance between the two points — “as the crow flies”.',
      },
      {
        kind: 'steps',
        title: 'A semantic search, step by step',
        steps: [
          'Ahead of time, run every document through the embedding model and store the vectors in a **vector index** — an index built to find nearby vectors quickly.',
          'When someone searches, run their query (plus context such as their location) through the **same** embedding model.',
          'Ask the vector index for the stored vectors **closest** to the query vector, and return their documents.',
        ],
      },
      {
        kind: 'text',
        title: 'Why not just use an R-tree?',
        body: 'R-trees work well for a handful of dimensions, but break down with hundreds or thousands: with that many directions, the bounding boxes stop ruling much out. Vector search needs its own kinds of index:',
      },
      {
        kind: 'table',
        title: 'Vector index types',
        head: ['Index', 'How it searches', 'Result', 'Speed'],
        rows: [
          ['Flat', 'Compare the query with **every** stored vector — like reading every name in the guest book', 'Exact', 'Slow (brute force)'],
          [
            'IVF (inverted file)',
            'Group the vectors in advance into **partitions** (clusters of nearby vectors), each with a **centroid** — its centre point, like dividing a city into neighbourhoods, each with a town square. A search compares the query with the centroids, then looks only inside the few nearest partitions; how many it looks in is the **probes** setting',
            'Approximate — a close match may sit just over the border, in a partition that wasn’t searched',
            'Fast; more probes = more accurate but slower',
          ],
          [
            'HNSW',
            'Several layers of **proximity graphs** — networks where each vector is linked to its near neighbours, like friends of friends. Start in the sparse top layer, hop to the closest node, drop to the busier layer below and keep hopping closer, down to the bottom layer',
            'Approximate',
            'Fast',
          ],
        ],
      },
      {
        kind: 'analogy',
        body: 'HNSW is like finding a house by first flying between cities (top layer), then driving between neighbourhoods (middle layer), then walking between houses (bottom layer). Each layer gets you closer, with finer steps.',
      },
      {
        kind: 'text',
        body: 'Many vector databases implement IVF and HNSW; Facebook’s Faiss library offers several variants of each, and PostgreSQL’s pgvector extension supports both.',
      },
      {
        kind: 'pitfall',
        body: 'Two different “vectors”: in **vectorized** query execution (lesson 8), a vector is a batch of values processed together. In semantic search, a vector is a list of numbers giving a point’s position in meaning-space.',
      },
      {
        kind: 'check',
        question: 'Your IVF index sometimes misses an obviously relevant document. Which setting do you change, and what does it cost?',
        answer: 'Increase the number of probes (partitions searched). Results become more accurate, but each search compares more vectors and gets slower.',
      },
      {
        kind: 'widget',
        widget: 'vector-search',
        title: 'Search a toy embedding space',
        body: 'Each dot is a document placed by meaning (colours show topics; ✕ marks each partition’s centroid). Step through a flat search and an IVF search. With 1 probe, “high-protein meals for runners” misses its best match because it sits in a neighbouring partition — raise the probes. Switch to cosine to compare by angle instead of distance.',
      },
      {
        kind: 'text',
        title: 'Chapter wrap-up',
        body: '- **OLTP engines** serve many small reads and writes by key, using sorted indexes that also handle ranges. There are two schools: **log-structured** (append, then merge; high write throughput — SSTables and LSM-trees in RocksDB, Cassandra, HBase, ScyllaDB and Lucene) and **update-in-place** (B-trees — in every major relational database; usually better for reads).\n- **Analytics engines** scan huge numbers of rows: column storage and compression keep the bytes read low, and compiled or vectorized execution keeps the CPU time low.\n- **Specialised indexes** handle several conditions at once: R-trees for maps, inverted indexes for text, vector indexes for meaning.\n\nKnowing what’s under the hood helps you choose a storage engine and predict what a tuning setting will do.',
      },
    ],
    takeaways: [
      'Embedding models turn content into vectors — coordinates for meaning; similar meaning → nearby points.',
      'Closeness: cosine similarity (same direction) or Euclidean distance (as the crow flies).',
      'Flat = exact but slow; IVF = search only the nearest few partitions; HNSW = hop down layered neighbour graphs. IVF and HNSW are approximate.',
      'R-trees don’t work for hundreds or thousands of dimensions.',
      '“Vector” in vectorized execution means something else entirely.',
    ],
  },
];
