import type { PretestQuestion, Scenario, TeachBackPrompt, TradeoffMatrix } from '../types.ts';

/** Answer before reading. Wrong guesses are expected — they prime you for the explanation. */
export const pretest: PretestQuestion[] = [
  {
    id: 'pre.overload',
    sectionId: 'messaging',
    prompt: 'A producer sends messages faster than its consumer can handle them. What are the options for the system in between?',
    answer: 'Drop messages, buffer them in a queue (in memory or on disk — and decide what happens when it fills), or slow the producer down with backpressure.',
  },
  {
    id: 'pre.lost-ack',
    sectionId: 'messaging',
    prompt: 'A broker delivers a message, the consumer processes it, but the “done” confirmation is lost on the network. What happens next, and why might it matter?',
    answer: 'The broker assumes the message wasn’t processed and delivers it again, so it gets processed twice. Harmless if processing is idempotent; wrong if it charges a card or increments a counter.',
  },
  {
    id: 'pre.new-consumer',
    sectionId: 'log-brokers',
    prompt: 'You add a new service that needs every order event from the last week. How could a messaging system make that possible?',
    answer: 'Keep messages in an append-only log on disk instead of deleting them on delivery, and let each consumer track its own position (offset). The new consumer starts from a week-old offset and reads forward.',
  },
  {
    id: 'pre.dual-write',
    sectionId: 'cdc',
    prompt: 'Your application saves each product change to the database and then to a search index. What could go wrong?',
    answer:
      'Two concurrent updates can reach the two systems in different orders, leaving them permanently different with no error. And one write can fail after the other succeeded. Better: make the index follow the database’s change log (CDC).',
  },
  {
    id: 'pre.cart',
    sectionId: 'immutability',
    prompt: 'An online shop stores only the current contents of each cart. What useful information does that throw away?',
    answer: 'Everything that happened along the way — e.g. items added and then removed. A log of events keeps it, and any number of views can be derived from that log.',
  },
  {
    id: 'pre.rate-spike',
    sectionId: 'time',
    prompt: 'A job counts requests per minute using the clock of the machine it runs on. It is redeployed and down for one minute. What will its chart show?',
    answer: 'A dip to zero, then a spike as the backlog is processed — even though real traffic was steady. Counting by the timestamp inside each event (event time) avoids this.',
  },
  {
    id: 'pre.enrich',
    sectionId: 'joins',
    prompt: 'Each click event carries a user ID, and you need the user’s country on every event at very high throughput. How would you add it?',
    answer:
      'Keep a local copy of the user table inside the stream processor, kept current by subscribing to the table’s change stream, and look each user up locally — instead of querying a remote database per event.',
  },
  {
    id: 'pre.exactly-once',
    sectionId: 'fault-tolerance',
    prompt: 'A consumer adds each payment to a balance, then records how far it has read. It crashes between those two steps. What happens on restart, and how could you avoid harm?',
    answer:
      'It re-reads the payment and adds it again. Fix it by making the write idempotent (store the message offset with the balance and skip repeats) or by committing the write and the offset atomically.',
  },
];

export const teachBack: TeachBackPrompt[] = [
  {
    id: 'tb.queue-vs-log',
    prompt: 'Explain to a teammate the difference between a traditional message queue (AMQP/JMS-style) and a log-based broker like Kafka, and when you would pick each.',
    sectionIds: ['messaging', 'log-brokers'],
    keyPoints: [
      'Queue: broker assigns individual messages and deletes them once acknowledged',
      'Queue: easy per-message parallelism; order not preserved under redelivery; no replay',
      'Log: messages appended and retained; reading doesn’t delete',
      'Log: partitions assigned to consumers; order within a partition; parallelism ≤ partitions',
      'Log: consumers commit offsets; can replay by moving offsets; slow consumers only hurt themselves',
      'Pick a queue for independent, expensive tasks; a log for high-throughput, ordered streams and derived data',
    ],
  },
  {
    id: 'tb.cdc',
    prompt: 'Explain why keeping a database, cache and search index in sync with dual writes is dangerous, and how change data capture (plus an outbox) fixes it.',
    sectionIds: ['cdc'],
    keyPoints: [
      'Dual writes can interleave differently in each system → permanent, silent inconsistency',
      'One write can fail while the other succeeds (atomic-commit problem)',
      'CDC: only the database is written; its change log is the single order',
      'Derived systems consume the log in order, like replication followers (with lag)',
      'Start from a snapshot tied to a log position, or a log-compacted topic',
      'Outbox table keeps the internal schema private and is written in the same transaction',
    ],
  },
  {
    id: 'tb.time',
    prompt: 'Explain event time versus processing time, what to do with late events, and the four kinds of window.',
    sectionIds: ['time'],
    keyPoints: [
      'Processing time = processor’s clock; event time = timestamp in the event',
      'Processing time breaks under lag (restarts, backlogs, reprocessing); event time is deterministic',
      'Never certain a window is complete: drop stragglers (and count) or publish corrections',
      'Untrusted device clocks: log occurred, sent and received timestamps to estimate offset',
      'Tumbling, hopping, sliding, session windows',
    ],
  },
  {
    id: 'tb.exactly-once',
    prompt: 'Explain how a stream processor can produce results as if each event were processed exactly once, even when tasks crash.',
    sectionIds: ['fault-tolerance', 'log-brokers'],
    keyPoints: [
      'Crashes cause replays from the last committed offset/checkpoint → duplicates',
      'Exactly-once = effectively-once: the visible effect is as if once',
      'Microbatching/checkpointing handle state inside the framework, not external side effects',
      'Atomic commit of outputs + state + offsets (kept inside the framework)',
      'Idempotent writes: store the offset with the data; requires same order, determinism, fencing',
      'Rebuild operator state from snapshots, changelog topics or input replay',
    ],
  },
];

export const scenarios: Scenario[] = [
  {
    id: 'sc.order-sync',
    title: 'Mirroring orders from a system of record',
    brief:
      'A legacy reservation system is the source of truth and publishes a change event to a Kafka-compatible topic whenever a booking changes. Your service keeps its own copy of each order up to date and sends an HTTP notification to a partner for each relevant change. You run three pods.',
    requirements: ['Never lose a change', 'Never let an older state overwrite a newer one', 'The partner gets each change at least once and can de-duplicate'],
    questions: [
      'What should the message key be, and why?',
      'When should a consumer commit its offset?',
      'How do you make duplicates and redeliveries harmless?',
      'What do you do with a message that can never be processed?',
      'How would you rebuild your copy if it were corrupted?',
    ],
    keyPoints: [
      'Key by the order/booking id: all its events share a partition and stay in order',
      'At most 3 useful consumers per group with 3 partitions; plan partitions for growth',
      'Commit only after the side effects are done → at-least-once',
      'Idempotent writes: store the source sequence/offset with the order; ignore older or repeated sequences',
      'Stable notification ids so the partner can de-duplicate retries',
      'Poison messages → dead letter topic with alerting; don’t block the partition',
      'Never move offsets to “latest” on restart or rebalance — that skips events',
      'Alert on consumer lag well before retention deletes unread events',
      'Rebuild by replaying a retained or log-compacted topic, or reconcile against the source of truth',
    ],
    sectionIds: ['log-brokers', 'cdc', 'fault-tolerance'],
  },
  {
    id: 'sc.search-sync',
    title: 'Product search that stays in sync',
    brief:
      'A product catalog lives in PostgreSQL. Search runs on Elasticsearch, and a cache serves product pages. Today the application updates all three on every change, and support keeps finding products whose search results show stale prices.',
    requirements: ['Search and cache converge to the database', 'Adding a new derived system later is easy', 'Database schema changes don’t break consumers'],
    questions: ['Why do the copies drift today?', 'What would you change?', 'How does a brand-new consumer get started?', 'How do you protect consumers from schema changes?'],
    keyPoints: [
      'Dual writes race and partially fail → silent drift',
      'Use CDC from the database’s replication log (e.g. Debezium/Kafka Connect)',
      'Derived systems apply changes in the database’s commit order',
      'Expect lag: the index is eventually consistent; consider read-your-writes for editors',
      'New consumers start from a snapshot at a known log position or from a log-compacted topic',
      'Outbox table with its own schema, written in the same transaction, acts as a data contract',
    ],
    sectionIds: ['cdc', 'immutability'],
  },
  {
    id: 'sc.metrics',
    title: 'Live request-rate dashboard',
    brief:
      'Web servers and a mobile app send request events. Operations want requests per minute and p99 latency on a dashboard, with alerts when the rate is unusual. The mobile app buffers events while offline.',
    requirements: ['Correct per-minute counts even after the processor restarts', 'Reasonable handling of very late mobile events', 'Smooth charts'],
    questions: ['Which timestamp do you window by?', 'Which window types fit the counts and the smoothing?', 'What do you do with events that arrive hours late?', 'How do you timestamp mobile events?'],
    keyPoints: [
      'Window by event time, not processing time (avoid restart spikes)',
      'Tumbling 1-minute windows for counts; hopping windows for smoothing',
      'Stragglers: drop with a metric, or publish corrections — decide per use',
      'Mobile: record occurred-at and sent-at (device) and received-at (server); correct for clock offset',
      'Approximate percentile/cardinality algorithms save memory; exact is also possible',
    ],
    sectionIds: ['stream-uses', 'time'],
  },
  {
    id: 'sc.clickthrough',
    title: 'Search click-through analytics',
    brief:
      'You log a search event for every query and a click event for every result clicked, both with a session id. Product wants click-through rate per query, broken down by the user’s country from the profile database.',
    requirements: ['Count searches with no click too', 'Add country without hammering the profile database', 'Reprocessing history gives the same answer'],
    questions: ['Which joins do you need?', 'How long should the processor wait for a click?', 'How do you get the country for each event?', 'How do you make reprocessing deterministic?'],
    keyPoints: [
      'Stream–stream join of searches and clicks by session id within a window (e.g. 1 hour)',
      'Emit “not clicked” when a search expires — clicks alone can’t give the rate',
      'Clicks may arrive before searches; buffer both sides',
      'Stream–table join with a local, CDC-fed copy of profiles for country',
      'Join with the profile version current at the event’s time (versioned records) or copy country into the event',
      'Versioning prevents log compaction of the profile table',
    ],
    sectionIds: ['joins', 'time'],
  },
];

export const tradeoffs: TradeoffMatrix[] = [
  {
    id: 'tm.queue-log',
    title: 'Traditional queue vs log-based broker',
    columns: [
      { id: 'queue', label: 'Queue (AMQP/JMS)' },
      { id: 'log', label: 'Log (Kafka-style)' },
    ],
    rows: [
      { id: 'expensive-tasks', dimension: 'Parallelizing expensive, independent tasks message by message', answer: 'queue', why: 'Any free consumer can take the next message; a log assigns whole partitions.' },
      { id: 'ordering', dimension: 'Strict ordering of related messages', answer: 'log', why: 'Order is kept within a partition; queues reorder messages on redelivery.' },
      { id: 'replay', dimension: 'Re-reading old messages', answer: 'log', why: 'Messages are retained; move the offset back. Queues delete acknowledged messages.' },
      { id: 'new-consumer', dimension: 'A new consumer that needs past messages', answer: 'log', why: 'It can start from an old offset. A new queue subscriber only sees new messages.' },
      { id: 'throughput', dimension: 'Very high throughput of cheap messages', answer: 'log', why: 'Sequential disk I/O, batching, and offsets instead of per-message acknowledgments.' },
      { id: 'hol', dimension: 'A slow message shouldn’t hold up the next ones', answer: 'queue', why: 'In a log partition, one slow message blocks everything behind it (head-of-line blocking).' },
      { id: 'isolation', dimension: 'Experimental consumers can’t hurt production', answer: 'log', why: 'Consumers only read; a stopped consumer leaves nothing behind but its offset.' },
    ],
  },
  {
    id: 'tm.sync',
    title: 'Keeping derived data in sync',
    columns: [
      { id: 'dual', label: 'Dual writes' },
      { id: 'cdc', label: 'Change data capture' },
      { id: 'es', label: 'Event sourcing' },
    ],
    rows: [
      { id: 'adopt', dimension: 'Easiest to add to an existing application', answer: 'cdc', why: 'The application may not even know CDC is happening; event sourcing is a redesign.' },
      { id: 'infra', dimension: 'Needs no extra infrastructure', answer: 'dual', why: 'Just more writes in the application — which is exactly why it’s fragile.' },
      { id: 'intent', dimension: 'Records what the user meant, not just what changed', answer: 'es', why: 'Events are designed at the application level (e.g. “seat changed by agent”).' },
      { id: 'compaction', dimension: 'Log can be compacted to the latest value per key', answer: 'cdc', why: 'Each CDC event holds the whole new row; event-sourced events build on each other.' },
      { id: 'history-views', dimension: 'New views that need the full history', answer: 'es', why: 'All events are kept forever; CDC logs are usually truncated or compacted.' },
      {
        id: 'schema',
        dimension: 'Internal schema changes stay private',
        answer: 'depends',
        why: 'Raw CDC exposes the table schema unless you add an outbox; event schemas are a deliberate contract.',
      },
    ],
  },
];
