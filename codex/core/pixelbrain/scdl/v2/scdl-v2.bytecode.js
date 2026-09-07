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
import { makeRational, rationalToString, subRational } from './scdl-v2.rational.js';
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
    case 'STRING':
      return String(value);
    case 'BOOL':
      return String(Boolean(value));
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
    this.usesPath = false;
    this.usesMask = false;
    this.usesAmp = false;
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
    if (!resolved) return this.lowerLeaf('UNKNOWN', 'null');
    if (resolved.numerator !== undefined && resolved.denominator !== undefined) {
      return this.lowerLeaf('PX', resolved);
    }
    if (typeof resolved === 'number') {
      if (Number.isInteger(resolved)) return this.lowerLeaf('I32', resolved);
      return this.lowerLeaf('FIXED', resolved);
    }
    if (typeof resolved === 'string') {
      if (resolved.startsWith('#')) return this.lowerLeaf('COLOR', resolved);
      return this.lowerLeaf('STRING', resolved);
    }
    if (typeof resolved === 'boolean') {
      return this.lowerLeaf('BOOL', resolved);
    }
    if (resolved.type) {
      const type = resolved.type;
      switch (type) {
        case 'I32':
        case 'FIXED':
        case 'RATIO':
        case 'PX':
        case 'COLOR':
        case 'STRING':
        case 'BOOL':
          return this.lowerLeaf(type, resolved.value !== undefined ? resolved.value : resolved);
        case 'VEC2': {
          const xVal = resolved.value?.x !== undefined ? resolved.value.x : (Array.isArray(resolved.value) ? resolved.value[0] : resolved.value);
          const yVal = resolved.value?.y !== undefined ? resolved.value.y : (Array.isArray(resolved.value) ? resolved.value[1] : resolved.value);
          const xRegister = this.lowerValue(xVal);
          const yRegister = this.lowerValue(yVal);
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
        case 'ANGLE':
          return this.lowerAngle(resolved);
        case 'SHAPE':
          return this.lowerShape(resolved.value);
        case 'MASK':
          return this.lowerMask(resolved.value);
        default:
          return this.lowerLeaf(resolved.type || 'UNKNOWN', JSON.stringify(resolved.value !== undefined ? resolved.value : resolved));
      }
    }
    if (resolved.kind === 'ANGLE') {
      return this.lowerAngle(resolved);
    }
    if (resolved.x !== undefined && resolved.y !== undefined) {
      const xRegister = this.lowerValue(resolved.x);
      const yRegister = this.lowerValue(resolved.y);
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
    if (resolved.width !== undefined && resolved.height !== undefined) {
      const xRegister = this.lowerValue(resolved.width);
      const yRegister = this.lowerValue(resolved.height);
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
    if (resolved.value !== undefined) {
      return this.lowerValue(resolved.value);
    }
    return this.lowerLeaf('UNKNOWN', JSON.stringify(resolved));
  }

  lowerTransform(t) {
    if (!t) return this.lowerValue({ type: 'VEC2', value: { x: makeRational(0), y: makeRational(0) } });
    const offsetReg = this.lowerValue({
      type: 'VEC2',
      value: {
        x: t.tx !== undefined ? t.tx : makeRational(0),
        y: t.ty !== undefined ? t.ty : makeRational(0),
      },
    });
    const reg = this.nextRegister();
    this.emit('TRANSLATE', {
      resultRegister: reg,
      type: 'TRANSFORM',
      operands: [{ kind: 'register', index: offsetReg }],
    });
    return reg;
  }

  lowerMask(m) {
    this.usesMask = true;
    const shapeReg = this.lowerShape(m.shape || { kind: 'PIXEL', at: { type: 'VEC2', value: { x: makeRational(0), y: makeRational(0) } } });
    const reg = this.nextRegister();
    this.emit('TO_MASK', {
      resultRegister: reg,
      type: 'MASK',
      operands: [{ kind: 'register', index: shapeReg }],
    });
    return reg;
  }

  lowerAngle(angle) {
    if (!angle) return this.lowerValue({ type: 'I32', value: 0 });
    const angleObj = angle.value || angle;
    const unit = (angleObj.unit || 'DEGREES').toUpperCase();
    const rawVal = angleObj.raw !== undefined ? angleObj.raw : (angleObj.value !== undefined ? angleObj.value : angleObj);
    const valRegister = this.lowerValue(rawVal);
    const register = this.nextRegister();
    const mnemonic = (unit === 'RADIANS' || unit === 'RAD') ? 'RADIANS' : (unit === 'TURNS' || unit === 'TURN') ? 'TURNS' : 'DEGREES';
    this.emit(mnemonic, {
      resultRegister: register,
      type: 'ANGLE',
      operands: [{ kind: 'register', index: valRegister }],
    });
    return register;
  }

  lowerShape(shape) {
    if (!shape) throw new Error('Cannot lower null shape');

    if (shape.isFaceted) {
      this.usesAmp = true;
      const baseShape = { ...shape, isFaceted: false };
      if (baseShape.kind === 'FACETED_SHAPE') baseShape.kind = 'CIRCLE';
      const baseRegister = this.lowerShape(baseShape);
      const register = this.nextRegister();
      this.emit('BC.AMP.APPLY', {
        resultRegister: register,
        type: 'SHAPE',
        operands: [
          { kind: 'immediate', value: 'pixelbrain.facet' },
          { kind: 'immediate', value: 'SHAPE_POST' },
          { kind: 'immediate', value: { geometry: `%${baseRegister}` } },
          { kind: 'immediate', value: {} },
        ],
      });
      return register;
    }

    if (shape.kind === 'AMP_RESULT') {
      this.usesAmp = true;
      const inputs = {};
      if (shape.inputs && typeof shape.inputs === 'object') {
        for (const [k, v] of Object.entries(shape.inputs)) {
          if (v && typeof v === 'object' && v.kind) {
            const reg = this.lowerShape(v);
            inputs[k] = `%${reg}`;
          } else {
            inputs[k] = v;
          }
        }
      }
      const register = this.nextRegister();
      this.emit('BC.AMP.APPLY', {
        resultRegister: register,
        type: shape.outputType || 'SHAPE',
        operands: [
          { kind: 'immediate', value: shape.ampId },
          { kind: 'immediate', value: shape.stage || 'SHAPE_POST' },
          { kind: 'immediate', value: inputs },
          { kind: 'immediate', value: shape.params || {} },
        ],
      });
      return register;
    }

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

    if (shape.kind === 'CIRCLE') {
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

    if (shape.kind === 'LINE') {
      const fromRegister = this.lowerValue(shape.from);
      const toRegister = this.lowerValue(shape.to);
      const register = this.nextRegister();
      this.emit('LINE', {
        resultRegister: register,
        type: 'SHAPE',
        operands: [
          { kind: 'register', index: fromRegister },
          { kind: 'register', index: toRegister },
        ],
      });
      return register;
    }

    if (shape.kind === 'RECT') {
      const originRegister = this.lowerValue(shape.origin || shape.center);
      const sizeRegister = this.lowerValue(shape.size);
      const register = this.nextRegister();
      this.emit('RECT', {
        resultRegister: register,
        type: 'SHAPE',
        operands: [
          { kind: 'register', index: originRegister },
          { kind: 'register', index: sizeRegister },
        ],
      });
      return register;
    }

    if (shape.kind === 'ROUNDED_RECT') {
      const originRegister = this.lowerValue(shape.origin || shape.center);
      const sizeRegister = this.lowerValue(shape.size);
      const crRegister = this.lowerValue(shape.cornerRadius);
      const register = this.nextRegister();
      this.emit('ROUNDED_RECT', {
        resultRegister: register,
        type: 'SHAPE',
        operands: [
          { kind: 'register', index: originRegister },
          { kind: 'register', index: sizeRegister },
          { kind: 'register', index: crRegister },
        ],
      });
      return register;
    }

    if (shape.kind === 'RING') {
      const centerRegister = this.lowerValue(shape.center);
      const radiusRegister = this.lowerValue(shape.radius || shape.outerRadius);
      const thickness = shape.thickness || (
        shape.outerRadius && shape.innerRadius
          ? subRational(shape.outerRadius, shape.innerRadius)
          : shape.innerRadius
      );
      const thicknessRegister = this.lowerValue(thickness);
      const register = this.nextRegister();
      this.emit('RING', {
        resultRegister: register,
        type: 'SHAPE',
        operands: [
          { kind: 'register', index: centerRegister },
          { kind: 'register', index: radiusRegister },
          { kind: 'register', index: thicknessRegister },
        ],
      });
      return register;
    }

    if (shape.kind === 'ELLIPSE') {
      const centerRegister = this.lowerValue(shape.center);
      const rxRegister = this.lowerValue(shape.radiusX);
      const ryRegister = this.lowerValue(shape.radiusY);
      const register = this.nextRegister();
      this.emit('ELLIPSE', {
        resultRegister: register,
        type: 'SHAPE',
        operands: [
          { kind: 'register', index: centerRegister },
          { kind: 'register', index: rxRegister },
          { kind: 'register', index: ryRegister },
        ],
      });
      return register;
    }

    if (shape.kind === 'TRIANGLE') {
      const p1Register = this.lowerValue(shape.p1);
      const p2Register = this.lowerValue(shape.p2);
      const p3Register = this.lowerValue(shape.p3);
      const register = this.nextRegister();
      this.emit('TRIANGLE', {
        resultRegister: register,
        type: 'SHAPE',
        operands: [
          { kind: 'register', index: p1Register },
          { kind: 'register', index: p2Register },
          { kind: 'register', index: p3Register },
        ],
      });
      return register;
    }

    if (shape.kind === 'REGULAR_POLYGON') {
      const sidesRegister = this.lowerLeaf('I32', shape.sides);
      const radiusRegister = this.lowerValue(shape.radius);
      const centerRegister = this.lowerValue(shape.center);
      const register = this.nextRegister();
      this.emit('REGULAR_POLYGON', {
        resultRegister: register,
        type: 'SHAPE',
        operands: [
          { kind: 'register', index: sidesRegister },
          { kind: 'register', index: radiusRegister },
          { kind: 'register', index: centerRegister },
        ],
      });
      return register;
    }

    if (shape.kind === 'STAR') {
      const ptsRegister = this.lowerLeaf('I32', shape.points);
      const inRegister = this.lowerValue(shape.innerRadius);
      const outRegister = this.lowerValue(shape.outerRadius);
      const centerRegister = this.lowerValue(shape.center);
      const register = this.nextRegister();
      this.emit('STAR', {
        resultRegister: register,
        type: 'SHAPE',
        operands: [
          { kind: 'register', index: ptsRegister },
          { kind: 'register', index: inRegister },
          { kind: 'register', index: outRegister },
          { kind: 'register', index: centerRegister },
        ],
      });
      return register;
    }

    if (shape.kind === 'PATH') {
      this.usesPath = true;
      const dataRegister = this.lowerLeaf('STRING', shape.data || shape.d || '');
      const register = this.nextRegister();
      this.emit('PATH', {
        resultRegister: register,
        type: 'SHAPE',
        operands: [{ kind: 'register', index: dataRegister }],
      });
      return register;
    }

    if (shape.kind === 'CSG_UNION' || shape.kind === 'UNION') {
      const aRegister = this.lowerShape(shape.a);
      const bRegister = this.lowerShape(shape.b);
      const register = this.nextRegister();
      this.emit('UNION', {
        resultRegister: register,
        type: 'SHAPE',
        operands: [
          { kind: 'register', index: aRegister },
          { kind: 'register', index: bRegister },
        ],
      });
      return register;
    }

    if (shape.kind === 'CSG_SUBTRACT' || shape.kind === 'SUBTRACT') {
      const aRegister = this.lowerShape(shape.a);
      const bRegister = this.lowerShape(shape.b);
      const register = this.nextRegister();
      this.emit('SUBTRACT', {
        resultRegister: register,
        type: 'SHAPE',
        operands: [
          { kind: 'register', index: aRegister },
          { kind: 'register', index: bRegister },
        ],
      });
      return register;
    }

    if (shape.kind === 'CSG_INTERSECT' || shape.kind === 'INTERSECT') {
      const aRegister = this.lowerShape(shape.a);
      const bRegister = this.lowerShape(shape.b);
      const register = this.nextRegister();
      this.emit('INTERSECT', {
        resultRegister: register,
        type: 'SHAPE',
        operands: [
          { kind: 'register', index: aRegister },
          { kind: 'register', index: bRegister },
        ],
      });
      return register;
    }

    if (shape.kind === 'CSG_XOR' || shape.kind === 'XOR') {
      const aRegister = this.lowerShape(shape.a);
      const bRegister = this.lowerShape(shape.b);
      const register = this.nextRegister();
      this.emit('XOR', {
        resultRegister: register,
        type: 'SHAPE',
        operands: [
          { kind: 'register', index: aRegister },
          { kind: 'register', index: bRegister },
        ],
      });
      return register;
    }

    if (shape.kind === 'OUTLINE') {
      const baseRegister = this.lowerShape(shape.shape);
      const widthRegister = this.lowerValue(shape.width);
      const register = this.nextRegister();
      this.emit('OUTLINE', {
        resultRegister: register,
        type: 'SHAPE',
        operands: [
          { kind: 'register', index: baseRegister },
          { kind: 'register', index: widthRegister },
        ],
      });
      return register;
    }

    if (shape.kind === 'TRANSFORMED_SHAPE') {
      const baseRegister = this.lowerShape(shape.shape);
      const transRegister = this.lowerTransform(shape.transform);
      const register = this.nextRegister();
      this.emit('TRANSFORM_APPLY', {
        resultRegister: register,
        type: 'SHAPE',
        operands: [
          { kind: 'register', index: transRegister },
          { kind: 'register', index: baseRegister },
        ],
      });
      return register;
    }

    if (shape.kind === 'POLYLINE') {
      const ptRegisters = (shape.points || []).map((pt) => this.lowerValue(pt));
      const register = this.nextRegister();
      this.emit('POLYLINE', {
        resultRegister: register,
        type: 'SHAPE',
        operands: ptRegisters.map((reg) => ({ kind: 'register', index: reg })),
      });
      return register;
    }

    if (shape.kind === 'RAY') {
      const originRegister = this.lowerValue(shape.origin);
      const dirRegister = this.lowerValue(shape.dir);
      const lenRegister = this.lowerValue(shape.length);
      const register = this.nextRegister();
      this.emit('RAY', {
        resultRegister: register,
        type: 'SHAPE',
        operands: [
          { kind: 'register', index: originRegister },
          { kind: 'register', index: dirRegister },
          { kind: 'register', index: lenRegister },
        ],
      });
      return register;
    }

    if (shape.kind === 'ARC') {
      const centerRegister = this.lowerValue(shape.center);
      const radiusRegister = this.lowerValue(shape.radius);
      const startRegister = this.lowerAngle(shape.startAngle);
      const endRegister = this.lowerAngle(shape.endAngle);
      const register = this.nextRegister();
      this.emit('ARC', {
        resultRegister: register,
        type: 'SHAPE',
        operands: [
          { kind: 'register', index: centerRegister },
          { kind: 'register', index: radiusRegister },
          { kind: 'register', index: startRegister },
          { kind: 'register', index: endRegister },
        ],
      });
      return register;
    }

    if (shape.kind === 'SECTOR') {
      const centerRegister = this.lowerValue(shape.center);
      const radiusRegister = this.lowerValue(shape.radius);
      const startRegister = this.lowerAngle(shape.startAngle);
      const endRegister = this.lowerAngle(shape.endAngle);
      const register = this.nextRegister();
      this.emit('SECTOR', {
        resultRegister: register,
        type: 'SHAPE',
        operands: [
          { kind: 'register', index: centerRegister },
          { kind: 'register', index: radiusRegister },
          { kind: 'register', index: startRegister },
          { kind: 'register', index: endRegister },
        ],
      });
      return register;
    }

    if (shape.kind === 'POLYGON') {
      const vRegisters = (shape.vertices || []).map((v) => this.lowerValue(v));
      const register = this.nextRegister();
      this.emit('POLYGON', {
        resultRegister: register,
        type: 'SHAPE',
        operands: vRegisters.map((reg) => ({ kind: 'register', index: reg })),
      });
      return register;
    }

    if (shape.kind === 'COMPOUND') {
      const subShapes = Array.isArray(shape.shapes) ? shape.shapes : [];
      if (subShapes.length === 0) {
        throw new Error('Empty COMPOUND shape cannot be lowered');
      }
      if (subShapes.length === 1) {
        return this.lowerShape(subShapes[0]);
      }
      let curr = this.lowerShape(subShapes[0]);
      for (let i = 1; i < subShapes.length; i++) {
        const next = this.lowerShape(subShapes[i]);
        const uReg = this.nextRegister();
        this.emit('UNION', {
          resultRegister: uReg,
          type: 'SHAPE',
          operands: [
            { kind: 'register', index: curr },
            { kind: 'register', index: next },
          ],
        });
        curr = uReg;
      }
      return curr;
    }

    throw new Error(`Unsupported shape kind for bytecode lowering: '${shape.kind}'`);
  }

  lowerProgram(ir) {
    if (ir && Array.isArray(ir.masks) && ir.masks.length > 0) {
      this.usesMask = true;
    }

    if (ir && (ir.selectAmpsEnabled || (Array.isArray(ir.selectedAmps) && ir.selectedAmps.length > 0))) {
      this.usesAmp = true;
      const planIds = (ir.selectedAmps || []).map((a) => a.ampId);
      this.emit('BC.AMP.SELECT', {
        resultRegister: null,
        type: null,
        operands: [
          { kind: 'immediate', value: planIds },
        ],
      });
    }

    if (ir && Array.isArray(ir.selectedAmps) && ir.selectedAmps.length > 0) {
      this.usesAmp = true;
      for (const amp of ir.selectedAmps) {
        if (amp.source === 'EXPLICIT_APPLY') continue;
        this.emit('BC.AMP.APPLY', {
          resultRegister: null,
          type: null,
          operands: [
            { kind: 'immediate', value: amp.ampId },
            { kind: 'immediate', value: amp.stage },
            { kind: 'immediate', value: amp.inputs || {} },
            { kind: 'immediate', value: amp.params || {} },
          ],
        });
      }
    }

    const layers = Array.isArray(ir && ir.layers) ? ir.layers : [];
    const ordered = layers
      .map((layer, sourceIndex) => ({ layer, sourceIndex }))
      .sort((a, b) => (a.layer.order - b.layer.order) || (a.sourceIndex - b.sourceIndex));

    const layerRegisters = [];
    for (const { layer } of ordered) {
      const layerRegister = this.nextRegister();
      const operands = [
        { kind: 'immediate', value: layer.id },
        { kind: 'immediate', value: layer.order },
      ];
      if (
        (layer.blend && layer.blend !== 'OVER')
        || (layer.opacity !== undefined && layer.opacity !== 1.0)
        || layer.visible === false
      ) {
        operands.push({ kind: 'immediate', value: layer.blend || 'OVER' });
        operands.push({ kind: 'immediate', value: layer.opacity !== undefined ? layer.opacity : 1.0 });
        operands.push({ kind: 'immediate', value: layer.visible !== false });
      }
      this.emit('BC.LAYER.NEW', {
        resultRegister: layerRegister,
        type: 'LAYER',
        operands,
      });
      layerRegisters.push(layerRegister);

      const paints = Array.isArray(layer.paints) ? layer.paints : [];
      for (const paint of paints) {
        const shapeRegister = this.lowerShape(paint.shape);
        const fillRegister = this.lowerLeaf('COLOR', paint.fill || '#000000');

        if (paint.shape.kind === 'CIRCLE') {
          if (paint.raster === 'CENTER') this.usesCircleCenter = true;
          if (paint.raster === 'MIDPOINT') this.usesCircleMidpoint = true;
        }

        const paintOperands = [
          { kind: 'register', index: layerRegister },
          { kind: 'register', index: shapeRegister },
          { kind: 'register', index: fillRegister },
          { kind: 'immediate', value: paint.raster || 'CENTER' },
        ];

        if (
          paint.at
          || paint.clipTo
          || paint.material
          || (paint.blend && paint.blend !== 'OVER')
          || (paint.opacity !== undefined && paint.opacity !== 1.0)
        ) {
          const atReg = paint.at ? this.lowerValue(paint.at) : null;
          let clipReg = null;
          if (paint.clipTo) {
            clipReg = this.lowerMask(paint.clipTo);
          }
          paintOperands.push(atReg !== null ? { kind: 'register', index: atReg } : { kind: 'immediate', value: null });
          paintOperands.push(clipReg !== null ? { kind: 'register', index: clipReg } : { kind: 'immediate', value: null });
          paintOperands.push({ kind: 'immediate', value: paint.material || null });
          paintOperands.push({ kind: 'immediate', value: paint.blend || 'OVER' });
          paintOperands.push({ kind: 'immediate', value: paint.opacity !== undefined ? paint.opacity : 1.0 });
        }

        this.emit('BC.PAINT', { operands: paintOperands });
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
      if (Array.isArray(operand.value)) {
        return `[${operand.value.join(', ')}]`;
      }
      if (typeof operand.value === 'object' && operand.value !== null) {
        return JSON.stringify(operand.value);
      }
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

function buildSemanticText({ canvas, capabilities, algorithms, constants, instructions }) {
  const capList = capabilities || HEADER_CAPABILITIES;
  const lines = [
    `.module ${CONTRACT}`,
    `.language ${LANGUAGE}`,
    `.semantics ${SEMANTICS_VERSION}`,
    `.canvas ${canvas.width} ${canvas.height}`,
    ...capList.map((capability) => `.capability ${capability}`),
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
    const capabilities = [...HEADER_CAPABILITIES];
    if (lowerer.usesPath) capabilities.push('GEOMETRY.PATH@2.0');
    if (lowerer.usesMask) capabilities.push('PAINT.MASKS@2.0');
    if (lowerer.usesAmp) capabilities.push('MATERIAL.PIXELBRAIN@2.0');
    const algorithms = Object.freeze(algorithmLines(lowerer));
    const constants = Object.freeze(lowerer.constants);
    const instructions = Object.freeze(lowerer.instructions);
    const text = buildSemanticText({ canvas, capabilities, algorithms, constants, instructions });
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
      capabilities: Object.freeze(capabilities),
      algorithms,
      verifiedBudget: verifiedBudget || null,
      constants,
      instructions,
      text,
      debugMap,
    });
  } catch {
    return emptyProgram(ir, verifiedBudget);
  }
}
