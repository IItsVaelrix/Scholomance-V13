/**
 * enchantResolver.js — pure, deterministic (RNG injected).
 *
 * Decides whether an incantation ignites the swing with an element, and with what
 * probability. Success scales with the spell's linguistic quality (cohesionScore);
 * a syntactic collapse (failureCast) always fizzles.
 */
import { matchElement } from '../../data/combatElementDatabase.js';

export const ENCHANT_FLOOR = 0.10;
export const ENCHANT_CEIL = 0.98;
// Linguistic quality is read from the spell's `totalScore`. Empirically a junk cast
// scores ~25 and a rich, well-formed incantation ~55+, so we normalize that band to
// [0,1]. (cohesionScore is always 0 in the live scoring config, so it is NOT used.)
export const QUALITY_LO = 25;
export const QUALITY_HI = 55;

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Normalize a spell's totalScore into a [0,1] linguistic-quality signal. */
export function qualityFromScore(scoreData) {
  const total = Number(scoreData?.totalScore);
  if (!Number.isFinite(total)) return 0;
  return clamp01((total - QUALITY_LO) / (QUALITY_HI - QUALITY_LO));
}

/** @param {object} scoreData @param {() => number} rng */
export function computeEnchantSuccess(scoreData, rng) {
  const probability = scoreData?.failureCast
    ? 0
    : ENCHANT_FLOOR + (ENCHANT_CEIL - ENCHANT_FLOOR) * qualityFromScore(scoreData);
  return { success: rng() < probability, probability };
}

/**
 * @param {{text?: string, weave?: string}} incantation
 * @param {object} scoreData
 * @param {() => number} rng
 */
export function resolveEnchant(incantation, scoreData, rng) {
  const combined = `${incantation?.text || incantation?.verse || ''} ${incantation?.weave || ''}`;
  const element = matchElement(combined);
  if (!element) return { element: null };
  const { success, probability } = computeEnchantSuccess(scoreData, rng);
  return { element, success, probability };
}
