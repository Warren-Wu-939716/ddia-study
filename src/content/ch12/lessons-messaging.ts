import type { Lesson } from '../types.ts';
import { art } from '../ch04/lessons-oltp.ts';

/**
 * Lessons 1–4 of chapter 12: events, brokers, logs and change data capture. Original explanations and examples.
 * Each technical term gets a plain-English analogy where it first appears in this chapter, then is used as-is.
 */
export const messagingLessons: Lesson[] = [
  // ── 1 ─────────────────────────────────────────────────────────────────
  {
    sectionId: 'streams-intro',
    intro:
      'Most data never stops arriving: new orders, clicks and sensor readings show up every second. This chapter is about handling that data as it arrives instead of in big periodic chunks. This first lesson sets up the vocabulary: events, producers, consumers and topics.',
    blocks: [
      {
        kind: 'text',
        title: 'From batches to streams',
        body: '**Batch processing** works on a fixed pile of input — say, all of yesterday’s orders — and produces its output once the whole pile has been read. It’s like doing the laundry once a week: efficient, but nothing is clean in between. The pile is **bounded**: it has a known end.\n\nReal data is usually **unbounded**: it keeps arriving for as long as the business exists. To use batches anyway, you have to chop time into slices (“process each day at midnight”), and every change then shows up a day late. Make the slices smaller and smaller and you end up processing each piece of data the moment it arrives. That is **stream processing**, and a **stream** is simply data that becomes available bit by bit over time.',
      },
      {
        kind: 'analogy',
        body: 'Batch processing is washing all your dishes once a day. Stream processing is rinsing each plate as soon as you’ve used it: more frequent, smaller bits of work, and the kitchen is always nearly up to date.',
      },
      {
        kind: 'widget',
        widget: 'batch-vs-stream',
        title: 'Bounded batches vs an unbounded stream',
        body: 'Run the nightly batch, then the stream, and compare how long each order waits before it shows up in the report.',
      },
      {
        kind: 'text',
        title: 'Events',
        body: 'In streaming, a single piece of data is called an **event**: a small, self-contained record saying that something happened at a certain moment — “user 7 added socks to their cart at 10:03:12”. It usually carries a **timestamp** (when it happened, according to some clock). Think of an event as a receipt: it describes one thing that happened, and you never edit a receipt after it’s printed — events are **immutable**.\n\nEvents can come from people (a click, a purchase), from machines (a temperature reading every minute, a server’s CPU usage), or from a database recording each change. To store or send an event it is **encoded** — turned into bytes, for example as JSON text or a compact binary format.',
      },
      {
        kind: 'text',
        title: 'Producers, consumers and topics',
        body: 'An event is created once by a **producer** (also called a publisher or sender) and can then be handled by any number of **consumers** (subscribers, recipients). Related events are grouped into a **topic** (or stream) — like a TV channel: the broadcaster sends each programme once, and anyone tuned in can watch it.',
      },
      {
        kind: 'widget',
        widget: 'pubsub',
        title: 'Producers, a topic and consumers',
        body: 'Follow two events from the producers that create them, through the topic, to every consumer.',
      },
      {
        kind: 'text',
        title: 'Why not just use a database?',
        body: 'A producer could write each event into a database table, and consumers could keep asking “anything new since last time?”. Asking repeatedly is called **polling**. Polling is like walking to the mailbox every five minutes to see if a letter came: the more often you check (to get letters sooner), the more trips come back empty. For low delays, it’s far better if the consumer is **notified** when something new arrives — like a doorbell.\n\nDatabases have only limited notification features (**triggers**, small pieces of code that run when a row changes), so dedicated tools grew up for delivering events. The next two lessons look at them.',
      },
      {
        kind: 'widget',
        widget: 'polling',
        title: 'Polling vs notification',
        body: 'Poll every 3 s, then every 1 s, then switch to notifications. Watch the wasted checks and the waiting time trade off.',
      },
      {
        kind: 'check',
        question: 'Why does polling a database get more wasteful the faster you want consumers to react?',
        answer: 'To react quickly you must poll very often, but most polls then find nothing new — so the fraction of useful requests drops and the overhead rises. Notifying consumers avoids the empty checks.',
      },
    ],
    takeaways: [
      'Batch input is bounded; streams are unbounded and processed bit by bit as data arrives.',
      'An event is a small, immutable record of something that happened, usually timestamped.',
      'A producer writes an event once; many consumers may process it. Related events form a topic.',
      'Polling is wasteful for low latency — streaming systems notify consumers instead.',
    ],
  },

  // ── 2 ─────────────────────────────────────────────────────────────────
  {
    sectionId: 'messaging',
    intro:
      'A **messaging system** carries events from producers to consumers. There are many designs, and two simple questions tell them apart. This lesson covers those questions, the “traditional” message broker, and what happens when consumers crash.',
    blocks: [
      {
        kind: 'text',
        title: 'Publish/subscribe',
        body: 'Most messaging systems follow the **publish/subscribe** model: many producers can send to the same topic, and many consumers can receive from it — unlike a phone call, which connects exactly one caller to one listener.',
      },
      {
        kind: 'text',
        title: 'Question 1: what if producers are faster than consumers?',
        body: 'There are three options, like water pouring into a sink faster than it drains:\n- **Drop** messages — let the sink overflow. Fine for a temperature reading that will be re-sent in a minute; terrible for payments.\n- **Buffer** them in a **queue** — put a bucket under the tap. You must then decide what happens as the bucket grows: does it spill to disk, and what happens when the disk fills up?\n- Apply **backpressure** (also called flow control) — turn the tap down. The producer is blocked until the consumer catches up. Network connections work this way.',
      },
      {
        kind: 'widget',
        widget: 'overload',
        title: 'Drop, buffer or backpressure',
        body: 'A producer makes 3 messages a second for a consumer that handles 2. Run each strategy and see where the extra messages end up.',
      },
      {
        kind: 'text',
        title: 'Question 2: what if a machine crashes?',
        body: 'Are messages lost? Making them **durable** (surviving crashes) means writing them to disk and/or **replicating** them — keeping copies on other machines, like a spare key with a neighbour. That costs speed. If losing the odd message is acceptable, you can go faster on the same hardware. But beware: if many messages quietly go missing, counts and metrics can be badly wrong without anyone noticing.',
      },
      {
        kind: 'text',
        title: 'Sending directly, without a middleman',
        body: 'Some systems send messages straight from producer to consumer:\n- **UDP multicast**: fire-and-forget network messages sent to many machines at once — like shouting an announcement across a room. Used where speed matters most, such as stock-price feeds; lost messages must be handled by the application.\n- **Brokerless libraries** (such as ZeroMQ) that do publish/subscribe over direct connections.\n- **Webhooks**: one service registers a web address with another, which calls that address whenever something happens — like giving a shop your phone number so it can ring when your order is ready.\n\nThese are fast, but they assume both sides are online. If the consumer is down, it misses messages; if the producer crashes, it forgets which messages still needed retrying.',
      },
      {
        kind: 'text',
        title: 'Message brokers',
        body: 'The common alternative is a **message broker** (or message queue): a server that sits in the middle. Producers hand messages to the broker, and the broker delivers them to consumers — like a post office. Because the data lives in one central place, clients can come and go or crash, and the durability question becomes the broker’s job.\n\nOne consequence: consumers become **asynchronous**. The producer waits only for the broker to confirm it has the message, not for anyone to process it. Delivery happens “soon” — usually within a fraction of a second, but much later if a backlog has built up.',
      },
      {
        kind: 'widget',
        widget: 'direct-vs-broker',
        title: 'Direct delivery vs a broker',
        body: 'The consumer restarts in the middle of four messages. Compare what arrives when the producer calls it directly with what arrives through a broker.',
      },
      {
        kind: 'table',
        title: 'Traditional brokers compared with databases',
        head: ['', 'Database', 'Traditional message broker'],
        rows: [
          ['How long data stays', 'Until you delete it', 'Usually deleted as soon as it has been delivered and confirmed'],
          ['Assumed size', 'Can be huge', 'Small — short queues; long ones slow everything down'],
          ['Finding data', 'Indexes and query languages', 'Subscribe to topics, perhaps by name pattern'],
          ['Changes after you read', 'You don’t hear about them unless you ask again', 'You are told whenever new messages arrive'],
        ],
      },
      {
        kind: 'text',
        body: 'This “traditional” style is described by the **JMS** and **AMQP** standards and implemented by tools such as RabbitMQ, ActiveMQ, IBM MQ, Azure Service Bus and Google Cloud Pub/Sub. Some can even take part in **two-phase commit** — a protocol that makes several systems commit a change together or not at all.',
      },
      {
        kind: 'text',
        title: 'Several consumers on one topic',
        body: '- **Load balancing**: each message goes to **one** of the consumers, so they share the work — like customers in one queue at the bank, each served by whichever teller is free. Useful when messages are expensive to process: add consumers to go faster.\n- **Fan-out**: each message goes to **every** consumer — like a radio broadcast that every listener hears. Independent consumers each get their own copy without affecting one another.\n\nThe two can be combined with **consumer groups**: inside a group, consumers share the work; each separate group gets every message.',
      },
      {
        kind: 'widget',
        widget: 'fanout',
        title: 'Who gets each message?',
        body: 'Send six messages under each pattern and step through the deliveries.',
      },
      {
        kind: 'text',
        title: 'Acknowledgments and redelivery',
        body: 'A consumer can crash halfway through a message. To avoid losing it, the consumer must send an **acknowledgment** when it’s done — like signing for a parcel. Only then does the broker delete the message. If the connection drops or times out without an acknowledgment, the broker assumes the message wasn’t processed and **redelivers** it to another consumer.\n\nTwo side effects follow:\n- **Duplicates.** The work may actually have finished, with only the acknowledgment lost on the way. Redelivering then repeats the work. That’s harmless only if the operation is **idempotent** — doing it twice has the same effect as doing it once, like pressing a lift button that’s already lit. Otherwise you need extra machinery, covered in the last lesson.\n- **Reordering.** With load balancing, a redelivered message can be processed after messages that were sent later.',
      },
      {
        kind: 'text',
        title: 'Poison messages and dead letter queues',
        body: 'Suppose a producer sends a malformed message that makes every consumer crash. It is never acknowledged, so it’s redelivered, crashes the next consumer, and so on forever — a **poison message**. If the broker keeps strict order, nothing behind it ever gets processed.\n\nThe fix is a **dead letter queue (DLQ)**: after a few failed attempts the message is moved to a separate queue, just as the post office sends undeliverable mail to its dead letter office. The DLQ is monitored — anything in it is a problem — and a person decides whether to drop it, fix and resend it, or fix the consumer.',
      },
      {
        kind: 'widget',
        widget: 'redelivery',
        title: 'Crashes, redelivery and dead letters',
        body: 'First run “a consumer crashes” and compare the order messages were sent with the order they were processed. Then run “a malformed message” to see why a dead letter queue is needed.',
      },
      {
        kind: 'check',
        question: 'A consumer finishes processing a message, but its acknowledgment is lost on the network. What does the broker do, and what must be true of the consumer for that to be harmless?',
        answer: 'The broker assumes the message wasn’t processed and redelivers it, so it’s processed twice. That’s harmless only if processing is idempotent (or duplicates are detected some other way).',
      },
    ],
    takeaways: [
      'Two questions classify messaging systems: what happens under overload (drop, buffer, backpressure) and what happens on crashes (durability).',
      'Direct messaging is fast but assumes both sides are online.',
      'A message broker is a database tuned for messages; traditional brokers delete messages once acknowledged.',
      'Load balancing shares work; fan-out copies every message; consumer groups combine both.',
      'Lost acknowledgments cause duplicates; redelivery with load balancing reorders messages.',
      'Poison messages go to a dead letter queue so the rest can proceed.',
    ],
  },

  // ── 3 ─────────────────────────────────────────────────────────────────
  {
    sectionId: 'log-brokers',
    intro:
      'Traditional brokers treat messages as passing notes: once read, they’re thrown away. **Log-based brokers** such as Apache Kafka keep every message on disk like a database, yet still notify consumers quickly. This one design choice changes almost everything about how consumers work.',
    blocks: [
      {
        kind: 'analogy',
        body: 'A traditional broker is like a letterbox: once you take a letter out, it’s gone, and nobody else can read it. A log-based broker is like a newspaper archive: every issue stays on the shelf, any number of readers can read it, and each reader keeps their own **bookmark** showing how far they’ve got.',
      },
      {
        kind: 'text',
        title: 'Using a log to hold messages',
        body: 'A **log** is a file you only ever add to at the end — like a diary. To send a message, a producer appends it to the end of the log. A consumer reads the log from start to end, and when it reaches the end it waits to be told that something new was added.\n\nOne disk can only go so fast, so the log is split into **partitions** (also called shards), each stored on a different machine and read and written independently — like a supermarket opening several checkout lanes. A topic is then a group of partitions that all carry the same kind of message. Kafka and Amazon Kinesis work this way, reaching millions of messages per second while still keeping everything on disk, replicated for safety.',
      },
      {
        kind: 'text',
        title: 'Offsets and ordering',
        body: 'Inside a partition, every message gets the next number in sequence: its **offset** — like the numbered tickets at a deli counter. Because a partition is append-only, its messages have one clear order. But there is **no order between different partitions**.\n\nSo anything that must stay in order has to go to the same partition. You do that with a **partition key**: the producer runs the key (say, the customer id) through a **hash function** — a formula that turns any text into a number, always the same number for the same text — and divides by the number of partitions; the remainder picks the partition. Every event for customer 42 then lands in the same partition, in order.',
      },
      {
        kind: 'diagram',
        title: 'A topic with three partitions',
        art: art(`
            offset:  0    1    2    3    4    5
partition 0:        [a1] [c1] [a2] [c2] [a3]       ← appended here
partition 1:        [b1] [d1] [b2]
partition 2:        [e1] [f1] [e2] [f2] [e3] [f3]

key "a" always hashes to partition 0, so a1 → a2 → a3 stay in order.
There is no order between a2 (partition 0) and b2 (partition 1).`),
      },
      {
        kind: 'widget',
        widget: 'partition-order',
        title: 'Why the partition key matters',
        body: 'Two consumers read two partitions at different speeds. With the order id as the key, each order’s events stay together and in order. Without a key, watch an order’s status go backwards.',
      },
      {
        kind: 'text',
        title: 'Sharing the work: consumer groups',
        body: 'Fan-out is free: reading doesn’t delete anything, so any number of consumers can read the same log independently. For load balancing, the broker hands **whole partitions** to the members of a consumer group, and each member reads its partitions in order, one message at a time. Two consequences:\n- A group can use at most as many consumers as there are partitions. Extra consumers sit idle.\n- One slow message holds up everything behind it in that partition — **head-of-line blocking**, like a single-lane road stuck behind a tractor.\n\nWhen consumers join, leave or crash, the group redistributes partitions among the remaining members. This reshuffle is called a **rebalance**.',
      },
      {
        kind: 'widget',
        widget: 'hol-blocking',
        title: 'Head-of-line blocking',
        body: 'One message takes 4 s, the rest 1 s. Compare a log, where each consumer owns a partition, with a shared queue.',
      },
      {
        kind: 'table',
        title: 'Which kind of broker?',
        head: ['', 'Traditional queue (AMQP/JMS)', 'Log-based (Kafka-style)'],
        rows: [
          ['Best for', 'Expensive, independent tasks where order doesn’t matter', 'High volumes of quick messages where order matters'],
          ['Work is shared by', 'Individual messages', 'Whole partitions'],
          ['After reading', 'Message is deleted', 'Message stays; only the bookmark moves'],
          ['Order', 'Can change with redelivery', 'Kept within each partition'],
        ],
      },
      {
        kind: 'text',
        body: 'The line is blurring: Kafka now also offers queue-style groups where several consumers share one partition.',
      },
      {
        kind: 'text',
        title: 'Consumer offsets: the bookmark',
        body: 'Because each consumer reads its partitions in order, the broker doesn’t need to track every single message. It only needs each group’s **consumer offset** — the bookmark: everything before it has been processed, everything after hasn’t. Consumers save their bookmark every so often; this is called **committing** the offset. Tracking one number instead of acknowledging every message is a big reason logs are so fast.\n\nThe catch: if a consumer crashes, whoever takes over its partitions starts from the last **committed** offset, not from where the crashed consumer really was. Messages processed after the last commit are processed **again**. This is **at-least-once** delivery: nothing is lost, but some things happen twice.\n\nThis is the same idea as database replication, where a follower remembers the position in the leader’s log it has reached, so it can reconnect without skipping anything.',
      },
      {
        kind: 'widget',
        widget: 'broker-mini',
        title: 'A tiny Kafka',
        body: 'Produce a few messages and watch their keys pick partitions. Let the billing group read a few (it commits after every 3), then **crash c2** between commits and step through the rebalance — look for the messages processed twice. Then add the “audit” group: it reads everything independently.',
      },
      {
        kind: 'text',
        title: 'Disk space and retention',
        body: 'Appending forever would fill the disk, so the log is stored in chunks called **segments**, and old segments are deleted (or moved to cheaper storage) after a while. This is **retention**. In effect the log is a huge buffer of fixed size that throws away its oldest contents when full — a **circular buffer**, like a security camera that records over the oldest footage.\n\nBecause it lives on disk, that buffer is big. A rough estimate: a large hard drive filled at full speed takes about a day to fill, and real systems rarely write at full speed, so a log typically holds days or weeks of messages. Some brokers now keep older messages in cloud object storage (**tiered storage**), making the buffer bigger still.',
      },
      {
        kind: 'text',
        title: 'When a consumer falls behind',
        body: 'How far a consumer is behind the end of the log is its **consumer lag**. If a consumer lags so far that the messages it needs have already been deleted, it misses them for good. Because the buffer is large, there’s usually plenty of time for a person to notice — as long as you **monitor lag and alert** on it.\n\nA nice property: a slow or broken consumer only hurts itself. Others carry on, and a stopped consumer costs nothing but its saved bookmark. That makes it safe to point experimental or test consumers at a production log. (Traditional brokers are different: a forgotten queue keeps filling up and eats the broker’s memory.)',
      },
      {
        kind: 'widget',
        widget: 'retention',
        title: 'Retention and consumer lag',
        body: 'The log keeps only its newest 5 messages. Step through and watch the slow consumer’s lag grow, the alert fire, and finally a message disappear before it is read.',
      },
      {
        kind: 'text',
        title: 'Replaying old messages',
        body: 'Reading a log changes nothing except the consumer’s own bookmark, and you control that bookmark. So you can move it backwards and **replay**: process yesterday’s messages again, perhaps with fixed code, writing the results somewhere new — like rewinding a recording. This makes streams behave like batch jobs on immutable input: you can experiment and recover from bugs without fear of damaging the input.',
      },
      {
        kind: 'try',
        labId: 'broker',
        body: 'Change the number of partitions, consumers, commit interval and retention, and predict what happens before you run each challenge.',
      },
      {
        kind: 'pitfall',
        body: 'Moving a group’s bookmark to the **end** of the log (“latest”) is not a harmless reset — it skips every message the group hadn’t processed yet. Do it only deliberately, never automatically on restart or rebalance.',
      },
      {
        kind: 'check',
        question: 'A topic has 4 partitions and a consumer group has 6 consumers. A consumer commits after every 10 messages and crashes after processing 7 since its last commit. What happens?',
        answer: 'Only 4 consumers get partitions; 2 are idle. After the crash, a rebalance gives its partitions to others, who start from the last committed offset — so those 7 messages are processed again (at-least-once).',
      },
    ],
    takeaways: [
      'A log-based broker appends messages to a durable log; reading never deletes.',
      'Topics are split into partitions; offsets order messages within a partition only — use a partition key for anything that must stay in order.',
      'Groups share whole partitions: parallelism is capped by the partition count, and a slow message blocks its partition.',
      'Consumers commit offsets; after a crash, work resumes from the last commit, so some messages are processed twice (at-least-once).',
      'Retention makes the log a big but bounded buffer — monitor consumer lag.',
      'Moving the offset back replays old messages; moving it to the end skips them.',
    ],
  },

  // ── 4 ─────────────────────────────────────────────────────────────────
  {
    sectionId: 'cdc',
    intro:
      'Real applications keep the same data in several places: a database, a cache, a search index, a data warehouse. This lesson is about keeping those copies in agreement — and why the obvious approach quietly fails.',
    blocks: [
      {
        kind: 'text',
        title: 'Every database write is an event',
        body: 'Brokers borrowed ideas from databases; databases can borrow from streams too. One approach, **event sourcing**, stores every change as an immutable event in an append-only log and treats that log as the truth — like a bank keeping the full list of transactions rather than just the balance. But even an ordinary database is full of events: every write is one.\n\nIn fact, databases already use a stream internally. In **replication**, one machine (the **leader**) writes each change to a **replication log**, and other machines (**followers**) apply the same changes in the same order, ending up with identical copies — like students copying down exactly what the teacher dictates. The rule behind it: if everyone starts the same and applies the same steps in the same order, everyone ends the same, like cooks following the same recipe.',
      },
      {
        kind: 'text',
        title: 'Many copies of the same data',
        body: 'No single tool does everything, so a typical application combines several, each holding its own copy of the data in its own shape. One of them is the **system of record** — the source of truth — and the others hold **derived data**: copies you could rebuild from the source if lost. When the source changes, every copy must change too.\n\nWarehouses are often refreshed by copying everything in a big batch job. When that’s too slow, many teams use **dual writes**: the application writes each change to every system itself — first the database, then the search index, then the cache.',
      },
      {
        kind: 'analogy',
        body: 'Dual writes are like copying every change by hand into two separate notebooks. Usually both match — but if two people are writing at once, or you’re interrupted halfway, the notebooks drift apart, and nothing tells you they disagree.',
      },
      {
        kind: 'text',
        title: 'What goes wrong with dual writes',
        body: '- **A race.** A **race condition** is a bug that depends on unlucky timing. Two clients update the same item at the same moment: one sets A, the other sets B. The database receives A then B (ending at B); the search index receives B then A (ending at A). Both writes “succeeded”, yet the two systems now disagree — permanently — and no error was raised.\n- **A partial failure.** The database write succeeds, then the index write fails or the application crashes. Making both succeed or fail together is the **atomic commit** problem, which is expensive to solve across different systems.\n\nThe root cause: there is no single leader deciding the order. Each system orders the writes it receives by itself.',
      },
      {
        kind: 'widget',
        widget: 'dual-writes',
        title: 'Dual writes vs change data capture',
        body: 'Run the race and the partial failure first. Then switch to change data capture (explained next) and run the same two clients.',
      },
      {
        kind: 'text',
        title: 'Change data capture',
        body: 'The fix is to make the database the one leader and the other systems its followers. **Change data capture (CDC)** observes every change written to a database and publishes it as a stream, in the order the database committed it — like a court stenographer’s transcript of everything said, in order. A search index consumes that stream and applies the same changes in the same order, so it ends up matching the database. Need another copy, such as a warehouse? Add another consumer.\n\nA log-based broker is the natural way to carry the stream, because it keeps messages in order. Tools such as **Debezium** read the internal replication logs of MySQL, PostgreSQL, Oracle, SQL Server and others and publish the changes in a standard format; **Kafka Connect** offers similar connectors. Most databases and cloud services now offer **change streams** as an official feature.\n\nCDC is usually **asynchronous**: the database doesn’t wait for consumers before committing. A slow consumer therefore can’t slow the database down, but derived copies lag slightly behind — the same lag issues as any follower replica.',
      },
      {
        kind: 'diagram',
        title: 'One leader, many followers',
        art: art(`
 app ──writes──▶ database (system of record)
                    │  change stream, in commit order
                    ▼
               log-based broker
             ┌──────┼───────────┐
             ▼      ▼           ▼
       search index  cache   data warehouse   (derived data)`),
      },
      {
        kind: 'text',
        title: 'Starting a new copy: the initial snapshot',
        body: 'If the change log went back to the very beginning, a new consumer could simply replay all of it. Usually it doesn’t — it would be too big — so a new search index can’t be built from recent changes alone: it would miss everything that hasn’t changed lately. Instead you take a **snapshot**: a consistent copy of the whole database at one moment, like a photo. Crucially, the snapshot must be tied to a known position in the change log, so you know exactly where to start applying changes afterwards. Some CDC tools do this for you.',
      },
      {
        kind: 'widget',
        widget: 'cdc-snapshot',
        title: 'Snapshot plus change log',
        body: 'Changes keep happening while the snapshot is copied. Run both versions and look for the changes that fall into the gap.',
      },
      {
        kind: 'text',
        title: 'Log compaction',
        body: '**Log compaction** offers an alternative. In the background, the broker goes through the log and, for each key, throws away all but the most recent record — like a folder where you keep only the latest version of each document. A **tombstone** (a special “this key was deleted” record) makes the key disappear entirely.\n\nThe compacted log’s size now depends on how much data currently exists, not on how many changes ever happened. And it always contains the latest value for every key — so a brand-new consumer can start at offset 0, read to the end, and have a full copy of the database without a separate snapshot. Kafka supports this, which lets the broker act as durable storage, not just a pipe.',
      },
      {
        kind: 'widget',
        widget: 'log-compaction',
        title: 'Compacting a topic',
        body: 'Step through compaction of a stock-level topic. Notice that offsets never change — compaction just leaves gaps — and that a tombstone removes its key completely.',
      },
      {
        kind: 'table',
        title: 'CDC versus event sourcing',
        head: ['', 'Change data capture', 'Event sourcing'],
        rows: [
          ['The application…', 'Uses a normal database, updating and deleting freely', 'Is built around immutable events in an event log'],
          ['Events describe', 'Low-level changes: the new version of a row', 'What happened at the business level: “seat changed by agent”'],
          ['Ordering', 'Taken from the database, so it matches reality', 'Defined by the event log'],
          ['Log compaction', 'Works: the latest event per key is the whole current row', 'Doesn’t: later events build on earlier ones, so you need all of them'],
          ['Adopting it', 'Can be added to an existing app with little change', 'A big redesign'],
        ],
      },
      {
        kind: 'text',
        title: 'CDC turns your schema into a public API',
        body: 'In a microservices setup, a database normally belongs to one service; others go through that service’s API, so the team can reshape its tables freely. CDC breaks that: consumers see the raw table **schema** (the list of columns and their types), so renaming or dropping a column can break other teams’ services — even cause an outage. Teams often agree **data contracts** to prevent this.\n\nA common fix is the **outbox pattern**. Alongside its real tables, the service keeps an **outbox** table with its own stable schema and writes an event into it **in the same transaction** as the real change. Only the outbox is exposed through CDC. It looks like a dual write, but both writes go to the same database in one transaction, so they succeed or fail together. The costs: maintaining the translation into the outbox format, and some extra write load on the database.',
      },
      {
        kind: 'analogy',
        body: 'The outbox is like the out-tray on a clerk’s desk. When the clerk files a form, they drop a summary note into the out-tray in the same movement. A courier empties the tray regularly. Outsiders only ever see the notes, never the messy filing cabinet — and a note can’t exist without the filing having happened.',
      },
      {
        kind: 'widget',
        widget: 'outbox',
        title: 'The outbox pattern',
        body: 'First let CDC publish the orders table directly and rename a column. Then try the outbox, and finally crash the service mid-transaction.',
      },
      {
        kind: 'check',
        question: 'Why does CDC avoid the race that dual writes suffer from?',
        answer: 'Only the database is written to, so it alone decides the order of writes. Every derived system applies its change log in that same order, so they can lag but can’t end up disagreeing.',
      },
    ],
    takeaways: [
      'Dual writes can race (systems silently disagree) and can partially fail.',
      'CDC makes the database the single leader: derived systems apply its change log in commit order, with some lag.',
      'A new derived system needs a snapshot tied to a log position — or a log-compacted topic.',
      'Log compaction keeps the newest value per key; tombstones delete keys; replaying from offset 0 rebuilds everything.',
      'CDC exposes your schema; an outbox written in the same transaction keeps internal tables private.',
      'Event sourcing records business-level intent and needs the full history; CDC extracts row-level changes from a normal database.',
    ],
  },
];
