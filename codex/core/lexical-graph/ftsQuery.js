// codex/core/lexical-graph/ftsQuery.js
//
// Shared FTS5 MATCH query sanitizer for the lexical graph. Mirrors the
// sanitize behavior of `sanitizeFtsQuery` in
// `codex/server/adapters/lexicon.sqlite.adapter.js` (strips boolean
// operators and punctuation so raw user input can't break FTS5 MATCH
// syntax), copied here rather than imported so the graph adapter never
// reaches into the Oracle adapter's internals. Do not modify the lexicon
// adapter to "share" this — it stays untouched per this slice's contract.

/**
 * @param {unknown} raw
 * @returns {string} sanitized MATCH query, or '' when nothing usable remains
 */
export function sanitizeFtsQuery(raw) {
  const query = String(raw ?? '').trim();
  if (!query) return '';
  const strippedOperators = query
    .replace(/\b(?:AND|OR|NOT|NEAR)\b/gi, ' ')
    .replace(/["'*:^(){}[\]|+\-~\\/<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const normalized = strippedOperators
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/gi, ''))
    .filter(Boolean)
    .join(' ');
  return normalized;
}
