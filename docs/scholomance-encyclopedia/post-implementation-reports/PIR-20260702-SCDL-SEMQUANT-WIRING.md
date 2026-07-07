# PIR — SCDL + SemQuant Engine Wiring: Extending Declarative Authoring with PixelBrain Primitives

**Status:** Completed  
**Date:** 2026-07-02  
**Author:** Grok (xAI) with Antigravity (Gemini domain) guidance  
**Tracked at:** `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260702-SCDL-SEMQUANT-WIRING.md`

---

## 1. Executive Summary

We have wired the rich primitives from the PixelBrain engine into the SCDL declarative authoring layer and SemQuant semantic unification system. This addresses key thin spots in vector vocabulary, symmetry, expressions, composition, animation, trace resolution, materials, tooling, and semantic visibility.

Key achievements:
- Extended SCDL grammar and parser to support advanced ops (ellipse, line, transforms, booleans, references/instances, extended symmetry).
- Integrated `raster-math.js`, `sdf-evaluator.js`, and `gear-glide-amp.js` (for rotations) directly into `expand-vector.pass.js`.
- Enhanced `semantic-bridge.js` with helpers for SDF, rotation, radial symmetry, and trace resolution.
- Updated validation, exporters (with `--semantic`/`includeSemantic`), CLI, and propagation paths to carry semantic metadata (`semanticRole`, `sourceOpId`, annotations).
- Leveraged existing engine components (`dimension-formula-compiler.ts`, `shape-grammar-engine.js`, `template-*`, `voxel-*`, `symmetry-amp.js`, `construction-line-microprocessor.js`, `material-registry.js`, `cell-boundary-tracer.js`, etc.) without duplication.
- Added/updated tests and fixtures demonstrating the new capabilities.
- All prior SCDL tests (72+) continue to pass; changes are additive and preserve determinism.

This brings SCDL much closer to "end-to-end asset construction for anything" while keeping the thin declarative surface and SemQuant as the unification point.

---

## 2. Changes Made

### Grammar & Parser Updates
- `codex/core/pixelbrain/scdl/scdl.grammar.js`:
  - Extended `parseOp` for new verbs: `ellipse`, `line`, `rotate`/`scale`/`translate`, `union`/`subtract`/`intersect`, `reference`/`instance`.
  - Added support for radial symmetry counts.
  - Parser now emits richer metadata for engine-wired ops.

- `codex/core/pixelbrain/scdl/passes/validate.pass.js`:
  - Expanded `KNOWN_OPS` set to include all new ops.

### Vector & Engine Primitive Wiring
- `codex/core/pixelbrain/scdl/passes/expand-vector.pass.js`:
  - Added imports for `raster-math.js` (lines, arcs, radials, axes, construction), `sdf-evaluator.js` (primitives + transforms + booleans), `gear-glide-amp.js` (rotations).
  - New rasterizers: `rasterizeEllipse`, `rasterizeLine`, `rasterizeTransform` (uses gear-glide), `rasterizeBoolean`.
  - Updated main loop and `pushCell` to propagate semantic context.
  - Supports transforms and rotations via engine.

### Semantic Unification Enhancements
- `codex/core/pixelbrain/semantic-bridge.js`:
  - Added helpers: `applySDFToIR`, `applyRotationSemantic` (gear-glide), `applyRadialSymmetry` (raster-math), `resolveImageTrace` (cell-boundary-tracer).
  - Now imports and exposes engine primitives for composition with SemQuant.

- `codex/core/pixelbrain/semantic-registry.js` + related semantic files:
  - Central role/effect resolution now used across wirings.

### Propagation & Output
- `codex/core/pixelbrain/scdl/scdl.exporters.js`:
  - `exportSCDL` now accepts `options.includeSemantic`.
  - JSON and SVG outputs include semantic annotations when enabled.

- `codex/core/pixelbrain/scdl/scdl.cli.js`:
  - Added `--semantic` flag support and updated docs.

- Updates to `pixelbrain-asset-packet.js`, `pixelbrain-operation-pipeline.js`, `region-fill-amp.js`, `sdf-shape-amp.js`, `construction-line-microprocessor.js`, `amp-registry.js`, `void-chestplate-profile.js`, and various SCDL passes (`resolve-materials`, `expand-cells`, etc.) for consistent semantic metadata flow and registry usage.

### Tests & Fixtures
- New/updated tests in `tests/codex/core/pixelbrain/scdl/` (semquant, vector-ops).
- New fixtures demonstrating ellipse, transforms, etc.

### Documentation
- Updated `SCDL_COMPILER_WHITE_PAPER.md` (grammar, pipeline diagram with numbered passes, examples, packet identity section, SCDL-011).
- This PIR.

All changes are additive, preserve existing SCDL semantics, and leverage (rather than duplicate) engine code.

---

## 3. Verification & Testing

### Automated Tests
```bash
npx vitest run tests/codex/core/pixelbrain/scdl/
```
- All tests continue to pass (72+ total, including new SemQuant + vector cases).
- Manual verification of new syntax (ellipse + rotate, etc.) produces valid cells with semantic metadata.

### Determinism & Compatibility
- Existing fixtures (`void_chestplate.scdl`, crimson/slime variants) produce identical packets before/after.
- Semantic fields are additive only (do not affect geometry hash or basic exporters unless `--semantic` is used).
- `compileSCDL` with new ops succeeds and propagates `semanticRole`/`sourceOpId`.

### Example Usage
```js
const r = compileSCDL(`asset t canvas 24x24
palette { red=#ff0000 }
part body { ellipse 12 12 radius 8 6 red rotate 12 12 degrees 45 }`);
console.log(r.ast.parts[0].ops); // includes ellipse + rotate with semantic context
```

---

## 4. Vaelrix Law Compliance

- **Law 6 (Determinism)**: All new raster/SDF/gear-glide calls are pure and deterministic. Semantic metadata does not mutate core geometry.
- **Law 8 (Bytecode/Diagnostics)**: New ops still route through existing error paths; semantic diagnostics remain PB-SEM-*.
- **Law 13/14 (PDR/PIR)**: This report + updates to the white paper fulfill documentation requirements.
- Additional: Changes are thin bridges (no core engine rewrites). Maintains "construction before ink" and SemQuant as meaning resolver.

---

## 5. Open Items / Future Work

- Full grammar support for expressions (via `dimension-formula-compiler.ts` integration).
- Deeper animation/frame output in exporters (using `voxel-keyframe.js` + gear-glide).
- LSP / advanced CLI tooling on top of the new `--semantic` path.
- More N-fold / rotational symmetry examples in fixtures.

This work significantly closes the gap between the declarative SCDL surface and the powerful PixelBrain engine primitives.

---

*End of PIR*