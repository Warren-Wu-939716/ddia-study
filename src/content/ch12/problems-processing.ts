import type { Problem } from '../types.ts';

/** End-of-lesson problems for lessons 5–9. */
export const processingProblems: Problem[] = [
  // ── 5 · State, streams and immutability ──────────────────────────────
  {
    id: 'p12.immut.1',
    sectionId: 'immutability',
    skill: 'calculate',
    kind: 'numeric',
    prompt: 'An account’s ledger holds these entries, in order. What is the balance?',
    figure: `#1  +100  opening balance
#2   −30  groceries
#3  +200  salary
#4   −30  groceries (charged twice by a bug)
#5   +30  correction for #4`,
    answer: 270,
    unit: '£',
    explanation:
      'The balance is just the sum of the entries: 100 − 30 + 200 − 30 + 30 = **270**. The duplicate charge (#4) is still on record; the compensating entry (#5) cancels its effect without erasing the evidence.',
  },
  {
    id: 'p12.immut.2',
    sectionId: 'immutability',
    skill: 'predict',
    kind: 'choice',
    prompt:
      'A shop stores only each cart’s **current** contents in a table. A shopper adds a tent, removes it, adds boots, and checks out. Marketing asks: “Which shoppers removed a tent before checking out?” What can this table tell them?',
    options: [
      { text: 'Everything — the removal is still in the cart row.', why: 'Removing the tent overwrote the row; it now only shows boots.' },
      { text: 'Nothing about the tent: once removed, it left no trace.', correct: true, why: 'Current state forgets how it got there.' },
      { text: 'It can tell them, if they query the table at the right moment.', why: 'Only by luck, while the tent happened to be in the cart — and never after the fact.' },
      { text: 'It can, because databases keep deleted values for auditing.', why: 'Some keep internal logs for recovery, but the table itself only holds current state.' },
    ],
    explanation: 'The cart table is one view of what happened. An event log (TentAdded, TentRemoved, BootsAdded, CheckedOut) keeps the information that the current state throws away.',
  },
  {
    id: 'p12.immut.3',
    sectionId: 'immutability',
    skill: 'design',
    kind: 'justify',
    prompt: 'You need a new “recently viewed products” page. Every product view of the last six months is already recorded in an event log. How do you build it?',
    options: [
      { text: 'Migrate an existing table in place to add the new data.', why: 'Risky, and the existing table never stored view history anyway.' },
      { text: 'Build a new view by replaying the event log, run it next to the existing views, and switch readers over when it’s ready.', correct: true, why: 'New view, no disruption to the old ones.' },
      { text: 'Start recording views from today and launch in six months.', why: 'The history already exists in the log — no need to wait.' },
    ],
    reasons: [
      { text: 'Every view is derived from the log, so a new one can be built from history without touching the others.', correct: true, why: 'That is the payoff of keeping the log as the source of truth.' },
      { text: 'Event logs are faster to query than tables.', why: 'They usually aren’t — that’s why you derive read-optimized views from them.' },
      { text: 'Replaying the log modifies the old events so they fit the new page.', why: 'Replay reads events; it never changes them.' },
    ],
    explanation: 'Keeping immutable events separate from read-optimized views lets you add new views from old history, test them side by side, and retire old ones safely.',
  },
  {
    id: 'p12.immut.4',
    sectionId: 'immutability',
    skill: 'diagnose',
    kind: 'choice',
    prompt:
      'A user changes their display name. The app appends a NameChanged event to the log and replies “saved!”. The profile page, a view built from the log in the background, still shows the old name when the user immediately reloads. A second later it’s correct. What’s going on?',
    options: [
      { text: 'The event was lost and then re-sent.', why: 'If it were lost, the view would never update.' },
      { text: 'The view is updated asynchronously and hadn’t processed the event yet — a read-your-writes problem.', correct: true, why: 'The log is up to date; the derived view lags slightly behind it.' },
      { text: 'The log stored the events out of order.', why: 'Order isn’t the issue; the view later shows the right name.' },
      { text: 'The browser cached the old page.', why: 'Possible in general, but the description (correct a second later on its own) points at view lag.' },
    ],
    explanation:
      'Asynchronous views trade freshness for decoupling. Fixes include serving a user’s own profile from the most up-to-date source, or waiting until the view has processed that user’s latest event before reading it.',
  },
  {
    id: 'p12.immut.5',
    sectionId: 'immutability',
    skill: 'diagnose',
    kind: 'multi',
    prompt: 'A user exercises their right to have their personal data deleted. It lives in an immutable event log, two replicas and nightly backups. Which statements are true?',
    options: [
      { text: 'Appending a “UserDeleted” event removes their data.', why: 'The earlier events still contain the data; this only marks it as deleted.' },
      { text: 'If each user’s data was encrypted with their own key, deleting that key makes every copy unreadable — backups included.', correct: true, why: 'That is crypto-shredding: you destroy the key, not the copies.' },
      { text: 'Rewriting the live log without their events (excision) still leaves their data in backups.', correct: true, why: 'Backups are deliberately unchangeable.' },
      { text: 'Deleting their row from the read views is enough, because views are what users see.', why: 'The log, replicas and backups still hold it, and the views can be rebuilt from them.' },
      { text: 'Crypto-shredding requires deciding in advance which data shares a key.', correct: true, why: 'A key’s data can only be shredded all at once.' },
    ],
    explanation: 'Immutability makes real deletion hard. Plan for it up front — per-user keys, or excision tooling — rather than hoping a marker event is enough.',
  },
  {
    id: 'p12.immut.6',
    sectionId: 'immutability',
    skill: 'explain',
    kind: 'explain',
    prompt:
      'Ann sends Bo £10. Instead of updating two balance rows in one transaction, the app appends a single Transfer(Ann → Bo, £10) event, and both balances are derived from the log. Why does this avoid the need for a multi-row transaction, and what do you give up?',
    keyPoints: [
      'Appending one event is a single write, so it is all-or-nothing on its own',
      'The balances are derived from that event; if an updater crashes, it resumes from its log position and applies the event later',
      'Cost: derived balances update asynchronously, so a read straight after the transfer may not reflect it yet',
      'Events for the same account must be processed in order (e.g. partitioned by account)',
    ],
    explanation:
      'The whole action is described by **one** event, and appending it is a single, atomic write — so there’s nothing to be half-done. Each balance is derived from the log; if the process updating Bo’s balance crashes, it resumes from its saved position and applies the event when it restarts. The price: derived views lag the log (read-your-writes needs care), and events touching the same account must be processed in order, typically by partitioning on account.',
  },

  // ── 6 · What stream processing is used for ───────────────────────────
  {
    id: 'p12.uses.1',
    sectionId: 'stream-uses',
    skill: 'predict',
    kind: 'choice',
    prompt: 'A fraud rule says: “the same card used in two different countries within 10 minutes”. One card’s payments arrive as shown. When does the engine raise an alert?',
    figure: `09:00  UK
09:04  UK
09:13  FR
09:20  FR`,
    options: [
      { text: 'Never: the UK use at 09:00 and the FR use at 09:13 are 13 minutes apart.', why: 'That compares against the **first** UK use. The engine remembers the most recent one, 09:04.' },
      { text: 'At 09:13, because the card was last used in the UK at 09:04 — 9 minutes earlier.', correct: true, why: 'Latest UK use 09:04 → FR at 09:13 is within 10 minutes.' },
      { text: 'At 09:20, when the second FR payment confirms the pattern.', why: 'Two payments in the same country never match this rule.' },
      { text: 'Twice, at 09:13 and 09:20.', why: 'At 09:20 the previous use was FR (09:13), the same country — no match.' },
    ],
    explanation: 'The CEP engine keeps a small amount of state per card (where and when it was last used) and checks each new event against the stored query as it arrives.',
  },
  {
    id: 'p12.uses.2',
    sectionId: 'stream-uses',
    skill: 'calculate',
    kind: 'numeric',
    prompt:
      'An orders table has 2,000,000 rows. A materialized view of revenue per region is refreshed by re-running the whole query after every change. There are 500 changes per minute. How many rows are read per minute?',
    answer: 1_000_000_000,
    unit: 'rows',
    explanation:
      '500 changes × 2,000,000 rows = **1,000,000,000** rows per minute — just to keep one small view current. Incremental view maintenance touches one region’s total per change: about 500 small updates per minute.',
  },
  {
    id: 'p12.uses.3',
    sectionId: 'stream-uses',
    skill: 'design',
    kind: 'justify',
    prompt: 'Two million users have saved alerts like “tell me when product X drops below £Y”. Prices change 10,000 times per minute. How should matching work?',
    options: [
      { text: 'Every minute, run all two million saved alerts as queries against the products table.', why: 'Two million queries per minute, nearly all of which find nothing.' },
      { text: 'Store the alerts, index them by product, and check each price change against only that product’s alerts.', correct: true, why: 'Each event only needs the handful of stored queries that could match it.' },
      { text: 'Send every price change to every user and let their app decide.', why: 'Twenty billion messages per minute, almost all irrelevant.' },
    ],
    reasons: [
      { text: 'The queries are the long-lived data and the events flow past them; indexing the queries keeps each check cheap.', correct: true, why: 'This is search on streams: the roles of data and query are reversed.' },
      { text: 'Databases can’t run two million queries.', why: 'They can — it’s just enormously wasteful when almost all return nothing.' },
      { text: 'Stream processing is approximate, so it’s cheaper.', why: 'Nothing here is approximate; the saving comes from flipping queries and data.' },
    ],
    explanation: 'When there are many standing conditions and a stream of changes, store the conditions and test each change against the few that could match.',
  },
  {
    id: 'p12.uses.4',
    sectionId: 'stream-uses',
    skill: 'predict',
    kind: 'multi',
    prompt: 'Which of these jobs need state that reaches back to the very beginning of the stream, not just a recent window?',
    options: [
      { text: 'Keeping a search index of all products up to date.', correct: true, why: 'A product added two years ago and never changed must still be in the index.' },
      { text: 'Showing requests per minute on a dashboard.', why: 'Each minute only needs that minute’s events.' },
      { text: 'Maintaining a cache of each user’s current profile.', correct: true, why: 'A profile last edited long ago is still current.' },
      { text: 'Alerting if the error rate over the last 5 minutes exceeds 2%.', why: 'Only the last 5 minutes matter.' },
      { text: 'Flagging a card used in two countries within 10 minutes.', why: 'Only the last 10 minutes of each card’s activity matter.' },
    ],
    explanation: 'Analytics and pattern detection usually need recent windows. Materialized views (indexes, caches) depend on everything that ever happened — minus what log compaction removed.',
  },
  {
    id: 'p12.uses.5',
    sectionId: 'stream-uses',
    skill: 'calculate',
    kind: 'numeric',
    prompt:
      'A per-minute window keeps only a count and a running total of response times. During 10:00 it sees 120 ms, 80 ms, 400 ms and 200 ms; then, still within 10:00, one more request of 700 ms. What average does it publish for 10:00?',
    answer: 300,
    unit: 'ms',
    explanation:
      'Count 5, total 120 + 80 + 400 + 200 + 700 = 1,500 ms, average **300 ms**. The window never needed to keep the individual requests — two numbers were enough.',
  },

  // ── 7 · Reasoning about time and windows ─────────────────────────────
  {
    id: 'p12.time.1',
    sectionId: 'time',
    skill: 'calculate',
    kind: 'numeric',
    prompt:
      'Traffic is a steady 600 requests per minute. The stream processor is down for minutes 10:03 and 10:04, then works through the backlog during the first 30 seconds of 10:05. A dashboard counts requests per minute **by processing time**. What does it show for 10:05?',
    answer: 1800,
    unit: 'requests',
    explanation:
      'During 10:05 it processes the 1,200 requests from 10:03–10:04 plus 10:05’s own 600: **1,800**, after showing 0 for the two minutes it was down. Counting by event time would show a flat 600 throughout.',
  },
  {
    id: 'p12.time.2',
    sectionId: 'time',
    skill: 'predict',
    kind: 'choice',
    prompt:
      'Requests are counted in 1-minute tumbling windows by event time. A window is published once an event stamped 30 s or more past its end has been seen. Late events are dropped. An event stamped 10:00:50 arrives just after one stamped 10:01:40. What happens to it?',
    options: [
      { text: 'It’s added to the 10:00 window, because it arrived within 30 seconds.', why: 'The grace period is measured in event time, and event time has already reached 10:01:40 — past 10:01:30.' },
      { text: 'It’s dropped and counted as a straggler, because the 10:00 window has already been published.', correct: true, why: 'Seeing 10:01:40 closed the 10:00 window (its end, 10:01:00, plus 30 s).' },
      { text: 'It’s put into the 10:01 window instead.', why: 'Moving an event into a window it doesn’t belong to would make both counts wrong.' },
      { text: 'The processor waits until it can be sure no more 10:00 events will come.', why: 'It can never be sure. That’s why there’s a grace period and a policy for late events.' },
    ],
    explanation: 'Once a window has been published, a late event can only be dropped (and counted) or used to publish a correction.',
  },
  {
    id: 'p12.time.3',
    sectionId: 'time',
    skill: 'calculate',
    kind: 'choice',
    prompt: 'A phone records an event offline. Using the three-timestamp trick, when did the event really happen? Assume the upload itself was instant.',
    figure: `happened (phone clock):  14:10:00
sent     (phone clock):  14:40:00
received (server clock): 14:32:00`,
    options: [
      { text: '14:02:00', correct: true, why: 'The phone clock is 8 minutes fast (14:40 by the phone = 14:32 really), so 14:10 by the phone was really 14:02.' },
      { text: '14:10:00', why: 'That trusts the phone’s clock, which is off.' },
      { text: '14:32:00', why: 'That’s when the server got it, not when the user acted.' },
      { text: '14:18:00', why: 'The offset was applied in the wrong direction: received − sent is −8 minutes, so subtract 8.' },
    ],
    explanation: 'Offset = received (server) − sent (phone) = −8 min. Estimated event time = happened (phone) + offset = 14:10:00 − 8 min = **14:02:00**.',
  },
  {
    id: 'p12.time.4',
    sectionId: 'time',
    skill: 'predict',
    kind: 'multi',
    prompt: 'One user generates events at 10:00:10, 10:00:50 and 10:01:20. Which statements are true?',
    options: [
      { text: 'With 1-minute tumbling windows, the first two share a window and the third is on its own.', correct: true, why: '10:00:10 and 10:00:50 fall in 10:00–10:01; 10:01:20 falls in 10:01–10:02.' },
      { text: 'With 1-minute tumbling windows, 10:00:50 and 10:01:20 share a window because they are only 30 s apart.', why: 'Tumbling windows have fixed boundaries; 10:01:00 falls between them.' },
      { text: 'With a 1-minute inactivity gap, all three are in one session.', correct: true, why: 'The gaps are 40 s and 30 s, both under a minute.' },
      { text: 'A 1-minute sliding window ending at 10:01:20 includes 10:00:50 but not 10:00:10.', correct: true, why: 'It covers 10:00:20–10:01:20.' },
      { text: 'Hopping windows put each event into exactly one window.', why: 'Hopping windows overlap, so an event usually lands in several.' },
    ],
    explanation: 'Tumbling: fixed and non-overlapping. Hopping: fixed and overlapping. Sliding: relative to each event. Session: grouped by gaps of inactivity.',
  },
  {
    id: 'p12.time.5',
    sectionId: 'time',
    skill: 'design',
    kind: 'justify',
    prompt: 'A utility bills customers per hour of usage from smart-meter events. Some meters lose their connection for hours and upload later. How should late events be handled?',
    options: [
      { text: 'Drop late events and count how many were dropped.', why: 'Every dropped event is unbilled usage.' },
      { text: 'Publish a corrected total for the hour when late events arrive.', correct: true, why: 'The bill ends up complete.' },
      { text: 'Count usage by processing time so nothing is ever late.', why: 'Usage would be billed to the hour it was uploaded, not the hour it was used.' },
    ],
    reasons: [
      { text: 'Every event is money, so totals must eventually include late data, and billing can work with totals that get revised.', correct: true, why: 'Completeness matters more than having a final answer early.' },
      { text: 'Processing time is deterministic, so it’s fairer.', why: 'Processing time is the **non**-deterministic one: it depends on when things happened to be processed.' },
      { text: 'Corrections cost nothing downstream.', why: 'They do: anything using the result must handle values changing after publication.' },
    ],
    explanation: 'Dropping suits metrics where a few lost events don’t matter. When completeness matters (money, compliance), publish corrections — and make downstream consumers able to accept them.',
  },
  {
    id: 'p12.time.6',
    sectionId: 'time',
    skill: 'explain',
    kind: 'explain',
    prompt:
      'A processor merges events from 50 servers and closes windows using each server’s watermark (“nothing older than t will come from me”). One server goes silent for an hour. What happens to the results, and what could you do about it?',
    keyPoints: [
      'The processor can only be as far along as the slowest producer’s watermark, so it stops closing windows',
      'Results for every window are delayed, and open windows keep using memory',
      'One fix: after a timeout, stop waiting for an idle producer and close windows without it',
      'Its events that arrive later are then stragglers, to be dropped (and counted) or used for corrections',
    ],
    explanation:
      'With per-producer watermarks, the processor knows a window is complete only when **every** producer has moved past it — the slowest one sets the pace. A silent server freezes that, so no windows close: results stop flowing and open windows pile up in memory. The usual remedy is an idle timeout: after a while, ignore the silent producer when deciding what’s complete. If it comes back, its old events are stragglers and are handled by your late-event policy. It’s a trade-off between complete results and timely ones.',
  },

  // ── 8 · Stream joins ─────────────────────────────────────────────────
  {
    id: 'p12.joins.1',
    sectionId: 'joins',
    skill: 'design',
    kind: 'choice',
    prompt:
      'Each payment event carries a merchant id. You want to add the merchant’s category (from a merchants table that changes a few times a day) to every payment, at 20,000 payments per second. Which approach fits best?',
    options: [
      { text: 'A stream–stream join with a 1-hour window between payments and merchant changes.', why: 'A merchant last changed a month ago would fall outside any window and never match.' },
      { text: 'Query the merchants database once for every payment.', why: 'Correct but slow: 20,000 network round trips per second, and heavy load on that database.' },
      { text: 'Keep a local copy of the merchants table in the processor, kept current from the table’s change stream, and look each payment up locally.', correct: true, why: 'A stream–table join: fast local lookups that stay fresh via CDC.' },
      { text: 'A table–table join between payments and merchants.', why: 'Payments are an activity stream, not a table you maintain a view over.' },
    ],
    explanation: 'Enrichment is a stream–table join. The table side is remembered from the beginning (newest version per key); the activity side isn’t remembered at all.',
  },
  {
    id: 'p12.joins.2',
    sectionId: 'joins',
    skill: 'predict',
    kind: 'choice',
    prompt: 'A click-through job joins searches with clicks by session id, waiting up to 1 hour for a click. The events below arrive in this order. What has the job emitted by 11:10?',
    figure: `10:00  search s1
10:05  search s2
10:20  click  s1
10:30  click  s3   (its search hasn't arrived yet)
10:31  search s3
(no click for s2 ever arrives)`,
    options: [
      { text: 's1 clicked, s3 clicked, s2 not clicked.', correct: true, why: 's1 matches at 10:20; s3’s stored click is found when its search arrives at 10:31; s2 expires at 11:05.' },
      { text: 's1 clicked only — s3’s click arrived before its search, so it was discarded.', why: 'The processor remembers both sides, so a click can wait for its search.' },
      { text: 's1 clicked and s3 clicked; nothing for s2, since no click ever came.', why: 'Searches without a click must be reported too, otherwise the click-through rate is wrong.' },
      { text: 'Nothing yet: results are only emitted when the hour is up.', why: 'Matches are emitted as soon as both halves are present.' },
    ],
    explanation: 'A stream–stream join keeps recent events from both sides, emits on a match, and emits a “no match” result when the window expires.',
  },
  {
    id: 'p12.joins.3',
    sectionId: 'joins',
    skill: 'diagnose',
    kind: 'choice',
    prompt:
      'A user changes their city from Oslo to Rome at almost the same moment as they view a page. Profile changes and page views are on different topics. Rerunning the enrichment job from scratch sometimes labels the view “Oslo” and sometimes “Rome”. Why?',
    options: [
      { text: 'The broker loses some profile changes on reruns.', why: 'Nothing is lost; both events are there every time.' },
      { text: 'There is no guaranteed order between the two topics, so the result depends on which event the processor happens to handle first.', correct: true, why: 'The join is nondeterministic.' },
      { text: 'The view’s timestamp is wrong.', why: 'Even with perfect timestamps, the processor follows arrival order, which varies between runs.' },
      { text: 'The processor’s local copy of profiles is out of date.', why: 'It’s exactly up to date with whatever it has processed so far — that’s the point.' },
    ],
    explanation: 'Joins depend on the order in which the two inputs are interleaved. To make them reproducible, give each version of the joined record an id and have events refer to the version they used.',
  },
  {
    id: 'p12.joins.4',
    sectionId: 'joins',
    skill: 'calculate',
    kind: 'numeric',
    prompt:
      'Sales tax was 10% until 31 March and 15% from 1 April. Sales: £200 on 30 March and £100 on 2 April. In June you reprocess all sales, joining each with the tax-rate table, which now holds only the current rate. What total tax does the rerun compute?',
    answer: 45,
    unit: '£',
    explanation:
      'Both sales get today’s 15%: 0.15 × 300 = **£45**. The correct total is £20 + £15 = £35. Keeping every rate version (and having each sale record which one applied) makes reruns give the same answer.',
  },
  {
    id: 'p12.joins.5',
    sectionId: 'joins',
    skill: 'predict',
    kind: 'multi',
    prompt: 'Home timelines are maintained as a table–table join of posts and follows. Ann follows Bo, and nobody else. Which events must change Ann’s timeline?',
    options: [
      { text: 'Bo publishes a post.', correct: true, why: 'New post by someone Ann follows → add it.' },
      { text: 'Bo deletes a post.', correct: true, why: 'Remove it from every follower’s timeline.' },
      { text: 'Ann unfollows Bo.', correct: true, why: 'Bo’s posts must leave Ann’s timeline.' },
      { text: 'Cy, whom Ann doesn’t follow, publishes a post.', why: 'No follow row joins Cy’s post to Ann.' },
      { text: 'Ann follows Cy.', correct: true, why: 'Cy’s recent posts must be added.' },
      { text: 'Bo changes his profile picture.', why: 'Not part of the posts × follows join (unless timelines also embed profile data).' },
    ],
    explanation: 'In a table–table join, a change on either side is joined with the **current** state of the other side — posts with followers, follows with posts.',
  },

  // ── 9 · Fault tolerance and exactly-once ─────────────────────────────
  {
    id: 'p12.ft.1',
    sectionId: 'fault-tolerance',
    skill: 'calculate',
    kind: 'numeric',
    prompt:
      'A job works in microbatches of 100 events, each committed all-or-nothing. It also sends an SMS for every payment over £1,000. Batch 5 holds events 401–500; three of them, all among 401–470, are over £1,000. The job crashes after processing event 470, then recovers. Counting from the start of batch 5, how many SMS messages have been sent for those three payments?',
    answer: 6,
    unit: 'SMS',
    explanation:
      'Batch 5 never committed, so it is redone from event 401. The three SMS messages sent before the crash are sent again: **6** in total. Microbatching makes the **results inside the framework** exact, but side effects that leave it repeat.',
  },
  {
    id: 'p12.ft.2',
    sectionId: 'fault-tolerance',
    skill: 'predict',
    kind: 'multi',
    prompt: 'Which of these operations are idempotent — safe to repeat after a crash?',
    options: [
      { text: 'Set user 7’s email address to ann@example.com.', correct: true, why: 'Setting the same value twice leaves the same result.' },
      { text: 'Add £10 to account 7’s balance.', why: 'Doing it twice adds £20.' },
      { text: 'Delete order 42.', correct: true, why: 'The second delete finds nothing to change.' },
      { text: 'Append “login” to the audit log.', why: 'Each append adds another line.' },
      { text: 'Add £10 to account 7’s balance unless message offset 881 is already recorded as applied (the offset is stored with the balance).', correct: true, why: 'Recording the input offset turns a non-idempotent update into an idempotent one.' },
    ],
    explanation: 'Many operations can be made idempotent by storing a little extra information — typically the offset or id of the message that caused the change.',
  },
  {
    id: 'p12.ft.3',
    sectionId: 'fault-tolerance',
    skill: 'design',
    kind: 'justify',
    prompt: 'A consumer reads deposits from a log-based broker and updates balances in a relational database. After a crash, no deposit may be applied twice — or lost. What do you do?',
    options: [
      { text: 'Commit the broker offset before applying each deposit.', why: 'A crash after the commit but before the update loses the deposit (at-most-once).' },
      { text: 'Store the last applied offset in the same database transaction as the balance update, and skip offsets already applied.', correct: true, why: 'The write and the record of progress succeed or fail together.' },
      { text: 'Rely on the stream framework’s checkpoints.', why: 'Checkpoints cover state inside the framework, not writes to an external database.' },
    ],
    reasons: [
      { text: 'After a restart, replayed deposits are recognised by their offset and ignored, so each one has effect exactly once.', correct: true, why: 'Idempotence through stored offsets, with the log replaying in the same order.' },
      { text: 'Committing early guarantees nothing is processed twice, which is all that matters.', why: 'It also allows deposits to vanish — the question rules that out.' },
      { text: 'Relational databases never apply a write twice.', why: 'They apply whatever they are asked to — twice if asked twice.' },
    ],
    explanation: 'Exactly-once **effects** come from making the effect and the progress marker atomic (or the effect idempotent). Committing early gives at-most-once; committing late without idempotence gives at-least-once.',
  },
  {
    id: 'p12.ft.4',
    sectionId: 'fault-tolerance',
    skill: 'sequence',
    kind: 'order',
    prompt: 'Put these events in order for a stale node being stopped by a fencing token.',
    steps: [
      'Node A owns a partition, holding token 7',
      'Node A freezes during a long pause',
      'The coordinator decides A is dead and gives the partition to node B with token 8',
      'Node B writes with token 8, and storage records 8 as the highest token seen',
      'Node A wakes up and tries to write with token 7',
      'Storage rejects the write because 7 is lower than 8',
    ],
    explanation: 'A paused node can’t tell it was replaced. Storage that remembers the highest token it has accepted can refuse writes from any owner that has been superseded.',
  },
  {
    id: 'p12.ft.5',
    sectionId: 'fault-tolerance',
    skill: 'diagnose',
    kind: 'choice',
    prompt:
      'A job with checkpoints every 60 seconds writes one row per minute of results into a dashboard database using plain INSERTs. After a crash and recovery, some minutes appear twice on the dashboard. Why, and what is the fix?',
    options: [
      { text: 'The checkpoint was corrupted; take checkpoints more often.', why: 'More frequent checkpoints shrink the window but don’t remove the duplicates.' },
      { text: 'Recovery replays events since the last checkpoint and repeats writes that had already left the framework; write with an upsert keyed by the minute instead.', correct: true, why: 'An upsert keyed by window is idempotent, so replays overwrite rather than duplicate.' },
      { text: 'The broker delivered events twice; switch brokers.', why: 'Replays after recovery are expected behaviour, not a broker fault.' },
      { text: 'The dashboard database lost the original rows.', why: 'The symptom is extra rows, not missing ones.' },
    ],
    explanation: 'Checkpointing gives exactly-once **inside** the framework. External writes need to be idempotent (or part of an atomic commit) to avoid repeating.',
  },
  {
    id: 'p12.ft.6',
    sectionId: 'fault-tolerance',
    skill: 'explain',
    kind: 'explain',
    prompt:
      'Compare keeping an operator’s state in a remote database with keeping it locally plus a log-compacted changelog topic. What does each cost per event, and how does each recover after a crash?',
    keyPoints: [
      'Remote database: every event needs a network round trip, which is slow at high volume',
      'Remote database: recovery is easy — the state was never on the crashed machine',
      'Local state: reads and writes are fast, but the state is lost when the machine dies',
      'Changelog topic: each change is also written to a compacted topic, and a replacement rebuilds the state by reading it',
    ],
    explanation:
      'A **remote database** makes every event pay a network round trip, but recovery is trivial: a replacement simply carries on using the same database. **Local state** is much faster per event but disappears with the machine, so each change is also sent to a **log-compacted changelog topic**; a replacement reads that topic (only the latest value per key survives compaction) to rebuild the state before resuming. Which wins depends on event volume and how quickly you need to recover.',
  },
];
