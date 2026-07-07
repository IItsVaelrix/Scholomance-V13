/**
 * tactical.engine.js
 *
 * Pure, deterministic core for the Tactical Grid Battlefield System.
 * Follows Scholomance conventions: JSDoc schemas, no side effects,
 * centralized math, composable.
 *
 * This module coexists with resonance/leyline combat. It powers card-based
 * tactical encounters (Tutorial Island first).
 *
 * SCDL / PixelBrain note (from SCDL_COMPILER_WHITE_PAPER):
 *   Card visuals, unit sprites, tile sigils (Eye/Fang/...), frames for
 *   animation states (idle, summon, attack, death), and battlefield
 *   projections should be authored via SCDL (asset + palette + parts +
 *   frame/loop + vector ops) and compiled to PixelBrainAssetPacket for
 *   Phaser/React consumption. Semantic roles and materials propagate.
 */

import { stableHash } from './leyline.engine.js'; // reuse stable utils if helpful

// ---------------------------------------------------------------------------
// Core Type Mirrors (prefer importing from battle.schemas.js in consumers)
// ---------------------------------------------------------------------------

/**
 * @typedef {'unit'|'structure'|'artifact'|'manaSource'|'spell'|'environment'} CardKind
 * @typedef {'unit'|'structure'|'artifact'|'manaSource'|'zoneEffect'} BattlefieldEntityKind
 * @typedef {'ice'|'voidStone'|'frozenRuins'|'manaCrystal'|'abyss'|'snow'|'runeTile'|'stone'} TerrainType
 * @typedef {'eye'|'fang'|'halo'|'void'|'frost'|'crown'|'mirror'|'star'} ScholomanceSymbol
 */

/**
 * Tactical grid tile. Extends the resonance GridCell concept but with
 * full tactical data per the Tactical Grid Battlefield spec.
 *
 * @typedef {Object} TacticalGridTile
 * @property {number} x
 * @property {number} y
 * @property {number} height
 * @property {TerrainType} terrainType
 * @property {string|null} occupantId
 * @property {ScholomanceSymbol|null} buffSymbol
 * @property {number} movementCost
 * @property {boolean} lineOfSightBlock
 * @property {number} rangeModifier
 * @property {number} accuracyModifier
 * @property {number} damageModifier
 * @property {string|null} elementalAffinity
 * @property {boolean} isSpawnable
 * @property {boolean} isObjectiveTile
 * @property {Object[]} statusEffects
 */

/**
 * @typedef {Object} CardStats
 * @property {number} [health]
 * @property {number} [mana]
 * @property {number} [armor]
 * @property {number} [ward]
 * @property {number} [attack]
 * @property {number} [spellPower]
 * @property {number} [range]
 * @property {number} [movement]
 * @property {number} [initiative]
 * @property {number} [accuracy]
 * @property {number} [evasion]
 * @property {number} [criticalChance]
 * @property {number} [criticalDamage]
 * @property {number} [heightAffinity]
 */

/**
 * @typedef {Object} PlacementRule
 * @property {TerrainType[]} allowedTerrains
 * @property {number[]} allowedHeights
 * @property {string[]} [requiredKeywords]
 * @property {boolean} [requiresEmpty]
 */

/**
 * @typedef {Object} CardDefinition
 * @property {string} id
 * @property {string} name
 * @property {CardKind} kind
 * @property {number} cost
 * @property {string} [className]
 * @property {string} [element]
 * @property {string} rarity
 * @property {CardStats} stats
 * @property {string[]} keywords
 * @property {any[]} abilities
 * @property {PlacementRule} placementRules
 * @property {{ frameKey?: string, iconKey?: string, palette?: Record<string,string> }} visualProfile
 */

/**
 * @typedef {Object} BattlefieldEntity
 * @property {string} id
 * @property {string} cardId
 * @property {string} ownerId
 * @property {BattlefieldEntityKind} kind
 * @property {number} x
 * @property {number} y
 * @property {number} height
 * @property {CardStats} stats
 * @property {any[]} statusEffects
 * @property {Record<string,number>} cooldowns
 * @property {string} [name]
 * @property {string} [school]
 */

// ---------------------------------------------------------------------------
// Scholomance Symbol Buffs (tooltip-ready, reusable)
// ---------------------------------------------------------------------------

const SYMBOL_BUFFS = {
  eye:   { accuracy: 12,  lineOfSight: 1,  revealHidden: true,  label: 'Eye Sigil', desc: '+Accuracy, +Line of Sight, reveals hidden units.' },
  fang:  { meleeDamage: 10, critChance: 5, label: 'Fang Sigil', desc: '+Melee damage, +Critical chance.' },
  halo:  { healing: 12, shield: 8, label: 'Halo Sigil', desc: '+Healing received, +Shield strength.' },
  void:  { manaGen: 1, darkScaling: 15, corruptionRisk: true, label: 'Void Sigil', desc: '+Mana generation, +Dark spell scaling (risk of corruption).' },
  frost: { iceResist: 15, slowAura: 1, frostPower: 10, label: 'Frost Sigil', desc: '+Ice resistance, slow aura, improves frost spells.' },
  crown: { leadership: 8, summonPower: 10, morale: 5, label: 'Crown Sigil', desc: '+Leadership aura, +Summon strength, +Morale.' },
  mirror:{ counter: 10, reflection: 8, illusion: true, label: 'Mirror Sigil', desc: '+Counterspell chance, reflection effects, illusion synergy.' },
  star:  { range: 1, spellRadius: 1, manaEfficiency: 8, label: 'Star Sigil', desc: '+Range, +Spell radius, +Mana efficiency.' },
};

/**
 * Returns the buff descriptor for a Scholomance symbol. Safe for tooltips.
 * @param {ScholomanceSymbol|null} symbol
 */
export function getScholomanceSymbolBuff(symbol) {
  if (!symbol || !SYMBOL_BUFFS[symbol]) {
    return { label: 'Plain Tile', desc: 'No special buff.', modifiers: {} };
  }
  return {
    label: SYMBOL_BUFFS[symbol].label,
    desc: SYMBOL_BUFFS[symbol].desc,
    modifiers: { ...SYMBOL_BUFFS[symbol] },
  };
}

// ---------------------------------------------------------------------------
// Tutorial Island Generator (deterministic, teaching-focused)
// ---------------------------------------------------------------------------

/**
 * Creates the Tutorial Island grid: icy void island suspended in space.
 * Pre-placed teaching elements:
 *  - High ground ridges for archer/mage advantage (height 3-4)
 *  - Lower approach paths (height 0-1)
 *  - Key sigil tiles for buff capture lesson
 *  - Mana source tiles (Starwell)
 *  - Spawnable flat zones
 *  - LOS blockers (ruins)
 *
 * @returns {{ grid: TacticalGridTile[][], width: number, height: number, metadata: object }}
 */
export function createTutorialIslandGrid(width = 9, height = 9) {
  const grid = [];
  const symbolPlacements = {
    '2,2': 'fang',   // Move target for early lesson
    '6,3': 'star',   // Elevated star for range lesson
    '4,5': 'frost',  // Control zone
    '1,7': 'eye',    // Reveal / accuracy
  };

  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      // Base icy terrain with ridges and basins
      let terrainType = 'ice';
      let heightLevel = 1;
      let movementCost = 1;
      let losBlock = false;
      let spawnable = true;
      let isObjective = false;

      // Elevated ridges (teaching high ground)
      if ((x >= 5 && y <= 3) || (x >= 6 && y <= 4)) {
        heightLevel = 3;
        terrainType = 'frozenRuins';
        movementCost = 2;
      }
      if (x === 7 && y <= 2) {
        heightLevel = 4; // Archer perch
      }

      // Lower basins / approach
      if (y >= 6 || (x <= 2 && y >= 5)) {
        heightLevel = 0;
        terrainType = 'snow';
        movementCost = 1;
      }

      // Void cracks / dangerous
      if ((x === 3 && y === 4) || (x === 5 && y === 6)) {
        terrainType = 'abyss';
        movementCost = 3;
        spawnable = false;
      }

      // Rune / mana tiles
      if ((x + y) % 7 === 2) {
        terrainType = 'runeTile';
      }
      if (x === 3 && y === 3) {
        terrainType = 'manaCrystal'; // Starwell
      }

      // Some cover / LOS blockers
      if (x === 2 && y === 2) {
        losBlock = true;
        terrainType = 'frozenRuins';
      }

      // Objective-ish centerish
      if (x === 4 && y === 4) {
        isObjective = true;
      }

      const key = `${x},${y}`;
      const buffSymbol = symbolPlacements[key] || null;

      row.push({
        x,
        y,
        height: heightLevel,
        terrainType,
        occupantId: null,
        buffSymbol,
        movementCost,
        lineOfSightBlock: losBlock,
        rangeModifier: 0,
        accuracyModifier: 0,
        damageModifier: 0,
        elementalAffinity: terrainType === 'ice' || terrainType === 'snow' ? 'frost' : (terrainType === 'abyss' ? 'void' : null),
        isSpawnable: spawnable,
        isObjectiveTile: isObjective,
        statusEffects: [],
      });
    }
    grid.push(row);
  }

  return {
    grid,
    width,
    height,
    metadata: {
      name: 'Tutorial Island',
      theme: 'icy-void',
      description: 'An icy landmass suspended in the cosmic void, surrounded by a galaxy. Built for tactical teaching.',
      recommendedFirstCard: 'frost-squire',
    },
  };
}

// ---------------------------------------------------------------------------
// Placement System
// ---------------------------------------------------------------------------

/**
 * Validates whether a card can be placed on a given tile for the current board state.
 * Respects mana (caller), tile rules, height, terrain, occupancy, tutorial constraints.
 *
 * @param {CardDefinition} cardDef
 * @param {TacticalGridTile} tile
 * @param {{ entities?: any[], tutorialMode?: boolean }} [context]
 * @returns {{ ok: boolean, reason?: string }}
 */
export function canPlaceCard(cardDef, tile, context = {}) {
  if (!cardDef || !tile) return { ok: false, reason: 'Missing card or tile' };
  if (tile.occupantId) return { ok: false, reason: 'Tile occupied' };
  if (!tile.isSpawnable) return { ok: false, reason: 'Tile not spawnable' };

  const rules = cardDef.placementRules || {};
  const allowedTerrains = rules.allowedTerrains || ['ice', 'voidStone', 'frozenRuins', 'manaCrystal', 'snow', 'runeTile', 'stone'];
  const allowedHeights = rules.allowedHeights || [0, 1, 2, 3, 4];

  if (!allowedTerrains.includes(tile.terrainType)) {
    return { ok: false, reason: `Incompatible terrain: ${tile.terrainType}` };
  }
  if (!allowedHeights.includes(tile.height)) {
    return { ok: false, reason: `Height ${tile.height} not allowed for this card` };
  }

  if (context.tutorialMode) {
    // Tutorial restrictions: early steps force highlighted tiles
    // (Caller provides intent; engine only enforces basics here.)
  }

  // Mana cost validated by caller (battle state)
  return { ok: true };
}

/**
 * Converts a placed card into a BattlefieldEntity and applies tile effects.
 * Does not mutate inputs. Returns new entity + suggested tile occupant update.
 *
 * @param {CardDefinition} cardDef
 * @param {string} ownerId
 * @param {TacticalGridTile} tile
 * @returns {{ entity: BattlefieldEntity, tileUpdate: Partial<TacticalGridTile> }}
 */
export function convertCardToEntity(cardDef, ownerId, tile) {
  const id = `${cardDef.id}-${ownerId}-${tile.x}-${tile.y}-${Date.now() % 100000}`;

  const baseStats = { ...(cardDef.stats || {}) };

  // Apply terrain affinity bonuses (example: ice golem / frost on ice)
  if (cardDef.element === 'frost' && (tile.terrainType === 'ice' || tile.terrainType === 'snow')) {
    baseStats.armor = (baseStats.armor || 0) + 2;
  }

  const entity = {
    id,
    cardId: cardDef.id,
    ownerId,
    kind: mapKindToEntity(cardDef.kind),
    x: tile.x,
    y: tile.y,
    height: tile.height,
    stats: baseStats,
    statusEffects: [],
    cooldowns: {},
    name: cardDef.name,
    school: cardDef.element || cardDef.className || 'neutral',
  };

  const tileUpdate = {
    occupantId: id,
    // tile buffs will be read live via getEffectiveTileForEntity
  };

  return { entity, tileUpdate };
}

function mapKindToEntity(kind) {
  if (kind === 'spell') return 'zoneEffect';
  if (['structure', 'artifact', 'manaSource'].includes(kind)) return kind;
  return 'unit';
}

// ---------------------------------------------------------------------------
// Elevation, Range, Accuracy, Damage (readable + previewable)
// ---------------------------------------------------------------------------

/**
 * Core targeting math per spec.
 * Returns finalAccuracy + full breakdown for tooltips.
 *
 * @typedef {Object} TargetingContext
 * @property {number} baseAccuracy
 * @property {number} distance
 * @property {number} optimalRange
 * @property {number} attackerHeight
 * @property {number} targetHeight
 * @property {number} tileAccuracyModifier
 * @property {number} buffAccuracyModifier
 * @property {number} targetEvasion
 * @property {boolean} hasLineOfSight
 * @property {string} [className]
 * @property {string} [weaponOrSpell]
 */
export function calculateAccuracy(context) {
  const {
    baseAccuracy = 70,
    distance = 1,
    optimalRange = 3,
    attackerHeight = 1,
    targetHeight = 1,
    tileAccuracyModifier = 0,
    buffAccuracyModifier = 0,
    targetEvasion = 0,
    hasLineOfSight = true,
    className = '',
    weaponOrSpell = '',
  } = context || {};

  if (!hasLineOfSight) {
    return {
      finalAccuracy: 0,
      breakdown: { reason: 'No line of sight' },
      blocked: true,
    };
  }

  let distancePenalty = Math.max(0, distance - optimalRange) * -10;
  const heightDelta = attackerHeight - targetHeight;

  // Per spec:
  // Target below attacker: +5% per level
  // Target above attacker: -5% per level
  const elevationModifier = heightDelta * 5;

  // Class / archetype bonuses (examples)
  let classBonus = 0;
  if (className.toLowerCase().includes('archer') || weaponOrSpell === 'ranged') {
    if (heightDelta > 0) classBonus += 8; // extra downward advantage
  }
  if (className.toLowerCase().includes('mage')) {
    if (heightDelta > 0) classBonus += 5;
  }

  let final = baseAccuracy + distancePenalty + elevationModifier + tileAccuracyModifier + buffAccuracyModifier - targetEvasion + classBonus;

  // Clamp 5-100 as example
  final = Math.max(5, Math.min(100, Math.round(final)));

  return {
    finalAccuracy: final,
    breakdown: {
      baseAccuracy,
      distancePenalty,
      elevationModifier,
      tileAccuracyModifier,
      buffAccuracyModifier,
      targetEvasion,
      classBonus,
      heightDelta,
      distance,
    },
  };
}

/**
 * Simple LOS check (Bresenham-inspired). Blocks on lineOfSightBlock tiles.
 * For full 3D consideration, caller supplies tile map with blockers.
 */
export function hasLineOfSight(origin, target, getTileFn) {
  if (!getTileFn) return true;
  const tiles = getLineTiles(origin, target); // reuse util if imported, or local
  for (const t of tiles) {
    const tile = getTileFn(t);
    if (tile && tile.lineOfSightBlock) return false;
  }
  return true;
}

/** Local bresenham-lite for LOS (duplicated small util to keep module standalone). */
function getLineTiles(origin, target) {
  const tiles = [];
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps === 0) return [];
  for (let i = 1; i <= steps; i++) {
    const x = Math.round(origin.x + (dx * i) / steps);
    const y = Math.round(origin.y + (dy * i) / steps);
    tiles.push({ x, y });
  }
  return tiles;
}

/**
 * Damage formula per spec.
 * Final = base + scaling + elevation + tile + buff - armor/ward/resist + crit?
 * Returns amount + breakdown.
 */
export function calculateDamage(attacker, defender, context = {}) {
  const {
    baseDamage = attacker?.stats?.attack || attacker?.stats?.spellPower || 8,
    abilityScaling = 0,
    elevationBonus = 0,
    tileBonus = 0,
    buffBonus = 0,
    defenderArmor = defender?.stats?.armor || 0,
    defenderWard = defender?.stats?.ward || 0,
    resistance = 0,
    isCritical = false,
    critMultiplier = 1.5,
  } = context;

  const heightDelta = (attacker?.height ?? 1) - (defender?.height ?? 1);
  const autoElevation = heightDelta > 0 ? Math.floor(heightDelta * 1.5) : 0; // small default

  let dmg = baseDamage + abilityScaling + (elevationBonus || autoElevation) + tileBonus + buffBonus;

  dmg = Math.max(1, Math.round(dmg - defenderArmor - Math.floor(defenderWard * 0.6) - resistance));

  if (isCritical) dmg = Math.round(dmg * critMultiplier);

  return {
    finalDamage: Math.max(1, dmg),
    breakdown: {
      baseDamage,
      abilityScaling,
      elevationBonus: elevationBonus || autoElevation,
      tileBonus,
      buffBonus,
      armor: defenderArmor,
      ward: defenderWard,
      resistance,
      critical: isCritical,
      heightDelta,
    },
  };
}

// ---------------------------------------------------------------------------
// Sample Tutorial Cards (temporary fixtures, non-hardcoded in prod flow)
// ---------------------------------------------------------------------------

export const TUTORIAL_CARDS = {
  'frost-squire': {
    id: 'frost-squire',
    name: 'Frost Squire',
    kind: 'unit',
    cost: 2,
    className: 'knight',
    element: 'frost',
    rarity: 'common',
    stats: { health: 18, armor: 3, attack: 5, range: 1, movement: 3, accuracy: 72, initiative: 6 },
    keywords: ['melee', 'frost'],
    abilities: [],
    placementRules: {
      allowedTerrains: ['ice', 'snow', 'frozenRuins', 'runeTile', 'stone'],
      allowedHeights: [0, 1, 2, 3],
    },
    visualProfile: { frameKey: 'frost-squire', iconKey: 'unit-melee' },
  },
  'star-archer': {
    id: 'star-archer',
    name: 'Star Archer',
    kind: 'unit',
    cost: 3,
    className: 'archer',
    element: 'star',
    rarity: 'uncommon',
    stats: { health: 12, attack: 7, range: 5, movement: 2, accuracy: 78, initiative: 8 },
    keywords: ['ranged', 'precision'],
    abilities: [{ id: 'eagle-sigil', name: 'Eagle Sigil', effect: 'temporary range+2 upward accuracy' }],
    placementRules: {
      allowedTerrains: ['ice', 'frozenRuins', 'runeTile', 'stone'],
      allowedHeights: [1, 2, 3, 4],
    },
    visualProfile: { frameKey: 'star-archer' },
  },
  'ice-wall': {
    id: 'ice-wall',
    name: 'Ice Wall',
    kind: 'structure',
    cost: 2,
    element: 'frost',
    rarity: 'common',
    stats: { health: 22, armor: 8 },
    keywords: ['wall', 'blocker'],
    abilities: [],
    placementRules: {
      allowedTerrains: ['ice', 'snow', 'frozenRuins'],
      allowedHeights: [0, 1, 2],
    },
    visualProfile: { frameKey: 'ice-wall' },
  },
  'mana-crystal': {
    id: 'mana-crystal',
    name: 'Mana Crystal',
    kind: 'manaSource',
    cost: 3,
    element: 'star',
    rarity: 'uncommon',
    stats: { mana: 0, manaGeneration: 4 },
    keywords: ['mana', 'source'],
    abilities: [],
    placementRules: {
      allowedTerrains: ['manaCrystal', 'runeTile', 'ice'],
      allowedHeights: [0, 1, 2],
    },
    visualProfile: { frameKey: 'mana-crystal' },
  },
};

/**
 * Quick helper for tutorial flow validation.
 */
export function getTutorialStepGuidance(step) {
  const steps = {
    1: 'Place Frost Squire on the highlighted flat ice tile.',
    2: 'Move Frost Squire toward the Fang Sigil (melee bonus teaching).',
    3: 'Place Star Archer on elevated ridge (height 3-4).',
    4: 'Attack downward from high ground — observe +accuracy / +damage.',
    5: 'Attempt low-ground attack upward to feel accuracy penalty.',
    6: 'Use Eagle Sigil spell / ability for range and upward accuracy.',
    7: 'Place Mana Crystal on a Starwell / manaCrystal tile.',
    8: 'Place Ice Wall to demonstrate area denial and LOS block.',
    9: 'Combine positioning, elevation, and buffs to defeat the tutorial foe.',
  };
  return steps[step] || 'Continue mastering the board.';
}

// ---------------------------------------------------------------------------
// Battlefield Tooltip Generator (reuses "wordtooltip" philosophy for clarity)
// Fast, readable, beautiful breakdowns for cards, tiles, elevation, accuracy.
// ---------------------------------------------------------------------------

/**
 * Generate a tooltip model for any battlefield concern.
 * Consumers (UI) turn this into WordTooltip-like or dedicated TacticalTooltip surfaces.
 *
 * @param {{kind: string, data?: any}} query
 * @returns {{ title: string, body: string[], meta?: any }}
 */
export function generateBattleTooltip(query = {}) {
  const { kind, data = {} } = query;

  if (kind === 'highGround') {
    const { heightDelta = 3 } = data;
    return {
      title: 'High Ground Advantage',
      body: [
        `This unit is ${heightDelta} elevation level${heightDelta === 1 ? '' : 's'} above the target.`,
        '',
        'Effects:',
        `+${heightDelta * 5}% accuracy`,
        `+${Math.floor(heightDelta * 1.5)}% ranged damage`,
        `+${Math.min(2, Math.floor(heightDelta / 2))} effective range`,
        '',
        'Reason: Archers and mages gain stronger targeting angles from elevated positions.',
      ],
      meta: { heightDelta },
    };
  }

  if (kind === 'tileBuff') {
    const buff = getScholomanceSymbolBuff(data.symbol);
    return {
      title: buff.label,
      body: [buff.desc, 'Hover or focus tile for precise numeric modifiers in context.'],
      meta: buff.modifiers,
    };
  }

  if (kind === 'accuracyPreview') {
    const acc = data.accuracyResult || calculateAccuracy(data.context || {});
    const b = acc.breakdown || {};
    return {
      title: `Accuracy: ${acc.finalAccuracy}%`,
      body: [
        `Base: ${b.baseAccuracy ?? '?'}%`,
        `Distance: ${b.distancePenalty ?? 0}`,
        `Elevation: ${b.elevationModifier ?? 0}`,
        `Tile: ${b.tileAccuracyModifier ?? 0}`,
        `Buffs: ${b.buffAccuracyModifier ?? 0}`,
        `Evasion: -${b.targetEvasion ?? 0}`,
        ...(b.classBonus ? [`Class: +${b.classBonus}`] : []),
        '',
        acc.blocked ? 'BLOCKED — No line of sight.' : 'Line of sight clear.',
      ],
      meta: { final: acc.finalAccuracy, breakdown: b },
    };
  }

  if (kind === 'damagePreview') {
    const dmg = data.damageResult || calculateDamage(data.attacker, data.defender, data.context);
    const b = dmg.breakdown || {};
    return {
      title: `Damage: ${dmg.finalDamage}`,
      body: [
        `Base: ${b.baseDamage}`,
        `Elevation: +${b.elevationBonus || 0}`,
        `Tile/Buff: +${(b.tileBonus || 0) + (b.buffBonus || 0)}`,
        `Armor/Ward: -${(b.armor || 0) + Math.floor((b.ward || 0) * 0.6)}`,
        b.critical ? 'CRITICAL HIT' : '',
      ].filter(Boolean),
      meta: dmg,
    };
  }

  if (kind === 'card') {
    const c = data.card || {};
    return {
      title: `${c.name} — ${c.kind} (${c.cost} mana)`,
      body: [
        `${c.className || ''} ${c.element || ''} | ${c.rarity}`,
        `HP ${c.stats?.health ?? '?'}  ATK ${c.stats?.attack ?? '?'}  RNG ${c.stats?.range ?? '?'}  MV ${c.stats?.movement ?? '?'}`,
        (c.keywords || []).join(', '),
        c.abilities?.length ? `Abilities: ${c.abilities.map(a => a.name).join(', ')}` : '',
      ].filter(Boolean),
      meta: c,
    };
  }

  // Default / card stat inspection fallback
  return {
    title: 'Battlefield Element',
    body: ['Inspect the card, tile, or unit for detailed stats and modifiers.'],
  };
}

export default {
  createTutorialIslandGrid,
  canPlaceCard,
  convertCardToEntity,
  calculateAccuracy,
  calculateDamage,
  getScholomanceSymbolBuff,
  getTutorialStepGuidance,
  TUTORIAL_CARDS,
};
