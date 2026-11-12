import { act, render, screen, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAPTERS } from '../content/index.ts';
import { setStepPrefs } from '../lib/stepPrefs.ts';
import { flatSearch, ivfSearch } from './logic/search.ts';
import { CENTROIDS, DEMO_QUERIES, DOC_VECTORS } from './logic/vectorDemo.ts';
import { WIDGETS } from './registry.ts';

beforeEach(() => {
  // Reduced motion makes widget animations run with zero delay.
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce'), addEventListener() {}, removeEventListener() {} }));
  setStepPrefs({ autoplay: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const renderWidget = (id: keyof typeof WIDGETS) => {
  const Widget = WIDGETS[id];
  return render(
    <MemoryRouter>
      <Widget />
    </MemoryRouter>,
  );
};

const status = () => screen.getByRole('status');
const button = (name: string | RegExp) => screen.getByRole('button', { name });

/** Jumps to the last step (single-step sequences are already there). */
async function skipToEnd(user: UserEvent) {
  const skip = button('Skip to the end');
  if (!(skip as HTMLButtonElement).disabled) await user.click(skip);
}

async function next(user: UserEvent, times = 1) {
  for (let i = 0; i < times; i++) await user.click(button('next ▶'));
}

describe('widget registry', () => {
  it('has a component for every widget used in a lesson', () => {
    const used = CHAPTERS.flatMap((c) => c.lessons.flatMap((l) => l.blocks.flatMap((b) => (b.kind === 'widget' ? [b.widget] : []))));
    expect(used.length).toBeGreaterThan(0);
    for (const id of used) expect(WIDGETS[id]).toBeTypeOf('function');
  });

  it.each(Object.keys(WIDGETS) as (keyof typeof WIDGETS)[])('%s renders with a status line', (id) => {
    renderWidget(id);
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0);
  });
});

describe('AppendLogWidget', () => {
  it('shows a set as find-the-end, then append; a get as a line-by-line scan', async () => {
    const user = userEvent.setup();
    renderWidget('append-log');
    await user.click(button('set (append)'));
    expect(status()).toHaveTextContent('Step 1 of 2');
    expect(status()).toHaveTextContent('go to the end of data.log');
    expect(screen.getByText('▏ next write goes here')).toBeInTheDocument();
    await next(user);
    expect(status()).toHaveTextContent('as line 5');
    await user.click(button('get'));
    expect(status()).toHaveTextContent('Step 1 of 6');
    expect(status()).toHaveTextContent('Line 1: user:7 matches');
    await next(user);
    expect(status()).toHaveTextContent('Line 2: user:9 — not it');
    await skipToEnd(user);
    expect(status()).toHaveTextContent(/scanned all 5 lines and kept the LAST match \(line 5\)/);
  });

  it('uses the hash index when enabled, and must rebuild it after a crash', async () => {
    const user = userEvent.setup();
    renderWidget('hash-index');
    await user.click(button('get'));
    expect(status()).toHaveTextContent('in-memory hash map');
    await next(user);
    expect(status()).toHaveTextContent('read 1 line');
    await user.click(button('crash & restart'));
    expect(screen.getByText(/lost in the crash/)).toBeInTheDocument();
    await user.click(button('rebuild index by scanning'));
    expect(status()).toHaveTextContent('Line 1: user:7');
    await skipToEnd(user);
    expect(status()).toHaveTextContent('Rebuilt the hash map by reading all 4 lines');
  });
});

describe('MergeWidget', () => {
  it('compares the fronts, then emits, one key at a time', async () => {
    const user = userEvent.setup();
    renderWidget('merge');
    await user.click(button('run merge'));
    await next(user);
    expect(status()).toHaveTextContent('Compare the fronts');
    await next(user);
    expect(status()).toHaveTextContent('apple appears in both inputs');
    await next(user, 6);
    expect(status()).toHaveTextContent('the tombstone must survive');
    await user.click(screen.getByRole('checkbox', { name: /oldest segment/ }));
    await next(user, 8);
    expect(status()).toHaveTextContent('drop it');
  });
});

describe('WalCrashWidget', () => {
  it('shows corruption without a WAL and recovery with one', async () => {
    const user = userEvent.setup();
    renderWidget('wal-crash');
    await user.click(screen.getAllByRole('button', { name: 'crash after this' })[1]);
    expect(status()).toHaveTextContent('Step 1: Overwrite leaf L');
    await next(user, 2);
    expect(status()).toHaveTextContent('Power cut after step 2');
    await skipToEnd(user);
    expect(status()).toHaveTextContent('Corrupted.');
    expect(status()).toHaveTextContent('orphan');
    await user.click(screen.getByRole('checkbox', { name: 'use a write-ahead log' }));
    await user.click(screen.getAllByRole('button', { name: 'crash after this' })[3]);
    await skipToEnd(user);
    expect(status()).toHaveTextContent('Consistent, insert kept.');
  });
});

describe('SsdGcWidget', () => {
  it('needs copies only when files were interleaved', async () => {
    const user = userEvent.setup();
    renderWidget('ssd-gc');
    await user.click(button('delete file B'));
    expect(status()).toHaveTextContent('marked stale');
    await skipToEnd(user);
    expect(status()).toHaveTextContent('0 pages copied');
    await user.click(screen.getByRole('radio', { name: /scattered/ }));
    await user.click(button('delete file B'));
    await next(user, 2);
    expect(status()).toHaveTextContent('extra write #1');
    await skipToEnd(user);
    expect(status()).toHaveTextContent('copy 8 still-valid pages');
  });
});

describe('IndexHopsWidget', () => {
  it('walks through each hop; a covering index answers in one', async () => {
    const user = userEvent.setup();
    const { container } = renderWidget('index-hops');
    const notes = () => within(container.querySelector('.hop-notes') as HTMLElement).queryAllByRole('listitem');
    expect(notes()).toHaveLength(2);
    await user.click(button('run query'));
    expect(notes()).toHaveLength(1);
    expect(status()).toHaveTextContent('Hop 1 of 2');
    await user.click(screen.getByRole('radio', { name: /covering/ }));
    expect(notes()).toHaveLength(1);
    expect(status()).toHaveTextContent('Hop 1 of 1');
    expect(status()).toHaveTextContent('One structure touched');
  });
});

describe('DataCubeWidget', () => {
  it('falls back to a row-by-row scan for non-dimension questions', async () => {
    const user = userEvent.setup();
    renderWidget('data-cube');
    expect(status()).toHaveTextContent('Answered from the cube');
    await user.click(screen.getByRole('radio', { name: 'Revenue in store s4' }));
    await next(user);
    expect(status()).toHaveTextContent('Row 1: store s3 — skip');
    await skipToEnd(user);
    expect(status()).toHaveTextContent('store isn’t one of its dimensions');
  });
});

describe('VectorSearchWidget', () => {
  it('IVF with one probe misses the best match for the boundary query; more probes fix it', () => {
    const query = DEMO_QUERIES.find((q) => q.label.includes('protein'))!.vec;
    for (const metric of ['euclidean', 'cosine'] as const) {
      const exact = flatSearch(DOC_VECTORS, query, 1, metric).results[0];
      expect(exact.id).toBe('protein');
      expect(ivfSearch(DOC_VECTORS, CENTROIDS, query, 1, 1, metric).results[0].id).not.toBe('protein');
      expect(ivfSearch(DOC_VECTORS, CENTROIDS, query, 1, 2, metric).results[0].id).toBe('protein');
    }
  });

  it('reports a miss in the UI with one probe', () => {
    renderWidget('vector-search');
    expect(screen.getByText(/Missed true neighbour/)).toHaveTextContent('protein intake');
  });

  it('steps from embedding to probing to the missed neighbour', async () => {
    const user = userEvent.setup();
    renderWidget('vector-search');
    await user.click(button('run search'));
    expect(status()).toHaveTextContent('An embedding model');
    expect(screen.getByText('(not ranked yet)')).toBeInTheDocument();
    await next(user, 2);
    expect(status()).toHaveTextContent('Probe the 1 closest partition');
    await skipToEnd(user);
    expect(status()).toHaveTextContent('Exact search would also have returned');
  });
});

describe('PhoneBookWidget', () => {
  it('binary-searches a last name; first-name queries need a full scan', async () => {
    const user = userEvent.setup();
    renderWidget('phone-book');
    expect(status()).toHaveTextContent('binary search');
    await user.click(button('run lookup'));
    await next(user);
    expect(status()).toHaveTextContent('Middle entry');
    await skipToEnd(user);
    expect(status()).toHaveTextContent('binary search jumped there');
    await user.click(screen.getByRole('radio', { name: 'first name only =' }));
    await skipToEnd(user);
    expect(status()).toHaveTextContent('must be scanned');
  });
});

describe('BTreeMiniWidget', () => {
  it('shows each page read on insert and on find', async () => {
    const user = userEvent.setup();
    renderWidget('btree-mini');
    await user.click(button('insert'));
    expect(status()).toHaveTextContent(/Read the root, page p\d+/);
    await skipToEnd(user);
    expect(status()).toHaveTextContent(/Done:|It fits/);
    await act(async () => {
      await user.click(button('find'));
    });
    await skipToEnd(user);
    expect(status()).toHaveTextContent(/25 is here\. That took \d page reads? — one per level/);
  });

  it('marks an overflowing page and the dashed pending link during a split', async () => {
    const user = userEvent.setup();
    const { container } = renderWidget('btree-mini');
    await user.click(button('insert 80'));
    const findStep = async (pattern: RegExp) => {
      for (let i = 0; i < 12 && !pattern.test(status().textContent ?? ''); i++) await next(user);
      expect(status()).toHaveTextContent(pattern);
    };
    await findStep(/overflows/);
    expect(container.querySelector('.page.overflow')).not.toBeNull();
    await findStep(/dashed line/);
    expect(container.querySelector('.tree-edge.pending')).not.toBeNull();
  });
});

describe('chapter 12 widgets', () => {
  it('fan-out and load balancing deliver differently', async () => {
    const user = userEvent.setup();
    renderWidget('fanout');
    await user.click(button('send 6 messages'));
    expect(status()).toHaveTextContent('m1 goes to A only');
    await skipToEnd(user);
    expect(status()).toHaveTextContent('Received: A: 3, B: 3');
    await user.click(screen.getByRole('radio', { name: 'fan-out' }));
    await skipToEnd(user);
    expect(status()).toHaveTextContent('Received: A: 6, B: 6');
  });

  it('redelivery reorders messages and poison messages land in the DLQ', async () => {
    const user = userEvent.setup();
    renderWidget('redelivery');
    await user.click(button('run'));
    await skipToEnd(user);
    expect(status()).toHaveTextContent('processed m1, m2, m4, m3, m5');
    await user.click(screen.getByRole('radio', { name: 'a malformed message' }));
    await skipToEnd(user);
    expect(screen.getByText('dead letter queue')).toBeInTheDocument();
  });

  it('a crash between commits leads to reprocessing', async () => {
    const user = userEvent.setup();
    renderWidget('broker-mini');
    await user.click(button('billing: each consumer reads one'));
    await user.click(button('billing: each consumer reads one'));
    await user.click(button('crash c2'));
    expect(status()).toHaveTextContent('c2 crashes');
    await skipToEnd(user);
    expect(status()).toHaveTextContent('2 messages will be processed again');
    expect(button('restart c2')).toBeInTheDocument();
  });

  it('dual writes diverge while CDC converges', async () => {
    const user = userEvent.setup();
    renderWidget('dual-writes');
    await user.click(button('run'));
    await skipToEnd(user);
    expect(status()).toHaveTextContent('database says B, search index says A');
    await user.click(screen.getByRole('radio', { name: 'change data capture' }));
    await skipToEnd(user);
    expect(status()).toHaveTextContent('both say B');
  });

  it('log compaction rebuilds the latest value per key', async () => {
    const user = userEvent.setup();
    renderWidget('log-compaction');
    await user.click(button('compact the log'));
    await skipToEnd(user);
    expect(status()).toHaveTextContent('scarf = 9, socks = 8, hat = 3');
  });

  it('windows drop or correct the straggler', async () => {
    const user = userEvent.setup();
    renderWidget('windows');
    await user.click(button('run'));
    await skipToEnd(user);
    expect(status()).toHaveTextContent('1 straggler dropped');
    await user.click(screen.getByRole('radio', { name: 'publish corrections' }));
    await skipToEnd(user);
    expect(status()).toHaveTextContent('folded in with corrections');
  });

  it('stream–table enrichment depends on arrival order', async () => {
    const user = userEvent.setup();
    renderWidget('stream-joins');
    await user.click(screen.getByRole('radio', { name: 'stream–table' }));
    await skipToEnd(user);
    expect(screen.getByText('u7 viewed “hiking boots” · Oslo')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'update arrives first' }));
    await skipToEnd(user);
    expect(screen.getByText('u7 viewed “hiking boots” · Rome')).toBeInTheDocument();
  });

  it('a plain write double-counts after a crash; an idempotent one does not', async () => {
    const user = userEvent.setup();
    renderWidget('exactly-once');
    await user.click(button('run'));
    await skipToEnd(user);
    expect(status()).toHaveTextContent('balance 55');
    await user.click(screen.getByRole('radio', { name: 'idempotent write' }));
    await skipToEnd(user);
    expect(status()).toHaveTextContent('balance 35, exactly right');
  });
});

describe('chapter 12 step-through diagrams', () => {
  it('switching scenario replays the diagram and updates the boxes', async () => {
    const user = userEvent.setup();
    renderWidget('partition-order');
    expect(screen.getByRole('region', { name: 'order status table' })).toHaveTextContent('A: —');
    await user.click(button('run'));
    await skipToEnd(user);
    expect(status()).toHaveTextContent('read in order');
    expect(screen.getByRole('region', { name: 'order status table' })).toHaveTextContent('A: shipped ✓');
    await user.click(screen.getByRole('radio', { name: 'no key' }));
    await skipToEnd(user);
    expect(screen.getByRole('region', { name: 'order status table' })).toHaveTextContent('A: paid ✗ (really shipped)');
  });

  it('stragglers arrive mixed with newer events and are dropped or corrected', async () => {
    const user = userEvent.setup();
    renderWidget('stragglers');
    await user.click(button('run'));
    await next(user, 3);
    expect(status()).toHaveTextContent('b1 and b2 are stragglers');
    await skipToEnd(user);
    expect(screen.getByRole('region', { name: 'processor — arrived during 10:59' })).toHaveTextContent('stragglers dropped: 2');
    await user.click(screen.getByRole('radio', { name: 'wait for watermarks' }));
    await skipToEnd(user);
    expect(screen.getByRole('region', { name: 'published counts' })).toHaveTextContent('10:57 → 4');
  });

  it('two clocks: the delayed event is processed last', async () => {
    const user = userEvent.setup();
    renderWidget('two-clocks');
    await user.click(button('run'));
    await skipToEnd(user);
    expect(screen.getByText(/processed so far: e1, e2, e4, e5, e3/)).toBeInTheDocument();
  });

  it('fencing tokens reject the stale write', async () => {
    const user = userEvent.setup();
    renderWidget('fencing');
    await user.click(screen.getByRole('radio', { name: 'fencing tokens' }));
    await skipToEnd(user);
    expect(status()).toHaveTextContent('rejects token 33');
    expect(screen.getByRole('region', { name: 'database' })).toHaveTextContent('total = 12');
  });
});
