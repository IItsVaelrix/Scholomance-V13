import { describe, it, expect } from 'vitest';

export function estimateWordSyllables(singleWord) {
  if (!singleWord) return 0;
  const clean = singleWord.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return 0;
  if (clean.length <= 3) return 1;
  const hasCle = /[^aeiouy]le$/.test(clean);
  const formatted = clean
    .replace(/(?:[^laeiouy]es|ed|es|e)$/, '')
    .replace(/^y/, '');
  const matches = formatted.match(/[aeiouy]{1,2}/g);
  let count = matches ? matches.length : 1;
  if (hasCle && !clean.endsWith('ale') && !clean.endsWith('ole') && !clean.endsWith('ile')) {
    count += 1;
  }
  return Math.max(1, count);
}

export function estimateLineSyllables(lineText, syntaxLayer) {
  if (!lineText || !lineText.trim()) return 0;
  const words = lineText.match(/[a-zA-Z']+/g) || [];
  let total = 0;
  for (const word of words) {
    const norm = word.toLowerCase().replace(/'/g, '');
    if (!norm) continue;
    let knownCount = 0;
    if (syntaxLayer?.tokens) {
      const match = syntaxLayer.tokens.find(
        (t) => (t.token || t.text || '').toLowerCase() === norm
      );
      if (match && typeof match.syllableCount === 'number' && match.syllableCount > 0) {
        knownCount = match.syllableCount;
      }
    }
    total += knownCount || estimateWordSyllables(norm);
  }
  return total;
}

export function resolveLineSyllableCounts(propLineSyllableCounts, analyzedDocument, content, syntaxLayer) {
  let baseCounts = null;
  if (Array.isArray(propLineSyllableCounts) && propLineSyllableCounts.length > 0) {
    baseCounts = propLineSyllableCounts;
  } else if (Array.isArray(analyzedDocument?.lineSyllableCounts) && analyzedDocument.lineSyllableCounts.length > 0) {
    baseCounts = analyzedDocument.lineSyllableCounts;
  }

  const rawLines = content ? content.split('\n') : [];
  const count = Math.max(rawLines.length, baseCounts ? baseCounts.length : 0);
  if (count === 0) return [];

  const result = new Array(count);
  for (let i = 0; i < count; i++) {
    const lineText = rawLines[i] || '';
    if (baseCounts && typeof baseCounts[i] === 'number' && baseCounts[i] > 0) {
      result[i] = baseCounts[i];
    } else if (lineText.trim()) {
      result[i] = estimateLineSyllables(lineText, syntaxLayer);
    } else {
      result[i] = 0;
    }
  }
  return result;
}

describe('Line Syllable Counter Logic', () => {
  it('correctly estimates syllables for words', () => {
    expect(estimateWordSyllables('cat')).toBe(1);
    expect(estimateWordSyllables('hello')).toBe(2);
    expect(estimateWordSyllables('syllable')).toBe(3);
    expect(estimateWordSyllables('multisyllabic')).toBe(5);
  });

  it('correctly calculates line syllables when backend counts exist for all lines', () => {
    const propLineSyllableCounts = [5, 7];
    const content = "Line one text\nLine two text here";
    const resolved = resolveLineSyllableCounts(propLineSyllableCounts, null, content, null);
    expect(resolved).toEqual([5, 7]);
  });

  it('falls back to estimating new/missing lines when content has more lines than propLineSyllableCounts', () => {
    const propLineSyllableCounts = [3]; // only line 0
    const content = "Hello world\nTesting multisyllabic syllables\n\nFinal line";
    const resolved = resolveLineSyllableCounts(propLineSyllableCounts, null, content, null);
    // Line 0: 3 (from prop)
    // Line 1: "Testing multisyllabic syllables" -> 2 + 5 + 3 = 10
    // Line 2: "" -> 0
    // Line 3: "Final line" -> 2 + 1 = 3
    expect(resolved).toEqual([3, 9, 0, 3]);
  });

  it('uses syntaxLayer known syllable counts when available for unanalyzed line estimates', () => {
    const content = "Unseen word\nAnother line";
    const syntaxLayer = {
      tokens: [
        { token: 'unseen', syllableCount: 2 },
        { token: 'word', syllableCount: 1 },
      ]
    };
    const resolved = resolveLineSyllableCounts([], null, content, syntaxLayer);
    expect(resolved[0]).toBe(3);
  });
});
