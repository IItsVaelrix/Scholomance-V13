// Deterministic geometry-to-pixels rasterization and layer/paint compositing
// for SCDL v2 construction IR (Task 7 output of scdl-v2.evaluator.js). This
// module knows nothing about bytecode, opcodes, or registers — it consumes
// plain symbolic shapes (`{ kind: 'PIXEL', at }` / `{ kind: 'CIRCLE', center,
// radius }`) and produces pixel cells.
//
// Two independently-implemented circle fill algorithms exist ON PURPOSE and
// are NOT expected to agree at every radius:
//
//   - CENTER (`rasterizeCircleCenter`): the exact policy. Center and radius
//     are exact rationals; a cell is included iff its squared distance from
//     the exact center is <= the exact squared radius, compared by cross
//     multiplication (no floating point, no rounding). This is the
//     independent oracle other rendering paths get checked against.
//
//   - MIDPOINT (`rasterizeCircleMidpoint`): the classic integer decision-
//     variable (Bresenham/midpoint) circle algorithm, filled via symmetric
//     horizontal spans per octant pair. It requires an integral center and
//     radius, and it is a *different, standard, well-known approximation* —
//     for larger radii it can select a different span width than CENTER at
//     the same row (e.g. radius 3, row offset 2: CENTER's exact test admits
//     dx in [-2, 2] while MIDPOINT's octant symmetry admits only [-1, 1]).
//     They are required to coincide only where the brief's golden test
//     demands it (radius 2), not universally — that divergence is why SCDL
//     tracks them as two named algorithms (`CIRCLE-FILL-CENTER-v1` /
//     `CIRCLE-FILL-MIDPOINT-v1`) rather than one.
//
// PIXEL requires integral PX x/y under both policies (a pixel has no
// sub-cell meaning). A zero-radius circle degenerates to exactly its center
// cell when that center is integral — no special-casing is needed for this:
// both algorithms fall out of the general case correctly (verified by hand
// and by test).
//
// rasterizeSCDLV2 and compositeSCDLV2Layers never throw: an invalid raster
// policy combination (non-integral PIXEL/MIDPOINT input, an unrecognized
// shape kind, or an unrecognized RASTER policy) is reported as
// SCDL-GEOM-001; a runtime raster-cell count crossing `verifiedBudget.limits`
// is reported as SCDL-BUDGET-003 — a second, independent defense layer next
// to scdl-v2.evaluator.js's instruction/generatedShapes counters and Task 6's
// static scdl-v2.budget.js gate.

import { v2Diagnostic, span } from './scdl-v2.diagnostics.js';
import { makeRational, addRational, subRational, mulRational, rationalToString, isIntegralRational } from './scdl-v2.rational.js';

const ZERO_SPAN = span({ line: 1, column: 1, offset: 0 });

export const RASTER_CODES = Object.freeze({
  GEOMETRY: 'SCDL-GEOM-001',
  BUDGET: 'SCDL-BUDGET-003',
  INTERNAL: 'SCDL-GEOM-000',
});

function geomDiagnostic(policy, expectedDescription, receivedText) {
  return v2Diagnostic({
    code: RASTER_CODES.GEOMETRY,
    phase: 'RASTER',
    message: `${policy} requires ${expectedDescription}; received ${receivedText}.`,
    span: ZERO_SPAN,
    expected: [expectedDescription],
    received: [receivedText],
    relatedSymbols: [policy],
  });
}

function budgetDiagnostic(limit, actual) {
  return v2Diagnostic({
    code: RASTER_CODES.BUDGET,
    phase: 'RASTER',
    message: `Runtime rasterCells counter ${actual} crossed verified budget limit ${limit}.`,
    span: ZERO_SPAN,
    expected: [String(limit)],
    received: [String(actual)],
    relatedSymbols: ['rasterCells'],
  });
}

function internalDiagnostic(error) {
  return v2Diagnostic({
    code: RASTER_CODES.INTERNAL,
    phase: 'RASTER',
    message: `Internal raster failure: ${error instanceof Error ? error.message : String(error)}`,
    span: ZERO_SPAN,
  });
}

function sortYMajorXMinor(cells) {
  return cells.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x));
}

// --- Circle rasterization ---------------------------------------------

// The classic integer midpoint (Bresenham) filled-circle algorithm.
// `center` and `radius` are plain, already-validated-integral numbers.
// Cells are collected into a keyed map to remove the duplicate writes that
// naturally occur where octant spans overlap or the eight-way symmetry
// degenerates (x === y, or radius === 0).
export function rasterizeCircleMidpoint(center, radius) {
  const cx = center.x;
  const cy = center.y;
  const cells = new Map();

  const addSpan = (rowY, xFrom, xTo) => {
    const lo = Math.min(xFrom, xTo);
    const hi = Math.max(xFrom, xTo);
    for (let x = lo; x <= hi; x += 1) {
      cells.set(`${x},${rowY}`, { x, y: rowY });
    }
  };

  let x = radius;
  let y = 0;
  let err = 0;
  while (x >= y) {
    addSpan(cy + y, cx - x, cx + x);
    addSpan(cy - y, cx - x, cx + x);
    addSpan(cy + x, cx - y, cx + y);
    addSpan(cy - x, cx - y, cx + y);

    y += 1;
    err += 1 + 2 * y;
    if (2 * (err - x) + 1 > 0) {
      x -= 1;
      err += 1 - 2 * x;
    }
  }

  return sortYMajorXMinor([...cells.values()]);
}

function toRationalValue(value) {
  if (value && typeof value === 'object' && typeof value.numerator === 'string' && typeof value.denominator === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isInteger(value)) {
    return makeRational(BigInt(value));
  }
  return null;
}

// floor()/ceil() of an exact rational (positive-denominator, per
// makeRational's invariant), returned as a plain JS number. Canvas-scale
// coordinates stay well within Number.isSafeInteger range.
function floorRationalToNumber(rational) {
  const n = BigInt(rational.numerator);
  const d = BigInt(rational.denominator);
  const floored = n >= 0n ? n / d : -(((-n) + d - 1n) / d);
  return Number(floored);
}

function ceilRationalToNumber(rational) {
  const n = BigInt(rational.numerator);
  const d = BigInt(rational.denominator);
  const ceiled = n >= 0n ? (n + d - 1n) / d : -((-n) / d);
  return Number(ceiled);
}

// The exact center-inclusion policy: `center` is `{ x, y }` exact rationals
// (or integral plain numbers, normalized via toRationalValue), `radius` is
// an exact rational (or integral plain number). A cell's inclusion is
// decided by comparing squared rational distances with cross multiplication
// — no floating point ever enters the comparison.
export function rasterizeCircleCenter(center, radius) {
  const cx = toRationalValue(center.x);
  const cy = toRationalValue(center.y);
  const r = toRationalValue(radius);
  if (!cx || !cy || !r || BigInt(r.numerator) < 0n) return [];

  const minX = floorRationalToNumber(subRational(cx, r));
  const maxX = ceilRationalToNumber(addRational(cx, r));
  const minY = floorRationalToNumber(subRational(cy, r));
  const maxY = ceilRationalToNumber(addRational(cy, r));

  const rSquared = mulRational(r, r);
  const rsN = BigInt(rSquared.numerator);
  const rsD = BigInt(rSquared.denominator);

  const cells = [];
  for (let y = minY; y <= maxY; y += 1) {
    const dy = subRational(makeRational(BigInt(y)), cy);
    const dySquared = mulRational(dy, dy);
    for (let x = minX; x <= maxX; x += 1) {
      const dx = subRational(makeRational(BigInt(x)), cx);
      const distSquared = addRational(mulRational(dx, dx), dySquared);
      const dN = BigInt(distSquared.numerator);
      const dD = BigInt(distSquared.denominator);
      // distSquared <= rSquared  <=>  dN/dD <= rsN/rsD  <=>  dN*rsD <= rsN*dD
      // (dD and rsD are both strictly positive, per makeRational's invariant).
      if (dN * rsD <= rsN * dD) cells.push({ x, y });
    }
  }
  return sortYMajorXMinor(cells);
}

// --- Shape -> cells dispatch, gated by exact raster policy -------------

function toIntegerValue(value) {
  if (value && typeof value === 'object' && typeof value.numerator === 'string' && typeof value.denominator === 'string') {
    if (!isIntegralRational(value)) return { ok: false, text: rationalToString(value) };
    return { ok: true, value: Number(value.numerator), text: rationalToString(value) };
  }
  if (typeof value === 'number' && Number.isInteger(value)) {
    return { ok: true, value, text: String(value) };
  }
  return { ok: false, text: String(value) };
}

function rasterizePaintShape(shape, raster) {
  if (!shape || typeof shape !== 'object') {
    return { ok: false, diagnostic: geomDiagnostic('SHAPE', 'a PIXEL or CIRCLE shape object', String(shape)) };
  }

  if (shape.kind === 'PIXEL') {
    const xr = toIntegerValue(shape.at && shape.at.x);
    const yr = toIntegerValue(shape.at && shape.at.y);
    if (!xr.ok || !yr.ok) {
      return { ok: false, diagnostic: geomDiagnostic('PIXEL', 'integral PX x/y', `x=${xr.text}, y=${yr.text}`) };
    }
    return { ok: true, cells: [{ x: xr.value, y: yr.value }] };
  }

  if (shape.kind === 'CIRCLE') {
    if (raster === 'MIDPOINT') {
      const cxr = toIntegerValue(shape.center && shape.center.x);
      const cyr = toIntegerValue(shape.center && shape.center.y);
      const rr = toIntegerValue(shape.radius);
      if (!cxr.ok || !cyr.ok || !rr.ok) {
        return {
          ok: false,
          diagnostic: geomDiagnostic('MIDPOINT', 'an integral circle center and radius', `center=(${cxr.text}, ${cyr.text}), radius=${rr.text}`),
        };
      }
      if (rr.value < 0) {
        return { ok: false, diagnostic: geomDiagnostic('MIDPOINT', 'a non-negative radius', `radius=${rr.text}`) };
      }
      return { ok: true, cells: rasterizeCircleMidpoint({ x: cxr.value, y: cyr.value }, rr.value) };
    }

    if (raster === 'CENTER') {
      const cx = toRationalValue(shape.center && shape.center.x);
      const cy = toRationalValue(shape.center && shape.center.y);
      const r = toRationalValue(shape.radius);
      if (!cx || !cy || !r) {
        return {
          ok: false,
          diagnostic: geomDiagnostic('CENTER', 'an exact rational circle center and radius', `center=(${shape.center && shape.center.x}, ${shape.center && shape.center.y}), radius=${shape.radius}`),
        };
      }
      if (BigInt(r.numerator) < 0n) {
        return { ok: false, diagnostic: geomDiagnostic('CENTER', 'a non-negative radius', `radius=${rationalToString(r)}`) };
      }
      return { ok: true, cells: rasterizeCircleCenter({ x: cx, y: cy }, r) };
    }

    return { ok: false, diagnostic: geomDiagnostic(String(raster), 'a known raster policy (CENTER or MIDPOINT)', String(raster)) };
  }

  return { ok: false, diagnostic: geomDiagnostic('SHAPE', 'shape.kind PIXEL or CIRCLE', String(shape.kind)) };
}

// --- Layer/paint compositing --------------------------------------------

// Composites a plain array of `{ id, order, paints }` layers (paints are
// `{ shape, fill, raster }`, in source/paint order) into final pixel
// coordinates. Layers are visited by `(order, sourceIndex)` ascending;
// within a layer, paints are visited in array order; the last write to a
// given (x, y) wins regardless of which layer or paint produced it. Cells
// outside the canvas are dropped, never clamped. Final coordinates are
// returned sorted y-major/x-minor for stable, deterministic packet content
// — the painter order that produced them is not recoverable from the
// output, by design (that provenance lives in bytecode, not the raster).
export function compositeSCDLV2Layers(canvas, layers, options = {}) {
  try {
    const width = canvas && Number.isFinite(canvas.width) ? canvas.width : 0;
    const height = canvas && Number.isFinite(canvas.height) ? canvas.height : 0;
    const rasterCellLimit = Number.isFinite(options.rasterCellLimit) ? options.rasterCellLimit : Infinity;
    const list = Array.isArray(layers) ? layers : [];

    const orderedLayers = list
      .map((layer, sourceIndex) => ({ layer, sourceIndex }))
      .sort((a, b) => (a.layer.order - b.layer.order) || (a.sourceIndex - b.sourceIndex));

    const coordinateMap = new Map();
    let cellsGenerated = 0;

    for (const { layer } of orderedLayers) {
      const paints = Array.isArray(layer.paints) ? layer.paints : [];
      for (const paint of paints) {
        const result = rasterizePaintShape(paint.shape, paint.raster);
        if (!result.ok) {
          return Object.freeze({ ok: false, coordinates: null, layers: null, diagnostics: Object.freeze([result.diagnostic]) });
        }

        cellsGenerated += result.cells.length;
        if (cellsGenerated > rasterCellLimit) {
          return Object.freeze({ ok: false, coordinates: null, layers: null, diagnostics: Object.freeze([budgetDiagnostic(rasterCellLimit, cellsGenerated)]) });
        }

        for (const { x, y } of result.cells) {
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          coordinateMap.set(`${x},${y}`, { x, y, color: paint.fill, partId: layer.id, role: 'paint' });
        }
      }
    }

    const coordinates = sortYMajorXMinor([...coordinateMap.values()]).map((cell) => Object.freeze({ ...cell }));

    return Object.freeze({
      ok: true,
      coordinates: Object.freeze(coordinates),
      layers: Object.freeze(orderedLayers.map(({ layer, sourceIndex }) => Object.freeze({ id: layer.id, order: layer.order, sourceIndex }))),
      diagnostics: Object.freeze([]),
    });
  } catch (error) {
    return Object.freeze({ ok: false, coordinates: null, layers: null, diagnostics: Object.freeze([internalDiagnostic(error)]) });
  }
}

// Top-level entry: rasterizes a Task 7 construction (`evaluateSCDLV2`'s
// `construction.layers`) against a canvas, enforcing the program's verified
// rasterCells limit at runtime as it accumulates cells — an independent
// defense layer next to Task 6's static budget gate and
// scdl-v2.evaluator.js's own instruction/generatedShapes counters.
export function rasterizeSCDLV2(construction, canvas, verifiedBudget) {
  try {
    const layers = Array.isArray(construction && construction.layers) ? construction.layers : [];
    const limits = (verifiedBudget && verifiedBudget.limits) || {};
    const rasterCellLimit = Number.isFinite(limits.rasterCells) ? limits.rasterCells : Infinity;
    return compositeSCDLV2Layers(canvas, layers, { rasterCellLimit });
  } catch (error) {
    return Object.freeze({ ok: false, coordinates: null, layers: null, diagnostics: Object.freeze([internalDiagnostic(error)]) });
  }
}
