/**
 * Verse Synthesis Microprocessor
 * 
 * Offloads linguistic transmutation from the main thread.
 * Standardizes the VerseSynthesis AMP interface.
 */

import { synthesizeVerse } from '../../shared/truesight/compiler/VerseSynthesis.js';
import { WORD_REGEX_GLOBAL } from '../../constants/regex.js';
import { runDictPrimeAuthority } from '../dict/primeAuthority.js';

/**
 * Synthesizes a verse into a structured artifact.
 * 
 * @param {Object} payload - { text, options }
 * @param {Object} context
 * @returns {Promise<Object>} The synthesis artifact
 */
export async function runSynthesis(payload, _context) {
  const context = _context || {};
  const { text, options = {} } = payload;
  
  if (!text) {
    return { ok: false, error: 'MISSING_TEXT' };
  }

  const uniqueWords = [...new Set(String(text).match(WORD_REGEX_GLOBAL) || [])];
  // Always prime through dict.primeAuthority so Node gets self-sqlite and
  // browser keeps fetch — never call primeAuthorityBatch() bare in Node.
  await runDictPrimeAuthority({ words: uniqueWords }, context);

  // Execute the pure compiler logic after the canonical PhonemeEngine authority
  // cache has been hydrated. compileVerseToIR remains the single synchronous
  // source of truth; the API only feeds that source before compilation.
  const artifact = synthesizeVerse(text, options);

  return artifact;
}
