import { useRef, useState, type FormEvent, type RefObject } from 'react';
import { Link, useParams } from 'react-router';
import { LessonView } from '../components/LessonView.tsx';
import { ProblemSet } from '../components/ProblemSet.tsx';
import { RecallExercise } from '../components/RecallExercise.tsx';
import { RichText } from '../components/RichText.tsx';
import { getChapter, LABS } from '../content/index.ts';
import { problemsFor } from '../content/problems.ts';
import type { Chapter, Section, StudyCard } from '../content/types.ts';
import type { CardStateRecord, ProblemAttemptRecord, ResponseRecord } from '../lib/db.ts';
import { useCardStates, useCustomCards, useNow, useProblemAttempts, useResponses } from '../lib/hooks.ts';
import { addCustomCard, completeCheckpoint, deleteCustomCard, setCardSuspended } from '../lib/repo.ts';
import { formatInterval, State } from '../lib/scheduler.ts';
import { NotFound } from './NotFound.tsx';

function cardStatus(state: CardStateRecord | undefined, now: Date): string {
  if (!state) return 'locked';
  if (state.suspended) return 'suspended';
  if (state.fsrs.state === State.New) return 'new';
  if (state.fsrs.due.getTime() <= now.getTime()) return 'due now';
  return `due in ${formatInterval(now, state.fsrs.due)}`;
}

function AddCardForm({ chapterId, sectionId }: { chapterId: string; sectionId: string }) {
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [points, setPoints] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await addCustomCard({ chapterId, sectionId, prompt, answer, keyPoints: points.split('\n') });
      setPrompt('');
      setAnswer('');
      setPoints('');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not add card.');
    }
  };

  return (
    <form className="add-card" onSubmit={(e) => void submit(e)}>
      <h4>Add your own card</h4>
      <p className="muted small">Cards you write yourself stick best. Ask “why” or “what breaks if…”, not trivia.</p>
      <label>
        Question
        <textarea rows={2} value={prompt} onChange={(e) => setPrompt(e.target.value)} maxLength={1000} required />
      </label>
      <label>
        Answer (your words)
        <textarea rows={3} value={answer} onChange={(e) => setAnswer(e.target.value)} maxLength={3000} required />
      </label>
      <label>
        Key points (one per line, optional)
        <textarea rows={3} value={points} onChange={(e) => setPoints(e.target.value)} maxLength={2000} />
      </label>
      <button className="primary" type="submit">
        Add card
      </button>
      {error && <p className="error">{error}</p>}
    </form>
  );
}

export function SectionPage() {
  const { chapterId, sectionId } = useParams();
  const chapter = getChapter(chapterId);
  const section = chapter?.sections.find((s) => s.id === sectionId);
  const responses = useResponses(chapter?.id ?? '');
  const states = useCardStates(chapter?.id);
  const custom = useCustomCards(chapter?.id);
  const attempts = useProblemAttempts(chapter?.id);
  const now = useNow();

  if (!chapter || !section) return <NotFound />;
  if (!responses || !states || !attempts) return <p className="muted">Loading…</p>;
  return (
    <SectionBody key={section.id} chapter={chapter} section={section} responses={responses} states={states} custom={custom} attempts={attempts} now={now} />
  );
}

interface SectionBodyProps {
  chapter: Chapter;
  section: Section;
  responses: ReadonlyMap<string, ResponseRecord>;
  states: ReadonlyMap<string, CardStateRecord>;
  custom: readonly StudyCard[];
  attempts: ReadonlyMap<string, ProblemAttemptRecord>;
  now: Date;
}

function SectionBody({ chapter, section, responses, states, custom, attempts, now }: SectionBodyProps) {
  const checkpoint = responses.get(`checkpoint:${section.id}`);
  const complete = Boolean(checkpoint?.completedAt);
  const lesson = chapter.lessons.find((l) => l.sectionId === section.id);
  const [lessonOpen, setLessonOpen] = useState(!complete);
  const practiceRef = useRef<HTMLElement>(null);
  const checkpointRef = useRef<HTMLElement>(null);
  const problems = problemsFor(chapter.id).filter((p) => p.sectionId === section.id);
  const step = (n: number) => n + (problems.length > 0 ? 1 : 0);

  const index = chapter.sections.indexOf(section);
  const next = chapter.sections[index + 1];
  const sectionCards: StudyCard[] = chapter.cards.filter((c) => c.sectionId === section.id);
  const customCards = custom.filter((c) => c.sectionId === section.id);
  const pretest = chapter.pretest.filter((q) => q.sectionId === section.id);
  const labs = LABS.filter((l) => l.chapterId === chapter.id && l.sectionId === section.id);
  const conceptNames = chapter.concepts.filter((c) => c.sectionId === section.id).map((c) => c.name);
  // Challenges and the checkpoint only work as retrieval, so they stay hidden while the lesson is visible.
  const gated = Boolean(lesson) && lessonOpen;

  const hideLessonAndGo = (target: RefObject<HTMLElement | null>) => {
    setLessonOpen(false);
    requestAnimationFrame(() => target.current?.scrollIntoView?.({ block: 'start' }));
  };
  const startPractice = () => hideLessonAndGo(problems.length > 0 ? practiceRef : checkpointRef);
  const startCheckpoint = () => hideLessonAndGo(checkpointRef);

  const bookPages = (
    <>
      Pages <strong>{section.pages}</strong>: {section.headings.join(' · ')}
    </>
  );

  const pretestBox = pretest.length > 0 && (
    <div className="reveal-box">
      <strong>Your pretest guesses for this section</strong>
      {pretest.map((q) => (
        <p key={q.id} className="small">
          <em>{q.prompt}</em>
          <br />
          {responses.get(`pretest:${q.id}`)?.text ?? <span className="muted">(not answered)</span>}
        </p>
      ))}
      <p className="muted small">As you learn: where was your guess right, and where was it wrong?</p>
    </div>
  );

  return (
    <div className="stack narrow">
      <p className="eyebrow">
        <Link to={`/chapters/${chapter.id}`}>Chapter {chapter.number}</Link> · Section {index + 1} of {chapter.sections.length}
      </p>
      <h1>{section.title}</h1>

      {lesson ? (
        <section className="card">
          <div className="row between">
            <h2>1 · Learn</h2>
            <button onClick={() => setLessonOpen((open) => !open)} aria-expanded={lessonOpen}>
              {lessonOpen ? 'Hide lesson' : complete ? 'Review the lesson' : 'Show lesson'}
            </button>
          </div>
          <p className="muted small">In this lesson: {conceptNames.join(' · ')}</p>
          {lessonOpen ? (
            <>
              {pretestBox}
              <LessonView lesson={lesson} />
              <div className="lesson-actions row gap">
                <button className="primary" onClick={startPractice}>
                  {complete ? 'Hide the lesson' : problems.length > 0 ? 'I’m ready — hide the lesson and take the challenges' : 'I’m ready — hide the lesson and test myself'}
                </button>
              </div>
            </>
          ) : (
            <p className="muted">{complete ? 'Lesson hidden.' : problems.length > 0 ? 'Lesson hidden — now apply it.' : 'Lesson hidden — now write the checkpoint from memory.'}</p>
          )}
          <details className="small book-ref">
            <summary>Go deeper in the book (optional)</summary>
            <p>{bookPages}</p>
          </details>
        </section>
      ) : (
        <section className="card">
          <h2>1 · Read in the book</h2>
          <p>{bookPages}</p>
          <p className="muted small">Look for: {conceptNames.join(' · ')}</p>
          {pretestBox}
        </section>
      )}

      {problems.length > 0 && (
        <section className="card" ref={practiceRef}>
          <h2>2 · Apply it</h2>
          {gated ? (
            <div className="reveal-box">
              <p>
                {problems.length} challenges that make you use what you just learned — predicting, diagnosing, calculating and designing. They only work without
                the lesson in view.
              </p>
              <button className="primary" onClick={startPractice}>
                Hide lesson &amp; start the challenges
              </button>
            </div>
          ) : (
            <>
              <p className="muted small">
                Commit to an answer and say how sure you are before checking. Wrong-but-certain answers are the most useful ones to find.
              </p>
              <ProblemSet chapterId={chapter.id} problems={problems} attempts={attempts} />
            </>
          )}
        </section>
      )}

      <section className="card" ref={checkpointRef}>
        <h2>{step(2)} · Checkpoint from memory</h2>
        {gated ? (
          <div className="reveal-box">
            <p>The checkpoint only works if you write without looking, so the lesson has to be hidden first.</p>
            <button className="primary" onClick={startCheckpoint}>
              Hide lesson &amp; start checkpoint
            </button>
          </div>
        ) : (
          <>
            <p className="muted small">Write from memory, then grade yourself against the key points. Saving unlocks this section’s cards.</p>
            <RecallExercise
              key={checkpoint?.updatedAt.getTime() ?? 'new'}
              prompt={section.checkpoint.prompt}
              keyPoints={section.checkpoint.keyPoints}
              initialText={checkpoint?.text}
              initialCovered={checkpoint?.covered}
              completed={complete}
              saveLabel={complete ? 'Save' : 'Save & unlock cards'}
              onSave={async (text, covered) => {
                await completeCheckpoint(chapter.id, section.id, text, covered, sectionCards);
              }}
            />
          </>
        )}
        {pretest.length > 0 && complete && (
          <p className="small">
            Pretest answers for this section are now unlocked on the <Link to={`/chapters/${chapter.id}/pretest`}>pretest page</Link>.
          </p>
        )}
      </section>

      {complete && (
        <section className="card">
          <h2>{step(3)} · Cards now in your review pool</h2>
          <p className="muted small">Untick any card you don’t want to review. Answers stay hidden here so reviews remain real retrieval practice.</p>
          <ul className="card-list">
            {[...sectionCards, ...customCards].map((card) => {
              const state = states.get(card.id);
              const isCustom = card.id.startsWith('custom.');
              return (
                <li key={card.id}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={Boolean(state && !state.suspended)}
                      disabled={!state}
                      onChange={(e) => void setCardSuspended(card.id, !e.target.checked)}
                      aria-label="Include in reviews"
                    />
                    <span>
                      <RichText text={card.prompt} inline />
                    </span>
                  </label>
                  <span className="row gap small">
                    <span className="muted">{isCustom ? 'yours · ' : ''}{cardStatus(state, now)}</span>
                    {isCustom && (
                      <button className="link danger" onClick={() => void deleteCustomCard(card.id)}>
                        delete
                      </button>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <AddCardForm chapterId={chapter.id} sectionId={section.id} />
        </section>
      )}

      <nav className="row between" aria-label="Section navigation">
        <span>
          {labs.map((lab) => (
            <Link key={lab.id} to={`/labs/${lab.id}`} className="button">
              Try the {lab.title}
            </Link>
          ))}
        </span>
        {next ? (
          <Link to={`/chapters/${chapter.id}/sections/${next.id}`} className="button primary">
            Next: {next.title} →
          </Link>
        ) : (
          <Link to={`/chapters/${chapter.id}/synthesis`} className="button primary">
            On to synthesis →
          </Link>
        )}
      </nav>
    </div>
  );
}
