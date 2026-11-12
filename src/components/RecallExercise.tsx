import { useId, useState } from 'react';
import { RichText } from './RichText.tsx';

interface RecallExerciseProps {
  prompt: string;
  keyPoints: readonly string[];
  initialText?: string;
  initialCovered?: readonly number[];
  completed?: boolean;
  saveLabel?: string;
  placeholder?: string;
  onSave: (text: string, covered: number[]) => Promise<void> | void;
}

type Phase = 'write' | 'grade' | 'done';

/**
 * Free recall → compare against a rubric → self-grade. Key points stay hidden until
 * you've committed an answer, because retrieving (not re-reading) is what builds memory.
 */
export function RecallExercise({
  prompt,
  keyPoints,
  initialText = '',
  initialCovered = [],
  completed = false,
  saveLabel = 'Save',
  placeholder = 'Write from memory — rough notes are fine. Don’t look at the book.',
  onSave,
}: RecallExerciseProps) {
  const [phase, setPhase] = useState<Phase>(completed ? 'done' : 'write');
  const [text, setText] = useState(initialText);
  const [covered, setCovered] = useState<Set<number>>(new Set(initialCovered));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fieldId = useId();

  const coverage = keyPoints.length === 0 ? 1 : covered.size / keyPoints.length;

  const toggle = (index: number) =>
    setCovered((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(text, [...covered].sort((a, b) => a - b));
      setPhase('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="recall">
      <div id={fieldId} className="recall-prompt">
        <RichText text={prompt} />
      </div>

      {phase === 'write' && (
        <>
          <textarea
            aria-labelledby={fieldId}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={placeholder}
            rows={7}
            maxLength={5000}
          />
          <div className="row gap">
            <button className="primary" onClick={() => setPhase('grade')}>
              Reveal key points
            </button>
            {text.trim().length === 0 && <span className="muted small">Writing it out works better than thinking it.</span>}
          </div>
        </>
      )}

      {phase === 'grade' && (
        <>
          {text.trim() && <blockquote className="your-answer">{text}</blockquote>}
          <p className="muted small">Tick each point your answer genuinely covered. Be strict — partial credit hides gaps.</p>
          <ul className="checklist">
            {keyPoints.map((point, i) => (
              <li key={i}>
                <label>
                  <input type="checkbox" checked={covered.has(i)} onChange={() => toggle(i)} />
                  <span>
                    <RichText text={point} inline />
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="row gap">
            <button className="primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : saveLabel}
            </button>
            <button onClick={() => setPhase('write')}>Back to editing</button>
            <span className="muted small">Covered {Math.round(coverage * 100)}%</span>
          </div>
          {error && <p className="error">{error}</p>}
        </>
      )}

      {phase === 'done' && (
        <>
          {text.trim() && <blockquote className="your-answer">{text}</blockquote>}
          <ul className="checklist readonly">
            {keyPoints.map((point, i) => (
              <li key={i} className={covered.has(i) ? 'hit' : 'miss'}>
                <span aria-hidden="true">{covered.has(i) ? '✓' : '○'}</span>
                <span>
                  <RichText text={point} inline />
                </span>
              </li>
            ))}
          </ul>
          <div className="row gap">
            <span className="pill">Covered {Math.round(coverage * 100)}%</span>
            <button
              onClick={() => {
                setPhase('write');
                setText('');
                setCovered(new Set());
              }}
            >
              Try again from memory
            </button>
          </div>
        </>
      )}
    </div>
  );
}
