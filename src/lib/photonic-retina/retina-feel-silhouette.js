/**
 * PHOTONIC FEEL — Silhouette AMP
 *
 * The painter's sense of SHAPE and READABILITY.
 *
 * Squint. If you can't read the composition as a shadow puppet, it fails.
 * A painter knows: the silhouette IS the design. Color is decoration;
 * shape is truth. This AMP evaluates whether the forms read clearly —
 * whether the negative space is shaped or random, whether the contour
 * sings or mumbles, whether the gesture flows or stutters.
 *
 * Operates on a SpatialField (raw coordinates, pre-quantization).
 * Pure function. No randomness. Frozen output.
 *
 * @bytecode PB-FEEL-SILHOUETTE-AMP-v1
 */

import { stableHash } from './retina-hash.js';

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * Build a binary occupancy grid from the spatial field.
 * @returns {{ grid: Uint8Array, cols: number, rows: number }}
 */
function buildOccupancyGrid(field) {
  const { cells, width, height } = field;
  // Use a resolution that captures shape without being pixel-exact
  const cols = Math.min(64, Math.max(8, Math.round(width)));
  const rows = Math.min(64, Math.max(8, Math.round(height)));
  const grid = new Uint8Array(cols * rows);

  for (const cell of cells) {
    if (cell.occupied === false) continue;
    const col = Math.min(cols - 1, Math.max(0, Math.round((cell.x / width) * (cols - 1))));
    const row = Math.min(rows - 1, Math.max(0, Math.round((cell.y / height) * (rows - 1))));
    grid[row * cols + col] = 1;
  }

  return { grid, cols, rows };
}

/**
 * CONTOUR CLARITY — Is the boundary between figure and ground sharp?
 * A painter feels when edges are crisp vs muddy. Count boundary cells
 * (occupied cells adjacent to empty) vs interior cells.
 */
function scoreContourClarity(grid, cols, rows) {
  let boundaryCells = 0;
  let interiorCells = 0;
  let totalOccupied = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!grid[r * cols + c]) continue;
      totalOccupied += 1;

      // Check 4-neighbors for boundary
      const neighbors = [
        r > 0 ? grid[(r - 1) * cols + c] : 0,
        r < rows - 1 ? grid[(r + 1) * cols + c] : 0,
        c > 0 ? grid[r * cols + c - 1] : 0,
        c < cols - 1 ? grid[r * cols + c + 1] : 0,
      ];

      const emptyNeighbors = neighbors.filter(n => !n).length;
      if (emptyNeighbors > 0) boundaryCells += 1;
      else interiorCells += 1;
    }
  }

  if (totalOccupied === 0) return { score: 0, note: 'no form to contour' };

  // Boundary ratio: too high = noisy/fragmented, too low = solid blob
  const boundaryRatio = boundaryCells / totalOccupied;

  // Ideal: 0.2-0.5 boundary ratio (clear edges but substantial interior)
  let score;
  if (boundaryRatio < 0.1) {
    score = 0.4; // solid blob — reads but has no edge detail
  } else if (boundaryRatio <= 0.5) {
    score = 0.7 + (0.5 - Math.abs(boundaryRatio - 0.3)) * 0.6;
  } else {
    score = clamp01(1 - (boundaryRatio - 0.5) * 1.5); // too fragmented
  }

  let note;
  if (score > 0.7) note = 'the contour reads clean — you could cut this shape from paper and know it';
  else if (boundaryRatio > 0.6) note = 'the edges dissolve into noise — the shape crumbles at its borders';
  else note = 'the silhouette is a solid mass — readable but without edge life';

  return { score: clamp01(score), note, boundaryRatio, totalOccupied };
}

/**
 * FIGURE-GROUND SEPARATION — Can you tell what's "thing" and what's "space"?
 * A painter knows: if the background and foreground have the same visual weight,
 * nothing reads. There must be a clear figure-ground relationship.
 */
function scoreFigureGround(field) {
  const { cells, width, height } = field;
  const occupied = cells.filter(c => c.occupied !== false);

  if (cells.length === 0) return { score: 0, note: 'no field to separate' };

  // Fill ratio against the TOTAL FRAME AREA, not the cells array.
  // The cells array only contains explicitly-placed elements; the frame
  // is width × height. A painter feels how much of the canvas is ink.
  const frameArea = width * height;
  const fillRatio = frameArea > 0 ? occupied.length / frameArea : 0;

  // Ideal fill: 0.2-0.6 (enough figure to read, enough ground to breathe)
  let fillScore;
  if (fillRatio < 0.05) fillScore = 0.2; // almost empty
  else if (fillRatio < 0.2) fillScore = 0.5 + fillRatio * 2;
  else if (fillRatio <= 0.6) fillScore = 0.9;
  else if (fillRatio <= 0.8) fillScore = 0.9 - (fillRatio - 0.6) * 2;
  else fillScore = clamp01(0.5 - (fillRatio - 0.8) * 2.5); // almost full = no ground

  // Contrast between figure emphasis and ground (empty = 0 emphasis)
  const avgEmphasis = occupied.length > 0
    ? occupied.reduce((s, c) => s + (c.emphasis === undefined ? 1 : c.emphasis), 0) / occupied.length
    : 0;

  const contrastScore = clamp01(avgEmphasis * 1.2);

  const score = clamp01(fillScore * 0.6 + contrastScore * 0.4);

  let note;
  if (score > 0.7) note = 'figure and ground are distinct — the subject emerges from the space';
  else if (fillRatio > 0.75) note = 'the figure swallows the ground — no space to breathe, no silence';
  else if (fillRatio < 0.1) note = 'the figure is a whisper in a void — present but barely felt';
  else note = 'figure and ground blur — the eye cannot separate subject from space';

  return { score, note, fillRatio, avgEmphasis };
}

/**
 * NEGATIVE SPACE QUALITY — Is the empty space shaped, or random?
 * A painter knows: the space BETWEEN things is as designed as the things.
 * Good negative space has shape, rhythm, intention. Bad negative space is
 * just "whatever's left over."
 */
function scoreNegativeSpace(grid, cols, rows) {
  // Find connected components of EMPTY space (flood fill)
  const visited = new Uint8Array(cols * rows);
  const emptyRegions = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (grid[idx] || visited[idx]) continue;

      // BFS flood fill
      const queue = [idx];
      visited[idx] = 1;
      let size = 0;
      let minR = r, maxR = r, minC = c, maxC = c;

      while (queue.length > 0) {
        const curr = queue.pop();
        size += 1;
        const cr = Math.floor(curr / cols);
        const cc = curr % cols;
        if (cr < minR) minR = cr;
        if (cr > maxR) maxR = cr;
        if (cc < minC) minC = cc;
        if (cc > maxC) maxC = cc;

        const neighbors = [];
        if (cr > 0) neighbors.push((cr - 1) * cols + cc);
        if (cr < rows - 1) neighbors.push((cr + 1) * cols + cc);
        if (cc > 0) neighbors.push(cr * cols + cc - 1);
        if (cc < cols - 1) neighbors.push(cr * cols + cc + 1);

        for (const n of neighbors) {
          if (!grid[n] && !visited[n]) {
            visited[n] = 1;
            queue.push(n);
          }
        }
      }

      emptyRegions.push({
        size,
        width: maxC - minC + 1,
        height: maxR - minR + 1,
      });
    }
  }

  if (emptyRegions.length === 0) return { score: 0.2, note: 'no negative space — the form fills everything' };

  // Quality metrics:
  // 1. Few large regions > many tiny fragments (shaped space > noise)
  const totalEmpty = emptyRegions.reduce((s, r) => s + r.size, 0);
  const largestRegion = Math.max(...emptyRegions.map(r => r.size));
  const dominanceRatio = totalEmpty > 0 ? largestRegion / totalEmpty : 0;

  // 2. Regions should have shape (not 1-pixel-wide slivers)
  const avgAspectRatio = emptyRegions
    .filter(r => r.size > 4)
    .reduce((s, r) => s + Math.min(r.width, r.height) / Math.max(r.width, r.height), 0)
    / Math.max(1, emptyRegions.filter(r => r.size > 4).length);

  // 3. Not too many regions (fragmented space = noisy)
  const fragmentationPenalty = clamp01((emptyRegions.length - 3) * 0.1);

  const dominanceScore = clamp01(dominanceRatio * 1.5);
  const shapeScore = clamp01(avgAspectRatio * 1.5);
  const score = clamp01(dominanceScore * 0.4 + shapeScore * 0.4 + (1 - fragmentationPenalty) * 0.2);

  let note;
  if (score > 0.7) note = 'the negative space has shape and intention — silence with form';
  else if (emptyRegions.length > 8) note = 'the empty space is shattered into fragments — visual noise, not rest';
  else note = 'negative space is amorphous — leftover, not designed';

  return { score, note, regionCount: emptyRegions.length, dominanceRatio };
}

/**
 * GESTURE — Does the overall form have a directional flow?
 * A painter feels the "gesture line" — the single sweeping curve that
 * the whole composition follows. A good gesture makes the eye travel;
 * a bad one makes it stutter.
 */
function scoreGesture(field) {
  const { cells, width, height } = field;
  const occupied = cells
    .filter(c => c.occupied !== false)
    .map(c => ({
      nx: width > 0 ? c.x / width : 0,
      ny: height > 0 ? c.y / height : 0,
      emphasis: c.emphasis === undefined ? 1 : c.emphasis,
    }))
    .sort((a, b) => b.emphasis - a.emphasis);

  if (occupied.length < 3) return { score: 0.3, note: 'too few elements to trace a gesture' };

  // Take the top-N most emphatic points and measure how "flowing" their path is
  const gesturePoints = occupied.slice(0, Math.min(12, occupied.length));

  // Measure angular consistency: do consecutive segments turn smoothly?
  let totalTurn = 0;
  let segments = 0;
  for (let i = 2; i < gesturePoints.length; i++) {
    const p0 = gesturePoints[i - 2];
    const p1 = gesturePoints[i - 1];
    const p2 = gesturePoints[i];

    const angle1 = Math.atan2(p1.ny - p0.ny, p1.nx - p0.nx);
    const angle2 = Math.atan2(p2.ny - p1.ny, p2.nx - p1.nx);
    let turn = Math.abs(angle2 - angle1);
    if (turn > Math.PI) turn = 2 * Math.PI - turn;

    totalTurn += turn;
    segments += 1;
  }

  if (segments === 0) return { score: 0.4, note: 'insufficient path length for gesture reading' };

  const avgTurn = totalTurn / segments;

  // Smooth gesture: avgTurn near 0 (straight) or near PI/4 (gentle curve)
  // Bad gesture: avgTurn near PI/2 (right angles) or PI (reversals)
  const smoothness = clamp01(1 - (avgTurn / (Math.PI * 0.75)));

  // Also: does the gesture span a meaningful portion of the frame?
  const xs = gesturePoints.map(p => p.nx);
  const ys = gesturePoints.map(p => p.ny);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  const spanScore = clamp01(Math.max(spanX, spanY) * 1.5);

  const score = clamp01(smoothness * 0.6 + spanScore * 0.4);

  let note;
  if (score > 0.7) note = 'a clear gesture sweeps through — the eye travels the form in one breath';
  else if (avgTurn > Math.PI / 2) note = 'the gesture stutters — sharp reversals break the flow';
  else note = 'the gesture is weak — the eye wanders without a guiding curve';

  return { score, note, avgTurn, spanScore };
}

/**
 * Main Silhouette AMP entry point.
 * @param {object} field - SpatialField { cells, width, height }
 * @returns {object} frozen silhouette feel report
 */
export function runSilhouetteFeelAMP(field) {
  const { grid, cols, rows } = buildOccupancyGrid(field);

  const contour = scoreContourClarity(grid, cols, rows);
  const figureGround = scoreFigureGround(field);
  const negativeSpace = scoreNegativeSpace(grid, cols, rows);
  const gesture = scoreGesture(field);

  const aggregate = clamp01(
    contour.score * 0.25 +
    figureGround.score * 0.3 +
    negativeSpace.score * 0.2 +
    gesture.score * 0.25
  );

  const diagnostics = [
    `SILHOUETTE_CONTOUR ${contour.score.toFixed(3)} — ${contour.note}`,
    `SILHOUETTE_FIGURE_GROUND ${figureGround.score.toFixed(3)} — ${figureGround.note}`,
    `SILHOUETTE_NEGATIVE_SPACE ${negativeSpace.score.toFixed(3)} — ${negativeSpace.note}`,
    `SILHOUETTE_GESTURE ${gesture.score.toFixed(3)} — ${gesture.note}`,
  ];

  return Object.freeze({
    amp: 'feel.silhouette',
    contract: 'PB-FEEL-SILHOUETTE-AMP-v1',
    aggregate,
    contour: Object.freeze(contour),
    figureGround: Object.freeze(figureGround),
    negativeSpace: Object.freeze(negativeSpace),
    gesture: Object.freeze(gesture),
    diagnostics: Object.freeze(diagnostics),
    feelHash: stableHash({ contour, figureGround, negativeSpace, gesture }),
  });
}
