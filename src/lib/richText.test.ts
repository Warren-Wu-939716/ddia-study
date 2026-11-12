import { describe, expect, it } from 'vitest';
import { parseBlocks, parseInline } from './richText.ts';

describe('parseInline', () => {
  it('tokenizes code and bold without interpreting HTML', () => {
    expect(parseInline('Use `db_get` and **never** <script>')).toEqual([
      { type: 'text', value: 'Use ' },
      { type: 'code', value: 'db_get' },
      { type: 'text', value: ' and ' },
      { type: 'strong', value: 'never' },
      { type: 'text', value: ' <script>' },
    ]);
  });
});

describe('parseBlocks', () => {
  it('splits paragraphs, lists and fenced code', () => {
    const blocks = parseBlocks('First line\ncontinues.\n\n- one\n- two\n\n```\nSELECT 1;\n```\nAfter');
    expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'list', 'code', 'paragraph']);
    expect(blocks[0]).toEqual({ type: 'paragraph', inline: [{ type: 'text', value: 'First line continues.' }] });
    expect(blocks[1].type === 'list' && blocks[1].items).toHaveLength(2);
    expect(blocks[2]).toEqual({ type: 'code', value: 'SELECT 1;' });
  });

  it('handles a list directly after a paragraph line', () => {
    expect(parseBlocks('Intro:\n- a\n- b').map((b) => b.type)).toEqual(['paragraph', 'list']);
  });
});
