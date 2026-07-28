/**
 * Drift metrics between two vessel rasters.
 */

import { quantize6 } from './schema.js';
import { occupiedMask, silhouetteCellIds, meanSalienceCenter } from './specimen.js';

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 1 : inter / union;
}

function edgeMap(mask, w, h) {
  const edges = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      let boundary = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx; const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || !mask[ny * w + nx]) {
          boundary = true;
          break;
        }
      }
      if (boundary) edges.push(`${x},${y}`);
    }
  }
  return edges;
}

function paletteSignature(rgba, mask, w, h) {
  const counts = new Map();
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    const o = i * 4;
    const key = `${rgba[o]},${rgba[o + 1]},${rgba[o + 2]}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

function paletteDrift(a, b) {
  const A = new Map(paletteSignature(a.rgba, occupiedMask(a.rgba, a.width, a.height), a.width, a.height));
  const B = new Map(paletteSignature(b.rgba, occupiedMask(b.rgba, b.width, b.height), b.width, b.height));
  const keys = new Set([...A.keys(), ...B.keys()]);
  if (!keys.size) return 0;
  let diff = 0;
  let total = 0;
  for (const k of keys) {
    const va = A.get(k) || 0;
    const vb = B.get(k) || 0;
    diff += Math.abs(va - vb);
    total += Math.max(va, vb);
  }
  return total === 0 ? 0 : diff / (2 * total);
}

/**
 * Compare vessel B against reference vessel A (same dimensions preferred).
 */
export function measureDrifts(ref, other) {
  const w = Math.min(ref.width, other.width);
  const h = Math.min(ref.height, other.height);
  // downsample compare by sampling shared top-left region if scales differ
  const refMask = occupiedMask(ref.rgba, ref.width, ref.height);
  const othMask = occupiedMask(other.rgba, other.width, other.height);

  // rescale masks to common logical grid if dimensions differ by integer scale
  const scale = other.width / ref.width;
  let silA = silhouetteCellIds(refMask, ref.width, ref.height);
  let silB;
  if (Math.abs(scale - Math.round(scale)) < 1e-9 && scale >= 1) {
    const s = Math.round(scale);
    silB = silhouetteCellIds(othMask, other.width, other.height)
      .map((id) => {
        const [x, y] = id.split(',').map(Number);
        return `${Math.floor(x / s)},${Math.floor(y / s)}`;
      });
    silB = [...new Set(silB)];
  } else {
    silB = silhouetteCellIds(othMask, other.width, other.height);
  }

  const silhouetteDrift = quantize6(1 - jaccard(silA, silB));
  const edgeDisplacement = quantize6(
    1 - jaccard(edgeMap(refMask, ref.width, ref.height),
      (Math.round(scale) >= 1 && Number.isFinite(scale)
        ? [...new Set(edgeMap(othMask, other.width, other.height).map((id) => {
          const [x, y] = id.split(',').map(Number);
          const s = Math.max(1, Math.round(scale));
          return `${Math.floor(x / s)},${Math.floor(y / s)}`;
        }))]
        : edgeMap(othMask, other.width, other.height))),
  );

  const partsA = ref.partMap.filter(Boolean);
  const partsB = other.partMap.filter(Boolean);
  const partIdPreservation = quantize6(jaccard(partsA, partsB));

  const palDrift = quantize6(paletteDrift(ref, other));

  // curvature drift — mean abs diff on overlapping occupied cells
  let curvSum = 0; let curvN = 0;
  for (let y = 0; y < ref.height; y++) {
    for (let x = 0; x < ref.width; x++) {
      const i = y * ref.width + x;
      if (!refMask[i]) continue;
      const ox = Math.min(other.width - 1, Math.round(x * (other.width / ref.width)));
      const oy = Math.min(other.height - 1, Math.round(y * (other.height / ref.height)));
      const oi = oy * other.width + ox;
      curvSum += Math.abs((ref.curvMap[i] || 0) - (other.curvMap[oi] || 0));
      curvN++;
    }
  }
  const curvatureDrift = quantize6(curvN ? Math.min(1, curvSum / curvN) : 0);

  // topology: adjacency of part labels
  const topologyChange = quantize6(1 - partIdPreservation);

  const cA = meanSalienceCenter(ref.salMap, refMask, ref.width, ref.height);
  const cB = meanSalienceCenter(other.salMap, othMask, other.width, other.height);
  const focalWeightDrift = quantize6(Math.min(1, Math.hypot(cA.x - cB.x, cA.y - cB.y)));

  const vixelIdentityRetention = quantize6(
    (partIdPreservation + (1 - silhouetteDrift) + (1 - Math.min(1, palDrift))) / 3,
  );

  return {
    silhouetteDrift,
    edgeDisplacement,
    partIdPreservation,
    paletteDrift: palDrift,
    curvatureDrift,
    topologyChange,
    focalWeightDrift,
    vixelIdentityRetention,
  };
}

export function classifyEquivalence(pairwise) {
  if (!pairwise.length) return 'identical';
  let worst = 'identical';
  for (const p of pairwise) {
    const d = p.drifts;
    const maxDrift = Math.max(
      d.silhouetteDrift ?? 0,
      d.edgeDisplacement ?? 0,
      d.paletteDrift ?? 0,
      d.curvatureDrift ?? 0,
      d.focalWeightDrift ?? 0,
      d.topologyChange ?? 0,
    );
    const identity = d.vixelIdentityRetention ?? 0;
    if (maxDrift > 0.35 || identity < 0.5) worst = 'divergent';
    else if (maxDrift > 0.02 || identity < 0.98) {
      if (worst !== 'divergent') worst = 'backend-equivalent';
    }
  }
  return worst;
}
