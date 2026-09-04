# PDR: Wiring VRI into SCDL
## Giving `compileAsset()` Its First Real Caller via `--shade vri`

**Status:** Implemented in working tree 2026-09-04; verified and awaiting commit/merge.
**Classification:** Architectural | PixelBrain/SCDL | VRI/Rendering | CLI
**Priority:** Medium — the Verdict's own recommended next step, but additive and non-blocking to any other in-flight work.
**Primary Goal:** Give `codex/core/pixelbrain/asset-pipeline.js`'s `compileAsset()` — a tested, working SCDL→VRI→raster composition that has never had a caller — a real production entry point, via one new CLI flag value on Door A (SCDL), with `item-foundry.js` (Door B) untouched.
**Bytecode Search Code:** `SCHOL-ENC-BYKE-SEARCH-PDR-VRI-SCDL-WIRING-2026-09-03`

---

## Owner(s)
- **Codex:** the `--shade vri` flag-value semantics (a CLI/language-surface addition, same category as `--shade material`), approval of exporting `encodePng` from `scdl.exporters.js`'s public surface.
- **Gemini:** implementation — `scdl.cli.js` wiring, `asset-pipeline.js`'s `strict` threading, `encodePng` export, all new tests.
- **Claude:** no v1 scope. No UI surface touched.
- **Escalation owner** (cross-domain conflicts): Angel (repository owner).

## Context (seed — not the Executive Summary)
`VERDICT-2026-09-03-VIXEL-SYSTEM.md` graded the Vixel/VRI render engine a B: genuinely correct (194 tests, a real fixed lighting bug), reaching zero production consumers because nothing calls it. This PDR is the Verdict's own recommended first move — not a new integration, but exposing one that already exists and already works.

## Target Integration Area
- `codex/core/pixelbrain/scdl/scdl.cli.js` (`cmdCompile`, `cmdPreview` — new `--shade vri` branch).
- `codex/core/pixelbrain/asset-pipeline.js` (`compileAsset()` — thread `strict`, default `true`, currently not threaded at all).
- `codex/core/pixelbrain/scdl/scdl.exporters.js` (export the existing private `encodePng` function; no logic changes).
- **Not modified:** `codex/core/pixelbrain/item-foundry.js` (Door B), anything under `codex/core/pixelbrain/vixel/` (VRI itself is correct per the Verdict; this PDR is reachability only), `SCHEMA_CONTRACT.md` (registering `PB-VRI-v1` is a separate open item — see §6).

## Core Concept
`compileAsset()` already does the composition this PDR needs: SCDL compile → VRI scene compile → VRI raster render, as one tested function. The gap was never architectural — it was that nothing called it. `--shade vri` reuses the exact slot `--shade material` already established (an alternate way to light a compiled packet, alongside the default Lambert banding), so the CLI surface grows by one recognized value, not a new concept. `renderVRI()`'s raw RGBA output needs no rasterization step to become a PNG — `scdl.exporters.js` already has the low-level encoder (`encodePng`) `renderPngBytes()` itself delegates to; VRI's output goes straight to it.

## Implementation Philosophy
Reuse, don't reimplement. No changes to VRI itself (the Verdict already validated it), no changes to Door B, no new export target invented where an existing flag value fits. The one function whose public surface changes (`encodePng`, private → exported) changes because two callers now legitimately need it, not because anything about it is wrong.

## Ownership & Law Compliance
Every file this PDR writes appears in §7 with its owning agent, following the same Codex/Gemini split as `2026-09-03-scdl-amp-bridging-pdr.md`. Determinism per `VAELRIX_LAW.md` Law 6: same `.scdl` source + `--shade vri` → identical packet bytes every time — `compileVRI`/`renderVRI` are already covered by the Verdict's own determinism finding (`verifyLineage()`'s checksum chain), and this PDR adds no new nondeterminism source. Cross-domain conflicts go to Angel per `ESCALATION:` format (§6).

---

# 1. Executive Summary

`compileAsset()` composes `compileSCDL()` → `compileVRI()` → `renderVRI()` into a single, tested function (`codex/core/pixelbrain/asset-pipeline.js`). No file under `codex/core/pixelbrain/scdl/` or `item-foundry.js` imports it — confirmed by direct grep. This PDR gives it a caller: `--shade vri`, a third value alongside the existing `--shade material`, on `scdl.cli.js`'s `compile` and `preview` commands. When passed, the CLI routes through `compileAsset()` instead of `compileSCDL()` + the default PNG exporter, and writes the VRI-rendered raster through the exporter's existing low-level PNG encoder.

Two small, real fixes ride along: `compileAsset()` never threaded a `strict` option to `compileSCDL()` at all — closing that gap and defaulting it `true` is Vaelrix's own ruling from the Verdict's open questions, not new scope. And `encodePng` (currently module-private in `scdl.exporters.js`) needs exporting, since it's the correct reuse point for VRI's already-rasterized output rather than duplicating `renderPngBytes()`'s coordinate-to-pixel logic.

Blast radius is deliberately minimal: one new flag value, inert unless passed; one options-threading fix scoped to `compileAsset()` only (does not change `scdl.cli.js`'s own separate `--strict` flag or its default); one function export with no logic change. Door B is untouched. The synthetic-relief technique from the Verdict's other open question is explicitly out of scope (§2) — it has no existing implementation anywhere in the tree to wire, and building it is a separate, later design.

# 2. Out of Scope / Non-Goals

- **The synthetic-relief technique.** Zero code for it exists in the tree despite being described in a prior session's notes. Adopting it is a real, separate implementation task with its own validation needs, not a wiring job — deferred to its own PDR.
- **Door B (`item-foundry.js`).** Not touched. The Verdict recommended one door first; this is that door.
- **Registering `PB-VRI-v1` in `SCHEMA_CONTRACT.md`.** Still an open Immediate-tier item from the Verdict. Not addressed here — flagged as a dependency risk in §5, not silently rolled in.
- **Changing `scdl.cli.js`'s existing `--strict` flag or its default.** That flag and its off-by-default behavior for `compile`/`preview`/`check` are unrelated, pre-existing, and untouched. Only `compileAsset()`'s own internal default changes.
- **Any change to VRI itself** (`codex/core/pixelbrain/vixel/`). The Verdict already validated it; this PDR is reachability only.
- **A feature flag or env var.** `--shade vri` is new syntax — nothing is on by default, so there's nothing to gate beyond the flag value itself.

# 3. Spec Sheet

## 3.1 Functional Spec

**F1 — `--shade vri` flag value.** `scdl.cli.js`'s existing shade-parsing (`opts.flags.shade === 'material' ? 'material' : undefined`, at `cmdCompile`/`cmdPreview`) gains a second recognized value: `opts.flags.shade === 'vri' ? 'vri' : (opts.flags.shade === 'material' ? 'material' : undefined)`. *Acceptance:* `--shade vri` on `compile` or `preview` produces PNG output visibly different from the default Lambert-banded render on a fixture with real relief data (e.g. `crimson_ooze.scdl`, which the audit's own S1 example already exercises); `--shade material` and no-flag behavior are byte-identical to today (golden-diff, §12).

**F2 — Route through `compileAsset()` when `shade === 'vri'`.** Instead of `compileSCDL()` + `exportSCDL(..., 'png')`, call `compileAsset(source, { vri: {}, scale })` and take `result.frames[i].raster` per frame. *Acceptance:* multi-frame `.scdl` sources produce one VRI-rendered PNG per frame, matching the existing per-frame naming convention (`<asset>-f<N>-<target>.<ext>`) already established for non-VRI multi-frame output.

**F3 — `encodePng` export.** `scdl.exporters.js` exports `encodePng` (currently private, called only by `renderPngBytes`). *Acceptance:* `cmdCompile`/`cmdPreview` import it directly; no duplicate PNG-encoding logic is written.

**F4 — `strict` threading in `compileAsset()`.** `compileAsset(source, options)` destructures `strict = true` from `options` and passes it to `compileSCDL(source, { ...existingGeneOptions, strict })`. *Acceptance:* a fixture with an unresolvable material alias, compiled via `compileAsset()` with no `strict` override, fails (matches `compileSCDL`'s own `strict: true` behavior); passing `{ strict: false }` explicitly restores today's silent-fallback behavior, so this is additive, not a behavior removal for anyone who wants the old default.

## 3.2 Non-Functional Spec

- **Determinism:** identical `.scdl` source + `--shade vri` → identical PNG bytes, every run. Verified by a repeat-compile test (matching the pattern already used for `--shade material` and `--export png`).
- **No existing-output regression:** every `.scdl` fixture compiled without `--shade vri` produces byte-identical output before and after this PDR (golden-diff against `codex/core/pixelbrain/scdl/fixtures/*.scdl`).
- **Failure mode:** if `compileVRI`/`renderVRI` throws for a given packet, `--shade vri` reports a compile error naming the frame and the underlying exception — never a silent fallback to Lambert shading (that would misrepresent what was actually rendered) and never a process crash.

## 3.3 Contracts

No new data contracts. `compileAsset()`'s existing return shape (`{ ok, frames: [{ index, packet, vriScene, raster }], diagnostics, ... }`) is unchanged; this PDR is a new caller, not a new shape.

**Deferred to a follow-up PDR:** the synthetic-relief technique; Door B wiring; `PB-VRI-v1` schema registration.

# 4. Change Classification

- **architectural** — first production consumer of a previously-isolated subsystem (VRI); the reason this gets full PDR treatment despite the small diff.
- **structural** — one function moves from private to exported; no new files.
- **behavioral** — new CLI output path, reachable only via an explicit new flag value; zero change to any existing invocation.
- Not **cosmetic** — real rendering-pipeline change, gated behind opt-in syntax.

# 5. Assumptions and Unknowns

## 5.0 Grounds

| Claim | Grounds | Basis |
|---|---|---|
| `compileAsset()` already composes `compileSCDL → compileVRI → renderVRI` | measured | `asset-pipeline.js:28,35-36` (imports), `:195-197` (SCDL call), `:230,242` (VRI compile + raster per frame) |
| `scdl.cli.js` never calls `compileAsset` | measured | grep across the file: only `compileSCDL` (3 call sites) |
| `--shade material` is an existing precedent for an alternate-shading flag value | measured | `scdl.cli.js:169,260`; `scdl.exporters.js:94,101,119` |
| `renderVRI()` returns a raw RGBA buffer at final scaled dimensions, no separate rasterization needed | measured | `vri-renderer.js:395-398` (`W = scene.width * scale`, `H = scene.height * scale`, `Uint8Array(W*H*4)`) |
| `encodePng(width, height, rgba)` already exists and is the correct reuse point | measured | `scdl.exporters.js:359,378-380` — `renderPngBytes` rasterizes coordinates into an RGBA buffer, then calls `encodePng` for the actual byte encoding |
| `compileAsset()` does not currently thread `strict` to `compileSCDL()` | measured | `asset-pipeline.js:92-99` destructure has no `strict` key; the call at `:195-197` passes only gene-related options |
| Synthetic-relief has zero implementation anywhere in the tree | measured, but the absence itself is **judgement** about cause | grep across `codex/core/pixelbrain/` for the technique's description (`synthetic.relief`, `syntheticRelief`, ramp-rank patterns) returns nothing; whether this means "never committed" vs. "built somewhere outside this repo" is not known — treated as "does not exist here," which is the only actionable fact |

## 5.1 Assumptions

- A1 *(measured)*: `compileAsset()`'s `vri` option (forwarded to `compileVRI`) accepting `{}` (empty) produces sensible default lighting — this is already exercised by the Verdict's own 194-test suite, not a new assumption introduced here.
- A2 *(architectural)*: reusing the existing per-frame naming convention (`<asset>-f<N>-<target>.<ext>`) for VRI output is correct rather than inventing a `-vri` suffix — keeps one naming law instead of two.

## 5.2 Unknowns

- U1: whether `--shade vri`'s visual output on real shipped assets (not just fixtures) will look better, worse, or merely different from today's default Lambert banding. The Verdict's own lighting-bug fix was measured on synthetic/demo assets; this PDR's QA plan (§12) requires eyes-on comparison on at least one real asset before merge, not just a passing test.
- U2: `PB-VRI-v1`'s absence from `SCHEMA_CONTRACT.md` (still open from the Verdict) — does not block this PDR technically (nothing here requires the schema to be registered to function), but is a standing gap this PDR does not close. See §6.

# 6. Open Questions / Escalations

**ESCALATION:** Should this PDR be blocked on `PB-VRI-v1`'s registration in `SCHEMA_CONTRACT.md` (the Verdict's own Immediate-tier item, still open), or is it acceptable to ship reachability first and register the schema separately? Option A: ship this PDR now, register the schema as an independent follow-up (recommended — the schema gap is a documentation/governance issue, not a functional blocker, and blocking real reachability on paperwork re-creates exactly the "good work sitting idle" problem the Verdict criticized). Option B: require schema registration first. Owner: Codex.

# 7. Architecture / File Map

```
codex/core/pixelbrain/
  scdl/
    scdl.cli.js              MOD  Gemini  cmdCompile/cmdPreview: recognize --shade vri,
                                           route through compileAsset() + encodePng (F1, F2)
    scdl.exporters.js        MOD  Gemini  export encodePng (currently private) (F3)
  asset-pipeline.js          MOD  Gemini  thread strict (default true) into the compileSCDL
                                           call inside compileAsset() (F4)
tests/codex/core/pixelbrain/
  scdl/
    scdl.cli.vri-shade.test.js   NEW  Gemini  F1/F2: --shade vri produces VRI-rendered output,
                                               multi-frame naming convention, error-not-crash
                                               on a throwing compileVRI
  asset-pipeline.strict.test.js NEW  Gemini  F4: strict defaults true and actually rejects an
                                              unresolvable-material fixture; explicit
                                              strict:false restores today's behavior
```

Dependency direction: `scdl.cli.js` → `asset-pipeline.js:compileAsset` → (`scdl.compiler.js:compileSCDL`, `vixel/vri-compiler.js:compileVRI`, `vixel/vri-renderer.js:renderVRI`) → `scdl.exporters.js:encodePng`. No new edges into `item-foundry.js` or `vixel/` internals — `compileAsset()` was already the composition root; this PDR only adds an edge into it.

# 8. Step-by-Step Implementation Plan

**Phase 1 — `strict` threading (Gemini, ~1 hour).** Milestone: `compileAsset()` destructures and forwards `strict`, defaulting `true`. Exit criteria: `asset-pipeline.strict.test.js` green; existing `asset-pipeline.test.js`/`compile-asset.test.js` suites (194 tests per the Verdict) still green — a default change must not silently break currently-passing fixtures that happen to rely on lenient compilation.

**Phase 2 — `encodePng` export + CLI wiring (Gemini, ~1 hour). Requires Phase 1.** Milestone: `--shade vri` recognized, routes through `compileAsset()`, writes PNG via `encodePng`. Exit criteria: `scdl.cli.vri-shade.test.js` green; golden-diff confirms zero output change for every existing fixture compiled without `--shade vri`.

**Phase 3 — Real-asset eyes-on check (Gemini + Vaelrix, ~30 min).** Milestone: at least one real (non-fixture) `.scdl` asset rendered both ways (`--shade material` or default vs. `--shade vri`) and looked at side by side. Exit criteria: a human confirms the VRI render is not visibly broken (this is U1 from §5.2 — a passing test suite does not resolve it).

Each phase is independently shippable; Phase 3 gates merge, not Phase 1/2's own correctness.

# 9. Code Examples — Pivotal Changes

**9.1 `encodePng` export (the one API-surface change):**

```js
// scdl.exporters.js — change `function encodePng(...)` to:
export function encodePng(width, height, rgba) {
  // body unchanged
}
```

**9.2 `--shade vri` recognition, replacing the existing binary check:**

```js
// scdl.cli.js — was: const shade = opts.flags.shade === 'material' ? 'material' : undefined;
const shade = opts.flags.shade === 'vri' ? 'vri'
  : opts.flags.shade === 'material' ? 'material'
  : undefined;
```

**9.3 Routing through `compileAsset()` when `shade === 'vri'` (schematic, inside `cmdCompile`/`cmdPreview`):**

```js
if (shade === 'vri') {
  const asset = compileAsset(source, { scale, vri: {} });
  if (!asset.ok) {
    console.error(`[SCDL] --shade vri: compile FAILED — ${asset.errors?.[0]?.message ?? 'unknown error'}`);
    process.exit(1);
  }
  asset.frames.forEach((frame, i) => {
    const infix = asset.frames.length > 1 ? `-f${i}` : '';
    writeOut(join(outDir, `${name}${infix}-png.png`), encodePng(
      frame.packet.canvas.width * scale, frame.packet.canvas.height * scale, frame.raster,
    ));
  });
  return;
}
// ...existing compileSCDL + exportSCDL path, unchanged
```

**9.4 `strict` threading in `compileAsset()`:**

```js
// asset-pipeline.js
export function compileAsset(source, options = {}) {
  const {
    construction = null, genes = null, canvas = null, assetId = null,
    projection = {}, vri = {}, scale = null, digest = defaultDigest,
    strict = true,   // NEW — was never threaded; Vaelrix's ruling, 2026-09-03
  } = options;
  // ...
  const scdl = compileSCDL(source, {
    ...(genePackets ? { artGenes: genePackets, artProjectionContext: projectionContext } : {}),
    strict,
  });
```

# 10. Glossary

- **Door A / Door B** — SCDL (the text DSL, `scdl.cli.js`) vs. the item-foundry's JS-object pipeline (`item-foundry.js`). This PDR wires Door A only.
- **`compileAsset()`** — the existing SCDL→VRI→raster composition function (`asset-pipeline.js`) this PDR gives a real caller.
- **VRI** — Vixel Render IR, the physically-modulated lighting engine validated in `VERDICT-2026-09-03-VIXEL-SYSTEM.md`.
- **`--shade material` / `--shade vri`** — existing/new values of `scdl.cli.js`'s shading flag; the default (no flag) is Lambert banding.

# 11. Q&A — Implementation Concerns

**Q1: Why not make `--shade vri` the new default?** Because the Verdict explicitly flagged this as a visible rendering change (brightness/hue shifts) requiring eyes-on review before trusting it broadly — defaulting it would apply that change to every asset compiled from today onward with no review step. Opt-in first; defaulting is a decision for after Phase 3's real-asset check, not this PDR.

**Q2: Does this change what `--shade material` or no-flag output looks like?** No — F1's acceptance criterion is explicitly a golden-diff proving byte-identical output for both, and Phase 2's exit criteria require it.

**Q3: What happens to `compileAsset()`'s other options (`construction`, `genes`, `canvas`) when called from the CLI?** Not used — the CLI calls `compileAsset(source, { scale, vri: {} })` only, leaving `construction`/`genes` at their existing defaults (`null`). Those are for the gene-projection/construction-solver paths, unrelated to this PDR.

**Q4: Why default `strict` to `true` in `compileAsset()` but leave `scdl.cli.js`'s own `--strict` flag defaulting to `false`?** Different call sites, different rulings — Vaelrix's ruling was specifically about `compileAsset()`; the CLI's existing `compile`/`preview`/`check` default was never part of this conversation and changing it isn't in scope (§2).

**Q5: Could a throwing `compileVRI` call leave a partial file on disk?** No — F2's routing collects `asset.ok` and every frame's raster before any `writeOut()` call; a failure exits before any file is written, matching the existing `--strict` failure path's behavior elsewhere in the CLI.

# 12. QA Plan

New tests (exact paths, from §7):
- `tests/codex/core/pixelbrain/scdl/scdl.cli.vri-shade.test.js`
- `tests/codex/core/pixelbrain/asset-pipeline.strict.test.js`

Commands:
```bash
npx vitest run tests/codex/core/pixelbrain/scdl/scdl.cli.vri-shade.test.js \
  tests/codex/core/pixelbrain/asset-pipeline.strict.test.js

npx vitest run tests/codex/core/pixelbrain/scdl/   # no regression in the existing SCDL suite
npx vitest run tests/codex/core/pixelbrain/vixel/ tests/codex/core/pixelbrain/asset-pipeline.test.js \
  tests/codex/core/pixelbrain/compile-asset.test.js tests/codex/core/pixelbrain/material-validator.test.js
  # the Verdict's 194 — must stay 194/194 after the strict default change

node codex/core/pixelbrain/scdl/scdl.cli.js compile \
  codex/core/pixelbrain/scdl/fixtures/crimson_ooze.scdl --export png --shade vri
node codex/core/pixelbrain/scdl/scdl.cli.js compile \
  codex/core/pixelbrain/scdl/fixtures/crimson_ooze.scdl --export png
  # byte-diff this against the pre-PDR output — must be identical
```

# 13. Regression Risks and Specific Retest Checklist

| Risk | Retest |
|---|---|
| `compileAsset()`'s new `strict: true` default breaks a currently-passing fixture that relied on lenient compilation | Full `asset-pipeline.test.js` + `compile-asset.test.js` run — the Verdict's 194 must stay 194/194 |
| `--shade material` or default output drifts | Golden-diff: every fixture, byte-compared, with and without this PDR's changes present but `--shade vri` absent |
| `encodePng` export breaks `renderPngBytes`'s existing internal call | `npx vitest run tests/codex/core/pixelbrain/scdl/` — existing PNG export tests unchanged |
| Multi-frame VRI output breaks the existing per-frame naming law | `scdl.cli.vri-shade.test.js` asserts `<asset>-f<N>-png.png` naming on a real multi-frame fixture |

# 14. Rollout Plan

- **Incomplete-but-safe:** ships inert. `--shade vri` is new syntax; no existing invocation is affected.
- **No flag needed beyond `--shade vri` itself** — same reasoning as the amp-bridging PDR: nothing is on by default, so there's nothing separate to gate.
- **Phase 3 (real-asset eyes-on check) gates merge**, not just test-passing — per U1, a visible rendering change needs a human look before it's trusted, matching this project's standing aesthetic-change discipline.
- **Rollback:** revert the merge commit. No runtime state, no migration.

# 15. Definition of Done

- [ ] `npx vitest run tests/codex/core/pixelbrain/scdl/` and the Verdict's 194-test suite — all pass.
- [ ] Golden-diff: every existing fixture compiles to byte-identical output without `--shade vri`.
- [ ] `--shade vri` produces visibly different, non-crashing output on at least one real fixture with relief data.
- [ ] Multi-frame naming convention holds for VRI output.
- [ ] A throwing `compileVRI` reports a compile error naming the frame, never a silent fallback or crash.
- [ ] Phase 3's real-asset eyes-on check performed and recorded (not just "tests passed").
- [ ] §6's escalation answered (schema-registration sequencing) before merge.
- [ ] This PDR committed with its bytecode search code; PIR filename reserved (§18).

# 16. Final Architectural Verdict

**Complete with acceptable risk, within its stated scope.**

This is about as low-risk as "architectural" gets: the composition being exposed (`compileAsset()`) is already tested by 194 passing tests per the Verdict, and every piece this PDR touches was found, not invented — `encodePng` already exists, `renderVRI()` already returns exactly the shape needed, the `--shade` flag pattern already exists for `material`. The real risk is entirely U1 (§5.2): whether VRI's output looks *good* on real assets, which no amount of test-passing can answer — that's why Phase 3 is a merge gate, not a formality.

# 17. References

- `VERDICT-2026-09-03-VIXEL-SYSTEM.md` — the audit this PDR directly acts on.
- `docs/superpowers/specs/2026-09-03-vri-scdl-wiring-design.md` — the brainstorming design doc this PDR formalizes.
- `codex/core/pixelbrain/asset-pipeline.js:28-37,92-99,195-242` — `compileAsset()`, the composition this PDR exposes.
- `codex/core/pixelbrain/vixel/vri-renderer.js:395-398` — `renderVRI()`'s raw-RGBA-at-final-scale output shape.
- `codex/core/pixelbrain/scdl/scdl.exporters.js:94,101,119,359,378-380` — the existing `--shade material` precedent and `encodePng`.
- `codex/core/pixelbrain/scdl/scdl.cli.js:169,260,396-397` — the CLI's existing shade-flag parsing and help text.
- `docs/scholomance-encyclopedia/PDR-archive/2026-09-03-scdl-amp-bridging-pdr.md` — same-session precedent for house PDR format and the Codex/Gemini ownership split on `codex/core/`.
- `docs/scholomance-encyclopedia/Scholomance LAW/VAELRIX_LAW.md` — domain map, escalation format, determinism law.

# 18. Post-Implementation Report Handoff

Required PIR: `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260903-VRI-SCDL-WIRING.md`

The PIR must record:
- Golden-diff result across the full fixture corpus (byte-identical count / total) for output without `--shade vri`.
- The Verdict's 194-test suite result after the `strict` default change (must stay 194/194, or name what changed and why).
- Phase 3's real-asset comparison — which asset, what was observed, whether it shipped as-is or needed a follow-up.
- §6's escalation resolution (schema-registration sequencing).
- Whether `--shade vri`'s output was judged an improvement, a regression, or merely different on the asset(s) checked — this is the PDR's one real open empirical question, and the PIR is where it gets answered with evidence instead of assumed.

A PDR that ships without this PIR is incomplete.
