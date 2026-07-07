import { tokenize } from '../tokenizer.js';

/**
 * @param {string} text
 * @returns {string[]}
 */
export function tokenizeVerse(text = '') {
  return [...new Set(tokenize(text).map((token) => String(token).toUpperCase()))];
}

/**
 * @param {string[]} verseTokens
 * @param {Record<string, string>|Map<string, string>} lemmaMap
 * @returns {{ band: string|null, matches: string[] }}
 */
export function matchLemmaBands(verseTokens, lemmaMap) {
  const matches = [];
  let band = null;
  const entries = lemmaMap instanceof Map
    ? [...lemmaMap.entries()]
    : Object.entries(lemmaMap);

  for (const token of verseTokens) {
    for (const [lemma, mappedBand] of entries) {
      if (token === lemma.toUpperCase()) {
        matches.push(token);
        band = mappedBand;
      }
    }
  }

  return { band, matches: [...new Set(matches)] };
}

/**
 * @param {string[]} verseTokens
 * @param {string[]} lemmas
 */
export function countLemmaHits(verseTokens, lemmas = []) {
  const set = new Set(lemmas.map((entry) => entry.toUpperCase()));
  return verseTokens.filter((token) => set.has(token));
}