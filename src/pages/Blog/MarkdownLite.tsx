/**
 * MarkdownLite -- a dependency-free, XSS-safe renderer for the lightweight text
 * format used by user-authored blog posts.
 *
 * Supported syntax:
 *   ## heading            → <h2 id="...">   (anchored, contributes to TOC)
 *   ### heading           → <h3 id="...">   (anchored, contributes to TOC)
 *   blank-line blocks     → <p>
 *   lines starting "- "   → <ul><li>
 *   inline **bold**       → <strong>
 *   inline *italic*       → <em>
 *
 * Everything is rendered as React text/elements -- never `dangerouslySetInnerHTML`.
 * Raw HTML in the source is therefore shown as escaped text, never executed.
 */

import type { ReactNode } from 'react';
import { slugify } from './blogStore.js';

export interface TocEntry {
  href: string;
  label: string;
  level: 2 | 3;
}

type Block =
  | { type: 'h2' | 'h3'; text: string; id: string }
  | { type: 'p'; text: string }
  | { type: 'ul'; items: string[] };

const HEADING_RE = /^(#{2,3})\s+(.*)$/;

function splitBlocks(body: string): string[] {
  return String(body || '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
}

function parseBlock(raw: string): Block {
  const headingMatch = raw.match(HEADING_RE);
  if (headingMatch) {
    const level = headingMatch[1].length === 2 ? 'h2' : 'h3';
    const text = headingMatch[2].trim();
    return { type: level, text, id: slugify(text) };
  }

  const lines = raw.split('\n');
  if (lines.length > 0 && lines.every((l) => l.trimStart().startsWith('- '))) {
    return { type: 'ul', items: lines.map((l) => l.trimStart().slice(2).trim()) };
  }

  // Collapse soft line breaks within a paragraph into spaces.
  return { type: 'p', text: lines.join(' ') };
}

/** Splits a line into safe React nodes, honouring **bold** and *italic*. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).filter((t) => t !== '');
  return tokens.map((token, i) => {
    const key = `${keyPrefix}-${i}`;
    if (token.startsWith('**') && token.endsWith('**')) {
      return <strong key={key}>{token.slice(2, -2)}</strong>;
    }
    if (token.startsWith('*') && token.endsWith('*')) {
      return <em key={key}>{token.slice(1, -1)}</em>;
    }
    return <span key={key}>{token}</span>;
  });
}

export function extractToc(body: string): TocEntry[] {
  return splitBlocks(body)
    .map(parseBlock)
    .filter((b): b is Extract<Block, { type: 'h2' | 'h3' }> => b.type === 'h2' || b.type === 'h3')
    .map((b) => ({
      href: `#${b.id}`,
      label: b.text,
      level: b.type === 'h2' ? 2 : 3,
    }));
}

export interface MarkdownLiteProps {
  body: string;
}

export function MarkdownLite({ body }: MarkdownLiteProps) {
  const blocks = splitBlocks(body).map(parseBlock);
  return (
    <>
      {blocks.map((block, i) => {
        const key = `blk-${i}`;
        switch (block.type) {
          case 'h2':
            return (
              <h2 key={key} id={block.id}>
                {renderInline(block.text, key)}
              </h2>
            );
          case 'h3':
            return (
              <h3 key={key} id={block.id}>
                {renderInline(block.text, key)}
              </h3>
            );
          case 'ul':
            return (
              <ul key={key}>
                {block.items.map((item, j) => (
                  <li key={`${key}-${j}`}>{renderInline(item, `${key}-${j}`)}</li>
                ))}
              </ul>
            );
          case 'p':
          default:
            return <p key={key}>{renderInline(block.text, key)}</p>;
        }
      })}
    </>
  );
}

export default MarkdownLite;
