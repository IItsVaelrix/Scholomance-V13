/**
 * tactical-board.tiles.js
 *
 * Tile type definitions, modifier definitions, and tile factory for the
 * Tactical Lattice Battle Board. Implements PDR §8 (BattleTile contract),
 * §9 (tile modifiers), and §10 (Scrabble distribution layer).
 *
 * Pure logic — no DOM, no side effects, no randomness.
 * All functions return new values; inputs are never mutated.
 *
 * @module tactical-board.tiles
 */

// ---------------------------------------------------------------------------
// JSDoc Type Definitions (PDR §8–9)
// ---------------------------------------------------------------------------

/**
 * Terrain type identifier for battle tiles.
 * Extends the existing TerrainType from tactical.engine.js with PDR types.
 * @typedef {'normal'|'high_ground'|'low_ground'|'blocked'|'hazard'|'void'
 *   |'fire'|'ice'|'sonic'|'holy'|'null'|'rune'|'anchor'} BattleTerrainType
 */

/**
 * Modifier kind per PDR §9.1.
 * @typedef {'school_boost'|'damage_boost'|'range_boost'|'mana_discount'
 *   |'spell_roll_bonus'|'status_amplifier'|'chain_multiplier'|'accuracy_boost'
 *   |'line_of_sight_bonus'|'zone_denial'|'ritual_anchor'|'nullification'} ModifierKind
 */

/**
 * School identifier per PDR §9.1.
 * @typedef {'FIRE'|'VOID'|'SONIC'|'HOLY'|'ICE'|'PSYCHIC'|'MYTH'} BattleSchool
 */

/**
 * Where a modifier applies per PDR §9.1.
 * @typedef {'caster_tile'|'target_tile'|'path_tiles'|'adjacent_tiles'|'area'} ModifierAppliesTo
 */

/**
 * Duration mode for a tile modifier.
 * @typedef {'static'|'one_use'|'turn_decay'} ModifierDuration
 */

/**
 * A tile modifier per PDR §9.1.
 * @typedef {Object} BattleTileModifier
 * @property {string} id
 * @property {ModifierKind} kind
 * @property {BattleSchool|null} school
 * @property {number} value - Percentage or flat bonus
 * @property {ModifierAppliesTo} appliesTo
 * @property {ModifierDuration} duration
 * @property {string} label - Human-readable name
 * @property {string} description - Tooltip text
 */

/**
 * Terrain type definition — static properties for each terrain.
 * @typedef {Object} TerrainDefinition
 * @property {boolean} walkable
 * @property {boolean} blocksLineOfSight
 * @property {number} movementCost
 * @property {string} glyph - Unicode display glyph
 * @property {string} colorHint - CSS color hint for rendering
 * @property {number} interactionPriority - Higher = inspected/resolved first
 * @property {string|null} defaultModifier - ID into BATTLE_TILE_MODIFIERS, or null
 */

/**
 * A single battle tile per PDR §8.
 * @typedef {Object} BattleTile
 * @property {number} x
 * @property {number} y
 * @property {number} z - Elevation
 * @property {BattleTerrainType} terrain
 * @property {boolean} walkable
 * @property {boolean} blocksLineOfSight
 * @property {BattleTileModifier|null} modifier
 * @property {{ occupiedBy: string|null, threatenedBy: string[], controlledBy: 'player'|'enemy'|'neutral'|null }} control
 * @property {{ glyph: string|null, colorHint: string|null, pulseIntensity: number }} visual
 * @property {number} interactionPriority
 * @property {number} movementCost
 */

// ---------------------------------------------------------------------------
// Terrain Type Registry (PDR §8)
// ---------------------------------------------------------------------------

/** @type {Record<BattleTerrainType, TerrainDefinition>} */
export const BATTLE_TERRAIN_TYPES = Object.freeze({
  normal: {
    walkable: true,
    blocksLineOfSight: false,
    movementCost: 1,
    glyph: '·',
    colorHint: '#8a8a8a',
    interactionPriority: 0,
    defaultModifier: null,
  },
  high_ground: {
    walkable: true,
    blocksLineOfSight: false,
    movementCost: 2,
    glyph: '▲',
    colorHint: '#c9b458',
    interactionPriority: 3,
    defaultModifier: 'high_ground_advantage',
  },
  low_ground: {
    walkable: true,
    blocksLineOfSight: false,
    movementCost: 1,
    glyph: '▽',
    colorHint: '#5a7a8a',
    interactionPriority: 2,
    defaultModifier: 'low_ground_penalty',
  },
  blocked: {
    walkable: false,
    blocksLineOfSight: true,
    movementCost: Infinity,
    glyph: '█',
    colorHint: '#2a2a2a',
    interactionPriority: 0,
    defaultModifier: null,
  },
  hazard: {
    walkable: true,
    blocksLineOfSight: false,
    movementCost: 2,
    glyph: '☠',
    colorHint: '#b83e3e',
    interactionPriority: 5,
    defaultModifier: 'hazard_damage',
  },
  void: {
    walkable: true,
    blocksLineOfSight: false,
    movementCost: 2,
    glyph: '◎',
    colorHint: '#6b1d8e',
    interactionPriority: 6,
    defaultModifier: 'void_school_boost',
  },
  fire: {
    walkable: true,
    blocksLineOfSight: false,
    movementCost: 1,
    glyph: '🜂',
    colorHint: '#e85d2a',
    interactionPriority: 5,
    defaultModifier: 'fire_school_boost',
  },
  ice: {
    walkable: true,
    blocksLineOfSight: false,
    movementCost: 1,
    glyph: '❄',
    colorHint: '#6ec6f5',
    interactionPriority: 5,
    defaultModifier: 'ice_school_boost',
  },
  sonic: {
    walkable: true,
    blocksLineOfSight: false,
    movementCost: 1,
    glyph: '≋',
    colorHint: '#44e8c0',
    interactionPriority: 5,
    defaultModifier: 'sonic_school_boost',
  },
  holy: {
    walkable: true,
    blocksLineOfSight: false,
    movementCost: 1,
    glyph: '✦',
    colorHint: '#f5e642',
    interactionPriority: 5,
    defaultModifier: 'holy_school_boost',
  },
  null: {
    walkable: true,
    blocksLineOfSight: false,
    movementCost: 1,
    glyph: '∅',
    colorHint: '#4a4a6a',
    interactionPriority: 7,
    defaultModifier: 'null_denial',
  },
  rune: {
    walkable: true,
    blocksLineOfSight: false,
    movementCost: 1,
    glyph: 'ᚱ',
    colorHint: '#a855f4',
    interactionPriority: 8,
    defaultModifier: 'rune_spell_bonus',
  },
  anchor: {
    walkable: true,
    blocksLineOfSight: false,
    movementCost: 1,
    glyph: '⚓',
    colorHint: '#d4af37',
    interactionPriority: 9,
    defaultModifier: 'ritual_anchor_boost',
  },
});

// ---------------------------------------------------------------------------
// Tile Modifier Registry (PDR §9.1–9.2)
// ---------------------------------------------------------------------------

/** @type {Record<string, BattleTileModifier>} */
export const BATTLE_TILE_MODIFIERS = Object.freeze({
  // --- School boosts (PDR §9.2 table) ---
  fire_school_boost: {
    id: 'fire_school_boost',
    kind: 'school_boost',
    school: 'FIRE',
    value: 0.15,
    appliesTo: 'caster_tile',
    duration: 'static',
    label: 'Fire Tile',
    description: 'Fire spells +15%.',
  },
  void_school_boost: {
    id: 'void_school_boost',
    kind: 'school_boost',
    school: 'VOID',
    value: 0.20,
    appliesTo: 'caster_tile',
    duration: 'static',
    label: 'Void Tile',
    description: 'Siphon & corruption +20%, healing −10%.',
  },
  sonic_school_boost: {
    id: 'sonic_school_boost',
    kind: 'school_boost',
    school: 'SONIC',
    value: 0.15,
    appliesTo: 'caster_tile',
    duration: 'static',
    label: 'Sonic Tile',
    description: 'SONIC spells +15%, chain effects +1.',
  },
  ice_school_boost: {
    id: 'ice_school_boost',
    kind: 'school_boost',
    school: 'ICE',
    value: 0.15,
    appliesTo: 'caster_tile',
    duration: 'static',
    label: 'Ice Tile',
    description: 'Slow/freeze effects +15%.',
  },
  holy_school_boost: {
    id: 'holy_school_boost',
    kind: 'school_boost',
    school: 'HOLY',
    value: 0.15,
    appliesTo: 'caster_tile',
    duration: 'static',
    label: 'Holy Tile',
    description: 'Healing & shielding +15%.',
  },

  // --- Premium / positional modifiers ---
  high_ground_advantage: {
    id: 'high_ground_advantage',
    kind: 'accuracy_boost',
    school: null,
    value: 0.10,
    appliesTo: 'caster_tile',
    duration: 'static',
    label: 'High Ground',
    description: 'Range +1, accuracy +10%.',
  },
  low_ground_penalty: {
    id: 'low_ground_penalty',
    kind: 'accuracy_boost',
    school: null,
    value: -0.05,
    appliesTo: 'caster_tile',
    duration: 'static',
    label: 'Low Ground',
    description: 'Accuracy penalty when attacking upward.',
  },
  hazard_damage: {
    id: 'hazard_damage',
    kind: 'zone_denial',
    school: null,
    value: -0.10,
    appliesTo: 'caster_tile',
    duration: 'static',
    label: 'Hazard',
    description: 'Damage or debuff at turn start.',
  },
  null_denial: {
    id: 'null_denial',
    kind: 'nullification',
    school: null,
    value: -0.20,
    appliesTo: 'area',
    duration: 'static',
    label: 'Null Tile',
    description: 'Spell modifiers reduced by 20%.',
  },
  rune_spell_bonus: {
    id: 'rune_spell_bonus',
    kind: 'spell_roll_bonus',
    school: null,
    value: 0.08,
    appliesTo: 'caster_tile',
    duration: 'static',
    label: 'Rune Tile',
    description: '+1 spell die or +8% bridge stability.',
  },
  ritual_anchor_boost: {
    id: 'ritual_anchor_boost',
    kind: 'ritual_anchor',
    school: null,
    value: 0.12,
    appliesTo: 'caster_tile',
    duration: 'static',
    label: 'Ritual Anchor',
    description: 'Sustained spells last longer, +12% ritual stability.',
  },
});

// ---------------------------------------------------------------------------
// Tile Distribution Rule (PDR §10)
// ---------------------------------------------------------------------------

/**
 * Recommended tile distribution.
 * @type {{ normal: number, school: number, premium: number }}
 */
export const TILE_DISTRIBUTION = Object.freeze({
  normal: 0.70,
  school: 0.20,
  premium: 0.10,
});

/**
 * School terrain types (the 20% band).
 * @type {ReadonlyArray<BattleTerrainType>}
 */
export const SCHOOL_TERRAIN_TYPES = Object.freeze([
  'fire', 'void', 'ice', 'sonic', 'holy',
]);

/**
 * Premium terrain types (the 10% band).
 * @type {ReadonlyArray<BattleTerrainType>}
 */
export const PREMIUM_TERRAIN_TYPES = Object.freeze([
  'rune', 'anchor', 'null',
]);

// ---------------------------------------------------------------------------
// Factory Functions
// ---------------------------------------------------------------------------

/**
 * Creates a new BattleTile.
 * Pure factory — returns a fresh object every call.
 *
 * @param {number} x
 * @param {number} y
 * @param {number} z - Elevation level
 * @param {BattleTerrainType} terrain
 * @param {BattleTileModifier|null} [modifier] - Explicit override; defaults to terrain default
 * @returns {BattleTile}
 */
export function createBattleTile(x, y, z, terrain, modifier) {
  const def = BATTLE_TERRAIN_TYPES[terrain] || BATTLE_TERRAIN_TYPES.normal;
  const resolvedModifier = modifier !== undefined
    ? modifier
    : getTileModifierForTerrain(terrain);

  return {
    x,
    y,
    z,
    terrain,
    walkable: def.walkable,
    blocksLineOfSight: def.blocksLineOfSight,
    modifier: resolvedModifier,
    control: {
      occupiedBy: null,
      threatenedBy: [],
      controlledBy: null,
    },
    visual: {
      glyph: def.glyph,
      colorHint: def.colorHint,
      pulseIntensity: resolvedModifier ? 0.6 : 0,
    },
    interactionPriority: def.interactionPriority,
    movementCost: def.movementCost,
  };
}

/**
 * Returns the default BattleTileModifier for a terrain type, or null.
 *
 * @param {BattleTerrainType} terrain
 * @returns {BattleTileModifier|null}
 */
export function getTileModifierForTerrain(terrain) {
  const def = BATTLE_TERRAIN_TYPES[terrain];
  if (!def || !def.defaultModifier) return null;
  return BATTLE_TILE_MODIFIERS[def.defaultModifier] || null;
}

/**
 * Applies a tile modifier to a base score, considering the caster's school.
 * Pure function — returns a new result object.
 *
 * School matching rules (PDR §9.2):
 * - If modifier has a school and it matches the cast school → full value
 * - If modifier has a school and it does NOT match → value * 0.25 (minor benefit)
 * - If modifier has no school (positional) → always full value
 * - Void tile healing penalty: if school is VOID and intent is healing → -10%
 * - Null tile: applies negative value regardless of school
 *
 * @param {BattleTileModifier|null} modifier
 * @param {string|null} school - The caster's active school
 * @param {number} baseScore - The pre-modifier score
 * @param {{ isHealing?: boolean }} [options]
 * @returns {{ adjustedScore: number, multiplier: number, trace: string }}
 */
export function applyTileModifierToScore(modifier, school, baseScore, options = {}) {
  if (!modifier) {
    return {
      adjustedScore: baseScore,
      multiplier: 1,
      trace: 'No tile modifier.',
    };
  }

  const { isHealing = false } = options;
  let effectiveValue = modifier.value;

  // Nullification always applies at full negative value
  if (modifier.kind === 'nullification') {
    const multiplier = 1 + effectiveValue; // effectiveValue is negative
    return {
      adjustedScore: Math.round(baseScore * multiplier),
      multiplier,
      trace: `${modifier.label}: modifiers reduced by ${Math.abs(effectiveValue * 100)}%.`,
    };
  }

  // School-specific modifiers
  if (modifier.school) {
    const upperSchool = (school || '').toUpperCase();
    const modSchool = modifier.school.toUpperCase();

    if (upperSchool === modSchool) {
      // Full match — apply full value
      // Void healing penalty per PDR §9.2
      if (modSchool === 'VOID' && isHealing) {
        effectiveValue = -0.10;
      }
    } else {
      // Mismatch — minor benefit only
      effectiveValue = modifier.value * 0.25;
    }
  }

  const multiplier = 1 + effectiveValue;
  return {
    adjustedScore: Math.round(baseScore * multiplier),
    multiplier,
    trace: `${modifier.label}: ${effectiveValue >= 0 ? '+' : ''}${Math.round(effectiveValue * 100)}% (school: ${school || 'none'}).`,
  };
}

// ---------------------------------------------------------------------------
// Default Export Bundle
// ---------------------------------------------------------------------------

export default {
  BATTLE_TERRAIN_TYPES,
  BATTLE_TILE_MODIFIERS,
  TILE_DISTRIBUTION,
  SCHOOL_TERRAIN_TYPES,
  PREMIUM_TERRAIN_TYPES,
  createBattleTile,
  getTileModifierForTerrain,
  applyTileModifierToScore,
};
