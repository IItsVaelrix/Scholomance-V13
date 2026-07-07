/**
 * Arena spellweave Invoke costs — one Invoke per turn, paid from the AP pool.
 */

export const DEFAULT_MANA_POINTS = 100;
/** @deprecated Mana is no longer spent on Invoke; kept for legacy UI/regen paths. */
export const SPELL_CAST_MANA_COST = 10;
/** AP spent to Invoke spellweave once per player turn. */
export const SPELL_CAST_AP_COST = 3;

/**
 * @param {number | null | undefined} remainingAp
 * @param {number} [cost=SPELL_CAST_AP_COST]
 */
export function hasApForSpellweaveInvoke(remainingAp, cost = SPELL_CAST_AP_COST) {
  return Number(remainingAp) >= cost;
}

/**
 * @param {number | null | undefined} remaining
 * @param {number} [cost=SPELL_CAST_MANA_COST]
 */
export function hasManaForSpell(remaining, cost = SPELL_CAST_MANA_COST) {
  return Number(remaining) >= cost;
}