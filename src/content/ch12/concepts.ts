import type { Concept } from '../types.ts';

export const concepts: Concept[] = [
  // Events, producers and topics
  {
    id: 'event',
    name: 'Event',
    sectionId: 'streams-intro',
    summary: 'A small, self-contained, immutable record of something that happened at a point in time — the streaming equivalent of a record in a batch file.',
    prerequisites: [],
  },
  {
    id: 'pub-sub',
    name: 'Producers, consumers & topics',
    sectionId: 'streams-intro',
    summary: 'A producer writes each event once; any number of consumers process it. Related events are grouped into a topic.',
    prerequisites: ['event'],
  },
  {
    id: 'push-vs-poll',
    name: 'Notification instead of polling',
    sectionId: 'streams-intro',
    summary: 'Polling a datastore for new events gets more wasteful the lower the latency you want, so streaming systems notify consumers instead.',
    prerequisites: ['pub-sub'],
  },

  // Messaging systems
  {
    id: 'overload-choices',
    name: 'Drop, buffer or backpressure',
    sectionId: 'messaging',
    summary: 'When producers outpace consumers a system can drop messages, queue them (in memory or on disk), or block the producer (backpressure/flow control).',
    prerequisites: ['pub-sub'],
  },
  {
    id: 'direct-messaging',
    name: 'Direct messaging',
    sectionId: 'messaging',
    summary: 'UDP multicast, brokerless libraries and webhooks send straight from producer to consumer. Fast, but messages are lost if a consumer is offline or the producer crashes.',
    prerequisites: ['pub-sub'],
  },
  {
    id: 'message-broker',
    name: 'Message broker',
    sectionId: 'messaging',
    summary: 'A server optimized for message streams that producers write to and consumers read from. Centralizes durability; makes consumers asynchronous. Traditional brokers delete messages once acknowledged.',
    prerequisites: ['overload-choices'],
  },
  {
    id: 'load-balance-fanout',
    name: 'Load balancing vs fan-out',
    sectionId: 'messaging',
    summary: 'Load balancing gives each message to one consumer so they share work; fan-out gives every subscriber its own copy. Consumer groups combine both.',
    prerequisites: ['message-broker'],
  },
  {
    id: 'ack-redelivery',
    name: 'Acknowledgments & redelivery',
    sectionId: 'messaging',
    summary: 'Consumers acknowledge finished messages; unacknowledged ones are redelivered. That can cause duplicates (lost acks) and, with load balancing, reordering.',
    prerequisites: ['load-balance-fanout'],
  },
  {
    id: 'dead-letter-queue',
    name: 'Dead letter queue',
    sectionId: 'messaging',
    summary: 'Messages that keep failing (poison messages) are moved to a separate, monitored queue so they stop blocking or wasting consumers.',
    prerequisites: ['ack-redelivery'],
  },

  // Log-based brokers
  {
    id: 'log-broker',
    name: 'Log-based message broker',
    sectionId: 'log-brokers',
    summary: 'Messages are appended to a durable log and consumers read it sequentially. Reading is non-destructive, combining database-style storage with low-latency notification.',
    prerequisites: ['message-broker'],
  },
  {
    id: 'partitions-offsets',
    name: 'Partitions, offsets & partition keys',
    sectionId: 'log-brokers',
    summary: 'A topic is split into partitions; each message gets an increasing offset within its partition. Order holds only within a partition, so related messages share a partition key.',
    prerequisites: ['log-broker'],
  },
  {
    id: 'consumer-offsets',
    name: 'Consumer groups & committed offsets',
    sectionId: 'log-brokers',
    summary: 'A group assigns whole partitions to consumers and periodically commits offsets. After a crash, work resumes from the last commit, so some messages are processed twice.',
    prerequisites: ['partitions-offsets', 'load-balance-fanout'],
  },
  {
    id: 'log-retention',
    name: 'Retention & consumer lag',
    sectionId: 'log-brokers',
    summary: 'Old log segments are deleted, making the log a large but bounded buffer. A consumer that lags beyond retention misses messages — monitor lag.',
    prerequisites: ['partitions-offsets'],
  },
  {
    id: 'replay',
    name: 'Replaying messages',
    sectionId: 'log-brokers',
    summary: 'Because consumers only move their own offset, you can reset it to reprocess old messages — like rerunning a batch job on the same input.',
    prerequisites: ['consumer-offsets'],
  },

  // CDC
  {
    id: 'dual-writes',
    name: 'Dual writes',
    sectionId: 'cdc',
    summary: 'The application writes the same change to several systems itself. Concurrent writers can leave them permanently inconsistent, and one write can fail while another succeeds.',
    prerequisites: [],
  },
  {
    id: 'cdc',
    name: 'Change data capture',
    sectionId: 'cdc',
    summary: 'Capture every change written to a database as a stream, so derived systems apply the changes in the database’s own order. The database leads; the rest follow, with some lag.',
    prerequisites: ['dual-writes', 'log-broker'],
  },
  {
    id: 'cdc-snapshot',
    name: 'Initial snapshot',
    sectionId: 'cdc',
    summary: 'A new derived system needs a consistent snapshot that corresponds to a known log position, then applies changes from that position onward.',
    prerequisites: ['cdc'],
  },
  {
    id: 'log-compaction',
    name: 'Log compaction',
    sectionId: 'cdc',
    summary: 'Keep only the newest record per key (a tombstone removes the key). Size depends on the data, not the history, and reading from offset 0 rebuilds the full state.',
    prerequisites: ['cdc'],
  },
  {
    id: 'outbox',
    name: 'Outbox pattern & data contracts',
    sectionId: 'cdc',
    summary: 'CDC exposes the database schema to consumers. An outbox table with its own schema, written in the same transaction as the real change, decouples internal and external schemas.',
    prerequisites: ['cdc'],
  },
  {
    id: 'cdc-vs-event-sourcing',
    name: 'CDC vs event sourcing',
    sectionId: 'cdc',
    summary: 'CDC extracts low-level changes from a mutable database (easy to add). Event sourcing records application-level intent as the source of truth (needs full history; no key compaction).',
    prerequisites: ['cdc'],
  },

  // Immutability
  {
    id: 'state-as-changelog',
    name: 'State vs changelog',
    sectionId: 'immutability',
    summary: 'Current state is all events applied so far; the changelog is how it got there. Keep the log durably and every state becomes reproducible.',
    prerequisites: ['cdc-vs-event-sourcing'],
  },
  {
    id: 'immutable-events',
    name: 'Benefits of immutable events',
    sectionId: 'immutability',
    summary: 'An append-only log supports audits, easier recovery from buggy writes, and keeps information (like removed cart items) that current state throws away. Mistakes get compensating events.',
    prerequisites: ['state-as-changelog'],
  },
  {
    id: 'derived-views',
    name: 'Several views from one log',
    sectionId: 'immutability',
    summary: 'Derive many read-optimized views from the same events (CQRS). New views can be built alongside old ones, avoiding risky migrations; denormalize freely.',
    prerequisites: ['immutable-events'],
  },
  {
    id: 'log-concurrency',
    name: 'Concurrency with an event log',
    sectionId: 'immutability',
    summary: 'Async views can’t read your own writes immediately. But a self-contained event is one atomic append, and a single-threaded consumer per shard needs no concurrency control.',
    prerequisites: ['derived-views'],
  },
  {
    id: 'immutability-limits',
    name: 'Limits of immutability',
    sectionId: 'immutability',
    summary: 'High-churn data makes history huge, and laws may require real deletion. Excision rewrites history; crypto-shredding deletes the key instead of the data.',
    prerequisites: ['immutable-events'],
  },

  // Uses of stream processing
  {
    id: 'cep',
    name: 'Complex event processing',
    sectionId: 'stream-uses',
    summary: 'Long-lived queries describe event patterns; the engine matches each incoming event against them and emits a “complex event” on a match — queries stored, data flowing past.',
    prerequisites: ['event'],
  },
  {
    id: 'stream-analytics',
    name: 'Stream analytics',
    sectionId: 'stream-uses',
    summary: 'Aggregates and statistics over time windows: rates, rolling averages, comparisons with earlier periods. Probabilistic algorithms save memory but aren’t required.',
    prerequisites: ['cep'],
  },
  {
    id: 'materialized-views-streams',
    name: 'Maintaining materialized views',
    sectionId: 'stream-uses',
    summary: 'Keep caches, indexes and views up to date from a change stream. Needs all events back to the beginning of time; IVM recomputes only what changed.',
    prerequisites: ['derived-views'],
  },
  {
    id: 'search-on-streams',
    name: 'Search on streams',
    sectionId: 'stream-uses',
    summary: 'Store search queries and test every new document against them (e.g. alerts for new listings) — indexing the queries helps when there are many.',
    prerequisites: ['cep'],
  },
  {
    id: 'actors-vs-streams',
    name: 'Actors/RPC vs stream processing',
    sectionId: 'stream-uses',
    summary: 'Actor messaging manages concurrency and is ephemeral and one-to-one; stream processing is durable, multi-subscriber data management in acyclic pipelines.',
    prerequisites: ['pub-sub'],
  },

  // Time
  {
    id: 'event-vs-processing-time',
    name: 'Event time vs processing time',
    sectionId: 'time',
    summary: 'Processing time (the processor’s clock) is simple but distorts results whenever processing lags. Event time (the timestamp in the event) is deterministic and correct.',
    prerequisites: ['stream-analytics'],
  },
  {
    id: 'stragglers',
    name: 'Straggler events',
    sectionId: 'time',
    summary: 'You can never be sure a window is complete. Late events are either ignored (and counted) or folded in by publishing a corrected result.',
    prerequisites: ['event-vs-processing-time'],
  },
  {
    id: 'device-clocks',
    name: 'Whose clock?',
    sectionId: 'time',
    summary: 'Device clocks can’t be trusted. Logging occurred-at and sent-at (device) plus received-at (server) lets you estimate and correct the device’s offset.',
    prerequisites: ['event-vs-processing-time'],
  },
  {
    id: 'window-types',
    name: 'Window types',
    sectionId: 'time',
    summary: 'Tumbling (fixed, no overlap), hopping (fixed, overlapping), sliding (events within an interval of each other) and session (ends after inactivity).',
    prerequisites: ['stream-analytics'],
  },

  // Joins
  {
    id: 'stream-stream-join',
    name: 'Stream–stream join',
    sectionId: 'joins',
    summary: 'Match related events from two streams within a time window, keeping state for both sides; emit a “no match” result when the window expires.',
    prerequisites: ['window-types'],
  },
  {
    id: 'stream-table-join',
    name: 'Stream–table join',
    sectionId: 'joins',
    summary: 'Enrich each event from a local copy of a table, kept current by subscribing to the table’s changelog — avoiding a remote query per event.',
    prerequisites: ['cdc'],
  },
  {
    id: 'table-table-join',
    name: 'Table–table join',
    sectionId: 'joins',
    summary: 'Both inputs are changelogs. Each change on one side joins with the current state of the other, producing the change stream of a materialized join.',
    prerequisites: ['stream-table-join', 'materialized-views-streams'],
  },
  {
    id: 'join-time-dependence',
    name: 'Time dependence of joins',
    sectionId: 'joins',
    summary: 'Order across streams isn’t guaranteed, so which version of a record you join with can vary. Version ids (slowly changing dimensions) make joins deterministic.',
    prerequisites: ['stream-table-join'],
  },

  // Fault tolerance
  {
    id: 'exactly-once',
    name: 'Exactly-once (effectively-once)',
    sectionId: 'fault-tolerance',
    summary: 'Records may be processed more than once internally, but the visible result is as if each were processed once.',
    prerequisites: ['ack-redelivery'],
  },
  {
    id: 'microbatch-checkpoint',
    name: 'Microbatching & checkpointing',
    sectionId: 'fault-tolerance',
    summary: 'Process the stream in tiny batches, or periodically checkpoint state at barriers, so a failed task restarts from a known point — exactly-once only within the framework.',
    prerequisites: ['exactly-once'],
  },
  {
    id: 'atomic-commit-streams',
    name: 'Atomic commit in stream processors',
    sectionId: 'fault-tolerance',
    summary: 'Outputs, state changes and the input offset commit together or not at all. Kept internal to the framework (e.g. Kafka transactions) to stay efficient.',
    prerequisites: ['exactly-once'],
  },
  {
    id: 'idempotence',
    name: 'Idempotent writes',
    sectionId: 'fault-tolerance',
    summary: 'Make repeats harmless — e.g. store the input offset with the value it produced. Assumes same replay order, deterministic processing and no concurrent writers (fencing).',
    prerequisites: ['exactly-once', 'consumer-offsets'],
  },
  {
    id: 'state-recovery',
    name: 'Rebuilding state after failure',
    sectionId: 'fault-tolerance',
    summary: 'Recover operator state from a replicated remote store, from local state replicated to a changelog topic or snapshots, or by replaying recent input.',
    prerequisites: ['microbatch-checkpoint'],
  },
];
