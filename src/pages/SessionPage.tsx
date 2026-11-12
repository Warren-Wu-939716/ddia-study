import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { ReviewCard, type GradeResult } from '../components/ReviewCard.tsx';
import { CHAPTERS, findCard, getChapter } from '../content/index.ts';
import { problemsFor } from '../content/problems.ts';
import type { StudyCard } from '../content/types.ts';
import { db, type CardStateRecord, type ResponseRecord } from '../lib/db.ts';
import { useNow, useSettings } from '../lib/hooks.ts';
import { suggestDeepTask, type StepLink } from '../lib/progress.ts';
import { buildSessionQueue, countIntroducedToday, REQUEUE_WINDOW_MS, requeuePosition } from '../lib/queue.ts';
import { addJournalEntry, loadSettings, recordReview, toStudyCard } from '../lib/repo.ts';
import { formatInterval, GRADES, previewDueDates, Rating, State, type Grade } from '../lib/scheduler.ts';

type Phase = 'loading' | 'review' | 'deep' | 'reflect' | 'done';

interface SessionStats {
  reviewed: number;
  correct: number;
  again: number;
}

function useDeepTask(): StepLink | null {
  const responses = useLiveQuery(() => db.responses.toArray(), []);
  const challenges = useLiveQuery(() => db.challenges.toArray(), []);
  const attempts = useLiveQuery(() => db.problemAttempts.toArray(), []);
  const now = useNow();
  return useMemo(() => {
    if (!responses || !challenges || !attempts) return null;
    const done = new Set(challenges.map((c) => c.challengeId));
    for (const chapter of CHAPTERS) {
      const map = new Map<string, ResponseRecord>(
        responses.filter((r) => r.chapterId === chapter.id).map((r) => [`${r.kind}:${r.refId}`, r]),
      );
      const tries = new Map(attempts.filter((a) => a.chapterId === chapter.id).map((a) => [a.problemId, a]));
      const task = suggestDeepTask(chapter, map, done, { problems: problemsFor(chapter.id), attempts: tries }, now);
      if (task) return task;
    }
    return null;
  }, [responses, challenges, attempts, now]);
}

/**
 * Daily session: interleaved reviews → one deep task → a short reflection.
 * The queue is computed once at the start so it doesn't shift under you.
 */
export function SessionPage() {
  const settings = useSettings();
  const deepTask = useDeepTask();
  const now = useNow(30_000);
  const [phase, setPhase] = useState<Phase>('loading');
  const [queue, setQueue] = useState<string[]>([]);
  const [states, setStates] = useState<Map<string, CardStateRecord>>(new Map());
  const [customCards, setCustomCards] = useState<StudyCard[]>([]);
  const [stats, setStats] = useState<SessionStats>({ reviewed: 0, correct: 0, again: 0 });
  const [turn, setTurn] = useState(0);
  const [reflection, setReflection] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [all, custom, prefs] = await Promise.all([db.cardStates.toArray(), db.customCards.toArray(), loadSettings()]);
      if (cancelled) return;
      const now = new Date();
      const cards = custom.map(toStudyCard);
      const ids = buildSessionQueue({
        states: all,
        now,
        newLimit: prefs.newCardsPerDay,
        introducedToday: countIntroducedToday(all, now),
      }).filter((id) => findCard(id, cards));
      setCustomCards(cards);
      setStates(new Map(all.map((s) => [s.cardId, s])));
      setQueue(ids);
      setPhase(ids.length > 0 ? 'review' : 'deep');
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentId = queue[0];
  const card = currentId ? findCard(currentId, customCards) : undefined;
  const state = currentId ? states.get(currentId) : undefined;
  const dueLabels = useMemo(() => {
    if (!state) return null;
    const dates = previewDueDates(state.fsrs, now, { requestRetention: settings.requestRetention });
    return Object.fromEntries(GRADES.map((g) => [g, formatInterval(now, dates[g])])) as Record<Grade, string>;
  }, [state, now, settings.requestRetention]);

  const grade = async (result: GradeResult) => {
    if (!currentId) return;
    try {
      const updated = await recordReview({ cardId: currentId, ...result }, settings.requestRetention);
      const rest = queue.slice(1);
      if (updated.fsrs.due.getTime() - Date.now() <= REQUEUE_WINDOW_MS) {
        rest.splice(requeuePosition(rest.length), 0, currentId);
      }
      setStates((prev) => new Map(prev).set(currentId, updated));
      setStats((s) => ({
        reviewed: s.reviewed + 1,
        correct: s.correct + (result.correct ? 1 : 0),
        again: s.again + (result.grade === Rating.Again ? 1 : 0),
      }));
      setQueue(rest);
      setTurn((t) => t + 1);
      setError(null);
      if (rest.length === 0) setPhase('deep');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the review.');
    }
  };

  const nextDue = useMemo(() => {
    const upcoming = [...states.values()]
      .filter((s) => !s.suspended && s.fsrs.state !== State.New)
      .map((s) => s.fsrs.due)
      .sort((a, b) => a.getTime() - b.getTime());
    return upcoming[0] ?? null;
  }, [states]);

  if (phase === 'loading') return <p className="muted">Building today’s queue…</p>;

  if (phase === 'review' && card && state && dueLabels) {
    const chapter = getChapter(card.chapterId);
    const section = chapter?.sections.find((s) => s.id === card.sectionId);
    return (
      <div className="stack narrow">
        <div className="row between">
          <p className="eyebrow">
            Review · {queue.length} left · {stats.reviewed} done
          </p>
          <button className="link" onClick={() => setPhase('deep')}>
            End reviews
          </button>
        </div>
        <div className="progress thin" aria-hidden="true">
          <span style={{ width: `${(stats.reviewed / Math.max(1, stats.reviewed + queue.length)) * 100}%` }} />
        </div>
        <ReviewCard
          key={`${currentId}-${turn}`}
          card={card}
          dueLabels={dueLabels}
          context={`Ch. ${chapter?.number} · ${section?.title ?? ''}${state.fsrs.state === State.New ? ' · new' : ''}`}
          lessonHref={
            chapter?.lessons.some((l) => l.sectionId === card.sectionId) ? `#/chapters/${card.chapterId}/sections/${card.sectionId}` : undefined
          }
          onGrade={grade}
        />
        {error && <p className="error">{error}</p>}
      </div>
    );
  }

  if (phase === 'deep' || phase === 'review') {
    return (
      <div className="stack narrow">
        {stats.reviewed > 0 ? (
          <section className="card">
            <h1>Reviews done</h1>
            <p>
              {stats.reviewed} reviewed · {stats.correct} correct · {stats.again} marked Again
            </p>
          </section>
        ) : (
          <section className="card">
            <h1>Nothing due right now</h1>
            <p className="muted">
              {nextDue ? `Next review ${nextDue <= now ? 'is due now — reload to start' : `in ${formatInterval(now, nextDue)}`}.` : 'Checkpoint a section to unlock cards.'}
            </p>
          </section>
        )}
        <section className="card">
          <h2>Deep task</h2>
          {deepTask ? (
            <>
              <p>
                <strong>{deepTask.title}</strong>
              </p>
              <p className="muted">{deepTask.detail}</p>
              <div className="row gap">
                <Link to={deepTask.href} className="button primary">
                  Do it now
                </Link>
                <button onClick={() => setPhase('reflect')}>Skip to reflection</button>
              </div>
            </>
          ) : (
            <>
              <p className="muted">
                No deep task available yet — learn and checkpoint a section first, or you’ve done them all. <Link to="/chapters">Go to chapters</Link>.
              </p>
              <button onClick={() => setPhase('reflect')}>Continue to reflection</button>
            </>
          )}
        </section>
      </div>
    );
  }

  if (phase === 'reflect') {
    return (
      <div className="stack narrow">
        <section className="card">
          <h1>Reflect</h1>
          <label htmlFor="reflection">What confused you today? What will you re-read or ask about?</label>
          <textarea id="reflection" rows={5} maxLength={5000} value={reflection} onChange={(e) => setReflection(e.target.value)} />
          <div className="row gap">
            <button
              className="primary"
              onClick={() =>
                void (async () => {
                  if (reflection.trim()) await addJournalEntry(reflection, stats.reviewed, stats.correct);
                  setPhase('done');
                })()
              }
            >
              Finish session
            </button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="stack narrow">
      <section className="card">
        <h1>Session complete</h1>
        <p>Come back tomorrow — spacing is what makes it stick.</p>
        <Link to="/" className="button primary">
          Back to today
        </Link>
      </section>
    </div>
  );
}
