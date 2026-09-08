# SCDL Compiler and Language White Paper and Instruction Manual

**Date:** 2026-08-30 (Updated: v1.2 scene-graph grammar documented, real cross-part
boolean ops, SCDL-016..026 error codes, pipeline map corrected to include the
scene-graph branch and art-gene projection; 2026-09-06 SCDL v2 semantic-core
milestone documented from compiler-demonstrated behavior, CLI `format` / `--write`)
**Applies To:** Scholomance Coordinate Description Language (SCDL v1.2), SCDL-AST-v1 JSON contract (version 1.2.0), PB-SCENE-GRAPH-v1 canonical program form, SCDL-FRAME-LOOP-v1 manifest, PB-Semantics / SemQuant unification layer, compile pass pipeline, SymmetryAMP integration, Phaser/SVG/JSON/PNG/Aseprite exporters, SCD64 + PB-SEM diagnostics, CLI utilities, SCDL v2 semantic-core (`SCDL 2` routing, SCDL-BC-v2, PixelBrain packet emission)
**Implementation PDR:** [`scdl-v1-pdr.md`](../PDR-archive/scdl-v1-pdr.md), [`2026-07-03-scdl-frames-and-cli-out-dir-pdr.md`](../PDR-archive/2026-07-03-scdl-frames-and-cli-out-dir-pdr.md)  
**Implementation PIR:** [`PIR-20260702-SCDL-COMPILER.md`](../post-implementation-reports/PIR-20260702-SCDL-COMPILER.md), [`PIR-20260702-PB-SEMANTICS-SEMQUANT.md`](../post-implementation-reports/PIR-20260702-PB-SEMANTICS-SEMQUANT.md)  
**Companion skill:** `.claude/skills/ScholomanceCompile/` — a Claude Code skill
distilled from a 2026-08-30 audit-and-fix pass on this pipeline (one
never-throws-contract crash found and fixed, the boolean-op rework below).
Load it for generalized parser/pass/rasterizer engineering patterns that
extend past SCDL; this white paper remains the source of truth for SCDL
itself.

---

## 1. Purpose

PixelBrain assets were historically defined using manual JavaScript declarations, hardcoded coordinate arrays, or complex procedural math. This made authoring new assets difficult for designers, and completely bypassed the SCD64 diagnostic immune system during the authoring stage.

SCDL (Scholomance Coordinate Description Language) introduces a **human-legible declarative language** designed to compile human-authored coordinates and geometry rules into canonical, immutable `PixelBrainAssetPacket` structures. 

SCDL is the primary consumer of the **PB-Semantics (SemQuant)** layer, which performs semantic annotation and type unification before the deterministic lowering passes. This ensures roles, parts, materials, effects, and construction guides are resolved into a shared vocabulary regardless of authoring origin.

This white paper details:
- The grammar, tokenizer, and recursive-descent parser (with semantic metadata and full vector op support).
- The compiler pass pipeline (including SemQuant unification and vector lowering).
- How SymmetryAMP (Symmetry Accelerated Microprocessor) is leveraged to mirror coordinates.
- How `PB-ERR-v1` and `PB-SEM-*` bytecode diagnostics are mapped.
- Exporter integration (SVG, Phaser configs, JSON).
- Node.js CLI usage.
- Semantic integration via `semantic-unifier`, `semantic-registry`, and `semantic-bridge`.
- Practical tutorials and a detailed troubleshooting guide.

---

## 2. System Map

The compilation and code flow runs through the following pipeline stages:

```text
SCDL Source Text (.scdl)
        │
        ▼ (Tokenizer / _tokenizeFull)
Tokens Array
        │
        ▼ (Recursive-Descent Parser / parseSCDL)
SCDL-AST-v1 JSON AST  (graphMode = true iff any def/group/instance is used)
        │
        ▼ (Pass 1: validatePass)
Syntax-Checked AST
        │
        ▼ (Pass 1.5: expandFramesPass — v1.1, skipped for graphMode assets)
One virtual part list per frame (frame 0 = base, byte-identical to no-frames)
        │
        ▼ (per frame, from here down) (Pass 2: semanticUnifierPass / SemQuant)
Semantically Annotated AST
(with roles, parts, effects, provenance via semantic-bridge + semantic-registry;
 failures here never abort compilation — downgraded to PB-SEM-000 info)
        │
        ▼ (Pass 3: resolveColorsPass)
Hex-Resolved Palette AST
        │
        ▼ (Pass 4: resolveMaterialsPass)
Material-Registry Validated AST
        │
        ├─── graphMode? ───────────────────────────────────────────────┐
        ▼ (no)                                                        ▼ (yes)
Pass 5: expandVectorPass                                  Pass 5g: buildSceneGraphPass
  phase 1 — rasterize each part's own vector ops in isolation   (SCDL-016..021; emits
    (circle/ring/rect/polygon/path/sphere/ellipse/line)          ast.sceneGraph, the
  phase 2 — resolveBooleanOpsPass: union/subtract/intersect      PB-SCENE-GRAPH-v1
    resolved CROSS-PART by part id, once every part's shape      canonical program —
    is known (§5.7)                                              no frames yet, PR-3)
        │                                                              │
        ▼ (Pass 6: expandSymmetryPass ──► SymmetryAMP)                 │
Mirrored Coordinates AST                                               │
        │                                                              │
        ▼ (Pass 7: expandCellsPass)                                    │
Flat Coordinates AST                                                   │
        │                                                              │
        ▼ (Pass 7.5: projectGenesPass — optional, only if               │
           options.artGenes given; strict no-op otherwise)             │
        │                                                              │
        ▼ (Pass 8: emitPacketPass) ◄──────────────────────────────────┘
PixelBrainAssetPacket (immutable core packet — flat-coordinates mode,
  or scene-graph mode whose id hashes the canonical program, never pixels)
        │
        ▼ (Pass 9: emitDiagnosticsPass ──► PB-ERR-v1 + PB-SEM Bytecode)
CompileResult { ok, ast, packet, framePackets, frameLoop, errors, diagnostics }
        │
        ├──────────────────────┼──────────────────────┬──────────────┐
        ▼                      ▼                      ▼              ▼
   JSON Exporter          SVG Exporter         Phaser Exporter   PNG / Aseprite
```

This strict layout guarantees that raw source code is parsed in a pure, side-effect-free environment, compiling into standard intermediate structures before reaching the runtime engines. Every pass runs inside a try/catch in `scdl.compiler.js`; a pass that throws becomes an SCDL error instead of propagating, which is why `compileSCDL()` is documented to **never throw** — see §5.7 and §10 for what happens when one error-producing code path doesn't hold up its end of that contract.

The semantic unifier (Pass 2) is the only non-geometry pass; it is responsible solely for meaning resolution and never mutates coordinate values. `graphMode` assets (any `def`, `group`, or `instance` in the source) skip vector/symmetry/cell expansion entirely in favor of `buildSceneGraphPass`, and currently reject frame blocks outright (planned PR-3).

---

## 3. The SCDL-v1 Grammar

SCDL-v1 is designed to be concise and readable. The grammar defines asset metadata, a global palette block, part configurations, geometry rules, and export targets.

Parser output nodes now include stable `id` and `sourceSpan` metadata. Parts and ops may carry optional semantic hints (`role`, `partId`) that are resolved by the SemQuant layer.

### 3.1 Formal Grammar Definition

```ebnf
program       ::= asset_decl palette_block? def_block*
                   (part_block | group_block | instance_stmt)*
                   loop_decl? frame_block* export_decl?

(* v1.2 scene-graph: presence of any def_block, group_block, or instance_stmt
   anywhere in roots sets ast.graphMode = true. Graph-mode assets currently
   reject loop_decl/frame_block (SCDL error, "planned: PR-3"). *)
def_block     ::= 'def' IDENT '{' (part_block | group_block | instance_stmt)* '}'
group_block   ::= 'group' IDENT transform_clause '{' scene_node* '}'
scene_node    ::= part_block | group_block | instance_stmt
instance_stmt ::= 'instance' IDENT ['as' IDENT] transform_clause ['material' IDENT]
transform_clause ::= ['at' NUMBER NUMBER] ['rotate' NUMBER]
                     ['scale' NUMBER [NUMBER]] ['mirror' ('x'|'y'|'xy')]
(* 'at' is mandatory on instance_stmt (missing → SCDL-019); optional on
   group_block, defaulting to the identity transform. *)

loop_decl     ::= 'loop' NAME ['duration' INTEGER]
frame_block   ::= 'frame' INTEGER [STRING] ['duration' INTEGER] '{' frame_item* '}'
frame_item    ::= frame_part | omit_stmt
frame_part    ::= 'part' IDENT ['after' IDENT] ['material' IDENT] '{' part_op* '}'
omit_stmt     ::= 'omit' IDENT

asset_decl    ::= 'asset' NAME 'canvas' DIMENSION
DIMENSION     ::= INTEGER 'x' INTEGER
NAME          ::= [a-zA-Z_][a-zA-Z0-9_]*

palette_block ::= 'palette' '{' color_entry* '}'
color_entry   ::= NAME '=' HEX_COLOR

part_block    ::= 'part' IDENT ['material' IDENT] '{' part_op* '}'
part_op       ::= symmetry_op
               | trace_op
               | fill_op
               | rim_op
               | cell_op
               | glow_op
               | circle_op
               | ring_op
               | rect_op
               | polygon_op
               | path_op
               | sphere_op
               | ellipse_op
               | line_op
               | rotate_op
               | scale_op
               | translate_op
               | union_op
               | subtract_op
               | intersect_op
               | reference_op
               | instance_op
               | radial_symmetry_op

symmetry_op   ::= 'symmetry' ( 'x' | 'y' | 'xy' | 'radial' INTEGER )
trace_op      ::= 'trace' 'outline' 'from' 'image.region' '(' STRING ')'
fill_op       ::= 'fill' COLOR_REF
rim_op        ::= 'rim' COLOR_REF 'at' COMPASS
cell_op       ::= 'cell' INTEGER INTEGER COLOR_REF
glow_op       ::= 'glow' 'radius' INTEGER

circle_op     ::= 'circle' NUMBER NUMBER 'radius' NUMBER COLOR_REF
ring_op       ::= 'ring' NUMBER NUMBER 'radius' NUMBER 'width' NUMBER COLOR_REF
rect_op       ::= 'rect' NUMBER NUMBER NUMBER NUMBER COLOR_REF
polygon_op    ::= 'polygon' point_list COLOR_REF
path_op       ::= 'path' STRING COLOR_REF
sphere_op     ::= 'sphere' NUMBER NUMBER 'radius' NUMBER
                  ['light' NUMBER NUMBER]
                  COLOR_REF+
ellipse_op    ::= 'ellipse' NUMBER NUMBER 'radius' NUMBER NUMBER COLOR_REF
line_op       ::= 'line' NUMBER NUMBER NUMBER NUMBER COLOR_REF
rotate_op     ::= 'rotate' NUMBER NUMBER ['degrees'] NUMBER
scale_op      ::= 'scale' NUMBER NUMBER NUMBER ['sy' NUMBER]
translate_op  ::= 'translate' NUMBER NUMBER NUMBER NUMBER
union_op      ::= 'union' IDENT IDENT
subtract_op   ::= 'subtract' IDENT IDENT
intersect_op  ::= 'intersect' IDENT IDENT
reference_op  ::= 'reference' STRING [COLOR_REF]
instance_op   ::= 'instance' STRING [COLOR_REF]
radial_symmetry_op ::= 'symmetry' 'radial' INTEGER

(* sphere: the light vector is optional; colors are one-or-more shading
   tiers, five (shine/core/core/rim/shadow) being the standard set.
   instance_op here is the LEGACY part_op alias of reference_op (emits a
   single marker cell) — distinct from the v1.2 scene-graph instance_stmt
   above, which is a root/group-level node, not a part_op.
   union_op/subtract_op/intersect_op: the two IDENTs are SIBLING PART ids —
   not op ids, not the current part's own id. See §5.7 for full semantics,
   error codes, and why op-id-based targeting (the pre-2026-08-30 design)
   never worked for any hand-authored source. *)

NUMBER        ::= SIGN? DIGIT+ ('.' DIGIT+)?
SIGN          ::= '+' | '-'
DIGIT         ::= [0-9]
point_list    ::= point (point)*
point         ::= NUMBER NUMBER

COLOR_REF     ::= HEX_COLOR | NAME
COMPASS       ::= 'north' | 'south' | 'east' | 'west'
               | 'north' 'west' | 'north' 'east'
               | 'south' 'west' | 'south' 'east'
HEX_COLOR     ::= '#' [0-9A-Fa-f]{6}
```

### 3.2 Canonical Example

```
# void_chestplate.scdl
asset void_chestplate canvas 64x64

palette {
  void0 = #05060D
  gold2 = #D8B84C
  cyan2 = #00E5FF
}

part torso material voidsteel {
  symmetry x
  trace outline from image.region("body")
  fill void0
  rim gold2 at north west
}

part gem material cyan_glow {
  cell 31 18 cyan2
  glow radius 2
}

export json svg phaser
```

### 3.3 Vector + SemQuant Example (crimson_ooze_sphere)

This example demonstrates the current capabilities: vector authoring + semantic metadata propagation.

```
# crimson_ooze_sphere.scdl
asset crimson_ooze canvas 24x24

palette {
  shine  = #ff9aaa
  core   = #b51d32
  rim    = #571020
  shadow = #260711
}

part body material slime {
  sphere 11.5 11.5 radius 10 light -1 -1 shine core core rim shadow
  glow radius 2
}

export json svg phaser
```

After `expandVectorPass` + SemQuant, emitted cells carry provenance and role:

```json
{
  "x": 12,
  "y": 12,
  "color": "#b51d32",
  "partId": "body",
  "role": "body",
  "semanticRole": "body",
  "sourceOpId": "scdl:body:0:sphere",
  "material": "slime"
}
```

This is the recommended modern authoring style for complex radial and shaded assets.

### 3.4 Frames (SCDL v1.1)

Multi-frame assets declare a `loop` and `frame` blocks after the base parts.
Frame 0 is implicitly the base asset; each frame block carries part-level
deltas only:

```
loop idle duration 400

frame 1 "hood-dip" {
  part hood material void_cloth {          # replacement: keeps hood's painter slot
    circle 15.5 11 radius 7.5 hoodhi
    circle 15.5 11.5 radius 6 hooddeep
  }
  part hoodbrow after face material void_cloth {   # addition: 'after' anchor mandatory
    rect 12 7 8 2 hood
  }
}

frame 2 "fade" {
  omit eyespark                            # omission: part absent in this frame
}
```

**Frame Index Law (SCDL-013):** indices are dense and declaration-ordered
(`1, 2, ... N`). Sparse, duplicate, out-of-order, or explicit `frame 0`
declarations are rejected — never normalized.

**Replacement Ordering Law (SCDL-014):** a replacement keeps the replaced base
part's painter-order slot and must not carry an `after` anchor; an added part
must carry a known `after` anchor.

**Base identity invariant:** adding frame blocks never changes the frame-0
packet ID — the base compiles byte-identically with or without them.

Each frame compiles to its own `PixelBrainAssetPacket`; the compiler also
emits a `SCDL-FRAME-LOOP-v1` manifest (see §7.5). Reference asset:
`fixtures/void_acolyte/void_acolyte.scdl` (4-frame idle loop, co-located
with its exports so the default out-dir writes in place).

---

## 4. AST JSON Contract (`SCDL-AST-v1`)

The parser transforms the source text into a structured JSON AST carrying a `contract` identifier and a source checksum — a 64-bit `hashString` digest (from `codex/core/pixelbrain/shared.js`) of the normalized source, rendered as 16 hex characters.

After the SemQuant pass, nodes carry additional semantic metadata:
- `id`
- `sourceSpan`
- `annotations` (array of `{domain, semanticType, canonicalType, confidence, sourceRefs}`)
- `role` / `partId` (when declared or inferred)

These are propagated downstream into packet coordinates.

```json
{
  "contract": "SCDL-AST-v1",
  "version": "1.2.0",
  "checksum": "000000000514b500",
  "asset": "void_chestplate",
  "type": "void_chestplate",
  "canvas": {
    "width": 64,
    "height": 64
  },
  "palette": {
    "void0": "#05060D",
    "gold2": "#D8B84C",
    "cyan2": "#00E5FF"
  },
  "parts": [
    {
      "id": "torso",
      "material": "voidsteel",
      "ops": [
        { "op": "symmetry", "axis": "x" },
        { "op": "trace", "source": "image.region.body", "intent": true },
        { "op": "fill", "colorRef": { "kind": "alias", "value": "void0" } },
        { "op": "rim", "colorRef": { "kind": "alias", "value": "gold2" }, "compass": "north west" }
      ]
    }
  ],
  "exports": ["json", "svg", "phaser"]
}
```

---

## 5. Compiler Pass Pipeline

The compiler (`scdl.compiler.js`) transforms the AST into a `PixelBrainAssetPacket` and generates diagnostic metadata through the stages below. Stage numbers describe the logical pipeline; in `scdl.compiler.js` the SemQuant stage runs as a fault-isolated block between `validatePass` and `resolveColorsPass` (its failures are downgraded to `PB-SEM-000` info diagnostics and can never abort compilation), and the code numbers the remaining deterministic passes 1–8.

| Pass Name | Responsibility |
|:---|:---|
| **Pass 1: `validatePass`** | Asserts schema correctness. Checks for missing assets, non-positive canvas dimensions, duplicate part IDs, and unrecognized keywords. |
| **Pass 1.5: `expandFramesPass`** (SCDL v1.1) | Runs immediately after `validatePass`. Materializes one virtual part list per frame from the base parts plus frame overrides (replace / add-after / omit); enforces the Frame Index Law and Replacement Ordering Law (SCDL-012/013/014/015). Frame 0 is the untouched base. All subsequent passes (including SemQuant) run once **per frame**; single-frame assets run the pipeline exactly once, unchanged. |
| **Pass 2: `semanticUnifierPass`** (SemQuant) | Performs semantic annotation and type unification via `semantic-bridge.js` and `semantic-registry.js`. Resolves roles, parts, effects, materials, and construction guides into canonical form. Attaches `annotations`, `sourceOpId`, provenance, and lowering history. Emits PB-SEM diagnostics. |
| **Pass 3: `resolveColorsPass`** | Evaluates all palette aliases (`void0`) against the palette block, translating them into literal `#RRGGBB` hex strings. Asserts hex color pattern matching. |
| **Pass 4: `resolveMaterialsPass`** | Validates part materials against the system's `material-registry.js`. Emits warnings for unrecognized materials and normalizes them. |
| **Pass 5: `expandVectorPass`** | Runs in two phases. **Phase 1** lowers each part's own vector ops (circle, ring, rect, polygon, path, sphere, ellipse, line) into deterministic cell ops in isolation, preserving partId, role, semanticRole, sourceOpId, and material context; `union`/`subtract`/`intersect` ops are carried through unresolved. **Phase 2** (`resolveBooleanOpsPass`, `passes/lower-booleans.js`) resolves every boolean op now that every part's own shape exists — see §5.7. Runs before symmetry so mirrored geometry operates on canonical cells. Skipped entirely for `graphMode` assets (see Pass 5g). |
| **Pass 5g: `buildSceneGraphPass`** (v1.2, `graphMode` only) | Runs *instead of* Pass 5/6/7 for scene-graph assets. Validates every `instance` resolves to a declared `def` (SCDL-016), that the def-reference digraph is acyclic (SCDL-017), and that expansion depth stays within the cap of 8 (SCDL-018, memoized). Warns on a def never instanced (SCDL-021) or an instance whose world-space AABB misses the canvas entirely (SCDL-020). Emits `ast.sceneGraph` — a canonical, identity-bearing `PB-SCENE-GRAPH-v1` structure stripped of source locations and annotations, so the packet id hashes the *program*, not authoring metadata. |
| **Pass 6: `expandSymmetryPass`** | Translates symmetry axis tags (`x`, `y`, `xy`) to `SymmetryAMP` types (`vertical`, `horizontal`, `radial`). Generates mirror coordinate pairs and drops the symmetry op. |
| **Pass 7: `expandCellsPass`** | Expands geometric operations (rim bounds, cell coordinate offsets, fill intents) to flat coordinate lists. Captures glows and traces as descriptor intents. Propagates semantic metadata (`role`, `partId`, `sourceOpId`) to coordinates. |
| **Pass 7.5: `projectGenesPass`** (optional) | Only runs when `options.artGenes` is a non-empty array; strict no-op otherwise (§6.5 of the Ontological Art-Direction PDR guarantees byte-identical output when unused). Projects approved art-direction genes onto the canvas deterministically, with full causal provenance per cell. |
| **Pass 8: `emitPacketPass`** | Invokes `createPixelBrainAssetPacket` from `pixelbrain-asset-packet.js` to build the final immutable resource — flat-coordinates mode for ordinary assets, or scene-graph mode (id = hash of the canonical program) for `graphMode` assets. Semantic fields are preserved on coordinates. |
| **Pass 9: `emitDiagnosticsPass`** | Evaluates all compiled warnings/errors (including PB-SEM), translating them to `DiagnosticReport` schemas. |

---

## 5.5 Semantic Unification (SemQuant Integration)

SCDL is the primary surface for **PB-Semantics (SemQuant)**.

After `validatePass`, the compiler converts the AST to IR (`semantic/adapters/scdl-to-ir.adapter.js`) and runs `semanticUnifierPass` (`semantic/semantic-unifier.js`) directly:

```js
const ir = scdlAstToIR(ast);
const unified = semanticUnifierPass(ir);
// annotations, roles, sourceOpId, loweringSteps are attached back to AST ops/parts
```

(`semantic-bridge.js` provides the packet-level enrichment API — `applyAuthoringSemantics()`, `enrichPacketWithSemantics()` — for consumers outside the compile pipeline.)

Key artifacts:
- `semantic-registry.js` — canonical `CanonicalRoles`, `ROLE_ALIASES`, `resolveRole()`
- `semantic-unifier.js` — deterministic inference + PB-SEM diagnostics
- `semantic-bridge.js` — `applyAuthoringSemantics()`, `enrichPacketWithSemantics()`

Coordinates emitted by `expandCellsPass` and the final packet carry:
- `partId`
- `role` / `semanticRole`
- `sourceOpId`
- (when available) semantic annotations

This guarantees that higher-level authoring intent survives all the way to `PixelBrainAssetPacket.geometry.coordinates`.

See also:
- `codex/core/pixelbrain/semantic/`
- `PIR-20260702-PB-SEMANTICS-SEMQUANT.md`

---

## 5.6 Packet Identity and Semantic Metadata

Geometry identity (and thus the stable `packet.id`) is determined exclusively by render-authoritative coordinate fields: `x`, `y`, `color`, and any fields that directly affect the visual lattice.

Semantic metadata such as `sourceOpId`, `semanticRole`, `annotations`, `provenance`, and lowering history is **additive**. It is attached to coordinates for traceability and higher-level tooling but:

- Does **not** affect the geometry hash used for packet identity.
- Does **not** affect exporter output equality for deterministic assets (JSON, SVG, PNG, Phaser) unless semantic metadata is explicitly included in the export target.
- Does **not** change golden fixture behavior or regression seeds.

If a consumer needs to differentiate assets based on authoring provenance, it should use a separate `semanticHash` or inspect the `provenance` / annotations directly rather than relying on the core packet ID.

This policy ensures that pure semantic-only changes (e.g. richer provenance or role labels) do not invalidate existing deterministic outputs or caches.

## 5.7 Boolean Operations and Semantic Ownership Rules

Boolean ops (`union`, `subtract`, `intersect`) combine geometry across **sibling
parts**, addressed by part id. This is a deliberate design point, not an
implementation detail: op ids (`op:partId:index:verb`) are internal and
auto-generated, so no SCDL author can ever type one — an earlier design that
matched targets against op ids was live in the grammar and validator for some
time but **silently combined nothing** for any hand-written source (confirmed
by compiling `subtract a b` on two overlapping circles and observing
byte-identical output to no `subtract` at all). Reworked 2026-08-30 to target
part ids instead — the one identifier an author already has reason to name.

**Resolution** (`resolveBooleanOpsPass`, `passes/lower-booleans.js`, run as
Pass 5's phase 2 — see §2/§5 — once every part's own vector ops are
rasterized):

1. **Arity.** Fewer than 2 targets → `SCDL-023`.
2. **Target validity.** Any target equal to the current part's own id
   (self-reference), or not the id of an existing sibling part → `SCDL-026`.
3. **Shape/overlap resolution.** Which cells belong to a given part is
   resolved via `geometry-amp.js`'s `buildPartMask()` — the same primitive the
   item-foundry shading pipeline uses to turn a silhouette occupancy map into
   a part's cell mask. Critically, the `{x,y}→partId` map fed into it is built
   **fresh per part**, from only that part's own cells, never shared across
   parts: `buildPartMask` resolves an overlapping cell to a single owner
   (last writer wins), which is correct for item-foundry's exclusive-territory
   construction specs but wrong here — two independently authored SCDL parts
   are free to draw the same coordinate, and `subtract`/`intersect` exist
   specifically to combine that legitimate overlap. A shared map was tried
   and caught by a regression test: two concentric circles (`a` radius 3,
   `b` radius 1, fully inside `a`) fed to `intersect a b` produced **zero**
   cells instead of the expected 5, because the shared map had already
   reassigned every one of `a`'s overlapped cells to the later-declared `b`.
4. **Combination.**
   - `union a b`: every cell in `a` or `b`; on an overlapping coordinate the
     later-declared target wins (the codebase's existing painter-order
     convention). Result inherits `a`'s role, or `union-result` if `a` has
     none.
   - `subtract a b`: `a`'s cells with every target's footprint removed.
     Result inherits `a`'s role, then `part.material`, then `body`.
   - `intersect a b`: only cells present in both `a` and every other target.
     Result inherits `a`'s role, or `intersect-ambiguous` if none. Conflicting
     roles between base and modifier cells emit `SCDL-024` (WARN — the
     compile still succeeds; this is the code this document previously called
     "PB-SEM-002", renumbered into the SCDL-0xx catalogue for consistency
     with every other SCDL diagnostic).
5. **Provenance.** Every cell pulled into the consuming part is retagged
   `partId: <consuming part>` (so `emitPacketPass`, which trusts
   `coord.partId` over its containing part, attributes it correctly) and
   `sourceOpId: <the boolean op's id>`.
6. **Target parts are not hidden.** `a` and `b` keep rendering standalone in
   the final packet exactly as authored — a boolean op only ever writes into
   the *consuming* part's own op list. Because a boolean op's result cells
   share the exact same coordinates as their inputs (there is no relocation),
   a flattened raster of inputs + result looks pixel-identical to the inputs
   alone; verify a boolean op against the compiled packet's per-part
   coordinate counts, not against a rendered image (see the Authoring Guide
   §4.13 for a worked example and real numbers).

---

## 6. Bytecode Error & Diagnostic Registry

In alignment with Vaelrix Law 8, compile errors must emit `PB-ERR-v1` bytecode payloads. The SCDL compiler maps language issues to distinct numeric sub-codes.

### 6.1 SCDL Error Catalogue

| Sub-code | Label | Severity | Category | Description |
|:---|:---|:---|:---|:---|
| `0x1001` | `SCDL-001` | ERROR | `STATE` | Unknown op verb or unrecognized keyword. |
| `0x1002` | `SCDL-002` | ERROR | `STATE` | Missing the mandatory `asset` header declaration. |
| `0x1003` | `SCDL-003` | ERROR | `VALUE` | Canvas size format is malformed or non-positive. |
| `0x1004` | `SCDL-004` | ERROR | `COLOR` | Hex literal does not match the strict `#RRGGBB` pattern. |
| `0x1005` | `SCDL-005` | WARN | `VALUE` | Unrecognized material (warns and defaults to `'source'`). |
| `0x1006` | `SCDL-006` | ERROR | `VALUE` | Referenced palette alias was not defined in `palette {}`. |
| `0x1007` | `SCDL-007` | ERROR | `COORD` | Declared coordinate falls outside the canvas boundary. |
| `0x1008` | `SCDL-008` | INFO | `STATE` | Image region trace intent preserved for runtime evaluation. |
| `0x1009` | `SCDL-009` | ERROR | `VALUE` | Duplicate part ID declared in the same asset scope. |
| `0x100A` | `SCDL-010` | WARN | `VALUE` | Unrecognized export target (warns and ignores). |
| `0x100B` | `SCDL-011` | ERROR | `VALUE` | Invalid vector op parameters (e.g. negative radius, malformed path, invalid light vector, or unsupported payload). |
| `0x100C` | `SCDL-012` | ERROR | `STATE` | Frame targets unknown part id (replace or omit). |
| `0x100D` | `SCDL-013` | ERROR | `VALUE` | Frame Index Law violation: duplicate, sparse, or out-of-declaration-order frame index, or explicit `frame 0`. |
| `0x100E` | `SCDL-014` | ERROR | `STATE` | Added part missing/unknown `after` anchor, or `after` given on a replacement (Replacement Ordering Law). |
| `0x100F` | `SCDL-015` | WARN | `STATE` | Frame identical to base after expansion (dead frame). |
| `0x1010` | `SCDL-016` | ERROR | `STATE` | v1.2 scene-graph: `instance` references an undeclared `def`. |
| `0x1011` | `SCDL-017` | ERROR | `STATE` | v1.2 scene-graph: def-reference cycle. |
| `0x1012` | `SCDL-018` | ERROR | `STATE` | v1.2 scene-graph: expansion depth exceeds the cap (8). |
| `0x1013` | `SCDL-019` | ERROR | `STATE` | v1.2 scene-graph: non-finite transform parameter, or scale of 0. |
| `0x1014` | `SCDL-020` | WARN | `VALUE` | v1.2 scene-graph: instance's world-space AABB misses the canvas entirely. |
| `0x1015` | `SCDL-021` | WARN | `VALUE` | v1.2 scene-graph: def declared but never instanced. |
| `0x1016` | `SCDL-022` | ERROR | `STATE` | Character legal in no SCDL token (previously silently dropped, surfacing a mis-tokenized error several tokens later). |
| `0x1017` | `SCDL-023` | ERROR | `STATE` | Boolean op (`union`/`subtract`/`intersect`) given fewer than 2 targets. |
| `0x1018` | `SCDL-024` | WARN | `VALUE` | `intersect` combines cells with conflicting semantic roles (see §5.7). |
| `0x1019` | `SCDL-025` | ERROR | `STATE` | Unrecognized `colorRef.kind` — reachable only from internal AST producers, not the current grammar. |
| `0x101A` | `SCDL-026` | ERROR | `STATE` | Boolean-op target is not another existing sibling part (unknown id or self-reference). |

*Category* is derived purely from severity (`_sevToCategory` in `scdl.errors.js`:
`ERROR` and `INFO` → `STATE`, `WARN` → `VALUE`), not a per-error semantic
label — the `COLOR`/`COORD` categories on a few rows above predate that
simplification and are illustrative, not literal bytecode output.

In addition, the SemQuant layer (integrated after validatePass) emits `PB-SEM-*` diagnostics for semantic issues:

| Code | Label | Severity | Description |
|:---|:---|:---|:---|
| `PB-SEM-001` | UNKNOWN_ROLE | WARN | Role could not be resolved to a canonical value. |
| `PB-SEM-002` | AMBIGUOUS_ROLE | WARN | Multiple conflicting role interpretations detected. |
| `PB-SEM-003` | MISSING_MATERIAL_BINDING | WARN | Effect (e.g. glow) has no material binding. |
| `PB-SEM-004` | INVALID_EFFECT_TARGET | ERROR | Effect targets an invalid or missing part/role. |
| `PB-SEM-005` | PROVENANCE_LOSS | WARN | Semantic provenance or source reference was lost during lowering. |

### 6.2 Bytecode Encoding Layout

The SCDL compiler emits `PB-ERR-v1` bytecode. The SemQuant semantic unifier emits `PB-SEM-*` diagnostics that integrate into the same reporting system:

```text
PB-ERR-v1-{CATEGORY}-{SEVERITY}-ARTIFA-{HEX_CODE}-{BASE64_CONTEXT}-{CHECKSUM}
PB-SEM-{CODE}-{SEVERITY}-{CONTEXT}
```

*Note: `ARTIFA` represents the `ARTIFACT` module ID range (`0x1000–0x10FF`) dedicated to compiler and validation tools. Semantic diagnostics are produced by the `semantic-unifier` pass and `semantic-bridge.js`.*

---

## 7. Exporter Implementations

The `scdl.exporters.js` library translates a compiled `PixelBrainAssetPacket` into target-specific configurations.

### 7.1 JSON Exporter
Produces the fully hydrated standard `pixelbrain.asset.v1` lattice JSON representation.

### 7.2 SVG Exporter
Draws crisp pixel grids using SVG `<rect>` primitives matching the coordinates:
```xml
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" shape-rendering="crispEdges">
  <rect x="31" y="18" width="1" height="1" fill="#00E5FF"/>
  <rect x="32" y="18" width="1" height="1" fill="#00E5FF"/>
</svg>
```

### 7.3 Phaser Exporter (unchanged; see §7.4–7.5 for v1.1 additions)
Generates a texture config JSON format for direct loader consumption. Colors are translated to **32-bit integers** (`(r << 16) | (g << 8) | b`) to allow instant graphics rendering.
```json
{
  "type": "scdl-phaser-v1",
  "key": "void_chestplate",
  "canvas": { "width": 64, "height": 64 },
  "pixels": [
    { "x": 31, "y": 18, "color": 58879 }
  ],
  "parts": [
    { "id": "torso", "material": "voidsteel" }
  ]
}
```

### 7.4 Aseprite Exporter (SCDL v1.1)

The `aseprite` target lowers frame packets through
`codex/core/pixelbrain/aseprite-binary-codec.js` into a real `.aseprite`
binary. Per the animation-encoding white paper's Encoder Law:

- The layer table is fixed: the union of every frame's part ids, merged in
  painter order; identical names/order in every frame.
- Every frame carries its **own deep-copied `layers`** and cell arrays.
- Parts absent from a frame are present-but-empty layers.
- Frame durations come from the `SCDL-FRAME-LOOP-v1` manifest.

Multi-frame assets emit **one combined file** (`<asset>-aseprite.aseprite`,
never a frame-infixed name). Verification of the encoded binary is limited to
frame count and canvas dimensions — the codec's decoder has a known
cell-accumulation bug.

### 7.5 SCDL-FRAME-LOOP-v1 Manifest

For multi-frame assets, `compileSCDL()` returns `frameLoop` (and the CLI
writes `<asset>-frameloop.json`):

```json
{
  "contract": "SCDL-FRAME-LOOP-v1",
  "asset": "void_acolyte",
  "loop": "idle",
  "canvas": { "width": 32, "height": 48 },
  "defaultDurationMs": 400,
  "sourceChecksum": "…",
  "frames": [
    { "index": 0, "label": "rest",       "durationMs": 400, "packet": "pbasset_2595caa6" },
    { "index": 1, "label": "hood-dip",   "durationMs": 400, "packet": "pbasset_…" }
  ]
}
```

The manifest is compiler output — never hand-written. Canonical state is the
frame packets; raster previews are never a source of truth.

---

## 8. CLI Command Manual

The Node.js CLI utility is located at `codex/core/pixelbrain/scdl/scdl.cli.js`.

Every command is also reachable as `npm run scdl -- <command> …`, or through the
per-command shortcuts `npm run scdl:compile|scdl:preview|scdl:check|scdl:format`. Bare
`npm run scdl` (or running the file with no arguments) prints current usage.

| Command | Purpose | Writes files? |
|---|---|---|
| `compile` | run the pass pipeline and emit exports | yes |
| `preview` | magnified PNG(s) to actually look at | yes |
| `check` | run the pipeline and report diagnostics | no |
| `parse` | raw AST, no semantic passes | no |
| `format` | canonical SCDL 2 source spelling | only with `--write` |

### 8.1 Compilation
Compile an SCDL file and generate target files (defaults to `json`):
```bash
node codex/core/pixelbrain/scdl/scdl.cli.js compile fixtures/void_chestplate.scdl --export json,svg,phaser
node codex/core/pixelbrain/scdl/scdl.cli.js compile fixtures/void_acolyte/void_acolyte.scdl --export json,png,svg,phaser,aseprite
```

Valid `--export` targets: `json`, `svg`, `png`, `phaser`, `aseprite` (comma-separated).

**Export Naming Law (SCDL v1.1):** outputs default to the **source file's
directory** (never the process CWD; override with `--out-dir <dir>`), and all
targets use target-suffixed names — there is no case where a bare
`<asset>.<ext>` name is written:

```
Single-frame:  <asset>-json.json   <asset>-png.png   <asset>-svg.svg   <asset>-phaser.json
Multi-frame:   <asset>-f<N>-<target>.<ext>  per frame
               <asset>-frameloop.json
               <asset>-aseprite.aseprite    (one combined file)
```

`--out-dir` is **created if it does not exist**, including intermediate
directories. (It used to be trusted to pre-exist, which made the Quick Start in
the Authoring Guide fail with a bare `ENOENT` on every first run — audit
2026-09-03.)

| Flag | Effect |
|---|---|
| `--export <csv>` | targets to emit; default `json` |
| `--out-dir <dir>` | write here instead of beside the source; created on demand |
| `--out <file>` | exact single-target destination (gets a target infix when `--export` lists more than one target) |
| `--scale <N>` | magnify raster exports; **default 1**, so a canonical PNG still matches the declared canvas |
| `--shade material` | shade per material instead of the default Lambert banding |
| `--shade vri` | route through the Vixel Render IR engine instead (see §8.5); PNG export only |
| `--strokes` | with `--shade vri`: add the `PB-STROKE-v1` contour overlay (see §8.5) |
| `--relief <mode>` | with `--shade vri`: relief model for flat cells; `synthetic` is the only mode (see §8.5) |
| `--lineage` | with `--shade vri`: also write the `PB-ASSET-LINEAGE-v1` sidecar (see §8.5) |
| `--semantic` | embed SemQuant annotations in the JSON export |
| `--strict` | promote warnings to errors (see §8.4) |
| `--bytecode` | append the `PB-ERR-v1` payload to each diagnostic (see §8.4) |
| `--json` | format CLI reports, diagnostics, and inspection envelopes as machine-readable JSON |

### 8.2 Preview — the iterate-and-look command
```bash
node codex/core/pixelbrain/scdl/scdl.cli.js preview fixtures/void_chestplate.scdl --scale 8
```

This is the command an artist runs most, and it was missing from this manual
entirely. A canonical export is the exact declared canvas (16×24, 24×24 …),
which is unreadable on screen and must stay that way for downstream consumers —
so looking at your work is a separate operation with its own namespace:

```
<asset>-preview-<N>x.png          single frame
<asset>-preview-<N>x-strip.png    one filmstrip per animated loop
```

Default scale is 8 (`--scale` accepted up to 32; an absurd value is clamped
with a warning rather than allocating a gigabyte or refusing). Preview files sit
**outside** the Export Naming Law and are never valid compiler inputs.
`--out-dir`, `--shade`, `--strict` and `--bytecode` all apply here too.

### 8.3 Parsing to AST
Generate the raw parsed AST for diagnostic inspection:
```bash
node codex/core/pixelbrain/scdl/scdl.cli.js parse fixtures/void_chestplate.scdl --out ast.json
```
Without `--out` the AST goes to stdout, so it pipes: `… parse x.scdl | jq .parts`.
Parse-level `INFO` diagnostics are printed after the JSON — earlier versions
printed only a count (`Parse warnings: 3`) and discarded the list.

### 8.4 Checking Diagnostics
Runs the compilation pass pipeline, validating syntax, colors, and bounds without generating output files:
```bash
node codex/core/pixelbrain/scdl/scdl.cli.js check fixtures/void_chestplate.scdl
```
Exits `0` when the asset compiles clean, `1` otherwise. Diagnostics render
identically across all four commands:

```
  WARN: [SCDL-005] Unknown material 'crimson_ooze_material' in part 'body' — falling back to 'source' (line 18:1)
```

Two deliberate choices, both from audit 2026-09-03:

- **`--strict`** promotes warnings to errors. `SCDL-005` earns a gate: an
  unknown material does not fail a compile, it silently falls back to `source`,
  so a typo'd material name produces a *wrong-looking asset that reports
  success*. Use `--strict` in CI.
- **the `PB-ERR-v1` bytecode payload is off by default** and opt-in with
  `--bytecode` (or `SCDL_BYTECODE=1`). It is a ~250-character base64 correlation
  handle for tooling. It used to be inlined unconditionally on `preview` and
  `check` but not `compile`, so the same warning looked different depending on
  which command you happened to run.

### 8.5 VRI Shading — the physically-motivated path
`--shade vri` routes the asset through the Vixel Render IR engine
(`compileAsset()` → `compileVRI()` → `renderVRI()`) instead of the default
material shader. It is opt-in, deterministic, lineage-recorded, and PNG-export
only (any other `--export` target is refused rather than silently mislabeled):

```bash
node codex/core/pixelbrain/scdl/scdl.cli.js compile fixtures/void_acolyte/void_acolyte.scdl --shade vri --out-dir out
```

Three modifiers, each independently opt-in and each byte-neutral when omitted:

| Flag | Effect |
|---|---|
| `--strokes` | Overlay the `PB-STROKE-v1` contour pass: discrete silhouette and material-boundary ink extracted by integer-grid adjacency. This repairs the tearing that continuous per-cell coverage estimates can leave at part boundaries. |
| `--relief synthetic` | `PB-VRI-RELIEF-v1`: flat hand-painted cells carry no vector relief, so this ranks each cell's colour in its own material value ramp and projects that rank onto the key light's in-plane direction. Bright values lean into the key light; dark values recede. |
| `--lineage` | Also write `<asset>-lineage.json`: the `PB-ASSET-LINEAGE-v1` chain (construction → packet → VRI scene checksum → raster digest, per frame). This sidecar travels without its pixels so Layer-1 immunity (rule `LINEAGE-0F0D`) can defend asset integrity at rest. |

Example with everything on:

```bash
node codex/core/pixelbrain/scdl/scdl.cli.js compile fixtures/void_acolyte/void_acolyte.scdl --shade vri --strokes --relief synthetic --lineage --out-dir out
```

### 8.6 Canonical format (SCDL 2 only)

`format` reprints explicit `SCDL 2` source in the compiler's one canonical
spelling. It does not compile, rasterize, or write packets. Legacy / unversioned
source is refused (exit 1): canonical formatting is available only for explicit
SCDL 2.

```bash
node codex/core/pixelbrain/scdl/scdl.cli.js format fixtures/v2/exact-orb.scdl
node codex/core/pixelbrain/scdl/scdl.cli.js format fixtures/v2/exact-orb.scdl --write
npm run scdl:format -- codex/core/pixelbrain/scdl/fixtures/v2/exact-orb.scdl
```

| Flag | Effect |
|---|---|
| `--write` | overwrite the input `.scdl` with the canonical spelling; omitted, formatted text goes to stdout |

Canonical rules demonstrated by `formatSCDLV2`: LF endings, uppercase opcodes /
types / enums, lowercase hex, two-space layer indentation, one blank line
between header and bindings and between bindings and layers, a final newline,
and comments stripped. A second `format` of its own output is a no-op
(idempotent). `--write` is a boolean switch (`BOOLEAN_FLAGS`); it never
consumes the following token as a path.

---

## 9. Developer Instruction Manual

### 9.1 Compiling SCDL Programmatically
To compile SCDL inside application code or scripts:
```js
import { compileSCDL, exportSCDL } from './codex/core/pixelbrain/scdl/index.js';

const source = `
  asset helm canvas 16x16
  palette { dark = #101010 }
  part base material voidsteel {
    cell 8 8 dark
  }
`;

const result = compileSCDL(source);
if (!result.ok) {
  console.error("Compilation errors:", result.errors);
} else {
  console.log("Stably derived packet ID:", result.packet.id);
  
  // Semantic annotations are attached to AST nodes (role, partId, annotations)
  const bodyPart = result.ast.parts.find(p => p.id === 'base');
  console.log("Semantic role:", bodyPart?.semantic?.annotations);

  // Export to Phaser format
  const exports = exportSCDL(result.packet, ['phaser'], result.ast);
  const phaserConfig = JSON.parse(exports.phaser.output);
  console.log(phaserConfig.pixels);
}
```

Semantic data (roles, effects, provenance) is also available via the shared registry:
```js
import { resolveRole, CanonicalRoles, getSemanticMeta } from './codex/core/pixelbrain/semantic-registry.js';
import { applyAuthoringSemantics } from './codex/core/pixelbrain/semantic-bridge.js';
```

### 9.2 Integrating SCDL with Vitest
SCDL unit tests must reside in `tests/codex/core/pixelbrain/scdl/` to be detected by the project's Vitest runner. Semantic unification tests live in `scdl.semquant.test.js`.

Run the test suite:
```bash
npx vitest run tests/codex/core/pixelbrain/scdl/
```

---

## 10. Troubleshooting

### 10.1 Parser Loop (Infinite Compilation Hangups)
* **Problem:** If a syntax error is introduced (e.g. inside a block), the compiler process hangs or hits a maximum call stack/CPU spike.
* **Cause:** The parser loop fails to advance the cursor position when it cannot parse a valid statement.
* **Solution:** Inspect `scdl.grammar.js`. Ensure all loops (such as the `parsePalette` loop) contain an `else` branch consuming the offending token (`consume()`) to guarantee parser progress.

### 10.2 Disambiguation of Hex Colors vs Comments
* **Problem:** A palette hex color literal like `#05060D` is ignored or reported as an empty statement, throwing a syntax error.
* **Cause:** The tokenizer matches the `#` character as a comment block first and consumes the color literal as a comment line.
* **Solution:** Lookahead is required. The tokenizer must check if a `#` is followed by exactly 6 hex characters and a non-hex character boundary. If true, it must emit a `HEX` token; otherwise, treat it as a line comment.

### 10.3 Inverted Asset Headers
* **Problem:** The compiled JSON shows `"asset": "canvas"`, and compilation throws warning `Expected 'canvas' keyword after asset name`.
* **Cause:** The parser's `parseAsset` statement attempts to consume two identifiers (name + type) rather than a single name identifier followed by the `'canvas'` keyword.
* **Solution:** Fix `parseAsset` to consume exactly one name identifier, then check `atValue('canvas')` before parsing canvas dimensions.

### 10.4 Symmetry Output Offsets
* **Problem:** Symmetric coordinates are emitted out of bounds or translated incorrectly.
* **Cause:** Using standard index arithmetic without grid limits, causing coordinates to map past the canvas width/height.
* **Solution:** Verify `expandSymmetryPass`. Ensure coordinate mirror math clamps column/row translations within `[0, cols - 1]` and `[0, rows - 1]`.

### 10.5 `compileSCDL()` Throws Despite Its "Never Throws" Contract
* **Problem:** A `.scdl` file with a malformed `union`/`subtract`/`intersect` op (fewer than 2 targets) crashed the CLI with `TypeError: e.isError is not a function` instead of a clean `[SCDL] Compile FAILED` — found 2026-08-30.
* **Cause:** `compileSCDL`'s final gate (§2) calls `e.isError()`/`e.isWarn()` on every entry in the shared `errors` array with no ternary guard. `passes/lower-booleans.js` was the one pass in the whole pipeline that pushed a plain `{code, message}` literal instead of going through `scdlError()`/`scdlWarn()`, so it had neither method. The CLI has no try/catch around `compileSCDL` anywhere — it depends entirely on this contract holding.
* **Solution:** Every code path that pushes into a shared errors/diagnostics array must produce the exact same shape every other producer does (`scdlError`/`scdlWarn`, or the duck-typed equivalent `createSemanticDiagnostic` in `semantic-registry.js` uses for the same reason). Fixed via `SCDL_ERROR_CODES.BOOLEAN_OP_ARITY`/`SEMANTIC_ROLE_CONFLICT`. Before trusting a "never throws" doc comment on any compiler, grep every push-site into its shared error collection — a fully green test suite proves nothing about an op with zero dedicated tests, which is exactly how this one shipped.

### 10.6 `union`/`subtract`/`intersect` Compiles Clean But Changes Nothing
* **Problem:** `subtract a b` on two overlapping circles produces byte-identical packet coordinates to omitting the `subtract` line entirely — no error, no warning.
* **Cause (historical, pre-2026-08-30):** Targets were matched against auto-generated op ids (`op:partId:index:verb`), which no SCDL author can type — so `a`/`b` never matched any real cell's `sourceOpId`, and the op silently combined nothing.
* **Solution:** Targets now address sibling **part ids** (§5.7). If this symptom reappears, first check whether the targets actually resolve to `SCDL-026` (unknown/self-referencing target) rather than silently no-op'ing — and if a *new* silent no-op shows up, suspect the same class of bug: an identifier nothing in the pipeline can actually produce.

---

## 11. SCDL v2 semantic-core milestone

The full-pilot operating manual — version routing, the complete opcode and AMP
tables, CLI, catalog gates, Studio isolation, and the ordered procedure — lives
in [`SCDL_V2_FULL_PILOT_WHITE_PAPER.md`](./SCDL_V2_FULL_PILOT_WHITE_PAPER.md)
(`SCHOL-ENC-BYKE-SEARCH-SCDL-V2-FULL-PILOT`). Prefer that paper for anything
after the 2026-09-06 semantic-core slice (geometry, generative math, AMP ABI).
§11.9 below is stale on AMP execution: the Universal AMP ABI is live.
Catalog gate is 48 certified SCDL AMPs out of 54 EFFECT_CATALOG modules,
with adapters, certify, and family tests green; see the pilot paper.

This section documents **compiler-demonstrated** SCDL v2 behavior as of the
2026-09-06 semantic-core vertical slice. It is attached documentation, not
executable compiler authority: if this text and `compileSCDL` disagree, the
compiler wins and this section is stale. §§1–10 above remain the v1 / v1.2
manual; they do not describe the v2 pipeline.

### 11.1 Routing law and legacy invariance

Public `compileSCDL(source, options)` is unchanged as the seam. Version
selection is exact and non-heuristic:

- Strip a leading BOM.
- Walk lines. Skip blanks and `#` comments.
- If the first significant declaration is **exactly** `SCDL 2`, call
  `compileSCDLV2`.
- Every other source — unversioned v1, `SCDL 3`, `scdl 2`, `SCDL 2 extra`,
  non-strings — enters the frozen `compileLegacySCDL` body.

`SCDL 2` and only `SCDL 2` selects v2. Unsupported headers are not
reinterpreted as v2; they fail in the legacy compiler. Frozen v1 / v1.2
fixture and frame packet IDs remain byte-identical. SCDL v2 is compile-time
only: no SCDL source evaluator ships into a game or browser runtime.

### 11.2 Supported statement and expression opcodes

Statement opcodes:

| ID | Mnemonic | Role |
|---|---|---|
| `0x0001` | `SCDL` | version declaration (`SCDL 2`) |
| `0x0002` | `ASSET` | emitted asset identifier |
| `0x0003` | `CANVAS` | `WIDTH` / `HEIGHT` as U32 |
| `0x0004` | `BUDGET` | `INSTRUCTIONS` / `GENERATED_SHAPES` / `RASTER_CELLS`, optional `RECURSION_DEPTH` |
| `0x0010` | `CONST` | typed immutable binding |
| `0x0020` | `SHAPE` | immutable shape binding |
| `0x0021` | `MASK` | immutable mask binding |
| `0x0030` | `LAYER` | ordered paint layer (`ORDER`, optional `BLEND`, `OPACITY`, `VISIBLE`) |
| `0x0031` | `PAINT` | paint shape into layer (`FILL`, `RASTER`, optional `AT`, `CLIP_TO`, `MATERIAL`) |
| `0x0040` | `ANCHOR` | named anchor binding on a shape |
| `0x0041` | `ASSERT` | geometric constraint assertion at compile time |
| `0x0050` | `FN` | pure function declaration with optional recursion cap |
| `0x0051` | `SEQUENCE` | finite recurrence declaration |
| `0x0052` | `RNG` | seeded deterministic RNG declaration |
| `0x0053`–`0x0059` | `LET` / `RETURN` / `EMIT` / `FOR` / `IF` / `MATCH` / `RADIAL` | finite block and generative control flow |

Expression opcodes:

| ID | Mnemonic | Role |
|---|---|---|
| `0x0100` | `ADD` | compatible numeric addition |
| `0x0101` | `SUB` | compatible numeric subtraction |
| `0x0102` | `MUL` | I32×I32, scalar×scalar, or PX×scalar |
| `0x0103` | `DIV` | numeric ÷ nonzero scalar |
| `0x0110` | `PX` | pixel-distance from a scalar |
| `0x0111` | `VEC2` | two `PX` components |
| `0x0200` | `PIXEL` | one-cell shape at named `AT` |
| `0x0201` | `CIRCLE` | named `CENTER` (VEC2) and `RADIUS` (PX) |
| `0x0202` | `LINE` | segment from `FROM` to `TO` |
| `0x0203` | `POLYLINE` | sequence of vertices |
| `0x0204` | `RAY` | bounded ray (`ORIGIN`, `DIR`, `LENGTH`) |
| `0x0205` | `RECT` | axis-aligned rectangle (`ORIGIN` or `CENTER`, plus `SIZE`) |
| `0x0206` | `ROUNDED_RECT` | rectangle with `CORNER_RADIUS` |
| `0x0207` | `RING` | annular ring (`CENTER`, `RADIUS`, `THICKNESS`) |
| `0x0208` | `ELLIPSE` | ellipse (`CENTER`, `RADIUS_X`, `RADIUS_Y`) |
| `0x0209` | `ARC` | circular arc (`CENTER`, `RADIUS`, `START`, `END`) |
| `0x020A` | `SECTOR` | pie sector (`CENTER`, `RADIUS`, `START`, `END`) |
| `0x020B` | `TRIANGLE` | three vertices `P1`, `P2`, `P3` |
| `0x020C` | `REGULAR_POLYGON` | polygon (`CENTER`, `RADIUS`, `SIDES`) |
| `0x020D` | `POLYGON` | arbitrary polygon vertices |
| `0x020E` | `STAR` | star shape (`CENTER`, `POINTS`, `INNER_RADIUS`, `OUTER_RADIUS`) |
| `0x020F` | `PATH` | SVG-compatible path command list |
| `0x0210`–`0x0212` | `DEGREES` / `RADIANS` / `TURNS` | exact angle constructors |
| `0x0213` | `ROTATE` | 2D rotation transform by `ANGLE` |
| `0x0214` | `TRANSLATE` | 2D translation transform by `OFFSET` (VEC2) |
| `0x0215` | `SCALE` | 2D scale transform by `FACTOR` |
| `0x0216` | `TRANSFORM_COMPOSE` | composition of two 2D transforms |
| `0x0217` | `TRANSFORM_APPLY` | apply transform to a shape or vector |
| `0x0220` | `UNION` | CSG union of two shapes |
| `0x0221` | `SUBTRACT` | CSG subtraction of shape B from shape A |
| `0x0222` | `INTERSECT` | CSG intersection of two shapes |
| `0x0223` | `XOR` | CSG symmetric difference of two shapes |
| `0x0224` | `OUTLINE` | boundary outline of a shape with `WIDTH` |
| `0x0230` | `TO_MASK` | rasterize shape to an immutable boolean mask |
| `0x0231` | `MASK_UNION` | union of two masks |
| `0x0232` | `MASK_INTERSECT` | intersection of two masks |
| `0x0233` | `MASK_SUBTRACT` | subtraction of mask B from mask A |
| `0x0234` | `MASK_INVERT` | inversion of mask within canvas bounds |
| `0x0240` | `ALIGN` | align one shape to another by named anchor |
| `0x0241` | `ANCHOR_OF` | query named anchor position on shape |
| `0x0242` | `BOUNDS` | query bounding box of shape |
| `0x0243` | `INSIDE` | predicate: point inside shape or bounds |
| `0x0244` | `CONTAINS` | predicate: container contains target |
| `0x0245` | `TOUCHES` | predicate: two targets touch |
| `0x0246` | `OVERLAPS` | predicate: two targets overlap |

Generative-math expressions occupy `0x0104`–`0x011B` (arithmetic, rounding,
trigonometry, interpolation, number theory, and vector math), `0x0120`–`0x0128`
(comparisons and boolean logic), `0x0130`–`0x013A` (finite collections,
recurrences, and calls), and `0x0140`–`0x0143` (seeded sampling and noise).
The frozen runtime registry remains the exhaustive operand-level authority.

Bytecode-only mnemonics, illegal in source: `BC.CONST` (`0x8000`),
`BC.LAYER.NEW` (`0x8001`), `BC.PAINT` (`0x8002`), `BC.EMIT.ASSET` (`0x8003`),
and the Step 3 lowering operations `0x8010`–`0x8014`.

Statements are uppercase opcode-first. Expressions are parenthesized prefix
forms. Required non-positional operands are named (`CENTER`, `RADIUS`, `AT`,
`FILL`, `RASTER`, `WIDTH`, `HEIGHT`, …). Literals demonstrated: signed base-10
integers, exact base-10 decimals, `#RRGGBB` / `#RRGGBBAA` colors, identifiers,
enum words (`CENTER` / `MIDPOINT` / `BRESENHAM` / `SUPERCOVER` / `THRESHOLD`),
and `$symbols`. A successful program emits declared layers sorted by ascending
`ORDER`, with source order breaking ties. Values, shapes, and masks are immutable;
construction does not paint — only `PAINT` adds a shape to an ordered layer.

Inspect the frozen registry at runtime with `listSCDLV2Opcodes()` /
`getSCDLV2Opcode(mnemonic)` from `codex/core/pixelbrain/scdl/index.js`.

### 11.3 Compiler pipeline

```text
SCDL 2 source
        │
        ▼ detectSCDLVersion  (exact header only)
tokenizeSCDLV2               lossless tokens + trivia + spans
        │
        ▼ parseSCDLV2        recoverable CST + strict AST
analyzeSCDLV2                bind, closed types, exact constant eval
        │
        ▼ verifySCDLV2Budget static demand vs protected / requested limits
                             (failure never lowers or evaluates)
lowerSCDLV2Bytecode          canonical SCDL-BC-v2 text + instruction objects
        │
        ▼ evaluateSCDLV2     bounded interpreter of instruction objects
                             (never re-parses bytecode.text)
rasterizeSCDLV2              geometry catalog + CSG/masks + raster policies
        │
        ▼ emitSCDLV2Package  PixelBrainAssetPacket + SCDL-PACKAGE-v2
```

Public calls never throw. Invalid input returns structured diagnostics and
nulls `analysis`, `bytecode`, `package`, and `packet` (`framePackets` frozen
empty). No partial packet, bytecode, export, or cache may escape a failed
compile. Canonical bytecode is emitted **before** evaluation and is the
authority for v2 program identity.

### 11.4 Public result and package contracts

A v2 `compileSCDL()` result has `contract: 'SCDL-COMPILE-RESULT-v2'`,
`languageVersion: 2`, `compilerVersion: '2.0.0'`, plus `cst`, `ast`,
`analysis`, `bytecode`, `package`, `packet`, `framePackets`, `frameLoop: null`,
`errors`, `diagnostics`, `diagnosticReport` (`contract: 'SCDL-DIAGNOSTICS-v2'`),
and `regressionSeed`. `errors` keep CLI methods (`isError()`, `isWarn()`,
`isInfo()`, `toJSON()`). `diagnostics` is the JSON-safe list; if `ok` is
false, `bytecode` / `package` / `packet` / `analysis` are null.

A successful package has `contract: 'SCDL-PACKAGE-v2'`, `programId`, the
bytecode object, `verifiedBudget`, immutable `construction`, composited
`layers`, `framePackets` (one packet this milestone), `animation: null`,
`ampPlan: []`, and an export manifest listing `json`, `svg`, `phaser`, `png`,
`aseprite`. The packet is a real `pixelbrain.asset.v1` whose
`bytecode.authority` is `SCDL-BC-v2`. Packet id is
`pbasset_` plus the eight hex digits of `bytecode.programId` (`scdlbc_<hex>`).
JSON / PNG exporters consume that packet; they do not re-author geometry.

### 11.5 Exact rationals, units, raster policies, and compositing

Closed types: `BOOL`, `I32`, `U32`, `FIXED`, `RATIO`, `PX`, `ANGLE`, `DURATION`,
`COLOR`, `VEC2`, `RECT`, `RANGE`, `SEQUENCE`, `PALETTE`, `PATH`, `SHAPE`, `MASK`,
`TRANSFORM`, `MATERIAL`, `LAYER`, `TIMELINE`, and `RNG`. `PX` is a pixel-distance
type, not a unitless integer. There is no
truthiness and no implicit conversion: `RADIUS $n` where `$n` is `I32` is
`SCDL-TYPE-002` (`expected: ["PX"]`, `received: ["I32"]`). Wrap scalars with
`PX`.

Fractional values are reduced BigInt rationals stored as base-10 strings
(`1.250` → `5/4`, `-0.125` → `-1/8`). `ADD` / `SUB` require compatible
numerics. `MUL` accepts I32×I32, scalar×scalar, or PX×scalar. `DIV` requires a
numeric numerator and a nonzero scalar divisor (zero → `SCDL-TYPE-004`);
PX÷scalar stays `PX`, otherwise the quotient is `RATIO`. `I32` is the signed
32-bit range. Floating-point arithmetic does not decide lattice membership or
program identity.

Raster policies on `PAINT`:

- `CENTER` (`CIRCLE-FILL-CENTER-v1`): exact inclusion. Center and radius stay
  rationals; a cell is painted iff its center is inside the ideal shape.
  No rounding, no anti-aliasing.
- `MIDPOINT` (`CIRCLE-FILL-MIDPOINT-v1`): classic integer midpoint / Bresenham
  filled disc, ellipse, and ring (symmetric horizontal spans). Distinct named
  algorithm.
- `BRESENHAM` (`LINE-BRESENHAM-v1`): canonical 8-connected integer line algorithm.
- `SUPERCOVER` (`POLY-SUPERCOVER-v1`): conservative inclusion; every lattice cell
  touched or crossed by the shape boundary or interior is included.
- `THRESHOLD` (`POLY-THRESHOLD-v1`): deterministic subpixel grid coverage sampling
  (included if coverage >= 0.5).

Multi-layer compositing and painter order:

- Layers declare ascending `ORDER`, with source order breaking ties.
- `BLEND` modes: `OVER` (standard alpha over), `REPLACE` (write target directly),
  `ADD` / `SUBTRACT` (saturating channel arithmetic), `MULTIPLY` (normalized
  channel product), and alpha-only `MASK_IN` / `MASK_OUT`.
- Integer channel math (`0..255`) with deterministic rational opacity scaling.
- `CLIP_TO <mask>`: restricts rasterization strictly to cells enabled in the
  immutable mask value.
- `AT <vec2>`: translates shape painting within the layer without mutating
  underlying shape values.

Canvas coordinates are integers. Out-of-bounds cells clip deterministically.
No anti-aliased coverage values are produced.

### 11.6 Protected budgets and failure-before-evaluation

Default limits for this milestone are exactly `INSTRUCTIONS 200000`,
`GENERATED_SHAPES 10000`, `RASTER_CELLS 1048576`, and `RECURSION_DEPTH 64`;
the protected host recursion ceiling is 256.
A source `BUDGET` may lower a field; requesting above the host ceiling is
`SCDL-BUDGET-001` and stops before demand is measured. Measured static demand
above the effective requested budget is `SCDL-BUDGET-002`. Both gates run
**before** bytecode lowering and evaluation — a program that would exceed
them never walks a raster or allocates evaluator registers. Runtime counters
during evaluate / raster may still fire `SCDL-BUDGET-003` as a second defense.

### 11.7 Canonical bytecode example (`exact-orb.scdl`)

The dump below is `compileSCDL` of the checked-in fixture
`codex/core/pixelbrain/scdl/fixtures/v2/exact-orb.scdl`, field
`result.bytecode.text`, including the terminating LF that
`lowerSCDLV2Bytecode` always appends (the blank line before the closing
fence is that terminator, not an extra instruction). It is not a
hand-written illustration. Identity is `scdlbc_98042e1f` (`hashString` of
this exact terminated text, eight lowercase hex digits). Comments,
whitespace, the asset label, and local `$symbol` spelling do not change
this text or `programId`.

```
.module SCDL-BC-v2
.language 2.0
.semantics 2.0.0
.canvas 9 9
.capability CORE.MATH@2.0
.capability GEOMETRY.STANDARD@2.0
.capability PAINT.LAYERS@2.0
.algorithm rational=RAT-REDUCED-v1
.algorithm circle.midpoint=CIRCLE-FILL-MIDPOINT-v1
.const $k0:px 4/1
.const $k1:px 2/1
.const $k2:color #55ccff
.const $k3:px 1/1
.const $k4:color #ffffff
%0 = BC.LAYER.NEW ink 10
%1 = BC.CONST $k0
%2 = VEC2 %1 %1
%3 = BC.CONST $k1
%4 = CIRCLE %2 %3
%5 = BC.CONST $k2
BC.PAINT %0 %4 %5 MIDPOINT
%6 = BC.CONST $k3
%7 = VEC2 %6 %6
%8 = PIXEL %7
%9 = BC.CONST $k4
BC.PAINT %0 %8 %9 CENTER
BC.EMIT.ASSET %0

```

The fixture paints a cyan radius-2 `MIDPOINT` disc centered at `(4,4)` and a
white `PIXEL` at `(1,1)` under `CENTER`, on a 9×9 canvas. Prefix math
`(ADD 1 1)` folds to I32 `2` and then `PX`. JSON / PNG export consume the
resulting `PixelBrainAssetPacket`.

### 11.8 Decomposition Step 3: Generative Mathematics

Decomposition Step 3 completes the generative mathematical substrate for SCDL v2:

1. **Pure Functions and Lexical Scoping:**
   - Declared with `FN <id> PARAM <$p1> <T1> ... RETURNS <TRet> [RECURSION_MAX <N>] { ... }`.
   - Local variable bindings with `LET <$var> <Type> <Expr>`.
   - Invocation through `(CALL <fn> <args...>)` and `RETURN <Expr>`.
   - Enforces return type checking and parameter count/type verification.

2. **Static Recursion Bounds & Termination Analysis:**
   - **`SCDL-TERM-001` (Uncapped Recursion):** Every recursive function declaration MUST declare explicit `RECURSION_MAX <N>`.
   - **`SCDL-TERM-002` (Depth Exceeded):** Declarations with `RECURSION_MAX > 256` or runtime call stacks crossing host or declared limits fail closed.
   - **`SCDL-TERM-004` (Mutual Recursion Forbidden):** Static call-graph cycle detection rejects all mutual recursion (cycles of length >= 2) before lowering or execution.

3. **Recurrences, Sequences, and Collections:**
   - Recurrences defined via `SEQUENCE <$name> TYPE <T> COUNT <N> { SEED <v0> ... NEXT <expr> }` accessing historical elements with `(PREV 1)`, `(PREV 2)`.
   - Pure collection primitives: `(RANGE START <s0> END <s1> STEP <step>)`, `(AT <seq> <index>)`, `(LENGTH <seq>)`, `(SUM <seq>)`, `(PRODUCT <seq>)`, `(ZIP <aSeq> <bSeq>)`.

4. **Seeded Variation and Coherent Noise:**
   - Deterministic PRNG via `RNG <$rng> ALGORITHM PCG32 SEED <int>`.
   - Seeded sampling expressions: `(RANDOM_I32 <$rng> MIN <lo> MAX <hi>)`, `(RANDOM_SCALAR <$rng> MIN <lo> MAX <hi>)`, `(RANDOM_VEC2 <$rng> MIN <vMin> MAX <vMax>)`.
   - Deterministic 2D value/gradient noise via `(NOISE_2D AT <vec2> SEED <int> FREQUENCY <scalar> [OCTAVES <int>])`.

5. **Finite Generative Control Flow in Shapes and Layers:**
   - `SHAPE <$name> COMPOUND { ... }` supporting `FOR <$var> IN <iterable> { ... }`, `RADIAL COUNT <N> [CENTER <vec2>] [RADIUS <px>] { ... }`, `IF / ELSE`, `MATCH`, and `EMIT <shape>`.
   - Compound shapes are lowered canonically into `UNION` trees in SSA bytecode and rasterized with full layer compositing.

6. **Golden Fixture `fibonacci-bloom.scdl`:**
   - Located at `codex/core/pixelbrain/scdl/fixtures/v2/fibonacci-bloom.scdl`.
   - Program identity: `scdlbc_64c9884a`.
   - Verifies end-to-end integration of recurrences, pure functions, a seeded PCG32 declaration, radial compound shape emission, and pixel rasterization.

### 11.9 What this slice does not ship

With Decomposition Step 3 (Generative Mathematics) complete, the following remain for **later subprojects**:

- animation, timelines, tracks, frames, and loops in v2 source (Step 4)
- imports and multi-file modules (Step 5)
- AMP execution substrate and agent-inspection milestones (Steps 5, 6, 7)

Do not author those forms against this compiler. The v1 / v1.2 pipeline in
§§1–10 continues to provide frames, boolean ops, scene-graph, and SymmetryAMP
for unversioned sources; that is a different language.
