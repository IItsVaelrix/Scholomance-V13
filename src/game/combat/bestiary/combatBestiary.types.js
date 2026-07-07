/**
 * @typedef {Object} BestiaryRuntimeContext
 * @property {string} [enemyId] - scene combatant instance id (e.g. sentinel-west)
 * @property {import('../weave-scene-targets.js').SceneTarget} [target]
 * @property {object} [record] - live scene record (sentinel row, etc.)
 * @property {object} [entity] - CombatStatController entity snapshot
 * @property {object} [entitySnapshot] - lightweight HP/stance payload from inspect events
 */

/**
 * @typedef {Object} CombatBestiarySection
 * @property {string} id
 * @property {string} label
 * @property {string[]} lines
 * @property {string[]} [tags]
 */

/**
 * @typedef {Object} CombatBestiaryChessPanel
 * @property {string} archetype
 * @property {string[]} weaknessFamilies
 * @property {string[]} resistanceFamilies
 * @property {string[]} syntaxWeaknesses
 * @property {string[]} syntaxResistances
 * @property {string} counsel
 */

/**
 * @typedef {Object} CombatBestiaryDossier
 * @property {string} entryId
 * @property {string} enemyId
 * @property {string} title
 * @property {string} [subtitle]
 * @property {string} [school]
 * @property {string} [epithet]
 * @property {CombatBestiarySection[]} sections
 * @property {CombatBestiaryChessPanel} [chess]
 */

/**
 * @typedef {Object} CombatAIBlock
 * @property {(context: BestiaryRuntimeContext) => object} [buildProfile]
 * @property {(context: BestiaryRuntimeContext) => object} [buildAbilityKit]
 */

/**
 * @typedef {Object} CombatBestiaryEntry
 * @property {string} id - archetype slug (sentinel-brazier, void-wraith, ...)
 * @property {number} [priority] - higher wins when multiple entries match
 * @property {(context: BestiaryRuntimeContext) => boolean} matches
 * @property {(context: BestiaryRuntimeContext) => CombatBestiaryDossier | null} [buildDossier]
 * @property {(context: BestiaryRuntimeContext) => object | null} [buildDefender]
 * @property {CombatAIBlock} [combatAI]
 */

export {};