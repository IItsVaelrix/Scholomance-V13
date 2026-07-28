/**
 * PHOTONIC VIXEL — Pixel + Vector Superposition in the QBIT Lattice
 *
 * A Vixel is a lattice cell that carries dual-medium identity simultaneously:
 *
 *   PIXEL IDENTITY  — color, material, emphasis   (what it looks like)
 *   VECTOR IDENTITY — pathRef, parametricT,        (what it's part of)
 *                     normal, curvature
 *
 * The fusion boundary takes a PixelBrain packet (grid cells from the SCDL
 * compiler) and Wand vector paths (smooth curves from formula-to-coordinates)
 * and produces a Vixel field where each cell knows BOTH mediums at once.
 *
 * Neither medium is subordinate. They are in superposition within the same
 * cell — hence "QBIT." A vixel is simultaneously a pixel and a vector sample
 * until the renderer collapses it into whichever representation the context
 * demands.
 *
 * DETERMINISM: All computation is pure math on spatial coordinates.
 * No Math.random(), no Date.now(), no performance.now(), no external state.
 * Identical input → identical Vixel field → identical vixelHash.
 *
 * @bytecode PB-VIXEL-v1
 */

import { stableHash } from './retina-hash.js';

export const VIXEL_CONTRACT = 'PB-VIXEL-v1';

// ─── Spatial Index ────────────────────────────────────────────────────────────

/**
 * Build a deterministic grid-based spatial index over vector path points.
 * Divides the canvas into cells of `indexCellSize` and buckets points by cell.
 *
 * @param {Array<{pathRef: string, points: Array<{x: number, y: number, t?: number}>}>} vectorPaths
 * @param {number} width
 * @param {number} height
 * @param {number} indexCellSize
 * @returns {Map<string, Array<{x: number, y: number, t: number, pathRef: string, pathIndex: number, pointIndex: number}>>}
 */
function buildSpatialIndex(vectorPaths, width, height, indexCellSize) {
  const index = new Map();

  for (const path of vectorPaths) {
    const { pathRef, points } = path;
    for (let pi = 0; pi < points.length; pi++) {
      const pt = points[pi];
      const cx = Math.floor(pt.x / indexCellSize);
      const cy = Math.floor(pt.y / indexCellSize);
      const key = `${cx},${cy}`;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push({
        x: pt.x,
        y: pt.y,
        t: pt.t != null ? pt.t : pi / Math.max(1, points.length - 1),
        pathRef,
        pathIndex: vectorPaths.indexOf(path),
        pointIndex: pi,
      });
    }
  }

  return index;
}

/**
 * Find the nearest vector path point to a pixel cell, searching a bounded
 * radius around the cell's grid position. Deterministic: ties broken by
 * (pathIndex, pointIndex) ordering.
 *
 * @returns {{x: number, y: number, t: number, pathRef: string, pathIndex: number, pointIndex: number, dist: number}|null}
 */
function findNearestVectorPoint(px, py, spatialIndex, indexCellSize, searchRadius) {
  const cx = Math.floor(px / indexCellSize);
  const cy = Math.floor(py / indexCellSize);
  const r = Math.ceil(searchRadius / indexCellSize);

  let best = null;
  let bestDist = Infinity;

  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -r; dy <= r; dy++) {
      const key = `${cx + dx},${cy + dy}`;
      const bucket = spatialIndex.get(key);
      if (!bucket) continue;
      for (const pt of bucket) {
        const ddx = pt.x - px;
        const ddy = pt.y - py;
        const dist = ddx * ddx + ddy * ddy;
        if (dist < bestDist || (dist === bestDist && best &&
            (pt.pathIndex < best.pathIndex ||
             (pt.pathIndex === best.pathIndex && pt.pointIndex < best.pointIndex)))) {
          bestDist = dist;
          best = { ...pt, dist: Math.sqrt(dist) };
        }
      }
    }
  }

  return best;
}

// ─── Differential Geometry ────────────────────────────────────────────────────

/**
 * Compute tangent, normal, and curvature at a point on a vector path
 * using central differences.
 *
 * @param {Array<{x: number, y: number}>} points
 * @param {number} index
 * @returns {{tangent: [number, number], normal: [number, number], curvature: number}}
 */
function computeDifferentialGeometry(points, index) {
  const n = points.length;
  if (n < 2) return { tangent: [1, 0], normal: [0, -1], curvature: 0 };

  const prev = points[Math.max(0, index - 1)];
  const next = points[Math.min(n - 1, index + 1)];

  // Tangent: central difference
  let tx = next.x - prev.x;
  let ty = next.y - prev.y;
  const tLen = Math.sqrt(tx * tx + ty * ty);
  if (tLen < 1e-10) return { tangent: [1, 0], normal: [0, -1], curvature: 0 };
  tx /= tLen;
  ty /= tLen;

  // Normal: rotate tangent 90° CCW, oriented outward relative to path centroid
  let nx = -ty;
  let ny = tx;

  // Path centroid for outward normal orientation
  let cxSum = 0, cySum = 0;
  for (let i = 0; i < n; i++) { cxSum += points[i].x; cySum += points[i].y; }
  const pathCx = cxSum / n;
  const pathCy = cySum / n;

  const pt = points[Math.min(n - 1, Math.max(0, index))];
  const toPtX = pt.x - pathCx;
  const toPtY = pt.y - pathCy;
  if (nx * toPtX + ny * toPtY < 0) {
    nx = -nx;
    ny = -ny;
  }
  const normal = [nx, ny];

  // Curvature: rate of tangent change
  let curvature = 0;
  if (n >= 3 && index > 0 && index < n - 1) {
    const pp = points[index - 1];
    const pc = points[index];
    const pn = points[index + 1];

    // Tangent at prev
    let t1x = pc.x - pp.x;
    let t1y = pc.y - pp.y;
    const t1Len = Math.sqrt(t1x * t1x + t1y * t1y);
    if (t1Len > 1e-10) { t1x /= t1Len; t1y /= t1Len; }

    // Tangent at next
    let t2x = pn.x - pc.x;
    let t2y = pn.y - pc.y;
    const t2Len = Math.sqrt(t2x * t2x + t2y * t2y);
    if (t2Len > 1e-10) { t2x /= t2Len; t2y /= t2Len; }

    // Cross product magnitude / segment length
    const cross = t1x * t2y - t1y * t2x;
    const segLen = Math.sqrt(
      (pn.x - pp.x) * (pn.x - pp.x) + (pn.y - pp.y) * (pn.y - pp.y)
    );
    curvature = segLen > 1e-10 ? Math.abs(cross) / segLen : 0;
  }

  return {
    tangent: [Math.round(tx * 1000) / 1000, Math.round(ty * 1000) / 1000],
    normal: [Math.round(nx * 1000) / 1000, Math.round(ny * 1000) / 1000],
    curvature: Math.round(curvature * 10000) / 10000,
  };
}

// ─── Vixel Fusion ─────────────────────────────────────────────────────────────

/**
 * Validate inputs for Vixel fusion.
 * @returns {string[]} validation errors (empty = valid)
 */
function validateFusionInputs(packet, vectorPaths) {
  const errors = [];

  if (!packet || typeof packet !== 'object') {
    errors.push('packet must be an object');
    return errors;
  }

  const coords = packet.geometry?.coordinates || packet.coordinates;
  if (!Array.isArray(coords)) {
    errors.push('packet must have geometry.coordinates or coordinates array');
  }

  if (!Array.isArray(vectorPaths)) {
    errors.push('vectorPaths must be an array');
  } else {
    for (let i = 0; i < vectorPaths.length; i++) {
      const vp = vectorPaths[i];
      if (!vp || typeof vp !== 'object') {
        errors.push(`vectorPaths[${i}] must be an object`);
        continue;
      }
      if (typeof vp.pathRef !== 'string' || vp.pathRef.trim() === '') {
        errors.push(`vectorPaths[${i}].pathRef must be a non-empty string`);
      }
      if (!Array.isArray(vp.points) || vp.points.length === 0) {
        errors.push(`vectorPaths[${i}].points must be a non-empty array`);
      }
    }
  }

  return errors;
}

/**
 * Fuse a PixelBrain packet with Wand vector paths into a Vixel field.
 *
 * Each pixel cell is tagged with its nearest vector path point's provenance:
 * parametricT (where on the curve), normal (surface direction), and curvature
 * (how sharply the form bends). Cells with no nearby vector point get
 * `vector: null` — they are pure-pixel cells.
 *
 * @param {object} packet - PixelBrain packet (from SCDL compiler)
 * @param {Array<{pathRef: string, points: Array<{x: number, y: number, t?: number}>}>} vectorPaths
 * @param {object} [options]
 * @param {number} [options.indexCellSize=4] - spatial index grid cell size
 * @param {number} [options.searchRadius=12] - max distance to search for a vector point
 * @param {number} [options.width] - canvas width (inferred from packet if omitted)
 * @param {number} [options.height] - canvas height (inferred from packet if omitted)
 * @returns {object} frozen VixelField
 */
export function fuseVixelField(packet, vectorPaths, options = {}) {
  const {
    indexCellSize = 4,
    searchRadius = 12,
  } = options;

  const validationErrors = validateFusionInputs(packet, vectorPaths);
  if (validationErrors.length > 0) {
    return Object.freeze({
      contract: VIXEL_CONTRACT,
      ok: false,
      errors: Object.freeze(validationErrors),
      cells: Object.freeze([]),
      width: 0,
      height: 0,
      vectorPaths: Object.freeze([]),
      stats: null,
      vixelHash: stableHash({ errors: validationErrors }),
    });
  }

  const coords = packet.geometry?.coordinates || packet.coordinates || [];
  const canvas = packet.canvas || {};
  const width = options.width || canvas.width || 160;
  const height = options.height || canvas.height || 144;

  // Build spatial index over vector path points
  const spatialIndex = buildSpatialIndex(vectorPaths, width, height, indexCellSize);

  // Pre-compute differential geometry for all vector path points
  const pathGeometry = new Map();
  for (const path of vectorPaths) {
    const geom = path.points.map((_, i) =>
      computeDifferentialGeometry(path.points, i)
    );
    pathGeometry.set(path.pathRef, geom);
  }

  // Fuse each pixel cell with its nearest vector point
  const cells = [];
  let fusedCount = 0;
  let purePixelCount = 0;

  for (const coord of coords) {
    const px = coord.snappedX ?? coord.x ?? 0;
    const py = coord.snappedY ?? coord.y ?? 0;

    const nearest = findNearestVectorPoint(
      px, py, spatialIndex, indexCellSize, searchRadius
    );

    let vector = null;
    if (nearest && nearest.dist <= searchRadius) {
      const geom = pathGeometry.get(nearest.pathRef);
      const dg = geom ? geom[nearest.pointIndex] : { tangent: [1, 0], normal: [0, -1], curvature: 0 };

      vector = Object.freeze({
        pathRef: nearest.pathRef,
        parametricT: Math.round(nearest.t * 10000) / 10000,
        normal: Object.freeze(dg.normal),
        tangent: Object.freeze(dg.tangent),
        curvature: dg.curvature,
        distance: Math.round(nearest.dist * 100) / 100,
      });
      fusedCount++;
    } else {
      purePixelCount++;
    }

    cells.push(Object.freeze({
      x: px,
      y: py,
      pixel: Object.freeze({
        color: coord.color || '#000000',
        material: coord.material || null,
        emphasis: coord.emphasis ?? 1,
        partId: coord.partId || null,
        role: coord.role || null,
      }),
      vector,
    }));
  }

  const stats = Object.freeze({
    totalCells: cells.length,
    fusedCells: fusedCount,
    purePixelCells: purePixelCount,
    fusionRatio: cells.length > 0
      ? Math.round((fusedCount / cells.length) * 10000) / 10000
      : 0,
    vectorPathCount: vectorPaths.length,
    vectorPointCount: vectorPaths.reduce((sum, vp) => sum + vp.points.length, 0),
  });

  const vixelHash = stableHash({
    contract: VIXEL_CONTRACT,
    width,
    height,
    cells: cells.map(c => ({
      x: c.x, y: c.y,
      color: c.pixel.color,
      material: c.pixel.material,
      pathRef: c.vector?.pathRef ?? null,
      parametricT: c.vector?.parametricT ?? null,
    })),
  });

  return Object.freeze({
    contract: VIXEL_CONTRACT,
    ok: true,
    errors: Object.freeze([]),
    width,
    height,
    cells: Object.freeze(cells),
    vectorPaths: Object.freeze(vectorPaths.map(vp => Object.freeze({
      pathRef: vp.pathRef,
      pointCount: vp.points.length,
    }))),
    stats,
    vixelHash,
  });
}

// ─── Projection to SpatialField ───────────────────────────────────────────────

/**
 * Project a Vixel field to a SpatialField for the existing Feel module.
 * Drops vector refs — the Feel module evaluates spatial composition only.
 *
 * @param {object} vixelField
 * @returns {object} SpatialField compatible with evaluatePerceptualFeel()
 */
export function vixelToSpatialField(vixelField) {
  if (!vixelField?.ok) {
    return { cells: [], width: 1, height: 1 };
  }

  return {
    width: vixelField.width,
    height: vixelField.height,
    cells: vixelField.cells.map(c => ({
      x: c.x,
      y: c.y,
      color: c.pixel.color,
      emphasis: c.pixel.emphasis,
      occupied: true,
      semanticRole: c.pixel.role || c.pixel.partId || 'fill',
    })),
  };
}

// ─── Texture-Form Coherence AMP ───────────────────────────────────────────────

/**
 * Evaluate texture-form coherence: does the pixel grid's spatial arrangement
 * follow the vector curve's tangent, or is it grid-locked?
 *
 * For each fused cell, we measure the angle between the local "grain direction"
 * (the principal axis of same-material neighbors) and the curve's tangent.
 * A score of 1.0 means the grain flows along the form. A score of 0.0 means
 * the grain cuts perpendicular to it.
 *
 * This is the signal that tells you: "the wood grain on this curved table edge
 * is running the wrong way."
 *
 * @param {object} vixelField
 * @returns {object} frozen TextureFormReport
 */
export function evaluateTextureFormCoherence(vixelField) {
  if (!vixelField?.ok || vixelField.cells.length === 0) {
    return Object.freeze({
      contract: 'PB-VIXEL-TEXTURE-FORM-v1',
      ok: false,
      score: 0,
      diagnostics: Object.freeze(['No fused cells to evaluate']),
    });
  }

  // Build a lookup of cells by position for neighbor queries
  const cellMap = new Map();
  for (const cell of vixelField.cells) {
    cellMap.set(`${cell.x},${cell.y}`, cell);
  }

  const coherenceScores = [];
  const misalignedCells = [];

  for (const cell of vixelField.cells) {
    if (!cell.vector) continue; // pure-pixel cells have no form to follow

    const [tx, ty] = cell.vector.tangent;

    // Find same-material neighbors in a 3x3 neighborhood
    const neighbors = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const neighbor = cellMap.get(`${cell.x + dx},${cell.y + dy}`);
        if (neighbor && neighbor.pixel.material === cell.pixel.material) {
          neighbors.push({ dx, dy });
        }
      }
    }

    if (neighbors.length === 0) {
      // Isolated cell — no grain direction to evaluate
      coherenceScores.push(0.5);
      continue;
    }

    // Principal axis of neighbor distribution via 2x2 covariance PCA.
    // The principal eigenvector gives the direction of maximum spatial
    // extent of same-material cells — this IS the grain direction.
    let sumDx = 0, sumDy = 0;
    for (const n of neighbors) { sumDx += n.dx; sumDy += n.dy; }
    const meanDx = sumDx / neighbors.length;
    const meanDy = sumDy / neighbors.length;

    let covXX = 0, covYY = 0, covXY = 0;
    for (const n of neighbors) {
      const dx = n.dx - meanDx;
      const dy = n.dy - meanDy;
      covXX += dx * dx;
      covYY += dy * dy;
      covXY += dx * dy;
    }
    covXX /= neighbors.length;
    covYY /= neighbors.length;
    covXY /= neighbors.length;

    // Principal eigenvector of [[covXX, covXY], [covXY, covYY]]
    // via the analytic 2x2 formula.
    let gx, gy;
    if (Math.abs(covXY) < 1e-10) {
      // Diagonal matrix — principal axis is the larger variance axis
      if (covXX >= covYY) { gx = 1; gy = 0; }
      else { gx = 0; gy = 1; }
    } else {
      const trace = covXX + covYY;
      const det = covXX * covYY - covXY * covXY;
      const disc = Math.sqrt(Math.max(0, trace * trace / 4 - det));
      const lambda1 = trace / 2 + disc;
      // Eigenvector for lambda1: (covXY, lambda1 - covXX)
      gx = covXY;
      gy = lambda1 - covXX;
    }

    const grainLen = Math.sqrt(gx * gx + gy * gy);
    if (grainLen < 1e-10) {
      coherenceScores.push(0.5);
      continue;
    }
    gx /= grainLen;
    gy /= grainLen;

    // Coherence: |dot(grain, tangent)| — 1 = aligned, 0 = perpendicular
    const dot = Math.abs(gx * tx + gy * ty);
    const score = Math.round(dot * 10000) / 10000;
    coherenceScores.push(score);

    if (score < 0.4) {
      misalignedCells.push({
        x: cell.x,
        y: cell.y,
        pathRef: cell.vector.pathRef,
        grainAngle: Math.round(Math.atan2(gy, gx) * 180 / Math.PI),
        tangentAngle: Math.round(Math.atan2(ty, tx) * 180 / Math.PI),
        score,
      });
    }
  }

  const avgScore = coherenceScores.length > 0
    ? coherenceScores.reduce((a, b) => a + b, 0) / coherenceScores.length
    : 0;

  const diagnostics = [];
  diagnostics.push(`TEXTURE_FORM_COHERENCE ${Math.round(avgScore * 1000) / 1000}`);
  diagnostics.push(`FUSED_CELLS_EVALUATED ${coherenceScores.length}`);
  diagnostics.push(`MISALIGNED_CELLS ${misalignedCells.length}`);

  if (misalignedCells.length > 0) {
    const worst = misalignedCells.slice(0, 5);
    for (const m of worst) {
      diagnostics.push(
        `MISALIGNED (${m.x},${m.y}) on ${m.pathRef}: grain ${m.grainAngle}° vs tangent ${m.tangentAngle}° (score ${m.score})`
      );
    }
  }

  return Object.freeze({
    contract: 'PB-VIXEL-TEXTURE-FORM-v1',
    ok: true,
    score: Math.round(avgScore * 10000) / 10000,
    fusedCellsEvaluated: coherenceScores.length,
    misalignedCells: Object.freeze(misalignedCells.slice(0, 20)),
    diagnostics: Object.freeze(diagnostics),
  });
}

// ─── Silhouette Smoothness AMP ────────────────────────────────────────────────

/**
 * Evaluate how smoothly the pixel boundary follows the vector curve.
 * A high score means the pixel silhouette hugs the vector path.
 * A low score means the staircase is visible — the grid fights the curve.
 *
 * @param {object} vixelField
 * @returns {object} frozen SilhouetteSmoothnessReport
 */
export function evaluateSilhouetteSmoothness(vixelField) {
  if (!vixelField?.ok || vixelField.cells.length === 0) {
    return Object.freeze({
      contract: 'PB-VIXEL-SILHOUETTE-v1',
      ok: false,
      score: 0,
      diagnostics: Object.freeze(['No cells to evaluate']),
    });
  }

  // For each fused cell, measure how far it sits from the vector path.
  // Close = smooth silhouette. Far = staircase visible.
  const distances = [];
  for (const cell of vixelField.cells) {
    if (!cell.vector) continue;
    distances.push(cell.vector.distance);
  }

  if (distances.length === 0) {
    return Object.freeze({
      contract: 'PB-VIXEL-SILHOUETTE-v1',
      ok: true,
      score: 0.5,
      diagnostics: Object.freeze(['No fused cells — cannot evaluate silhouette smoothness']),
    });
  }

  const avgDist = distances.reduce((a, b) => a + b, 0) / distances.length;
  const maxDist = Math.max(...distances);

  // Score: 1.0 when avgDist ≈ 0 (pixels hug the curve),
  // decays toward 0 as avgDist grows.
  // Normalized by searchRadius (default 12) — at avgDist = 6, score ≈ 0.5.
  const score = Math.max(0, Math.min(1, 1 - (avgDist / 12)));

  return Object.freeze({
    contract: 'PB-VIXEL-SILHOUETTE-v1',
    ok: true,
    score: Math.round(score * 10000) / 10000,
    avgDistance: Math.round(avgDist * 100) / 100,
    maxDistance: Math.round(maxDist * 100) / 100,
    fusedCellCount: distances.length,
    diagnostics: Object.freeze([
      `SILHOUETTE_SMOOTHNESS ${Math.round(score * 1000) / 1000}`,
      `AVG_DISTANCE ${Math.round(avgDist * 100) / 100}`,
      `MAX_DISTANCE ${Math.round(maxDist * 100) / 100}`,
    ]),
  });
}

// ─── Full Vixel Feel ──────────────────────────────────────────────────────────

/**
 * Full Vixel feel evaluation: combines the existing spatial Feel (geometry,
 * construction, silhouette AMPs) with the Vixel-specific AMPs (texture-form
 * coherence, silhouette smoothness).
 *
 * The aggregate `vixelAwareness` score blends all five channels.
 *
 * @param {object} vixelField
 * @param {object} [options]
 * @param {function} [options.evaluatePerceptualFeel] - injected Feel function (avoids circular import)
 * @returns {object} frozen VixelFeelReport
 */
export function evaluateVixelFeel(vixelField, options = {}) {
  const { evaluatePerceptualFeel } = options;

  if (!vixelField?.ok) {
    return Object.freeze({
      contract: 'PB-VIXEL-FEEL-v1',
      ok: false,
      errors: Object.freeze(vixelField?.errors || ['Invalid vixel field']),
      vixelAwareness: 0,
      verdict: 'Cannot evaluate feel on an invalid vixel field.',
      spatialFeel: null,
      textureForm: null,
      silhouetteSmoothness: null,
      suggestions: Object.freeze([]),
      vixelFeelHash: stableHash({ errors: vixelField?.errors || ['invalid'] }),
    });
  }

  // Run the Vixel-specific AMPs
  const textureForm = evaluateTextureFormCoherence(vixelField);
  const silhouetteSmoothness = evaluateSilhouetteSmoothness(vixelField);

  // Run the existing spatial Feel (if injected)
  let spatialFeel = null;
  if (typeof evaluatePerceptualFeel === 'function') {
    const spatialField = vixelToSpatialField(vixelField);
    spatialFeel = evaluatePerceptualFeel(spatialField);
  }

  // Aggregate: weighted blend of all channels
  const spatialScore = spatialFeel?.spatialAwareness ?? 0.5;
  const textureScore = textureForm.score;
  const silhouetteScore = silhouetteSmoothness.score;

  const vixelAwareness = Math.round(
    (spatialScore * 0.40 + textureScore * 0.30 + silhouetteScore * 0.30) * 10000
  ) / 10000;

  // Generate suggestions
  const suggestions = [];

  if (textureScore < 0.5) {
    suggestions.push(
      'TEXTURE-FORM: Material grain runs against the vector curve. ' +
      'Use `path` ops instead of `rect` ops so cells follow the form, ' +
      'or apply `symmetry` along the curve\'s tangent axis.'
    );
  }

  if (silhouetteScore < 0.5) {
    suggestions.push(
      'SILHOUETTE: Pixel boundary diverges from the vector path. ' +
      'Increase canvas resolution, use `circle`/`ellipse` ops for curved forms, ' +
      'or add `rim: 1` to soften the staircase.'
    );
  }

  if (spatialFeel?.suggestions) {
    suggestions.push(...spatialFeel.suggestions);
  }

  // Verdict
  let verdict;
  if (vixelAwareness > 0.8) {
    verdict = 'The vixel field breathes. Pixel and vector are in accord — texture follows form, silhouette is smooth.';
  } else if (vixelAwareness > 0.6) {
    verdict = 'The vixel field holds. The dual-medium fusion is coherent, with minor tensions at the grid boundary.';
  } else if (vixelAwareness > 0.4) {
    verdict = 'The vixel field wavers. The grid fights the curve in places. Refine the fusion boundary.';
  } else {
    verdict = 'The vixel field is fractured. Pixel and vector are in conflict — the mediums are not yet one.';
  }

  const vixelFeelHash = stableHash({
    contract: 'PB-VIXEL-FEEL-v1',
    vixelHash: vixelField.vixelHash,
    spatialScore,
    textureScore,
    silhouetteScore,
    vixelAwareness,
  });

  return Object.freeze({
    contract: 'PB-VIXEL-FEEL-v1',
    ok: true,
    errors: Object.freeze([]),
    vixelAwareness,
    verdict,
    spatialFeel,
    textureForm,
    silhouetteSmoothness,
    stats: vixelField.stats,
    suggestions: Object.freeze(suggestions),
    vixelFeelHash,
  });
}

// ─── Vixel Diff ───────────────────────────────────────────────────────────────

/**
 * Diff two Vixel feel reports. Returns which channels improved or regressed.
 *
 * @param {object} prevFeel - previous VixelFeelReport
 * @param {object} currFeel - current VixelFeelReport
 * @returns {object} frozen VixelFeelDelta
 */
export function diffVixelFeel(prevFeel, currFeel) {
  if (!prevFeel?.ok || !currFeel?.ok) {
    return Object.freeze({
      contract: 'PB-VIXEL-FEEL-DELTA-v1',
      ok: false,
      errors: Object.freeze(['Both feel reports must be ok']),
    });
  }

  const channels = {
    vixelAwareness: {
      prev: prevFeel.vixelAwareness,
      curr: currFeel.vixelAwareness,
      delta: Math.round((currFeel.vixelAwareness - prevFeel.vixelAwareness) * 10000) / 10000,
    },
    textureForm: {
      prev: prevFeel.textureForm?.score ?? 0,
      curr: currFeel.textureForm?.score ?? 0,
      delta: Math.round(((currFeel.textureForm?.score ?? 0) - (prevFeel.textureForm?.score ?? 0)) * 10000) / 10000,
    },
    silhouetteSmoothness: {
      prev: prevFeel.silhouetteSmoothness?.score ?? 0,
      curr: currFeel.silhouetteSmoothness?.score ?? 0,
      delta: Math.round(((currFeel.silhouetteSmoothness?.score ?? 0) - (prevFeel.silhouetteSmoothness?.score ?? 0)) * 10000) / 10000,
    },
    spatialAwareness: {
      prev: prevFeel.spatialFeel?.spatialAwareness ?? 0,
      curr: currFeel.spatialFeel?.spatialAwareness ?? 0,
      delta: Math.round(((currFeel.spatialFeel?.spatialAwareness ?? 0) - (prevFeel.spatialFeel?.spatialAwareness ?? 0)) * 10000) / 10000,
    },
  };

  const improved = Object.entries(channels)
    .filter(([, v]) => v.delta > 0.001)
    .map(([k]) => k);
  const regressed = Object.entries(channels)
    .filter(([, v]) => v.delta < -0.001)
    .map(([k]) => k);

  return Object.freeze({
    contract: 'PB-VIXEL-FEEL-DELTA-v1',
    ok: true,
    channels: Object.freeze(channels),
    improved: Object.freeze(improved),
    regressed: Object.freeze(regressed),
    netImprovement: Math.round(
      (channels.vixelAwareness.delta + channels.textureForm.delta + channels.silhouetteSmoothness.delta) * 10000
    ) / 10000,
  });
}
