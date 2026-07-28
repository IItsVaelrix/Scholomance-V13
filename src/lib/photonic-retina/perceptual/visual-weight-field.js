/**
 * VisualWeightField
 */

import { ROLE_IMPORTANCE, contentHash, deepFreeze, dualClaim, quantize6 } from './schema.js';
import { deltaE76 } from './preprocessing.js';

function minMaxNorm(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (!Number.isFinite(min) || !Number.isFinite(max) || max - min < 1e-12) {
    return values.map(() => 0.5);
  }
  return values.map((v) => (v - min) / (max - min));
}

/**
 * @param {object} partition
 * @param {object} lattice
 * @param {object} [geneIntent]
 */
export function buildVisualWeightField(partition, lattice, geneIntent = {}) {
  const regions = partition.regions;
  const reasons = [];
  const intentDeclared = Boolean(geneIntent.balanceMode || geneIntent.intendedFocalCenter || geneIntent.regionWeightPriors);

  if (!regions.length) {
    return deepFreeze({
      regionWeights: Object.freeze([]),
      weightedVisualCenter: null,
      distanceToIntendedFocal: null,
      torque: Object.freeze({ leftRight: 0, upperLower: 0 }),
      dynamicBalanceVector: Object.freeze({ x: 0, y: 0 }),
      dominantLineConvergence: null,
      intentDeclared,
      reasons: Object.freeze(['no-regions']),
      width: partition.width,
      height: partition.height,
      weightHash: contentHash({ empty: true }),
    });
  }

  const areas = regions.map((r) => r.area);
  const sceneMean = {
    L: lattice.occupied.reduce((s, c) => s + c.L, 0) / Math.max(1, lattice.occupiedCount),
    a: lattice.occupied.reduce((s, c) => s + c.a, 0) / Math.max(1, lattice.occupiedCount),
    b: lattice.occupied.reduce((s, c) => s + c.b, 0) / Math.max(1, lattice.occupiedCount),
  };

  const lumContrast = regions.map((r) => Math.abs(r.meanLab.L - sceneMean.L) / 100);
  const colorContrast = regions.map((r) => Math.min(1, deltaE76(r.meanLab, sceneMean) / 100));
  const edgeDensity = regions.map((r) => {
    // perimeter proxy
    return Math.min(1, (2 * (r.bbox.w + r.bbox.h)) / Math.max(1, r.area) / 4);
  });
  const semanticImportance = regions.map((r) => {
    const key = r.id;
    if (geneIntent.regionWeightPriors && geneIntent.regionWeightPriors[key] !== undefined) {
      return Number(geneIntent.regionWeightPriors[key]);
    }
    if (r.canonicalRole && ROLE_IMPORTANCE[r.canonicalRole] !== undefined) {
      return ROLE_IMPORTANCE[r.canonicalRole];
    }
    if (r.canonicalRole === 'focal' || r.partId?.includes('focal')) return 1;
    return 0.5;
  });
  const depthBand = regions.map((r) => {
    const set = new Set(r.cellIds);
    let sum = 0; let n = 0;
    for (const c of lattice.occupied) {
      if (!set.has(`${c.x},${c.y}`)) continue;
      sum += c.z ?? 0;
      n++;
    }
    return n ? sum / n : 0;
  });
  const isolation = regions.map((r) => {
    let minD = Infinity;
    for (const o of regions) {
      if (o.id === r.id) continue;
      minD = Math.min(minD, Math.hypot(r.centroid.x - o.centroid.x, r.centroid.y - o.centroid.y));
    }
    return Number.isFinite(minD) ? minD / Math.max(partition.width, partition.height) : 1;
  });
  const directionalConvergence = regions.map((r, i) => {
    // distance to intended focal or scene center
    const tx = geneIntent.intendedFocalCenter
      ? geneIntent.intendedFocalCenter.x * (partition.width - 1)
      : (partition.width - 1) / 2;
    const ty = geneIntent.intendedFocalCenter
      ? geneIntent.intendedFocalCenter.y * (partition.height - 1)
      : (partition.height - 1) / 2;
    const d = Math.hypot(r.centroid.x - tx, r.centroid.y - ty);
    return 1 - Math.min(1, d / Math.max(partition.width, partition.height));
  });

  const nAreas = minMaxNorm(areas);
  const nLum = minMaxNorm(lumContrast);
  const nCol = minMaxNorm(colorContrast);
  const nEdge = minMaxNorm(edgeDensity);
  const nSem = minMaxNorm(semanticImportance);
  const nDepth = minMaxNorm(depthBand);
  const nDir = minMaxNorm(directionalConvergence);
  const nIso = minMaxNorm(isolation);

  const regionWeights = regions.map((r, i) => {
    const base = (nAreas[i] + nLum[i] + nCol[i] + nEdge[i] + nSem[i] + nDepth[i] + nDir[i] + nIso[i]) / 8;
    const priorMul = geneIntent.regionWeightPriors?.[r.id] !== undefined
      ? Number(geneIntent.regionWeightPriors[r.id])
      : 1;
    return Object.freeze({
      regionId: r.id,
      weight: quantize6(base * priorMul),
      factors: Object.freeze({
        area: quantize6(nAreas[i]),
        luminanceContrast: quantize6(nLum[i]),
        colorContrast: quantize6(nCol[i]),
        edgeDensity: quantize6(nEdge[i]),
        semanticImportance: quantize6(nSem[i]),
        depthBand: quantize6(nDepth[i]),
        directionalConvergence: quantize6(nDir[i]),
        isolation: quantize6(nIso[i]),
      }),
    });
  });

  let wSum = 0; let wx = 0; let wy = 0;
  for (let i = 0; i < regions.length; i++) {
    const w = regionWeights[i].weight;
    wSum += w;
    wx += regions[i].centroid.x * w;
    wy += regions[i].centroid.y * w;
  }
  const weightedVisualCenter = Object.freeze({
    x: quantize6((wx / Math.max(1e-9, wSum)) / Math.max(1, partition.width - 1)),
    y: quantize6((wy / Math.max(1e-9, wSum)) / Math.max(1, partition.height - 1)),
  });

  let distanceToIntendedFocal = null;
  let focalAgreement = null;
  if (geneIntent.intendedFocalCenter) {
    const dx = weightedVisualCenter.x - geneIntent.intendedFocalCenter.x;
    const dy = weightedVisualCenter.y - geneIntent.intendedFocalCenter.y;
    distanceToIntendedFocal = quantize6(Math.hypot(dx, dy));
    focalAgreement = dualClaim(geneIntent.intendedFocalCenter, weightedVisualCenter);
  } else {
    reasons.push('intendedFocalCenter-undeclared');
  }

  // torque about canvas center
  const cx = 0.5; const cy = 0.5;
  let left = 0; let right = 0; let up = 0; let down = 0;
  for (let i = 0; i < regions.length; i++) {
    const w = regionWeights[i].weight;
    const x = regions[i].centroid.x / Math.max(1, partition.width - 1);
    const y = regions[i].centroid.y / Math.max(1, partition.height - 1);
    if (x < cx) left += w * (cx - x);
    else right += w * (x - cx);
    if (y < cy) up += w * (cy - y);
    else down += w * (y - cy);
  }
  const torque = Object.freeze({
    leftRight: quantize6((right - left) / Math.max(1e-9, left + right)),
    upperLower: quantize6((down - up) / Math.max(1e-9, up + down)),
  });

  const dynamicBalanceVector = Object.freeze({
    x: torque.leftRight,
    y: torque.upperLower,
  });

  // dominant line convergence: mean direction toward intended/scene center
  let dominantLineConvergence = quantize6(
    directionalConvergence.reduce((s, v) => s + v, 0) / regions.length,
  );

  return deepFreeze({
    regionWeights: Object.freeze(regionWeights),
    weightedVisualCenter,
    distanceToIntendedFocal,
    focalAgreement,
    torque,
    dynamicBalanceVector,
    dominantLineConvergence,
    intentDeclared,
    reasons: Object.freeze(reasons),
    width: partition.width,
    height: partition.height,
    weightHash: contentHash(regionWeights),
  });
}
