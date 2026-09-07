import { span, v2Diagnostic } from './scdl-v2.diagnostics.js';
import { getSCDLV2Opcode } from './scdl-v2.opcodes.js';
import { tokenizeSCDLV2 } from './scdl-v2.tokenizer.js';

export const PARSE_CODES = Object.freeze({
  UNKNOWN_OPCODE: 'SCDL-PARSE-001',
  EXPECTED_TOKEN: 'SCDL-PARSE-002',
  DUPLICATE_DECLARATION: 'SCDL-PARSE-003',
  MISSING_OPERAND: 'SCDL-PARSE-004',
  DUPLICATE_OPERAND: 'SCDL-PARSE-005',
  UNKNOWN_OPERAND: 'SCDL-PARSE-006',
  UNBALANCED_BLOCK: 'SCDL-PARSE-007',
});

const STRUCTURAL_DECLARATIONS = Object.freeze(['SCDL', 'ASSET', 'CANVAS', 'BUDGET']);
const REQUIRED_DECLARATIONS = Object.freeze(['SCDL', 'ASSET', 'CANVAS']);
const POSITIONAL_EXPRESSIONS = new Set([
  'ADD', 'SUB', 'MUL', 'DIV', 'PX', 'VEC2',
  'DEGREES', 'RADIANS', 'TURNS',
  'UNION', 'SUBTRACT', 'INTERSECT', 'XOR',
  'MASK_UNION', 'MASK_INTERSECT', 'MASK_SUBTRACT', 'MASK_INVERT',
  'INSIDE', 'CONTAINS', 'TOUCHES', 'OVERLAPS',
  'BOUNDS', 'ANCHOR_OF', 'TRANSFORM_COMPOSE', 'TRANSFORM_APPLY',
  'MOD', 'POW', 'ABS', 'MIN', 'MAX', 'FLOOR', 'CEIL', 'ROUND', 'SQRT',
  'SIN', 'COS', 'TAN', 'ATAN2', 'GCD', 'LCM',
  'DISTANCE', 'DOT', 'CROSS', 'NORMALIZE',
  'EQ', 'NEQ', 'LT', 'LTE', 'GT', 'GTE', 'AND', 'OR', 'NOT',
  'PREV', 'AT', 'LENGTH', 'SUM', 'PRODUCT', 'ZIP',
]);
const NAMED_EXPRESSIONS = new Set([
  'PIXEL', 'CIRCLE',
  'LINE', 'POLYLINE', 'RAY', 'RECT', 'ROUNDED_RECT', 'RING', 'ELLIPSE',
  'ARC', 'SECTOR', 'TRIANGLE', 'REGULAR_POLYGON', 'POLYGON', 'STAR', 'PATH',
  'ROTATE', 'TRANSLATE', 'SCALE', 'ALIGN', 'OUTLINE', 'TO_MASK',
  'CLAMP', 'LERP', 'MAP_RANGE', 'RANGE', 'FOLD', 'MAP', 'FILTER',
  'RANDOM_I32', 'RANDOM_SCALAR', 'RANDOM_VEC2', 'NOISE_2D',
]);
const ALLOWS_LEADING_POSITIONAL = new Set([
  'OUTLINE', 'TO_MASK', 'RANDOM_I32', 'RANDOM_SCALAR', 'RANDOM_VEC2',
  'MAP', 'FILTER', 'FOLD', 'CLAMP', 'LERP',
]);
const INLINE_TRIVIA = new Set(['WHITESPACE', 'COMMENT']);


class ParseAbort extends Error {}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function nodeSpan(first, last = first) {
  return span(first.span.start, last.span.end);
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
    this.diagnostics = [];
    this.seenStructural = new Set();
  }

  current() {
    return this.tokens[this.index] || this.tokens.at(-1);
  }

  skipInlineTrivia() {
    while (INLINE_TRIVIA.has(this.current().kind)) this.index += 1;
  }

  skipLayout() {
    while (INLINE_TRIVIA.has(this.current().kind) || this.current().kind === 'NEWLINE') this.index += 1;
  }

  take() {
    const token = this.current();
    if (token.kind !== 'EOF') this.index += 1;
    return token;
  }

  takeInline() {
    this.skipInlineTrivia();
    return this.take();
  }

  peekInline() {
    this.skipInlineTrivia();
    return this.current();
  }

  diagnostic(code, message, token = this.current(), expected = [], received = undefined) {
    const actual = received === undefined
      ? [token.raw || token.kind]
      : received;
    this.diagnostics.push(v2Diagnostic({
      code,
      phase: 'PARSE',
      message,
      span: token.span,
      expected,
      received: actual,
    }));
  }

  abort(code, message, token, expected, received) {
    this.diagnostic(code, message, token, expected, received);
    throw new ParseAbort(message);
  }

  expect(kind, raw = null, expected = [raw || kind]) {
    const token = this.peekInline();
    if (token.kind !== kind || (raw !== null && token.raw !== raw)) {
      this.abort(
        PARSE_CODES.EXPECTED_TOKEN,
        `Expected ${expected.join(' or ')}.`,
        token,
        expected,
      );
    }
    return this.take();
  }

  parseProgram() {
    const declarations = [];
    this.skipLayout();
    const first = this.current();

    while (this.current().kind !== 'EOF') {
      if (this.current().kind === 'RBRACE') {
        this.diagnostic(
          PARSE_CODES.UNBALANCED_BLOCK,
          'Unexpected closing brace without an open layer block.',
          this.current(),
          ['top-level declaration'],
        );
        this.take();
        this.skipLayout();
        continue;
      }

      const before = this.index;
      try {
        const declaration = this.parseStatement('PROGRAM');
        if (declaration) declarations.push(declaration);
        this.finishTopLevelStatement();
      } catch (error) {
        if (!(error instanceof ParseAbort)) throw error;
        this.synchronize(false);
      }
      if (this.index === before) this.take();
      this.skipLayout();
    }

    for (const mnemonic of REQUIRED_DECLARATIONS) {
      if (!this.seenStructural.has(mnemonic)) {
        this.diagnostic(
          PARSE_CODES.MISSING_OPERAND,
          `Program is missing required ${mnemonic} declaration.`,
          this.current(),
          [mnemonic === 'SCDL' ? 'SCDL 2' : mnemonic],
          ['EOF'],
        );
      }
    }

    const last = this.current();
    return {
      kind: 'Program',
      opcode: 'PROGRAM',
      declarations,
      children: declarations,
      span: nodeSpan(first, last),
    };
  }

  finishTopLevelStatement() {
    this.skipInlineTrivia();
    const token = this.current();
    if (token.kind === 'NEWLINE') {
      this.take();
      return;
    }
    if (token.kind === 'EOF') return;
    if (token.kind === 'RBRACE') {
      this.abort(
        PARSE_CODES.UNBALANCED_BLOCK,
        'Unexpected closing brace without an open layer block.',
        token,
        ['newline', 'EOF'],
      );
    }
    this.abort(
      PARSE_CODES.EXPECTED_TOKEN,
      'Expected a newline after the declaration.',
      token,
      ['newline', 'EOF'],
    );
  }

  synchronize(inBlock) {
    while (this.current().kind !== 'EOF') {
      if (this.current().kind === 'NEWLINE') {
        this.take();
        return;
      }
      if (inBlock && this.current().kind === 'RBRACE') return;
      this.take();
    }
  }

  parseStatement(scope) {
    const opcodeToken = this.peekInline();
    if (opcodeToken.kind !== 'WORD') {
      this.abort(
        PARSE_CODES.EXPECTED_TOKEN,
        'Expected an uppercase opcode at the start of the statement.',
        opcodeToken,
        ['uppercase opcode'],
      );
    }
    this.take();

    const definition = getSCDLV2Opcode(opcodeToken.raw);
    const inScope = definition && (
      definition.scope.includes(scope) ||
      (scope === 'BLOCK' && ['LET', 'RETURN', 'EMIT', 'FOR', 'IF', 'MATCH', 'PAINT', 'RADIAL'].includes(definition.mnemonic)) ||
      (scope === 'LAYER' && ['PAINT', 'FOR', 'LET', 'IF'].includes(definition.mnemonic)) ||
      (scope === 'SHAPE' && ['EMIT', 'FOR', 'RADIAL', 'LET', 'IF'].includes(definition.mnemonic)) ||
      (scope === 'FUNCTION' && ['LET', 'RETURN', 'IF', 'MATCH', 'FOR'].includes(definition.mnemonic))
    );

    if (!inScope || definition.scope.every((item) => item === 'BYTECODE')) {
      this.abort(
        PARSE_CODES.UNKNOWN_OPCODE,
        `Opcode ${JSON.stringify(opcodeToken.raw)} is not legal in ${scope} source scope.`,
        opcodeToken,
        scope === 'PROGRAM' ? ['SCDL', 'ASSET', 'CANVAS', 'BUDGET', 'CONST', 'SHAPE', 'LAYER', 'FN', 'SEQUENCE', 'RNG'] : ['PAINT', 'FOR', 'LET'],
        [opcodeToken.raw],
      );
    }

    if (STRUCTURAL_DECLARATIONS.includes(definition.mnemonic)) {
      if (this.seenStructural.has(definition.mnemonic)) {
        this.diagnostic(
          PARSE_CODES.DUPLICATE_DECLARATION,
          `Duplicate ${definition.mnemonic} declaration.`,
          opcodeToken,
          [`one ${definition.mnemonic} declaration`],
          [definition.mnemonic],
        );
      } else {
        this.seenStructural.add(definition.mnemonic);
      }
    }

    switch (definition.mnemonic) {
      case 'SCDL': return this.parseVersionDeclaration(opcodeToken);
      case 'ASSET': return this.parseAssetDeclaration(opcodeToken);
      case 'CANVAS': return this.parseCanvasDeclaration(opcodeToken);
      case 'BUDGET': return this.parseBudgetDeclaration(opcodeToken);
      case 'CONST': return this.parseConstDeclaration(opcodeToken);
      case 'SHAPE': return this.parseShapeDeclaration(opcodeToken);
      case 'MASK': return this.parseMaskDeclaration(opcodeToken);
      case 'ANCHOR': return this.parseAnchorDeclaration(opcodeToken);
      case 'ASSERT': return this.parseAssertDeclaration(opcodeToken);
      case 'LAYER': return this.parseLayerDeclaration(opcodeToken);
      case 'PAINT': return this.parsePaintStatement(opcodeToken);
      case 'FN': return this.parseFnDeclaration(opcodeToken);
      case 'SEQUENCE': return this.parseSequenceDeclaration(opcodeToken);
      case 'RNG': return this.parseRngDeclaration(opcodeToken);
      case 'LET': return this.parseLetStatement(opcodeToken);
      case 'RETURN': return this.parseReturnStatement(opcodeToken);
      case 'EMIT': return this.parseEmitStatement(opcodeToken);
      case 'FOR': return this.parseForStatement(opcodeToken, scope);
      case 'IF': return this.parseIfStatement(opcodeToken, scope);
      case 'MATCH': return this.parseMatchStatement(opcodeToken, scope);
      case 'RADIAL': return this.parseRadialStatement(opcodeToken);
      case 'APPLY_AMP': return this.parseApplyAmpStatement(opcodeToken, scope);
      case 'SELECT_AMPS': return this.parseSelectAmpsStatement(opcodeToken);
      default:
        this.abort(
          PARSE_CODES.UNKNOWN_OPCODE,
          `Opcode ${definition.mnemonic} is not a source statement.`,
          opcodeToken,
          ['source statement'],
          [definition.mnemonic],
        );
    }
  }


  parseMaskDeclaration(opcodeToken) {
    const symbolToken = this.expect('SYMBOL', null, ['symbol']);
    const value = this.parseExpression();
    return {
      kind: 'MaskDeclaration',
      opcode: 'MASK',
      symbol: symbolToken.value,
      value,
      children: [value],
      span: span(opcodeToken.span.start, value.span.end),
    };
  }

  parseAnchorDeclaration(opcodeToken) {
    const symbolToken = this.expect('SYMBOL', null, ['symbol']);
    this.expect('WORD', 'ON', ['ON']);
    const onTarget = this.parseExpression();
    this.expect('WORD', 'AT', ['AT']);
    const atSpec = this.parseExpression();
    return {
      kind: 'AnchorDeclaration',
      opcode: 'ANCHOR',
      symbol: symbolToken.value,
      on: onTarget,
      at: atSpec,
      children: [onTarget, atSpec],
      span: span(opcodeToken.span.start, atSpec.span.end),
    };
  }

  parseAssertDeclaration(opcodeToken) {
    const condition = this.parseExpression();
    return {
      kind: 'AssertDeclaration',
      opcode: 'ASSERT',
      condition,
      children: [condition],
      span: span(opcodeToken.span.start, condition.span.end),
    };
  }

  parseApplyAmpStatement(opcodeToken, scope) {
    let targetSymbol = null;
    let targetType = null;
    let peek = this.peekInline();
    if (peek.kind === 'SYMBOL') {
      targetSymbol = this.take().value;
      const typeToken = this.expect('WORD', null, ['output type (e.g. SHAPE, LAYER)']);
      targetType = typeToken.raw;
    }

    this.expect('LBRACE', '{', ['{']);

    let ampId = null;
    let version = null;
    let stage = null;
    const inputs = {};
    const params = {};

    for (;;) {
      this.skipLayout();
      const token = this.current();
      if (token.kind === 'RBRACE' || token.kind === 'EOF') break;

      if (token.kind === 'WORD') {
        const keyword = token.raw;
        this.take();
        if (keyword === 'AMP') {
          const idToken = this.expect('WORD', null, ['qualified amp identifier']);
          ampId = idToken.raw;
        } else if (keyword === 'VERSION') {
          const verToken = this.expect('WORD', null, ['semver version']);
          version = verToken.raw;
        } else if (keyword === 'STAGE') {
          const stageToken = this.expect('WORD', null, ['stage identifier']);
          stage = stageToken.raw;
        } else if (keyword === 'INPUT') {
          const nameToken = this.expect('WORD', null, ['input name']);
          const valExpr = this.parseExpression();
          inputs[nameToken.raw] = valExpr;
        } else if (keyword === 'PARAM') {
          const nameToken = this.expect('WORD', null, ['parameter name']);
          const valExpr = this.parseExpression();
          params[nameToken.raw] = valExpr;
        } else {
          this.abort(
            PARSE_CODES.UNKNOWN_OPERAND,
            `Unknown operand '${keyword}' in APPLY_AMP block. Expected AMP, VERSION, STAGE, INPUT, or PARAM.`,
            token,
            ['AMP', 'VERSION', 'STAGE', 'INPUT', 'PARAM'],
          );
        }
        this.skipInlineTrivia();
        if (this.current().kind === 'NEWLINE') this.take();
      } else {
        this.abort(
          PARSE_CODES.EXPECTED_TOKEN,
          `Expected APPLY_AMP field declaration, received ${token.kind}.`,
          token,
          ['AMP, VERSION, STAGE, INPUT, or PARAM'],
        );
      }
    }

    const closeToken = this.expect('RBRACE', '}', ['}']);

    return {
      kind: 'ApplyAmpStatement',
      opcode: 'APPLY_AMP',
      targetSymbol,
      targetType,
      ampId,
      version: version || '1.0.0',
      stage,
      inputs,
      params,
      children: [...Object.values(inputs), ...Object.values(params)],
      span: nodeSpan(opcodeToken, closeToken),
    };
  }

  parseSelectAmpsStatement(opcodeToken) {
    let pipeline = null;
    let stage = null;
    let lastToken = opcodeToken;

    let peek = this.peekInline();
    if (peek.kind === 'LBRACE') {
      this.take();
      for (;;) {
        this.skipLayout();
        const token = this.current();
        if (token.kind === 'RBRACE' || token.kind === 'EOF') break;
        if (token.kind === 'WORD' && token.raw === 'PIPELINE') {
          this.take();
          const pipeToken = this.expect('WORD', null, ['pipeline name']);
          pipeline = pipeToken.raw;
        } else if (token.kind === 'WORD' && token.raw === 'STAGE') {
          this.take();
          const stageToken = this.expect('WORD', null, ['stage name']);
          stage = stageToken.raw;
        } else {
          this.abort(
            PARSE_CODES.UNKNOWN_OPERAND,
            `Unknown operand in SELECT_AMPS block: ${token.raw || token.kind}`,
            token,
            ['PIPELINE', 'STAGE'],
          );
        }
        this.skipInlineTrivia();
        if (this.current().kind === 'NEWLINE') this.take();
      }
      lastToken = this.expect('RBRACE', '}', ['}']);
    } else {
      while (this.peekInline().kind === 'WORD') {
        const keyToken = this.take();
        if (keyToken.raw === 'PIPELINE') {
          const pipeToken = this.expect('WORD', null, ['pipeline name']);
          pipeline = pipeToken.raw;
          lastToken = pipeToken;
        } else if (keyToken.raw === 'STAGE') {
          const stageToken = this.expect('WORD', null, ['stage name']);
          stage = stageToken.raw;
          lastToken = stageToken;
        } else {
          this.abort(
            PARSE_CODES.UNKNOWN_OPERAND,
            `Unknown operand in SELECT_AMPS: ${keyToken.raw}`,
            keyToken,
            ['PIPELINE', 'STAGE'],
          );
        }
      }
    }

    return {
      kind: 'SelectAmpsStatement',
      opcode: 'SELECT_AMPS',
      pipeline,
      stage,
      children: [],
      span: nodeSpan(opcodeToken, lastToken),
    };
  }

  parseVersionDeclaration(opcodeToken) {
    const versionToken = this.expect('INTEGER', '2', ['2']);
    const version = this.literal(versionToken);
    return {
      kind: 'VersionDeclaration',
      opcode: 'SCDL',
      version,
      children: [version],
      span: nodeSpan(opcodeToken, versionToken),
    };
  }

  parseAssetDeclaration(opcodeToken) {
    const idToken = this.expect('WORD', null, ['asset identifier']);
    const id = this.literal(idToken);
    return {
      kind: 'AssetDeclaration',
      opcode: 'ASSET',
      id,
      children: [id],
      span: nodeSpan(opcodeToken, idToken),
    };
  }

  parseCanvasDeclaration(opcodeToken) {
    this.expect('WORD', 'WIDTH', ['WIDTH']);
    const widthToken = this.expect('INTEGER', null, ['canvas width']);
    this.expect('WORD', 'HEIGHT', ['HEIGHT']);
    const heightToken = this.expect('INTEGER', null, ['canvas height']);
    const width = this.literal(widthToken);
    const height = this.literal(heightToken);
    return {
      kind: 'CanvasDeclaration',
      opcode: 'CANVAS',
      width,
      height,
      named: { WIDTH: width, HEIGHT: height },
      children: [width, height],
      span: nodeSpan(opcodeToken, heightToken),
    };
  }

  parseBudgetDeclaration(opcodeToken) {
    this.expect('WORD', 'INSTRUCTIONS', ['INSTRUCTIONS']);
    const instructionsToken = this.expect('INTEGER', null, ['instruction limit']);
    this.expect('WORD', 'GENERATED_SHAPES', ['GENERATED_SHAPES']);
    const shapesToken = this.expect('INTEGER', null, ['generated shapes limit']);
    this.expect('WORD', 'RASTER_CELLS', ['RASTER_CELLS']);
    const cellsToken = this.expect('INTEGER', null, ['raster cells limit']);
    const instructions = this.literal(instructionsToken);
    const generatedShapes = this.literal(shapesToken);
    const rasterCells = this.literal(cellsToken);

    let recursionDepth = null;
    let lastToken = cellsToken;
    const peek = this.peekInline();
    if (peek.kind === 'WORD' && peek.raw === 'RECURSION_DEPTH') {
      this.take();
      const depthToken = this.expect('INTEGER', null, ['recursion depth limit']);
      recursionDepth = this.literal(depthToken);
      lastToken = depthToken;
    }

    return {
      kind: 'BudgetDeclaration',
      opcode: 'BUDGET',
      instructions,
      generatedShapes,
      rasterCells,
      recursionDepth,
      limits: {
        INSTRUCTIONS: instructions,
        GENERATED_SHAPES: generatedShapes,
        RASTER_CELLS: rasterCells,
        ...(recursionDepth ? { RECURSION_DEPTH: recursionDepth } : {}),
      },
      named: {
        INSTRUCTIONS: instructions,
        GENERATED_SHAPES: generatedShapes,
        RASTER_CELLS: rasterCells,
        ...(recursionDepth ? { RECURSION_DEPTH: recursionDepth } : {}),
      },
      children: recursionDepth ? [instructions, generatedShapes, rasterCells, recursionDepth] : [instructions, generatedShapes, rasterCells],
      span: span(opcodeToken.span.start, lastToken.span.end),
    };
  }

  parseConstDeclaration(opcodeToken) {
    const symbolToken = this.expect('SYMBOL', null, ['symbol']);
    let declaredType = null;
    if (this.peekInline().kind === 'WORD') {
      declaredType = this.take().raw;
    }
    const value = this.parseExpression();
    return {
      kind: 'ConstDeclaration',
      opcode: 'CONST',
      symbol: symbolToken.value,
      declaredType,
      value,
      children: [value],
      span: span(opcodeToken.span.start, value.span.end),
    };
  }

  parseShapeDeclaration(opcodeToken) {
    const symbolToken = this.expect('SYMBOL', null, ['symbol']);
    let peek = this.peekInline();
    let isCompound = false;
    if (peek.kind === 'WORD' && peek.raw === 'COMPOUND') {
      this.take();
      isCompound = true;
      peek = this.peekInline();
    }
    if (peek.kind === 'LBRACE') {
      this.take();
      const body = this.parseBlock('SHAPE');
      const closeToken = this.current();
      return {
        kind: 'ShapeBlockDeclaration',
        opcode: 'SHAPE',
        symbol: symbolToken.value,
        isCompound,
        body,
        children: [...body],
        span: span(opcodeToken.span.start, closeToken.span.end),
      };
    }
    const value = this.parseExpression();
    return {
      kind: 'ShapeDeclaration',
      opcode: 'SHAPE',
      symbol: symbolToken.value,
      value,
      children: [value],
      span: span(opcodeToken.span.start, value.span.end),
    };
  }

  parseFnDeclaration(opcodeToken) {
    const idToken = this.expect('WORD', null, ['function identifier']);
    const params = [];
    for (;;) {
      const peek = this.peekInline();
      if (peek.kind === 'WORD' && peek.raw === 'PARAM') {
        this.take();
        const paramSym = this.expect('SYMBOL', null, ['parameter name']);
        const paramType = this.expect('WORD', null, ['parameter type']);
        params.push({
          name: paramSym.value,
          type: paramType.raw,
          span: nodeSpan(paramSym, paramType),
        });
      } else {
        break;
      }
    }
    this.expect('WORD', 'RETURNS', ['RETURNS']);
    const returnTypeToken = this.expect('WORD', null, ['return type']);

    let recursionMax = null;
    const peekRec = this.peekInline();
    if (peekRec.kind === 'WORD' && peekRec.raw === 'RECURSION_MAX') {
      this.take();
      const maxToken = this.expect('INTEGER', null, ['recursion max limit']);
      recursionMax = Number(maxToken.raw);
    }

    this.expect('LBRACE', '{', ['{']);
    const body = this.parseBlock('FUNCTION');
    const closeToken = this.current();

    return {
      kind: 'FnDeclaration',
      opcode: 'FN',
      id: idToken.raw,
      params,
      returnType: returnTypeToken.raw,
      recursionMax,
      body,
      children: [...body],
      span: nodeSpan(opcodeToken, closeToken),
    };
  }

  parseSequenceDeclaration(opcodeToken) {
    const symbolToken = this.expect('SYMBOL', null, ['sequence symbol']);
    this.expect('WORD', 'TYPE', ['TYPE']);
    const typeToken = this.expect('WORD', null, ['item type']);
    this.expect('WORD', 'COUNT', ['COUNT']);
    const count = this.parseExpression();
    this.expect('LBRACE', '{', ['{']);

    const seeds = [];
    let nextExpr = null;
    for (;;) {
      this.skipLayout();
      const token = this.current();
      if (token.kind === 'RBRACE' || token.kind === 'EOF') break;

      if (token.kind === 'WORD' && token.raw === 'SEED') {
        this.take();
        seeds.push(this.parseExpression());
        this.skipInlineTrivia();
        if (this.current().kind === 'NEWLINE') this.take();
      } else if (token.kind === 'WORD' && token.raw === 'NEXT') {
        this.take();
        nextExpr = this.parseExpression();
        this.skipInlineTrivia();
        if (this.current().kind === 'NEWLINE') this.take();
      } else {
        this.abort(
          PARSE_CODES.EXPECTED_TOKEN,
          'Expected SEED or NEXT declaration in SEQUENCE block.',
          token,
          ['SEED', 'NEXT'],
        );
      }
    }
    const closeToken = this.expect('RBRACE', '}', ['}']);

    return {
      kind: 'SequenceDeclaration',
      opcode: 'SEQUENCE',
      symbol: symbolToken.value,
      itemType: typeToken.raw,
      count,
      seeds,
      next: nextExpr,
      children: [count, ...seeds, ...(nextExpr ? [nextExpr] : [])],
      span: nodeSpan(opcodeToken, closeToken),
    };
  }

  parseRngDeclaration(opcodeToken) {
    const symbolToken = this.expect('SYMBOL', null, ['rng symbol']);
    this.expect('WORD', 'ALGORITHM', ['ALGORITHM']);
    const algToken = this.expect('WORD', null, ['algorithm name']);
    this.expect('WORD', 'SEED', ['SEED']);
    const seed = this.parseExpression();

    return {
      kind: 'RngDeclaration',
      opcode: 'RNG',
      symbol: symbolToken.value,
      algorithm: algToken.raw,
      seed,
      children: [seed],
      span: span(opcodeToken.span.start, seed.span.end),
    };
  }

  parseForStatement(opcodeToken, scope) {
    const varToken = this.expect('SYMBOL', null, ['loop variable']);
    this.expect('WORD', 'IN', ['IN']);
    const iterable = this.parseExpression();
    this.expect('LBRACE', '{', ['{']);
    const body = this.parseBlock(scope);
    const closeToken = this.current();

    return {
      kind: 'ForStatement',
      opcode: 'FOR',
      variable: varToken.value,
      in: iterable,
      body,
      children: [iterable, ...body],
      span: nodeSpan(opcodeToken, closeToken),
    };
  }

  parseRadialStatement(opcodeToken) {
    this.expect('WORD', 'COUNT', ['COUNT']);
    const count = this.parseExpression();
    const options = {};
    for (;;) {
      const peek = this.peekInline();
      if (peek.kind === 'WORD' && ['CENTER', 'RADIUS'].includes(peek.raw)) {
        this.take();
        options[peek.raw] = this.parseExpression();
      } else {
        break;
      }
    }
    this.expect('LBRACE', '{', ['{']);
    const body = this.parseBlock('SHAPE');
    const closeToken = this.current();

    return {
      kind: 'RadialStatement',
      opcode: 'RADIAL',
      count,
      center: options.CENTER || null,
      radius: options.RADIUS || null,
      body,
      children: [count, ...Object.values(options), ...body],
      span: nodeSpan(opcodeToken, closeToken),
    };
  }

  parseLetStatement(opcodeToken) {
    const symbolToken = this.expect('SYMBOL', null, ['variable symbol']);
    const typeToken = this.expect('WORD', null, ['variable type']);
    const value = this.parseExpression();

    return {
      kind: 'LetStatement',
      opcode: 'LET',
      symbol: symbolToken.value,
      declaredType: typeToken.raw,
      value,
      children: [value],
      span: span(opcodeToken.span.start, value.span.end),
    };
  }

  parseReturnStatement(opcodeToken) {
    const value = this.parseExpression();
    return {
      kind: 'ReturnStatement',
      opcode: 'RETURN',
      value,
      children: [value],
      span: span(opcodeToken.span.start, value.span.end),
    };
  }

  parseEmitStatement(opcodeToken) {
    const value = this.parseExpression();
    return {
      kind: 'EmitStatement',
      opcode: 'EMIT',
      value,
      children: [value],
      span: span(opcodeToken.span.start, value.span.end),
    };
  }

  parseIfStatement(opcodeToken, scope) {
    const condition = this.parseExpression();
    this.expect('LBRACE', '{', ['{']);
    const thenBlock = this.parseBlock(scope);

    let elseBlock = null;
    this.skipInlineTrivia();
    const peek = this.peekInline();
    if (peek.kind === 'WORD' && peek.raw === 'ELSE') {
      this.take();
      this.expect('LBRACE', '{', ['{']);
      elseBlock = this.parseBlock(scope);
    }
    const closeToken = this.current();

    return {
      kind: 'IfStatement',
      opcode: 'IF',
      condition,
      then: thenBlock,
      else: elseBlock,
      children: [condition, ...thenBlock, ...(elseBlock || [])],
      span: nodeSpan(opcodeToken, closeToken),
    };
  }

  parseMatchStatement(opcodeToken, scope) {
    const target = this.parseExpression();
    this.expect('LBRACE', '{', ['{']);
    const cases = [];
    let defaultCase = null;

    for (;;) {
      this.skipLayout();
      const token = this.current();
      if (token.kind === 'RBRACE' || token.kind === 'EOF') break;

      if (token.kind === 'WORD' && token.raw === 'CASE') {
        this.take();
        const pattern = this.parseExpression();
        this.skipInlineTrivia();
        if (this.current().kind === 'ARROW') this.take();
        this.expect('LBRACE', '{', ['{']);
        const caseBody = this.parseBlock(scope);
        cases.push({ pattern, body: caseBody });
      } else if (token.kind === 'WORD' && token.raw === 'DEFAULT') {
        this.take();
        this.skipInlineTrivia();
        if (this.current().kind === 'ARROW') this.take();
        this.expect('LBRACE', '{', ['{']);
        defaultCase = this.parseBlock(scope);
      } else {
        const pattern = this.parseExpression();
        this.skipInlineTrivia();
        if (this.current().kind === 'ARROW') this.take();
        this.expect('LBRACE', '{', ['{']);
        const caseBody = this.parseBlock(scope);
        cases.push({ pattern, body: caseBody });
      }
    }
    const closeToken = this.expect('RBRACE', '}', ['}']);

    return {
      kind: 'MatchStatement',
      opcode: 'MATCH',
      target,
      cases,
      default: defaultCase,
      children: [target],
      span: nodeSpan(opcodeToken, closeToken),
    };
  }

  parseBlock(scope) {
    const body = [];
    for (;;) {
      this.skipLayout();
      const token = this.current();
      if (token.kind === 'RBRACE') {
        this.take();
        break;
      }
      if (token.kind === 'EOF') {
        this.diagnostic(
          PARSE_CODES.UNBALANCED_BLOCK,
          'Block is missing its closing brace.',
          token,
          ['}'],
          ['EOF'],
        );
        break;
      }

      const before = this.index;
      try {
        const statement = this.parseStatement(scope);
        if (statement) body.push(statement);
        this.skipInlineTrivia();
        const boundary = this.current();
        if (boundary.kind === 'NEWLINE') this.take();
      } catch (error) {
        if (!(error instanceof ParseAbort)) throw error;
        this.synchronize(true);
      }
      if (this.index === before) this.take();
    }
    return body;
  }

  parseLayerDeclaration(opcodeToken) {
    const idToken = this.expect('WORD', null, ['layer identifier']);
    const id = this.literal(idToken);
    this.expect('WORD', 'ORDER', ['ORDER']);
    const order = this.parseExpression();
    const options = {};
    for (;;) {
      const peek = this.peekInline();
      if (peek.kind === 'WORD' && ['BLEND', 'OPACITY', 'VISIBLE'].includes(peek.raw)) {
        this.take();
        options[peek.raw] = this.parseExpression();
      } else {
        break;
      }
    }
    this.expect('LBRACE', '{', ['{']);
    const body = this.parseBlock('LAYER');
    const closingToken = this.tokens[this.index - 1] || opcodeToken;

    return {
      kind: 'LayerDeclaration',
      opcode: 'LAYER',
      id,
      order,
      blend: options.BLEND || null,
      opacity: options.OPACITY || null,
      visible: options.VISIBLE || null,
      body,
      children: [id, order, ...Object.values(options), ...body],
      span: nodeSpan(opcodeToken, closingToken),
    };
  }



  parsePaintStatement(opcodeToken) {
    const shapeValue = this.parseExpression();
    const named = {};
    const children = [shapeValue];
    let lastToken = shapeValue;

    for (;;) {
      const token = this.peekInline();
      if (token.kind === 'NEWLINE' || token.kind === 'RBRACE' || token.kind === 'EOF') break;
      if (token.kind !== 'WORD') break;
      const keyToken = this.take();
      const key = keyToken.raw;
      const val = this.parseExpression();
      named[key] = val;
      children.push(val);
      lastToken = val;
    }

    const fill = named.FILL || null;
    const raster = named.RASTER || { kind: 'Literal', literalKind: 'IDENT', raw: 'CENTER', value: 'CENTER', span: opcodeToken.span };
    const blend = named.BLEND || null;
    const clipTo = named.CLIP_TO || null;
    const material = named.MATERIAL || null;
    const opacity = named.OPACITY || null;

    return {
      kind: 'PaintStatement',
      opcode: 'PAINT',
      shape: shapeValue,
      fill,
      raster,
      blend,
      clipTo,
      material,
      opacity,
      positional: [shapeValue],
      named,
      children,
      span: nodeSpan(opcodeToken, lastToken),
    };
  }

  parseExpression() {
    const token = this.peekInline();
    if (['INTEGER', 'DECIMAL', 'COLOR', 'WORD', 'STRING'].includes(token.kind)) {
      this.take();
      return this.literal(token);
    }
    if (token.kind === 'SYMBOL') {
      this.take();
      return { kind: 'SymbolRef', name: token.value, span: token.span };
    }
    if (token.kind === 'LPAREN') return this.parseCallExpression();

    this.abort(
      PARSE_CODES.EXPECTED_TOKEN,
      'Expected a literal, symbol reference, or parenthesized prefix expression.',
      token,
      ['literal', 'symbol', '(OPCODE ...)'],
    );
  }

  parseCallExpression() {
    const openToken = this.expect('LPAREN', '(', ['(']);
    const opcodeToken = this.expect('WORD', null, ['expression opcode']);
    const definition = getSCDLV2Opcode(opcodeToken.raw);
    if (!definition || !definition.scope.includes('EXPRESSION') || definition.scope.every((item) => item === 'BYTECODE')) {
      this.abort(
        PARSE_CODES.UNKNOWN_OPCODE,
        `Opcode ${JSON.stringify(opcodeToken.raw)} is not legal in an SCDL source expression.`,
        opcodeToken,
        ['ADD', 'SUB', 'MUL', 'DIV', 'PX', 'VEC2', 'PIXEL', 'CIRCLE'],
        [opcodeToken.raw],
      );
    }

    let positional = [];
    let named = {};
    let children = [];

    if (definition.mnemonic === 'CALL') {
      const fnToken = this.expect('WORD', null, ['function identifier']);
      const fnIdent = this.literal(fnToken);
      const args = [];
      for (;;) {
        const peek = this.peekInline();
        if (peek.kind === 'RPAREN' || peek.kind === 'EOF' || peek.kind === 'NEWLINE') break;
        args.push(this.parseExpression());
      }
      const callCloseToken = this.expect('RPAREN', ')', [')']);
      return {
        kind: 'CallExpression',
        opcode: 'CALL',
        fn: fnIdent,
        positional: [fnIdent, ...args],
        args,
        named: { FN: fnIdent },
        children: [fnIdent, ...args],
        span: nodeSpan(openToken, callCloseToken),
      };
    }

    if (definition.mnemonic === 'RANGE') {
      const peek = this.peekInline();
      if (peek.kind !== 'WORD' || (peek.raw !== 'START' && peek.raw !== 'FROM')) {
        const start = this.parseExpression();
        const end = this.parseExpression();
        let step = null;
        if (this.peekInline().kind !== 'RPAREN') {
          step = this.parseExpression();
        }
        const rangeCloseToken = this.expect('RPAREN', ')', [')']);
        return {
          kind: 'CallExpression',
          opcode: 'RANGE',
          positional: step ? [start, end, step] : [start, end],
          named: { START: start, END: end, ...(step ? { STEP: step } : {}) },
          children: step ? [start, end, step] : [start, end],
          span: nodeSpan(openToken, rangeCloseToken),
        };
      }
    }

    if (POSITIONAL_EXPRESSIONS.has(definition.mnemonic)) {
      positional = this.parsePositionalOperands(definition);
      children = [...positional];
    } else if (NAMED_EXPRESSIONS.has(definition.mnemonic)) {
      const parsedNamed = this.parseNamedOperands(definition);
      named = parsedNamed.named;
      children = parsedNamed.children;
      positional = parsedNamed.positional || [];
    }


    const closeToken = this.expect('RPAREN', ')', [')']);
    return {
      kind: 'CallExpression',
      opcode: definition.mnemonic,
      positional,
      named,
      children,
      span: nodeSpan(openToken, closeToken),
    };
  }

  parsePositionalOperands(definition) {
    const positional = [];
    for (const operand of definition.operands) {
      const token = this.peekInline();
      if (token.kind === 'RPAREN' || token.kind === 'NEWLINE' || token.kind === 'EOF') {
        this.diagnostic(
          PARSE_CODES.MISSING_OPERAND,
          `${definition.mnemonic} is missing required ${operand.name} operand.`,
          token,
          [`${operand.name} ${operand.type}`],
        );
        continue;
      }
      positional.push(this.parseExpression());
    }
    return positional;
  }

  parseNamedOperands(definition) {
    const allowed = new Map(definition.operands.map((operand) => [operand.name, operand]));
    const encountered = new Set();
    const named = {};
    const positional = [];
    const children = [];

    const OPERAND_ALIASES = {
      NOISE_2D: { COORD: 'AT', SCALE: 'FREQUENCY' },
    };
    const aliases = OPERAND_ALIASES[definition.mnemonic] || {};

    const firstOp = definition.operands[0];
    const initialPeek = this.peekInline();
    if (
      firstOp &&
      ALLOWS_LEADING_POSITIONAL.has(definition.mnemonic) &&
      initialPeek.kind !== 'RPAREN' &&
      initialPeek.kind !== 'NEWLINE' &&
      initialPeek.kind !== 'EOF' &&
      (initialPeek.kind === 'SYMBOL' || initialPeek.kind === 'LPAREN')
    ) {
      const val = this.parseExpression();
      named[firstOp.name] = val;
      positional.push(val);
      children.push(val);
      encountered.add(firstOp.name);
    }

    for (;;) {
      const nameToken = this.peekInline();
      if (nameToken.kind === 'RPAREN' || nameToken.kind === 'NEWLINE' || nameToken.kind === 'EOF') break;
      if (nameToken.kind !== 'WORD') {
        this.abort(
          PARSE_CODES.EXPECTED_TOKEN,
          `Expected a named operand for ${definition.mnemonic}.`,
          nameToken,
          [...allowed.keys()],
        );
      }
      this.take();
      const canonName = aliases[nameToken.raw] || nameToken.raw;
      const operand = allowed.get(canonName);
      if (!operand) {
        this.diagnostic(
          PARSE_CODES.UNKNOWN_OPERAND,
          `Unknown ${definition.mnemonic} operand ${JSON.stringify(nameToken.raw)}.`,
          nameToken,
          [...allowed.keys()],
          [nameToken.raw],
        );
      } else if (encountered.has(operand.name)) {
        this.diagnostic(
          PARSE_CODES.DUPLICATE_OPERAND,
          `Duplicate ${definition.mnemonic} operand ${operand.name}.`,
          nameToken,
          [`one ${operand.name} operand`],
          [operand.name],
        );
      } else {
        encountered.add(operand.name);
      }

      const valueToken = this.peekInline();
      if (valueToken.kind === 'RPAREN' || valueToken.kind === 'NEWLINE' || valueToken.kind === 'EOF') {
        this.diagnostic(
          PARSE_CODES.MISSING_OPERAND,
          `${definition.mnemonic} operand ${nameToken.raw} is missing its value.`,
          valueToken,
          [operand ? `${operand.name} ${operand.type}` : 'expression'],
        );
        break;
      }
      const value = this.parseExpression();
      children.push(value);
      if (operand && named[operand.name] === undefined) named[operand.name] = value;
    }

    for (const operand of definition.operands) {
      if (operand.required && !encountered.has(operand.name)) {
        this.diagnostic(
          PARSE_CODES.MISSING_OPERAND,
          `${definition.mnemonic} is missing required ${operand.name} operand.`,
          this.peekInline(),
          [`${operand.name} ${operand.type}`],
        );
      }
    }

    return { named, positional, children };
  }

  literal(token) {
    const literalKind = token.kind === 'WORD' ? 'IDENT' : token.kind;
    let value = token.value;
    if (token.kind === 'INTEGER' || token.kind === 'DECIMAL') value = Number(token.raw);
    return {
      kind: 'Literal',
      literalKind,
      raw: token.raw,
      value,
      span: token.span,
    };
  }
}

export function parseSCDLV2(source) {
  const lexical = tokenizeSCDLV2(source);
  const parser = new Parser(lexical.tokens);
  const candidateAst = parser.parseProgram();
  const diagnostics = Object.freeze([...lexical.diagnostics, ...parser.diagnostics]);
  const ok = !diagnostics.some((diagnostic) => diagnostic.isError());
  const cst = Object.freeze({
    kind: 'ProgramCST',
    source: lexical.source,
    tokens: lexical.tokens,
    span: candidateAst.span,
  });
  return Object.freeze({
    ok,
    cst,
    ast: ok ? deepFreeze(candidateAst) : null,
    diagnostics,
  });
}
