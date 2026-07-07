# PIR — PixelBrain Connective Tissue: Emergent Disparity Reconciliation Pass

**Status:** Completed  
**Date:** 2026-07-02  
**Author:** Claude (Fable 5), directed by Damien  
**Tracked at:** `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260702-PIXELBRAIN-CONNECTIVE-TISSUE.md`  
**Origin:** Emergent Disparity Reconciliation Spell scan (`docs/scholomance-encyclopedia/Scholomance LAW/disparate-part-merge-skill.md`) over `codex/core/pixelbrain/` (158 files)

---

## 1. Executive Summary

A reconciliation scan of PixelBrain found six disparities where existing systems had never been introduced to each other. This pass built the missing bridges — all additive, none altering render-authoritative behavior:

1. **Cross-language checksum bridge** — `.pbrain` packet integrity was verifiable only in Python (JS collapses float literals `64.0` → `64`). New `canonical-json.js` (Python-compatible serializer + numeric-literal-preserving parser) and `pbrain-checksum.js` make FNV-1a-32 verification a local property in Node. The Holy Fire Claymore golden fixture (`output/holy_fire_claymore.pbrain`, checksum `6DB23A1A`) now verifies in JS, and a byte-for-byte cross-check against Python `json.dumps` runs in CI.
2. **Packet-emission enrichment seam** — SemQuant promised semantics "regardless of authoring origin" but only the SCDL path delivered. New `forgePacket()` in `semantic-bridge.js` (create + enrich in one step) plus a generic `parts-spec-to-ir` adapter; `item-foundry`, `nl-compile`, `foundry-aseprite-bridge`, and `template-grid-asset-bridge` migrated. Packet ids and coordinates are untouched (tested per the §5.6 additive-semantics policy); packets gain a top-level `semantic` summary with canonical roles.
3. **PB-SEM → PB-ERR-v1 bytecode adapter** — semantic diagnostics were ad-hoc object literals invisible to bytecode tooling. They now encode into the ARTIFACT module's `0x1080–0x108F` block via `semanticDiagnosticToBytecode()` / `createSemanticDiagnostic()` in `semantic-registry.js`, and `scdl.compiler.js` emits them that way. The white paper's §6.2 integration claim is now true.
4. **FNV consolidation** — `shared.js` gains `fnv1a32Hex()`; byte-identical private copies in `nl-compile.js` and `chunked-world-volume.js` re-pointed. (The FNV-style constants in `block-taxonomy.js` are a coordinate mixer, not a string hash — deliberately left alone.)
5. **Test infrastructure gaps closed** — the 9-case pipeline golden corpus (`pipeline-golden-corpus.js`) had a script runner but zero test consumers; it now runs under vitest. A native-ESM load smoke test spawns real Node to import 15 entry modules, guarding against the linking-error class that vitest's transform masks (the exact failure that shipped in `lower-booleans.js`).
6. **Canonical color codec** — new `color-codec.js` (`parseHex`, `hexToRgb255`, `hexToRgb01`, `hexToInt`, `intToHex`, `rgbToHex`, `normalizeHex`) with one documented malformed-input policy, replacing ~20 incompatible private copies via opportunistic adoption (no mass migration performed).

## 2. Changes Made

### New modules
- `codex/core/pixelbrain/canonical-json.js` — `canonicalStringify` (Python `json.dumps(v, separators=(",",":"))` semantics: float repr thresholds, `ensure_ascii` escaping, insertion key order), `parseCanonicalJson` (Map-based objects, `JsonNumber` lexeme preservation), `pyFloat` emit-time float marker, `pythonFloatRepr`.
- `codex/core/pixelbrain/pbrain-checksum.js` — `computePbrainChecksum[FromText]`, `verifyPbrainText`, `stampPbrainChecksum`. Mirrors `steamdeck_brain/vaelrix_forcefield/pixelbrain/pbrain_checksum.py`.
- `codex/core/pixelbrain/color-codec.js` — canonical hex↔RGB conversions.
- `codex/core/pixelbrain/semantic/adapters/parts-spec-to-ir.adapter.js` — generic `{ parts: [...] }` spec → IR nodes.

### Modified modules
- `semantic-bridge.js` — `forgePacket()` seam; `applyAuthoringSemantics` now detects parts-based specs.
- `semantic-registry.js` — `SEMANTIC_DIAGNOSTIC_BYTECODES` (0x1080 block), `semanticDiagnosticToBytecode`, `createSemanticDiagnostic`.
- `semantic/index.js` — exports `partsSpecToIR`.
- `scdl/scdl.compiler.js` — PB-SEM diagnostics (including the PB-SEM-000 internal-error path) emitted via `createSemanticDiagnostic`.
- `shared.js` — `fnv1a32Hex`.
- `item-foundry.js`, `nl-compile.js`, `foundry-aseprite-bridge.js`, `template-grid-asset-bridge.js` — emit via `forgePacket` with authoring parts (item spec parts / single body part / motif roles / layer names respectively).
- `nl-compile.js`, `chunked-world-volume.js` — local FNV implementations replaced by `fnv1a32Hex` (byte-identical output; digest contracts unchanged).
- `pipeline-golden-corpus.js` — spec path resolution tolerates vitest's http-scheme `import.meta.url` (falls back to cwd).

### New tests — `tests/codex/core/pixelbrain/`
- `canonical-json.test.js` (12) — float repr thresholds, escaping, key order, lexeme round-trips.
- `pbrain-checksum.test.js` (5) — claymore golden `6DB23A1A`, tamper detection, `pyFloat` stamping, Python cross-check (skips if `python3` absent), checksum-scope rules.
- `color-codec.test.js` (7), `forge-packet.test.js` (5 — id stability, coordinate immutability, role inference, template-grid integration), `semantic-diagnostic-bytecode.test.js` (5 — decode round-trip via `decodeBytecodeError`, SCDL compile integration), `pipeline-corpus.test.js` (10), `native-esm-load.test.js` (1, spawns real Node).

## 3. Verification

- `npx vitest run tests/codex/core/pixelbrain/` — **13 files, 122 tests, all pass** (77 pre-existing SCDL + 45 new).
- Regression sweep over `tests/core/pixelbrain/`, `tests/pixelbrain/`, `tests/qa/pixelbrain*`, `tests/server/nlCompile.routes.test.js` — 1240 passed. **5 failures are pre-existing** (see §4).
- SCDL CLI smoke: `check` on `void_chestplate.scdl` → OK, packet `pbasset_3b9fbe42`.
- `npm run scd64:intellisense` over all changed files — no architectural mutations.
- Collab board notified (message #6, agent `claude-fable-pixelbrain`).

## 4. Pre-existing Failures (not caused by this pass)

`armor-trim.test.js` (×3), `item-foundry.test.js` "exports a Godot shader" (bundle.godotShader is hardcoded `null`), `new-void-chestplate-*.test.js` (×2 suite errors), `volume-lift-route.test.js` (×1). The godotShader failure traces to the branch's in-flight Godot-bridge teardown (uncommitted working-tree changes removed `exportToGodotShader` wiring from `item-foundry.js` before this pass began); the rest fail identically at HEAD.

## 5. Deferred (by design, per the scan's judgment rules)

- **AMP registry population** — `amp-registry.js` remains a stub; register AMPs lazily when a pipeline needs enumeration, reusing `seam-contract.js` vocabulary. Do not reroute direct imports.
- **Color-codec mass migration** — swap private copies opportunistically as files are touched.
- **edit-compiler migration to forgePacket** — its 12 call sites are identity-preserving edits of existing packets; semantics should be preserved from input, not re-derived.
- **Emission of PB-SEM-001/002/004/005** — bytecode slots reserved and adapter ready; unifier conditions not yet implemented.
- **Test-root consolidation** (4 roots) and registry-shape unification — flagged as future risks, intentionally untouched.

## 6. Regression Risks & Watchpoints

- `canonicalStringify` vs Python divergence on exotic floats — guarded by the cross-language CI test; extend its case list if new numeric ranges appear in packets.
- Enriched packets carry a new top-level `semantic` key — consumers that iterate packet keys exhaustively could notice; none found in the sweep.
- `parts-spec-to-ir` role inference uses `ROLE_ALIASES` first-match on part ids; nonsense part ids simply yield no role annotation (no diagnostic yet — PB-SEM-001 emission is the follow-up).
- A second stable serializer exists at `src/lib/godot-export/stableSerialize.js` (sorted-keys convention, different contract from Python-compact). Do not merge them blindly — they serve different checksum contracts.
