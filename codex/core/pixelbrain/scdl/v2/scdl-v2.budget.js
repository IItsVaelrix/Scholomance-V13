// Static budget verification for SCDL v2 resolved IR (Task 5's analyzer
// output). This runs BEFORE canonical bytecode lowering (scdl-v2.bytecode.js)
// so a program that would demand too many instructions, generated shapes, or
// raster cells is rejected without ever walking a raster or allocating a
// register.
//
// Two independent gates, in this order:
//   1. SCDL-BUDGET-001 — the program's own `BUDGET` declaration (if any)
//      asked for MORE than the host's protected, absolute ceiling. This is a
//      trust boundary check on the REQUEST itself and never inspects the
//      program body. If any field violates it, verification stops here.
//   2. SCDL-BUDGET-002 — the program's *measured static demand* exceeds the
//      effective requested budget (the smaller of host limit and any
//      narrower source-declared limit). This is a conservative upper-bound
//      estimate, not the exact instruction count scdl-v2.bytecode.js will
//      emit (that pass additionally shares repeated literal constants, so
//      real output is always <= this estimate).
//
// verifySCDLV2Budget never throws: any unexpected internal failure is
// reported as a diagnostic with ok:false, matching every other public SCDL
// v2 compiler boundary.

import { span, v2Diagnostic } from './scdl-v2.diagnostics.js';

const ZERO_SPAN = span({ line: 1, column: 1, offset: 0 });

export const BUDGET_CODES = Object.freeze({
  PROTECTED_LIMIT: 'SCDL-BUDGET-001',
  MEASURED_DEMAND: 'SCDL-BUDGET-002',
  INTERNAL: 'SCDL-BUDGET-000',
});

// Absolute host ceilings. A source `BUDGET` declaration may only ever
// request something at or below these — it can never raise them.
export const DEFAULT_SCDL_V2_LIMITS = Object.freeze({
  instructions: 200000,
  generatedShapes: 10000,
  rasterCells: 1048576,
});

const LIMIT_FIELDS = Object.freeze(['instructions', 'generatedShapes', 'rasterCells']);

function fieldDiagnostic(code, field, expectedValue, receivedValue) {
  const subject = code === BUDGET_CODES.PROTECTED_LIMIT ? 'requested budget' : 'measured demand';
  const ceiling = code === BUDGET_CODES.PROTECTED_LIMIT ? 'protected host limit' : 'requested budget';
  return v2Diagnostic({
    code,
    phase: 'BUDGET',
    message: `${field} ${subject} ${receivedValue} exceeds ${ceiling} ${expectedValue}.`,
    span: ZERO_SPAN,
    expected: [String(expectedValue)],
    received: [String(receivedValue)],
    relatedSymbols: [field],
  });
}

// Counts one node per resolved scalar/composite value, mirroring (without
// scdl-v2.bytecode.js's first-occurrence literal sharing) the instructions a
// canonical lowering would emit for this value. Deliberately conservative:
// it never shares repeated identical literals, so it is always >= the real
// instruction count.
function countValueNodes(resolved) {
  if (!resolved || typeof resolved !== 'object') return 1;
  switch (resolved.type) {
    case 'I32':
    case 'FIXED':
    case 'RATIO':
    case 'PX':
    case 'COLOR':
      return 1;
    case 'VEC2':
      return 1 + countValueNodes(resolved.value.x) + countValueNodes(resolved.value.y);
    default:
      // Defensive: an IR shape this module does not know about yet. Charge
      // one instruction rather than crashing the budget pass.
      return 1;
  }
}

function countShapeNodes(shape) {
  if (!shape || typeof shape !== 'object') return 1;
  if (shape.kind === 'PIXEL') return 1 + countValueNodes(shape.at);
  if (shape.kind === 'CIRCLE') return 1 + countValueNodes(shape.center) + countValueNodes(shape.radius);
  return 1;
}

function ceilRational(rational) {
  const numerator = BigInt(rational.numerator);
  const denominator = BigInt(rational.denominator);
  if (numerator <= 0n) return 0n;
  return (numerator + denominator - 1n) / denominator;
}

// Conservative raster-cell cost for one PAINT statement. PIXEL always
// touches exactly one cell. CIRCLE charges the bounding square of the
// (ceiling-rounded) radius, clipped only by the canvas area — this never
// walks an actual raster, it is a closed-form upper bound.
function rasterCellsForShape(shape, canvasAreaBig) {
  if (shape.kind === 'PIXEL') return 1n;
  const ceilRadius = ceilRational(shape.radius.value);
  const side = 2n * ceilRadius + 1n;
  const cost = side * side;
  if (canvasAreaBig === null) return cost;
  return cost < canvasAreaBig ? cost : canvasAreaBig;
}

// Measures static demand by walking only what the program actually emits:
// declared LAYER/PAINT statements. A CONST or SHAPE declaration that no
// PAINT ever reaches costs nothing and never reaches bytecode either — it is
// genuinely dead. This keeps the budget estimate and the bytecode lowering
// answering the same question ("what does this program emit") from two
// independent angles.
function measureDemand(ir) {
  let instructions = 0n;
  let generatedShapes = 0n;
  let rasterCells = 0n;
  const canvas = ir && ir.canvas;
  const canvasAreaBig = canvas ? BigInt(canvas.width) * BigInt(canvas.height) : null;
  const layers = Array.isArray(ir && ir.layers) ? ir.layers : [];

  for (const layer of layers) {
    instructions += 1n; // BC.LAYER.NEW
    const paints = Array.isArray(layer && layer.paints) ? layer.paints : [];
    for (const paint of paints) {
      instructions += 1n; // BC.PAINT
      instructions += BigInt(countShapeNodes(paint.shape));
      instructions += 1n; // fill literal
      generatedShapes += 1n;
      rasterCells += rasterCellsForShape(paint.shape, canvasAreaBig);
    }
  }
  instructions += 1n; // BC.EMIT.ASSET

  return {
    instructions: Number(instructions),
    generatedShapes: Number(generatedShapes),
    rasterCells: Number(rasterCells),
  };
}

export function verifySCDLV2Budget(ir, options = {}) {
  try {
    const host = Object.freeze({ ...DEFAULT_SCDL_V2_LIMITS, ...((options && options.limits) || {}) });
    const requestedBudget = (ir && ir.requestedBudget) || {};
    const requested = Object.freeze({ ...host, ...requestedBudget });

    const protectedViolations = [];
    for (const field of LIMIT_FIELDS) {
      if (requested[field] > host[field]) {
        protectedViolations.push(fieldDiagnostic(BUDGET_CODES.PROTECTED_LIMIT, field, host[field], requested[field]));
      }
    }
    if (protectedViolations.length > 0) {
      return Object.freeze({ ok: false, verified: null, diagnostics: Object.freeze(protectedViolations) });
    }

    const demand = measureDemand(ir || {});
    const demandViolations = [];
    for (const field of LIMIT_FIELDS) {
      if (demand[field] > requested[field]) {
        demandViolations.push(fieldDiagnostic(BUDGET_CODES.MEASURED_DEMAND, field, requested[field], demand[field]));
      }
    }
    if (demandViolations.length > 0) {
      return Object.freeze({ ok: false, verified: null, diagnostics: Object.freeze(demandViolations) });
    }

    return Object.freeze({
      ok: true,
      verified: Object.freeze({ limits: requested, demand: Object.freeze(demand) }),
      diagnostics: Object.freeze([]),
    });
  } catch (error) {
    return Object.freeze({
      ok: false,
      verified: null,
      diagnostics: Object.freeze([
        v2Diagnostic({
          code: BUDGET_CODES.INTERNAL,
          phase: 'BUDGET',
          message: `Internal budget verification failure: ${error instanceof Error ? error.message : String(error)}`,
          span: ZERO_SPAN,
        }),
      ]),
    });
  }
}
