import { Fragment } from 'react';
import { parseBlocks, parseInline, type InlineToken } from '../lib/richText.ts';

function Inline({ tokens }: { tokens: InlineToken[] }) {
  return (
    <>
      {tokens.map((t, i) =>
        t.type === 'code' ? (
          <code key={i}>{t.value}</code>
        ) : t.type === 'strong' ? (
          <strong key={i}>{t.value}</strong>
        ) : (
          <Fragment key={i}>{t.value}</Fragment>
        ),
      )}
    </>
  );
}

/** Renders study prose with minimal formatting, without ever injecting HTML. */
export function RichText({ text, inline = false }: { text: string; inline?: boolean }) {
  if (inline) return <Inline tokens={parseInline(text)} />;
  return (
    <div className="rich">
      {parseBlocks(text).map((block, i) => {
        if (block.type === 'code') return <pre key={i}>{block.value}</pre>;
        if (block.type === 'list')
          return (
            <ul key={i}>
              {block.items.map((item, j) => (
                <li key={j}>
                  <Inline tokens={item} />
                </li>
              ))}
            </ul>
          );
        return (
          <p key={i}>
            <Inline tokens={block.inline} />
          </p>
        );
      })}
    </div>
  );
}
