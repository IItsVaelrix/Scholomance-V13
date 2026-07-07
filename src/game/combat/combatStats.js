/**
 * combatStats.js — tactical slice of the MMORPG stat tree (Slice 1).
 *
 * Scholomance attribute stats (KSYN, BAPO, SONIC, VALCH, PSYCH, CINF, MYTH,
 * CODEX, DISCOVERY) live in scholomanceStats.js / codex/core/scholomance-stats.schema.js.
 *
 * Data-only, framework-free. Tactical entries grow via COMBAT_STATS;
 * consumers iterate the registry rather than hard-coding stat names.
 */

export const COMBAT_STATS = [
  {
    key: 'movementPoints',
    label: 'Movement Points',
    category: 'mobility',
    base: 3,
    min: 0,
    max: 12,
    description: 'Points spent to move; one point per tile stepped, refilled each turn.',
  },
  {
    key: 'attackPoints',
    label: 'Attack Points',
    category: 'offense',
    base: 6,
    min: 0,
    max: 999,
    description: 'Per-turn action pool spent by attacks; a basic attack costs 3 AP. Refilled each turn.',
  },
  {
    key: 'attackRange',
    label: 'Attack Range',
    category: 'offense',
    base: 2,
    min: 0,
    max: 12,
    description: 'Maximum Manhattan tile distance a basic attack can reach.',
  },
  {
    key: 'manaPoints',
    label: 'Mana',
    category: 'arcane',
    base: 100,
    min: 0,
    max: 999,
    description: 'Arcane reservoir (siphon rewards, future systems). Invoke spellweave spends 3 AP instead.',
  },
  {
    key: 'intelligence',
    label: 'INT',
    category: 'cognition',
    base: 10,
    min: 0,
    max: 100,
    description: 'Monster tactical reasoning — higher INT yields smarter ability picks, counters, alert rolls, and repositioning.',
  },
];

/** AP a basic attack costs from the Attack Points pool. Pool 6 ÷ cost 3 = 2 attacks/turn. */
export const BASIC_ATTACK_AP_COST = 3;

/** Fraction of incoming damage a guarding entity takes. */
export const GUARD_DAMAGE_MULTIPLIER = 0.5;

/**
 * Build a fresh stat block seeded from the registry bases, then apply overrides.
 * `movementPointsRemaining` follows `movementPoints` and `attackPointsRemaining`
 * follows `attackPoints` unless explicitly overridden.
 * @param {Partial<{movementPoints:number, movementPointsRemaining:number, attackPoints:number, attackPointsRemaining:number, attackRange:number, manaPoints:number, manaPointsRemaining:number, intelligence:number}>} overrides
 */
export function buildDefaultStatBlock(overrides = {}) {
  const base = Object.fromEntries(COMBAT_STATS.map((s) => [s.key, s.base]));
  const movementPoints = overrides.movementPoints ?? base.movementPoints;
  const attackPoints = overrides.attackPoints ?? base.attackPoints;
  const manaPoints = overrides.manaPoints ?? base.manaPoints;
  const intelligence = overrides.intelligence ?? base.intelligence;
  return {
    movementPoints,
    movementPointsRemaining: overrides.movementPointsRemaining ?? movementPoints,
    attackPoints,
    attackPointsRemaining: overrides.attackPointsRemaining ?? attackPoints,
    attackRange: overrides.attackRange ?? base.attackRange,
    manaPoints,
    manaPointsRemaining: overrides.manaPointsRemaining ?? manaPoints,
    intelligence,
  };
}
