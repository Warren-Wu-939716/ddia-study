import { Link } from 'react-router';
import { getLab } from '../content/index.ts';
import type { Lesson, LessonBlock } from '../content/types.ts';
import { WIDGETS } from '../widgets/registry.ts';
import { Flip } from './Flip.tsx';
import { RichText } from './RichText.tsx';

function Block({ block }: { block: LessonBlock }) {
  switch (block.kind) {
    case 'text':
      return (
        <section className="lesson-text">
          {block.title && <h3>{block.title}</h3>}
          <RichText text={block.body} />
        </section>
      );
    case 'steps':
      return (
        <section>
          <h3>{block.title}</h3>
          <ol className="lesson-steps">
            {block.steps.map((step, i) => (
              <li key={i}>
                <RichText text={step} inline />
              </li>
            ))}
          </ol>
        </section>
      );
    case 'diagram':
      return (
        <figure className="lesson-diagram">
          <figcaption>{block.title}</figcaption>
          <pre>{block.art}</pre>
          {block.caption && <p className="muted small">{block.caption}</p>}
        </figure>
      );
    case 'table':
      return (
        <div className="lesson-table-wrap">
          <table className="lesson-table">
            <caption>{block.title}</caption>
            <thead>
              <tr>
                {block.head.map((h, i) => (
                  <th key={i} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) =>
                    // An empty first header means the first column holds row labels.
                    c === 0 && block.head[0] === '' ? (
                      <th key={c} scope="row">
                        <RichText text={cell} inline />
                      </th>
                    ) : (
                      <td key={c}>
                        <RichText text={cell} inline />
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'analogy':
      return (
        <aside className="lesson-callout analogy">
          <strong>Analogy</strong>
          <RichText text={block.body} />
        </aside>
      );
    case 'pitfall':
      return (
        <aside className="lesson-callout pitfall">
          <strong>Common mix-up</strong>
          <RichText text={block.body} />
        </aside>
      );
    case 'check':
      return (
        <details className="lesson-check">
          <summary>
            <span className="label">Quick check</span> <RichText text={block.question} inline />
          </summary>
          <div className="lesson-check-answer">
            <RichText text={block.answer} />
          </div>
        </details>
      );
    case 'try': {
      const lab = getLab(block.labId);
      return (
        <aside className="lesson-callout try">
          <strong>Try it</strong>
          <p>
            <RichText text={block.body} inline />{' '}
            {lab && <Link to={`/labs/${lab.id}`}>Open the {lab.title} →</Link>}
          </p>
        </aside>
      );
    }
    case 'widget': {
      const Widget = WIDGETS[block.widget];
      return (
        <section className="widget" aria-label={`Interactive: ${block.title}`}>
          <header className="widget-head">
            <span className="widget-badge">Interactive</span>
            <h3>{block.title}</h3>
          </header>
          {block.body && <RichText text={block.body} />}
          <Flip>
            <Widget />
          </Flip>
        </section>
      );
    }
  }
}

/** Renders a section lesson: intro, explanation blocks, then key takeaways. */
export function LessonView({ lesson }: { lesson: Lesson }) {
  return (
    <div className="lesson">
      <p className="lesson-intro">
        <RichText text={lesson.intro} inline />
      </p>
      {lesson.blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
      <section className="lesson-takeaways">
        <h3>Key takeaways</h3>
        <ul>
          {lesson.takeaways.map((t, i) => (
            <li key={i}>
              <RichText text={t} inline />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
