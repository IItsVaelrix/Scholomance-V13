/**
 * CompositionGraph + CompositionEvidence
 */

import { COMPOSITION_SCHEMA, contentHash, deepFreeze, dualClaim, quantize6 } from './schema.js';
import { deltaE76 } from './preprocessing.js';

function bboxIoU(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const iw = Math.max(0, x2 - x1);
  const ih = Math.max(0, y2 - y1);
  const inter = iw * ih;
  const union = a.w * a.h + b.w * b.h - inter;
  return union <= 0 ? 0 : inter / union;
}

function regionsAdjacent(a, b) {
  const setB = new Set(b.cellIds);
  for (const id of a.cellIds) {
    const [xs, ys] = id.split(',');
    const x = Number(xs); const y = Number(ys);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (setB.has(`${x + dx},${y + dy}`)) return true;
    }
  }
  return false;
}

/**
 * @param {object} partition
 * @param {object} lattice
 * @param {object} [geneIntent]
 */
export function buildCompositionGraph(partition, lattice, geneIntent = {}) {
  const regions = partition.regions;
  const maxDim = Math.max(partition.width, partition.height);
  const alignTol = 0.05 * maxDim;
  const nodes = [
    Object.freeze({ id: 'scene', kind: 'scene' }),
    ...regions.map((r) => Object.freeze({ id: r.id, kind: 'region', regionId: r.id })),
  ];
  const edges = [];

  for (let i = 0; i < regions.length; i++) {
    edges.push(Object.freeze({ type: 'membership', from: 'scene', to: regions[i].id }));
    for (let j = i + 1; j < regions.length; j++) {
      const a = regions[i];
      const b = regions[j];
      if (regionsAdjacent(a, b)) {
        edges.push(Object.freeze({ type: 'adjacency', from: a.id, to: b.id }));
      }
      if (Math.abs(a.centroid.x - b.centroid.x) <= alignTol || Math.abs(a.centroid.y - b.centroid.y) <= alignTol) {
        edges.push(Object.freeze({ type: 'alignment', from: a.id, to: b.id }));
      }
      const iou = bboxIoU(a.bbox, b.bbox);
      if (iou > 0) {
        edges.push(Object.freeze({ type: 'overlap', from: a.id, to: b.id, value: quantize6(iou) }));
      }
      const contrast = Math.min(1, deltaE76(a.meanLab, b.meanLab) / 100);
      edges.push(Object.freeze({ type: 'contrast', from: a.id, to: b.id, value: quantize6(contrast) }));
      const sameRole = a.canonicalRole && a.canonicalRole === b.canonicalRole;
      edges.push(Object.freeze({
        type: 'similarity',
        from: a.id,
        to: b.id,
        value: quantize6(sameRole ? 0.8 : Math.max(0, 1 - contrast)),
      }));
      const depthA = meanZ(a, lattice);
      const depthB = meanZ(b, lattice);
      if (depthA === null || depthB === null) {
        edges.push(Object.freeze({ type: 'depth', from: a.id, to: b.id, availability: 'unavailable' }));
      } else {
        edges.push(Object.freeze({
          type: 'depth',
          from: a.id,
          to: b.id,
          value: quantize6(depthA - depthB),
        }));
      }
    }
  }

  return deepFreeze({
    nodes: Object.freeze(nodes),
    edges: Object.freeze(edges),
    graphHash: contentHash({ nodes, edges }),
    geneIntentDeclared: Boolean(geneIntent?.balanceMode || geneIntent?.intendedFocalCenter),
  });
}

function meanZ(region, lattice) {
  const set = new Set(region.cellIds);
  let sum = 0; let n = 0;
  for (const c of lattice.occupied) {
    if (!set.has(`${c.x},${c.y}`)) continue;
    if (c.z === undefined || c.z === null) continue;
    sum += c.z;
    n++;
  }
  return n === 0 ? null : sum / n;
}

/**
 * @param {object} graph
 * @param {object} weightField
 * @param {object} partition
 * @param {object} lattice
 * @param {object} [geneIntent]
 */
export function evaluateCompositionEvidence(graph, weightField, partition, lattice, geneIntent = {}) {
  const reasons = [];
  const maxDim = Math.max(partition.width, partition.height);
  const crowdR = 0.15 * maxDim;
  const regions = partition.regions;

  // focalIsolation
  let focalIsolation = null;
  const focus = pickFocusRegion(regions, weightField, geneIntent);
  if (focus) {
    const neighbors = regions.filter((r) => r.id !== focus.id);
    let minDist = Infinity;
    let maxContrast = 0;
    for (const n of neighbors) {
      const d = Math.hypot(focus.centroid.x - n.centroid.x, focus.centroid.y - n.centroid.y);
      minDist = Math.min(minDist, d);
      maxContrast = Math.max(maxContrast, deltaE76(focus.meanLab, n.meanLab) / 100);
    }
    const measured = quantize6(Math.min(1, (minDist / maxDim) * 0.5 + maxContrast * 0.5));
    const declared = geneIntent.intendedFocalCenter
      ? 1
      : undefined;
    focalIsolation = declared === undefined
      ? Object.freeze({ measured, intentDeclared: false })
      : dualClaim(declared, measured);
  } else {
    reasons.push('focalIsolation-no-focus');
  }

  // weightEquilibrium vs balanceMode
  const torque = weightField?.torque ?? { leftRight: 0, upperLower: 0 };
  const asymmetry = Math.hypot(torque.leftRight, torque.upperLower);
  const mode = geneIntent.balanceMode;
  let weightEquilibrium;
  if (!mode) {
    weightEquilibrium = Object.freeze({ measured: quantize6(1 - Math.min(1, asymmetry)), intentDeclared: false });
  } else if (mode === 'deliberately-imbalanced') {
    // High asymmetry agrees with intent
    const measured = quantize6(Math.min(1, asymmetry));
    weightEquilibrium = dualClaim(1, measured);
  } else if (mode === 'symmetric' || mode === 'radial') {
    const measured = quantize6(1 - Math.min(1, asymmetry));
    weightEquilibrium = dualClaim(1, measured);
  } else if (mode === 'dynamic') {
    const measured = quantize6(Math.min(1, Math.abs(asymmetry - 0.35) < 0.35 ? 1 - Math.abs(asymmetry - 0.35) : 0.4));
    weightEquilibrium = dualClaim(0.5, measured);
  } else {
    reasons.push(`weightEquilibrium-unknown-mode:${mode}`);
    weightEquilibrium = Object.freeze({ measured: null, intentDeclared: true, reasons: ['unknown-balanceMode'] });
  }

  // directionalFlow — orientation consensus from edge orientations proxy via region centroid chain
  let directionalFlow = Object.freeze({ measured: 0 });
  if (regions.length >= 2) {
    const angles = [];
    for (let i = 0; i < regions.length - 1; i++) {
      angles.push(Math.atan2(
        regions[i + 1].centroid.y - regions[i].centroid.y,
        regions[i + 1].centroid.x - regions[i].centroid.x,
      ));
    }
    // circular variance proxy
    let sx = 0; let sy = 0;
    for (const a of angles) { sx += Math.cos(a); sy += Math.sin(a); }
    const R = Math.hypot(sx, sy) / angles.length;
    directionalFlow = Object.freeze({ measured: quantize6(R) });
  }

  // crowding
  const crowdingScores = regions.map((r) => {
    let n = 0;
    for (const o of regions) {
      if (o.id === r.id) continue;
      if (Math.hypot(r.centroid.x - o.centroid.x, r.centroid.y - o.centroid.y) <= crowdR) n++;
    }
    return n;
  });
  const crowding = Object.freeze({
    measured: quantize6(Math.min(1, (crowdingScores.reduce((s, v) => s + v, 0) / Math.max(1, regions.length)) / 4)),
  });

  // negativeSpace
  const occupied = lattice.occupiedCount;
  const total = partition.width * partition.height;
  const unocc = Math.max(0, total - occupied) / Math.max(1, total);
  const negSkew = weightField?.weightedVisualCenter
    ? Math.hypot(weightField.weightedVisualCenter.x - 0.5, weightField.weightedVisualCenter.y - 0.5)
    : 0;
  const negativeSpace = Object.freeze({
    measured: quantize6(unocc),
    distributionSkew: quantize6(negSkew),
  });

  const tests = {
    focalIsolation,
    weightEquilibrium,
    directionalFlow,
    crowding,
    negativeSpace,
  };

  return deepFreeze({
    schema: COMPOSITION_SCHEMA,
    tests,
    reasons: Object.freeze(reasons),
    compositionHash: contentHash(tests),
    intentDeclared: Boolean(mode || geneIntent.intendedFocalCenter),
  });
}

function pickFocusRegion(regions, weightField, geneIntent) {
  if (!regions.length) return null;
  if (geneIntent.intendedFocalCenter && weightField?.regionWeights) {
    const tx = geneIntent.intendedFocalCenter.x * (weightField.width - 1);
    const ty = geneIntent.intendedFocalCenter.y * (weightField.height - 1);
    let best = regions[0];
    let bestD = Infinity;
    for (const r of regions) {
      const d = Math.hypot(r.centroid.x - tx, r.centroid.y - ty);
      if (d < bestD) { bestD = d; best = r; }
    }
    return best;
  }
  // heaviest region
  if (weightField?.regionWeights?.length) {
    const top = [...weightField.regionWeights].sort((a, b) => b.weight - a.weight)[0];
    return regions.find((r) => r.id === top.regionId) ?? regions[0];
  }
  return regions[0];
}
