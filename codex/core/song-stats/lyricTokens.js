/**
 * Canonical lyric tokenization for song-stats pillars.
 * One filter pipeline → one denominator for rhyme, vocabulary, and gates.
 */

/**
 * v1 recognizes named section prefixes, bracket labels, and short all-uppercase labels.
 * Title-case lyric lines remain lyrics unless they use a named prefix.
 *
 * @param {{ text?: string } | null | undefined} line
 * @returns {boolean}
 */
export function isSectionHeadingLine(line) {
  const text = String(line?.text ?? '').trim();
  if (!text) return false;

  if (/^\[[^\]]+\]$/u.test(text)) {
    return true;
  }

  if (/^(verse|chorus|bridge|intro|outro|hook|section)\b/i.test(text)) {
    return true;
  }

  const wordCount = text.split(/\s+/u).filter(Boolean).length;
  return (
    wordCount <= 3
    && /^[A-Z][A-Z0-9 ]{0,24}$/u.test(text)
  );
}

/**
 * @param {Record<string, unknown> | null | undefined} word
 * @returns {string}
 */
export function normalizeLyricToken(word) {
  return String(word?.normalized ?? word?.text ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z'-]/g, '')
    .replace(/^['-]+|['-]+$/g, '');
}

/**
 * @param {import('./types.js').AnalyzedDocument | null | undefined} doc
 * @returns {Set<unknown>}
 */
function headingWordIdentitySet(doc) {
  const identities = new Set();
  for (const line of Array.isArray(doc?.lines) ? doc.lines : []) {
    if (!isSectionHeadingLine(line)) continue;
    for (const word of Array.isArray(line?.words) ? line.words : []) {
      identities.add(word);
      const start = Number(word?.start);
      if (Number.isFinite(start)) {
        identities.add(`start:${start}`);
      }
    }
  }
  return identities;
}

/**
 * @param {import('./types.js').AnalyzedDocument | null | undefined} doc
 * @returns {{
 *   rawWordCount: number,
 *   analyzedTokens: Array<Record<string, unknown>>,
 *   analyzedTokenCount: number,
 *   excludedTokenCount: number,
 * }}
 */
export function collectSongStatsTokens(doc) {
  const rawWords = Array.isArray(doc?.allWords) ? doc.allWords : [];
  const rawWordCount = rawWords.length;

  const headingLineNumbers = new Set(
    (Array.isArray(doc?.lines) ? doc.lines : [])
      .filter((line) => isSectionHeadingLine(line))
      .map((line) => Number(line?.number))
      .filter((number) => Number.isFinite(number)),
  );
  const headingWords = headingWordIdentitySet(doc);

  /** @type {Array<Record<string, unknown>>} */
  const analyzedTokens = [];

  for (const word of rawWords) {
    const token = normalizeLyricToken(word);
    if (token.length < 2) continue;

    const lineNumber = Number(word?.lineNumber);
    const start = Number(word?.start);
    const onHeadingLine = (
      (Number.isFinite(lineNumber) && headingLineNumbers.has(lineNumber))
      || headingWords.has(word)
      || (Number.isFinite(start) && headingWords.has(`start:${start}`))
    );
    if (onHeadingLine) continue;

    analyzedTokens.push({
      ...word,
      normalized: token,
    });
  }

  const analyzedTokenCount = analyzedTokens.length;
  return {
    rawWordCount,
    analyzedTokens,
    analyzedTokenCount,
    excludedTokenCount: Math.max(0, rawWordCount - analyzedTokenCount),
  };
}
