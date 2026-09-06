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
//   LAYER                     -> value: the mutable-until-EMIT layer record
//   SHAPE                     -> value: { kind: 'PIXEL', at } | { kind: 'CIRCLE', center, radius }
//
// evaluateSCDLV2 never throws: any internal failure — an unknown opcode, a
// missing register, a wrong runtime type — is reported as SCDL-LOWER-001; a
// runtime counter crossing `verifiedBudget.limits` is reported as
// SCDL-BUDGET-003. Both return `{ ok: false, construction: null, ... }`.

import { v2Diagnostic, span } from './scdl-v2.diagnostics.js';
import { makeRational } from './scdl-v2.rational.js';

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
    const limits = (program && program.verifiedBudget && program.verifiedBudget.limits) || {};
    const instructionLimit = Number.isFinite(limits.instructions) ? limits.instructions : Infinity;
    const generatedShapesLimit = Number.isFinite(limits.generatedShapes) ? limits.generatedShapes : Infinity;

    const constants = Array.isArray(program && program.constants) ? program.constants : [];
    const instructions = Array.isArray(program && program.instructions) ? program.instructions : [];

    const registers = new Map();
    const layerRecords = []; // every BC.LAYER.NEW record, in creation order
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

        case 'BC.LAYER.NEW': {
          const idOperand = operands[0];
          const orderOperand = operands[1];
          if (!idOperand || idOperand.kind !== 'immediate' || !orderOperand || orderOperand.kind !== 'immediate' || resultKey === null) {
            return failure(
              lowerDiagnostic('BC.LAYER.NEW requires immediate ID and ORDER operands.', { relatedSymbols: ['BC.LAYER.NEW'] }),
              counters,
            );
          }
          const layerRecord = {
            id: idOperand.value,
            order: orderOperand.value,
            sourceIndex: layerRecords.length,
            paints: [],
          };
          layerRecords.push(layerRecord);
          registers.set(resultKey, { type: 'LAYER', value: layerRecord });
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
          layerValue.value.paints.push(Object.freeze({
            shape: shapeValue.value,
            fill: fillValue.value,
            raster: rasterOperand.value,
          }));
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
          emittedLayerRegisters = collected;
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

    const finalLayers = (emittedLayerRegisters || []).map((layerRecord) => Object.freeze({
      id: layerRecord.id,
      order: layerRecord.order,
      sourceIndex: layerRecord.sourceIndex,
      paints: Object.freeze([...layerRecord.paints]),
    }));

    return Object.freeze({
      ok: true,
      construction: Object.freeze({ layers: Object.freeze(finalLayers) }),
      counters: Object.freeze({ ...counters }),
      diagnostics: Object.freeze([]),
    });
  } catch (error) {
    return failure(internalDiagnostic(error), counters);
  }
}
