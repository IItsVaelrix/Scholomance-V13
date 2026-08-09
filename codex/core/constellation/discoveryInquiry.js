/**
 * CONSTELLATION — pure discovery inquiry parse (operator-first)
 *
 * Detects operator/constraint/modifier spans on the raw token list before
 * excluding structural tokens from seed candidacy. No I/O.
 *
 * Spec: docs/superpowers/specs/2026-08-07-constellationos-poetic-discovery-design.md §4.3
 */

/** Bootstrap known-tone vocabulary (OR with span detection; never sole authority). */
export const KNOWN_TONE_MODIFIERS = Object.freeze(
  new Set(['emotional', 'spiritual', 'darker', 'softer', 'lighter', 'sharper', 'gentler']),
);

const META = new Set([
  'words', 'word', 'find', 'show', 'list', 'give', 'tell', 'search', 'lookup',
]);

/** Exact structural/operator tokens (feel-/resemble-/rhyme- prefixes handled separately). */
const STRUCTURAL_EXACT = new Set([
  'that', 'which', 'with', 'but', 'more', 'less', 'like', 'near', 'similar',
  'semantically', 'opposite', 'antonym', 'to', 'of', 'for', 'a', 'an', 'the',
  'me', 'please', 'and',
  'feel', 'feels', 'feeling',
  'resemble', 'resembling',
  'rhyme', 'rhymes', 'rhyming',
]);

const MODIFIER_STARTERS = new Set(['but', 'feel', 'feels', 'feeling', 'more', 'less']);

const RESEMBLE_TOKENS = new Set(['resemble', 'resembling', 'like', 'similar']);
const NEAR_SIGNAL_TOKENS = new Set(['near', 'semantically']);
const OPPOSITE_TOKENS = new Set(['opposite', 'antonym']);

/**
 * @typedef {{ token: string, source: 'span'|'known-tone' }} ModifierSource
 * @typedef {{
 *   status: 'ok'|'refuse',
 *   relation: 'resemble'|'rhyme'|'near'|'opposite'|'unknown',
 *   seeds: string[],
 *   modifiers: string[],
 *   modifierSources: ModifierSource[],
 *   constraints: { rhymeWith: string|null },
 *   reasons: string[],
 *   refusal: string|null,
 * }} DiscoveryParse
 */

/**
 * @param {string} t
 * @returns {boolean}
 */
function isStructuralToken(t) {
  if (!t) return true;
  if (META.has(t) || STRUCTURAL_EXACT.has(t)) return true;
  if (t.startsWith('feel') || t.startsWith('resemble') || t.startsWith('rhyme')) return true;
  return false;
}

/**
 * Content token: not structural, length ≥ 2.
 * @param {string} t
 */
function isContentToken(t) {
  return typeof t === 'string' && t.length >= 2 && !isStructuralToken(t);
}

/**
 * @param {{ normalized?: string, tokens?: string[] } | string} identityOrNormalized
 * @returns {string[]}
 */
function resolveTokens(identityOrNormalized) {
  if (typeof identityOrNormalized === 'string') {
    const n = identityOrNormalized.trim().replace(/\s+/g, ' ').toLowerCase();
    return n ? n.split(/\s+/).filter(Boolean) : [];
  }
  if (identityOrNormalized && Array.isArray(identityOrNormalized.tokens)) {
    return identityOrNormalized.tokens.map((t) => String(t).toLowerCase());
  }
  if (identityOrNormalized && typeof identityOrNormalized.normalized === 'string') {
    const n = identityOrNormalized.normalized.trim().replace(/\s+/g, ' ').toLowerCase();
    return n ? n.split(/\s+/).filter(Boolean) : [];
  }
  return [];
}

/**
 * Rhyme-with span: rhyme/rhymes then with then next content token.
 * @param {string[]} tokens
 * @returns {string|null}
 */
function extractRhymeWith(tokens) {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t !== 'rhyme' && t !== 'rhymes' && !t.startsWith('rhyme')) continue;
    let j = i + 1;
    while (j < tokens.length && tokens[j] !== 'with') {
      j += 1;
      if (j > i + 4) break;
    }
    if (j < tokens.length && tokens[j] === 'with') {
      for (let k = j + 1; k < tokens.length; k++) {
        if (isContentToken(tokens[k])) return tokens[k];
      }
    }
  }
  return null;
}

/**
 * Relation from operator tokens (rhyme constraint is independent of relation).
 * Semantic operators take priority over a co-occurring rhyme-with span.
 * @param {string[]} tokens
 * @param {string|null} rhymeWith
 * @returns {'resemble'|'rhyme'|'near'|'opposite'|'unknown'}
 */
function resolveRelation(tokens, rhymeWith) {
  const hasOpposite = tokens.some((t) => OPPOSITE_TOKENS.has(t));
  const hasResemble = tokens.some((t) => RESEMBLE_TOKENS.has(t) || t.startsWith('resemble'));
  const hasNearSignal = tokens.some((t) => NEAR_SIGNAL_TOKENS.has(t));
  const hasRhymeOp = tokens.some((t) => t === 'rhyme' || t === 'rhymes' || t.startsWith('rhyme'));

  if (hasOpposite) return 'opposite';
  if (hasResemble) return 'resemble';
  if (hasNearSignal) return 'near';
  if (rhymeWith != null || hasRhymeOp) return 'rhyme';
  return 'unknown';
}

/**
 * First modifier-span starter → content tokens until end or next major operator.
 * @param {string[]} tokens
 * @returns {string[]}
 */
function extractSpanModifiers(tokens) {
  let start = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (MODIFIER_STARTERS.has(tokens[i])) {
      start = i;
      break;
    }
  }
  if (start < 0) return [];

  const out = [];
  for (let i = start + 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === 'rhyme' || t === 'rhymes' || t.startsWith('rhyme')) break;
    if (OPPOSITE_TOKENS.has(t)) break;
    if (RESEMBLE_TOKENS.has(t) || t.startsWith('resemble')) break;
    if (t === 'semantically') break;
    if (isContentToken(t)) out.push(t);
  }
  return out;
}

/**
 * Parse a discovery (meta-query) inquiry into seeds, relation, modifiers, constraints.
 * Operator-first: detect spans before excluding structural tokens from seeds.
 *
 * @param {{ normalized?: string, tokens?: string[] } | string} identityOrNormalized
 * @returns {DiscoveryParse}
 */
export function parseDiscoveryInquiry(identityOrNormalized) {
  const tokens = resolveTokens(identityOrNormalized);
  const reasons = [];

  const rhymeWith = extractRhymeWith(tokens);
  if (rhymeWith) reasons.push(`rhymeWith:${rhymeWith}`);

  const spanMods = extractSpanModifiers(tokens);
  /** @type {ModifierSource[]} */
  const modifierSources = spanMods.map((token) => ({ token, source: /** @type {'span'} */ ('span') }));
  const captured = new Set(spanMods);

  // Known-tone OR: only if not already span-captured
  for (const t of tokens) {
    if (KNOWN_TONE_MODIFIERS.has(t) && !captured.has(t)) {
      modifierSources.push({ token: t, source: 'known-tone' });
      captured.add(t);
    }
  }

  const modifiers = modifierSources.map((m) => m.token);
  const excludedFromSeeds = new Set(modifiers);
  if (rhymeWith) excludedFromSeeds.add(rhymeWith);

  // Seeds = remaining content tokens (length ≥ 2), stable first-appearance order
  const seeds = [];
  const seen = new Set();
  for (const t of tokens) {
    if (!isContentToken(t)) continue;
    if (excludedFromSeeds.has(t)) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    seeds.push(t);
  }

  // Rhyme-only (or rhyme-primary with only modifiers): seed falls back to rhymeWith
  if (seeds.length === 0 && rhymeWith) {
    seeds.push(rhymeWith);
    reasons.push('seed-from-rhymeWith');
  }

  let relation = resolveRelation(tokens, rhymeWith);
  if (relation === 'unknown' && seeds.length > 0) {
    relation = 'near';
    reasons.push('relation-default-near');
  }

  if (seeds.length === 0) {
    return {
      status: 'refuse',
      relation,
      seeds: [],
      modifiers,
      modifierSources,
      constraints: { rhymeWith },
      reasons: [...reasons, 'no-seeds'],
      refusal: 'no seeds remain after operator-first parse',
    };
  }

  reasons.push(`relation:${relation}`, `seeds:${seeds.join(',')}`);

  return {
    status: 'ok',
    relation,
    seeds,
    modifiers,
    modifierSources,
    constraints: { rhymeWith },
    reasons,
    refusal: null,
  };
}
