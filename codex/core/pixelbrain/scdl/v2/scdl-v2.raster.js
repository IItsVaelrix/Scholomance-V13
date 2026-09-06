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
const DEFAULT_RASTER_CELL_LIMIT = 1048576;
const MIN_SAFE_BIGINT = BigInt(Number.MIN_SAFE_INTEGER);
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER);

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

function invalidBudgetDiagnostic(field, received) {
  return v2Diagnostic({
    code: RASTER_CODES.BUDGET,
    phase: 'RASTER',
    message: `Verified budget limit '${field}' must be a finite, non-negative safe integer.`,
    span: ZERO_SPAN,
    expected: ['finite non-negative safe integer'],
    received: [String(received)],
    relatedSymbols: [field],
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
function rasterizeCircleMidpointBounded(center, radius, {
  canvas = null,
  cellLimit = DEFAULT_RASTER_CELL_LIMIT,
  iterationLimit = DEFAULT_RASTER_CELL_LIMIT,
} = {}) {
  const cx = center.x;
  const cy = center.y;
  const cells = new Map();
  let budgetActual = null;

  const addSpan = (rowY, xFrom, xTo) => {
    if (canvas && (rowY < 0 || rowY >= canvas.height)) return true;
    const lo = Math.max(Math.min(xFrom, xTo), canvas ? 0 : Number.MIN_SAFE_INTEGER);
    const hi = Math.min(Math.max(xFrom, xTo), canvas ? canvas.width - 1 : Number.MAX_SAFE_INTEGER);
    for (let cellX = lo; cellX <= hi; cellX += 1) {
      if (!cells.has(`${cellX},${rowY}`) && cells.size >= cellLimit) {
        budgetActual = cells.size + 1;
        return false;
      }
      cells.set(`${cellX},${rowY}`, { x: cellX, y: rowY });
    }
    return true;
  };

  let x = radius;
  let y = 0;
  let err = 0;
  let iterations = 0;
  while (x >= y) {
    iterations += 1;
    if (iterations > iterationLimit) {
      return { ok: false, cells: [], budgetActual: Math.max(iterations, budgetActual || 0) };
    }
    if (
      !addSpan(cy + y, cx - x, cx + x)
      || !addSpan(cy - y, cx - x, cx + x)
      || !addSpan(cy + x, cx - y, cx + y)
      || !addSpan(cy - x, cx - y, cx + y)
    ) {
      return { ok: false, cells: [], budgetActual };
    }

    y += 1;
    err += 1 + 2 * y;
    if (2 * (err - x) + 1 > 0) {
      x -= 1;
      err += 1 - 2 * x;
    }
  }

  return { ok: true, cells: sortYMajorXMinor([...cells.values()]) };
}

export function rasterizeCircleMidpoint(center, radius) {
  if (!Number.isSafeInteger(center && center.x) || !Number.isSafeInteger(center && center.y) || !Number.isSafeInteger(radius) || radius < 0) return [];
  const side = 2n * BigInt(radius) + 1n;
  if (side * side > BigInt(DEFAULT_RASTER_CELL_LIMIT)) return [];
  const result = rasterizeCircleMidpointBounded(center, radius);
  return result.ok ? result.cells : [];
}

function toRationalValue(value) {
  if (value && typeof value === 'object' && typeof value.numerator === 'string' && typeof value.denominator === 'string') {
    try {
      return makeRational(BigInt(value.numerator), BigInt(value.denominator));
    } catch {
      return null;
    }
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) {
    return makeRational(BigInt(value));
  }
  return null;
}

function floorRational(rational) {
  const n = BigInt(rational.numerator);
  const d = BigInt(rational.denominator);
  return n >= 0n ? n / d : -(((-n) + d - 1n) / d);
}

function ceilRational(rational) {
  const n = BigInt(rational.numerator);
  const d = BigInt(rational.denominator);
  return n >= 0n ? (n + d - 1n) / d : -((-n) / d);
}

function safeNumber(integer) {
  return integer >= MIN_SAFE_BIGINT && integer <= MAX_SAFE_BIGINT ? Number(integer) : null;
}

function exactCircleBounds(cx, cy, radius) {
  const minX = safeNumber(floorRational(subRational(cx, radius)));
  const maxX = safeNumber(ceilRational(addRational(cx, radius)));
  const minY = safeNumber(floorRational(subRational(cy, radius)));
  const maxY = safeNumber(ceilRational(addRational(cy, radius)));
  if (minX === null || maxX === null || minY === null || maxY === null) return null;
  return { minX, maxX, minY, maxY };
}

function clippedBounds(bounds, canvas) {
  if (!canvas) return bounds;
  return {
    minX: Math.max(bounds.minX, 0),
    maxX: Math.min(bounds.maxX, canvas.width - 1),
    minY: Math.max(bounds.minY, 0),
    maxY: Math.min(bounds.maxY, canvas.height - 1),
  };
}

function boundedArea(bounds) {
  if (bounds.maxX < bounds.minX || bounds.maxY < bounds.minY) return 0n;
  const width = BigInt(bounds.maxX) - BigInt(bounds.minX) + 1n;
  const height = BigInt(bounds.maxY) - BigInt(bounds.minY) + 1n;
  return width * height;
}

// The exact center-inclusion policy: `center` is `{ x, y }` exact rationals
// (or integral plain numbers, normalized via toRationalValue), `radius` is
// an exact rational (or integral plain number). A cell's inclusion is
// decided by comparing squared rational distances with cross multiplication
// — no floating point ever enters the comparison.
function rasterizeCircleCenterBounded(center, radius, { canvas = null, cellLimit = DEFAULT_RASTER_CELL_LIMIT } = {}) {
  const cx = toRationalValue(center.x);
  const cy = toRationalValue(center.y);
  const r = toRationalValue(radius);
  if (!cx || !cy || !r || BigInt(r.numerator) < 0n) return { ok: false, cells: [] };

  const exactBounds = exactCircleBounds(cx, cy, r);
  if (!exactBounds) return { ok: false, cells: [] };
  const bounds = clippedBounds(exactBounds, canvas);
  if (boundedArea(bounds) > BigInt(cellLimit)) return { ok: false, cells: [], budgetActual: boundedArea(bounds) };

  const rSquared = mulRational(r, r);
  const rsN = BigInt(rSquared.numerator);
  const rsD = BigInt(rSquared.denominator);

  const cells = [];
  for (let y = bounds.minY; y <= bounds.maxY; y += 1) {
    const dy = subRational(makeRational(BigInt(y)), cy);
    const dySquared = mulRational(dy, dy);
    for (let x = bounds.minX; x <= bounds.maxX; x += 1) {
      const dx = subRational(makeRational(BigInt(x)), cx);
      const distSquared = addRational(mulRational(dx, dx), dySquared);
      const dN = BigInt(distSquared.numerator);
      const dD = BigInt(distSquared.denominator);
      // distSquared <= rSquared  <=>  dN/dD <= rsN/rsD  <=>  dN*rsD <= rsN*dD
      // (dD and rsD are both strictly positive, per makeRational's invariant).
      if (dN * rsD <= rsN * dD) {
        if (cells.length >= cellLimit) return { ok: false, cells: [], budgetActual: cells.length + 1 };
        cells.push({ x, y });
      }
    }
  }
  return { ok: true, cells: sortYMajorXMinor(cells) };
}

export function rasterizeCircleCenter(center, radius) {
  const result = rasterizeCircleCenterBounded(center, radius);
  return result.ok ? result.cells : [];
}

// --- Shape -> cells dispatch, gated by exact raster policy -------------

function toIntegerValue(value) {
  const rational = toRationalValue(value);
  if (!rational) return { ok: false, text: String(value) };
  const text = rationalToString(rational);
  if (!isIntegralRational(rational)) return { ok: false, text };
  const integer = BigInt(rational.numerator);
  const number = safeNumber(integer);
  if (number === null) return { ok: false, text };
  return { ok: true, value: number, text };
}

function rasterizePaintShape(shape, raster, { canvas, remainingCells, rasterCellLimit, cellsGenerated }) {
  if (!shape || typeof shape !== 'object') {
    return { ok: false, diagnostic: geomDiagnostic('SHAPE', 'a PIXEL or CIRCLE shape object', String(shape)) };
  }

  if (raster !== 'CENTER' && raster !== 'MIDPOINT') {
    return { ok: false, diagnostic: geomDiagnostic(String(raster), 'a known raster policy (CENTER or MIDPOINT)', String(raster)) };
  }

  if (shape.kind === 'PIXEL') {
    const xr = toIntegerValue(shape.at && shape.at.x);
    const yr = toIntegerValue(shape.at && shape.at.y);
    if (!xr.ok || !yr.ok) {
      return { ok: false, diagnostic: geomDiagnostic('PIXEL', 'integral PX x/y', `x=${xr.text}, y=${yr.text}`) };
    }
    if (remainingCells < 1) {
      return { ok: false, diagnostic: budgetDiagnostic(rasterCellLimit, cellsGenerated + 1) };
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
      const minX = BigInt(cxr.value) - BigInt(rr.value);
      const maxX = BigInt(cxr.value) + BigInt(rr.value);
      const minY = BigInt(cyr.value) - BigInt(rr.value);
      const maxY = BigInt(cyr.value) + BigInt(rr.value);
      if ([minX, maxX, minY, maxY].some((value) => safeNumber(value) === null)) {
        return {
          ok: false,
          diagnostic: geomDiagnostic('MIDPOINT', 'safe-integer lattice bounds', `center=(${cxr.text}, ${cyr.text}), radius=${rr.text}`),
        };
      }
      const bounds = clippedBounds({
        minX: Number(minX), maxX: Number(maxX), minY: Number(minY), maxY: Number(maxY),
      }, canvas);
      const cellBound = boundedArea(bounds);
      const iterationBound = BigInt(rr.value) + 1n;
      const workBound = cellBound > iterationBound ? cellBound : iterationBound;
      if (workBound > BigInt(remainingCells)) {
        return { ok: false, diagnostic: budgetDiagnostic(rasterCellLimit, BigInt(cellsGenerated) + workBound) };
      }
      const generated = rasterizeCircleMidpointBounded(
        { x: cxr.value, y: cyr.value },
        rr.value,
        { canvas, cellLimit: remainingCells, iterationLimit: remainingCells },
      );
      if (!generated.ok) {
        return { ok: false, diagnostic: budgetDiagnostic(rasterCellLimit, cellsGenerated + generated.budgetActual) };
      }
      return { ok: true, cells: generated.cells };
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
      const exactBounds = exactCircleBounds(cx, cy, r);
      if (!exactBounds) {
        return {
          ok: false,
          diagnostic: geomDiagnostic('CENTER', 'safe-integer lattice bounds', `center=(${rationalToString(cx)}, ${rationalToString(cy)}), radius=${rationalToString(r)}`),
        };
      }
      const cellBound = boundedArea(clippedBounds(exactBounds, canvas));
      if (cellBound > BigInt(remainingCells)) {
        return { ok: false, diagnostic: budgetDiagnostic(rasterCellLimit, BigInt(cellsGenerated) + cellBound) };
      }
      const generated = rasterizeCircleCenterBounded(
        { x: cx, y: cy },
        r,
        { canvas, cellLimit: remainingCells },
      );
      if (!generated.ok) {
        if (generated.budgetActual !== undefined) {
          return { ok: false, diagnostic: budgetDiagnostic(rasterCellLimit, cellsGenerated + generated.budgetActual) };
        }
        return {
          ok: false,
          diagnostic: geomDiagnostic('CENTER', 'safe exact rational lattice inputs', `center=(${rationalToString(cx)}, ${rationalToString(cy)}), radius=${rationalToString(r)}`),
        };
      }
      return { ok: true, cells: generated.cells };
    }
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
    const width = canvas && canvas.width;
    const height = canvas && canvas.height;
    if (!Number.isSafeInteger(width) || width < 0 || !Number.isSafeInteger(height) || height < 0) {
      const diagnostic = geomDiagnostic('CANVAS', 'finite non-negative safe-integer width and height', `width=${width}, height=${height}`);
      return Object.freeze({ ok: false, coordinates: null, layers: null, diagnostics: Object.freeze([diagnostic]) });
    }
    const suppliedLimit = options && Object.hasOwn(options, 'rasterCellLimit') ? options.rasterCellLimit : DEFAULT_RASTER_CELL_LIMIT;
    if (!Number.isSafeInteger(suppliedLimit) || suppliedLimit < 0) {
      return Object.freeze({ ok: false, coordinates: null, layers: null, diagnostics: Object.freeze([invalidBudgetDiagnostic('rasterCells', suppliedLimit)]) });
    }
    const rasterCellLimit = suppliedLimit;
    const list = Array.isArray(layers) ? layers : [];

    const indexedLayers = [];
    for (let fallbackIndex = 0; fallbackIndex < list.length; fallbackIndex += 1) {
      const layer = list[fallbackIndex];
      const hasPersistedIndex = layer && layer.sourceIndex !== undefined;
      const sourceIndex = hasPersistedIndex ? layer.sourceIndex : fallbackIndex;
      if (!Number.isSafeInteger(sourceIndex) || sourceIndex < 0) {
        const diagnostic = geomDiagnostic('LAYER', 'a non-negative safe-integer sourceIndex when present', String(sourceIndex));
        return Object.freeze({ ok: false, coordinates: null, layers: null, diagnostics: Object.freeze([diagnostic]) });
      }
      indexedLayers.push({ layer, sourceIndex });
    }
    const orderedLayers = indexedLayers.sort((a, b) => (a.layer.order - b.layer.order) || (a.sourceIndex - b.sourceIndex));

    const coordinateMap = new Map();
    let cellsGenerated = 0;

    for (const { layer } of orderedLayers) {
      const paints = Array.isArray(layer.paints) ? layer.paints : [];
      for (const paint of paints) {
        const result = rasterizePaintShape(paint.shape, paint.raster, {
          canvas: { width, height },
          remainingCells: rasterCellLimit - cellsGenerated,
          rasterCellLimit,
          cellsGenerated,
        });
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
    const limits = verifiedBudget && verifiedBudget.limits;
    for (const field of ['instructions', 'generatedShapes', 'rasterCells']) {
      const value = limits && limits[field];
      if (!Number.isSafeInteger(value) || value < 0) {
        return Object.freeze({ ok: false, coordinates: null, layers: null, diagnostics: Object.freeze([invalidBudgetDiagnostic(field, value)]) });
      }
    }
    const rasterCellLimit = limits.rasterCells;
    return compositeSCDLV2Layers(canvas, layers, { rasterCellLimit });
  } catch (error) {
    return Object.freeze({ ok: false, coordinates: null, layers: null, diagnostics: Object.freeze([internalDiagnostic(error)]) });
  }
}
