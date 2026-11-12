import { describe, expect, it } from 'vitest';
import { conceptDepths } from '../lib/conceptLayout.ts';
import { BOOK_CHAPTERS, CHAPTERS, CONTENT_CARDS, findCard, getChapter, getLab, LABS } from './index.ts';
import { problemsFor } from './problems.ts';

describe.each(CHAPTERS.map((c) => [c.id, c] as const))('chapter %s content integrity', (_id, chapter) => {
  const sectionIds = new Set(chapter.sections.map((s) => s.id));
  const conceptIds = new Set(chapter.concepts.map((c) => c.id));

  it('matches the book table of contents', () => {
    expect(BOOK_CHAPTERS.find((b) => b.number === chapter.number)?.title).toBe(chapter.title);
  });

  it('has unique ids everywhere', () => {
    for (const ids of [
      chapter.sections.map((s) => s.id),
      chapter.concepts.map((c) => c.id),
      chapter.cards.map((c) => c.id),
      chapter.pretest.map((p) => p.id),
      chapter.teachBack.map((t) => t.id),
      chapter.scenarios.map((s) => s.id),
    ]) {
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('references only existing sections and concepts', () => {
    for (const concept of chapter.concepts) {
      expect(sectionIds).toContain(concept.sectionId);
      for (const p of concept.prerequisites) expect(conceptIds).toContain(p);
    }
    for (const card of chapter.cards) {
      expect(card.chapterId).toBe(chapter.id);
      expect(sectionIds).toContain(card.sectionId);
      expect(card.conceptIds.length).toBeGreaterThan(0);
      for (const c of card.conceptIds) expect(conceptIds).toContain(c);
    }
    for (const q of chapter.pretest) expect(sectionIds).toContain(q.sectionId);
    for (const t of chapter.teachBack) for (const s of t.sectionIds) expect(sectionIds).toContain(s);
    for (const s of chapter.scenarios) for (const id of s.sectionIds) expect(sectionIds).toContain(id);
  });

  it('has an acyclic concept graph', () => {
    expect(() => conceptDepths(chapter.concepts)).not.toThrow();
  });

  it('has a varied, well-formed set of end-of-lesson problems for every section', () => {
    const problems = problemsFor(chapter.id);
    const ids = problems.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const sectionId of sectionIds) {
      const set = problems.filter((p) => p.sectionId === sectionId);
      expect(set.length, sectionId).toBeGreaterThanOrEqual(5);
      expect(new Set(set.map((p) => p.kind)).size, sectionId).toBeGreaterThanOrEqual(3);
    }
    const explained = (options: { why?: string }[]) => options.every((o) => Boolean(o.why?.trim()));
    const correct = (options: { correct?: boolean }[]) => options.filter((o) => o.correct).length;
    for (const p of problems) {
      expect(sectionIds, p.id).toContain(p.sectionId);
      expect(p.prompt.trim(), p.id).not.toBe('');
      expect(p.explanation.trim(), p.id).not.toBe('');
      // The renderer supports **bold** only; *single* asterisks would show literally.
      expect(JSON.stringify(p), p.id).not.toMatch(/(^|[^*\w])\*[A-Za-z][^*"]*\*(?!\*)/);
      switch (p.kind) {
        case 'choice':
          expect(p.options.length, p.id).toBeGreaterThanOrEqual(3);
          expect(correct(p.options), p.id).toBe(1);
          expect(explained(p.options), p.id).toBe(true);
          break;
        case 'multi':
          expect(p.options.length, p.id).toBeGreaterThanOrEqual(4);
          expect(correct(p.options), p.id).toBeGreaterThanOrEqual(1);
          expect(correct(p.options), p.id).toBeLessThan(p.options.length);
          expect(explained(p.options), p.id).toBe(true);
          break;
        case 'justify':
          expect(correct(p.options), p.id).toBe(1);
          expect(correct(p.reasons), p.id).toBe(1);
          expect(p.reasons.length, p.id).toBeGreaterThanOrEqual(3);
          expect(explained([...p.options, ...p.reasons]), p.id).toBe(true);
          break;
        case 'order':
          expect(p.steps.length, p.id).toBeGreaterThanOrEqual(4);
          expect(new Set(p.steps).size, p.id).toBe(p.steps.length);
          break;
        case 'numeric':
          expect(Number.isFinite(p.answer), p.id).toBe(true);
          expect(p.tolerance ?? 0, p.id).toBeGreaterThanOrEqual(0);
          break;
        case 'explain':
          expect(p.keyPoints.length, p.id).toBeGreaterThanOrEqual(3);
          break;
      }
    }
  });

  it('has exactly one well-formed lesson per section', () => {
    expect(chapter.lessons.map((l) => l.sectionId).sort()).toEqual([...sectionIds].sort());
    for (const lesson of chapter.lessons) {
      expect(lesson.intro.trim()).not.toBe('');
      expect(lesson.blocks.length).toBeGreaterThan(2);
      expect(lesson.takeaways.length).toBeGreaterThan(1);
      expect(lesson.blocks.some((b) => b.kind === 'check')).toBe(true);
      for (const block of lesson.blocks) {
        if (block.kind === 'table') for (const row of block.rows) expect(row).toHaveLength(block.head.length);
        if (block.kind === 'check') expect(block.answer.trim()).not.toBe('');
        if (block.kind === 'diagram') expect(block.art.trim()).not.toBe('');
        if (block.kind === 'steps') expect(block.steps.length).toBeGreaterThan(1);
        if (block.kind === 'try') expect(chapter.labs).toContain(block.labId);
      }
    }
  });

  it('covers every concept and section with at least one card', () => {
    for (const concept of chapter.concepts) expect(chapter.cards.some((c) => c.conceptIds.includes(concept.id))).toBe(true);
    for (const section of chapter.sections) expect(chapter.cards.some((c) => c.sectionId === section.id)).toBe(true);
  });

  it('has well-formed cards', () => {
    for (const card of chapter.cards) {
      expect(card.prompt.trim()).not.toBe('');
      if (card.kind === 'choice') {
        expect(card.options.filter((o) => o.correct)).toHaveLength(1);
        expect(card.options.length).toBeGreaterThanOrEqual(2);
      } else {
        expect(card.answer.trim()).not.toBe('');
        expect(card.keyPoints.length).toBeGreaterThan(0);
      }
    }
  });

  it('has trade-off answers that name a real column or "depends"', () => {
    for (const matrix of chapter.tradeoffs) {
      const columns = new Set([...matrix.columns.map((c) => c.id), 'depends']);
      for (const row of matrix.rows) expect(columns).toContain(row.answer);
    }
  });

  it('lists labs that exist and point at its sections', () => {
    for (const id of chapter.labs) {
      const lab = getLab(id);
      expect(lab?.chapterId).toBe(chapter.id);
      expect(sectionIds).toContain(lab?.sectionId);
    }
  });
});

describe('content registry', () => {
  it('finds chapters, labs and cards', () => {
    expect(getChapter('ch04')?.number).toBe(4);
    expect(getChapter('nope')).toBeUndefined();
    expect(getLab('lsm')?.title).toMatch(/LSM/);
    expect(LABS.length).toBeGreaterThan(0);
    expect(findCard(CONTENT_CARDS[0].id)).toBe(CONTENT_CARDS[0]);
    const custom = { ...CONTENT_CARDS[0], id: 'custom.x' };
    expect(findCard('custom.x', [custom])).toBe(custom);
    expect(findCard('missing')).toBeUndefined();
  });

  it('lists all 14 chapters of the 2nd edition', () => {
    expect(BOOK_CHAPTERS.map((c) => c.number)).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
  });
});
