import type { Lesson } from '../types.ts';
import { art } from '../ch04/lessons-oltp.ts';

/**
 * Lessons 5–9 of chapter 12: immutability, uses of stream processing, time, joins and fault tolerance.
 * Original explanations and examples; terms from lessons 1–4 are used as-is.
 */
export const processingLessons: Lesson[] = [
  // ── 5 ─────────────────────────────────────────────────────────────────
  {
    sectionId: 'immutability',
    intro:
      'Databases usually store the **current state** of things: today’s balance, the current cart. Streams store **what happened**. This lesson shows these are two views of the same thing — and why keeping the events is so useful.',
    blocks: [
      {
        kind: 'text',
        title: 'State is the sum of its events',
        body: 'Any state that changes got that way through a sequence of events. Your account balance is the result of every deposit and withdrawal; the seats still free on a flight are the result of every booking and cancellation.\n\nA bank statement makes this concrete: the **balance** is the state, and the list of transactions is the **changelog** — the record of how the state evolved. Add up all the transactions and you get the balance; look at how the balance changed and you get the transactions. Neither contradicts the other; they’re two sides of one coin.\n\nIf you keep the changelog safely, any state can be rebuilt from it. Treat the log as the system of record and every table, cache or index as derived from it, and the flow of data through a system becomes much easier to reason about. Seen this way, a database is just a fast way to read the latest result of the log. Log compaction sits in between: it keeps only the newest version of each record.',
      },
      {
        kind: 'text',
        title: 'Why keep immutable events?',
        body: 'Accountants have worked this way for centuries. Every transaction goes into a **ledger** that is only ever added to. A mistake is never rubbed out; instead a new **compensating** entry corrects it (a refund cancels a wrong charge), and the wrong entry stays visible for audit.\n\nSoftware benefits in the same ways:\n- **Recovering from bugs.** If buggy code overwrites data in place, the old values are gone. If it only appended bad events, you can see exactly what happened and fix it.\n- **Auditing and support.** Support staff can see the history behind a customer’s complaint.\n- **More information.** A shopper adds socks to a cart, then removes them. For shipping, that cancels out. For analytics, it’s gold: they considered socks. A table holding only the current cart forgets that; the event log remembers.',
      },
      {
        kind: 'widget',
        widget: 'ledger',
        title: 'Overwriting vs a ledger',
        body: 'A bug records a £5 coffee as £50. Fix it once in an overwritten table and once in an append-only ledger, and compare what support can see.',
      },
      {
        kind: 'text',
        title: 'Many views from one log',
        body: 'Once the events are kept separately, you can derive as many **read-optimized views** as you like, each shaped for one job — a cart for checkout, a report for analytics, a search index. This split between a write-side log and read-side views is often called **CQRS** (command query responsibility segregation), like a restaurant where waiters write order tickets (the write side) and the kitchen keeps its own boards organized for cooking (the read side).\n\nIt also makes change easier. Need a new feature that shows existing data differently? Build a new view from the log, run it alongside the old one, move readers over, then switch the old one off — no risky in-place migration. And since views are rebuilt from the log, it’s fine to **denormalize** them (copy the same data into several places) for fast reads; the log keeps them consistent.',
      },
      {
        kind: 'widget',
        widget: 'event-log',
        title: 'Views derived from a cart’s events',
        body: 'Apply the events one by one and watch two views update. Then run “build a new view later” to derive a view from history that the other views had thrown away.',
      },
      {
        kind: 'text',
        title: 'Concurrency: easier and harder',
        body: '**Harder:** views are usually updated asynchronously, so a user might write something and then not see it in a view a moment later — the classic **read-your-writes** problem. Updating the view in the same step as the log would need a distributed transaction, which is usually impractical.\n\n**Easier:** much of the need for multi-record transactions comes from one user action changing several places. If an event describes the whole action on its own, recording it is a single **append** — easy to make all-or-nothing. And if the log and the state are split into shards the same way, one consumer can process each shard’s events one at a time, in order, with no locking at all: the log has already decided the order.',
      },
      {
        kind: 'widget',
        widget: 'async-view',
        title: 'Asynchronous views',
        body: 'First, change a name and read the view straight away. Then record a money transfer as one event and crash one of the views part-way.',
      },
      {
        kind: 'text',
        title: 'The limits of immutability',
        body: '- **Churn.** Data that is mostly added is easy to keep forever. Data that is updated and deleted constantly can build a history far bigger than the data itself.\n- **Legal deletion.** Privacy laws such as the GDPR can require personal data to be truly removed. Appending a “please treat as deleted” event isn’t enough; you have to rewrite history. Some systems call this **excision**.\n- **Copies everywhere.** Truly deleting data is hard: storage often writes new copies rather than overwriting, and backups are deliberately unchangeable.\n\nOne workaround is **crypto-shredding**: store sensitive data encrypted and, to “delete” it, destroy the key — like shredding the only key to a locked box instead of the box. You must decide up front which data shares a key, because you can only shred a key’s data all at once. In practice, deletion means making data very hard to recover rather than impossible.',
      },
      {
        kind: 'widget',
        widget: 'crypto-shredding',
        title: 'Deleting from immutable data',
        body: 'Try deleting user 7’s events from every copy, then try shredding their key instead.',
      },
      {
        kind: 'check',
        question: 'A buggy release wrote wrong prices for an hour. How does keeping an immutable event log make recovery easier than a database that overwrites rows?',
        answer: 'The original events are still there, so you can see exactly what the bug did, append compensating events (or fix the code and rebuild the views by replaying), instead of trying to reconstruct overwritten values.',
      },
    ],
    takeaways: [
      'Current state is the result of all events so far; the changelog records how it evolved.',
      'Keep the log as the source of truth and every view becomes reproducible.',
      'Immutable events help with auditing, bug recovery and analytics; mistakes get compensating events.',
      'Many read-optimized views can be derived from one log, and new ones built alongside old ones (CQRS).',
      'Async views break read-your-writes, but self-contained events make actions one atomic append.',
      'Real deletion needs excision or crypto-shredding.',
    ],
  },

  // ── 6 ─────────────────────────────────────────────────────────────────
  {
    sectionId: 'stream-uses',
    intro:
      'You have a stream. What can you do with it? This lesson tours the main uses of stream processing and what makes each one distinct.',
    blocks: [
      {
        kind: 'text',
        title: 'Three things to do with a stream',
        body: '1. **Store it**: write the events into a database, cache or search index so others can query them — the CDC idea from lesson 4.\n2. **Show it to people**: send alerts, emails or push notifications, or draw a live dashboard.\n3. **Turn it into other streams**: transform, filter, combine. A piece of code doing this is called an **operator** or **job**; jobs can be chained into pipelines that eventually end in option 1 or 2.\n\nA job reads its input without changing it and writes its output somewhere else — just like a batch job. The big difference is that a stream **never ends**. You can’t sort the whole input first, and if a job that has run for two years crashes, “start again from the beginning” isn’t a realistic recovery plan.',
      },
      {
        kind: 'text',
        title: 'Complex event processing',
        body: 'Monitoring was one of the first uses: spotting fraud on a credit card, reacting to price moves, catching faults on a factory line. **Complex event processing (CEP)** lets you describe a pattern of events — like a search pattern for text, but over events — and alerts you when the pattern shows up.\n\nCEP flips the usual roles. A database stores data and runs each query once. A CEP engine **stores the queries** and lets the data flow past them: every new event is checked against all the standing queries, and a match produces a new “complex event”. Think of a smoke detector: the rule is always armed, and the air simply flows past it.',
      },
      {
        kind: 'widget',
        widget: 'cep',
        title: 'A standing query',
        body: 'Step through five card payments and watch what the engine has to remember to spot the pattern.',
      },
      {
        kind: 'text',
        title: 'Stream analytics',
        body: 'Closely related, but focused on numbers rather than specific patterns:\n- how often something happens per minute;\n- a **rolling average** over the last few minutes;\n- how this hour compares with the same hour last week.\n\nThese are calculated over fixed stretches of time called **windows** (next lesson). A typical metric is the 99th **percentile** response time: the time that 99% of requests beat, which shows how the slowest users are doing.\n\nSome tools use **probabilistic algorithms** — estimates that need far less memory, like guessing a crowd’s size from a sample. That has given streaming a reputation for being approximate, but it’s only an optimization: nothing about streaming requires inexact answers. Popular frameworks include Apache Flink, Spark Streaming, Kafka Streams and Apache Beam.',
      },
      {
        kind: 'widget',
        widget: 'stream-analytics',
        title: 'A summary per minute',
        body: 'Watch each request update a tiny summary, and each minute’s result get published when the next minute begins.',
      },
      {
        kind: 'text',
        title: 'Maintaining materialized views',
        body: 'A **materialized view** is a stored copy of a query’s result, kept up to date as the underlying data changes — like a scoreboard updated after every point. Caches, search indexes and the event-sourced state from lesson 5 are all examples.\n\nUnlike analytics, this usually can’t be limited to recent events: the view depends on everything that ever happened (apart from what log compaction removed). In effect you need a window stretching back to the beginning of time.\n\nMany databases refresh materialized views by rerunning the whole query on a schedule, which is slow and leaves the view stale in between. **Incremental view maintenance (IVM)** instead works out how each change affects the result and updates only that — like updating a running total instead of recounting the whole jar of coins. Systems such as Materialize, RisingWave and Feldera are built on this.',
      },
      {
        kind: 'widget',
        widget: 'ivm',
        title: 'Re-run the query, or update incrementally?',
        body: 'Three changes hit the orders table. Compare the work each approach does to keep the view right.',
      },
      {
        kind: 'text',
        title: 'Search on streams',
        body: 'Sometimes you want to know when a single new item matches some criteria: a news-monitoring service watching for mentions of a company, or a property site that emails you when a new listing matches your saved search. As with CEP, the **queries are stored** and each new document is tested against them. With many saved queries, you can even index the queries to narrow down which ones could match.',
      },
      {
        kind: 'widget',
        widget: 'stream-search',
        title: 'Saved searches on a stream',
        body: 'Four new listings flow past two stored searches.',
      },
      {
        kind: 'text',
        title: 'Isn’t any message-passing system stream processing?',
        body: 'Not quite. In the **actor model**, small independent units (actors) send each other messages, like people passing notes. That’s mainly a way to organize concurrent code: messages are usually short-lived and one-to-one, and actors can talk in any pattern, including back-and-forth requests (**RPC**, calling a function on another machine). Stream processing is about managing data: logs are durable and have many readers, and jobs form one-way pipelines. You can process streams with actors, but many actor frameworks don’t guarantee delivery after a crash.',
      },
      {
        kind: 'table',
        title: 'Uses at a glance',
        head: ['Use', 'Example', 'What it keeps in memory'],
        rows: [
          ['Complex event processing', 'Flag a card used in two countries within 10 minutes', 'Partial pattern matches'],
          ['Stream analytics', 'Requests per minute, p99 latency', 'A small summary per window'],
          ['Materialized views', 'Search index, cache, home timelines', 'The whole view, from the beginning of time'],
          ['Search on streams', 'Alert on new listings matching a saved search', 'The stored queries'],
        ],
      },
      {
        kind: 'check',
        question: 'What is reversed about the roles of queries and data in complex event processing compared with a normal database?',
        answer: 'A database stores data and runs each query once, then forgets it. A CEP engine stores the queries long-term and runs each new event past them as it arrives.',
      },
    ],
    takeaways: [
      'A stream can be stored, shown to people, or turned into other streams by jobs (operators).',
      'Streams never end: no global sort, and recovery can’t mean “start over”.',
      'CEP stores queries and matches event patterns as data flows past.',
      'Stream analytics computes windowed statistics; approximation is optional.',
      'Materialized views need all history; IVM updates only what changed.',
      'Actor messaging manages concurrency; stream processing manages durable data.',
    ],
  },

  // ── 7 ─────────────────────────────────────────────────────────────────
  {
    sectionId: 'time',
    intro:
      '“Requests in the last five minutes” sounds simple. It isn’t: there are two different clocks you could mean, events arrive late and out of order, and some clocks can’t be trusted. This lesson untangles time in streams and explains the kinds of window.',
    blocks: [
      {
        kind: 'text',
        title: 'Event time and processing time',
        body: 'Each event can be placed in time in two ways:\n- **Event time**: when it actually happened, according to the timestamp inside the event.\n- **Processing time**: when the stream processor gets round to handling it, according to the processor’s own clock.\n\nA batch job over last year’s data finishes in minutes, so it naturally uses event time; the time it happens to run is irrelevant. Doing so also makes it **deterministic**: run it again on the same input and you get the same answer.\n\nMany stream tools default to processing time because it’s simple. That’s fine while the gap between the two is tiny — but processing can be delayed by queues, network trouble, a slow broker, a restart, or deliberately reprocessing old events after fixing a bug.',
      },
      {
        kind: 'analogy',
        body: 'Event time is the postmark on a letter; processing time is when you open it. If you come back from holiday and open two weeks of post in one evening, you didn’t receive fourteen days of letters in one evening — the postmarks tell the real story.',
      },
      {
        kind: 'text',
        body: 'Delays also scramble the order. A user makes one request, handled by server A, then a second, handled by server B. If B’s event reaches the broker first, every consumer sees the second request before the first.\n\nMixing up the two clocks produces wrong data. A job that counts requests per minute by processing time and is redeployed (down for a minute, then catching up) will show a drop to zero followed by a huge spike — while real traffic was perfectly steady.',
      },
      {
        kind: 'widget',
        widget: 'two-clocks',
        title: 'One event, two times',
        body: 'Each event gets a point on both lines: when it happened (top) and when it was processed (bottom). Watch the gap — and the order — change.',
      },
      {
        kind: 'widget',
        widget: 'event-time',
        title: 'The restart spike',
        body: 'Step through six minutes. Compare the two charts in minute 4.',
      },
      {
        kind: 'text',
        title: 'Straggler events: when is a window finished?',
        body: 'Counting by event time raises a new question. You’re counting requests in the minute 10:37. Most events now belong to 10:38 or 10:39. When do you declare 10:37 finished and publish its count? You can never be completely sure: a few events might still be stuck on some machine behind a network blip. These late arrivals are **stragglers** — like guests who turn up after the photo was taken.\n\nTwo options:\n- **Ignore them.** They’re usually rare. Count how many you drop and alert if that number jumps.\n- **Publish a correction**: send an updated result for the window, and possibly withdraw the earlier one.\n\nIn practice you wait a little first: a **grace period** before closing a window. Some systems also send special markers meaning “nothing older than time t will come from me any more”, often called **watermarks**. With many producers, though, each sends its own markers, and consumers must track each producer separately.',
      },
      {
        kind: 'widget',
        widget: 'stragglers',
        title: 'Straggler events',
        body: 'Server B’s 10:57 events are held up and turn up at 10:59, mixed in with newer events. Run each policy and compare the published counts.',
      },
      {
        kind: 'text',
        title: 'Whose clock?',
        body: 'Events can be held up at many points. A mobile app may record usage while offline and only upload it days later; to everyone downstream these are extreme stragglers. The meaningful time is when the user acted, by the phone’s clock — but users’ clocks can be wrong, by accident or on purpose. The server’s clock is trustworthy but says when the data arrived, not when the user acted.\n\nA neat trick is to record three timestamps:\n1. when the event happened, by the device clock;\n2. when the device sent it, by the device clock;\n3. when the server received it, by the server clock.\n\nThe difference between 3 and 2 estimates how far off the device clock is (assuming the network trip was quick). Apply that offset to 1 to estimate when the event really happened. Batch jobs have exactly the same problems with time; streaming just makes them more visible.',
      },
      {
        kind: 'widget',
        widget: 'clock-skew',
        title: 'Correcting a wrong device clock',
        body: 'A phone with a clock 5 minutes fast records a tap offline. Compare the three ways of deciding when it happened.',
      },
      {
        kind: 'text',
        title: 'Types of window',
        body: 'Once you know which timestamp to use, you decide how to group events into windows:\n- **Tumbling** windows have a fixed length and don’t overlap, so every event is in exactly one — like hourly slots in a car park’s pay-and-display. (Round each timestamp down to the minute to find its 1-minute window.)\n- **Hopping** windows have a fixed length but overlap, which smooths the results — like a 5-minute window that moves forward one minute at a time. (Compute 1-minute tumbling windows and add up neighbours.)\n- **Sliding** windows contain every event within a certain distance of each other — “the last five minutes”, measured from any point, without fixed boundaries. Two events 4 minutes apart always share a 5-minute sliding window, even if a fixed boundary falls between them.\n- **Session** windows have no fixed length: they group one user’s events that happen close together, and end after a period of inactivity, like a conversation that ends after a long silence. Common in website analytics.\n\nWindows need memory. A simple count keeps one number per window, but sliding windows and joins have to keep the events themselves until the window ends — big windows on busy streams can need a lot of storage.',
      },
      {
        kind: 'widget',
        widget: 'windows',
        title: 'Windows and a straggler',
        body: 'Each event is placed by its event time; the bars below are windows. Try each window type with “drop stragglers”, then switch to “publish corrections” and watch what happens when e7 — which happened early but arrives last — shows up.',
      },
      {
        kind: 'diagram',
        title: 'The same events, four kinds of window',
        art: art(`
events:      ●  ●   ●             ●  ●              ●
time:      10:00     10:01     10:02     10:03     10:04
tumbling:  [ 1 min  ][ 1 min  ][ 1 min  ][ 1 min  ]
hopping:   [ 2 min          ]
                     [ 2 min          ]
                               [ 2 min          ]
sliding:   any 2-minute stretch ending at an event
session:   [●  ●   ● ]        [ ●  ● ]          [ ● ]   gaps > 1 min end a session`),
      },
      {
        kind: 'check',
        question: 'A dashboard counts orders per minute by processing time. The stream processor restarts and catches up on 5 minutes of backlog in 30 seconds. What does the chart show, and how do you fix it?',
        answer: 'Five minutes near zero followed by a huge one-minute spike, though real traffic was steady. Count by event time (the timestamp in each order) instead, and decide how to handle late arrivals.',
      },
    ],
    takeaways: [
      'Processing time is the processor’s clock — simple, but wrong whenever processing lags.',
      'Event time uses the timestamp in the event — deterministic, and correct after restarts and replays.',
      'You can’t be sure a window is complete: drop stragglers (and count them) or publish corrections.',
      'Untrusted device clocks: record occurred, sent and received times and correct for the offset.',
      'Tumbling, hopping, sliding and session windows; windows (and joins) need state.',
    ],
  },

  // ── 8 ─────────────────────────────────────────────────────────────────
  {
    sectionId: 'joins',
    intro:
      'Pipelines constantly need to combine data — matching each click with its search, or adding a customer’s details to an order. On streams, where new data can turn up at any moment, these **joins** come in three kinds.',
    blocks: [
      {
        kind: 'text',
        title: 'What a join is',
        body: 'A **join** brings together records that belong together because they share a key, like pairing socks out of the laundry by colour. Batch jobs do this all the time on finite files. Streams need the same thing — but the other half of a pair may arrive much later, or may already have arrived, or may never come.',
      },
      {
        kind: 'text',
        title: 'Stream–stream join (window join)',
        body: 'Example: to measure how good your search results are, you want the **click-through rate** — the share of searches where the user clicked a result. Search events and click events are separate streams, linked by a session id.\n- The click may never come (the user gave up), or may come seconds, hours or even days later.\n- Because of network delays, the click event can even arrive **before** its search event.\n\nSo you choose a window — say, a click counts if it’s within an hour of the search. The processor remembers recent searches and clicks, indexed by session id. Whenever one arrives, it looks for its partner among the other side’s remembered events; on a match it emits a joined event. When a search’s hour runs out with no click, it emits a “not clicked” event. Simply copying search details into each click event wouldn’t do: you’d never learn about the searches nobody clicked.',
      },
      {
        kind: 'text',
        title: 'Stream–table join (enrichment)',
        body: 'Example: a stream of user activity carries only a user id, but you want each event to include details from the user’s profile. Adding extra details like this is called **enrichment**.\n\nQuerying the profile database for every single event would be slow and could overload it. Instead, keep a **local copy** of the profile table inside the stream processor — in memory if it’s small, on local disk otherwise — like keeping a printed phone book on your desk instead of ringing directory enquiries for every number.\n\nUnlike a batch job, which uses one snapshot, a long-running stream processor must keep that copy current. CDC solves it: subscribe to the profile table’s change stream and update the local copy as changes arrive. So this is really a join of two streams, where the table side remembers everything since the beginning of time (newer versions replacing older ones) and the activity side remembers nothing.',
      },
      {
        kind: 'text',
        title: 'Table–table join (maintaining a materialized view)',
        body: 'Example: a social network shows each user a home timeline of recent posts from people they follow. Building it at read time — looking up everyone you follow and merging their posts — is too slow, so each timeline is kept ready, like a personal inbox. Keeping it current needs two change streams:\n- a new post is added to the timeline of every follower; a deleted post is removed from them;\n- a new follow adds the followee’s recent posts to your timeline; an unfollow removes them.\n\nThe processor keeps the follower lists and the posts. Every change on one side is joined with the **current** state of the other side. The timelines are a materialized view of a query that joins the posts and follows tables, updated every time either table changes.',
      },
      {
        kind: 'widget',
        widget: 'stream-joins',
        title: 'Three joins, step by step',
        body: 'Run each join type and watch what the processor remembers. For stream–table, flip “update arrives first” and compare the output.',
      },
      {
        kind: 'text',
        title: 'Joins depend on time',
        body: 'All three joins keep state built from one input and consult it when the other input arrives. So the **order** in which events from the two inputs are processed matters — and a partitioned log only guarantees order within one partition, not across streams.\n\nIf a user changes their profile around the same time as some activity, which activity gets the old profile and which the new? A rerun might interleave the streams differently and give a different answer: the join is **nondeterministic** (not guaranteed to give the same result every time).\n\nThe same issue appears when joining sales to prices that change over time: to reprocess old sales correctly you want the price that applied **at the time of the sale**. Data warehouses call this a **slowly changing dimension** and fix it by giving each version of the record its own id, which every event then refers to. That makes joins deterministic, but you must keep every version, so log compaction is no longer possible. Alternatively, copy the needed value straight into each event.',
      },
      {
        kind: 'widget',
        widget: 'versioned-join',
        title: 'Reprocessing a join',
        body: 'Sales are joined with a tax rate that goes up on day 3. Then every sale is reprocessed. Which approach gives the same answer the second time?',
      },
      {
        kind: 'table',
        title: 'The three joins',
        head: ['Join', 'Inputs', 'State kept', 'Example'],
        rows: [
          ['Stream–stream', 'Two activity streams', 'Recent events from both sides, within the window', 'Searches + clicks → click-through rate'],
          ['Stream–table', 'Activity stream + a table’s changelog', 'A local copy of the table', 'Page views + user profiles → enriched views'],
          ['Table–table', 'Two changelogs', 'Both tables', 'Posts + follows → home timelines'],
        ],
      },
      {
        kind: 'check',
        question: 'You reprocess last year’s sales to fix a bug, joining each sale with the current tax-rate table. Why might the totals now be wrong, and how do you prevent it?',
        answer: 'Rates have changed since, so old sales get today’s rate. Give each rate version an id and record it on the sale (or copy the rate into the sale event) so the join uses the rate in force at the time.',
      },
    ],
    takeaways: [
      'Stream–stream joins match related events within a window and need state for both sides; emit “no match” on expiry.',
      'Stream–table joins enrich events from a local copy of a table, kept current via CDC.',
      'Table–table joins maintain a materialized view: each change joins with the current state of the other side.',
      'Order across streams isn’t guaranteed, so joins can be nondeterministic; version the joined records to fix it.',
    ],
  },

  // ── 9 ─────────────────────────────────────────────────────────────────
  {
    sectionId: 'fault-tolerance',
    intro:
      'Machines crash and tasks restart. Batch jobs handle that easily. Stream jobs never finish, so they need finer tools. This last lesson shows how a stream processor can produce results **as if** every event were handled exactly once.',
    blocks: [
      {
        kind: 'text',
        title: 'What “exactly once” really means',
        body: 'A batch job can simply rerun a failed task: the input files don’t change, and output becomes visible only when a task completes. The final output looks as if every record was processed exactly once, even though some were processed several times along the way. This is called **exactly-once semantics** — though **effectively-once** describes it better: repeats may happen, but you can’t see their effects.\n\nA stream never completes, so “show the output only when finished” isn’t an option. Three tools fill the gap.',
      },
      {
        kind: 'text',
        title: 'Microbatching and checkpointing',
        body: '- **Microbatching** cuts the stream into tiny batches — typically about a second each — and treats each one like a mini batch job, as Spark Streaming does. Smaller batches mean more overhead; bigger ones mean longer delays. It also quietly gives you 1-second tumbling windows by processing time.\n- **Checkpointing**, as Flink does, periodically saves a snapshot of every operator’s state to durable storage, triggered by special **barrier** markers flowing through the stream — like save points in a video game. After a crash, the job restarts from the last save and throws away anything produced since.\n\nBoth give exactly-once results **inside** the stream framework. But once output leaves it — a database write, a message to another system, an email — the framework can’t take it back, and a restarted task will do it again.',
      },
      {
        kind: 'widget',
        widget: 'checkpoint',
        title: 'Microbatches and checkpoints',
        body: 'A counting job crashes part-way. Step through each recovery method: the count comes out exact, but watch the email.',
      },
      {
        kind: 'text',
        title: 'Atomic commit',
        body: 'To get exactly-once effects despite crashes, everything that processing an event causes must happen **atomically** — all of it or none of it: the output messages, the database writes, the changes to the operator’s state, and moving the consumer offset forward.\n\nThat’s a distributed transaction again. General-purpose ones (such as XA, which spans different products) have serious problems, but in a controlled setting they can be efficient. Google Cloud Dataflow, VoltDB and Kafka do this by keeping the transaction **inside** their own system, covering both the state changes and the messaging, and amortizing the cost by committing many input messages together.',
      },
      {
        kind: 'text',
        title: 'Idempotence',
        body: 'The other route is to make repeats harmless. An **idempotent** operation has the same effect whether you do it once or many times: deleting a key is idempotent (the second delete changes nothing); adding 10 to a counter is not.\n\nMany operations can be made idempotent with a little extra information. Each message from a log-based broker has a fixed offset, so when writing a result to a database you can store the **offset of the message that caused it** alongside the value. On a repeat, you see that this offset was already applied and skip it.\n\nIt relies on a few assumptions:\n- after a restart, the same messages are replayed in the same order (a log-based broker does that);\n- processing is deterministic;\n- nothing else is updating the same value at the same time.\n\nWhen work moves to another node, a node wrongly believed dead might still be writing. **Fencing** blocks it: each new owner gets a higher token number, and writes carrying an older token are rejected — like changing the lock code when someone hands in their keys. With those caveats, idempotence gives exactly-once effects at very low cost.',
      },
      {
        kind: 'widget',
        widget: 'exactly-once',
        title: 'Crash at the worst moment',
        body: 'A consumer adds deposits to a balance and then commits each offset. It crashes after writing but before committing. Run a plain write, then an idempotent write, then an atomic commit, and compare the final balances.',
      },
      {
        kind: 'widget',
        widget: 'fencing',
        title: 'Fencing a node that was wrongly declared dead',
        body: 'Node 1 freezes and is replaced, then wakes up and writes. Run it without and with fencing tokens.',
      },
      {
        kind: 'text',
        title: 'Rebuilding state after a failure',
        body: 'Any job that keeps state — window counts, averages, the local table for a join — must be able to get it back after a crash:\n- keep it in a **remote** database that replicates it (simple, but a network round trip per message can be slow);\n- keep it **locally** and replicate it regularly: Flink writes snapshots to durable storage; Kafka Streams sends every state change to its own log-compacted topic (a **changelog topic**), much like CDC; VoltDB processes each input on several nodes;\n- or **rebuild** it by replaying input: short windows can be replayed quickly, and a local table maintained by CDC can be rebuilt from its compacted change stream.\n\nWhich is best depends on the relative speed of disks and networks, and that balance keeps shifting.',
      },
      {
        kind: 'widget',
        widget: 'state-recovery',
        title: 'Getting state back after a crash',
        body: 'The node holding a running count crashes. Compare three ways for its replacement to recover the count.',
      },
      {
        kind: 'table',
        title: 'Ways to get effectively-once results',
        head: ['Technique', 'How', 'Covers external side effects?'],
        rows: [
          ['Microbatching', 'Tiny batches, each all-or-nothing', 'No'],
          ['Checkpointing', 'Snapshots at barriers; restart from the last one', 'No'],
          ['Atomic commit', 'Outputs, state and offsets commit together', 'Only those inside the framework'],
          ['Idempotent writes', 'Repeats detected (e.g. by stored offset) and made harmless', 'Yes, if the target supports it'],
        ],
      },
      {
        kind: 'check',
        question: 'A consumer writes `balance += amount` to a database, then commits the Kafka offset. What breaks if it crashes in between, and give two ways to fix it.',
        answer:
          'On restart it re-reads that message and adds the amount again. Fix 1: idempotence — store the message offset with the balance and skip offsets already applied. Fix 2: atomic commit — make the write and the offset commit one transaction, so both happen or neither does.',
      },
      {
        kind: 'text',
        title: 'Chapter wrap-up',
        body: '- **Traditional brokers** hand out individual messages and delete them once acknowledged — a good fit for task queues where order doesn’t matter and nobody needs old messages.\n- **Log-based brokers** keep messages in partitioned logs, give each partition to one consumer, track progress with offsets, and let you replay — a good fit for high-throughput, ordered streams that feed derived data.\n- **Databases are streams too**: CDC and event sourcing turn writes into a changelog that keeps caches, indexes and warehouses in sync; log compaction keeps a full copy in the log.\n- **Processing streams** covers pattern matching (CEP), windowed analytics and materialized views — with care for event time vs processing time and late events.\n- **Joins** come in stream–stream, stream–table and table–table forms, and depend on order.\n- **Fault tolerance** comes from microbatching, checkpointing, atomic commit or idempotent writes.',
      },
    ],
    takeaways: [
      '“Exactly-once” means effectively-once: repeats happen, but their effects are invisible.',
      'Microbatching and checkpointing give exactly-once inside the framework only.',
      'Atomic commit ties outputs, state and offset commits together.',
      'Idempotent writes (e.g. storing the input offset with the result) make repeats harmless; they need same-order replay, determinism and fencing.',
      'Operator state is recovered from remote stores, replicated local state, snapshots or replay.',
    ],
  },
];
