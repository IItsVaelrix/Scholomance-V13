/**
 * Per-enemy personality weight vectors over the council of mini-brains.
 * Product formula ported from steamdeck_brain personality_weighting.py:
 *   weight = base × INT-tier boost × role boost × per-enemy override.
 */

export const BASE_WEIGHTS = Object.freeze({
  AGGRO_BRAIN: 1,
  SURVIVAL_BRAIN: 1,
  POSITION_BRAIN: 1,
  RESOURCE_BRAIN: 1,
  COORDINATION_BRAIN: 1,
  ARBITRATION_BRAIN: 1,
});

export const INT_TIER_WEIGHTS = Object.freeze({
  brute: { AGGRO_BRAIN: 1, SURVIVAL_BRAIN: 0, POSITION_BRAIN: 0, RESOURCE_BRAIN: 0, COORDINATION_BRAIN: 0, ARBITRATION_BRAIN: 0 },
  trained: { AGGRO_BRAIN: 1, SURVIVAL_BRAIN: 0.4, POSITION_BRAIN: 0.2, RESOURCE_BRAIN: 0.1, COORDINATION_BRAIN: 0.3, ARBITRATION_BRAIN: 0.4 },
  tactical: { AGGRO_BRAIN: 1, SURVIVAL_BRAIN: 0.8, POSITION_BRAIN: 0.7, RESOURCE_BRAIN: 0.3, COORDINATION_BRAIN: 0.7, ARBITRATION_BRAIN: 0.8 },
  mastermind: { AGGRO_BRAIN: 1, SURVIVAL_BRAIN: 1.2, POSITION_BRAIN: 1, RESOURCE_BRAIN: 0.5, COORDINATION_BRAIN: 0.9, ARBITRATION_BRAIN: 1.2 },
});

export const ROLE_WEIGHTS = Object.freeze({
  bruiser: { AGGRO_BRAIN: 1.2 },
  skirmisher: { POSITION_BRAIN: 1.3, SURVIVAL_BRAIN: 1.2 },
  caster: { POSITION_BRAIN: 1.3, RESOURCE_BRAIN: 1.2 },
});

/**
 * @param {{ role?: string, intTier?: string, overrides?: Record<string, number> }} params
 * @returns {Record<string, number>}
 */
export function computeEnemyPersonality({ role = 'bruiser', intTier = 'trained', overrides = {} } = {}) {
  const tier = INT_TIER_WEIGHTS[intTier] || INT_TIER_WEIGHTS.trained;
  const roleBoost = ROLE_WEIGHTS[role] || {};
  const weights = {};
  for (const id of Object.keys(BASE_WEIGHTS)) {
    let w = BASE_WEIGHTS[id];
    w *= tier[id] ?? 1;
    w *= roleBoost[id] ?? 1;
    w *= overrides[id] ?? 1;
    weights[id] = Math.round(w * 1000) / 1000;
  }
  return weights;
}