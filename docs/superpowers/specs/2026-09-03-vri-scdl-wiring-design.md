# Design: Wiring VRI into SCDL via `--shade vri`

**Status:** Approved by Vaelrix in conversation 2026-09-03; ready for PDR.
**Classification:** Architectural (first production consumer of a previously-isolated subsystem), small blast radius.
**Prior art:** `VERDICT-2026-09-03-VIXEL-SYSTEM.md` (found VRI correct, 194 tests, zero production consumers); `2026-09-03-scdl-amp-bridging-pdr.md` (same "Door A" architecture, same house documentation format).

## 1. Problem

`compileAsset()` (`codex/core/pixelbrain/asset-pipeline.js`) already composes `compileSCDL()` → `compileVRI()` → `renderVRI()` into one tested, working function — it has simply never had a caller. `scdl.cli.js` (Door A's real CLI) calls `compileSCDL()` directly in three places and has never imported `compileAsset` or anything under `vixel/`. The Verdict scored this a B specifically because the engine is correct and unreachable at once; this closes the reachability gap for the first time, on one door only, as recommended.

## 2. Decisions made (in conversation)

1. **Scope split, confirmed:** tonight wires reachability (`compileAsset()` gets a real caller) and threads `strict` (per Vaelrix's ruling that `compileAsset()` should default `strict: true` — not currently threaded at all, a real gap independent of wiring). The synthetic-relief technique is explicitly deferred to its own design pass, because zero code for it exists anywhere in the tree despite being described in a prior session's notes — adopting it tonight would mean inventing and validating a technique from a description, a materially different and riskier task than wiring something that already works.
2. **Mechanism: a third `--shade` value, `vri`**, alongside the existing `--shade material` (the current alternative to default Lambert banding). When `--shade vri` is passed to `compile` or `preview`, the CLI calls `compileAsset(source, { vri: {...} })` instead of `compileSCDL()` + the existing PNG exporter, and writes `compileAsset()`'s raster output through `encodePng()` directly. `item-foundry.js` (Door B) is untouched — one door, per the Verdict's own recommendation.
3. **No feature flag beyond the flag itself.** `--shade vri` is new syntax; a `.scdl` file or CLI invocation that doesn't pass it is completely unaffected. Matches the amp-bridging PDR's same reasoning: nothing to gate because nothing is on by default.
4. **Same documentation treatment as amp-bridging:** this design doc, then a full PDR per `docs/scholomance-encyclopedia/PDR-archive/PDR Prompt.md`.

## 3. What grounding this in real code changed

The one open implementation question going in — "`renderVRI()` returns a raw RGBA buffer, the existing PNG exporter's `renderPngBytes()` expects unrasterized coordinates, how do these compose" — resolved cleanly once traced: `renderPngBytes()` (`scdl.exporters.js:359`) rasterizes coordinates into an RGBA buffer and then calls a lower-level `encodePng(width, height, rgba)` for the actual PNG byte encoding. `renderVRI()` already produces a raw RGBA buffer at the final scaled dimensions (it takes `scale` itself: `renderVRI(scene, scale)` → `W = scene.width * scale`, `H = scene.height * scale`). So VRI's output needs no rasterization step at all — just `encodePng(W, H, vriRaster)` directly. No refactor, no duplicated logic; `encodePng` just needs to be exported from `scdl.exporters.js` for the CLI to reach it (currently module-private).

## 4. What this does not cover

- Door B (`item-foundry.js`) — not touched.
- The synthetic-relief technique — separate design, separate PDR, when someone is ready to actually build it.
- `preview`'s ANSI/terminal rendering (from the amp-bridging design) — unrelated feature, not part of this wiring.
- Registering `PB-VRI-v1` in `SCHEMA_CONTRACT.md` — still an open Immediate-tier item from the Verdict, not addressed by this PDR; noted as a dependency risk, not silently rolled in.

## Spec self-review

- Placeholder scan: none.
- Internal consistency: the "no refactor needed" finding in §3 directly resolves the risk flagged during brainstorming — stated as a finding, not silently dropped.
- Scope check: one CLI flag value, one options-threading fix, one function export. Small enough for a single implementation plan.
- Ambiguity check: "one door only" is explicit (§2.2), matching the Verdict's own recommendation rather than re-litigating it.
