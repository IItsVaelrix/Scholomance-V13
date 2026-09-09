import { span, v2Diagnostic } from './scdl-v2.diagnostics.js';
import {
  SCDL_V2_TYPES, NUMERIC_TYPES, SCALAR_TYPES, TYPE_CODES, BIND_CODES, GEOM_CODES, TERM_CODES, AMP_CODES,
  I32_MIN, I32_MAX, RASTER_POLICIES, COMPOSITE_MODES, isKnownType,
  ANIMATION_CODES, DURATION_UNITS, LOOP_MODES, TRACK_PROPERTIES, TRACK_PROPERTY_TARGETS,
  EASING_CURVES, ANIMATION_FPS_DEFAULT,
} from './scdl-v2.types.js';
import { getAmpManifest, listAmpManifests } from './scdl-v2.amp-catalog.js';
import { isValidStage, AMP_STAGES } from './scdl-v2.amp-stages.js';
import { resolveAmpPlan } from './scdl-v2.amp-relevance.js';
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
  applyTransformToShape, applyTransformToVec2, transformDeterminant,
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
  if (typeof resolved === 'object' && 'numerator' in resolved && 'denominator' in resolved) {
    return resolved;
  }
  if (resolved.type === 'I32' && typeof resolved.value === 'number') {
    return makeRational(BigInt(resolved.value));
  }
  if (resolved.value !== undefined && resolved.value !== null) {
    return toRational(resolved.value);
  }
  if (typeof resolved === 'number') {
    return makeRational(BigInt(resolved));
  }
  return makeRational(0n);
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
    case 'Literal': return evaluateLiteral(node, diagnostics, symbols);
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

function evaluateLiteral(node, diagnostics, symbols) {
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
      // TAU is one full turn, so (SIN (MUL TAU $time_normalized)) sweeps exactly
      // one cycle. Spelled bare in source; typed ANGLE, never a loose float.
      if (node.raw === 'TAU') {
        return Object.freeze({ type: 'ANGLE', value: createAngle(makeRational(1), 'TURNS') });
      }
      if (symbols && typeof symbols.has === 'function' && symbols.has(node.raw)) {
        return symbols.get(node.raw);
      }
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
    case 'RATIO': return evaluateRatio(node, symbols, diagnostics);
    case 'MS': return evaluateDuration(node, symbols, diagnostics, 'MS');
    case 'SECONDS': return evaluateDuration(node, symbols, diagnostics, 'SECONDS');
    case 'FPS': return evaluateDuration(node, symbols, diagnostics, 'FPS');
    case 'TICKS': return evaluateDuration(node, symbols, diagnostics, 'TICKS');
    case 'TAU': return Object.freeze({ type: 'ANGLE', value: createAngle(makeRational(1), 'TURNS') });
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

  // ANGLE x scalar scales the sweep, so (MUL TAU $time_normalized) is legal and
  // stays an exact ANGLE. Scalar x ANGLE is the same product, order-insensitive.
  const leftIsAngle = left.type === 'ANGLE';
  const rightIsAngle = right.type === 'ANGLE';
  if ((leftIsAngle && rightIsScalar) || (rightIsAngle && leftIsScalar)) {
    const angleOperand = leftIsAngle ? left : right;
    const scalarOperand = leftIsAngle ? right : left;
    const baseTurns = angleOperand.value?.sweepTurns || angleOperand.value?.turns;
    const turns = mulRational(toRational(baseTurns), toRational(scalarOperand));
    return Object.freeze({ type: 'ANGLE', value: createAngle(turns, 'TURNS') });
  }

  pushDiagnostic(diagnostics, {
    code: TYPE_CODES.INVALID_OPERATION,
    message: 'MUL requires I32xI32, scalarxscalar, PXxscalar, or ANGLExscalar operands.',
    nodeSpan: node.span,
    expected: ['I32', 'FIXED', 'RATIO', 'PX', 'ANGLE'],
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

// Exact rational constructor: (RATIO 1 4) is one quarter. Keyframe values use
// this so an authored fraction never degrades through a decimal round-trip.
function evaluateRatio(node, symbols, diagnostics) {
  const [numeratorNode, denominatorNode] = node.positional;
  const numerator = evaluateExpression(numeratorNode, symbols, diagnostics);
  const denominator = evaluateExpression(denominatorNode, symbols, diagnostics);
  if (!numerator || !denominator) return null;
  for (const [operand, label] of [[numerator, 'numerator'], [denominator, 'denominator']]) {
    if (operand.type !== 'I32') {
      pushDiagnostic(diagnostics, {
        code: TYPE_CODES.MISMATCH,
        message: `RATIO requires an I32 ${label}.`,
        nodeSpan: node.span,
        expected: ['I32'],
        received: [operand.type],
      });
      return null;
    }
  }
  if (denominator.value === 0) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.DIVISION_BY_ZERO,
      message: 'RATIO denominator must be nonzero.',
      nodeSpan: node.span,
      received: ['0'],
    });
    return null;
  }
  return Object.freeze({
    type: 'RATIO',
    value: makeRational(BigInt(numerator.value), BigInt(denominator.value)),
  });
}

// Duration constructors. Everything normalizes to integer timeline ticks at the
// canonical sample rate, so a timeline's frame count is an exact integer and
// never a floating-point rounding decision.
function evaluateDuration(node, symbols, diagnostics, unit) {
  const [valueNode] = node.positional;
  const value = evaluateExpression(valueNode, symbols, diagnostics);
  if (!value) return null;
  const expectI32 = unit === 'TICKS';
  const allowed = expectI32 ? ['I32'] : SCALAR_TYPES;
  if (!allowed.includes(value.type)) {
    pushDiagnostic(diagnostics, {
      code: TYPE_CODES.MISMATCH,
      message: `${unit} requires ${expectI32 ? 'an I32' : 'a scalar'} operand.`,
      nodeSpan: node.span,
      expected: [...allowed],
      received: [value.type],
    });
    return null;
  }
  const rational = toRational(value);
  return Object.freeze({ type: 'DURATION', value: Object.freeze({ unit, rational }) });
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
  if (BigInt(factorRat.numerator) === 0n) {
    pushDiagnostic(diagnostics, {
      code: GEOM_CODES.SINGULAR_TRANSFORM,
      message: 'SCALE factor must not be zero (singular transform).',
      nodeSpan: node.span,
    });
    return null;
  }
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
  if (t.value) {
    const det = transformDeterminant(t.value);
    if (BigInt(det.numerator) === 0n) {
      pushDiagnostic(diagnostics, {
        code: GEOM_CODES.SINGULAR_TRANSFORM,
        message: 'Cannot apply singular transform (determinant is zero).',
        nodeSpan: node.span,
      });
      return null;
    }
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
  const shape = evaluateExpression(node.named.SHAPE || (node.positional.length > 0 ? node.positional[0] : null), symbols, diagnostics);
  const width = evaluateExpression(node.named.WIDTH || (node.positional.length > 1 ? node.positional[1] : null), symbols, diagnostics);
  if (!shape || shape.type !== 'SHAPE' || !width || (width.type !== 'PX' && width.type !== 'I32' && width.type !== 'FIXED')) {
    pushDiagnostic(diagnostics, { code: TYPE_CODES.MISMATCH, message: 'OUTLINE requires SHAPE and PX/numeric WIDTH.', nodeSpan: node.span });
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
  const canvas = symbols.get('$__canvas__') || null;
  return Object.freeze({ type: 'MASK', value: toMask(shape.value, { rasterPolicy: raster, canvas }) });
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
  const canvas = symbols.get('$__canvas__') || m.value?.domain || null;
  const bounds = canvas ? { width: canvas.width, height: canvas.height, originX: 0, originY: 0 } : null;
  return Object.freeze({ type: 'MASK', value: maskInvert(m.value, bounds) });
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
  return Object.freeze({ type: 'RECT', value: Object.freeze({ kind: 'RECT', ...bounds }) });
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
  const maxCollection = (symbols && typeof symbols.get === 'function' && symbols.get('$__max_collection_elements__')) || MAX_COLLECTION_ELEMENTS;
  if (elementCount > maxCollection) {
    pushDiagnostic(diagnostics, {
      code: TERM_CODES.UNBOUNDED_COLLECTION,
      message: `RANGE produces ${elementCount} elements, exceeding the protected collection limit ${maxCollection}.`,
      nodeSpan: node.span,
      expected: [`0..${maxCollection}`],
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
    if (stmt.kind === 'CommentStatement') continue;
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
      const rawCenter = centerVal?.value || { x: makeRational(0), y: makeRational(0) };
      const center = {
        x: toRational(rawCenter.x),
        y: toRational(rawCenter.y),
      };

      const radiusVal = stmt.radius
        ? evaluateExpression(stmt.radius, symbols, diagnostics)
        : null;
      let radiusNum = 0;
      const hasRadius = stmt.radius !== null && stmt.radius !== undefined;
      if (hasRadius && radiusVal) {
        if (radiusVal.type === 'PX' || radiusVal.type === 'I32' || radiusVal.type === 'FIXED' || radiusVal.type === 'RATIO') {
          radiusNum = typeof radiusVal.value === 'number'
            ? radiusVal.value
            : Number(radiusVal.value?.numerator || 0) / Number(radiusVal.value?.denominator || 1);
        } else {
          pushDiagnostic(diagnostics, {
            code: TYPE_CODES.MISMATCH,
            message: `RADIAL RADIUS must be a numeric/PX type, got ${radiusVal.type}.`,
            nodeSpan: stmt.span,
          });
        }
      }

      for (let k = 0; k < count; k++) {
        const subEmitted = [];
        const radialScope = new Map([
          ['$index', Object.freeze({ type: 'I32', value: k })],
        ]);
        withScope(symbols, radialScope, () => {
          executeShapeStatements(stmt.body, symbols, diagnostics, subEmitted);
        });

        if (hasRadius) {
          const turns = Number(k) / Number(count);
          const rad = turns * 2 * Math.PI;
          const ox = Math.round(radiusNum * Math.cos(rad));
          const oy = Math.round(radiusNum * Math.sin(rad));
          const trans = createTranslation({
            x: addRational(center.x, makeRational(ox)),
            y: addRational(center.y, makeRational(oy)),
          });
          for (const s of subEmitted) {
            emittedShapes.push(applyTransformToShape(trans, s));
          }
        } else {
          const angle = createAngle(makeRational(BigInt(k), BigInt(count)), 'TURNS');
          const rot = createRotation(angle, center);
          for (const s of subEmitted) {
            emittedShapes.push(applyTransformToShape(rot, s));
          }
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

function analyzeApplyAmpDeclaration(declaration, symbols, diagnostics, explicitAmps, shapes) {
  ensureAnalyzerContext(symbols);
  const manifest = getAmpManifest(declaration.ampId);
  if (!manifest) {
    pushDiagnostic(diagnostics, {
      code: AMP_CODES.UNKNOWN_AMP,
      message: `Unknown AMP '${declaration.ampId}'.`,
      nodeSpan: declaration.span,
      expected: listAmpManifests().map((m) => m.ampId),
      received: [declaration.ampId],
      relatedSymbols: declaration.targetSymbol ? [declaration.targetSymbol] : [],
    });
    return;
  }

  // Version compatibility check (major versions must match)
  if (declaration.version) {
    const declMajor = declaration.version.split('.')[0];
    const manMajor = manifest.version.split('.')[0];
    if (declMajor !== manMajor) {
      pushDiagnostic(diagnostics, {
        code: AMP_CODES.VERSION_MISMATCH,
        message: `AMP '${declaration.ampId}' version '${declaration.version}' is incompatible with manifest version '${manifest.version}'.`,
        nodeSpan: declaration.span,
        expected: [`^${manMajor}.0.0`],
        received: [declaration.version],
        relatedSymbols: [declaration.ampId],
      });
      return;
    }
  }

  // Stage check
  if (declaration.stage && declaration.stage !== manifest.stage) {
    pushDiagnostic(diagnostics, {
      code: AMP_CODES.STAGE_MISMATCH,
      message: `Declared STAGE '${declaration.stage}' for AMP '${declaration.ampId}' does not match manifest stage '${manifest.stage}'.`,
      nodeSpan: declaration.span,
      expected: [manifest.stage],
      received: [declaration.stage],
      relatedSymbols: [declaration.ampId],
    });
    return;
  }

  // Check for unknown inputs
  const declaredInputNames = Object.keys(declaration.inputs || {});
  const validInputNames = new Set((manifest.inputs || []).map((i) => i.name));
  for (const inputName of declaredInputNames) {
    if (!validInputNames.has(inputName)) {
      const inputExpr = declaration.inputs[inputName];
      pushDiagnostic(diagnostics, {
        code: AMP_CODES.INVALID_INPUT,
        message: `AMP '${declaration.ampId}' received unknown input '${inputName}'. Valid inputs: [${Array.from(validInputNames).join(', ')}].`,
        nodeSpan: inputExpr?.span || declaration.span,
        expected: Array.from(validInputNames),
        received: [inputName],
        relatedSymbols: [declaration.ampId],
      });
    }
  }

  // Check required inputs
  const resolvedInputs = {};
  for (const inputSpec of manifest.inputs || []) {
    const inputExpr = declaration.inputs ? declaration.inputs[inputSpec.name] : undefined;
    if (!inputExpr) {
      if (inputSpec.required !== false) {
        pushDiagnostic(diagnostics, {
          code: AMP_CODES.MISSING_INPUT,
          message: `AMP '${declaration.ampId}' is missing required input '${inputSpec.name}'.`,
          nodeSpan: declaration.span,
          expected: [`${inputSpec.name} ${inputSpec.type}`],
          received: ['<missing>'],
          relatedSymbols: [declaration.ampId],
        });
      }
      continue;
    }

    const resolved = evaluateExpression(inputExpr, symbols, diagnostics);
    if (resolved) {
      const isLayerMatch = inputSpec.type === 'LAYER' && (resolved.type === 'LAYER' || resolved.type === 'IDENT');
      const finalResolved = isLayerMatch && resolved.type === 'IDENT'
        ? Object.freeze({ type: 'LAYER', value: resolved.value })
        : resolved;
      if (inputSpec.type !== 'ANY' && finalResolved.type !== inputSpec.type) {
        pushDiagnostic(diagnostics, {
          code: AMP_CODES.TYPE_MISMATCH,
          message: `AMP '${declaration.ampId}' input '${inputSpec.name}' expected type ${inputSpec.type}, received ${resolved.type}.`,
          nodeSpan: inputExpr.span,
          expected: [inputSpec.type],
          received: [resolved.type],
          relatedSymbols: [declaration.ampId],
        });
      } else {
        resolvedInputs[inputSpec.name] = finalResolved;
      }
    }
  }

  // Check for unknown parameters
  const declaredParamNames = Object.keys(declaration.params || {});
  const validParamNames = new Set((manifest.parameters || []).map((p) => p.name));
  for (const paramName of declaredParamNames) {
    if (!validParamNames.has(paramName)) {
      pushDiagnostic(diagnostics, {
        code: AMP_CODES.INVALID_PARAM,
        message: `AMP '${declaration.ampId}' received unknown parameter '${paramName}'.`,
        nodeSpan: declaration.params[paramName]?.span || declaration.span,
        expected: Array.from(validParamNames),
        received: [paramName],
        relatedSymbols: [declaration.ampId, paramName],
      });
    }
  }

  // Check parameters
  const resolvedParams = {};
  for (const paramSpec of manifest.parameters || []) {
    const paramExpr = declaration.params ? declaration.params[paramSpec.name] : undefined;
    if (!paramExpr) {
      if (paramSpec.required) {
        pushDiagnostic(diagnostics, {
          code: AMP_CODES.INVALID_PARAM,
          message: `AMP '${declaration.ampId}' is missing required parameter '${paramSpec.name}'.`,
          nodeSpan: declaration.span,
          expected: [`${paramSpec.name} ${paramSpec.type}`],
          received: ['<missing>'],
          relatedSymbols: [declaration.ampId],
        });
      } else if (paramSpec.default !== null && paramSpec.default !== undefined) {
        resolvedParams[paramSpec.name] = paramSpec.default;
      }
      continue;
    }

    const resolved = evaluateExpression(paramExpr, symbols, diagnostics);
    if (resolved) {
      if (paramSpec.type && paramSpec.type !== 'ANY') {
        const isTypeMatch = (
          resolved.type === paramSpec.type
          || (paramSpec.type === 'I32' && (resolved.type === 'I32' || resolved.type === 'U32'))
          || (paramSpec.type === 'FIXED' && (resolved.type === 'FIXED' || resolved.type === 'RATIO' || resolved.type === 'I32'))
          || (paramSpec.type === 'RATIO' && (resolved.type === 'RATIO' || resolved.type === 'FIXED'))
          || (paramSpec.type === 'MATERIAL' && (resolved.type === 'IDENT' || resolved.type === 'STRING' || resolved.type === 'MATERIAL'))
          || (paramSpec.type === 'ANGLE' && (resolved.type === 'ANGLE' || resolved.type === 'I32' || resolved.type === 'FIXED'))
        );
        if (!isTypeMatch) {
          pushDiagnostic(diagnostics, {
            code: AMP_CODES.TYPE_MISMATCH,
            message: `AMP '${declaration.ampId}' parameter '${paramSpec.name}' expected type ${paramSpec.type}, received ${resolved.type}.`,
            nodeSpan: paramExpr.span,
            expected: [paramSpec.type],
            received: [resolved.type],
            relatedSymbols: [declaration.ampId, paramSpec.name],
          });
        }
      }

      let val = resolved.value;
      if (resolved.type === 'I32' || resolved.type === 'U32') {
        val = Number(resolved.value);
      } else if (resolved.type === 'RATIO' || resolved.type === 'FIXED') {
        val = Number(resolved.value.numerator) / Number(resolved.value.denominator);
      }

      if (typeof val === 'number') {
        if (paramSpec.min !== null && paramSpec.min !== undefined && val < paramSpec.min) {
          pushDiagnostic(diagnostics, {
            code: AMP_CODES.INVALID_PARAM,
            message: `Parameter '${paramSpec.name}' value ${val} is below minimum ${paramSpec.min}.`,
            nodeSpan: paramExpr.span,
            expected: [`>= ${paramSpec.min}`],
            received: [String(val)],
            relatedSymbols: [declaration.ampId],
          });
        }
        if (paramSpec.max !== null && paramSpec.max !== undefined && val > paramSpec.max) {
          pushDiagnostic(diagnostics, {
            code: AMP_CODES.INVALID_PARAM,
            message: `Parameter '${paramSpec.name}' value ${val} exceeds maximum ${paramSpec.max}.`,
            nodeSpan: paramExpr.span,
            expected: [`<= ${paramSpec.max}`],
            received: [String(val)],
            relatedSymbols: [declaration.ampId],
          });
        }
      }

      if (Array.isArray(paramSpec.enum) && !paramSpec.enum.includes(String(val))) {
        pushDiagnostic(diagnostics, {
          code: AMP_CODES.INVALID_PARAM,
          message: `Parameter '${paramSpec.name}' value '${val}' is not in enum [${paramSpec.enum.join(', ')}].`,
          nodeSpan: paramExpr.span,
          expected: paramSpec.enum,
          received: [String(val)],
          relatedSymbols: [declaration.ampId],
        });
      }

      resolvedParams[paramSpec.name] = val;
    }
  }

  // Target symbol binding
  if (declaration.targetSymbol) {
    if (symbols.has(declaration.targetSymbol)) {
      pushDiagnostic(diagnostics, {
        code: BIND_CODES.DUPLICATE_SYMBOL,
        message: `Symbol ${declaration.targetSymbol} is already bound.`,
        nodeSpan: declaration.span,
        relatedSymbols: [declaration.targetSymbol],
      });
      return;
    }

    const outputType = manifest.output?.type || 'SHAPE';
    if (declaration.targetType && declaration.targetType !== outputType && outputType !== 'ANY') {
      pushDiagnostic(diagnostics, {
        code: AMP_CODES.TYPE_MISMATCH,
        message: `Declared target type '${declaration.targetType}' does not match AMP '${declaration.ampId}' output type '${outputType}'.`,
        nodeSpan: declaration.span,
        expected: [outputType],
        received: [declaration.targetType],
        relatedSymbols: [declaration.targetSymbol],
      });
      return;
    }

    const rawInputs = {};
    for (const [k, v] of Object.entries(resolvedInputs)) {
      rawInputs[k] = v && typeof v === 'object' && 'value' in v ? v.value : v;
    }

    const boundValue = Object.freeze({
      type: outputType,
      value: Object.freeze({
        kind: 'AMP_RESULT',
        ampId: declaration.ampId,
        outputType,
        stage: declaration.stage || manifest.stage,
        inputs: Object.freeze(rawInputs),
        params: Object.freeze({ ...resolvedParams }),
        symbol: declaration.targetSymbol,
      }),
    });

    symbols.set(declaration.targetSymbol, boundValue);
    if (outputType === 'SHAPE') {
      shapes.push(Object.freeze({ symbol: declaration.targetSymbol, value: boundValue.value }));
    }
  }

  explicitAmps.push(Object.freeze({
    ampId: declaration.ampId,
    version: declaration.version || manifest.version,
    stage: declaration.stage || manifest.stage,
    order: manifest.order,
    manifest,
    inputs: resolvedInputs,
    params: resolvedParams,
    targetSymbol: declaration.targetSymbol || null,
    targetType: declaration.targetType || manifest.output?.type || null,
    span: declaration.span,
  }));
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
  const maxCollection = (symbols && typeof symbols.get === 'function' && symbols.get('$__max_collection_elements__')) || MAX_COLLECTION_ELEMENTS;
  if (count > maxCollection) {
    pushDiagnostic(diagnostics, {
      code: TERM_CODES.UNBOUNDED_COLLECTION,
      message: `SEQUENCE COUNT ${count} exceeds the protected collection limit ${maxCollection}.`,
      nodeSpan: declaration.span,
      expected: [`0..${maxCollection}`],
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
    if (statement.kind === 'CommentStatement') continue;
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
  const layerObj = Object.freeze({
    id: declaration.id.value,
    order,
    blend,
    opacity,
    visible,
    paints: Object.freeze(paints),
  });
  layers.push(layerObj);
  if (symbols && typeof symbols.set === 'function') {
    symbols.set(declaration.id.value, Object.freeze({ type: 'LAYER', value: declaration.id.value }));
  }
}

// ---------------------------------------------------------------------------
// Step 4 — mathematical animation analysis
//
// A TIMELINE is time-dependent mathematics, so unlike every other v2 construct
// it is NOT constant-folded here. The analyzer resolves structure, types, and
// target/property legality, converts every duration to exact integer ticks, and
// preserves each FORMULA as an AST node plus a snapshot of the user symbol scope.
// scdl-v2.animation.js then evaluates those formulas once per frame with the
// time symbols bound, producing a finite sample table.
// ---------------------------------------------------------------------------

// Snapshot of user-declared symbols, excluding analyzer internals. Frozen plain
// object so it survives deepFreeze of the IR and can be replayed per frame.
function snapshotUserSymbols(symbols) {
  const out = {};
  if (!symbols || typeof symbols.forEach !== 'function') return Object.freeze(out);
  for (const [key, value] of symbols.entries()) {
    if (typeof key !== 'string') continue;
    if (key.startsWith('_') || key.startsWith('$__')) continue;
    out[key] = value;
  }
  return Object.freeze(out);
}

function animationDiagnostic(diagnostics, code, message, nodeSpan, extra = {}) {
  pushDiagnostic(diagnostics, { code, message, nodeSpan, ...extra });
}

// SAMPLE_RATE (FPS 12) -> integer frames per second.
function resolveSampleRateFps(expr, symbols, diagnostics, nodeSpan) {
  if (!expr) return ANIMATION_FPS_DEFAULT;
  const resolved = evaluateExpression(expr, symbols, diagnostics);
  if (!resolved) return ANIMATION_FPS_DEFAULT;
  if (resolved.type !== 'DURATION' || resolved.value.unit !== 'FPS') {
    animationDiagnostic(diagnostics, ANIMATION_CODES.UNKNOWN_DURATION_UNIT,
      'SAMPLE_RATE requires an FPS duration, e.g. SAMPLE_RATE (FPS 12).', nodeSpan,
      { expected: ['FPS'], received: [resolved.type === 'DURATION' ? resolved.value.unit : resolved.type] });
    return ANIMATION_FPS_DEFAULT;
  }
  const fps = Number(roundRationalToBigInt(resolved.value.rational));
  if (!Number.isFinite(fps) || fps <= 0) {
    animationDiagnostic(diagnostics, ANIMATION_CODES.NON_FINITE_DURATION,
      'SAMPLE_RATE must be a positive integer frames-per-second.', nodeSpan,
      { received: [String(fps)] });
    return ANIMATION_FPS_DEFAULT;
  }
  return fps;
}

// Any duration expression -> exact integer timeline ticks at the given rate.
function resolveDurationTicks(expr, fps, symbols, diagnostics, nodeSpan, label) {
  const resolved = evaluateExpression(expr, symbols, diagnostics);
  if (!resolved) return null;
  if (resolved.type !== 'DURATION') {
    animationDiagnostic(diagnostics, TYPE_CODES.MISMATCH,
      `${label} requires a DURATION built from MS, SECONDS, or TICKS.`, nodeSpan,
      { expected: ['DURATION'], received: [resolved.type] });
    return null;
  }
  const { unit, rational } = resolved.value;
  if (unit === 'FPS') {
    animationDiagnostic(diagnostics, ANIMATION_CODES.UNKNOWN_DURATION_UNIT,
      `${label} cannot use FPS; FPS is a sample rate, not a span of time.`, nodeSpan,
      { expected: ['MS', 'SECONDS', 'TICKS'], received: ['FPS'] });
    return null;
  }
  if (unit === 'TICKS') return Number(roundRationalToBigInt(rational));
  const perSecond = unit === 'MS'
    ? mulRational(rational, makeRational(1, 1000))
    : rational;
  return Number(roundRationalToBigInt(mulRational(perSecond, makeRational(BigInt(fps)))));
}

function resolveTargetKind(name, symbols) {
  const entry = symbols && typeof symbols.get === 'function' ? symbols.get(name) : null;
  if (entry && entry.type === 'LAYER') return 'LAYER';
  if (entry && entry.type === 'SHAPE') return 'SHAPE';
  if (entry && entry.type === 'MASK') return 'MASK';
  return null;
}

// One KEYFRAME / VISIBILITY row: exact tick, typed value, validated easing.
function analyzeKeyframeStatement(statement, symbols, diagnostics, keyframes, durationTicks) {
  const tick = resolveDurationTicks(statement.at, keyframes.fps, symbols, diagnostics, statement.span, 'KEYFRAME AT');
  if (tick === null) return;
  if (tick < 0 || tick > durationTicks) {
    animationDiagnostic(diagnostics, ANIMATION_CODES.KEYFRAME_OUT_OF_RANGE,
      `KEYFRAME AT tick ${tick} falls outside the timeline span 0..${durationTicks}.`,
      statement.span, { expected: [`0..${durationTicks}`], received: [String(tick)] });
    return;
  }
  const resolvedValue = evaluateExpression(statement.value, symbols, diagnostics);
  if (!resolvedValue) return;

  let easing = 'LINEAR';
  if (statement.ease) {
    const easeExpr = evaluateExpression(statement.ease, symbols, diagnostics);
    easing = easeExpr && easeExpr.type === 'IDENT' ? String(easeExpr.value).toUpperCase() : 'LINEAR';
    if (!EASING_CURVES.includes(easing)) {
      animationDiagnostic(diagnostics, ANIMATION_CODES.UNKNOWN_EASING,
        `Unknown easing curve '${easing}'.`, statement.span,
        { expected: [...EASING_CURVES], received: [easing] });
      return;
    }
  }

  const previous = keyframes.rows[keyframes.rows.length - 1];
  if (previous && tick < previous.tick) {
    animationDiagnostic(diagnostics, ANIMATION_CODES.UNORDERED_KEYFRAMES,
      `KEYFRAME AT tick ${tick} precedes the previous keyframe at tick ${previous.tick}; keyframes must be non-decreasing.`,
      statement.span, { received: [String(tick), String(previous.tick)] });
    return;
  }

  keyframes.rows.push(Object.freeze({ tick, value: resolvedValue, easing }));
}

// A FORMULA is preserved, never folded: it is re-evaluated at every frame with
// the time symbols bound. It must actually depend on time, otherwise the author
// meant a constant and should use a KEYFRAME.
function analyzeFormulaStatement(statement, symbols, diagnostics, track, scopeSnapshot) {
  if (track.formula) {
    animationDiagnostic(diagnostics, ANIMATION_CODES.DUPLICATE_TRACK,
      'A TRACK may carry at most one FORMULA.', statement.span);
    return;
  }
  if (track.keyframes.length > 0) {
    animationDiagnostic(diagnostics, ANIMATION_CODES.DUPLICATE_TRACK,
      'A TRACK may not mix KEYFRAME rows with a FORMULA; choose one driver.', statement.span);
    return;
  }
  const source = JSON.stringify(statement.value);
  const timeDependent = ['$time', '$time_normalized', '$frame', '$t']
    .some((symbol) => source.includes(`"${symbol}"`));
  if (!timeDependent) {
    animationDiagnostic(diagnostics, ANIMATION_CODES.FORMULA_NOT_TIME_DEPENDENT,
      'FORMULA does not reference $time, $time_normalized, $frame, or $t, so it cannot vary over the timeline. Use KEYFRAME for a constant value.',
      statement.span, { expected: ['$time', '$time_normalized', '$frame', '$t'] });
    return;
  }
  // Probe-evaluate with time bound to zero so type errors surface at compile
  // time rather than mid-sampling. The result is discarded.
  const probe = new Map(Object.entries(scopeSnapshot));
  probe.set('$time', Object.freeze({ type: 'RATIO', value: makeRational(0) }));
  probe.set('$t', Object.freeze({ type: 'RATIO', value: makeRational(0) }));
  probe.set('$time_normalized', Object.freeze({ type: 'RATIO', value: makeRational(0) }));
  probe.set('$frame', Object.freeze({ type: 'I32', value: 0 }));
  ensureAnalyzerContext(probe);
  const probeDiagnostics = [];
  const probeValue = evaluateExpression(statement.value, probe, probeDiagnostics);
  for (const diagnostic of probeDiagnostics) diagnostics.push(diagnostic);
  if (!probeValue) return;

  track.formula = Object.freeze({ node: statement.value, valueType: probeValue.type });
}

function analyzeTrackStatement(statement, symbols, diagnostics, tracks, context) {
  const targetName = statement.target?.value;
  const property = String(statement.property?.value || '').toUpperCase();

  if (!TRACK_PROPERTIES.includes(property)) {
    animationDiagnostic(diagnostics, ANIMATION_CODES.UNKNOWN_PROPERTY,
      `Unknown TRACK PROPERTY '${property}'.`, statement.span,
      { expected: [...TRACK_PROPERTIES], received: [property] });
    return;
  }

  const targetKind = resolveTargetKind(targetName, symbols);
  if (!targetKind) {
    animationDiagnostic(diagnostics, ANIMATION_CODES.UNKNOWN_TARGET,
      `TRACK TARGET '${targetName}' does not resolve to a declared LAYER or SHAPE.`, statement.span,
      { relatedSymbols: [String(targetName)] });
    return;
  }
  if (!TRACK_PROPERTY_TARGETS[property].includes(targetKind)) {
    animationDiagnostic(diagnostics, ANIMATION_CODES.PROPERTY_TARGET_MISMATCH,
      `PROPERTY ${property} cannot drive a ${targetKind} target.`, statement.span,
      { expected: TRACK_PROPERTY_TARGETS[property], received: [targetKind] });
    return;
  }

  const duplicate = tracks.find((track) => track.target === targetName && track.property === property);
  if (duplicate) {
    animationDiagnostic(diagnostics, ANIMATION_CODES.DUPLICATE_TRACK,
      `Duplicate TRACK for ${targetName} ${property}; one property may only have one driver.`,
      statement.span, { relatedSymbols: [targetName, property] });
    return;
  }

  const track = { target: targetName, targetKind, property, keyframes: [], formula: null, pose: context.pose || null };
  const keyframeSink = { rows: track.keyframes, fps: context.fps };

  for (const child of statement.body || []) {
    if (child.kind === 'CommentStatement') continue;
    if (child.kind === 'KeyframeStatement') {
      analyzeKeyframeStatement(child, symbols, diagnostics, keyframeSink, context.durationTicks);
    } else if (child.kind === 'VisibilityStatement') {
      if (property !== 'VISIBLE') {
        animationDiagnostic(diagnostics, ANIMATION_CODES.PROPERTY_TARGET_MISMATCH,
          'VISIBILITY is only legal in a TRACK with PROPERTY VISIBLE.', child.span,
          { expected: ['VISIBLE'], received: [property] });
        continue;
      }
      const tick = resolveDurationTicks(child.at, context.fps, symbols, diagnostics, child.span, 'VISIBILITY AT');
      if (tick === null) continue;
      const resolvedValue = evaluateExpression(child.value, symbols, diagnostics);
      if (!resolvedValue || resolvedValue.type !== 'BOOL') {
        animationDiagnostic(diagnostics, TYPE_CODES.MISMATCH,
          'VISIBILITY VALUE requires a BOOL operand.', child.span,
          { expected: ['BOOL'], received: [resolvedValue ? resolvedValue.type : 'null'] });
        continue;
      }
      track.keyframes.push(Object.freeze({ tick, value: resolvedValue, easing: 'STEP' }));
    } else if (child.kind === 'FormulaStatement') {
      analyzeFormulaStatement(child, symbols, diagnostics, track, context.scopeSnapshot);
    } else {
      animationDiagnostic(diagnostics, TYPE_CODES.INVALID_OPERATION,
        `Statement ${child.kind} is not legal inside a TRACK body.`, child.span,
        { expected: ['KEYFRAME', 'FORMULA', 'VISIBILITY'] });
    }
  }

  if (track.keyframes.length === 0 && !track.formula) {
    animationDiagnostic(diagnostics, ANIMATION_CODES.EMPTY_TRACK,
      `TRACK ${targetName} ${property} has no KEYFRAME, VISIBILITY, or FORMULA driver.`,
      statement.span, { relatedSymbols: [targetName, property] });
    return;
  }

  tracks.push(Object.freeze({
    target: track.target,
    targetKind: track.targetKind,
    property: track.property,
    pose: track.pose,
    formula: track.formula,
    keyframes: Object.freeze([...track.keyframes]),
  }));
}

function analyzeTimelineDeclaration(declaration, symbols, diagnostics, timelines) {
  const id = declaration.id?.value;
  if (timelines.some((timeline) => timeline.id === id)) {
    animationDiagnostic(diagnostics, ANIMATION_CODES.DUPLICATE_TRACK,
      `Duplicate TIMELINE id '${id}'.`, declaration.span, { relatedSymbols: [String(id)] });
    return;
  }

  const fps = resolveSampleRateFps(declaration.sampleRate, symbols, diagnostics, declaration.span);
  const durationTicks = resolveDurationTicks(declaration.duration, fps, symbols, diagnostics, declaration.span, 'TIMELINE DURATION');
  if (durationTicks === null) return;
  if (durationTicks <= 0) {
    animationDiagnostic(diagnostics, ANIMATION_CODES.NON_FINITE_DURATION,
      `TIMELINE DURATION must span at least one tick at ${fps} fps; resolved to ${durationTicks}.`,
      declaration.span, { received: [String(durationTicks)] });
    return;
  }

  let loop = 'REPEAT';
  if (declaration.loop) {
    const loopExpr = evaluateExpression(declaration.loop, symbols, diagnostics);
    loop = loopExpr && loopExpr.type === 'IDENT' ? String(loopExpr.value).toUpperCase() : 'REPEAT';
    if (!LOOP_MODES.includes(loop)) {
      animationDiagnostic(diagnostics, ANIMATION_CODES.UNKNOWN_LOOP_MODE,
        `Unknown LOOP mode '${loop}'.`, declaration.span,
        { expected: [...LOOP_MODES], received: [loop] });
      return;
    }
  }

  const scopeSnapshot = snapshotUserSymbols(symbols);
  const context = { fps, durationTicks, scopeSnapshot, pose: null };
  const tracks = [];
  const events = [];
  const variants = [];
  const poses = [];

  for (const child of declaration.body || []) {
    if (child.kind === 'CommentStatement') continue;
    if (child.kind === 'TrackStatement') {
      analyzeTrackStatement(child, symbols, diagnostics, tracks, context);
    } else if (child.kind === 'PoseStatement') {
      const poseId = child.id?.value;
      if (poses.includes(poseId)) {
        animationDiagnostic(diagnostics, ANIMATION_CODES.DUPLICATE_TRACK,
          `Duplicate POSE id '${poseId}' in TIMELINE ${id}.`, child.span, { relatedSymbols: [String(poseId)] });
        continue;
      }
      poses.push(poseId);
      const poseContext = { ...context, pose: poseId };
      for (const poseChild of child.body || []) {
        if (poseChild.kind === 'CommentStatement') continue;
        if (poseChild.kind === 'TrackStatement') {
          analyzeTrackStatement(poseChild, symbols, diagnostics, tracks, poseContext);
        } else {
          animationDiagnostic(diagnostics, TYPE_CODES.INVALID_OPERATION,
            `Statement ${poseChild.kind} is not legal inside a POSE body.`, poseChild.span,
            { expected: ['TRACK'] });
        }
      }
    } else if (child.kind === 'EventStatement') {
      const tick = resolveDurationTicks(child.at, fps, symbols, diagnostics, child.span, 'EVENT AT');
      if (tick === null) continue;
      events.push(Object.freeze({ tick, name: String(child.name?.value || '') }));
    } else if (child.kind === 'VariantStatement') {
      const from = resolveDurationTicks(child.from, fps, symbols, diagnostics, child.span, 'VARIANT FROM');
      const to = resolveDurationTicks(child.to, fps, symbols, diagnostics, child.span, 'VARIANT TO');
      if (from === null || to === null) continue;
      if (to <= from) {
        animationDiagnostic(diagnostics, ANIMATION_CODES.KEYFRAME_OUT_OF_RANGE,
          `VARIANT '${child.name?.value}' TO tick ${to} must be greater than FROM tick ${from}.`,
          child.span, { received: [String(from), String(to)] });
        continue;
      }
      variants.push(Object.freeze({ name: String(child.name?.value || ''), fromTick: from, toTick: to }));
    } else {
      animationDiagnostic(diagnostics, TYPE_CODES.INVALID_OPERATION,
        `Statement ${child.kind} is not legal inside a TIMELINE body.`, child.span,
        { expected: ['TRACK', 'POSE', 'EVENT', 'VARIANT'] });
    }
  }

  if (tracks.length === 0) {
    animationDiagnostic(diagnostics, ANIMATION_CODES.EMPTY_TRACK,
      `TIMELINE ${id} declares no TRACK; there is nothing to sample.`, declaration.span,
      { relatedSymbols: [String(id)] });
    return;
  }

  // A seamless loop must not duplicate its endpoint frame; a one-shot must keep
  // the final pose. This is the only place frame count is decided.
  const frameCount = (loop === 'ONCE' || loop === 'HOLD') ? durationTicks + 1 : durationTicks;

  if (frameCount > 240) {
    animationDiagnostic(diagnostics, ANIMATION_CODES.FRAME_BUDGET_EXCEEDED,
      `TIMELINE ${id} requires ${frameCount} frames, exceeding maximum frame ceiling of 240.`,
      declaration.span, { received: [String(frameCount)], expected: ['<= 240'] });
    return;
  }

  timelines.push(Object.freeze({
    id,
    fps,
    durationTicks,
    frameCount,
    loop,
    tracks: Object.freeze(tracks),
    events: Object.freeze(events),
    variants: Object.freeze(variants),
    poses: Object.freeze([...poses]),
    scopeSnapshot,
  }));

  symbols.set(id, Object.freeze({ type: 'TIMELINE', value: id }));
}

function analyzeClipDeclaration(declaration, symbols, diagnostics, clips, timelines) {
  const id = declaration.id?.value;
  const timelineName = declaration.timeline?.value;
  const timeline = timelines.find((entry) => entry.id === timelineName);
  if (!timeline) {
    animationDiagnostic(diagnostics, ANIMATION_CODES.UNKNOWN_TIMELINE,
      `CLIP '${id}' references undeclared TIMELINE '${timelineName}'.`, declaration.span,
      { relatedSymbols: [String(timelineName)] });
    return;
  }
  if (clips.some((clip) => clip.id === id)) {
    animationDiagnostic(diagnostics, ANIMATION_CODES.DUPLICATE_TRACK,
      `Duplicate CLIP id '${id}'.`, declaration.span, { relatedSymbols: [String(id)] });
    return;
  }

  let loop = timeline.loop;
  if (declaration.loop) {
    const loopExpr = evaluateExpression(declaration.loop, symbols, diagnostics);
    loop = loopExpr && loopExpr.type === 'IDENT' ? String(loopExpr.value).toUpperCase() : loop;
    if (!LOOP_MODES.includes(loop)) {
      animationDiagnostic(diagnostics, ANIMATION_CODES.UNKNOWN_LOOP_MODE,
        `Unknown CLIP LOOP mode '${loop}'.`, declaration.span,
        { expected: [...LOOP_MODES], received: [loop] });
      return;
    }
  }

  let atTick = 0;
  if (declaration.at) {
    const resolved = resolveDurationTicks(declaration.at, timeline.fps, symbols, diagnostics, declaration.span, 'CLIP AT');
    if (resolved === null) return;
    atTick = resolved;
  }

  clips.push(Object.freeze({ id, timeline: timelineName, atTick, loop }));
}

/**
 * Evaluate one preserved FORMULA node at one sample instant. Exported for
 * scdl-v2.animation.js: the sampler binds the time symbols and replays the
 * author's constants, then folds the expression exactly as the analyzer would.
 */
export function evaluateTrackFormula(formulaNode, scopeSnapshot, timeBindings) {
  const diagnostics = [];
  const symbols = new Map(Object.entries(scopeSnapshot || {}));
  for (const [key, value] of Object.entries(timeBindings || {})) symbols.set(key, value);
  ensureAnalyzerContext(symbols);
  const value = evaluateExpression(formulaNode, symbols, diagnostics);
  return Object.freeze({ ok: diagnostics.length === 0 && value !== null, value, diagnostics: Object.freeze(diagnostics) });
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

function isPreParsedV2Ast(value) {
  return typeof value === 'object' && value !== null && Array.isArray(value.declarations);
}

export function analyzeSCDLV2(ast, options = {}) {
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

  const hostLimits = (options && (options.limits || options.budget)) || {};
  const maxCollection = hostLimits.instructions !== undefined
    ? Math.min(MAX_COLLECTION_ELEMENTS, hostLimits.instructions)
    : (options?.maxCollectionElements !== undefined ? options.maxCollectionElements : MAX_COLLECTION_ELEMENTS);
  symbols.set('$__max_collection_elements__', maxCollection);
  if (options && options.canvas) {
    symbols.set('$__canvas__', options.canvas);
  }

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
    const explicitAmps = [];
    const timelines = [];
    const clips = [];
    let selectAmpsRequested = false;
    let selectAmpsConfig = null;

    // Pre-analyze functions
    analyzeFnDeclarations(ast.declarations, symbols, diagnostics, functionsList);

    for (const declaration of ast.declarations) {
      switch (declaration.kind) {
        case 'VersionDeclaration':
        case 'CommentDeclaration':
          break;
        case 'AssetDeclaration':
          assetId = declaration.id.value;
          break;
        case 'CanvasDeclaration': {
          const width = evaluateStructuralInt(declaration.width, symbols, diagnostics, 'CANVAS WIDTH');
          const height = evaluateStructuralInt(declaration.height, symbols, diagnostics, 'CANVAS HEIGHT');
          if (width !== null && height !== null) {
            canvas = Object.freeze({ width, height });
            symbols.set('$__canvas__', canvas);
          }
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
        case 'TimelineDeclaration':
          analyzeTimelineDeclaration(declaration, symbols, diagnostics, timelines);
          break;
        case 'ClipDeclaration':
          analyzeClipDeclaration(declaration, symbols, diagnostics, clips, timelines);
          break;
        case 'ApplyAmpStatement':
          analyzeApplyAmpDeclaration(declaration, symbols, diagnostics, explicitAmps, shapes);
          break;
        case 'SelectAmpsStatement':
          if (declaration.stage && !isValidStage(declaration.stage)) {
            pushDiagnostic(diagnostics, {
              code: AMP_CODES.STAGE_MISMATCH,
              message: `SELECT_AMPS declared invalid stage '${declaration.stage}'.`,
              nodeSpan: declaration.span,
              expected: AMP_STAGES,
              received: [declaration.stage],
            });
          }
          selectAmpsRequested = true;
          selectAmpsConfig = { pipeline: declaration.pipeline, stage: declaration.stage };
          break;
        default:
          pushDiagnostic(diagnostics, {
            code: TYPE_CODES.INVALID_OPERATION,
            message: `Unknown top-level declaration kind ${declaration.kind}.`,
            nodeSpan: declaration.span,
          });
      }
    }

    const usedMaterials = new Set();
    for (const layer of layers) {
      for (const paint of layer.paints || []) {
        if (paint.material) usedMaterials.add(paint.material);
      }
    }

    let ampPlan = [];
    let selectedAmps = [];
    if (explicitAmps.length > 0 || selectAmpsRequested) {
      const context = {
        assetId,
        canvas,
        materials: Array.from(usedMaterials),
        pipeline: selectAmpsConfig?.pipeline || null,
        stage: selectAmpsConfig?.stage || null,
        layers,
        shapes,
        selectAmpsEnabled: selectAmpsRequested,
      };
      const resolved = resolveAmpPlan(listAmpManifests(), context, explicitAmps, { selectAmpsEnabled: selectAmpsRequested });
      ampPlan = resolved.fullPlan;
      selectedAmps = resolved.selectedPlan;
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
          timelines,
          clips,
          ampPlan,
          selectedAmps,
          explicitAmps,
          selectAmpsEnabled: selectAmpsRequested,
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
