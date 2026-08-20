/**
 * Split sole-cause punct holes into constructions.
 *
 * `punct` is a bag. promisedUnblock is computed inside each family,
 * never across the bag.
 *
 * @module codex/research/parser-failure-atlas/cluster-punctuation
 */

import { SEALED_SPLIT } from './atlas-schema.js';

export const PUNCT_FAMILIES = Object.freeze([
  'QUOTE_FINAL',
  'APPOSITION',
  'FRAGMENT',
  'PARENTHETICAL',
  'LIST_PUNCT',
  'SENTENCE_FINAL',
  'HYPHEN_COMPOUND',
  'OTHER',
]);

const QUOTES = new Set(['"', '\u201c', '\u201d', '``', "''", "'", '\u00ab', '\u00bb']);
const FINALS = new Set(['.', '?', '!']);
const PAIRS = new Set(['(', ')', '[', ']', '{', '}', '--', '\u2014', '\u2013']);
const DETS = new Set(['the', 'a', 'an']);
const AND_OR = new Set(['and', 'or']);

function tokensOf(row) {
  if (Array.isArray(row.tokens) && row.tokens.length) return row.tokens.map(String);
  return String(row.text || '').split(/\s+/).filter(Boolean);
}

function solePunctCategory(row) {
  const cats = (row.diagnosis?.categories || []).filter((c) => c.deprel === 'punct');
  const labels = new Set((row.diagnosis?.categories || []).map((c) => c.label));
  if (labels.size !== 1) return null;
  if (cats.length === 0) return null;
  return cats[0];
}

export function classifyPunctConstruction(row) {
  const cat = solePunctCategory(row) || (row.diagnosis?.categories || [])[0];
  const tokens = tokensOf(row);
  const i = Number.isInteger(cat?.from) ? cat.from : tokens.length - 1;
  const tok = String(tokens[i] || '');
  const last = tokens[tokens.length - 1] || '';
  const next = String(tokens[i + 1] || '').toLowerCase();
  const commaCount = tokens.filter((t) => t === ',').length;

  if (QUOTES.has(tok) || (QUOTES.has(last) && i >= tokens.length - 2)) return 'QUOTE_FINAL';
  if (PAIRS.has(tok)) return 'PARENTHETICAL';
  const prev = String(tokens[i - 1] || '');
  const wordish = (s) => /[A-Za-z0-9]/.test(s);
  if (tok === '-' && wordish(prev) && wordish(next)) return 'HYPHEN_COMPOUND';
  if (tok === '-' && (i === 0 || i === tokens.length - 1)) {
    return i === 0 ? 'LIST_PUNCT' : 'PARENTHETICAL';
  }
  if (tok === ',') {
    if (DETS.has(next)) return 'APPOSITION';
    if (commaCount >= 2 || tokens.some((t) => AND_OR.has(String(t).toLowerCase()))) return 'LIST_PUNCT';
    return 'APPOSITION';
  }
  if (FINALS.has(tok) && i >= tokens.length - 1) {
    const root = row.gold?.rootUpos;
    if (tokens.length <= 4 && root !== 'VERB') return 'FRAGMENT';
    return 'SENTENCE_FINAL';
  }
  return 'OTHER';
}

export function clusterPunctuation(cases) {
  for (const row of cases || []) {
    if (row.split === SEALED_SPLIT) throw new Error('test cases cannot enter punctuation clustering');
  }
  const buckets = Object.fromEntries(PUNCT_FAMILIES.map((f) => [f, []]));
  for (const row of cases || []) {
    if (row.plate && row.plate !== 'GRAMMAR') continue;
    const cat = solePunctCategory(row);
    if (!cat) continue;
    const family = classifyPunctConstruction(row);
    buckets[family].push(row);
  }
  const out = {};
  for (const family of PUNCT_FAMILIES) {
    const items = buckets[family];
    const lemmas = new Set(items.map((r) => String(r.gold?.verb || '').toLowerCase()).filter(Boolean));
    out[family] = Object.freeze({
      family,
      cases: items.length,
      promisedUnblock: items.length,
      lemmas: lemmas.size,
      examples: Object.freeze(items.slice(0, 8).map((r) => Object.freeze({
        caseId: r.caseId,
        text: r.text,
        label: r.diagnosis?.categories?.[0]?.label ?? null,
        split: r.split,
      }))),
    });
  }
  return Object.freeze(out);
}
