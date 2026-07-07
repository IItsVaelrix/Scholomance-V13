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
import { vectorizeMotion } from '../../amp/motionVectorizer.ts';
import { quantizeVectorJS, similarity } from '../../../quantization/turboquant.js';

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

  run(input: MotionWorkingState): MotionWorkingState {
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

    // Sample working state values as a ResolvedMotionOutput structure
    const tempOutput: any = {
      version: state.intent.version,
      targetId: state.intent.targetId,
      success: true,
      renderer: state.intent.targetType ?? 'framer',
      values: {
        durationMs: state.values.durationMs ?? 300,
        delayMs: state.values.delayMs ?? 0,
        easing: state.values.easing ?? 'ease-out',
        translateX: state.values.translateX ?? 0,
        translateY: state.values.translateY ?? 0,
        scale: state.values.scale ?? 1,
        scaleX: state.values.scaleX ?? state.values.scale ?? 1,
        scaleY: state.values.scaleY ?? state.values.scale ?? 1,
        rotateDeg: state.values.rotateDeg ?? 0,
        opacity: state.values.opacity ?? 1,
        glow: state.values.glow ?? 0,
        blur: state.values.blur ?? 0,
        loop: state.values.loop ?? false,
        phaseOffset: state.values.phaseOffset ?? 0,
        originX: state.values.originX ?? 0.5,
        originY: state.values.originY ?? 0.5,
      },
      diagnostics: [],
      trace: []
    };

    try {
      // Vectorize current working motion
      const currentVector = vectorizeMotion(tempOutput, 256);
      const currentQuantized = quantizeVectorJS(currentVector);

      let maxSimilarity = -1.0;
      let matchedCurveName: any = 'unknown';

      // Compare against registered golden curves
      for (const curve of GOLDEN_CURVES) {
        const curveOutput: any = {
          version: state.intent.version,
          targetId: 'golden-preset',
          success: true,
          renderer: 'framer',
          values: {
            durationMs: curve.values.durationMs,
            delayMs: curve.values.delayMs,
            easing: curve.values.easing,
            translateX: curve.values.translateX,
            translateY: curve.values.translateY,
            scale: curve.values.scale,
            scaleX: curve.values.scale,
            scaleY: curve.values.scale,
            rotateDeg: 0,
            opacity: curve.values.opacity,
            loop: false,
            originX: 0.5,
            originY: 0.5,
          },
          diagnostics: [],
          trace: []
        };

        const curveVector = vectorizeMotion(curveOutput, 256);
        const curveQuantized = quantizeVectorJS(curveVector);

        // cosine similarity (estimateInnerProduct using unit norm 1.0)
        const simScore = similarity(currentQuantized.data, curveQuantized.data, 1.0, 1.0);
        if (simScore > maxSimilarity) {
          maxSimilarity = simScore;
          matchedCurveName = curve.name;
        }
      }

      // Safeguard archetype mappings
      if (maxSimilarity < MOTION_ARCHETYPE_MATCH_THRESHOLD) {
        matchedCurveName = 'unknown';
      }

      // Record findings in state
      (state as any).vectorSimilarity = maxSimilarity;
      (state as any).nearestMotionArchetype = matchedCurveName;
      state.diagnostics.push(`TurboQuant similarity: ${maxSimilarity.toFixed(4)} (matched: ${matchedCurveName})`);

      // Evaluate deviations against the corrected-cosine threshold.
      if (maxSimilarity < MOTION_COSINE_DEVIATION_THRESHOLD) {
        if (safetyMode === 'reject') {
          throw new AnimationAmpError(
            `Aesthetic deviation violation detected (similarity: ${maxSimilarity.toFixed(4)}) under reject safety policy.`,
            AMP_ERROR_CODES.AESTHETIC_VIOLATION,
            state.intent
          );
        }

        if (safetyMode === 'warn-only') {
          state.diagnostics.push(`Aesthetic deviation detected (similarity: ${maxSimilarity.toFixed(4)}). Warn-only policy active; no dampening applied.`);
          state.trace.push({
            processorId: this.id,
            stage: this.stage,
            changed: [],
            timestamp: performance.now(), // EXEMPT
          });
          return state;
        }

        // Apply config-driven safety dampening coefficients
        const factor = safetyMode === 'dampen-soft' ? 0.75 : 0.50; // 25% vs 50% dampening
        state.diagnostics.push(`Aesthetic deviation detected (similarity: ${maxSimilarity.toFixed(4)}). Safety policy '${safetyMode}' active; dampening applied by coefficient ${factor}.`);

        const changedKeys: string[] = [];

        if (state.values.translateX !== undefined) {
          state.values.translateX *= factor;
          changedKeys.push('translateX');
        }
        if (state.values.translateY !== undefined) {
          state.values.translateY *= factor;
          changedKeys.push('translateY');
        }
        if (state.values.scale !== undefined && state.values.scale > 1.0) {
          state.values.scale = 1.0 + (state.values.scale - 1.0) * factor;
          changedKeys.push('scale');
        }
        if (state.values.scaleX !== undefined && state.values.scaleX > 1.0) {
          state.values.scaleX = 1.0 + (state.values.scaleX - 1.0) * factor;
          changedKeys.push('scaleX');
        }
        if (state.values.scaleY !== undefined && state.values.scaleY > 1.0) {
          state.values.scaleY = 1.0 + (state.values.scaleY - 1.0) * factor;
          changedKeys.push('scaleY');
        }

        state.trace.push({
          processorId: this.id,
          stage: this.stage,
          changed: changedKeys,
          timestamp: performance.now(), // EXEMPT
        });
      } else {
        state.trace.push({
          processorId: this.id,
          stage: this.stage,
          changed: [],
          timestamp: performance.now(), // EXEMPT
        });
      }

    } catch (err: any) {
      if (err instanceof AnimationAmpError) {
        throw err;
      }
      state.diagnostics.push(`TurboQuantMotionProcessor warning: ${err.message}`);
      state.diagnostics.push('PB-ERR-v1-STATE-WARN-VECTOR-0204: Fallback triggered');
    }

    return state;
  }
};
