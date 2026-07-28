/**
 * PB-PHENOTYPE-FIDELITY-v1 — non-scalar evidence manifold
 */

import { FIDELITY_SCHEMA, quantize6, deepFreeze, contentHash } from './schema.js';

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 1 : inter / union;
}

function maskFromCellIds(cellIds) {
  return new Set(cellIds);
}

function iouSets(a, b) {
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 1 : inter / union;
}

function topologyRetention(declaredEdges, measuredEdges) {
  if (!declaredEdges || !measuredEdges) return null;
  const d = new Set(declaredEdges.map((e) => (e < e.split?.() ? e : [e[0], e[1]].sort().join('|'))));
  // normalize
  const norm = (edges) => new Set(
    edges.map((e) => {
      if (typeof e === 'string') return e;
      const a = e.from ?? e[0];
      const b = e.to ?? e[1];
      return [a, b].sort().join('|');
    }),
  );
  return jaccard([...norm(declaredEdges)], [...norm(measuredEdges)]);
}

/**
 * @param {object} args
 */
export function evaluatePhenotypeFidelity(args = {}) {
  const {
    mode = 'spatial',
    partition,
    features,
    composition,
    geneIntent = {},
    weightField = null,
    declaredParts = null,
    declaredSilhouette = null,
    declaredTopology = null,
    declaredWandRoles = null,
    declaredHierarchy = null,
    baseline = null,
  } = args;

  const reasons = [];
  const axes = {};

  // semantic identity
  const measuredParts = (partition?.regions ?? [])
    .map((r) => `${r.partId ?? ''}|${r.canonicalRole ?? ''}`)
    .filter((s) => s !== '|');
  if (declaredParts) {
    const v = quantize6(jaccard(declaredParts, measuredParts));
    axes.semanticIdentityRetention = Object.freeze({
      declared: Object.freeze([...declaredParts].sort()),
      measured: Object.freeze([...measuredParts].sort()),
      agreement: v,
      value: v,
    });
  } else {
    reasons.push('semanticIdentity-undeclared');
    axes.semanticIdentityRetention = Object.freeze({ availability: 'unavailable', reason: 'undeclared' });
  }

  // silhouette
  const measuredSil = maskFromCellIds((partition?.regions ?? []).flatMap((r) => r.cellIds));
  if (declaredSilhouette) {
    const declaredSet = maskFromCellIds(declaredSilhouette);
    const v = quantize6(iouSets(declaredSet, measuredSil));
    axes.silhouetteRetention = Object.freeze({ agreement: v, value: v });
  } else {
    reasons.push('silhouette-undeclared');
    axes.silhouetteRetention = Object.freeze({ availability: 'unavailable', reason: 'undeclared' });
  }

  // part topology
  const measuredAdj = (partition?.regions ?? []).length
    ? (args.graph?.edges ?? []).filter((e) => e.type === 'adjacency').map((e) => [e.from, e.to])
    : [];
  if (declaredTopology) {
    const v = quantize6(topologyRetention(declaredTopology, measuredAdj));
    axes.partTopologyRetention = Object.freeze({ agreement: v, value: v });
  } else {
    reasons.push('partTopology-undeclared');
    axes.partTopologyRetention = Object.freeze({ availability: 'unavailable', reason: 'undeclared' });
  }

  // vector paths
  if (mode !== 'vixel') {
    axes.vectorPathRetention = Object.freeze({
      availability: 'unavailable',
      reason: 'spatial-mode',
    });
    reasons.push('vectorPathRetention-spatial-unavailable');
  } else if (!declaredWandRoles) {
    axes.vectorPathRetention = Object.freeze({ availability: 'unavailable', reason: 'undeclared' });
    reasons.push('vectorPath-undeclared');
  } else {
    const measuredRoles = new Set();
    for (const r of partition?.regions ?? []) {
      for (const p of r.pathRefs ?? []) measuredRoles.add(p);
    }
    const v = quantize6(jaccard(declaredWandRoles, [...measuredRoles]));
    axes.vectorPathRetention = Object.freeze({ agreement: v, value: v });
  }

  // H — hierarchicalIdentityRetention
  axes.hierarchicalIdentityRetention = measureHierarchicalIdentity({
    partition,
    weightField,
    geneIntent,
    declaredHierarchy,
    reasons,
  });

  // identityRetention = min of available numeric axis values only
  const identityValues = Object.values(axes)
    .map((a) => (a && typeof a.value === 'number' ? a.value : null))
    .filter((v) => v !== null);
  const identityRetention = identityValues.length
    ? quantize6(Math.min(...identityValues))
    : null;
  if (identityRetention === null) reasons.push('identityRetention-no-available-axes');

  // coherenceGain vs baseline
  let coherenceGain = null;
  if (!baseline) {
    reasons.push('no-baseline');
  } else {
    const curr = coherenceProxy(features, composition);
    const prev = coherenceProxy(baseline.features, baseline.composition);
    coherenceGain = quantize6(curr - prev);
  }

  let constrainedSuggestion = null;
  if (coherenceGain !== null && identityRetention !== null) {
    if (coherenceGain > 0 && identityRetention < 0.85) {
      constrainedSuggestion = 'coherence↑ but identity↓ — improvement may have altered organism identity';
    } else if (coherenceGain < 0 && identityRetention >= 0.85) {
      constrainedSuggestion = 'identity retained while coherence↓';
    } else if (coherenceGain > 0 && identityRetention >= 0.85) {
      constrainedSuggestion = 'coherence↑ with identity retained';
    }
  }

  const hier = axes.hierarchicalIdentityRetention;
  if (hier && typeof hier.value === 'number' && hier.value < 0.5) {
    constrainedSuggestion = (constrainedSuggestion ? `${constrainedSuggestion}; ` : '')
      + 'hierarchy migrated — nouns may survive while narrative authority moved';
  }

  // Explicit non-scalar manifold — never add finalScore
  const packet = {
    schema: FIDELITY_SCHEMA,
    coherenceGain,
    identityRetention,
    axes: Object.freeze(axes),
    constrainedSuggestion,
    reasons: Object.freeze(reasons),
    intentDeclared: Boolean(geneIntent?.balanceMode || geneIntent?.intendedFocalCenter || declaredHierarchy),
    fidelityHash: '',
  };
  packet.fidelityHash = contentHash({
    coherenceGain: packet.coherenceGain,
    identityRetention: packet.identityRetention,
    axes: packet.axes,
    constrainedSuggestion: packet.constrainedSuggestion,
  });

  const frozen = deepFreeze(packet);
  if ('finalScore' in frozen || 'finalScoreEvidence' in frozen) {
    throw new Error('PERCEPTUAL_EVIDENCE_SCALAR_FORBIDDEN: finalScore must not exist');
  }
  return frozen;
}

function tierFromRank(rank, n) {
  if (n <= 1) return 'primary';
  if (rank === 0) return 'primary';
  if (rank === 1) return 'secondary';
  if (rank === 2) return 'tertiary';
  return 'ambient';
}

function measureHierarchicalIdentity({ partition, weightField, geneIntent, declaredHierarchy, reasons }) {
  const regions = partition?.regions ?? [];
  if (!regions.length || !weightField?.regionWeights?.length) {
    reasons.push('hierarchicalIdentity-no-weight-field');
    return Object.freeze({ availability: 'unavailable', reason: 'no-weight-field' });
  }

  const ranked = [...weightField.regionWeights].sort((a, b) => b.weight - a.weight);
  const measuredTiers = {};
  ranked.forEach((rw, i) => {
    measuredTiers[rw.regionId] = tierFromRank(i, ranked.length);
  });

  // Declared hierarchy: explicit map, or infer from gene focal + role importance
  let declaredTiers = declaredHierarchy;
  if (!declaredTiers) {
    if (!geneIntent?.intendedFocalCenter && !geneIntent?.regionWeightPriors) {
      reasons.push('hierarchicalIdentity-undeclared');
      return Object.freeze({
        availability: 'degraded',
        reason: 'undeclared',
        measured: Object.freeze(measuredTiers),
        value: null,
      });
    }
    declaredTiers = {};
    // Heaviest prior / nearest to focal → primary
    const focus = geneIntent.intendedFocalCenter;
    if (focus) {
      let best = null; let bestD = Infinity;
      for (const r of regions) {
        const nx = r.centroid.x / Math.max(1, (weightField.width ?? 1) - 1);
        const ny = r.centroid.y / Math.max(1, (weightField.height ?? 1) - 1);
        const d = Math.hypot(nx - focus.x, ny - focus.y);
        if (d < bestD) { bestD = d; best = r.id; }
      }
      if (best) declaredTiers[best] = 'primary';
    }
    for (const r of regions) {
      if (declaredTiers[r.id]) continue;
      if (r.canonicalRole === 'focal' || r.canonicalRole === 'body') declaredTiers[r.id] = 'secondary';
      else if (r.canonicalRole === 'rim') declaredTiers[r.id] = 'tertiary';
      else declaredTiers[r.id] = 'ambient';
    }
  }

  const tierOrder = { primary: 0, secondary: 1, tertiary: 2, ambient: 3 };
  let agree = 0; let n = 0;
  for (const id of Object.keys(measuredTiers)) {
    if (declaredTiers[id] === undefined) continue;
    n++;
    const d = Math.abs((tierOrder[declaredTiers[id]] ?? 3) - (tierOrder[measuredTiers[id]] ?? 3));
    agree += 1 - d / 3;
  }
  const value = n ? quantize6(agree / n) : null;

  return Object.freeze({
    declared: Object.freeze({ ...declaredTiers }),
    measured: Object.freeze(measuredTiers),
    agreement: value,
    value,
  });
}

function coherenceProxy(features, composition) {
  if (!features?.features && !composition?.tests) return 0;
  const f = features?.features ?? {};
  const nums = [
    f.bilateralSymmetry,
    f.spatialComplexity,
    f.luminanceHierarchy,
    composition?.tests?.directionalFlow?.measured,
    composition?.tests?.negativeSpace?.measured,
  ].filter((v) => typeof v === 'number');
  if (!nums.length) return 0;
  return nums.reduce((s, v) => s + v, 0) / nums.length;
}
