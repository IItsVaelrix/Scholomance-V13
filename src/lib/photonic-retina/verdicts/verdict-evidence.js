/**
 * PB-RETINA-VERDICT-EVIDENCE-v1 — 8-dim evidence sidecar (never mutates Feel verdicts)
 */

import { VERDICT_EVIDENCE_SCHEMA, quantize6, contentHash, deepFreeze } from '../realization-equivalence/schema.js';
import { resolveArtFamilyWeights } from './art-family-weights.js';

function dim(value, reasons = []) {
  return Object.freeze({
    value: value === null || value === undefined ? null : quantize6(value),
    reasons: Object.freeze([...reasons]),
  });
}

/**
 * @param {object} args
 * @param {object} [args.feelReport]
 * @param {object} [args.perceptualEvidence]
 * @param {object} [args.equivalence]
 * @param {string} [args.artFamily]
 * @param {object} [args.weightOverrides]
 * @param {number} [args.familyNovelty] 0..1 optional
 */
export function evaluateRetinaVerdictEvidence(args = {}) {
  const feel = args.feelReport ?? {};
  const pe = args.perceptualEvidence ?? {};
  const eq = args.equivalence ?? null;
  const family = args.artFamily ?? 'default';
  const weights = resolveArtFamilyWeights(family, args.weightOverrides);
  const reasons = [];

  const structuralValidity = dim(
    feel.geometry?.score ?? feel.spatialAwareness ?? null,
    feel.geometry?.score == null && feel.spatialAwareness == null ? ['no-feel-geometry'] : [],
  );

  const intentFidelity = dim(
    pe.fidelity?.identityRetention ?? null,
    pe.fidelity?.identityRetention == null ? ['no-fidelity-identity'] : [],
  );

  const materialCoherence = dim(
    pe.fidelity?.axes?.semanticIdentityRetention?.value
      ?? feel.construction?.score
      ?? null,
    [],
  );

  const compositionCoherence = dim(
    pe.composition?.tests?.weightEquilibrium?.agreement
      ?? pe.composition?.tests?.directionalFlow?.measured
      ?? null,
    pe.composition ? [] : ['no-composition-evidence'],
  );

  const perceptualLegibility = dim(
    pe.features?.features?.luminanceHierarchy ?? feel.silhouette?.score ?? null,
    [],
  );

  const vixelIdentity = dim(
    pe.fidelity?.axes?.vectorPathRetention?.value
      ?? eq?.pairwise?.find((p) => p.b === 'pixi')?.drifts?.vixelIdentityRetention
      ?? null,
    pe.mode === 'spatial' && !eq ? ['spatial-no-vixel'] : [],
  );

  const rendererStability = dim(
    eq
      ? (eq.equivalenceClass === 'identical' ? 1
        : eq.equivalenceClass === 'backend-equivalent' ? 0.75
          : 0.25)
      : null,
    eq ? [] : ['no-equivalence-report'],
  );

  const noveltyWithinFamily = dim(
    args.familyNovelty ?? null,
    args.familyNovelty == null ? ['novelty-undeclared'] : [],
  );

  const dimensions = {
    structuralValidity,
    intentFidelity,
    materialCoherence,
    compositionCoherence,
    perceptualLegibility,
    vixelIdentity,
    rendererStability,
    noveltyWithinFamily,
  };

  // Weighted profile (evidence only — not a collapsed beauty score for decisions)
  let wSum = 0; let acc = 0; let n = 0;
  for (const [k, d] of Object.entries(dimensions)) {
    if (typeof d.value !== 'number') continue;
    const w = weights[k] ?? 1;
    acc += d.value * w;
    wSum += w;
    n++;
  }
  const weightedMean = n ? quantize6(acc / wSum) : null;
  if (weightedMean !== null) {
    reasons.push('weightedMean-is-diagnostic-only-not-a-verdict-scalar');
  }

  const packet = {
    schema: VERDICT_EVIDENCE_SCHEMA,
    artFamily: family,
    weights,
    dimensions,
    weightedMeanDiagnostic: weightedMean,
    reasons: Object.freeze(reasons),
    verdictEvidenceHash: '',
  };
  packet.verdictEvidenceHash = contentHash({
    artFamily: family,
    dimensions,
    weights,
  });

  // Guard: must not look like finalScore
  const frozen = deepFreeze(packet);
  if ('finalScore' in frozen) {
    throw new Error('VERDICT_EVIDENCE_SCALAR_FORBIDDEN');
  }
  return frozen;
}

/**
 * Attach verdict evidence without mutating Feel fields.
 */
export function attachRetinaVerdictEvidence(report, evidence) {
  const next = {
    ...report,
    retinaVerdictEvidence: evidence,
  };
  if ('spatialAwareness' in report) next.spatialAwareness = report.spatialAwareness;
  if ('verdict' in report) next.verdict = report.verdict;
  if ('feelHash' in report) next.feelHash = report.feelHash;
  return Object.freeze(next);
}
