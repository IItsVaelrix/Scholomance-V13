/**
 * buildResonanceGate — turns resolved resonance connections into the tiered
 * coloring gate.
 *
 * The gate is ONE Map keyed by source-relative charStart, valued by a tier:
 *
 *   'rhyme'      — the strong tier: full school color + glow. A non-assonance
 *                  connection scoring at/above the rhyme bar (MIN_RESONANCE_SCORE),
 *                  exactly the set of words that colored before this change.
 *   'assonance'  — the quiet tier: soft school tint, no glow. A type:'assonance'
 *                  connection (vowel echo). Fully represented, but subordinate so
 *                  it reads as a palette rather than skittles noise.
 *
 * Rhyme wins: a charStart that participates in both tiers is 'rhyme'.
 *
 * Returning a Map (not a Set) keeps `.has`/`.size` working for existing gate
 * consumers while adding `.get(charStart)` for the tier. Pure function — no
 * React, no DOM, no module state.
 *
 * @param {Array} connections - from resolveResonanceConnections().connections
 * @param {{ minResonanceScore?: number }} [opts]
 * @returns {Map<number, 'rhyme' | 'assonance'>}
 */
export const RHYME_TIER = 'rhyme';
export const ASSONANCE_TIER = 'assonance';
export const DEFAULT_MIN_RESONANCE_SCORE = 0.95;
// Only true word-rhyme connection types drive the rhyme (glow) tier. Notably
// this EXCLUDES `phrase_compound` (multi-token phrase windows — they belong to
// the highlight overlay, not per-word coloring, and otherwise flood the gate to
// ~68% of the document) and `consonance` (too weak to read as resonance).
export const RHYME_TIER_TYPES = new Set(['identity', 'perfect', 'near', 'slant']);
// Assonance tints only solid vowel echoes. The weak band (below this) is the
// long tail of incidental same-vowel pairs that read as noise rather than
// resonance, so it is left grey. Floor matches STRESSED_ASSONANCE_SCORE (0.62)
// so only stressed vowel echoes tint; sub-stressed fractions stay grey. Paired
// with the multi floor below for ~18% fewer colored words on baked artifacts.
export const DEFAULT_ASSONANCE_MIN_SCORE = 0.62;

/**
 * A multi is trusted by its STRUCTURE, not by a similarity number.
 *
 * MIN_RESONANCE_SCORE (0.95) is a trust proxy for the WORD tier: a high score was the
 * only evidence a pair rhymed. A multi arrives from multiRhyme.engine already proven —
 * it is a chain of >= 2 syllables, anchored on a stressed strong link, with every
 * slant link earned by the rest of the chain averaging above 0.80. Its `score` is the
 * mean link strength, an ordering, not a verdict. Judging it by the word bar would
 * censor every multi with an honest weak tail — which is most of them.
 *
 * 0.87 filters soft multi tails that were flooding the rhyme-glow tier
 * (prior 0.70 admitted every baked multi). Paired with the assonance floor for
 * ~18% fewer colored words without touching the word-rhyme 0.95 bar.
 */
export const DEFAULT_MULTI_MIN_SCORE = 0.87;

/**
 * Multis are passed SEPARATELY, never merged into `connections`.
 *
 * A multi is a chain of rhyme families across syllables; a word connection is one
 * rhyme on one token. Merging them would drag multis through the word tier's score
 * bar and type set — and every previous attempt to unify the two broke the word
 * engine. They share only this: both end up lighting words.
 */
export function buildResonanceGate(connections, opts = {}) {
  // No backend authority means the phonemes behind these connections are
  // spelling-derived guesses. Rendering them is not a degraded mode, it is a
  // lie: love/move and though/tough get opposite vowel families. Render nothing.
  if (opts.authorityUnavailable) return new Map();

  const minResonanceScore = typeof opts.minResonanceScore === 'number'
    ? opts.minResonanceScore
    : DEFAULT_MIN_RESONANCE_SCORE;
  const assonanceMinScore = typeof opts.assonanceMinScore === 'number'
    ? opts.assonanceMinScore
    : DEFAULT_ASSONANCE_MIN_SCORE;

  const gate = new Map();
  if (!Array.isArray(connections)) return gate;

  for (const c of connections) {
    const score = Number(c?.score) || 0;

    // Assonance tier: a type:'assonance' vowel echo that clears the assonance
    // floor (weak echoes are left grey to avoid over-coloring). Otherwise a
    // connection at or above the historical bar is the strong rhyme tier.
    const isAssonanceType = c?.type === ASSONANCE_TIER;

    let tier = null;
    if (isAssonanceType) {
      if (score >= assonanceMinScore) tier = ASSONANCE_TIER;
    } else if (RHYME_TIER_TYPES.has(c?.type) && score >= minResonanceScore) {
      tier = RHYME_TIER;
    }
    if (!tier) continue;

    for (const cs of [c?.wordA?.charStart, c?.wordB?.charStart]) {
      if (!Number.isFinite(cs)) continue;
      if (tier === RHYME_TIER) {
        gate.set(cs, RHYME_TIER); // rhyme always wins
      } else if (gate.get(cs) !== RHYME_TIER) {
        gate.set(cs, ASSONANCE_TIER);
      }
    }
  }

  // ── The multi pass, entirely separate from the word pass above ──────────────
  //
  // A multi spans several words, so it carries the charStart of EVERY word its chain
  // touches. Lighting only one of them would show a two-word rhyme as a single word.
  const multiMinScore = typeof opts.multiMinScore === 'number'
    ? opts.multiMinScore
    : DEFAULT_MULTI_MIN_SCORE;

  const multis = Array.isArray(opts.multis) ? opts.multis : [];
  for (const multi of multis) {
    if ((Number(multi?.score) || 0) < multiMinScore) continue;

    for (const end of [multi?.a, multi?.b]) {
      const charStarts = Array.isArray(end?.charStarts) ? end.charStarts : [];
      for (const cs of charStarts) {
        if (!Number.isFinite(cs)) continue;
        gate.set(cs, RHYME_TIER); // a multi is a rhyme; it wins over assonance
      }
    }
  }

  return gate;
}
