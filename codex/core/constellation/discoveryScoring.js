/**
 * CONSTELLATION — pure discovery pre-scoring (modifierFit, rarityBoost, pre-score)
 *
 * Provenance floors:
 * - modifierFit > 0 requires evidence paths; empty gloss overlap → score 0, paths []
 * - rarityBoost = 0 when baseEvidence is false
 *
 * Spec: docs/superpowers/specs/2026-08-07-constellationos-poetic-discovery-design.md §4.7
 */

import { PRE_SCORE } from './discoveryWeights.js';

/**
 * @typedef {{ score: number, paths: string[] }} ModifierFitResult
 * @typedef {{ signal: string, score: number, paths: string[] }} HitEvidence
 */

/**
 * Clamp to unit interval [0, 1].
 * @param {number} n
 * @returns {number}
 */
function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  if (n <= 0) return 0;
  if (n >= 1) return 1;
  return n;
}

/**
 * Overlap of candidate gloss tokens with the modifier attractor set.
 *
 * score = |intersection| / max(1, attractorSet.size) clamped 0–1
 * paths = `candidate-gloss:{token}` for each intersection token (sorted)
 * Empty intersection → score 0, paths []
 *
 * @param {string} candidate
 * @param {Set<string>|Iterable<string>|null|undefined} attractorSet
 * @param {string[]|null|undefined} glossTokens
 * @returns {ModifierFitResult}
 */
export function computeModifierFit(candidate, attractorSet, glossTokens) {
  void candidate; // reserved for future candidate-token attractor checks / path labels

  const attractors =
    attractorSet instanceof Set
      ? attractorSet
      : new Set(attractorSet ? [...attractorSet] : []);

  if (!Array.isArray(glossTokens) || glossTokens.length === 0 || attractors.size === 0) {
    return { score: 0, paths: [] };
  }

  const intersection = new Set();
  for (const raw of glossTokens) {
    if (raw == null) continue;
    const token = String(raw).toLowerCase();
    if (!token) continue;
    if (attractors.has(token)) intersection.add(token);
  }

  if (intersection.size === 0) {
    return { score: 0, paths: [] };
  }

  const denom = Math.max(1, attractors.size);
  const score = clamp01(intersection.size / denom);
  const paths = [...intersection]
    .sort((a, b) => a.localeCompare(b))
    .map((token) => `candidate-gloss:${token}`);

  // Provenance floor: never return positive score without paths
  if (paths.length === 0) {
    return { score: 0, paths: [] };
  }

  return { score, paths };
}

/**
 * Rarity lift from corpus band. Zero when generator base evidence is missing.
 *
 * band 1–9 → (band/9)*0.4 (capped 0–0.4). null/invalid band → 0.
 *
 * @param {boolean} baseEvidence
 * @param {number|null|undefined} rarityBandOrNull
 * @returns {number}
 */
export function computeRarityBoost(baseEvidence, rarityBandOrNull) {
  if (!baseEvidence) return 0;
  if (rarityBandOrNull == null || !Number.isFinite(Number(rarityBandOrNull))) return 0;

  const band = Math.min(9, Math.max(0, Number(rarityBandOrNull)));
  return clamp01((band / 9) * 0.4);
}

/**
 * Apply frozen pre-score blend before PLS rankCandidates.
 *
 * synonymScore' = clamp01(syn * (K0 + K1*mod + K2*rar))
 *
 * @param {number} synonymScore
 * @param {number} modifierFit
 * @param {number} rarityBoost
 * @returns {number}
 */
export function applyDiscoveryPreScore(synonymScore, modifierFit, rarityBoost) {
  const syn = Number(synonymScore) || 0;
  const mod = Number(modifierFit) || 0;
  const rar = Number(rarityBoost) || 0;
  const factor = PRE_SCORE.K0 + PRE_SCORE.K1 * mod + PRE_SCORE.K2 * rar;
  return clamp01(syn * factor);
}

/**
 * Build hit evidence entries only when provenance exists.
 *
 * @param {ModifierFitResult|null|undefined} modifierFitResult
 * @param {number} rarityBoost
 * @returns {HitEvidence[]}
 */
export function buildHitEvidence(modifierFitResult, rarityBoost) {
  /** @type {HitEvidence[]} */
  const evidence = [];

  if (
    modifierFitResult &&
    Number(modifierFitResult.score) > 0 &&
    Array.isArray(modifierFitResult.paths) &&
    modifierFitResult.paths.length > 0
  ) {
    evidence.push({
      signal: 'modifierFit',
      score: clamp01(Number(modifierFitResult.score)),
      paths: [...modifierFitResult.paths],
    });
  }

  const rar = Number(rarityBoost) || 0;
  if (rar > 0) {
    evidence.push({
      signal: 'rarityBoost',
      score: clamp01(rar),
      paths: [],
    });
  }

  return evidence;
}
