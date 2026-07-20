/**
 * dict.primeAuthority -- hydrate PhonemeEngine from Scholomance Dictionary.
 *
 * Browser: default ScholomanceDictionaryAPI (fetch /api/lexicon).
 * Node (bake, server, tests): buildSelfDictionaryAPI -- in-process sqlite,
 * same path panelAnalysis uses. Calling primeAuthorityBatch() with NO api in
 * Node makes fetch fail and sets authorityFailure, which blanks Truesight.
 */

import { PhonemeEngine } from '../../phonology/phoneme.engine.js';
import { WORD_REGEX_GLOBAL } from '../../constants/regex.js';

const NODE_DICTIONARY_AUTHORITY_MODULE =
  '../../../server/adapters/selfDictionary.authority.js';

function isNode() {
  return typeof process !== 'undefined' && Boolean(process.versions?.node);
}

async function resolveDictionaryAPI(explicit) {
  if (explicit) return explicit;
  if (!isNode()) return undefined; // PhonemeEngine default = ScholomanceDictionaryAPI
  // This branch is Node-only. Keep the specifier opaque to Vite so the
  // browser-worker graph cannot absorb the SQLite server adapter.
  const { buildSelfDictionaryAPI } = await import(
    /* @vite-ignore */
    NODE_DICTIONARY_AUTHORITY_MODULE
  );
  return buildSelfDictionaryAPI({ log: console });
}

/**
 * @param {{ words?: string[], text?: string, dictionaryAPI?: object }} payload
 * @param {{ dictionaryAPI?: object }} [context]
 */
export async function runDictPrimeAuthority(payload = {}, context = {}) {
  const fromText = typeof payload.text === 'string'
    ? (String(payload.text).match(WORD_REGEX_GLOBAL) || [])
    : [];
  const words = Array.isArray(payload.words) && payload.words.length
    ? payload.words
    : fromText;
  const unique = [...new Set(words.filter(Boolean))];

  if (unique.length === 0) {
    return {
      ok: true,
      primed: 0,
      authorityUnavailable: Boolean(PhonemeEngine.authorityFailure),
      source: 'noop',
    };
  }

  const dictionaryAPI = await resolveDictionaryAPI(
    payload.dictionaryAPI || context.dictionaryAPI,
  );
  const source = dictionaryAPI ? (isNode() ? 'self-sqlite' : 'explicit') : 'default-fetch';

  if (typeof PhonemeEngine.primeAuthorityBatch === 'function') {
    await PhonemeEngine.primeAuthorityBatch(unique, dictionaryAPI);
  } else if (typeof PhonemeEngine.ensureAuthorityBatch === 'function') {
    await PhonemeEngine.ensureAuthorityBatch(unique, dictionaryAPI);
  }

  if (typeof PhonemeEngine.primeG2PBatch === 'function') {
    await PhonemeEngine.primeG2PBatch(unique);
  }

  return {
    ok: !PhonemeEngine.authorityFailure,
    primed: unique.length,
    authorityUnavailable: Boolean(PhonemeEngine.authorityFailure),
    authorityFailure: PhonemeEngine.authorityFailure || null,
    source,
  };
}
