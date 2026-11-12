import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router';
import { CHAPTERS, findCard } from '../content/index.ts';
import { db } from '../lib/db.ts';
import { useCardStates, useCustomCards, useNow, useResponses, useSettings } from '../lib/hooks.ts';
import { averageStrength, calibration, findLeeches, reviewForecast } from '../lib/mastery.ts';
import { completedSectionIds, nextStep } from '../lib/progress.ts';
import { countIntroducedToday, dueReviews, newAllowance, newCards } from '../lib/queue.ts';
import type { Chapter } from '../content/types.ts';

function ChapterProgress({ chapter, doneChallenges }: { chapter: Chapter; doneChallenges: ReadonlySet<string> }) {
  const responses = useResponses(chapter.id);
  const states = useCardStates(chapter.id);
  const now = useNow();
  const settings = useSettings();
  if (!responses || !states) return null;
  const sectionsDone = completedSectionIds(chapter, responses).length;
  const strength = averageStrength(chapter.cards, states, now, { requestRetention: settings.requestRetention });
  const step = nextStep(chapter, responses, doneChallenges);
  return (
    <article className="card">
      <header className="row between">
        <h3>
          <Link to={`/chapters/${chapter.id}`}>
            Ch. {chapter.number} · {chapter.title}
          </Link>
        </h3>
        <span className="pill">{Math.round(strength * 100)}% mastery</span>
      </header>
      <div className="progress" aria-label={`${sectionsDone} of ${chapter.sections.length} sections checkpointed`}>
        <span style={{ width: `${(sectionsDone / chapter.sections.length) * 100}%` }} />
      </div>
      <p className="muted small">
        {sectionsDone}/{chapter.sections.length} sections checkpointed · {states.size}/{chapter.cards.length} built-in cards unlocked
      </p>
      {step ? (
        <p>
          Next: <Link to={step.href}>{step.title}</Link> <span className="muted small">— {step.detail}</span>
        </p>
      ) : (
        <p className="ok">Study path complete. Keep up the reviews.</p>
      )}
    </article>
  );
}

export function Dashboard() {
  const now = useNow();
  const settings = useSettings();
  const statesMap = useCardStates();
  const custom = useCustomCards();
  const logs = useLiveQuery(() => db.reviewLogs.toArray(), []);
  const journal = useLiveQuery(() => db.journal.orderBy('createdAt').reverse().limit(3).toArray(), []);
  const challenges = useLiveQuery(() => db.challenges.toArray(), []);
  const doneChallenges = new Set((challenges ?? []).map((c) => c.challengeId));

  if (!statesMap) return <p className="muted">Loading…</p>;
  const states = [...statesMap.values()];
  const due = dueReviews(states, now).length;
  const fresh = Math.min(newCards(states).length, newAllowance(settings.newCardsPerDay, countIntroducedToday(states, now)));
  const forecast = reviewForecast(states, now);
  const maxForecast = Math.max(1, ...forecast.map((d) => d.count));
  const leeches = findLeeches(states).slice(0, 5);
  const buckets = calibration(logs ?? []);
  const reviewsToday = (logs ?? []).filter((l) => l.reviewedAt.toDateString() === now.toDateString()).length;

  return (
    <div className="stack">
      <section className="hero card">
        <div>
          <h1>Today</h1>
          <p className="muted">
            {due} review{due === 1 ? '' : 's'} due · {fresh} new card{fresh === 1 ? '' : 's'} available · {reviewsToday} reviewed today
          </p>
        </div>
        <Link to="/session" className={`button ${due + fresh > 0 ? 'primary' : ''}`}>
          {due + fresh > 0 ? 'Start study session' : 'Open session'}
        </Link>
      </section>

      {states.length === 0 && (
        <section className="card callout">
          <h2>How this works</h2>
          <ol>
            <li>
              <strong>Pretest</strong> — guess answers before reading. Being wrong first makes the chapter stick.
            </li>
            <li>
              <strong>Learn a section</strong> from its lesson (the book is optional), then hide it, work through its <strong>challenges</strong>, and
              write a <strong>checkpoint</strong> from memory graded against key points.
            </li>
            <li>Checkpointing unlocks that section’s cards into <strong>spaced review</strong>, mixed across sections.</li>
            <li>
              Use the <strong>labs</strong> to predict, then run, what storage engines do.
            </li>
            <li>
              Finish with <strong>trade-off matrices</strong>, <strong>teach-back</strong> and <strong>design scenarios</strong>.
            </li>
          </ol>
        </section>
      )}

      <section className="grid two">
        {CHAPTERS.map((chapter) => (
          <ChapterProgress key={chapter.id} chapter={chapter} doneChallenges={doneChallenges} />
        ))}
        <article className="card">
          <h3>Next 7 days</h3>
          <div className="forecast" role="img" aria-label={`Reviews due: ${forecast.map((d) => d.count).join(', ')}`}>
            {forecast.map((day, i) => (
              <div key={day.date.toISOString()} className="forecast-day">
                <span className="forecast-bar" style={{ height: `${(day.count / maxForecast) * 70}%` }} />
                <span className="small mono">{day.count}</span>
                <span className="small muted">{i === 0 ? 'today' : day.date.toLocaleDateString(undefined, { weekday: 'short' })}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="grid two">
        <article className="card">
          <h3>Calibration</h3>
          <p className="muted small">How often you were right at each confidence level. “Certain” should be close to 100%.</p>
          <table className="mini">
            <tbody>
              {buckets.map((b) => (
                <tr key={b.confidence}>
                  <th>{b.label}</th>
                  <td>{b.count} reviews</td>
                  <td>{b.accuracy === null ? '—' : `${Math.round(b.accuracy * 100)}% correct`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
        <article className="card">
          <h3>Weak spots</h3>
          {leeches.length === 0 ? (
            <p className="muted small">No cards forgotten 3+ times. Leeches will show up here.</p>
          ) : (
            <ul className="plain">
              {leeches.map((s) => (
                <li key={s.cardId}>
                  <span className="pill warn">{s.fsrs.lapses} lapses</span> {findCard(s.cardId, custom)?.prompt ?? s.cardId}
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      {journal && journal.length > 0 && (
        <section className="card">
          <h3>Recent reflections</h3>
          <ul className="plain">
            {journal.map((j) => (
              <li key={j.id}>
                <span className="muted small">
                  {j.createdAt.toLocaleDateString()} · {j.correct}/{j.reviewed} correct
                </span>
                <p>{j.text}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
