import { useEffect, useId, useMemo, useState } from 'react';
import type { StudyCard } from '../content/types.ts';
import type { Confidence } from '../lib/db.ts';
import { CONFIDENCE_LABELS } from '../lib/mastery.ts';
import { createRng, shuffle } from '../lib/random.ts';
import { GRADE_LABELS, GRADES, Rating, suggestChoiceGrade, suggestGrade, type Grade } from '../lib/scheduler.ts';
import { RichText } from './RichText.tsx';

export interface GradeResult {
  grade: Grade;
  confidence: Confidence;
  correct: boolean;
  coverage: number | null;
  answer: string;
}

interface ReviewCardProps {
  card: StudyCard;
  /** Interval label per grade, e.g. { 3: "4d" }. */
  dueLabels: Record<Grade, string>;
  context?: string;
  /** Where the card's lesson lives; shown after reveal so gaps can be fixed immediately. */
  lessonHref?: string;
  shuffleSeed?: number;
  onGrade: (result: GradeResult) => void | Promise<void>;
}

const KIND_LABELS: Record<StudyCard['kind'], string> = {
  recall: 'Recall',
  explain: 'Explain',
  compare: 'Compare',
  failure: 'What breaks?',
  scenario: 'Apply',
  choice: 'Choose',
};

/** One card: answer → state confidence → reveal → self-grade. */
export function ReviewCard({ card, dueLabels, context, lessonHref, shuffleSeed, onGrade }: ReviewCardProps) {
  const [phase, setPhase] = useState<'answer' | 'reveal'>('answer');
  const [text, setText] = useState('');
  const [choice, setChoice] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<Confidence | null>(null);
  const [covered, setCovered] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const promptId = useId();
  const [seed] = useState(() => shuffleSeed ?? Math.floor(Math.random() * 2 ** 31));

  const options = useMemo(
    () =>
      card.kind === 'choice'
        ? shuffle(
            card.options.map((option, index) => ({ ...option, index })),
            createRng(seed),
          )
        : [],
    [card, seed],
  );

  const chosenCorrect = card.kind === 'choice' && choice !== null && card.options[choice]?.correct === true;
  const coverage = card.kind === 'choice' ? null : card.keyPoints.length === 0 ? 1 : covered.size / card.keyPoints.length;
  const suggested: Grade | null =
    confidence === null
      ? null
      : card.kind === 'choice'
        ? suggestChoiceGrade(chosenCorrect, confidence)
        : suggestGrade(coverage ?? 0, confidence);

  const reveal = (level: Confidence) => {
    setConfidence(level);
    setPhase('reveal');
  };

  const grade = async (g: Grade) => {
    if (confidence === null || submitting) return;
    setSubmitting(true);
    try {
      await onGrade({
        grade: g,
        confidence,
        correct: card.kind === 'choice' ? chosenCorrect : g >= Rating.Good,
        coverage,
        answer: card.kind === 'choice' ? (choice === null ? '' : card.options[choice].text) : text,
      });
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    if (phase !== 'reveal') return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ['TEXTAREA', 'INPUT'].includes(target.tagName) && (target as HTMLInputElement).type !== 'checkbox') return;
      const g = Number(event.key);
      if (g >= 1 && g <= 4) {
        event.preventDefault();
        void grade(g as Grade);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const canReveal = card.kind !== 'choice' || choice !== null;

  return (
    <article className="review-card" aria-labelledby={promptId}>
      <header className="row gap small muted">
        <span className={`kind kind-${card.kind}`}>{KIND_LABELS[card.kind]}</span>
        {context && <span>{context}</span>}
      </header>
      <div id={promptId} className="prompt">
        <RichText text={card.prompt} />
      </div>

      {card.kind === 'choice' ? (
        <fieldset className="options" disabled={phase === 'reveal'}>
          <legend className="sr-only">Options</legend>
          {options.map((option) => {
            const state =
              phase === 'reveal' ? (option.correct ? 'correct' : choice === option.index ? 'wrong' : '') : '';
            return (
              <label key={option.index} className={`option ${state} ${choice === option.index ? 'chosen' : ''}`}>
                <input type="radio" name={`opt-${card.id}`} checked={choice === option.index} onChange={() => setChoice(option.index)} />
                <span>
                  <RichText text={option.text} inline />
                  {phase === 'reveal' && option.why && (choice === option.index || option.correct) && (
                    <span className="why">{option.why}</span>
                  )}
                </span>
              </label>
            );
          })}
        </fieldset>
      ) : phase === 'answer' ? (
        <textarea
          aria-label="Your answer"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={6}
          maxLength={5000}
          placeholder="Answer from memory in your own words…"
          autoFocus
        />
      ) : (
        text.trim() && <blockquote className="your-answer">{text}</blockquote>
      )}

      {phase === 'answer' && (
        <div className="confidence">
          <span className="muted small">How sure are you?</span>
          {([1, 2, 3] as const).map((level) => (
            <button key={level} onClick={() => reveal(level)} disabled={!canReveal}>
              {CONFIDENCE_LABELS[level]}
            </button>
          ))}
          {!canReveal && <span className="muted small">Pick an option first.</span>}
        </div>
      )}

      {phase === 'reveal' && (
        <section className="reveal">
          {card.kind === 'choice' ? (
            <p className={chosenCorrect ? 'ok' : 'error'}>
              <strong>{chosenCorrect ? 'Correct.' : 'Not quite.'}</strong> <RichText text={card.explanation} inline />
            </p>
          ) : (
            <>
              <h4>Reference answer</h4>
              <RichText text={card.answer} />
              <h4>Which key points did you cover?</h4>
              <ul className="checklist">
                {card.keyPoints.map((point, i) => (
                  <li key={i}>
                    <label>
                      <input
                        type="checkbox"
                        checked={covered.has(i)}
                        onChange={() =>
                          setCovered((prev) => {
                            const next = new Set(prev);
                            if (next.has(i)) next.delete(i);
                            else next.add(i);
                            return next;
                          })
                        }
                      />
                      <span>
                        <RichText text={point} inline />
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="grades" role="group" aria-label="Grade your recall">
            {GRADES.map((g) => (
              <button
                key={g}
                className={`grade grade-${g} ${suggested === g ? 'suggested' : ''}`}
                onClick={() => void grade(g)}
                disabled={submitting}
                title={`Shortcut: ${g}`}
              >
                <span>{GRADE_LABELS[g]}</span>
                <small>{dueLabels[g]}</small>
              </button>
            ))}
          </div>
          <p className="muted small">
            Suggested grade is highlighted from your {card.kind === 'choice' ? 'answer' : 'coverage'} and confidence. Keys 1–4 also work.
            {lessonHref && (
              <>
                {' '}
                <a href={lessonHref} target="_blank" rel="noopener noreferrer">
                  Revisit the lesson
                </a>{' '}
                (new tab).
              </>
            )}
          </p>
        </section>
      )}
    </article>
  );
}
