import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ConceptMap } from '../components/ConceptMap.tsx';
import { getChapter, LABS } from '../content/index.ts';
import { problemsFor } from '../content/problems.ts';
import { db } from '../lib/db.ts';
import { useCardStates, useCustomCards, useNow, useProblemAttempts, useResponses, useSettings } from '../lib/hooks.ts';
import { averageStrength, conceptMastery } from '../lib/mastery.ts';
import { summarizeProblems } from '../lib/problems.ts';
import { CHALLENGES_BY_LAB } from '../sims/challenges.ts';
import { NotFound } from './NotFound.tsx';

export function ChapterPage() {
  const { chapterId } = useParams();
  const chapter = getChapter(chapterId);
  const responses = useResponses(chapter?.id ?? '');
  const states = useCardStates(chapter?.id);
  const custom = useCustomCards(chapter?.id);
  const settings = useSettings();
  const now = useNow();
  const challengeRecords = useLiveQuery(() => db.challenges.toArray(), []);
  const attempts = useProblemAttempts(chapter?.id);
  const [selected, setSelected] = useState<string | null>(null);

  const allCards = useMemo(() => [...(chapter?.cards ?? []), ...custom], [chapter, custom]);
  const mastery = useMemo(() => {
    const map = new Map<string, number>();
    if (!chapter || !states) return map;
    for (const concept of chapter.concepts) {
      map.set(concept.id, conceptMastery(concept, allCards, states, now, { requestRetention: settings.requestRetention }).mastery);
    }
    return map;
  }, [chapter, states, allCards, now, settings.requestRetention]);

  if (!chapter) return <NotFound />;
  if (!responses || !states) return <p className="muted">Loading…</p>;

  const done = (kind: string, id: string) => Boolean(responses.get(`${kind}:${id}`)?.completedAt);
  const pretestAnswered = chapter.pretest.filter((q) => responses.has(`pretest:${q.id}`)).length;
  const doneChallenges = new Set((challengeRecords ?? []).map((c) => c.challengeId));
  const tradeoffRows = chapter.tradeoffs.flatMap((m) => m.rows.map((r) => `${m.id}.${r.id}`));
  const tradeoffsAnswered = tradeoffRows.filter((id) => responses.has(`tradeoff:${id}`)).length;
  const teachDone = chapter.teachBack.filter((t) => done('teachback', t.id)).length;
  const scenariosDone = chapter.scenarios.filter((s) => done('scenario', s.id)).length;
  const selectedConcept = chapter.concepts.find((c) => c.id === selected);
  const selectedSummary = selectedConcept
    ? conceptMastery(selectedConcept, allCards, states, now, { requestRetention: settings.requestRetention })
    : null;
  const overall = averageStrength(allCards, states, now, { requestRetention: settings.requestRetention });

  return (
    <div className="stack">
      <header>
        <p className="eyebrow">
          Chapter {chapter.number} · pp. {chapter.pages}
        </p>
        <h1>{chapter.title}</h1>
        <p className="lead">{chapter.overview}</p>
        <details>
          <summary>Learning goals</summary>
          <ul>
            {chapter.goals.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        </details>
      </header>

      <section className="card">
        <h2>Study path</h2>
        <ol className="path">
          <li className={pretestAnswered === chapter.pretest.length ? 'done' : ''}>
            <div>
              <Link to="pretest">1 · Pretest</Link>
              <span className="muted small">
                {pretestAnswered}/{chapter.pretest.length} guessed — before you read
              </span>
            </div>
          </li>
          <li>
            <div>
              <strong>2 · Learn, apply &amp; checkpoint each section</strong>
            </div>
            <ol className="sections">
              {chapter.sections.map((section) => {
                const unlocked = chapter.cards.filter((c) => c.sectionId === section.id && states.has(c.id)).length;
                const total = chapter.cards.filter((c) => c.sectionId === section.id).length;
                const problems = problemsFor(chapter.id).filter((p) => p.sectionId === section.id);
                const scored = summarizeProblems(problems, attempts ?? new Map());
                return (
                  <li key={section.id} className={done('checkpoint', section.id) ? 'done' : ''}>
                    <Link to={`sections/${section.id}`}>{section.title}</Link>
                    <span className="muted small">
                      pp. {section.pages} · {unlocked}/{total} cards
                      {problems.length > 0 && ` · challenges ${scored.answered ? `${scored.mastered}/${problems.length} mastered` : 'not started'}`}
                    </span>
                  </li>
                );
              })}
            </ol>
          </li>
          <li>
            <div>
              <strong>3 · Labs</strong> <span className="muted small">predict, then run</span>
            </div>
            <ul className="sections">
              {LABS.filter((l) => chapter.labs.includes(l.id)).map((lab) => {
                const list = CHALLENGES_BY_LAB[lab.id];
                const count = list.filter((c) => doneChallenges.has(c.id)).length;
                return (
                  <li key={lab.id} className={count === list.length ? 'done' : ''}>
                    <Link to={`/labs/${lab.id}`}>{lab.title}</Link>
                    <span className="muted small">
                      {count}/{list.length} challenges
                    </span>
                  </li>
                );
              })}
            </ul>
          </li>
          <li className={tradeoffsAnswered === tradeoffRows.length && teachDone === chapter.teachBack.length ? 'done' : ''}>
            <div>
              <Link to="synthesis">4 · Synthesis</Link>
              <span className="muted small">
                trade-offs {tradeoffsAnswered}/{tradeoffRows.length} · teach-back {teachDone}/{chapter.teachBack.length}
              </span>
            </div>
          </li>
          <li className={scenariosDone === chapter.scenarios.length ? 'done' : ''}>
            <div>
              <Link to="scenarios">5 · Design scenarios</Link>
              <span className="muted small">
                {scenariosDone}/{chapter.scenarios.length}
              </span>
            </div>
          </li>
        </ol>
      </section>

      <section className="card">
        <div className="row between">
          <h2>Concept map</h2>
          <span className="pill">{Math.round(overall * 100)}% chapter mastery</span>
        </div>
        <p className="muted small">
          Arrows point from prerequisites to the ideas built on them. Colour shows mastery (recall probability × memory durability). Select a
          concept for details.
        </p>
        <ConceptMap concepts={chapter.concepts} mastery={mastery} selectedId={selected} onSelect={(id) => setSelected(id === selected ? null : id)} />
        {selectedConcept && selectedSummary && (
          <div className="concept-detail" aria-live="polite">
            <h3>{selectedConcept.name}</h3>
            <p>{selectedConcept.summary}</p>
            <p className="muted small">
              {Math.round(selectedSummary.mastery * 100)}% mastery · {selectedSummary.reviewedCards}/{selectedSummary.totalCards} cards reviewed ·
              section: <Link to={`sections/${selectedConcept.sectionId}`}>{chapter.sections.find((s) => s.id === selectedConcept.sectionId)?.title}</Link>
            </p>
            {selectedConcept.prerequisites.length > 0 && (
              <p className="small">
                Builds on:{' '}
                {selectedConcept.prerequisites.map((p, i) => (
                  <span key={p}>
                    {i > 0 && ', '}
                    <button className="link" onClick={() => setSelected(p)}>
                      {chapter.concepts.find((c) => c.id === p)?.name ?? p}
                    </button>
                  </span>
                ))}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
