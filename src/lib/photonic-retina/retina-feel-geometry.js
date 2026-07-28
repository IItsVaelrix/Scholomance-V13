/**
 * PHOTONIC FEEL — Geometry AMP
 *
 * The painter's sense of WEIGHT and PLACEMENT.
 *
 * A painter doesn't measure center-of-mass — they FEEL when a composition
 * leans, when the eye has nowhere to land, when proportions fight. This AMP
 * codifies that spatial intuition into deterministic scores.
 *
 * Operates on a SpatialField (raw coordinates, pre-quantization).
 * Pure function. No randomness. Frozen output.
 *
 * @bytecode PB-FEEL-GEOMETRY-AMP-v1
 */

import { stableHash } from './retina-hash.js';

const GOLDEN_RATIO = 1.6180339887;
const GOLDEN_CONJUGATE = 0.6180339887;

// Rule-of-thirds power points (normalized 0-1)
const THIRDS_POINTS = Object.freeze([
  { x: 1 / 3, y: 1 / 3 },
  { x: 2 / 3, y: 1 / 3 },
  { x: 1 / 3, y: 2 / 3 },
  { x: 2 / 3, y: 2 / 3 },
]);

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function distance(ax, ay, bx, by) {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

/**
 * Extract occupied cells with normalized positions.
 * @param {object} field - { cells: [{x,y,color,emphasis,occupied}], width, height }
 * @returns {Array<{nx, ny, weight}>} normalized positions + visual weight
 */
function extractWeightedPoints(field) {
  const { cells, width, height } = field;
  const points = [];
  for (const cell of cells) {
    if (cell.occupied === false) continue;
    const emphasis = cell.emphasis === undefined ? 1 : cell.emphasis;
    points.push({
      nx: width > 0 ? cell.x / width : 0,
      ny: height > 0 ? cell.y / height : 0,
      weight: Math.max(0.01, emphasis),
    });
  }
  return points;
}

/**
 * BALANCE — Does visual weight distribute evenly, or does the scene lean?
 * A painter feels when the left side is "heavier" — this measures that pull.
 */
function scoreBalance(points) {
  if (points.length === 0) return { score: 0, note: 'empty field — no weight to balance' };

  let sumX = 0, sumY = 0, totalWeight = 0;
  for (const p of points) {
    sumX += p.nx * p.weight;
    sumY += p.ny * p.weight;
    totalWeight += p.weight;
  }

  const comX = sumX / totalWeight; // center of mass X (0-1)
  const comY = sumY / totalWeight;

  // Perfect balance = COM at (0.5, 0.5). Deviation = imbalance.
  const deviationX = Math.abs(comX - 0.5) * 2; // 0 = centered, 1 = edge
  const deviationY = Math.abs(comY - 0.5) * 2;

  // Slight asymmetry is GOOD (static symmetry is dead). Penalize extremes steeply.
  // A comX of 0.16 (extreme left) should score well below 0.5.
  const horizontalPull = deviationX > 0.15 ? (deviationX - 0.15) / 0.85 : 0;
  const verticalPull = deviationY > 0.25 ? (deviationY - 0.25) / 0.75 : 0;

  const score = clamp01(1 - (horizontalPull * 0.85 + verticalPull * 0.6));

  let note;
  if (score > 0.8) note = 'weight settles naturally — the eye rests';
  else if (comX < 0.4) note = 'the scene pools leftward, as if gravity pulls the shadows that way';
  else if (comX > 0.6) note = 'weight gathers on the right — the left breathes empty';
  else if (comY < 0.35) note = 'the composition floats upward, untethered from ground';
  else note = 'bottom-heavy — the scene sinks like stone in water';

  return { score, note, comX, comY };
}

/**
 * FOCAL POINT — Does the eye land somewhere, or wander lost?
 * A painter knows: one point of maximum tension. Everything else serves it.
 */
function scoreFocalPoint(points, width, height) {
  if (points.length < 3) return { score: 0.2, note: 'too few elements to create a focal pull' };

  // Find the point of maximum local contrast (isolation × weight)
  let maxSalience = 0;
  let focalPoint = null;

  for (const p of points) {
    // Isolation: average distance to nearest neighbors
    let nearestSum = 0;
    let nearestCount = 0;
    for (const q of points) {
      if (p === q) continue;
      const d = distance(p.nx, p.ny, q.nx, q.ny);
      if (d < 0.3) { nearestSum += d; nearestCount += 1; }
    }
    const isolation = nearestCount > 0 ? 1 - (nearestSum / nearestCount / 0.3) : 1;
    const salience = isolation * p.weight;

    if (salience > maxSalience) {
      maxSalience = salience;
      focalPoint = p;
    }
  }

  if (!focalPoint) return { score: 0.3, note: 'no dominant focal point emerges' };

  // How close is the focal point to a rule-of-thirds power point?
  let minThirdsDist = Infinity;
  for (const tp of THIRDS_POINTS) {
    const d = distance(focalPoint.nx, focalPoint.ny, tp.x, tp.y);
    if (d < minThirdsDist) minThirdsDist = d;
  }

  // Golden ratio proximity bonus
  const goldenX = Math.abs(focalPoint.nx - GOLDEN_CONJUGATE);
  const goldenY = Math.abs(focalPoint.ny - GOLDEN_CONJUGATE);
  const goldenProximity = 1 - clamp01(Math.min(goldenX, goldenY) * 3);

  const thirdsAlignment = clamp01(1 - minThirdsDist * 2.5);
  const score = clamp01(thirdsAlignment * 0.6 + goldenProximity * 0.2 + maxSalience * 0.2);

  let note;
  if (score > 0.7) note = 'the eye catches and holds — a clear point of tension';
  else if (score > 0.4) note = 'a weak focal pull — the eye drifts without anchoring';
  else note = 'no resting place — the gaze scatters like light through broken glass';

  return { score, note, focalX: focalPoint.nx, focalY: focalPoint.ny };
}

/**
 * PROPORTION — Do the spatial relationships feel natural or forced?
 * Golden ratio and simple ratios (2:3, 3:5) feel right. Arbitrary ratios feel wrong.
 */
function scoreProportion(points, width, height) {
  if (points.length < 2) return { score: 0.5, note: 'insufficient elements to judge proportion' };

  // Measure the bounding box of content vs frame
  let minX = 1, maxX = 0, minY = 1, maxY = 0;
  for (const p of points) {
    if (p.nx < minX) minX = p.nx;
    if (p.nx > maxX) maxX = p.nx;
    if (p.ny < minY) minY = p.ny;
    if (p.ny > maxY) maxY = p.ny;
  }

  const contentW = maxX - minX;
  const contentH = maxY - minY;
  if (contentW < 0.01 || contentH < 0.01) return { score: 0.3, note: 'content is degenerate — a line, not a form' };

  const aspectRatio = contentW / contentH;

  // How close to golden ratio (or its inverse)?
  const goldenDist = Math.min(
    Math.abs(aspectRatio - GOLDEN_RATIO),
    Math.abs(aspectRatio - 1 / GOLDEN_RATIO),
    Math.abs(aspectRatio - 1), // square is also valid
  );

  // How close to simple integer ratios (2:3, 3:4, 4:5)?
  const simpleRatios = [2 / 3, 3 / 4, 4 / 5, 3 / 2, 4 / 3, 5 / 4];
  let minSimpleDist = Infinity;
  for (const r of simpleRatios) {
    const d = Math.abs(aspectRatio - r);
    if (d < minSimpleDist) minSimpleDist = d;
  }

  const ratioScore = clamp01(1 - Math.min(goldenDist, minSimpleDist) * 2);

  // Margin balance: is content centered with even margins, or crammed to an edge?
  const marginL = minX;
  const marginR = 1 - maxX;
  const marginT = minY;
  const marginB = 1 - maxY;
  const marginEvenness = 1 - clamp01(
    (Math.abs(marginL - marginR) + Math.abs(marginT - marginB)) / 2
  );

  const score = clamp01(ratioScore * 0.6 + marginEvenness * 0.4);

  let note;
  if (score > 0.7) note = 'proportions breathe naturally — the frame holds the form without squeezing';
  else if (aspectRatio > 2) note = 'stretched wide — the form strains against the frame';
  else if (aspectRatio < 0.5) note = 'tall and narrow — the composition towers, unstable';
  else note = 'proportions feel arbitrary — no natural ratio guides the eye';

  return { score, note, aspectRatio };
}

/**
 * SPATIAL TENSION — Is there dynamic energy, or is the composition dead-flat?
 * A painter knows: perfect symmetry is a corpse. Slight tension is life.
 */
function scoreTension(points) {
  if (points.length < 4) return { score: 0.4, note: 'too few elements to generate spatial tension' };

  // Measure quadrant weight distribution
  const quadrants = [0, 0, 0, 0]; // TL, TR, BL, BR
  let totalWeight = 0;
  for (const p of points) {
    const qi = (p.ny < 0.5 ? 0 : 2) + (p.nx < 0.5 ? 0 : 1);
    quadrants[qi] += p.weight;
    totalWeight += p.weight;
  }

  if (totalWeight === 0) return { score: 0, note: 'no weight present' };

  const normalized = quadrants.map(q => q / totalWeight);

  // Perfect evenness = 0.25 each. Measure deviation.
  const deviation = normalized.reduce((sum, q) => sum + Math.abs(q - 0.25), 0) / 2;

  // Ideal tension: NOT zero (dead symmetry) and NOT extreme (chaos).
  // Sweet spot around 0.1-0.25 deviation.
  const tensionScore = deviation < 0.05
    ? 0.4 + deviation * 8 // too even → boring, but not terrible
    : deviation < 0.25
      ? 0.8 + (0.25 - Math.abs(deviation - 0.15)) * 0.8 // sweet spot
      : clamp01(1 - (deviation - 0.25) * 2); // too uneven → chaotic

  const score = clamp01(tensionScore);

  let note;
  if (score > 0.75) note = 'alive with quiet tension — the eye moves through the space';
  else if (deviation < 0.05) note = 'static — perfect symmetry, no breath, no life';
  else note = 'unbalanced — the tension overwhelms rather than guides';

  return { score, note, quadrants: normalized };
}

/**
 * Main Geometry AMP entry point.
 * @param {object} field - SpatialField { cells, width, height }
 * @returns {object} frozen geometry feel report
 */
export function runGeometryFeelAMP(field) {
  const points = extractWeightedPoints(field);
  const { width, height } = field;

  const balance = scoreBalance(points);
  const focal = scoreFocalPoint(points, width, height);
  const proportion = scoreProportion(points, width, height);
  const tension = scoreTension(points);

  const aggregate = clamp01(
    balance.score * 0.3 +
    focal.score * 0.3 +
    proportion.score * 0.2 +
    tension.score * 0.2
  );

  const diagnostics = [
    `GEOMETRY_BALANCE ${balance.score.toFixed(3)} — ${balance.note}`,
    `GEOMETRY_FOCAL ${focal.score.toFixed(3)} — ${focal.note}`,
    `GEOMETRY_PROPORTION ${proportion.score.toFixed(3)} — ${proportion.note}`,
    `GEOMETRY_TENSION ${tension.score.toFixed(3)} — ${tension.note}`,
  ];

  return Object.freeze({
    amp: 'feel.geometry',
    contract: 'PB-FEEL-GEOMETRY-AMP-v1',
    aggregate,
    balance: Object.freeze(balance),
    focalPoint: Object.freeze(focal),
    proportion: Object.freeze(proportion),
    tension: Object.freeze(tension),
    diagnostics: Object.freeze(diagnostics),
    feelHash: stableHash({ balance, focal, proportion, tension }),
  });
}
