import { span, v2Diagnostic } from './scdl-v2.diagnostics.js';
import {
  SCDL_V2_TYPES, NUMERIC_TYPES, SCALAR_TYPES, TYPE_CODES, BIND_CODES, GEOM_CODES, TERM_CODES,
  I32_MIN, I32_MAX, RASTER_POLICIES, COMPOSITE_MODES, isKnownType,
} from './scdl-v2.types.js';
import {
  makeRational, mulRational, divRational, addRational, subRational, parseRational, rationalToString,
} from './scdl-v2.rational.js';
import {
  PCG32, deterministicNoise2D, sqrtRational, gcdBigInt, lcmBigInt,
  lerpRational, mapRangeRational, clampRational, modBigInt, powRational,
  sinAngle, cosAngle, tanAngle, atan2Angle, distanceVec2, dotVec2, crossVec2, normalizeVec2,
} from './scdl-v2.generative.js';
import {
  createLine, createPolyline, createRay, createRect, createRoundedRect, createRing,
  createEllipse, createArc, createSector, createTriangle, createRegularPolygon,
  createPolygon, createStar, createPath, computeBounds,
} from './scdl-v2.geometry.js';
import {
  createAngle, createTranslation, createRotation, createScale, composeTransforms,
  applyTransformToShape, applyTransformToVec2,
} from './scdl-v2.transforms.js';
import {
  shapeUnion, shapeSubtract, shapeIntersect, shapeXor, shapeOutline,
} from './scdl-v2.booleans.js';
import {
  toMask, maskUnion, maskIntersect, maskSubtract, maskInvert,
} from './scdl-v2.masks.js';
import {
  resolveAnchor, alignShapes, isInside, contains, touches, overlaps,
} from './scdl-v2.anchors.js';

const I32_MIN_BIG = BigInt(I32_MIN);
const I32_MAX_BIG = BigInt(I32_MAX);
const MAX_COLLECTION_ELEMENTS = 100000;
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

function toRational(resolved) {
  if (!resolved) return makeRational(0n);
  if (resolved.type === 'I32') return makeRational(BigInt(resolved.value));
  return resolved.value;
}

function inI32Range(big) {
  return big >= I32_MIN_BIG && big <= I32_MAX_BIG;
}

// Round to nearest integer with exact rationals and half ties toward +infinity.
function roundRationalToBigInt(rational) {
  const numerator = 2n * BigInt(rational.numerator) + BigInt(rational.denominator);
  const denominator = 2n * BigInt(rational.denominator);
  const quotient = numerator / denominator;
  return numerator < 0n && numerator % denominator !== 0n ? quotient - 1n : quotient;
}

function powI32WithinRange(baseValue, exponentValue) {
  let result = 1n;
  let factor = BigInt(baseValue);
  let exponent = BigInt(exponentValue);
  while (exponent > 0n) {
    if ((exponent & 1n) === 1n) {
      result *= factor;
      if (!inI32Range(result)) return null;
    }
    exponent >>= 1n;
    if (exponent > 0n) {
      factor *= factor;
      if (!inI32Range(factor)) return null;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Expression evaluation
// ---------------------------------------------------------------------------

function evaluateExpression(node, symbols, diagnostics) {
  if (!node) return null;
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
    case 'STRING': {
      let val = node.value ?? node.raw;
      if (typeof val === 'string' && val.startsWith('"') && val.endsWith('"')) {
        try {
          val = JSON.parse(val);
        } catch {
          val = val.slice(1, -1);
        }
      }
      return Object.freeze({ type: 'STRING', value: val });
    }
    case 'IDENT': {
      if (node.raw === 'TRUE' || node.raw === 'true') return Object.freeze({ type: 'BOOL', value: true });
      if (node.raw === 'FALSE' || node.raw === 'false') return Object.freeze({ type: 'BOOL', value: false });
      return Object.freeze({ type: 'IDENT', value: node.raw });
    }
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

function ensureAnalyzerContext(symbols) {
  if (!symbols._scopeStack) symbols._scopeStack = [];
  if (!symbols._callContext) {
    symbols._callContext = {
      functions: new Map(),
      depth: 0,
      stack: [],
      recurrence: null,
      maxDepth: 64,
    };
  }
  return symbols;
}

function withScope(symbols, scopeMap, fn) {
  ensureAnalyzerContext(symbols);
  symbols._scopeStack.push(scopeMap);
  try {
    return fn();
  } finally {
    symbols._scopeStack.pop();
  }
}

function withRecurrence(symbols, recurrence, fn) {
  ensureAnalyzerContext(symbols);
  const prev = symbols._callContext.recurrence;
  symbols._callContext.recurrence = recurrence;
  try {
    return fn();
  } finally {
    symbols._callContext.recurrence = prev;
  }
}

function evaluateSymbolRef(node, symbols, diagnostics) {
  ensureAnalyzerContext(symbols);
  const stack = symbols._scopeStack;
  for (let i = stack.length - 1; i >= 0; i--) {
    if (stack[i] && stack[i].has && stack[i].has(node.name)) {
      return stack[i].get(node.name);
    }
  }
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
  ensureAnalyzerContext(symbols);
  switch (node.opcode) {
    case 'ADD': return evaluateAddSub(node, symbols, diagnostics, addRational, (a, b) => a + b);
    case 'SUB': return evaluateAddSub(node, symbols, diagnostics, subRational, (a, b) => a - b);
    case 'MUL': return evaluateMul(node, symbols, diagnostics);
    case 'DIV': return evaluateDiv(node, symbols, diagnostics);
    case 'PX': return evaluatePx(node, symbols, diagnostics);
    case 'VEC2': return evaluateVec2(node, symbols, diagnostics);
    case 'PIXEL': return evaluatePixel(node, symbols, diagnostics);
    case 'CIRCLE': return evaluateCircle(node, symbols, diagnostics);

    // Primitives
    case 'LINE': return evaluateLine(node, symbols, diagnostics);
    case 'POLYLINE': return evaluatePolyline(node, symbols, diagnostics);
    case 'RAY': return evaluateRay(node, symbols, diagnostics);
    case 'RECT': return evaluateRect(node, symbols, diagnostics);
    case 'ROUNDED_RECT': return evaluateRoundedRect(node, symbols, diagnostics);
    case 'RING': return evaluateRing(node, symbols, diagnostics);
    case 'ELLIPSE': return evaluateEllipse(node, symbols, diagnostics);
    case 'ARC': return evaluateArc(node, symbols, diagnostics);
    case 'SECTOR': return evaluateSector(node, symbols, diagnostics);
    case 'TRIANGLE': return evaluateTriangle(node, symbols, diagnostics);
    case 'REGULAR_POLYGON': return evaluateRegularPolygon(node, symbols, diagnostics);
    case 'POLYGON': return evaluatePolygon(node, symbols, diagnostics);
    case 'STAR': return evaluateStar(node, symbols, diagnostics);
    case 'PATH': return evaluatePath(node, symbols, diagnostics);

    // Angles
    case 'DEGREES': return evaluateAngleExpr(node, 'DEGREES', symbols, diagnostics);
    case 'RADIANS': return evaluateAngleExpr(node, 'RADIANS', symbols, diagnostics);
    case 'TURNS': return evaluateAngleExpr(node, 'TURNS', symbols, diagnostics);

    // Transforms
    case 'ROTATE': return evaluateRotate(node, symbols, diagnostics);
    case 'TRANSLATE': return evaluateTranslate(node, symbols, diagnostics);
    case 'SCALE': return evaluateScale(node, symbols, diagnostics);
    case 'TRANSFORM_COMPOSE': return evaluateTransformCompose(node, symbols, diagnostics);
    case 'TRANSFORM_APPLY': return evaluateTransformApply(node, symbols, diagnostics);

    // CSG Booleans
    case 'UNION': return evaluateCSG(node, symbols, diagnostics, shapeUnion);
    case 'SUBTRACT': return evaluateCSG(node, symbols, diagnostics, shapeSubtract);
    case 'INTERSECT': return evaluateCSG(node, symbols, diagnostics, shapeIntersect);
    case 'XOR': return evaluateCSG(node, symbols, diagnostics, shapeXor);
    case 'OUTLINE': return evaluateOutline(node, symbols, diagnostics);

    // Masks
    case 'TO_MASK': return evaluateToMask(node, symbols, diagnostics);
    case 'MASK_UNION': return evaluateMaskBinary(node, symbols, diagnostics, maskUnion);
    case 'MASK_INTERSECT': return evaluateMaskBinary(node, symbols, diagnostics, maskIntersect);
    case 'MASK_SUBTRACT': return evaluateMaskBinary(node, symbols, diagnostics, maskSubtract);
    case 'MASK_INVERT': return evaluateMaskInvert(node, symbols, diagnostics);

    // Anchors, Align, Bounds, Predicates
    case 'ALIGN': return evaluateAlign(node, symbols, diagnostics);
    case 'ANCHOR_OF': return evaluateAnchorOf(node, symbols, diagnostics);
    case 'BOUNDS': return evaluateBounds(node, symbols, diagnostics);
    case 'INSIDE': return evaluateInside(node, symbols, diagnostics);
    case 'CONTAINS': return evaluateContains(node, symbols, diagnostics);
    case 'TOUCHES': return evaluateTouches(node, symbols, diagnostics);
    case 'OVERLAPS': return evaluateOverlaps(node, symbols, diagnostics);

    // Generative Math
    case 'MOD': return evaluateMod(node, symbols, diagnostics);
    case 'POW': return evaluatePow(node, symbols, diagnostics);
    case 'ABS': return evaluateAbs(node, symbols, diagnostics);
    case 'MIN': return evaluateMinMax(node, symbols, diagnostics, false);
    case 'MAX': return evaluateMinMax(node, symbols, diagnostics, true);
    case 'CLAMP': return evaluateClamp(node, symbols, diagnostics);
    case 'FLOOR': return evaluateFloorCeilRound(node, symbols, diagnostics, 'FLOOR');
    case 'CEIL': return evaluateFloorCeilRound(node, symbols, diagnostics, 'CEIL');
    case 'ROUND': return evaluateFloorCeilRound(node, symbols, diagnostics, 'ROUND');
    case 'SQRT': return evaluateSqrt(node, symbols, diagnostics);
    case 'LERP': return evaluateLerp(node, symbols, diagnostics);
    case 'MAP_RANGE': return evaluateMapRange(node, symbols, diagnostics);
    case 'GCD': return evaluateGcdLcm(node, symbols, diagnostics, false);
    case 'LCM': return evaluateGcdLcm(node, symbols, diagnostics, true);

    // Trigonometry
    case 'SIN': return evaluateTrig(node, symbols, diagnostics, sinAngle);
    case 'COS': return evaluateTrig(node, symbols, diagnostics, cosAngle);
    case 'TAN': return evaluateTrig(node, symbols, diagnostics, tanAngle);
    case 'ATAN2': return evaluateAtan2(node, symbols, diagnostics);

    // Vectors
    case 'DISTANCE': return evaluateDistance(node, symbols, diagnostics);
    case 'DOT': return evaluateDotCross(node, symbols, diagnostics, false);
    case 'CROSS': return evaluateDotCross(node, symbols, diagnostics, true);
    case 'NORMALIZE': return evaluateNormalize(node, symbols, diagnostics);

    // Comparisons & Logic
    case 'EQ': return evaluateComparison(node, symbols, diagnostics, 'EQ');
    case 'NEQ': return evaluateComparison(node, symbols, diagnostics, 'NEQ');
    case 'LT': return evaluateComparison(node, symbols, diagnostics, 'LT');
    case 'LTE': return evaluateComparison(node, symbols, diagnostics, 'LTE');
    case 'GT': return evaluateComparison(node, symbols, diagnostics, 'GT');
    case 'GTE': return evaluateComparison(node, symbols, diagnostics, 'GTE');
    case 'AND': return evaluateLogical(node, symbols, diagnostics, 'AND');
    case 'OR': return evaluateLogical(node, symbols, diagnostics, 'OR');
    case 'NOT': return evaluateLogical(node, symbols, diagnostics, 'NOT');

    // Collections & Recurrences
    case 'RANGE': return evaluateRange(node, symbols, diagnostics);
    case 'AT': return evaluateAt(node, symbols, diagnostics);
    case 'LENGTH': return evaluateLength(node, symbols, diagnostics);
    case 'SUM': return evaluateSumProduct(node, symbols, diagnostics, false);
    case 'PRODUCT': return evaluateSumProduct(node, symbols, diagnostics, true);
    case 'ZIP': return evaluateZip(node, symbols, diagnostics);
    case 'PREV': return evaluatePrev(node, symbols, diagnostics);

    // Seeded Variation & Noise
    case 'RANDOM_I32': return evaluateRandom(node, symbols, diagnostics, 'RANDOM_I32');
    case 'RANDOM_SCALAR': return evaluateRandom(node, symbols, diagnostics, 'RANDOM_SCALAR');
    case 'RANDOM_VEC2': return evaluateRandom(node, symbols, diagnostics, 'RANDOM_VEC2');
    case 'NOISE_2D': return evaluateNoise2D(node, symbols, diagnostics);

    // Function Invocation
    case 'CALL': return evaluateFnCall(node, symbols, diagnostics);

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
// Geometry Primitives Evaluators
// ---------------------------------------------------------------------------

function evaluateLine(node, symbols, diagnostics) {
  const from = evaluateExpression(node.named.FROM, symbols, diagnostics);
  const to = evaluateExpression(node.named.TO, symbols, diagnostics);
  if (!from || from.type !== 'VEC2' || !to || to.type !== 'VEC2') {
    pushDiagnostic(diagnostics, { code: TYPE_CODES.MISMATCH, message: 'LINE requires VEC2 FROM and TO.', nodeSpan: node.span });
    return null;
  }
  return Object.freeze({ type: 'SHAPE', value: createLine({ from: from.value, to: to.value }) });
}

function evaluatePolyline(node, symbols, diagnostics) {
  const points = [];
  const pointsNode = node.named.POINTS || (node.positional.length > 0 ? node.positional[0] : null);
  if (pointsNode) {
    const evaluated = evaluateExpression(pointsNode, symbols, diagnostics);
    if (evaluated && Array.isArray(evaluated.value)) {
      for (const p of evaluated.value) points.push(p);
    }
  }
  return Object.freeze({ type: 'SHAPE', value: createPolyline({ points }) });
}

function evaluateRay(node, symbols, diagnostics) {
  const origin = evaluateExpression(node.named.ORIGIN, symbols, diagnostics);
  const dir = evaluateExpression(node.named.DIR, symbols, diagnostics);
  const length = evaluateExpression(node.named.LENGTH, symbols, diagnostics);
  if (!origin || origin.type !== 'VEC2' || !dir || dir.type !== 'VEC2' || !length || length.type !== 'PX') {
    pushDiagnostic(diagnostics, { code: TYPE_CODES.MISMATCH, message: 'RAY requires VEC2 ORIGIN, VEC2 DIR, and PX LENGTH.', nodeSpan: node.span });
    return null;
  }
  return Object.freeze({ type: 'SHAPE', value: createRay({ origin: origin.value, dir: dir.value, length: toRational(length) }) });
}

function evaluateRect(node, symbols, diagnostics) {
  const size = evaluateExpression(node.named.SIZE, symbols, diagnostics);
  if (!size || size.type !== 'VEC2') {
    pushDiagnostic(diagnostics, { code: TYPE_CODES.MISMATCH, message: 'RECT SIZE must be VEC2.', nodeSpan: node.span });
    return null;
  }
  const origin = node.named.ORIGIN ? evaluateExpression(node.named.ORIGIN, symbols, diagnostics) : null;
  const center = node.named.CENTER ? evaluateExpression(node.named.CENTER, symbols, diagnostics) : null;
  const shape = createRect({
    origin: origin ? origin.value : null,
    center: center ? center.value : null,
    size: size.value,
  });
  return Object.freeze({ type: 'SHAPE', value: shape });
}

function evaluateRoundedRect(node, symbols, diagnostics) {
  const size = evaluateExpression(node.named.SIZE, symbols, diagnostics);
  const radius = evaluateExpression(node.named.CORNER_RADIUS, symbols, diagnostics);
  if (!size || size.type !== 'VEC2' || !radius || radius.type !== 'PX') {
    pushDiagnostic(diagnostics, { code: TYPE_CODES.MISMATCH, message: 'ROUNDED_RECT requires VEC2 SIZE and PX CORNER_RADIUS.', nodeSpan: node.span });
    return null;
  }
  const origin = node.named.ORIGIN ? evaluateExpression(node.named.ORIGIN, symbols, diagnostics) : null;
  const center = node.named.CENTER ? evaluateExpression(node.named.CENTER, symbols, diagnostics) : null;
  const shape = createRoundedRect({
    origin: origin ? origin.value : null,
    center: center ? center.value : null,
    size: size.value,
    cornerRadius: toRational(radius),
  });
  return Object.freeze({ type: 'SHAPE', value: shape });
}

function evaluateRing(node, symbols, diagnostics) {
  const center = evaluateExpression(node.named.CENTER, symbols, diagnostics);
  const radius = evaluateExpression(node.named.RADIUS, symbols, diagnostics);
  const thickness = evaluateExpression(node.named.THICKNESS, symbols, diagnostics);
  if (!center || center.type !== 'VEC2' || !radius || radius.type !== 'PX' || !thickness || thickness.type !== 'PX') {
    pushDiagnostic(diagnostics, { code: TYPE_CODES.MISMATCH, message: 'RING requires VEC2 CENTER, PX RADIUS, and PX THICKNESS.', nodeSpan: node.span });
    return null;
  }
  return Object.freeze({ type: 'SHAPE', value: createRing({ center: center.value, radius: toRational(radius), thickness: toRational(thickness) }) });
}

function evaluateEllipse(node, symbols, diagnostics) {
  const center = evaluateExpression(node.named.CENTER, symbols, diagnostics);
  const rx = evaluateExpression(node.named.RADIUS_X, symbols, diagnostics);
  const ry = evaluateExpression(node.named.RADIUS_Y, symbols, diagnostics);
  if (!center || center.type !== 'VEC2' || !rx || rx.type !== 'PX' || !ry || ry.type !== 'PX') {
    pushDiagnostic(diagnostics, { code: TYPE_CODES.MISMATCH, message: 'ELLIPSE requires VEC2 CENTER, PX RADIUS_X, and PX RADIUS_Y.', nodeSpan: node.span });
    return null;
  }
  return Object.freeze({ type: 'SHAPE', value: createEllipse({ center: center.value, radiusX: toRational(rx), radiusY: toRational(ry) }) });
}

function evaluateArc(node, symbols, diagnostics) {
  const center = evaluateExpression(node.named.CENTER, symbols, diagnostics);
  const radius = evaluateExpression(node.named.RADIUS, symbols, diagnostics);
  const start = evaluateExpression(node.named.START, symbols, diagnostics);
  const end = evaluateExpression(node.named.END, symbols, diagnostics);
  if (!center || center.type !== 'VEC2' || !radius || radius.type !== 'PX' || !start || start.type !== 'ANGLE' || !end || end.type !== 'ANGLE') {
    pushDiagnostic(diagnostics, { code: TYPE_CODES.MISMATCH, message: 'ARC requires VEC2 CENTER, PX RADIUS, ANGLE START, and ANGLE END.', nodeSpan: node.span });
    return null;
  }
  return Object.freeze({ type: 'SHAPE', value: createArc({ center: center.value, radius: toRational(radius), startAngle: start.value, endAngle: end.value }) });
}

function evaluateSector(node, symbols, diagnostics) {
  const center = evaluateExpression(node.named.CENTER, symbols, diagnostics);
  const radius = evaluateExpression(node.named.RADIUS, symbols, diagnostics);
  const start = evaluateExpression(node.named.START, symbols, diagnostics);
  const end = evaluateExpression(node.named.END, symbols, diagnostics);
  if (!center || center.type !== 'VEC2' || !radius || radius.type !== 'PX' || !start || start.type !== 'ANGLE' || !end || end.type !== 'ANGLE') {
    pushDiagnostic(diagnostics, { code: TYPE_CODES.MISMATCH, message: 'SECTOR requires VEC2 CENTER, PX RADIUS, ANGLE START, and ANGLE END.', nodeSpan: node.span });
    return null;
  }
  return Object.freeze({ type: 'SHAPE', value: createSector({ center: center.value, radius: toRational(radius), startAngle: start.value, endAngle: end.value }) });
}

function evaluateTriangle(node, symbols, diagnostics) {
  const p1 = evaluateExpression(node.named.P1, symbols, diagnostics);
  const p2 = evaluateExpression(node.named.P2, symbols, diagnostics);
  const p3 = evaluateExpression(node.named.P3, symbols, diagnostics);
  if (!p1 || p1.type !== 'VEC2' || !p2 || p2.type !== 'VEC2' || !p3 || p3.type !== 'VEC2') {
    pushDiagnostic(diagnostics, { code: TYPE_CODES.MISMATCH, message: 'TRIANGLE requires VEC2 P1, P2, and P3.', nodeSpan: node.span });
    return null;
  }
  return Object.freeze({ type: 'SHAPE', value: createTriangle({ p1: p1.value, p2: p2.value, p3: p3.value }) });
}

function evaluateRegularPolygon(node, symbols, diagnostics) {
  const sides = evaluateExpression(node.named.SIDES, symbols, diagnostics);
  const radius = evaluateExpression(node.named.RADIUS, symbols, diagnostics);
  const center = evaluateExpression(node.named.CENTER, symbols, diagnostics);
  if (!sides || sides.type !== 'I32' || !radius || radius.type !== 'PX' || !center || center.type !== 'VEC2') {
    pushDiagnostic(diagnostics, { code: TYPE_CODES.MISMATCH, message: 'REGULAR_POLYGON requires I32 SIDES, PX RADIUS, and VEC2 CENTER.', nodeSpan: node.span });
    return null;
  }
  return Object.freeze({ type: 'SHAPE', value: createRegularPolygon({ sides: Number(sides.value), radius: toRational(radius), center: center.value }) });
}

function evaluatePolygon(node, symbols, diagnostics) {
  const vertices = [];
  const vertNode = node.named?.VERTICES || node.named?.POINTS || (node.positional && node.positional[0]);
  if (vertNode) {
    const evaluated = evaluateExpression(vertNode, symbols, diagnostics);
    if (evaluated && Array.isArray(evaluated.value)) {
      for (const p of evaluated.value) vertices.push(p);
    }
  }
  return Object.freeze({ type: 'SHAPE', value: createPolygon({ vertices }) });
}

function evaluateStar(node, symbols, diagnostics) {
  const points = evaluateExpression(node.named.POINTS, symbols, diagnostics);
  const inner = evaluateExpression(node.named.INNER_RADIUS, symbols, diagnostics);
  const outer = evaluateExpression(node.named.OUTER_RADIUS, symbols, diagnostics);
  const center = evaluateExpression(node.named.CENTER, symbols, diagnostics);
  if (!points || points.type !== 'I32' || !inner || inner.type !== 'PX' || !outer || outer.type !== 'PX' || !center || center.type !== 'VEC2') {
    pushDiagnostic(diagnostics, { code: TYPE_CODES.MISMATCH, message: 'STAR requires I32 POINTS, PX INNER_RADIUS, PX OUTER_RADIUS, and VEC2 CENTER.', nodeSpan: node.span });
    return null;
  }
  return Object.freeze({ type: 'SHAPE', value: createStar({ points: Number(points.value), innerRadius: toRational(inner), outerRadius: toRational(outer), center: center.value }) });
}

function evaluatePath(node, symbols, diagnostics) {
  const data = evaluateExpression(node.named.DATA, symbols, diagnostics);
  if (!data || data.type !== 'STRING') {
    pushDiagnostic(diagnostics, { code: TYPE_CODES.MISMATCH, message: 'PATH requires a STRING DATA operand.', nodeSpan: node.span });
    return null;
  }
  return Object.freeze({ type: 'SHAPE', value: createPath({ d: data.value }) });
}

// ---------------------------------------------------------------------------
// Angles and Transforms Evaluators
// ---------------------------------------------------------------------------

function evaluateAngleExpr(node, unit, symbols, diagnostics) {
  const [valNode] = node.positional;
  const val = evaluateExpression(valNode, symbols, diagnostics);
  if (!val) return null;
  if (!SCALAR_TYPES.includes(val.type)) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: `${node.opcode} requires a scalar operand.`,
      nodeSpan: node.span,
      expected: ['I32', 'FIXED', 'RATIO'],
      received: [val.type],
    });
    return null;
  }
  const angle = createAngle(toRational(val), unit);
  return Object.freeze({ type: 'ANGLE', value: angle });
}

function evaluateRotate(node, symbols, diagnostics) {
  const angle = evaluateExpression(node.named.ANGLE, symbols, diagnostics);
  if (!angle) return null;
  if (angle.type !== 'ANGLE') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: 'ROTATE ANGLE operand must be ANGLE.',
      nodeSpan: node.span,
      expected: ['ANGLE'],
      received: [angle.type],
    });
    return null;
  }
  let pivot = null;
  if (node.named.PIVOT) {
    pivot = evaluateExpression(node.named.PIVOT, symbols, diagnostics);
    if (pivot && pivot.type !== 'VEC2') {
      pushDiagnostic(diagnostics, {
        code: TYPE_CODES.MISMATCH,
        message: 'ROTATE PIVOT operand must be VEC2.',
        nodeSpan: node.span,
        expected: ['VEC2'],
        received: [pivot.type],
      });
      return null;
    }
  }
  const transform = createRotation(angle.value, pivot ? pivot.value : null);
  return Object.freeze({ type: 'TRANSFORM', value: transform });
}

function evaluateTranslate(node, symbols, diagnostics) {
  const offset = evaluateExpression(node.named.OFFSET, symbols, diagnostics);
  if (!offset) return null;
  if (offset.type !== 'VEC2') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: 'TRANSLATE OFFSET operand must be VEC2.',
      nodeSpan: node.span,
      expected: ['VEC2'],
      received: [offset.type],
    });
    return null;
  }
  const transform = createTranslation(offset.value);
  return Object.freeze({ type: 'TRANSFORM', value: transform });
}

function evaluateScale(node, symbols, diagnostics) {
  const factor = evaluateExpression(node.named.FACTOR, symbols, diagnostics);
  if (!factor) return null;
  if (!SCALAR_TYPES.includes(factor.type)) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: 'SCALE FACTOR operand must be a scalar.',
      nodeSpan: node.span,
      expected: ['I32', 'FIXED', 'RATIO'],
      received: [factor.type],
    });
    return null;
  }
  let pivot = null;
  if (node.named.PIVOT) {
    pivot = evaluateExpression(node.named.PIVOT, symbols, diagnostics);
    if (pivot && pivot.type !== 'VEC2') {
      pushDiagnostic(diagnostics, {
        code: TYPE_CODES.MISMATCH,
        message: 'SCALE PIVOT operand must be VEC2.',
        nodeSpan: node.span,
        expected: ['VEC2'],
        received: [pivot.type],
      });
      return null;
    }
  }
  const factorRat = toRational(factor);
  const transform = createScale(factorRat, factorRat, pivot ? pivot.value : null);
  return Object.freeze({ type: 'TRANSFORM', value: transform });
}

function evaluateTransformCompose(node, symbols, diagnostics) {
  const [t1Node, t2Node] = node.positional;
  const t1 = evaluateExpression(t1Node, symbols, diagnostics);
  const t2 = evaluateExpression(t2Node, symbols, diagnostics);
  if (!t1 || !t2) return null;
  if (t1.type !== 'TRANSFORM' || t2.type !== 'TRANSFORM') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: 'TRANSFORM_COMPOSE requires TRANSFORM operands.',
      nodeSpan: node.span,
      expected: ['TRANSFORM'],
      received: [t1.type, t2.type],
    });
    return null;
  }
  return Object.freeze({ type: 'TRANSFORM', value: composeTransforms(t1.value, t2.value) });
}

function evaluateTransformApply(node, symbols, diagnostics) {
  const [tNode, targetNode] = node.positional;
  const t = evaluateExpression(tNode, symbols, diagnostics);
  const target = evaluateExpression(targetNode, symbols, diagnostics);
  if (!t || !target) return null;
  if (t.type !== 'TRANSFORM') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: 'TRANSFORM_APPLY first operand must be TRANSFORM.',
      nodeSpan: node.span,
      expected: ['TRANSFORM'],
      received: [t.type],
    });
    return null;
  }
  if (target.type === 'SHAPE') {
    return Object.freeze({ type: 'SHAPE', value: applyTransformToShape(t.value, target.value) });
  }
  if (target.type === 'VEC2') {
    return Object.freeze({ type: 'VEC2', value: applyTransformToVec2(t.value, target.value) });
  }
  pushDiagnostic(diagnostics, {
    code: TYPE_CODES.MISMATCH,
    message: 'TRANSFORM_APPLY target must be SHAPE or VEC2.',
    nodeSpan: node.span,
    expected: ['SHAPE', 'VEC2'],
    received: [target.type],
  });
  return null;
}

// ---------------------------------------------------------------------------
// CSG Booleans & Masks Evaluators
// ---------------------------------------------------------------------------

function evaluateCSG(node, symbols, diagnostics, op) {
  const [aNode, bNode] = node.positional;
  const a = evaluateExpression(aNode, symbols, diagnostics);
  const b = evaluateExpression(bNode, symbols, diagnostics);
  if (!a || !b) return null;
  if (a.type !== 'SHAPE' || b.type !== 'SHAPE') {
    pushDiagnostic(diagnostics, { code: TYPE_CODES.MISMATCH, message: `${node.opcode} requires SHAPE operands.`, nodeSpan: node.span });
    return null;
  }
  return Object.freeze({ type: 'SHAPE', value: op(a.value, b.value) });
}

function evaluateOutline(node, symbols, diagnostics) {
  const shape = evaluateExpression(node.named.SHAPE, symbols, diagnostics);
  const width = evaluateExpression(node.named.WIDTH, symbols, diagnostics);
  if (!shape || shape.type !== 'SHAPE' || !width || width.type !== 'PX') {
    pushDiagnostic(diagnostics, { code: TYPE_CODES.MISMATCH, message: 'OUTLINE requires SHAPE and PX WIDTH.', nodeSpan: node.span });
    return null;
  }
  let align = 'CENTER';
  if (node.named.ALIGN) {
    const a = evaluateExpression(node.named.ALIGN, symbols, diagnostics);
    if (a && a.type === 'IDENT') align = a.value.toUpperCase();
  }
  return Object.freeze({ type: 'SHAPE', value: shapeOutline(shape.value, toRational(width), align) });
}

function evaluateToMask(node, symbols, diagnostics) {
  const shape = evaluateExpression(node.named.SHAPE || (node.positional.length > 0 ? node.positional[0] : null), symbols, diagnostics);
  if (!shape || shape.type !== 'SHAPE') {
    pushDiagnostic(diagnostics, { code: TYPE_CODES.MISMATCH, message: 'TO_MASK requires a SHAPE operand.', nodeSpan: node.span });
    return null;
  }
  let raster = 'CENTER';
  if (node.named.RASTER) {
    const r = evaluateExpression(node.named.RASTER, symbols, diagnostics);
    if (r && r.type === 'IDENT') raster = r.value.toUpperCase();
  }
  return Object.freeze({ type: 'MASK', value: toMask(shape.value, raster) });
}

function evaluateMaskBinary(node, symbols, diagnostics, op) {
  const [aNode, bNode] = node.positional;
  const a = evaluateExpression(aNode, symbols, diagnostics);
  const b = evaluateExpression(bNode, symbols, diagnostics);
  if (!a || !b) return null;
  if (a.type !== 'MASK' || b.type !== 'MASK') {
    pushDiagnostic(diagnostics, { code: TYPE_CODES.MISMATCH, message: `${node.opcode} requires MASK operands.`, nodeSpan: node.span });
    return null;
  }
  return Object.freeze({ type: 'MASK', value: op(a.value, b.value) });
}

function evaluateMaskInvert(node, symbols, diagnostics) {
  const [mNode] = node.positional;
  const m = evaluateExpression(mNode, symbols, diagnostics);
  if (!m || m.type !== 'MASK') {
    pushDiagnostic(diagnostics, { code: TYPE_CODES.MISMATCH, message: 'MASK_INVERT requires a MASK operand.', nodeSpan: node.span });
    return null;
  }
  return Object.freeze({ type: 'MASK', value: maskInvert(m.value) });
}

// ---------------------------------------------------------------------------
// Anchors, Alignment, Predicates Evaluators
// ---------------------------------------------------------------------------

function evaluateAlign(node, symbols, diagnostics) {
  const target = evaluateExpression(node.named.TARGET, symbols, diagnostics);
  const anchor = evaluateExpression(node.named.ANCHOR, symbols, diagnostics);
  const to = evaluateExpression(node.named.TO, symbols, diagnostics);
  if (!target || target.type !== 'SHAPE' || !to || to.type !== 'SHAPE') {
    pushDiagnostic(diagnostics, { code: TYPE_CODES.MISMATCH, message: 'ALIGN TARGET and TO must be SHAPE.', nodeSpan: node.span });
    return null;
  }
  const anchorName = anchor && anchor.type === 'IDENT' ? anchor.value : 'CENTER';
  let offset = null;
  if (node.named.OFFSET) {
    const off = evaluateExpression(node.named.OFFSET, symbols, diagnostics);
    if (off && off.type === 'VEC2') offset = off.value;
  }
  return Object.freeze({ type: 'SHAPE', value: alignShapes(target.value, anchorName, to.value, offset) });
}

function evaluateAnchorOf(node, symbols, diagnostics) {
  const [shapeNode, anchorNode] = node.positional;
  const shape = evaluateExpression(shapeNode, symbols, diagnostics);
  const anchor = evaluateExpression(anchorNode, symbols, diagnostics);
  if (!shape || shape.type !== 'SHAPE') {
    pushDiagnostic(diagnostics, { code: TYPE_CODES.MISMATCH, message: 'ANCHOR_OF requires a SHAPE operand.', nodeSpan: node.span });
    return null;
  }
  const anchorName = anchor && anchor.type === 'IDENT' ? anchor.value : 'CENTER';
  return Object.freeze({ type: 'VEC2', value: resolveAnchor(shape.value, anchorName) });
}

function evaluateBounds(node, symbols, diagnostics) {
  const [targetNode] = node.positional;
  const target = evaluateExpression(targetNode, symbols, diagnostics);
  if (!target) return null;
  const bounds = computeBounds(target.value);
  return Object.freeze({ type: 'RECT', value: bounds });
}

function evaluateInside(node, symbols, diagnostics) {
  const [pNode, tNode] = node.positional;
  const p = evaluateExpression(pNode, symbols, diagnostics);
  const t = evaluateExpression(tNode, symbols, diagnostics);
  if (!p || !t) return null;
  return Object.freeze({ type: 'BOOL', value: isInside(p.value, t.value) });
}

function evaluateContains(node, symbols, diagnostics) {
  const [cNode, tNode] = node.positional;
  const c = evaluateExpression(cNode, symbols, diagnostics);
  const t = evaluateExpression(tNode, symbols, diagnostics);
  if (!c || !t) return null;
  return Object.freeze({ type: 'BOOL', value: contains(c.value, t.value) });
}

function evaluateTouches(node, symbols, diagnostics) {
  const [aNode, bNode] = node.positional;
  const a = evaluateExpression(aNode, symbols, diagnostics);
  const b = evaluateExpression(bNode, symbols, diagnostics);
  if (!a || !b) return null;
  return Object.freeze({ type: 'BOOL', value: touches(a.value, b.value) });
}

function evaluateOverlaps(node, symbols, diagnostics) {
  const [aNode, bNode] = node.positional;
  const a = evaluateExpression(aNode, symbols, diagnostics);
  const b = evaluateExpression(bNode, symbols, diagnostics);
  if (!a || !b) return null;
  return Object.freeze({ type: 'BOOL', value: overlaps(a.value, b.value) });
}

// ---------------------------------------------------------------------------
// Generative Math, Trigonometry, Vectors, Logic, and Collections
// ---------------------------------------------------------------------------

function evaluateMod(node, symbols, diagnostics) {
  const [leftNode, rightNode] = node.positional || [];
  const left = evaluateExpression(leftNode, symbols, diagnostics);
  const right = evaluateExpression(rightNode, symbols, diagnostics);
  if (!left || !right) return null;

  if (left.type !== 'I32' || right.type !== 'I32') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: 'MOD requires two I32 operands.',
      nodeSpan: node.span,
      expected: ['I32'],
      received: [left.type, right.type],
    });
    return null;
  }

  if (right.value === 0) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.DIVISION_BY_ZERO,
      message: 'Modulo by zero.',
      nodeSpan: node.span,
    });
    return null;
  }

  const result = modBigInt(BigInt(left.value), BigInt(right.value));
  return Object.freeze({ type: 'I32', value: Number(result.numerator) });
}

function evaluatePow(node, symbols, diagnostics) {
  const [baseNode, expNode] = node.positional || [];
  const base = evaluateExpression(baseNode, symbols, diagnostics);
  const exp = evaluateExpression(expNode, symbols, diagnostics);
  if (!base || !exp) return null;

  if (base.type === 'I32' && exp.type === 'I32') {
    if (exp.value < 0) {
      pushDiagnostic(diagnostics, {
        code: TYPE_CODES.RANGE,
        message: 'Integer POW does not support negative exponent.',
        nodeSpan: node.span,
        expected: ['non-negative exponent'],
        received: [String(exp.value)],
      });
      return null;
    }
    const result = powI32WithinRange(base.value, exp.value);
    if (result === null) {
      pushDiagnostic(diagnostics, {
        code: TYPE_CODES.RANGE,
        message: 'POW result is outside the signed 32-bit range.',
        nodeSpan: node.span,
        expected: [`${I32_MIN}..${I32_MAX}`],
        received: [`${base.value}^${exp.value}`],
      });
      return null;
    }
    return Object.freeze({ type: 'I32', value: Number(result) });
  }

  if (NUMERIC_TYPES.includes(base.type) && NUMERIC_TYPES.includes(exp.type)) {
    const baseRat = toRational(base);
    const expRat = toRational(exp);
    const result = powRational(baseRat, expRat);
    return Object.freeze({ type: base.type === 'I32' ? 'FIXED' : base.type, value: result });
  }

  pushDiagnostic(diagnostics, {
    code: TYPE_CODES.MISMATCH,
    message: 'POW requires numeric operands.',
    nodeSpan: node.span,
    expected: ['NUMERIC'],
    received: [base.type, exp.type],
  });
  return null;
}

function evaluateAbs(node, symbols, diagnostics) {
  const [valNode] = node.positional || [];
  const val = evaluateExpression(valNode, symbols, diagnostics);
  if (!val) return null;

  if (val.type === 'I32') {
    if (val.value === I32_MIN) {
      pushDiagnostic(diagnostics, {
        code: TYPE_CODES.RANGE,
        message: 'ABS of minimum 32-bit integer overflows.',
        nodeSpan: node.span,
      });
      return null;
    }
    return Object.freeze({ type: 'I32', value: Math.abs(val.value) });
  }

  if (['FIXED', 'RATIO', 'PX'].includes(val.type)) {
    const rat = toRational(val);
    const num = BigInt(rat.numerator);
    const den = BigInt(rat.denominator);
    const absRat = makeRational(num < 0n ? -num : num, den);
    return Object.freeze({ type: val.type, value: absRat });
  }

  pushDiagnostic(diagnostics, {
    code: TYPE_CODES.MISMATCH,
    message: 'ABS requires a numeric operand.',
    nodeSpan: node.span,
    expected: ['NUMERIC'],
    received: [val.type],
  });
  return null;
}

function evaluateMinMax(node, symbols, diagnostics, isMax) {
  const [leftNode, rightNode] = node.positional || [];
  const left = evaluateExpression(leftNode, symbols, diagnostics);
  const right = evaluateExpression(rightNode, symbols, diagnostics);
  if (!left || !right) return null;

  if (!NUMERIC_TYPES.includes(left.type) || left.type !== right.type) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: `${node.opcode} requires two operands of the same numeric type.`,
      nodeSpan: node.span,
      expected: [left.type],
      received: [right.type],
    });
    return null;
  }

  if (left.type === 'I32') {
    const res = isMax ? Math.max(left.value, right.value) : Math.min(left.value, right.value);
    return Object.freeze({ type: 'I32', value: res });
  }

  const ratA = toRational(left);
  const ratB = toRational(right);
  const diff = BigInt(ratA.numerator) * BigInt(ratB.denominator) - BigInt(ratB.numerator) * BigInt(ratA.denominator);
  const chosen = (isMax ? diff >= 0n : diff <= 0n) ? ratA : ratB;
  return Object.freeze({ type: left.type, value: chosen });
}

function evaluateClamp(node, symbols, diagnostics) {
  const valNode = node.named?.VAL || (node.positional && node.positional[0]);
  const minNode = node.named?.MIN || (node.positional && node.positional[1]);
  const maxNode = node.named?.MAX || (node.positional && node.positional[2]);
  const val = evaluateExpression(valNode, symbols, diagnostics);
  const min = evaluateExpression(minNode, symbols, diagnostics);
  const max = evaluateExpression(maxNode, symbols, diagnostics);
  if (!val || !min || !max) return null;

  if (!NUMERIC_TYPES.includes(val.type) || val.type !== min.type || val.type !== max.type) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: 'CLAMP requires three operands of the same numeric type.',
      nodeSpan: node.span,
      expected: [val.type],
      received: [min.type, max.type],
    });
    return null;
  }

  if (val.type === 'I32') {
    const clamped = Math.max(min.value, Math.min(max.value, val.value));
    return Object.freeze({ type: 'I32', value: clamped });
  }

  const clampedRat = clampRational(toRational(val), toRational(min), toRational(max));
  return Object.freeze({ type: val.type, value: clampedRat });
}

function evaluateFloorCeilRound(node, symbols, diagnostics, mode) {
  const [valNode] = node.positional || [];
  const val = evaluateExpression(valNode, symbols, diagnostics);
  if (!val) return null;

  if (val.type === 'I32') return val;

  if (['FIXED', 'RATIO', 'PX'].includes(val.type)) {
    const rat = toRational(val);
    const num = BigInt(rat.numerator);
    const den = BigInt(rat.denominator);
    let rounded;
    if (mode === 'FLOOR') {
      rounded = num >= 0n ? num / den : (num - den + 1n) / den;
    } else if (mode === 'CEIL') {
      rounded = num >= 0n ? (num + den - 1n) / den : num / den;
    } else {
      const rem = num >= 0n ? num % den : -num % den;
      const div = num / den;
      if (2n * rem >= den) {
        rounded = num >= 0n ? div + 1n : div - 1n;
      } else {
        rounded = div;
      }
    }
    if (val.type === 'PX') {
      return Object.freeze({ type: 'PX', value: makeRational(rounded) });
    }
    if (!inI32Range(rounded)) {
      pushDiagnostic(diagnostics, {
        code: TYPE_CODES.RANGE,
        message: `${mode} result outside signed 32-bit integer range.`,
        nodeSpan: node.span,
      });
      return null;
    }
    return Object.freeze({ type: 'I32', value: Number(rounded) });
  }

  pushDiagnostic(diagnostics, {
    code: TYPE_CODES.MISMATCH,
    message: `${mode} requires a numeric operand.`,
    nodeSpan: node.span,
    expected: ['NUMERIC'],
    received: [val.type],
  });
  return null;
}

function evaluateSqrt(node, symbols, diagnostics) {
  const [valNode] = node.positional || [];
  const val = evaluateExpression(valNode, symbols, diagnostics);
  if (!val) return null;

  if (!NUMERIC_TYPES.includes(val.type)) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: 'SQRT requires a numeric operand.',
      nodeSpan: node.span,
      expected: ['NUMERIC'],
      received: [val.type],
    });
    return null;
  }

  const rat = toRational(val);
  if (BigInt(rat.numerator) < 0n) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.RANGE,
      message: 'SQRT of negative value is undefined.',
      nodeSpan: node.span,
      expected: ['non-negative value'],
      received: [rationalToString(rat)],
    });
    return null;
  }

  const sqrtRat = sqrtRational(rat);
  return Object.freeze({ type: val.type === 'I32' ? 'FIXED' : val.type, value: sqrtRat });
}

function evaluateLerp(node, symbols, diagnostics) {
  const aNode = node.named?.A || (node.positional && node.positional[0]);
  const bNode = node.named?.B || (node.positional && node.positional[1]);
  const tNode = node.named?.T || (node.positional && node.positional[2]);
  const a = evaluateExpression(aNode, symbols, diagnostics);
  const b = evaluateExpression(bNode, symbols, diagnostics);
  const t = evaluateExpression(tNode, symbols, diagnostics);
  if (!a || !b || !t) return null;

  if (!NUMERIC_TYPES.includes(a.type) || a.type !== b.type) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: 'LERP requires first two operands to have matching numeric types.',
      nodeSpan: node.span,
      expected: [a.type],
      received: [b.type],
    });
    return null;
  }

  if (!SCALAR_TYPES.includes(t.type)) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: 'LERP factor T must be a scalar (I32, FIXED, or RATIO).',
      nodeSpan: node.span,
      expected: ['SCALAR'],
      received: [t.type],
    });
    return null;
  }

  const resRat = lerpRational(toRational(a), toRational(b), toRational(t));
  if (a.type === 'I32') {
    const rounded = roundRationalToBigInt(resRat);
    if (!inI32Range(rounded)) {
      pushDiagnostic(diagnostics, {
        code: TYPE_CODES.RANGE,
        message: 'LERP result is outside the signed 32-bit range.',
        nodeSpan: node.span,
        expected: [`${I32_MIN}..${I32_MAX}`],
        received: [rounded.toString(10)],
      });
      return null;
    }
    return Object.freeze({ type: 'I32', value: Number(rounded) });
  }
  return Object.freeze({ type: a.type, value: resRat });
}

function evaluateMapRange(node, symbols, diagnostics) {
  const valNode = node.named?.VAL || (node.positional && node.positional[0]);
  const inMinNode = node.named?.IN_MIN || (node.positional && node.positional[1]);
  const inMaxNode = node.named?.IN_MAX || (node.positional && node.positional[2]);
  const outMinNode = node.named?.OUT_MIN || (node.positional && node.positional[3]);
  const outMaxNode = node.named?.OUT_MAX || (node.positional && node.positional[4]);

  const val = evaluateExpression(valNode, symbols, diagnostics);
  const inMin = evaluateExpression(inMinNode, symbols, diagnostics);
  const inMax = evaluateExpression(inMaxNode, symbols, diagnostics);
  const outMin = evaluateExpression(outMinNode, symbols, diagnostics);
  const outMax = evaluateExpression(outMaxNode, symbols, diagnostics);
  if (!val || !inMin || !inMax || !outMin || !outMax) return null;

  const resRat = mapRangeRational(toRational(val), toRational(inMin), toRational(inMax), toRational(outMin), toRational(outMax));
  if (outMin.type === 'I32') {
    const rounded = roundRationalToBigInt(resRat);
    if (!inI32Range(rounded)) {
      pushDiagnostic(diagnostics, {
        code: TYPE_CODES.RANGE,
        message: 'MAP_RANGE result is outside the signed 32-bit range.',
        nodeSpan: node.span,
        expected: [`${I32_MIN}..${I32_MAX}`],
        received: [rounded.toString(10)],
      });
      return null;
    }
    return Object.freeze({ type: 'I32', value: Number(rounded) });
  }
  return Object.freeze({ type: outMin.type, value: resRat });
}

function evaluateGcdLcm(node, symbols, diagnostics, isLcm) {
  const [leftNode, rightNode] = node.positional || [];
  const left = evaluateExpression(leftNode, symbols, diagnostics);
  const right = evaluateExpression(rightNode, symbols, diagnostics);
  if (!left || !right) return null;

  if (left.type !== 'I32' || right.type !== 'I32') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: `${node.opcode} requires two I32 operands.`,
      nodeSpan: node.span,
      expected: ['I32'],
      received: [left.type, right.type],
    });
    return null;
  }

  const result = isLcm
    ? lcmBigInt(BigInt(left.value), BigInt(right.value))
    : gcdBigInt(BigInt(left.value), BigInt(right.value));
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

function evaluateTrig(node, symbols, diagnostics, trigFn) {
  const [angleNode] = node.positional || [];
  const angle = evaluateExpression(angleNode, symbols, diagnostics);
  if (!angle) return null;

  if (angle.type !== 'ANGLE') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: `${node.opcode} requires an ANGLE operand.`,
      nodeSpan: node.span,
      expected: ['ANGLE'],
      received: [angle.type],
    });
    return null;
  }

  try {
    const res = trigFn(angle.value);
    return Object.freeze({ type: 'FIXED', value: res });
  } catch (error) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.INVALID_OPERATION,
      message: error instanceof Error ? error.message : String(error),
      nodeSpan: node.span,
    });
    return null;
  }
}

function evaluateAtan2(node, symbols, diagnostics) {
  const [yNode, xNode] = node.positional || [];
  const y = evaluateExpression(yNode, symbols, diagnostics);
  const x = evaluateExpression(xNode, symbols, diagnostics);
  if (!y || !x) return null;

  if (!NUMERIC_TYPES.includes(y.type) || !NUMERIC_TYPES.includes(x.type)) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: 'ATAN2 requires numeric Y and X operands.',
      nodeSpan: node.span,
      expected: ['NUMERIC'],
      received: [y.type, x.type],
    });
    return null;
  }

  const angle = atan2Angle(toRational(y), toRational(x));
  return Object.freeze({ type: 'ANGLE', value: angle });
}

function evaluateDistance(node, symbols, diagnostics) {
  const [v1Node, v2Node] = node.positional || [];
  const v1 = evaluateExpression(v1Node, symbols, diagnostics);
  const v2 = evaluateExpression(v2Node, symbols, diagnostics);
  if (!v1 || !v2) return null;

  if (v1.type !== 'VEC2' || v2.type !== 'VEC2') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: 'DISTANCE requires two VEC2 operands.',
      nodeSpan: node.span,
      expected: ['VEC2'],
      received: [v1.type, v2.type],
    });
    return null;
  }

  const d = distanceVec2(v1.value, v2.value);
  return Object.freeze({ type: 'PX', value: d });
}

function evaluateDotCross(node, symbols, diagnostics, isCross) {
  const [v1Node, v2Node] = node.positional || [];
  const v1 = evaluateExpression(v1Node, symbols, diagnostics);
  const v2 = evaluateExpression(v2Node, symbols, diagnostics);
  if (!v1 || !v2) return null;

  if (v1.type !== 'VEC2' || v2.type !== 'VEC2') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: `${node.opcode} requires two VEC2 operands.`,
      nodeSpan: node.span,
      expected: ['VEC2'],
      received: [v1.type, v2.type],
    });
    return null;
  }

  const res = isCross ? crossVec2(v1.value, v2.value) : dotVec2(v1.value, v2.value);
  return Object.freeze({ type: 'FIXED', value: res });
}

function evaluateNormalize(node, symbols, diagnostics) {
  const [vNode] = node.positional || [];
  const v = evaluateExpression(vNode, symbols, diagnostics);
  if (!v) return null;

  if (v.type !== 'VEC2') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: 'NORMALIZE requires a VEC2 operand.',
      nodeSpan: node.span,
      expected: ['VEC2'],
      received: [v.type],
    });
    return null;
  }

  const norm = normalizeVec2(v.value);
  return Object.freeze({ type: 'VEC2', value: norm });
}

function areValuesEqual(a, b) {
  if (!a || !b) return a === b;
  if (a.type !== b.type) return false;
  if (a.type === 'I32' || a.type === 'BOOL' || a.type === 'STRING' || a.type === 'COLOR') {
    return a.value === b.value;
  }
  if (['FIXED', 'RATIO', 'PX'].includes(a.type)) {
    const rA = toRational(a);
    const rB = toRational(b);
    return BigInt(rA.numerator) * BigInt(rB.denominator) === BigInt(rB.numerator) * BigInt(rA.denominator);
  }
  if (a.type === 'VEC2') {
    return areValuesEqual(a.value.x, b.value.x) && areValuesEqual(a.value.y, b.value.y);
  }
  return false;
}

function compareValues(a, b) {
  if (a.type === 'I32' && b.type === 'I32') {
    return a.value < b.value ? -1 : (a.value > b.value ? 1 : 0);
  }
  if (NUMERIC_TYPES.includes(a.type) && NUMERIC_TYPES.includes(b.type)) {
    const rA = toRational(a);
    const rB = toRational(b);
    const diff = BigInt(rA.numerator) * BigInt(rB.denominator) - BigInt(rB.numerator) * BigInt(rA.denominator);
    return diff < 0n ? -1 : (diff > 0n ? 1 : 0);
  }
  return 0;
}

function evaluateComparison(node, symbols, diagnostics, op) {
  const [leftNode, rightNode] = node.positional || [];
  const left = evaluateExpression(leftNode, symbols, diagnostics);
  const right = evaluateExpression(rightNode, symbols, diagnostics);
  if (!left || !right) return null;

  if (op === 'EQ') {
    return Object.freeze({ type: 'BOOL', value: areValuesEqual(left, right) });
  }
  if (op === 'NEQ') {
    return Object.freeze({ type: 'BOOL', value: !areValuesEqual(left, right) });
  }

  if (!NUMERIC_TYPES.includes(left.type) || left.type !== right.type) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: `${op} requires comparable operands of matching numeric types.`,
      nodeSpan: node.span,
      expected: [left.type],
      received: [right.type],
    });
    return null;
  }

  const cmp = compareValues(left, right);
  let res = false;
  if (op === 'LT') res = cmp < 0;
  else if (op === 'LTE') res = cmp <= 0;
  else if (op === 'GT') res = cmp > 0;
  else if (op === 'GTE') res = cmp >= 0;
  return Object.freeze({ type: 'BOOL', value: res });
}

function evaluateLogical(node, symbols, diagnostics, op) {
  if (op === 'NOT') {
    const [valNode] = node.positional || [];
    const val = evaluateExpression(valNode, symbols, diagnostics);
    if (!val) return null;
    if (val.type !== 'BOOL') {
      pushDiagnostic(diagnostics, {
        code: TYPE_CODES.MISMATCH,
        message: 'NOT requires a BOOL operand.',
        nodeSpan: node.span,
        expected: ['BOOL'],
        received: [val.type],
      });
      return null;
    }
    return Object.freeze({ type: 'BOOL', value: !val.value });
  }

  const [leftNode, rightNode] = node.positional || [];
  const left = evaluateExpression(leftNode, symbols, diagnostics);
  const right = evaluateExpression(rightNode, symbols, diagnostics);
  if (!left || !right) return null;

  if (left.type !== 'BOOL' || right.type !== 'BOOL') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: `${op} requires BOOL operands.`,
      nodeSpan: node.span,
      expected: ['BOOL'],
      received: [left.type, right.type],
    });
    return null;
  }

  const res = op === 'AND' ? (left.value && right.value) : (left.value || right.value);
  return Object.freeze({ type: 'BOOL', value: res });
}

function extractIterableElements(iterable) {
  if (!iterable) return [];
  if (iterable.type === 'RANGE') {
    return iterable.value.elements || [];
  }
  if (iterable.type === 'SEQUENCE') {
    return iterable.elements || iterable.value?.elements || [];
  }
  if (Array.isArray(iterable.value)) {
    return iterable.value;
  }
  if (Array.isArray(iterable)) {
    return iterable;
  }
  return [];
}

function evaluateRange(node, symbols, diagnostics) {
  const startNode = node.named?.START || (node.positional && node.positional[0]);
  const endNode = node.named?.END || (node.positional && node.positional[1]);
  const stepNode = node.named?.STEP || (node.positional && node.positional[2]);

  const startVal = evaluateExpression(startNode, symbols, diagnostics);
  const endVal = evaluateExpression(endNode, symbols, diagnostics);
  const stepVal = stepNode ? evaluateExpression(stepNode, symbols, diagnostics) : null;
  if (!startVal || !endVal) return null;

  if (startVal.type !== 'I32' || endVal.type !== 'I32') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: 'RANGE requires I32 start and end.',
      nodeSpan: node.span,
      expected: ['I32'],
      received: [startVal.type, endVal.type],
    });
    return null;
  }
  if (stepVal && stepVal.type !== 'I32') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: 'RANGE STEP must be an I32.',
      nodeSpan: stepNode.span,
      expected: ['I32'],
      received: [stepVal.type],
    });
    return null;
  }

  const start = startVal.value;
  const end = endVal.value;
  const step = stepVal ? stepVal.value : (start <= end ? 1 : -1);

  if (step === 0) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.INVALID_OPERATION,
      message: 'RANGE step cannot be 0.',
      nodeSpan: node.span,
    });
    return null;
  }

  const elementCount = step > 0
    ? (start < end ? Math.ceil((end - start) / step) : 0)
    : (start > end ? Math.ceil((start - end) / -step) : 0);
  if (elementCount > MAX_COLLECTION_ELEMENTS) {
    pushDiagnostic(diagnostics, {
      code: TERM_CODES.UNBOUNDED_COLLECTION,
      message: `RANGE produces ${elementCount} elements, exceeding the protected collection limit ${MAX_COLLECTION_ELEMENTS}.`,
      nodeSpan: node.span,
      expected: [`0..${MAX_COLLECTION_ELEMENTS}`],
      received: [String(elementCount)],
    });
    return null;
  }

  const elements = [];
  if (step > 0) {
    for (let i = start; i < end; i += step) {
      elements.push(Object.freeze({ type: 'I32', value: i }));
    }
  } else {
    for (let i = start; i > end; i += step) {
      elements.push(Object.freeze({ type: 'I32', value: i }));
    }
  }

  return Object.freeze({
    type: 'RANGE',
    value: Object.freeze({ start, end, step, elements: Object.freeze(elements) }),
  });
}

function evaluateAt(node, symbols, diagnostics) {
  const colNode = node.named?.COLLECTION || (node.positional && node.positional[0]);
  const idxNode = node.named?.INDEX || (node.positional && node.positional[1]);
  const col = evaluateExpression(colNode, symbols, diagnostics);
  const idx = evaluateExpression(idxNode, symbols, diagnostics);
  if (!col || !idx) return null;

  if (idx.type !== 'I32') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: 'AT requires an I32 index.',
      nodeSpan: node.span,
      expected: ['I32'],
      received: [idx.type],
    });
    return null;
  }

  const elements = extractIterableElements(col);
  const i = idx.value;
  if (i < 0 || i >= elements.length) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.RANGE,
      message: `Index ${i} out of bounds (length ${elements.length}).`,
      nodeSpan: node.span,
      expected: [`0..${elements.length - 1}`],
      received: [String(i)],
    });
    return null;
  }

  return elements[i];
}

function evaluateLength(node, symbols, diagnostics) {
  const colNode = node.named?.COLLECTION || (node.positional && node.positional[0]);
  const col = evaluateExpression(colNode, symbols, diagnostics);
  if (!col) return null;
  const elements = extractIterableElements(col);
  return Object.freeze({ type: 'I32', value: elements.length });
}

function evaluateSumProduct(node, symbols, diagnostics, isProduct) {
  const colNode = node.named?.COLLECTION || (node.positional && node.positional[0]);
  const col = evaluateExpression(colNode, symbols, diagnostics);
  if (!col) return null;
  const elements = extractIterableElements(col);
  if (elements.length === 0) {
    return Object.freeze({ type: 'I32', value: isProduct ? 1 : 0 });
  }

  const firstType = elements[0].type;
  if (firstType === 'I32') {
    let acc = BigInt(isProduct ? 1 : 0);
    for (const el of elements) {
      if (isProduct) acc *= BigInt(el.value);
      else acc += BigInt(el.value);
    }
    if (!inI32Range(acc)) {
      pushDiagnostic(diagnostics, {
        code: TYPE_CODES.RANGE,
        message: `${node.opcode} result is outside the signed 32-bit range.`,
        nodeSpan: node.span,
        expected: [`${I32_MIN}..${I32_MAX}`],
        received: [acc.toString(10)],
      });
      return null;
    }
    return Object.freeze({ type: 'I32', value: Number(acc) });
  }

  let accRat = makeRational(BigInt(isProduct ? 1 : 0));
  for (const el of elements) {
    const rat = toRational(el);
    accRat = isProduct ? mulRational(accRat, rat) : addRational(accRat, rat);
  }
  return Object.freeze({ type: firstType, value: accRat });
}

function evaluateZip(node, symbols, diagnostics) {
  const [aNode, bNode] = node.positional || [];
  const a = evaluateExpression(aNode, symbols, diagnostics);
  const b = evaluateExpression(bNode, symbols, diagnostics);
  if (!a || !b) return null;
  const elementsA = extractIterableElements(a);
  const elementsB = extractIterableElements(b);
  const minLen = Math.min(elementsA.length, elementsB.length);
  const zipped = [];
  for (let i = 0; i < minLen; i++) {
    zipped.push(Object.freeze({ a: elementsA[i], b: elementsB[i] }));
  }
  return Object.freeze({ type: 'COLLECTION', value: Object.freeze(zipped) });
}

function evaluatePrev(node, symbols, diagnostics) {
  const kNode = node.positional && node.positional[0];
  const kVal = kNode ? evaluateExpression(kNode, symbols, diagnostics) : { type: 'I32', value: 1 };
  if (!kVal) return null;
  if (kVal.type !== 'I32' || kVal.value < 1) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.INVALID_OPERATION,
      message: 'PREV requires an integer offset >= 1.',
      nodeSpan: node.span,
    });
    return null;
  }
  ensureAnalyzerContext(symbols);
  const recurrence = symbols._callContext?.recurrence;
  if (!recurrence) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.INVALID_OPERATION,
      message: 'PREV can only be used inside a SEQUENCE recurrence NEXT expression.',
      nodeSpan: node.span,
    });
    return null;
  }
  return recurrence.getPrev(kVal.value);
}

function evaluateRandom(node, symbols, diagnostics, mode) {
  const rngNode = (node.positional && node.positional[0]) || node.named?.RNG;
  const rng = evaluateExpression(rngNode, symbols, diagnostics);
  if (!rng || rng.type !== 'RNG') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: `${node.opcode} requires an RNG operand.`,
      nodeSpan: node.span,
      expected: ['RNG'],
      received: [rng ? rng.type : 'UNKNOWN'],
    });
    return null;
  }

  if (mode === 'RANDOM_I32') {
    const minNode = node.named?.MIN || (node.positional && node.positional[1]);
    const maxNode = node.named?.MAX || (node.positional && node.positional[2]);
    const min = evaluateExpression(minNode, symbols, diagnostics);
    const max = evaluateExpression(maxNode, symbols, diagnostics);
    if (!min || !max) return null;
    const val = rng.rng.nextRange(min.value, max.value);
    return Object.freeze({ type: 'I32', value: val });
  }

  if (mode === 'RANDOM_SCALAR') {
    const minNode = node.named?.MIN || (node.positional && node.positional[1]);
    const maxNode = node.named?.MAX || (node.positional && node.positional[2]);
    const min = minNode ? toRational(evaluateExpression(minNode, symbols, diagnostics)) : makeRational(0);
    const max = maxNode ? toRational(evaluateExpression(maxNode, symbols, diagnostics)) : makeRational(1);
    const val = rng.rng.nextScalar(min, max);
    return Object.freeze({ type: 'FIXED', value: val });
  }

  if (mode === 'RANDOM_VEC2') {
    const minNode = node.named?.MIN || (node.positional && node.positional[1]);
    const maxNode = node.named?.MAX || (node.positional && node.positional[2]);
    const min = evaluateExpression(minNode, symbols, diagnostics);
    const max = evaluateExpression(maxNode, symbols, diagnostics);
    if (!min || !max) return null;
    let minX = makeRational(0), minY = makeRational(0), maxX = makeRational(1), maxY = makeRational(1);
    if (min.type === 'VEC2') {
      minX = toRational(min.value.x);
      minY = toRational(min.value.y);
    } else {
      minX = toRational(min);
      minY = minX;
    }
    if (max.type === 'VEC2') {
      maxX = toRational(max.value.x);
      maxY = toRational(max.value.y);
    } else {
      maxX = toRational(max);
      maxY = maxX;
    }
    const xRat = rng.rng.nextScalar(minX, maxX);
    const yRat = rng.rng.nextScalar(minY, maxY);
    return Object.freeze({
      type: 'VEC2',
      value: Object.freeze({
        x: Object.freeze({ type: 'PX', value: xRat }),
        y: Object.freeze({ type: 'PX', value: yRat }),
      }),
    });
  }

  return null;
}

function evaluateNoise2D(node, symbols, diagnostics) {
  const atNode = node.named?.AT || (node.positional && node.positional[0]);
  const seedNode = node.named?.SEED || (node.positional && node.positional[1]);
  const freqNode = node.named?.FREQUENCY || (node.positional && node.positional[2]);
  const octNode = node.named?.OCTAVES || (node.positional && node.positional[3]);

  const at = evaluateExpression(atNode, symbols, diagnostics);
  if (!at || at.type !== 'VEC2') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: 'NOISE_2D requires an AT VEC2 operand.',
      nodeSpan: node.span,
      expected: ['VEC2'],
      received: [at ? at.type : 'UNKNOWN'],
    });
    return null;
  }

  const seed = seedNode ? (evaluateExpression(seedNode, symbols, diagnostics)?.value ?? 0) : 0;
  const freq = freqNode ? toRational(evaluateExpression(freqNode, symbols, diagnostics)) : makeRational(1);
  const octaves = octNode ? (evaluateExpression(octNode, symbols, diagnostics)?.value ?? 1) : 1;

  const val = deterministicNoise2D(seed, freq, octaves, toRational(at.value.x), toRational(at.value.y));
  return Object.freeze({ type: 'FIXED', value: val });
}

function evaluateFnCall(node, symbols, diagnostics) {
  ensureAnalyzerContext(symbols);
  const ctx = symbols._callContext;
  const fnTarget = node.positional && node.positional[0];
  const fnName = fnTarget ? (fnTarget.value || fnTarget.raw) : null;
  if (!fnName || !ctx.functions.has(fnName)) {
    pushDiagnostic(diagnostics, {
      code: BIND_CODES.UNKNOWN_SYMBOL,
      message: `Unknown function ${JSON.stringify(fnName)}.`,
      nodeSpan: node.span,
      relatedSymbols: fnName ? [fnName] : [],
    });
    return null;
  }

  const fnDef = ctx.functions.get(fnName);
  const argNodes = (node.positional || []).slice(1);
  if (argNodes.length !== fnDef.params.length) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.INVALID_OPERATION,
      message: `Function '${fnName}' expected ${fnDef.params.length} arguments, received ${argNodes.length}.`,
      nodeSpan: node.span,
    });
    return null;
  }

  const selfCalls = ctx.stack.filter((name) => name === fnName).length;
  if (fnDef.recursionMax !== null && selfCalls >= fnDef.recursionMax) {
    pushDiagnostic(diagnostics, {
      code: TERM_CODES.RECURSION_DEPTH_EXCEEDED,
      message: `Recursion depth limit ${fnDef.recursionMax} exceeded in function '${fnName}'.`,
      nodeSpan: node.span,
    });
    return null;
  }
  if (ctx.depth >= (ctx.maxDepth || 64)) {
    pushDiagnostic(diagnostics, {
      code: TERM_CODES.RECURSION_DEPTH_EXCEEDED,
      message: `Call stack depth limit ${ctx.maxDepth || 64} exceeded.`,
      nodeSpan: node.span,
    });
    return null;
  }

  const localScope = new Map();
  for (let i = 0; i < fnDef.params.length; i++) {
    const param = fnDef.params[i];
    const argVal = evaluateExpression(argNodes[i], symbols, diagnostics);
    if (!argVal) return null;

    if (param.type !== argVal.type && !(param.type === 'NUMERIC' && NUMERIC_TYPES.includes(argVal.type))) {
      pushDiagnostic(diagnostics, {
        code: TYPE_CODES.MISMATCH,
        message: `Argument for parameter '${param.name}' in '${fnName}' expected ${param.type}, received ${argVal.type}.`,
        nodeSpan: argNodes[i].span,
        expected: [param.type],
        received: [argVal.type],
      });
      return null;
    }
    localScope.set(param.name, argVal);
  }

  ctx.depth += 1;
  ctx.stack.push(fnName);
  let res = null;
  try {
    res = withScope(symbols, localScope, () => {
      return executeFunctionBody(fnDef.body, symbols, diagnostics);
    });
  } finally {
    ctx.depth -= 1;
    ctx.stack.pop();
  }

  if (!res || !res.returned) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.INVALID_OPERATION,
      message: `Function '${fnName}' did not return a value.`,
      nodeSpan: fnDef.span,
    });
    return null;
  }

  const retVal = res.value;
  if (!retVal) return null;
  if (retVal.type !== fnDef.returnType && !(fnDef.returnType === 'NUMERIC' && NUMERIC_TYPES.includes(retVal.type))) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: `Function '${fnName}' returned ${retVal.type}, expected ${fnDef.returnType}.`,
      nodeSpan: fnDef.span,
      expected: [fnDef.returnType],
      received: [retVal.type],
    });
    return null;
  }

  return retVal;
}

function executeFunctionBody(statements, symbols, diagnostics) {
  if (!Array.isArray(statements)) return null;
  for (const stmt of statements) {
    if (stmt.kind === 'ReturnStatement') {
      const val = evaluateExpression(stmt.value, symbols, diagnostics);
      return { returned: true, value: val };
    }
    if (stmt.kind === 'LetStatement') {
      const val = evaluateExpression(stmt.value, symbols, diagnostics);
      if (val) {
        const topScope = symbols._scopeStack[symbols._scopeStack.length - 1];
        topScope.set(stmt.symbol, val);
      }
    } else if (stmt.kind === 'IfStatement') {
      const cond = evaluateExpression(stmt.condition, symbols, diagnostics);
      if (!cond) return null;
      if (cond.type !== 'BOOL') {
        pushDiagnostic(diagnostics, {
          code: TYPE_CODES.MISMATCH,
          message: 'IF condition must evaluate to BOOL.',
          nodeSpan: stmt.span,
          expected: ['BOOL'],
          received: [cond.type],
        });
        return null;
      }
      if (cond.value === true) {
        const res = withScope(symbols, new Map(), () => executeFunctionBody(stmt.then, symbols, diagnostics));
        if (res && res.returned) return res;
      } else if (stmt.else && stmt.else.length > 0) {
        const res = withScope(symbols, new Map(), () => executeFunctionBody(stmt.else, symbols, diagnostics));
        if (res && res.returned) return res;
      }
    } else if (stmt.kind === 'MatchStatement') {
      const target = evaluateExpression(stmt.target, symbols, diagnostics);
      if (!target) return null;
      let matched = false;
      for (const c of stmt.cases || []) {
        const pat = evaluateExpression(c.pattern, symbols, diagnostics);
        if (pat && areValuesEqual(target, pat)) {
          matched = true;
          const res = withScope(symbols, new Map(), () => executeFunctionBody(c.body, symbols, diagnostics));
          if (res && res.returned) return res;
          break;
        }
      }
      if (!matched && stmt.default) {
        const res = withScope(symbols, new Map(), () => executeFunctionBody(stmt.default, symbols, diagnostics));
        if (res && res.returned) return res;
      }
    } else if (stmt.kind === 'ForStatement') {
      const iterable = evaluateExpression(stmt.in, symbols, diagnostics);
      const items = extractIterableElements(iterable);
      for (const item of items) {
        const loopScope = new Map([[stmt.variable, item]]);
        const res = withScope(symbols, loopScope, () => executeFunctionBody(stmt.body, symbols, diagnostics));
        if (res && res.returned) return res;
      }
    }
  }
  return null;
}

function executeShapeStatements(statements, symbols, diagnostics, emittedShapes) {
  if (!Array.isArray(statements)) return;
  for (const stmt of statements) {
    if (stmt.kind === 'EmitStatement') {
      const val = evaluateExpression(stmt.value, symbols, diagnostics);
      if (val) {
        if (val.type !== 'SHAPE') {
          pushDiagnostic(diagnostics, {
            code: TYPE_CODES.MISMATCH,
            message: 'EMIT requires a SHAPE operand.',
            nodeSpan: stmt.span,
            expected: ['SHAPE'],
            received: [val.type],
          });
        } else {
          emittedShapes.push(val.value);
        }
      }
    } else if (stmt.kind === 'LetStatement') {
      const val = evaluateExpression(stmt.value, symbols, diagnostics);
      if (val) {
        const topScope = symbols._scopeStack[symbols._scopeStack.length - 1];
        topScope.set(stmt.symbol, val);
      }
    } else if (stmt.kind === 'ForStatement') {
      const iterable = evaluateExpression(stmt.in, symbols, diagnostics);
      const items = extractIterableElements(iterable);
      for (const item of items) {
        const loopScope = new Map([[stmt.variable, item]]);
        withScope(symbols, loopScope, () => {
          executeShapeStatements(stmt.body, symbols, diagnostics, emittedShapes);
        });
      }
    } else if (stmt.kind === 'RadialStatement') {
      const countVal = evaluateExpression(stmt.count, symbols, diagnostics);
      if (!countVal || countVal.type !== 'I32' || countVal.value < 1) {
        pushDiagnostic(diagnostics, {
          code: TYPE_CODES.INVALID_OPERATION,
          message: 'RADIAL COUNT must be an I32 >= 1.',
          nodeSpan: stmt.span,
        });
        continue;
      }
      const count = countVal.value;
      const centerVal = stmt.center
        ? evaluateExpression(stmt.center, symbols, diagnostics)
        : { type: 'VEC2', value: { x: makeRational(0), y: makeRational(0) } };
      const center = centerVal?.value || { x: makeRational(0), y: makeRational(0) };

      for (let k = 0; k < count; k++) {
        const subEmitted = [];
        const radialScope = new Map([
          ['$index', Object.freeze({ type: 'I32', value: k })],
        ]);
        withScope(symbols, radialScope, () => {
          executeShapeStatements(stmt.body, symbols, diagnostics, subEmitted);
        });
        const angle = createAngle(makeRational(BigInt(k), BigInt(count)), 'TURNS');
        const rot = createRotation(angle, center);
        for (const s of subEmitted) {
          emittedShapes.push(applyTransformToShape(rot, s));
        }
      }
    } else if (stmt.kind === 'IfStatement') {
      const cond = evaluateExpression(stmt.condition, symbols, diagnostics);
      if (cond && cond.type === 'BOOL') {
        if (cond.value === true) {
          withScope(symbols, new Map(), () => {
            executeShapeStatements(stmt.then, symbols, diagnostics, emittedShapes);
          });
        } else if (stmt.else && stmt.else.length > 0) {
          withScope(symbols, new Map(), () => {
            executeShapeStatements(stmt.else, symbols, diagnostics, emittedShapes);
          });
        }
      }
    }
  }
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
  ensureAnalyzerContext(symbols);
  const declaredType = declaration.declaredType;
  if (declaredType && !isKnownType(declaredType)) {
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

  if (declaredType && resolved.type !== declaredType && !(declaredType === 'NUMERIC' && NUMERIC_TYPES.includes(resolved.type))) {
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
  ensureAnalyzerContext(symbols);
  if (symbols.has(declaration.symbol)) {
    pushDiagnostic(diagnostics, {
      code: BIND_CODES.DUPLICATE_SYMBOL,
      message: `Symbol ${declaration.symbol} is already bound.`,
      nodeSpan: declaration.span,
      relatedSymbols: [declaration.symbol],
    });
    return;
  }

  if (declaration.kind === 'ShapeBlockDeclaration') {
    const emittedShapes = [];
    withScope(symbols, new Map(), () => {
      executeShapeStatements(declaration.body, symbols, diagnostics, emittedShapes);
    });
    const shapeVal = Object.freeze({
      type: 'SHAPE',
      value: Object.freeze({ kind: 'COMPOUND', shapes: Object.freeze(emittedShapes) }),
    });
    symbols.set(declaration.symbol, shapeVal);
    shapes.push(Object.freeze({ symbol: declaration.symbol, value: shapeVal.value }));
    return;
  }

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

  symbols.set(declaration.symbol, resolved);
  shapes.push(Object.freeze({ symbol: declaration.symbol, value: resolved.value }));
}

function analyzeSequenceDeclaration(declaration, symbols, diagnostics, sequences) {
  ensureAnalyzerContext(symbols);
  if (symbols.has(declaration.symbol)) {
    pushDiagnostic(diagnostics, {
      code: BIND_CODES.DUPLICATE_SYMBOL,
      message: `Symbol ${declaration.symbol} is already bound.`,
      nodeSpan: declaration.span,
      relatedSymbols: [declaration.symbol],
    });
    return;
  }

  const countVal = evaluateExpression(declaration.count, symbols, diagnostics);
  if (!countVal || countVal.type !== 'I32' || countVal.value < 0) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.RANGE,
      message: `SEQUENCE COUNT must be an I32 >= 0.`,
      nodeSpan: declaration.span,
    });
    return;
  }

  const count = countVal.value;
  if (count > MAX_COLLECTION_ELEMENTS) {
    pushDiagnostic(diagnostics, {
      code: TERM_CODES.UNBOUNDED_COLLECTION,
      message: `SEQUENCE COUNT ${count} exceeds the protected collection limit ${MAX_COLLECTION_ELEMENTS}.`,
      nodeSpan: declaration.span,
      expected: [`0..${MAX_COLLECTION_ELEMENTS}`],
      received: [String(count)],
    });
    return;
  }
  const seeds = [];
  for (const seedNode of declaration.seeds || []) {
    const s = evaluateExpression(seedNode, symbols, diagnostics);
    if (!s) return;
    if (s.type !== declaration.itemType && !(declaration.itemType === 'NUMERIC' && NUMERIC_TYPES.includes(s.type))) {
      pushDiagnostic(diagnostics, {
        code: TYPE_CODES.MISMATCH,
        message: `SEQUENCE seed element type ${s.type} does not match declared type ${declaration.itemType}.`,
        nodeSpan: seedNode.span,
        expected: [declaration.itemType],
        received: [s.type],
      });
      return;
    }
    seeds.push(s);
  }

  const elements = [...seeds];
  if (elements.length > count) {
    elements.length = count;
  } else if (elements.length < count) {
    if (!declaration.next) {
      pushDiagnostic(diagnostics, {
        code: TYPE_CODES.INVALID_OPERATION,
        message: `SEQUENCE '${declaration.symbol}' has fewer seeds (${seeds.length}) than count (${count}) and no NEXT expression.`,
        nodeSpan: declaration.span,
      });
      return;
    }

    for (let i = elements.length; i < count; i++) {
      let stepFailed = false;
      const recurrence = {
        getPrev(k) {
          const idx = i - k;
          if (idx < 0 || idx >= elements.length) {
            pushDiagnostic(diagnostics, {
              code: TYPE_CODES.RANGE,
              message: `(PREV ${k}) at index ${i} references uninitialized recurrence element at index ${idx}.`,
              nodeSpan: declaration.span,
            });
            stepFailed = true;
            return null;
          }
          return elements[idx];
        },
      };

      const stepScope = new Map([['$index', Object.freeze({ type: 'I32', value: i })]]);
      const nextVal = withRecurrence(symbols, recurrence, () => {
        return withScope(symbols, stepScope, () => {
          return evaluateExpression(declaration.next, symbols, diagnostics);
        });
      });

      if (stepFailed || !nextVal) return;
      if (nextVal.type !== declaration.itemType && !(declaration.itemType === 'NUMERIC' && NUMERIC_TYPES.includes(nextVal.type))) {
        pushDiagnostic(diagnostics, {
          code: TYPE_CODES.MISMATCH,
          message: `SEQUENCE NEXT evaluated to ${nextVal.type}, expected ${declaration.itemType}.`,
          nodeSpan: declaration.next.span,
          expected: [declaration.itemType],
          received: [nextVal.type],
        });
        return;
      }
      elements.push(nextVal);
    }
  }

  const seqVal = Object.freeze({
    type: 'SEQUENCE',
    itemType: declaration.itemType,
    count,
    elements: Object.freeze(elements),
  });
  symbols.set(declaration.symbol, seqVal);
  sequences.push(Object.freeze({
    symbol: declaration.symbol,
    itemType: declaration.itemType,
    count,
    seeds: Object.freeze(seeds),
    elements: seqVal.elements,
  }));
}

function analyzeRngDeclaration(declaration, symbols, diagnostics, rngs) {
  ensureAnalyzerContext(symbols);
  if (symbols.has(declaration.symbol)) {
    pushDiagnostic(diagnostics, {
      code: BIND_CODES.DUPLICATE_SYMBOL,
      message: `Symbol ${declaration.symbol} is already bound.`,
      nodeSpan: declaration.span,
      relatedSymbols: [declaration.symbol],
    });
    return;
  }

  if (declaration.algorithm !== 'PCG32') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.INVALID_OPERATION,
      message: `Unsupported RNG algorithm '${declaration.algorithm}'. Only 'PCG32' is supported in SCDL v2.`,
      nodeSpan: declaration.span,
      expected: ['PCG32'],
      received: [declaration.algorithm],
    });
    return;
  }

  const seedVal = evaluateExpression(declaration.seed, symbols, diagnostics);
  if (!seedVal || seedVal.type !== 'I32') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: 'RNG SEED must evaluate to I32.',
      nodeSpan: declaration.span,
      expected: ['I32'],
      received: [seedVal ? seedVal.type : 'UNKNOWN'],
    });
    return;
  }

  const rngInstance = new PCG32(BigInt(seedVal.value));
  const rngVal = Object.freeze({
    type: 'RNG',
    algorithm: 'PCG32',
    seed: seedVal.value,
    rng: rngInstance,
  });
  symbols.set(declaration.symbol, rngVal);
  rngs.push(Object.freeze({
    symbol: declaration.symbol,
    algorithm: 'PCG32',
    seed: seedVal.value,
  }));
}

function findCallsInNode(node, calleeSet) {
  if (!node || typeof node !== 'object') return;
  if (node.kind === 'CallExpression' && node.opcode === 'CALL') {
    const fnTarget = node.positional && node.positional[0];
    const name = fnTarget?.value || fnTarget?.raw;
    if (name) calleeSet.add(name);
  }
  for (const child of Object.values(node)) {
    if (Array.isArray(child)) {
      for (const item of child) findCallsInNode(item, calleeSet);
    } else if (child && typeof child === 'object') {
      findCallsInNode(child, calleeSet);
    }
  }
}

function analyzeFnDeclarations(astDeclarations, symbols, diagnostics, functionsList) {
  ensureAnalyzerContext(symbols);
  const ctx = symbols._callContext;
  const fnDecls = astDeclarations.filter((d) => d.kind === 'FnDeclaration');

  for (const decl of fnDecls) {
    if (ctx.functions.has(decl.id)) {
      pushDiagnostic(diagnostics, {
        code: BIND_CODES.DUPLICATE_SYMBOL,
        message: `Duplicate function declaration '${decl.id}'.`,
        nodeSpan: decl.span,
        relatedSymbols: [decl.id],
      });
      continue;
    }

    const paramNames = new Set();
    for (const p of decl.params || []) {
      if (paramNames.has(p.name)) {
        pushDiagnostic(diagnostics, {
          code: BIND_CODES.DUPLICATE_SYMBOL,
          message: `Duplicate parameter '${p.name}' in function '${decl.id}'.`,
          nodeSpan: p.span,
          relatedSymbols: [p.name],
        });
      }
      paramNames.add(p.name);
      if (!isKnownType(p.type) && p.type !== 'NUMERIC' && p.type !== 'SCALAR') {
        pushDiagnostic(diagnostics, {
          code: TYPE_CODES.UNKNOWN_TYPE,
          message: `Unknown parameter type '${p.type}' in function '${decl.id}'.`,
          nodeSpan: p.span,
          expected: [...SCDL_V2_TYPES],
          received: [p.type],
        });
      }
    }

    if (!isKnownType(decl.returnType) && decl.returnType !== 'NUMERIC' && decl.returnType !== 'SCALAR') {
      pushDiagnostic(diagnostics, {
        code: TYPE_CODES.UNKNOWN_TYPE,
        message: `Unknown return type '${decl.returnType}' in function '${decl.id}'.`,
        nodeSpan: decl.span,
        expected: [...SCDL_V2_TYPES],
        received: [decl.returnType],
      });
    }

    if (decl.recursionMax !== null && decl.recursionMax > 256) {
      pushDiagnostic(diagnostics, {
        code: TERM_CODES.RECURSION_DEPTH_EXCEEDED,
        message: `Function '${decl.id}' RECURSION_MAX ${decl.recursionMax} exceeds absolute host ceiling 256.`,
        nodeSpan: decl.span,
        expected: ['<= 256'],
        received: [String(decl.recursionMax)],
      });
    }

    const fnDef = Object.freeze({
      id: decl.id,
      params: Object.freeze(decl.params || []),
      returnType: decl.returnType,
      recursionMax: decl.recursionMax,
      body: Object.freeze(decl.body || []),
      span: decl.span,
    });
    ctx.functions.set(decl.id, fnDef);
    functionsList.push(fnDef);
  }

  const callGraph = new Map();
  for (const decl of fnDecls) {
    const callees = new Set();
    for (const stmt of decl.body || []) {
      findCallsInNode(stmt, callees);
    }
    callGraph.set(decl.id, callees);
  }

  for (const decl of fnDecls) {
    const callees = callGraph.get(decl.id) || new Set();
    if (callees.has(decl.id)) {
      if (decl.recursionMax === null) {
        pushDiagnostic(diagnostics, {
          code: TERM_CODES.UNCAPPED_RECURSION,
          message: `Function '${decl.id}' is recursive but does not declare RECURSION_MAX.`,
          nodeSpan: decl.span,
          relatedSymbols: [decl.id],
        });
      }
    }

    const visited = new Set();
    const checkCycle = (currId) => {
      const nextCallees = callGraph.get(currId);
      if (!nextCallees) return false;
      for (const nextId of nextCallees) {
        if (nextId === decl.id && currId !== decl.id) {
          return true;
        }
        if (!visited.has(nextId) && nextId !== currId) {
          visited.add(nextId);
          if (checkCycle(nextId)) return true;
        }
      }
      return false;
    };
    if (checkCycle(decl.id)) {
      pushDiagnostic(diagnostics, {
        code: TERM_CODES.INVALID_CONTROL_FLOW,
        message: `Mutual recursion involving function '${decl.id}' is forbidden in SCDL v2.`,
        nodeSpan: decl.span,
        relatedSymbols: [decl.id],
      });
    }
  }
}

function analyzeMaskDeclaration(declaration, symbols, diagnostics, masks) {
  const resolved = evaluateExpression(declaration.value, symbols, diagnostics);
  if (!resolved) return;

  if (resolved.type !== 'MASK') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: `MASK ${declaration.symbol} must evaluate to a MASK value.`,
      nodeSpan: declaration.span,
      expected: ['MASK'],
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
  masks.push(Object.freeze({ symbol: declaration.symbol, value: resolved.value }));
}

function analyzeAnchorDeclaration(declaration, symbols, diagnostics, anchors) {
  const on = evaluateExpression(declaration.on, symbols, diagnostics);
  if (!on) return;

  if (on.type !== 'SHAPE') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: `ANCHOR ${declaration.symbol} ON target must be a SHAPE.`,
      nodeSpan: declaration.span,
      expected: ['SHAPE'],
      received: [on.type],
    });
    return;
  }

  const at = evaluateExpression(declaration.at, symbols, diagnostics);
  if (!at) return;

  if (symbols.has(declaration.symbol)) {
    pushDiagnostic(diagnostics, {
      code: BIND_CODES.DUPLICATE_SYMBOL,
      message: `Symbol ${declaration.symbol} is already bound.`,
      nodeSpan: declaration.span,
      relatedSymbols: [declaration.symbol],
    });
    return;
  }

  symbols.set(declaration.symbol, at);
  anchors.push(Object.freeze({ symbol: declaration.symbol, on: on.value, at: at.value }));
}

function analyzeAssertDeclaration(declaration, symbols, diagnostics, assertions) {
  const cond = evaluateExpression(declaration.condition, symbols, diagnostics);
  if (!cond) return;

  if (cond.type !== 'BOOL') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: 'ASSERT condition must evaluate to BOOL.',
      nodeSpan: declaration.span,
      expected: ['BOOL'],
      received: [cond.type],
    });
    return;
  }

  if (cond.value !== true) {
    pushDiagnostic(diagnostics, {
      code: GEOM_CODES.ASSERTION_FAILED,
      message: 'Assertion failed: geometric condition evaluated to false.',
      nodeSpan: declaration.span,
    });
    return;
  }

  assertions.push(Object.freeze({ condition: cond.value }));
}

function evaluateOpacityValue(expression, symbols, diagnostics, label, nodeSpan) {
  const resolved = evaluateExpression(expression, symbols, diagnostics);
  if (!resolved) return null;
  if (!SCALAR_TYPES.includes(resolved.type)) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: `${label} must be an I32, FIXED, or RATIO scalar.`,
      nodeSpan,
      expected: ['I32', 'FIXED', 'RATIO'],
      received: [resolved.type],
    });
    return null;
  }
  const rational = toRational(resolved);
  const numerator = BigInt(rational.numerator);
  const denominator = BigInt(rational.denominator);
  if (numerator < 0n || numerator > denominator) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.RANGE,
      message: `${label} must be within the unit interval 0..1.`,
      nodeSpan,
      expected: ['0..1'],
      received: [rationalToString(rational)],
    });
    return null;
  }
  return Number(numerator) / Number(denominator);
}

function analyzePaintStatement(statement, symbols, diagnostics, paints) {
  const shapeValue = evaluateExpression(statement.shape, symbols, diagnostics);
  if (!shapeValue) return;

  if (shapeValue.type !== 'SHAPE') {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: 'PAINT requires a SHAPE operand.',
      nodeSpan: statement.span,
      expected: ['SHAPE'],
      received: [shapeValue.type],
    });
    return;
  }

  let atOffset = null;
  if (statement.named && statement.named.AT) {
    const atExpr = evaluateExpression(statement.named.AT, symbols, diagnostics);
    if (atExpr) {
      if (atExpr.type !== 'VEC2') {
        pushDiagnostic(diagnostics, {
          code: TYPE_CODES.MISMATCH,
          message: 'PAINT AT requires a VEC2 operand.',
          nodeSpan: statement.span,
          expected: ['VEC2'],
          received: [atExpr.type],
        });
        return;
      }
      atOffset = atExpr.value;
    }
  }

  let fill = null;
  if (statement.fill) {
    fill = evaluateExpression(statement.fill, symbols, diagnostics);
    if (fill && fill.type !== 'COLOR') {
      pushDiagnostic(diagnostics, {
        code: TYPE_CODES.MISMATCH,
        message: 'PAINT FILL requires a COLOR operand.',
        nodeSpan: statement.span,
        expected: ['COLOR'],
        received: [fill.type],
      });
      return;
    }
  }

  let raster = 'CENTER';
  if (statement.raster) {
    const rExpr = evaluateExpression(statement.raster, symbols, diagnostics);
    if (rExpr && rExpr.type === 'IDENT') raster = rExpr.value.toUpperCase();
  }
  if (!RASTER_POLICIES.includes(raster)) {
    pushDiagnostic(diagnostics, {
      code: GEOM_CODES.UNSUPPORTED_POLICY,
      message: `Unknown raster policy '${raster}'.`,
      nodeSpan: statement.span,
      expected: [...RASTER_POLICIES],
      received: [raster],
    });
    return;
  }

  let statementBlend = null;
  if (statement.blend) {
    const bExpr = evaluateExpression(statement.blend, symbols, diagnostics);
    if (bExpr && bExpr.type === 'IDENT') statementBlend = bExpr.value.toUpperCase();
  }
  if (statementBlend && !COMPOSITE_MODES.includes(statementBlend)) {
    pushDiagnostic(diagnostics, {
      code: GEOM_CODES.UNSUPPORTED_COMPOSITE,
      message: `Unknown PAINT blend mode '${statementBlend}'.`,
      nodeSpan: statement.span,
      expected: [...COMPOSITE_MODES],
      received: [statementBlend],
    });
    return;
  }

  let clipTo = null;
  if (statement.clipTo) {
    const cExpr = evaluateExpression(statement.clipTo, symbols, diagnostics);
    if (cExpr) {
      if (cExpr.type !== 'MASK') {
        pushDiagnostic(diagnostics, {
          code: TYPE_CODES.MISMATCH,
          message: 'PAINT CLIP_TO requires a MASK operand.',
          nodeSpan: statement.span,
          expected: ['MASK'],
          received: [cExpr.type],
        });
        return;
      }
      clipTo = cExpr.value;
    }
  }

  let material = null;
  if (statement.material) {
    const mExpr = evaluateExpression(statement.material, symbols, diagnostics);
    if (mExpr) material = mExpr.value;
  }

  let paintOpacity = 1.0;
  if (statement.opacity) {
    const evaluatedOpacity = evaluateOpacityValue(statement.opacity, symbols, diagnostics, 'PAINT OPACITY', statement.span);
    if (evaluatedOpacity === null) return;
    paintOpacity = evaluatedOpacity;
  }

  paints.push(Object.freeze({
    shape: shapeValue.value,
    at: atOffset,
    fill: fill ? fill.value : null,
    raster,
    blend: statementBlend,
    clipTo,
    material,
    opacity: paintOpacity,
  }));
}

function executeLayerStatements(statements, symbols, diagnostics, paints) {
  if (!Array.isArray(statements)) return;
  for (const statement of statements) {
    if (statement.kind === 'PaintStatement') {
      analyzePaintStatement(statement, symbols, diagnostics, paints);
    } else if (statement.kind === 'ForStatement') {
      const iterable = evaluateExpression(statement.in, symbols, diagnostics);
      const items = extractIterableElements(iterable);
      for (const item of items) {
        const loopScope = new Map([[statement.variable, item]]);
        withScope(symbols, loopScope, () => {
          executeLayerStatements(statement.body, symbols, diagnostics, paints);
        });
      }
    } else if (statement.kind === 'IfStatement') {
      const cond = evaluateExpression(statement.condition, symbols, diagnostics);
      if (cond && cond.type === 'BOOL') {
        if (cond.value === true) {
          withScope(symbols, new Map(), () => {
            executeLayerStatements(statement.then, symbols, diagnostics, paints);
          });
        } else if (statement.else && statement.else.length > 0) {
          withScope(symbols, new Map(), () => {
            executeLayerStatements(statement.else, symbols, diagnostics, paints);
          });
        }
      }
    } else if (statement.kind === 'LetStatement') {
      const val = evaluateExpression(statement.value, symbols, diagnostics);
      if (val) {
        const topScope = symbols._scopeStack[symbols._scopeStack.length - 1];
        topScope.set(statement.symbol, val);
      }
    }
  }
}

function analyzeLayerDeclaration(declaration, symbols, diagnostics, layers) {
  ensureAnalyzerContext(symbols);
  const order = evaluateStructuralInt(declaration.order, symbols, diagnostics, 'LAYER ORDER');
  let blend = 'OVER';
  if (declaration.blend) {
    const blendExpr = evaluateExpression(declaration.blend, symbols, diagnostics);
    if (blendExpr && blendExpr.type === 'IDENT') {
      blend = blendExpr.value.toUpperCase();
    }
  }
  if (!COMPOSITE_MODES.includes(blend)) {
    pushDiagnostic(diagnostics, {
      code: GEOM_CODES.UNSUPPORTED_COMPOSITE,
      message: `Unknown LAYER blend mode '${blend}'.`,
      nodeSpan: declaration.span,
      expected: [...COMPOSITE_MODES],
      received: [blend],
    });
    blend = 'OVER';
  }
  let opacity = 1.0;
  if (declaration.opacity) {
    const evaluatedOpacity = evaluateOpacityValue(declaration.opacity, symbols, diagnostics, 'LAYER OPACITY', declaration.span);
    if (evaluatedOpacity !== null) opacity = evaluatedOpacity;
  }
  let visible = true;
  if (declaration.visible) {
    const visExpr = evaluateExpression(declaration.visible, symbols, diagnostics);
    if (visExpr && visExpr.type === 'BOOL') {
      visible = visExpr.value;
    }
  }

  const paints = [];
  withScope(symbols, new Map(), () => {
    executeLayerStatements(declaration.body, symbols, diagnostics, paints);
  });

  if (order === null) return;
  layers.push(Object.freeze({
    id: declaration.id.value,
    order,
    blend,
    opacity,
    visible,
    paints: Object.freeze(paints),
  }));
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
  ensureAnalyzerContext(symbols);

  try {
    let assetId = null;
    let canvas = null;
    let requestedBudget = null;
    const constants = [];
    const shapes = [];
    const masks = [];
    const anchors = [];
    const assertions = [];
    const layers = [];
    const sequences = [];
    const functionsList = [];
    const rngs = [];

    // Pre-analyze functions
    analyzeFnDeclarations(ast.declarations, symbols, diagnostics, functionsList);

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
          const recursionDepth = declaration.recursionDepth
            ? evaluateStructuralInt(declaration.recursionDepth, symbols, diagnostics, 'BUDGET RECURSION_DEPTH')
            : null;
          if (instructions !== null && generatedShapes !== null && rasterCells !== null) {
            requestedBudget = Object.freeze({
              instructions,
              generatedShapes,
              rasterCells,
              ...(recursionDepth !== null ? { recursionDepth } : {}),
            });
            if (recursionDepth !== null) {
              (/** @type {any} */ (symbols))._callContext.maxDepth = recursionDepth;
            }
          }
          break;
        }
        case 'ConstDeclaration':
          analyzeConstDeclaration(declaration, symbols, diagnostics, constants);
          break;
        case 'FnDeclaration':
          // Handled in pre-analysis
          break;
        case 'SequenceDeclaration':
          analyzeSequenceDeclaration(declaration, symbols, diagnostics, sequences);
          break;
        case 'RngDeclaration':
          analyzeRngDeclaration(declaration, symbols, diagnostics, rngs);
          break;
        case 'ShapeDeclaration':
        case 'ShapeBlockDeclaration':
          analyzeShapeDeclaration(declaration, symbols, diagnostics, shapes);
          break;
        case 'MaskDeclaration':
          analyzeMaskDeclaration(declaration, symbols, diagnostics, masks);
          break;
        case 'AnchorDeclaration':
          analyzeAnchorDeclaration(declaration, symbols, diagnostics, anchors);
          break;
        case 'AssertDeclaration':
          analyzeAssertDeclaration(declaration, symbols, diagnostics, assertions);
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
      ? deepFreeze({
          assetId,
          canvas,
          requestedBudget,
          constants,
          shapes,
          masks,
          anchors,
          assertions,
          layers,
          sequences,
          functions: functionsList,
          rngs,
        })
      : null;

    return Object.freeze({ ok, ir, symbols: new Map(symbols), diagnostics: Object.freeze(diagnostics) });
  } catch (error) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.INVALID_OPERATION,
      message: `Internal analyzer failure: ${error instanceof Error ? error.message : String(error)}`,
      nodeSpan: ZERO_SPAN,
    });
    return Object.freeze({ ok: false, ir: null, symbols: new Map(symbols), diagnostics: Object.freeze(diagnostics) });
  }
}
