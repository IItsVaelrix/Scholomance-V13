/**
 * Temporal Layer — Public API for animation-as-source-code.
 *
 * "The geometry bridge gave Blender a language.
 *  This temporal layer gives that language a verb tense."
 *
 * Architecture:
 *   SCDNA temporal genes (curated keyframes)
 *       ↓
 *   Construction IR (spatial state at each keyframe)
 *       ↓
 *   Interpolation Engine (pure function: stateA, stateB, algo, t → stateT)
 *       ↓ governed by ↓
 *   BytecodeHealth Governor (certifies, versions, audits, replays — never interpolates)
 *       ↓
 *   VRI (renders the certified state)
 *       ↓
 *   Blender / RGBA (produces pixels from VRI instructions)
 *       ↓
 *   Chained Receipts (verify pixels match the certified state)
 *
 * Usage:
 *   import { createTemporalGene, compileTemporal, replayFrame } from 'codex/core/pixelbrain/temporal/index.js';
 *
 *   const gene = createTemporalGene({ ... });
 *   const compiled = compileTemporal(gene, { frameCount: 60 });
 *   const replay = replayFrame(gene, compiled.frames[30]);
 *   // replay.verified === true
 *
 * @bytecode PB-TEMPORAL-GENE-v1 / PB-TEMPORAL-COMPILED-v1
 */

// Schema
export {
  TEMPORAL_CONTRACT,
  TEMPORAL_VERSION,
  INTERPOLATION_ALGORITHMS,
  TEMPORAL_ASPECTS,
  PROJECTION_MODES,
  validateTemporalSpec,
  computeTemporalChecksum,
  createTemporalGene,
  flattenState,
  unflattenState,
} from './temporal-schema.js';

// Interpolation Engine (pure functions — the "verb conjugation")
export {
  INTERPOLATION_ENGINE_VERSION,
  lerpScalar,
  hermiteScalar,
  bezierScalar,
  stepScalar,
  smoothstepScalar,
  interpolateFlat,
  interpolateState,
  evaluateTemporal,
  evaluateEnergyBindings,
  generateFrames,
} from './interpolation-engine.js';

// Governor (BytecodeHealth certification — the "notary, not the author")
export {
  TEMPORAL_GOVERNOR_VERSION,
  TEMPORAL_HEALTH_CODES,
  computeProjectionChecksum,
  certifyGene,
  certifyInterpolation,
  verifyReplay,
  diagnoseDrift,
  certifySequence,
  createApprovalRecord,
} from './temporal-governor.js';

// Compiler (top-level orchestration)
export {
  TEMPORAL_COMPILED_CONTRACT,
  TEMPORAL_COMPILER_VERSION,
  compileTemporal,
  replayFrame,
  extractVRIInput,
  formatForWire,
} from './temporal-compiler.js';
