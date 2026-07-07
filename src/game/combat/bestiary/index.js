import { registerCombatBestiaryEntry } from './combatBestiary.registry.js';
import { sentinelBrazierBestiaryEntry } from './entries/sentinelBrazier.entry.js';
import { voidAcolyteBestiaryEntry } from './entries/voidAcolyte.entry.js';

let bootstrapped = false;

/**
 * Register all combat bestiary entries here.
 *
 * To add a new enemy later:
 * 1. Create `entries/<enemySlug>.entry.js` exporting `{ id, priority, matches, buildDossier, buildDefender }`.
 * 2. Import it below and call `registerCombatBestiaryEntry(...)` inside bootstrapCombatBestiary().
 * 3. Optionally add a syntactic archetype in `codex/core/combat.syntax-chess.js`.
 */
export function bootstrapCombatBestiary() {
  if (bootstrapped) return;
  registerCombatBestiaryEntry(sentinelBrazierBestiaryEntry);
  registerCombatBestiaryEntry(voidAcolyteBestiaryEntry);
  bootstrapped = true;
}

bootstrapCombatBestiary();

export { buildBestiaryContextFromScene, buildBestiaryRuntimeContext } from './buildBestiaryContext.js';
export {
  buildCombatBestiaryDossier,
  buildCombatDefenderProfile,
  hasCombatBestiaryEntry,
  listCombatBestiaryEntries,
  registerCombatBestiaryEntry,
  resolveCombatBestiaryEntry,
} from './combatBestiary.registry.js';
export { SENTINEL_BRAZIER_BESTIARY_ID } from './entries/sentinelBrazier.entry.js';