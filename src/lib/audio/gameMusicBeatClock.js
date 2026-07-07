import {
  resolveBarState,
  resolveBeatState,
} from '../../../codex/core/scholotime/scholotime.math.js';
import { GAME_BACKGROUND_MUSIC_PACING } from './gameBackgroundMusic.config.js';

/**
 * 0-based beat index → snare on beats 2 and 4 in 4/4 (indices 1 and 3).
 *
 * @param {number} beatIndex
 * @returns {boolean}
 */
export function isSnareBeatIndex(beatIndex) {
  const idx = Math.floor(beatIndex);
  return idx % 4 === 1 || idx % 4 === 3;
}

/**
 * 1-based running snare count from beat index (first snare = 1).
 *
 * @param {number} beatIndex
 * @returns {number}
 */
export function snareCountFromBeatIndex(beatIndex) {
  const idx = Math.max(0, Math.floor(beatIndex));
  return Math.floor(idx / 2) + (idx % 4 >= 1 ? 1 : 0);
}

/**
 * Snare hits per obelisk discharge cycle (beats 2 + 4 in each measure).
 *
 * @param {number} measures
 * @param {number} [beatsPerBar=4]
 * @returns {number}
 */
export function snaresPerDischargeCycle(measures, beatsPerBar = 4) {
  return Math.max(1, Math.round(measures * (beatsPerBar / 2)));
}

/**
 * @param {number} snareCount
 * @param {number} [cycleSnares=4]
 * @returns {boolean}
 */
export function isDischargeSnareHit(snareCount, cycleSnares = 4) {
  const cycle = Math.max(1, Math.floor(cycleSnares));
  return snareCount > 0 && snareCount % cycle === 0;
}

/** @deprecated Use isDischargeSnareHit — kept for 2-measure (4-snare) callers. */
export function isFourthSnareHit(snareCount) {
  return isDischargeSnareHit(snareCount, 4);
}

/**
 * Final snare before discharge in the current cycle.
 *
 * @param {number} snareCount
 * @param {number} [cycleSnares=4]
 * @returns {boolean}
 */
export function isLastChargeSnare(snareCount, cycleSnares = 4) {
  const cycle = Math.max(1, Math.floor(cycleSnares));
  return snareCount > 0 && snareCount % cycle === cycle - 1;
}

/**
 * Levitation bob offset from beat phase.
 *
 * @param {number} exactBeat
 * @param {number} [phaseOffset=0] beats
 * @param {number} [amplitude=6] pixels
 * @returns {number}
 */
export function bpmBobOffset(exactBeat, phaseOffset = 0, amplitude = 14) {
  const phase = (Number(exactBeat) + phaseOffset) * Math.PI * 2;
  return Math.sin(phase) * amplitude;
}

/**
 * Shadow scale inverse to bob height.
 *
 * @param {number} exactBeat
 * @param {number} [phaseOffset=0]
 * @returns {{ scale: number, alpha: number }}
 */
export function bpmBobShadow(exactBeat, phaseOffset = 0) {
  const lift = Math.sin((Number(exactBeat) + phaseOffset) * Math.PI * 2);
  const high = (lift + 1) * 0.5;
  return {
    scale: 1 + high * 0.8,
    alpha: 0.8 - high * 0.5,
  };
}

/**
 * @param {number} timeMs
 * @param {object} [pacing]
 * @returns {{ timeMs: number, beat: object, bar: object, snareCount: number, isSnare: boolean, isFourthSnare: boolean }}
 */
export function resolveMusicBeatSnapshot(timeMs, pacing = GAME_BACKGROUND_MUSIC_PACING) {
  const beat = resolveBeatState(timeMs, pacing);
  const bar = resolveBarState(beat, pacing.timeSignature);
  const snareCount = snareCountFromBeatIndex(beat.index);
  const isSnare = isSnareBeatIndex(beat.index);
  return {
    timeMs,
    beat,
    bar,
    snareCount,
    isSnare,
    isFourthSnare: isDischargeSnareHit(snareCount, 4),
  };
}

/**
 * Detect beat-index crossings (for one-shot triggers).
 *
 * @param {number|null} previousBeatIndex
 * @param {number} nextBeatIndex
 * @returns {boolean}
 */
export function didAdvanceBeat(previousBeatIndex, nextBeatIndex) {
  if (previousBeatIndex == null) return false;
  return Math.floor(nextBeatIndex) > Math.floor(previousBeatIndex);
}

/**
 * Returns snare beat indices crossed between two exact beat positions.
 * Handles skipped frames when the game loop hiccups.
 *
 * @param {number|null} prevExactBeat
 * @param {number} nextExactBeat
 * @returns {number[]}
 */
export function findSnareCrossings(prevExactBeat, nextExactBeat) {
  if (prevExactBeat == null || !Number.isFinite(nextExactBeat)) return [];
  const prevFloor = Math.floor(prevExactBeat);
  const nextFloor = Math.floor(nextExactBeat);
  if (nextFloor <= prevFloor) return [];

  const crossed = [];
  for (let beatIdx = prevFloor + 1; beatIdx <= nextFloor; beatIdx++) {
    if (isSnareBeatIndex(beatIdx)) crossed.push(beatIdx);
  }
  return crossed;
}