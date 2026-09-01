---
name: scholomance-compile
description: Use when reading, writing, auditing, debugging, or extending SCDL (codex/core/pixelbrain/scdl/ — the Scholomance PixelBrain vector/cell asset DSL and its grammar/compiler/rasterizer/exporter pipeline), or when designing/reviewing any generalized parser->AST->passes->packet asset-compiler or rasterization system — pass ordering, cross-entity resolution, silhouette/ownership models, "never throws" compiler contracts, SVG-style path parsing.
---

# ScholomanceCompile

Full knowledge base for SCDL and generalized asset-compiler/rasterization engineering, mirrored from the Claude Code skill at `.claude/skills/ScholomanceCompile/` (SKILL.md + both `references/*.md` merged into this single file, since MCP skill resources serve one flat document). Distilled from a real audit-and-fix pass on this exact codebase (2026-08-30: one CRITICAL crash found and fixed, a dead union/subtract/intersect feature diagnosed and rebuilt end-to-end).

If this disagrees with the two canonical docs it was built from — `docs/scholomance-encyclopedia/Scholomance White Papers/SCDL_COMPILER_WHITE_PAPER.md` and `SCDL_AUTHORING_GUIDE.md` — those win. They're the ones expected to stay current as the compiler evolves; this file is a snapshot from the 2026-08-30 session that produced it.

## When to Use

- Writing or reviewing SCDL source, grammar changes, or new ops.
- Debugging a compile that throws, silently no-ops, or produces wrong geometry.
- Adding a compiler pass, error code, or exporter to `codex/core/pixelbrain/scdl/`.
- Designing/reviewing any other parser→AST→passes→packet compiler (a shader compiler, a scene-graph builder, a template engine) — the patterns below aren't SCDL-specific.
- Parsing SVG-style path data, or writing a tokenizer/lexer pair.

## Quick Reference — SCDL Pipeline

```
source text
  → parseSCDL (scdl.grammar.js: _tokenizeFull + recursive-descent parser)
  → validatePass          → resolveColorsPass    → resolveMaterialsPass
  → expandVectorPass       (phase 1: rasterize each part's own vector ops
                             phase 2: resolveBooleanOpsPass, cross-part)
  → expandSymmetryPass    → expandCellsPass       → [projectGenesPass, optional]
  → emitPacketPass        → emitDiagnosticsPass
  → CompileResult { ok, ast, packet, errors, diagnostics }
```

## Core Patterns (generalize beyond SCDL)

1. **A "never throws" contract binds every producer of the error/diagnostic array, forever.** If `compile()` promises to always return a result object, *every* code path that pushes into the shared errors array must produce the exact same duck-typed shape (here: `.isError()`/`.isWarn()`/`.code`/`.severity`) — one plain `{code, message}` literal slipped in by one pass is enough to crash the whole compiler on a single malformed input, even with a fully green test suite, because nothing exercised that pass's error path. Grep every push-site into that array before trusting the "never throws" doc comment.
2. **A cross-entity operation can't resolve until every entity's own pass has run.** union/subtract/intersect needed to reference *sibling parts*, but each part was being rasterized independently in one pass. Fix: split into phase 1 (rasterize each entity alone, deferring cross-entity ops) and phase 2 (resolve cross-entity ops once every entity's shape is known). Same shape as a linker running after every compilation unit, or a two-pass reference resolver.
3. **"Which cells belong to part X" has two incompatible correct answers — know which one your data model needs.** A silhouette/occupancy map (`{x,y} -> singleOwnerId`, last-writer-wins) is correct when entities are *designed* to be exclusive, non-overlapping territory (an armor spec's pauldron/mantle/core). It is *wrong* for entities that are independently authored and may legitimately overlap (two SCDL parts drawing the same coordinate) — reusing the single-owner model there silently deletes real overlap. Diagnosed here by writing one concentric-circle `intersect` test and getting 0 cells instead of 5. Fix: scope the ownership map per-entity (never share it across entities you don't control the disjointness of).
4. **Only reuse a helper for what its contract actually guarantees, not what its name suggests.** `buildPartMask(partOf, id)` genuinely is "get me this part's shape" — but *only* if you feed it a `partOf` map you built with the right ownership semantics for your case (see #3). Reusing the function was right; reusing it against a shared cross-entity map was not.
5. **Duplicate tokenizers/parsers drift silently.** Two hand-synced implementations of the same lexer (one exported for tests, a private one actually used by the parser) will pass their own tests forever while the real one regresses, because nothing ever compares them. Collapse to one; make the "test" tokenizer a thin wrapper over the real one, not a parallel implementation.
6. **SVG-style number tokenizers need a special case for flag digits.** A generic `-?\d*\.?\d+` number regex greedily swallows adjacent single-digit arc flags (`A rx ry rot large-arc sweep x y`) into one multi-digit token when an author uses SVG's legal concatenated-flag shorthand (`"011"` = flags `0`,`1` + start of the next coordinate), desyncing every token after it. Normalize flag digits to explicit single-character, space-separated tokens *before* generic tokenization, in one dedicated pre-pass over the raw string — don't try to patch the generic regex.
7. **A fully-green test suite proves nothing about a code path with zero tests.** `union`/`subtract`/`intersect` had 250/250 surrounding tests passing while being both crash-prone AND a complete no-op for any hand-written source — because no test exercised those verbs at all. Before trusting a suite's "all green," grep for whether the feature you're relying on has any test naming it.

## Common Mistakes

| Symptom | Real cause | Fix |
|---|---|---|
| Compiler throws despite a "never throws" doc comment | Some pass pushes a non-conforming object into the shared errors array; a later `.isError()` call has no ternary guard | Make every error producer use the same factory (`scdlError`/`scdlWarn`) or an equivalent duck-typed object |
| A feature "works" (no error) but visibly does nothing | Its addressing scheme references an identifier nothing can ever produce (e.g. targeting auto-generated ids that authors can't type) | Trace the target string end-to-end: what produces it, what consumes it, do the two ever actually match on real input? |
| Boolean/overlap op returns fewer cells than expected, sometimes zero | Ownership map is shared across entities that are allowed to overlap, so a later entity's write silently reassigns an earlier entity's cell | Scope the ownership/silhouette map per-entity; only share it when entities are contractually disjoint |
| Arc/curve path renders at the wrong position, or a downstream field goes NaN | Flag-shorthand digits fused with adjacent numbers during tokenization | Pre-normalize flag digits to their own space-separated tokens before generic number tokenization |
| Two tests for "the tokenizer" test different code | An exported convenience function and the parser's internal one have quietly diverged into two implementations | `grep` for a second definition before trusting that a tokenizer test covers the compiler's real lexer |

---

# Reference: SCDL Pipeline — Full Detail

All paths relative to `codex/core/pixelbrain/scdl/`. This is a compressed snapshot (2026-08-30) for fast lookup — the maintained, exhaustive spec lives in `docs/scholomance-encyclopedia/Scholomance White Papers/SCDL_COMPILER_WHITE_PAPER.md` and `SCDL_AUTHORING_GUIDE.md` (op catalog with rendered examples, full material catalogue); defer to those on any disagreement.

## Grammar (SCDL-AST-v1 / v1.2 scene-graph)

```
program       ::= asset_decl palette_block? def_block* (part_block|group_block|instance_stmt)*
                   loop_decl? frame_block* export_decl?
asset_decl    ::= 'asset' IDENT IDENT 'canvas' INT 'x' INT
palette_block ::= 'palette' '{' (IDENT '=' HEX_COLOR)* '}'
def_block     ::= 'def' IDENT '{' (part_block|group_block|instance_stmt)* '}'      (v1.2)
group_block   ::= 'group' IDENT transform_clause '{' scene_node* '}'              (v1.2)
instance_stmt ::= 'instance' IDENT ['as' IDENT] transform_clause ['material' IDENT] (v1.2)
transform_clause ::= ['at' NUM NUM] ['rotate' NUM] ['scale' NUM [NUM]] ['mirror' ('x'|'y'|'xy')]
part_block    ::= 'part' IDENT ['material' IDENT] '{' part_op* '}'
loop_decl     ::= 'loop' NAME ['duration' INTEGER]                                (v1.1)
frame_block   ::= 'frame' INTEGER [STRING] ['duration' INTEGER] '{' (frame_part|'omit' IDENT)* '}'  (v1.1)
frame_part    ::= 'part' IDENT ['after' IDENT] ['material' IDENT] '{' part_op* '}'
export_decl   ::= 'export' IDENT+   (targets: json, svg, phaser, png, aseprite)
```

`part_op` (KNOWN_OPS in validate.pass.js):
```
symmetry axis:x|y|xy|radial|rot [count]
trace outline from image.region("key")
fill color_ref
rim color_ref [at compass]         # compass: north/south/east/west + corners
cell x y color_ref
glow [radius N]
circle  cx cy radius N color_ref
ring    cx cy radius N width N color_ref
rect    x y w h color_ref
polygon (x y)+ color_ref            # >= 3 points
path    "SVG-like-d-string" color_ref
sphere  cx cy radius N [light lx ly] tier_color_ref{5}
ellipse cx cy radius rx [ry N] color_ref
line    x0 y0 x1 y1 color_ref
rotate/scale/translate cx cy params  # reserved; parsed, emit nothing yet
union/subtract/intersect PART_ID PART_ID [PART_ID...]  # see "Boolean ops" below
reference/instance REF color_ref
```
`color_ref` is `#RRGGBB` or a palette alias (bare IDENT resolved against the `palette` block).

`graphMode` is true iff any def exists or any root node isn't a plain `part` (i.e. a group/instance is used). Scene-graph assets currently reject frame blocks (planned PR-3).

## Pass Order (scdl.compiler.js `compileSCDL`)

| Order | Pass | File | Purpose |
|---|---|---|---|
| 0 | parse | scdl.grammar.js | tokenize + recursive-descent parse → SCDL-AST-v1 |
| 1 | validate | passes/validate.pass.js | asset/canvas/dup-id/unknown-op/export-target/vector-param + v1.2 graph structural checks |
| 2 | expandFrames | passes/expand-frames.pass.js | v1.1: materialize per-frame part lists (frame 0 = base, untouched) |
| 3 | *(per frame)* applySemQuant | scdl.compiler.js → ../semantic/* | AST→IR, semantic annotations (never fails the compile; downgrades to PB-SEM-000 info) |
| 4 | resolveColors | passes/resolve-colors.pass.js | colorRef → resolved `#RRGGBB` |
| 5 | resolveMaterials | passes/resolve-materials.pass.js | material id → registry-normalized (WARN + fallback to `source` if unknown) |
| 6a | *(graphMode)* buildSceneGraph | passes/build-scene-graph.pass.js | emits `ast.sceneGraph` (PB-SCENE-GRAPH-v1); **skips 6b/7/8 below** |
| 6b | expandVector | passes/expand-vector.pass.js | phase 1: rasterize each part's own vector ops → cells; phase 2: `resolveBooleanOpsPass` (cross-part) |
| 7 | expandSymmetry | passes/expand-symmetry.pass.js | delegates to `../symmetry-amp.js`; axis map x→vertical, y→horizontal, xy→radial |
| 8 | expandCells | passes/expand-cells.pass.js | fill/rim/glow/trace/cell → concrete `coordinates[]`, bounds-checked |
| 9 | *(optional)* projectGenes | passes/project-genes.pass.js | only when `options.artGenes` non-empty; strict no-op otherwise |
| 10 | emitPacket | passes/emit-packet.pass.js | → PixelBrainAssetPacket (flat coordinates, or scene-graph mode) |
| 11 | emitDiagnostics | passes/emit-diagnostics.pass.js | SCDLError[] → SCD64-compatible diagnostic entries |

Every pass is wrapped in `_runPass`/try-catch inside `scdl.compiler.js`; a thrown pass becomes an SCDL error instead of propagating — **this only works if every error object pushed into the shared array actually conforms to the SCDLError duck type** (see pattern #1 above).

## SCDL_ERROR_CODES (scdl.errors.js)

| Code | Hex | Severity | Meaning |
|---|---|---|---|
| SCDL-001 | 0x1001 | ERROR | Unknown verb |
| SCDL-002 | 0x1002 | ERROR | Missing `asset` declaration |
| SCDL-003 | 0x1003 | ERROR | Invalid canvas (not WxH, W/H > 0) |
| SCDL-004 | 0x1004 | ERROR | Malformed hex literal |
| SCDL-005 | 0x1005 | WARN | Unknown material (falls back to `source`) |
| SCDL-006 | 0x1006 | ERROR | Undefined palette alias |
| SCDL-007 | 0x1007 | ERROR | Cell out of canvas bounds |
| SCDL-008 | 0x1008 | INFO | `trace` stored as intent |
| SCDL-009 | 0x1009 | ERROR | Duplicate part/node id |
| SCDL-010 | 0x100A | ERROR | Unsupported export target |
| SCDL-011 | 0x100B | ERROR | Invalid vector-op parameters (radius ≤0, wrong point count, etc.) |
| SCDL-012 | 0x100C | ERROR | Frame references unknown part (replace/omit) |
| SCDL-013 | 0x100D | ERROR | Frame Index Law violation (sparse/out-of-order/dup/explicit 0) |
| SCDL-014 | 0x100E | ERROR | Bad `after` anchor (missing on add, present on replace) |
| SCDL-015 | 0x100F | WARN | Frame identical to base (dead frame) |
| SCDL-016 | 0x1010 | ERROR | Instance references undeclared def |
| SCDL-017 | 0x1011 | ERROR | Def reference cycle |
| SCDL-018 | 0x1012 | ERROR | Scene-graph depth exceeds cap (8) |
| SCDL-019 | 0x1013 | ERROR | Non-finite transform or scale 0 |
| SCDL-020 | 0x1014 | WARN | Instance fully outside canvas |
| SCDL-021 | 0x1015 | WARN | Def declared but never instanced |
| SCDL-022 | 0x1016 | ERROR | Illegal character (legal in no token) |
| SCDL-023 | 0x1017 | ERROR | Boolean op given fewer than 2 targets |
| SCDL-024 | 0x1018 | WARN | Intersect combines conflicting semantic roles |
| SCDL-025 | 0x1019 | ERROR | Unrecognized `colorRef.kind` |
| SCDL-026 | 0x101A | ERROR | Boolean-op target is not another existing part |

Every `SCDLError` carries `.severity`, `.code`, `.label` ("SCDL-0xx"), `.loc`, `.bytecodeString` (PB-ERR-v1 encoded), and methods `.isError()/.isWarn()/.isInfo()`. **Any code that pushes into the shared errors array must produce this exact shape** — `createSemanticDiagnostic` in `../semantic-registry.js` hand-implements the same duck type for the same reason.

## Boolean Ops — union / subtract / intersect

Targets are **sibling part ids**, not op ids (op ids are internal, auto-generated `op:partId:index:verb` strings an author can never type). Resolution (`passes/lower-booleans.js`, called from `expand-vector.pass.js` phase 2, once every part's own shape is rasterized):

1. Arity check: `< 2` targets → SCDL-023.
2. Target validity: any target equal to the current part's own id, or not an existing part id → SCDL-026.
3. Shape/overlap testing uses `geometry-amp.js`'s `buildPartMask(partOf, partId)`, but the `partOf` map is built **fresh, per part, from only that part's own cells** — never shared across parts. A shared map would resolve an overlapping cell to whichever part is declared *later* (correct for item-foundry's exclusive-territory silhouettes, wrong here: two SCDL parts are free to overlap, and subtract/intersect exist specifically to combine that overlap).
4. `union a b`: later target wins on an overlapping coordinate (matches the codebase's existing painter-order convention). `subtract a b`: base minus every mod part's footprint. `intersect a b`: only coordinates in both base and every mod part's footprint; WARN (SCDL-024) if base/mod cells carry conflicting `.role`.
5. Result cells are retagged `partId: <consuming part's id>` (since `emitPacketPass` trusts `coord.partId` over its containing part) and `sourceOpId: <the boolean op's id>`.
6. Target/cutter parts are **not** removed or hidden — they keep rendering standalone. A boolean op only ever writes into the consuming part's own op list.

## Rasterizer / SDF Math (render/raster-core.js)

- `computeVectorIdentity(op, px, py)` returns `{signedDistance, t, tangent, normal, curvature, arcLength, halfWidth?}` for circle/ellipse/rect/polygon/ring (not line/path/sphere — "not analytically tractable" there). Negative = inside, 0 = boundary, positive = outside.
- Ellipse/ring rasterizers are **stroke** rasterizers (walk the perimeter), not fills — the plotted cells legitimately straddle the centerline; the renderer must use band coverage (`|sd| = halfWidth`), not half-space coverage (`sd = 0`).
- Sphere shading (`rasterizeSphere`) uses the true **hemisphere** normal `(dx,dy,nz)/r` with `nz = sqrt(r² - dx² - dy²)`, not the in-plane radial direction (dropping the z term renders a pinwheel, not a sphere — this was a real fixed bug, see the comment block above `rasterizeSphere`). `SPHERE_THRESHOLDS = [0.95, 0.78, 0.50, 0.18]` are chosen for actual *area share* per tone band (so all 5 tiers are reachable at small radii), not equal angular width.
- `samplePath(d)` handles SVG commands M/L/H/V/Q/T/C/S/A/Z, flattening curves into fixed 10-step polylines. `_normalizeArcFlags(d)` runs first to split SVG's legal concatenated single-digit arc flags (e.g. `"011"` = large-arc `0` + sweep `1` + start of next number) into explicit space-separated tokens — the generic `-?\d*\.?\d+` regex used everywhere else would otherwise fuse them. The path parser only supports one 7-argument group per `A`/`a` occurrence (matching its existing lack of implicit-repeat-command support for every other verb) — it does not need to handle SVG's repeated-group-without-repeated-letter shorthand.

## Exporters & CLI (scdl.exporters.js, scdl.cli.js)

- Targets: `json` (raw packet), `svg` (one `<rect>` per coordinate), `phaser` (texture config), `png` (deterministic RGBA, nearest-neighbor `options.scale`, clamps at `MAX_PNG_SCALE = 32` rather than failing — "a preview must never be the reason a compile fails"), `aseprite` (binary via `aseprite-binary-codec.js`; scene-graph packets not yet supported, "lands in PR-3").
- `exportFilmstripPNG` lays every loop frame left-to-right with no gutter — adjacency is the point, so a one-frame regression is visible at a glance.
- CLI's **Export Naming Law**: outputs default to the *source file's* directory (never CWD), named `<asset>-<target>.<ext>`.
- The CLI calls `compileSCDL` with **no try/catch anywhere** — it depends entirely on the never-throws contract holding. This is exactly why a single non-conforming error object (pattern #1) turned into a CLI crash with a raw stack trace instead of a clean `[SCDL] Compile FAILED`.

---

# Reference: Generalized Compiler/Rasterizer Engineering Patterns

Worked examples behind the six Core Patterns above, all from one real audit-and-fix pass on `codex/core/pixelbrain/scdl/` (2026-08-30). Each generalizes past SCDL.

## 1. A "never throws" contract binds every error-array producer

`scdl.compiler.js` documents: *"Always returns a CompileResult — never throws."* Its final gate:

```js
const hasErrors = errors.some(e => e.isError() || (strict && e.isWarn()));
```

No ternary guard — every entry in `errors` must have a real `.isError()` method. `passes/lower-booleans.js` pushed a plain object on a malformed boolean op:

```js
// before — breaks the contract
if (errors) errors.push({ code: 'PB-SEM-ERR', message: `Boolean op ${boolOp} requires at least 2 targets.` });
```

One line of malformed source (`union a` — a single-token typo) threw `TypeError: e.isError is not a function` straight out of `compileSCDL`, uncaught by the CLI (which has no try/catch, trusting the contract). The 250-test suite stayed green because nothing exercised that op's error path.

Fix: every error producer goes through the same factory.

```js
// after
errors.push(scdlError(
  `Boolean op '${boolOp}' requires at least 2 targets, got ${targets.length}`,
  SCDL_ERROR_CODES.BOOLEAN_OP_ARITY, loc, { op: boolOp, partId: part.id, targets }
));
```

**Generalizes to:** any "this function always returns a result object" contract backed by a shared mutable collection — a linter's diagnostics array, a validation framework's issues list, a build tool's warnings sink. Grep every push-site before trusting the doc comment; add one test per push-site that exercises its trigger condition specifically.

## 2. Cross-entity operations need a two-phase pass

`union`/`subtract`/`intersect` need to read a *sibling* part's cells, but `expandVectorPass` processed one part at a time via `ast.parts.map(part => {...})` — no part could ever see another's output.

```js
// before — single phase, each part isolated
const newParts = ast.parts.map(part => {
  const newOps = [];
  for (const op of part.ops) { /* rasterize + immediately resolve booleans here */ }
  return { ...part, ops: newOps };
});
```

```js
// after — phase 1 rasterizes in isolation, deferring boolean ops
const rasterizedParts = ast.parts.map(part => {
  const newOps = [];
  for (const op of part.ops) {
    // ...
    case 'union': case 'subtract': case 'intersect':
      newOps.push(opWithContext); break; // resolved cross-part in phase 2
  }
  return { ...part, ops: newOps };
});
// phase 2: every part's shape now exists — safe to cross-reference
const newParts = resolveBooleanOpsPass(rasterizedParts, errors);
```

**Generalizes to:** a linker resolving symbols across compilation units, a scene builder resolving instance references across sibling nodes, a spreadsheet engine resolving cross-cell formulas — anything where entity B's op needs entity A's *finished* output can't run in the same pass that produces A.

## 3. Silhouette/single-owner vs. independent-overlap — pick the right ownership model

`geometry-amp.js`'s `buildPartMask(partOf, partId)` reads a shared `{x,y} -> partId` map and returns that part's cells. It was built for item-foundry construction specs, where parts are *designed* as exclusive, non-overlapping territory (a pauldron and a chestplate don't share pixels). Naively reusing it for SCDL parts — which are independently authored and can legitimately overlap — silently broke `intersect`:

```js
// before — ONE map shared across the whole asset
const partOf = new Map();
for (const part of parts) for (const op of part.ops) if (op.op==='cell') partOf.set(key(op), part.id);
// part b (declared after a) writes the SAME coordinates a already owns —
// the shared map now says those coordinates belong to b, not a.
```

Test that caught it: two concentric circles, `part a` (radius 3), `part b` (radius 1, fully inside a), `part c { intersect a b }`. Expected 5 cells (b's full area, since b ⊆ a). Got **0** — because by the time `intersect` ran, the shared map had already reassigned every one of a's cells under b's footprint away from `a`, so `a`'s "shape" no longer included the very region being intersected.

```js
// after — one map PER PART, built only from that part's own cells
function ownPartOf(part) {
  const partOf = new Map();
  for (const op of part.ops) if (op.op === 'cell') partOf.set(cellKey(op), part.id);
  return partOf;
}
function shapeKeysOf(part) {
  return new Set(buildPartMask(ownPartOf(part), part.id).map(cellKey));
}
```

**Generalizes to:** any occupancy/ownership map (a game's tile-ownership grid, a layout engine's z-order hit-testing, a CAD tool's face-ownership map). Before reusing one, ask: *are the entities in my case contractually disjoint, or can they legitimately overlap?* If the latter, the map must be scoped per-entity, never shared.

## 4. Trust a helper's contract, not its name

`buildPartMask` is a perfectly good, reusable "get me this part's shape" primitive — the *bug* wasn't reusing it, it was feeding it the wrong kind of map (see #3). The fix kept the same function call, just changed what was built to feed it. When reusing a helper across domains, read what it actually requires from its input (here: "a map where you've already resolved ownership the way you want"), not just what its output looks like.

## 5. Duplicate tokenizers/parsers drift silently

`scdl.grammar.js` had two full tokenizer implementations: the private `_tokenizeFull` actually used by `parseSCDL`, and a separately hand-written, exported `tokenize()` that two test files called directly. They were kept in sync only by comments cross-referencing each other ("See _tokenizeFull: a bare '-' is an illegal character...").

```js
// before — two independent ~120-line implementations
export function tokenize(source, issues = null) { /* ...its own full lexer... */ }
function _tokenizeFull(source, issues = null) { /* ...a DIFFERENT full lexer... */ }
```

```js
// after — one implementation; the export is a wrapper
export function tokenize(source, issues = null) {
  return _tokenizeFull(source, issues);
}
```

Both happened to agree at audit time (verified empirically before touching anything), but nothing enforced that — a fix landed in one could regress the other invisibly, behind a green "tokenizer test" suite that was actually testing the *unused* copy.

**Generalizes to:** any "reference implementation kept in sync by discipline" — a mock that duplicates real logic instead of wrapping it, a second validation function for "just the UI layer." If a test imports something the production path doesn't call, that test is not testing production.

## 6. SVG-style tokenizers need a flag-digit special case

A generic number regex (`-?\d*\.?\d+`) greedily consumes digit runs. SVG's arc command legally omits separators between its two single-digit flags and the following coordinate: `A rx ry rot large-arc sweep x y` can be written `A3 3 0 013 4` (flags `0`,`1`, then x=`3`, y=`4`). The generic regex reads `013` as one number, silently fusing both flags with the start of the next coordinate and desyncing every token afterward (observed: NaN coordinates propagating into a polygon's bounding box, which then rasterizes as a completely empty region).

Fix: a dedicated pre-pass over the *raw string* (not the token stream) that recognizes arc commands and re-emits their flag characters as explicit, individually space-separated tokens before generic tokenization ever runs:

```js
function _normalizeArcFlags(d) {
  // ...walks the string; on 'A'/'a', reads rx/ry/rotation as normal numbers,
  // then consumes exactly ONE character each for large-arc-flag and
  // sweep-flag (only if it's '0' or '1'), inserting a space after each...
}
const tokens = _normalizeArcFlags(String(d || '')).match(/[a-zA-Z]|-?\d*\.?\d+/g) || [];
```

Verified with a parity test: a compact-flag arc (`"A3 3 0 013 4"`) and its fully spaced-out equivalent (`"A3 3 0 0 1 3 4"`) must rasterize to the identical cell set.

**Generalizes to:** any format with context-sensitive fixed-width tokens embedded in a free-form numeric stream (fixed-width flag fields, bitfields packed next to variable-width numbers). Don't patch the generic tokenizer's regex — normalize the ambiguous region to an unambiguous form first, in its own pass.
