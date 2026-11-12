import { Link, useParams } from 'react-router';
import { RecallExercise } from '../components/RecallExercise.tsx';
import { getChapter } from '../content/index.ts';
import { useResponses } from '../lib/hooks.ts';
import { saveResponse } from '../lib/repo.ts';
import { NotFound } from './NotFound.tsx';

export function ScenariosPage() {
  const { chapterId } = useParams();
  const chapter = getChapter(chapterId);
  const responses = useResponses(chapter?.id ?? '');
  if (!chapter) return <NotFound />;
  if (!responses) return <p className="muted">Loading…</p>;

  return (
    <div className="stack narrow">
      <p className="eyebrow">
        <Link to={`/chapters/${chapter.id}`}>Chapter {chapter.number}</Link> · Design scenarios
      </p>
      <h1>Apply it</h1>
      <p className="lead">There’s no single right design. Justify each choice with a trade-off from the chapter; the key points are what a strong answer mentions.</p>
      {chapter.scenarios.map((scenario) => {
        const saved = responses.get(`scenario:${scenario.id}`);
        return (
          <section key={scenario.id} className="card">
            <h2>{scenario.title}</h2>
            <p>{scenario.brief}</p>
            <div className="grid two compact">
              <div>
                <h4>Requirements</h4>
                <ul>
                  {scenario.requirements.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h4>Answer these</h4>
                <ol>
                  {scenario.questions.map((q) => (
                    <li key={q}>{q}</li>
                  ))}
                </ol>
              </div>
            </div>
            <RecallExercise
              prompt="Your design:"
              keyPoints={scenario.keyPoints}
              initialText={saved?.text}
              initialCovered={saved?.covered}
              completed={Boolean(saved?.completedAt)}
              placeholder="Engine choice, key/layout design, failure modes, how you'd validate it…"
              onSave={async (text, covered) => {
                await saveResponse({ chapterId: chapter.id, kind: 'scenario', refId: scenario.id, text, covered, complete: true });
              }}
            />
          </section>
        );
      })}
    </div>
  );
}
