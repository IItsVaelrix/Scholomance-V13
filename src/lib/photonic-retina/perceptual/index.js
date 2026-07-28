export {
  FEATURE_SCHEMA,
  COMPOSITION_SCHEMA,
  FIDELITY_SCHEMA,
  BALANCE_MODES,
  quantize6,
  contentHash,
  deepFreeze,
  dualClaim,
} from './schema.js';

export { toLabLattice, deltaE76 } from './preprocessing.js';
export { encodePerceptualFeatures } from './features-v1.js';
export { partitionRegions } from './region-partition.js';
export {
  buildCompositionGraph,
  evaluateCompositionEvidence,
} from './composition-graph.js';
export { buildVisualWeightField } from './visual-weight-field.js';
export { evaluatePhenotypeFidelity } from './phenotype-fidelity.js';
export {
  evaluatePerceptualEvidence,
  attachPerceptualEvidence,
} from './evaluate.js';
