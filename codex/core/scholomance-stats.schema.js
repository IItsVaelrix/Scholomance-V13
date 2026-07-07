/**
 * Scholomance MMORPG attribute stat tree — canonical schema.
 *
 * Separates creative force, combat expression, knowledge systems, and experiential
 * reward loops from tactical combat primitives (movement / attack / range).
 *
 * CLASSIFICATION: core / pure / schema
 * LAYER: codex/core — NO DOM, NO framework imports.
 */

export const SCHOLOMANCE_STAT_KEYS = Object.freeze([
  'KSYN',
  'BAPO',
  'SONIC',
  'VALCH',
  'PSYCH',
  'CINF',
  'MYTH',
  'CODEX',
  'DISCOVERY',
]);

export const SCHOLOMANCE_STAT_CATEGORIES = Object.freeze({
  CREATIVE_COMBAT: 'creative_combat',
  MIND_KNOWLEDGE: 'mind_knowledge',
  WORLD_INTERACTION: 'world_interaction',
  PRESENTATION_IMPACT: 'presentation_impact',
  TACTICAL: 'tactical',
});

/** @type {Readonly<Record<string, readonly string[]>>} */
export const SCHOLOMANCE_CATEGORY_STATS = Object.freeze({
  [SCHOLOMANCE_STAT_CATEGORIES.CREATIVE_COMBAT]: Object.freeze(['BAPO', 'SONIC', 'VALCH']),
  [SCHOLOMANCE_STAT_CATEGORIES.MIND_KNOWLEDGE]: Object.freeze(['KSYN', 'PSYCH', 'CODEX']),
  [SCHOLOMANCE_STAT_CATEGORIES.WORLD_INTERACTION]: Object.freeze(['DISCOVERY', 'MYTH']),
  [SCHOLOMANCE_STAT_CATEGORIES.PRESENTATION_IMPACT]: Object.freeze(['CINF', 'MYTH', 'BAPO']),
});

/**
 * @typedef {object} ScholomanceStatDefinition
 * @property {string} key
 * @property {string} abbrev
 * @property {string} fullName
 * @property {string} category
 * @property {readonly string[]} categories
 * @property {number} base
 * @property {number} min
 * @property {number} max
 * @property {string} coreFunction
 * @property {string} designRead
 */

/** @type {readonly ScholomanceStatDefinition[]} */
export const SCHOLOMANCE_STATS = Object.freeze([
  {
    key: 'KSYN',
    abbrev: 'KSYN',
    fullName: 'Knowledge Synthesis',
    category: SCHOLOMANCE_STAT_CATEGORIES.MIND_KNOWLEDGE,
    categories: Object.freeze([
      SCHOLOMANCE_STAT_CATEGORIES.MIND_KNOWLEDGE,
    ]),
    base: 10,
    min: 0,
    max: 100,
    coreFunction: 'Combining learned concepts into stronger spells, chains, rituals, or discoveries',
    designRead: 'The engineer-mage stat — scales combo logic, spell crafting, synthesis trees, and adaptive spell evolution.',
  },
  {
    key: 'BAPO',
    abbrev: 'BAPO',
    fullName: 'Battle Poetry',
    category: SCHOLOMANCE_STAT_CATEGORIES.CREATIVE_COMBAT,
    categories: Object.freeze([
      SCHOLOMANCE_STAT_CATEGORIES.CREATIVE_COMBAT,
      SCHOLOMANCE_STAT_CATEGORIES.PRESENTATION_IMPACT,
    ]),
    base: 10,
    min: 0,
    max: 100,
    coreFunction: 'Combat lyricism, spell cadence, rhyme-based attacks, verbal pressure',
    designRead: 'The battle rapper stat — powers spoken attacks, chained verses, taunts, rhythm-combat, and lyrical finishers.',
  },
  {
    key: 'SONIC',
    abbrev: 'SONIC',
    fullName: 'Sonic Thaumaturgy',
    category: SCHOLOMANCE_STAT_CATEGORIES.CREATIVE_COMBAT,
    categories: Object.freeze([
      SCHOLOMANCE_STAT_CATEGORIES.CREATIVE_COMBAT,
    ]),
    base: 10,
    min: 0,
    max: 100,
    coreFunction: 'Sound magic, resonance, vibration, frequency damage, music-based casting',
    designRead: 'The audio engineer stat — governs waveform spells, reverb zones, resonance damage, silence breaks, and frequency terrain.',
  },
  {
    key: 'VALCH',
    abbrev: 'VALCH',
    fullName: 'Verbal Alchemy',
    category: SCHOLOMANCE_STAT_CATEGORIES.CREATIVE_COMBAT,
    categories: Object.freeze([
      SCHOLOMANCE_STAT_CATEGORIES.CREATIVE_COMBAT,
    ]),
    base: 10,
    min: 0,
    max: 100,
    coreFunction: 'Transforming words into effects, buffs, debuffs, transmutations, inscriptions',
    designRead: 'The word-smith stat — transmutation through language, glyphs, prefixes, suffixes, and naming.',
  },
  {
    key: 'PSYCH',
    abbrev: 'PSYCH',
    fullName: 'Psychic Schism',
    category: SCHOLOMANCE_STAT_CATEGORIES.MIND_KNOWLEDGE,
    categories: Object.freeze([
      SCHOLOMANCE_STAT_CATEGORIES.MIND_KNOWLEDGE,
    ]),
    base: 10,
    min: 0,
    max: 100,
    coreFunction: 'Mind fracture, illusion, fear, possession, perception splits, psychic resistance',
    designRead: 'The fractured-mind stat — illusions, psychic damage, madness resistance, split-casting, and dream-space combat.',
  },
  {
    key: 'CINF',
    abbrev: 'CINF',
    fullName: 'Cinematic Fidelity',
    category: SCHOLOMANCE_STAT_CATEGORIES.PRESENTATION_IMPACT,
    categories: Object.freeze([
      SCHOLOMANCE_STAT_CATEGORIES.PRESENTATION_IMPACT,
    ]),
    base: 10,
    min: 0,
    max: 100,
    coreFunction: 'Visual spectacle, animation weight, spell presentation, dramatic clarity',
    designRead: 'The spectacle stat — how cool the spell looked becomes mechanically relevant: intimidation, morale, clarity, cinematic finishers.',
  },
  {
    key: 'MYTH',
    abbrev: 'MYTH',
    fullName: 'Mythological Weight',
    category: SCHOLOMANCE_STAT_CATEGORIES.WORLD_INTERACTION,
    categories: Object.freeze([
      SCHOLOMANCE_STAT_CATEGORIES.WORLD_INTERACTION,
      SCHOLOMANCE_STAT_CATEGORIES.PRESENTATION_IMPACT,
    ]),
    base: 10,
    min: 0,
    max: 100,
    coreFunction: 'Legendary gravity, archetypal power, divine/demonic resonance',
    designRead: 'The legend-weight stat — how much the universe believes the spell matters: relics, archetypes, boss interactions, named attacks.',
  },
  {
    key: 'CODEX',
    abbrev: 'CODEX',
    fullName: 'Lore Knowledge',
    category: SCHOLOMANCE_STAT_CATEGORIES.MIND_KNOWLEDGE,
    categories: Object.freeze([
      SCHOLOMANCE_STAT_CATEGORIES.MIND_KNOWLEDGE,
    ]),
    base: 10,
    min: 0,
    max: 100,
    coreFunction: 'Ancient systems, bestiary data, historical memory, puzzle solving',
    designRead: 'The scholar stat — lore checks, enemy weaknesses, ancient language decoding, rare recipes, dungeon shortcuts.',
  },
  {
    key: 'DISCOVERY',
    abbrev: 'DISCOVERY',
    fullName: 'Discovery',
    category: SCHOLOMANCE_STAT_CATEGORIES.WORLD_INTERACTION,
    categories: Object.freeze([
      SCHOLOMANCE_STAT_CATEGORIES.WORLD_INTERACTION,
    ]),
    base: 10,
    min: 0,
    max: 100,
    coreFunction: 'Exploration rewards, novel spell usage, hidden interactions, experimentation',
    designRead: 'The anti-grind stat — rewards curiosity, weird combos, off-label spell use, and terrain experimentation.',
  },
]);

const STAT_BY_KEY = Object.freeze(
  Object.fromEntries(SCHOLOMANCE_STATS.map((stat) => [stat.key, stat])),
);

/**
 * @param {string} key
 * @returns {ScholomanceStatDefinition|undefined}
 */
export function getScholomanceStatDefinition(key) {
  return STAT_BY_KEY[String(key || '').toUpperCase()];
}

/**
 * @param {string} category
 * @returns {readonly ScholomanceStatDefinition[]}
 */
export function getScholomanceStatsByCategory(category) {
  const keys = SCHOLOMANCE_CATEGORY_STATS[category];
  if (!keys) return Object.freeze([]);
  return Object.freeze(keys.map((key) => STAT_BY_KEY[key]).filter(Boolean));
}

/**
 * Clamp a stat value to its registry bounds.
 *
 * @param {string} key
 * @param {number} value
 * @returns {number}
 */
export function clampScholomanceStatValue(key, value) {
  const def = getScholomanceStatDefinition(key);
  if (!def) return 0;
  const n = Number(value);
  if (!Number.isFinite(n)) return def.base;
  return Math.max(def.min, Math.min(def.max, Math.round(n)));
}

/**
 * @param {Partial<Record<string, number>>} overrides
 * @returns {Record<string, number>}
 */
export function buildDefaultScholomanceStatBlock(overrides = {}) {
  const block = Object.fromEntries(
    SCHOLOMANCE_STATS.map((stat) => [stat.key, stat.base]),
  );
  for (const [rawKey, rawValue] of Object.entries(overrides)) {
    const key = String(rawKey).toUpperCase();
    if (!STAT_BY_KEY[key]) continue;
    block[key] = clampScholomanceStatValue(key, rawValue);
  }
  return block;
}