import { vectorizeMotion } from '../animation/amp/motionVectorizer.ts';
import { quantizeVectorJS, similarity } from '../quantization/turboquant.js';
import { AnimationAmpError, AMP_ERROR_CODES } from '../animation/contracts/animation.types.ts';

// Calibrated against corrected cosine similarity. 
const MOTION_COSINE_DEVIATION_THRESHOLD = 0.50;
const MOTION_ARCHETYPE_MATCH_THRESHOLD = 0.60;

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

export async function runTurboQuantAmp(state) {
  const safetyMode = state.intent?.constraints?.motionSafetyMode || 'dampen-hard';
  
  if (safetyMode === 'off') {
    state.vectorSimilarity = 1.0;
    state.nearestMotionArchetype = 'unknown';
    state.diagnostics.push('TurboQuant similarity: skipped (safety policy set to off)');
    state.trace.push({
      processorId: 'mp.turboquant.similarity',
      stage: 'finalize',
      changed: [],
      timestamp: performance.now(),
    });
    return state;
  }

  // Sample working state values as a ResolvedMotionOutput structure
  const tempOutput = {
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
    let matchedCurveName = 'unknown';

    // Compare against registered golden curves
    for (const curve of GOLDEN_CURVES) {
      const curveOutput = {
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

      const simScore = similarity(currentQuantized.data, curveQuantized.data, 1.0, 1.0);
      if (simScore > maxSimilarity) {
        maxSimilarity = simScore;
        matchedCurveName = curve.name;
      }
    }

    if (maxSimilarity < MOTION_ARCHETYPE_MATCH_THRESHOLD) {
      matchedCurveName = 'unknown';
    }

    state.vectorSimilarity = maxSimilarity;
    state.nearestMotionArchetype = matchedCurveName;
    state.quantizedSignature = {
      data: Array.from(currentQuantized.data).map(b => b.toString(16).padStart(2, '0')).join(''),
      norm: currentQuantized.norm,
      dimension: 256,
      sampleCount: 64,
      channels: ['translateX', 'translateY', 'scale', 'opacity'],
      backend: 'js',
    };
    state.diagnostics.push(`TurboQuant similarity: ${maxSimilarity.toFixed(4)} (matched: ${matchedCurveName})`);


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
          processorId: 'mp.turboquant.similarity',
          stage: 'finalize',
          changed: [],
          timestamp: performance.now(),
        });
        return state;
      }

      const factor = safetyMode === 'dampen-soft' ? 0.75 : 0.50;
      state.diagnostics.push(`Aesthetic deviation detected (similarity: ${maxSimilarity.toFixed(4)}). Safety policy '${safetyMode}' active; dampening applied by coefficient ${factor}.`);
      
      const changedKeys = [];
      
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
        processorId: 'mp.turboquant.similarity',
        stage: 'finalize',
        changed: changedKeys,
        timestamp: performance.now(),
      });
    } else {
      state.trace.push({
        processorId: 'mp.turboquant.similarity',
        stage: 'finalize',
        changed: [],
        timestamp: performance.now(),
      });
    }

  } catch (err) {
    if (err instanceof AnimationAmpError) {
      throw err;
    }
    state.diagnostics.push(`TurboQuantMotionProcessor warning: ${err.message}`);
    state.diagnostics.push('PB-ERR-v1-STATE-WARN-VECTOR-0204: Fallback triggered');
  }

  return state;
}
