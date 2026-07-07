import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MarkdownLite, extractToc } from '../../../src/pages/Blog/MarkdownLite.tsx';

describe('extractToc', () => {
  it('extracts h2/h3 headings with anchors and levels', () => {
    const body = '## First Section\n\nbody\n\n### A Sub Head\n\nmore';
    const toc = extractToc(body);
    expect(toc).toEqual([
      { href: '#first-section', label: 'First Section', level: 2 },
      { href: '#a-sub-head', label: 'A Sub Head', level: 3 },
    ]);
  });

  it('returns an empty array when there are no headings', () => {
    expect(extractToc('just a paragraph')).toEqual([]);
  });
});

describe('MarkdownLite rendering', () => {
  it('renders ## as an anchored h2', () => {
    const { container } = render(<MarkdownLite body={'## Hello There'} />);
    const h2 = container.querySelector('h2');
    expect(h2).toBeTruthy();
    expect(h2.textContent).toBe('Hello There');
    expect(h2.id).toBe('hello-there');
  });

  it('renders ### as an anchored h3', () => {
    const { container } = render(<MarkdownLite body={'### Deep Cut'} />);
    const h3 = container.querySelector('h3');
    expect(h3.id).toBe('deep-cut');
  });

  it('renders blank-line-separated blocks as paragraphs', () => {
    const { container } = render(<MarkdownLite body={'one\n\ntwo'} />);
    const paras = container.querySelectorAll('p');
    expect(paras).toHaveLength(2);
    expect(paras[0].textContent).toBe('one');
    expect(paras[1].textContent).toBe('two');
  });

  it('renders "- " lines as a list', () => {
    const { container } = render(<MarkdownLite body={'- alpha\n- beta'} />);
    const items = container.querySelectorAll('ul li');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toBe('alpha');
  });

  it('renders **bold** and *italic*', () => {
    const { container } = render(<MarkdownLite body={'a **strong** and *soft* word'} />);
    expect(container.querySelector('strong').textContent).toBe('strong');
    expect(container.querySelector('em').textContent).toBe('soft');
  });
});

describe('MarkdownLite XSS safety', () => {
  it('escapes a <script> tag instead of executing it', () => {
    const { container } = render(<MarkdownLite body={'<script>alert(1)</script>'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
  });

  it('does not render an <img onerror> payload as an element', () => {
    const { container } = render(<MarkdownLite body={'<img src=x onerror=alert(1)>'} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror=alert(1)>');
  });
});
