import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { getChapter } from '../content/index.ts';
import { completedSections, useResponses } from '../lib/hooks.ts';
import { saveResponse } from '../lib/repo.ts';
import { NotFound } from './NotFound.tsx';

export function PretestPage() {
  const { chapterId } = useParams();
  const chapter = getChapter(chapterId);
  const responses = useResponses(chapter?.id ?? '');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  if (!chapter) return <NotFound />;
  if (!responses) return <p className="muted">Loading…</p>;
  const done = completedSections(responses);

  const valueFor = (id: string) => drafts[id] ?? responses.get(`pretest:${id}`)?.text ?? '';

  const saveAll = async () => {
    for (const q of chapter.pretest) {
      const text = valueFor(q.id).trim();
      if (text) await saveResponse({ chapterId: chapter.id, kind: 'pretest', refId: q.id, text, complete: true });
    }
    setSaved(true);
  };

  return (
    <div className="stack narrow">
      <p className="eyebrow">
        <Link to={`/chapters/${chapter.id}`}>Chapter {chapter.number}</Link> · Pretest
      </p>
      <h1>Guess first</h1>
      <p className="lead">
        Answer before studying the lessons. You’re not expected to know — attempting an answer primes your brain to notice the explanation when you
        meet it. Each answer unlocks after you checkpoint its section.
      </p>
      {chapter.pretest.map((q, i) => {
        const section = chapter.sections.find((s) => s.id === q.sectionId);
        const unlocked = done.has(q.sectionId);
        return (
          <section key={q.id} className="card">
            <label htmlFor={q.id}>
              <strong>{i + 1}.</strong> {q.prompt}
            </label>
            <textarea
              id={q.id}
              rows={3}
              maxLength={2000}
              value={valueFor(q.id)}
              onChange={(e) => {
                setSaved(false);
                setDrafts((d) => ({ ...d, [q.id]: e.target.value }));
              }}
              placeholder="Your best guess…"
            />
            {unlocked ? (
              <div className="reveal-box">
                <strong>Answer:</strong> {q.answer}
              </div>
            ) : (
              <p className="muted small">
                Answer unlocks after the checkpoint for <Link to={`/chapters/${chapter.id}/sections/${q.sectionId}`}>{section?.title}</Link>.
              </p>
            )}
          </section>
        );
      })}
      <div className="row gap">
        <button className="primary" onClick={() => void saveAll()}>
          Save guesses
        </button>
        {saved && (
          <span className="ok">
            Saved. Now <Link to={`/chapters/${chapter.id}/sections/${chapter.sections[0].id}`}>start the first lesson</Link>.
          </span>
        )}
      </div>
    </div>
  );
}
