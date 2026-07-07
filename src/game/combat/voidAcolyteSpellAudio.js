/**
 * Void1 boss spell audio routing — VOID spells use Audio Forge dark bass;
 * ice spells use the scholosound ice impact sample.
 */

export const VOID_ACOLYTE_VOID_SPELL_IDS = Object.freeze([
  'void_gravity',
  'void_lash',
  'void_execution',
  'basic',
]);

export const VOID_ACOLYTE_ICE_SPELL_IDS = Object.freeze([
  'icicle_blast',
]);

export function isVoidAcolyteVoidSpell(abilityId) {
  return VOID_ACOLYTE_VOID_SPELL_IDS.includes(abilityId);
}

export function isVoidAcolyteIceSpell(abilityId) {
  return VOID_ACOLYTE_ICE_SPELL_IDS.includes(abilityId);
}

/** @param {import('./voidAcolyteCombatAbilities.js').VoidAcolyteAbilityId | string} abilityId */
export function getVoidAcolyteSpellVariant(abilityId) {
  switch (abilityId) {
    case 'void_gravity': return 'gravity';
    case 'void_lash': return 'lash';
    case 'void_execution': return 'execution';
    default: return 'default';
  }
}

/** @param {{ emitSfx: (eventType: string, payload?: object) => unknown }} audioService */
export function emitVoidAcolyteSpellCast(audioService, abilityId, extra = {}) {
  if (!audioService || !isVoidAcolyteVoidSpell(abilityId)) return;
  void audioService.emitSfx('VOID_SPELL_CAST', {
    affinity: 'VOID',
    battleId: 'combat-arena',
    variant: getVoidAcolyteSpellVariant(abilityId),
    ...extra,
  });
}

/** @param {{ emitSfx: (eventType: string, payload?: object) => unknown }} audioService */
export function emitVoidAcolyteSpellHit(audioService, abilityId, extra = {}) {
  if (!audioService || !isVoidAcolyteVoidSpell(abilityId)) return;
  void audioService.emitSfx('VOID_SPELL_HIT', {
    affinity: 'VOID',
    battleId: 'combat-arena',
    variant: getVoidAcolyteSpellVariant(abilityId),
    ...extra,
  });
}