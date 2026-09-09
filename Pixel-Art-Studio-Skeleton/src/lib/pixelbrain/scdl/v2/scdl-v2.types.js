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

export const AMP_CODES = Object.freeze({
  UNKNOWN_AMP: 'SCDL-AMP-001',
  STAGE_MISMATCH: 'SCDL-AMP-002',
  MISSING_INPUT: 'SCDL-AMP-003',
  INVALID_PARAM: 'SCDL-AMP-004',
  TYPE_MISMATCH: 'SCDL-AMP-005',
  BUDGET_EXCEEDED: 'SCDL-AMP-006',
  EXECUTION_FAILED: 'SCDL-AMP-007',
  RELEVANCE_FAILED: 'SCDL-AMP-008',
  MANIFEST_INVALID: 'SCDL-AMP-009',
  VERSION_MISMATCH: 'SCDL-AMP-010',
  INVALID_INPUT: 'SCDL-AMP-011',
});


// ---------------------------------------------------------------------------
// Step 4 — mathematical animation (ANIMATION.TIMELINE@1.0)
//
// TIMELINE and DURATION already exist in SCDL_V2_TYPES as reserved types, so
// shipping animation adds no type and therefore needs no language-version bump.
// What follows are the closed enum sets the animation opcodes draw from, plus
// their diagnostic namespace. Every set is exhaustive: an unknown member is a
// compile error, never a silent default.
// ---------------------------------------------------------------------------

export const ANIMATION_CODES = Object.freeze({
  UNKNOWN_TARGET: 'SCDL-ANIM-001',
  UNKNOWN_PROPERTY: 'SCDL-ANIM-002',
  PROPERTY_TARGET_MISMATCH: 'SCDL-ANIM-003',
  UNKNOWN_EASING: 'SCDL-ANIM-004',
  UNKNOWN_LOOP_MODE: 'SCDL-ANIM-005',
  EMPTY_TRACK: 'SCDL-ANIM-006',
  UNORDERED_KEYFRAMES: 'SCDL-ANIM-007',
  KEYFRAME_OUT_OF_RANGE: 'SCDL-ANIM-008',
  NON_FINITE_DURATION: 'SCDL-ANIM-009',
  UNKNOWN_TIMELINE: 'SCDL-ANIM-010',
  DUPLICATE_TRACK: 'SCDL-ANIM-011',
  FORMULA_NOT_TIME_DEPENDENT: 'SCDL-ANIM-012',
  FRAME_BUDGET_EXCEEDED: 'SCDL-ANIM-013',
  UNKNOWN_DURATION_UNIT: 'SCDL-ANIM-014',
});

// Duration constructor opcodes. Time is integer ticks internally; these are the
// only legal ways to spell a DURATION literal in source.
export const DURATION_UNITS = Object.freeze(['MS', 'SECONDS', 'FPS', 'TICKS']);

// Canonical timeline sample rate (PDR VOXEDIT §D2) and the loop modes a
// TIMELINE or CLIP may declare.
export const ANIMATION_FPS_DEFAULT = 12;
export const LOOP_MODES = Object.freeze(['ONCE', 'REPEAT', 'MIRROR', 'HOLD']);

// Closed property vocabulary. A track may only drive a property that actually
// exists on the kind of target it names; the analyzer enforces the pairing via
// TRACK_PROPERTY_TARGETS and refuses anything else (SCDL-ANIM-003).
export const TRACK_PROPERTIES = Object.freeze([
  'OPACITY',
  'VISIBLE',
  'TRANSFORM_X',
  'TRANSFORM_Y',
  'ROTATION',
  'SCALE',
  'FILL',
  'ORDER',
]);

// Which target kinds each property may drive. In v1.0 of this capability a
// TRACK TARGET must resolve to a declared LAYER id.
//
// This is a deliberate restriction, not an oversight: the analyzer resolves a
// `SHAPE $name` reference straight into each PAINT's shape value, so the symbol
// name does not survive into the IR and a shape cannot be addressed after
// analysis. LAYER is also the correct authoring granularity — put each
// animatable element (a limb, a crown, a blade) in its own LAYER and drive that
// layer. Advertising SHAPE targeting here would compile and then silently
// animate nothing, which is the exact failure mode this language forbids.
export const TRACK_PROPERTY_TARGETS = Object.freeze({
  OPACITY: ['LAYER'],
  VISIBLE: ['LAYER'],
  ORDER: ['LAYER'],
  TRANSFORM_X: ['LAYER'],
  TRANSFORM_Y: ['LAYER'],
  ROTATION: ['LAYER'],
  SCALE: ['LAYER'],
  FILL: ['LAYER'],
});

// Versioned deterministic easing curves. The name is part of program identity:
// changing a curve's mathematics is a language-version change, not a patch.
// Each entry maps normalized t in [0,1] to eased progress in [0,1].
export const EASING_CURVES = Object.freeze([
  'LINEAR',
  'STEP',
  'SINE_IN',
  'SINE_OUT',
  'SINE_IN_OUT',
  'QUAD_IN',
  'QUAD_OUT',
  'QUAD_IN_OUT',
  'CUBIC_IN',
  'CUBIC_OUT',
  'CUBIC_IN_OUT',
  'SMOOTHSTEP',
]);

export const EASING_VERSION = '1.0.0';

// Implicit symbols bound inside a TRACK FORMULA body at sample time. Authors
// may read these but never declare or assign them.
export const TIME_SYMBOLS = Object.freeze(['$time', '$time_normalized', '$frame', '$t']);

export const ABI_DESCRIPTOR_TYPES = Object.freeze(['PACKET', 'ASSET', 'ANY']);

export function isKnownType(type) {
  if (typeof type !== 'string') return false;
  const base = type.includes('<') ? type.slice(0, type.indexOf('<')).trim() : type;
  return SCDL_V2_TYPES.includes(base);
}

export function isKnownAbiType(type) {
  if (typeof type !== 'string') return false;
  const base = type.includes('<') ? type.slice(0, type.indexOf('<')).trim() : type;
  return SCDL_V2_TYPES.includes(base) || ABI_DESCRIPTOR_TYPES.includes(base);
}
