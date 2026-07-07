/**
 * tactical-board.modifiers.js
 *
 * Tile modifier resolution for the Tactical Lattice Battle Board.
 * Implements PDR §9 (Tactical Tile Modifiers) and §12 (Spellweave Integration).
 *
 * Pure, deterministic, no DOM/GSAP/audio. JSDoc schemas, immutable returns.
 * Same input → same output. Never mutates inputs.
 */

// ---------------------------------------------------------------------------
// Type Definitions (JSDoc)
// ---------------------------------------------------------------------------

/**
 * Modifier kinds from PDR §9.1.
 * @typedef {'school_boost'|'damage_boost'|'range_boost'|'mana_discount'
 *          |'spell_roll_bonus'|'status_amplifier'|'chain_multiplier'
 *          |'accuracy_boost'|'line_of_sight_bonus'|'zone_denial'
 *          |'ritual_anchor'|'nullification'} ModifierKind
 */

/**
 * Schools from PDR §9.1.
 * @typedef {'FIRE'|'VOID'|'SONIC'|'HOLY'|'ICE'|'PSYCHIC'|'MYTH'} TileSchool
 */

/**
 * Where the modifier applies from PDR §9.1.
 * @typedef {'caster_tile'|'target_tile'|'path_tiles'|'adjacent_tiles'|'area'} ModifierAppliesTo
 */

/**
 * Duration types from PDR §9.1.
 * @typedef {'static'|'one_use'|'turn_decay'} ModifierDuration
 */

/**
 * Core modifier contract per PDR §9.1.
 * @typedef {Object} BattleTileModifier
 * @property {string} id - Unique modifier identifier.
 * @property {ModifierKind} kind - What the modifier does.
 * @property {TileSchool} [school] - Optional school affinity.
 * @property {number} value - Numeric magnitude (percentage or flat bonus).
 * @property {ModifierAppliesTo} appliesTo - Where the modifier takes effect.
 * @property {ModifierDuration} [duration] - Lifecycle type. Defaults to 'static'.
 * @property {boolean} [consumed] - Whether a one_use modifier has been spent.
 * @property {number} [turnsRemaining] - Remaining turns for turn_decay modifiers.
 */

/**
 * Action types that interact with tile modifiers.
 * @typedef {'cast'|'attack'|'move'|'channel'|'interact'} ActionType
 */

// ---------------------------------------------------------------------------
// School Tile Bonus Table — PDR §9.2
// ---------------------------------------------------------------------------

/**
 * School-to-tile matching bonuses from PDR §9.2 and §24.1.
 * Keys are tile school, values map caster school → bonus multiplier.
 * A bonus of 0.15 means +15%.
 *
 * @type {Record<string, Record<string, number>>}
 */
const SCHOOL_TILE_BONUS_TABLE = Object.freeze({
  FIRE:    { FIRE: 0.15, VOID: 0.05, SONIC: 0.0, HOLY: -0.05, ICE: -0.10, PSYCHIC: 0.0, MYTH: 0.05 },
  VOID:    { VOID: 0.20, FIRE: 0.05, SONIC: 0.0, HOLY: -0.10, ICE: 0.0,   PSYCHIC: 0.10, MYTH: 0.05 },
  SONIC:   { SONIC: 0.15, FIRE: 0.0, VOID: 0.0,  HOLY: 0.0,   ICE: 0.0,   PSYCHIC: 0.05, MYTH: 0.0 },
  HOLY:    { HOLY: 0.15, FIRE: -0.05, VOID: -0.10, SONIC: 0.0, ICE: 0.05,  PSYCHIC: 0.0,  MYTH: 0.05 },
  ICE:     { ICE: 0.15, FIRE: -0.10, VOID: 0.0,  SONIC: 0.0,  HOLY: 0.05, PSYCHIC: 0.0,  MYTH: 0.0 },
  PSYCHIC: { PSYCHIC: 0.15, FIRE: 0.0, VOID: 0.10, SONIC: 0.05, HOLY: 0.0, ICE: 0.0, MYTH: 0.05 },
  MYTH:    { MYTH: 0.15, FIRE: 0.05, VOID: 0.05, SONIC: 0.0,  HOLY: 0.05, ICE: 0.0, PSYCHIC: 0.05 },
});

/**
 * Modifier kind → which action types it applies to.
 * @type {Record<ModifierKind, ActionType[]>}
 */
const MODIFIER_ACTION_APPLICABILITY = Object.freeze({
  school_boost:       ['cast', 'attack', 'channel'],
  damage_boost:       ['cast', 'attack'],
  range_boost:        ['cast', 'attack'],
  mana_discount:      ['cast', 'channel'],
  spell_roll_bonus:   ['cast'],
  status_amplifier:   ['cast', 'attack'],
  chain_multiplier:   ['cast'],
  accuracy_boost:     ['cast', 'attack'],
  line_of_sight_bonus:['cast', 'attack'],
  zone_denial:        ['move', 'cast', 'attack'],
  ritual_anchor:      ['cast', 'channel'],
  nullification:      ['cast', 'attack', 'channel'],
});

// ---------------------------------------------------------------------------
// Core Resolution Functions
// ---------------------------------------------------------------------------

/**
 * Resolves which modifier applies for a given action on a tile.
 * Returns the modifier if it matches the action type and is still active,
 * or null if no applicable modifier exists.
 *
 * @param {{ modifier?: BattleTileModifier, terrain?: string }} tile - The battle tile.
 * @param {TileSchool|string|null} school - Caster/actor school.
 * @param {ActionType} actionType - The action being performed.
 * @returns {BattleTileModifier|null} The applicable modifier, or null.
 */
export function resolveTileModifier(tile, school, actionType) {
  if (!tile || !tile.modifier) return null;

  const modifier = tile.modifier;

  // Consumed one_use modifiers are dead
  if (modifier.consumed) return null;

  // Expired turn_decay modifiers are dead
  if (modifier.duration === 'turn_decay' && typeof modifier.turnsRemaining === 'number' && modifier.turnsRemaining <= 0) {
    return null;
  }

  // Check if modifier kind applies to this action type
  const applicableActions = MODIFIER_ACTION_APPLICABILITY[modifier.kind];
  if (!applicableActions || !applicableActions.includes(actionType)) {
    return null;
  }

  return modifier;
}

/**
 * Computes the multiplier a modifier applies to combat scoring.
 * Returns a float multiplier (e.g. 1.15 for +15%).
 *
 * School matching: if the modifier has a school and it matches the caster school,
 * the full value is applied. If the modifier has a school and it does NOT match,
 * the value is halved. If the modifier has no school, the full value is applied.
 *
 * @param {BattleTileModifier} modifier - The modifier to compute.
 * @param {TileSchool|string|null} school - The caster/actor school.
 * @returns {number} Multiplier to apply (1.0 = no change).
 */
export function computeTileMultiplier(modifier, school) {
  if (!modifier || typeof modifier.value !== 'number') return 1.0;

  if (modifier.kind === 'nullification') {
    return Math.max(0.5, 1.0 + modifier.value);
  }

  if (modifier.kind === 'zone_denial') {
    return 1.0;
  }

  let effectiveValue = modifier.value;

  if (modifier.school && school) {
    const normalizedModSchool = modifier.school.toUpperCase();
    const normalizedCasterSchool = school.toUpperCase();
    if (normalizedModSchool !== normalizedCasterSchool) {
      effectiveValue *= 0.5;
    }
  }

  return 1.0 + effectiveValue;
}

/**
 * Applies multiple modifiers in chain to a base score.
 * Multipliers are applied multiplicatively in order.
 * Returns the modified score.
 *
 * @param {BattleTileModifier[]} modifiers - Ordered list of modifiers.
 * @param {number} baseScore - The base combat score to modify.
 * @param {TileSchool|string|null} school - The caster/actor school.
 * @returns {{ finalScore: number, appliedMultipliers: Array<{ id: string, multiplier: number }> }}
 */
export function applyModifierChain(modifiers, baseScore, school) {
  if (!Array.isArray(modifiers) || modifiers.length === 0) {
    return { finalScore: baseScore, appliedMultipliers: [] };
  }

  const appliedMultipliers = [];
  let score = baseScore;

  for (const mod of modifiers) {
    if (!mod || mod.consumed) continue;

    const multiplier = computeTileMultiplier(mod, school);
    score = score * multiplier;
    appliedMultipliers.push({ id: mod.id, multiplier });
  }

  return {
    finalScore: Math.round(score),
    appliedMultipliers,
  };
}

/**
 * Returns the school tile bonus if caster school matches the tile school.
 * Per PDR §9.2 table — returns a fractional bonus (e.g. 0.15 for +15%).
 *
 * @param {TileSchool|string|null} tileSchool - The tile's school affinity.
 * @param {TileSchool|string|null} casterSchool - The caster's school.
 * @returns {number} Bonus multiplier fraction (0.0 = no bonus, 0.15 = +15%, -0.10 = penalty).
 */
export function getSchoolTileBonus(tileSchool, casterSchool) {
  if (!tileSchool || !casterSchool) return 0.0;

  const normalizedTile = tileSchool.toUpperCase();
  const normalizedCaster = casterSchool.toUpperCase();

  const tileRow = SCHOOL_TILE_BONUS_TABLE[normalizedTile];
  if (!tileRow) return 0.0;

  const bonus = tileRow[normalizedCaster];
  return typeof bonus === 'number' ? bonus : 0.0;
}

// ---------------------------------------------------------------------------
// Duration Lifecycle Functions (immutable)
// ---------------------------------------------------------------------------

/**
 * Checks if a modifier is still active based on duration type and turn count.
 *
 * @param {BattleTileModifier} modifier - The modifier to check.
 * @param {number} [turnCount] - Current turn count (used for turn_decay context).
 * @returns {boolean} True if the modifier is still active.
 */
export function isModifierActive(modifier, turnCount) {
  if (!modifier) return false;

  // Consumed one_use modifiers are dead
  if (modifier.consumed) return false;

  switch (modifier.duration) {
    case 'static':
      return true;

    case 'one_use':
      return !modifier.consumed;

    case 'turn_decay':
      if (typeof modifier.turnsRemaining !== 'number') return true;
      return modifier.turnsRemaining > 0;

    default:
      // No duration specified defaults to static
      return true;
  }
}

/**
 * Returns a new modifier marked as consumed. Does not mutate the input.
 * Only meaningful for 'one_use' duration modifiers.
 *
 * @param {BattleTileModifier} modifier - The modifier to consume.
 * @returns {BattleTileModifier} New modifier with consumed=true.
 */
export function consumeOneUseModifier(modifier) {
  if (!modifier) return modifier;

  return {
    ...modifier,
    consumed: true,
  };
}

/**
 * Returns a new modifier with reduced turn count. Does not mutate the input.
 * Only meaningful for 'turn_decay' duration modifiers.
 * If turnsRemaining reaches 0, the modifier becomes inactive.
 *
 * @param {BattleTileModifier} modifier - The modifier to decay.
 * @returns {BattleTileModifier} New modifier with decremented turnsRemaining.
 */
export function decayTurnModifier(modifier) {
  if (!modifier) return modifier;
  if (modifier.duration !== 'turn_decay') return { ...modifier };

  const currentTurns = typeof modifier.turnsRemaining === 'number' ? modifier.turnsRemaining : 0;

  return {
    ...modifier,
    turnsRemaining: Math.max(0, currentTurns - 1),
  };
}

// ---------------------------------------------------------------------------
// Null Tile Special — PDR §9.2, §24.1
// ---------------------------------------------------------------------------

/**
 * Null tile special effect: reduces all modifier values by 20%.
 * Per PDR §24.1: "Null Tile: -20 percent spell modifier effectiveness".
 * This computes the effective modifiers when a Null tile is present.
 *
 * Returns new array of modifiers with reduced values. Does not mutate inputs.
 *
 * @param {BattleTileModifier[]} modifiers - The modifiers to reduce.
 * @returns {BattleTileModifier[]} New array with values reduced by 20%.
 */
export function computeNullTileEffect(modifiers) {
  if (!Array.isArray(modifiers) || modifiers.length === 0) return [];

  const NULL_REDUCTION = 0.80; // 20% reduction → 80% of original

  return modifiers.map(mod => {
    if (!mod) return mod;

    // Nullification modifiers are immune to null tile reduction
    // (you can't nullify nullification)
    if (mod.kind === 'nullification') return { ...mod };

    return {
      ...mod,
      value: Math.round(mod.value * NULL_REDUCTION * 100) / 100,
    };
  });
}

// ---------------------------------------------------------------------------
// Modifier Factory Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a well-formed BattleTileModifier with defaults.
 *
 * @param {Partial<BattleTileModifier> & { id: string, kind: ModifierKind, value: number, appliesTo: ModifierAppliesTo }} config
 * @returns {BattleTileModifier}
 */
export function createModifier(config) {
  return {
    id: config.id,
    kind: config.kind,
    school: config.school || undefined,
    value: config.value,
    appliesTo: config.appliesTo,
    duration: config.duration || 'static',
    consumed: config.consumed || false,
    turnsRemaining: config.turnsRemaining,
  };
}

/**
 * Preset modifier definitions for each tile type per PDR §9.2.
 * Immutable reference table.
 *
 * @type {Record<string, BattleTileModifier>}
 */
export const TILE_MODIFIER_PRESETS = Object.freeze({
  fire_tile: Object.freeze({
    id: 'fire-tile-boost',
    kind: 'school_boost',
    school: 'FIRE',
    value: 0.15,
    appliesTo: 'caster_tile',
    duration: 'static',
  }),
  void_tile: Object.freeze({
    id: 'void-tile-boost',
    kind: 'school_boost',
    school: 'VOID',
    value: 0.20,
    appliesTo: 'caster_tile',
    duration: 'static',
  }),
  sonic_tile: Object.freeze({
    id: 'sonic-tile-boost',
    kind: 'chain_multiplier',
    school: 'SONIC',
    value: 0.15,
    appliesTo: 'caster_tile',
    duration: 'static',
  }),
  ice_tile: Object.freeze({
    id: 'ice-tile-boost',
    kind: 'status_amplifier',
    school: 'ICE',
    value: 0.15,
    appliesTo: 'caster_tile',
    duration: 'static',
  }),
  holy_tile: Object.freeze({
    id: 'holy-tile-boost',
    kind: 'school_boost',
    school: 'HOLY',
    value: 0.15,
    appliesTo: 'caster_tile',
    duration: 'static',
  }),
  null_tile: Object.freeze({
    id: 'null-tile-deny',
    kind: 'nullification',
    value: -0.20,
    appliesTo: 'area',
    duration: 'static',
  }),
  rune_tile: Object.freeze({
    id: 'rune-tile-bonus',
    kind: 'spell_roll_bonus',
    value: 0.08,
    appliesTo: 'caster_tile',
    duration: 'static',
  }),
  anchor_tile: Object.freeze({
    id: 'anchor-tile-ritual',
    kind: 'ritual_anchor',
    value: 0.12,
    appliesTo: 'caster_tile',
    duration: 'static',
  }),
  high_ground: Object.freeze({
    id: 'high-ground-boost',
    kind: 'accuracy_boost',
    value: 0.10,
    appliesTo: 'caster_tile',
    duration: 'static',
  }),
  hazard_tile: Object.freeze({
    id: 'hazard-zone',
    kind: 'zone_denial',
    value: 0.15,
    appliesTo: 'area',
    duration: 'static',
  }),
});

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

export {
  SCHOOL_TILE_BONUS_TABLE,
  MODIFIER_ACTION_APPLICABILITY,
};

export default {
  resolveTileModifier,
  computeTileMultiplier,
  applyModifierChain,
  getSchoolTileBonus,
  isModifierActive,
  consumeOneUseModifier,
  decayTurnModifier,
  computeNullTileEffect,
  createModifier,
  TILE_MODIFIER_PRESETS,
  SCHOOL_TILE_BONUS_TABLE,
  MODIFIER_ACTION_APPLICABILITY,
};
