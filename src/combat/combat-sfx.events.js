/**
 * Combat SFX Events
 *
 * Maps combat outcomes to Audio Forge SFX intent calls.
 * Pure event dispatcher — no DSP logic, no AudioContext access.
 *
 * Usage in combat page or hook:
 *   import * as CombatSfx from '../combat/combat-sfx.events.js';
 *   CombatSfx.onLeylineExtracted(result, audioForge);
 *
 * LAYER: src/combat — client integration only.
 */

/**
 * Leyline extraction succeeded.
 *
 * @param {object} result - { stars, extractionScore, affinity, tile, turn, battleId }
 * @param {import('../hooks/useAudioForge.js').AudioForgeInstance} audioForge
 */
export function onLeylineExtracted(result, audioForge) {
  audioForge?.emitSfx('LEYLINE_EXTRACTION_SUCCESS', result);
}

/**
 * Leyline extraction failed.
 *
 * @param {object} result - { affinity, tile, turn, battleId }
 * @param {import('../hooks/useAudioForge.js').AudioForgeInstance} audioForge
 */
export function onLeylineFailure(result, audioForge) {
  audioForge?.emitSfx('LEYLINE_EXTRACTION_FAILURE', result);
}

/**
 * CODEx Burst stage discovered (1–5).
 *
 * @param {object} result - { stage: 1|2|3|4|5, affinity, battleId, turn }
 * @param {import('../hooks/useAudioForge.js').AudioForgeInstance} audioForge
 */
export function onCodexBurstDiscovery(result, audioForge) {
  const stage = Math.max(1, Math.min(5, result?.stage ?? 1));
  audioForge?.emitSfx(`CODEX_BURST_STAGE_${stage}`, result);
}

/**
 * Syntactical chess advantage gained.
 *
 * @param {object} result
 * @param {import('../hooks/useAudioForge.js').AudioForgeInstance} audioForge
 */
export function onSyntaxChessAdvantage(result, audioForge) {
  audioForge?.emitSfx('SYNTACTICAL_CHESS_ADVANTAGE', result);
}

/**
 * Oracle marginalia revealed.
 *
 * @param {object} result
 * @param {import('../hooks/useAudioForge.js').AudioForgeInstance} audioForge
 */
export function onOracleMarginalia(result, audioForge) {
  audioForge?.emitSfx('ORACLE_MARGINALIA', result);
}

/**
 * Nexus unlocked (stage 5 CODEx Burst culmination).
 *
 * @param {object} result
 * @param {import('../hooks/useAudioForge.js').AudioForgeInstance} audioForge
 */
export function onNexusUnlock(result, audioForge) {
  audioForge?.emitSfx('NEXUS_UNLOCK', result);
}
