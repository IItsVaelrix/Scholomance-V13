/**
 * evaluatePerceptualEvidence + attachPerceptualEvidence
 */

import { contentHash, deepFreeze } from './schema.js';
import { toLabLattice } from './preprocessing.js';
import { encodePerceptualFeatures } from './features-v1.js';
import { partitionRegions } from './region-partition.js';
import { buildCompositionGraph, evaluateCompositionEvidence } from './composition-graph.js';
import { buildVisualWeightField } from './visual-weight-field.js';
import { evaluatePhenotypeFidelity } from './phenotype-fidelity.js';

/**
 * @param {object} input SpatialField or VixelField
 * @param {object} [options]
 */
export function evaluatePerceptualEvidence(input, options = {}) {
  if (!input || typeof input !== 'object') {
    throw new Error('PERCEPTUAL_EVIDENCE_INVALID_INPUT');
  }

  const lattice = toLabLattice(input, { targetSize: options.targetSize });
  const mode = lattice.mode;
  const geneIntent = options.geneIntent ?? {};

  const features = encodePerceptualFeatures(input, {
    targetSize: options.targetSize,
    genePalette: options.genePalette,
  });

  const partition = partitionRegions(input, { lattice });
  const weightField = buildVisualWeightField(partition, lattice, geneIntent);
  const graph = buildCompositionGraph(partition, lattice, geneIntent);
  const composition = evaluateCompositionEvidence(graph, weightField, partition, lattice, geneIntent);

  const fidelity = evaluatePhenotypeFidelity({
    mode,
    partition,
    features,
    composition,
    graph,
    weightField,
    geneIntent,
    declaredParts: options.declaredParts ?? null,
    declaredSilhouette: options.declaredSilhouette ?? null,
    declaredTopology: options.declaredTopology ?? null,
    declaredWandRoles: options.declaredWandRoles ?? null,
    declaredHierarchy: options.declaredHierarchy ?? null,
    baseline: options.baseline ?? null,
  });

  const evidence = {
    features,
    partition,
    graph,
    weightField,
    composition,
    fidelity,
    mode,
    evidenceHash: '',
  };
  evidence.evidenceHash = contentHash({
    featureHash: features.featureHash,
    partitionHash: partition.partitionHash,
    compositionHash: composition.compositionHash,
    weightHash: weightField.weightHash,
    fidelityHash: fidelity.fidelityHash,
    mode,
  });

  return deepFreeze(evidence);
}

/**
 * Attach evidence without mutating legacy verdict fields.
 * Returns a new object; original report is not mutated.
 */
export function attachPerceptualEvidence(report, evidence) {
  if (!report || typeof report !== 'object') {
    throw new Error('PERCEPTUAL_EVIDENCE_INVALID_REPORT');
  }
  const next = {
    ...report,
    perceptualEvidence: evidence,
  };
  // Guarantee verdict fields are copied by value (primitives)
  if ('spatialAwareness' in report) next.spatialAwareness = report.spatialAwareness;
  if ('verdict' in report) next.verdict = report.verdict;
  if ('feelHash' in report) next.feelHash = report.feelHash;
  return Object.freeze(next);
}
