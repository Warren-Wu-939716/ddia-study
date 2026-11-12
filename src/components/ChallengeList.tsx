import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import type { LabId } from '../content/types.ts';
import { db } from '../lib/db.ts';
import { recordChallenge } from '../lib/repo.ts';
import { CHALLENGES_BY_LAB, solveChallenge, type Challenge } from '../sims/challenges.ts';

interface ChallengeListProps {
  labId: LabId;
  /** Replays the challenge visually in the lab; resolves when the animation is done. */
  onRun: (challenge: Challenge) => Promise<void>;
}

/** Predict → run → explain. You must commit to a prediction before the simulator shows the answer. */
export function ChallengeList({ labId, onRun }: ChallengeListProps) {
  const challenges = CHALLENGES_BY_LAB[labId];
  const records = useLiveQuery(() => db.challenges.where('labId').equals(labId).toArray(), [labId]);
  const done = new Map((records ?? []).map((r) => [r.challengeId, r]));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [prediction, setPrediction] = useState<string | null>(null);
  const [phase, setPhase] = useState<'predict' | 'running' | 'result'>('predict');
  const [answer, setAnswer] = useState<string | null>(null);

  const open = (id: string) => {
    setActiveId(id === activeId ? null : id);
    setPrediction(null);
    setPhase('predict');
    setAnswer(null);
  };

  const run = async (challenge: Challenge) => {
    if (!prediction) return;
    setPhase('running');
    await onRun(challenge);
    const correctAnswer = solveChallenge(challenge);
    setAnswer(correctAnswer);
    setPhase('result');
    await recordChallenge(challenge.id, labId, prediction, prediction === correctAnswer);
  };

  return (
    <section className="challenges" aria-label="Challenges">
      <h3>
        Predict, then run <span className="muted small">{done.size}/{challenges.length} done</span>
      </h3>
      <ol>
        {challenges.map((challenge) => {
          const record = done.get(challenge.id);
          const active = challenge.id === activeId;
          return (
            <li key={challenge.id} className={`challenge ${active ? 'active' : ''}`}>
              <button className="challenge-title" onClick={() => open(challenge.id)} aria-expanded={active}>
                <span className={`status ${record ? (record.correct ? 'ok' : 'retry') : ''}`} aria-hidden="true">
                  {record ? (record.correct ? '✓' : '↻') : '•'}
                </span>
                {challenge.title}
              </button>
              {active && (
                <div className="challenge-body">
                  <p>{challenge.prompt}</p>
                  <fieldset disabled={phase !== 'predict'} className="options compact">
                    <legend className="sr-only">Your prediction</legend>
                    {challenge.options.map((option) => {
                      const mark =
                        phase === 'result' ? (option === answer ? 'correct' : option === prediction ? 'wrong' : '') : '';
                      return (
                        <label key={option} className={`option ${mark} ${prediction === option ? 'chosen' : ''}`}>
                          <input
                            type="radio"
                            name={challenge.id}
                            checked={prediction === option}
                            onChange={() => setPrediction(option)}
                          />
                          <span>{option}</span>
                        </label>
                      );
                    })}
                  </fieldset>
                  {phase === 'predict' && (
                    <button className="primary" disabled={!prediction} onClick={() => void run(challenge)}>
                      Lock in prediction &amp; run
                    </button>
                  )}
                  {phase === 'running' && <p className="muted">Running the simulator…</p>}
                  {phase === 'result' && (
                    <div className={`result ${prediction === answer ? 'ok' : 'error'}`}>
                      <p>
                        <strong>{prediction === answer ? 'You predicted correctly.' : `The simulator says: ${answer}.`}</strong>
                      </p>
                      <p>{challenge.explanation}</p>
                      <p className="muted small">If you missed it, explain to yourself why before moving on.</p>
                    </div>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
