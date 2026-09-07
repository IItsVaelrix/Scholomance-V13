# SCDL v2 Geometry & Paint Kernel Implementation Plan (Decomposition Step 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Decomposition Step 2 of the approved SCDL v2 architecture (`SCHOL-ENC-BYKE-SEARCH-SCDL-V2-AI-NATIVE-PIXEL-LANGUAGE`): delivering the complete first-class primitive catalog, 2D affine transforms, named anchors and alignment solver, geometric constraints/assertions, first-class shape CSG booleans, immutable masks, multi-layer painter-order painting, and deterministic pixel-art compositing, all with zero regression to legacy v1/v1.2.

**Architecture:** Build directly on top of the Step 1 semantic-core vertical slice (`scdl/v2/`). Geometry values are immutable objects that lower to canonical SCDL-BC-v2 instructions before evaluation. Primitives are rasterized through explicit, deterministic algorithms (`BRESENHAM`, `MIDPOINT`, `CENTER`, `SUPERCOVER`, `THRESHOLD`). Shape CSG booleans (`UNION`, `SUBTRACT`, `INTERSECT`, `XOR`, `OUTLINE`) operate on first-class values with scoped per-entity occupancy maps (preventing cross-entity cell erasure). Masks provide independent binary lattice clipping. Layers sort strictly by integer `ORDER` and composite through deterministic integer/fixed-point blend modes (`OVER`, `ADD`, `SUBTRACT`, `MULTIPLY`, `MASK_IN`, `MASK_OUT`, `REPLACE`).

**Tech Stack:** Node.js 20 ESM, JavaScript with strict JSDoc contracts, Vitest 4, existing `PixelBrainAssetPacket` factory, existing deterministic `hashString`, existing SCDL CLI/exporters.

**Spec:** `docs/superpowers/specs/2026-09-06-scdl-v2-ai-native-pixel-language-design.md` (§8, §11, §12, §13, §15, §19, §21, §23)

---

## Global Constraints

1. **Immutable First-Class Geometry:** Shapes, paths, transforms, masks, layers, and anchors are immutable values. Constructing a shape or referencing it in a boolean operation does NOT make it visible on the canvas; only an explicit `PAINT` statement commits geometry to an ordered layer.
2. **Deterministic Rational & Integer Arithmetic:** Coordinate computation, bounding boxes, and affine transformations use exact BigInt rationals (`scdl-v2.rational.js`) or high-precision fixed-point math. No floating-point rounding drift is permitted.
3. **Quadrant/Octant Symmetry Invariance:** Rotations by multiples of 90° (and 45°) have exact rational trigonometric values (0, 1, -1) and produce quadrant-symmetric pixel sets under `MIDPOINT` and `CENTER` rasterization.
4. **Isolated Entity Ownership:** In accordance with the `ScholomanceCompile` audit findings (Pattern #3), boolean operations evaluate each operand with its own scoped silhouette map. Never share a single-owner occupancy map across independent shapes.
5. **Pre-Normalized Path Tokens:** In accordance with `ScholomanceCompile` (Pattern #6), SVG-compatible path parsing pre-normalizes concatenated arc flag digits (e.g. `011` -> `0 1 1`) before generic tokenization so adjacent numbers are never desynced.
6. **Explicit Raster Policies:** Every primitive declares or inherits an explicit raster policy (`CENTER`, `MIDPOINT`, `BRESENHAM`, `SUPERCOVER`, `THRESHOLD`). Hidden anti-aliasing or renderer-dependent subpixel heuristics are strictly forbidden.
7. **Deterministic Composite Math:** Blend modes operate using versioned integer channel arithmetic `[0..255]` with explicit clamping.
8. **Compile-Time Assertions:** `ASSERT` statements evaluate at compile time. Violations produce structured `SCDL-GEOM-002` diagnostics with source spans, condition expressions, and evaluated values.
9. **Never-Throws Public Boundary:** Invalid geometry, degenerate parameters, transform singularities, and syntax errors produce structured diagnostics (`SCDL-GEOM-*`, `SCDL-PARSE-*`, `SCDL-TYPE-*`) and return `{ ok: false, packet: null }`. The compiler never throws uncaught exceptions.
10. **Zero Legacy Regression:** All 321 current SCDL v1/v1.2 tests must remain green, and legacy fixture packet IDs must remain byte-identical.

---

## Supported Step 2 Milestone Source Contract

Step 2 accepts rich, mathematical, multi-layer SCDL v2 sources:

```scdl
SCDL 2
ASSET void_sigil
CANVAS WIDTH 32 HEIGHT 32
BUDGET INSTRUCTIONS 5000 GENERATED_SHAPES 50 RASTER_CELLS 4096

# 1. Constants and Transforms
CONST $center VEC2 (VEC2 (PX 16) (PX 16))
CONST $rot45 TRANSFORM (ROTATE ANGLE (DEGREES 45) PIVOT $center)

# 2. Primitives & CSG Booleans
SHAPE $base_plate (RECT CENTER $center SIZE (VEC2 (PX 24) (PX 24)))
SHAPE $core_disc (CIRCLE CENTER $center RADIUS (PX 8))
SHAPE $hollow_ring (RING CENTER $center RADIUS (PX 10) THICKNESS (PX 2))
SHAPE $star (STAR POINTS 8 INNER_RADIUS (PX 4) OUTER_RADIUS (PX 12) CENTER $center)

# CSG: Subtracted rune cutout
SHAPE $plate_cutout (SUBTRACT $base_plate $core_disc)
SHAPE $plate_rotated (TRANSFORM_APPLY $rot45 $plate_cutout)

# 3. Anchors & Alignment
ANCHOR $top_apex ON $star AT MAX_Y
SHAPE $gem (ROUNDED_RECT CENTER (VEC2 (PX 0) (PX 0)) SIZE (VEC2 (PX 4) (PX 4)) CORNER_RADIUS (PX 1))
SHAPE $gem_placed (ALIGN TARGET $gem ANCHOR CENTER TO $star ANCHOR $top_apex OFFSET (VEC2 (PX 0) (PX -2)))

# Compile-time Assertion
ASSERT (INSIDE (ANCHOR_OF $gem_placed CENTER) (BOUNDS CANVAS))

# 4. Masks
MASK $vignette_mask (TO_MASK (CIRCLE CENTER $center RADIUS (PX 14)))

# 5. Multi-Layer Painter-Order Painting & Compositing
LAYER background ORDER 10 BLEND OVER {
  PAINT $plate_rotated FILL #1A102F RASTER CENTER
}

LAYER glyphs ORDER 20 BLEND OVER {
  PAINT $star FILL #8A3FFC RASTER CENTER CLIP_TO $vignette_mask
  PAINT $hollow_ring FILL #00F0FF RASTER MIDPOINT
}

LAYER overlay ORDER 30 BLEND ADD OPACITY (RATIO 4 5) {
  PAINT $gem_placed FILL #FFFFFF RASTER CENTER MATERIAL void_crystal
}
```

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `codex/core/pixelbrain/scdl/v2/scdl-v2.opcodes.js` | MODIFY | Allocate permanent numeric IDs and signatures for opcodes 21..65 (primitives, transforms, anchors, booleans, masks, layers, compositing). |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.types.js` | MODIFY | Register `RECT`, `PATH`, `MASK`, `TRANSFORM`, `ANGLE` (`DEGREES`, `RADIANS`, `TURNS`), `MATERIAL` types and validation rules. |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.geometry.js` | NEW | Shape constructors (`LINE`, `RECT`, `ROUNDED_RECT`, `RING`, `ELLIPSE`, `ARC`, `SECTOR`, `TRIANGLE`, `REGULAR_POLYGON`, `POLYGON`, `STAR`, `PATH`), bounds calculation, and SVG path parser with arc-flag pre-normalization. |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.transforms.js` | NEW | 2D affine matrix math in exact BigInt rationals, exact quadrant/octant trigonometric resolution, translate, rotate, scale, skew, inverse, and point/shape transformation. |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.raster.js` | MODIFY | Full primitive rasterizers: Bresenham lines/rays, Midpoint circles/rings/ellipses, Scanline center/half-open polygons/triangles/rects, Supercover lines/polygons, Path flattening, and degeneracy handling. |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.anchors.js` | NEW | Named anchors (`CENTER`, `MIN_X`, `MAX_X`, `MIN_Y`, `MAX_Y`, `TOP`, `BOTTOM`, `LEFT`, `RIGHT`, custom anchors), bounds extraction, alignment solver, geometric predicates (`INSIDE`, `CONTAINS`, `TOUCHES`, `OVERLAPS`), and `ASSERT` enforcement. |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.booleans.js` | NEW | First-class shape CSG booleans (`UNION`, `SUBTRACT`, `INTERSECT`, `XOR`, `OUTLINE`) with scoped silhouette maps and discrete lattice operations. |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.masks.js` | NEW | Immutable `Mask` type representation (binary lattice bitset/coordinate set), mask boolean algebra (`MASK_UNION`, `MASK_INTERSECT`, `MASK_SUBTRACT`, `MASK_INVERT`), and paint clipping. |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.compositing.js` | NEW | Deterministic integer channel composite modes (`OVER`, `ADD`, `SUBTRACT`, `MULTIPLY`, `MASK_IN`, `MASK_OUT`, `REPLACE`) and layer alpha blending. |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.layers.js` | NEW | Layer ordering, paint command queue, layer buffer compositing, and cell metadata stamping (`material`, `role`, `layerId`). |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.parser.js` | MODIFY | Parse all new statement forms (`ANCHOR`, `ASSERT`, `LAYER`), block bodies, prefix geometry expressions, operands, and path strings. |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.formatter.js` | MODIFY | Canonical formatting for all new geometry expressions, transforms, anchors, masks, and layers with idempotent round-tripping. |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.analyzer.js` | MODIFY | Type and unit checking for geometry, transforms, angles, anchor resolution, constraint checking, and diagnostic emission (`SCDL-GEOM-*`). |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.bytecode.js` | MODIFY | Lower new geometry, transform, anchor, boolean, mask, and layer instructions to canonical SCDL-BC-v2 bytecode. |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.evaluator.js` | MODIFY | Bounded evaluation of new opcodes into immutable Shape, Mask, Layer, and Transform IR. |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.emit.js` | MODIFY | Multi-layer `PixelBrainAssetPacket` emission, layer metadata preservation, and exporter coordinate mapping. |
| `codex/core/pixelbrain/scdl/v2/scdl-v2.compiler.js` | MODIFY | Orchestrate geometry and paint passes under the never-throw contract. |
| `codex/core/pixelbrain/scdl/fixtures/v2/void-sigil.scdl` | NEW | Checked-in end-to-end fixture exercising all Step 2 capabilities. |
| `tests/codex/core/pixelbrain/scdl/scdl-v2.geometry.test.js` | NEW | Unit tests for primitive constructors, bounds, parameters, and degeneracies. |
| `tests/codex/core/pixelbrain/scdl/scdl-v2.transforms.test.js` | NEW | Tests for affine matrix math, exact quadrant/octant rotations, and transform composition. |
| `tests/codex/core/pixelbrain/scdl/scdl-v2.raster-primitives.test.js` | NEW | Pixel-exact golden tests for lines, rects, rings, ellipses, polygons, stars, and paths across raster policies. |
| `tests/codex/core/pixelbrain/scdl/scdl-v2.anchors.test.js` | NEW | Tests for named anchors, alignment solver, geometric predicates, and compile-time assertions. |
| `tests/codex/core/pixelbrain/scdl/scdl-v2.booleans.test.js` | NEW | Tests for CSG booleans, scoped ownership, outline, and de Morgan identities. |
| `tests/codex/core/pixelbrain/scdl/scdl-v2.masks.test.js` | NEW | Tests for mask creation, mask algebra, and layer clipping. |
| `tests/codex/core/pixelbrain/scdl/scdl-v2.compositing.test.js` | NEW | Tests for deterministic integer pixel-art blend modes and opacity. |
| `tests/codex/core/pixelbrain/scdl/scdl-v2.layers.test.js` | NEW | Tests for layer ordering, paint sequencing, and packet cell emission. |
| `tests/codex/core/pixelbrain/scdl/scdl-v2.step2-integration.test.js` | NEW | Comprehensive integration tests for `void-sigil.scdl`, diagnostics, and formatting. |

---

## Tasks Breakdown

### Task 1: Primitive Catalog & Path Geometry
**Files:**
- Create: `codex/core/pixelbrain/scdl/v2/scdl-v2.geometry.js`
- Create: `tests/codex/core/pixelbrain/scdl/scdl-v2.geometry.test.js`
- Modify: `codex/core/pixelbrain/scdl/v2/scdl-v2.types.js`

**Step 1: Write failing tests for primitive constructors and SVG path parsing**
- Test creation of `LINE`, `POLYLINE`, `RAY`, `RECT`, `ROUNDED_RECT`, `RING`, `ELLIPSE`, `ARC`, `SECTOR`, `TRIANGLE`, `REGULAR_POLYGON`, `POLYGON`, `STAR`, `PATH`.
- Test SVG path command parsing with arc flag pre-normalization (`"A 5 5 0 01 10 10"` -> flags `0` and `1`).
- Test exact bounding box calculation `(BOUNDS $shape)`.
- Test validation failure for degenerate shapes (e.g. negative radius, negative dimensions) producing `SCDL-GEOM-001`.

**Step 2: Run test to confirm failure**
Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.geometry.test.js`

**Step 3: Implement shape data structures, bounds calculators, and path tokenizer**
- Implement immutable primitive record factories with exact parameter validation.
- Implement path parser with arc-flag pre-normalization regex to prevent fused tokens (ScholomanceCompile Pattern #6).
- Implement exact bounding box calculations using BigInt rationals.

**Step 4: Run test and commit**
Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.geometry.test.js`
Commit: `feat(scdl): implement v2 primitive catalog and path parsing`

---

### Task 2: 2D Affine Transforms & Exact Angles
**Files:**
- Create: `codex/core/pixelbrain/scdl/v2/scdl-v2.transforms.js`
- Create: `tests/codex/core/pixelbrain/scdl/scdl-v2.transforms.test.js`
- Modify: `codex/core/pixelbrain/scdl/v2/scdl-v2.types.js`

**Step 1: Write failing tests for transform matrix operations and angles**
- Test `ANGLE` unit constructors: `DEGREES`, `RADIANS`, `TURNS` and conversions.
- Test exact trigonometric values for 0°, 90°, 180°, 270° and 45° octants (cos=0, sin=1, etc. without IEEE float drift).
- Test 2D affine matrix creation: `TRANSLATE`, `ROTATE` (with optional `PIVOT`), `SCALE`, `SKEW`.
- Test transform composition (`TRANSFORM_COMPOSE`), inversion (`TRANSFORM_INVERSE`), and determinant checking (singularity check producing `SCDL-GEOM-004`).
- Test applying transform to `VEC2` and primitive shapes.

**Step 2: Run test to confirm failure**
Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.transforms.test.js`

**Step 3: Implement 2D rational affine transforms**
- Implement matrix representation `[m00, m01, m02, m10, m11, m12]` using exact BigInt rationals.
- Implement exact trigonometric lookup for cardinal/diagonal angles and deterministic rational series for arbitrary angles.
- Implement composition with canonical order `SCALE` -> `ROTATE` -> `TRANSLATE`.
- Implement shape transformation (mapping vertices, radii, center points).

**Step 4: Run test and commit**
Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.transforms.test.js`
Commit: `feat(scdl): implement 2d affine transforms and exact angle math`

---

### Task 3: Multi-Policy Rasterization Engine
**Files:**
- Modify: `codex/core/pixelbrain/scdl/v2/scdl-v2.raster.js`
- Create: `tests/codex/core/pixelbrain/scdl/scdl-v2.raster-primitives.test.js`

**Step 1: Write failing pixel golden tests across raster policies**
- `BRESENHAM`: exact integer line coordinates and steep/shallow slope invariance.
- `MIDPOINT`: circle, ring, and ellipse rasterization with 8-way and 4-way quadrant symmetry.
- `CENTER`: polygon, rectangle, rounded rectangle, and triangle rasterization using half-open top-left boundary rules.
- `SUPERCOVER`: line and polygon conservative rasterization (all touched cells).
- `PATH`: Bezier curve flattening into line segments followed by rasterization.
- Test degeneracy handling (0-length line, 0-radius circle, 0-area polygon).

**Step 2: Run test to confirm failure**
Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.raster-primitives.test.js`

**Step 3: Implement deterministic rasterizers**
- Implement canonical Bresenham line and ray rasterizers with strict tie-breaking.
- Implement midpoint circle, ring, and ellipse rasterizers.
- Implement scanline / edge-table polygon rasterizer supporting `NON_ZERO` and `EVEN_ODD` winding rules.
- Implement supercover line and conservative polygon rasterizer.
- Implement adaptive Bezier flattening with error tolerance <= 0.25px.
- Implement degeneracy fallbacks.

**Step 4: Run test and commit**
Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.raster-primitives.test.js`
Commit: `feat(scdl): implement multi-policy primitive rasterizers`

---

### Task 4: Named Anchors, Alignment Solver & Constraints
**Files:**
- Create: `codex/core/pixelbrain/scdl/v2/scdl-v2.anchors.js`
- Create: `tests/codex/core/pixelbrain/scdl/scdl-v2.anchors.test.js`

**Step 1: Write failing tests for anchors, alignment, and assertions**
- Test standard bounding-box anchors: `CENTER`, `MIN_X`, `MAX_X`, `MIN_Y`, `MAX_Y`, `TOP`, `BOTTOM`, `LEFT`, `RIGHT`, `TOP_LEFT`, etc.
- Test custom anchors: `ANCHOR $tip ON $blade AT (VEC2 ...)`.
- Test `ALIGN TARGET $a ANCHOR $a_anc TO $b ANCHOR $b_anc [OFFSET <vec2>]`.
- Test predicates: `(INSIDE $point $shape)`, `(CONTAINS $a $b)`, `(TOUCHES $a $b)`, `(OVERLAPS $a $b)`.
- Test compile-time `ASSERT` passing and failing (producing `SCDL-GEOM-002` with falsified values and source span).

**Step 2: Run test to confirm failure**
Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.anchors.test.js`

**Step 3: Implement anchor registry, solver, and assertion engine**
- Implement anchor resolution on primitive shapes and transformed shapes.
- Implement alignment solver computing translation vector `ref_point + offset - target_point`.
- Implement exact geometric predicates (point-in-polygon, box-in-box, SAT collision).
- Implement assertion evaluator.

**Step 4: Run test and commit**
Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.anchors.test.js`
Commit: `feat(scdl): implement named anchors alignment solver and assertions`

---

### Task 5: First-Class Shape CSG Booleans
**Files:**
- Create: `codex/core/pixelbrain/scdl/v2/scdl-v2.booleans.js`
- Create: `tests/codex/core/pixelbrain/scdl/scdl-v2.booleans.test.js`

**Step 1: Write failing tests for shape CSG booleans**
- Test `(UNION $a $b)`, `(SUBTRACT $a $b)`, `(INTERSECT $a $b)`, `(XOR $a $b)`.
- Test `(OUTLINE $shape WIDTH (PX ...) [ALIGN INNER|CENTER|OUTER])`.
- Test shape immutability: operand shapes are not visible unless painted.
- Test scoped silhouette maps: overlapping independent shapes do not erase each other (Pattern #3).
- Test boolean algebraic identities: `(UNION A B) == (UNION B A)`, `(SUBTRACT A A) == EMPTY`.

**Step 2: Run test to confirm failure**
Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.booleans.test.js`

**Step 3: Implement shape CSG boolean engine**
- Implement composite CSG shape representations and discrete lattice CSG evaluation.
- Implement outline/dilation kernel using structuring element (Manhattan/Chebyshev/Euclidean).
- Guarantee per-shape private occupancy scoping.

**Step 4: Run test and commit**
Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.booleans.test.js`
Commit: `feat(scdl): implement first-class shape csg booleans and outlines`

---

### Task 6: Immutable Masks & Lattice Clipping
**Files:**
- Create: `codex/core/pixelbrain/scdl/v2/scdl-v2.masks.js`
- Create: `tests/codex/core/pixelbrain/scdl/scdl-v2.masks.test.js`

**Step 1: Write failing tests for masks**
- Test `(TO_MASK $shape [RASTER <policy>])`.
- Test mask boolean algebra: `MASK_UNION`, `MASK_INTERSECT`, `MASK_SUBTRACT`, `MASK_INVERT`.
- Test applying mask in paint clipping: `PAINT $shape ... CLIP_TO $mask`.
- Test de Morgan's laws on masks.

**Step 2: Run test to confirm failure**
Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.masks.test.js`

**Step 3: Implement mask data structure and operations**
- Implement immutable 2D binary grid / bitset `Mask`.
- Implement bitwise mask operations.
- Implement clipping filter for raster cell streams.

**Step 4: Run test and commit**
Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.masks.test.js`
Commit: `feat(scdl): implement immutable masks and lattice clipping`

---

### Task 7: Layers & Deterministic Pixel-Art Compositing
**Files:**
- Create: `codex/core/pixelbrain/scdl/v2/scdl-v2.compositing.js`
- Create: `codex/core/pixelbrain/scdl/v2/scdl-v2.layers.js`
- Create: `tests/codex/core/pixelbrain/scdl/scdl-v2.compositing.test.js`
- Create: `tests/codex/core/pixelbrain/scdl/scdl-v2.layers.test.js`

**Step 1: Write failing tests for layers and blend modes**
- Test blend modes: `OVER`, `ADD`, `SUBTRACT`, `MULTIPLY`, `MASK_IN`, `MASK_OUT`, `REPLACE` with integer channel arithmetic `[0..255]`.
- Test layer ordering: ascending `ORDER` integer sorting, tie-breaking by source order.
- Test paint parameters: `FILL`, `STROKE` with `WIDTH`, `OPACITY` ratio, `CLIP_TO` mask, `MATERIAL` metadata.
- Test layer-level opacity and blend mode applied to entire layer buffer.

**Step 2: Run test to confirm failure**
Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.compositing.test.js tests/codex/core/pixelbrain/scdl/scdl-v2.layers.test.js`

**Step 3: Implement compositing engine and layer pipeline**
- Implement deterministic integer channel blend formulas.
- Implement layer queue and painter-order compositor.
- Implement cell metadata tagging (`material`, `role`, `sourceLayer`).

**Step 4: Run test and commit**
Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.compositing.test.js tests/codex/core/pixelbrain/scdl/scdl-v2.layers.test.js`
Commit: `feat(scdl): implement deterministic compositing and layer pipeline`

---

### Task 8: Parser, Formatter & Opcode Registry Integration
**Files:**
- Modify: `codex/core/pixelbrain/scdl/v2/scdl-v2.opcodes.js`
- Modify: `codex/core/pixelbrain/scdl/v2/scdl-v2.parser.js`
- Modify: `codex/core/pixelbrain/scdl/v2/scdl-v2.formatter.js`
- Modify: `codex/core/pixelbrain/scdl/v2/scdl-v2.analyzer.js`
- Create: `tests/codex/core/pixelbrain/scdl/scdl-v2.parser-step2.test.js`

**Step 1: Write failing tests for parsing and formatting Step 2 syntax**
- Test parsing all new primitive statements and prefix expressions.
- Test parsing `ANCHOR`, `ALIGN`, `ASSERT`, `LAYER`, `MASK`, `TRANSFORM` blocks and expressions.
- Test parser recovery on malformed operands (fail closed with structured diagnostics).
- Test canonical formatter idempotence (`format(format(source)) === format(source)`).

**Step 2: Run test to confirm failure**
Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.parser-step2.test.js`

**Step 3: Update opcode registry, parser, formatter, and analyzer**
- Assign permanent numeric IDs 21..65 to new opcodes in `scdl-v2.opcodes.js`.
- Extend AST parser in `scdl-v2.parser.js` for new statements and expression signatures.
- Extend canonical formatter in `scdl-v2.formatter.js`.
- Extend semantic analyzer in `scdl-v2.analyzer.js` for geometry types, unit constraints, and anchor scope checks.

**Step 4: Run test and commit**
Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.parser-step2.test.js`
Commit: `feat(scdl): integrate step 2 opcodes parser and canonical formatter`

---

### Task 9: Bytecode Lowering, Bounded Evaluation & Packet Emission
**Files:**
- Modify: `codex/core/pixelbrain/scdl/v2/scdl-v2.bytecode.js`
- Modify: `codex/core/pixelbrain/scdl/v2/scdl-v2.evaluator.js`
- Modify: `codex/core/pixelbrain/scdl/v2/scdl-v2.emit.js`
- Modify: `codex/core/pixelbrain/scdl/v2/scdl-v2.compiler.js`
- Create: `tests/codex/core/pixelbrain/scdl/scdl-v2.bytecode-step2.test.js`

**Step 1: Write failing tests for bytecode emission, evaluation, and packet generation**
- Test canonical SCDL-BC-v2 instruction emission for all geometry, transform, boolean, mask, and layer ops.
- Test bounded evaluation into immutable IR within instruction and raster budgets.
- Test emitting valid `PixelBrainAssetPacket` containing composite cells with layer and material metadata.

**Step 2: Run test to confirm failure**
Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.bytecode-step2.test.js`

**Step 3: Implement bytecode lowering and evaluation**
- Implement register-based lowering for new instructions.
- Wire evaluator to geometry, transform, boolean, mask, and compositing engines.
- Update `scdl-v2.emit.js` to emit composite cells and multi-layer asset manifests.

**Step 4: Run test and commit**
Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.bytecode-step2.test.js`
Commit: `feat(scdl): lower and evaluate step 2 geometry into canonical bytecode and packet`

---

### Task 10: End-to-End Fixture, Golden Tests & Milestone Acceptance
**Files:**
- Create: `codex/core/pixelbrain/scdl/fixtures/v2/void-sigil.scdl`
- Create: `tests/codex/core/pixelbrain/scdl/scdl-v2.step2-integration.test.js`
- Modify: `docs/scholomance-encyclopedia/Scholomance White Papers/SCDL_COMPILER_WHITE_PAPER.md`
- Modify: `docs/scholomance-encyclopedia/Scholomance White Papers/SCDL_AUTHORING_GUIDE.md`

**Step 1: Write end-to-end integration test for `void-sigil.scdl`**
- Test full compile of `void-sigil.scdl` to JSON and PNG exports.
- Verify packet kind `pixelbrain.asset.v1`, bytecode authority `SCDL-BC-v2`.
- Verify presence of multiple layers, composite colors, and material tags (`void_crystal`).
- Verify CLI commands: `check`, `format`, `compile`, `preview`.

**Step 2: Run test to confirm failure**
Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.step2-integration.test.js`

**Step 3: Create checked-in fixture and document real behavior**
- Create `codex/core/pixelbrain/scdl/fixtures/v2/void-sigil.scdl`.
- Document Step 2 opcodes, primitives, transforms, booleans, masks, and layers in the White Paper and Authoring Guide.

**Step 4: Run complete test suite and verify legacy invariance**
Run:
```bash
npx vitest run tests/codex/core/pixelbrain/scdl
```
Expected: All tests PASS (all existing 321 tests + all new Step 2 tests).

**Step 5: Run repository gates and commit**
```bash
npm run typecheck
npm run lint
git diff --check
npm run immune:scan
git commit -m "docs(scdl): prove the v2 geometry and paint kernel milestone"
```

---

## Final Acceptance Checklist

- [ ] All 14 primitives (`PIXEL`, `LINE`, `POLYLINE`, `RAY`, `RECT`, `ROUNDED_RECT`, `RING`, `ELLIPSE`, `ARC`, `SECTOR`, `TRIANGLE`, `REGULAR_POLYGON`, `POLYGON`, `STAR`, `PATH`) construct, validate, and rasterize correctly.
- [ ] SVG path parser pre-normalizes arc flag digits and handles M, L, H, V, C, S, Q, T, A, Z without token desync.
- [ ] 2D affine transforms (`TRANSLATE`, `ROTATE`, `SCALE`, `SKEW`, `TRANSFORM_COMPOSE`) operate with exact BigInt rational math and exact quadrant/octant symmetry.
- [ ] Named anchors and alignment solver compute exact translation offsets.
- [ ] Compile-time `ASSERT` validates conditions and emits structured `SCDL-GEOM-002` diagnostics on failure.
- [ ] Shape CSG booleans (`UNION`, `SUBTRACT`, `INTERSECT`, `XOR`, `OUTLINE`) operate on first-class values with isolated silhouette ownership maps.
- [ ] Masks (`TO_MASK`, `MASK_UNION`, `MASK_INTERSECT`, `MASK_SUBTRACT`, `MASK_INVERT`) provide independent lattice clipping.
- [ ] Layers sort strictly by integer `ORDER`, execute paint commands in painter order, and composite with deterministic integer channel blend modes (`OVER`, `ADD`, `SUBTRACT`, `MULTIPLY`, `MASK_IN`, `MASK_OUT`, `REPLACE`).
- [ ] Canonical SCDL-BC-v2 bytecode includes permanent numeric opcodes 21..65 and preserves program identity.
- [ ] Canonical formatting is idempotent across all Step 2 constructs.
- [ ] Never-throws contract holds: malformed geometry and syntax return structured diagnostics with `packet: null`.
- [ ] All 321 current SCDL v1/v1.2 tests pass with zero regression and byte-identical legacy packets.
