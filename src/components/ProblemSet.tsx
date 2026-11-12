import { useRef, useState, type ReactNode } from 'react';
import type { ChoiceOption, ExplainProblem, OrderProblem, Problem, ProblemSkill } from '../content/types.ts';
import type { Confidence, ProblemAttemptRecord } from '../lib/db.ts';
import {
  calibrationNote,
  explainPassMark,
  gradeProblem,
  initialOrder,
  needsRetry,
  parseNumber,
  problemStatus,
  summarizeProblems,
  type ProblemAnswer,
  type ProblemStatus,
} from '../lib/problems.ts';
import { recordProblemAttempt } from '../lib/repo.ts';
import { Flip } from './Flip.tsx';
import { RichText } from './RichText.tsx';
import { Segmented } from './Segmented.tsx';

const SKILL_LABEL: Record<ProblemSkill, string> = {
  predict: 'Predict',
  diagnose: 'Diagnose',
  design: 'Design',
  calculate: 'Calculate',
  explain: 'Explain',
  sequence: 'Sequence',
};
const STATUS_LABEL: Record<ProblemStatus, string> = { new: 'not tried', mastered: 'mastered', shaky: 'right but guessed', missed: 'missed' };
const MIN_EXPLAIN_CHARS = 20;

type Result = { correct: boolean; answer: ProblemAnswer };

function ConfidencePicker({ value, onChange, disabled }: { value: Confidence | null; onChange: (c: Confidence) => void; disabled: boolean }) {
  return (
    <div className="problem-confidence">
      <span className="small muted">How sure are you?</span>
      <fieldset disabled={disabled} className="plain">
        <Segmented
          label="How sure are you?"
          value={value ? String(value) : ''}
          options={[
            ['1', 'guessing'],
            ['2', 'fairly sure'],
            ['3', 'certain'],
          ]}
          onChange={(v) => onChange(Number(v) as Confidence)}
        />
      </fieldset>
    </div>
  );
}

function OptionList({
  options,
  name,
  multiple,
  chosen,
  onChange,
  revealed,
  legend,
}: {
  options: readonly ChoiceOption[];
  name: string;
  multiple: boolean;
  chosen: readonly number[];
  onChange: (next: number[]) => void;
  revealed: boolean;
  legend: string;
}) {
  return (
    <fieldset className="options problem-options" disabled={revealed}>
      <legend className={multiple || legend !== 'Your answer' ? 'small' : 'sr-only'}>{legend}</legend>
      {options.map((option, i) => {
        const picked = chosen.includes(i);
        const mark = revealed ? (option.correct ? 'correct' : picked ? 'wrong' : '') : '';
        return (
          <label key={i} className={`option ${mark} ${picked ? 'chosen' : ''}`}>
            <input
              type={multiple ? 'checkbox' : 'radio'}
              name={name}
              checked={picked}
              onChange={() => onChange(multiple ? (picked ? chosen.filter((c) => c !== i) : [...chosen, i]) : [i])}
            />
            <span>
              <RichText text={option.text} inline />
              {revealed && option.why && (
                <span className="option-why">
                  {option.correct ? (multiple ? '✓ belongs in the answer. ' : '✓ ') : picked ? '✗ ' : ''}
                  <RichText text={option.why} inline />
                </span>
              )}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

function OrderList({ problem, order, onChange, revealed }: { problem: OrderProblem; order: number[]; onChange: (o: number[]) => void; revealed: boolean }) {
  const listRef = useRef<HTMLOListElement>(null);
  const move = (from: number, to: number) => {
    const next = [...order];
    [next[from], next[to]] = [next[to], next[from]];
    onChange(next);
    // Keep keyboard focus on the step that moved.
    requestAnimationFrame(() => {
      const buttons = listRef.current?.children[to]?.querySelectorAll('button');
      const target = buttons?.[to < from ? 0 : 1];
      (target && !target.disabled ? target : [...(buttons ?? [])].find((b) => !b.disabled))?.focus();
    });
  };
  return (
    <div className="problem-order">
      <ol ref={listRef}>
        {order.map((step, i) => (
          <li key={step} data-flip={`step-${step}`} className={revealed ? (step === i ? 'correct' : 'wrong') : ''}>
            <span className="problem-order-text">
              <RichText text={problem.steps[step]} inline />
            </span>
            {!revealed && (
              <span className="problem-order-buttons">
                <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move step ${i + 1} up`}>
                  ↑
                </button>
                <button type="button" onClick={() => move(i, i + 1)} disabled={i === order.length - 1} aria-label={`Move step ${i + 1} down`}>
                  ↓
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>
      {revealed && !order.every((s, i) => s === i) && (
        <div className="small">
          <strong>Correct order</strong>
          <ol>
            {problem.steps.map((s, i) => (
              <li key={i}>
                <RichText text={s} inline />
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function ExplainGrade({ problem, covered, onChange, locked }: { problem: ExplainProblem; covered: number[]; onChange: (c: number[]) => void; locked: boolean }) {
  return (
    <div className="reveal-box">
      <strong>Model answer</strong>
      <RichText text={problem.explanation} />
      <fieldset className="options problem-options" disabled={locked}>
        <legend className="small">
          Tick the points your answer really made (you need {explainPassMark(problem.keyPoints.length)} of {problem.keyPoints.length}). Be strict.
        </legend>
        {problem.keyPoints.map((point, i) => (
          <label key={i} className="option">
            <input type="checkbox" checked={covered.includes(i)} onChange={() => onChange(covered.includes(i) ? covered.filter((c) => c !== i) : [...covered, i])} />
            <span>
              <RichText text={point} inline />
            </span>
          </label>
        ))}
      </fieldset>
    </div>
  );
}

/** One problem: answer, say how sure you are, check, then read why. */
function ProblemCard({
  problem,
  chapterId,
  position,
  total,
  onNext,
}: {
  problem: Problem;
  chapterId: string;
  position: number;
  total: number;
  onNext: () => void;
}) {
  const [chosen, setChosen] = useState<number[]>([]);
  const [reason, setReason] = useState<number[]>([]);
  const [order, setOrder] = useState<number[]>(() => (problem.kind === 'order' ? initialOrder(problem) : []));
  const [text, setText] = useState('');
  const [covered, setCovered] = useState<number[]>([]);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [revealedModel, setRevealedModel] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [saving, setSaving] = useState(false);

  const draft = (): ProblemAnswer | null => {
    switch (problem.kind) {
      case 'choice':
        return chosen.length ? { kind: 'choice', option: chosen[0] } : null;
      case 'multi':
        return chosen.length ? { kind: 'multi', options: [...chosen].sort((a, b) => a - b) } : null;
      case 'order':
        return { kind: 'order', order };
      case 'numeric': {
        const value = parseNumber(text);
        return value === null ? null : { kind: 'numeric', value };
      }
      case 'justify':
        return chosen.length && reason.length ? { kind: 'justify', option: chosen[0], reason: reason[0] } : null;
      case 'explain':
        return revealedModel ? { kind: 'explain', text, covered } : null;
    }
  };
  const answer = draft();
  const revealed = result !== null;

  const submit = async () => {
    if (!answer || !confidence) return;
    setSaving(true);
    const correct = gradeProblem(problem, answer);
    try {
      await recordProblemAttempt({ problemId: problem.id, chapterId, sectionId: problem.sectionId, answer: JSON.stringify(answer), correct, confidence });
      setResult({ correct, answer });
    } finally {
      setSaving(false);
    }
  };

  let input: ReactNode;
  switch (problem.kind) {
    case 'choice':
    case 'multi':
      input = (
        <OptionList
          options={problem.options}
          name={problem.id}
          multiple={problem.kind === 'multi'}
          chosen={chosen}
          onChange={setChosen}
          revealed={revealed}
          legend={problem.kind === 'multi' ? 'Select every option that applies' : 'Your answer'}
        />
      );
      break;
    case 'justify':
      input = (
        <>
          <OptionList options={problem.options} name={`${problem.id}-what`} multiple={false} chosen={chosen} onChange={setChosen} revealed={revealed} legend="Your decision" />
          <OptionList options={problem.reasons} name={`${problem.id}-why`} multiple={false} chosen={reason} onChange={setReason} revealed={revealed} legend="Because…" />
        </>
      );
      break;
    case 'order':
      input = (
        <Flip>
          <OrderList problem={problem} order={order} onChange={setOrder} revealed={revealed} />
        </Flip>
      );
      break;
    case 'numeric':
      input = (
        <label className="problem-numeric">
          Your answer
          <input type="text" inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} disabled={revealed} />
          {problem.unit && <span>{problem.unit}</span>}
          {text.trim() !== '' && parseNumber(text) === null && <span className="error small">Enter a number.</span>}
        </label>
      );
      break;
    case 'explain':
      input = (
        <>
          <label className="problem-explain">
            Your answer, in your own words
            <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} disabled={revealedModel} maxLength={3000} />
          </label>
          {revealedModel && <ExplainGrade problem={problem} covered={covered} onChange={setCovered} locked={revealed} />}
        </>
      );
      break;
  }

  const note = result && confidence ? calibrationNote(result.correct, confidence) : null;
  const canReveal = problem.kind === 'explain' && !revealedModel;

  return (
    <article className="problem" aria-label={`Challenge ${position + 1} of ${total}`}>
      <header className="row between">
        <span className="eyebrow">
          Challenge {position + 1} of {total}
        </span>
        <span className="pill">{SKILL_LABEL[problem.skill]}</span>
      </header>
      <div className="problem-prompt">
        <RichText text={problem.prompt} />
      </div>
      {problem.figure && <pre className="problem-figure">{problem.figure}</pre>}
      {input}
      {!revealed && <ConfidencePicker value={confidence} onChange={setConfidence} disabled={saving} />}
      {!revealed && (
        <div className="row gap">
          {canReveal ? (
            <button className="primary" disabled={text.trim().length < MIN_EXPLAIN_CHARS || !confidence} onClick={() => setRevealedModel(true)}>
              Show the model answer
            </button>
          ) : (
            <button className="primary" disabled={!answer || !confidence || saving} onClick={() => void submit()}>
              {problem.kind === 'explain' ? 'Save my grade' : 'Check'}
            </button>
          )}
          {!confidence && <span className="muted small">Commit to an answer and a confidence first.</span>}
        </div>
      )}
      {result && (
        <div className={`problem-result ${result.correct ? 'is-right' : 'is-wrong'}`} role="status">
          <p>
            <strong>
              {problem.kind === 'explain'
                ? result.correct
                  ? 'You covered enough of the key points.'
                  : 'Not enough of the key points yet.'
                : result.correct
                  ? 'Correct.'
                  : 'Not quite.'}
            </strong>{' '}
            {problem.kind === 'numeric' && (
              <span>
                The answer is {problem.answer}
                {problem.unit ? ` ${problem.unit}` : ''}.
              </span>
            )}
            {problem.kind === 'multi' && !result.correct && <span>The right set is the options marked ✓.</span>}
          </p>
          {note && <p className="small">{note}</p>}
          {problem.kind !== 'explain' && <RichText text={problem.explanation} />}
          <button className="primary" onClick={onNext}>
            {position + 1 < total ? 'Next challenge →' : 'See results'}
          </button>
        </div>
      )}
    </article>
  );
}

function Summary({ problems, attempts, onStart }: { problems: readonly Problem[]; attempts: ReadonlyMap<string, ProblemAttemptRecord>; onStart: (ids: string[]) => void }) {
  const s = summarizeProblems(problems, attempts);
  const retry = needsRetry(problems, attempts);
  return (
    <div className="problem-summary">
      <p>
        <strong>
          First try: {s.firstTry}/{s.total}
        </strong>{' '}
        <span className="muted">
          · now {s.mastered} mastered, {s.shaky} right-but-guessed, {s.missed} missed
        </span>
      </p>
      {s.confidentlyWrong > 0 && (
        <p className="small warn-text">
          {s.confidentlyWrong} answered confidently but wrongly — these are the ones to fix first.
        </p>
      )}
      <ul className="problem-status-list">
        {problems.map((p) => {
          const status = problemStatus(attempts.get(p.id));
          return (
            <li key={p.id}>
              <span className={`status-badge ${status}`}>{STATUS_LABEL[status]}</span>
              <span className="small problem-status-prompt">
                <strong>{SKILL_LABEL[p.skill]}:</strong> <RichText text={p.prompt.split('\n')[0]} inline />
              </span>
              <button className="link small" onClick={() => onStart([p.id])}>
                {status === 'new' ? 'try' : 'redo'}
              </button>
            </li>
          );
        })}
      </ul>
      <div className="row gap">
        {retry.length > 0 && (
          <button className="primary" onClick={() => onStart(retry.map((p) => p.id))}>
            Retry missed &amp; guessed ({retry.length})
          </button>
        )}
        <button onClick={() => onStart(problems.map((p) => p.id))}>Do all {problems.length} again</button>
      </div>
      {retry.length > 0 && <p className="muted small">Retrying works best after a gap: come back tomorrow and these will be suggested at the end of your review session.</p>}
    </div>
  );
}

/** End-of-lesson problems: answer each with a confidence rating, get feedback, then see a summary. */
export function ProblemSet({ chapterId, problems, attempts }: { chapterId: string; problems: readonly Problem[]; attempts: ReadonlyMap<string, ProblemAttemptRecord> }) {
  const [run, setRun] = useState<string[]>(() => problems.filter((p) => !attempts.has(p.id)).map((p) => p.id));
  const [position, setPosition] = useState(0);
  const [runId, setRunId] = useState(0);
  const current = problems.find((p) => p.id === run[position]);

  const start = (ids: string[]) => {
    setRun(ids);
    setPosition(0);
    setRunId((n) => n + 1);
  };

  return current ? (
    <ProblemCard key={`${runId}:${current.id}`} problem={current} chapterId={chapterId} position={position} total={run.length} onNext={() => setPosition((p) => p + 1)} />
  ) : (
    <Summary problems={problems} attempts={attempts} onStart={start} />
  );
}
