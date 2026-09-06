# SCDL v2 Semantic-Core Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first usable SCDL v2 compiler slice: explicit version routing, strict AI-parseable syntax, typed exact mathematics, immutable pixel/circle construction, ordered painting, canonical bytecode, bounded evaluation, and real PixelBrain packet emission without changing any v1/v1.2 output.

**Architecture:** Preserve `compileSCDL(source, options)` as the public seam and route only sources whose first significant declaration is exactly `SCDL 2` into a new `scdl/v2/` pipeline. The v2 pipeline is split into lossless syntax, semantic analysis, canonical lowering, bounded evaluation, rasterization, and packet emission; failures carry structured diagnostics and cannot expose bytecode or packets. The existing v1/v1.2 compiler body stays in place as `compileLegacySCDL`, so the compatibility proof is a direct before/after differential rather than a reimplementation.

**Tech Stack:** Node.js 20 ESM, JavaScript with JSDoc contracts, Vitest 4, existing `PixelBrainAssetPacket` factory, existing deterministic `hashString`, existing SCDL CLI/exporters.

**Spec:** `docs/superpowers/specs/2026-09-06-scdl-v2-ai-native-pixel-language-design.md`

## Global Constraints

- `SCDL 2` selects the v2 compiler; every other source selects the frozen v1/v1.2 compiler. No heuristic version detection is allowed.
- SCDL v2 is compile-time only. No SCDL source evaluator may ship into a game or browser runtime.
- AI agents author textual SCDL only. JSON AST and SCDL-BC-v2 are compiler outputs, not alternate source inputs.
- Public compiler calls never throw. Invalid input returns diagnostics and `packet: null`; no partial packet, bytecode, export, or cache may escape.
- v2 statements are uppercase opcode-first; expressions are parenthesized prefix forms; required non-positional operands are named.
- Values and shapes are immutable. Construction does not paint; only `PAINT` adds a shape to an ordered layer.
- `PX` is distinct from unitless numeric types. No truthiness or implicit type conversion is permitted.
- Fractional values use exact reduced rationals. Floating-point arithmetic may not decide lattice membership or program identity.
- Canonical SCDL-BC-v2 is emitted before evaluation and is the authority for v2 program identity.
- Comments, whitespace, line endings, and local `$symbol` spelling do not change canonical bytecode or program identity.
- v2 core control flow is structured and bounded; this milestone contains no loops, recursion, imports, I/O, clock access, network access, random globals, or dynamic evaluation.
- Default protected limits are exactly `INSTRUCTIONS 200000`, `GENERATED_SHAPES 10000`, and `RASTER_CELLS 1048576` for this milestone. Source may lower them but may not raise them above host limits.
- Rasterization uses explicit `CENTER` or `MIDPOINT` policy, integer canvas coordinates, deterministic clipping, and no anti-aliasing.
- Every opcode has a permanent numeric ID and one registry entry containing mnemonic, scope, operands, result type, purity, cost, capability, semantic version, and documentation.
- Current v1/v1.2 tests must stay green and every frozen legacy fixture/frame packet ID must remain byte-identical.
- This milestone does not implement sequences, Fibonacci, functions, animation, imports, RNG/noise, masks, booleans, transforms, or AMP execution. Those remain separate subprojects in the approved design.

---

## Supported Milestone Source Contract

The implementation in this plan accepts this complete, deliberately small v2 surface:

```scdl
SCDL 2
ASSET exact_orb
CANVAS WIDTH 9 HEIGHT 9
BUDGET INSTRUCTIONS 128 GENERATED_SHAPES 2 RASTER_CELLS 81

CONST $two I32 (ADD 1 1)
CONST $center VEC2 (VEC2 (PX 4) (PX 4))
CONST $ink COLOR #55CCFF
SHAPE $spark (PIXEL AT (VEC2 (PX 1) (PX 1)))
SHAPE $orb (CIRCLE CENTER $center RADIUS (PX $two))

LAYER ink ORDER 10 {
  PAINT $orb FILL $ink RASTER MIDPOINT
  PAINT $spark FILL #FFFFFF RASTER CENTER
}
```

The statement opcodes are `SCDL`, `ASSET`, `CANVAS`, `BUDGET`, `CONST`, `SHAPE`, `LAYER`, and `PAINT`. The expression opcodes are `ADD`, `SUB`, `MUL`, `DIV`, `PX`, `VEC2`, `PIXEL`, and `CIRCLE`. Literals are signed base-10 integers, exact base-10 decimals, `#RRGGBB`/`#RRGGBBAA` colors, bare identifiers, enum words, and `$symbols`. A successful program emits all declared layers sorted by ascending `ORDER`, with source order breaking ties.

## Frozen Public Result Contract

Every v2 `compileSCDL()` result has this shape, while legacy results retain their current shape and values:

```js
{
  contract: 'SCDL-COMPILE-RESULT-v2',
  ok: Boolean,
  languageVersion: 2,
  compilerVersion: '2.0.0',
  cst: Object | null,
  ast: Object | null,
  analysis: Object | null,
  bytecode: Object | null,
  package: Object | null,
  packet: PixelBrainAssetPacket | null,
  framePackets: readonly PixelBrainAssetPacket[],
  frameLoop: null,
  errors: readonly SCDLV2Diagnostic[],
  diagnostics: readonly Object[],
  diagnosticReport: {
    contract: 'SCDL-DIAGNOSTICS-v2',
    ok: Boolean,
    languageVersion: 2,
    compilerVersion: '2.0.0',
    diagnostics: readonly Object[],
  },
  regressionSeed: {
    source: String,
    options: Object,
    checksum: String | null,
  },
}
```

`errors` retains methods required by the current CLI (`isError()`, `isWarn()`, `isInfo()`, `toJSON()`). `diagnostics` is the JSON-safe entry list; `diagnosticReport` wraps the same entries in the `SCDL-DIAGNOSTICS-v2` machine contract. If `ok` is false, `bytecode`, `package`, `packet`, and `analysis` are null and `framePackets` is frozen empty.

## File Map

| File | Responsibility |
|---|---|
| `codex/core/pixelbrain/scdl/v2/scdl-v2.version.js` | Exact header detection only; no parsing heuristics |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.diagnostics.js` | v2 diagnostic class, stable codes, spans, JSON envelope |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.tokenizer.js` | Lossless tokens, trivia, offsets, line/column spans |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.opcodes.js` | Frozen milestone opcode registry and lookup helpers |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.parser.js` | Recoverable CST plus strict milestone AST |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.formatter.js` | One canonical textual spelling for parsed v2 source |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.rational.js` | Reduced BigInt rational arithmetic and canonical decimal parsing |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.types.js` | Closed milestone types and expression type rules |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.analyzer.js` | Declaration binding, unit checking, constant evaluation, resolved IR |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.budget.js` | Protected limits, static cost accounting, pre-evaluation rejection |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.bytecode.js` | Deterministic SSA-like lowering, text encoding, debug map, program hash |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.evaluator.js` | Bounded interpreter from canonical instruction objects to immutable construction IR |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.raster.js` | Pixel and filled-circle rasterization plus ordered layer compositing |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.emit.js` | Real `PixelBrainAssetPacket` and immutable v2 package construction |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.compiler.js` | Never-throw v2 pass orchestration and failure gating |
| `codex/core/pixelbrain/scdl/scdl.compiler.js` | Minimal public version router around the unchanged legacy body |
| `codex/core/pixelbrain/scdl/index.js` | Export v2 inspection/formatting APIs without changing legacy exports |
| `codex/core/pixelbrain/scdl/scdl.diagnostics.js` | Preserve v1 bridge and recognize v2 diagnostic envelopes |
| `codex/core/pixelbrain/scdl/scdl.cli.js` | Route `parse`, `check`, `compile`, `preview`; add canonical `format` command |
| `codex/core/pixelbrain/scdl/fixtures/v2/exact-orb.scdl` | Checked-in end-to-end v2 fixture |
| `tests/codex/core/pixelbrain/scdl/scdl-v2.*.test.js` | Focused v2 unit, differential, fuzz, CLI, and golden tests |
| `docs/scholomance-encyclopedia/Scholomance White Papers/SCDL_COMPILER_WHITE_PAPER.md` | Mark only demonstrated milestone behavior as implemented |
| `docs/scholomance-encyclopedia/Scholomance White Papers/SCDL_AUTHORING_GUIDE.md` | Agent-facing v2 syntax, repair loop, and exact CLI examples |

### Task 1: Exact Version Detection Without Touching Legacy Compilation

**Files:**
- Create: `codex/core/pixelbrain/scdl/v2/scdl-v2.version.js`
- Create: `tests/codex/core/pixelbrain/scdl/scdl-v2.version.test.js`

**Interfaces:**
- Consumes: raw `unknown` source input.
- Produces: `detectSCDLVersion(source: unknown): 1 | 2` and `SCDL_V2_HEADER = 'SCDL 2'`.

- [ ] **Step 1: Write the failing version-law tests**

```js
import { describe, expect, it } from 'vitest';
import { detectSCDLVersion } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.version.js';

describe('SCDL v2 explicit version law', () => {
  it('selects v2 only when the first significant declaration is exactly SCDL 2', () => {
    expect(detectSCDLVersion('\uFEFF\n# agent note\n  SCDL 2  \nASSET x')).toBe(2);
  });

  it.each([
    ['legacy source', 'asset x canvas 1x1'],
    ['unsupported version', 'SCDL 3\nASSET x'],
    ['near match', 'SCDL 2 extra\nASSET x'],
    ['wrong case', 'scdl 2\nASSET x'],
    ['non-string', null],
  ])('routes %s to legacy', (_label, source) => {
    expect(detectSCDLVersion(source)).toBe(1);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm the module is absent**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.version.test.js`

Expected: FAIL with a module-resolution error naming `scdl-v2.version.js`.

- [ ] **Step 3: Implement the exact detector**

```js
export const SCDL_V2_HEADER = 'SCDL 2';

export function detectSCDLVersion(source) {
  const text = typeof source === 'string' ? source.replace(/^\uFEFF/, '') : '';
  for (const line of text.split(/\r?\n/)) {
    const significant = line.trim();
    if (significant === '' || significant.startsWith('#')) continue;
    return significant === SCDL_V2_HEADER ? 2 : 1;
  }
  return 1;
}
```

- [ ] **Step 4: Run the test and commit the isolated detector**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.version.test.js`

Expected: PASS, 5 cases.

```bash
git add codex/core/pixelbrain/scdl/v2/scdl-v2.version.js tests/codex/core/pixelbrain/scdl/scdl-v2.version.test.js
git commit -m "feat(scdl): add explicit v2 version detection"
```

### Task 2: Structured Diagnostics and Lossless Tokenization

**Files:**
- Create: `codex/core/pixelbrain/scdl/v2/scdl-v2.diagnostics.js`
- Create: `codex/core/pixelbrain/scdl/v2/scdl-v2.tokenizer.js`
- Create: `tests/codex/core/pixelbrain/scdl/scdl-v2.tokenizer.test.js`

**Interfaces:**
- Consumes: raw source text.
- Produces: `span(start, end)`, `v2Diagnostic(fields)`, `diagnosticEnvelope(diagnostics)`, and `tokenizeSCDLV2(source): { ok, source, tokens, diagnostics }`.
- Token shape: `{ kind, raw, value, span: { start: { line, column, offset }, end: ... } }`.

- [ ] **Step 1: Write tests for trivia preservation, exact spans, literals, and illegal input**

```js
import { describe, expect, it } from 'vitest';
import { tokenizeSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.tokenizer.js';

describe('SCDL v2 tokenizer', () => {
  it('preserves comments/newlines and tokenizes typed source losslessly', () => {
    const source = 'SCDL 2\r\n# note\r\nCONST $x PX (PX -1.25)\nCONST $c COLOR #Aa00Ff80\n';
    const result = tokenizeSCDLV2(source);
    expect(result.ok).toBe(true);
    expect(result.tokens.map((token) => token.raw).join('')).toBe(source);
    expect(result.tokens.find((token) => token.kind === 'SYMBOL').value).toBe('$x');
    expect(result.tokens.find((token) => token.kind === 'DECIMAL').value).toBe('-1.25');
    expect(result.tokens.find((token) => token.kind === 'COLOR').value).toBe('#AA00FF80');
  });

  it('reports the exact illegal character and keeps scanning', () => {
    const result = tokenizeSCDLV2('SCDL 2\nCONST $x I32 1 @ CONST $y I32 2\n');
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0].code).toBe('SCDL-LEX-001');
    expect(result.diagnostics[0].span.start).toMatchObject({ line: 2, column: 16 });
    expect(result.tokens.some((token) => token.value === '$y')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tokenizer test and verify the import failure**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.tokenizer.test.js`

Expected: FAIL because `scdl-v2.tokenizer.js` does not exist.

- [ ] **Step 3: Implement the diagnostic contract first**

```js
export const SCDL_V2_DIAGNOSTICS_CONTRACT = 'SCDL-DIAGNOSTICS-v2';

export class SCDLV2Diagnostic {
  constructor({ code, severity = 'ERROR', phase, message, span, instructionPath = [], expected = [], received = [], relatedSymbols = [], fixes = [] }) {
    this.code = String(code);
    this.label = this.code;
    this.severity = severity;
    this.phase = phase;
    this.message = String(message);
    this.span = span;
    this.loc = { line: span.start.line, col: span.start.column };
    this.instructionPath = Object.freeze([...instructionPath]);
    this.expected = Object.freeze([...expected]);
    this.received = Object.freeze([...received]);
    this.relatedSymbols = Object.freeze([...relatedSymbols]);
    this.fixes = Object.freeze(fixes.map((fix) => Object.freeze({ ...fix })));
    this.bytecodeString = null;
    Object.freeze(this);
  }
  isError() { return this.severity === 'ERROR'; }
  isWarn() { return this.severity === 'WARN'; }
  isInfo() { return this.severity === 'INFO'; }
  toJSON() {
    return {
      code: this.code, severity: this.severity, phase: this.phase, message: this.message,
      span: this.span, instructionPath: this.instructionPath, expected: this.expected,
      received: this.received, relatedSymbols: this.relatedSymbols, fixes: this.fixes,
    };
  }
}

export function v2Diagnostic(fields) {
  return new SCDLV2Diagnostic(fields);
}

export function diagnosticEnvelope(diagnostics) {
  return Object.freeze({
    contract: SCDL_V2_DIAGNOSTICS_CONTRACT,
    ok: !diagnostics.some((item) => item.isError()),
    languageVersion: 2,
    compilerVersion: '2.0.0',
    diagnostics: Object.freeze(diagnostics.map((item) => Object.freeze(item.toJSON()))),
  });
}
```

- [ ] **Step 4: Implement a cursor tokenizer that emits every source byte**

Use one cursor carrying `{ offset, line, column }`. Emit whitespace as `WHITESPACE`, CRLF/LF as `NEWLINE`, non-color `#...` text as `COMMENT`, and finish with a zero-width `EOF`. Recognize color before comment so `#AABBCC` cannot be swallowed as trivia. Use these exact token kinds:

```js
export const TOKEN_KINDS = Object.freeze([
  'WORD', 'SYMBOL', 'INTEGER', 'DECIMAL', 'COLOR',
  'LBRACE', 'RBRACE', 'LPAREN', 'RPAREN', 'LBRACKET', 'RBRACKET', 'COMMA',
  'WHITESPACE', 'NEWLINE', 'COMMENT', 'INVALID', 'EOF',
]);

export function tokenizeSCDLV2(source) {
  const text = typeof source === 'string' ? source : '';
  const tokens = [];
  const diagnostics = [];
  // The scanning loop must always advance by at least one UTF-16 code unit.
  // Match CRLF as one NEWLINE token while advancing offset by two.
  // Normalize only token.value for COLOR; token.raw remains byte-for-byte source.
  return Object.freeze({
    ok: diagnostics.length === 0,
    source: text,
    tokens: Object.freeze(tokens),
    diagnostics: Object.freeze(diagnostics),
  });
}
```

Implement the loop directly; do not use a single global regular expression because line/column recovery and guaranteed progress are part of the contract. The `INVALID` branch emits `SCDL-LEX-001`, records expected lexical forms, advances once, and continues.

- [ ] **Step 5: Run focused tests and add a non-string never-throw assertion**

Add:

```js
it.each([null, undefined, 42, {}, []])('never throws for %j', (source) => {
  expect(() => tokenizeSCDLV2(source)).not.toThrow();
  expect(tokenizeSCDLV2(source).source).toBe('');
});
```

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.tokenizer.test.js`

Expected: PASS.

- [ ] **Step 6: Commit diagnostics and tokenization together**

```bash
git add codex/core/pixelbrain/scdl/v2/scdl-v2.diagnostics.js codex/core/pixelbrain/scdl/v2/scdl-v2.tokenizer.js tests/codex/core/pixelbrain/scdl/scdl-v2.tokenizer.test.js
git commit -m "feat(scdl): add v2 diagnostics and lossless tokenizer"
```

### Task 3: Opcode Registry and Recoverable Parser

**Files:**
- Create: `codex/core/pixelbrain/scdl/v2/scdl-v2.opcodes.js`
- Create: `codex/core/pixelbrain/scdl/v2/scdl-v2.parser.js`
- Create: `tests/codex/core/pixelbrain/scdl/scdl-v2.parser.test.js`

**Interfaces:**
- Consumes: `tokenizeSCDLV2(source)` and registry metadata.
- Produces: `getSCDLV2Opcode(mnemonic)`, `listSCDLV2Opcodes()`, and `parseSCDLV2(source): { ok, cst, ast, diagnostics }`.
- AST nodes all carry `kind`, `opcode`, `span`, and source-ordered child arrays. Expressions are `Literal`, `SymbolRef`, or `CallExpression`.

- [ ] **Step 1: Write parser tests for the accepted grammar and independent recovery**

```js
import { describe, expect, it } from 'vitest';
import { parseSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.parser.js';
import { listSCDLV2Opcodes } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.opcodes.js';

const VALID = `SCDL 2
ASSET exact_orb
CANVAS WIDTH 9 HEIGHT 9
CONST $two I32 (ADD 1 1)
CONST $center VEC2 (VEC2 (PX 4) (PX 4))
CONST $ink COLOR #55CCFF
SHAPE $orb (CIRCLE CENTER $center RADIUS (PX $two))
LAYER ink ORDER 10 {
  PAINT $orb FILL $ink RASTER MIDPOINT
}`;

describe('SCDL v2 parser', () => {
  it('builds a lossless CST and strict AST', () => {
    const result = parseSCDLV2(VALID);
    expect(result.ok).toBe(true);
    expect(result.cst.tokens.map((token) => token.raw).join('')).toBe(VALID);
    expect(result.ast.declarations.map((node) => node.kind)).toEqual([
      'VersionDeclaration', 'AssetDeclaration', 'CanvasDeclaration',
      'ConstDeclaration', 'ConstDeclaration', 'ConstDeclaration',
      'ShapeDeclaration', 'LayerDeclaration',
    ]);
    expect(Object.isFrozen(result.ast)).toBe(true);
  });

  it('reports a missing named operand without inventing a radius', () => {
    const result = parseSCDLV2(VALID.replace(' RADIUS (PX $two)', ''));
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'SCDL-PARSE-004' && d.expected.includes('RADIUS PX'))).toBe(true);
    expect(result.ast).toBeNull();
  });

  it('synchronizes at newline/block boundaries and reports two unknown statements', () => {
    const source = VALID.replace('CONST $two', 'WOBBLE $bad\nCONST $two').replace('CONST $ink', 'SPARKLE $bad\nCONST $ink');
    const result = parseSCDLV2(source);
    expect(result.diagnostics.filter((d) => d.code === 'SCDL-PARSE-001')).toHaveLength(2);
  });

  it('registry IDs are unique and metadata-complete', () => {
    const rows = listSCDLV2Opcodes();
    expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
    for (const row of rows) {
      expect(row).toEqual(expect.objectContaining({ mnemonic: expect.any(String), scope: expect.any(Array), operands: expect.any(Array), purity: expect.any(String), cost: expect.any(Number), capability: expect.any(String), version: expect.any(String), docs: expect.any(String) }));
    }
  });
});
```

- [ ] **Step 2: Run the parser test and verify it fails at module resolution**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.parser.test.js`

Expected: FAIL because parser/registry modules are absent.

- [ ] **Step 3: Create the frozen opcode registry**

Define these permanent IDs and never derive IDs from array position:

```js
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
```

Map each tuple to an object whose operands are `{ name, type, required }`; set every definition to `capability: 'CORE.MATH@2.0'`, `'GEOMETRY.STANDARD@2.0'`, or `'PAINT.LAYERS@2.0'` as appropriate, `version: '2.0.0'`, `cost: 1`, and a non-empty literal `docs` string. Freeze rows, operands, scopes, and the returned list.

- [ ] **Step 4: Implement parser cursor and exact grammar**

The parser must skip `WHITESPACE` and `COMMENT` on demand, retain `NEWLINE` tokens in its syntax cursor for recovery, and preserve the full token array in `cst`. It must enforce one `SCDL 2`, one `ASSET`, one `CANVAS`, declaration-before-use later in analysis, brace-balanced layers, and registry-known source opcodes. `SCDL-PARSE-003` applies to duplicate structural declarations (`SCDL`, `ASSET`, `CANVAS`, or `BUDGET`); repeated `$symbols` remain valid syntax and are rejected later as `SCDL-BIND-002`. Registry entries scoped only to `BYTECODE` are illegal in source. Use these expression shapes:

```js
{ kind: 'Literal', literalKind: 'INTEGER' | 'DECIMAL' | 'COLOR' | 'IDENT', raw, value, span }
{ kind: 'SymbolRef', name: '$center', span }
{ kind: 'CallExpression', opcode: 'CIRCLE', positional: [], named: { CENTER: expr, RADIUS: expr }, span }
```

`ADD`, `SUB`, `MUL`, `DIV`, `PX`, and `VEC2` consume their registry operands positionally. `PIXEL` and `CIRCLE` consume named operands and reject a duplicate, unknown, or absent name. `PAINT` consumes one positional shape expression/reference followed by exactly `FILL <expr> RASTER <CENTER|MIDPOINT>`. On an unsafe statement error, advance to the next top-level newline or the current block's `}`. Use these stable parser codes:

```js
export const PARSE_CODES = Object.freeze({
  UNKNOWN_OPCODE: 'SCDL-PARSE-001',
  EXPECTED_TOKEN: 'SCDL-PARSE-002',
  DUPLICATE_DECLARATION: 'SCDL-PARSE-003',
  MISSING_OPERAND: 'SCDL-PARSE-004',
  DUPLICATE_OPERAND: 'SCDL-PARSE-005',
  UNKNOWN_OPERAND: 'SCDL-PARSE-006',
  UNBALANCED_BLOCK: 'SCDL-PARSE-007',
});
```

Freeze successful AST nodes recursively. When any lexical or parse `ERROR` exists, return `ast: null`; retain `cst` and all safe diagnostics.

- [ ] **Step 5: Run parser and tokenizer tests together**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.tokenizer.test.js tests/codex/core/pixelbrain/scdl/scdl-v2.parser.test.js`

Expected: PASS.

- [ ] **Step 6: Commit the syntax layer**

```bash
git add codex/core/pixelbrain/scdl/v2/scdl-v2.opcodes.js codex/core/pixelbrain/scdl/v2/scdl-v2.parser.js tests/codex/core/pixelbrain/scdl/scdl-v2.parser.test.js
git commit -m "feat(scdl): parse the strict v2 semantic core"
```

### Task 4: Canonical Formatter and Syntax Identity

**Files:**
- Create: `codex/core/pixelbrain/scdl/v2/scdl-v2.formatter.js`
- Create: `tests/codex/core/pixelbrain/scdl/scdl-v2.formatter.test.js`

**Interfaces:**
- Consumes: source text or a successful v2 AST.
- Produces: `formatSCDLV2(input): { ok, output, ast, diagnostics }`.
- Canonical rules: LF endings, uppercase opcodes/types/enums, lowercase hex, two-space layer indentation, one blank line between header and declarations and between bindings and layers, final newline, no comments.

- [ ] **Step 1: Write format/idempotence tests**

```js
import { describe, expect, it } from 'vitest';
import { formatSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.formatter.js';

describe('SCDL v2 canonical formatter', () => {
  it('canonicalizes trivia, color case, and indentation', () => {
    const source = `SCDL 2\r\n# ignored\r\nASSET orb\r\nCANVAS WIDTH 5 HEIGHT 5\r\nCONST $c COLOR #AAbbCC\r\nSHAPE $p (PIXEL AT (VEC2 (PX 1) (PX 2)))\r\nLAYER ink ORDER 1 {\r\n PAINT $p FILL $c RASTER CENTER\r\n}\r\n`;
    const result = formatSCDLV2(source);
    expect(result.ok).toBe(true);
    expect(result.output).toBe(`SCDL 2
ASSET orb
CANVAS WIDTH 5 HEIGHT 5

CONST $c COLOR #aabbcc
SHAPE $p (PIXEL AT (VEC2 (PX 1) (PX 2)))

LAYER ink ORDER 1 {
  PAINT $p FILL $c RASTER CENTER
}
`);
  });

  it('is idempotent and preserves the parsed program', () => {
    const once = formatSCDLV2('SCDL 2\nASSET x\nCANVAS WIDTH 1 HEIGHT 1\nSHAPE $p (PIXEL AT (VEC2 (PX 0) (PX 0)))\nLAYER a ORDER 0 { PAINT $p FILL #FFFFFF RASTER CENTER }');
    const twice = formatSCDLV2(once.output);
    expect(twice.output).toBe(once.output);
    expect(twice.ast).toEqual(once.ast);
  });

  it('does not manufacture output from invalid source', () => {
    const result = formatSCDLV2('SCDL 2\nASSET x\nCANVAS WIDTH 1 HEIGHT 1\nSHAPE $p (CIRCLE CENTER (VEC2 (PX 0) (PX 0)))');
    expect(result.ok).toBe(false);
    expect(result.output).toBeNull();
  });
});
```

- [ ] **Step 2: Run the formatter test and verify it fails at module resolution**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.formatter.test.js`

Expected: FAIL because the formatter module is absent.

- [ ] **Step 3: Implement a pure AST printer**

```js
import { parseSCDLV2 } from './scdl-v2.parser.js';

export function formatSCDLV2(input) {
  const parsed = typeof input === 'string'
    ? parseSCDLV2(input)
    : { ok: Boolean(input), ast: input, diagnostics: [] };
  if (!parsed.ok || !parsed.ast) {
    return Object.freeze({ ok: false, output: null, ast: null, diagnostics: parsed.diagnostics });
  }
  const output = printProgram(parsed.ast);
  return Object.freeze({ ok: true, output, ast: parsed.ast, diagnostics: Object.freeze([]) });
}
```

Implement `printExpression` from the AST shape, using registry operand order for named expressions. Canonicalize integer spelling by removing leading zeroes and mapping `-0` to `0`. Canonicalize decimals by removing integer leading zeroes and fractional trailing zeroes while retaining at least one fractional digit (`001.2500` -> `1.25`, `1.000` -> `1.0`, `-0.0` -> `0.0`), so a `FIXED` literal never turns into an `I32` literal. Print colors lowercase. Print declarations in authored order; formatting is not allowed to reorder semantic statements.

```js
function canonicalInteger(raw) {
  const value = BigInt(raw);
  return value === 0n ? '0' : value.toString(10);
}

function canonicalDecimal(raw) {
  const negative = raw.startsWith('-');
  const [wholeRaw, fractionRaw] = (negative ? raw.slice(1) : raw).split('.');
  const whole = BigInt(wholeRaw).toString(10);
  const fraction = fractionRaw.replace(/0+$/, '') || '0';
  const isZero = whole === '0' && fraction === '0';
  return `${negative && !isZero ? '-' : ''}${whole}.${fraction}`;
}
```

- [ ] **Step 4: Run formatter and parser tests**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.formatter.test.js tests/codex/core/pixelbrain/scdl/scdl-v2.parser.test.js`

Expected: PASS.

- [ ] **Step 5: Commit canonical formatting**

```bash
git add codex/core/pixelbrain/scdl/v2/scdl-v2.formatter.js tests/codex/core/pixelbrain/scdl/scdl-v2.formatter.test.js
git commit -m "feat(scdl): add canonical v2 formatter"
```

### Task 5: Exact Rational Math, Binding, and Unit Types

**Files:**
- Create: `codex/core/pixelbrain/scdl/v2/scdl-v2.rational.js`
- Create: `codex/core/pixelbrain/scdl/v2/scdl-v2.types.js`
- Create: `codex/core/pixelbrain/scdl/v2/scdl-v2.analyzer.js`
- Create: `tests/codex/core/pixelbrain/scdl/scdl-v2.analyzer.test.js`

**Interfaces:**
- Consumes: successful parsed AST.
- Produces: rational helpers, `SCDL_V2_TYPES`, `analyzeSCDLV2(ast): { ok, ir, symbols, diagnostics }`.
- Resolved value shape: `{ type, value }`; public rational value shape: `{ numerator: string, denominator: string }` with a positive denominator and reduced base-10 integer strings. Arithmetic converts those strings to local `BigInt`s so IR, diagnostics, bytecode, and packages remain JSON-safe.

- [ ] **Step 1: Write exact arithmetic, binding, and unit-failure tests**

```js
import { describe, expect, it } from 'vitest';
import { parseSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.parser.js';
import { analyzeSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.analyzer.js';
import { parseRational, rationalToString } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.rational.js';

function analyze(source) {
  const parsed = parseSCDLV2(source);
  expect(parsed.ok).toBe(true);
  return analyzeSCDLV2(parsed.ast);
}

const BASE = `SCDL 2
ASSET typed
CANVAS WIDTH 9 HEIGHT 9
CONST $two I32 (ADD 1 1)
CONST $center VEC2 (VEC2 (PX 4) (PX 4))
CONST $ink COLOR #55CCFF
SHAPE $orb (CIRCLE CENTER $center RADIUS (PX $two))
LAYER ink ORDER 10 { PAINT $orb FILL $ink RASTER MIDPOINT }`;

describe('SCDL v2 semantic analysis', () => {
  it('reduces exact decimal and division values', () => {
    expect(rationalToString(parseRational('1.250'))).toBe('5/4');
    expect(rationalToString(parseRational('-0.125'))).toBe('-1/8');
  });

  it('binds declarations before use and evaluates prefix math', () => {
    const result = analyze(BASE);
    expect(result.ok).toBe(true);
    expect(result.symbols.get('$two')).toEqual({ type: 'I32', value: 2 });
    expect(result.ir.shapes[0].value).toMatchObject({ kind: 'CIRCLE', radius: { type: 'PX' } });
  });

  it('rejects an unknown symbol at bind phase', () => {
    const result = analyze(BASE.replace('$two))', '$missing))'));
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'SCDL-BIND-001' && d.relatedSymbols.includes('$missing'))).toBe(true);
  });

  it('rejects implicit I32-to-PX use', () => {
    const result = analyze(BASE.replace('RADIUS (PX $two)', 'RADIUS $two'));
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((d) => d.code === 'SCDL-TYPE-002' && d.expected.includes('PX') && d.received.includes('I32'))).toBe(true);
  });

  it('rejects duplicate symbols and use before declaration', () => {
    const duplicate = analyze(`${BASE}\nCONST $two I32 2`);
    expect(duplicate.diagnostics.some((d) => d.code === 'SCDL-BIND-002')).toBe(true);
    const early = analyze(BASE.replace('CONST $two I32 (ADD 1 1)\n', '').replace('LAYER ink', 'CONST $two I32 2\nLAYER ink'));
    expect(early.diagnostics.some((d) => d.code === 'SCDL-BIND-001')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the analyzer test and verify the import failure**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.analyzer.test.js`

Expected: FAIL because analyzer/rational modules are absent.

- [ ] **Step 3: Implement normalized BigInt rationals**

```js
export function makeRational(numerator, denominator = 1n) {
  if (denominator === 0n) throw new RangeError('rational denominator is zero');
  const sign = denominator < 0n ? -1n : 1n;
  const n = BigInt(numerator) * sign;
  const d = BigInt(denominator) * sign;
  const divisor = gcd(n < 0n ? -n : n, d);
  return Object.freeze({ numerator: (n / divisor).toString(10), denominator: (d / divisor).toString(10) });
}

export function parseRational(raw) {
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(String(raw));
  if (!match) throw new TypeError(`invalid exact decimal '${raw}'`);
  const fraction = match[3] || '';
  const scale = 10n ** BigInt(fraction.length);
  const magnitude = BigInt(match[2]) * scale + BigInt(fraction || '0');
  return makeRational(match[1] ? -magnitude : magnitude, scale);
}

export const addRational = (a, b) => makeRational(BigInt(a.numerator) * BigInt(b.denominator) + BigInt(b.numerator) * BigInt(a.denominator), BigInt(a.denominator) * BigInt(b.denominator));
export const subRational = (a, b) => makeRational(BigInt(a.numerator) * BigInt(b.denominator) - BigInt(b.numerator) * BigInt(a.denominator), BigInt(a.denominator) * BigInt(b.denominator));
export const mulRational = (a, b) => makeRational(BigInt(a.numerator) * BigInt(b.numerator), BigInt(a.denominator) * BigInt(b.denominator));
export const divRational = (a, b) => makeRational(BigInt(a.numerator) * BigInt(b.denominator), BigInt(a.denominator) * BigInt(b.numerator));
export const rationalToString = (value) => `${value.numerator}/${value.denominator}`;
export const isIntegralRational = (value) => value.denominator === '1';
```

Keep `gcd` private and iterative. Analyzer code catches `RangeError` from division and emits `SCDL-TYPE-004`; the exception never crosses a public phase boundary.

- [ ] **Step 4: Implement the closed type system and analyzer**

```js
export const SCDL_V2_TYPES = Object.freeze(['I32', 'U32', 'FIXED', 'RATIO', 'PX', 'COLOR', 'VEC2', 'SHAPE', 'LAYER']);

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
```

Apply these exact rules:

| Expression | Accepted operands | Result |
|---|---|---|
| integer literal | signed 32-bit | `I32` |
| decimal literal | exact decimal | `FIXED` |
| color literal | 6 or 8 hex digits | `COLOR` |
| `ADD`, `SUB` | same `I32`, `FIXED`, `RATIO`, or `PX` | same type |
| `MUL` | `I32×I32`, scalar×scalar, `PX×scalar`, scalar×`PX` | `I32`, `RATIO`, or `PX` |
| `DIV` | numeric ÷ nonzero scalar; `I32/I32` | `RATIO`; preserve `PX` numerator |
| `PX` | `I32`, `FIXED`, or `RATIO` | `PX` exact rational |
| `VEC2` | `PX`, `PX` | `VEC2` |
| `PIXEL` | named `AT VEC2` | immutable `SHAPE` descriptor |
| `CIRCLE` | named `CENTER VEC2`, `RADIUS PX` and radius >= 0 | immutable `SHAPE` descriptor |

`CONST` compares the declared type to the evaluated expression type exactly. `SHAPE` requires a `SHAPE` result. `PAINT` requires `SHAPE`, `COLOR`, and a valid raster enum. Symbols enter scope only after their declaration has analyzed successfully. Return a frozen IR with `{ assetId, canvas, requestedBudget, constants, shapes, layers }`; expose a detached `Map` snapshot as `symbols` only in the analysis result so caller mutation cannot affect the frozen IR.

- [ ] **Step 5: Run analyzer, parser, and formatter tests**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.analyzer.test.js tests/codex/core/pixelbrain/scdl/scdl-v2.parser.test.js tests/codex/core/pixelbrain/scdl/scdl-v2.formatter.test.js`

Expected: PASS.

- [ ] **Step 6: Commit semantic analysis**

```bash
git add codex/core/pixelbrain/scdl/v2/scdl-v2.rational.js codex/core/pixelbrain/scdl/v2/scdl-v2.types.js codex/core/pixelbrain/scdl/v2/scdl-v2.analyzer.js tests/codex/core/pixelbrain/scdl/scdl-v2.analyzer.test.js
git commit -m "feat(scdl): add exact typed v2 analysis"
```

### Task 6: Static Budgets and Canonical Register Bytecode

**Files:**
- Create: `codex/core/pixelbrain/scdl/v2/scdl-v2.budget.js`
- Create: `codex/core/pixelbrain/scdl/v2/scdl-v2.bytecode.js`
- Create: `tests/codex/core/pixelbrain/scdl/scdl-v2.bytecode.test.js`

**Interfaces:**
- Consumes: successful resolved IR and optional `options.limits`.
- Produces: `verifySCDLV2Budget(ir, options)`, `lowerSCDLV2Bytecode(ir, verifiedBudget)`, and immutable `SCDL-BC-v2` program.
- Bytecode program fields: `{ contract, language, semanticsVersion, programId, canvas, capabilities, algorithms, verifiedBudget, constants, instructions, text, debugMap }`.

- [ ] **Step 1: Write budget-before-lowering and semantic-identity tests**

```js
import { describe, expect, it } from 'vitest';
import { parseSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.parser.js';
import { analyzeSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.analyzer.js';
import { verifySCDLV2Budget } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.budget.js';
import { lowerSCDLV2Bytecode } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.bytecode.js';

function lower(source, options = {}) {
  const analysis = analyzeSCDLV2(parseSCDLV2(source).ast);
  const budget = verifySCDLV2Budget(analysis.ir, options);
  return { budget, program: budget.ok ? lowerSCDLV2Bytecode(analysis.ir, budget.verified) : null };
}

const SOURCE = `SCDL 2
ASSET first_name
CANVAS WIDTH 9 HEIGHT 9
CONST $n I32 (ADD 1 1)
CONST $c VEC2 (VEC2 (PX 4) (PX 4))
SHAPE $s (CIRCLE CENTER $c RADIUS (PX $n))
LAYER ink ORDER 10 { PAINT $s FILL #55CCFF RASTER MIDPOINT }`;

describe('SCDL-BC-v2 lowering', () => {
  it('rejects a source request above protected host limits before lowering', () => {
    const result = lower(SOURCE.replace('CANVAS WIDTH 9 HEIGHT 9', 'CANVAS WIDTH 9 HEIGHT 9\nBUDGET INSTRUCTIONS 200001 GENERATED_SHAPES 1 RASTER_CELLS 81'));
    expect(result.budget.ok).toBe(false);
    expect(result.budget.diagnostics[0].code).toBe('SCDL-BUDGET-001');
    expect(result.program).toBeNull();
  });

  it('rejects measured raster demand over a stricter source limit', () => {
    const result = lower(SOURCE.replace('CANVAS WIDTH 9 HEIGHT 9', 'CANVAS WIDTH 9 HEIGHT 9\nBUDGET INSTRUCTIONS 128 GENERATED_SHAPES 1 RASTER_CELLS 10'));
    expect(result.budget.ok).toBe(false);
    expect(result.budget.diagnostics.some((d) => d.code === 'SCDL-BUDGET-002' && d.received.includes('25'))).toBe(true);
  });

  it('emits typed SSA registers and stable algorithm declarations', () => {
    const { program } = lower(SOURCE);
    expect(program.contract).toBe('SCDL-BC-v2');
    expect(program.text).toContain('.algorithm rational=RAT-REDUCED-v1');
    expect(program.text).toContain('.algorithm circle.midpoint=CIRCLE-FILL-MIDPOINT-v1');
    expect(program.instructions.every((instruction, index) => instruction.index === index)).toBe(true);
    expect(program.instructions.filter((instruction) => instruction.result !== null).every((instruction) => /^%\d+$/.test(instruction.result))).toBe(true);
  });

  it('ignores comments, formatting, asset name, and local symbol spelling in identity', () => {
    const a = lower(SOURCE).program;
    const b = lower(SOURCE.replace('first_name', 'second_name').replaceAll('$n', '$radius').replaceAll('$c', '$center').replaceAll('$s', '$orb').replace('SCDL 2', 'SCDL 2\n# note')).program;
    expect(b.text).toBe(a.text);
    expect(b.programId).toBe(a.programId);
  });

  it('changes identity when math or painter order changes', () => {
    const a = lower(SOURCE).program.programId;
    const b = lower(SOURCE.replace('(ADD 1 1)', '(ADD 1 2)')).program.programId;
    expect(b).not.toBe(a);
  });
});
```

- [ ] **Step 2: Run the bytecode test and verify missing modules fail**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.bytecode.test.js`

Expected: FAIL because budget/bytecode modules are absent.

- [ ] **Step 3: Implement protected limits and conservative static cost**

```js
export const DEFAULT_SCDL_V2_LIMITS = Object.freeze({
  instructions: 200000,
  generatedShapes: 10000,
  rasterCells: 1048576,
});

export function verifySCDLV2Budget(ir, options = {}) {
  const host = Object.freeze({ ...DEFAULT_SCDL_V2_LIMITS, ...(options.limits || {}) });
  const requested = Object.freeze({ ...host, ...(ir.requestedBudget || {}) });
  // First reject every requested field greater than host with SCDL-BUDGET-001.
  // Then compute demand and reject every demand greater than requested with SCDL-BUDGET-002.
  // Return { ok, verified: { limits, demand }, diagnostics }.
}
```

Count one instruction for each literal, reference, expression call, declaration, layer creation, paint, and final asset emit. Count one generated shape per `PIXEL`/`CIRCLE`. For each paint, charge `1` raster cell for `PIXEL`; charge `(2 * ceil(radius) + 1) ** 2` for `CIRCLE`, clipped only by the canvas area. This is intentionally conservative and executes before bytecode lowering or raster iteration.

- [ ] **Step 4: Implement canonical lowering and semantic hashing**

Use imported `hashString` from `../../shared.js`. Lower depth-first, left-to-right. Intern literals into a first-occurrence constant pool; each `BC.CONST` loads one typed constant into a register. Every value-producing instruction gets the next `%N`; symbol references resolve to registers and names never enter semantic text. Include layer IDs and order because they are stable output semantics; exclude asset ID and debug spans from semantic text. Required instruction object fields are:

```js
{
  index: 0,
  opcodeId: 0x8000,
  mnemonic: 'BC.CONST',
  result: '%0',
  type: 'I32',
  operands: Object.freeze([{ kind: 'constant', index: 0 }]),
}
```

Serialize semantic text with exactly these header lines followed by one instruction per line:

```text
.module SCDL-BC-v2
.language 2.0
.semantics 2.0.0
.canvas <width> <height>
.capability CORE.MATH@2.0
.capability GEOMETRY.STANDARD@2.0
.capability PAINT.LAYERS@2.0
.algorithm rational=RAT-REDUCED-v1
.algorithm circle.center=CIRCLE-FILL-CENTER-v1
.algorithm circle.midpoint=CIRCLE-FILL-MIDPOINT-v1
.const $k0:i32 2
```

Encode exact rationals as `n/d`, colors lowercase, constants in first semantic occurrence, named operands in registry order, and arrays in register order. Instruction lines use only the permanent registry mnemonics: expression opcodes keep `ADD`/`PX`/`CIRCLE`; construction opcodes use `BC.CONST`, `BC.LAYER.NEW`, `BC.PAINT`, and `BC.EMIT.ASSET`. Instruction objects contain no source span. Set `programId` to `scdlbc_${hashString(text).toString(16).padStart(8, '0')}`. `debugMap` is a separate frozen array of `{ instruction, span }` and is never fed into the hash.

- [ ] **Step 5: Run bytecode, analyzer, and formatter tests**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.bytecode.test.js tests/codex/core/pixelbrain/scdl/scdl-v2.analyzer.test.js tests/codex/core/pixelbrain/scdl/scdl-v2.formatter.test.js`

Expected: PASS.

- [ ] **Step 6: Commit budget verification and bytecode authority**

```bash
git add codex/core/pixelbrain/scdl/v2/scdl-v2.budget.js codex/core/pixelbrain/scdl/v2/scdl-v2.bytecode.js tests/codex/core/pixelbrain/scdl/scdl-v2.bytecode.test.js
git commit -m "feat(scdl): lower bounded v2 programs to canonical bytecode"
```

### Task 7: Bounded Evaluation and Deterministic Pixel/Circle Rasterization

**Files:**
- Create: `codex/core/pixelbrain/scdl/v2/scdl-v2.evaluator.js`
- Create: `codex/core/pixelbrain/scdl/v2/scdl-v2.raster.js`
- Create: `tests/codex/core/pixelbrain/scdl/scdl-v2.raster.test.js`

**Interfaces:**
- Consumes: verified canonical bytecode program.
- Produces: `evaluateSCDLV2(program): { ok, construction, counters, diagnostics }` and `rasterizeSCDLV2(construction, canvas, verifiedBudget): { ok, coordinates, layers, diagnostics }`.
- Construction IR contains immutable symbolic shapes and layers; raster output coordinates are normalized `{ x, y, color, partId, role }`.

- [ ] **Step 1: Write symbolic-evaluation and raster golden tests**

```js
import { describe, expect, it } from 'vitest';
import { rasterizeCircleCenter, rasterizeCircleMidpoint, compositeSCDLV2Layers } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.raster.js';

describe('SCDL v2 raster kernel', () => {
  it('rasterizes a radius-2 midpoint disc symmetrically', () => {
    const cells = rasterizeCircleMidpoint({ x: 4, y: 4 }, 2);
    const keys = cells.map(({ x, y }) => `${x},${y}`).sort();
    expect(keys).toEqual([
      '2,4', '3,3', '3,4', '3,5', '4,2', '4,3', '4,4', '4,5', '4,6',
      '5,3', '5,4', '5,5', '6,4',
    ]);
    for (const { x, y } of cells) {
      expect(keys).toContain(`${8 - x},${y}`);
      expect(keys).toContain(`${x},${8 - y}`);
    }
  });

  it('matches an independent exact center-inclusion oracle', () => {
    const actual = rasterizeCircleCenter({ x: { numerator: '4', denominator: '1' }, y: { numerator: '4', denominator: '1' } }, { numerator: '2', denominator: '1' });
    const expected = [];
    for (let y = 0; y <= 8; y += 1) for (let x = 0; x <= 8; x += 1) {
      if ((x - 4) ** 2 + (y - 4) ** 2 <= 4) expected.push(`${x},${y}`);
    }
    expect(actual.map(({ x, y }) => `${x},${y}`).sort()).toEqual(expected.sort());
  });

  it('clips and composites by layer order then paint order', () => {
    const result = compositeSCDLV2Layers({ width: 2, height: 2 }, [
      { id: 'top', order: 20, paints: [{ shape: { kind: 'PIXEL', at: { x: 0, y: 0 } }, fill: '#ffffff', raster: 'CENTER' }] },
      { id: 'base', order: 10, paints: [{ shape: { kind: 'PIXEL', at: { x: 0, y: 0 } }, fill: '#000000', raster: 'CENTER' }, { shape: { kind: 'PIXEL', at: { x: 9, y: 9 } }, fill: '#ff0000', raster: 'CENTER' }] },
    ]);
    expect(result.coordinates).toEqual([{ x: 0, y: 0, color: '#ffffff', partId: 'top', role: 'paint' }]);
  });
});
```

- [ ] **Step 2: Run the raster test and verify missing module failure**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.raster.test.js`

Expected: FAIL because evaluator/raster modules are absent.

- [ ] **Step 3: Implement the bounded register evaluator**

Interpret instruction objects, never parse `program.text`. Maintain a register `Map`, instruction counter, generated-shape counter, and paint list. Reject a missing register, wrong runtime type, counter beyond `verifiedBudget.limits`, or unknown opcode with `SCDL-LOWER-001`; return no construction on error.

```js
export function evaluateSCDLV2(program) {
  const registers = new Map();
  const state = { instructions: 0, generatedShapes: 0, rasterCells: 0 };
  const layers = [];
  // Evaluate canonical instructions in increasing index order.
  // Clone and freeze every register value before storing it.
  return Object.freeze({
    ok: true,
    construction: Object.freeze({ layers: Object.freeze(layers) }),
    counters: Object.freeze({ ...state }),
    diagnostics: Object.freeze([]),
  });
}
```

The evaluator supports only the instruction mnemonics emitted in Task 6. It does not invoke AST callbacks or source expressions; this proves bytecode is executable authority rather than a decorative sidecar.

- [ ] **Step 4: Implement exact raster policies and compositing**

`PIXEL` requires integral `PX` x/y. `MIDPOINT` requires integral circle center and radius; otherwise emit `SCDL-GEOM-001` naming the policy and exact received values. `CENTER` accepts exact rational center/radius and compares squared rational distances by cross multiplication. A zero-radius circle emits exactly its center cell when integral and inside the canvas.

For filled midpoint circles use the integer decision variable and symmetric horizontal spans; store intermediate cells in a keyed map to remove symmetry duplicates. Normalize each primitive to y-major/x-minor cell order before painter composition. Composite layers by `(order, sourceIndex)` and paints by source order; last paint wins at one coordinate. Return final coordinates y-major/x-minor for stable packet content while bytecode retains painter order.

- [ ] **Step 5: Add a runtime budget-defense test**

Append:

```js
it('stops when a forged verified program crosses its runtime instruction limit', async () => {
  const { evaluateSCDLV2 } = await import('../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.evaluator.js');
  const program = Object.freeze({
    constants: Object.freeze([{ index: 0, type: 'I32', value: '1' }]),
    instructions: Object.freeze([{ index: 0, opcodeId: 0x8000, mnemonic: 'BC.CONST', result: '%0', type: 'I32', operands: [{ kind: 'constant', index: 0 }] }]),
    verifiedBudget: Object.freeze({ limits: Object.freeze({ instructions: 0, generatedShapes: 0, rasterCells: 0 }) }),
  });
  const result = evaluateSCDLV2(program);
  expect(result.ok).toBe(false);
  expect(result.construction).toBeNull();
  expect(result.diagnostics[0].code).toBe('SCDL-BUDGET-003');
});
```

- [ ] **Step 6: Run focused raster/evaluator tests**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.raster.test.js`

Expected: PASS.

- [ ] **Step 7: Commit the executable pixel kernel**

```bash
git add codex/core/pixelbrain/scdl/v2/scdl-v2.evaluator.js codex/core/pixelbrain/scdl/v2/scdl-v2.raster.js tests/codex/core/pixelbrain/scdl/scdl-v2.raster.test.js
git commit -m "feat(scdl): evaluate and rasterize v2 pixel geometry"
```

### Task 8: Packet Emission and Never-Throw v2 Orchestrator

**Files:**
- Create: `codex/core/pixelbrain/scdl/v2/scdl-v2.emit.js`
- Create: `codex/core/pixelbrain/scdl/v2/scdl-v2.compiler.js`
- Create: `codex/core/pixelbrain/scdl/fixtures/v2/exact-orb.scdl`
- Create: `tests/codex/core/pixelbrain/scdl/scdl-v2.compiler.test.js`

**Interfaces:**
- Consumes: source text and `{ strict?: boolean, limits?: Partial<BudgetLimits> }`.
- Produces: `emitSCDLV2Package({ analysis, bytecode, construction, raster })` and `compileSCDLV2(source, options)` matching the frozen result contract above.

- [ ] **Step 1: Add the exact end-to-end fixture**

```scdl
SCDL 2
ASSET exact_orb
CANVAS WIDTH 9 HEIGHT 9
BUDGET INSTRUCTIONS 128 GENERATED_SHAPES 2 RASTER_CELLS 81

CONST $two I32 (ADD 1 1)
CONST $center VEC2 (VEC2 (PX 4) (PX 4))
CONST $ink COLOR #55CCFF
SHAPE $spark (PIXEL AT (VEC2 (PX 1) (PX 1)))
SHAPE $orb (CIRCLE CENTER $center RADIUS (PX $two))

LAYER ink ORDER 10 {
  PAINT $orb FILL $ink RASTER MIDPOINT
  PAINT $spark FILL #FFFFFF RASTER CENTER
}
```

- [ ] **Step 2: Write the v2 compiler contract tests**

```js
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileSCDLV2 } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.compiler.js';

const SOURCE = readFileSync(resolve('codex/core/pixelbrain/scdl/fixtures/v2/exact-orb.scdl'), 'utf8');

describe('SCDL v2 compiler vertical slice', () => {
  it('emits canonical bytecode, immutable IR, and a real asset packet', () => {
    const result = compileSCDLV2(SOURCE);
    expect(result.ok).toBe(true);
    expect(result.contract).toBe('SCDL-COMPILE-RESULT-v2');
    expect(result.bytecode.contract).toBe('SCDL-BC-v2');
    expect(result.package.contract).toBe('SCDL-PACKAGE-v2');
    expect(result.packet.kind).toBe('pixelbrain.asset.v1');
    expect(result.packet.id).toBe(`pbasset_${result.bytecode.programId.slice('scdlbc_'.length)}`);
    expect(result.packet.geometry.coordinates).toContainEqual(expect.objectContaining({ x: 1, y: 1, color: '#ffffff' }));
    expect(Object.isFrozen(result.package)).toBe(true);
  });

  it('is deterministic across repeated compilation', () => {
    const a = compileSCDLV2(SOURCE);
    const b = compileSCDLV2(SOURCE);
    expect(b.bytecode.text).toBe(a.bytecode.text);
    expect(b.bytecode.programId).toBe(a.bytecode.programId);
    expect(b.packet).toEqual(a.packet);
  });

  it.each(['', null, 'SCDL 2\n', 'SCDL 2\nASSET x\nCANVAS WIDTH 1 HEIGHT 1\nSHAPE $x (CIRCLE CENTER (VEC2 (PX 0) (PX 0)))', 'SCDL 2\n@'])('never throws and never emits partial output for %j', (source) => {
    expect(() => compileSCDLV2(source)).not.toThrow();
    const result = compileSCDLV2(source);
    expect(result.ok).toBe(false);
    expect(result.bytecode).toBeNull();
    expect(result.package).toBeNull();
    expect(result.packet).toBeNull();
    expect(result.framePackets).toEqual([]);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run the compiler test and verify missing module failure**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.compiler.test.js`

Expected: FAIL because `scdl-v2.compiler.js` is absent.

- [ ] **Step 4: Implement packet/package emission**

Use `createPixelBrainAssetPacket` from `../../pixelbrain-asset-packet.js`. Pass an explicit program-derived packet ID and preserve the bytecode text in the packet:

```js
export function emitSCDLV2Package({ analysis, bytecode, construction, raster }) {
  const packet = createPixelBrainAssetPacket({
    id: `pbasset_${bytecode.programId.slice('scdlbc_'.length)}`,
    canvas: analysis.canvas,
    coordinates: raster.coordinates,
    palette: {
      sourcePalette: [{ key: 'scdl-v2-source', colors: [...new Set(raster.coordinates.map((cell) => cell.color))], source: 'scdl-v2', weights: [] }],
      authority: 'scdl-v2.emit.v1',
    },
    bytecode: { raw: bytecode.text, authority: 'SCDL-BC-v2', materialStage: 'source' },
    source: { kind: 'scdl-v2', id: analysis.assetId, label: `SCDL2:${analysis.assetId}` },
    material: { id: 'source' },
    provenance: {
      createdBy: 'scdl-compiler.v2',
      operations: [
        { op: 'lower', programId: bytecode.programId },
        { op: 'evaluate', instructionCount: bytecode.instructions.length },
        { op: 'rasterize', coordinateCount: raster.coordinates.length },
      ],
    },
    metadata: { tags: ['scdl', 'scdl-v2'], notes: [`Program: ${bytecode.programId}`] },
  });
  const packageValue = Object.freeze({
    contract: 'SCDL-PACKAGE-v2',
    programId: bytecode.programId,
    bytecode,
    verifiedBudget: bytecode.verifiedBudget,
    construction,
    layers: raster.layers,
    framePackets: Object.freeze([packet]),
    animation: null,
    ampPlan: Object.freeze([]),
    exportManifest: Object.freeze({ targets: Object.freeze(['json', 'svg', 'phaser', 'png', 'aseprite']) }),
  });
  return Object.freeze({ packet, package: packageValue });
}
```

Sort palette colors by first visible occurrence, not lexical order, so the palette reflects deterministic painter output.

- [ ] **Step 5: Implement pass orchestration with one failure constructor**

```js
export function compileSCDLV2(source, options = {}) {
  const safeSource = typeof source === 'string' ? source : '';
  const safeOptions = options && typeof options === 'object' ? options : {};
  try {
    const parsed = parseSCDLV2(safeSource);
    if (!parsed.ok) return failV2({ source: safeSource, options: safeOptions, cst: parsed.cst, ast: null, diagnostics: parsed.diagnostics });
    const analyzed = analyzeSCDLV2(parsed.ast);
    if (!analyzed.ok) return failV2({ source: safeSource, options: safeOptions, cst: parsed.cst, ast: parsed.ast, diagnostics: analyzed.diagnostics });
    const budget = verifySCDLV2Budget(analyzed.ir, safeOptions);
    if (!budget.ok) return failV2({ source: safeSource, options: safeOptions, cst: parsed.cst, ast: parsed.ast, diagnostics: budget.diagnostics });
    const bytecode = lowerSCDLV2Bytecode(analyzed.ir, budget.verified);
    const evaluated = evaluateSCDLV2(bytecode);
    if (!evaluated.ok) return failV2({ source: safeSource, options: safeOptions, cst: parsed.cst, ast: parsed.ast, diagnostics: evaluated.diagnostics });
    const raster = rasterizeSCDLV2(evaluated.construction, analyzed.ir.canvas, budget.verified);
    if (!raster.ok) return failV2({ source: safeSource, options: safeOptions, cst: parsed.cst, ast: parsed.ast, diagnostics: raster.diagnostics });
    const emitted = emitSCDLV2Package({ analysis: analyzed.ir, bytecode, construction: evaluated.construction, raster });
    return successV2({ source: safeSource, options: safeOptions, cst: parsed.cst, ast: parsed.ast, analysis: analyzed.ir, bytecode, ...emitted });
  } catch (error) {
    return failV2({ source: safeSource, options: safeOptions, cst: null, ast: null, diagnostics: [internalDiagnostic(error)] });
  }
}
```

`internalDiagnostic` is `SCDL-EMIT-999`, phase `emit`, with a stable public message and `received: [error.name]`; do not leak a stack into the result. `successV2` and `failV2` are the only constructors of public results and enforce the null/no-partial-output law. Both create `diagnosticReport = diagnosticEnvelope(errors)` and then set `diagnostics: diagnosticReport.diagnostics`. Use this exact shared base and failure override:

```js
function baseResult({ source, options, cst, ast, errors }) {
  const frozenErrors = Object.freeze([...errors]);
  const diagnosticReport = diagnosticEnvelope(frozenErrors);
  return {
    contract: 'SCDL-COMPILE-RESULT-v2',
    languageVersion: 2,
    compilerVersion: '2.0.0',
    cst,
    ast,
    errors: frozenErrors,
    diagnostics: diagnosticReport.diagnostics,
    diagnosticReport,
    frameLoop: null,
    regressionSeed: Object.freeze({ source, options, checksum: null }),
  };
}

function failV2({ source, options, cst, ast, diagnostics }) {
  return Object.freeze({
    ...baseResult({ source, options, cst, ast, errors: diagnostics }),
    ok: false,
    analysis: null,
    bytecode: null,
    package: null,
    packet: null,
    framePackets: Object.freeze([]),
  });
}
```

`successV2` uses the same base with an empty error list:

```js
function successV2({ source, options, cst, ast, analysis, bytecode, package: packageValue, packet }) {
  return Object.freeze({
    ...baseResult({ source, options, cst, ast, errors: [] }),
    ok: true,
    analysis,
    bytecode,
    package: packageValue,
    packet,
    framePackets: Object.freeze([packet]),
    regressionSeed: Object.freeze({ source, options, checksum: bytecode.programId }),
  });
}
```

- [ ] **Step 6: Run the complete v2 unit set**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.*.test.js`

Expected: PASS.

- [ ] **Step 7: Commit the first standalone v2 compiler**

```bash
git add codex/core/pixelbrain/scdl/v2/scdl-v2.emit.js codex/core/pixelbrain/scdl/v2/scdl-v2.compiler.js codex/core/pixelbrain/scdl/fixtures/v2/exact-orb.scdl tests/codex/core/pixelbrain/scdl/scdl-v2.compiler.test.js
git commit -m "feat(scdl): emit v2 bytecode and asset packets"
```

### Task 9: Public Router, Diagnostics Bridge, and Agent CLI

**Files:**
- Modify: `codex/core/pixelbrain/scdl/scdl.compiler.js:28-47` and rename the existing function at current line 47 to `compileLegacySCDL`
- Modify: `codex/core/pixelbrain/scdl/index.js:8-14`
- Modify: `codex/core/pixelbrain/scdl/scdl.diagnostics.js:14-46`
- Modify: `codex/core/pixelbrain/scdl/scdl.cli.js:16-28, 40-43, 475-546`
- Modify: `package.json:30-33`
- Create: `tests/codex/core/pixelbrain/scdl/scdl-v2.integration.test.js`
- Modify: `tests/codex/core/pixelbrain/scdl/scdl.cli.test.js`

**Interfaces:**
- Consumes: `detectSCDLVersion`, `compileSCDLV2`, `parseSCDLV2`, `formatSCDLV2`.
- Produces: routed `compileSCDL`, explicitly exported `compileLegacySCDL`, public v2 parse/format/opcode inspection, and CLI `format`.

- [ ] **Step 1: Capture legacy results before modifying the public seam**

Run this read-only snapshot command and retain its output in the terminal for the later differential step:

```bash
node --input-type=module - <<'NODE'
import { readFileSync } from 'node:fs';
import { compileSCDL } from './codex/core/pixelbrain/scdl/scdl.compiler.js';
const files = [
  'slime-sphere.scdl',
  'crimson-ooze-sphere.scdl',
  'void_chestplate.scdl',
  'env_test/env_test.scdl',
  'void_acolyte/void_acolyte.scdl',
];
for (const file of files) {
  const source = readFileSync(`codex/core/pixelbrain/scdl/fixtures/${file}`, 'utf8');
  const result = compileSCDL(source);
  console.log(JSON.stringify({ file, ok: result.ok, ids: result.framePackets.map((packet) => packet.id), packets: result.framePackets }));
}
NODE
```

Expected: five JSON lines, all `ok: true`, including the frozen IDs already asserted by `scdl.legacy-invariance.test.js`.

- [ ] **Step 2: Write router and CLI tests before modifying production files**

```js
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';

const V2 = readFileSync(resolve('codex/core/pixelbrain/scdl/fixtures/v2/exact-orb.scdl'), 'utf8');
const V1 = 'asset x canvas 2x2\npart p material source { cell 0 0 #ffffff }\nexport json';

describe('SCDL public version router', () => {
  it('routes explicit v2 and unversioned legacy through one public function', () => {
    expect(compileSCDL(V2)).toMatchObject({ ok: true, languageVersion: 2, contract: 'SCDL-COMPILE-RESULT-v2' });
    expect(compileSCDL(V1)).toMatchObject({ ok: true });
    expect(compileSCDL(V1).contract).toBeUndefined();
  });

  it('does not reinterpret an unsupported SCDL header as v2', () => {
    const result = compileSCDL('SCDL 3\nASSET x');
    expect(result.languageVersion).not.toBe(2);
    expect(result.ok).toBe(false);
  });
});
```

In `scdl.cli.test.js`, add tests using `spawnSync` and a temporary v2 source:

```js
it('checks and compiles an explicit v2 source through the existing CLI', () => {
  const src = join(dir, 'exact-orb.scdl');
  writeFileSync(src, readFileSync(resolve(process.cwd(), 'codex/core/pixelbrain/scdl/fixtures/v2/exact-orb.scdl'), 'utf8'));
  const check = runBoth(['check', src], cwdDir);
  const compile = runBoth(['compile', src, '--export', 'json,png'], cwdDir);
  expect(check.status).toBe(0);
  expect(check.all).toMatch(/Bytecode:\s+scdlbc_[0-9a-f]{8}/);
  expect(compile.status).toBe(0);
  expect(existsSync(join(dir, 'exact-orb-json.json'))).toBe(true);
  expect(existsSync(join(dir, 'exact-orb-png.png'))).toBe(true);
});

it('formats v2 source to stdout and --write updates only that file', () => {
  const src = join(dir, 'format-me.scdl');
  writeFileSync(src, 'SCDL 2\r\nASSET x\r\nCANVAS WIDTH 1 HEIGHT 1\r\nSHAPE $p (PIXEL AT (VEC2 (PX 0) (PX 0)))\r\nLAYER a ORDER 0 { PAINT $p FILL #FFFFFF RASTER CENTER }');
  const printed = runBoth(['format', src], cwdDir);
  expect(printed.status).toBe(0);
  expect(printed.stdout).toContain('PAINT $p FILL #ffffff RASTER CENTER');
  const written = runBoth(['format', src, '--write'], cwdDir);
  expect(written.status).toBe(0);
  expect(readFileSync(src, 'utf8')).toBe(printed.stdout);
});
```

- [ ] **Step 3: Run integration tests and verify the public seam is still legacy-only**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.integration.test.js tests/codex/core/pixelbrain/scdl/scdl.cli.test.js`

Expected: the new v2 router/format cases FAIL while existing CLI cases remain green.

- [ ] **Step 4: Add the minimal router around the unchanged legacy body**

At the top of `scdl.compiler.js`, import the detector/compiler. Rename only the existing declaration `export function compileSCDL` to `export function compileLegacySCDL`; do not edit its body or helpers. Add:

```js
import { detectSCDLVersion } from './v2/scdl-v2.version.js';
import { compileSCDLV2 } from './v2/scdl-v2.compiler.js';

export function compileSCDL(source, options = {}) {
  if (detectSCDLVersion(source) === 2) return compileSCDLV2(source, options);
  return compileLegacySCDL(source, options);
}
```

The outer router does not need another catch: both branch functions already uphold never-throw. Do not normalize `source` before calling legacy; legacy's current non-string behavior is part of its compatibility surface.

- [ ] **Step 5: Export v2 tooling and make diagnostics bridge version-aware**

Add to `index.js`:

```js
export { compileSCDL, compileLegacySCDL } from './scdl.compiler.js';
export { detectSCDLVersion } from './v2/scdl-v2.version.js';
export { compileSCDLV2 } from './v2/scdl-v2.compiler.js';
export { parseSCDLV2 } from './v2/scdl-v2.parser.js';
export { formatSCDLV2 } from './v2/scdl-v2.formatter.js';
export { listSCDLV2Opcodes, getSCDLV2Opcode } from './v2/scdl-v2.opcodes.js';
```

Replace the hard-coded report source in `buildSCDLDiagnosticReport` with:

```js
const source = result.languageVersion === 2 ? 'SCDL-v2' : 'SCDL-v1';
// use `source` for each fallback entry source and the returned report source
```

Map v2 `span` in addition to legacy `loc`; retain every existing legacy field unchanged.

- [ ] **Step 6: Route CLI parsing and add canonical format**

Import `detectSCDLVersion`, `parseSCDLV2`, and `formatSCDLV2` from `index.js`. Add `write` to `BOOLEAN_FLAGS`. In `cmdParse`, select `parseSCDLV2(source)` only for explicit v2, print `result.ast || result.cst || result`, and set exit code 1 when `result.ok === false`. Implement:

```js
function cmdFormat(args) {
  const opts = parseArgs(args);
  const filePath = opts.positional[0];
  if (!filePath) { console.error('[SCDL] format: missing <file.scdl>'); process.exit(1); }
  const source = readSource(filePath);
  if (detectSCDLVersion(source) !== 2) {
    console.error('[SCDL] format: canonical formatting is available only for explicit SCDL 2 source');
    process.exit(1);
  }
  const result = formatSCDLV2(source);
  if (!result.ok) {
    printDiagnostics(result.diagnostics);
    process.exit(1);
  }
  if (opts.flags.write === true) writeFileSync(resolve(filePath), result.output, 'utf8');
  else process.stdout.write(result.output);
}
```

Add `case 'format': cmdFormat(argv);` and advertise `format <file.scdl> [--write]` in help. Add `"scdl:format": "node codex/core/pixelbrain/scdl/scdl.cli.js format"` to `package.json`.

In `cmdCheck`, print `Bytecode: ${result.bytecode.programId}` for v2 and retain the existing packet/coord lines for both versions. In compile/preview, existing exporters operate on the v2 coordinate packet; do not create a second exporter path.

- [ ] **Step 7: Run public integration and the full current SCDL suite**

Run:

```bash
npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.integration.test.js tests/codex/core/pixelbrain/scdl/scdl.cli.test.js
npx vitest run tests/codex/core/pixelbrain/scdl
```

Expected: all new integration tests PASS; all existing SCDL test files PASS; `scdl.legacy-invariance.test.js` reports every frozen ID unchanged.

- [ ] **Step 8: Repeat the legacy snapshot and compare exact JSON**

Re-run the Step 1 Node command. Compare each JSON line's `ids` and `packets` fields with the pre-router output. Any difference blocks the commit; do not re-freeze IDs.

- [ ] **Step 9: Commit the public integration**

```bash
git add package.json codex/core/pixelbrain/scdl/scdl.compiler.js codex/core/pixelbrain/scdl/index.js codex/core/pixelbrain/scdl/scdl.diagnostics.js codex/core/pixelbrain/scdl/scdl.cli.js tests/codex/core/pixelbrain/scdl/scdl-v2.integration.test.js tests/codex/core/pixelbrain/scdl/scdl.cli.test.js
git commit -m "feat(scdl): route explicit v2 through the public compiler"
```

### Task 10: Robustness Gates, Documentation, and Milestone Proof

**Files:**
- Create: `tests/codex/core/pixelbrain/scdl/scdl-v2.robustness.test.js`
- Modify: `tests/codex/core/pixelbrain/scdl/whitepaper-cli-contract.test.js`
- Modify: `docs/scholomance-encyclopedia/Scholomance White Papers/SCDL_COMPILER_WHITE_PAPER.md`
- Modify: `docs/scholomance-encyclopedia/Scholomance White Papers/SCDL_AUTHORING_GUIDE.md`

**Interfaces:**
- Consumes: the complete public v2 seam.
- Produces: never-throw/finiteness regression gates, documentation-to-CLI contract, and evidence-backed author guidance.

- [ ] **Step 1: Add deterministic malformed-input and diagnostic-family coverage**

```js
import { describe, expect, it } from 'vitest';
import { compileSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';

function seededStrings(seed, count) {
  let state = seed >>> 0;
  const alphabet = 'SCDL 2\n{}()[]$#@ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.-_ \t';
  return Array.from({ length: count }, () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const length = state % 256;
    let value = 'SCDL 2\n';
    for (let i = 0; i < length; i += 1) {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      value += alphabet[state % alphabet.length];
    }
    return value;
  });
}

describe('SCDL v2 robustness', () => {
  it('never throws or returns a partial output for 2000 deterministic malformed programs', () => {
    for (const source of seededStrings(0x5cd12002, 2000)) {
      expect(() => compileSCDL(source)).not.toThrow();
      const result = compileSCDL(source);
      if (!result.ok) {
        expect(result.packet).toBeNull();
        expect(result.bytecode).toBeNull();
        expect(result.package).toBeNull();
      }
    }
  });

  it.each([
    ['SCDL-LEX-', 'SCDL 2\n@'],
    ['SCDL-PARSE-', 'SCDL 2\nASSET x\nCANVAS WIDTH'],
    ['SCDL-BIND-', 'SCDL 2\nASSET x\nCANVAS WIDTH 1 HEIGHT 1\nSHAPE $p $missing'],
    ['SCDL-TYPE-', 'SCDL 2\nASSET x\nCANVAS WIDTH 1 HEIGHT 1\nCONST $n I32 1\nSHAPE $p (CIRCLE CENTER (VEC2 (PX 0) (PX 0)) RADIUS $n)'],
    ['SCDL-BUDGET-', 'SCDL 2\nASSET x\nCANVAS WIDTH 1 HEIGHT 1\nBUDGET INSTRUCTIONS 200001 GENERATED_SHAPES 1 RASTER_CELLS 1'],
  ])('fires a %s diagnostic', (prefix, source) => {
    const result = compileSCDL(source);
    expect(result.ok).toBe(false);
    expect(result.diagnostics.some((diagnostic) => diagnostic.code.startsWith(prefix))).toBe(true);
  });
});
```

- [ ] **Step 2: Run robustness tests and record execution time**

Run: `time npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.robustness.test.js`

Expected: PASS without timeout or hang. If 2000 cases exceed 10 seconds on the project host, profile and fix guaranteed-progress paths; do not reduce the corpus count.

- [ ] **Step 3: Extend the CLI/documentation contract test**

Update the command extraction and expected list to include `format`, and dispatch it with the checked-in v2 fixture:

```js
const cmds = [...section.matchAll(/^\|\s*`(compile|preview|check|parse|format)`\s*\|/gm)].map((match) => match[1]);
expect(cmds.sort()).toEqual(['check', 'compile', 'format', 'parse', 'preview']);

const fixtureFor = (command) => command === 'format'
  ? join(ROOT, 'codex/core/pixelbrain/scdl/fixtures/v2/exact-orb.scdl')
  : join(ROOT, 'codex/core/pixelbrain/scdl/fixtures/crimson_ooze.scdl');
const markers = { compile: '[SCDL] Compiling', preview: '[SCDL] Preview', check: '[SCDL] Check', parse: '"parts"', format: 'SCDL 2' };
```

Pass `fixtureFor(c)` into the existing spawn and keep temporary output directories for compile/preview.

- [ ] **Step 4: Update both attached documents with demonstrated behavior only**

In the white paper, add a clearly labeled “SCDL v2 semantic-core milestone” section containing:

- the exact supported statement/expression opcode lists from this plan;
- the `SCDL 2` routing law and legacy invariance statement;
- the compiler pipeline and public result/package contracts;
- exact rational/unit rules and `CENTER`/`MIDPOINT` behavior;
- protected budget values and failure-before-evaluation law;
- canonical bytecode example generated by compiling `fixtures/v2/exact-orb.scdl`;
- the distinction between this shipped slice and the later sequence/Fibonacci, animation, import, RNG, AMP, and agent-inspection milestones.

In the authoring guide, add copy-pasteable sections for:

```bash
npm run scdl:check -- codex/core/pixelbrain/scdl/fixtures/v2/exact-orb.scdl
npm run scdl:format -- codex/core/pixelbrain/scdl/fixtures/v2/exact-orb.scdl
npm run scdl:compile -- codex/core/pixelbrain/scdl/fixtures/v2/exact-orb.scdl --export json,png --out-dir /tmp/scdl-v2-exact-orb
```

Also include the full fixture source, the `check -> read diagnostics -> edit source -> check` agent repair loop, the diagnostic JSON fields, and explicit examples of missing `RADIUS`, unknown `$symbol`, `I32` passed where `PX` is required, and budget rejection. Describe the attached documents as documentation of compiler-demonstrated behavior, not as executable compiler authority.

- [ ] **Step 5: Run the documentation contract and every SCDL test**

Run:

```bash
npx vitest run tests/codex/core/pixelbrain/scdl/whitepaper-cli-contract.test.js
npx vitest run tests/codex/core/pixelbrain/scdl
```

Expected: all SCDL tests PASS, including the v2 corpus, CLI contract, exporter paths, and frozen legacy IDs.

- [ ] **Step 6: Compile and inspect the real v2 fixture**

Run:

```bash
scdl_v2_out="$(mktemp -d)"
npm run scdl:check -- codex/core/pixelbrain/scdl/fixtures/v2/exact-orb.scdl
npm run scdl:compile -- codex/core/pixelbrain/scdl/fixtures/v2/exact-orb.scdl --export json,png --out-dir "$scdl_v2_out"
npm run scdl:preview -- codex/core/pixelbrain/scdl/fixtures/v2/exact-orb.scdl --scale 8 --out-dir "$scdl_v2_out"
node --input-type=module - "$scdl_v2_out/exact-orb-json.json" <<'NODE'
import { readFileSync } from 'node:fs';
const packet = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (packet.kind !== 'pixelbrain.asset.v1') throw new Error(`wrong packet kind: ${packet.kind}`);
if (packet.bytecode.authority !== 'SCDL-BC-v2') throw new Error(`wrong bytecode authority: ${packet.bytecode.authority}`);
if (!packet.geometry.coordinates.some((cell) => cell.x === 1 && cell.y === 1 && cell.color === '#ffffff')) throw new Error('spark pixel missing');
console.log(JSON.stringify({ id: packet.id, coordinates: packet.geometry.coordinates.length, bytecode: packet.bytecode.authority }));
NODE
file "$scdl_v2_out/exact-orb-png.png"
```

Expected: check reports `OK: true` and a `scdlbc_<eight lowercase hex digits>` ID; packet inspection prints one JSON summary; `file` reports a 9 x 9 PNG. Open both `exact-orb-png.png` and `exact-orb-preview-8x.png` with the local image viewer. Confirm the native lattice contains one white pixel at `(1,1)`, a centered symmetric cyan radius-2 disc, no anti-aliased colors, and an 8x preview whose pixels remain crisp nearest-neighbor squares.

- [ ] **Step 7: Run repository gates relevant to the changed seam**

Run:

```bash
npm run typecheck
npm run lint
git diff --check
```

Expected: changed v2/compiler/test files introduce no typecheck, lint, or whitespace error. If repository-wide commands report unrelated pre-existing failures, capture their exact paths/count separately and still run ESLint directly on every changed `.js` file before proceeding.

- [ ] **Step 8: Stage only milestone files and run the immune scan**

```bash
git add package.json codex/core/pixelbrain/scdl/scdl.compiler.js codex/core/pixelbrain/scdl/index.js codex/core/pixelbrain/scdl/scdl.diagnostics.js codex/core/pixelbrain/scdl/scdl.cli.js codex/core/pixelbrain/scdl/v2 codex/core/pixelbrain/scdl/fixtures/v2 tests/codex/core/pixelbrain/scdl/scdl-v2.*.test.js tests/codex/core/pixelbrain/scdl/scdl.cli.test.js tests/codex/core/pixelbrain/scdl/whitepaper-cli-contract.test.js "docs/scholomance-encyclopedia/Scholomance White Papers/SCDL_COMPILER_WHITE_PAPER.md" "docs/scholomance-encyclopedia/Scholomance White Papers/SCDL_AUTHORING_GUIDE.md"
npm run immune:scan
git diff --cached --check
git diff --cached --stat
```

Expected: immune scan CLEAN, cached diff check silent, and staged stat contains no unrelated Pixel-Art-Studio-Skeleton or user worktree files.

- [ ] **Step 9: Commit the verified milestone proof**

```bash
git commit -m "docs(scdl): prove the v2 semantic core milestone"
```

## Final Acceptance Checklist

- [ ] `SCDL 2` and only `SCDL 2` selects v2.
- [ ] Legacy source still uses the unchanged legacy compiler body.
- [ ] The checked-in v2 fixture constructs and paints a pixel plus a filled circle.
- [ ] Prefix math is exact and unit-checked.
- [ ] Missing operands, unknown symbols, bad units, and budgets emit phase-specific structured diagnostics.
- [ ] Canonical formatting is idempotent.
- [ ] Canonical bytecode precedes and drives evaluation.
- [ ] Comments, formatting, asset label, and local `$symbol` spelling preserve program identity.
- [ ] Invalid input emits no bytecode/package/packet and never throws.
- [ ] Public CLI `check`, `format`, `compile`, `preview`, and `parse` work for their documented versions.
- [ ] JSON/PNG exports consume the real v2 `PixelBrainAssetPacket`.
- [ ] All current SCDL tests pass and frozen legacy packet IDs are unchanged.
- [ ] Documentation distinguishes shipped semantic-core behavior from later Fibonacci, animation, and universal AMP subprojects.
