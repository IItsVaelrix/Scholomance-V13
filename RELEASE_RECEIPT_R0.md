# Release Receipt — R0 Baseline & P0 Verification

- **Review / Release Date**: 2026-09-08
- **Compiler Semantics Version**: 2.0.0
- **Contract**: `SCDL-BC-v2` / `SCDL-PACKAGE-v2` / `SCD128-ASSET-RECORD`
- **Compiler Build Digest**: `scdl-v2-p0-build`
- **Execution Environment**: Node.js (Linux x86_64), Isomorphic Browser Target
- **Status**: Verified P0 Implementation & Semantic Invariance

---

## 1. Resolved Document & Architecture Conflicts (GOV-01)

| Conflict Area | Historical / Conflicting Document Claim | Resolved Canonical Standard (Release R0 / Current Codebase) |
|---|---|---|
| **SCDL Name** | "Spatial Coordinate Definition Language" vs "Spatial Cell Definition Language" | Canonical full name: **Spatial Cell Definition Language** (SCDL), operating on discrete 1×1 integer lattice cells (Anti-Vector Invariant). Language headers (`SCDL 2`, `.language 2.0`, `SCDL-BC-v2`) remain strictly unchanged. |
| **Execution Classes** | Document T §4.1 asserted `CONSTRUCTION` was an execution class alongside `DESCRIPTOR`. | Corrected: **`CONSTRUCTION` is an execution stage** (Stage 1 of the 12-stage conveyor belt). The three canonical execution classes are **`COMPILE`**, **`ANALYZE`**, and **`DESCRIPTOR`** (as defined in P §13.1 and `scdl-v2.amp-abi.js`). |
| **Catalog Count** | Historical whitepaper asserted 48/54 AMPs certified. | The 48/54 count is attributed strictly to P's historical 2026-09-07 pilot snapshot. Active catalog dynamically validates 50 anchor manifests (`ANCHOR_MANIFESTS`) with verified SHA-256 integrity checksums and explicit resource models. |
| **Affine Lowering (`CMP-01`)** | Dropped affine matrix in `lowerTransform`, reducing rotations to translations. | Canonical `TRANSFORM_MATRIX` opcode (`0x0218`) preserves all 6 components `[a, c, tx, b, d, ty]`, retains pivots, and evaluates exact rational/quantized rotation matrices without drift. |
| **Shape Predicates (`CMP-02`)** | `isInside` previously checked only AABB extents, falsely asserting ring centers were inside rings. | Predicates separated: `isInsideBounds` / `containsBounds` query AABBs; `isInside` / `contains` evaluate true shape-occupied lattice/analytic membership (ring center and star corner correctly fail). |
| **Mask Canvas Extent (`CMP-03`)** | `maskInvert` defaulted to 32×32 bounding box regardless of canvas size. | Canvas dimensions and domain are explicitly threaded into masks; inversion on 80×56 canvas covers exactly 80×56 with zero domain leaks or silent clamp to 32×32. |
| **Raster Matrix & Boundaries (`CMP-07`)** | Scanline right edge could double-count or leave seams across adjacent polygons. | Raster compatibility matrix enforced; scanline rasterizer uses half-open interval $[startX, endX)$, eliminating seam holes and double-alpha overlap on shared triangle edges. |
| **Soil Schema & Defaults (`AMP-06`)** | Direct adapter returned 1 pebble and 1 root even for depth=0 or density=0. | Fixed: zero depth or zero density strictly returns zero features (`pebbleCount: 0, rootCount: 0`). Parameter schema validated and reconciled. |
| **Descriptor Immutability (`AMP-07`)** | Shallow `Object.freeze` allowed nested mutation of `swatchRamp`. | Recursive `deepFreeze` enforced across all descriptor dictionaries, swatches, and palettes. |
| **Tile Boundary Ownership (`TIL-01`, `TIL-02`)** | Default tile geometry had 20 top/ground cell overlaps and 40 unmirrored ground cells. | Intent strictly validated (positive integers, 2:1 dimetric ratio). Center-symmetric boundary derivation guarantees 0 overlaps and 0 unmirrored cells (exact horizontal symmetry). |
| **Realization Recipe (`TIL-06`)** | Direct synthesis and SCDL generation drifted in parameters. | `createTileForgeAssetRecipe` introduced as the single authoritative immutable recipe across procedural preview and SCDL compilation. |
| **Studio Layer Ingestion (`STU-02`)** | Flattened or misattributed layer opacity and visibility. | Multi-layer v2 assets imported with full fidelity (names, visibility, opacity, blend, and per-layer cells) as an atomic undoable action. |
| **Export Target Fidelity (`EXP-01`)** | Phaser/PNG exports discarded 8-digit hex or alpha channel. | Alpha preservation implemented across SVG (`fill-opacity`), Phaser (`alpha` field), and PNG (RGBA alpha compositing). |

---

## 2. Test Verification Commands

The following test commands verify the entire suite:

```bash
# SCDL v2 compiler tests (raster, catalog, budget, bytecode, transforms, anchors, parser)
npx vitest run tests/codex/core/pixelbrain/scdl/

# Tile Forge geometry, microprocessor, and boundary ownership tests
npx vitest run tests/game/tile-forge/ tests/tile-forge/

# Dedicated P0 contracts verification suite
npx vitest run tests/codex/core/pixelbrain/scdl/scdl-v2.p0-contracts.test.js
```
