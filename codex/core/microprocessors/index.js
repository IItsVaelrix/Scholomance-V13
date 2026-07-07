import { verseIRMicroprocessors } from './factory.js';
import {
  BytecodeError,
  ERROR_CATEGORIES,
  ERROR_SEVERITY,
  MODULE_IDS,
  ERROR_CODES,
} from '../pixelbrain/bytecode-error.js';
import { getKnownColorNames } from './color/named-color-registry.js';

/**
 * LAZY MICROPROCESSOR REGISTRY
 * 
 * Maps IDs to dynamic import functions.
 * Prevents loading NLU dependencies when only Pixel work is needed (and vice-versa).
 */

// --- NLU Microprocessors (Lazy) ---
verseIRMicroprocessors.register('nlu.classifyIntent', async (payload, context) => {
  const { classifyIntent } = await import('./nlu/intent-classifier.js');
  return classifyIntent(payload, context);
});

verseIRMicroprocessors.register('nlu.extractEntities', async (payload, context) => {
  const { extractEntities } = await import('./nlu/entity-extractor.js');
  return extractEntities(payload, context);
});

verseIRMicroprocessors.register('nlu.mapSemantics', async (payload, context) => {
  const { mapEntitiesToSemanticParameters } = await import('./nlu/semantic-mapper.js');
  return mapEntitiesToSemanticParameters(payload, context);
});

verseIRMicroprocessors.register('nlu.generateVerse', async (payload, context) => {
  const { generateVerse } = await import('./nlu/verse-generator.js');
  return generateVerse(payload, context);
});

verseIRMicroprocessors.register('nlu.synthesizeVerse', async (payload, context) => {
  const { runSynthesis } = await import('./nlu/synthesisProcessor.js');
  return runSynthesis(payload, context);
});

verseIRMicroprocessors.register('pls.index', async (payload, context) => {
  const { buildPlsIndex } = await import('./nlu/plsIndexProcessor.js');
  return buildPlsIndex(payload);
});

// --- Color Microprocessors (Lazy) ---
verseIRMicroprocessors.register('color.resolve', async (payload, context) => {
  const { resolveKnownColor } = await import('./color/ColorResolver.js');
  return resolveKnownColor(payload, context);
});

getKnownColorNames().forEach((colorName) => {
  verseIRMicroprocessors.register(`color.resolve.${colorName}`, async (payload, context) => {
    const { createColorResolverProcessor } = await import('./color/ColorResolver.js');
    return createColorResolverProcessor(colorName)(payload, context);
  });
});

// --- Pixel Microprocessors (Lazy) ---
verseIRMicroprocessors.register('pixel.decode', async (payload, context) => {
  const { decodeBitStream } = await import('./pixel/BitStreamProcessor.js');
  return decodeBitStream(payload, context);
});

verseIRMicroprocessors.register('pixel.resample', async (payload, context) => {
  const { resampleSubstrate } = await import('./pixel/SubstrateResampler.js');
  return resampleSubstrate(payload, context);
});

verseIRMicroprocessors.register('pixel.trace', async (payload, context) => {
  const { traceLattice } = await import('./pixel/LatticeTracer.js');
  return traceLattice(payload, context);
});

verseIRMicroprocessors.register('pixel.quantize', async (payload, context) => {
  const { quantizeChroma } = await import('./pixel/ChromaQuantizer.js');
  return quantizeChroma(payload, context);
});

verseIRMicroprocessors.register('pixel.transmute', async (payload, context) => {
  const { transmuteAIArt } = await import('./pixel/Transmuter.js');
  return transmuteAIArt(payload, context);
});

verseIRMicroprocessors.register('pixelbrain.pipeline.run', async (payload, context) => {
  const { runPixelBrainOperationPipeline } = await import('../pixelbrain/pixelbrain-operation-pipeline.js');
  return runPixelBrainOperationPipeline(payload, context);
});

verseIRMicroprocessors.register('pixelbrain.colorIntensity.rate', async (payload, context) => {
  const { runColorIntensityProcessor } = await import('../pixelbrain/color-intensity-rating-microprocessor.js');
  return runColorIntensityProcessor(payload, context);
});

// --- Animation Microprocessors (Lazy) ---
verseIRMicroprocessors.register('pixel.compileAnimation', async (payload, context) => {
  const { compileAnimation } = await import('./pixel/AnimationProcessor.js');
  return compileAnimation(payload, context);
});

verseIRMicroprocessors.register('pixel.calculateRotation', async (payload, context) => {
  const { calculateRotation } = await import('./pixel/AnimationProcessor.js');
  return calculateRotation(payload, context);
});

verseIRMicroprocessors.register('amp.run', async (payload, context) => {
  try {
    const { runAmpProcessor } = await import('./pixel/AmpRunProcessor.ts');
    return runAmpProcessor(payload);
  } catch (err) {
    if (err.code === 'ERR_UNKNOWN_FILE_EXTENSION' || err.message.includes('Unknown file extension')) {
      throw new BytecodeError(
        ERROR_CATEGORIES.STATE, ERROR_SEVERITY.CRIT, MODULE_IDS.CORE,
        ERROR_CODES.INVALID_STATE,
        { reason: 'amp.run requires TypeScript runtime support (Vite/TSX)', originalError: err.message },
      );
    }
    throw err;
  }
});

verseIRMicroprocessors.register('amp.status', async () => {
  const { getAmpStatus } = await import('../animation/amp/runAnimationAmp.ts');
  return getAmpStatus();
});

verseIRMicroprocessors.register('amp.getAllActive', async () => {
  const { getAllActiveAnimations } = await import('../animation/amp/runAnimationAmp.ts');
  const active = getAllActiveAnimations();
  return Array.from(active.entries()); // Map is not serializable across postMessage
});

verseIRMicroprocessors.register('amp.getActive', async (targetId) => {
  const { getActiveAnimation } = await import('../animation/amp/runAnimationAmp.ts');
  return getActiveAnimation(targetId);
});

verseIRMicroprocessors.register('amp.clearActive', async (targetId) => {
  const { clearActiveAnimation } = await import('../animation/amp/runAnimationAmp.ts');
  return clearActiveAnimation(targetId);
});

// --- Symmetry AMP Microprocessors ---
verseIRMicroprocessors.register('amp.symmetry', async (payload, context) => {
  const { runSymmetryAmpProcessor } = await import('../pixelbrain/symmetry-amp.js');
  return runSymmetryAmpProcessor(payload, context);
});

verseIRMicroprocessors.register('amp.coord-symmetry', async (payload, context) => {
  const { runCoordSymmetryAmp } = await import('../pixelbrain/coord-symmetry-amp.js');
  return runCoordSymmetryAmp(payload, context);
});

verseIRMicroprocessors.register('amp.shadow-perception', async (payload, _context) => {
  const { runShadowPerceptionAmp } = await import('../pixelbrain/shadow-perception-amp.js');
  return runShadowPerceptionAmp(payload);
});

// --- Photonic Retina Microprocessors (Lazy) ---
verseIRMicroprocessors.register('amp.attachPhotonicRoute', async (payload, context) => {
  const { attachAnimationPhotonicRoute } = await import('../../../src/lib/animation-photonic.adapter.js');
  return attachAnimationPhotonicRoute(payload, context);
});

// --- IDE Microprocessors (Lazy) ---
verseIRMicroprocessors.register('arbiter.predict', async (payload, context) => {
  try {
    const { predictNextRitualMove } = await import('./arbiter/predictProcessor.ts');
    return predictNextRitualMove(payload, context);
  } catch (err) {
    if (err.code === 'ERR_UNKNOWN_FILE_EXTENSION' || err.message.includes('Unknown file extension')) {
      throw new BytecodeError(
        ERROR_CATEGORIES.STATE, ERROR_SEVERITY.CRIT, MODULE_IDS.CORE,
        ERROR_CODES.INVALID_STATE,
        { reason: 'arbiter.predict requires TypeScript runtime support (Vite/TSX)', originalError: err.message },
      );
    }
    throw err;
  }
});

// --- Modulation / Wand Microprocessors ---
verseIRMicroprocessors.register('compose.formula.v1', async (payload, context) => {
  const { composeFormulaProcessor } = await import('../modulation/processors/compose-formula.js');
  return composeFormulaProcessor(payload, payload?.params || {}, context);
});

// --- Arena Visual Tick (offloaded per-frame arena work) ---
verseIRMicroprocessors.register('arena.tick', async (payload, context) => {
  const { arenaTickProcessor } = await import('./arena/arena-tick.processor.js');
  return arenaTickProcessor(payload, context);
});

verseIRMicroprocessors.register('amp.turboquant.similarity', async (payload, _context) => {
  const { runTurboQuantAmp } = await import('./turboquant-amp.js');
  return runTurboQuantAmp(payload);
});

export { verseIRMicroprocessors };
