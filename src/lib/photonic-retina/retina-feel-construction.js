/**
 * PHOTONIC FEEL — Construction Lines AMP
 *
 * The painter's sense of ARMATURE and STRUCTURE.
 *
 * Before a painter touches pigment, they feel the underlying skeleton —
 * the horizon line, the dominant diagonals, the structural grid that
 * everything hangs from. This AMP extracts and evaluates that invisible
 * scaffolding. A composition without construction lines is a pile of
 * shapes; with them, it's architecture.
 *
 * Operates on a SpatialField (raw coordinates, pre-quantization).
 * Pure function. No randomness. Frozen output.
 *
 * @bytecode PB-FEEL-CONSTRUCTION-AMP-v1
 */

import { stableHash } from './retina-hash.js';

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Extract occupied cells with normalized positions.
 */
function extractPoints(field) {
  const { cells, width, height } = field;
  const points = [];
  for (const cell of cells) {
    if (cell.occupied === false) continue;
    points.push({
      nx: width > 0 ? cell.x / width : 0,
      ny: height > 0 ? cell.y / height : 0,
      emphasis: cell.emphasis === undefined ? 1 : cell.emphasis,
      semanticRole: cell.semanticRole || null,
    });
  }
  return points;
}

/**
 * HORIZON SENSE — Where does the "ground" sit?
 * A painter feels the horizon in their bones. Too high = claustrophobic.
 * Too low = the sky swallows everything. The golden section (~0.618 from top)
 * is where the eye naturally rests.
 */
function scoreHorizon(points, height) {
  if (points.length === 0) return { score: 0, note: 'no ground to stand on' };

  // Find the densest horizontal band (the "ground line")
  const bandCount = 16;
  const bands = new Array(bandCount).fill(0);
  for (const p of points) {
    const band = Math.min(bandCount - 1, Math.floor(p.ny * bandCount));
    bands[band] += p.emphasis;
  }

  // Find the band with maximum density
  let maxBand = 0, maxDensity = 0;
  for (let i = 0; i < bandCount; i++) {
    if (bands[i] > maxDensity) { maxDensity = bands[i]; maxBand = i; }
  }

  const horizonY = (maxBand + 0.5) / bandCount; // normalized 0-1

  // Ideal horizon: around 0.6-0.7 from top (golden section feel)
  const idealHorizon = 0.618;
  const horizonDeviation = Math.abs(horizonY - idealHorizon);

  // Also check: is there clear separation above/below the horizon?
  const aboveWeight = points.filter(p => p.ny < horizonY).reduce((s, p) => s + p.emphasis, 0);
  const belowWeight = points.filter(p => p.ny >= horizonY).reduce((s, p) => s + p.emphasis, 0);
  const totalWeight = aboveWeight + belowWeight;
  const skyGroundRatio = totalWeight > 0 ? aboveWeight / totalWeight : 0.5;

  // A good composition has more sky than ground (or vice versa), not 50/50
  const ratioTension = Math.abs(skyGroundRatio - 0.5) * 2; // 0 = even, 1 = all one side
  const ratioScore = ratioTension > 0.15 ? clamp01(0.5 + ratioTension * 0.5) : 0.4;

  const placementScore = clamp01(1 - horizonDeviation * 2.5);
  const score = clamp01(placementScore * 0.6 + ratioScore * 0.4);

  let note;
  if (score > 0.7) note = 'the horizon sits where the eye expects — ground and sky in natural proportion';
  else if (horizonY < 0.3) note = 'the horizon presses high — the sky is a sliver, the ground overwhelms';
  else if (horizonY > 0.85) note = 'the horizon sinks low — everything is sky, the earth is a memory';
  else note = 'the horizon floats uncertainly — neither grounded nor soaring';

  return { score, note, horizonY, skyGroundRatio };
}

/**
 * DOMINANT AXES — What directions does the energy flow?
 * A painter feels whether a composition is horizontal (calm), vertical (aspiration),
 * or diagonal (dynamic tension). The dominant axis should be intentional.
 */
function scoreAxes(points) {
  if (points.length < 3) return { score: 0.3, note: 'too few points to establish directional energy' };

  // Compute principal axis via covariance (PCA-lite, deterministic)
  let sumX = 0, sumY = 0, sumXX = 0, sumYY = 0, sumXY = 0;
  const n = points.length;
  for (const p of points) {
    sumX += p.nx; sumY += p.ny;
    sumXX += p.nx * p.nx; sumYY += p.ny * p.ny;
    sumXY += p.nx * p.ny;
  }

  const meanX = sumX / n, meanY = sumY / n;
  const covXX = sumXX / n - meanX * meanX;
  const covYY = sumYY / n - meanY * meanY;
  const covXY = sumXY / n - meanX * meanY;

  // Eigenvalue decomposition of 2x2 covariance (closed form)
  const trace = covXX + covYY;
  const det = covXX * covYY - covXY * covXY;
  const discriminant = Math.sqrt(Math.max(0, trace * trace / 4 - det));
  const lambda1 = trace / 2 + discriminant;
  const lambda2 = trace / 2 - discriminant;

  // Directional clarity: how dominant is the primary axis?
  const totalVariance = lambda1 + lambda2;
  const directionalClarity = totalVariance > 0 ? lambda1 / totalVariance : 0.5;

  // Angle of principal axis
  const angle = Math.atan2(2 * covXY, covXX - covYY) / 2; // radians
  const angleDeg = (angle * 180 / Math.PI + 180) % 180;

  // Classify: horizontal (0±20°), vertical (90±20°), diagonal (45±20° or 135±20°)
  let axisType;
  if (angleDeg < 20 || angleDeg > 160) axisType = 'horizontal';
  else if (angleDeg > 70 && angleDeg < 110) axisType = 'vertical';
  else axisType = 'diagonal';

  // Score: high directional clarity is good (intentional axis)
  // But pure horizontal with no secondary energy is static
  const clarityScore = clamp01(directionalClarity * 1.5 - 0.2);

  // Bonus for diagonal energy (dynamic) vs pure horizontal (static)
  const dynamicBonus = axisType === 'diagonal' ? 0.1 : 0;

  const score = clamp01(clarityScore + dynamicBonus);

  let note;
  if (axisType === 'horizontal' && score > 0.6) note = 'the energy flows sideways — calm, grounded, panoramic';
  else if (axisType === 'vertical') note = 'the composition reaches upward — aspirational, towering';
  else if (axisType === 'diagonal') note = 'diagonal tension cuts through — the eye is pulled along a dynamic path';
  else note = 'directional energy is diffuse — no dominant axis commands the space';

  return { score, note, axisType, angleDeg, directionalClarity };
}

/**
 * STRUCTURAL ALIGNMENT — Do elements snap to an invisible grid?
 * A painter feels when things "line up" — when the top of the brazier
 * aligns with the horizon, when the lantern hangs on a golden vertical.
 * Misalignment creates unease; alignment creates order.
 */
function scoreAlignment(points, width, height) {
  if (points.length < 4) return { score: 0.4, note: 'too few elements to judge structural alignment' };

  // Check alignment to rule-of-thirds lines (vertical: 1/3, 2/3; horizontal: 1/3, 2/3)
  const gridLines = [1 / 3, 2 / 3];
  const tolerance = 0.04; // 4% of frame width

  let alignedCount = 0;
  for (const p of points) {
    const nearVertical = gridLines.some(g => Math.abs(p.nx - g) < tolerance);
    const nearHorizontal = gridLines.some(g => Math.abs(p.ny - g) < tolerance);
    if (nearVertical || nearHorizontal) alignedCount += 1;
  }

  const alignmentRatio = alignedCount / points.length;

  // Also check: do elements share coordinates with each other? (implicit grid)
  const xCoords = points.map(p => Math.round(p.nx * 32)); // quantize to 32-step grid
  const yCoords = points.map(p => Math.round(p.ny * 32));
  const xHistogram = {};
  const yHistogram = {};
  for (const x of xCoords) xHistogram[x] = (xHistogram[x] || 0) + 1;
  for (const y of yCoords) yHistogram[y] = (yHistogram[y] || 0) + 1;

  // How many elements share an x or y coordinate? (structural coherence)
  const maxXCoincidence = Math.max(...Object.values(xHistogram));
  const maxYCoincidence = Math.max(...Object.values(yHistogram));
  const coincidenceScore = clamp01(
    (maxXCoincidence + maxYCoincidence) / (points.length * 0.5)
  );

  const score = clamp01(alignmentRatio * 0.5 + coincidenceScore * 0.5);

  let note;
  if (score > 0.6) note = 'elements lock into an invisible armature — the structure is felt, not seen';
  else if (score > 0.3) note = 'partial alignment — some elements find the grid, others drift';
  else note = 'no structural logic — elements float without scaffolding, untethered';

  return { score, note, alignmentRatio, coincidenceScore };
}

/**
 * DIAGONAL ENERGY — Are there implied lines that create movement?
 * A painter knows: diagonals are arrows. They pull the eye. A composition
 * with no diagonals is a photograph; with them, it's a story.
 */
function scoreDiagonalEnergy(points) {
  if (points.length < 3) return { score: 0.3, note: 'insufficient elements for diagonal reading' };

  // Find pairs of high-emphasis points and measure their connecting angle
  const emphatic = points
    .filter(p => p.emphasis > 0.5)
    .sort((a, b) => b.emphasis - a.emphasis)
    .slice(0, Math.min(8, points.length));

  if (emphatic.length < 2) return { score: 0.3, note: 'no emphatic elements to form diagonal lines' };

  let diagonalCount = 0;
  let totalPairs = 0;
  for (let i = 0; i < emphatic.length; i++) {
    for (let j = i + 1; j < emphatic.length; j++) {
      const dx = Math.abs(emphatic[i].nx - emphatic[j].nx);
      const dy = Math.abs(emphatic[i].ny - emphatic[j].ny);
      totalPairs += 1;
      // Diagonal: both dx and dy are significant (not purely H or V)
      if (dx > 0.1 && dy > 0.1) diagonalCount += 1;
    }
  }

  const diagonalRatio = totalPairs > 0 ? diagonalCount / totalPairs : 0;
  const score = clamp01(diagonalRatio * 1.5);

  let note;
  if (score > 0.6) note = 'strong diagonal currents — the eye is pulled along implied lines of force';
  else if (score > 0.3) note = 'some diagonal energy, but the dominant movement is axial';
  else note = 'purely orthogonal — no diagonal tension, the composition is static';

  return { score, note, diagonalRatio };
}

/**
 * Main Construction Lines AMP entry point.
 * @param {object} field - SpatialField { cells, width, height }
 * @returns {object} frozen construction feel report
 */
export function runConstructionFeelAMP(field) {
  const points = extractPoints(field);
  const { width, height } = field;

  const horizon = scoreHorizon(points, height);
  const axes = scoreAxes(points);
  const alignment = scoreAlignment(points, width, height);
  const diagonals = scoreDiagonalEnergy(points);

  const aggregate = clamp01(
    horizon.score * 0.25 +
    axes.score * 0.3 +
    alignment.score * 0.25 +
    diagonals.score * 0.2
  );

  const diagnostics = [
    `CONSTRUCTION_HORIZON ${horizon.score.toFixed(3)} — ${horizon.note}`,
    `CONSTRUCTION_AXES ${axes.score.toFixed(3)} — ${axes.note}`,
    `CONSTRUCTION_ALIGNMENT ${alignment.score.toFixed(3)} — ${alignment.note}`,
    `CONSTRUCTION_DIAGONALS ${diagonals.score.toFixed(3)} — ${diagonals.note}`,
  ];

  return Object.freeze({
    amp: 'feel.construction',
    contract: 'PB-FEEL-CONSTRUCTION-AMP-v1',
    aggregate,
    horizon: Object.freeze(horizon),
    axes: Object.freeze(axes),
    alignment: Object.freeze(alignment),
    diagonals: Object.freeze(diagonals),
    diagnostics: Object.freeze(diagnostics),
    feelHash: stableHash({ horizon, axes, alignment, diagonals }),
  });
}
