# VERDICT-2026-09-04-VIXEL-SYSTEM-POST-REMEDIATION

> **Superseded same-day, 2026-09-04.** The full S-remediation shipped hours after this render: every open item in §7 resolved (canon entry ratified, schema registered, pommel root-caused deeper than diagnosed, synthetic relief built for real, lineage coupled to Layer-1 immunity, construction derivation implemented, material registry cleaned to 0/0, Door B wired opt-in with golden-byte discipline), recorded in `PIR-20260904-VIXEL-S-REMEDICATION.md`. Per the Temporal Re-Render Rule's Premature Re-Render Triggers ("a material remediation from the prior verdict ships"), this verdict is superseded by [`VERDICT-2026-09-04-VIXEL-SYSTEM-S-REMEDIATION.md`](./VERDICT-2026-09-04-VIXEL-SYSTEM-S-REMEDIATION.md). This document is preserved unmodified below as the temporal record of how the architecture was judged before that remediation.

---

# VERDICT-2026-09-04-VIXEL-SYSTEM-POST-REMEDIATION (temporal record)

> **Supersedes same-week.** Commit `f2d05092` (2026-09-03/04) wired VRI into the SCDL CLI as an opt-in `--shade vri` value, and a separate commit `2c92a5d5` ruled and shipped `compileAsset`'s `strict: true` default. Per the Temporal Re-Render Rule's Premature Re-Render Triggers ("a material remediation from the prior verdict ships"), this verdict supersedes [`VERDICT-2026-09-03-VIXEL-SYSTEM.md`](./VERDICT-2026-09-03-VIXEL-SYSTEM.md), which is preserved unmodified as the temporal record of how the architecture was judged before this remediation. **Grade does not move** — see §1.

## Bytecode Search Code
`SCHOL-ENC-BYKE-SEARCH-VERDICT-VIXEL-SYSTEM-POST-REMEDIATION`

## Verdict Identity

| Field | Value |
|---|---|
| Target | Same as superseded verdict: `codex/core/pixelbrain/vixel/` (`index.js`, `vri-compiler.js`, `vri-renderer.js`, `vri-schema.js`), plus `codex/core/pixelbrain/asset-pipeline.js` (`compileAsset()`), `codex/core/pixelbrain/compile-asset.js`, `codex/core/pixelbrain/material-validator.js`. Newly in scope: `codex/core/pixelbrain/scdl/scdl.cli.js` (the new `--shade vri` call site) and `codex/core/pixelbrain/scdl/scdl.exporters.js` (now exports `encodePng`). Secondary target `scripts/wand-vixel-pipeline.mjs` carries over unchanged. |
| Target Status | **IMPLEMENTED, UNRATIFIED, PARTIALLY WIRED.** Still no `ARCH-*` canon entry and no PDR names `codex/core/pixelbrain/vixel/` in its own Target Integration Area — see §3.1. A PDR now exists for the *reachability* layer only (`docs/scholomance-encyclopedia/PDR-archive/2026-09-03-vri-scdl-wiring-pdr.md`), which explicitly scopes VRI internals out of its own coverage. |
| Auditor(s) | `claude` — this session, same jurisdictional note as the superseded verdict: engine code under `codex/core/pixelbrain/`, filed under the Scholomance-Verdicts charter's "implemented features" scope. |
| Date Rendered | 2026-09-04 |
| Supersedes | `VERDICT-2026-09-03-VIXEL-SYSTEM.md` (now `[SUPERSEDED]`) |
| Re-Render Due | **2026-12-04** (3 months — still Experimental / pre-Phase-2: the capping law-violation finding is unresolved and Door B remains untouched) |
| Audit Frame | VAELRIX_LAW (Global Law + Law 3, Law 13) + ByteCode Error System + **fresh empirical measurement this session**: direct grep of both production doors, a live `vitest run` (217/217 passing across 10 files, measured 2026-09-04), git-log verification of the `strict: true` ruling commit, source inspection of the `ellipse`/`circle` rasterizer distinction, and a rendered visual check of `lightning-sword.scdl --shade vri` at 16x. Historical claims not re-verified this session (the additive-lighting fix's original measurements) are carried from the superseded verdict, itself corroborated against still-green tests. |
| Verdict Class | SINGLE-AUDITOR |
| Status | RENDERED |

---

## 1. Scoring Sigil

```
        ┌────────────────────────────────────────────────────────────┐
        │   VIXEL / VRI SYSTEM — RE-RENDER — 2026-09-04               │
        └────────────────────────────────────────────────────────────┘
```

### Drift Note

Since the superseded verdict's render (2026-09-03), two commits landed:

1. **`2c92a5d5` — `strict: true` threaded and defaulted in `compileAsset()`.** Resolves the superseded verdict's Concern §3 WARN item (a): "Whether `strict: true` should be `compileAsset`'s default — asked, never answered." It is now answered and shipped, backed by three new tests (`asset-pipeline.strict.test.js`) covering the default refusal, the explicit opt-out, and VRI-render-exception containment.
2. **`f2d05092` — VRI wired into the SCDL CLI as `--shade vri`.** `scdl.cli.js` now imports and calls `compileAsset()` directly (confirmed by grep this session: `codex/core/pixelbrain/scdl/scdl.cli.js:25`). This is the first production door — of the two named in the superseded verdict (Door A: `scdl/`, Door B: `item-foundry.js`) — to import this engine at all. It is opt-in (must pass `--shade vri` explicitly), PNG-export-only, frame-scoped-failure-contained, and ships with a design doc, PDR, and PIR recording real-asset visual QA (`docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260903-VRI-SCDL-WIRING.md`, §6: two real assets — `lightning_scimitar.scdl`, `photo_1_lit.scdl` — rendered default vs. VRI and eyeballed, honestly judged "merely different, not universally better," not inflated to a win).

**One claim from the superseded verdict does not survive fresh verification.** Its §2 Innovation praise stated the synthetic-relief technique for hand-drawn cell art was "shipped, tested, and currently unused outside their own test suites." This session grepped the tracked tree for it (`syntheticRelief`, `synthetic-relief`, the rank-along-key-light-direction technique) and found **zero implementation code anywhere** — only the word "synthetic" appearing in an unrelated test fixture name. The new wiring design doc itself confirms this independently: it explicitly defers the technique "because zero code for it exists anywhere in the tree despite being described in a prior session's notes." Whatever was built in the 2026-07-29/08-30 session record was never committed. This is corrected in §2.5 and reflected in the Innovation Rating below — it is exactly the `citation-with-nothing-behind-it` class this project's own Recursive Bug Elimination tables already name (see [`VERDICT-2026-08-27-VAELRIX-FORCEFIELD-BRAIN-NETWORK-POST-REMEDIATION.md`](./VERDICT-2026-08-27-VAELRIX-FORCEFIELD-BRAIN-NETWORK-POST-REMEDIATION.md)'s §6), now with a second instance in a second, independently-built system.

Verified independently this session: `npx vitest run tests/codex/core/pixelbrain/vixel/ tests/codex/core/pixelbrain/asset-pipeline.test.js tests/codex/core/pixelbrain/compile-asset.test.js tests/codex/core/pixelbrain/material-validator.test.js tests/codex/core/pixelbrain/asset-pipeline.strict.test.js tests/codex/core/pixelbrain/scdl/scdl.cli.vri-shade.test.js` — **217/217 passing**, 10 files, 2026-09-04 (up from 194/194 in the superseded verdict, the delta being the new strict and CLI-shade suites).

### Scores

| Metric | Prior | Now | One-line Justification |
|---|---|---|---|
| **Impact Score** | 5/10 | **6/10** ▲ | One of two named production doors (the SCDL CLI) now imports and can invoke this engine — confirmed by grep, not assumed. Still opt-in, still human-typed per invocation, still zero automated/Door-B reach, so this is a real but partial reachability gain, not the "zero consumers" state scored before |
| **Revenue Potential** | 4/10 | **4/10** — | Unchanged. The PIR's own real-asset visual QA (§6) judged VRI output on `lightning_scimitar` and `photo_1_lit` as "merely different, not universally better" — realized revenue impact is still $0, and the honest visual verdict tempers how much upside the wiring alone unlocks even if extended further |
| **Architecture Risk** | 4/10 | **4/10** — | The superseded verdict predicted risk would rise "the moment it is wired into either production door" because brightness/hue changes need eyeballing, not diffing. That happened, and it was done with discipline: 46/46 byte-identical golden comparisons for the *unaffected* default/material paths, plus real-asset visual inspection for the new path, both recorded in the PIR before shipping. Risk stayed low because the rollout behaved exactly as the prior verdict said a low-risk rollout should |
| **UX Friction** | 3/10 | **3/10** — | Still undefined rather than low for an ordinary asset author — reaching this system still requires knowing the exact `--shade vri` flag exists, which no discovery path surfaces yet |
| **Law Violations** | 5/10 | **4/10** ▼(better) | The WARN item (`PB-VRI-v1` unregistered in `SCHEMA_CONTRACT.md`) is unchanged in substance but is now explicitly tracked as a sequenced follow-up in two independent documents (design spec §4, PIR §7) rather than left to be rediscovered — a process improvement, not a resolution. The WARN-bordering-CRIT item (no PDR/`ARCH-*` canon for the engine itself) is **unresolved**: the new PDR explicitly excludes `codex/core/pixelbrain/vixel/` from its own Target Integration Area ("VRI itself is correct per the Verdict; this PDR is reachability only") |
| **Immune Potential** | 4/10 | **4/10** — | Unchanged. `verifyLineage()` still has zero L1 (Innate) consumers; confirmed by grep this session (`codex/core/immunity/` contains no reference to it) |
| **Innovation Rating** | 7/10 | **5/10** ▼(worse) | The additive-lighting root-cause fix remains real, re-verified this session, and still the strongest evidence in this system's favor. The synthetic-relief claim does not survive verification — see Drift Note above. Scoring the surviving technique alone, without the unverifiable second one, this lands at 5, not 7 |

### Verdict Grade: **B** (unchanged)

**Capping logic applied — unchanged from the superseded verdict:**

- No FATAL law violation present → no cap to D.
- The PDR-absence finding for the engine itself is still WARN-bordering-CRIT, not resolved by the wiring PDR's own explicit scope exclusion → the B-ceiling from the superseded verdict is **not lifted**. Contrast with `VERDICT-2026-08-27-VAELRIX-FORCEFIELD-BRAIN-NETWORK-POST-REMEDIATION.md`, where an equivalent finding *was* resolved because that system's retroactive PDR named the audited system directly; this system's new PDR does the opposite by design.
- Architecture Risk (4/10) stays below the ≥ 7 threshold that would cap at C.
- Innovation Rating fell (7→5) rather than rose, removing one of the two levers that could have argued for A even with the canon gap still open.
- Net: **B, unchanged.** Real, verified, incremental progress on two of the superseded verdict's three named re-render triggers (§8) — but the specific finding that set the ceiling did not move, and one piece of the evidentiary basis for the prior score turned out not to hold up.

---

## 2. Validated Praise

§2 P1–P7 of the superseded verdict (root-caused additive-lighting fix, the controlled quantize-on/off eyeball method, the two follow-on missing-z bugs caught and named as a recurring class, the material-validator's deliberate false-positive guard, `verifyLineage`'s self-caught frame-dropping bug, honored baseline discipline, and the fresh 194/194 test run) **all still stand** — each was re-checked against currently-tracked code this session (still present, tests still green) except where explicitly corrected below. Not repeated in full here.

**Correction to the superseded verdict's Innovation praise (its closing P-list sentence, "Both are shipped, tested, and currently unused outside their own test suites"):** only the additive-lighting fix meets that bar. The synthetic-relief technique does not — see Drift Note above. This is not a new deficiency in the target system; it is a correction to what the *audit* claimed about the target system, and is recorded here rather than silently dropped, per this project's own stated discipline against exactly this failure mode.

**P8 — `strict: true` was ruled and shipped with the harder default, not the convenient one.** `2c92a5d5` makes `compileAsset()` refuse an unresolvable material by default instead of silently falling back to `'source'` — the exact SCDL-005 class the superseded verdict flagged as reintroducible while this stayed unruled. Backed by three tests, including one that verifies a real fixture (`crimson-ooze-sphere.scdl`) is refused, not just that a flag toggles a boolean.

**P9 — The wiring shipped with a real regression oracle, not just new-code tests.** The PIR (§5) records all 23 SCDL fixtures compiled twice — once at pre-PDR HEAD, once at the new implementation — under both default shading and `--shade material`, in a detached-HEAD comparison: 46/46 byte-identical. This is direct evidence the new opt-in path did not silently perturb the paths it was never supposed to touch, checked rather than assumed.

**P10 — The visual QA was honest about the result being unimpressive, not inflated to sell the feature.** PIR §6's own judgment — "merely different, not universally better," dark-material value compression named as the principal remaining risk — is exactly the kind of unflattering, specific finding this project's `feedback-diffs-cannot-validate-aesthetics` memory asks auditors to look for and *not* paper over. Whoever wrote that PIR did not grade their own homework kindly.

---

## 3. Architectural Concerns

Ranked by severity. Concerns from the superseded verdict not listed here (paletteCoverage measuring the wrong surface, `constructionToSCDLParts` absence) are unchanged and carry forward without re-verification this session.

### 3.1 [`WARN-bordering-CRIT`, unresolved] No PDR or `ARCH-*` canon entry specifies the VRI engine itself

Carried forward from the superseded verdict, **not resolved**. The new PDR (`2026-09-03-vri-scdl-wiring-pdr.md`) states its own scope exclusion plainly: "**Not modified:** ... anything under `codex/core/pixelbrain/vixel/` (VRI itself is correct per the Verdict; this PDR is reachability only)." A PDR that cites a Verdict as its authority for VRI's correctness, instead of being the canon document a future Verdict could cite, is not the same artifact the superseded verdict's remediation table asked for. The wiring is real and well-documented; the engine it wires to is still unratified.

### 3.2 [`WARN`, tracked-not-resolved] `PB-VRI-v1` still unregistered in `SCHEMA_CONTRACT.md`

Confirmed by grep this session (`docs/scholomance-encyclopedia/Scholomance LAW/SCHEMA_CONTRACT.md` contains no "vixel" or "vri" in any casing). Unlike the superseded verdict's finding, this is now an explicitly sequenced, named follow-up in two independent documents rather than a silent gap — see Law Violations §4.1.

### 3.3 [`WARN`, unchanged] Door B (`item-foundry.js`) and the standalone `wand-vixel-pipeline.mjs` script remain exactly as unreachable as before

Confirmed by grep this session: zero references to `asset-pipeline.js`/`compile-asset.js`/`vixel/` anywhere in `item-foundry.js`. `grep -n "wand-vixel" package.json` still returns nothing. Both are deliberate — the wiring PDR explicitly scoped Door B out, matching the superseded verdict's own recommendation to pick the smaller-blast-radius door first — but "deliberate" and "resolved" are different things, and this item is still open.

### 3.4 [`INFO`, corrected] The pommel "hollow ring" finding is real in the source but was misjudged by this session's own first look

The superseded verdict's §3 INFO item claims `lightning-sword.scdl`'s pommel (`ellipse 8 30 radius 2 ry 1`) is "a hollow 19-cell ring with no centre" because `ellipse` is outline-only. Source inspection this session confirms the underlying claim is still accurate: `raster-core.js:140-147` documents in its own comment that "the ellipse rasterizer is a STROKE... it does NOT fill the interior," distinct from `circle`, which fills. The pommel op in `lightning-sword.scdl` is unchanged — still `ellipse`, not `circle`. However, when this session rendered the asset at 16x with `--shade vri` earlier in this conversation, the pommel read visually as filled, and was reported that way without checking the source first. At `radius 2 ry 1`, the stroke's half-width (0.5, per the same comment) consumes a large fraction of the shape's total radius, so the "hole" is real in the data but close to sub-pixel at render time — a visibility artifact of this specific small shape, not evidence the underlying bug is fixed. Recorded here as a correction to this session's own earlier claim, not the target's.

---

## 4. Law Violations

### 4.1 [`WARN`, unresolved but now sequenced] `vri-schema.js`'s `PB-VRI-v1` still has no `SCHEMA_CONTRACT.md` entry

Unchanged in substance from the superseded verdict — confirmed absent again this session. What changed: the design spec (`2026-09-03-vri-scdl-wiring-design.md §4`) and the PIR (`§7, Escalation Resolution`) both name this gap explicitly and record the sequencing decision ("ship the opt-in reachability slice independently, while `PB-VRI-v1` registration ... remains a separate follow-up") rather than leaving it undiscussed. Still scored WARN, same reasoning as the superseded verdict: procedural gap, not adversarial parallel-schema creation.

### 4.2 [`WARN-bordering-CRIT`, unresolved] No PDR/canon names the VRI engine itself

Unchanged. See §3.1. This is the finding holding the grade at B; unlike the FORCEFIELD/Brain-Network precedent this project has already set for resolving the identical finding shape, the artifact that would resolve it (an engine-scoped PDR or `ARCH-*` entry) has not been filed — a related-but-narrower artifact was.

No FATAL violation found. No determinism violation found — `verifyLineage()`'s checksum chain remains direct evidence of Law 6 compliance within this system's own boundary.

---

## 5. Admonishment of the Arbiter

The superseded verdict named two unanswered questions and asked for both to be ruled on. One was: cheaply, cleanly, with the harder default chosen over the convenient one, and backed by tests that prove the refusal actually fires on a real fixture. That is exactly the response this project's own culture should want, and it happened within a day.

The other question — synthetic-relief adoption — was not ruled on. It was, more honestly than before, named as *not yet buildable from what exists*, because what the record claimed existed does not. That is a better outcome than another month of silence, but it surfaces a harder problem than the one originally posed: the question was never "adopt or don't," it was "adopt or don't a thing that was never actually committed." Vaelrix, the next time a session's own notes claim a technique is "shipped," that claim is now demonstrably not self-verifying — this Verdict found it false by grep, not by asking. The standing instruction this project already has ([[feedback-verify-dead-code-and-denominators-before-reporting]] in this auditor's own memory) exists for exactly this shape of failure, and it caught this one. It should catch the next one before a Verdict has to.

The reachability gap is smaller now than it was — one door open, opt-in, well-tested, honestly eyeballed. But the pattern this project's Verdicts keep finding — real engineering, no canon, a claim that turns out thinner than it sounded — showed up a third time this week, across a second independently-built system, in the same session that was supposed to be checking for it. That is worth sitting with, not because the wiring work was bad — it was well-executed and disciplined — but because the audit trail that is supposed to catch this pattern almost repeated it instead of catching it.

---

## 6. Recursive Bug Elimination

Carries forward the superseded verdict's two named classes (missing-z, unbounded-composition-clipping) unchanged — neither was touched by this remediation pass. One addition:

**Citation with nothing behind it, second instance.** `VERDICT-2026-08-27-VAELRIX-FORCEFIELD-BRAIN-NETWORK-POST-REMEDIATION.md`'s own Recursive Bug Elimination table already named this class once (a fix demonstrated on 2-of-13 cases, at risk of being treated as fixed for all 13). This Verdict finds a second, distinct instance: a technique described in session notes as built and validated, carried forward into a formal Verdict's Innovation praise, that a plain repo grep shows was never committed. **Defense status: caught, this time, by the next audit rather than by the original one.** Any future Verdict citing a prior session's account of "built and validated" work should grep for the claimed artifact before repeating the claim, not after.

---

## 7. Remediation Tiers

Carries forward the superseded verdict's 7.2/7.3/7.4 items not listed below unchanged (register `PB-VRI-v1`, resolve the 6 material-registry warnings, fix the pommel `ellipse`→`circle`, wire `wand-vixel-pipeline.mjs` into `npm run`, couple `verifyLineage()` to L1, `constructionToSCDLParts`).

### 7.1 Immediate — updated

| Action | Owner | Severity | Cost | Reversibility | Success Criterion |
|---|---|---|---|---|---|
| ~~Rule on `strict: true` as `compileAsset`'s default~~ | `Angel` | — | — | — | **DONE** — `2c92a5d5`, default `true`, 3 tests |
| ~~Wire VRI into one production door, opt-in~~ | `codex`/`gemini` | — | — | — | **DONE** — `f2d05092`, SCDL CLI `--shade vri`, PDR+PIR+regression+visual-QA on record |
| Author a PDR or `ARCH-*` entry that names `codex/core/pixelbrain/vixel/` **directly in its own Target Integration Area** — not as a forward reference, and not scoped out the way the wiring PDR scoped it out | `Angel` + `codex` | WARN-bordering-CRIT | 3 agent-hours | cheap | PDR exists, names VRI's own files, states the synthetic-relief question as unbuildable-as-claimed rather than merely undecided |
| Fix `lightning-sword.scdl`'s pommel (`ellipse` → `circle`) | `claude` or `gemini` | INFO | 15 minutes | cheap | Pommel renders filled at every scale, including 1x; re-approved at all 4 golden-byte scales |

### 7.2 30 Day — unchanged from superseded verdict, not addressed this pass

Register `PB-VRI-v1`; wire `wand-vixel-pipeline.mjs` into `npm run`; fix `provenance.paletteCoverage`; resolve the 6 material-registry warnings; extend VRI to a second production door only after the first door's rollout has run long enough to trust the eyeball-review process.

---

## 8. Final Verdict

**Grade: B (unchanged).** Real, verified progress against two of the superseded verdict's three named re-render triggers — a production door is wired (opt-in, tested, honestly QA'd) and one of two open decisions was ruled on with the harder default. Neither trigger fully delivers what it promised: the wiring reaches one door, manually, not the pipeline at large, and the ruling that landed is the cheap one — the technique that would have required an actual adoption decision turned out not to exist yet to decide on.

What holds this at B, unchanged, is the same finding that held the superseded verdict there: no canon names this engine. A PDR was filed this week, and it is a genuinely good PDR for what it covers — but what it covers is reachability, and it says so itself. The gap the superseded verdict called CRIT-bordering is still open, just adjacent to a new, real, well-executed piece of work instead of standing alone.

What is new, and worth stating plainly: one of the two claims this Verdict's own predecessor made about the target system's Innovation did not survive a grep. That is not a reason to distrust the fix that does survive — the additive-lighting root-cause work is corroborated twice now, by 194 tests then and 217 tests today. It is a reason to trust claims less than measurements, including this project's own prior claims about itself, which is the discipline this Verdict is choosing to apply to its own lineage rather than only to the code.

Validated praise stands, with one correction. Concerns: one resolved (`strict` default), one downgraded from silent to sequenced (schema registration), two unchanged (canon, Door B/script reachability), one corrected (pommel — still broken, previously misjudged as fixed by this session's own first look). Admonishment stands, sharpened. This Verdict will be **re-rendered** when:

- A PDR or `ARCH-*` entry names `codex/core/pixelbrain/vixel/` in its own right (expected: ceiling lifts toward A)
- `PB-VRI-v1` is registered in `SCHEMA_CONTRACT.md` (expected: Law Violations re-scored to 0)
- Door B (`item-foundry.js`) gains any reference to this pipeline, even behind a flag (expected: Impact Score and Revenue Potential re-scored upward)

Until then: one door open, one decision ruled, one claim corrected, one grade held.

---

*The Scholomance is alive. The verdict is rendered.*

*— `claude`, 2026-09-04*

*Verdict Status: RE-RENDERED | Supersedes: VERDICT-2026-09-03-VIXEL-SYSTEM.md | Re-Render Due: 2026-12-04*

*Premature Re-Render Triggers: engine-scoped PDR/ARCH-* entry filed · PB-VRI-v1 registered · Door B gains any reference*

---

## Postscript — Immune System Coupling

This Verdict is itself subject to the Verdict-class pathogen seed list in `Scholomance-Verdicts/README.md`:

- **`pathogen.praise-without-concerns`** — does not apply (§2 = 3 carried + 2 new items with one explicit correction; §3 = 4 concerns, ranked, 1 corrected not resolved)
- **`pathogen.all-CRIT-severity-flatness`** — does not apply (severity ladder used: 1 WARN-bordering-CRIT unresolved, 2 WARN, 1 INFO)
- **`pathogen.relative-grading-citation`** — does not apply (grading anchored to the same Grade Phenotypes as the superseded verdict; comparison to it is explicit drift tracking per the Temporal Re-Render Rule)
- **`pathogen.empty-tier-without-justification`** — does not apply (Immediate and 30-Day tiers both populated; 90-Day/Long-Term carried forward by explicit reference, not silently dropped)
- **`pathogen.single-auditor-on-cross-jurisdictional`** — does not apply (target is a single JS codebase under `codex/core/pixelbrain/`)
- **`pathogen.citation-with-nothing-behind-it`** — **caught in this pass, against the superseded verdict's own Innovation praise** (Drift Note, §2, §6). Recorded here as evidence the check ran, not just as a finding about the target.

The recursive loop is closed.
