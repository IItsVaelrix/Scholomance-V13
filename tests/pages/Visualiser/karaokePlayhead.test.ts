import { describe, it, expect, beforeEach } from 'vitest';
import { applyKaraokePlayhead } from '../../../src/pages/Visualiser/karaoke/karaokePlayhead';

function mountLyrics(): HTMLOListElement {
  const ol = document.createElement('ol');
  ol.className = 'bcv-lyrics';
  for (let i = 0; i < 3; i += 1) {
    const li = document.createElement('li');
    li.setAttribute('data-k-line', String(i));
    const text = document.createElement('span');
    text.className = 'bcv-lyric-text';
    for (let w = 0; w < 2; w += 1) {
      const span = document.createElement('span');
      span.setAttribute('data-k-word', String(w));
      span.textContent = `w${i}${w}`;
      text.appendChild(span);
    }
    li.appendChild(text);
    ol.appendChild(li);
  }
  document.body.appendChild(ol);
  return ol;
}

describe('karaokePlayhead', () => {
  let root: HTMLOListElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = mountLyrics();
  });

  it('highlights the target line and clears the previous', () => {
    applyKaraokePlayhead(root, { line: 0, word: -1 });
    expect(root.querySelector('[data-k-line="0"]')?.classList.contains('is-highlight')).toBe(true);
    applyKaraokePlayhead(root, { line: 1, word: -1 });
    expect(root.querySelector('[data-k-line="0"]')?.classList.contains('is-highlight')).toBe(false);
    expect(root.querySelector('[data-k-line="1"]')?.classList.contains('is-highlight')).toBe(true);
    expect(root.querySelector('[data-k-line="1"]')?.getAttribute('aria-current')).toBe('true');
  });

  it('marks sung word and clears previous', () => {
    applyKaraokePlayhead(root, { line: 0, word: 0 });
    expect(root.querySelector('[data-k-line="0"] [data-k-word="0"]')?.getAttribute('data-sung')).toBe('true');
    applyKaraokePlayhead(root, { line: 0, word: 1, backing: true, estimated: true });
    const prev = root.querySelector('[data-k-line="0"] [data-k-word="0"]');
    const next = root.querySelector('[data-k-line="0"] [data-k-word="1"]');
    expect(prev?.getAttribute('data-sung')).toBeNull();
    expect(next?.getAttribute('data-sung')).toBe('backing');
    expect(next?.getAttribute('data-timing')).toBe('estimated');
  });

  it('is idempotent for the same target', () => {
    applyKaraokePlayhead(root, { line: 2, word: 1 });
    applyKaraokePlayhead(root, { line: 2, word: 1 });
    expect(root.querySelectorAll('.is-highlight')).toHaveLength(1);
    expect(root.querySelectorAll('[data-sung]')).toHaveLength(1);
  });
});
