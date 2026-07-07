# SCDL v1.2 — Instanced Grammar, Hierarchical Scene Graph, Forward Rendering Pipeline

**Date:** 2026-07-03
**Status:** Approved design, pre-implementation
**Applies to:** SCDL compiler (`codex/core/pixelbrain/scdl/`), PixelBrain packet contract, exporters
**Prior art:** [SCDL Compiler White Paper](../../scholomance-encyclopedia/Scholomance%20White%20Papers/SCDL_COMPILER_WHITE_PAPER.md), [SCDL Authoring Guide](../../scholomance-encyclopedia/Scholomance%20White%20Papers/SCDL_AUTHORING_GUIDE.md), Wand formula system (`docs/scholomance-encyclopedia/wand.md`)
**Search anchor:** `SCHOL-ENC-BYKE-SEARCH-SCDL-SCENE-GRAPH`

---

## 1. Problem

SCDL v1.1 has no reuse and no hierarchy. `reference`/`instance` parse but lower to a
single white marker cell; `rotate`/`scale`/`translate` parse and emit nothing. Every
prop in a scene is restated by hand, and the packet stores one JSON object per pixel:
a measured 512×288 full-coverage map emits a **75 MB** packet JSON and takes ~5 s to
compile. SCDL therefore cannot serve as a map-environment format.

The fix follows the Wand/DivWand law: **store the formula, not the pixels**. The
packet carries a compact scene-graph program (defs + instances + transforms);
rasterization is a deterministic forward pass run on demand by exporters and
runtimes. Per-pixel data is derived, never stored, which removes both the packet-size
and the load-latency problem.

## 2. Decisions (settled with owner)

1. **Graph fate:** the scene graph survives into the packet as a new geometry mode;
   pixels are derived by forward rasterization (Wand formula precedent).
2. **Mode selection:** automatic by grammar use. Any `def`/`group`/`instance` in the
   source switches the asset to graph mode. Files without them compile through the
   existing pipeline **byte-identically** (packet IDs unchanged).
3. **Transforms:** full affine (translate / rotate any θ / fractional scale / mirror),
   composed hierarchically, rasterized by inverse mapping with one fixed rounding law.
4. **Forward pass scope:** full forward shading — geometry → Lambert shading →
   material transmutation → glow bloom, composited per node in one traversal.
   Applies to graph-mode assets only; legacy exports do not change.
5. **Approach:** layered extension (option B). Existing 8-pass pipeline untouched;
   graph assets branch after `resolveMaterials`.

## 3. Grammar (SCDL v1.2, `SCDL-AST-v1` version `1.2.0`)

```ebnf
program       ::= asset_decl palette_block? def_block* scene_item* loop_decl? frame_block* export_decl?
scene_item    ::= part_block | group_block | instance_stmt  // root-level instance accepted (painter order)
def_block     ::= 'def' IDENT '{' (part_block | group_block | instance_stmt)* '}'
group_block   ::= 'group' IDENT transform? '{' (part_block | group_block | instance_stmt)* '}'
instance_stmt ::= 'instance' IDENT ['as' IDENT] transform ['material' IDENT]
transform     ::= 'at' NUMBER NUMBER
                  ['rotate' NUMBER]              (* degrees, about node origin *)
                  ['scale' NUMBER [NUMBER]]      (* sx [sy]; sy defaults to sx *)
                  ['mirror' ('x'|'y'|'xy')]
```

Canonical example:

```scdl
asset forest_map canvas 320x180

palette { trunkc = #26180E  canopyc = #14301E  skyc = #1B2A4A }

def tree {
  part trunk material bark { rect -1 0 3 14 trunkc }
  part canopy material pine_needle {
    symmetry x                       # in defs: mirrors around LOCAL x=0
    circle 0 -4 radius 7 canopyc
  }
}

part sky material void_cloth { rect 0 0 320 100 skyc }

group forest at 0 60 {
  instance tree at 34 0
  instance tree as big_tree at 60 4 rotate 8 scale 1.4 mirror x material icy_fire
  group hill at 120 10 rotate 3 {
    instance tree at 0 0 scale 0.7
  }
}

export json png
```

Rules:

- **Defs are file-scoped and must be declared before first use.** A def's parts
  live in a local coordinate space with origin (0,0); negative coordinates are
  legal inside defs (clipping happens post-transform at the canvas, matching
  existing vector-op edge clipping). Bounds validation (SCDL-007) does not apply
  inside defs.
- **Defs may contain `instance` and `group`** (recursive composition), subject to
  the depth cap (§5) and acyclicity.
- **`as IDENT`** names an instance node for frame targeting (§9). Node ids
  (group ids, instance `as` names, part ids) share one namespace per scope;
  duplicates → SCDL-009.
- **`material IDENT` on an instance** overrides the materials of every part in the
  instantiated subtree for transmutation (§7). Validated against the material
  registry exactly like part materials (unknown → SCDL-005, fallback `source`).
- **Painter order is declaration order at every level** — groups and instances
  occupy painter slots exactly as parts do.
- **`symmetry` inside a def** mirrors around the def's local axes (x=0 / y=0),
  not the canvas center. Top-level parts keep canvas-center semantics unchanged.
- The v1.1 verbs `rotate`/`scale`/`translate`/`union`/`subtract`/`intersect` as
  *part ops* remain reserved placeholders; this design neither implements nor
  removes them. The old bare `reference`/`instance` part-op form is subsumed:
  inside a part it remains the marker-cell placeholder; the new statement form is
  only legal at def/group/scene level.

## 4. Transform law

- Per-node application order is fixed: **scale → mirror → rotate → translate**.
  As matrices: `M_local = T(tx,ty) · R(θ) · Mir · S(sx,sy)`.
- Hierarchical composition: `M_world = M_parent · M_local`, accumulated depth-first.
- **Rounding law (the only one):** for each candidate output pixel, take its center
  `(x + 0.5, y + 0.5)`, apply `M_world⁻¹`, and sample the def's local cell lattice
  at `(floor(u), floor(v))`. Inverse mapping guarantees hole-free output at any
  angle and scale. Candidate pixels are the world-space AABB of the def's local
  bounds under `M_world`, clipped to canvas.
- **Lattice fast path:** transforms that are exact lattice bijections (integer
  translate, 90°/180°/270° rotations, mirrors, integer scale) bypass resampling
  with direct index mapping. The fast path must produce output identical to the
  general path on its domain (tested, §11).
- **Lighting is authored, not re-lit.** `sphere` shading bakes in def-local space;
  transforms move shaded pixels. Consequence: each def rasterizes **once** per
  compile (memoized cell lattice) and every instance resamples that lattice.
- Degenerate transforms (scale 0, non-finite parameters) → SCDL-019.

## 5. Compiler pipeline

Legacy passes are untouched; graph assets branch after `resolveMaterials`:

```
validate (extended) → expandFrames → per frame:
  SemQuant → resolveColors → resolveMaterials →
    flat asset : expandVector → expandSymmetry → expandCells → emitPacket    (unchanged)
    graph asset: buildSceneGraphPass → emitPacket (scene-graph mode)
```

**`buildSceneGraphPass`** (new, `passes/build-scene-graph.pass.js`):

- Resolves every `instance` reference against the def table (unknown → SCDL-016).
- Verifies acyclicity of the def-reference digraph (cycle → SCDL-017).
- Enforces the **depth cap: 8** (exceed → SCDL-018). Depth counts nested
  group/instance expansion levels from scene root. Wand's composite validator
  caps at 4 (fail-closed bounded recursion law); 8 is chosen because spatial
  hierarchies (scene → region → cluster → prop → sub-part) nest deeper than
  formula composites. Same law, wider bound, still fail-closed.
- Emits graph IR: resolved colors/materials on every op, transforms as numeric
  records (not matrices — serialization stays human-auditable), def bodies stored
  once, instances stored as `{ref, name?, transform, materialOverride?}`.
- Warns on dead nodes: instance whose world AABB misses the canvas entirely
  (SCDL-020), def never instanced (SCDL-021).

**Validate pass extensions:** def/group/instance node arity and parameter checks,
shared-namespace duplicate ids, transform parameter finiteness (structural checks
only; reference resolution lives in `buildSceneGraphPass`).

**SemQuant:** instances are IR nodes. Roles inherit from def parts; group ids feed
role inference. `sourceOpId` on derived cells is the **instance path**
(`forest/big_tree/canopy`) so provenance survives instancing without PB-SEM-005.
The SemQuant stage remains fault-isolated exactly as today.

## 6. Scene-graph packet contract (`PB-SCENE-GRAPH-v1`)

```jsonc
{
  "geometry": {
    "mode": "scene-graph",
    "sceneGraph": {
      "contract": "PB-SCENE-GRAPH-v1",
      "version": "1.0.0",
      "depthCap": 8,
      "defs": {
        "tree": { "parts": [ /* ops, colors+materials resolved */ ] }
      },
      "roots": [
        { "kind": "part", "id": "sky", ... },
        { "kind": "group", "id": "forest", "transform": {...}, "children": [
          { "kind": "instance", "ref": "tree", "transform": {...} },
          { "kind": "instance", "ref": "tree", "name": "big_tree",
            "transform": {...}, "materialOverride": "icy_fire" }
        ]}
      ]
    }
  }
}
```

**Identity law:** `packet.id` = `hashString` (existing `shared.js` digest) over the
**canonically serialized `sceneGraph`** — sorted object keys, fixed number
formatting, no whitespace. This is the formula-bytes identity, mirroring Wand's
FNV-1a over `(role, formula bytes, sourceIntentHash)`. Pixels are never hashed and
never stored. Two sources that build the same graph get the same ID; adding an
instance changes the ID; semantic metadata stays additive and non-identity-bearing
(white paper §5.6 policy holds).

**Size property:** packet size scales with program length, not canvas area.
A 512×288 map with 100 instances must serialize under 100 KB (§11 perf gate).

Flat assets continue to emit `mode: "coordinates"` packets byte-identically.

## 7. Forward renderer

New module: **`codex/core/pixelbrain/scene-graph-renderer.js`** — at pixelbrain
root, not inside `scdl/`, because it is the runtime seam: exporters call it at
compile time and game/preview runtimes import it to rasterize scene-graph packets
on load. Public API:

```js
renderSceneGraph(sceneGraph, canvas, options) → framebuffer
// framebuffer: { width, height, pixels: Uint32Array (RGBA), cellIndex? }
// options: { shade: 'full' | 'geometry', semantics: boolean }
// semantics: true additionally populates cellIndex — a per-pixel record of
// { partId, material, role, sourceOpId (instance path) } for consumers that
// need collision/terrain typing; off by default (costs memory, not identity).
```

Per node, depth-first, single pass into the framebuffer (forward rendering — no
intermediate layer buffers):

1. **Compose** `M_world = M_parent · M_local`.
2. **Rasterize**: memoized def-local cell lattice → inverse-mapped resample into
   world space (§4), or lattice fast path.
3. **Transmute**: apply `transmuteMaterialColor` per cell using the node's
   effective material (instance override ⊳ part material). `source`/`passthrough`
   skips, as today.
4. **Glow**: PB-NOISE-v1 descriptors on parts render as a deterministic
   **fixed-point integer bloom kernel** (radius = amplitude) composited additively,
   saturating at channel max. No floating-point accumulation — determinism law.
5. **Write** painter-order; last write wins per pixel.

`shade: 'geometry'` (steps 1–2 + 5 only) exists for debugging and for PR-1 delivery
(§10). Default for graph assets is `'full'`.

Determinism contract: same `sceneGraph` + same canvas → identical framebuffer bytes
on every run and platform (no `Math.random`, no time, no float accumulation in
compositing; float math is confined to the matrix/inverse-map stage which is
IEEE-754 deterministic for identical inputs).

**Exporters:** `png`/`svg`/`phaser`/`aseprite` call `renderSceneGraph` and encode
the framebuffer through their existing encoders — for graph assets the SVG exporter
emits one `<rect>` per framebuffer pixel (deduped), the phaser exporter emits int
colors, aseprite maps root-level nodes to layers (parts of a def flatten into their
instance's layer). `json` exports the compact packet itself. **Raster previews
remain non-canonical; canonical state is the sceneGraph program.**

## 8. Error & diagnostic registry additions

| Sub-code | Label | Severity | Category | Trigger |
|---|---|---|---|---|
| `0x1010` | SCDL-016 | ERROR | STATE | `instance` references undeclared def |
| `0x1011` | SCDL-017 | ERROR | STATE | def reference cycle |
| `0x1012` | SCDL-018 | ERROR | VALUE | graph depth exceeds cap (8) |
| `0x1013` | SCDL-019 | ERROR | VALUE | invalid transform (non-finite, scale 0) |
| `0x1014` | SCDL-020 | WARN | COORD | instance fully clipped off-canvas |
| `0x1015` | SCDL-021 | WARN | STATE | def declared but never instanced |

PB-ERR-v1 encoding, ARTIFACT module range, per Vaelrix Law 8. SCDL-009 (duplicate
id) extends to the shared node namespace; SCDL-005 covers instance material
overrides.

## 9. Frames (v1.1 interop)

Groups and named instances are frame-targetable exactly like parts:

- Frame grammar extends accordingly:
  `frame_item ::= frame_part | frame_group | frame_instance | omit_stmt` (PR-3).
- `frame N { group forest at 0 62 { ... } }` — replacement by id keeps the painter
  slot, no `after` (SCDL-014 law unchanged).
- Additions require `after <existing-node-id>`; `omit <node-id>` removes.
- SCDL-012/013/015 extend to node ids unchanged.
- **Base Identity Invariant holds:** frame blocks never change the frame-0
  sceneGraph hash. Each frame emits its own scene-graph packet; the
  `SCDL-FRAME-LOOP-v1` manifest is unchanged in shape.

## 10. Delivery plan (three PRs)

1. **PR-1 — graph core:** grammar v1.2, `buildSceneGraphPass`, scene-graph packet
   mode + identity law, forward renderer with `shade:'geometry'`, png/svg/phaser
   exporters, errors 016–021, legacy-invariance test suite.
2. **PR-2 — full forward shading:** transmutation + glow bloom stages, `shade:'full'`
   default, shading goldens.
3. **PR-3 — integration sweep:** frames interop, aseprite layer mapping,
   `fixtures/forest_map/` canonical fixture, white paper + authoring guide updates.

Each PR independently green; PR-1 alone already delivers instancing and compact
map packets.

## 11. Testing

Vitest, `tests/codex/core/pixelbrain/scdl/`:

- **Grammar:** def/group/instance/transform parse round-trips; `as`/`material`
  clauses; defs-before-use; negative def coordinates.
- **Graph pass:** each error code has a firing test (016 unknown ref, 017 cycle,
  018 depth 9, 019 scale 0 / NaN, 020 off-canvas, 021 dead def).
- **Renderer determinism:** same source → identical framebuffer hash across runs;
  fast path ≡ general path on lattice-bijection transforms.
- **Hole-freeness:** solid disc def instanced at θ ∈ {7°, 33°, 45°} and scale
  ∈ {0.7, 1.4} has zero interior transparent pixels.
- **Legacy invariance:** every existing fixture compiles to a byte-identical
  packet ID (slime, void_acolyte all frames, env_test, crimson_ooze).
- **Identity law:** instance count changes ID but not size class; key-order-
  independent serialization stability; semantic metadata does not affect ID.
- **Forward shading goldens (PR-2):** transmuted + glowing instance PNG fixtures.
- **Perf gate:** 512×288, 100 instances — compile < 1 s, packet JSON < 100 KB
  (versus 5 s / 75 MB measured on v1.1 flat coordinates).

## 12. Out of scope

- Part-op-level `rotate`/`scale`/`translate` and boolean lowering (still reserved).
- Re-lighting per instance (lighting is authored; a world-light model is a future
  SemQuant-integrated feature).
- Tilemap (Tiled/TMX) export.
- Runtime animation of transforms (frames animate by node replacement, not by
  transform interpolation — interpolation belongs to a future SCDL-FRAME-LOOP rev).
