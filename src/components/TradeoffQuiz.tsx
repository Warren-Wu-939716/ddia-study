import { useState } from 'react';
import type { TradeoffMatrix } from '../content/types.ts';
import type { ResponseRecord } from '../lib/db.ts';
import { saveResponse } from '../lib/repo.ts';

interface TradeoffQuizProps {
  chapterId: string;
  matrix: TradeoffMatrix;
  responses: ReadonlyMap<string, ResponseRecord>;
}

/** Decide which design wins on each dimension before seeing the reference — then compare. */
export function TradeoffQuiz({ chapterId, matrix, responses }: TradeoffQuizProps) {
  const saved = (rowId: string) => responses.get(`tradeoff:${matrix.id}.${rowId}`);
  const [choices, setChoices] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      matrix.rows.flatMap((r) => {
        const choice = saved(r.id)?.choice;
        return choice ? [[r.id, choice]] : [];
      }),
    ),
  );
  const [revealed, setRevealed] = useState(() => matrix.rows.every((r) => saved(r.id)));

  const options = [...matrix.columns, { id: 'depends', label: 'Depends' }];
  const answered = matrix.rows.filter((r) => choices[r.id]).length;
  const score = matrix.rows.filter((r) => choices[r.id] === r.answer).length;

  const check = async () => {
    for (const row of matrix.rows) {
      const choice = choices[row.id];
      if (!choice) continue;
      await saveResponse({ chapterId, kind: 'tradeoff', refId: `${matrix.id}.${row.id}`, text: '', choice, complete: true });
    }
    setRevealed(true);
  };

  return (
    <section className="card">
      <div className="row between">
        <h2>{matrix.title}</h2>
        {revealed && (
          <span className="pill">
            {score}/{matrix.rows.length} match the reference
          </span>
        )}
      </div>
      <table className="tradeoff">
        <thead>
          <tr>
            <th scope="col">Dimension</th>
            <th scope="col">Which generally wins?</th>
            {revealed && <th scope="col">Reference</th>}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((row) => {
            const choice = choices[row.id];
            const match = choice === row.answer;
            return (
              <tr key={row.id} className={revealed ? (match ? 'match' : 'mismatch') : ''}>
                <th scope="row">{row.dimension}</th>
                <td>
                  <div className="segmented" role="radiogroup" aria-label={row.dimension}>
                    {options.map((o) => (
                      <button
                        key={o.id}
                        role="radio"
                        aria-checked={choice === o.id}
                        className={choice === o.id ? 'selected' : ''}
                        disabled={revealed}
                        onClick={() => setChoices((c) => ({ ...c, [row.id]: o.id }))}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </td>
                {revealed && (
                  <td>
                    <strong>{options.find((o) => o.id === row.answer)?.label}</strong> — {row.why}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="row gap">
        {revealed ? (
          <button
            onClick={() => {
              setChoices({});
              setRevealed(false);
            }}
          >
            Try again from scratch
          </button>
        ) : (
          <button className="primary" disabled={answered === 0} onClick={() => void check()}>
            Check {answered}/{matrix.rows.length}
          </button>
        )}
        <span className="muted small">For each mismatch, say out loud why the reference is right (or where it depends).</span>
      </div>
    </section>
  );
}
