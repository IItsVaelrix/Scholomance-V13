// The closed SCDL v2 type system. No type may be added outside this list
// without a language-version bump: the analyzer, formatter, and future
// bytecode/budget phases all treat SCDL_V2_TYPES as exhaustive.

export const SCDL_V2_TYPES = Object.freeze([
  'BOOL',
  'I32',
  'U32',
  'FIXED',
  'RATIO',
  'PX',
  'ANGLE',
  'DURATION',
  'COLOR',
  'VEC2',
  'RECT',
  'RANGE',
  'SEQUENCE',
  'PALETTE',
  'PATH',
  'SHAPE',
  'MASK',
  'TRANSFORM',
  'MATERIAL',
  'LAYER',
  'TIMELINE',
  'RNG',
]);

export const ANGLE_UNITS = Object.freeze(['DEGREES', 'RADIANS', 'TURNS']);

export const RASTER_POLICIES = Object.freeze(['CENTER', 'MIDPOINT', 'BRESENHAM', 'SUPERCOVER', 'THRESHOLD']);

export const COMPOSITE_MODES = Object.freeze(['OVER', 'ADD', 'SUBTRACT', 'MULTIPLY', 'MASK_IN', 'MASK_OUT', 'REPLACE']);

// Types ADD/SUB/DIV numerators and PX accept: exact numeric quantities.
export const NUMERIC_TYPES = Object.freeze(['I32', 'FIXED', 'RATIO', 'PX']);

// Numeric types that are not themselves a pixel distance; MUL/DIV scalar
// operands and PX's own operand are drawn from this set.
export const SCALAR_TYPES = Object.freeze(['I32', 'FIXED', 'RATIO']);

export const I32_MIN = -2147483648;
export const I32_MAX = 2147483647;

export const TYPE_CODES = Object.freeze({
  UNKNOWN_TYPE: 'SCDL-TYPE-001',
  MISMATCH: 'SCDL-TYPE-002',
  INVALID_OPERATION: 'SCDL-TYPE-003',
  DIVISION_BY_ZERO: 'SCDL-TYPE-004',
  RANGE: 'SCDL-TYPE-005',
});

export const BIND_CODES = Object.freeze({
  UNKNOWN_SYMBOL: 'SCDL-BIND-001',
  DUPLICATE_SYMBOL: 'SCDL-BIND-002',
});

export const GEOM_CODES = Object.freeze({
  DEGENERATE_PARAM: 'SCDL-GEOM-001',
  ASSERTION_FAILED: 'SCDL-GEOM-002',
  ANCHOR_FAILED: 'SCDL-GEOM-003',
  SINGULAR_TRANSFORM: 'SCDL-GEOM-004',
  UNSUPPORTED_POLICY: 'SCDL-GEOM-005',
  UNSUPPORTED_COMPOSITE: 'SCDL-GEOM-006',
  PATH_SYNTAX_ERROR: 'SCDL-GEOM-007',
  MALFORMED_POLYGON: 'SCDL-GEOM-008',
  OUT_OF_BOUNDS: 'SCDL-GEOM-009',
});

export const TERM_CODES = Object.freeze({
  UNCAPPED_RECURSION: 'SCDL-TERM-001',
  RECURSION_DEPTH_EXCEEDED: 'SCDL-TERM-002',
  UNBOUNDED_COLLECTION: 'SCDL-TERM-003',
  MUTUAL_RECURSION: 'SCDL-TERM-004',
  INVALID_CONTROL_FLOW: 'SCDL-TERM-004',
});

export function isKnownType(type) {
  if (typeof type !== 'string') return false;
  const base = type.includes('<') ? type.slice(0, type.indexOf('<')).trim() : type;
  return SCDL_V2_TYPES.includes(base);
}
