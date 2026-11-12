/**
 * Tiny, safe formatter for study prose: paragraphs, "- " bullet lists, ``` code blocks,
 * `inline code` and **bold**. Produces tokens rather than HTML so nothing is injected.
 */

export type InlineToken = { type: 'text' | 'code' | 'strong'; value: string };

export type Block =
  | { type: 'paragraph'; inline: InlineToken[] }
  | { type: 'list'; items: InlineToken[][] }
  | { type: 'code'; value: string };

const INLINE_PATTERN = /(`[^`]+`|\*\*[^*]+\*\*)/g;

export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  for (const part of text.split(INLINE_PATTERN)) {
    if (!part) continue;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      tokens.push({ type: 'code', value: part.slice(1, -1) });
    } else if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      tokens.push({ type: 'strong', value: part.slice(2, -2) });
    } else {
      tokens.push({ type: 'text', value: part });
    }
  }
  return tokens;
}

export function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let paragraph: string[] = [];
  let list: string[] = [];

  const flush = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: 'paragraph', inline: parseInline(paragraph.join(' ')) });
      paragraph = [];
    }
    if (list.length > 0) {
      blocks.push({ type: 'list', items: list.map(parseInline) });
      list = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      flush();
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) code.push(lines[i++]);
      blocks.push({ type: 'code', value: code.join('\n') });
      continue;
    }
    const trimmed = line.trim();
    if (trimmed === '') {
      flush();
    } else if (trimmed.startsWith('- ')) {
      if (paragraph.length > 0) {
        blocks.push({ type: 'paragraph', inline: parseInline(paragraph.join(' ')) });
        paragraph = [];
      }
      list.push(trimmed.slice(2));
    } else {
      if (list.length > 0) {
        blocks.push({ type: 'list', items: list.map(parseInline) });
        list = [];
      }
      paragraph.push(trimmed);
    }
  }
  flush();
  return blocks;
}
