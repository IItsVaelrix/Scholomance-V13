const DEFINITIONS = [
  [0x0001, 'SCDL', ['PROGRAM'], [['VERSION', 'I32', true]], null, 'DECLARATION'],
  [0x0002, 'ASSET', ['PROGRAM'], [['ID', 'IDENT', true]], null, 'DECLARATION'],
  [0x0003, 'CANVAS', ['PROGRAM'], [['WIDTH', 'U32', true], ['HEIGHT', 'U32', true]], null, 'DECLARATION'],
  [0x0004, 'BUDGET', ['PROGRAM'], [['INSTRUCTIONS', 'U32', true], ['GENERATED_SHAPES', 'U32', true], ['RASTER_CELLS', 'U32', true]], null, 'DECLARATION'],
  [0x0010, 'CONST', ['PROGRAM'], [['SYMBOL', 'SYMBOL', true], ['TYPE', 'TYPE', true], ['VALUE', 'EXPRESSION', true]], null, 'PURE'],
  [0x0020, 'SHAPE', ['PROGRAM'], [['SYMBOL', 'SYMBOL', true], ['VALUE', 'SHAPE', true]], 'SHAPE', 'PURE'],
  [0x0030, 'LAYER', ['PROGRAM'], [['ID', 'IDENT', true], ['ORDER', 'I32', true], ['BODY', 'BLOCK', true]], 'LAYER', 'CONSTRUCTION'],
  [0x0031, 'PAINT', ['LAYER'], [['SHAPE', 'SHAPE', true], ['FILL', 'COLOR', true], ['RASTER', 'RASTER_POLICY', true]], null, 'CONSTRUCTION'],
  [0x0100, 'ADD', ['EXPRESSION'], [['LEFT', 'NUMERIC', true], ['RIGHT', 'NUMERIC', true]], 'SAME_NUMERIC', 'PURE'],
  [0x0101, 'SUB', ['EXPRESSION'], [['LEFT', 'NUMERIC', true], ['RIGHT', 'NUMERIC', true]], 'SAME_NUMERIC', 'PURE'],
  [0x0102, 'MUL', ['EXPRESSION'], [['LEFT', 'NUMERIC', true], ['RIGHT', 'NUMERIC', true]], 'PRODUCT', 'PURE'],
  [0x0103, 'DIV', ['EXPRESSION'], [['LEFT', 'NUMERIC', true], ['RIGHT', 'NUMERIC', true]], 'QUOTIENT', 'PURE'],
  [0x0110, 'PX', ['EXPRESSION'], [['VALUE', 'SCALAR', true]], 'PX', 'PURE'],
  [0x0111, 'VEC2', ['EXPRESSION'], [['X', 'PX', true], ['Y', 'PX', true]], 'VEC2', 'PURE'],
  [0x0200, 'PIXEL', ['EXPRESSION'], [['AT', 'VEC2', true]], 'SHAPE', 'PURE'],
  [0x0201, 'CIRCLE', ['EXPRESSION'], [['CENTER', 'VEC2', true], ['RADIUS', 'PX', true]], 'SHAPE', 'PURE'],
  [0x8000, 'BC.CONST', ['BYTECODE'], [['CONSTANT', 'CONSTANT_INDEX', true]], 'DECLARED', 'PURE'],
  [0x8001, 'BC.LAYER.NEW', ['BYTECODE'], [['ID', 'IDENT', true], ['ORDER', 'I32', true]], 'LAYER', 'CONSTRUCTION'],
  [0x8002, 'BC.PAINT', ['BYTECODE'], [['LAYER', 'LAYER', true], ['SHAPE', 'SHAPE', true], ['FILL', 'COLOR', true], ['RASTER', 'RASTER_POLICY', true]], null, 'CONSTRUCTION'],
  [0x8003, 'BC.EMIT.ASSET', ['BYTECODE'], [['LAYERS', 'LIST<LAYER>', true]], null, 'CONSTRUCTION'],
];

const CAPABILITIES = Object.freeze({
  SCDL: 'CORE.MATH@2.0',
  ASSET: 'CORE.MATH@2.0',
  CANVAS: 'GEOMETRY.STANDARD@2.0',
  BUDGET: 'CORE.MATH@2.0',
  CONST: 'CORE.MATH@2.0',
  SHAPE: 'GEOMETRY.STANDARD@2.0',
  LAYER: 'PAINT.LAYERS@2.0',
  PAINT: 'PAINT.LAYERS@2.0',
  ADD: 'CORE.MATH@2.0',
  SUB: 'CORE.MATH@2.0',
  MUL: 'CORE.MATH@2.0',
  DIV: 'CORE.MATH@2.0',
  PX: 'GEOMETRY.STANDARD@2.0',
  VEC2: 'GEOMETRY.STANDARD@2.0',
  PIXEL: 'GEOMETRY.STANDARD@2.0',
  CIRCLE: 'GEOMETRY.STANDARD@2.0',
  'BC.CONST': 'CORE.MATH@2.0',
  'BC.LAYER.NEW': 'PAINT.LAYERS@2.0',
  'BC.PAINT': 'PAINT.LAYERS@2.0',
  'BC.EMIT.ASSET': 'PAINT.LAYERS@2.0',
});

const DOCS = Object.freeze({
  SCDL: 'Declares the SCDL source language version.',
  ASSET: 'Declares the emitted asset identifier.',
  CANVAS: 'Declares the pixel canvas dimensions.',
  BUDGET: 'Declares static instruction, shape, and raster limits.',
  CONST: 'Binds a typed immutable value.',
  SHAPE: 'Binds an immutable shape expression.',
  LAYER: 'Constructs an ordered paint layer.',
  PAINT: 'Paints a shape with a color and raster policy.',
  ADD: 'Adds two compatible numeric values.',
  SUB: 'Subtracts the right numeric value from the left.',
  MUL: 'Multiplies two compatible numeric values.',
  DIV: 'Divides a numeric value by a nonzero scalar.',
  PX: 'Constructs a pixel-distance value from a scalar.',
  VEC2: 'Constructs a two-dimensional pixel vector.',
  PIXEL: 'Constructs a one-cell shape at a named position.',
  CIRCLE: 'Constructs a circle from named center and radius operands.',
  'BC.CONST': 'Loads a declared constant in canonical bytecode.',
  'BC.LAYER.NEW': 'Creates an ordered layer in canonical bytecode.',
  'BC.PAINT': 'Paints a shape into a bytecode layer.',
  'BC.EMIT.ASSET': 'Emits the completed asset from bytecode layers.',
});

const OPCODES = Object.freeze(DEFINITIONS.map(([id, mnemonic, scope, operands, result, purity]) => {
  const frozenOperands = Object.freeze(operands.map(([name, type, required]) => Object.freeze({
    name,
    type,
    required,
  })));
  return Object.freeze({
    id,
    mnemonic,
    scope: Object.freeze([...scope]),
    operands: frozenOperands,
    result,
    purity,
    cost: 1,
    capability: CAPABILITIES[mnemonic],
    version: '2.0.0',
    docs: DOCS[mnemonic],
  });
}));

const OPCODE_BY_MNEMONIC = new Map(OPCODES.map((definition) => [definition.mnemonic, definition]));

export function getSCDLV2Opcode(mnemonic) {
  return OPCODE_BY_MNEMONIC.get(mnemonic) || null;
}

export function listSCDLV2Opcodes() {
  return OPCODES;
}
