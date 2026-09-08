# SCDL v2 Full Pilot White Paper and Operating Manual

**Date:** 2026-09-07
**Status:** Compiler-demonstrated operating manual for a full SCDL v2 pilot. Not a design wish-list.
**Classification:** Language, compiler, AMP substrate, CLI, verification, Studio ingestion
**Applies To:** SCDL v2 (`SCDL 2` routing), SCDL-BC-v2, SCDL-PACKAGE-v2, SCDL-COMPILE-RESULT-v2, SCDL-DIAGNOSTICS-v2, PB-AMP-ABI-v1, PixelBrainAssetPacket (`pixelbrain.asset.v1`), PixelBrain Studio SCDL ingest (`PB-STUDIO-SCDL-INGEST-v1`)
**Search anchor:** `SCHOL-ENC-BYKE-SEARCH-SCDL-V2-FULL-PILOT`
**Architecture spec:** [`docs/superpowers/specs/2026-09-06-scdl-v2-ai-native-pixel-language-design.md`](../../superpowers/specs/2026-09-06-scdl-v2-ai-native-pixel-language-design.md) (`SCHOL-ENC-BYKE-SEARCH-SCDL-V2-AI-NATIVE-PIXEL-LANGUAGE`)
**Companion internals:** [`SCDL_COMPILER_WHITE_PAPER.md`](./SCDL_COMPILER_WHITE_PAPER.md) §§1–10 (v1/v1.2), §11 (v2 milestone notes — some AMP claims there are stale; this paper is current)
**Companion authoring:** [`SCDL_AUTHORING_GUIDE.md`](./SCDL_AUTHORING_GUIDE.md) §11
**Effect denominator:** [`codex/core/pixelbrain/EFFECT_CATALOG.md`](../../../codex/core/pixelbrain/EFFECT_CATALOG.md)
**Skill:** `.agents/skills/ScholomanceCompile/` — pipeline patterns; this paper is the pilot authority

**Compiler wins.** If this text and `compileSCDL` / `compileSCDLV2` disagree, the compiler is right and this paper is stale. Do not document a capability as available merely because its syntax parses. A form is in the pilot only when it has verified lowering, evaluation, and output evidence.

---

## 0. How to read this paper

This is the complete procedure for piloting SCDL v2 **as it exists in the tree today**, plus the exact remaining work that is *not* in the tree. A “full pilot” is not “type `SCDL 2` once.” It is:

1. Prove the frozen v1/v1.2 path is untouched.
2. Prove the v2 semantic core, geometry kernel, and generative mathematics compile, rasterize, and export.
3. Prove the Universal AMP ABI substrate: manifests, adapters, conveyor belt, certification, catalog gate.
4. Author, diagnose, format, compile, preview, and export real v2 assets.
5. Run the live AMP substrate (48 certified AMPs, test-gated). Record the six EFFECT_CATALOG modules that still sit outside the ABI as follow-on catalog work, not as a reason the AMP path is inactive. State honestly what Studio v2 ingest, animation, imports, and LSP cannot do yet.

Sections 1–13 are law and surface. Sections 14–18 are the actual pilot. Section 19 is the gap list. Do not skip the gates in §16; they are the definition of “full.”

---

## 1. Intent of SCDL v2

SCDL v2 is a **compile-time programming language for painting pixel art through mathematics**. AI agents author textual SCDL, invoke the compiler, read structured diagnostics, repair source explicitly, and recompile. The compiler never silently repairs invalid source.

Governing model (from the approved architecture):

> Mathematics produces spatial relations. Those relations lower into canonical typed instructions. Those instructions determine every pixel and animation sample.

Non-goals that remain binding:

- SCDL is not a browser or server scripting language.
- No network, filesystem, process, clock, environment, or asynchronous APIs.
- No dynamic evaluation, reflection, prototype mutation, or unrestricted jumps.
- No truthiness and no implicit type or unit conversion.
- No ambient or unseeded randomness.
- SCDL source does not execute at asset playback time.
- The v2 compiler does not change legacy grammar or packet identity.
- Production import-graph reachability alone does **not** count as SCDL AMP compatibility.

---

## 2. Measured implementation status (2026-09-07)

The approved architecture decomposes delivery into seven independently reviewed subprojects. A full pilot runs everything that is **shipped**, and records everything that is **not**.

| Step | Name | Shipped in this tree? | Evidence |
|---|---|---|---|
| 1 | Semantic-core vertical slice | **Yes** | `detectSCDLVersion`, `tokenizeSCDLV2`, `parseSCDLV2`, `analyzeSCDLV2`, `formatSCDLV2`, `lowerSCDLV2Bytecode`, `evaluateSCDLV2`, `rasterizeSCDLV2`, `emitSCDLV2Package`; fixture `exact-orb.scdl` |
| 2 | Geometry and painting kernel | **Yes** | Primitive catalog, transforms, anchors, CSG, masks, layers, compositing; fixture `void-sigil.scdl` |
| 3 | Generative mathematics | **Yes** | `FN`, `SEQUENCE`, `RNG`, `LET`/`RETURN`/`EMIT`/`FOR`/`IF`/`MATCH`/`RADIAL`, collection ops, `NOISE_2D`; fixture `fibonacci-bloom.scdl` |
| 4 | Mathematical animation | **No** | `TIMELINE` / `DURATION` exist as **types** in `SCDL_V2_TYPES`. There are **no** `TIMELINE`, `TRACK`, `KEYFRAME`, `FORMULA`, `CLIP`, `POSE`, `EVENT` opcodes. Packages emit `animation: null` and `frameLoop: null`. |
| 5 | Universal AMP ABI substrate | **Yes — live** | `PB-AMP-ABI-v1`, 12-stage conveyor, relevance, `APPLY_AMP` / `SELECT_AMPS`, SHA-256 checksums, `scdl-v2.amp-certify.js`, CLI `amps *` |
| 6 | AMP family migrations | **Yes — 48 certified AMPs active** | Catalog gate: `48/54 have SCDL PB-AMP-ABI-v1 manifests`. All 48 have adapters, `certifyAmp` evidence, and family tests (`scdl-v2.amp-family-*.test.js`, `scdl-v2.amp-invocation.test.js`). Six EFFECT_CATALOG modules remain outside the ABI (§13.8); that is later denominator work. **The SCDL AMP path is viable and active at 48.** |
| 7 | Agent tooling and documentation | **Partial** | CLI `check` / `format` / `compile` / `preview` / `parse` / `amps *` exist. Designed commands `inspect`, `explain`, `opcodes`, `capabilities` **do not exist**. No LSP. This paper is the missing operating manual. |

**Studio:** Pixel-Art-Studio-Skeleton can ingest **v1/v1.2** SCDL into Canvas layers (`PB-STUDIO-SCDL-INGEST-v1`). Its isolated compiler copy at `Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/scdl/` has **no** `v2/` tree and **no** version router. A `SCDL 2` file pasted into the Studio dialog is parsed as legacy SCDL and fails. Full v2 Studio ingest is **not** in the pilot until that isolation copy is extended.

**Stale documents (do not trust over this paper):**

- `SCDL_COMPILER_WHITE_PAPER.md` §11.9 still says AMP execution is unshipped.
- `SCDL_AUTHORING_GUIDE.md` §11 still says “do not author APPLY_AMP.”
- `docs/Scholomance-Feedback-Report/scholomance-feedback-SCDL-V2.md` still says 5/54 AMPs. That snapshot is stale. The live, test-gated count is **48 certified SCDL AMPs out of 54 catalog modules**, and those 48 run today.

---

## 3. Architectural laws that bind the pilot

These are not style preferences. Violating them is a failed compile or a failed gate.

1. **Explicit version router.** First significant declaration is exactly `SCDL 2` → v2. Everything else → frozen `compileLegacySCDL`. No heuristics.
2. **Never throws across the public boundary.** `compileSCDL` / `compileSCDLV2` always return a result object. A failed v2 compile nulls `analysis`, `bytecode`, `package`, `packet` and freezes `framePackets` empty.
3. **No partial exports.** Failed compiles must not emit packets, bytecode, PNG, or caches.
4. **Bytecode before evaluation.** Canonical SCDL-BC-v2 text is the program identity. Raster is derived data.
5. **Immutable values.** Construction does not paint. Only `PAINT` commits a shape onto an ordered layer.
6. **No implicit conversion.** `RADIUS $n` where `$n` is `I32` is `SCDL-TYPE-002`. Wrap with `PX`.
7. **Exact rationals.** Lattice membership and identity are not IEEE-754 decisions. Reduced BigInt rationals (`n/d` strings) are the public numeric form.
8. **Budgets fail closed before evaluation.** `SCDL-BUDGET-001` / `002` run before lowering. Runtime `SCDL-BUDGET-003` is a second defense.
9. **AMP truthfulness.** Adapters must not fabricate `ITEM-SPEC-v1` class/archetype/spec metadata to satisfy an old gate (§13.6).
10. **Catalog denominator.** SCDL AMP compatibility is measured against `EFFECT_CATALOG.md`, not `amp-registry.js`.
11. **Compile-time only.** No SCDL evaluator ships into a game or browser runtime. Runtime AMPs consume immutable descriptors (`PB-RUNTIME-DESCRIPTOR-v1`).
12. **Agents author text.** JSON AST and SCDL-BC-v2 are compiler outputs, not alternate source inputs.

---

## 4. Version routing (exact)

Public seam: `compileSCDL(source, options)` in `codex/core/pixelbrain/scdl/scdl.compiler.js`.

```js
export function compileSCDL(source, options = {}) {
  if (detectSCDLVersion(source) === 2) return compileSCDLV2(source, options);
  return compileLegacySCDL(source, options);
}
```

`detectSCDLVersion` (`codex/core/pixelbrain/scdl/v2/scdl-v2.version.js`):

1. If `source` is not a string, treat as empty (legacy).
2. Strip a leading UTF-8 BOM (`U+FEFF`).
3. Split on `\r?\n`.
4. Skip blank lines and any line whose trim starts with `#`.
5. If the first remaining line is **exactly** `SCDL 2`, return `2`.
6. Otherwise return `1`.

Consequences the pilot must treat as law:

| Input first significant line | Path |
|---|---|
| `SCDL 2` | v2 |
| `SCDL 2 extra` | legacy (not v2) |
| `scdl 2` | legacy |
| `SCDL 3` | legacy (will fail in v1, not be reinterpreted) |
| unversioned `asset foo canvas 16x16` | legacy |
| `# SCDL 2` then later `SCDL 2` | the comment is skipped; `SCDL 2` still selects v2 |
| BOM + `SCDL 2` | v2 (BOM is trivia) |

**Comment vs color discrepancy (do not ignore):** the tokenizer treats `#RRGGBB` / `#RRGGBBAA` as `COLOR` tokens, and treats `#` as a comment **only** when the next character is missing, whitespace, or newline. A bare `#notacolor` is `SCDL-LEX-002`. The version detector, however, skips **any** trimmed line that `startsWith('#')`, including a line that is only `#55CCFF`. Keep the version header as the first significant declaration. Never put a color literal in column 0 of the first line.

---

## 5. Source form and syntax laws

### 5.1 Shape of a program

```scdl
SCDL 2
ASSET <ident>
CANVAS WIDTH <u32> HEIGHT <u32>
BUDGET INSTRUCTIONS <u32> GENERATED_SHAPES <u32> RASTER_CELLS <u32> [RECURSION_DEPTH <u32>]

CONST $name TYPE <expr>
SHAPE $name <shape-expr>
SHAPE $name COMPOUND { ... }
MASK $name <mask-expr>
LAYER <id> ORDER <i32> [BLEND <mode>] [OPACITY <scalar>] [VISIBLE <bool>] {
  PAINT <shape> FILL <color> RASTER <policy> [AT <vec2>] [CLIP_TO <mask>] [MATERIAL <any>] [BLEND <mode>] [OPACITY <scalar>]
}
```

Laws:

- One statement begins with one unambiguous uppercase opcode.
- Required non-positional operands are named (`CENTER`, `RADIUS`, `AT`, `FILL`, `RASTER`, `WIDTH`, `HEIGHT`, …).
- `$name` is always an immutable binding.
- Bare words are opcodes, types, enum members, or declared resource identifiers.
- Braces establish lexical scope.
- Symbols must be declared before use, except a function may refer to itself under a verified `RECURSION_MAX`.
- Mutual recursion is forbidden (`SCDL-TERM-004`).
- Prefix expressions have no precedence ambiguity: `(ADD (MUL 2 3) 4)`.
- Canonical formatting has one spelling, case, numeric form, operand order, and indentation policy.
- The compiler never applies diagnostic `fixes` automatically.

### 5.2 Literals

| Kind | Form | Notes |
|---|---|---|
| Integer | signed base-10 | Canonical form drops leading zeros; `0` is `0` |
| Decimal | exact base-10 | Stored as reduced rational (`1.250` → `5/4`) |
| Color | `#RRGGBB` or `#RRGGBBAA` | Bytecode and formatter lowercase the hex |
| Symbol | `$name` | Immutable |
| String | `"..."` | Unterminated → `SCDL-LEX-003` |
| Enum words | `CENTER`, `MIDPOINT`, `BRESENHAM`, `SUPERCOVER`, `THRESHOLD`, `OVER`, `REPLACE`, … | Closed sets in `scdl-v2.types.js` |

### 5.3 Tokenizer trivia

File: `codex/core/pixelbrain/scdl/v2/scdl-v2.tokenizer.js`.

- Token kinds: `WORD`, `SYMBOL`, `INTEGER`, `DECIMAL`, `COLOR`, `STRING`, `LBRACE`, `RBRACE`, `LPAREN`, `RPAREN`, `LBRACKET`, `RBRACKET`, `COMMA`, `WHITESPACE`, `NEWLINE`, `COMMENT`, `INVALID`, `EOF`.
- Leading BOM at offset 0 is emitted as `WHITESPACE`.
- `#` + 6 or 8 hex digits bounded by end-of-token → `COLOR` (value uppercased in the token, later canonicalized lowercase in bytecode).
- `#` followed by whitespace or EOL → `COMMENT` to end of line.
- Other `#…` → `INVALID` + `SCDL-LEX-002`.
- Illegal character → `SCDL-LEX-001`.
- Unterminated `"` → `SCDL-LEX-003`.
- `=>` is tokenized as `ARROW` (kind **not** listed in `TOKEN_KINDS`).
- `\d+\.\d+\.\d+` is a `WORD` (semver), not a decimal.
- `NOISE_2D` accepts aliases `COORD` → `AT` and `SCALE` → `FREQUENCY`.
- `RANGE` accepts positional start/end/[step] or `FROM`.

The tokenizer is lossless: trivia is preserved so `formatSCDLV2` can round-trip structure (comments are non-semantic and do not affect `programId`).

### 5.4 Parser recovery

File: `codex/core/pixelbrain/scdl/v2/scdl-v2.parser.js`.

The parser synchronizes at statement and block boundaries. It reports multiple independent errors when safe. It never invents missing semantic values. Unknown opcodes, omitted required operands, invalid literals, and malformed blocks fail closed.

Parser codes:

| Code | Meaning |
|---|---|
| `SCDL-PARSE-001` | Unknown opcode (includes lowercase `shape`, and bytecode-only mnemonics like `BC.CONST` used in source) |
| `SCDL-PARSE-002` | Expected token missing |
| `SCDL-PARSE-003` | Duplicate declaration |
| `SCDL-PARSE-004` | Missing required operand (e.g. `CIRCLE` without `RADIUS`) or missing `ASSET` / `CANVAS` |
| `SCDL-PARSE-005` | Duplicate named operand |
| `SCDL-PARSE-006` | Unknown named operand |
| `SCDL-PARSE-007` | Unbalanced block |

Required top-level: `SCDL`, `ASSET`, `CANVAS`. Optional: at most one `BUDGET`. Newlines are required after top-level statements. `parseSCDLV2` itself does not throw; `ParseAbort` is internal.

Statement bodies as parsed:

| Scope | Legal statements |
|---|---|
| LAYER | `PAINT`, `FOR`, `LET`, `IF` |
| SHAPE COMPOUND | `EMIT`, `FOR`, `RADIAL`, `LET`, `IF` |
| FUNCTION | `LET`, `RETURN`, `IF`, `MATCH`, `FOR` |

`PAINT` named keys: `FILL`, `RASTER` (default IDENT `CENTER`), `BLEND`, `CLIP_TO`, `MATERIAL`, `OPACITY`; `AT` is stored in `named`. Layer defaults after analysis: blend `OVER`, opacity `1.0`, visible `true`.

Analyzer IR on success:

```
{ assetId, canvas:{width,height}, requestedBudget,
  constants, shapes, masks, anchors, assertions, layers,
  sequences, functions, rngs,
  ampPlan, selectedAmps, explicitAmps, selectAmpsEnabled }
```

---

## 6. Closed type system

File: `codex/core/pixelbrain/scdl/v2/scdl-v2.types.js`. Adding a type requires a language-version bump.

```
BOOL I32 U32 FIXED RATIO PX ANGLE DURATION COLOR
VEC2 RECT RANGE SEQUENCE PALETTE PATH SHAPE MASK
TRANSFORM MATERIAL LAYER TIMELINE RNG
```

Unit and numeric partitions:

- `NUMERIC_TYPES` = `I32`, `FIXED`, `RATIO`, `PX`
- `SCALAR_TYPES` = `I32`, `FIXED`, `RATIO` (these may wrap into `PX`)
- `ANGLE_UNITS` constructors = `DEGREES`, `RADIANS`, `TURNS`
- `I32` range = `[-2147483648, 2147483647]` (`SCDL-TYPE-005` on overflow)

Type codes:

| Code | Meaning |
|---|---|
| `SCDL-TYPE-001` | Unknown type |
| `SCDL-TYPE-002` | Type mismatch (`expected` / `received` arrays populated) |
| `SCDL-TYPE-003` | Invalid operation for those types |
| `SCDL-TYPE-004` | Division by zero |
| `SCDL-TYPE-005` | Out of I32 range |

Bind codes:

| Code | Meaning |
|---|---|
| `SCDL-BIND-001` | Unknown `$symbol` |
| `SCDL-BIND-002` | Duplicate `$symbol` |

`TIMELINE` and `DURATION` are reserved types. There is no statement that constructs a timeline in this compiler. Do not author `TIMELINE idle { ... }` expecting Step 4 behavior.

Also unused as first-class analyzer values today: `PALETTE` (as a type; colors are still `#RRGGBB`), `PATH` as a type (PATH *shapes* exist via the `PATH` opcode). `U32` appears on opcode signatures (`CANVAS WIDTH`/`HEIGHT`, `BUDGET` fields); structural integers are evaluated as `I32`. Analyzer extra runtime tags `IDENT` and `STRING` are not in `SCDL_V2_TYPES`.

---

## 7. Opcode registry (frozen, exhaustive)

Inspect at runtime:

```js
import { listSCDLV2Opcodes, getSCDLV2Opcode } from './codex/core/pixelbrain/scdl/index.js';
```

Every opcode has a permanent numeric ID, mnemonic, legal scopes, named operands `(name, type, required)`, result type, purity (`PURE` / `CONSTRUCTION` / `DECLARATION`), cost `1`, capability, semantic version `2.0.0`, and docs string. Parser, formatter, and agent discovery derive from this table.

### 7.1 Program / construction statements

| ID | Mnemonic | Operands | Result | Capability |
|---|---|---|---|---|
| `0x0001` | `SCDL` | `VERSION:I32` | — | `CORE.MATH@2.0` |
| `0x0002` | `ASSET` | `ID:IDENT` | — | `CORE.MATH@2.0` |
| `0x0003` | `CANVAS` | `WIDTH:U32`, `HEIGHT:U32` | — | `GEOMETRY.STANDARD@2.0` |
| `0x0004` | `BUDGET` | `INSTRUCTIONS:U32`, `GENERATED_SHAPES:U32`, `RASTER_CELLS:U32`, `RECURSION_DEPTH:U32?` | — | `CORE.MATH@2.0` |
| `0x0010` | `CONST` | `SYMBOL`, `TYPE`, `VALUE` | — | `CORE.MATH@2.0` |
| `0x0020` | `SHAPE` | `SYMBOL`, `VALUE:SHAPE` | `SHAPE` | `GEOMETRY.STANDARD@2.0` |
| `0x0021` | `MASK` | `SYMBOL`, `VALUE:MASK` | `MASK` | `PAINT.MASKS@2.0` |
| `0x0030` | `LAYER` | `ID`, `ORDER:I32`, `BLEND?`, `OPACITY?`, `VISIBLE?`, `BODY:BLOCK` | `LAYER` | `PAINT.LAYERS@2.0` |
| `0x0031` | `PAINT` | `SHAPE`, `AT:VEC2?`, `FILL:COLOR`, `RASTER`, `BLEND?`, `CLIP_TO:MASK?`, `MATERIAL?`, `OPACITY?` | — | `PAINT.LAYERS@2.0` |
| `0x0040` | `ANCHOR` | `SYMBOL`, `ON:SHAPE`, `AT` | — | `GEOMETRY.STANDARD@2.0` |
| `0x0041` | `ASSERT` | `CONDITION` | — | `GEOMETRY.STANDARD@2.0` |
| `0x0050` | `FN` | `ID`, `PARAMS?`, `RETURNS:TYPE`, `RECURSION_MAX:I32?`, `BODY` | — | `CORE.MATH@2.0` |
| `0x0051` | `SEQUENCE` | `SYMBOL`, `TYPE`, `COUNT:I32`, `BODY` | `SEQUENCE` | `CORE.SEQUENCE@2.0` |
| `0x0052` | `RNG` | `SYMBOL`, `ALGORITHM:IDENT`, `SEED:I32` | `RNG` | `NOISE.DETERMINISTIC@2.0` |
| `0x0053` | `LET` | `SYMBOL`, `TYPE`, `VALUE` | — | `CORE.MATH@2.0` |
| `0x0054` | `RETURN` | `VALUE` | — | `CORE.MATH@2.0` |
| `0x0055` | `EMIT` | `VALUE` | — | `GEOMETRY.STANDARD@2.0` |
| `0x0056` | `FOR` | `VAR`, `IN`, `BODY` | — | `CORE.MATH@2.0` |
| `0x0057` | `IF` | `CONDITION`, `THEN`, `ELSE?` | — | `CORE.MATH@2.0` |
| `0x0058` | `MATCH` | `VALUE`, `CASES` | — | `CORE.MATH@2.0` |
| `0x0059` | `RADIAL` | `COUNT:I32`, `CENTER:VEC2?`, `RADIUS:PX?`, `BODY` | — | `GEOMETRY.PARAMETRIC@2.0` |
| `0x0060` | `APPLY_AMP` | `SYMBOL?`, `TYPE?`, `BODY` | `ANY` | `MATERIAL.PIXELBRAIN@2.0` |
| `0x0061` | `SELECT_AMPS` | `BODY?` | — | `MATERIAL.PIXELBRAIN@2.0` |

### 7.2 Arithmetic, vectors, logic, collections, noise

| ID | Mnemonic | Result law |
|---|---|---|
| `0x0100` | `ADD` | compatible numerics |
| `0x0101` | `SUB` | compatible numerics |
| `0x0102` | `MUL` | I32×I32, scalar×scalar, or PX×scalar |
| `0x0103` | `DIV` | numeric ÷ nonzero scalar; PX÷scalar stays PX, else RATIO; zero → `SCDL-TYPE-004` |
| `0x0104` | `MOD` | same numeric |
| `0x0105` | `POW` | same numeric |
| `0x0106` | `ABS` | same numeric |
| `0x0107` | `MIN` | same numeric |
| `0x0108` | `MAX` | same numeric |
| `0x0109` | `CLAMP` | same numeric |
| `0x010A` | `FLOOR` | `I32` |
| `0x010B` | `CEIL` | `I32` |
| `0x010C` | `ROUND` | `I32` |
| `0x010D` | `SQRT` | numeric, versioned deterministic |
| `0x010E` | `SIN` | `FIXED` from `ANGLE` |
| `0x010F` | `COS` | `FIXED` from `ANGLE` |
| `0x0110` | `PX` | wrap scalar → `PX` |
| `0x0111` | `VEC2` | two `PX` |
| `0x0112` | `TAN` | `FIXED` |
| `0x0113` | `ATAN2` | `ANGLE` |
| `0x0114` | `LERP` | same numeric |
| `0x0115` | `MAP_RANGE` | same numeric |
| `0x0116` | `GCD` | `I32` |
| `0x0117` | `LCM` | `I32` |
| `0x0118` | `DISTANCE` | `PX` |
| `0x0119` | `DOT` | scalar |
| `0x011A` | `CROSS` | 2D scalar |
| `0x011B` | `NORMALIZE` | `VEC2` |
| `0x0120`–`0x0125` | `EQ NEQ LT LTE GT GTE` | `BOOL` |
| `0x0126`–`0x0128` | `AND OR NOT` | `BOOL` (no truthiness) |
| `0x0130` | `RANGE` | `RANGE` (`START`, `END`, `STEP?`) |
| `0x0131` | `AT` | collection element |
| `0x0132` | `LENGTH` | `I32` |
| `0x0133` | `SUM` | numeric |
| `0x0134` | `PRODUCT` | numeric |
| `0x0135` | `FOLD` | **opcode+parser only** — analyzer `SCDL-TYPE-003` |
| `0x0136` | `MAP` | **opcode+parser only** — analyzer `SCDL-TYPE-003` |
| `0x0137` | `FILTER` | **opcode+parser only** — analyzer `SCDL-TYPE-003` |
| `0x0138` | `ZIP` | two collections |
| `0x0139` | `PREV` | recurrence history offset |
| `0x013A` | `CALL` | pure function |
| `0x0140` | `RANDOM_I32` | seeded |
| `0x0141` | `RANDOM_SCALAR` | seeded |
| `0x0142` | `RANDOM_VEC2` | seeded |
| `0x0143` | `NOISE_2D` | `AT`, `SEED`, `FREQUENCY?`, `OCTAVES?` |

### 7.3 Geometry, angles, transforms, CSG, masks, predicates

| ID | Mnemonic | Named operands |
|---|---|---|
| `0x0200` | `PIXEL` | `AT:VEC2` |
| `0x0201` | `CIRCLE` | `CENTER:VEC2`, `RADIUS:PX` |
| `0x0202` | `LINE` | `FROM:VEC2`, `TO:VEC2` |
| `0x0203` | `POLYLINE` | `POINTS:LIST<VEC2>` |
| `0x0204` | `RAY` | `ORIGIN:VEC2`, `DIR:VEC2`, `LENGTH:PX` |
| `0x0205` | `RECT` | `ORIGIN?` or `CENTER?`, `SIZE:VEC2` |
| `0x0206` | `ROUNDED_RECT` | as RECT + `CORNER_RADIUS:PX` |
| `0x0207` | `RING` | `CENTER`, `RADIUS`, `THICKNESS` |
| `0x0208` | `ELLIPSE` | `CENTER`, `RADIUS_X`, `RADIUS_Y` |
| `0x0209` | `ARC` | `CENTER`, `RADIUS`, `START:ANGLE`, `END:ANGLE` |
| `0x020A` | `SECTOR` | same as ARC |
| `0x020B` | `TRIANGLE` | `P1 P2 P3` |
| `0x020C` | `REGULAR_POLYGON` | `SIDES:I32`, `RADIUS:PX`, `CENTER:VEC2` |
| `0x020D` | `POLYGON` | `VERTICES:LIST<VEC2>` |
| `0x020E` | `STAR` | `POINTS:I32`, `INNER_RADIUS`, `OUTER_RADIUS`, `CENTER` |
| `0x020F` | `PATH` | `DATA:STRING` (SVG-compatible; arc flags pre-normalized) |
| `0x0210` | `DEGREES` | `VALUE:SCALAR` → `ANGLE` |
| `0x0211` | `RADIANS` | `VALUE:SCALAR` → `ANGLE` |
| `0x0212` | `TURNS` | `VALUE:SCALAR` → `ANGLE` |
| `0x0213` | `ROTATE` | `ANGLE`, `PIVOT:VEC2?` → `TRANSFORM` |
| `0x0214` | `TRANSLATE` | `OFFSET:VEC2` → `TRANSFORM` |
| `0x0215` | `SCALE` | `FACTOR:SCALAR`, `PIVOT:VEC2?` → `TRANSFORM` |
| `0x0216` | `TRANSFORM_COMPOSE` | `T1`, `T2` |
| `0x0217` | `TRANSFORM_APPLY` | `TRANSFORM`, `TARGET` |
| `0x0220` | `UNION` | shapes A, B |
| `0x0221` | `SUBTRACT` | A minus B |
| `0x0222` | `INTERSECT` | A ∩ B |
| `0x0223` | `XOR` | symmetric difference |
| `0x0224` | `OUTLINE` | `SHAPE`, `WIDTH:PX` |
| `0x0230` | `TO_MASK` | `SHAPE`, `RASTER?` |
| `0x0231` | `MASK_UNION` | |
| `0x0232` | `MASK_INTERSECT` | |
| `0x0233` | `MASK_SUBTRACT` | |
| `0x0234` | `MASK_INVERT` | invert within canvas bounds |
| `0x0240` | `ALIGN` | `TARGET`, `ANCHOR`, `TO`, `OFFSET?` |
| `0x0241` | `ANCHOR_OF` | `SHAPE`, `ANCHOR` → `VEC2` |
| `0x0242` | `BOUNDS` | → `RECT` |
| `0x0243` | `INSIDE` | point in target → `BOOL` |
| `0x0244` | `CONTAINS` | |
| `0x0245` | `TOUCHES` | |
| `0x0246` | `OVERLAPS` | |

CSG is **first-class shape algebra**. This is not v1 sibling-part `union a b`. Operand shapes do not become visible merely because another shape references them. CSG uses **cell-set** evaluation (`evaluateCSGToCells`), not analytic CAD. A shared last-writer-wins silhouette map is illegal here (that was the v1 overlap-deletion bug). `OUTLINE` is the 4-neighbor inner border of that cell set; the `WIDTH` / `align` fields are **stored and unused** at raster. Do not expect a thick outline from `WIDTH (PX 3)` yet.

Spatial predicates (`INSIDE`, `CONTAINS`, `TOUCHES`, `OVERLAPS`) are **AABB tests**, not true shape membership. `ASSERT (INSIDE $point $star)` is a bounding-box assertion.

`ALIGN` actually relocates origin/center only for `RECT`, `ROUNDED_RECT`, `CIRCLE`, `RING`, and `ELLIPSE`. Other kinds receive `alignedOffset` only.

`MASK_INVERT` without an explicit canvas uses a **default 32×32 origin-0** invert, not necessarily the program canvas. Invert against the declared `CANVAS` size in tests before trusting clip results on other sizes.

Transforms: 2×3 affine. Cardinal and 45° `SIN`/`COS` are exact. Other angles use `Math.sin`/`Math.cos` quantized to `1e9`. **Bytecode `lowerTransform` currently emits `TRANSLATE` from `tx`/`ty` only** — scale/rotate matrix components `a,b,c,d` on a `TRANSFORMED_SHAPE` are dropped at lowering. Prefer painting with `AT` plus explicit `ROTATE`/`SCALE` opcodes that the evaluator still interprets, and golden-test any rotated geometry.

`RADIAL` parses `RADIUS` and **ignores it**. Radial placement uses `COUNT` + `CENTER` (implicit `$index`). `MATCH` is analyzed in **function bodies only**, not in `SHAPE` / `LAYER` blocks.

Geometry diagnostics:

| Code | Meaning |
|---|---|
| `SCDL-GEOM-000` | Internal raster/compositor catch |
| `SCDL-GEOM-001` | Degenerate parameter / bad raster policy-input combo |
| `SCDL-GEOM-002` | `ASSERT` failed |
| `SCDL-GEOM-003` | Anchor failed |
| `SCDL-GEOM-004` | Singular transform |
| `SCDL-GEOM-005` | Unsupported raster policy |
| `SCDL-GEOM-006` | Unsupported composite mode |
| `SCDL-GEOM-007` | Path syntax error |
| `SCDL-GEOM-008` | Malformed polygon |
| `SCDL-GEOM-009` | Out of bounds |

### 7.4 Bytecode-only mnemonics (illegal in source)

Using these in `.scdl` is `SCDL-PARSE-001`.

`BC.CALL`, `BC.SEQ.RECURRENCE`, `BC.RNG.INIT`, `BC.RNG.SAMPLE`, and `BC.MATH` are **registered but never emitted** by the current lowerer. Generative math is folded at analyze time into interned constants / shape IR. If those bytecode ops appear, the evaluator returns `SCDL-LOWER-001`. The evaluator file header that still says “only PIXEL/CIRCLE” is stale; the switch implements the geometry catalog above.

| ID | Mnemonic |
|---|---|
| `0x8000` | `BC.CONST` |
| `0x8001` | `BC.LAYER.NEW` |
| `0x8002` | `BC.PAINT` |
| `0x8003` | `BC.EMIT.ASSET` |
| `0x8010` | `BC.CALL` |
| `0x8011` | `BC.SEQ.RECURRENCE` |
| `0x8012` | `BC.RNG.INIT` |
| `0x8013` | `BC.RNG.SAMPLE` |
| `0x8014` | `BC.MATH` |
| `0x8020` | `BC.AMP.APPLY` |
| `0x8021` | `BC.AMP.SELECT` |

### 7.5 Not in the registry (do not author)

`REQUIRES`, `IMPORT`, `TIMELINE`, `CLIP`, `TRACK`, `KEYFRAME`, `FORMULA`, `POSE`, `VISIBILITY`, `VARIANT`, `EVENT`, `FLOOR`/`CEIL`/`NEAREST_EVEN`/`AWAY_FROM_ZERO` as **rounding-policy operands on PAINT** (the math opcodes `FLOOR`/`CEIL`/`ROUND` exist; raster rounding policies are the five named policies below). Glyph resources, content-addressed imports, and Fibonacci-spiral *opcodes* are not first-class; Fibonacci is expressed with `SEQUENCE` + geometry.

---

## 8. Raster policies, compositing, layers

Closed raster policies (`RASTER_POLICIES`) — **names vs what the rasterizer actually does**:

| Policy | Algorithm id | What actually happens today |
|---|---|---|
| `CENTER` | `CIRCLE-FILL-CENTER-v1` | CIRCLE: exact rational disk. PIXEL: integral x/y only. Other filled shapes use their dedicated fill (rect floor-span, ellipse, polygon scanline). |
| `MIDPOINT` | `CIRCLE-FILL-MIDPOINT-v1` | **CIRCLE only**, and only when center and radius are integral. CIRCLE+MIDPOINT with a fractional center fails. |
| `BRESENHAM` | `LINE-BRESENHAM-v1` | LINE with width ≤ 1 (unless SUPERCOVER). POLYLINE and RAY always Bresenham. **CIRCLE + BRESENHAM is unsupported** (does not take the MIDPOINT/CENTER branches). |
| `SUPERCOVER` | `POLY-SUPERCOVER-v1` | LINE width ≤ 1 and open PATH segments. |
| `THRESHOLD` | named in the closed set | **No algorithm branch.** CIRCLE+THRESHOLD fails as an unsupported shape. Do not author it. |

PIXEL requires integral `PX` under both CENTER and MIDPOINT. Last write wins per cell after blend. Out-of-canvas cells drop. Emitted coordinates are sorted **y-major, x-minor**.

Closed composite modes (`COMPOSITE_MODES`): `OVER`, `ADD`, `SUBTRACT`, `MULTIPLY`, `MASK_IN`, `MASK_OUT`, `REPLACE`.

Layer laws:

- Layers sort by ascending `ORDER`; source order breaks ties.
- Integer channel math `0..255` with deterministic rational opacity scaling.
- `CLIP_TO <mask>` restricts rasterization to enabled mask cells.
- `AT <vec2>` translates painting without mutating the shape value.
- Canvas coordinates are integers. Out-of-bounds cells clip. No hidden anti-aliasing.

Rectangles are half-open on the lattice. Cardinal and 45° `SIN`/`COS` are exact.

---

## 9. Exact rationals

File: `codex/core/pixelbrain/scdl/v2/scdl-v2.rational.js`.

Public shape: `{ numerator: string, denominator: string }`, reduced, strictly positive denominator, JSON-safe. Internals use `BigInt`.

```
1.250 → 5/4
-0.125 → -1/8
```

`makeRational` refuses a zero denominator (`RangeError` internally; public compiler stages catch and convert to diagnostics). Floating-point (`rationalToNumber`) exists for display/debug only and **must not** decide lattice membership or `programId`.

---

## 10. Compiler pipeline (v2)

```text
SCDL 2 source
        │
        ▼ detectSCDLVersion          exact header only
tokenizeSCDLV2                       lossless tokens + trivia + spans
        │
        ▼ parseSCDLV2                recoverable CST + strict AST
analyzeSCDLV2                        bind, closed types, exact constant eval, AMP plan
        │
        ▼ verifySCDLV2Budget         static demand vs protected / requested limits
                                     (failure never lowers or evaluates)
lowerSCDLV2Bytecode                  canonical SCDL-BC-v2 text + instruction objects
        │
        ▼ evaluateSCDLV2             bounded interpreter of instruction objects
                                     (never re-parses bytecode.text)
AMP conveyor PRE                     SOURCE_ANALYSIS → … → LAYER_POST
        │
        ▼ rasterizeSCDLV2            geometry catalog + CSG/masks + raster policies
emitSCDLV2Package                    PixelBrainAssetPacket + SCDL-PACKAGE-v2
        │
        ▼ AMP conveyor POST          PACKET_POST → RENDER → TIMELINE →
                                     RUNTIME_DESCRIPTOR → WORLD_DESCRIPTOR
```

Implementation files, all under `codex/core/pixelbrain/scdl/v2/`:

| Stage | File |
|---|---|
| Version | `scdl-v2.version.js` |
| Lex | `scdl-v2.tokenizer.js` |
| Parse | `scdl-v2.parser.js` |
| Types | `scdl-v2.types.js` |
| Analyze | `scdl-v2.analyzer.js` |
| Budget | `scdl-v2.budget.js` |
| Bytecode | `scdl-v2.bytecode.js` |
| Evaluate | `scdl-v2.evaluator.js` |
| Geometry | `scdl-v2.geometry.js` |
| Transforms | `scdl-v2.transforms.js` |
| Booleans | `scdl-v2.booleans.js` |
| Masks | `scdl-v2.masks.js` |
| Anchors | `scdl-v2.anchors.js` |
| Layers | `scdl-v2.layers.js` |
| Compositing | `scdl-v2.compositing.js` |
| Generative | `scdl-v2.generative.js` |
| Raster | `scdl-v2.raster.js` |
| Emit | `scdl-v2.emit.js` |
| Format | `scdl-v2.formatter.js` |
| Diagnostics | `scdl-v2.diagnostics.js` |
| Orchestrator | `scdl-v2.compiler.js` |
| AMP ABI | `scdl-v2.amp-abi.js` |
| AMP catalog | `scdl-v2.amp-catalog.js` |
| AMP stages | `scdl-v2.amp-stages.js` |
| AMP relevance | `scdl-v2.amp-relevance.js` |
| AMP certify | `scdl-v2.amp-certify.js` |

Public `compileSCDLV2` wraps every stage in `try/catch` and converts unexpected throws to `SCDL-EMIT-999`.

### 10.1 Public result contract (`SCDL-COMPILE-RESULT-v2`)

Successful and failed results share:

```
contract: 'SCDL-COMPILE-RESULT-v2'
languageVersion: 2
compilerVersion: '2.0.0'
cst, ast
errors                  frozen SCDLV2Diagnostic[] (isError/isWarn/isInfo/toJSON)
diagnostics             JSON-safe list
diagnosticReport        { contract: 'SCDL-DIAGNOSTICS-v2', ok, languageVersion, compilerVersion, diagnostics }
frameLoop: null
regressionSeed          { source, options, checksum }
```

On success additionally:

```
ok: true
analysis
bytecode                SCDL-BC-v2 object including .text and .programId
package                 SCDL-PACKAGE-v2
packet                  pixelbrain.asset.v1
ampPlan, ampDescriptors
framePackets            frozen [packet]   // one packet this milestone
```

On failure: `ok: false`, `analysis = bytecode = package = packet = null`, `ampPlan = []`, `ampDescriptors = []`, `framePackets = []`.

### 10.2 Package contract (`SCDL-PACKAGE-v2`)

```
contract, programId, bytecode, verifiedBudget
construction            immutable Shape/Mask/Layer IR
layers                  composited raster layers
framePackets            [packet]
animation: null
ampPlan, ampDescriptors
exportManifest.targets  ['json','svg','phaser','png','aseprite']
```

Packet id: `pbasset_` + eight hex digits of `bytecode.programId` (`scdlbc_<hex>`). JSON/PNG exporters consume the packet; they do not re-author geometry. Bytecode authority on the packet is `SCDL-BC-v2`.

### 10.3 Diagnostic envelope (`SCDL-DIAGNOSTICS-v2`)

Each diagnostic JSON:

```
code, severity, phase, message
span: { start: {line, column, offset}, end: {…} }   // 1-based line/column
instructionPath, expected[], received[], relatedSymbols[], fixes[]
```

`fixes` are advisory. The compiler never applies them. CLI `check` prints `result.errors` (the class instances), not a reconstructed loc-only list. `buildSCDLDiagnosticReport` labels the source `SCDL-v2` when `languageVersion === 2`. v2 diagnostics set `bytecodeString` to **null**; `--bytecode` will not append a PB-ERR-v1 blob for v2 errors the way it does for v1.

Diagnostic families in use:

```
SCDL-LEX-*      SCDL-PARSE-*     SCDL-BIND-*     SCDL-TYPE-*
SCDL-TERM-*     SCDL-BUDGET-*    SCDL-GEOM-*     SCDL-AMP-*
SCDL-LOWER-*    SCDL-EMIT-*
```

`SCDL-ANIM-*` is reserved by the architecture and unused (Step 4 unshipped).

**Known code collision:** `TERM_CODES.MUTUAL_RECURSION` and `TERM_CODES.INVALID_CONTROL_FLOW` are both `SCDL-TERM-004` in `scdl-v2.types.js`. Treat `SCDL-TERM-004` as “control-flow/termination illegal”; read `message` to distinguish.

Termination codes:

| Code | Meaning |
|---|---|
| `SCDL-TERM-001` | Uncapped recursion (`FN` recursive without `RECURSION_MAX`) |
| `SCDL-TERM-002` | Recursion depth exceeded (`RECURSION_MAX > 256` or runtime stack) |
| `SCDL-TERM-003` | Unbounded collection |
| `SCDL-TERM-004` | Mutual recursion **or** invalid control flow |

AMP codes:

| Code | Meaning |
|---|---|
| `SCDL-AMP-001` | Unknown AMP id |
| `SCDL-AMP-002` | Stage mismatch vs manifest |
| `SCDL-AMP-003` | Missing required input |
| `SCDL-AMP-004` | Parameter out of bounds / invalid |
| `SCDL-AMP-005` | AMP type mismatch |
| `SCDL-AMP-006` | AMP budget exceeded |
| `SCDL-AMP-007` | Adapter execution failed (caught; compile fails closed) |
| `SCDL-AMP-008` | Relevance evaluation failed |
| `SCDL-AMP-009` | Manifest invalid |
| `SCDL-AMP-010` | Version mismatch |
| `SCDL-AMP-011` | Unknown input name in `APPLY_AMP` |

Lowering/eval: `SCDL-LOWER-001` = unknown opcode / missing register / wrong runtime type; `SCDL-LOWER-000` = internal; `SCDL-EMIT-999` = orchestrator catch-all.

---

## 11. Budgets

Defaults (`DEFAULT_SCDL_V2_LIMITS`):

```
INSTRUCTIONS      200000
GENERATED_SHAPES  10000
RASTER_CELLS      1048576
RECURSION_DEPTH   64
```

Host ceilings (`HOST_SCDL_V2_CEILINGS`): same for the first three fields; recursion ceiling is **256**. Source `BUDGET` may **lower** a field. Requesting above the host ceiling is `SCDL-BUDGET-001` and stops **before** demand is measured. Measured static demand above the effective budget is `SCDL-BUDGET-002`. Both gates run before bytecode lowering.

Runtime evaluate/raster may still fire `SCDL-BUDGET-003`.

Static demand counting:

- Conservative upper bound: does **not** share repeated literals (real bytecode interned count is always ≤ this estimate).
- `CONST` whose value is a `SHAPE` counts through `countShapeNodes`.
- All `CONST`/`SHAPE` declarations count toward demand (including CONST-typed SHAPE values).
- Dead shapes that no `PAINT` reaches still cost **budget** in the static pass as implemented for declarations; bytecode lowering itself walks only reachable LAYER/PAINT. Pilot authors should not “hide” work in unused `SHAPE`s expecting it to be free.

The architecture mentions `FRAMES 240`. That field is **not** in `BUDGET` operands today.

Host override exists: `compileSCDLV2(source, { limits: { … } })` merges onto `DEFAULT_SCDL_V2_LIMITS` before the source `BUDGET` overlay. Source still cannot raise a field above `HOST_SCDL_V2_CEILINGS`. Analyzer default call-stack `maxDepth` is 64, overwritten by source `BUDGET RECURSION_DEPTH`.

---

## 12. Canonical bytecode and identity

Contract: `SCDL-BC-v2`. Language `2.0`. Semantics `2.0.0`.

Always-declared capabilities, in this order:

```
CORE.MATH@2.0
GEOMETRY.STANDARD@2.0
PAINT.LAYERS@2.0
```

Additional capabilities are appended when used: `GEOMETRY.PATH@2.0`, `PAINT.MASKS@2.0`, `MATERIAL.PIXELBRAIN@2.0`, plus others recorded from opcodes (`CORE.SEQUENCE@2.0`, `NOISE.DETERMINISTIC@2.0`, `GEOMETRY.PARAMETRIC@2.0`).

Algorithms emitted when used:

```
rational=RAT-REDUCED-v1
circle.center=CIRCLE-FILL-CENTER-v1
circle.midpoint=CIRCLE-FILL-MIDPOINT-v1
```

Identity:

```
programId = 'scdlbc_' + hashString(bytecode.text).toString(16).padStart(8, '0')
```

`bytecode.text` always terminates with a canonical LF. Comments, whitespace, asset label, and local `$symbol` spelling do **not** change this text. Leaf constants are interned by `(type, canonical text)`. Composite constructors (`VEC2`, `PIXEL`, `CIRCLE`, …) are **not** interned.

Lowering walks LAYER/PAINT in ascending order (ties: declaration order), depth-first, named operands in registry order. SSA: each value-producing instruction gets the next `%N`.

`formatSCDLV2` laws relevant to identity: integers canonical base-10, decimals trimmed, colors **lowercase**. `format` is v2-only; v1 source is refused.

Live `scdl check` identities (2026-09-07, this tree):

| Fixture | `programId` | Packet | Coordinates |
|---|---|---|---:|
| `exact-orb.scdl` | `scdlbc_98042e1f` | `pbasset_98042e1f` | 14 |
| `void-sigil.scdl` | `scdlbc_54845e34` | `pbasset_54845e34` | 156 |
| `fibonacci-bloom.scdl` | `scdlbc_64c9884a` | `pbasset_64c9884a` | 32 |

If a pilot compile of those fixtures produces a different `programId`, the compiler changed and the pilot is invalid until the delta is explained. The exact-orb bytecode dump remains in the compiler white paper §11.7.

---

## 13. Universal AMP substrate (`PB-AMP-ABI-v1`)

### 13.1 Manifest schema

Every cataloged AMP must declare:

```
contract: "PB-AMP-ABI-v1"          # exact
ampId:    /^[a-z0-9]+(\.[a-z0-9_-]+)+$/
version:  semver \d+\.\d+\.\d+
execution: COMPILE | ANALYZE | DESCRIPTOR
stage:     one of the 12 fixed stages
scope:     non-empty subset of PROGRAM, ASSET, SHAPE, LAYER, MASK, TIMELINE
inputs[]:  { name, type, required, description }
parameters[]: { name, type, required, min, max, default, enum, description }
output:    { type, description }
determinism: { class: PURE|SEEDED|CONTEXTUAL, seedRequired }
cost:      { model, multiplier, fixed }
order:     integer (stable within a stage)
relevance: { pipelines[], conditions[] }
checksum:  64-char hex SHA-256 of canonicalAmpAbiJSON(manifest)
```

Canonical JSON sorts input/parameter names, sorts scope, normalizes defaults, and is the checksum input. Tampering with `checksum` without updating the body fails `--check-abi`.

Execution classes (48 registered today: **COMPILE 30**, **ANALYZE 2**, **DESCRIPTOR 16**):

- `COMPILE` — pure bounded compiler pass; may rewrite construction/layers. **Illegal** on `RUNTIME_DESCRIPTOR` / `WORLD_DESCRIPTOR`.
- `ANALYZE` — compile-time only when its declared resource input is present. Today: `pixelbrain.image-segmentation`, `pixelbrain.neighbor-extrapolation`.
- `DESCRIPTOR` — emits an immutable runtime/world descriptor; does not force SCDL to run at playback. **Legal only** on `RUNTIME_DESCRIPTOR` / `WORLD_DESCRIPTOR`.

Cost models: `CONSTANT`, `LINEAR_IN_CELLS`, `QUADRATIC_IN_CELLS`, `PER_SAMPLE`.

The only `SEEDED` AMP (with `seedRequired: true`) is `pixelbrain.noise-fill`. Every other shipped AMP is `PURE`.

### 13.2 Twelve-stage conveyor belt

Immutable order (`AMP_STAGES`):

```
SOURCE_ANALYSIS
CONSTRUCTION
SHAPE_PRE
SHAPE_POST
MASK
PAINT
LAYER_POST
PACKET_POST
RENDER
TIMELINE
RUNTIME_DESCRIPTOR
WORLD_DESCRIPTOR
```

Within a stage: ascending `order`, then `ampId` lexicographic, then original index. AMPs cannot reorder themselves. `buildConveyorBelt` throws on unknown stage names (catalog/CLI validate before that).

Dispatch split in `compileSCDLV2`:

- **Pre-raster** (0–6): SOURCE_ANALYSIS … LAYER_POST, **except** `source === 'EXPLICIT_APPLY'` at `SHAPE_PRE`/`SHAPE_POST` (those are bound into the value / `BC.AMP.APPLY` and must not run twice).
- Rasterize + emit packet.
- **Post-raster** (7–11): PACKET_POST … WORLD_DESCRIPTOR.

`DESCRIPTOR` execution (or stages `RUNTIME_DESCRIPTOR` / `WORLD_DESCRIPTOR`) pushes adapter output onto `ampDescriptors`.

**Empty stages today.** No registered AMP uses `SHAPE_PRE`, `PACKET_POST`, or `TIMELINE`. Those stages exist so later migrations and Step 4 animation can slot in without reordering the belt. A pilot that `APPLY_AMP`s `STAGE SHAPE_PRE` against a current AMP will get `SCDL-AMP-002`.

**Nothing runs by default.** If the source contains neither `APPLY_AMP` nor `SELECT_AMPS`, the catalog is entirely dormant (`skipReason`: `Relevance selection not requested (SELECT_AMPS omitted)`). Explicit `APPLY_AMP` always activates that AMP regardless of relevance. `SELECT_AMPS` enables pipeline/condition matching.

Adapters under `v2/adapters/` are **self-contained** `execute(inputs, params, context)` objects. They do **not** import `codex/core/pixelbrain/*-amp.js`. That is the truthful-adapter law in code: the old foundry gates on `spec.class` / `spec.archetype` are not in the v2 path.

### 13.3 Invocation from source

**Explicit:**

```scdl
APPLY_AMP $gem SHAPE {
  AMP pixelbrain.facet
  VERSION 1.0.0
  STAGE SHAPE_POST
  INPUT geometry $raw
  PARAM facetCount 8
}
```

Block keywords inside `APPLY_AMP { }` are **only** `AMP`, `VERSION`, `STAGE`, `INPUT`, `PARAM`. `$target` and the output type are optional. If `VERSION` is omitted, analysis defaults to `'1.0.0'`. Major-version mismatch with the manifest is `SCDL-AMP-010`.

Unknown AMP → `SCDL-AMP-001`. Wrong stage vs manifest → `SCDL-AMP-002`. Missing required input → `SCDL-AMP-003`. Param out of range (e.g. `facetCount 100` when max is 32) or enum mismatch → `SCDL-AMP-004`. Unknown input name → `SCDL-AMP-011`.

**Relevance selection:**

```scdl
SELECT_AMPS PIPELINE render-fidelity
```

or block form `{ PIPELINE render-fidelity STAGE LAYER_POST }`. Legal keys: `PIPELINE`, `STAGE` only.

Known pipelines in shipped manifests: `item`, `render-fidelity`, `character`, `image-lattice`, `world-voxel`, `runtime`.

Irrelevant AMPs remain `source: 'DORMANT'` with a recorded `skipReason`. Selected AMPs record `activationReason`. The full plan is frozen into the package and (for explicit applies) into `BC.AMP.APPLY` / `BC.AMP.SELECT`.

### 13.4 Certification harness

`certifyAmp(manifest, adapter, sampleFixture)` / `certifyAllRegisteredAmps()` checks:

1. Manifest schema (`validateAmpAbiManifest`).
2. SHA-256 checksum present and matching `computeAmpAbiChecksum`. (`validateAmpAbiManifest` itself does **not** require `checksum`; `--check-abi` and `certifyAmp` do.)
3. Adapter has `execute(inputs, params, context)`.
4. Bit-for-bit determinism on two identical calls; inputs must not be mutated.
5. Output conforms to declared type (`SHAPE` / `LAYER` / `DESCRIPTOR` / numeric / `ANY` / …).
6. **Truthful interface:** output must not contain fabricated `archetype`, `class === 'armor'`, `item-spec`, `spec.class`, or `spec.archetype` (§17.3 of the architecture).
7. Cost-model scaling: known model, non-negative `multiplier`/`fixed`, monotonic at 0/10/100 cells; empirical execute at scaled 10/50/200 mock inputs must not throw or return null.
8. Dormancy invariance: `evaluateAmpRelevance` on a mismatched stage must return `relevant: false` with a non-empty `reason`.

`certified` is true only if every check passed.

### 13.5 CLI AMP commands

```bash
npm run scdl -- amps list
npm run scdl -- amps list --json
npm run scdl -- amps describe pixelbrain.facet
npm run scdl -- amps describe pixelbrain.facet --json
npm run scdl -- amps validate
npm run scdl -- amps plan path/to/file.scdl
npm run scdl -- amps plan path/to/file.scdl --json
```

`list` returns **48** manifests. That is the live registered set. `validate` prints `All 48 manifest(s) valid.` `plan` requires parse+analyze of a v2 file.

### 13.6 Catalog gates

```bash
npm run effects:check
# EFFECT_CATALOG.md is current (54 modules, 48 ABI compatible).

node scripts/pixelbrain-effect-catalog.mjs --check-abi
# All 48 PB-AMP-ABI-v1 manifests are valid.
```

`EFFECT_CATALOG.md` is generated. Do not hand-edit. `--check` fails CI when ABI is invalid, when JSON checksums drift from `ANCHOR_MANIFESTS` in `amp-manifests/index.js`, or when the markdown no longer matches the tree. Status column (`WIRED`/`GEN`/`TEST-ONLY`/`ORPHAN`) is import-graph liveness, **not** SCDL ABI. `amp-registry.js` is not the denominator.

Catalog matching rule (`buildEffectCatalog`): module basename minus `-amp` / `.processor` / `.microprocessor` is compared to `pixelbrain.<basename>`. Side effect: `volume.microprocessor.js` is tagged COMPILE via `pixelbrain.volume`, **not** `pixelbrain.volume-processor` (that id is a separate DESCRIPTOR AMP). Do not “fix” this by renaming without regenerating the catalog.

### 13.7 Complete shipped AMP table (48)

Order is conveyor `order` (ties broken by `ampId`). `*` = required input. Pipelines from `relevance.pipelines`.

| order | ampId | class | stage | det. | out | pipelines | inputs | params |
|---:|---|---|---|---|---|---|---|---|
| 10 | `pixelbrain.image-segmentation` | ANALYZE | SOURCE_ANALYSIS | PURE | LAYER | image-lattice | `target*:LAYER` | `minRegionSize:I32` |
| 12 | `pixelbrain.neighbor-extrapolation` | ANALYZE | SOURCE_ANALYSIS | PURE | LAYER | image-lattice | `target*:LAYER` | `iterations:I32` |
| 20 | `pixelbrain.sketch` | COMPILE | CONSTRUCTION | PURE | SHAPE | item | `geometry*:SHAPE` | `bands:I32` |
| 30 | `pixelbrain.geometry` | COMPILE | SHAPE_POST | PURE | SHAPE | item, render-fidelity | `geometry*:SHAPE` | `classifyRoles:BOOL` |
| 35 | `pixelbrain.sdf-shape` | COMPILE | SHAPE_POST | PURE | SHAPE | item | `geometry*:SHAPE` | `threshold:FIXED` |
| 36 | `pixelbrain.hair-flow` | COMPILE | SHAPE_POST | PURE | SHAPE | character | `geometry*:SHAPE` | `direction:ANGLE`, `strands:I32` |
| 38 | `pixelbrain.gravity` | COMPILE | SHAPE_POST | PURE | SHAPE | character | `geometry*:SHAPE` | `steps:I32`, `energyType:ANY` |
| 40 | `pixelbrain.facet` | COMPILE | SHAPE_POST | PURE | SHAPE | item, render-fidelity | `geometry*:SHAPE` | `facetCount:I32` |
| 41 | `pixelbrain.chestplate` | COMPILE | SHAPE_POST | PURE | SHAPE | item | `geometry*:SHAPE` | `tier:I32`, `profile:ANY` |
| 42 | `pixelbrain.chestplate-bevel` | COMPILE | SHAPE_POST | PURE | SHAPE | item | `geometry*:SHAPE` | `depth:I32` |
| 42 | `pixelbrain.shield-rim` | COMPILE | SHAPE_POST | PURE | SHAPE | item | `geometry*:SHAPE` | `thickness:I32` |
| 43 | `pixelbrain.shield-volume` | COMPILE | SHAPE_POST | PURE | SHAPE | item | `geometry*:SHAPE` | `curvature:FIXED` |
| 44 | `pixelbrain.crystal-core` | COMPILE | SHAPE_POST | PURE | SHAPE | item, render-fidelity | `geometry*:SHAPE` | `resonance:FIXED` |
| 45 | `pixelbrain.symmetry` | COMPILE | SHAPE_POST | PURE | SHAPE | item | `geometry*:SHAPE` | `axis:ANY` |
| 46 | `pixelbrain.flame-tip` | COMPILE | SHAPE_POST | PURE | SHAPE | item | `geometry*:SHAPE` | `intensity:FIXED` |
| 47 | `pixelbrain.jewelry` | COMPILE | SHAPE_POST | PURE | SHAPE | item | `geometry*:SHAPE` | `cut:ANY`, `gemType:MATERIAL` |
| 48 | `pixelbrain.heraldry` | COMPILE | SHAPE_POST | PURE | SHAPE | item | `geometry*:SHAPE` | `charge:ANY`, `division:ANY` |
| 48 | `pixelbrain.noise-mask` | COMPILE | MASK | PURE | MASK | world-voxel | `mask*:MASK` | `cutoff:FIXED` |
| 49 | `pixelbrain.vector` | COMPILE | SHAPE_POST | PURE | SHAPE | render-fidelity, item | `geometry*:SHAPE` | `subdivide:I32` |
| 50 | `pixelbrain.region-fill` | COMPILE | PAINT | PURE | LAYER | item, render-fidelity | `target*:LAYER` | `material:MATERIAL`, `anchor:ANY` |
| 50 | `pixelbrain.volume` | COMPILE | SHAPE_POST | PURE | SHAPE | render-fidelity | `geometry*:SHAPE` | `depth:I32`, `lightZ:FIXED` |
| 52 | `pixelbrain.chestplate-surface-texture` | COMPILE | PAINT | PURE | LAYER | item | `target*:LAYER` | `roughness:FIXED` |
| 54 | `pixelbrain.holyfire-motif` | COMPILE | PAINT | PURE | LAYER | item | `target*:LAYER` | `radiance:FIXED` |
| 56 | `pixelbrain.scholomance-character-motif` | COMPILE | PAINT | PURE | LAYER | character | `target*:LAYER` | `school:MATERIAL`, `intensity:FIXED` |
| 60 | `pixelbrain.noise-fill` | COMPILE | PAINT | SEEDED | LAYER | item, render-fidelity | `target*:LAYER` | `seed:I32`, `frequency:FIXED` |
| 70 | `pixelbrain.pixel-aa` | COMPILE | LAYER_POST | PURE | LAYER | render-fidelity | `layer*:LAYER` | `strength:FIXED` |
| 72 | `pixelbrain.shadow` | COMPILE | LAYER_POST | PURE | LAYER | render-fidelity | `layer*:LAYER` | `elevation:I32`, `angle:ANGLE`, `opacity:FIXED` |
| 74 | `pixelbrain.square-sharpness-contrast` | COMPILE | LAYER_POST | PURE | LAYER | render-fidelity | `layer*:LAYER` | `sharpness:FIXED` |
| 75 | `pixelbrain.selout` | COMPILE | LAYER_POST | PURE | LAYER | item, render-fidelity | `layer*:LAYER` | `lightAngle:ANGLE`, `threshold:FIXED` |
| 76 | `pixelbrain.tonation` | COMPILE | LAYER_POST | PURE | LAYER | render-fidelity | `layer*:LAYER` | `warmth:FIXED`, `contrast:FIXED` |
| 80 | `pixelbrain.palette-quantization` | COMPILE | LAYER_POST | PURE | LAYER | render-fidelity | `layer*:LAYER` | `colors:I32`, `dither:BOOL` |
| 85 | `pixelbrain.pixel-scale` | COMPILE | RENDER | PURE | LAYER | image-lattice | `layer*:LAYER` | `scale:I32`, `mode:ANY` |
| 100 | `pixelbrain.biome-coherence` | DESCRIPTOR | WORLD_DESCRIPTOR | PURE | ANY | world-voxel | `targetId:ANY` | `coherenceThreshold:FIXED` |
| 101 | `pixelbrain.volume-lift` | DESCRIPTOR | WORLD_DESCRIPTOR | PURE | ANY | world-voxel | `targetId:ANY` | `liftHeight:I32` |
| 102 | `pixelbrain.hollowness` | DESCRIPTOR | WORLD_DESCRIPTOR | PURE | ANY | world-voxel | `targetId:ANY` | `innerRadius:I32` |
| 103 | `pixelbrain.chunks-seam` | DESCRIPTOR | WORLD_DESCRIPTOR | PURE | ANY | world-voxel | `targetId:ANY` | `seamMargin:I32` |
| 104 | `pixelbrain.school-tag` | DESCRIPTOR | WORLD_DESCRIPTOR | PURE | ANY | world-voxel | `targetId:ANY` | `school:MATERIAL` |
| 105 | `pixelbrain.grass` | DESCRIPTOR | WORLD_DESCRIPTOR | PURE | ANY | world-voxel | `targetId:ANY` | `bladeDensity:FIXED` |
| 106 | `pixelbrain.biome-material` | DESCRIPTOR | WORLD_DESCRIPTOR | PURE | ANY | world-voxel | `targetId:ANY` | `biome:ANY` |
| 107 | `pixelbrain.material-resolver` | DESCRIPTOR | WORLD_DESCRIPTOR | PURE | ANY | world-voxel | `targetId:ANY` | `fallback:MATERIAL` |
| 108 | `pixelbrain.iso-tile-geometry` | DESCRIPTOR | WORLD_DESCRIPTOR | PURE | ANY | world-voxel | `targetId:ANY` | `tileWidth:I32`, `tileHeight:I32` |
| 109 | `pixelbrain.tile-socket` | DESCRIPTOR | WORLD_DESCRIPTOR | PURE | ANY | world-voxel | `targetId:ANY` | `socketMask:I32` |
| 110 | `pixelbrain.gear-glide` | DESCRIPTOR | RUNTIME_DESCRIPTOR | PURE | ANY | runtime | `targetId:ANY` | `bpm:I32`, `degreesPerBeat:I32` |
| 110 | `pixelbrain.volume-processor` | DESCRIPTOR | WORLD_DESCRIPTOR | PURE | ANY | world-voxel | `targetId:ANY` | `subsample:I32` |
| 111 | `pixelbrain.heightmap` | DESCRIPTOR | WORLD_DESCRIPTOR | PURE | ANY | world-voxel | `targetId:ANY` | `maxElevation:I32` |
| 112 | `pixelbrain.fibonacci-field` | DESCRIPTOR | RUNTIME_DESCRIPTOR | PURE | ANY | world-voxel | `targetId:ANY` | `count:I32`, `goldenAngle:FIXED` |
| 113 | `pixelbrain.fibonacci-seed-field` | DESCRIPTOR | RUNTIME_DESCRIPTOR | PURE | ANY | world-voxel | `targetId:ANY` | `seed:I32`, `points:I32` |
| 114 | `pixelbrain.perlin-field` | DESCRIPTOR | RUNTIME_DESCRIPTOR | PURE | ANY | world-voxel | `targetId:ANY` | `scale:FIXED`, `octaves:I32` |

Each AMP has:

- Manifest JSON: `codex/core/pixelbrain/scdl/v2/amp-manifests/pixelbrain.<name>.amp.json`
- Static browser-safe copy: `amp-manifests/index.js` (`ANCHOR_MANIFESTS`)
- Adapter: `codex/core/pixelbrain/scdl/v2/adapters/<name>.adapter.js`

Catalog init (`globalAmpCatalog.initAnchorAmps()`) registers all 48 manifests and adapters at module load. `loadManifestsFromDir` is a no-op in browser bundles; do not depend on `node:fs` scanning.

**Grass note:** `pixelbrain.grass` is a **WORLD_DESCRIPTOR**, not a compile-time blade rasterizer. The void-grove grass tiles under `fixtures/void_grove/` are **v1 cell sources**. Piloting “sward grass” through SCDL v2 means emitting a grass descriptor **or** rewriting the tile in v2 geometry/noise; it does **not** mean the v1 `.scdl` files suddenly become v2.

### 13.8 Six catalog modules still outside the ABI (follow-on, not a blocker)

The AMP substrate is **active**. `scdl amps validate`, `--check-abi`, `certifyAllRegisteredAmps()`, and the four family suites prove 48 adapters execute on the conveyor. A full v2 pilot uses those 48.

The EFFECT_CATALOG denominator is 54 because it counts every WIRED PixelBrain pass / microprocessor, not only SCDL-callable AMPs. These six are in that 54 and have **no** `PB-AMP-ABI-v1` manifest yet. `APPLY_AMP` against them is `SCDL-AMP-001`. That does not idle the other 48.

| Module | Why it is in the 54 | Why it is not in the 48 |
|---|---|---|
| `codex/core/pixelbrain/coord-symmetry-amp.js` | PixelBrain pass, WIRED | no manifest |
| `codex/core/pixelbrain/shadow-perception-amp.js` | PixelBrain pass, WIRED | no manifest |
| `codex/core/microprocessors/arena/arena-tick.processor.js` | microprocessor family | no manifest |
| `codex/core/pixelbrain/amps/noise/deterministic-noise.js` | microprocessor family (`createSeededRng`) | no manifest; v2 RNG is the language opcode `RNG`/`PCG32` instead |
| `codex/core/pixelbrain/amps/qbit/qbit-snap-profile.js` | microprocessor family | no manifest |
| `codex/core/pixelbrain/amps/turboquant/turboquant-layer-snapshot.js` | microprocessor family | no manifest |

Closing the catalog to 54/54 later requires truthful adapters for these six, catalog regeneration, and `--check-abi` still green. Do not stub manifests. Do not treat the missing six as evidence the live 48 are inactive.

---

## 14. Public JavaScript API

Import from `codex/core/pixelbrain/scdl/index.js` only:

```js
compileSCDL            // version-routing seam
compileLegacySCDL      // frozen v1/v1.2
detectSCDLVersion
compileSCDLV2
parseSCDLV2
formatSCDLV2
listSCDLV2Opcodes
getSCDLV2Opcode
parseSCDL, tokenize    // v1
exportSCDL, buildAsepritePayload
emitLattice
SCDL_ERROR_CODES, SCDLError, scdlError, scdlWarn, scdlInfo
buildSCDLDiagnosticReport, formatSCDLDiagnostic
```

AMP helpers (from v2 modules; used by CLI):

```js
listAmpManifests, getAmpManifest, getAmpAdapter
validateAmpAbiManifest, computeAmpAbiChecksum
certifyAmp
buildConveyorBelt, evaluateAmpRelevance
```

Never import a private tokenizer that is not the parser’s tokenizer. Never throw across these functions.

---

## 15. CLI manual

Entry: `node codex/core/pixelbrain/scdl/scdl.cli.js` or `npm run scdl -- <cmd>`.

Convenience scripts:

```
npm run scdl:compile
npm run scdl:preview
npm run scdl:check
npm run scdl:format
```

There is **no** `scdl:parse` or `scdl:amps` npm alias. Use `npm run scdl -- parse …` and `npm run scdl -- amps …`.

**Do not confuse with `npm run amps`.** Root `package.json` `"amps"` is `scripts/amp-substrate-cli.mjs` (foundry SQLite relevance: `register` / `select`). That is a different product from `scdl amps`.

Boolean flags (must never swallow the next token): `bytecode`, `strict`, `semantic`, `strokes`, `lineage`, `write`, `json`.

### 15.1 `compile`

```
npm run scdl:compile -- <file.scdl> \
  [--export json,svg,phaser,png,aseprite] \
  [--out-dir <dir>] [--out <file>] \
  [--shade material|vri] [--scale N] [--strict] \
  [--strokes] [--lineage] [--bytecode]
```

- Default export: `json`.
- Default `--out-dir`: the **source file’s directory**, never CWD.
- Export Naming Law: `<asset>-<target>.<ext>`. Multi-frame v1: `<asset>-f<N>-<target>.<ext>` plus `<asset>-frameloop.json`.
- Canonical PNG scale is **1**. Use `preview` to magnify.
- Missing `--out-dir` is created recursively (do not fail ENOENT).
- `--strict` promotes warnings to errors (notably unknown materials).
- `--bytecode` or `SCDL_BYTECODE=1` appends the PB-ERR-v1 blob to diagnostics.
- `--shade vri` routes through `compileAsset` (Vixel Render IR), PNG only; optional `--strokes`, `--relief synthetic`, `--lineage`. VRI is a **v1 shading path** on whatever `compileAsset` accepts; omitting `--strokes` is byte-identical to plain `--shade vri`. Do not treat VRI as a v2 language feature.

v2 success prints `Packet ID: pbasset_<hex>`. Failure prints blocking diagnostics and exits 1.

### 15.2 `preview`

```
npm run scdl:preview -- <file.scdl> [--scale N] [--out-dir <dir>] [--shade material|vri] [--strict]
```

Default scale **8**, max `MAX_PNG_SCALE` **32**. Writes `<asset>-preview-<N>x.png` (multi-frame: per-frame plus `-strip.png` filmstrip). These names sit **outside** the Export Naming Law so a loader globbing `*-png.png` cannot pick them up.

### 15.3 `parse`

v2: prints AST, or CST on failure, JSON. `--out <file>` optional. Exit 1 if `ok === false`.

### 15.4 `check`

Compiles, prints `OK`, error/warn/info counts, packet id, coordinate count, and for v2 `Bytecode: scdlbc_<hex>`. Exit 0/1.

### 15.5 `format`

v2 only. Stdout by default; `--write` overwrites the input. v1 source: error and exit 1.

### 15.6 `amps`

See §13.5.

### 15.7 Designed but **not implemented**

`inspect`, `explain`, `opcodes --json`, `capabilities --json`. Discover opcodes in process via `listSCDLV2Opcodes()`, not the CLI.

---

## 16. Verification gates (definition of a full pilot)

Run from repo root. Node `20.20.2` (see root `package.json` `engines` / `volta`).

### 16.1 Legacy invariance (must stay green)

```bash
npx vitest run tests/codex/core/pixelbrain/scdl/scdl.legacy-invariance.test.js
npx vitest run tests/codex/core/pixelbrain/scdl/scdl.compiler.test.js
npx vitest run tests/codex/core/pixelbrain/scdl/scdl.void-chestplate.test.js
npx vitest run tests/codex/core/pixelbrain/scdl/scdl.frames.test.js
```

Frozen v1/v1.2 fixture and frame packet IDs must remain byte-identical. If any change, the router leaked.

### 16.2 Entire SCDL suite

```bash
npx vitest run tests/codex/core/pixelbrain/scdl/
```

v2 files in that directory (all must be included):

```
scdl-v2.version.test.js
scdl-v2.tokenizer.test.js
scdl-v2.parser.test.js
scdl-v2.parser-step2.test.js
scdl-v2.parser-step3.test.js
scdl-v2.formatter.test.js
scdl-v2.analyzer.test.js
scdl-v2.compiler.test.js
scdl-v2.bytecode.test.js
scdl-v2.bytecode-step2.test.js
scdl-v2.geometry.test.js
scdl-v2.transforms.test.js
scdl-v2.booleans.test.js
scdl-v2.masks.test.js
scdl-v2.anchors.test.js
scdl-v2.layers.test.js
scdl-v2.compositing.test.js
scdl-v2.raster.test.js
scdl-v2.raster-primitives.test.js
scdl-v2.functions.test.js
scdl-v2.sequences.test.js
scdl-v2.generative.test.js
scdl-v2.integration.test.js
scdl-v2.step2-integration.test.js
scdl-v2.kernel-invariants-and-fidelity.test.js
scdl-v2.robustness.test.js
scdl-v2.amp-abi.test.js
scdl-v2.amp-catalog-gate.test.js
scdl-v2.amp-certify.test.js
scdl-v2.amp-invocation.test.js
scdl-v2.amp-relevance.test.js
scdl-v2.amp-stages.test.js
scdl-v2.amp-family-geometry.test.js
scdl-v2.amp-family-render.test.js
scdl-v2.amp-family-character.test.js
scdl-v2.amp-family-world.test.js
```

Plus CLI contract: `scdl.cli.test.js`, `whitepaper-cli-contract.test.js`.

Robustness law: public `compileSCDL` never throws on malformed input (including `@` as first char after `SCDL 2`, truncated `CANVAS WIDTH`, non-strings). `scdl-v2.robustness.test.js` fuzzes **2000** malformed `SCDL 2` programs. `whitepaper-cli-contract.test.js` pins live `bytecode.text` of exact-orb to `scdlbc_98042e1f`.

### 16.3 Catalog / ABI

```bash
npm run effects:check
node scripts/pixelbrain-effect-catalog.mjs --check-abi
npm run scdl -- amps validate
```

Expected **success** strings (this is the live gate, not a failure):

```
EFFECT_CATALOG.md is current (54 modules, 48 ABI compatible).
All 48 PB-AMP-ABI-v1 manifests are valid.
All 48 manifest(s) valid.
```

### 16.4 Fixture compile identities

```bash
npm run scdl:check -- codex/core/pixelbrain/scdl/fixtures/v2/exact-orb.scdl
npm run scdl:check -- codex/core/pixelbrain/scdl/fixtures/v2/void-sigil.scdl
npm run scdl:check -- codex/core/pixelbrain/scdl/fixtures/v2/fibonacci-bloom.scdl
```

Confirm `OK: true` and bytecode ids `scdlbc_98042e1f` / `scdlbc_54845e34` / `scdlbc_64c9884a`.

Goldens next to `exact-orb.scdl`:

```
codex/core/pixelbrain/scdl/fixtures/v2/exact-orb.png              # native 9×9
codex/core/pixelbrain/scdl/fixtures/v2/exact-orb-preview-8x.png
```

Repo-wide `*.png` ignore would drop these; the exception is `!codex/core/pixelbrain/scdl/fixtures/v2/*.png`.

**No** checked-in PNG for `void-sigil.scdl` or `fibonacci-bloom.scdl`. Generate them during the pilot with `compile` / `preview`. Do not invent goldens.

### 16.5 Studio (v1 only, still part of “full” because it is the authoring surface)

From `Pixel-Art-Studio-Skeleton/`:

```bash
node --test tests/studio-scdl-ingestion.test.mjs
node --test tests/studio-isolation.test.mjs
```

Isolation law: production files under `Pixel-Art-Studio-Skeleton/src` must not import `../../codex/...` or `node:fs`. That is why v2 is missing there. Do not “fix” Studio by breaking isolation.

Optional visual:

```bash
npx playwright test tests/visual/studio-scdl.spec.mjs
```

(from the Studio package). Root feedback report recorded this as historically not-run; if you skip it, say so in the pilot log.

---

## 17. Fixture corpus

### 17.1 v2 fixtures (the only v2 goldens)

#### `exact-orb.scdl` — Step 1 semantic core

Path: `codex/core/pixelbrain/scdl/fixtures/v2/exact-orb.scdl`

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

Proves: version header, typed `CONST`, prefix `ADD`, `PX` wrap, `CIRCLE` + `PIXEL`, ordered `PAINT`, `MIDPOINT` vs `CENTER`, packet emission, identity `scdlbc_98042e1f`.

#### `void-sigil.scdl` — Step 2 geometry kernel

Path: `codex/core/pixelbrain/scdl/fixtures/v2/void-sigil.scdl`

Proves: `RING`, `STAR`, `RECT`, `SUBTRACT`, `OUTLINE`, `TO_MASK`, `CLIP_TO`, `ANCHOR` / `ANCHOR_OF`, `ASSERT (INSIDE …)`, two layers, `BLEND REPLACE` / `OVER`, `OPACITY`, `BRESENHAM`.

#### `fibonacci-bloom.scdl` — Step 3 generative mathematics

Path: `codex/core/pixelbrain/scdl/fixtures/v2/fibonacci-bloom.scdl`

Proves: `FN` + `LET` + `RETURN`, `SEQUENCE` with `SEED`/`NEXT`/`PREV`, `RNG ALGORITHM PCG32`, `AT $fib`, `SHAPE COMPOUND` + `RADIAL` + `EMIT`, identity `scdlbc_64c9884a`.

### 17.2 v1 fixtures that remain on the frozen path

Everything else under `codex/core/pixelbrain/scdl/fixtures/` — including **all of** `void_grove/` (`grass_tile_32.scdl`, `void_grove_grass.scdl`, `void_grove_tree.scdl`, …), `void_acolyte/`, `vaelrix_chibi/`, `void_chestplate.scdl`, slimes, loot chest — is unversioned v1/v1.2. The first significant line is `asset …`, so `detectSCDLVersion` returns 1.

A full v2 pilot **recompiles them on the legacy path** to prove invariance. It does **not** rewrite them as v2 unless that rewrite is a separately approved migration with new identities.

Name collision: `grass_tile_32.scdl` declares `asset void_grove_grass_field` — the same asset id as `void_grove_grass_field.scdl`. Export Naming Law keys off the **filename** stem (`grass_tile_32-png.png` vs `void_grove_grass_field-png.png`), so the files do not clobber each other on disk, but packet `source.id` can collide if both are ingested into one library. Generators `generate-grass-blades.mjs`, `generate-grass-field.mjs`, `generate-grass-perlin.mjs` emit **v1** SCDL; do not hand-edit their outputs.

### 17.3 APPLY_AMP / SELECT_AMPS examples (tests, not fixtures)

Canonical authoring examples live in `tests/codex/core/pixelbrain/scdl/scdl-v2.amp-invocation.test.js` and the `scdl-v2.amp-family-*.test.js` files. Copy from those tests, not from memory.

Faceted gem (COMPILE, SHAPE_POST):

```scdl
SCDL 2
ASSET faceted_gem
CANVAS WIDTH 32 HEIGHT 32

SHAPE $raw (CIRCLE CENTER (VEC2 (PX 16) (PX 16)) RADIUS (PX 8))

APPLY_AMP $gem SHAPE {
  AMP pixelbrain.facet
  VERSION 1.0.0
  STAGE SHAPE_POST
  INPUT geometry $raw
  PARAM facetCount 8
}

LAYER main ORDER 10 {
  PAINT $gem FILL #00ffff RASTER CENTER
}
```

Gear-glide descriptor (DESCRIPTOR, RUNTIME_DESCRIPTOR):

```scdl
SCDL 2
ASSET clockwork_gear
CANVAS WIDTH 32 HEIGHT 32

APPLY_AMP $motion ANY {
  AMP pixelbrain.gear-glide
  VERSION 1.0.0
  STAGE RUNTIME_DESCRIPTOR
  PARAM bpm 120
  PARAM degreesPerBeat 45
}

LAYER base ORDER 10 {
  PAINT (PIXEL AT (VEC2 (PX 16) (PX 16))) FILL #ffff00 RASTER CENTER
}
```

Successful compile yields `ampDescriptors[0].contract === 'PB-RUNTIME-DESCRIPTOR-v1'` and `kind === 'GEAR_GLIDE'`.

Relevance:

```scdl
SELECT_AMPS PIPELINE render-fidelity
```

Expect `pixelbrain.pixel-aa` among selected AMPs when the pipeline matches, and a non-empty dormant list with skip reasons.

---

## 18. Full pilot procedure

Execute in order. Do not skip a gate because a later phase “looks more interesting.” Record stdout in the pilot log. If a command disagrees with a string in this paper, the command wins; file a doc fix.

### Phase 0 — Environment

1. Confirm Node 20.20.2 (`node -v`) and that you are at the Scholomance repo root, not only inside `Pixel-Art-Studio-Skeleton/`.
2. Confirm `codex/core/pixelbrain/scdl/v2/` exists in **this** checkout. (A dirty unification branch may contain it; an older worktree may not.)
3. Confirm you will not mix v1 packet-identity changes into the v2 series.

### Phase 1 — Frozen legacy path

1. `npx vitest run tests/codex/core/pixelbrain/scdl/scdl.legacy-invariance.test.js`
2. Compile a known v1 asset:

```bash
npm run scdl:check -- codex/core/pixelbrain/scdl/fixtures/void_chestplate.scdl
```

3. Confirm the packet id matches the frozen golden for that fixture.
4. **Pass criterion:** zero identity drift. **Fail criterion:** any v1 packet id change.

### Phase 2 — Semantic core

```bash
npm run scdl:check -- codex/core/pixelbrain/scdl/fixtures/v2/exact-orb.scdl
npm run scdl:format -- codex/core/pixelbrain/scdl/fixtures/v2/exact-orb.scdl
npm run scdl:compile -- codex/core/pixelbrain/scdl/fixtures/v2/exact-orb.scdl --export json,png --out-dir /tmp/scdl-v2-pilot/exact-orb
npm run scdl:preview -- codex/core/pixelbrain/scdl/fixtures/v2/exact-orb.scdl --scale 8 --out-dir /tmp/scdl-v2-pilot/exact-orb
```

Pass criteria:

- `OK: true`
- `Bytecode: scdlbc_98042e1f`
- PNG exists at `/tmp/scdl-v2-pilot/exact-orb/exact-orb-png.png` (9×9)
- Preview exists as `exact-orb-preview-8x.png`
- `format` stdout is canonical (uppercase opcodes, named operands, LF)
- Reformatting does not change `programId`

Deliberate failure (prove diagnostics):

```scdl
SCDL 2
ASSET x
CANVAS WIDTH 1 HEIGHT 1
SHAPE $p (CIRCLE CENTER (VEC2 (PX 0) (PX 0)))
```

Expect `SCDL-PARSE-004`, `expected: ["RADIUS PX"]`, `packet: null`. Fix by adding `RADIUS (PX 1)`. Re-check until `OK: true`. This is the agent repair loop.

Other required repair drills:

| Fault | Expect |
|---|---|
| `RADIUS 2` (bare I32) | `SCDL-TYPE-002` expected `PX` |
| Unknown `$missing` | `SCDL-BIND-001` |
| `BUDGET INSTRUCTIONS 999999999 …` above host | `SCDL-BUDGET-001` |
| Lowercase `shape $p …` | `SCDL-PARSE-001` |
| `BC.CONST` in source | `SCDL-PARSE-001` |
| `@` after header | `SCDL-LEX-001`, never a throw |

### Phase 3 — Geometry kernel

```bash
npm run scdl:check -- codex/core/pixelbrain/scdl/fixtures/v2/void-sigil.scdl
npm run scdl:compile -- codex/core/pixelbrain/scdl/fixtures/v2/void-sigil.scdl --export json,png,svg --out-dir /tmp/scdl-v2-pilot/void-sigil
npm run scdl:preview -- codex/core/pixelbrain/scdl/fixtures/v2/void-sigil.scdl --scale 8 --out-dir /tmp/scdl-v2-pilot/void-sigil
npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.geometry.test.js tests/codex/core/pixelbrain/scdl/scdl-v2.booleans.test.js tests/codex/core/pixelbrain/scdl/scdl-v2.masks.test.js tests/codex/core/pixelbrain/scdl/scdl-v2.transforms.test.js tests/codex/core/pixelbrain/scdl/scdl-v2.anchors.test.js tests/codex/core/pixelbrain/scdl/scdl-v2.compositing.test.js tests/codex/core/pixelbrain/scdl/scdl-v2.layers.test.js tests/codex/core/pixelbrain/scdl/scdl-v2.raster.test.js tests/codex/core/pixelbrain/scdl/scdl-v2.step2-integration.test.js
```

Pass criteria: `OK: true`; PNG/SVG written; CSG cutout visible vs a compile that omits `SUBTRACT`; `ASSERT` failure on a deliberately false `INSIDE` is `SCDL-GEOM-002` with no packet.

Inspect the PNG at native size **and** nearest-neighbor 8×. Do not judge geometry from a smoothed image viewer.

### Phase 4 — Generative mathematics

```bash
npm run scdl:check -- codex/core/pixelbrain/scdl/fixtures/v2/fibonacci-bloom.scdl
npm run scdl:compile -- codex/core/pixelbrain/scdl/fixtures/v2/fibonacci-bloom.scdl --export json,png --out-dir /tmp/scdl-v2-pilot/fibonacci-bloom
npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.functions.test.js tests/codex/core/pixelbrain/scdl/scdl-v2.sequences.test.js tests/codex/core/pixelbrain/scdl/scdl-v2.generative.test.js
```

Pass criteria: `Bytecode: scdlbc_64c9884a`; two compiles of the same source produce identical `programId` and PNG bytes. A recursive `FN` without `RECURSION_MAX` is `SCDL-TERM-001`. Mutual recursion is `SCDL-TERM-004`.

RNG law for the pilot: every `RANDOM_*` names an `RNG` binding with `ALGORITHM PCG32` and an integer `SEED`. There is no global random. Changing the seed **must** change samples and **must** change `programId` if those samples affect painted geometry.

### Phase 5 — AMP substrate without authoring

```bash
npm run scdl -- amps list
npm run scdl -- amps list --json
npm run scdl -- amps describe pixelbrain.facet --json
npm run scdl -- amps validate
npm run effects:check
node scripts/pixelbrain-effect-catalog.mjs --check-abi
npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.amp-abi.test.js tests/codex/core/pixelbrain/scdl/scdl-v2.amp-catalog-gate.test.js tests/codex/core/pixelbrain/scdl/scdl-v2.amp-certify.test.js tests/codex/core/pixelbrain/scdl/scdl-v2.amp-stages.test.js tests/codex/core/pixelbrain/scdl/scdl-v2.amp-relevance.test.js
```

Pass criteria: 48 listed and valid (this is the success count); facet `execution=COMPILE`, `stage=SHAPE_POST`, `order=40`; checksums valid; `effects:check` prints `54 modules, 48 ABI compatible`. That string is a **pass**, not a deficit.

### Phase 6 — Explicit APPLY_AMP end-to-end

Write `/tmp/scdl-v2-pilot/faceted-gem.scdl` using the faceted-gem source in §17.3.

```bash
npm run scdl:check -- /tmp/scdl-v2-pilot/faceted-gem.scdl
npm run scdl:compile -- /tmp/scdl-v2-pilot/faceted-gem.scdl --export json,png --out-dir /tmp/scdl-v2-pilot/faceted-gem
npm run scdl -- amps plan /tmp/scdl-v2-pilot/faceted-gem.scdl --json
```

Pass criteria:

- `ok: true`
- `bytecode.text` contains `BC.AMP.APPLY`
- `bytecode.capabilities` contains `MATERIAL.PIXELBRAIN@2.0`
- `package.ampPlan` has one non-dormant explicit entry for `pixelbrain.facet`
- PNG written

Negative drills (each must fail closed, no packet):

| Source fault | Code |
|---|---|
| `AMP pixelbrain.non_existent_amp` | `SCDL-AMP-001` |
| `STAGE LAYER_POST` on facet | `SCDL-AMP-002` |
| omit `INPUT geometry` | `SCDL-AMP-003` |
| `PARAM facetCount 100` | `SCDL-AMP-004` |
| `INPUT notAPort $raw` | `SCDL-AMP-011` |

Repeat with the gear-glide descriptor source. Pass: `ampDescriptors[0].kind === 'GEAR_GLIDE'`, `bpm === 120`. The painted pixel still exists; the descriptor is extra immutable data, not a GPU shader at compile time.

### Phase 7 — SELECT_AMPS relevance

```scdl
SCDL 2
ASSET auto_selected
CANVAS WIDTH 32 HEIGHT 32
SELECT_AMPS PIPELINE render-fidelity
LAYER main ORDER 10 {
  PAINT (CIRCLE CENTER (VEC2 (PX 16) (PX 16)) RADIUS (PX 8)) FILL #ff0000 RASTER CENTER
}
```

```bash
npm run scdl -- amps plan /tmp/scdl-v2-pilot/auto-selected.scdl --json
npm run scdl:compile -- /tmp/scdl-v2-pilot/auto-selected.scdl --export png --out-dir /tmp/scdl-v2-pilot/auto-selected
```

Pass: `pixelbrain.pixel-aa` selected with activation reason containing `All relevance criteria satisfied` (or the current equivalent string); dormant list non-empty with skip reasons; compile succeeds.

Family suites (this **is** Decomposition Step 6; there is no separate `docs/superpowers/plans/*step-6*` file):

```bash
npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.amp-invocation.test.js
npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.amp-family-geometry.test.js   # Family 1: geometry/paint + five Step-5 anchors
npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.amp-family-render.test.js     # Family 2: foundry / render fidelity
npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.amp-family-character.test.js  # Family 3: character / image analysis
npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.amp-family-world.test.js      # Family 4: world / voxel / runtime descriptors
```

### Phase 8 — Author a new v2 asset (the actual pilot, not a fixture replay)

Create a **new** file, e.g. `codex/core/pixelbrain/scdl/fixtures/v2/pilot-mark.scdl`. Do not copy-paste `exact-orb` unchanged. The program must exercise at least:

1. `SCDL 2` header, `ASSET`, `CANVAS`, explicit `BUDGET` **below** host ceilings.
2. Prefix math and a `PX` wrap.
3. At least two primitives (not only `PIXEL`+`CIRCLE`).
4. One CSG op (`SUBTRACT` or `UNION` or `INTERSECT`).
5. One mask and `CLIP_TO`.
6. Two layers with different `ORDER` and a non-default `BLEND` or `OPACITY`.
7. One `ASSERT`.
8. Either one `APPLY_AMP` **or** one `SELECT_AMPS PIPELINE …`.
9. Optional but recommended: one `SEQUENCE` or `FN`.

Loop:

```
format → check → read diagnostics → edit source at span.start → check
```

until `OK: true`. Then:

```bash
npm run scdl:format -- path/to/pilot-mark.scdl --write
npm run scdl:compile -- path/to/pilot-mark.scdl --export json,png,svg,phaser --out-dir /tmp/scdl-v2-pilot/pilot-mark
npm run scdl:preview -- path/to/pilot-mark.scdl --scale 8 --out-dir /tmp/scdl-v2-pilot/pilot-mark
```

Record in the pilot log:

- `programId`
- packet id
- canvas size
- coordinate count
- active AMP ids and dormant skip reasons
- SHA-256 of the PNG bytes
- whether `format --write` was idempotent (second format is a no-op)

**Forbidden during this phase:** inventing bytecode as source; keeping a failed compile’s partial AST as an asset; raising `BUDGET` above host ceilings; calling unmigrated AMPs; authoring `TIMELINE` / `IMPORT` / `REQUIRES`; authoring `MAP`/`FILTER`/`FOLD`; painting a `CIRCLE` with `RASTER THRESHOLD` or `RASTER BRESENHAM`; expecting `RADIAL RADIUS` or `OUTLINE WIDTH` to change pixels.

### Phase 9 — Full suite + robustness

```bash
npx vitest run tests/codex/core/pixelbrain/scdl/
npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.robustness.test.js
npx vitest run tests/codex/core/pixelbrain/scdl/scdl.cli.test.js
```

Pass: all green. A single throw from `compileSCDL` on garbage input is a failed pilot.

### Phase 10 — Studio (honest split)

v1 ingest (in scope):

1. From `Pixel-Art-Studio-Skeleton/`: `npm run dev` or `sh startup.sh` (port **8090**; `/` redirects to `/studio/canvas`). Playwright `webServer` is the same origin.
2. Only the **Canvas & Aseprite** tab has SCDL ingest. Blueprint, Foundry, AMPs, Mutations, Finish, Mentor, Library, and Diagnostics do not.
3. Document bar control **SCDL** opens `ScdlIngestionDialog`.
4. Starter source is **v1** (`asset new_sprite canvas 16x16` …). Compile to Canvas.
5. Confirm layers `00_Reference` + part layers, receipt contract `PB-STUDIO-SCDL-INGEST-v1`.
6. Failed compile must not mutate the document. Dialog stays open with `line N, col M`.
7. Animated v1 source must fail with `PB-STUDIO-SCDL-FRAMES`.

v2 ingest (out of scope until isolation copy gains `v2/`):

- Pasting `SCDL 2` into the dialog will be parsed by the **legacy** isolated compiler.
- Record that failure in the pilot log. Do not paper over it by importing `codex/` from Studio `src` (isolation test will fail).

Closing this gap is a follow-on engineering task: vendor a browser-safe v2 compiler (the AMP catalog is already fs-free) into `Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/scdl/`, keep `studio-isolation.test.mjs` green, add a v2 starter template, and extend `ingestScdlIntoDocument` so v2 packets (which have no v1 `parts[]`) still become editable layers. Until then, the v2 authoring loop is **CLI + PNG**, not Studio.

### Phase 11 — Exports and optional VRI

Default material export is enough for the pilot. Optional:

```bash
npm run scdl:compile -- path/to/pilot-mark.scdl --export png --shade vri --out-dir /tmp/scdl-v2-pilot/pilot-mark-vri
```

`--shade vri` only supports PNG. `--lineage` writes `PB-ASSET-LINEAGE-SIDECAR-v1`. Palette coverage prints authored vs rendered; disagreement is information, not automatically a bug.

Aseprite:

```bash
npm run scdl:compile -- path/to/pilot-mark.scdl --export aseprite --out-dir /tmp/scdl-v2-pilot/pilot-mark
```

v2 `frameLoop` is null, so this is a single-frame `.aseprite`.

### Phase 12 — Pilot sign-off checklist

A full v2 pilot is **complete** only when every box is evidenced (command output or explicit “not shipped”):

| # | Claim | Evidence |
|---|---|---|
| 1 | v1 packet identities unchanged | legacy-invariance tests |
| 2 | `SCDL 2` routes to v2; other headers do not | `scdl-v2.version.test.js` + Phase 2 |
| 3 | exact-orb identity `scdlbc_98042e1f` | `scdl:check` |
| 4 | void-sigil identity `scdlbc_54845e34` | Phase 3 |
| 5 | fibonacci-bloom identity `scdlbc_64c9884a` | Phase 4 |
| 6 | Public compiler never throws | robustness tests |
| 7 | Failed compile nulls packet/bytecode | Phase 2 negative drills |
| 8 | Formatter idempotent; identity independent of comments/`$names` | Phase 2 format |
| 9 | 48 AMP manifests valid and adapters certified | `amps validate` + `--check-abi` + `scdl-v2.amp-certify.test.js` |
| 10 | Live catalog gate: 54 modules, **48 ABI compatible and active** | `effects:check` |
| 11 | APPLY_AMP facet produces `BC.AMP.APPLY` | Phase 6 |
| 12 | DESCRIPTOR AMP emits `PB-RUNTIME-DESCRIPTOR-v1` | Phase 6 gear-glide |
| 13 | SELECT_AMPS records dormant skip reasons | Phase 7 |
| 14 | Adapters do not fabricate ITEM-SPEC | certify tests |
| 15 | New authored asset exported json+png+svg | Phase 8 |
| 16 | Full `tests/codex/core/pixelbrain/scdl/` green | Phase 9 |
| 17 | Studio v1 ingest still works; v2 ingest documented as missing | Phase 10 |
| 18 | Six catalog modules outside ABI recorded as follow-on (48 remain live) | §13.8 |
| 19 | Animation/imports/LSP listed as unshipped | §19 |
| 20 | This paper’s commands were actually run | pilot log |

A sign-off that skips the new-asset phase (8) or the catalog gate (9–10) is not a full pilot. Replaying three goldens is a smoke test.

---

## 19. Remaining work (do not author against the compiler)

### 19.1 Language / compiler

- **Step 4 animation:** `TIMELINE`, tracks, keyframes, formulas, poses, finite sampling, `frameLoop`, Aseprite tags from v2. Packages currently force `animation: null`. `TIMELINE` exists as an **AMP conveyor stage** (post-raster); an adapter may attach frames there, but there is no v2 source statement. v1 `loop`/`frame` still works on **unversioned** sources only — do not mix it into `SCDL 2`.
- **`SKEW`:** named in the Step 2 plan; **absent** from the opcode registry and `scdl-v2.transforms.js`.
- **Imports / modules / REQUIRES:** content-addressed `IMPORT`, capability blocks. Not parsed.
- **`MAP` / `FILTER` / `FOLD`:** parse, then `SCDL-TYPE-003`. Do not author them.
- **`THRESHOLD` raster policy:** named, not implemented. CIRCLE only implements `CENTER` and `MIDPOINT`.
- **`RADIAL RADIUS`:** parsed, ignored.
- **`MATCH`:** functions only, not shape/layer blocks.
- **`OUTLINE WIDTH`:** unused at raster (4-neighbor inner border only).
- **Transform lowering** drops non-translation matrix components; golden-test rotations.
- **`ALIGN`** relocates only RECT/ROUNDED_RECT/CIRCLE/RING/ELLIPSE.
- **Predicates** are AABB, not true shape tests.
- **`MASK_INVERT`** default canvas 32×32, not the program canvas.
- **Rounding-policy operands** as a first-class PAINT field (`NEAREST_EVEN`, …) beyond the five raster policies.
- **Parametric curves catalog** as dedicated opcodes (log spiral, Fibonacci spiral opcode, glyph contours, imported raster contours). Express spirals with `SEQUENCE`+`RADIAL`+transforms instead.
- **Incremental evaluation cache** for Studio timeline scrubbing (no timeline yet).
- **`inspect` / `explain` / `opcodes` / `capabilities` CLI.**
- **LSP** over `parseSCDLV2` + `analyzeSCDLV2` (JSON-RPC diagnostics, hover, complete).
- **`SCDL-TERM-004` collision** between mutual recursion and invalid control flow.
- **Library kernels that throw:** `create*`, `computeBounds`, transform invert, `makeRational`/`parseRational`, `parseColor`/`blendColors`, `getAnchor`. The public compiler catches escapes; do not call those kernels from a new host without the same wrap.

### 19.2 Catalog denominator close (six modules, after the live 48)

The 48 certified AMPs are already the pilot AMP surface. Later, migrate the six modules in §13.8 with truthful adapters, real execute evidence, and catalog CI if the EFFECT_CATALOG denominator should equal the SCDL ABI count. Shader-like AMPs must become compile-time descriptors or proven COMPILE passes; do not wrap GLSL and call it done. This work is **not** a prerequisite for piloting SCDL v2 AMP invocation.

### 19.3 Studio v2

Vendor the v2 pipeline into the isolation copy without `node:fs` or `codex/` imports. Map v2 layers (not v1 `parts`) onto the document controller. Keep animated refusal until Step 4 exists. Add a `SCDL 2` starter in `ScdlIngestionDialog`.

### 19.4 Documentation drift

After closing any item above, update this paper, `SCDL_COMPILER_WHITE_PAPER.md` §11, and `SCDL_AUTHORING_GUIDE.md` §11 from **compiler-demonstrated** behavior. Examples and images must be regenerable from checked-in `.scdl`.

---

## 20. Agent operating loop (authoring)

Agents author textual SCDL only.

1. Write `.scdl` beginning with `SCDL 2`.
2. `npm run scdl:check -- file.scdl`
3. If `ok: false`, read `errors[]` / `diagnosticReport.diagnostics[]`. Use `code`, `span.start`, `expected`, `received`, `relatedSymbols`.
4. Edit the **source** at that span. Do not edit bytecode. Do not apply `fixes` blindly without understanding.
5. Check again until `OK: true`.
6. Optional `format --write`.
7. `compile` / `preview` / `amps plan`.
8. If an AMP is dormant, read `skipReason`. Either change pipeline/inputs or `APPLY_AMP` explicitly. Do not assume registry names.

Never treat a failed compile’s AST as an asset. Never ship SCDL source into a game runtime.

---

## 21. File map (pilot working set)

```
codex/core/pixelbrain/scdl/index.js
codex/core/pixelbrain/scdl/scdl.compiler.js          # router
codex/core/pixelbrain/scdl/scdl.cli.js
codex/core/pixelbrain/scdl/scdl.exporters.js
codex/core/pixelbrain/scdl/v2/                       # entire v2 compiler
codex/core/pixelbrain/scdl/v2/amp-manifests/
codex/core/pixelbrain/scdl/v2/adapters/
codex/core/pixelbrain/scdl/fixtures/v2/
codex/core/pixelbrain/EFFECT_CATALOG.md
scripts/pixelbrain-effect-catalog.mjs
tests/codex/core/pixelbrain/scdl/scdl-v2.*.test.js
Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/studio-authoring-facade.js
Pixel-Art-Studio-Skeleton/src/lib/pixelbrain/scdl/    # v1-only isolation copy
Pixel-Art-Studio-Skeleton/src/components/studio/pixelbrain/authoring/ScdlIngestionDialog.tsx
docs/superpowers/specs/2026-09-06-scdl-v2-ai-native-pixel-language-design.md
docs/superpowers/plans/2026-09-06-scdl-v2-semantic-core-vertical-slice.md
docs/superpowers/plans/2026-09-06-scdl-v2-geometry-and-paint-kernel.md
```

---

## 22. Final verdict

SCDL v2 is a deterministic, typed, compile-time mathematical pixel-art language with a frozen v1/v1.2 neighbor, canonical register bytecode, exact rationals, bounded evaluation, and a **live Universal AMP ABI**. The measured catalog gate is **48 certified SCDL AMPs out of 54 EFFECT_CATALOG modules**. Those 48 have manifests, adapters, certification, family tests, `APPLY_AMP` / `SELECT_AMPS`, and CLI `amps *`. That is the active AMP surface. A full pilot **uses** it.

A **full pilot** is the ordered execution of §18 against the live compiler: legacy invariance, three golden fixtures, a newly authored program that includes AMP invocation against the 48, catalog gates reporting 48/54 as the current success string, Studio v1 ingest, and an explicit account of animation, imports, LSP, and Studio v2.

Timelines as v2 source, multi-file `IMPORT`, LSP, and Studio `SCDL 2` ingest are not in this tree. The six catalog modules without ABI are follow-on denominator work; they do not idle the 48.

There is **no dedicated SCDL v2 PDR or PIR** in `docs/scholomance-encyclopedia/PDR-archive/`. Closest archived papers: `scdl-v1-pdr.md`, `2026-09-03-scdl-amp-bridging-pdr.md`, `2026-09-03-vri-scdl-wiring-pdr.md`, `2026-07-03-scdl-frames-and-cli-out-dir-pdr.md`. Studio isolation: `PIR-20260905-PIXELBRAIN-STUDIO-STANDALONE-PORT.md` (104 byte-identical vendored files). This operating manual is the v2 pilot authority until a PIR is written from a completed §18 run.

**Search code:** `SCHOL-ENC-BYKE-SEARCH-SCDL-V2-FULL-PILOT`
