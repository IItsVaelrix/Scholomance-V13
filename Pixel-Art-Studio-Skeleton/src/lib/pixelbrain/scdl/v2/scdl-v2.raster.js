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
import { GEOM_CODES } from './scdl-v2.types.js';
import { makeRational, addRational, subRational, mulRational, rationalToString, isIntegralRational } from './scdl-v2.rational.js';
import { evaluateCSGToCells } from './scdl-v2.booleans.js';
import { applyTransformToPoint } from './scdl-v2.transforms.js';
import { applyOpacity, blendColors, formatColor } from './scdl-v2.compositing.js';
import { flattenSVGPath, isAngleInSweep } from './scdl-v2.geometry.js';

export const RASTER_COMPATIBILITY_MATRIX = Object.freeze({
  PIXEL: Object.freeze(['CENTER', 'MIDPOINT']),
  CIRCLE: Object.freeze(['CENTER', 'MIDPOINT']),
  LINE: Object.freeze(['CENTER', 'BRESENHAM', 'SUPERCOVER']),
  RECT: Object.freeze(['CENTER', 'MIDPOINT']),
  ROUNDED_RECT: Object.freeze(['CENTER', 'MIDPOINT']),
  RING: Object.freeze(['CENTER', 'MIDPOINT']),
  ELLIPSE: Object.freeze(['CENTER', 'MIDPOINT']),
  TRIANGLE: Object.freeze(['CENTER', 'MIDPOINT']),
  POLYGON: Object.freeze(['CENTER', 'MIDPOINT']),
  STAR: Object.freeze(['CENTER', 'MIDPOINT']),
  REGULAR_POLYGON: Object.freeze(['CENTER', 'MIDPOINT']),
  PATH: Object.freeze(['CENTER']),
  COMPOUND: Object.freeze(['CENTER', 'MIDPOINT']),
  CSG_UNION: Object.freeze(['CENTER', 'MIDPOINT']),
  CSG_SUBTRACT: Object.freeze(['CENTER', 'MIDPOINT']),
  CSG_INTERSECT: Object.freeze(['CENTER', 'MIDPOINT']),
  CSG_XOR: Object.freeze(['CENTER', 'MIDPOINT']),
  OUTLINE: Object.freeze(['CENTER', 'MIDPOINT', 'BRESENHAM']),
  TRANSFORMED_SHAPE: Object.freeze(['CENTER', 'MIDPOINT']),
});

function getAngleRad(angle) {
  if (!angle) return 0;
  if (angle.turns) {
    return (Number(angle.turns.numerator) / Number(angle.turns.denominator)) * 2 * Math.PI;
  }
  return 0;
}

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

// Task 6's static law charges a circle by the square around its ceil-rounded
// radius, clipped only by total canvas area. Keep the runtime cell preflight
// byte-for-byte equivalent to that model: fractional center placement may
// enlarge the candidate-iteration rectangle, but cannot enlarge the set of
// emitted integer lattice points beyond this bound.
function staticCircleCellBound(radius, canvas) {
  const ceilRadius = ceilRational(radius);
  const side = 2n * ceilRadius + 1n;
  const square = side * side;
  if (!canvas) return square;
  const canvasArea = BigInt(canvas.width) * BigInt(canvas.height);
  return square < canvasArea ? square : canvasArea;
}

// The exact center-inclusion policy: `center` is `{ x, y }` exact rationals
// (or integral plain numbers, normalized via toRationalValue), `radius` is
// an exact rational (or integral plain number). A cell's inclusion is
// decided by comparing squared rational distances with cross multiplication
// — no floating point ever enters the comparison.
function rasterizeCircleCenterBounded(center, radius, {
  canvas = null,
  cellLimit = DEFAULT_RASTER_CELL_LIMIT,
  iterationLimit = 4n * BigInt(cellLimit),
} = {}) {
  const cx = toRationalValue(center.x);
  const cy = toRationalValue(center.y);
  const r = toRationalValue(radius);
  if (!cx || !cy || !r || BigInt(r.numerator) < 0n) return { ok: false, cells: [] };

  const exactBounds = exactCircleBounds(cx, cy, r);
  if (!exactBounds) return { ok: false, cells: [] };
  const bounds = clippedBounds(exactBounds, canvas);
  const candidateArea = boundedArea(bounds);
  if (candidateArea > iterationLimit) return { ok: false, cells: [], budgetActual: candidateArea };

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

export function rasterizePaintShape(shape, raster, { canvas, remainingCells, rasterCellLimit, cellsGenerated }) {
  if (!shape || typeof shape !== 'object') {
    return { ok: false, diagnostic: geomDiagnostic('SHAPE', 'a PIXEL or CIRCLE shape object', String(shape)) };
  }

  const VALID_RASTER_POLICIES = new Set(['CENTER', 'MIDPOINT', 'BRESENHAM', 'SUPERCOVER', 'THRESHOLD']);
  if (!VALID_RASTER_POLICIES.has(raster)) {
    return { ok: false, diagnostic: geomDiagnostic(String(raster), 'a known raster policy (CENTER or MIDPOINT)', String(raster)) };
  }

  if (raster === 'THRESHOLD') {
    return {
      ok: false,
      diagnostic: v2Diagnostic({
        code: GEOM_CODES.UNSUPPORTED_POLICY,
        phase: 'RASTER',
        message: "Raster policy 'THRESHOLD' is reserved but has no registered rasterizer algorithm.",
        span: ZERO_SPAN,
      }),
    };
  }

  const allowedPolicies = RASTER_COMPATIBILITY_MATRIX[shape.kind];
  if (allowedPolicies && !allowedPolicies.includes(raster)) {
    return {
      ok: false,
      diagnostic: v2Diagnostic({
        code: GEOM_CODES.UNSUPPORTED_POLICY,
        phase: 'RASTER',
        message: `Raster policy '${raster}' is not supported for shape kind '${shape.kind}'. Supported policies: ${allowedPolicies.join(', ')}.`,
        span: ZERO_SPAN,
      }),
    };
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
      const cellBound = staticCircleCellBound(r, canvas);
      if (cellBound > BigInt(remainingCells)) {
        return { ok: false, diagnostic: budgetDiagnostic(rasterCellLimit, BigInt(cellsGenerated) + cellBound) };
      }
      // Along either axis, a rational-center candidate interval contains at
      // most 2*ceil(radius)+2 integers, versus Task 6's 2*ceil(radius)+1
      // emitted-cell side. Therefore the candidate rectangle is < 4x the
      // static square; canvas clipping preserves the same <=4 relationship.
      // This distinct operational cap keeps CENTER bounded without charging
      // candidate probes as emitted raster cells.
      const iterationLimit = 4n * cellBound;
      const generated = rasterizeCircleCenterBounded(
        { x: cx, y: cy },
        r,
        { canvas, cellLimit: remainingCells, iterationLimit },
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

  if (shape.kind === 'LINE') {
    const x0 = Number(shape.from.x.numerator) / Number(shape.from.x.denominator);
    const y0 = Number(shape.from.y.numerator) / Number(shape.from.y.denominator);
    const x1 = Number(shape.to.x.numerator) / Number(shape.to.x.denominator);
    const y1 = Number(shape.to.y.numerator) / Number(shape.to.y.denominator);
    const w = shape.width ? Number(shape.width.numerator) / Number(shape.width.denominator) : 1;
    let cells;
    if (w > 1) {
      cells = rasterizeLineWithWidth(x0, y0, x1, y1, w);
    } else {
      cells = raster === 'SUPERCOVER'
        ? rasterizeLineSupercover(x0, y0, x1, y1)
        : rasterizeLineBresenham(x0, y0, x1, y1);
    }
    return { ok: true, cells };
  }

  if (shape.kind === 'RECT') {
    const ox = Number(shape.origin.x.numerator) / Number(shape.origin.x.denominator);
    const oy = Number(shape.origin.y.numerator) / Number(shape.origin.y.denominator);
    const w = Number(shape.size.width.numerator) / Number(shape.size.width.denominator);
    const h = Number(shape.size.height.numerator) / Number(shape.size.height.denominator);
    const cells = rasterizeRectCenter(ox, oy, w, h);
    return { ok: true, cells };
  }

  if (shape.kind === 'ROUNDED_RECT') {
    const ox = Number(shape.origin.x.numerator) / Number(shape.origin.x.denominator);
    const oy = Number(shape.origin.y.numerator) / Number(shape.origin.y.denominator);
    const w = Number(shape.size.width.numerator) / Number(shape.size.width.denominator);
    const h = Number(shape.size.height.numerator) / Number(shape.size.height.denominator);
    const cr = shape.cornerRadius ? Number(shape.cornerRadius.numerator) / Number(shape.cornerRadius.denominator) : 0;
    const cells = rasterizeRoundedRectCenter(ox, oy, w, h, cr);
    return { ok: true, cells };
  }

  if (shape.kind === 'RING') {
    const cx = Number(shape.center.x.numerator) / Number(shape.center.x.denominator);
    const cy = Number(shape.center.y.numerator) / Number(shape.center.y.denominator);
    const inner = Number(shape.innerRadius.numerator) / Number(shape.innerRadius.denominator);
    const outer = Number(shape.outerRadius.numerator) / Number(shape.outerRadius.denominator);
    const cells = rasterizeRingMidpoint(cx, cy, inner, outer);
    return { ok: true, cells };
  }

  if (shape.kind === 'ELLIPSE') {
    const cx = Number(shape.center.x.numerator) / Number(shape.center.x.denominator);
    const cy = Number(shape.center.y.numerator) / Number(shape.center.y.denominator);
    const rx = Number(shape.radiusX.numerator) / Number(shape.radiusX.denominator);
    const ry = Number(shape.radiusY.numerator) / Number(shape.radiusY.denominator);
    const cells = rasterizeEllipseCenter(cx, cy, rx, ry);
    return { ok: true, cells };
  }

  if (shape.kind === 'TRIANGLE') {
    const v1 = { x: Number(shape.p1.x.numerator) / Number(shape.p1.x.denominator), y: Number(shape.p1.y.numerator) / Number(shape.p1.y.denominator) };
    const v2 = { x: Number(shape.p2.x.numerator) / Number(shape.p2.x.denominator), y: Number(shape.p2.y.numerator) / Number(shape.p2.y.denominator) };
    const v3 = { x: Number(shape.p3.x.numerator) / Number(shape.p3.x.denominator), y: Number(shape.p3.y.numerator) / Number(shape.p3.y.denominator) };
    const cells = rasterizePolygonScanline([v1, v2, v3], 'NON_ZERO');
    return { ok: true, cells };
  }

  if (shape.kind === 'POLYGON') {
    const verts = shape.vertices.map((v) => ({
      x: Number(v.x.numerator) / Number(v.x.denominator),
      y: Number(v.y.numerator) / Number(v.y.denominator),
    }));
    const cells = rasterizePolygonScanline(verts, 'NON_ZERO');
    return { ok: true, cells };
  }

  if (shape.kind === 'STAR') {
    const cx = Number(shape.center.x.numerator) / Number(shape.center.x.denominator);
    const cy = Number(shape.center.y.numerator) / Number(shape.center.y.denominator);
    const inR = Number(shape.innerRadius.numerator) / Number(shape.innerRadius.denominator);
    const outR = Number(shape.outerRadius.numerator) / Number(shape.outerRadius.denominator);
    const pts = shape.points;
    const verts = [];
    for (let i = 0; i < pts * 2; i++) {
      const r = i % 2 === 0 ? outR : inR;
      const angle = (i * Math.PI) / pts - Math.PI / 2;
      verts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    }
    const cells = rasterizePolygonScanline(verts, 'NON_ZERO');
    return { ok: true, cells };
  }

  if (shape.kind === 'COMPOUND') {
    const allCells = [];
    for (const child of (shape.shapes || [])) {
      const res = rasterizePaintShape(child, raster, { canvas, remainingCells, rasterCellLimit, cellsGenerated });
      if (!res.ok) return res;
      allCells.push(...res.cells);
    }
    return { ok: true, cells: allCells };
  }

  if (
    shape.kind === 'CSG_UNION' ||
    shape.kind === 'CSG_SUBTRACT' ||
    shape.kind === 'CSG_INTERSECT' ||
    shape.kind === 'CSG_XOR' ||
    shape.kind === 'OUTLINE'
  ) {
    const cells = evaluateCSGToCells(shape, raster);
    return { ok: true, cells };
  }

  if (shape.kind === 'TRANSFORMED_SHAPE') {
    const baseRes = rasterizePaintShape(shape.shape, raster, { canvas, remainingCells, rasterCellLimit, cellsGenerated });
    if (!baseRes.ok) return baseRes;
    const cells = baseRes.cells.map((c) => {
      const pt = applyTransformToPoint(shape.transform, { x: makeRational(BigInt(c.x)), y: makeRational(BigInt(c.y)) });
      return {
        x: Math.round(Number(pt.x.numerator) / Number(pt.x.denominator)),
        y: Math.round(Number(pt.y.numerator) / Number(pt.y.denominator)),
      };
    });
    return { ok: true, cells };
  }

  if (shape.kind === 'PATH') {
    const cells = rasterizePath(shape, raster);
    return { ok: true, cells };
  }

  if (shape.kind === 'REGULAR_POLYGON') {
    const cx = Number(shape.center.x.numerator) / Number(shape.center.x.denominator);
    const cy = Number(shape.center.y.numerator) / Number(shape.center.y.denominator);
    const r = Number(shape.radius.numerator) / Number(shape.radius.denominator);
    const sides = shape.sides || 6;
    const verts = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
      verts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    }
    const cells = rasterizePolygonScanline(verts, 'NON_ZERO');
    return { ok: true, cells };
  }

  if (shape.kind === 'SECTOR') {
    const cx = Number(shape.center.x.numerator) / Number(shape.center.x.denominator);
    const cy = Number(shape.center.y.numerator) / Number(shape.center.y.denominator);
    const r = Number(shape.radius.numerator) / Number(shape.radius.denominator);
    const startRad = getAngleRad(shape.startAngle);
    const endRad = getAngleRad(shape.endAngle);
    const cells = [];
    const floorR = Math.ceil(r);
    for (let dy = -floorR; dy <= floorR; dy++) {
      for (let dx = -floorR; dx <= floorR; dx++) {
        const dSq = dx * dx + dy * dy;
        if (dSq <= r * r) {
          if (dx === 0 && dy === 0) {
            cells.push({ x: Math.round(cx), y: Math.round(cy) });
          } else {
            const angle = Math.atan2(dy, dx);
            if (isAngleInSweep(angle, startRad, endRad)) {
              cells.push({ x: Math.round(cx + dx), y: Math.round(cy + dy) });
            }
          }
        }
      }
    }
    return { ok: true, cells };
  }

  if (shape.kind === 'ARC') {
    const cx = Number(shape.center.x.numerator) / Number(shape.center.x.denominator);
    const cy = Number(shape.center.y.numerator) / Number(shape.center.y.denominator);
    const r = Number(shape.radius.numerator) / Number(shape.radius.denominator);
    const w = shape.width ? Number(shape.width.numerator) / Number(shape.width.denominator) : 1;
    const startRad = getAngleRad(shape.startAngle);
    const endRad = getAngleRad(shape.endAngle);
    const cells = [];
    const halfW = w / 2;
    const innerR = Math.max(0, r - halfW);
    const outerR = r + halfW;
    const innerSq = innerR * innerR;
    const outerSq = outerR * outerR;
    const floorR = Math.ceil(outerR);
    for (let dy = -floorR; dy <= floorR; dy++) {
      for (let dx = -floorR; dx <= floorR; dx++) {
        const dSq = dx * dx + dy * dy;
        if (dSq >= innerSq && dSq <= outerSq) {
          const angle = Math.atan2(dy, dx);
          if (isAngleInSweep(angle, startRad, endRad)) {
            cells.push({ x: Math.round(cx + dx), y: Math.round(cy + dy) });
          }
        }
      }
    }
    return { ok: true, cells };
  }

  if (shape.kind === 'POLYLINE') {
    const cells = [];
    const pts = shape.points || [];
    const count = shape.closed ? pts.length : pts.length - 1;
    const w = shape.width ? Number(shape.width.numerator) / Number(shape.width.denominator) : 1;
    for (let i = 0; i < count; i++) {
      const p0 = pts[i];
      const p1 = pts[(i + 1) % pts.length];
      const x0 = Number(p0.x.numerator) / Number(p0.x.denominator);
      const y0 = Number(p0.y.numerator) / Number(p0.y.denominator);
      const x1 = Number(p1.x.numerator) / Number(p1.x.denominator);
      const y1 = Number(p1.y.numerator) / Number(p1.y.denominator);
      if (w > 1) {
        cells.push(...rasterizeLineWithWidth(x0, y0, x1, y1, w));
      } else {
        cells.push(...rasterizeLineBresenham(x0, y0, x1, y1));
      }
    }
    return { ok: true, cells };
  }

  if (shape.kind === 'RAY') {
    const x0 = Number(shape.origin.x.numerator) / Number(shape.origin.x.denominator);
    const y0 = Number(shape.origin.y.numerator) / Number(shape.origin.y.denominator);
    const dx = Number(shape.dir.x.numerator) / Number(shape.dir.x.denominator);
    const dy = Number(shape.dir.y.numerator) / Number(shape.dir.y.denominator);
    const len = Number(shape.length.numerator) / Number(shape.length.denominator);
    const magnitude = Math.hypot(dx, dy);
    const x1 = x0 + (dx / magnitude) * len;
    const y1 = y0 + (dy / magnitude) * len;
    const w = shape.width ? Number(shape.width.numerator) / Number(shape.width.denominator) : 1;
    let cells;
    if (w > 1) {
      cells = rasterizeLineWithWidth(x0, y0, x1, y1, w);
    } else {
      cells = rasterizeLineBresenham(x0, y0, x1, y1);
    }
    return { ok: true, cells };
  }

  return { ok: false, diagnostic: geomDiagnostic('SHAPE', 'supported SCDL v2 shape primitive', String(shape.kind)) };
}

// Shared primitive entrypoint for masks and CSG operands. Keeping this route
// aligned with PAINT prevents those subsystems from maintaining a partial,
// divergent primitive catalog.
export function rasterizeShapeCells(shape, raster = 'CENTER') {
  const result = rasterizePaintShape(shape, raster, {
    canvas: null,
    remainingCells: DEFAULT_RASTER_CELL_LIMIT,
    rasterCellLimit: DEFAULT_RASTER_CELL_LIMIT,
    cellsGenerated: 0,
  });
  return result.ok ? result.cells : [];
}

export function rasterizeLineBresenham(x0, y0, x1, y1) {
  const cells = [];
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let currX = x0;
  let currY = y0;
  for (;;) {
    cells.push({ x: currX, y: currY });
    if (currX === x1 && currY === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      currX += sx;
    }
    if (e2 < dx) {
      err += dx;
      currY += sy;
    }
  }
  return cells;
}

export function rasterizeLineWithWidth(x0, y0, x1, y1, width) {
  const halfWidth = Math.max(0, Number(width) / 2);
  if (halfWidth <= 0.5) return rasterizeLineBresenham(x0, y0, x1, y1);
  const minX = Math.floor(Math.min(x0, x1) - halfWidth);
  const maxX = Math.ceil(Math.max(x0, x1) + halfWidth);
  const minY = Math.floor(Math.min(y0, y1) - halfWidth);
  const maxY = Math.ceil(Math.max(y0, y1) + halfWidth);
  const segmentX = x1 - x0;
  const segmentY = y1 - y0;
  const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
  const threshold = halfWidth * halfWidth;
  const cells = [];

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const t = segmentLengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, ((x - x0) * segmentX + (y - y0) * segmentY) / segmentLengthSquared));
      const nearestX = x0 + t * segmentX;
      const nearestY = y0 + t * segmentY;
      const dx = x - nearestX;
      const dy = y - nearestY;
      if (dx * dx + dy * dy <= threshold) cells.push({ x, y });
    }
  }
  return cells;
}

export function rasterizeLineSupercover(x0, y0, x1, y1) {
  const cells = [];
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  let x = x0;
  let y = y0;
  let n = 1 + dx + dy;
  const xInc = x1 > x0 ? 1 : -1;
  const yInc = y1 > y0 ? 1 : -1;
  let error = dx - dy;
  dx *= 2;
  dy *= 2;
  for (; n > 0; n--) {
    cells.push({ x, y });
    if (error > 0) {
      x += xInc;
      error -= dy;
    } else if (error < 0) {
      y += yInc;
      error += dx;
    } else {
      cells.push({ x: x + xInc, y });
      cells.push({ x, y: y + yInc });
      x += xInc;
      y += yInc;
      error += dx - dy;
      n--;
    }
  }
  return cells;
}

export function rasterizeRectCenter(ox, oy, w, h) {
  const cells = [];
  const minX = Math.floor(ox);
  const maxX = Math.floor(ox + w);
  const minY = Math.floor(oy);
  const maxY = Math.floor(oy + h);
  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      cells.push({ x, y });
    }
  }
  return cells;
}

export function rasterizeRoundedRectCenter(ox, oy, w, h, cornerRadius) {
  const radius = Math.max(0, Math.min(cornerRadius, w / 2, h / 2));
  if (radius === 0) return rasterizeRectCenter(ox, oy, w, h);
  const minX = Math.floor(ox);
  const maxX = Math.floor(ox + w);
  const minY = Math.floor(oy);
  const maxY = Math.floor(oy + h);
  const leftCenter = ox + radius;
  const rightCenter = ox + w - radius;
  const topCenter = oy + radius;
  const bottomCenter = oy + h - radius;
  const radiusSquared = radius * radius;
  const cells = [];

  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      const centerX = x + 0.5;
      const centerY = y + 0.5;
      const nearestX = centerX < leftCenter ? leftCenter : centerX > rightCenter ? rightCenter : centerX;
      const nearestY = centerY < topCenter ? topCenter : centerY > bottomCenter ? bottomCenter : centerY;
      const dx = centerX - nearestX;
      const dy = centerY - nearestY;
      if (dx * dx + dy * dy <= radiusSquared) cells.push({ x, y });
    }
  }
  return cells;
}

export function rasterizePath(shape, rasterPolicy = 'CENTER') {
  const cells = [];
  const subpaths = flattenSVGPath(shape.commands?.length ? shape.commands : (shape.d || shape.data || ''));
  for (const subpath of subpaths) {
    const points = subpath.points;
    if (subpath.closed && points.length >= 3) {
      const polygon = pointsEqualForRaster(points[0], points[points.length - 1]) ? points.slice(0, -1) : points;
      cells.push(...rasterizePolygonScanline(polygon, shape.winding || 'NON_ZERO'));
      continue;
    }
    for (let i = 0; i < points.length - 1; i++) {
      const from = points[i];
      const to = points[i + 1];
      cells.push(...(rasterPolicy === 'SUPERCOVER'
        ? rasterizeLineSupercover(from.x, from.y, to.x, to.y)
        : rasterizeLineBresenham(from.x, from.y, to.x, to.y)));
    }
  }
  const unique = new Map(cells.map((cell) => [`${cell.x},${cell.y}`, cell]));
  return [...unique.values()];
}

function pointsEqualForRaster(a, b) {
  return a && b && Math.abs(a.x - b.x) < 1e-12 && Math.abs(a.y - b.y) < 1e-12;
}

export function rasterizeRingMidpoint(cx, cy, innerR, outerR) {
  const cells = [];
  cx = Math.round(cx);
  cy = Math.round(cy);
  innerR = Math.round(innerR);
  outerR = Math.round(outerR);
  const innerSq = innerR * innerR;
  const outerSq = outerR * outerR;
  for (let dy = -outerR; dy <= outerR; dy++) {
    for (let dx = -outerR; dx <= outerR; dx++) {
      const dSq = dx * dx + dy * dy;
      if (dSq >= innerSq && dSq <= outerSq) {
        cells.push({ x: cx + dx, y: cy + dy });
      }
    }
  }
  return cells;
}

export function rasterizeEllipseCenter(cx, cy, rx, ry) {
  const cells = [];
  const floorRx = Math.ceil(rx);
  const floorRy = Math.ceil(ry);
  for (let dy = -floorRy; dy <= floorRy; dy++) {
    for (let dx = -floorRx; dx <= floorRx; dx++) {
      const normX = dx / rx;
      const normY = dy / ry;
      if (normX * normX + normY * normY <= 1) {
        cells.push({ x: cx + dx, y: cy + dy });
      }
    }
  }
  return cells;
}

export function rasterizePolygonScanline(vertices, windingRule = 'NON_ZERO') {
  if (!vertices || vertices.length < 3) return [];
  const cells = [];
  let minY = Infinity;
  let maxY = -Infinity;
  for (const v of vertices) {
    if (v.y < minY) minY = v.y;
    if (v.y > maxY) maxY = v.y;
  }
  const scanMin = Math.floor(minY);
  const scanMax = Math.ceil(maxY);

  const n = vertices.length;
  for (let y = scanMin; y < scanMax; y++) {
    const scanY = y + 0.5;
    const intersections = [];

    for (let i = 0; i < n; i++) {
      const v0 = vertices[i];
      const v1 = vertices[(i + 1) % n];
      if ((v0.y <= scanY && v1.y > scanY) || (v1.y <= scanY && v0.y > scanY)) {
        const t = (scanY - v0.y) / (v1.y - v0.y);
        const x = v0.x + t * (v1.x - v0.x);
        intersections.push({ x, dir: v1.y > v0.y ? 1 : -1 });
      }
    }

    intersections.sort((a, b) => a.x - b.x);

    if (windingRule === 'NON_ZERO') {
      let winding = 0;
      let startX = null;
      for (const inter of intersections) {
        const prev = winding;
        winding += inter.dir;
        if (prev === 0 && winding !== 0) {
          startX = inter.x;
        } else if (prev !== 0 && winding === 0 && startX !== null) {
          const xStart = Math.ceil(startX - 0.5);
          const xEnd = Math.ceil(inter.x - 0.5) - 1;
          for (let x = xStart; x <= xEnd; x++) {
            cells.push({ x, y });
          }
          startX = null;
        }
      }
    } else {
      // EVEN_ODD
      for (let i = 0; i < intersections.length - 1; i += 2) {
        const xStart = Math.ceil(intersections[i].x - 0.5);
        const xEnd = Math.ceil(intersections[i + 1].x - 0.5) - 1;
        for (let x = xStart; x <= xEnd; x++) {
          cells.push({ x, y });
        }
      }
    }
  }
  return cells;
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
      return Object.freeze({ ok: false, coordinates: null, layerSurfaces: null, layers: null, diagnostics: Object.freeze([diagnostic]) });
    }
    const suppliedLimit = options && Object.hasOwn(options, 'rasterCellLimit') ? options.rasterCellLimit : DEFAULT_RASTER_CELL_LIMIT;
    if (!Number.isSafeInteger(suppliedLimit) || suppliedLimit < 0) {
      return Object.freeze({ ok: false, coordinates: null, layerSurfaces: null, layers: null, diagnostics: Object.freeze([invalidBudgetDiagnostic('rasterCells', suppliedLimit)]) });
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
        return Object.freeze({ ok: false, coordinates: null, layerSurfaces: null, layers: null, diagnostics: Object.freeze([diagnostic]) });
      }
      indexedLayers.push({ layer, sourceIndex });
    }
    const orderedLayers = indexedLayers.sort((a, b) => (a.layer.order - b.layer.order) || (a.sourceIndex - b.sourceIndex));

    const coordinateMap = new Map();
    let cellsGenerated = 0;
    let candidateCells = 0;
    let rasterWrites = 0;
    const layerSurfaces = [];

    for (const { layer, sourceIndex } of orderedLayers) {
      const layerCellMap = new Map();
      const paints = Array.isArray(layer.paints) ? layer.paints : [];
      for (const paint of paints) {
        const result = rasterizePaintShape(paint.shape, paint.raster, {
          canvas: { width, height },
          remainingCells: rasterCellLimit - cellsGenerated,
          rasterCellLimit,
          cellsGenerated,
        });
        if (!result.ok) {
          return Object.freeze({ ok: false, coordinates: null, layerSurfaces: null, layers: null, diagnostics: Object.freeze([result.diagnostic]) });
        }

        candidateCells += result.cells.length;
        cellsGenerated += result.cells.length;
        if (cellsGenerated > rasterCellLimit) {
          return Object.freeze({ ok: false, coordinates: null, layerSurfaces: null, layers: null, diagnostics: Object.freeze([budgetDiagnostic(rasterCellLimit, cellsGenerated)]) });
        }

        let offX = 0;
        let offY = 0;
        if (paint.at) {
          const atX = paint.at.x?.numerator !== undefined
            ? Number(paint.at.x.numerator) / Number(paint.at.x.denominator)
            : (paint.at.x?.value ? Number(paint.at.x.value.numerator) / Number(paint.at.x.value.denominator) : Number(paint.at.x ?? 0));
          const atY = paint.at.y?.numerator !== undefined
            ? Number(paint.at.y.numerator) / Number(paint.at.y.denominator)
            : (paint.at.y?.value ? Number(paint.at.y.value.numerator) / Number(paint.at.y.value.denominator) : Number(paint.at.y ?? 0));
          offX = Math.round(atX);
          offY = Math.round(atY);
        }

        for (const rawCell of result.cells) {
          const x = rawCell.x + offX;
          const y = rawCell.y + offY;
          if (x < 0 || y < 0 || x >= width || y >= height) continue;

          if (paint.clipTo && typeof paint.clipTo.has === 'function') {
            if (!paint.clipTo.has(x, y)) continue;
          }

          const key = `${x},${y}`;
          const existing = coordinateMap.get(key);
          const blendMode = paint.blend || layer.blend || 'OVER';

          const effectiveOpacity = Number(layer.opacity ?? 1) * Number(paint.opacity ?? 1);
          const hasOpacityAdjustment = effectiveOpacity !== 1;
          const sourceColor = hasOpacityAdjustment ? applyOpacity(paint.fill, effectiveOpacity) : paint.fill;
          let finalColor = hasOpacityAdjustment ? formatColor(sourceColor) : paint.fill;
          if (existing && existing.color && blendMode !== 'REPLACE') {
            try {
              finalColor = formatColor(blendColors(sourceColor, existing.color, blendMode));
            } catch {
              finalColor = formatColor(sourceColor);
            }
          }

          // Composite to flattened coordinateMap only if layer is visible
          if (layer.visible !== false) {
            const cellRecord = { x, y, color: finalColor, partId: layer.id, role: 'paint' };
            if (paint.material) cellRecord.material = paint.material;
            coordinateMap.set(key, cellRecord);
          }

          // Maintain un-occluded per-layer sparse surface
          let layerFinalColor = hasOpacityAdjustment ? formatColor(sourceColor) : paint.fill;
          const existingLayerCell = layerCellMap.get(key);
          if (existingLayerCell && existingLayerCell.color && blendMode !== 'REPLACE') {
            try {
              layerFinalColor = formatColor(blendColors(sourceColor, existingLayerCell.color, blendMode));
            } catch {
              layerFinalColor = formatColor(sourceColor);
            }
          }
          const layerCellRecord = { x, y, color: layerFinalColor, partId: layer.id, role: paint.role || layer.role || 'paint' };
          if (paint.material) layerCellRecord.material = paint.material;
          layerCellMap.set(key, layerCellRecord);
          rasterWrites += 1;
        }
      }

      const layerCoordinates = sortYMajorXMinor([...layerCellMap.values()]).map((cell) => Object.freeze({ ...cell }));
      layerSurfaces.push(Object.freeze({
        id: layer.id,
        order: layer.order,
        sourceIndex,
        blend: layer.blend || 'OVER',
        opacity: Number(layer.opacity ?? 1),
        visible: layer.visible !== false,
        role: layer.role || layer.semanticRole || 'layer',
        semanticRole: layer.semanticRole || null,
        coordinates: Object.freeze(layerCoordinates),
        cells: Object.freeze(layerCoordinates),
      }));
    }

    const coordinates = sortYMajorXMinor([...coordinateMap.values()]).map((cell) => Object.freeze({ ...cell }));
    const uniqueCells = coordinates.length;

    return Object.freeze({
      ok: true,
      coordinates: Object.freeze(coordinates),
      layerSurfaces: Object.freeze(layerSurfaces),
      layers: Object.freeze(orderedLayers.map(({ layer, sourceIndex }) => Object.freeze({ id: layer.id, order: layer.order, sourceIndex }))),
      counters: Object.freeze({
        candidateCells,
        rasterWrites,
        uniqueCells,
      }),
      diagnostics: Object.freeze([]),
    });
  } catch (error) {
    return Object.freeze({ ok: false, coordinates: null, layerSurfaces: null, layers: null, diagnostics: Object.freeze([internalDiagnostic(error)]) });
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
        return Object.freeze({ ok: false, coordinates: null, layerSurfaces: null, layers: null, diagnostics: Object.freeze([invalidBudgetDiagnostic(field, value)]) });
      }
    }
    const rasterCellLimit = limits.rasterCells;
    return compositeSCDLV2Layers(canvas, layers, { rasterCellLimit });
  } catch (error) {
    return Object.freeze({ ok: false, coordinates: null, layerSurfaces: null, layers: null, diagnostics: Object.freeze([internalDiagnostic(error)]) });
  }
}
