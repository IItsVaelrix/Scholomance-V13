# PDR — SCDL v1: Scholomance Coordinate Description Language

**Status:** Approved  
**Date:** 2026-07-01  
**Author:** Antigravity (Gemini domain)  
**Archive:** `docs/scholomance-encyclopedia/PDR-archive/scdl-v1-pdr.md`

---

## 1. Problem Statement

PixelBrain assets are currently authored in JavaScript — factory files like
`void-chestplate-profile.js`, part profile arrays, manual coordinate lists.
This is powerful but not human-legible for non-engineers, and it bypasses the
SCD64 diagnostic immune system at authoring time.

SCDL introduces a **human-readable authoring language** that compiles through
the full pipeline:

```
SCDL source
  → SCDL-AST-v1 (JSON)
      → Compiler passes (validate → resolve → expand → emit)
          → PixelBrainAssetPacket (existing contract)
              → SCD64 diagnostics (PB-ERR-v1)
                  → Export targets (JSON, SVG, Phaser)
```

---

## 2. Design Decisions

| Decision | Rationale |
|----------|-----------|
| `trace` stores as **intent**, not compile-time resolved | Compile-time resolution requires filesystem I/O → breaks determinism law |
| `glow` is a **hint** (SDF/noise descriptor) | Glow is a material property influencing the render pass, not a concrete lattice mutation |
| Export targets: **JSON, SVG, Phaser** (no Godot) | Phaser is the active game engine target; Godot bridge is deferred |
| Symmetry expansion delegates to **SymmetryAMP** | Reuses existing `applySymmetryToLattice()` from `symmetry-amp.js`; no duplicate logic |
| Parser is **hand-written recursive descent** | Zero new build dependencies; deterministic; auditable per Law 6 |
| All passes are **pure functions** | Satisfies Law 6 (determinism) + Law 8 (immutability) |
| `compileSCDL()` never throws | Always returns `{ok, ast, packet, errors, diagnostics}` per SCD64 machine-readable failure law |

---

## 3. Grammar — SCDL v1

### 3.1 Top-level Structure

```
program       ::= asset_decl palette_block? part_block* export_decl?

asset_decl    ::= 'asset' TYPE NAME 'canvas' DIMENSION
DIMENSION     ::= INTEGER 'x' INTEGER
TYPE          ::= IDENT

palette_block ::= 'palette' '{' color_entry* '}'
color_entry   ::= NAME '=' HEX_COLOR

part_block    ::= 'part' IDENT 'material' IDENT '{' part_op* '}'
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

symmetry_op   ::= 'symmetry' ( 'x' | 'y' | 'xy' )
trace_op      ::= 'trace' 'outline' 'from' 'image.region' '(' STRING ')'
fill_op       ::= 'fill' COLOR_REF
rim_op        ::= 'rim' COLOR_REF 'at' COMPASS
cell_op       ::= 'cell' INTEGER INTEGER COLOR_REF
glow_op       ::= 'glow' 'radius' INTEGER
circle_op     ::= 'circle' NUMBER NUMBER 'radius' NUMBER COLOR_REF
ring_op       ::= 'ring' NUMBER NUMBER 'radius' NUMBER 'width' NUMBER COLOR_REF
rect_op       ::= 'rect' NUMBER NUMBER NUMBER NUMBER COLOR_REF
polygon_op    ::= 'polygon' (NUMBER NUMBER){3,} COLOR_REF
path_op       ::= 'path' STRING COLOR_REF
sphere_op     ::= 'sphere' NUMBER NUMBER 'radius' NUMBER
                  ('light' NUMBER NUMBER)? COLOR_REF COLOR_REF COLOR_REF COLOR_REF COLOR_REF

COLOR_REF     ::= HEX_COLOR | NAME           // palette alias or literal hex
COMPASS       ::= 'north' | 'south' | 'east' | 'west'
               | 'north' 'west' | 'north' 'east'
               | 'south' 'west' | 'south' 'east'
HEX_COLOR     ::= '#' [0-9A-Fa-f]{6}
NAME          ::= [a-zA-Z_][a-zA-Z0-9_]*
NUMBER        ::= '-'? [0-9]+ ('.' [0-9]+)?

export_decl   ::= 'export' export_target+
export_target ::= 'json' | 'svg' | 'phaser' | 'png'
```

### 3.2 Example

```
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

---

## 4. SCDL-AST-v1 Contract

```jsonc
{
  "contract": "SCDL-AST-v1",
  "version": "1.0.0",
  "checksum": "<sha256-of-canonical-source>",
  "asset": "void_chestplate",
  "type": "void_chestplate",
  "canvas": { "width": 64, "height": 64 },
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
        { "op": "fill", "color": "#05060D" },
        { "op": "rim", "color": "#D8B84C", "compass": "north west" }
      ]
    },
    {
      "id": "gem",
      "material": "cyan_glow",
      "ops": [
        { "op": "cell", "x": 31, "y": 18, "color": "#00E5FF" },
        { "op": "circle", "cx": 31.5, "cy": 18.5, "radius": 2, "color": "#00E5FF" },
        { "op": "sphere", "cx": 31.5, "cy": 18.5, "radius": 2, "lx": -1, "ly": -1,
          "tierColors": ["#FFFFFF", "#D8B84C", "#00E5FF", "#05060D", "#000000"] },
        { "op": "glow", "radius": 2, "hint": true }
      ]
    }
  ],
  "exports": ["json", "svg", "phaser"],
  "sourceLocation": { "line": 1, "col": 0 }
}
```

---

## 5. Compiler Pass Pipeline

| Order | Pass | Input | Output |
|-------|------|-------|--------|
| 1 | `validatePass` | raw AST | validated AST or error |
| 2 | `resolveColorsPass` | validated AST | hex-resolved AST |
| 3 | `resolveMaterialsPass` | color AST | material-validated AST |
| 4 | `expandVectorPass` | material AST | vector ops lowered to `cell` ops |
| 5 | `expandSymmetryPass` | vector-expanded AST | symmetry-expanded ops |
| 6 | `expandCellsPass` | symmetry AST | coordinate array |
| 7 | `emitPacketPass` | coord AST | `PixelBrainAssetPacket` |
| 8 | `emitDiagnosticsPass` | packet + errors | `DiagnosticReport` |

---

## 6. Error Code Catalogue

| Code | Severity | Category | Description |
|------|----------|----------|-------------|
| SCDL-001 | ERROR | TYPE | Unknown verb |
| SCDL-002 | ERROR | STATE | Missing `asset` declaration |
| SCDL-003 | ERROR | VALUE | Invalid canvas format (expected `WxH`) |
| SCDL-004 | ERROR | COLOR | Invalid hex color literal |
| SCDL-005 | WARN | VALUE | Unknown material ID (falls back to `source`) |
| SCDL-006 | ERROR | VALUE | Undefined palette alias |
| SCDL-007 | ERROR | COORD | Cell coordinate out of canvas bounds |
| SCDL-008 | INFO | STATE | `trace` stored as intent (runtime resolution) |
| SCDL-009 | ERROR | VALUE | Duplicate part ID |
| SCDL-010 | ERROR | VALUE | Unknown export target |
| SCDL-011 | ERROR | VALUE | Invalid vector op parameters |

All errors encode as `PB-ERR-v1-{CAT}-{SEV}-SCDL-{CODE_HEX}-{CTX_B64}-{CHECKSUM}`
using the existing `encodeBytecodeError()` infrastructure.

---

## 7. Export Targets — v1 Contracts

### `json`
Raw `PixelBrainAssetPacket` serialized to JSON. Always available.

### `svg`
SVG with one `<rect>` per coordinate from `geometry.coordinates`:
```xml
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64">
  <rect x="31" y="18" width="1" height="1" fill="#00E5FF"/>
  ...
</svg>
```

### `phaser`
Phaser texture config JSON for use with `scene.textures.addBase64()` or
a custom SCDL Phaser loader plugin:
```json
{
  "type": "scdl-phaser-v1",
  "key": "void_chestplate",
  "canvas": { "width": 64, "height": 64 },
  "pixels": [
    { "x": 31, "y": 18, "color": 4293689087 }
  ],
  "palette": { "void0": 329741, "gold2": 14202956, "cyan2": 58879 }
}
```
Colors are encoded as 32-bit integers `(r << 16 | g << 8 | b)` for direct
Phaser `Graphics.fillStyle()` consumption.

### `png`
Deterministic 8-bit RGBA PNG bytes emitted directly from the compiled lattice
coordinates. Transparent pixels remain alpha 0; occupied cells are written from
their resolved hex colors. The encoder is dependency-free and emits a standard
PNG stream with uncompressed zlib blocks, preserving deterministic output across
Node environments.

---

## 8. SymmetryAMP Integration

The `expand-symmetry` pass calls `applySymmetryToLattice()` from the existing
`symmetry-amp.js`. It converts SCDL `symmetry x|y|xy` into the SymmetryAMP
`symmetry.type` vocabulary:

| SCDL | SymmetryAMP `type` |
|------|--------------------|
| `x`  | `vertical`         |
| `y`  | `horizontal`       |
| `xy` | `radial`           |

The pass builds a minimal lattice `{cols, rows, cells: Map}` from existing
part ops, calls `applySymmetryToLattice`, then converts the result back into
`cell` ops for downstream passes. No pixel data is needed.

---

## 9. SCD64 Laws Compliance

| Law | Compliance |
|-----|------------|
| Deterministic output | Parser is pure; passes are pure; `stableId()` used for packet ID |
| Slot/block thinking | `asset`, `palette {}`, `part {}`, `export` are first-class blocks |
| Checksummed meaning | AST carries `checksum` (sha256 of canonical source) |
| Hover-decodable diagnostics | Every error carries a `PB-ERR-v1` bytecode string with line/col |
| Regression-test generation | `regressionSeed` JSON in compile result replays the exact compile |
| No silent mutation | All passes return new objects; errors throw into the error array |
| Machine-readable failure states | `compileSCDL()` never throws; always `{ok, errors, packet}` |

---

## 10. Files Delivered

```
codex/core/pixelbrain/scdl/
  index.js
  scdl.grammar.js
  scdl.errors.js
  scdl.compiler.js
  scdl.lattice-emitter.js
  scdl.exporters.js
  scdl.diagnostics.js
  scdl.cli.js
  passes/
    validate.pass.js
    resolve-colors.pass.js
    resolve-materials.pass.js
    expand-symmetry.pass.js
    expand-cells.pass.js
    emit-packet.pass.js
    emit-diagnostics.pass.js
  fixtures/
    void_chestplate.scdl
  __tests__/
    scdl.parser.test.js
    scdl.compiler.test.js
    scdl.errors.test.js
    scdl.void-chestplate.test.js
```
