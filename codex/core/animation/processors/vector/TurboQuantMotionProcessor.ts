/**
 * TurboQuant Motion Finalization Processor
 * 
 * Computes structural similarity of active motion trajectories against
 * a registry of "golden curves" using the TurboQuant isomorphic JS kernel.
 * 
 * Integrates configurable safety policies to control how aesthetic clamping is applied:
 *   - 'off': Completely bypass similarity checks/clamping.
 *   - 'warn-only': Computes similarity/archetype diagnostics, but does not modify values.
 *   - 'dampen-soft': Softly clamps translation & scale by 25% if similarity falls below the calibrated threshold.
 *   - 'dampen-hard': Clamps translation & scale by 50% if similarity falls below the calibrated threshold.
 *   - 'reject': Rejects the animation entirely if similarity falls below the calibrated threshold.
 */

import {
  MotionProcessor,
  MotionWorkingState,
  AnimationIntent,
  activeAmpConfig,
  AnimationAmpError,
  AMP_ERROR_CODES,
} from '../../contracts/animation.types.ts';
import { runTurboQuantAmp } from '../../../microprocessors/turboquant-amp.js';

// Calibrated against corrected cosine similarity. The previous 0.75 threshold
// was tuned to the old inflated inner-product primitive and over-dampened
// ordinary hover/mount motion after the primitive was fixed.
export const MOTION_COSINE_DEVIATION_THRESHOLD = 0.50;
export const MOTION_ARCHETYPE_MATCH_THRESHOLD = 0.60;

// Predefined set of golden aesthetic curves
const GOLDEN_CURVES = [
  {
    name: 'fade-standard',
    values: { durationMs: 300, delayMs: 0, easing: 'ease-out', translateX: 0, translateY: 0, scale: 1, opacity: 1 }
  },
  {
    name: 'slide-smooth',
    values: { durationMs: 500, delayMs: 0, easing: 'ease-in-out', translateX: 100, translateY: 0, scale: 1, opacity: 1 }
  },
  {
    name: 'bounce-impact',
    values: { durationMs: 400, delayMs: 0, easing: 'bounce', translateX: 0, translateY: 0, scale: 1.5, opacity: 1 }
  }
];

export const turboQuantMotionProcessor: MotionProcessor = {
  id: 'mp.turboquant.similarity',
  stage: 'finalize',
  priority: 10, // Runs early in finalize stage

  supports(_intent: AnimationIntent): boolean {
    return true;
  },

  async run(input: MotionWorkingState): Promise<MotionWorkingState> {
    const state = { ...input };
    
    // Safety Policy Resolution
    const safetyMode = state.intent.constraints?.motionSafetyMode || activeAmpConfig.motionSafetyMode || 'dampen-hard';

    if (safetyMode === 'off') {
      state.diagnostics.push('TurboQuant similarity: skipped (safety policy set to off)');
      (state as any).vectorSimilarity = 1.0;
      (state as any).nearestMotionArchetype = 'unknown';
      
      state.trace.push({
        processorId: this.id,
        stage: this.stage,
        changed: [],
        timestamp: performance.now(), // EXEMPT
      });
      return state;
    }

    try {
      // Direct call to TurboQuant similarity function since we are already in the worker
      return (await runTurboQuantAmp(state)) as MotionWorkingState;
    } catch (err: any) {
      if (err instanceof AnimationAmpError) {
        throw err;
      }
      state.diagnostics.push(`TurboQuantMotionProcessor worker fallback triggered: ${err.message}`);
      state.diagnostics.push('PB-ERR-v1-STATE-WARN-VECTOR-0204: Fallback triggered');
      return state;
    }
  }
};
