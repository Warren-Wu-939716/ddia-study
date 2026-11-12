import { Link, useParams } from 'react-router';
import { RecallExercise } from '../components/RecallExercise.tsx';
import { TradeoffQuiz } from '../components/TradeoffQuiz.tsx';
import { getChapter } from '../content/index.ts';
import { completedSections, useResponses } from '../lib/hooks.ts';
import { saveResponse } from '../lib/repo.ts';
import { NotFound } from './NotFound.tsx';

export function SynthesisPage() {
  const { chapterId } = useParams();
  const chapter = getChapter(chapterId);
  const responses = useResponses(chapter?.id ?? '');
  if (!chapter) return <NotFound />;
  if (!responses) return <p className="muted">Loading…</p>;
  const done = completedSections(responses);

  return (
    <div className="stack">
      <p className="eyebrow">
        <Link to={`/chapters/${chapter.id}`}>Chapter {chapter.number}</Link> · Synthesis
      </p>
      <h1>Connect the ideas</h1>
      <p className="lead">
        Facts become understanding when you can compare designs and explain them to someone else. Do these after the lessons — and again a few
        days later.
      </p>

      {chapter.tradeoffs.map((matrix) => (
        <TradeoffQuiz key={matrix.id} chapterId={chapter.id} matrix={matrix} responses={responses} />
      ))}

      <h2>Teach it back</h2>
      <p className="muted">Explain it as if to a new teammate, in plain words, without the book. Then check the key points.</p>
      {chapter.teachBack.map((prompt) => {
        const saved = responses.get(`teachback:${prompt.id}`);
        const ready = prompt.sectionIds.every((s) => done.has(s));
        return (
          <section key={prompt.id} className="card">
            {!ready && (
              <p className="muted small">
                Tip: checkpoint{' '}
                {prompt.sectionIds
                  .filter((s) => !done.has(s))
                  .map((s) => chapter.sections.find((x) => x.id === s)?.title)
                  .join(', ')}{' '}
                first.
              </p>
            )}
            <RecallExercise
              prompt={prompt.prompt}
              keyPoints={prompt.keyPoints}
              initialText={saved?.text}
              initialCovered={saved?.covered}
              completed={Boolean(saved?.completedAt)}
              placeholder="Explain it simply. If you get stuck, that’s the gap to study."
              onSave={async (text, covered) => {
                await saveResponse({ chapterId: chapter.id, kind: 'teachback', refId: prompt.id, text, covered, complete: true });
              }}
            />
          </section>
        );
      })}
    </div>
  );
}
