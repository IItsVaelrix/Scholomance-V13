/**
 * Construction → Coordinates bridge.
 *
 * Converts solved construction parts (contours, spines, banks) into
 * flat {x, y, color, material} coordinate objects that the SCDL packet
 * pipeline can consume. This is the missing link between Island 2
 * (construction solver) and Island 1 (SCDL compiler).
 *
 * Rasterization:
 *   - closedContour → scanline-filled polygon
 *   - spine + leftBank + rightBank → ribbon fill between banks
 *   - namedPoints only → single cells (for point primitives)
 *
 * Pure function. Deterministic. No I/O.
 *
 * @bytecode PB-CONSTRUCTION-TO-COORDS-v1
 */

/**
 * Rasterize a closed contour into filled cells using even-odd scanline fill.
 * @param {number[][]} contour - Array of [x, y] points (closed: first ≈ last)
 * @param {number} canvasW
 * @param {number} canvasH
 * @returns {Set<string>} Set of "x,y" keys
 */
export function scanlineFill(contour, canvasW, canvasH) {
  const filled = new Set();
  if (!contour || contour.length < 3) return filled;

  // Find Y range
  let minY = Infinity, maxY = -Infinity;
  for (const [, y] of contour) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  minY = Math.max(0, Math.floor(minY));
  maxY = Math.min(canvasH - 1, Math.ceil(maxY));

  for (let y = minY; y <= maxY; y++) {
    // Find all X intersections at this scanline (y + 0.5 for pixel center)
    const sy = y + 0.5;
    const intersections = [];

    for (let i = 0; i < contour.length - 1; i++) {
      const [x0, y0] = contour[i];
      const [x1, y1] = contour[i + 1];

      // Edge crosses this scanline?
      if ((y0 <= sy && y1 > sy) || (y1 <= sy && y0 > sy)) {
        const t = (sy - y0) / (y1 - y0);
        intersections.push(x0 + t * (x1 - x0));
      }
    }

    intersections.sort((a, b) => a - b);

    // Fill between pairs (even-odd rule)
    for (let i = 0; i + 1 < intersections.length; i += 2) {
      const xStart = Math.max(0, Math.ceil(intersections[i]));
      const xEnd = Math.min(canvasW - 1, Math.floor(intersections[i + 1]));
      for (let x = xStart; x <= xEnd; x++) {
        filled.add(`${x},${y}`);
      }
    }
  }

  return filled;
}

/**
 * Rasterize a ribbon (spine + left/right banks) into filled cells.
 * Fills the polygon formed by leftBank → reversed rightBank.
 * @param {number[][]} leftBank
 * @param {number[][]} rightBank
 * @param {number} canvasW
 * @param {number} canvasH
 * @returns {Set<string>} Set of "x,y" keys
 */
export function ribbonFill(leftBank, rightBank, canvasW, canvasH) {
  if (!leftBank?.length || !rightBank?.length) return new Set();
  // Form closed polygon: leftBank forward + rightBank reversed
  const polygon = [...leftBank, ...[...rightBank].reverse()];
  polygon.push(polygon[0]); // close
  return scanlineFill(polygon, canvasW, canvasH);
}

/**
 * Convert a single solved construction part into coordinate objects.
 * @param {object} part - Solved part from the construction solver
 * @param {object} opts
 * @param {string} opts.color - Fill color (hex)
 * @param {string} [opts.material] - Material ID
 * @param {number} opts.canvasW
 * @param {number} opts.canvasH
 * @returns {object[]} Array of {x, y, color, material?, _construction?}
 */
export function solvedPartToCoords(part, opts) {
  const { color, material, canvasW, canvasH } = opts;
  const coords = [];
  const seen = new Set();

  const addCell = (x, y) => {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= canvasW || iy < 0 || iy >= canvasH) return;
    const key = `${ix},${iy}`;
    if (seen.has(key)) return;
    seen.add(key);
    const cell = { x: ix, y: iy, color };
    if (material) cell.material = material;
    cell._construction = {
      partId: part.id || part._partId || 'unknown',
      primitiveKind: part.primitiveKind || part.kind || 'unknown',
    };
    coords.push(cell);
  };

  // Strategy 1: closed contour → scanline fill
  if (part.closedContour && part.closedContour.length >= 3) {
    const filled = scanlineFill(part.closedContour, canvasW, canvasH);
    for (const key of filled) {
      const [x, y] = key.split(',').map(Number);
      addCell(x, y);
    }
    return coords;
  }

  // Strategy 2: ribbon (leftBank + rightBank) → polygon fill
  if (part.leftBank?.length && part.rightBank?.length) {
    const filled = ribbonFill(part.leftBank, part.rightBank, canvasW, canvasH);
    for (const key of filled) {
      const [x, y] = key.split(',').map(Number);
      addCell(x, y);
    }
    return coords;
  }

  // Strategy 3: spine only → stroke the spine (1px wide)
  if (part.spine?.length) {
    for (const [x, y] of part.spine) {
      addCell(x, y);
    }
    return coords;
  }

  // Strategy 4: named points only → individual cells
  if (part.namedPoints) {
    for (const [, pt] of Object.entries(part.namedPoints)) {
      if (Array.isArray(pt) && pt.length >= 2) {
        addCell(pt[0], pt[1]);
      }
    }
  }

  return coords;
}

/**
 * Convert an entire solved construction result into a flat coordinate list.
 * @param {object} solverResult - Frozen result from solve()
 * @param {object} opts
 * @param {object} opts.partStyles - Map of partId → { color, material }
 * @param {string} opts.defaultColor - Fallback color
 * @param {number} opts.canvasW
 * @param {number} opts.canvasH
 * @returns {object[]} Array of coordinate objects
 */
export function constructionToCoords(solverResult, opts) {
  const { partStyles = {}, defaultColor = '#808080', canvasW, canvasH } = opts;
  const allCoords = [];

  const parts = solverResult.parts || {};
  for (const [partId, part] of Object.entries(parts)) {
    const style = partStyles[partId] || {};
    const color = style.color || part.color || defaultColor;
    const material = style.material || part.material || undefined;

    const coords = solvedPartToCoords(part, {
      color,
      material,
      canvasW,
      canvasH,
    });
    allCoords.push(...coords);
  }

  return allCoords;
}
