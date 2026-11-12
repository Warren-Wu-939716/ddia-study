import type { Concept } from '../types.ts';

export const concepts: Concept[] = [
  // Logs, indexes and the core trade-off
  {
    id: 'append-only-log',
    name: 'Append-only log',
    sectionId: 'oltp-intro',
    summary: 'An append-only sequence of records on disk (not necessarily human-readable). Writes are trivially cheap; finding anything requires a scan.',
    prerequisites: [],
  },
  {
    id: 'index-tradeoff',
    name: 'Index read/write trade-off',
    sectionId: 'oltp-intro',
    summary: 'Indexes are derived structures that speed up reads but must be maintained on every write and consume space — so you choose them from your query patterns.',
    prerequisites: ['append-only-log'],
  },

  // Log-structured storage
  {
    id: 'hash-index',
    name: 'Hash index on a log',
    sectionId: 'log-structured',
    summary: 'An in-memory map from key to byte offset in the log. Fast lookups, but all keys must fit in RAM, restarts need a rebuild, and range scans are impossible.',
    prerequisites: ['index-tradeoff'],
  },
  {
    id: 'sstable',
    name: 'SSTable + sparse index',
    sectionId: 'log-structured',
    summary: 'A file of key-value pairs sorted by key, each key once. Sorting lets you index only the first key of each block and compress blocks.',
    prerequisites: ['hash-index'],
  },
  {
    id: 'memtable',
    name: 'Memtable, flush & WAL',
    sectionId: 'log-structured',
    summary: 'Writes go to a sorted in-memory structure (and a WAL for durability). When it grows past a threshold it is written out as a new immutable SSTable.',
    prerequisites: ['sstable'],
  },
  {
    id: 'compaction',
    name: 'Merging & compaction',
    sectionId: 'log-structured',
    summary: 'Background mergesort over segments that keeps only the newest value per key, reclaiming space from overwrites and deletes.',
    prerequisites: ['memtable'],
  },
  {
    id: 'tombstone',
    name: 'Tombstones',
    sectionId: 'log-structured',
    summary: 'Deletion markers written like any other value. They hide older values during reads and merges, and can only vanish once merged into the oldest data.',
    prerequisites: ['memtable'],
  },
  {
    id: 'bloom-filter',
    name: 'Bloom filters',
    sectionId: 'log-structured',
    summary: 'A per-segment bit array answering "definitely not here" or "maybe here". False positives cost a wasted read; false negatives never happen.',
    prerequisites: ['sstable'],
  },
  {
    id: 'compaction-strategies',
    name: 'Size-tiered vs leveled',
    sectionId: 'log-structured',
    summary: 'Size-tiered merges similar-size tables into bigger ones (great write throughput, more temp space). Leveled keeps fixed-size, key-range-partitioned levels (better reads, less space).',
    prerequisites: ['compaction'],
  },
  {
    id: 'embedded-db',
    name: 'Embedded engines',
    sectionId: 'log-structured',
    summary: 'Storage engines linked into your process as a library (RocksDB, SQLite, LMDB, DuckDB). Ideal for mobile, single-machine data, or one database per isolated tenant.',
    prerequisites: [],
  },

  // B-trees
  {
    id: 'btree-structure',
    name: 'B-tree pages',
    sectionId: 'btrees',
    summary: 'Fixed-size pages overwritten in place, arranged as a tree where each child covers a key range. Branching factor in the hundreds keeps depth at 3–4.',
    prerequisites: ['index-tradeoff'],
  },
  {
    id: 'btree-split',
    name: 'Page splits',
    sectionId: 'btrees',
    summary: 'Inserting into a full page splits it into two half-full pages and adds a boundary key to the parent; splits can cascade and add a new root.',
    prerequisites: ['btree-structure'],
  },
  {
    id: 'wal-btree',
    name: 'B-tree WAL & torn pages',
    sectionId: 'btrees',
    summary: 'Because a split overwrites several pages, a crash could corrupt the tree. Every change is first appended (and fsynced) to a write-ahead log and replayed on recovery.',
    prerequisites: ['btree-split'],
  },
  {
    id: 'cow-btree',
    name: 'Copy-on-write & variants',
    sectionId: 'btrees',
    summary: 'Copy-on-write writes modified pages elsewhere and creates new parent versions (LMDB). Other variants: abbreviated keys, sequential leaf layout, sibling pointers.',
    prerequisites: ['wal-btree'],
  },

  // Comparing
  {
    id: 'read-perf',
    name: 'Read & range performance',
    sectionId: 'comparing',
    summary: 'B-tree reads cost one page per level and are predictable. LSM reads may visit several segments; Bloom filters help point reads but not range scans.',
    prerequisites: ['bloom-filter', 'btree-structure'],
  },
  {
    id: 'seq-vs-random',
    name: 'Sequential vs random writes',
    sectionId: 'comparing',
    summary: 'LSM engines write big sequential files; B-trees scatter small page writes. Sequential wins on HDDs and still on SSDs, where random writes cause extra garbage collection.',
    prerequisites: ['memtable', 'btree-split'],
  },
  {
    id: 'write-amp',
    name: 'Write amplification',
    sectionId: 'comparing',
    summary: 'Bytes physically written divided by bytes the application wrote. LSM: WAL + flush + each compaction. B-tree: WAL + whole pages. Limits throughput and wears SSDs.',
    prerequisites: ['compaction', 'wal-btree'],
  },
  {
    id: 'disk-space',
    name: 'Space, deletion, snapshots',
    sectionId: 'comparing',
    summary: 'B-trees fragment and need vacuuming; LSM files compress well but stale values and deletes linger until compaction. Immutable files make snapshots cheap.',
    prerequisites: ['compaction-strategies', 'tombstone'],
  },

  // Secondary indexes & memory
  {
    id: 'secondary-index',
    name: 'Secondary indexes',
    sectionId: 'secondary-indexes',
    summary: 'Indexes on non-primary columns. Keys repeat, so each entry holds a list of row IDs or gets the row ID appended to make it unique.',
    prerequisites: ['btree-structure'],
  },
  {
    id: 'index-values',
    name: 'Clustered / heap / covering',
    sectionId: 'secondary-indexes',
    summary: 'An index can hold the row itself (clustered), a pointer to a heap file or primary key, or a few extra columns (covering) to answer queries without the row.',
    prerequisites: ['secondary-index'],
  },
  {
    id: 'in-memory-db',
    name: 'In-memory databases',
    sectionId: 'secondary-indexes',
    summary: 'Keep the dataset in RAM, using disk only as an append-only log/snapshot for durability. Fast mainly because they skip disk-oriented encoding, not disk reads.',
    prerequisites: ['append-only-log'],
  },

  // Analytics
  {
    id: 'cloud-dw',
    name: 'Cloud warehouse components',
    sectionId: 'analytics-storage',
    summary: 'Compute separated from object storage, and the stack split into query engine, storage format, table format and catalog.',
    prerequisites: [],
  },
  {
    id: 'column-storage',
    name: 'Column-oriented layout',
    sectionId: 'columnar',
    summary: 'Store each column’s values together (in row-blocks) so a query reads only the columns it needs; rows are reassembled by position.',
    prerequisites: ['cloud-dw'],
  },
  {
    id: 'bitmap-encoding',
    name: 'Bitmap & RLE compression',
    sectionId: 'columnar',
    summary: 'One bitmap per distinct value, run-length encoded when sparse. Predicates become fast bitwise OR/AND across bitmaps.',
    prerequisites: ['column-storage'],
  },
  {
    id: 'column-sort',
    name: 'Sort order in column stores',
    sectionId: 'columnar',
    summary: 'Sort entire rows by chosen keys (e.g. date first) to prune scans and create long runs; the first sort key compresses best.',
    prerequisites: ['column-storage', 'sstable'],
  },
  {
    id: 'column-writes',
    name: 'Writes to column stores',
    sectionId: 'columnar',
    summary: 'Inserting into sorted compressed columns is expensive, so writes buffer in an in-memory row store and are merged into new column files in bulk.',
    prerequisites: ['column-sort', 'memtable'],
  },
  {
    id: 'query-exec',
    name: 'Compilation vs vectorization',
    sectionId: 'query-execution',
    summary: 'Two ways to make scans CPU-efficient: compile per-query code (JIT-style), or run built-in operators over batches of column values.',
    prerequisites: ['bitmap-encoding'],
  },
  {
    id: 'materialized-views',
    name: 'Materialized views & cubes',
    sectionId: 'query-execution',
    summary: 'Precomputed query results stored on disk. Data cubes precompute aggregates along dimensions — fast but limited to those dimensions.',
    prerequisites: ['column-storage'],
  },

  // Multidimensional, full-text, vectors
  {
    id: 'concatenated-index',
    name: 'Concatenated indexes',
    sectionId: 'multidim',
    summary: 'One key built from several columns in a fixed order, like a phone book sorted by (last, first). Works for prefixes of the column list only.',
    prerequisites: ['secondary-index'],
  },
  {
    id: 'spatial-index',
    name: 'Multidimensional indexes',
    sectionId: 'multidim',
    summary: 'Indexes that narrow several ranges at once — R-trees, Bkd-trees, space-filling curves, grids — for maps, (date, temperature), colours.',
    prerequisites: ['concatenated-index'],
  },
  {
    id: 'inverted-index',
    name: 'Inverted index',
    sectionId: 'multidim',
    summary: 'Maps each term to a postings list of document IDs (often a sparse bitmap). Multi-term queries become set intersections.',
    prerequisites: ['bitmap-encoding', 'sstable'],
  },
  {
    id: 'fuzzy-search',
    name: 'n-grams & edit distance',
    sectionId: 'multidim',
    summary: 'Trigram indexes enable substring and regex search at the cost of size; Levenshtein automata find terms within an edit distance.',
    prerequisites: ['inverted-index'],
  },
  {
    id: 'vector-embeddings',
    name: 'Vector embeddings',
    sectionId: 'vectors',
    summary: 'Model-generated float vectors where semantic similarity becomes geometric closeness, measured by cosine similarity or Euclidean distance.',
    prerequisites: [],
  },
  {
    id: 'vector-index',
    name: 'Flat / IVF / HNSW',
    sectionId: 'vectors',
    summary: 'Flat = exact brute force. IVF = probe a few clusters. HNSW = descend layered proximity graphs. The latter two trade accuracy for speed.',
    prerequisites: ['vector-embeddings', 'spatial-index'],
  },
];
