/**
 * CONSTELLATION — frozen discovery weight profiles, pre-score Ks, and caps
 *
 * Pure constants only. Consumed by discoveryScoring + discovery adapter.
 *
 * Spec: docs/superpowers/specs/2026-08-07-constellationos-poetic-discovery-design.md §4.7
 */

/** Max ranked hits returned to the discovery channel. */
export const DISCOVERY_HIT_LIMIT = 12;

/** Max lemmas retained per lexicon source per seed during expand. */
export const DISCOVERY_PER_SOURCE_CAP = 40;

/** Max unique candidates before hard constraints. */
export const DISCOVERY_GLOBAL_CAP = 80;

/**
 * Canonical generator source walk order.
 * synonyms → related → symbols → fts
 */
export const DISCOVERY_SOURCE_ORDER = Object.freeze([
  'synonyms',
  'related',
  'symbols',
  'fts',
]);

/**
 * Pre-score blend: synonymScore * (K0 + K1*modifierFit + K2*rarityBoost)
 * Frozen; do not retune without a plan revision.
 */
export const PRE_SCORE = Object.freeze({
  K0: 0.55,
  K1: 0.30,
  K2: 0.15,
});

/**
 * PLS weight profiles for discovery ranking.
 * `prefix` is always 0 on the discovery path.
 *
 * - semantic: synonym-heavy; rhyme low (hard rhyme already filtered when present)
 * - rhyme-forward: rhyme high among survivors; synonym still reweights feel-X
 *
 * @type {Readonly<{
 *   semantic: Readonly<Record<string, number>>,
 *   'rhyme-forward': Readonly<Record<string, number>>,
 * }>}
 */
export const WEIGHT_PROFILES = Object.freeze({
  semantic: Object.freeze({
    rhyme: 0.05,
    prefix: 0,
    synonym: 0.32,
    validity: 0.10,
    democracy: 0.15,
    predictability: 0.15,
    meter: 0.13,
    color: 0.10,
  }),
  'rhyme-forward': Object.freeze({
    rhyme: 0.36,
    prefix: 0,
    synonym: 0.16,
    validity: 0.10,
    democracy: 0.12,
    predictability: 0.12,
    meter: 0.08,
    color: 0.06,
  }),
});
