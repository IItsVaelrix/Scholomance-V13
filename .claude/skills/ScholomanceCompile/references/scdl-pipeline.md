# SCDL Pipeline — Full Reference

All paths relative to `codex/core/pixelbrain/scdl/`. This is a compressed
snapshot (2026-08-30) for fast lookup — the maintained, exhaustive spec lives
in `docs/scholomance-encyclopedia/Scholomance White Papers/SCDL_COMPILER_WHITE_PAPER.md`
and `SCDL_AUTHORING_GUIDE.md` (op catalog with rendered examples, full
material catalogue); defer to those on any disagreement.

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

Every pass is wrapped in `_runPass`/try-catch inside `scdl.compiler.js`; a thrown pass becomes an SCDL error instead of propagating — **this only works if every error object pushed into the shared array actually conforms to the SCDLError duck type** (see pattern #1 in SKILL.md).

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
