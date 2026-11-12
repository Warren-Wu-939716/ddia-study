import { Fragment, useMemo, useState } from 'react';
import { RichText } from '../components/RichText.tsx';
import { Segmented } from '../components/Segmented.tsx';
import { StepControls } from '../components/StepControls.tsx';
import { useStepper } from '../lib/useStepper.ts';
import type { Board, BoardFrame, Box, Scenario } from './logic/board.ts';

function BoardBox({ box }: { box: Box }) {
  const chips = box.chips ?? [];
  return (
    <section className={`board-box ${box.tone ?? ''}`} aria-label={box.title} data-flip-anchor={box.id}>
      <h4>{box.title}</h4>
      {chips.length > 0 ? (
        <div className="board-chips">
          {chips.map((c, i) => (
            <span key={i} className={`board-chip ${c.tone ?? ''}`} data-flip={c.id ?? c.text} data-flip-from={c.from} data-flip-to={c.to}>
              {c.tag && <sup>{c.tag}</sup>}
              {c.text}
            </span>
          ))}
        </div>
      ) : (
        box.empty && !box.lines?.length && <p className="muted small board-empty">{box.empty}</p>
      )}
      {box.lines?.map((line, i) => (
        <p key={i} className="board-line" data-flip={`${box.id}~${i}`}>
          <RichText text={line} inline />
        </p>
      ))}
    </section>
  );
}

/** Boxes of chips laid out in columns with arrows between them. */
export function FlowBoard({ board }: { board: Board }) {
  return (
    <div className="board">
      {board.columns.map((column, i) => {
        const link = board.links?.[i - 1];
        return (
          <Fragment key={i}>
            {i > 0 && (
              <div className={`board-link ${link?.tone ?? ''}`}>
                {link?.label && <span className="board-link-label">{link.label}</span>}
                <span className="board-arrow" aria-hidden="true">
                  {link?.tone === 'bad' ? '⇢' : '→'}
                </span>
              </div>
            )}
            <div className="board-col">
              {column.map((box) => (
                <BoardBox key={box.id} box={box} />
              ))}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

/** A step-through diagram with optional scenario switcher; shows the first frame's board until run. */
export function BoardWidget({
  scenarios,
  idle,
  label = 'Scenario',
  runLabel = 'run',
}: {
  scenarios: readonly Scenario[];
  idle: string;
  label?: string;
  runLabel?: string;
}) {
  const [id, setId] = useState(scenarios[0].id);
  const stepper = useStepper<BoardFrame>();
  const scenario = scenarios.find((s) => s.id === id) ?? scenarios[0];
  const initial = useMemo(() => scenario.frames()[0].board, [scenario]);
  const frame = stepper.frame;

  return (
    <div className="widget-body">
      <div className="toolbar">
        {scenarios.length > 1 && (
          <Segmented
            label={label}
            value={id}
            options={scenarios.map((s) => [s.id, s.label] as const)}
            onChange={(next) => {
              setId(next);
              stepper.start((scenarios.find((s) => s.id === next) ?? scenario).frames());
            }}
          />
        )}
        <button className="primary" onClick={() => stepper.start(scenario.frames())}>
          {runLabel}
        </button>
      </div>
      <FlowBoard board={frame?.board ?? initial} />
      <StepControls stepper={stepper} tone={frame?.tone} idle={idle} />
    </div>
  );
}
