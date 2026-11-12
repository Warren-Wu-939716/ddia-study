import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from './App.tsx';
import { CHAPTERS } from './content/index.ts';
import { db } from './lib/db.ts';
import { resetAllProgress } from './lib/repo.ts';

beforeEach(async () => {
  await resetAllProgress();
  window.location.hash = '#/';
});

describe('App', () => {
  it('shows the dashboard with an onboarding guide for a new learner', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'How this works' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole('link', { name: 'Take the pretest' })).toHaveLength(CHAPTERS.length));
  });

  it('gates the checkpoint behind the lesson, and completing it unlocks the section’s cards', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/chapters/ch04/sections/btrees';
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'B-trees' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Key takeaways' })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Write from memory/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hide lesson & start checkpoint' }));
    expect(screen.queryByRole('heading', { name: 'Key takeaways' })).not.toBeInTheDocument();
    await user.type(screen.getByPlaceholderText(/Write from memory/), 'Pages, splits, WAL');
    await user.click(screen.getByRole('button', { name: 'Reveal key points' }));
    await user.click(screen.getByRole('checkbox', { name: /fixed-size pages/ }));
    await user.click(screen.getByRole('button', { name: 'Save & unlock cards' }));

    expect(await screen.findByRole('heading', { name: /Cards now in your review pool/ })).toBeInTheDocument();
    expect(await db.cardStates.where('sectionId').equals('btrees').count()).toBeGreaterThan(0);
  });

  it('renders every top-level page without crashing', async () => {
    for (const [hash, heading] of [
      ['#/chapters', 'Chapters'],
      ['#/chapters/ch04', 'Storage and Retrieval'],
      ['#/chapters/ch04/pretest', 'Guess first'],
      ['#/chapters/ch04/synthesis', 'Connect the ideas'],
      ['#/chapters/ch04/scenarios', 'Apply it'],
      ['#/chapters/ch12', 'Stream Processing'],
      ['#/chapters/ch12/sections/log-brokers', 'Log-based message brokers'],
      ['#/labs', 'Labs'],
      ['#/labs/lsm', 'LSM-tree simulator'],
      ['#/labs/bloom', 'Bloom filter lab'],
      ['#/labs/btree', 'B-tree simulator'],
      ['#/labs/columnar', 'Column store lab'],
      ['#/labs/broker', 'Log-based broker lab'],
      ['#/settings', 'Settings'],
      ['#/session', 'Nothing due right now'],
      ['#/nope', 'Not found'],
    ] as const) {
      window.location.hash = hash;
      const { unmount } = render(<App />);
      expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
      unmount();
    }
  });
});
