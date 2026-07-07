/**
 * Modular combat bestiary registry.
 *
 * Each enemy archetype registers a matcher + dossier/defender builders.
 * UI and scoring resolve entries at runtime from scene snapshots — no
 * hard-coded sentinel branches outside entry modules.
 */

/** @type {import('./combatBestiary.types.js').CombatBestiaryEntry[]} */
const entries = [];

/**
 * @param {import('./combatBestiary.types.js').CombatBestiaryEntry} entry
 */
export function registerCombatBestiaryEntry(entry) {
  if (!entry?.id || typeof entry.matches !== 'function') {
    throw new Error('Combat bestiary entry requires id and matches(context).');
  }
  const existing = entries.findIndex((candidate) => candidate.id === entry.id);
  if (existing >= 0) entries.splice(existing, 1, entry);
  else entries.push(entry);
  entries.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  return entry;
}

/** @returns {readonly import('./combatBestiary.types.js').CombatBestiaryEntry[]} */
export function listCombatBestiaryEntries() {
  return entries;
}

/**
 * @param {import('./combatBestiary.types.js').BestiaryRuntimeContext} context
 */
export function resolveCombatBestiaryEntry(context) {
  return entries.find((entry) => {
    try {
      return entry.matches(context);
    } catch {
      return false;
    }
  }) || null;
}

/**
 * @param {import('./combatBestiary.types.js').BestiaryRuntimeContext} context
 */
export function hasCombatBestiaryEntry(context) {
  return !!resolveCombatBestiaryEntry(context);
}

/**
 * @param {import('./combatBestiary.types.js').BestiaryRuntimeContext} context
 * @returns {import('./combatBestiary.types.js').CombatBestiaryDossier | null}
 */
export function buildCombatBestiaryDossier(context) {
  const entry = resolveCombatBestiaryEntry(context);
  if (!entry?.buildDossier) return null;
  const dossier = entry.buildDossier(context);
  if (!dossier) return null;
  return {
    entryId: entry.id,
    ...dossier,
  };
}

/**
 * Defender profile for syntactical chess + school affinity scoring.
 *
 * @param {import('./combatBestiary.types.js').BestiaryRuntimeContext} context
 */
export function buildCombatDefenderProfile(context) {
  const entry = resolveCombatBestiaryEntry(context);
  if (!entry?.buildDefender) return null;
  return entry.buildDefender(context);
}