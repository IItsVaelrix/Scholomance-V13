/**
 * battle-transition.fx.js
 *
 * Matrix / glyph / binary transition VFX system for the Tactical Lattice Battle Board.
 * Follows Scholomance conventions: pure event-driven, deterministic timing,
 * composable with any Phaser scene.
 *
 * This module defines the transition sequence and timing contract per PDR §6.
 * The Phaser scene (CombatArenaScene) consumes these events and drives the visuals.
 *
 * Transition sequence (PDR §6.1):
 *   T+0.0s  Encounter detected
 *   T+0.2s  Screen edges crawl with green/violet binary code
 *   T+0.6s  World geometry flickers into wireframe
 *   T+1.2s  Buildings become translucent code silhouettes
 *   T+1.8s  Noncombat clutter dissolves upward
 *   T+2.2s  Tactical grid appears under characters
 *   T+2.6s  Special tiles pulse once by school
 *   T+3.0s  Combat camera locks and HUD opens
 */

// ─── Transition Phase Definitions ────────────────────────────────────────────

/**
 * @typedef {'encounter_detected'|'code_flood'|'wireframe_flicker'|'silhouette_dissolve'|'clutter_dissolve'|'grid_reveal'|'tile_reveal'|'combat_ready'} TransitionPhaseId
 */

/**
 * @typedef {Object} TransitionPhase
 * @property {TransitionPhaseId} id - Phase identifier.
 * @property {number} startMs - Start time in milliseconds from encounter detection.
 * @property {number} durationMs - Duration of this phase in milliseconds.
 * @property {string} eventName - Event bus name for this phase.
 * @property {string} description - Human-readable description.
 */

const FULL_TRANSITION_PHASES = Object.freeze([
  { id: 'encounter_detected', startMs: 0,    durationMs: 200,  eventName: 'battle.transition.start',         description: 'Encounter triggers, screen freezes.' },
  { id: 'code_flood',         startMs: 200,  durationMs: 400,  eventName: 'battle.transition.codeFlood',     description: 'Green/violet binary code crawls screen edges.' },
  { id: 'wireframe_flicker',  startMs: 600,  durationMs: 600,  eventName: 'battle.transition.wireframe',     description: 'World geometry flickers into wireframe.' },
  { id: 'silhouette_dissolve', startMs: 1200, durationMs: 600,  eventName: 'battle.transition.clutterDissolve', description: 'Buildings become translucent code silhouettes.' },
  { id: 'clutter_dissolve',   startMs: 1800, durationMs: 400,  eventName: 'battle.transition.clutterDissolve', description: 'Noncombat clutter dissolves upward.' },
  { id: 'grid_reveal',        startMs: 2200, durationMs: 400,  eventName: 'battle.transition.gridReveal',    description: 'Tactical grid appears under characters.' },
  { id: 'tile_reveal',        startMs: 2600, durationMs: 400,  eventName: 'battle.transition.tileReveal',    description: 'Special tiles pulse once by school.' },
  { id: 'combat_ready',       startMs: 3000, durationMs: 0,    eventName: 'battle.transition.ready',         description: 'Combat camera locks, HUD opens.' },
]);

const COMPRESSED_TRANSITION_PHASES = Object.freeze([
  { id: 'encounter_detected', startMs: 0,    durationMs: 100,  eventName: 'battle.transition.start',         description: 'Quick encounter trigger.' },
  { id: 'code_flood',         startMs: 100,  durationMs: 200,  eventName: 'battle.transition.codeFlood',     description: 'Quick code flood.' },
  { id: 'grid_reveal',        startMs: 300,  durationMs: 300,  eventName: 'battle.transition.gridReveal',    description: 'Grid and tiles reveal together.' },
  { id: 'tile_reveal',        startMs: 600,  durationMs: 200,  eventName: 'battle.transition.tileReveal',    description: 'Special tiles flash.' },
  { id: 'combat_ready',       startMs: 800,  durationMs: 0,    eventName: 'battle.transition.ready',         description: 'Combat ready.' },
]);

// ─── Transition Event Contract ───────────────────────────────────────────────

/**
 * @typedef {Object} BattleTransitionEvent
 * @property {'BATTLE_TRANSITION'} type - Event type identifier.
 * @property {string} sourceSceneId - The exploration scene ID.
 * @property {string} encounterId - The encounter that triggered combat.
 * @property {string} encounterSeed - Deterministic seed for board generation.
 * @property {number} durationMs - Total transition duration.
 * @property {'full'|'compressed'} mode - Transition mode.
 * @property {{ codeFlood: boolean, dissolveClutter: boolean, revealGrid: boolean, revealSpecialTiles: boolean }} visual - Visual flags.
 * @property {{ cue: string, syncToBeat?: boolean }} audio - Audio cue.
 */

/**
 * Creates a BattleTransitionEvent for the event bus.
 *
 * @param {Object} params
 * @param {string} params.sourceSceneId - Current exploration scene.
 * @param {string} params.encounterId - Encounter ID.
 * @param {string} params.encounterSeed - Board generation seed.
 * @param {'full'|'compressed'} [params.mode='full'] - Transition mode.
 * @returns {BattleTransitionEvent}
 */
export function createTransitionEvent({
  sourceSceneId,
  encounterId,
  encounterSeed,
  mode = 'full',
}) {
  const phases = mode === 'compressed' ? COMPRESSED_TRANSITION_PHASES : FULL_TRANSITION_PHASES;
  const lastPhase = phases[phases.length - 1];
  const durationMs = lastPhase.startMs + lastPhase.durationMs;

  return {
    type: 'BATTLE_TRANSITION',
    sourceSceneId,
    encounterId,
    encounterSeed,
    durationMs,
    mode,
    visual: {
      codeFlood: true,
      dissolveClutter: mode === 'full',
      revealGrid: true,
      revealSpecialTiles: true,
    },
    audio: {
      cue: 'battle_decompile',
      syncToBeat: mode === 'full',
    },
  };
}

// ─── Transition Timeline ─────────────────────────────────────────────────────

/**
 * @typedef {Object} TransitionTimeline
 * @property {TransitionPhase[]} phases - Ordered phase list.
 * @property {number} totalDurationMs - Total transition time.
 * @property {'full'|'compressed'} mode - Current mode.
 */

/**
 * Returns the transition timeline for a given mode.
 *
 * @param {'full'|'compressed'} mode
 * @returns {TransitionTimeline}
 */
export function getTransitionTimeline(mode = 'full') {
  const phases = mode === 'compressed' ? COMPRESSED_TRANSITION_PHASES : FULL_TRANSITION_PHASES;
  const lastPhase = phases[phases.length - 1];

  return {
    phases: [...phases],
    totalDurationMs: lastPhase.startMs + lastPhase.durationMs,
    mode,
  };
}

/**
 * Determines which phase is active at a given elapsed time.
 *
 * @param {number} elapsedMs - Milliseconds since transition start.
 * @param {'full'|'compressed'} [mode='full']
 * @returns {TransitionPhase|null}
 */
export function getActivePhase(elapsedMs, mode = 'full') {
  const phases = mode === 'compressed' ? COMPRESSED_TRANSITION_PHASES : FULL_TRANSITION_PHASES;

  for (let i = phases.length - 1; i >= 0; i--) {
    if (elapsedMs >= phases[i].startMs) {
      return { ...phases[i] };
    }
  }
  return null;
}

/**
 * Returns the progress (0-1) within the current phase.
 *
 * @param {number} elapsedMs
 * @param {'full'|'compressed'} [mode='full']
 * @returns {{ phase: TransitionPhase|null, progress: number }}
 */
export function getPhaseProgress(elapsedMs, mode = 'full') {
  const phase = getActivePhase(elapsedMs, mode);
  if (!phase || phase.durationMs === 0) {
    return { phase, progress: 1 };
  }

  const phaseElapsed = elapsedMs - phase.startMs;
  const progress = Math.min(1, Math.max(0, phaseElapsed / phase.durationMs));

  return { phase, progress };
}

// ─── Skip Rule (PDR §6.3) ───────────────────────────────────────────────────

/**
 * @typedef {Object} TransitionSkipContext
 * @property {number} battleCount - Number of battles fought in this area.
 * @property {boolean} isBoss - Whether this is a boss encounter.
 * @property {boolean} isDiscovery - Whether this is a discovery/first-time encounter.
 */

/**
 * Determines the transition mode based on PDR §6.3 skip rules.
 *
 * @param {TransitionSkipContext} context
 * @returns {'full'|'compressed'}
 */
export function resolveTransitionMode(context) {
  const { battleCount = 0, isBoss = false, isDiscovery = false } = context || {};

  // Boss and discovery fights always get full transition
  if (isBoss || isDiscovery) return 'full';

  // First battle in area gets full transition
  if (battleCount === 0) return 'full';

  // Repeat battles get compressed
  return 'compressed';
}

// ─── Code Flood Character Generation ─────────────────────────────────────────

/**
 * Generates deterministic Matrix-style code characters for the flood effect.
 * Uses a seeded PRNG so the same seed produces the same visual.
 *
 * @param {string} seed - Encounter seed for determinism.
 * @param {number} count - Number of characters to generate.
 * @returns {string[]} Array of code characters.
 */
export function generateCodeFloodChars(seed, count) {
  const SCHOLOMANCE_GLYPHS = 'ᚱᚨᚦᛗᚾᛖᛁᛋᛏᛒᛚᛞᛝᛟᛠᛡᛢᛣᛤᛥᛦ';
  const BINARY_CHARS = '01';
  const HEX_CHARS = '0123456789ABCDEF';
  const GLYPH_POOL = SCHOLOMANCE_GLYPHS + BINARY_CHARS + HEX_CHARS + '{}[]<>|/\\=+-*#@$';

  // Simple seeded PRNG (FNV-1a inspired)
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  const chars = [];
  for (let i = 0; i < count; i++) {
    hash ^= (i + 1);
    hash = Math.imul(hash, 16777619);
    const idx = Math.abs(hash) % GLYPH_POOL.length;
    chars.push(GLYPH_POOL[idx]);
  }

  return chars;
}

// ─── Dissolve Object Classification ──────────────────────────────────────────

/**
 * @typedef {Object} DissolveClassification
 * @property {string} id - Object identifier.
 * @property {'clutter'|'building_projection_removed'|'noncombat_decor'|'preserved'} classification - How the object is handled.
 * @property {boolean} shouldDissolve - Whether to show dissolve animation.
 * @property {number} dissolveOrder - Order in the dissolve sequence (0 = first).
 * @property {number} dissolveDelayMs - Delay before dissolve starts.
 */

/**
 * Classifies world objects for the battle transition dissolve sequence.
 *
 * @param {Object} worldObject - Object with { id, tags, combatRelevant }.
 * @returns {DissolveClassification}
 */
export function classifyForDissolve(worldObject) {
  const { id = '', tags = [], combatRelevant = false } = worldObject || {};

  // Preserved objects stay on the board
  if (combatRelevant) {
    return {
      id,
      classification: 'preserved',
      shouldDissolve: false,
      dissolveOrder: -1,
      dissolveDelayMs: 0,
    };
  }

  // Buildings dissolve as code silhouettes
  if (tags.includes('building') || tags.includes('structure')) {
    return {
      id,
      classification: 'building_projection_removed',
      shouldDissolve: true,
      dissolveOrder: 0,
      dissolveDelayMs: 1200,
    };
  }

  // Decorative props dissolve upward
  if (tags.includes('decor') || tags.includes('prop') || tags.includes('furniture')) {
    return {
      id,
      classification: 'noncombat_decor',
      shouldDissolve: true,
      dissolveOrder: 1,
      dissolveDelayMs: 1800,
    };
  }

  // Default: clutter
  return {
    id,
    classification: 'clutter',
    shouldDissolve: true,
    dissolveOrder: 2,
    dissolveDelayMs: 1800,
  };
}

/**
 * Batch-classifies all world objects and returns sorted dissolve plan.
 *
 * @param {Object[]} worldObjects - Array of { id, tags, combatRelevant }.
 * @returns {{ preserved: DissolveClassification[], dissolving: DissolveClassification[] }}
 */
export function buildDissolvePlan(worldObjects) {
  const classifications = (worldObjects || []).map(classifyForDissolve);

  const preserved = classifications.filter(c => !c.shouldDissolve);
  const dissolving = classifications
    .filter(c => c.shouldDissolve)
    .sort((a, b) => a.dissolveOrder - b.dissolveOrder || a.dissolveDelayMs - b.dissolveDelayMs);

  return { preserved, dissolving };
}

// ─── Reverse Transition (Combat End → Overworld) ─────────────────────────────

/**
 * Returns the reverse transition timeline for combat end.
 * The board projection collapses and the overworld returns.
 *
 * @returns {TransitionTimeline}
 */
export function getReverseTransitionTimeline() {
  const phases = [
    { id: 'combat_end',      startMs: 0,    durationMs: 200,  eventName: 'battle.transition.end',           description: 'Combat ends, HUD closes.' },
    { id: 'grid_collapse',   startMs: 200,  durationMs: 400,  eventName: 'battle.transition.gridCollapse',  description: 'Tactical grid fades.' },
    { id: 'world_restore',   startMs: 600,  durationMs: 600,  eventName: 'battle.transition.worldRestore',  description: 'Buildings and clutter reappear.' },
    { id: 'overworld_ready', startMs: 1200, durationMs: 0,    eventName: 'battle.transition.overworldReady', description: 'Overworld fully restored.' },
  ];

  return {
    phases,
    totalDurationMs: 1200,
    mode: 'reverse',
  };
}

// ─── Exports ─────────────────────────────────────────────────────────────────

export {
  FULL_TRANSITION_PHASES,
  COMPRESSED_TRANSITION_PHASES,
};

export default {
  createTransitionEvent,
  getTransitionTimeline,
  getActivePhase,
  getPhaseProgress,
  resolveTransitionMode,
  generateCodeFloodChars,
  classifyForDissolve,
  buildDissolvePlan,
  getReverseTransitionTimeline,
  FULL_TRANSITION_PHASES,
  COMPRESSED_TRANSITION_PHASES,
};
