# Post-Implementation Report

## 1. Change Identity
- **Report ID:** PIR-20260702-SCDL-VECTOR-HARDENING
- **Feature / Fix Name:** SCDL vector-op hardening and contract closure
- **Author / Agent:** Codex
- **Date:** 2026-07-02
- **Branch / Environment:** Local workspace, Node 20.20.2
- **Related Task / Ticket / Prompt:** "Do all 4 in paralle" after review of `PIR-20260702-SCDL-VECTOR-OPS.md`
- **Classification:** Compiler, API contract, QA, Documentation, Visual integration
- **Priority:** High

---

## 2. Executive Summary
This follow-up closed the four action tracks identified during review of the SCDL vector-ops PIR: direct vector-op tests, parser/rasterizer bug fixes, schema/documentation cleanup, and safe sprite-panel expansion. SCDL vector authoring now supports signed and decimal numeric literals, so `light -1 -1` and fractional vector centers compile as authored while emitted lattice cells remain integer authority. The `sphere` center-cell behavior is now explicit instead of relying on `NaN` comparison fallthrough, and invalid vector parameters now produce `SCDL-011`. The active schema contract was bumped to `1.31`, and the Scholomance OS target, boss alert, and party-member painters can opt into compiled HUD sprites through existing renderer helpers. Current status: complete.

---

## 3. Intent and Reasoning

### Problem Statement
The original vector-op implementation shipped the authoring layer, but the review found four gaps:

- The new vector ops were not directly covered by parser/compiler regression tests.
- `sphere` divided by zero at its exact center cell and reached the darkest tier through accidental `NaN` comparison behavior.
- The grammar documented `light -1 -1`, but tokenizer logic skipped the `-` sign and parsed it as `1,1`.
- The PIR classified the work as an API/data-model change, but the active schema contract did not yet register the vector op shapes.

### Why This Change Was Chosen
The repair path kept SCDL v1 backward-compatible: vector source still lowers to existing `cell` ops before symmetry, cell expansion, packet emission, and exporter output. The parser was extended to signed/decimal numeric literals rather than inventing a second float grammar. `SCDL-011` was activated in validation because invalid vector parameters are authoring mistakes and should be visible as bytecode diagnostics before rasterization. The OS panel work was made opt-in through `hudAsset` / `spriteAsset` props so existing panels keep their current rendering when no sprite is supplied.

### Assumptions Made
- The existing `cell` output remains the only authoritative emitted geometry.
- Fractional vector coordinates are allowed at authoring time, but rasterization still emits integer cells.
- The current `sphere` center visual should remain the final tier because that matches existing slime fixtures; the implementation now makes that rule explicit.
- Full elliptical arc rasterization is not needed yet. `A` path commands preserve endpoint continuity as a straight segment until an approved asset requires real arc math.

### Alternatives Considered
- Revert to integer-only SCDL coordinates: rejected because it would leave the documented fractional-center follow-up unresolved.
- Make `sphere` center configurable: rejected because it would reopen asset tuning without a product need.
- Implement a full SVG rasterizer dependency: rejected because SCDL should remain dependency-light and deterministic.
- Hardwire slime sprites into more OS panels: rejected in favor of opt-in sprite props.

---

## 4. Scope of Change

### In Scope
- Extend SCDL numeric tokenization to signed and decimal literals.
- Parse vector op coordinates, radii, widths, and light vectors with numeric precision.
- Add validation for invalid vector authoring parameters via `SCDL-011 INVALID_VECTOR_OP`.
- Make `sphere` center-cell tier selection explicit.
- Add deterministic `C`, `S`, and `T` path flattening.
- Add focused vector-op Vitest coverage.
- Update compiler pass-order comments.
- Update `SCHEMA_CONTRACT.md` to version `1.31`.
- Update the SCDL PDR and original vector-ops PIR addendum.
- Add opt-in `hudAsset` / `spriteAsset` drawing hooks to Scholomance OS target, boss alert, and party-member panels.

### Out of Scope
- Full SVG arc rasterization for `A` commands.
- Animated vector ops.
- Rebaselining visual snapshots.
- Broader Scholomance OS layout or asset redesign.
- Any unrelated dirty workspace cleanup.

### Change Type
- [ ] UI only
- [x] Logic only
- [x] Data model
- [x] API contract
- [ ] Persistence layer
- [ ] Styling / layout
- [ ] Performance
- [ ] Accessibility
- [ ] Security
- [x] Build / tooling
- [x] Documentation
- [x] Multi-layer / cross-cutting

---

## 5. Files Changed

| File | Purpose |
|------|---------|
| `codex/core/pixelbrain/scdl/scdl.grammar.js` | Added signed/decimal numeric token support and parsed vector values with `parseFloat`. |
| `codex/core/pixelbrain/scdl/passes/expand-vector.pass.js` | Added explicit `sphere` center handling, decimal-aware raster bounds, and deterministic `C/S/T` path flattening. |
| `codex/core/pixelbrain/scdl/passes/validate.pass.js` | Activated `SCDL-011` validation for invalid vector parameters. |
| `codex/core/pixelbrain/scdl/scdl.compiler.js` | Corrected pass-order documentation to include `expandVector`. |
| `tests/codex/core/pixelbrain/scdl/scdl.vector-ops.test.js` | New focused vector-op regression suite. |
| `docs/scholomance-encyclopedia/Scholomance LAW/SCHEMA_CONTRACT.md` | Bumped schema to `1.31` and registered SCDL vector authoring contract. |
| `docs/scholomance-encyclopedia/PDR-archive/scdl-v1-pdr.md` | Updated grammar, AST example, pass order, and error catalogue. |
| `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260702-SCDL-VECTOR-OPS.md` | Added hardening addendum and closed stale risk bullets. |
| `Scholomance OS/client/pixelbrain-ui/panels/targetFrame.js` | Added opt-in target sprite drawing through `helpers.drawHudAsset`. |
| `Scholomance OS/client/pixelbrain-ui/panels/bossAlerts.js` | Added opt-in alert-side sprite drawing with fallback sigil rings. |
| `Scholomance OS/client/pixelbrain-ui/panels/partyFrames.js` | Added opt-in party-member sprite drawing and adjusted gauge text offset. |

---

## 6. Verification

### SCDL Test Suite

```bash
npx vitest run tests/codex/core/pixelbrain/scdl
```

Result:

```text
Test Files  5 passed (5)
Tests       64 passed (64)
```

Coverage added:
- signed and decimal token parsing
- explicit negative sphere light parsing
- vector lowering for `circle`, `ring`, `rect`, `polygon`, `path`, and `sphere`
- fractional vector coordinate rasterization
- explicit sphere center tier behavior
- vector-before-symmetry ordering
- deterministic cubic/smooth path flattening
- `SCDL-011` invalid vector diagnostics

### Targeted Lint

```bash
npx eslint codex/core/pixelbrain/scdl/scdl.grammar.js \
  codex/core/pixelbrain/scdl/passes/expand-vector.pass.js \
  codex/core/pixelbrain/scdl/passes/validate.pass.js \
  codex/core/pixelbrain/scdl/scdl.compiler.js \
  tests/codex/core/pixelbrain/scdl/scdl.vector-ops.test.js \
  "Scholomance OS/client/pixelbrain-ui/panels/targetFrame.js" \
  "Scholomance OS/client/pixelbrain-ui/panels/bossAlerts.js" \
  "Scholomance OS/client/pixelbrain-ui/panels/partyFrames.js"
```

Result: passed with no errors or warnings.

---

## 7. Risks and Follow-ups

- `A` path commands currently preserve endpoint continuity but do not perform full elliptical arc rasterization. Add full arc math only when a real asset needs it.
- Decimal authoring coordinates can change rasterized cell boundaries. Existing golden assets remain covered by the SCDL suite, but new assets should include fixture-level visual review.
- OS panel sprite hooks are opt-in and fallback-safe, but they were not covered by a visual regression run in this pass.
- The broader workspace already had unrelated dirty and deleted files; this work did not attempt to clean or revert them.

---

## 8. Law and Contract Compliance

- **Vaelrix Law 3, Schema Is Sovereign:** satisfied by registering the SCDL vector authoring contract in `SCHEMA_CONTRACT.md` version `1.31`.
- **Vaelrix Law 6, Determinism:** satisfied by deterministic vector lowering and test coverage for repeated cubic/smooth path compilation.
- **Vaelrix Law 8, Bytecode Priority:** satisfied by routing invalid vector parameters through `SCDL-011` and `PB-ERR-v1`.
- **Vaelrix Law 12, Law Evolution:** evaluated. No law update is required; the gap was contract documentation, now closed in schema version `1.31`.
- **Vaelrix Law 14, PIR Mandatory:** satisfied by this report.

---

## 9. Acceptance

Status: **complete**. The four requested follow-up tracks were implemented and documented: vector-op tests, parser/rasterizer fixes, schema/PDR/PIR cleanup, and opt-in Scholomance OS sprite-panel expansion. Verification passed with `64` SCDL tests and targeted ESLint on all touched JavaScript files.
