// The closed SCDL v2 type system. No type may be added outside this list
// without a language-version bump: the analyzer, formatter, and future
// bytecode/budget phases all treat SCDL_V2_TYPES as exhaustive.

export const SCDL_V2_TYPES = Object.freeze(['I32', 'U32', 'FIXED', 'RATIO', 'PX', 'COLOR', 'VEC2', 'SHAPE', 'LAYER']);

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

export function isKnownType(type) {
  return SCDL_V2_TYPES.includes(type);
}
