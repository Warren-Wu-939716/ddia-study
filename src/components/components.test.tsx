import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import type { ChoiceCard, FreeTextCard, Lesson } from '../content/types.ts';
import { Rating } from '../lib/scheduler.ts';
import { LessonView } from './LessonView.tsx';
import { RecallExercise } from './RecallExercise.tsx';
import { ReviewCard } from './ReviewCard.tsx';

const labels = { [Rating.Again]: '1m', [Rating.Hard]: '6m', [Rating.Good]: '1d', [Rating.Easy]: '4d' };

const freeText: FreeTextCard = {
  id: 't1',
  chapterId: 'ch04',
  sectionId: 's',
  conceptIds: ['c'],
  kind: 'explain',
  prompt: 'Why use a WAL?',
  answer: 'Crash safety.',
  keyPoints: ['Durability before page writes', 'Replay after crash'],
};

const choice: ChoiceCard = {
  id: 'c1',
  chapterId: 'ch04',
  sectionId: 's',
  conceptIds: ['c'],
  kind: 'choice',
  prompt: 'Pick one',
  options: [{ text: 'Wrong answer', why: 'nope' }, { text: 'Right answer', correct: true }],
  explanation: 'Because.',
};

describe('ReviewCard', () => {
  it('hides the reference until confidence is given, then grades free text', async () => {
    const user = userEvent.setup();
    const onGrade = vi.fn();
    render(<ReviewCard card={freeText} dueLabels={labels} onGrade={onGrade} />);

    expect(screen.queryByText('Crash safety.')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Your answer'), 'so we can replay');
    await user.click(screen.getByRole('button', { name: 'Fairly sure' }));

    expect(screen.getByText('Crash safety.')).toBeInTheDocument();
    await user.click(screen.getByLabelText('Replay after crash'));
    expect(screen.getByRole('button', { name: /Hard/ })).toHaveClass('suggested');

    await user.click(screen.getByRole('button', { name: /Good/ }));
    expect(onGrade).toHaveBeenCalledWith({ grade: Rating.Good, confidence: 2, correct: true, coverage: 0.5, answer: 'so we can replay' });
  });

  it('requires an option for choice cards and reports correctness', async () => {
    const user = userEvent.setup();
    const onGrade = vi.fn();
    render(<ReviewCard card={choice} dueLabels={labels} onGrade={onGrade} shuffleSeed={1} />);

    expect(screen.getByRole('button', { name: 'Certain' })).toBeDisabled();
    await user.click(screen.getByLabelText('Wrong answer'));
    await user.click(screen.getByRole('button', { name: 'Certain' }));

    expect(screen.getByText('Not quite.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Again/ })).toHaveClass('suggested');
    await user.keyboard('1');
    expect(onGrade).toHaveBeenCalledWith(expect.objectContaining({ grade: Rating.Again, correct: false, coverage: null, answer: 'Wrong answer' }));
  });

  it('shows the interval for each grade', () => {
    render(<ReviewCard card={freeText} dueLabels={labels} onGrade={() => {}} />);
    expect(screen.queryByText('4d')).not.toBeInTheDocument();
  });
});

describe('LessonView', () => {
  const lesson: Lesson = {
    sectionId: 's',
    intro: 'Why **this** matters.',
    blocks: [
      { kind: 'text', title: 'Idea', body: 'Use `fsync`.' },
      { kind: 'steps', title: 'How', steps: ['first', 'second'] },
      { kind: 'diagram', title: 'Picture', art: '[a] → [b]', caption: 'cap' },
      { kind: 'table', title: 'Compare', head: ['', 'A'], rows: [['Speed', 'fast']] },
      { kind: 'analogy', body: 'Like a library.' },
      { kind: 'pitfall', body: 'Not that.' },
      { kind: 'check', question: 'What is 2+2?', answer: 'Four.' },
      { kind: 'try', labId: 'lsm', body: 'Play.' },
    ],
    takeaways: ['Remember this'],
  };

  it('renders every block kind and hides quick-check answers until opened', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <LessonView lesson={lesson} />
      </MemoryRouter>,
    );
    expect(screen.getByText('this').tagName).toBe('STRONG');
    expect(screen.getByText('fsync').tagName).toBe('CODE');
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['first', 'second', 'Remember this']);
    expect(screen.getByText('[a] → [b]')).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Speed' })).toBeInTheDocument();
    expect(screen.getByText('Analogy')).toBeInTheDocument();
    expect(screen.getByText('Common mix-up')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /LSM-tree simulator/ })).toHaveAttribute('href', '/labs/lsm');

    expect(screen.getByText('Four.')).not.toBeVisible();
    await user.click(screen.getByText('What is 2+2?'));
    expect(screen.getByText('Four.')).toBeVisible();
  });
});

describe('RecallExercise', () => {
  it('writes, reveals key points, self-grades and saves', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<RecallExercise prompt="Summarize LSM writes" keyPoints={['WAL first', 'Memtable flush']} onSave={onSave} saveLabel="Save & unlock" />);

    expect(screen.queryByText('WAL first')).not.toBeInTheDocument();
    await user.type(screen.getByRole('textbox'), 'append to log, then memtable');
    await user.click(screen.getByRole('button', { name: 'Reveal key points' }));
    await user.click(screen.getByLabelText('WAL first'));
    expect(screen.getByText('Covered 50%')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save & unlock' }));

    expect(onSave).toHaveBeenCalledWith('append to log, then memtable', [0]);
    expect(await screen.findByRole('button', { name: 'Try again from memory' })).toBeInTheDocument();
  });

  it('shows a save error and stays in grading mode', async () => {
    const user = userEvent.setup();
    render(<RecallExercise prompt="p" keyPoints={['a']} onSave={() => Promise.reject(new Error('disk full'))} />);
    await user.click(screen.getByRole('button', { name: 'Reveal key points' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('disk full')).toBeInTheDocument();
  });

  it('opens in review mode when already completed', () => {
    render(<RecallExercise prompt="p" keyPoints={['a', 'b']} initialText="mine" initialCovered={[1]} completed onSave={() => {}} />);
    expect(screen.getByText('Covered 50%')).toBeInTheDocument();
    expect(screen.getByText('mine')).toBeInTheDocument();
  });
});
