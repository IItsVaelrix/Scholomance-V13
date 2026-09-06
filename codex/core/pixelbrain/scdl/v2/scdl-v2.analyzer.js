import { span, v2Diagnostic } from './scdl-v2.diagnostics.js';
import {
  SCDL_V2_TYPES, NUMERIC_TYPES, SCALAR_TYPES, TYPE_CODES, BIND_CODES, I32_MIN, I32_MAX,
} from './scdl-v2.types.js';
import { makeRational, mulRational, divRational, addRational, subRational, parseRational } from './scdl-v2.rational.js';

const I32_MIN_BIG = BigInt(I32_MIN);
const I32_MAX_BIG = BigInt(I32_MAX);
const ZERO_SPAN = span({ line: 1, column: 1, offset: 0 });

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function pushDiagnostic(diagnostics, {
  code, phase = 'ANALYSIS', message, nodeSpan, expected = [], received = [], relatedSymbols = [],
}) {
  diagnostics.push(v2Diagnostic({
    code,
    phase,
    message,
    span: nodeSpan || ZERO_SPAN,
    expected,
    received,
    relatedSymbols,
  }));
}

function normalizeDecimalRaw(raw) {
  if (raw.startsWith('-.')) return `-0${raw.slice(1)}`;
  if (raw.startsWith('.')) return `0${raw}`;
  return raw;
}

// Converts a resolved numeric value's payload to a rational pair for
// arithmetic. I32 is stored as a plain integer; FIXED/RATIO/PX already carry
// a rational { numerator, denominator } payload.
function toRational(resolved) {
  return resolved.type === 'I32' ? makeRational(BigInt(resolved.value)) : resolved.value;
}

function inI32Range(big) {
  return big >= I32_MIN_BIG && big <= I32_MAX_BIG;
}

// ---------------------------------------------------------------------------
// Expression evaluation
// ---------------------------------------------------------------------------

function evaluateExpression(node, symbols, diagnostics) {
  switch (node.kind) {
    case 'Literal': return evaluateLiteral(node, diagnostics);
    case 'SymbolRef': return evaluateSymbolRef(node, symbols, diagnostics);
    case 'CallExpression': return evaluateCall(node, symbols, diagnostics);
    default:
      pushDiagnostic(diagnostics, {
        code: TYPE_CODES.INVALID_OPERATION,
        message: `Cannot evaluate expression of kind ${node.kind}.`,
        nodeSpan: node.span,
      });
      return null;
  }
}

function evaluateLiteral(node, diagnostics) {
  switch (node.literalKind) {
    case 'INTEGER': {
      const value = node.value;
      if (!Number.isInteger(value) || value < I32_MIN || value > I32_MAX) {
        pushDiagnostic(diagnostics, {
          code: TYPE_CODES.RANGE,
          message: `Integer literal ${node.raw} is outside the signed 32-bit range.`,
          nodeSpan: node.span,
          expected: [`${I32_MIN}..${I32_MAX}`],
          received: [node.raw],
        });
        return null;
      }
      return Object.freeze({ type: 'I32', value });
    }
    case 'DECIMAL': {
      try {
        const rational = parseRational(normalizeDecimalRaw(node.raw));
        return Object.freeze({ type: 'FIXED', value: rational });
      } catch {
        pushDiagnostic(diagnostics, {
          code: TYPE_CODES.INVALID_OPERATION,
          message: `Invalid exact decimal literal ${node.raw}.`,
          nodeSpan: node.span,
          received: [node.raw],
        });
        return null;
      }
    }
    case 'COLOR':
      return Object.freeze({ type: 'COLOR', value: node.value });
    default:
      pushDiagnostic(diagnostics, {
        code: TYPE_CODES.INVALID_OPERATION,
        message: `Identifier ${JSON.stringify(node.raw)} cannot be used as a value expression.`,
        nodeSpan: node.span,
        received: [node.raw],
      });
      return null;
  }
}

function evaluateSymbolRef(node, symbols, diagnostics) {
  if (!symbols.has(node.name)) {
    pushDiagnostic(diagnostics, {
      code: BIND_CODES.UNKNOWN_SYMBOL,
      message: `Symbol ${node.name} is not bound.`,
      nodeSpan: node.span,
      relatedSymbols: [node.name],
    });
    return null;
  }
  return symbols.get(node.name);
}

function evaluateCall(node, symbols, diagnostics) {
  switch (node.opcode) {
    case 'ADD': return evaluateAddSub(node, symbols, diagnostics, addRational, (a, b) => a + b);
    case 'SUB': return evaluateAddSub(node, symbols, diagnostics, subRational, (a, b) => a - b);
    case 'MUL': return evaluateMul(node, symbols, diagnostics);
    case 'DIV': return evaluateDiv(node, symbols, diagnostics);
    case 'PX': return evaluatePx(node, symbols, diagnostics);
    case 'VEC2': return evaluateVec2(node, symbols, diagnostics);
    case 'PIXEL': return evaluatePixel(node, symbols, diagnostics);
    case 'CIRCLE': return evaluateCircle(node, symbols, diagnostics);
    default:
      pushDiagnostic(diagnostics, {
        code: TYPE_CODES.INVALID_OPERATION,
        message: `Opcode ${node.opcode} is not a valid analyzed expression.`,
        nodeSpan: node.span,
        received: [node.opcode],
      });
      return null;
  }
}

function evaluateAddSub(node, symbols, diagnostics, rationalOp, bigIntOp) {
  const [leftNode, rightNode] = node.positional;
  const left = evaluateExpression(leftNode, symbols, diagnostics);
  const right = evaluateExpression(rightNode, symbols, diagnostics);
  if (!left || !right) return null;

  if (!NUMERIC_TYPES.includes(left.type) || left.type !== right.type) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: `${node.opcode} requires two operands of the same I32, FIXED, RATIO, or PX type.`,
      nodeSpan: node.span,
      expected: [left.type],
      received: [right.type],
    });
    return null;
  }

  if (left.type === 'I32') {
    const result = bigIntOp(BigInt(left.value), BigInt(right.value));
    if (!inI32Range(result)) {
      pushDiagnostic(diagnostics, {
        code: TYPE_CODES.RANGE,
        message: `${node.opcode} result is outside the signed 32-bit range.`,
        nodeSpan: node.span,
        expected: [`${I32_MIN}..${I32_MAX}`],
        received: [result.toString(10)],
      });
      return null;
    }
    return Object.freeze({ type: 'I32', value: Number(result) });
  }

  const rational = rationalOp(left.value, right.value);
  return Object.freeze({ type: left.type, value: rational });
}

function evaluateMul(node, symbols, diagnostics) {
  const [leftNode, rightNode] = node.positional;
  const left = evaluateExpression(leftNode, symbols, diagnostics);
  const right = evaluateExpression(rightNode, symbols, diagnostics);
  if (!left || !right) return null;

  const leftIsPx = left.type === 'PX';
  const rightIsPx = right.type === 'PX';
  const leftIsScalar = SCALAR_TYPES.includes(left.type);
  const rightIsScalar = SCALAR_TYPES.includes(right.type);

  if (leftIsScalar && rightIsScalar) {
    if (left.type === 'I32' && right.type === 'I32') {
      const result = BigInt(left.value) * BigInt(right.value);
      if (!inI32Range(result)) {
        pushDiagnostic(diagnostics, {
          code: TYPE_CODES.RANGE,
          message: 'MUL result is outside the signed 32-bit range.',
          nodeSpan: node.span,
          expected: [`${I32_MIN}..${I32_MAX}`],
          received: [result.toString(10)],
        });
        return null;
      }
      return Object.freeze({ type: 'I32', value: Number(result) });
    }
    return Object.freeze({ type: 'RATIO', value: mulRational(toRational(left), toRational(right)) });
  }

  if ((leftIsPx && rightIsScalar) || (rightIsPx && leftIsScalar)) {
    const pxOperand = leftIsPx ? left : right;
    const scalarOperand = leftIsPx ? right : left;
    return Object.freeze({ type: 'PX', value: mulRational(toRational(pxOperand), toRational(scalarOperand)) });
  }

  pushDiagnostic(diagnostics, {
    code: TYPE_CODES.INVALID_OPERATION,
    message: 'MUL requires I32xI32, scalarxscalar, or PXxscalar operands.',
    nodeSpan: node.span,
    expected: ['I32', 'FIXED', 'RATIO', 'PX'],
    received: [left.type, right.type],
  });
  return null;
}

function evaluateDiv(node, symbols, diagnostics) {
  const [leftNode, rightNode] = node.positional;
  const left = evaluateExpression(leftNode, symbols, diagnostics);
  const right = evaluateExpression(rightNode, symbols, diagnostics);
  if (!left || !right) return null;

  if (!NUMERIC_TYPES.includes(left.type) || !SCALAR_TYPES.includes(right.type)) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.INVALID_OPERATION,
      message: 'DIV requires a numeric numerator and a scalar (I32, FIXED, or RATIO) divisor.',
      nodeSpan: node.span,
      expected: ['I32', 'FIXED', 'RATIO', 'PX'],
      received: [left.type, right.type],
    });
    return null;
  }

  const divisor = toRational(right);
  if (divisor.numerator === '0') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.DIVISION_BY_ZERO,
      message: 'DIV divisor must be nonzero.',
      nodeSpan: node.span,
      received: [right.type],
    });
    return null;
  }

  // Belt-and-suspenders: makeRational (reached via divRational) throws a
  // RangeError on a zero denominator. The explicit zero check above should
  // always catch it first, but this boundary must never let that exception
  // escape regardless, so it is still caught here.
  let rational;
  try {
    rational = divRational(toRational(left), divisor);
  } catch (error) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.DIVISION_BY_ZERO,
      message: error instanceof Error ? error.message : 'DIV divisor must be nonzero.',
      nodeSpan: node.span,
    });
    return null;
  }

  const resultType = left.type === 'PX' ? 'PX' : 'RATIO';
  return Object.freeze({ type: resultType, value: rational });
}

function evaluatePx(node, symbols, diagnostics) {
  const [valueNode] = node.positional;
  const value = evaluateExpression(valueNode, symbols, diagnostics);
  if (!value) return null;
  if (!SCALAR_TYPES.includes(value.type)) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: 'PX requires an I32, FIXED, or RATIO operand.',
      nodeSpan: node.span,
      expected: ['I32', 'FIXED', 'RATIO'],
      received: [value.type],
    });
    return null;
  }
  return Object.freeze({ type: 'PX', value: toRational(value) });
}

function evaluateVec2(node, symbols, diagnostics) {
  const [xNode, yNode] = node.positional;
  const x = evaluateExpression(xNode, symbols, diagnostics);
  const y = evaluateExpression(yNode, symbols, diagnostics);
  if (!x || !y) return null;
  if (x.type !== 'PX' || y.type !== 'PX') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: 'VEC2 requires PX operands for both X and Y.',
      nodeSpan: node.span,
      expected: ['PX'],
      received: [x.type, y.type],
    });
    return null;
  }
  return Object.freeze({ type: 'VEC2', value: Object.freeze({ x, y }) });
}

function evaluatePixel(node, symbols, diagnostics) {
  const at = evaluateExpression(node.named.AT, symbols, diagnostics);
  if (!at) return null;
  if (at.type !== 'VEC2') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: 'PIXEL AT operand must be VEC2.',
      nodeSpan: node.span,
      expected: ['VEC2'],
      received: [at.type],
    });
    return null;
  }
  return Object.freeze({ type: 'SHAPE', value: Object.freeze({ kind: 'PIXEL', at }) });
}

function evaluateCircle(node, symbols, diagnostics) {
  const center = evaluateExpression(node.named.CENTER, symbols, diagnostics);
  const radius = evaluateExpression(node.named.RADIUS, symbols, diagnostics);
  if (!center || !radius) return null;
  if (center.type !== 'VEC2') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: 'CIRCLE CENTER operand must be VEC2.',
      nodeSpan: node.span,
      expected: ['VEC2'],
      received: [center.type],
    });
    return null;
  }
  if (radius.type !== 'PX') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: 'CIRCLE RADIUS operand must be PX.',
      nodeSpan: node.span,
      expected: ['PX'],
      received: [radius.type],
    });
    return null;
  }
  if (radius.value.numerator.startsWith('-')) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.RANGE,
      message: 'CIRCLE RADIUS must be non-negative.',
      nodeSpan: node.span,
      expected: ['>= 0'],
      received: [`${radius.value.numerator}/${radius.value.denominator}`],
    });
    return null;
  }
  return Object.freeze({ type: 'SHAPE', value: Object.freeze({ kind: 'CIRCLE', center, radius }) });
}

// ---------------------------------------------------------------------------
// Declaration analysis
// ---------------------------------------------------------------------------

function evaluateStructuralInt(node, symbols, diagnostics, label) {
  const resolved = evaluateExpression(node, symbols, diagnostics);
  if (!resolved) return null;
  if (resolved.type !== 'I32') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: `${label} must be an I32 expression.`,
      nodeSpan: node.span,
      expected: ['I32'],
      received: [resolved.type],
    });
    return null;
  }
  return resolved.value;
}

function analyzeConstDeclaration(declaration, symbols, diagnostics, constants) {
  const declaredType = declaration.declaredType;
  if (!SCDL_V2_TYPES.includes(declaredType)) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.UNKNOWN_TYPE,
      message: `Unknown CONST type ${declaredType}.`,
      nodeSpan: declaration.span,
      expected: [...SCDL_V2_TYPES],
      received: [declaredType],
    });
    return;
  }

  const resolved = evaluateExpression(declaration.value, symbols, diagnostics);
  if (!resolved) return;

  if (resolved.type !== declaredType) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: `CONST ${declaration.symbol} declared as ${declaredType} but evaluated to ${resolved.type}.`,
      nodeSpan: declaration.span,
      expected: [declaredType],
      received: [resolved.type],
    });
    return;
  }

  if (symbols.has(declaration.symbol)) {
    pushDiagnostic(diagnostics, {
      code: BIND_CODES.DUPLICATE_SYMBOL,
      message: `Symbol ${declaration.symbol} is already bound.`,
      nodeSpan: declaration.span,
      relatedSymbols: [declaration.symbol],
    });
    return;
  }

  symbols.set(declaration.symbol, resolved);
  constants.push(Object.freeze({ symbol: declaration.symbol, type: resolved.type, value: resolved.value }));
}

function analyzeShapeDeclaration(declaration, symbols, diagnostics, shapes) {
  const resolved = evaluateExpression(declaration.value, symbols, diagnostics);
  if (!resolved) return;

  if (resolved.type !== 'SHAPE') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: `SHAPE ${declaration.symbol} must evaluate to a SHAPE value.`,
      nodeSpan: declaration.span,
      expected: ['SHAPE'],
      received: [resolved.type],
    });
    return;
  }

  if (symbols.has(declaration.symbol)) {
    pushDiagnostic(diagnostics, {
      code: BIND_CODES.DUPLICATE_SYMBOL,
      message: `Symbol ${declaration.symbol} is already bound.`,
      nodeSpan: declaration.span,
      relatedSymbols: [declaration.symbol],
    });
    return;
  }

  symbols.set(declaration.symbol, resolved);
  shapes.push(Object.freeze({ symbol: declaration.symbol, value: resolved.value }));
}

function analyzeLayerDeclaration(declaration, symbols, diagnostics, layers) {
  const order = evaluateStructuralInt(declaration.order, symbols, diagnostics, 'LAYER ORDER');

  const paints = [];
  for (const statement of declaration.body) {
    if (statement.kind !== 'PaintStatement') continue;
    const shapeValue = evaluateExpression(statement.shape, symbols, diagnostics);
    const fill = evaluateExpression(statement.fill, symbols, diagnostics);
    if (!shapeValue || !fill) continue;

    if (shapeValue.type !== 'SHAPE') {
      pushDiagnostic(diagnostics, {
        code: TYPE_CODES.MISMATCH,
        message: 'PAINT requires a SHAPE operand.',
        nodeSpan: statement.span,
        expected: ['SHAPE'],
        received: [shapeValue.type],
      });
      continue;
    }
    if (fill.type !== 'COLOR') {
      pushDiagnostic(diagnostics, {
        code: TYPE_CODES.MISMATCH,
        message: 'PAINT FILL requires a COLOR operand.',
        nodeSpan: statement.span,
        expected: ['COLOR'],
        received: [fill.type],
      });
      continue;
    }
    paints.push(Object.freeze({ shape: shapeValue.value, fill: fill.value, raster: statement.raster.value }));
  }

  if (order === null) return;
  layers.push(Object.freeze({ id: declaration.id.value, order, paints: Object.freeze(paints) }));
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

function isPreParsedV2Ast(value) {
  return typeof value === 'object' && value !== null && Array.isArray(value.declarations);
}

export function analyzeSCDLV2(ast) {
  const diagnostics = [];

  if (!isPreParsedV2Ast(ast)) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.INVALID_OPERATION,
      message: 'analyzeSCDLV2 requires a successfully parsed AST.',
      nodeSpan: ZERO_SPAN,
    });
    return Object.freeze({ ok: false, ir: null, symbols: new Map(), diagnostics: Object.freeze(diagnostics) });
  }

  const symbols = new Map();

  try {
    let assetId = null;
    let canvas = null;
    let requestedBudget = null;
    const constants = [];
    const shapes = [];
    const layers = [];

    for (const declaration of ast.declarations) {
      switch (declaration.kind) {
        case 'VersionDeclaration':
          break;
        case 'AssetDeclaration':
          assetId = declaration.id.value;
          break;
        case 'CanvasDeclaration': {
          const width = evaluateStructuralInt(declaration.width, symbols, diagnostics, 'CANVAS WIDTH');
          const height = evaluateStructuralInt(declaration.height, symbols, diagnostics, 'CANVAS HEIGHT');
          if (width !== null && height !== null) canvas = Object.freeze({ width, height });
          break;
        }
        case 'BudgetDeclaration': {
          const instructions = evaluateStructuralInt(declaration.instructions, symbols, diagnostics, 'BUDGET INSTRUCTIONS');
          const generatedShapes = evaluateStructuralInt(declaration.generatedShapes, symbols, diagnostics, 'BUDGET GENERATED_SHAPES');
          const rasterCells = evaluateStructuralInt(declaration.rasterCells, symbols, diagnostics, 'BUDGET RASTER_CELLS');
          if (instructions !== null && generatedShapes !== null && rasterCells !== null) {
            requestedBudget = Object.freeze({ instructions, generatedShapes, rasterCells });
          }
          break;
        }
        case 'ConstDeclaration':
          analyzeConstDeclaration(declaration, symbols, diagnostics, constants);
          break;
        case 'ShapeDeclaration':
          analyzeShapeDeclaration(declaration, symbols, diagnostics, shapes);
          break;
        case 'LayerDeclaration':
          analyzeLayerDeclaration(declaration, symbols, diagnostics, layers);
          break;
        default:
          pushDiagnostic(diagnostics, {
            code: TYPE_CODES.INVALID_OPERATION,
            message: `Unknown top-level declaration kind ${declaration.kind}.`,
            nodeSpan: declaration.span,
          });
      }
    }

    const ok = !diagnostics.some((diagnostic) => diagnostic.isError());
    const ir = ok
      ? deepFreeze({ assetId, canvas, requestedBudget, constants, shapes, layers })
      : null;

    return Object.freeze({ ok, ir, symbols: new Map(symbols), diagnostics: Object.freeze(diagnostics) });
  } catch (error) {
    // Never let an internal error (malformed AST shape, unexpected node kind,
    // an arithmetic exception this file failed to anticipate, ...) escape
    // this public boundary as an exception.
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.INVALID_OPERATION,
      message: `Internal analyzer failure: ${error instanceof Error ? error.message : String(error)}`,
      nodeSpan: ZERO_SPAN,
    });
    return Object.freeze({ ok: false, ir: null, symbols: new Map(symbols), diagnostics: Object.freeze(diagnostics) });
  }
}
