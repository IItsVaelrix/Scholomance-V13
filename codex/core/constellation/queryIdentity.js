import { STOPWORDS } from './stopwords.js';

function normalizeQuery(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function splitTokens(normalized) {
  if (!normalized) return [];
  return normalized.split(/\s+/).filter(Boolean);
}

/**
 * @param {string} rawQuery
 * @returns {{ raw: string, normalized: string, kind: 'word'|'phrase'|'line'|'multiline',
 *   tokenCount: number, graphemeCount: number, tokens: string[], primaryContentToken: string|null }}
 */
export function resolveQueryIdentity(rawQuery) {
  const raw = String(rawQuery || '');
  const normalized = normalizeQuery(raw);
  const tokens = splitTokens(normalized);
  const hasNewline = /\n/.test(raw.trim());

  let kind;
  if (hasNewline) kind = 'multiline';
  else if (tokens.length <= 1) kind = 'word';
  else if (tokens.length <= 6) kind = 'phrase';
  else kind = 'line';

  // Primary content token: last non-stopword (PDR examples center on a head word).
  const content = tokens.filter((t) => !STOPWORDS.has(t));
  const primaryContentToken = content.length > 0 ? content[content.length - 1] : null;

  return {
    raw,
    normalized,
    kind,
    tokenCount: tokens.length,
    graphemeCount: [...normalized].length,
    tokens,
    primaryContentToken,
  };
}
