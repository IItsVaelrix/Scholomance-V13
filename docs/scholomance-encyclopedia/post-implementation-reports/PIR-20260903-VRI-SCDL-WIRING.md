# Post-Implementation Report

## 1. Change Identity

- **Report ID:** PIR-20260903-VRI-SCDL-WIRING
- **Feature:** VRI reachability from the SCDL CLI via `--shade vri`
- **Date:** 2026-09-04
- **Branch:** `feature/semantic-calculus-lexical-predicates`
- **Collaboration task:** `521c3674-0442-4ee3-9414-3d83a2d03448`
- **PDR:** `PDR-archive/2026-09-03-vri-scdl-wiring-pdr.md`
- **Classification:** PixelBrain/SCDL CLI, VRI rendering, deterministic export

## 2. Executive Summary

The SCDL `compile` and `preview` commands now recognize the explicit
`--shade vri` value and route through the existing `compileAsset()` composition
boundary. VRI's already-rasterized RGBA output is encoded with the existing
`encodePng()` implementation, now exported from `scdl.exporters.js`.

The earlier strict-default portion of the PDR was already present in commit
`2c92a5d5`. This implementation completed the CLI reachability work and closed
three gaps found while testing the PDR's actual failure and animation laws:

- `renderVRI()` exceptions are now returned as frame-scoped pipeline failures
  instead of escaping as raw process crashes;
- CLI VRI failures name the failing frame and preserve the underlying error;
- multi-frame VRI compilation ignores a singular `--out` destination, matching
  the existing animation naming law instead of overwriting one path N times;
- explicit non-PNG targets are refused instead of receiving mislabeled PNG
  bytes, while omitting `--export` selects the VRI PNG path;
- VRI animation now preserves the loop manifest and preview filmstrip; and
- strict SCDL refusals retain labels, locations, and opt-in bytecode output.

Door B (`item-foundry.js`) and VRI internals remain unchanged. VRI remains
opt-in; default and `--shade material` output are unchanged.

## 3. Scope Implemented

- `compileAsset()` contains both VRI compilation and VRI rendering exceptions,
  preserving `{ stage, frame, error }` diagnostics.
- `scdl.cli.js compile` writes one VRI PNG per frame.
- `scdl.cli.js preview` writes one VRI preview PNG per frame.
- VRI compile writes `SCDL-FRAME-LOOP-v1` metadata and VRI preview writes a
  side-by-side strip assembled from the already-rendered frame rasters.
- Multi-frame names remain `<asset>-f<N>-png.png` and
  `<asset>-f<N>-preview-<scale>x.png`.
- Explicit `--export` values other than the single `png` target refuse with a
  clear error; an omitted `--export` implies PNG in VRI mode.
- `encodePng(width, height, rgba)` is exported and reused without duplicated
  encoder logic.
- CLI help advertises `--shade material|vri`.

## 4. Test-Driven Evidence

The following failures were observed before their fixes:

- a true scene-graph `compileVRI()` refusal included the underlying message but
  omitted `frame 0` from CLI output;
- `compileAsset(..., { scale: Infinity })` allowed `renderVRI()`'s `RangeError`
  to escape instead of returning a structured failure;
- multi-frame `--shade vri --out single.png` overwrote the same file for every
  frame and emitted none of the required `-f<N>-png.png` outputs.
- `--shade vri --export json --out result.json` succeeded while writing PNG
  bytes to the JSON path;
- the VRI early returns skipped the loop manifest and preview filmstrip; and
- strict SCDL failures printed only the first message, dropping the diagnostic
  label, source location, and requested bytecode correlation handle.

After implementation, the focused suite passed 12/12 tests across:

- `tests/codex/core/pixelbrain/asset-pipeline.strict.test.js`
- `tests/codex/core/pixelbrain/scdl/scdl.cli.vri-shade.test.js`

The focused coverage includes strict default and opt-out behavior, true VRI
compile refusal, VRI render-exception containment, deterministic repeated VRI
bytes, all animation frames, preview output, and singular-`--out` protection.

## 5. Regression and Determinism Evidence

- Full SCDL suite after review remediation: 32 files, 310 tests passed.
- VRI/pipeline/material suite: 9 files, 208 tests passed.
- Scoped ESLint using the repository's `--quiet` policy: passed.
- `git diff --check`: passed.
- Detached-HEAD golden comparison: all 23 SCDL fixtures were compiled once with
  default shading and once with `--shade material` under both pre-PDR HEAD and
  the current implementation. All 46/46 comparisons were byte-identical, with
  zero status differences and zero byte differences.

## 6. Real-Asset Visual QA

Two strict-clean assets outside the fixture directory were rendered at 8x and
inspected as nearest-neighbor pixel art.

### `assets/ASSETS/lightning_scimitar.scdl`

- Both paths produced valid 512x512 PNGs with packet ID `pbasset_71103a17`.
- 55,680 pixels differed (21.24% of the canvas).
- Non-transparent pixels changed from 55,680 default to 51,267 VRI.
- The blade silhouette, highlight facet, spark, and palette separation remain
  recognizable. The ruby hilt becomes substantially darker and gains stronger
  relief rings; this is functional but not a clear perceptual improvement.

### `assets/ASSETS/Character model/photo_1_lit.scdl`, frame 0

- Both paths produced valid 256x256 PNGs with packet ID `pbasset_08aa3846`.
- 14,464 pixels differed (22.07% of the canvas).
- Non-transparent pixels changed from 16,704 default to 15,068 VRI.
- The character silhouette and major value groups remain readable. VRI adds
  visible material banding to the cloak and slightly changes edge coverage.

**Judgment:** VRI output is deterministic, non-empty, and not structurally
broken, but is best classified as **merely different**, not universally better.
Keeping it behind the explicit `--shade vri` value is the correct rollout.

Rendered evidence:

- `/tmp/vri-scdl-check/default/lightning_scimitar-png.png`
- `/tmp/vri-scdl-check/vri/lightning_scimitar-png.png`
- `/tmp/vri-scdl-check/character-default/photo_1_lit-f0-png.png`
- `/tmp/vri-scdl-check/character-vri/photo_1_lit-f0-png.png`
- `/tmp/vri-scdl-check/character-vri-final/photo_1_lit-preview-8x-strip.png`
  (`sha256:0aeae927c5e587d9e4f2ec5671c78a122f4cbbc5f424a3e5047697b0781c8c14`)

## 7. Escalation Resolution

The PDR's recommended sequencing is retained: ship the opt-in reachability
slice independently, while `PB-VRI-v1` registration in `SCHEMA_CONTRACT.md`
remains a separate follow-up. This change creates no new packet shape and does
not make VRI the default.

## 8. Risk and Rollback

The new behavior is unreachable unless `--shade vri` is passed. Rollback is a
code revert; there is no persisted state or migration. The principal remaining
risk is visual taste and material calibration, especially dark-material value
compression. That risk is bounded by the explicit CLI opt-in.

## 9. Independent Review

A scoped read-only review found four issues. Three were actionable and fixed in
one remediation wave: export-target confusion, missing animation artifacts,
and degraded SCDL diagnostics. The fourth correctly noted that a same-build
repeatability test is not a pre-change golden oracle; its test name was
corrected, while the required pre-change evidence remains the independently
executed 46/46 detached-HEAD corpus comparison in section 5.

The one scoped re-review found a test-isolation hazard: the deliberate
non-PNG-refusal test did not pass a temporary `--out-dir`, so a future guard
regression could write into the source fixture directory. The test now supplies
the temporary directory explicitly. No P1/P2 implementation finding remains.

## 10. Definition of Done

- [x] `compile` and `preview` route `--shade vri` through `compileAsset()`.
- [x] VRI RGBA output uses the shared PNG encoder.
- [x] Strict default and explicit lenient opt-out are covered.
- [x] Compile and render failures are frame-scoped and do not crash the CLI.
- [x] Multi-frame naming is preserved, including with `--out` present.
- [x] Explicit non-PNG targets refuse without writing mislabeled output.
- [x] Loop manifests and VRI preview filmstrips are preserved.
- [x] Strict SCDL failures retain full diagnostic presentation.
- [x] Existing default/material fixture outputs are byte-identical.
- [x] Real-asset visual inspection and empirical judgment are recorded.
- [x] Schema-registration sequencing is recorded.
- [ ] Commit/merge is intentionally left to the repository owner.
