// Canonical SSA-style bytecode lowering for SCDL v2 resolved IR (Task 5's
// analyzer output, gated by Task 6's scdl-v2.budget.js). This is the single
// source of a program's *semantic identity*: two source texts that lower to
// the same instructions produce byte-identical `text` and therefore the same
// `programId`, regardless of comments, whitespace, the asset name, or the
// spelling of local `$symbol`s.
//
// Lowering walks only what a program actually outputs — its LAYER/PAINT
// statements, in ascending `order` (ties broken by declaration order) — not
// its raw CONST/SHAPE declaration lists. A CONST or SHAPE a PAINT never
// reaches is dead: it costs no budget (scdl-v2.budget.js agrees) and emits no
// instruction. Everything reachable is lowered depth-first, left-to-right,
// visiting each opcode's named operands in the order scdl-v2.opcodes.js
// declares them (e.g. CIRCLE's CENTER before its RADIUS).
//
// Two lowering rules produce the SSA shape:
//   - Every value-producing instruction gets the next `%N` register.
//   - Leaf constants (I32/FIXED/RATIO/PX/COLOR) are interned into a single
//     first-occurrence constant pool keyed by (type, canonical text): the
//     same literal value appearing twice anywhere in the program shares one
//     BC.CONST and one register. Composite constructors (VEC2/PIXEL/CIRCLE)
//     are NOT deduplicated — each occurrence in the walk gets its own fresh
//     instruction, since only "literals" are specified as interned.
//
// A PX/FIXED/RATIO value's original scalar shape (was it typed from an I32
// literal, a decimal, or a MUL/DIV result?) is not recoverable from resolved
// IR — analysis folds it down to a single reduced rational and nothing else
// records provenance. So PX/FIXED/RATIO are lowered as direct typed leaf
// constants (their reduced `n/d` text), not decomposed into a separate
// scalar-then-PX-cast instruction pair.
//
// lowerSCDLV2Bytecode never throws: on any unexpected internal failure it
// returns an (otherwise empty) frozen program object with `programId: null`
// rather than raising.

import { getSCDLV2Opcode } from './scdl-v2.opcodes.js';
import { rationalToString } from './scdl-v2.rational.js';
import { hashString } from '../../shared.js';

const CONTRACT = 'SCDL-BC-v2';
const LANGUAGE = '2.0';
const SEMANTICS_VERSION = '2.0.0';

// Always declared, in this order, regardless of program content — these
// name the opcode families available to SCDL v2, not the ones this specific
// program happens to use.
const HEADER_CAPABILITIES = Object.freeze(['CORE.MATH@2.0', 'GEOMETRY.STANDARD@2.0', 'PAINT.LAYERS@2.0']);

const RATIONAL_ALGORITHM = 'rational=RAT-REDUCED-v1';
const CIRCLE_CENTER_ALGORITHM = 'circle.center=CIRCLE-FILL-CENTER-v1';
const CIRCLE_MIDPOINT_ALGORITHM = 'circle.midpoint=CIRCLE-FILL-MIDPOINT-v1';

function leafValueText(type, value) {
  switch (type) {
    case 'I32':
      return String(value);
    case 'FIXED':
    case 'RATIO':
    case 'PX':
      return rationalToString(value);
    case 'COLOR':
      return String(value).toLowerCase();
    default:
      return String(value);
  }
}

// Depth-first lowering state for one program. A fresh instance is created
// per lowerSCDLV2Bytecode call — no state survives across programs.
class Lowerer {
  constructor() {
    this.instructions = [];
    this.constants = [];
    this.internedLeaves = new Map();
    this.registerCounter = 0;
    this.usesRational = false;
    this.usesCircleCenter = false;
    this.usesCircleMidpoint = false;
  }

  nextRegister() {
    const register = this.registerCounter;
    this.registerCounter += 1;
    return register;
  }

  emit(mnemonic, { resultRegister = null, type = null, operands = [] } = {}) {
    const definition = getSCDLV2Opcode(mnemonic);
    if (!definition) throw new Error(`scdl-v2.bytecode: unknown mnemonic ${mnemonic}`);
    const instruction = Object.freeze({
      index: this.instructions.length,
      opcodeId: definition.id,
      mnemonic,
      result: resultRegister === null ? null : `%${resultRegister}`,
      type,
      operands: Object.freeze(operands.map((operand) => Object.freeze({ ...operand }))),
    });
    this.instructions.push(instruction);
    return instruction;
  }

  lowerLeaf(type, value) {
    const text = leafValueText(type, value);
    const key = `${type}:${text}`;
    const cached = this.internedLeaves.get(key);
    if (cached !== undefined) return cached;

    const constantIndex = this.constants.length;
    this.constants.push(Object.freeze({ index: constantIndex, type, value: text }));

    const register = this.nextRegister();
    this.emit('BC.CONST', {
      resultRegister: register,
      type,
      operands: [{ kind: 'constant', index: constantIndex }],
    });
    this.internedLeaves.set(key, register);
    if (type === 'FIXED' || type === 'RATIO' || type === 'PX') this.usesRational = true;
    return register;
  }

  // Lowers a resolved `{ type, value }` numeric/color/VEC2 value.
  lowerValue(resolved) {
    switch (resolved.type) {
      case 'I32':
      case 'FIXED':
      case 'RATIO':
      case 'PX':
      case 'COLOR':
        return this.lowerLeaf(resolved.type, resolved.value);
      case 'VEC2': {
        const xRegister = this.lowerValue(resolved.value.x);
        const yRegister = this.lowerValue(resolved.value.y);
        const register = this.nextRegister();
        this.emit('VEC2', {
          resultRegister: register,
          type: 'VEC2',
          operands: [
            { kind: 'register', index: xRegister },
            { kind: 'register', index: yRegister },
          ],
        });
        return register;
      }
      default:
        // Defensive: an IR value shape this lowering does not know about.
        // Fall back to an opaque leaf so lowering still terminates without
        // throwing, rather than trusting an unrecognized nested shape.
        return this.lowerLeaf(resolved.type || 'UNKNOWN', JSON.stringify(resolved.value));
    }
  }

  // Lowers a resolved SHAPE value (`{ kind: 'PIXEL', at }` or
  // `{ kind: 'CIRCLE', center, radius }`), visiting named operands in the
  // order scdl-v2.opcodes.js declares them for that opcode.
  lowerShape(shape) {
    if (shape.kind === 'PIXEL') {
      const atRegister = this.lowerValue(shape.at);
      const pixelRegister = this.nextRegister();
      this.emit('PIXEL', {
        resultRegister: pixelRegister,
        type: 'SHAPE',
        operands: [{ kind: 'register', index: atRegister }],
      });
      return pixelRegister;
    }

    // CIRCLE: operand order is CENTER then RADIUS, per opcodes.js.
    const centerRegister = this.lowerValue(shape.center);
    const radiusRegister = this.lowerValue(shape.radius);
    const register = this.nextRegister();
    this.emit('CIRCLE', {
      resultRegister: register,
      type: 'SHAPE',
      operands: [
        { kind: 'register', index: centerRegister },
        { kind: 'register', index: radiusRegister },
      ],
    });
    return register;
  }

  lowerProgram(ir) {
    const layers = Array.isArray(ir && ir.layers) ? ir.layers : [];
    const ordered = layers
      .map((layer, sourceIndex) => ({ layer, sourceIndex }))
      .sort((a, b) => (a.layer.order - b.layer.order) || (a.sourceIndex - b.sourceIndex));

    const layerRegisters = [];
    for (const { layer } of ordered) {
      const layerRegister = this.nextRegister();
      this.emit('BC.LAYER.NEW', {
        resultRegister: layerRegister,
        type: 'LAYER',
        operands: [
          { kind: 'immediate', value: layer.id },
          { kind: 'immediate', value: layer.order },
        ],
      });
      layerRegisters.push(layerRegister);

      const paints = Array.isArray(layer.paints) ? layer.paints : [];
      for (const paint of paints) {
        const shapeRegister = this.lowerShape(paint.shape);
        const fillRegister = this.lowerLeaf('COLOR', paint.fill);

        if (paint.shape.kind === 'CIRCLE') {
          if (paint.raster === 'CENTER') this.usesCircleCenter = true;
          if (paint.raster === 'MIDPOINT') this.usesCircleMidpoint = true;
        }

        this.emit('BC.PAINT', {
          operands: [
            { kind: 'register', index: layerRegister },
            { kind: 'register', index: shapeRegister },
            { kind: 'register', index: fillRegister },
            { kind: 'immediate', value: paint.raster },
          ],
        });
      }
    }

    this.emit('BC.EMIT.ASSET', {
      operands: layerRegisters.map((index) => ({ kind: 'register', index })),
    });

    return layerRegisters;
  }
}

function algorithmLines(lowerer) {
  const lines = [];
  if (lowerer.usesRational) lines.push(RATIONAL_ALGORITHM);
  if (lowerer.usesCircleCenter) lines.push(CIRCLE_CENTER_ALGORITHM);
  if (lowerer.usesCircleMidpoint) lines.push(CIRCLE_MIDPOINT_ALGORITHM);
  return lines;
}

function operandText(operand) {
  switch (operand.kind) {
    case 'constant':
      return `$k${operand.index}`;
    case 'register':
      return `%${operand.index}`;
    case 'immediate':
      return String(operand.value);
    default:
      return String(operand.value);
  }
}

function instructionLineText(instruction) {
  const operands = instruction.operands.map(operandText).join(' ');
  const prefix = instruction.result !== null ? `${instruction.result} = ` : '';
  return `${prefix}${instruction.mnemonic}${operands ? ` ${operands}` : ''}`;
}

function buildSemanticText({ canvas, algorithms, constants, instructions }) {
  const lines = [
    `.module ${CONTRACT}`,
    `.language ${LANGUAGE}`,
    `.semantics ${SEMANTICS_VERSION}`,
    `.canvas ${canvas.width} ${canvas.height}`,
    ...HEADER_CAPABILITIES.map((capability) => `.capability ${capability}`),
    ...algorithms.map((algorithm) => `.algorithm ${algorithm}`),
    ...constants.map((entry) => `.const $k${entry.index}:${entry.type.toLowerCase()} ${entry.value}`),
    ...instructions.map(instructionLineText),
  ];
  return `${lines.join('\n')}\n`;
}

function emptyProgram(ir, verifiedBudget) {
  const canvas = ir && ir.canvas ? Object.freeze({ width: ir.canvas.width, height: ir.canvas.height }) : Object.freeze({ width: 0, height: 0 });
  return Object.freeze({
    contract: CONTRACT,
    language: LANGUAGE,
    semanticsVersion: SEMANTICS_VERSION,
    programId: null,
    canvas,
    capabilities: HEADER_CAPABILITIES,
    algorithms: Object.freeze([]),
    verifiedBudget: verifiedBudget || null,
    constants: Object.freeze([]),
    instructions: Object.freeze([]),
    text: '',
    debugMap: Object.freeze([]),
  });
}

export function lowerSCDLV2Bytecode(ir, verifiedBudget) {
  try {
    const lowerer = new Lowerer();
    lowerer.lowerProgram(ir);

    const canvas = ir && ir.canvas
      ? Object.freeze({ width: ir.canvas.width, height: ir.canvas.height })
      : Object.freeze({ width: 0, height: 0 });
    const algorithms = Object.freeze(algorithmLines(lowerer));
    const constants = Object.freeze(lowerer.constants);
    const instructions = Object.freeze(lowerer.instructions);
    const text = buildSemanticText({ canvas, algorithms, constants, instructions });
    const programId = `scdlbc_${hashString(text).toString(16).padStart(8, '0')}`;
    const debugMap = Object.freeze(
      instructions.map((instruction) => Object.freeze({ instruction: instruction.index, span: null })),
    );

    return Object.freeze({
      contract: CONTRACT,
      language: LANGUAGE,
      semanticsVersion: SEMANTICS_VERSION,
      programId,
      canvas,
      capabilities: HEADER_CAPABILITIES,
      algorithms,
      verifiedBudget: verifiedBudget || null,
      constants,
      instructions,
      text,
      debugMap,
    });
  } catch {
    // Never throw across this public boundary: an internal error (malformed
    // IR shape, unexpected opcode) falls back to an empty, identifiable
    // (programId: null) program rather than crashing the caller.
    return emptyProgram(ir, verifiedBudget);
  }
}
