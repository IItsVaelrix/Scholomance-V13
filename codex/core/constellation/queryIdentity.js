import { STOPWORDS } from './stopwords.js';
import { classifyIntent, selectHeadToken } from './phraseAnalysis.js';

function normalizeQuery(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function splitTokens(normalized) {
  if (!normalized) return [];
  return normalized.split(/\s+/).filter(Boolean);
}

/**
 * @param {string} rawQuery
 * @param {Map<string, number>} [freqMap] - optional corpus frequency map for
 *   rarest-token head selection (PDR §3.2). When omitted, falls back to
 *   last-content-token.
 * @param {Map<string, string[]>} [posMap] - optional word → POS tags, so the
 *   anchor is the nominal head rather than whichever token is rarest.
 * @returns {{ raw: string, normalized: string, kind: 'word'|'phrase'|'line'|'multiline',
 *   tokenCount: number, graphemeCount: number, tokens: string[],
 *   primaryContentToken: string|null, intent: string }}
 */
export function resolveQueryIdentity(rawQuery, freqMap, posMap) {
  const raw = String(rawQuery || '');
  const normalized = normalizeQuery(raw);
  const tokens = splitTokens(normalized);
  const hasNewline = /\n/.test(raw.trim());

  let kind;
  if (hasNewline) kind = 'multiline';
  else if (tokens.length <= 1) kind = 'word';
  else if (tokens.length <= 6) kind = 'phrase';
  else kind = 'line';

  const identity = { raw, normalized, kind, tokenCount: tokens.length, graphemeCount: [...normalized].length, tokens };

  // Intent classification (pure, no I/O)
  const intent = classifyIntent(identity);

  // Head-token selection: nominal head first, rarest among nominals when
  // freqMap is provided, otherwise last content token (backward-compatible).
  const primaryContentToken = selectHeadToken(tokens, freqMap, posMap);

  return {
    ...identity,
    primaryContentToken,
    intent,
  };
}
