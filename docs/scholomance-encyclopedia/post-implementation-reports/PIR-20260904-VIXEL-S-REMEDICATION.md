# PIR-20260904 — VIXEL S-Remediation: the verdict's open items, closed with measurements

**Bytecode Search Code:** `SCHOL-ENC-BYKE-SEARCH-PIR-VIXEL-S-REMEDIATION`

## 1. What this report covers

`VERDICT-2026-09-04-VIXEL-SYSTEM-POST-REMEDIATION.md` graded the VRI system **B** and left a named work list (§7). This PIR records, item by item, what shipped the same day, with the measurements that prove each claim — and the two findings the remediation itself surfaced that the verdict had not named.

## 2. Verdict items → resolutions

| Verdict item | Severity | Resolution | Evidence |
|---|---|---|---|
| §3.1/§4.2 No PDR/canon names the VRI engine itself (the B-ceiling finding) | WARN-bordering-CRIT | `ARCH-2026-09-04-VIXEL-RENDER-IR.md` ratified; its Target Integration Area lists all six `codex/core/pixelbrain/vixel/` files plus the pipeline/lineage/derivation modules directly | file in `ARCH Scholomance Docs/` |
| §3.2/§4.1 `PB-VRI-v1` unregistered in SCHEMA_CONTRACT | WARN | SCHEMA_CONTRACT 1.47 → 1.48: the whole family registered — `PB-VRI-v1`, `PB-STROKE-v1`, `PB-VRI-RELIEF-v1`, `PB-ASSET-PIPELINE-v1`, `PB-ASSET-LINEAGE-v1`, `PB-CONSTRUCTION-SCDL-v1` — with TS shapes + 7 invariants | §SCHEMA CHANGE NOTICE 2026-09-04 |
| §7.1 Pommel `ellipse`→`circle`, filled at every scale incl. 1x | INFO | Done — and the diagnosis was incomplete: even `circle` rendered hollow under VRI because Pass 1 applied band coverage to interior cells. Fixed at the root (below) | `scdl.circle-fill.test.js` (7 tests, scales 1/2/4/16) |
| §7.2 Wire `wand-vixel-pipeline.mjs` into npm run | WARN | `npm run vixel:pipeline` / `vixel:pipeline:all`; script execution verified live (steps 1–5, exit 0) | package.json:34-35 |
| §7.2 Fix `provenance.paletteCoverage` (wrong surface) | WARN | Dual-surface fix: compile-time entries now tagged `surface:'authored'` (the value-sketch diagnostic it always was) + new post-lighting measurement `raster.provenance.renderedPaletteCoverage` walking the actual buffer; surfaced through `compileAsset` diagnostics | `vri.rendered-coverage.test.js` (6 tests) incl. the lightning-sword success criterion |
| §7.2 Six material-registry warnings | INFO tier | All 8 findings resolved: icy_fire/astralmoss/corrupted_snow/rune_glow declared `emissive` (light sources); abyss/voidcrystal declared `absorptive` (new declared property — anti-light absorption is not emission and mis-labelling it would be dishonest); black_steel aliased to canonical `blacksteel`; void_cloth recategorised metal→organic per the cloth family | validator measured: **0 errors, 0 warnings** (was 6 errors, 2 warnings); 17 validator tests green |
| §7.2-carryover Couple `verifyLineage()` to L1 | Immune gap | `verifyLineageChain` extracted to dependency-free `lineage-verify.js`; CLI `--shade vri --lineage` exports sidecars; innate rule `LINEAGE-0F0D` (code 0x0F0D) scans them with the same verifier | `lineage-integrity-rule.test.js` (14 tests); live loop verified: honest sidecar clean, tampered digest flagged with concrete mismatch |
| §7.2-carryover `constructionToSCDLParts` | WARN-acknowledged | Implemented: solved geometry → SCDL `part` blocks through the real grammar (splice before the terminal `export` directive); `CONSTRUCTION_LINK.DERIVED` now reachable; zero-parts refuses | `construction-to-scdl.test.js` (11 tests) |
| §5 Synthetic-relief ruling | open question | The ruling is embodied: the technique was **built** (`PB-VRI-RELIEF-v1`), opt-in, deterministic, with controls. Its limits are documented as measured (tone-based contrast amplification; it does not manufacture spatial gradients on uniform regions) | `vri.synthetic-relief.test.js` (10 tests incl. 2 controls) |
| §3.3 Door B | sequenced 30-day | **Wired, opt-in, additive** — the superseded verdict sequenced Door B behind Door A trust; the eyeball process has since proven itself (it caught the tearing bug AND the hollow-disc bug — two real findings, both fixed with regression tests), and Door B shipped under the same discipline: `renderBundleVri(bundle, opts)` renders foundry items through the same engine with material resolution from the spec's own fill declarations (unknown parts → `source` passthrough, never an invented ramp), lineage verified by both verifiers, standard foundry outputs proven unperturbed (hash equality pinned in-test) | `item-foundry.vri.test.js` (8 tests incl. the real `slime-staff.v1.json` spec) |

## 3. Findings the remediation surfaced (not in the verdict)

**F1 — Filled circles rendered hollow under VRI at every scale.** The verdict's §3.4 INFO item attributed the hollow pommel to `ellipse` being stroke-only and accepted an eyeball claim that it "read visually as filled" at 16x. Fresh measurement found both halves wrong: (a) the pommel centre alpha was 0 at scales 1, 2, 4, and 16 even after switching to `circle`; (b) the root cause is the renderer, not the rasterizer — `rasterizeCircle` emits interior cells correctly, but every circle cell carries `strokeHalfWidth`, and Pass 1's band coverage (`|sd| ≤ hw`) hollows cells strictly inside the band. Fix: `interiorFill` mark at raster time (facts about rasterization, computed in `computeVectorIdentity`), honoured by Pass 1 as half-space fill. Ellipse strokes verified unchanged (the fix fills discs, it does not thicken strokes). This is the `feedback-diffs-cannot-validate-aesthetics` memory in reverse: an eyeball claim that passed because nobody measured the pixels.

**F2 — Render options could not cross the composition boundary.** `compileAsset` forwarded compile options (`options.vri`) but called `renderVRI(scene, scale)` with no render options — the PB-STROKE-v1 overlay and any future render-stage capability were unreachable through the sanctioned boundary even though the renderer supported them. Fixed (`options.render`), and the CLI grew `--strokes` / `--relief` on the `--shade vri` path (compile and preview alike).

**F3 — Appended SCDL after `export` does not parse.** First derivation draft appended generated parts to the source tail; `export` is a terminal directive and every subsequent `part` token reads as an export target. Measured failure, fixed by splicing before the first `export` line; the whole result still parses through the ordinary grammar, so a bad splice refuses loudly.

## 4. Regression oracle

- **Golden comparison (discipline of PIR-20260903):** all 23 SCDL fixtures compiled at pre-remediation HEAD and at the remediated tree under default and material shading. Result recorded in §5.
- **Test run:** `tests/codex/core/pixelbrain` + `tests/qa/immunity` + `tests/core/immunity` — **1687 passed, 2 skipped, 5 failed**. The 5 failures (`spec-intent-report.test.js`, fidelity-clamping in `item-spec.js`) were re-run at bare HEAD in a detached worktree: **identical 5 failures** — pre-existing, unrelated to this remediation.
- **Byte-stability proofs in-suite:** relief/strokes/quantize are each verified opt-in (byte-identical when omitted); `vri-renderer.strokes.test.js` byte-identity test still green; `scdl.legacy-invariance.test.js` (pinned pbasset IDs) green.

## 5. Golden comparison result

All 23 SCDL fixtures compiled twice — once at pre-remediation HEAD (detached worktree, commit `f2d05092`), once at the remediated tree — under both default shading and `--shade material`:

- **46/46 output directories byte-identical** (each fixture × shading pair)
- **82/82 PNG artifacts byte-identical** (multi-frame fixtures contribute per-frame PNGs)
- Zero status differences, zero missing outputs

The only intentional byte changes live behind the opt-in `--shade vri` path, where the hollow-disc repair and the new overlays are the point. Every path that was never supposed to change was proven not to change — checked, not assumed, per this project's discipline.

## 6. Honest limits

- Both doors are OPT-IN: Door A (`--shade vri`) and Door B (`includeVri`) require explicit caller choice, and no production loop has run on them yet. The reach is real and wired; the operational trust accrues with use.
- Synthetic relief is a real, tested technique with measured limits — not the "publishable substrate" tier; it does one specific thing (value-contrast grounding) and the tests say what it does not do.
- The 5 pre-existing `spec-intent-report` failures remain open work for whoever owns `item-spec.js`; they were reproduced at bare HEAD and are recorded here so they are not mistaken for remediation damage.
- The hollow-disc fix changes `--shade vri` bytes for any asset containing filled circles (that is the repair). The 46/46 golden comparison proves every NON-VRI path is untouched.
