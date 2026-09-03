# VERDICT-2026-09-03-VIXEL-SYSTEM

## Bytecode Search Code
`SCHOL-ENC-BYKE-SEARCH-VERDICT-VIXEL-SYSTEM`

## Verdict Identity

| Field | Value |
|---|---|
| Target | `codex/core/pixelbrain/vixel/` (`index.js`, `vri-compiler.js`, `vri-renderer.js`, `vri-schema.js` — the VRI render-IR engine), plus its direct dependents `codex/core/pixelbrain/asset-pipeline.js` (`compileAsset()` — the construction → SCDL → genes → VRI → raster composition boundary), `codex/core/pixelbrain/compile-asset.js`, and `codex/core/pixelbrain/material-validator.js`. Secondary target: `scripts/wand-vixel-pipeline.mjs`, the only script in the repository that drives this pipeline end to end today. |
| Target Status | **IMPLEMENTED, UNRATIFIED, UNWIRED.** No `ARCH-*` canon entry exists for this system anywhere in `docs/scholomance-encyclopedia/`, and no PDR is written *for* it — two adjacent PDRs (`2026-07-25-geometric-construction-solver-pdr.md`, `2026-07-25-ontological-art-direction-pipeline-pdr[-revised].md`) mention "vixel"/"VRI" 1, 6, and 4 times respectively, always as a downstream consumer reference, never naming `codex/core/pixelbrain/vixel/` in their own Target Integration Area or Architecture / File Map. This audit is filed under the Scholomance-Verdicts charter's "implemented features" clause, not as a ratified-canon review — there is no canon to review yet. |
| Auditor(s) | `claude` — this session, operating outside the MUD's `CLAUDE.md` UI-only jurisdiction. The target is engine/renderer code under `codex/core/pixelbrain/`, not a `src/pages/` UI surface; filed under the Scholomance-Verdicts charter's broader "implemented features" scope, consistent with the precedent set in `VERDICT-2026-08-27-VAELRIX-FORCEFIELD-BRAIN-NETWORK.md` for the same jurisdictional situation. |
| Date Rendered | 2026-09-03 |
| Re-Render Due | **2026-12-03** (3 months — Experimental / pre-Phase-2 window: no canon or PDR exists, the system has zero production consumers, and two explicit design decisions have sat unanswered since the session that built the work) |
| Audit Frame | VAELRIX_LAW (Global Law + Law 3, Law 13) + ByteCode Error System + **direct empirical measurement this session**: git-tracked-file check, full dependency-graph grep across both production asset-generation doors (`item-foundry.js` and every file under `codex/core/pixelbrain/scdl/`), and a live test run (`npx vitest run tests/codex/core/pixelbrain/vixel/ tests/codex/core/pixelbrain/asset-pipeline.test.js tests/codex/core/pixelbrain/compile-asset.test.js tests/codex/core/pixelbrain/material-validator.test.js`, 194/194 passing, measured 2026-09-03). Historical claims about specific bugs found and fixed (the additive-lighting overshoot, the negated to-light vector, the synthetic-relief technique) are carried from this project's own session record of 2026-07-29 and 2026-08-30 and are corroborated, not just repeated, by this session's fresh 194/194 test-pass measurement — the fixes described are still in the code and still green today. |
| Verdict Class | SINGLE-AUDITOR (the target is engine code inside `codex/core/pixelbrain/`; it does not cross into `src/pages/`, `*.css`, or a UI surface, so the Multi-Auditor Protocol does not trigger) |
| Status | RENDERED |

---

## 1. Scoring Sigil

```
        ┌────────────────────────────────────────────────────────────┐
        │           VIXEL / VRI SYSTEM — VERDICT — 2026-09-03        │
        └────────────────────────────────────────────────────────────┘
```

| Metric | Score | Polarity | One-line Justification |
|---|---|---|---|
| **Impact Score** | **5 / 10** | ▲ | A real, tested, physically-grounded rendering-correctness engine (194/194 tests, measured live this session) that fixed a genuine bug — 50.9% of one asset's pixels rendering brighter than their own brightest authored color under unbounded additive lighting — but reaches **zero** production consumers: neither `item-foundry.js` (Door B, ~20 amp-driven asset generators) nor anything under `codex/core/pixelbrain/scdl/` (Door A, the text-DSL compiler) imports any file in this target, confirmed by direct grep this session |
| **Revenue Potential** | **4 / 10** | ▲ | The clearest realized saving would be fewer hand-tuned pixel patches on shipped assets — the flagship `void-chestplate` needed imperative post-forge fixes (`widenPauldrons`, hardcoded `#6B35B8` re-derived by eyeballing a reference image) precisely because the declarative pipeline it went through has no VRI-class lighting-correctness layer in it. That saving is theoretical today: it requires wiring, which has not happened, so realized revenue impact is currently $0 |
| **Architecture Risk** | **4 / 10** | ▼ | Low risk *as it stands* — a self-contained boundary with its own lineage/checksum discipline (`verifyLineage()`: construction checksum → packet id → scene checksum → raster digest) and zero inbound dependents outside its own tests and one unwired script. Risk rises to moderate the moment it is wired into either production door, because the lighting-model fix visibly changes brightness/hue on assets that render through it — a real, user-visible regression surface that must be eyeballed, not just diffed, per this project's own established discipline for aesthetic changes |
| **UX Friction** | **3 / 10** | ▼ | Direct friction to an asset author today is near-zero, because no author-facing path reaches this system at all. That is itself the finding, not a mitigating factor: identical in shape to `VERDICT-2026-08-27-VAELRIX-FORCEFIELD-BRAIN-NETWORK.md`'s treatment of a tool "reachable by exactly one agent in a project that names a broader intended audience" — friction is not low, it is undefined, because there is no path to be frustrated by yet |
| **Law Violations** | **5 / 10** | ▼ | One WARN-bordering-CRIT (no PDR/`ARCH-*` canon exists for a load-bearing, 194-test, physically-motivated engine — the same pattern the Brain Network verdict capped at B for), one clean WARN (`vri-schema.js` declares its own versioned schema, `PB-VRI-v1`, for a real production data shape with zero entry in `SCHEMA_CONTRACT.md` — see §4 for why this is scored WARN and not CRIT) |
| **Immune Potential** | **4 / 10** | ▲ | `asset-pipeline.js`'s `verifyLineage()` checksum chain is exactly the shape of mechanism L1 (Innate) could consume directly — tamper-evident, deterministic, already built — but nothing wires it there today. The potential is real and cheap to realize; the coupling does not exist yet |
| **Innovation Rating** | **7 / 10** | ▲ | Two genuinely novel, deterministic, non-ML techniques: (1) diagnosing that quantization was *masking* a renderer bug rather than causing one, found by a controlled eyeball test across all 16 shrine-demo assets at 3 quantize-on/off comparisons, tracing the "backgrounds improve, weapons degrade" split to per-channel clipping under unbounded additive light; (2) synthetic relief for hand-drawn flat-cell art — ranking each authored tone by its position in its own value ramp and projecting that rank onto the key light's own in-plane direction, giving art with zero vector-relief data something physically real for the lighting pass to act on, validated against a real control (a `circle` op with genuine `normal`/`signedDistance` data). Both are shipped, tested, and currently unused outside their own test suites |

### Verdict Grade: **B**

**Capping logic applied:**

- No FATAL law violation present → no automatic cap to D.
- No CRIT law violation present (the PDR-absence finding is scored WARN-bordering-CRIT, not CRIT itself — see §4) → no automatic cap to B via the CRIT-cap rule, but the finding independently earns a B ceiling on its own weight, same reasoning as the Brain Network precedent.
- Architecture Risk (4/10) is below the ≥ 7 threshold that would cap at C.
- Innovation Rating (7/10) is high but, per the Grade Phenotypes' explicit rule, "does not absolve risk" or, here, absolve the missing-canon finding — it cannot lift the grade past what the law-violation and reachability findings allow.
- Net: **B** — sound, tested, real engineering, held below A by the same two things that held the Brain Network verdict at B: no canon, and a reachability gap so complete it isn't friction, it's absence.

---

## 2. Validated Praise

**P1 — The additive-lighting bug was root-caused, not patched around.** `vri-renderer.js`'s lighting was purely additive (`buf += lightColour × contribution`, clamped at 255). At the default white key light (0.7), that adds +178/channel — measured result: 50.9% of `sword`'s pixels rendered brighter than the asset's own brightest authored color, and 17–29% of night-background pixels clipped to near-white. The fix changed light from an additive term to a multiplicative modulation of albedo, normalized against what an unsculpted, viewer-facing surface receives — so a flat cell now renders at its authored color with no flag required. This is the harder, more honest fix: it would have been easy to just re-tune the quantization ramps until the visible symptom went away, and the record shows that path was explicitly rejected once the eyeball test revealed quantization was *masking* the real bug rather than causing it (P2).

**P2 — The debugging method itself is worth recording as technique, not just the fix.** Rather than accepting "quantization looks bad on weapons" at face value, the investigation ran all 16 shrine-demo assets through quantize-off vs quantize-on, three times, and found a split: backgrounds improved under quantization while weapon sprites were wrecked (heavy Bayer dither; blue blade → grey; cyan blade → purple checkerboard). That asymmetry — not a hunch — is what led to checking whether quantization was rescuing something broken underneath it, which it was. This is the "measure the actual mechanism" discipline this codebase's own culture explicitly rewards, applied correctly under real time pressure.

**P3 — Two further bugs were caught only because the first fix exposed them, and both were named as instances of a recurring class rather than treated as isolated.** Once lighting was bounded, two more defects surfaced: the key light's to-light vector was negated (lighting surfaces facing *away* from the key — 20% of `shrine-bell`'s cells lit instead of 80%), and 2D-only surface normals meant half of every sprite received zero light regardless of geometry. The record explicitly ties the second bug to "the same missing-z class as the `sphere` op" — a named, cross-system recurring failure mode (2D authoring primitives silently losing a z-component), not a one-off. See §6.

**P4 — `material-validator.js`'s category-dominance threshold is a deliberate false-positive guard, not an oversight.** A token must be category-dominant (≥ 75%, ≥ 3 members) before the validator will accuse it of a category-coherence violation, specifically because cross-cutting traits like `void` would otherwise generate false positives against materials that legitimately span categories. This is exactly the kind of guard this project's own `project-checks-that-cannot-fail` finding says is usually missing — here it was built in from the start. 17 tests back it.

**P5 — `compileAsset()`'s lineage chain is real, checked, and was itself audited for a real gap and fixed.** `verifyLineage()` walks construction checksum → packet id → scene checksum → raster digest — real tamper-evidence, not a decorative field. Item 5b in the system's own working record shows this discipline caught its own defect: `compileAsset` was silently reading only `scdl.packet` and dropping frames 1..N of every animation loop; the fix makes the result carry all frames, with per-frame lineage and a `verifyLineage` that checks every frame, not just frame 0. 20 tests back the pipeline; a self-caught bug in a self-verification mechanism is a good sign for the mechanism, not a bad sign for the system.

**P6 — Baseline discipline was honored under real pressure to not honor it.** The working record for this system explicitly documents 15 pre-existing, unrelated test failures elsewhere in the suite (`subtlety-execute-route-sample`, `lattice-*`, `qbit-bridge`, `volume-lift-route`, `voxel-pipeline-perf`) and states they were "verified identical at HEAD in a detached worktree — not mine, do not 'fix' them as regressions." That is the correct, disciplined move — and the harder one, since folding in an unrelated "fix" would have made the diff look more complete without actually being more correct.

**P7 — Currently green, verified fresh, not just inherited from the record.** This session ran the full relevant suite independently: `tests/codex/core/pixelbrain/vixel/`, `asset-pipeline.test.js`, `compile-asset.test.js`, `material-validator.test.js` — **194/194 passing**, 2026-09-03. The historical narrative above is not being taken on faith; it is corroborated by code that still exists and still works today.

---

## 3. Architectural Concerns

Ranked by severity per the ByteCode Error System ladder.

**[CRIT-bordering] No production consumer exists on either asset-generation door.** Confirmed by direct grep this session: `codex/core/pixelbrain/item-foundry.js` and every file under `codex/core/pixelbrain/scdl/` (grammar, compiler, all ten passes, exporters, CLI) contain zero references to `asset-pipeline.js`, `compile-asset.js`, or anything under `vixel/`. The one file that *does* drive this pipeline end to end, `scripts/wand-vixel-pipeline.mjs`, produces a "structured report" (a Photonic Feel / VixelField evaluation) — diagnostic output, not a shipped raster. Every correctness gain documented in §2 is real and proven in isolation, and reaches exactly zero assets that a player, or this project's own art pipeline, will ever see.

**[CRIT-bordering] No PDR or `ARCH-*` canon entry specifies this system.** The two PDRs that mention "vixel"/"VRI" (`2026-07-25-geometric-construction-solver-pdr.md`, `2026-07-25-ontological-art-direction-pipeline-pdr[-revised].md`) do so only as forward references from an adjacent system — neither names `codex/core/pixelbrain/vixel/` in its own Target Integration Area or Architecture / File Map, confirmed by grep this session. A 194-test, physically-motivated rendering engine has been built, debugged across at least two real sessions, and left with no document an implementer or auditor could point to as its specification of record.

**[WARN] The one real consumer script is itself undiscoverable.** `scripts/wand-vixel-pipeline.mjs` is not wired into `npm run` anywhere (confirmed: `grep -n "wand-vixel" package.json` returns nothing). This is the identical discoverability failure mode the 2026-09-03 PixelBrain UX savage-audit found and Qwen's same-day fix (`4cb9421a`) partially addressed elsewhere in this tree (`EFFECT_CATALOG.md`, `npm run scdl*`) — this specific script was not in scope for that pass and remains exactly as unreachable as everything else was before it.

**[WARN] Two explicit design decisions were asked and never answered, and remain open as of this Verdict's render date.** (a) Whether `strict: true` should be `compileAsset`'s default — asked, unanswered; two assets still fail it, which is what keeps a whole class of SCDL-005-style defects reintroducible. (b) Whether the synthetic-relief technique (P-list §2, Innovation) is worth adopting as a real pipeline step, or whether hand-drawn art should stay fully artist-lit — built, tested, works, modest-not-dramatic effect at the tested strength, and explicitly left as "an open decision, not adopted." Both questions have now sat open across the 2026-07-29 session, the 2026-08-30 follow-up, and this Verdict's render on 2026-09-03 — over a month with no ruling. See §5.

**[WARN] `provenance.paletteCoverage` measures the wrong surface, and this is a known, unresolved correctness bug in the diagnostic layer itself.** It reports authored coordinate colors, while quantization runs on the post-lighting buffer — so `lightning-sword` reads as "flat" (6 authored colors) while actually rendering 19 quantized colors spanning 0.972 luminance. This was surfaced and the deciding question ("move it to the rendered buffer, or drop it") was put to Vaelrix before the session that would have resolved it ended. It is still open.

**[INFO] A real, trivial, unfixed authoring bug has survived two work sessions.** `lightning-sword.scdl`'s pommel uses `ellipse` (outline-only) where `circle` (filled) was almost certainly intended, producing a hollow 19-cell ring with no center. Small in isolation; notable because it is exactly the kind of defect this system's own diagnostic tooling (`provenance`, `material-validator`) is built to catch, and it has not been caught or fixed across two documented sessions of work on the surrounding code.

**[INFO] Six material-registry warnings remain unresolved:** non-monotonic value ramps on 6 materials awaiting an `emissive` classification call, `black_steel`/`blacksteel` sharing an identical ramp under two distinct shader indices, and `void_cloth` categorized `metal` while every other `cloth_*` material is `organic`. None of these are load-bearing today (nothing consumes the registry in production either — see the CRIT-bordering finding above), but they will need resolving before this system's material layer could honestly be called complete.

**[WARN, acknowledged as deliberate, not neglect] `constructionToSCDLParts` does not exist.** The geometric-construction-solver still cannot hand geometry to SCDL — a supplied construction currently *gates* an asset (a refusal stops the pipeline) without *supplying* its geometry (`CONSTRUCTION_LINK.GATE` vs `DERIVED`, honestly distinguished in the code rather than faked). The system's own record is explicit that this is "deliberately not glue; it is a language-design decision with a version bump attached" — flagged here as a real gap in the full construction → SCDL → genes → VRI → raster pipeline this system is one link of, not as an oversight equivalent to the items above it.

---

## 4. Law Violations

**[WARN] `vri-schema.js` declares a versioned schema (`PB-VRI-v1`) for a real, production-shaped data structure — VRI scenes — with zero corresponding entry in `SCHEMA_CONTRACT.md`.** Confirmed by grep this session: `SCHEMA_CONTRACT.md` contains no mention of "vixel" or "vri" in any casing. Law 3 ("Schema Is Sovereign... No agent may create a parallel schema. No agent may modify `SCHEMA_CONTRACT.md` except Codex, with Angel's awareness") governs exactly this shape of concern.

Scored WARN rather than CRIT because the letter of the violation is procedural, not adversarial: `vri-schema.js`'s own header explicitly positions VRI as "the missing layer between SCDL scene semantics and final raster" — a genuinely new layer SCDL never had an equivalent for, not a competing redefinition of an existing canonical shape. Nothing found this session suggests `PB-VRI-v1` collides with or duplicates a shape `SCHEMA_CONTRACT.md` already governs. The violation is that a real schema was never *registered*, not that a real schema was invented to *evade* one that already existed. That distinction is what keeps this at WARN — a procedural gap this system's zero-production-reach (§3) has so far kept from mattering, and won't be able to keep hiding once wired in.

**[WARN-bordering-CRIT] No PDR exists, in tension with Law 13's stated purpose.** Law 13's literal text mandates archive discipline for PDRs that exist ("all PDRs must be stored in `docs/scholomance-encyclopedia/PDR-archive/`") rather than stating in as many words that every implemented feature requires a PDR before implementation — so this is not cited as a clean textual violation. But Law 13's own "Why This Exists" section states plainly that "PDRs are architectural artifacts — they define major features before implementation," and a 194-test rendering-correctness engine with two open, un-ruled design decisions is precisely the class of feature that clause describes. This is the identical citation pattern `VERDICT-2026-08-27-VAELRIX-FORCEFIELD-BRAIN-NETWORK.md` used for the same situation, and it is scored the same way here: real, not FATAL, immediately remediable.

No FATAL violation found. No determinism violation found — `verifyLineage()`'s checksum chain (P5, §2) is direct, positive evidence of Law 6 compliance within this system's own boundary, not merely an absence of counter-evidence.

---

## 5. Admonishment of the Arbiter

Two direct questions were put to you, Vaelrix, by name, across two separate sessions — 2026-07-29 and 2026-08-30 — and both remain unanswered as of this Verdict's render on 2026-09-03. Neither is a small procedural formality dressed up as a decision: one gates whether a real class of defect (the SCDL-005 unknown-material silent-fallback family) can ever be reintroduced by accident, and the other decides whether a genuinely clever, tested, physically-grounded technique — synthetic relief for hand-drawn art — becomes a real pipeline step or stays a proof of concept nobody uses. Both are cheap to answer. Neither has been.

This is not a victimless gap. The system audited in this Verdict is real, tested, and correct in ways that took real diagnostic skill to find — and it sits completely unreachable from anything that ships, in no small part because the two decisions that would let someone confidently build the wiring work on top of it were asked and left open. An implementer who wanted to wire this into `item-foundry.js` today would have to guess whether `strict` should be on, because you have not said. That is not a hypothetical cost: it is the specific, named reason this Verdict's Impact Score and Architecture Risk could not be scored more favorably.

The pattern recurs. `VERDICT-2026-08-27-VAELRIX-FORCEFIELD-BRAIN-NETWORK.md` capped its own grade at B for the same shape of gap — real work, no canon, unresolved. This is not evidence the pattern is acceptable because it has happened before; it is evidence the pattern is now recurring across independently-built systems, which is a harder thing to fix than any single unanswered question, because it means the gap is not local to one session's oversight, it is a habit of how work concludes in this repository. A Verdict is a mirror, not a hammer — but a mirror shown twice in the same shape and once again this session is not new information, it is a pattern declining to be corrected.

---

## 6. Recursive Bug Elimination

**The missing-z class.** §2's P3 explicitly names the 2D-only-normals bug as "the same missing-z class as the `sphere` op" — a recurring failure mode across this codebase where a 2D authoring primitive silently drops or never carries a z-component, and downstream consumers that assume real 3D geometry (lighting, in this case) get half the input they need with no error, just a wrong answer. This Verdict's target system is now positive, tested evidence against a second instance of that class: `vri-renderer.js`'s lighting pass was fixed specifically because its normals were caught missing a z-component, the same shape of defect the `sphere` op had. Any future primitive or pass in this codebase that consumes surface normals should be checked against this named class before it ships, not after a second silent-wrong-answer bug is found the hard way.

**Unbounded composition silently clipping.** The additive-lighting overshoot (§2 P1) is an instance of a more general, nameable pattern: a value composed by simple addition/accumulation with no declared bound will silently clip or overflow once its inputs exceed the range anyone tested against, and the clipping itself — not the composition rule — is what destroys the signal (here: hue, via per-channel differential clipping). This is the same shape of defect this project's `feedback-measure-dont-rationalize` and `project-checks-that-cannot-fail` findings both warn about in the abstract: a mechanism that looks fine under the cases it was built against and fails silently, not loudly, outside them. Any future compositing pass in this pipeline (color, light, opacity, or otherwise) should be checked for a declared bound before it ships, using this bug — not a hypothetical — as the standing example of what "no bound" costs.

**Diagnostics measuring the wrong surface.** `provenance.paletteCoverage` (§3) measuring authored coordinates instead of the post-lighting rendered buffer is a specific instance of a general risk this system's own existence should make this codebase more alert to: a diagnostic built early in a pipeline's life can silently stop describing what the pipeline actually does once a later stage (here, lighting) is added between the diagnostic's input and the pipeline's real output. Every diagnostic field in this system, and in any future extension of it, should be re-checked against "what stage does this actually read from" whenever a new pass is inserted upstream of it — this bug is the concrete case that makes that check worth doing as a matter of course, not just when something looks visibly wrong.

---

## 7. Remediation Tiers

### 7.1 Immediate (this commit / open PR / current sprint cycle)

| Action | Owner | Severity | Cost | Reversibility | Success Criterion |
|---|---|---|---|---|---|
| Author a retroactive PDR / `ARCH-*` entry for the Vixel/VRI system, naming `codex/core/pixelbrain/vixel/` directly in its Target Integration Area | `Angel` + `codex` | CRIT-bordering | 3 agent-hours | cheap | PDR exists in `docs/scholomance-encyclopedia/PDR-archive/`, names this system's own files (not just an adjacent system's forward reference), and states the two open decisions from §3 as questions the PDR resolves |
| Rule on `strict: true` as `compileAsset`'s default | `Angel` | WARN | 15 minutes of decision, 1 agent-hour to apply | cheap | The two assets currently failing `strict` either pass, or the default stays off with a written reason in the new PDR |
| Rule on synthetic-relief adoption | `Angel` | WARN | 15 minutes of decision | cheap | The new PDR states adopted / not-adopted, with the modest-effect-at-rank×1.8 measurement cited either way |
| Register `PB-VRI-v1` in `SCHEMA_CONTRACT.md` (or record, in the new PDR, an explicit reasoned exemption if VRI scenes are judged out of that contract's scope) | `codex` | WARN | 2 agent-hours | cheap | `SCHEMA_CONTRACT.md` references VRI scenes, or the PDR states why it does not need to |

### 7.2 30 Day

| Action | Owner | Severity | Cost | Reversibility | Success Criterion |
|---|---|---|---|---|---|
| Wire `scripts/wand-vixel-pipeline.mjs` into `npm run`, matching the pattern `4cb9421a` already set for `scdl.cli.js` | `gemini` | WARN | 1 agent-hour | cheap | `npm run vixel -- <asset-name>` (or equivalent) works; `package.json` references the script |
| Fix `provenance.paletteCoverage` to read the post-lighting rendered buffer, or remove the field with a documented reason | `gemini` | WARN | 3 agent-hours | cheap | `lightning-sword`'s reported coverage matches its actual rendered color count, or the field is gone and nothing downstream reads it |
| Fix `lightning-sword.scdl`'s pommel (`ellipse` → `circle`) | `claude` or `gemini` | INFO | 15 minutes | cheap | The pommel renders filled, not as a hollow ring; asset re-approved at all 4 golden-byte scales |
| Resolve the 6 material-registry warnings (emissive classification, duplicate-ramp shader indices, `void_cloth` category) | `codex` | INFO | 4 agent-hours | cheap | `material-validator.js`'s warning count for these 6 drops to 0 |
| Scope a design for wiring the corrected VRI lighting model into one production door (Door A or Door B, whichever has the smaller blast radius) as a real, flagged, opt-in pass | `codex` + `gemini` | WARN | research-track, 4 agent-hours | cheap (design only; no code yet) | A short design note exists naming which door, what changes visually, and what the eyes-on-the-render review step will be before it ships |

### 7.3 90 Day

| Action | Owner | Severity | Cost | Reversibility | Success Criterion |
|---|---|---|---|---|---|
| Implement the wiring designed in 7.2's last item, behind a flag, on the chosen door only | `gemini` | WARN | 8 agent-hours | one-way (visible rendering change once flagged on) | Flag exists and defaults off; with it on, at least 3 existing assets are re-rendered and manually eyeballed (not just diffed) against their pre-wiring output, per this project's own aesthetic-change discipline |
| Couple `verifyLineage()`'s checksum chain to the L1 (Innate) immune layer | `codex` | INFO | 4 agent-hours | cheap | An L1 check consumes `verifyLineage()`'s output for at least one real asset path |
| Full VAELRIX_LAW clause-by-clause audit of this system, beyond what surfaced during this Verdict's pass | `codex` | INFO | 4 agent-hours | cheap | Audit filed; any new findings become Immediate/30-Day items in the re-render |

### 7.4 Long Term

| Action | Owner | Severity | Cost | Reversibility | Trigger |
|---|---|---|---|---|---|
| `constructionToSCDLParts` — let the geometric-construction-solver actually supply geometry to SCDL, closing the last `GATE`-vs-`DERIVED` gap in the full construction → SCDL → genes → VRI → raster pipeline | `codex` | INFO | research-track (explicitly a language-design decision with a version bump attached, per this system's own record) | The 90-Day wiring work ships and proves the rest of the pipeline is worth completing end to end |
| Extend the second production door (whichever wasn't chosen in 7.2/7.3) once the first door's wiring has run in production long enough to trust the eyeball-review process that gated it | `gemini` | INFO | research-track | The first door's wiring has shipped, been live, and produced zero unreviewed visual regressions for one full re-render cycle |

---

## 8. Final Verdict

**Grade: B** (ceiling A, held at B by the same two things that held the Brain Network verdict there: no canon, and a reachability gap so complete it isn't friction, it's absence).

What was built here is real. The lighting model was genuinely broken — not subtly, 50.9% of one asset's own pixels rendered brighter than that asset's own brightest authored color — and the fix that landed is the correct one: light modulates albedo instead of adding to it, bounded, physically grounded, no flag required to get the right answer by default. The debugging method that found it (a controlled, repeated eyeball test across every demo asset, not a guess) is exactly the kind of measurement discipline this project's own culture claims to value, and here it was actually practiced under real conditions, not just described. The synthetic-relief technique is a genuinely clever, deterministic answer to a real problem — flat hand-drawn art having nothing for a lighting pass to act on — validated against a real control, not asserted. Every one of these claims was checked this session, not inherited on faith: 194/194 tests pass, right now, against the actual current code.

What holds this at B rather than A is not the quality of the engineering — it is that none of it has anywhere to go. Zero production consumers. No PDR. A schema nobody registered. Two direct questions asked of the one person who can answer them, unanswered across two sessions and now a third. The system is not merely unfinished — it is finished and shelved, which is a worse state than unfinished, because "unfinished" invites the next person to keep building and "shelved-but-tested" invites nobody to look, since the tests are green and nothing appears to be broken. Nothing *is* broken. Nothing is *connected*, either, and a Verdict's job is to say that plainly rather than let a green test suite stand in for it.

Continue building it — but "continuing" should mean wiring, ruling, and registering before it means writing more passes. The next hour of work that matters most here is not a new technique; it is Vaelrix answering two questions that have already been asked twice.

Validated praise stands. Concerns stand. Admonishment stands. The Verdict will be **re-rendered** when:

- The retroactive PDR is filed (expected: ceiling moves toward A)
- Either open design decision (`strict` default; synthetic-relief adoption) is ruled on (expected: Architecture Risk and Impact Score both re-scored)
- This system is wired into a production door for the first time, even behind a flag (expected: Impact Score, Revenue Potential, and Architecture Risk all re-scored, the last one upward in blast-radius terms and the fix's value finally realized rather than theoretical)

Until then, the engineering is sound, the gap between what was built and what ships is documented with file:line specificity, and the two questions blocking the next move are named, not vague.

---

*Filed under the Scholomance-Verdicts charter. This document is a mirror, not a hammer — the architecture is what it is; this Verdict only says what it is.*
