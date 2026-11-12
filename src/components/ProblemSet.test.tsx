import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Problem } from '../content/types.ts';
import { db } from '../lib/db.ts';
import { useProblemAttempts } from '../lib/hooks.ts';
import { resetAllProgress } from '../lib/repo.ts';
import { ProblemSet } from './ProblemSet.tsx';

const problems: Problem[] = [
  {
    id: 'q1',
    sectionId: 's',
    skill: 'predict',
    kind: 'choice',
    prompt: 'Which one?',
    options: [
      { text: 'Tempting answer', why: 'Sounds right but ignores the crash.' },
      { text: 'Right answer', correct: true, why: 'Accounts for the crash.' },
      { text: 'Silly answer', why: 'No.' },
    ],
    explanation: 'Worked reasoning.',
  },
  { id: 'q2', sectionId: 's', skill: 'calculate', kind: 'numeric', prompt: 'How many?', answer: 37, unit: 'messages', explanation: 'Count them.' },
];

function Harness() {
  const attempts = useProblemAttempts('ch');
  return attempts ? <ProblemSet chapterId="ch" problems={problems} attempts={attempts} /> : null;
}

beforeEach(async () => {
  await resetAllProgress();
});

describe('ProblemSet', () => {
  it('requires an answer and a confidence, explains every option, and summarizes the run', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const check = await screen.findByRole('button', { name: 'Check' });
    expect(check).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: /Tempting answer/ }));
    expect(check).toBeDisabled();
    await user.click(screen.getByRole('radio', { name: 'certain' }));
    await user.click(check);

    expect(await screen.findByText('Not quite.')).toBeInTheDocument();
    expect(screen.getByText(/You were certain — and wrong/)).toBeInTheDocument();
    expect(screen.getByText(/✗ Sounds right but ignores the crash\./)).toBeInTheDocument();
    expect(screen.getByText(/✓ Accounts for the crash\./)).toBeInTheDocument();
    expect(screen.getByText('Worked reasoning.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next challenge →' }));
    await user.type(screen.getByRole('textbox', { name: /Your answer/ }), '37');
    await user.click(screen.getByRole('radio', { name: 'fairly sure' }));
    await user.click(screen.getByRole('button', { name: 'Check' }));
    expect(await screen.findByText('Correct.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'See results' }));

    expect(await screen.findByText('First try: 1/2')).toBeInTheDocument();
    expect(screen.getByText(/1 answered confidently but wrongly/)).toBeInTheDocument();
    const record = await db.problemAttempts.get('q1');
    expect(record).toMatchObject({ correct: false, confidence: 3, attempts: 1, firstCorrect: false, chapterId: 'ch' });
  });

  it('retries only the missed problem and keeps the first-try score', async () => {
    const user = userEvent.setup();
    await db.problemAttempts.bulkPut([
      { problemId: 'q1', chapterId: 'ch', sectionId: 's', answer: '{}', correct: false, confidence: 2, firstCorrect: false, attempts: 1, firstAt: new Date(), updatedAt: new Date() },
      { problemId: 'q2', chapterId: 'ch', sectionId: 's', answer: '{}', correct: true, confidence: 3, firstCorrect: true, attempts: 1, firstAt: new Date(), updatedAt: new Date() },
    ]);
    render(<Harness />);
    await user.click(await screen.findByRole('button', { name: 'Retry missed & guessed (1)' }));
    expect(screen.getByText('Challenge 1 of 1')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: /Right answer/ }));
    await user.click(screen.getByRole('radio', { name: 'certain' }));
    await user.click(screen.getByRole('button', { name: 'Check' }));
    await user.click(await screen.findByRole('button', { name: 'See results' }));
    await waitFor(() => expect(screen.getByText(/now 2 mastered/)).toBeInTheDocument());
    expect(screen.getByText('First try: 1/2')).toBeInTheDocument();
    expect(await db.problemAttempts.get('q1')).toMatchObject({ correct: true, attempts: 2, firstCorrect: false });
  });
});
