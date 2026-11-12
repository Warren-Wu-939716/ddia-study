import type { Problem } from '../types.ts';

/** End-of-lesson problems for lessons 1–4: they ask you to apply ideas to new situations, not repeat definitions. */
export const messagingProblems: Problem[] = [
  // ── 1 · Events, producers and topics ─────────────────────────────────
  {
    id: 'p12.intro.1',
    sectionId: 'streams-intro',
    skill: 'calculate',
    kind: 'numeric',
    prompt: 'A nightly batch job starts at midnight and takes 2 hours to finish. An order is placed at 21:30. How many hours pass between the order being placed and it first appearing in the report?',
    answer: 4.5,
    tolerance: 0.01,
    unit: 'hours',
    explanation:
      'The order waits on the pile from 21:30 until the job starts at 00:00 (2.5 h), and only shows up once the job finishes at 02:00 (2 more hours): **4.5 hours**. An order placed at 00:01 would wait about 26 hours. Batch latency is the wait until the next run **plus** the run time.',
  },
  {
    id: 'p12.intro.2',
    sectionId: 'streams-intro',
    skill: 'calculate',
    kind: 'numeric',
    prompt: 'A consumer polls a database table every 10 seconds. New events arrive at random moments. On average, how many seconds does an event sit in the table before the consumer notices it?',
    answer: 5,
    tolerance: 0.01,
    unit: 's',
    explanation:
      'An event is equally likely to land anywhere in the 10-second gap between two checks, so on average it waits half the interval: **5 s** (worst case 10 s). Halving the wait means doubling the number of checks — and most of those checks find nothing. That is why streaming systems notify consumers instead.',
  },
  {
    id: 'p12.intro.3',
    sectionId: 'streams-intro',
    skill: 'predict',
    kind: 'choice',
    prompt: 'Three consumers — emails, search and fraud checks — subscribe to the topic “orders”. The checkout service publishes one “order placed” event. What happens?',
    options: [
      { text: 'The producer sends the event three times, once per consumer.', why: 'The producer sends once, to the topic; it doesn’t even know who the consumers are.' },
      { text: 'The event is sent once to the topic, and each of the three consumers receives it.', correct: true, why: 'Publish once, deliver to every subscriber: that independence is the point of a topic.' },
      { text: 'Only one of the three consumers receives it, chosen at random.', why: 'That is load balancing **within** one group of identical workers. Three different jobs each need their own copy.' },
      { text: 'The topic stores three copies so each consumer can delete its own.', why: 'The event is recorded once; delivering it to several consumers doesn’t require copies per consumer.' },
    ],
    explanation: 'A producer writes an event once; any number of consumers can process it. Adding a fourth consumer later changes nothing on the producer’s side.',
  },
  {
    id: 'p12.intro.4',
    sectionId: 'streams-intro',
    skill: 'design',
    kind: 'justify',
    prompt: 'A food-delivery app wants each restaurant’s dashboard to show a live count of orders received in the last hour. Orders are already written to a database.',
    options: [
      { text: 'Have each dashboard query the orders table every second.', why: 'It works at small scale, but thousands of dashboards polling every second mostly get “nothing new” back.' },
      { text: 'Publish each order as an event and let the dashboard service subscribe to them.', correct: true, why: 'Each order is pushed to the dashboard service as it happens.' },
      { text: 'Run a batch job every night that computes the counts.', why: 'A nightly count is up to a day old — useless for a “live” view.' },
    ],
    reasons: [
      { text: 'Being notified delivers each order immediately without the wasted empty checks that fast polling needs.', correct: true, why: 'This is the trade-off: polling more often lowers delay but raises wasted work; notification gets both low delay and no waste.' },
      { text: 'Databases cannot store orders fast enough for a live count.', why: 'The database stores them fine — the problem is how consumers find out about new ones.' },
      { text: 'Streams are always more accurate than databases.', why: 'Accuracy isn’t the issue; both hold the same orders. The issue is delay and wasted work.' },
    ],
    explanation: 'Live views need low delay. Polling buys low delay with lots of empty queries; subscribing to events gets low delay for free. Batches are efficient but always behind.',
  },
  {
    id: 'p12.intro.5',
    sectionId: 'streams-intro',
    skill: 'explain',
    kind: 'explain',
    prompt: 'Events are treated as immutable. Suppose producers **were** allowed to edit an event after sending it. What would go wrong for the consumers?',
    keyPoints: [
      'Some consumers may already have processed the old version, so their results would be based on data that no longer exists',
      'Different consumers could see different versions depending on when they read it, so they would disagree',
      'There is no natural way to tell every consumer “that thing you read earlier has changed” — that would itself be a new event',
      'The history of what happened is lost; a correction should be a new event, not an edit',
    ],
    explanation:
      'An event is a record that something happened, and many consumers act on it independently and at different times. If it could change afterwards, consumers that already processed it would hold results based on the old version, and consumers reading later would see the new one — they would silently disagree. Telling everyone about the change would require… a new event. So corrections are made by publishing a **new** event (like a refund after a wrong charge), which keeps the full history and keeps every consumer consistent.',
  },

  // ── 2 · Messaging systems and traditional brokers ────────────────────
  {
    id: 'p12.messaging.1',
    sectionId: 'messaging',
    skill: 'design',
    kind: 'justify',
    prompt: 'Factory sensors each send a temperature reading every 10 seconds. During busy periods, the consumer that stores readings falls behind. What should happen to readings it can’t keep up with?',
    options: [
      { text: 'Drop them.', correct: true, why: 'A fresh reading for the same sensor arrives within seconds anyway.' },
      { text: 'Buffer them in a queue that grows as needed.', why: 'Nothing is lost, but the queue keeps growing while the consumer is behind, and stale readings get processed late.' },
      { text: 'Apply backpressure so the sensors stop sending.', why: 'Blocking sensors means current readings aren’t taken at all — the opposite of what you want.' },
    ],
    reasons: [
      { text: 'Each reading is soon replaced by a newer one, so losing an occasional one costs little, while queuing or blocking costs more.', correct: true, why: 'The value of a reading decays fast; the newest one matters most.' },
      { text: 'Dropping is always the fastest option, so it is always the right one.', why: 'For payments or orders, dropping would be unacceptable. It depends on the data.' },
      { text: 'Queues can never run out of space.', why: 'They can: memory fills, then disk. Unbounded buffering only postpones the problem.' },
    ],
    explanation: 'The right overload policy depends on what a lost message costs. Replaceable measurements: drop. Orders or payments: buffer durably or apply backpressure.',
  },
  {
    id: 'p12.messaging.2',
    sectionId: 'messaging',
    skill: 'calculate',
    kind: 'numeric',
    prompt: 'A producer sends 500 messages per second; the consumer handles 400 per second. The broker can buffer 60,000 messages. Starting empty, after how many seconds is the buffer full?',
    answer: 600,
    unit: 's',
    explanation:
      'The backlog grows by 500 − 400 = **100 messages per second**, so 60,000 / 100 = **600 s** (10 minutes). After that the system must drop messages or push back on the producer. Buffering only buys time when the producer is **persistently** faster.',
  },
  {
    id: 'p12.messaging.3',
    sectionId: 'messaging',
    skill: 'predict',
    kind: 'choice',
    prompt:
      'Two consumers, C1 and C2, share one queue (load balancing). Messages m1–m4 are sent in that order. C2 takes m2 and crashes before acknowledging it; meanwhile C1 handles m1, m3 and m4. What happens next?',
    options: [
      { text: 'm2 is lost, because C2 took it off the queue.', why: 'Unacknowledged messages aren’t deleted; that’s the whole point of acknowledgments.' },
      { text: 'The broker redelivers m2 to C1, so C1 processes m1, m3, m4, m2.', correct: true, why: 'No acknowledgment → redelivery to a live consumer. With load balancing it lands after later messages.' },
      { text: 'The broker held back m3 and m4 until m2 was acknowledged, so the order stays m1–m4.', why: 'Traditional brokers hand out messages independently; they don’t block the rest of the queue on one unacknowledged message.' },
      { text: 'm2 is processed twice by C2 after it restarts.', why: 'It will be processed again — but by whichever consumer gets the redelivery, here C1. C2 is down.' },
    ],
    explanation: 'Acknowledgments prevent loss, and redelivery plus load balancing can reorder messages. If order matters, a shared queue is the wrong tool.',
  },
  {
    id: 'p12.messaging.4',
    sectionId: 'messaging',
    skill: 'diagnose',
    kind: 'choice',
    prompt:
      'A consumer sends a receipt email for each order. Customers occasionally get two identical receipts. You have verified that each order event was published exactly once. When the email provider is slow, a send can take longer than the broker’s 30-second acknowledgment timeout. What is the most likely cause?',
    options: [
      { text: 'The email was sent, but the acknowledgment came too late, so the broker redelivered the message and it was sent again.', correct: true, why: 'Work done + acknowledgment missing = redelivery = duplicate effect.' },
      { text: 'The producer published duplicates.', why: 'Ruled out in the question: each event was published once.' },
      { text: 'The broker lost the message and the consumer retried.', why: 'A lost message would mean **no** receipt, not two.' },
      { text: 'Two consumer groups both send receipts.', why: 'Possible in general, but then **every** order would get two receipts, not only the slow ones.' },
    ],
    explanation:
      'Only some orders are duplicated, and they correlate with slow sends: classic redelivery after a missed acknowledgment. Fixes: make the send **idempotent** (record which order ids already got a receipt and skip repeats), and/or lengthen the timeout.',
  },
  {
    id: 'p12.messaging.5',
    sectionId: 'messaging',
    skill: 'diagnose',
    kind: 'multi',
    prompt: 'A malformed message makes every consumer that reads it crash. Which statements are true?',
    options: [
      { text: 'Without a dead letter queue, it can be redelivered and crash consumers forever.', correct: true, why: 'Never acknowledged → redelivered → crash → repeat.' },
      { text: 'If the broker delivers strictly in order, messages behind it stop being processed.', correct: true, why: 'Strict ordering means nothing can overtake the poison message.' },
      { text: 'Adding more consumers fixes the problem.', why: 'Each new consumer crashes on it too.' },
      { text: 'After a few failed attempts it should be moved aside for a person to inspect.', correct: true, why: 'That is exactly what a dead letter queue is for.' },
      { text: 'Acknowledging every message before processing it is a safe fix.', why: 'It stops the loop, but any real crash would now lose good messages: you’ve traded duplicates for silent loss.' },
    ],
    explanation: 'A poison message is a bug in data or code, not a capacity problem. Park it in a monitored dead letter queue so the rest of the queue keeps flowing.',
  },
  {
    id: 'p12.messaging.6',
    sectionId: 'messaging',
    skill: 'design',
    kind: 'explain',
    prompt:
      'An “orders” topic must feed an email service (3 identical instances) and an analytics service (2 identical instances). Every order must be emailed exactly once and counted exactly once. How do you set up delivery, and why does it work?',
    keyPoints: [
      'Put the email instances in one consumer group and the analytics instances in another',
      'Within a group, messages are load-balanced, so each order goes to only one email instance (and one analytics instance)',
      'Across groups, delivery is fan-out, so both services get every order',
      'Adding instances to a group adds capacity without causing duplicates',
    ],
    explanation:
      'Use **two consumer groups**: “email” (3 instances) and “analytics” (2 instances). Inside a group, messages are **load-balanced**, so each order is handled by just one email instance and one analytics instance. Between groups, delivery is **fan-out**, so each service sees every order. Scaling a service means adding instances to its group — the work is shared, not duplicated.',
  },

  // ── 3 · Log-based message brokers ────────────────────────────────────
  {
    id: 'p12.logs.1',
    sectionId: 'log-brokers',
    skill: 'calculate',
    kind: 'numeric',
    prompt:
      'A topic has 6 partitions and a consumer group has 8 consumers. Then 3 of the consumers crash and the group rebalances. After the rebalance, how many partitions does the busiest consumer own?',
    answer: 2,
    unit: 'partitions',
    explanation:
      'Before the crash only 6 consumers had work (one partition each) and 2 were idle. After 3 crash, 5 remain for 6 partitions, so one consumer must take **2**. Partitions — not consumers — cap a group’s parallelism.',
  },
  {
    id: 'p12.logs.2',
    sectionId: 'log-brokers',
    skill: 'calculate',
    kind: 'numeric',
    prompt:
      'A consumer’s last committed offset for its partition is 1,200 (meaning: everything before 1,200 is done). It keeps processing and crashes right after finishing offset 1,236. Its replacement starts from the committed offset. How many messages are processed twice?',
    answer: 37,
    unit: 'messages',
    explanation:
      'The replacement starts at 1,200 and redoes 1,200 through 1,236 inclusive: 1,236 − 1,200 + 1 = **37** messages. Committing more often shrinks this number but costs more commits; it never reaches zero without extra machinery (at-least-once delivery).',
  },
  {
    id: 'p12.logs.3',
    sectionId: 'log-brokers',
    skill: 'predict',
    kind: 'choice',
    prompt:
      'User u42 logs in, adds an item to their cart, then checks out. The producer publishes these three events with **no key**, spreading them across 3 partitions, and three consumers process the partitions in parallel. What is guaranteed about the order in which u42’s events are processed?',
    options: [
      { text: 'They are processed in order, because offsets always increase.', why: 'Offsets only order messages **within** one partition. These went to different partitions.' },
      { text: 'They are processed in order, because they were sent in order.', why: 'Send order is kept within a partition only; consumers of different partitions run at their own pace.' },
      { text: 'Nothing: “checkout” may be processed before “login”. Using the user id as the key would fix it.', correct: true, why: 'Same key → same partition → one consumer → in order.' },
      { text: 'The broker sorts all partitions by timestamp before delivering.', why: 'Log-based brokers don’t merge or sort across partitions.' },
    ],
    explanation: 'There is no ordering between partitions. Anything that must stay in order must share a partition key.',
  },
  {
    id: 'p12.logs.4',
    sectionId: 'log-brokers',
    skill: 'design',
    kind: 'justify',
    prompt: 'You need to process uploaded images: each resize job takes between 2 and 30 seconds, jobs are independent, and order doesn’t matter. Which broker style fits better?',
    options: [
      { text: 'A traditional queue (AMQP/JMS style).', correct: true, why: 'Work is handed out one message at a time to whoever is free.' },
      { text: 'A log-based broker (Kafka style).', why: 'It would work, but its strengths (order, replay) aren’t needed, and its weakness (one consumer per partition) hurts here.' },
    ],
    reasons: [
      { text: 'A slow 30-second job won’t hold up the jobs behind it, and you can add workers beyond any partition count.', correct: true, why: 'Avoids head-of-line blocking and the partition cap on parallelism.' },
      { text: 'Log-based brokers can’t store large messages like images.', why: 'You’d store the image elsewhere and send a reference either way; it isn’t the deciding factor.' },
      { text: 'Traditional queues guarantee that jobs finish in the order they were sent.', why: 'They don’t — redelivery and load balancing reorder work. Here that’s fine because order doesn’t matter.' },
    ],
    explanation: 'Expensive, independent tasks → traditional queue. High-volume, quick, order-sensitive messages that may need replay → log-based broker.',
  },
  {
    id: 'p12.logs.5',
    sectionId: 'log-brokers',
    skill: 'predict',
    kind: 'choice',
    prompt: 'A consumer group was paused for two weeks during an investigation. The topic keeps messages for 7 days. When the group restarts from its committed offset, what happens?',
    options: [
      { text: 'It reads every message since it paused, because offsets are permanent.', why: 'Offsets are permanent labels, but the messages behind them are deleted by retention.' },
      { text: 'It has lost roughly a week of messages: they were deleted before it got to them.', correct: true, why: 'Its bookmark points into a part of the log that no longer exists.' },
      { text: 'Nothing is lost, because the broker keeps messages until every group has read them.', why: 'That isn’t how retention works in a log; deletion is by age or size, regardless of readers.' },
      { text: 'Every other consumer group on the topic loses the same messages.', why: 'Other groups that kept up already read them; each group has its own bookmark.' },
    ],
    explanation: 'The log is a big but bounded buffer. A consumer that falls further behind than retention silently loses messages — so monitor consumer lag and alert long before that point.',
  },
  {
    id: 'p12.logs.6',
    sectionId: 'log-brokers',
    skill: 'sequence',
    kind: 'order',
    prompt: 'Put these events in the order they happen when a consumer crashes between commits.',
    steps: [
      'c2 processes messages from its partition; its last commit was at offset 40',
      'c2 crashes',
      'The group notices c2 is gone',
      'The group rebalances, giving c2’s partition to another consumer',
      'The new owner starts reading from the committed offset, 40',
      'Messages c2 already handled after offset 40 are processed a second time',
    ],
    explanation: 'The bookmark only moves when it is committed. Everything processed after the last commit is redone by the next owner — at-least-once delivery.',
  },

  // ── 4 · Change data capture ──────────────────────────────────────────
  {
    id: 'p12.cdc.1',
    sectionId: 'cdc',
    skill: 'predict',
    kind: 'choice',
    prompt:
      'With dual writes, the app writes every change first to the database and then to the search index. Two requests change a product’s price at the same moment: A sets £10, B sets £12. The database receives A then B; the search index receives B then A. What is the end state?',
    options: [
      { text: 'Both show £12, because B was the last write to finish.', why: 'Each system orders writes by itself; there is no shared “last”.' },
      { text: 'Database £12, search index £10 — and they stay that way, with no error reported.', correct: true, why: 'Each system keeps its own last write. Both writes “succeeded”, so nothing complains.' },
      { text: 'The search index rejects A because it is older.', why: 'The index has no idea which write is older; it just applies what arrives.' },
      { text: 'Both show £10.', why: 'The database received B last, so it holds £12.' },
    ],
    explanation: 'Dual writes have no single leader deciding the order, so concurrent writes can leave systems permanently and silently different.',
  },
  {
    id: 'p12.cdc.2',
    sectionId: 'cdc',
    skill: 'design',
    kind: 'justify',
    prompt: 'A Postgres orders database must be mirrored into a search index, a cache and a data warehouse, all within seconds. How should the copies be kept in sync?',
    options: [
      { text: 'The application writes each change to all four systems (dual writes).', why: 'Races and partial failures can leave copies permanently wrong.' },
      { text: 'Capture the database’s changes (CDC) into a log-based broker; each copy consumes them.', correct: true, why: 'The database becomes the single leader; every copy follows its log.' },
      { text: 'Copy the whole database to each system every night.', why: 'Too slow for “within seconds”.' },
    ],
    reasons: [
      { text: 'All copies apply the same changes in the database’s commit order, so they can lag but never permanently disagree.', correct: true, why: 'Same start + same changes in the same order = same result.' },
      { text: 'CDC is synchronous, so the copies are never behind the database.', why: 'CDC is usually asynchronous: copies lag slightly. The win is agreement, not zero lag.' },
      { text: 'CDC removes the need for a message broker.', why: 'It typically **uses** a log-based broker to carry the change stream in order.' },
    ],
    explanation: 'CDC turns the database’s own ordering into the ordering for every derived system. Derived copies behave like follower replicas: eventually identical, slightly behind.',
  },
  {
    id: 'p12.cdc.3',
    sectionId: 'cdc',
    skill: 'sequence',
    kind: 'order',
    prompt: 'Order the steps for building a brand-new search index from a live database whose change log no longer goes back to the beginning.',
    steps: [
      'Start a consistent snapshot of the database and record the change-log position it corresponds to',
      'Copy the snapshot into the new index while the database keeps changing',
      'Start reading the change log from the recorded position',
      'Apply the changes that happened during the copy',
      'Keep applying new changes as they arrive',
    ],
    explanation: 'The recorded log position is what connects the snapshot to the stream. Without it you can’t know where to start, and changes made during the copy are either missed or applied twice.',
  },
  {
    id: 'p12.cdc.4',
    sectionId: 'cdc',
    skill: 'predict',
    kind: 'multi',
    prompt: 'A log-compacted topic holds stock levels keyed by product id. Which statements are true?',
    options: [
      { text: 'A new consumer reading from offset 0 to the end ends up with the current stock of every product.', correct: true, why: 'Compaction keeps the latest value for every key.' },
      { text: 'After compaction, the remaining messages are renumbered so offsets have no gaps.', why: 'Offsets never change; compaction leaves gaps.' },
      { text: 'To remove a discontinued product, you write a tombstone for its key.', correct: true, why: 'A tombstone tells compaction to drop the key entirely.' },
      { text: 'Compaction keeps every past stock level, so you can see each product’s full history.', why: 'It deliberately throws away all but the latest value per key.' },
      { text: 'The topic’s size depends on how many products exist, not how many updates there were.', correct: true, why: 'That is what makes it usable as durable storage.' },
    ],
    explanation: 'A compacted topic is a full, up-to-date copy of the data with the history squeezed out — enough to bootstrap new consumers without a separate snapshot.',
  },
  {
    id: 'p12.cdc.5',
    sectionId: 'cdc',
    skill: 'diagnose',
    kind: 'choice',
    prompt:
      'The orders service exposes its orders table through CDC. The shipping team’s service broke after the orders team split the `address` column into `street` and `city`. What is the best long-term fix?',
    options: [
      { text: 'Have the shipping service query the orders database directly instead.', why: 'That couples shipping to the private tables even more tightly.' },
      { text: 'Publish changes through an outbox table with a stable event format, written in the same transaction as the orders row.', correct: true, why: 'The private table can change freely; the published shape is a deliberate contract.' },
      { text: 'Switch to dual writes: save the row, then publish an event from the application code.', why: 'Stable format, but now a crash or race can leave the row and the event out of step.' },
      { text: 'Never change the orders table again.', why: 'Freezing your own schema forever is a high price for another team’s convenience.' },
    ],
    explanation: 'CDC on raw tables makes your schema a public API. The outbox pattern restores the boundary while keeping CDC’s ordering and atomicity.',
  },
  {
    id: 'p12.cdc.6',
    sectionId: 'cdc',
    skill: 'explain',
    kind: 'explain',
    prompt: 'With the outbox pattern, the service still writes two things — the real row and the outbox event. Why doesn’t that suffer from the problems of dual writes?',
    keyPoints: [
      'Both writes go to the same database in one transaction, so they both happen or neither does',
      'A crash before commit rolls back both — there is never a row without its event',
      'The database decides one order for all commits, and CDC publishes the outbox in that order',
      'Dual writes go to two separate systems, each with its own ordering and failure modes',
    ],
    explanation:
      'Dual writes go to **two different systems**, so a crash can complete one and not the other, and each system orders concurrent writes by itself. The outbox writes go to **one database in one transaction**: they commit together or roll back together, and the database puts all commits in a single order that CDC then publishes. So there is no window in which the row exists without its event, and no disagreement about order.',
  },
];
