export {
  encodeToPhotonicRetina,
} from './retina-adapter.js';

export {
  createPhotonicRetinaPacketCache,
} from './retina-cache.js';

export {
  createRetinaBrushStrokeBatcher,
} from './retina-stream.js';

export {
  RETINA_WORKER_MESSAGE_TYPES,
  createRetinaWorkerEncodeMessage,
  handleRetinaWorkerMessage,
  installRetinaWorkerScope,
} from './retina-worker.js';

export {
  createRetinaDiagnosticsSnapshot,
} from './retina-diagnostics.js';

export {
  createRetinaReplayEntry,
  replayRetinaEntries,
} from './retina-replay.js';

export {
  createLowBitPreview,
  createOpticalSimulation,
  createPacketDelta,
  routeRetinaPacketToPhotonicBridge,
} from './retina-bridge.js';

export {
  cellIndex,
  cellCount,
  cellSignature,
  buildCellSignatures,
  diffCellSignatures,
} from './retina-cell-index.js';

export {
  SHADOW_DELTA_EPSILON,
  diffShadowField,
} from './retina-shadow-field.js';

export {
  assemblePerceptionFrame,
  fullAttendFrame,
} from './retina-perception.js';

export {
  FEEL_CONTRACT,
  evaluatePerceptualFeel,
  diffPerceptualFeel,
} from './retina-feel.js';

export {
  runGeometryFeelAMP,
} from './retina-feel-geometry.js';

export {
  runConstructionFeelAMP,
} from './retina-feel-construction.js';

export {
  runSilhouetteFeelAMP,
} from './retina-feel-silhouette.js';

export {
  VIXEL_CONTRACT,
  fuseVixelField,
  vixelToSpatialField,
  evaluateTextureFormCoherence,
  evaluateSilhouetteSmoothness,
  evaluateVixelFeel,
  diffVixelFeel,
} from './retina-vixel.js';

export {
  FEATURE_SCHEMA,
  COMPOSITION_SCHEMA,
  FIDELITY_SCHEMA,
  evaluatePerceptualEvidence,
  attachPerceptualEvidence,
  encodePerceptualFeatures,
  partitionRegions,
  buildCompositionGraph,
  buildVisualWeightField,
  evaluatePhenotypeFidelity,
} from './perceptual/index.js';

// This barrel is browser-reachable (Landing -> storm/photonicStorm.js), so it must
// only re-export browser-safe modules. `schema.js` is pure data; the equivalence
// EVALUATOR is not — it pulls vessels-svg/canvas/pixi, which import `node:module`
// createRequire, and Rollup resolves even a dynamic import() into the browser graph
// and fails the production build on the __vite-browser-external stub.
// Node and test callers import ./realization-equivalence/evaluate.js directly.
// DO NOT re-export evaluateRealizationEquivalence here.
export { EQUIVALENCE_SCHEMA } from './realization-equivalence/schema.js';

export {
  buildVisualExecutionManifest,
  assertManifestReplay,
} from './visual-execution-manifest.js';

export {
  evaluateRetinaVerdictEvidence,
  attachRetinaVerdictEvidence,
  ART_FAMILIES,
} from './verdicts/index.js';

export {
  nominateMotifCandidate,
  assertNominationDoesNotWriteScdna,
  ART_MOTIF_NOMINATED,
} from './motif-nomination.js';

// --- LING-0F03 fix: Register photonic bridge for codex/core ---
// codex/core files cannot import from src/ directly. Instead, we register
// the implementations here so codex/core can look them up at runtime.
import { registerPhotonicBridge } from '../../../codex/core/pixelbrain/photonic-bridge-registry.js';
import { routeRetinaPacketToPhotonicBridge } from './retina-bridge.js';
import { buildCellSignatures, diffCellSignatures } from './retina-cell-index.js';
import { diffShadowField } from './retina-shadow-field.js';
import { assemblePerceptionFrame } from './retina-perception.js';
import { evaluatePerceptualFeel, diffPerceptualFeel } from './retina-feel.js';
import { fuseVixelField, evaluateVixelFeel, diffVixelFeel, evaluateTextureFormCoherence, evaluateSilhouetteSmoothness } from './retina-vixel.js';

// Vixel Lattice (Wand pipeline) — the composition boundary where
// Wand vectorPaths + SCDL pixelGrid become concurrent QBIT Lattice cells.
import { fuseToVixelField, diffVixelFields } from '../vixel-lattice/vixel-fusion.js';
import { evaluateVixelFeel as evaluateLatticeVixelFeel, diffVixelFeel as diffLatticeVixelFeel, vixelFieldToSpatialField } from '../vixel-lattice/vixel-feel-adapter.js';

registerPhotonicBridge({
  routeRetinaPacketToPhotonicBridge,
  buildCellSignatures,
  diffCellSignatures,
  diffShadowField,
  assemblePerceptionFrame,
  evaluatePerceptualFeel,
  diffPerceptualFeel,
  fuseVixelField,
  evaluateVixelFeel,
  diffVixelFeel,
  evaluateTextureFormCoherence,
  evaluateSilhouetteSmoothness,
  // Wand → Vixel pipeline (LING-0F03: codex/core accesses via getPhotonicBridge())
  fuseToVixelField,
  diffVixelFields,
  evaluateLatticeVixelFeel,
  diffLatticeVixelFeel,
  vixelFieldToSpatialField,
});
