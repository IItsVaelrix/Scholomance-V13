/**
 * SCDL Expand Cells Pass
 *
 * Converts high-level ops (fill, rim, glow, trace-intent) into
 * concrete coordinate arrays.
 *
 * Strategy:
 *  - `cell`  → direct coordinate entry
 *  - `fill`  → placeholder coordinate at (0,0) tagged as fill-intent
 *              (full canvas fill at render time — we don't enumerate all
 *               pixels at compile time to keep AST small)
 *  - `rim`   → edge cells on the compass side (top row, bottom row, etc.)
 *  - `glow`  → stored as noiseDescriptor hint on the part; no cells emitted
 *  - `trace` → stored as intent; no cells emitted at compile time
 *
 * Output: ast with each part gaining a `coordinates` array of
 *   { x, y, color, partId, material, role? }
 *
 * Also validates cell coordinates against canvas bounds.
 */

import { SCDL_ERROR_CODES, scdlError } from '../scdl.errors.js';

const COMPASS_EDGES = Object.freeze({
  'north':      (w, _h) => edgeRow(w, 0),
  'south':      (w,  h) => edgeRow(w, h - 1),
  'west':       (w,  h) => edgeCol(0, h),
  'east':       (w,  h) => edgeCol(w - 1, h),
  'north west': (w, _h) => cornerCells(w, 0),
  'north east': (w, _h) => cornerCells(w, 0, true),
  'south west': (w,  h) => cornerCells(w, h - 1),
  'south east': (w,  h) => cornerCells(w, h - 1, true),
});

function edgeRow(w, y)         { return Array.from({ length: w }, (_, x) => ({ x, y })); }
function edgeCol(x, h)         { return Array.from({ length: h }, (_, y) => ({ x, y })); }
function cornerCells(w, y, right = false) {
  const x = right ? w - 1 : 0;
  return [{ x, y }, { x: right ? x - 1 : x + 1, y }, { x, y: y + 1 }].filter(c => c.x >= 0 && c.x < w);
}

/**
 * @param {object} ast
 * @param {import('../scdl.errors.js').SCDLError[]} errors
 * @returns {object} new AST with coordinates arrays on each part
 */
export function expandCellsPass(ast, errors) {
  const { canvas } = ast;
  const { width: w, height: h } = canvas;
  const l = ast.sourceLocation || { line: 1, col: 1 };

  function boundsCheck(x, y, opLoc) {
    if (x < 0 || x >= w || y < 0 || y >= h) {
      errors.push(scdlError(
        `Cell (${x},${y}) is outside canvas bounds (${w}x${h})`,
        SCDL_ERROR_CODES.CELL_OUT_OF_BOUNDS,
        opLoc || l,
        { x, y, canvasWidth: w, canvasHeight: h }
      ));
      return false;
    }
    return true;
  }

  const expandedParts = ast.parts.map(part => {
    const coordinates = [];
    const noiseDescriptors = [];
    const intentOps = [];
    let fillColor = null;

    // Collect fill color first (used as background for rim/cell)
    for (const op of part.ops) {
      if (op.op === 'fill') { fillColor = op.color; break; }
    }

    for (const op of part.ops) {
      const opLoc = op.loc || l;

      switch (op.op) {
        case 'cell': {
          if (boundsCheck(op.x, op.y, opLoc)) {
            const coord = {
              x:        op.x,
              y:        op.y,
              color:    op.color || fillColor || '#000000',
              partId:   op.partId || part.id,
              material: op.material || part.material,
              role:     op.role || 'explicit',
              sourceOpId: op.sourceOpId || op.id,
            };
            // Carry any semantic role from SemQuant if present on the op
            if (Array.isArray(op.annotations)) {
              const roleAnn = op.annotations.find(a => a.domain === 'role');
              if (roleAnn) coord.role = roleAnn.canonicalType;
            }
            coordinates.push(coord);
          }
          break;
        }

        case 'fill': {
          // Record fill intent as a single tagged coordinate at canvas center
          // Full rasterization happens at render time via region-fill-amp.
          coordinates.push({
            x:        Math.floor(w / 2),
            y:        Math.floor(h / 2),
            color:    op.color || '#000000',
            partId:   part.id,
            material: part.material,
            role:     'fill-intent',
            sourceOpId: op.id,
            _fillIntent: true,
          });
          break;
        }

        case 'rim': {
          const resolver = COMPASS_EDGES[op.compass] || COMPASS_EDGES['north'];
          const rimCoords = resolver(w, h);
          for (const { x, y } of rimCoords) {
            if (boundsCheck(x, y, opLoc)) {
              coordinates.push({
                x,
                y,
                color:    op.color || '#ffffff',
                partId:   part.id,
                material: part.material,
                role:     'rim',
                sourceOpId: op.id,
                compass:  op.compass,
              });
            }
          }
          break;
        }

        case 'glow': {
          // Hint: stored as a noise/SDF descriptor — no cells emitted
          noiseDescriptors.push({
            contract:  'PB-NOISE-v1',
            version:   '1.0.0',
            id:        `scdl_glow_${part.id}`,
            type:      'glow',
            seed:      0,
            octaves:   1,
            lacunarity: 2,
            gain:      0.5,
            frequency: 0.1,
            amplitude: op.radius || 1,
            outputRange: [0, 1],
            _scdlHint: true,
          });
          break;
        }

        case 'trace': {
          // Intent: stored verbatim
          intentOps.push({ ...op });
          break;
        }

        default:
          break; // unknown ops already caught by validate pass
      }
    }

    return { ...part, coordinates, noiseDescriptors, intentOps, fillColor };
  });

  return { ...ast, parts: expandedParts };
}
