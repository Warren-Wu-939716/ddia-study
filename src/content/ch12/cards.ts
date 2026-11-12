import type { CardDraft } from '../types.ts';

/**
 * Original questions and answers in study-note form. Kinds:
 * recall (facts), explain (mechanisms), compare (trade-offs),
 * failure (what breaks and why), scenario (apply it), choice (discriminate).
 */
export const cards: CardDraft[] = [
  // ── Events, producers and topics ──────────────────────────────────────
  {
    id: 'ch12.001',
    sectionId: 'streams-intro',
    conceptIds: ['event'],
    kind: 'explain',
    prompt: 'What is the key difference between the input of a batch job and a stream, and why does it matter?',
    answer:
      'Batch input is bounded — a known, finite set — so the job knows when it has read everything (and can, for example, sort it all first). A stream is unbounded: data keeps arriving forever, so it must be processed incrementally and you can never wait for “all” of it.',
    keyPoints: ['Batch input is bounded; streams are unbounded', 'Batch can wait for all input (e.g. to sort)', 'Streams are processed incrementally as data arrives'],
  },
  {
    id: 'ch12.002',
    sectionId: 'streams-intro',
    conceptIds: ['event'],
    kind: 'recall',
    prompt: 'What is an event in stream processing?',
    answer: 'A small, self-contained, immutable record describing something that happened at a point in time — usually with a timestamp — such as a page view, a purchase, or a sensor reading.',
    keyPoints: ['Small and self-contained', 'Immutable', 'Describes something that happened, usually timestamped'],
  },
  {
    id: 'ch12.003',
    sectionId: 'streams-intro',
    conceptIds: ['pub-sub', 'push-vs-poll'],
    kind: 'choice',
    prompt: 'Why is polling a database table for new events a poor fit for low-latency streaming?',
    options: [
      { text: 'Databases cannot store events', why: 'They can — that part works fine.' },
      { text: 'The more often you poll to cut latency, the more polls find nothing, so overhead grows', correct: true },
      { text: 'Polling loses events', why: 'Polling is slow and wasteful, not lossy.' },
      { text: 'Only one consumer can poll a table', why: 'Many can, but each adds more wasted queries.' },
    ],
    explanation: 'Low latency needs frequent polling, and frequent polling means most requests return nothing. Notifying consumers when something new arrives avoids that.',
  },
  {
    id: 'ch12.004',
    sectionId: 'streams-intro',
    conceptIds: ['pub-sub'],
    kind: 'recall',
    prompt: 'In streaming terms, what are producers, consumers and topics?',
    answer: 'A producer (publisher) creates each event once; consumers (subscribers) process it — possibly many of them; a topic (stream) groups related events, much as a file name groups related records.',
    keyPoints: ['Producer writes an event once', 'Any number of consumers may process it', 'Topic groups related events'],
  },

  // ── Messaging systems ────────────────────────────────────────────────
  {
    id: 'ch12.005',
    sectionId: 'messaging',
    conceptIds: ['overload-choices'],
    kind: 'recall',
    prompt: 'What can a messaging system do when producers send faster than consumers can process?',
    answer: 'Drop messages; buffer them in a queue (in memory or spilling to disk — and decide what happens when that fills); or apply backpressure (flow control), blocking the producer until the consumer catches up.',
    keyPoints: ['Drop', 'Buffer in a queue (memory/disk limits)', 'Backpressure / flow control blocks the producer'],
  },
  {
    id: 'ch12.006',
    sectionId: 'messaging',
    conceptIds: ['overload-choices'],
    kind: 'scenario',
    prompt: 'A fleet of sensors sends a temperature reading every 10 seconds; a payments service sends one event per card charge. Which can tolerate dropped messages, and what is the hidden danger?',
    answer:
      'Occasional dropped sensor readings are usually fine — a fresh reading follows soon. Charges must never be dropped: every lost message makes totals wrong. The hidden danger is that large-scale silent loss can make metrics wrong without anyone noticing.',
    keyPoints: ['Periodic readings tolerate occasional loss', 'Counted/financial events must be delivered reliably', 'Silent mass loss can go unnoticed'],
  },
  {
    id: 'ch12.007',
    sectionId: 'messaging',
    conceptIds: ['direct-messaging'],
    kind: 'failure',
    prompt: 'What is the main weakness of direct messaging (UDP multicast, brokerless libraries, webhooks)?',
    answer:
      'It assumes producers and consumers are both online. A consumer that is down misses messages sent meanwhile, and if the producer crashes it loses its buffer of messages still waiting to be retried.',
    keyPoints: ['Assumes both sides constantly online', 'Offline consumers miss messages', 'A producer crash loses pending retries'],
  },
  {
    id: 'ch12.008',
    sectionId: 'messaging',
    conceptIds: ['message-broker'],
    kind: 'compare',
    prompt: 'How does a traditional (AMQP/JMS-style) message broker differ from a database?',
    answer:
      'A broker usually deletes messages once they’re delivered and acknowledged, assumes short queues (long backlogs hurt throughput), offers topic subscriptions rather than queries and indexes, and pushes notifications when new data arrives — whereas a database keeps data until deleted, supports rich queries, and gives point-in-time results without telling you when they change.',
    keyPoints: [
      'Broker deletes after acknowledgment; database keeps data',
      'Brokers assume small working sets',
      'Topic subscription vs queries/indexes',
      'Broker notifies on new data; a database query is a snapshot',
    ],
  },
  {
    id: 'ch12.009',
    sectionId: 'messaging',
    conceptIds: ['message-broker'],
    kind: 'explain',
    prompt: 'Why are consumers of a message broker said to be asynchronous?',
    answer:
      'The producer only waits for the broker to confirm it has stored the message, not for any consumer to process it. Delivery happens later — usually within a fraction of a second, but possibly much later if a queue has built up.',
    keyPoints: ['Producer waits only for the broker’s confirmation', 'Processing happens at an undetermined later time', 'Backlogs can delay it significantly'],
  },
  {
    id: 'ch12.010',
    sectionId: 'messaging',
    conceptIds: ['load-balance-fanout'],
    kind: 'choice',
    prompt: 'You want an email service and a search indexer to each receive every new-order message. Which pattern is that?',
    options: [
      { text: 'Load balancing', why: 'That would give each message to only one of them.' },
      { text: 'Fan-out', correct: true },
      { text: 'Backpressure', why: 'Backpressure is about slowing producers, not who receives what.' },
      { text: 'A dead letter queue', why: 'That holds messages that failed processing.' },
    ],
    explanation: 'Fan-out delivers each message to every subscriber. Kafka-style consumer groups achieve it by giving each service its own group.',
  },
  {
    id: 'ch12.011',
    sectionId: 'messaging',
    conceptIds: ['ack-redelivery'],
    kind: 'failure',
    prompt: 'With a load-balanced queue, consumer 2 crashes while handling m3 while consumer 1 handles m4. What happens to the order of processing, and why?',
    answer:
      'm3 was never acknowledged, so the broker redelivers it — after m4 has already been processed by consumer 1. The effective order becomes m4 then m3. Load balancing combined with redelivery inevitably reorders messages; using a separate queue per consumer avoids it.',
    keyPoints: ['Unacknowledged m3 is redelivered', 'm4 was already processed → m4 before m3', 'Load balancing + redelivery reorders', 'Fix: one queue per consumer'],
  },
  {
    id: 'ch12.012',
    sectionId: 'messaging',
    conceptIds: ['ack-redelivery'],
    kind: 'explain',
    prompt: 'Why can acknowledgment-based delivery cause a message to be processed twice?',
    answer:
      'The consumer may finish processing but its acknowledgment is lost (network failure, crash right after). The broker then assumes the message was never processed and redelivers it. Avoiding the duplicate needs idempotent processing or an atomic commit protocol.',
    keyPoints: ['Processing done but ack lost', 'Broker redelivers', 'Needs idempotence or atomic commit to be safe'],
  },
  {
    id: 'ch12.013',
    sectionId: 'messaging',
    conceptIds: ['dead-letter-queue'],
    kind: 'explain',
    prompt: 'What problem does a dead letter queue solve, and how is it operated?',
    answer:
      'A malformed (poison) message can crash every consumer that tries it; without a limit it is redelivered forever, wasting resources or — with strict ordering — blocking everything behind it. After a number of failures it is moved to a DLQ. The DLQ is monitored (anything there is an error), and an operator drops it, fixes and resends it, or fixes the consumer.',
    keyPoints: ['Poison message → endless redelivery', 'Blocks progress under strict ordering', 'Moved aside after repeated failures', 'Monitored; a human decides what to do'],
  },

  // ── Log-based brokers ────────────────────────────────────────────────
  {
    id: 'ch12.014',
    sectionId: 'log-brokers',
    conceptIds: ['log-broker'],
    kind: 'explain',
    prompt: 'How does a log-based message broker store and deliver messages?',
    answer:
      'Producers append messages to the end of a log on disk; consumers read the log sequentially and wait for notification when they reach the end. The log is split into partitions on different machines for throughput, and replicated for fault tolerance. Reading doesn’t delete anything.',
    keyPoints: ['Append to a durable log', 'Consumers read sequentially, notified of new messages', 'Partitioned for throughput, replicated for durability', 'Reading is non-destructive'],
  },
  {
    id: 'ch12.015',
    sectionId: 'log-brokers',
    conceptIds: ['partitions-offsets'],
    kind: 'choice',
    prompt: 'What ordering does a partitioned log guarantee?',
    options: [
      { text: 'Total order across the whole topic', why: 'There is no order between partitions.' },
      { text: 'Order within each partition only', correct: true },
      { text: 'Order by producer timestamp', why: 'Offsets reflect append order, not timestamps.' },
      { text: 'No ordering at all', why: 'Each partition is totally ordered by offset.' },
    ],
    explanation: 'Each partition is append-only, so offsets give it a total order. Events that must stay in order need the same partition key.',
  },
  {
    id: 'ch12.016',
    sectionId: 'log-brokers',
    conceptIds: ['partitions-offsets'],
    kind: 'scenario',
    prompt: 'Order events must be processed in order per order id, but you need many partitions for throughput. How?',
    answer: 'Use the order id as the partition key. The producer hashes it to choose a partition, so all events for one order go to the same partition and are read in offset order by one consumer.',
    keyPoints: ['Order id as the partition key', 'Hash of key picks the partition', 'Same partition → same consumer → in order'],
  },
  {
    id: 'ch12.017',
    sectionId: 'log-brokers',
    conceptIds: ['consumer-offsets'],
    kind: 'explain',
    prompt: 'What is a consumer offset, and why does tracking it make log-based brokers efficient?',
    answer:
      'It is the position up to which a consumer group has processed a partition: everything below is done, everything above is not. The broker only needs to record this one number periodically (a commit) instead of tracking an acknowledgment per message, which allows batching and pipelining.',
    keyPoints: ['Position in the partition: below = processed', 'Committed periodically', 'No per-message acknowledgments → high throughput'],
  },
  {
    id: 'ch12.018',
    sectionId: 'log-brokers',
    conceptIds: ['consumer-offsets'],
    kind: 'failure',
    prompt: 'A consumer crashes after processing several messages it hasn’t committed yet. What happens next?',
    answer:
      'A rebalance gives its partitions to another group member, which starts from the last committed offset. The messages processed after that commit are processed a second time — at-least-once delivery.',
    keyPoints: ['Partitions reassigned (rebalance)', 'Resume from last committed offset', 'Uncommitted work is redone → duplicates'],
  },
  {
    id: 'ch12.019',
    sectionId: 'log-brokers',
    conceptIds: ['consumer-offsets'],
    kind: 'failure',
    prompt: 'Name two downsides of assigning whole partitions to consumers.',
    answer:
      'The number of useful consumers in a group is capped at the number of partitions (extras sit idle). And one slow message holds up all later messages in its partition — head-of-line blocking.',
    keyPoints: ['Parallelism ≤ number of partitions', 'Head-of-line blocking within a partition'],
  },
  {
    id: 'ch12.020',
    sectionId: 'log-brokers',
    conceptIds: ['consumer-offsets'],
    kind: 'recall',
    prompt: 'What database mechanism is a consumer offset most similar to?',
    answer: 'The log sequence number used in single-leader replication: a follower remembers its position in the leader’s log so it can reconnect and continue without skipping writes. The broker acts like the leader, the consumer like a follower.',
    keyPoints: ['Replication log sequence number', 'Broker ≈ leader, consumer ≈ follower', 'Resume without skipping'],
  },
  {
    id: 'ch12.021',
    sectionId: 'log-brokers',
    conceptIds: ['log-retention'],
    kind: 'explain',
    prompt: 'How does a log-based broker reclaim disk space, and what is the risk for consumers?',
    answer:
      'The log is stored in segments, and old segments are deleted or archived — effectively a large, fixed-size circular buffer on disk. If a consumer lags so far that its offset points into a deleted segment, it misses those messages. Monitor consumer lag and alert well before that point.',
    keyPoints: ['Old segments deleted/archived', 'Bounded but large on-disk buffer', 'A far-behind consumer misses messages', 'Monitor and alert on lag'],
  },
  {
    id: 'ch12.022',
    sectionId: 'log-brokers',
    conceptIds: ['log-retention'],
    kind: 'compare',
    prompt: 'What happens when a consumer is slow or shut down — in a log-based broker versus a traditional broker?',
    answer:
      'In a log, only that consumer suffers: others are unaffected, and a stopped consumer costs nothing but its stored offset. In a traditional broker, a queue whose consumers have gone keeps accumulating messages and takes memory from active consumers unless someone deletes it.',
    keyPoints: ['Log: slow consumer affects only itself', 'Log: stopped consumer leaves only an offset', 'Traditional: abandoned queues keep growing'],
  },
  {
    id: 'ch12.023',
    sectionId: 'log-brokers',
    conceptIds: ['replay'],
    kind: 'explain',
    prompt: 'Why can a log-based broker replay old messages, and what is that useful for?',
    answer:
      'Consuming is read-only; the only state is the consumer’s own offset, which it controls. Moving the offset back reprocesses old messages — e.g. running fixed code over yesterday’s data and writing to a new location. Like batch jobs, it allows experimentation and recovery from bugs.',
    keyPoints: ['Reading doesn’t change the log', 'Offset is under the consumer’s control', 'Reprocess with new code; recover from bugs'],
  },
  {
    id: 'ch12.024',
    sectionId: 'log-brokers',
    conceptIds: ['log-broker', 'load-balance-fanout'],
    kind: 'choice',
    prompt: 'Which workload is a better fit for a traditional (AMQP/JMS-style) queue than a log-based broker?',
    options: [
      { text: 'Millions of small, ordered events per second feeding derived data', why: 'That is the log’s sweet spot.' },
      { text: 'Expensive, independent tasks where order doesn’t matter and nobody rereads old messages', correct: true },
      { text: 'A new consumer needing last week’s messages', why: 'Only a log keeps old messages.' },
      { text: 'Strict per-customer ordering', why: 'Logs preserve per-partition order; queues reorder on redelivery.' },
    ],
    explanation: 'Queues balance individual messages across any free consumer, which suits slow independent tasks (a task queue). Logs suit high-throughput, ordered streams.',
  },

  // ── CDC ──────────────────────────────────────────────────────────────
  {
    id: 'ch12.025',
    sectionId: 'cdc',
    conceptIds: ['dual-writes'],
    kind: 'failure',
    prompt: 'Two clients concurrently set item X — one to A, one to B — using dual writes to a database and a search index. How can the two systems end up permanently different?',
    answer:
      'The writes interleave differently: the database receives A then B (final B) while the index receives B then A (final A). Each write succeeded, so no error is raised, and the systems stay inconsistent until X is written again. Without extra concurrency detection you won’t even notice.',
    keyPoints: ['Different arrival order in each system', 'No error raised', 'Inconsistency persists silently'],
  },
  {
    id: 'ch12.026',
    sectionId: 'cdc',
    conceptIds: ['dual-writes'],
    kind: 'failure',
    prompt: 'Besides races, what other problem do dual writes have?',
    answer: 'Partial failure: one write can succeed while the other fails (or the application crashes in between). Guaranteeing both or neither is the atomic commit problem, which is expensive across different systems.',
    keyPoints: ['One write succeeds, the other fails', 'Atomic commit across systems is costly'],
  },
  {
    id: 'ch12.027',
    sectionId: 'cdc',
    conceptIds: ['cdc'],
    kind: 'explain',
    prompt: 'What is change data capture and how does it fix the dual-write race?',
    answer:
      'CDC observes every change committed to a database and publishes it as a stream. Only the database is written to, so it alone decides the order; derived systems (search, cache, warehouse) consume the stream and apply changes in that same order. The database becomes the leader and the others its followers.',
    keyPoints: ['Capture committed changes as a stream', 'Database alone decides the order', 'Derived systems apply changes in the same order', 'Database = leader, others = followers'],
  },
  {
    id: 'ch12.028',
    sectionId: 'cdc',
    conceptIds: ['cdc'],
    kind: 'recall',
    prompt: 'Why is CDC usually asynchronous, and what does that cost?',
    answer: 'The source database commits without waiting for consumers, so a slow consumer can’t slow it down. The cost is replication lag: derived systems are briefly out of date, with the usual lag problems such as not reading your own writes.',
    keyPoints: ['Database doesn’t wait for consumers', 'Slow consumers don’t hurt the source', 'Derived data lags'],
  },
  {
    id: 'ch12.029',
    sectionId: 'cdc',
    conceptIds: ['cdc-snapshot'],
    kind: 'explain',
    prompt: 'How do you start a brand-new derived system (e.g. a new search index) from a CDC stream that doesn’t go back to the beginning?',
    answer:
      'Take a consistent snapshot of the whole database that corresponds to a known position (offset) in the change log. Load the snapshot, then apply changes from that position onward. Without the position you wouldn’t know where to start.',
    keyPoints: ['Recent changes alone miss unchanged data', 'Consistent snapshot of the database', 'Tied to a known log position', 'Apply changes after that position'],
  },
  {
    id: 'ch12.030',
    sectionId: 'cdc',
    conceptIds: ['log-compaction'],
    kind: 'explain',
    prompt: 'What does log compaction do, and how does it help CDC?',
    answer:
      'In the background it keeps only the most recent record for each key (a tombstone removes the key). The log’s size then depends on the current data, not the number of writes. A new consumer can read the compacted topic from offset 0 and get the latest value for every key — a full copy without a separate snapshot.',
    keyPoints: ['Keep newest record per key', 'Tombstone removes a key', 'Size tracks current data, not history', 'Replay from offset 0 rebuilds the full state'],
  },
  {
    id: 'ch12.031',
    sectionId: 'cdc',
    conceptIds: ['log-compaction', 'cdc-vs-event-sourcing'],
    kind: 'choice',
    prompt: 'Why can a CDC topic be log-compacted but an event-sourced log usually can’t?',
    options: [
      { text: 'Event-sourced logs are too small to need it', why: 'Size isn’t the reason.' },
      { text: 'A CDC event holds the whole new row, so the latest per key is enough; event-sourced events build on earlier ones', correct: true },
      { text: 'CDC events have no keys', why: 'CDC events are keyed by primary key — that’s what makes compaction possible.' },
      { text: 'Kafka only supports compaction for CDC connectors', why: 'Compaction is a topic setting, not tied to CDC.' },
    ],
    explanation: 'Compaction keeps the last record per key. That’s enough when each record is the complete state; event-sourced events express intent, so later events don’t replace earlier ones.',
  },
  {
    id: 'ch12.032',
    sectionId: 'cdc',
    conceptIds: ['outbox'],
    kind: 'explain',
    prompt: 'Why does CDC turn a database schema into a public API, and how does the outbox pattern help?',
    answer:
      'Consumers receive changes in the shape of the source tables, so renaming or dropping a column can break other services. With an outbox, the service writes events into a separate table with its own stable schema, in the same transaction as the real change, and only the outbox is captured. Internal tables can then change freely.',
    keyPoints: ['CDC exposes table schemas to consumers', 'Schema changes can break downstream services', 'Outbox table with its own schema', 'Written in the same transaction → no dual-write problem'],
  },
  {
    id: 'ch12.033',
    sectionId: 'cdc',
    conceptIds: ['outbox'],
    kind: 'compare',
    prompt: 'An outbox looks like a dual write. Why doesn’t it have dual writes’ problems, and what does it cost?',
    answer:
      'Both writes go to the same database in one transaction, so they succeed or fail together and are ordered by that database. Costs: maintaining the mapping from internal to outbox schema, and extra write load on the database.',
    keyPoints: ['Same database, same transaction', 'Atomic and consistently ordered', 'Cost: schema mapping to maintain', 'Cost: more data written'],
  },
  {
    id: 'ch12.034',
    sectionId: 'cdc',
    conceptIds: ['cdc-vs-event-sourcing'],
    kind: 'compare',
    prompt: 'Compare change data capture with event sourcing.',
    answer:
      'CDC extracts low-level changes from a normal, mutable database (e.g. from its replication log); the order matches the real write order and it can be added with little change to the app. Event sourcing builds the application around immutable, application-level events in an event log; it captures intent but is a big redesign and needs the full history (no key-based compaction).',
    keyPoints: ['CDC: low-level, extracted from a mutable DB', 'CDC: easy to add', 'Event sourcing: application-level intent as source of truth', 'Event sourcing: big change, full history needed'],
  },

  // ── Immutability ─────────────────────────────────────────────────────
  {
    id: 'ch12.035',
    sectionId: 'immutability',
    conceptIds: ['state-as-changelog'],
    kind: 'explain',
    prompt: 'How are mutable state and an immutable event log related?',
    answer:
      'They’re two views of the same thing: the current state is what you get by applying every event so far (integrating the stream over time), and the changelog is how the state changed (its derivative). If the log is kept durably, any state can be reproduced from it — the database is just a fast way to read the log’s latest result.',
    keyPoints: ['State = result of applying all events', 'Changelog = how state evolved', 'Durable log makes state reproducible'],
  },
  {
    id: 'ch12.036',
    sectionId: 'immutability',
    conceptIds: ['immutable-events'],
    kind: 'recall',
    prompt: 'Give three benefits of storing immutable events instead of overwriting state.',
    answer:
      'Auditability (the full history stays, like an accountant’s ledger); easier recovery from bugs (bad writes don’t destroy old values, and fixes are compensating events); and more information for analysis (e.g. items added and then removed from a cart).',
    keyPoints: ['Audit trail', 'Recovery from buggy writes; compensating events', 'Keeps information current state loses'],
  },
  {
    id: 'ch12.037',
    sectionId: 'immutability',
    conceptIds: ['derived-views'],
    kind: 'explain',
    prompt: 'How does deriving views from an event log make it easier to evolve an application?',
    answer:
      'To present data in a new way, build a new read-optimized view from the existing log and run it alongside the old one; move readers over, then retire the old view. That avoids a risky in-place schema migration, and you can denormalize views freely because they’re rebuilt from the log.',
    keyPoints: ['Build a new view from the existing log', 'Run old and new side by side', 'Avoid in-place migrations', 'Denormalize freely'],
  },
  {
    id: 'ch12.038',
    sectionId: 'immutability',
    conceptIds: ['log-concurrency'],
    kind: 'failure',
    prompt: 'What is the biggest downside of CQRS-style views updated asynchronously from an event log?',
    answer:
      'A user can write an event and then read a view that doesn’t yet include it — read-your-writes is violated. Updating the view synchronously would need a distributed transaction or waiting for the view, which are usually impractical.',
    keyPoints: ['Views lag behind the log', 'User may not see their own write', 'Synchronous updates are usually impractical'],
  },
  {
    id: 'ch12.039',
    sectionId: 'immutability',
    conceptIds: ['log-concurrency'],
    kind: 'explain',
    prompt: 'How can an event log reduce the need for multi-object transactions and locking?',
    answer:
      'Design each event as a self-contained description of a user action, so the action is a single append — easy to make atomic. If the log and the state are sharded the same way, one single-threaded consumer per shard applies events one at a time in log order, needing no concurrency control.',
    keyPoints: ['Self-contained event = one atomic append', 'Same sharding for log and state', 'Single-threaded consumer per shard, serial order'],
  },
  {
    id: 'ch12.040',
    sectionId: 'immutability',
    conceptIds: ['immutability-limits'],
    kind: 'explain',
    prompt: 'When is keeping all events forever a problem, and what is crypto-shredding?',
    answer:
      'With high churn (many updates/deletes on a small dataset) history can grow far larger than the data. And laws like the GDPR may require truly deleting personal data, not just appending a “deleted” event (some systems call rewriting history excision). Crypto-shredding stores data encrypted and “deletes” it by destroying the key; you must decide up front which data shares a key.',
    keyPoints: ['High churn → huge history', 'Legal deletion needs history rewritten (excision)', 'Crypto-shredding: destroy the key', 'Key granularity chosen up front'],
  },

  // ── Uses of stream processing ────────────────────────────────────────
  {
    id: 'ch12.041',
    sectionId: 'stream-uses',
    conceptIds: ['cep'],
    kind: 'explain',
    prompt: 'What is complex event processing (CEP), and how does it reverse the usual roles of queries and data?',
    answer:
      'CEP lets you declare patterns of events to look for (often in an SQL-like language); the engine keeps a state machine and emits a “complex event” when a pattern matches. Normally a database stores data and runs transient queries; a CEP engine stores the queries long-term and runs each incoming event past them.',
    keyPoints: ['Declarative event patterns', 'Emits a complex event on a match', 'Queries stored, data flows past'],
  },
  {
    id: 'ch12.042',
    sectionId: 'stream-uses',
    conceptIds: ['stream-analytics'],
    kind: 'choice',
    prompt: 'A stream analytics job uses HyperLogLog to count distinct users. What does that imply?',
    options: [
      { text: 'Stream processing is inherently approximate', why: 'It isn’t — exact algorithms are possible.' },
      { text: 'It trades a little accuracy for much less memory — an optimization, not a requirement', correct: true },
      { text: 'The job must use processing time', why: 'Unrelated to time semantics.' },
      { text: 'Results can’t be windowed', why: 'Probabilistic counts work fine per window.' },
    ],
    explanation: 'Probabilistic algorithms are just a memory optimization. Nothing about streaming forces approximate answers.',
  },
  {
    id: 'ch12.043',
    sectionId: 'stream-uses',
    conceptIds: ['materialized-views-streams'],
    kind: 'compare',
    prompt: 'How does maintaining a materialized view from a stream differ from windowed stream analytics, and what does IVM add?',
    answer:
      'Analytics usually looks only at recent windows; a materialized view depends on all events since the beginning (minus what compaction removed). Refreshing views by rerunning the full query is slow and stale between runs; incremental view maintenance computes only the effect of each change, so views stay fresh efficiently.',
    keyPoints: ['Views need all history, not a short window', 'Full refresh is inefficient and stale', 'IVM updates only what changed'],
  },
  {
    id: 'ch12.044',
    sectionId: 'stream-uses',
    conceptIds: ['search-on-streams'],
    kind: 'scenario',
    prompt: 'A property site wants to email users the moment a new listing matches their saved search. How is this different from normal search?',
    answer:
      'Normal search indexes documents and runs each query against them once. Here the queries are stored and each new listing is tested against all of them as it arrives (like Elasticsearch’s percolator). With many saved queries, indexing the queries narrows which ones can match.',
    keyPoints: ['Store the queries, not just the documents', 'Test each new document against stored queries', 'Index the queries when there are many'],
  },
  {
    id: 'ch12.045',
    sectionId: 'stream-uses',
    conceptIds: ['actors-vs-streams'],
    kind: 'compare',
    prompt: 'Why aren’t actor frameworks usually considered stream processors?',
    answer:
      'Actors are mainly a way to manage concurrency and distributed execution; their messages are often ephemeral and one-to-one, and they can communicate in any pattern including request/response cycles. Stream processing is a data-management technique with durable, multi-subscriber logs and acyclic pipelines. Many actor frameworks also don’t guarantee delivery after crashes.',
    keyPoints: ['Actors: concurrency management', 'Ephemeral, one-to-one messages', 'Streams: durable, multi-subscriber, acyclic', 'Actor delivery often not crash-safe'],
  },

  // ── Time ─────────────────────────────────────────────────────────────
  {
    id: 'ch12.046',
    sectionId: 'time',
    conceptIds: ['event-vs-processing-time'],
    kind: 'explain',
    prompt: 'What is the difference between event time and processing time, and when does processing time go wrong?',
    answer:
      'Event time is when the event happened (its timestamp); processing time is when the processor handles it (its local clock). Processing time is fine when the delay is negligible, but breaks with any significant lag — queueing, network faults, restarts, or reprocessing old data — and it isn’t deterministic.',
    keyPoints: ['Event time = timestamp in the event', 'Processing time = processor’s clock', 'Breaks under lag: restarts, backlogs, reprocessing', 'Event time is deterministic'],
  },
  {
    id: 'ch12.047',
    sectionId: 'time',
    conceptIds: ['event-vs-processing-time'],
    kind: 'failure',
    prompt: 'A requests-per-second metric is computed by processing time. The job is redeployed and down for a minute. What artifact appears?',
    answer: 'A drop while it’s down, then a sudden spike while it works through the backlog — although real traffic was steady. Windowing by event time puts each request back in the second it actually happened.',
    keyPoints: ['Dip while down', 'Spike while catching up', 'Not real; fix by using event time'],
  },
  {
    id: 'ch12.048',
    sectionId: 'time',
    conceptIds: ['stragglers'],
    kind: 'explain',
    prompt: 'What are straggler events, and what are the two ways to handle them?',
    answer:
      'Events that arrive after you’ve declared their window complete (you can never be sure all events for a window have arrived). Either ignore them — tracking how many are dropped and alerting if that grows — or publish a corrected value for the window, possibly retracting the earlier output.',
    keyPoints: ['Arrive after the window was closed', 'Can’t know a window is complete', 'Ignore + count/alert', 'Or publish corrections (retract old output)'],
  },
  {
    id: 'ch12.049',
    sectionId: 'time',
    conceptIds: ['device-clocks'],
    kind: 'explain',
    prompt: 'A mobile app buffers events offline and uploads them later. How do you estimate when each event really happened if the phone’s clock may be wrong?',
    answer:
      'Record three timestamps: when the event occurred (device clock), when it was sent (device clock), and when it was received (server clock). Received minus sent estimates the device clock’s offset (assuming quick transmission); apply that offset to the occurred time.',
    keyPoints: ['Occurred-at (device)', 'Sent-at (device)', 'Received-at (server)', 'received − sent ≈ clock offset; correct the event time'],
  },
  {
    id: 'ch12.050',
    sectionId: 'time',
    conceptIds: ['window-types'],
    kind: 'recall',
    prompt: 'Describe tumbling, hopping, sliding and session windows.',
    answer:
      'Tumbling: fixed length, no overlap, each event in exactly one window. Hopping: fixed length with overlap (e.g. 5 minutes advancing by 1) for smoothing. Sliding: all events within a given interval of each other, no fixed boundaries. Session: no fixed length — groups a user’s closely spaced events and ends after inactivity.',
    keyPoints: ['Tumbling: fixed, non-overlapping', 'Hopping: fixed, overlapping', 'Sliding: within an interval of each other', 'Session: ends after inactivity'],
  },
  {
    id: 'ch12.051',
    sectionId: 'time',
    conceptIds: ['window-types'],
    kind: 'choice',
    prompt: 'Two events happen at 10:02:50 and 10:06:30. Which 5-minute window type is guaranteed to put them together?',
    options: [
      { text: 'Tumbling', why: 'The fixed boundary at 10:05 separates them.' },
      { text: 'Hopping', why: 'Fixed boundaries can still separate them.' },
      { text: 'Sliding', correct: true },
      { text: 'None of them', why: 'They are less than five minutes apart, so a sliding window covers both.' },
    ],
    explanation: 'Sliding windows have no fixed boundaries: any events less than the window length apart can share one.',
  },
  {
    id: 'ch12.052',
    sectionId: 'time',
    conceptIds: ['window-types'],
    kind: 'failure',
    prompt: 'Why can large sliding windows or high-throughput joins put pressure on a stream processor?',
    answer: 'Unlike a simple counter (fixed-size state), they must buffer the actual events until the window ends, so state grows with window size and event rate — and must fit in memory or local disk.',
    keyPoints: ['Counters: fixed-size state', 'Sliding windows/joins buffer events', 'State grows with window size × rate'],
  },

  // ── Joins ────────────────────────────────────────────────────────────
  {
    id: 'ch12.053',
    sectionId: 'joins',
    conceptIds: ['stream-stream-join'],
    kind: 'explain',
    prompt: 'How do you compute search click-through rates by joining a stream of searches with a stream of clicks?',
    answer:
      'Keep the searches and clicks from the last window (say an hour), indexed by session id. When either arrives, check the other index: on a match, emit the joined event. When a search expires without a click, emit a “not clicked” event. Clicks can arrive before searches, so both sides are buffered.',
    keyPoints: ['State for both streams, indexed by session id', 'Emit on match', 'Emit “not clicked” on expiry', 'Either side can arrive first'],
  },
  {
    id: 'ch12.054',
    sectionId: 'joins',
    conceptIds: ['stream-stream-join'],
    kind: 'failure',
    prompt: 'Why isn’t copying the search details into each click event a substitute for joining searches with clicks?',
    answer: 'It only tells you about searches that got a click. Click-through rate also needs the searches nobody clicked, which only the search stream contains.',
    keyPoints: ['Clicks only cover clicked searches', 'Rate needs unclicked searches too'],
  },
  {
    id: 'ch12.055',
    sectionId: 'joins',
    conceptIds: ['stream-table-join'],
    kind: 'explain',
    prompt: 'How does a stream processor enrich activity events with user profile data efficiently?',
    answer:
      'Rather than querying a remote database for every event (slow, risks overloading it), it keeps a local copy of the profile table — in memory or on local disk — and subscribes to the table’s changelog (CDC) to keep it current. Each event is enriched with a local lookup.',
    keyPoints: ['Avoid a remote query per event', 'Local copy of the table', 'Kept fresh via the table’s changelog', 'Local lookup per event'],
  },
  {
    id: 'ch12.056',
    sectionId: 'joins',
    conceptIds: ['table-table-join'],
    kind: 'explain',
    prompt: 'How can home timelines be maintained as a table–table join of posts and follows?',
    answer:
      'Consume changelogs of posts and follows. A new post is added to every follower’s timeline; a deleted post removed. A follow adds the followee’s recent posts; an unfollow removes them. Each change joins with the current state of the other table, so the timelines are a continuously updated materialized view of posts JOIN follows.',
    keyPoints: ['Inputs: posts and follows changelogs', 'Post change × current followers', 'Follow change × current posts', 'Output: materialized join (timelines)'],
  },
  {
    id: 'ch12.057',
    sectionId: 'joins',
    conceptIds: ['join-time-dependence'],
    kind: 'failure',
    prompt: 'Why can a stream join give different results when rerun on the same input, and how do warehouses handle this?',
    answer:
      'Ordering is guaranteed only within a partition, so events from the two inputs may interleave differently on each run — e.g. whether an activity is joined with a profile before or after an update. Making each version of the joined record identifiable (a slowly changing dimension), and having events reference the version, makes the join deterministic — at the cost of keeping every version (no log compaction).',
    keyPoints: ['No order guarantee across streams', 'Different interleaving → different join results', 'Version ids (slowly changing dimension)', 'Deterministic, but no compaction'],
  },

  // ── Fault tolerance ──────────────────────────────────────────────────
  {
    id: 'ch12.058',
    sectionId: 'fault-tolerance',
    conceptIds: ['exactly-once'],
    kind: 'recall',
    prompt: 'What does “exactly-once semantics” really mean in stream processing?',
    answer: 'That the visible result is as if each record had been processed exactly once, even though failed work may be retried and records processed several times internally — “effectively-once”.',
    keyPoints: ['Retries may happen internally', 'Visible effect as if once', 'Better called effectively-once'],
  },
  {
    id: 'ch12.059',
    sectionId: 'fault-tolerance',
    conceptIds: ['microbatch-checkpoint'],
    kind: 'compare',
    prompt: 'Compare microbatching and checkpointing, and state their shared limitation.',
    answer:
      'Microbatching (Spark Streaming) splits the stream into ~1-second batches processed like small batch jobs — trading overhead against latency, and implicitly windowing by processing time. Checkpointing (Flink) periodically snapshots operator state at barriers in the stream and restarts from the last checkpoint. Both give exactly-once only inside the framework: external side effects (DB writes, emails) may repeat after a restart.',
    keyPoints: ['Microbatching: tiny batches; overhead vs latency', 'Checkpointing: state snapshots at barriers', 'Both exactly-once within the framework only', 'External side effects can repeat'],
  },
  {
    id: 'ch12.060',
    sectionId: 'fault-tolerance',
    conceptIds: ['atomic-commit-streams'],
    kind: 'explain',
    prompt: 'What must commit atomically for exactly-once stream processing, and how do systems like Kafka make that efficient?',
    answer:
      'Everything an event causes: output messages, database writes, operator state changes, and the input acknowledgment/offset commit. Kafka, Dataflow and VoltDB keep the transaction internal to their own system (rather than spanning different products like XA) and amortize its cost over many input messages per transaction.',
    keyPoints: ['Outputs + state + offset commit together', 'All or nothing', 'Kept internal to one system', 'Many messages per transaction'],
  },
  {
    id: 'ch12.061',
    sectionId: 'fault-tolerance',
    conceptIds: ['idempotence'],
    kind: 'explain',
    prompt: 'How can a consumer make writes to an external database idempotent using Kafka offsets?',
    answer: 'Store the offset of the message that triggered a write together with the written value. On redelivery, the consumer sees that offset was already applied and skips the write.',
    keyPoints: ['Offsets are stable and increasing', 'Store the triggering offset with the value', 'Skip already-applied offsets'],
  },
  {
    id: 'ch12.062',
    sectionId: 'fault-tolerance',
    conceptIds: ['idempotence'],
    kind: 'failure',
    prompt: 'What assumptions does relying on idempotence make?',
    answer:
      'That a restarted task replays the same messages in the same order (log-based brokers do), that processing is deterministic, and that no other node updates the same value concurrently — which may require fencing so a node wrongly presumed dead can’t interfere.',
    keyPoints: ['Same messages, same order on replay', 'Deterministic processing', 'No concurrent writers', 'Fencing against zombie nodes'],
  },
  {
    id: 'ch12.063',
    sectionId: 'fault-tolerance',
    conceptIds: ['idempotence', 'exactly-once'],
    kind: 'choice',
    prompt: 'Which operation is naturally idempotent?',
    options: [
      { text: 'Incrementing a counter', why: 'Doing it twice increments twice.' },
      { text: 'Appending a line to a file', why: 'A repeat adds a second line.' },
      { text: 'Setting key K to value V', correct: true },
      { text: 'Sending an email', why: 'A repeat sends a second email.' },
    ],
    explanation: 'Setting a key to a fixed value (like deleting a key) has the same effect no matter how often it’s done. Increments, appends and sends need extra metadata to become idempotent.',
  },
  {
    id: 'ch12.064',
    sectionId: 'fault-tolerance',
    conceptIds: ['state-recovery'],
    kind: 'recall',
    prompt: 'How can a stream operator recover its state (window counts, join tables) after a failure?',
    answer:
      'Keep state in a replicated remote datastore; or keep it local and replicate it — Flink snapshots to durable storage, Kafka Streams writes state changes to a log-compacted changelog topic, VoltDB processes inputs redundantly on several nodes; or rebuild it by replaying input (short windows, or a CDC-maintained table from its compacted stream).',
    keyPoints: ['Remote replicated store (slower per message)', 'Local state + snapshots or changelog topic', 'Redundant processing', 'Rebuild by replaying input'],
  },
  {
    id: 'ch12.065',
    sectionId: 'fault-tolerance',
    conceptIds: ['idempotence', 'consumer-offsets'],
    kind: 'scenario',
    prompt: 'A consumer reads booking-change events, updates its own copy of the booking, then calls a partner’s webhook, then commits. It sometimes crashes after the webhook call. How do you keep both effects safe?',
    answer:
      'Assume at-least-once: the event will be processed again. Make the database update idempotent (store the source event’s sequence/offset and ignore repeats or older versions). Give each webhook call a stable, deterministic notification id so the partner can de-duplicate. Only commit the offset after both are done; never skip ahead.',
    keyPoints: ['Expect redelivery after a crash', 'Idempotent DB write via stored sequence/offset', 'Stable notification id for partner de-duplication', 'Commit after effects; no skipping'],
  },
];
