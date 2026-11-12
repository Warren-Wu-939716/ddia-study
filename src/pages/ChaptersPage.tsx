import { Link } from 'react-router';
import { BOOK_CHAPTERS, chapterByNumber } from '../content/index.ts';

export function ChaptersPage() {
  return (
    <div className="stack">
      <h1>Chapters</h1>
      <p className="muted">Designing Data-Intensive Applications, 2nd edition. Chapters gain study content as you add it.</p>
      <ol className="chapter-list">
        {BOOK_CHAPTERS.map((entry) => {
          const chapter = chapterByNumber(entry.number);
          return (
            <li key={entry.number} className={chapter ? 'available' : 'pending'}>
              <span className="num">{entry.number}</span>
              {chapter ? <Link to={`/chapters/${chapter.id}`}>{entry.title}</Link> : <span>{entry.title}</span>}
              {!chapter && <span className="muted small">not added yet</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
