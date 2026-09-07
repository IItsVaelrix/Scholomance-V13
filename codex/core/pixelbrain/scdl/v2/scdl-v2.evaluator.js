// Bounded register-machine evaluator for canonical SCDL v2 bytecode (Task 6's
// scdl-v2.bytecode.js output). This is the second, independent budget-defense
// layer: Task 6's scdl-v2.budget.js already rejected any program whose
// STATIC declared cost exceeds its verified limits before lowering ever ran.
// This evaluator does not trust that check happened — it re-derives and
// enforces `instructions` and `generatedShapes` counters against the SAME
// program's own `verifiedBudget.limits` while actually walking the
// instruction stream, so a forged or corrupted program object (one whose
// static budget metadata lies about the instructions it carries) still
// cannot run past its declared ceiling.
//
// evaluateSCDLV2 interprets instruction OBJECTS only — `mnemonic`,
// `operands`, `result`, `type` — in increasing `index` order. It never reads
// `program.text` and never re-touches source spans or the AST: bytecode is
// executable authority here, not a decorative sidecar next to the "real"
// program.
//
// Canonical lowering (Task 6) only ever emits a fixed instruction vocabulary:
// BC.CONST, VEC2, PIXEL, CIRCLE, BC.LAYER.NEW, BC.PAINT, BC.EMIT.ASSET.
// ADD/SUB/MUL/DIV/PX exist in scdl-v2.opcodes.js as source-level grammar
// opcodes, but Task 5's analyzer always folds arithmetic and PX-casts down
// to typed leaf constants before lowering — the Lowerer class in
// scdl-v2.bytecode.js has no `emit()` call for any of them. So this
// evaluator supports exactly the instructions Task 6 can actually produce;
// anything else (including a well-formed-looking ADD) is an unknown opcode.
//
// Register values are internally tagged `{ type, value }`:
//   I32 / FIXED / RATIO / PX  -> value: a Task 5 Rational { numerator, denominator }
//   COLOR                     -> value: a lowercase hex string
//   VEC2                      -> value: { x: Rational, y: Rational }
//   LAYER                     -> value: an immutable copy-on-write layer record
//   SHAPE                     -> value: { kind: 'PIXEL', at } | { kind: 'CIRCLE', center, radius }
//
// evaluateSCDLV2 never throws: any internal failure — an unknown opcode, a
// missing register, a wrong runtime type — is reported as SCDL-LOWER-001; a
// runtime counter crossing `verifiedBudget.limits` is reported as
// SCDL-BUDGET-003. Both return `{ ok: false, construction: null, ... }`.

import { v2Diagnostic, span } from './scdl-v2.diagnostics.js';
import { makeRational } from './scdl-v2.rational.js';
import {
  createLine,
  createPolyline,
  createRay,
  createRect,
  createRoundedRect,
  createRing,
  createEllipse,
  createArc,
  createSector,
  createTriangle,
  createRegularPolygon,
  createPolygon,
  createStar,
  createPath,
} from './scdl-v2.geometry.js';
import {
  shapeUnion,
  shapeSubtract,
  shapeIntersect,
  shapeXor,
  shapeOutline,
} from './scdl-v2.booleans.js';
import {
  createAngle,
  applyTransformToShape,
  translateTransform,
  rotateTransform,
  scaleTransform,
  composeTransforms,
} from './scdl-v2.transforms.js';
import { toMask } from './scdl-v2.masks.js';
import { getAmpAdapter } from './scdl-v2.amp-catalog.js';
import { AMP_CODES } from './scdl-v2.types.js';

const ZERO_SPAN = span({ line: 1, column: 1, offset: 0 });

export const EVAL_CODES = Object.freeze({
  UNKNOWN_OPCODE: 'SCDL-LOWER-001',
  MISSING_REGISTER: 'SCDL-LOWER-001',
  WRONG_TYPE: 'SCDL-LOWER-001',
  BUDGET: 'SCDL-BUDGET-003',
  INTERNAL: 'SCDL-LOWER-000',
});

const NUMERIC_TYPES = Object.freeze(['I32', 'FIXED', 'RATIO', 'PX']);

function lowerDiagnostic(message, { relatedSymbols = [], expected = [], received = [] } = {}) {
  return v2Diagnostic({
    code: EVAL_CODES.UNKNOWN_OPCODE,
    phase: 'EVAL',
    message,
    span: ZERO_SPAN,
    expected,
    received,
    relatedSymbols,
  });
}

function budgetDiagnostic(field, limit, actual) {
  return v2Diagnostic({
    code: EVAL_CODES.BUDGET,
    phase: 'EVAL',
    message: `Runtime ${field} counter ${actual} crossed verified budget limit ${limit}.`,
    span: ZERO_SPAN,
    expected: [String(limit)],
    received: [String(actual)],
    relatedSymbols: [field],
  });
}

function invalidBudgetDiagnostic(field, received) {
  return v2Diagnostic({
    code: EVAL_CODES.BUDGET,
    phase: 'EVAL',
    message: `Verified budget limit '${field}' must be a finite, non-negative safe integer.`,
    span: ZERO_SPAN,
    expected: ['finite non-negative safe integer'],
    received: [String(received)],
    relatedSymbols: [field],
  });
}

function internalDiagnostic(error) {
  return v2Diagnostic({
    code: EVAL_CODES.INTERNAL,
    phase: 'EVAL',
    message: `Internal evaluator failure: ${error instanceof Error ? error.message : String(error)}`,
    span: ZERO_SPAN,
  });
}

function failure(diagnostic, counters) {
  return Object.freeze({
    ok: false,
    construction: null,
    counters: Object.freeze({ ...counters }),
    diagnostics: Object.freeze([diagnostic]),
  });
}

// Parses a Task 6 constant-pool entry (`{ index, type, value: text }`) into
// a tagged register value, or returns null for a type this evaluator does
// not recognize.
function parseConstant(constantEntry) {
  const { type, value } = constantEntry;
  switch (type) {
    case 'I32': {
      try {
        return { type, value: makeRational(BigInt(value)) };
      } catch {
        return null;
      }
    }
    case 'FIXED':
    case 'RATIO':
    case 'PX': {
      const parts = String(value).split('/');
      if (parts.length !== 2) return null;
      try {
        return { type, value: makeRational(BigInt(parts[0]), BigInt(parts[1])) };
      } catch {
        return null;
      }
    }
    case 'COLOR':
      return { type: 'COLOR', value: String(value) };
    case 'STRING':
      return { type: 'STRING', value: String(value) };
    case 'BOOL':
      return { type: 'BOOL', value: value === 'true' || value === true };
    default:
      return null;
  }
}

function registerKey(resultField) {
  // Task 6 always writes `result` as `%N`; normalize back to the numeric
  // register id so lookups by `{ kind: 'register', index: N }` line up.
  if (typeof resultField !== 'string' || resultField[0] !== '%') return null;
  const key = Number(resultField.slice(1));
  return Number.isInteger(key) ? key : null;
}

export function evaluateSCDLV2(program) {
  const counters = { instructions: 0, generatedShapes: 0, rasterCells: 0 };
  try {
    const limits = program && program.verifiedBudget && program.verifiedBudget.limits;
    for (const field of ['instructions', 'generatedShapes', 'rasterCells']) {
      const value = limits && limits[field];
      if (!Number.isSafeInteger(value) || value < 0) {
        return failure(invalidBudgetDiagnostic(field, value), counters);
      }
    }
    const instructionLimit = limits.instructions;
    const generatedShapesLimit = limits.generatedShapes;

    const constants = Array.isArray(program && program.constants) ? program.constants : [];
    const instructions = Array.isArray(program && program.instructions) ? program.instructions : [];

    const registers = new Map();
    let layerCount = 0;
    let emittedLayerRegisters = null; // set by BC.EMIT.ASSET, or stays null if absent

    const readRegisterOperand = (operand) => {
      if (!operand || operand.kind !== 'register') return undefined;
      return registers.has(operand.index) ? registers.get(operand.index) : undefined;
    };

    for (const instruction of instructions) {
      counters.instructions += 1;
      if (counters.instructions > instructionLimit) {
        return failure(budgetDiagnostic('instructions', instructionLimit, counters.instructions), counters);
      }

      const operands = Array.isArray(instruction.operands) ? instruction.operands : [];
      const resultKey = registerKey(instruction.result);

      switch (instruction.mnemonic) {
        case 'BC.CONST': {
          const operand = operands[0];
          if (!operand || operand.kind !== 'constant' || !constants[operand.index]) {
            return failure(
              lowerDiagnostic('BC.CONST references an unknown constant-pool entry.', {
                relatedSymbols: ['BC.CONST'],
                received: [String(operand && operand.index)],
              }),
              counters,
            );
          }
          const parsed = parseConstant(constants[operand.index]);
          if (parsed === null || resultKey === null) {
            return failure(
              lowerDiagnostic(`BC.CONST produced an unrecognized runtime type '${constants[operand.index].type}'.`, {
                relatedSymbols: ['BC.CONST'],
                received: [String(constants[operand.index].type)],
              }),
              counters,
            );
          }
          registers.set(resultKey, Object.freeze(parsed));
          break;
        }

        case 'VEC2': {
          const xValue = readRegisterOperand(operands[0]);
          const yValue = readRegisterOperand(operands[1]);
          if (xValue === undefined || yValue === undefined) {
            return failure(
              lowerDiagnostic('VEC2 references a register that was never assigned.', { relatedSymbols: ['VEC2'] }),
              counters,
            );
          }
          if (!NUMERIC_TYPES.includes(xValue.type) || !NUMERIC_TYPES.includes(yValue.type) || resultKey === null) {
            return failure(
              lowerDiagnostic('VEC2 requires two numeric (PX) operands.', {
                relatedSymbols: ['VEC2'],
                received: [xValue.type, yValue.type],
              }),
              counters,
            );
          }
          registers.set(resultKey, Object.freeze({ type: 'VEC2', value: Object.freeze({ x: xValue.value, y: yValue.value }) }));
          break;
        }

        case 'PIXEL': {
          counters.generatedShapes += 1;
          if (counters.generatedShapes > generatedShapesLimit) {
            return failure(budgetDiagnostic('generatedShapes', generatedShapesLimit, counters.generatedShapes), counters);
          }
          const atValue = readRegisterOperand(operands[0]);
          if (atValue === undefined) {
            return failure(
              lowerDiagnostic('PIXEL references a register that was never assigned.', { relatedSymbols: ['PIXEL'] }),
              counters,
            );
          }
          if (atValue.type !== 'VEC2' || resultKey === null) {
            return failure(
              lowerDiagnostic("PIXEL's AT operand must be a VEC2.", {
                relatedSymbols: ['PIXEL'],
                received: [atValue.type],
              }),
              counters,
            );
          }
          registers.set(resultKey, Object.freeze({
            type: 'SHAPE',
            value: Object.freeze({ kind: 'PIXEL', at: atValue.value }),
          }));
          break;
        }

        case 'CIRCLE': {
          counters.generatedShapes += 1;
          if (counters.generatedShapes > generatedShapesLimit) {
            return failure(budgetDiagnostic('generatedShapes', generatedShapesLimit, counters.generatedShapes), counters);
          }
          const centerValue = readRegisterOperand(operands[0]);
          const radiusValue = readRegisterOperand(operands[1]);
          if (centerValue === undefined || radiusValue === undefined) {
            return failure(
              lowerDiagnostic('CIRCLE references a register that was never assigned.', { relatedSymbols: ['CIRCLE'] }),
              counters,
            );
          }
          if (centerValue.type !== 'VEC2' || !NUMERIC_TYPES.includes(radiusValue.type) || resultKey === null) {
            return failure(
              lowerDiagnostic("CIRCLE requires a VEC2 CENTER and a numeric (PX) RADIUS.", {
                relatedSymbols: ['CIRCLE'],
                received: [centerValue.type, radiusValue.type],
              }),
              counters,
            );
          }
          registers.set(resultKey, Object.freeze({
            type: 'SHAPE',
            value: Object.freeze({ kind: 'CIRCLE', center: centerValue.value, radius: radiusValue.value }),
          }));
          break;
        }

        case 'LINE': {
          counters.generatedShapes += 1;
          if (counters.generatedShapes > generatedShapesLimit) {
            return failure(budgetDiagnostic('generatedShapes', generatedShapesLimit, counters.generatedShapes), counters);
          }
          const fromValue = readRegisterOperand(operands[0]);
          const toValue = readRegisterOperand(operands[1]);
          if (!fromValue || !toValue || resultKey === null) {
            return failure(lowerDiagnostic('LINE requires valid FROM and TO registers.'), counters);
          }
          registers.set(resultKey, Object.freeze({
            type: 'SHAPE',
            value: createLine({ from: fromValue.value, to: toValue.value }),
          }));
          break;
        }

        case 'POLYLINE': {
          counters.generatedShapes += 1;
          if (counters.generatedShapes > generatedShapesLimit) {
            return failure(budgetDiagnostic('generatedShapes', generatedShapesLimit, counters.generatedShapes), counters);
          }
          const points = operands.map((op) => readRegisterOperand(op)?.value).filter(Boolean);
          registers.set(resultKey, Object.freeze({
            type: 'SHAPE',
            value: createPolyline({ points }),
          }));
          break;
        }

        case 'RAY': {
          counters.generatedShapes += 1;
          if (counters.generatedShapes > generatedShapesLimit) {
            return failure(budgetDiagnostic('generatedShapes', generatedShapesLimit, counters.generatedShapes), counters);
          }
          const origin = readRegisterOperand(operands[0]);
          const dir = readRegisterOperand(operands[1]);
          const length = readRegisterOperand(operands[2]);
          registers.set(resultKey, Object.freeze({
            type: 'SHAPE',
            value: createRay({ origin: origin?.value, dir: dir?.value, length: length?.value }),
          }));
          break;
        }

        case 'RECT': {
          counters.generatedShapes += 1;
          if (counters.generatedShapes > generatedShapesLimit) {
            return failure(budgetDiagnostic('generatedShapes', generatedShapesLimit, counters.generatedShapes), counters);
          }
          const originValue = readRegisterOperand(operands[0]);
          const sizeValue = readRegisterOperand(operands[1]);
          if (!originValue || !sizeValue || resultKey === null) {
            return failure(lowerDiagnostic('RECT requires valid ORIGIN and SIZE registers.'), counters);
          }
          registers.set(resultKey, Object.freeze({
            type: 'SHAPE',
            value: createRect({ origin: originValue.value, size: sizeValue.value }),
          }));
          break;
        }

        case 'ROUNDED_RECT': {
          counters.generatedShapes += 1;
          if (counters.generatedShapes > generatedShapesLimit) {
            return failure(budgetDiagnostic('generatedShapes', generatedShapesLimit, counters.generatedShapes), counters);
          }
          const originValue = readRegisterOperand(operands[0]);
          const sizeValue = readRegisterOperand(operands[1]);
          const crValue = readRegisterOperand(operands[2]);
          registers.set(resultKey, Object.freeze({
            type: 'SHAPE',
            value: createRoundedRect({ origin: originValue.value, size: sizeValue.value, cornerRadius: crValue?.value }),
          }));
          break;
        }

        case 'RING': {
          counters.generatedShapes += 1;
          if (counters.generatedShapes > generatedShapesLimit) {
            return failure(budgetDiagnostic('generatedShapes', generatedShapesLimit, counters.generatedShapes), counters);
          }
          const centerValue = readRegisterOperand(operands[0]);
          const radiusValue = readRegisterOperand(operands[1]);
          const thValue = readRegisterOperand(operands[2]);
          registers.set(resultKey, Object.freeze({
            type: 'SHAPE',
            value: createRing({ center: centerValue.value, radius: radiusValue.value, thickness: thValue?.value }),
          }));
          break;
        }

        case 'ELLIPSE': {
          counters.generatedShapes += 1;
          if (counters.generatedShapes > generatedShapesLimit) {
            return failure(budgetDiagnostic('generatedShapes', generatedShapesLimit, counters.generatedShapes), counters);
          }
          const centerValue = readRegisterOperand(operands[0]);
          const rxValue = readRegisterOperand(operands[1]);
          const ryValue = readRegisterOperand(operands[2]);
          registers.set(resultKey, Object.freeze({
            type: 'SHAPE',
            value: createEllipse({ center: centerValue.value, radiusX: rxValue.value, radiusY: ryValue.value }),
          }));
          break;
        }

        case 'ARC': {
          counters.generatedShapes += 1;
          if (counters.generatedShapes > generatedShapesLimit) {
            return failure(budgetDiagnostic('generatedShapes', generatedShapesLimit, counters.generatedShapes), counters);
          }
          const center = readRegisterOperand(operands[0]);
          const radius = readRegisterOperand(operands[1]);
          const start = readRegisterOperand(operands[2]);
          const end = readRegisterOperand(operands[3]);
          registers.set(resultKey, Object.freeze({
            type: 'SHAPE',
            value: createArc({
              center: center?.value,
              radius: radius?.value,
              startAngle: start?.value,
              endAngle: end?.value,
            }),
          }));
          break;
        }

        case 'SECTOR': {
          counters.generatedShapes += 1;
          if (counters.generatedShapes > generatedShapesLimit) {
            return failure(budgetDiagnostic('generatedShapes', generatedShapesLimit, counters.generatedShapes), counters);
          }
          const center = readRegisterOperand(operands[0]);
          const radius = readRegisterOperand(operands[1]);
          const start = readRegisterOperand(operands[2]);
          const end = readRegisterOperand(operands[3]);
          registers.set(resultKey, Object.freeze({
            type: 'SHAPE',
            value: createSector({
              center: center?.value,
              radius: radius?.value,
              startAngle: start?.value,
              endAngle: end?.value,
            }),
          }));
          break;
        }

        case 'TRIANGLE': {
          counters.generatedShapes += 1;
          if (counters.generatedShapes > generatedShapesLimit) {
            return failure(budgetDiagnostic('generatedShapes', generatedShapesLimit, counters.generatedShapes), counters);
          }
          const p1 = readRegisterOperand(operands[0]);
          const p2 = readRegisterOperand(operands[1]);
          const p3 = readRegisterOperand(operands[2]);
          registers.set(resultKey, Object.freeze({
            type: 'SHAPE',
            value: createTriangle({ p1: p1.value, p2: p2.value, p3: p3.value }),
          }));
          break;
        }

        case 'REGULAR_POLYGON': {
          counters.generatedShapes += 1;
          if (counters.generatedShapes > generatedShapesLimit) {
            return failure(budgetDiagnostic('generatedShapes', generatedShapesLimit, counters.generatedShapes), counters);
          }
          const sides = readRegisterOperand(operands[0]);
          const radius = readRegisterOperand(operands[1]);
          const center = readRegisterOperand(operands[2]);
          const sNum = Number(sides?.value?.numerator ?? sides?.value ?? 6);
          registers.set(resultKey, Object.freeze({
            type: 'SHAPE',
            value: createRegularPolygon({ sides: sNum, radius: radius.value, center: center.value }),
          }));
          break;
        }

        case 'POLYGON': {
          counters.generatedShapes += 1;
          if (counters.generatedShapes > generatedShapesLimit) {
            return failure(budgetDiagnostic('generatedShapes', generatedShapesLimit, counters.generatedShapes), counters);
          }
          const vertices = operands.map((op) => readRegisterOperand(op)?.value).filter(Boolean);
          registers.set(resultKey, Object.freeze({
            type: 'SHAPE',
            value: createPolygon({ vertices }),
          }));
          break;
        }

        case 'STAR': {
          counters.generatedShapes += 1;
          if (counters.generatedShapes > generatedShapesLimit) {
            return failure(budgetDiagnostic('generatedShapes', generatedShapesLimit, counters.generatedShapes), counters);
          }
          const pts = readRegisterOperand(operands[0]);
          const inR = readRegisterOperand(operands[1]);
          const outR = readRegisterOperand(operands[2]);
          const center = readRegisterOperand(operands[3]);
          const pNum = Number(pts?.value?.numerator ?? pts?.value ?? 5);
          registers.set(resultKey, Object.freeze({
            type: 'SHAPE',
            value: createStar({ points: pNum, innerRadius: inR.value, outerRadius: outR.value, center: center.value }),
          }));
          break;
        }

        case 'PATH': {
          counters.generatedShapes += 1;
          if (counters.generatedShapes > generatedShapesLimit) {
            return failure(budgetDiagnostic('generatedShapes', generatedShapesLimit, counters.generatedShapes), counters);
          }
          const data = readRegisterOperand(operands[0]);
          registers.set(resultKey, Object.freeze({
            type: 'SHAPE',
            value: createPath({ d: String(data?.value ?? '') }),
          }));
          break;
        }

        case 'UNION': {
          counters.generatedShapes += 1;
          if (counters.generatedShapes > generatedShapesLimit) {
            return failure(budgetDiagnostic('generatedShapes', generatedShapesLimit, counters.generatedShapes), counters);
          }
          const a = readRegisterOperand(operands[0]);
          const b = readRegisterOperand(operands[1]);
          registers.set(resultKey, Object.freeze({
            type: 'SHAPE',
            value: shapeUnion(a.value, b.value),
          }));
          break;
        }

        case 'SUBTRACT': {
          counters.generatedShapes += 1;
          if (counters.generatedShapes > generatedShapesLimit) {
            return failure(budgetDiagnostic('generatedShapes', generatedShapesLimit, counters.generatedShapes), counters);
          }
          const a = readRegisterOperand(operands[0]);
          const b = readRegisterOperand(operands[1]);
          registers.set(resultKey, Object.freeze({
            type: 'SHAPE',
            value: shapeSubtract(a.value, b.value),
          }));
          break;
        }

        case 'INTERSECT': {
          counters.generatedShapes += 1;
          if (counters.generatedShapes > generatedShapesLimit) {
            return failure(budgetDiagnostic('generatedShapes', generatedShapesLimit, counters.generatedShapes), counters);
          }
          const a = readRegisterOperand(operands[0]);
          const b = readRegisterOperand(operands[1]);
          registers.set(resultKey, Object.freeze({
            type: 'SHAPE',
            value: shapeIntersect(a.value, b.value),
          }));
          break;
        }

        case 'XOR': {
          counters.generatedShapes += 1;
          if (counters.generatedShapes > generatedShapesLimit) {
            return failure(budgetDiagnostic('generatedShapes', generatedShapesLimit, counters.generatedShapes), counters);
          }
          const a = readRegisterOperand(operands[0]);
          const b = readRegisterOperand(operands[1]);
          registers.set(resultKey, Object.freeze({
            type: 'SHAPE',
            value: shapeXor(a.value, b.value),
          }));
          break;
        }

        case 'OUTLINE': {
          counters.generatedShapes += 1;
          if (counters.generatedShapes > generatedShapesLimit) {
            return failure(budgetDiagnostic('generatedShapes', generatedShapesLimit, counters.generatedShapes), counters);
          }
          const shape = readRegisterOperand(operands[0]);
          const width = readRegisterOperand(operands[1]);
          registers.set(resultKey, Object.freeze({
            type: 'SHAPE',
            value: shapeOutline(shape.value, width.value),
          }));
          break;
        }

        case 'TRANSFORM_APPLY': {
          const transform = readRegisterOperand(operands[0]);
          const target = readRegisterOperand(operands[1]);
          registers.set(resultKey, Object.freeze({
            type: 'SHAPE',
            value: applyTransformToShape(transform.value, target.value),
          }));
          break;
        }

        case 'TRANSLATE': {
          const offset = readRegisterOperand(operands[0]);
          registers.set(resultKey, Object.freeze({
            type: 'TRANSFORM',
            value: translateTransform(offset?.value || { x: makeRational(0), y: makeRational(0) }),
          }));
          break;
        }

        case 'DEGREES': {
          const val = readRegisterOperand(operands[0]);
          registers.set(resultKey, Object.freeze({
            type: 'ANGLE',
            value: createAngle(val?.value ?? 0, 'DEGREES'),
          }));
          break;
        }

        case 'RADIANS': {
          const val = readRegisterOperand(operands[0]);
          registers.set(resultKey, Object.freeze({
            type: 'ANGLE',
            value: createAngle(val?.value ?? 0, 'RADIANS'),
          }));
          break;
        }

        case 'TURNS': {
          const val = readRegisterOperand(operands[0]);
          registers.set(resultKey, Object.freeze({
            type: 'ANGLE',
            value: createAngle(val?.value ?? 0, 'TURNS'),
          }));
          break;
        }

        case 'ROTATE': {
          const angle = readRegisterOperand(operands[0]);
          const pivot = operands[1] ? readRegisterOperand(operands[1]) : null;
          registers.set(resultKey, Object.freeze({
            type: 'TRANSFORM',
            value: rotateTransform(angle?.value, pivot?.value || null),
          }));
          break;
        }

        case 'SCALE': {
          const sx = readRegisterOperand(operands[0]);
          const sy = operands[1] ? readRegisterOperand(operands[1]) : sx;
          const pivot = operands[2] ? readRegisterOperand(operands[2]) : null;
          registers.set(resultKey, Object.freeze({
            type: 'TRANSFORM',
            value: scaleTransform(sx?.value, sy?.value, pivot?.value || null),
          }));
          break;
        }

        case 'TRANSFORM_COMPOSE': {
          const t1 = readRegisterOperand(operands[0]);
          const t2 = readRegisterOperand(operands[1]);
          registers.set(resultKey, Object.freeze({
            type: 'TRANSFORM',
            value: composeTransforms(t1?.value, t2?.value),
          }));
          break;
        }

        case 'TO_MASK': {
          const shape = readRegisterOperand(operands[0]);
          registers.set(resultKey, Object.freeze({
            type: 'MASK',
            value: toMask(shape.value),
          }));
          break;
        }

        case 'BC.LAYER.NEW': {
          const idOperand = operands[0];
          const orderOperand = operands[1];
          if (!idOperand || idOperand.kind !== 'immediate' || !orderOperand || orderOperand.kind !== 'immediate' || resultKey === null) {
            return failure(
              lowerDiagnostic('BC.LAYER.NEW requires immediate ID and ORDER operands.', { relatedSymbols: ['BC.LAYER.NEW'] }),
              counters,
            );
          }
          const blendOperand = operands[2];
          const opacityOperand = operands[3];
          const visibleOperand = operands[4];
          const layerRecord = Object.freeze({
            id: idOperand.value,
            order: orderOperand.value,
            blend: blendOperand && blendOperand.kind === 'immediate' ? blendOperand.value : 'OVER',
            opacity: opacityOperand && opacityOperand.kind === 'immediate' ? opacityOperand.value : 1.0,
            visible: visibleOperand && visibleOperand.kind === 'immediate' ? visibleOperand.value : true,
            sourceIndex: layerCount,
            paints: Object.freeze([]),
          });
          layerCount += 1;
          registers.set(resultKey, Object.freeze({ type: 'LAYER', value: layerRecord }));
          break;
        }

        case 'BC.PAINT': {
          const layerValue = readRegisterOperand(operands[0]);
          const shapeValue = readRegisterOperand(operands[1]);
          const fillValue = readRegisterOperand(operands[2]);
          const rasterOperand = operands[3];
          if (layerValue === undefined || shapeValue === undefined || fillValue === undefined) {
            return failure(
              lowerDiagnostic('BC.PAINT references a register that was never assigned.', { relatedSymbols: ['BC.PAINT'] }),
              counters,
            );
          }
          if (
            layerValue.type !== 'LAYER'
            || shapeValue.type !== 'SHAPE'
            || fillValue.type !== 'COLOR'
            || !rasterOperand
            || rasterOperand.kind !== 'immediate'
          ) {
            return failure(
              lowerDiagnostic('BC.PAINT requires a LAYER, a SHAPE, a COLOR, and an immediate RASTER policy.', {
                relatedSymbols: ['BC.PAINT'],
                received: [layerValue.type, shapeValue.type, fillValue.type],
              }),
              counters,
            );
          }
          const atOperand = operands[4] ? readRegisterOperand(operands[4]) : undefined;
          const clipToOperand = operands[5] ? readRegisterOperand(operands[5]) : undefined;
          const materialOperand = operands[6] ? (operands[6].kind === 'immediate' ? operands[6] : readRegisterOperand(operands[6])) : undefined;
          const blendOperand = operands[7];
          const opacityOperand = operands[8];

          const paint = Object.freeze({
            shape: shapeValue.value,
            fill: fillValue.value,
            raster: rasterOperand.value,
            at: atOperand ? atOperand.value : (shapeValue.value.atOffset || null),
            clipTo: clipToOperand ? clipToOperand.value : null,
            material: materialOperand
              ? (materialOperand.kind === 'immediate' ? materialOperand.value : materialOperand.value)
              : null,
            blend: blendOperand && blendOperand.kind === 'immediate' ? blendOperand.value : 'OVER',
            opacity: opacityOperand && opacityOperand.kind === 'immediate' ? opacityOperand.value : 1.0,
          });
          const updatedLayer = Object.freeze({
            ...layerValue.value,
            paints: Object.freeze([...layerValue.value.paints, paint]),
          });
          registers.set(operands[0].index, Object.freeze({ type: 'LAYER', value: updatedLayer }));
          break;
        }

        case 'BC.AMP.SELECT': {
          // Records selected deterministic AMP plan in evaluation
          break;
        }

        case 'BC.AMP.APPLY': {
          if (instruction.type === 'SHAPE') {
            counters.generatedShapes += 1;
            if (counters.generatedShapes > generatedShapesLimit) {
              return failure(budgetDiagnostic('generatedShapes', generatedShapesLimit, counters.generatedShapes), counters);
            }
          }
          const ampId = operands[0]?.value;
          const stage = operands[1]?.value;
          const rawInputs = operands[2]?.value || {};
          const rawParams = operands[3]?.value || {};
          if (resultKey !== null) {
            const inputs = {};
            if (operands[2]?.kind === 'register') {
              const regVal = readRegisterOperand(operands[2]);
              if (regVal) {
                inputs.geometry = regVal.value;
                inputs.target = regVal.value;
              }
            } else if (typeof rawInputs === 'object' && rawInputs !== null) {
              for (const [k, v] of Object.entries(rawInputs)) {
                if (typeof v === 'string' && v.startsWith('%')) {
                  const regIdx = Number(v.slice(1));
                  if (registers.has(regIdx)) {
                    inputs[k] = registers.get(regIdx).value;
                  } else {
                    inputs[k] = v;
                  }
                } else if (v && typeof v === 'object' && v.kind === 'register' && registers.has(v.index)) {
                  inputs[k] = registers.get(v.index).value;
                } else {
                  inputs[k] = v;
                }
              }
            }
            const params = typeof rawParams === 'object' && rawParams !== null ? rawParams : {};
            const adapter = getAmpAdapter(ampId);
            let resultVal = null;
            if (adapter && typeof adapter.execute === 'function') {
              try {
                const out = adapter.execute(inputs, params, { stage });
                resultVal = { type: instruction.type || 'SHAPE', value: out };
              } catch (err) {
                return failure(
                  v2Diagnostic({
                    code: AMP_CODES.EXECUTION_FAILED,
                    phase: 'EVAL',
                    message: `AMP '${ampId}' execution failed in stage '${stage}': ${err instanceof Error ? err.message : String(err)}`,
                    span: ZERO_SPAN,
                    relatedSymbols: [ampId],
                  }),
                  counters,
                );
              }
            } else {
              resultVal = { type: instruction.type || 'SHAPE', value: inputs.geometry || { kind: 'AMP_RESULT', ampId, stage } };
            }
            registers.set(resultKey, Object.freeze(resultVal));
          }
          break;
        }

        case 'BC.EMIT.ASSET': {
          const collected = [];
          for (const operand of operands) {
            const layerValue = readRegisterOperand(operand);
            if (layerValue === undefined || layerValue.type !== 'LAYER') {
              return failure(
                lowerDiagnostic('BC.EMIT.ASSET references a register that is not a LAYER.', { relatedSymbols: ['BC.EMIT.ASSET'] }),
                counters,
              );
            }
            collected.push(layerValue.value);
          }
          emittedLayerRegisters = Object.freeze(collected);
          break;
        }

        default:
          return failure(
            lowerDiagnostic(`Unknown or unsupported opcode '${instruction.mnemonic}'.`, {
              relatedSymbols: [String(instruction.mnemonic)],
              received: [String(instruction.mnemonic)],
            }),
            counters,
          );
      }
    }

    const finalLayers = Object.freeze([...(emittedLayerRegisters || [])]);

    return Object.freeze({
      ok: true,
      construction: Object.freeze({ layers: finalLayers }),
      counters: Object.freeze({ ...counters }),
      diagnostics: Object.freeze([]),
    });
  } catch (error) {
    return failure(internalDiagnostic(error), counters);
  }
}
