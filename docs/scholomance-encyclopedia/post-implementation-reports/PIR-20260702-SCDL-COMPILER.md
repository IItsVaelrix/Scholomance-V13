# PIR — SCDL v1: Scholomance Coordinate Description Language Compiler

**Status:** Completed  
**Date:** 2026-07-02  
**Author:** Antigravity (Gemini domain)  
**Tracked at:** `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260702-SCDL-COMPILER.md`

---

## 1. Executive Summary

We have fully implemented **SCDL (Scholomance Coordinate Description Language) — version 1.0.0**, a human-authored language that compiles directly to the PixelBrain asset packet and runtime contracts. The entire compiler pipeline has been built from scratch, tested, verified, and integrated into the `Scholomance-V12-main` ecosystem.

All 56 unit and integration tests are passing successfully, covering the parser, error system, compiler passes, golden regression testing, deterministic diagnostics, and export contract completion.

---

## 2. Changes Made

All new files were added without modifying any existing core files:

- **`codex/core/pixelbrain/scdl/`**
  - **`scdl.grammar.js`**: Hand-written recursive-descent parser and tokenizer for the SCDL language, ensuring zero external dependencies and deterministic performance.
  - **`scdl.compiler.js`**: functional pass orchestrator (`validate` → `resolve-colors` → `resolve-materials` → `expand-symmetry` → `expand-cells` → `emit-packet` → `emit-diagnostics`).
  - **`scdl.errors.js`**: Fully integrated with the existing `PB-ERR-v1` bytecode error system, mapping error categories/severities/contexts.
  - **`scdl.lattice-emitter.js`**: Formatter for the standard `pixelbrain.asset.v1` lattice packet.
  - **`scdl.exporters.js`**: Exporter system for JSON, SVG, Phaser configurations (using 32-bit color integers for Phaser consumption), and deterministic PNG bytes.
  - **`scdl.diagnostics.js`**: Maps compiler errors to the `DiagnosticReport` diagnostic standard without volatile timestamps in SCDL-derived report entries.
  - **`scdl.cli.js`**: Node.js CLI utility offering `compile`, `parse`, and `check` commands, including binary PNG writes and target-specific multi-export filenames.
  - **`fixtures/void_chestplate.scdl`**: The canonical reference chestplate fixture.

- **`docs/scholomance-encyclopedia/`**
  - **`PDR-archive/scdl-v1-pdr.md`**: Canonical Product Design Record detailing SCDL grammar, verbs, AST contracts, and Vaelrix Law compliance.
  - **`post-implementation-reports/PIR-20260702-SCDL-COMPILER.md`**: This post-implementation report.

- **`tests/codex/core/pixelbrain/scdl/`**
  - **`scdl.parser.test.js`**: Verifies tokenizer, string/hex parsing, malformed hex preservation, and AST shape.
  - **`scdl.errors.test.js`**: Verifies `PB-ERR-v1` bytecode compatibility and deterministic behavior.
  - **`scdl.compiler.test.js`**: Verifies compiler passes, bounds checking, unknown export errors, deterministic diagnostics, and strict/lenient validation settings.
  - **`scdl.void-chestplate.test.js`**: Golden regression test validating output stability, JSON packet export, SVG export, Phaser exports, PNG export, and SymmetryAMP integration.

---

## 3. Verification & Testing

### Automated Test Suite
Tests are run using Vitest. All 56 tests passed successfully:
```bash
npx vitest run tests/codex/core/pixelbrain/scdl/
```
Output:
```
 ✓ tests/codex/core/pixelbrain/scdl/scdl.errors.test.js (9 tests)
 ✓ tests/codex/core/pixelbrain/scdl/scdl.parser.test.js (16 tests)
 ✓ tests/codex/core/pixelbrain/scdl/scdl.compiler.test.js (17 tests)
 ✓ tests/codex/core/pixelbrain/scdl/scdl.void-chestplate.test.js (14 tests)

 Test Files  4 passed (4)
      Tests  56 passed (56)
```

### Completion Audit Addendum
The 2026-07-02 completion audit closed the remaining contract gaps:
- Malformed hex literals such as `#GGGGGG` are preserved by the parser and reported as `SCDL-004`.
- Unknown export targets now fail compilation as `SCDL-010`, matching the PDR catalogue.
- JSON export emits the raw `pixelbrain.asset.v1` packet; lattice output remains available through `emitLattice()`.
- Phaser export includes the named integer palette map.
- PNG export emits real deterministic RGBA PNG bytes instead of a placeholder JSON stub.
- SCDL diagnostic reports are stable across identical compile results.
- CLI multi-export output paths now use target-specific extensions.

### Determinism Verification
Compiling `void_chestplate.scdl` twice results in identical, stable, and deterministic output files, conforming to Vaelrix Law 6:
```bash
node codex/core/pixelbrain/scdl/scdl.cli.js compile codex/core/pixelbrain/scdl/fixtures/void_chestplate.scdl --out run1.json
node codex/core/pixelbrain/scdl/scdl.cli.js compile codex/core/pixelbrain/scdl/fixtures/void_chestplate.scdl --out run2.json
diff run1.json run2.json
# Output is empty (100% match)
```

---

## 4. Vaelrix Law Compliance

- **Law 6 (Determinism)**: Satisfied. Tokenizer and pass functions are strictly pure; packet IDs use deterministic checksum hashing (`stableId()`).
- **Law 8 (Bytecode Priority)**: Satisfied. All error/warn codes mapped to corresponding `PB-ERR-v1` bytecode payloads.
- **Law 13 (PDR Archive)**: Spec archived at `docs/scholomance-encyclopedia/PDR-archive/scdl-v1-pdr.md`.
- **Law 14 (PIR Mandatory)**: Stored in this report.
