# Atlas Coverage Cell Calibration — Vitality Ledger & Verdict

- **Date:** 2026-08-18 · **Revised 2026-08-19** (circularity repair — see §9)
- **Frozen HEAD:** `b508e924` (original run) / `48d31119` (revision). Worktree dirty.
- **Prereg:** `2026-08-18-PREREG-atlas-coverage-calibration.md`
- **Repair prereg:** `2026-08-19-PREREG-coverage-cell-circularity-repair.md`
- **Artifacts:** `consumer-coverage-ledger.json` (914 modules),
  `2026-08-19-coverage-calibration-v2.json`, `2026-08-19-coverage-popularity-falsifier.json`
- **Classification:** research/diagnostic. No production semantics, no grammar, no audition wiring.

---

## VERDICT: Hypothesis A CONFIRMED — with the headline action item withdrawn

A consumer-graph coverage cell produces a **dramatically smaller, causally-meaningful**
set than the filename heuristic. The filename heuristic is a popularity contest with a
**73.5% false-positive rate**; the consumer graph turns "coverage" from a boolean into a
lifecycle state, and that survives a degree-preserving shuffled control at |z| = 6.61.

The 2026-08-19 revision **withdraws action item #1** (`combat.session.js`) and downgrades
the original calibration number. Both were artifacts of a seed rule that the original
validator shared with the cell it was validating. Details in §9.

---

## 1. The four prereg anchors

| Anchor | Expected | Measured | Result |
|---|---|---|---|
| **POSITIVE** audition/* | surfaced, not production-wired | all 11 modules `prod=False`; 3 entry barrels EXPERIMENTAL_UNDECLARED, 8 internals TRANSITIVELY_EXERCISED | ✅ PASS (**earned** — reconfirmed under orthogonal seeds, §9 F3) |
| **TRANSITIVE** derivation-factors.js | TRANSITIVELY_EXERCISED, not stranded | `state=TRANSITIVELY_EXERCISED, transitiveTest=true, directTest=0` | ✅ PASS (**earned**) |
| **WIP** subordination/inversion/punctuation/relative/list | marked WIP, excluded | all 5 `state=WIP, git=DIRTY` | ⚠️ **BY CONSTRUCTION** |
| **NOISE** .tmp/_shot/_diag | not counted | **0** noise rows in denominator | ⚠️ **BY CONSTRUCTION** |

**Two of these four checks cannot fail and are not evidence.** `deriveState`
(`consumer-coverage-graph.mjs:151`) returns `WIP` on its first line for anything dirty, so
the WIP anchor reports that the branch exists. `inDenominator` (`:137-139`) returns false
for `.tmp/`, `_shot`, `_diag`, so "0 noise rows" reports that the filter ran. They are kept
here as filter smoke-tests, relabelled honestly. The shuffled control in §3 independently
confirms WIP is invariant under consumer kind (SD = 0 across 20 seeds) — i.e. it is a git
measurement, not a graph measurement.

**Audition refinement discovered by evidence:** audition is *not* bare-stranded — it has
3 direct test files importing its entry points, but **zero external production consumers**.
True state = **tested-but-not-production-wired**. The baseline's basename match would have
hidden it by seeing `audition.adapter.test.js` and calling it "covered."

## 2. Inter-labeler agreement (NOT precision)

The original write-up reported "Precision = 1.00 (41/41)". That word had no definition
here: there is no ground truth and no positive class. It was **inter-labeler agreement
after the cell's own author broke all six ties in the cell's favour.** Corrected, with the
2×2 from `coverage-calibration-labeler-v2.mjs`:

| Validator arm | Population n=120 | Clustered 95% CI | What it measures |
|---|---|---|---|
| prefix seeds + forward test detect | **1.000** | [1, 1] | nothing — a reimplementation of the cell |
| exec seeds + forward test detect | 0.983 | [0.949, 1] | F2: the seed rule alone |
| prefix seeds + backward test detect | 0.967 | [0.917, 0.994] | test detection alone |
| **exec seeds + backward test detect** | **0.950** | **[0.885, 0.986]** | **the orthogonal validator (§22)** |

The honest headline is **0.950, CI [0.885, 0.986]**, bootstrapped over 46 directory
clusters — not 1.00, and not 0.854 either. CIs are directory-clustered because
`codex/core/animation/amp/*` is 7 near-identical modules, not 7 independent observations
(§26). Seed `20260819`, checksum in the artifact.

The top row is the point: **an independent-looking validator that shares the cell's
features agrees with it perfectly, by construction.** That is what v1 was, and it is why
v1's 0.854 was not a measurement of the cell — its 6 disagreements came from v1 being
coarser, not from independent evidence.

- **Stranded recall = 1.00** — every audition module surfaced, correctly flagged non-production.
- **Scratch false positives = 0** — denominator excludes all `.tmp`/`_shot`/`_diag` (by construction, see §1).

## 3. The two falsifiers

### F1 — popularity contest: **SURVIVED**, now with a real control

The original evidence ("254 modules have zero direct tests yet are TRANSITIVELY_EXERCISED,
not deficient") **could not fail**: `transitiveTest` is *defined* as
`testReach && directTest === 0`. It restated the state machine.

Replaced with a degree-preserving KIND shuffle (§5, §17) — the import graph and every
node's inbound degree held **exactly** fixed while file→kind and file→prodSeed assignments
are permuted with counts preserved. 20 seeds. If state were a function of degree, the
distribution would be unchanged.

| State | Observed | Shuffled mean ± SD | R_excess | z |
|---|---|---|---|---|
| EXPERIMENTAL_UNDECLARED | 174 | 68.6 ± 14.52 | **+105.4** | **+7.26** |
| PRODUCTION_UNTESTED | 2 | 18.0 ± 4.29 | −16.0 | −3.73 |
| DIRECTLY_PINNED | 386 | 468.7 ± 30.42 | −82.7 | −2.72 |
| RESEARCH_ONLY | 8 | 3.3 ± 2.02 | +4.8 | +2.35 |
| TRANSITIVELY_EXERCISED | 254 | 273.4 ± 24.79 | −19.4 | −0.78 |
| STRANDED | 63 | 55.0 ± 9.40 | +8.0 | +0.85 |
| WIP | 27 | 27.0 ± 0.00 | 0.0 | n/a (git-derived, kind-invariant) |

**Prereg threshold was |z| > 3 on the DP/EU split.** Observed wired fraction
(DIRECTLY_PINNED / direct-tested) = **0.6893** vs shuffled **0.8720 ± 0.0276**,
**z = −6.61**. F1 survives.

The direction is the finding: under a random kind assignment 87% of direct-tested modules
would look production-wired; in reality only 69% are. This repo carries **far more
tested-but-unwired research substrate than chance** (EXPERIMENTAL_UNDECLARED +7.3σ) and
**far fewer live-untested modules than chance** (PRODUCTION_UNTESTED −3.7σ). Those are
measurements now, not assertions.

### F2 — audition did not disappear: **SURVIVED**

Diagnostic/research/test inbound edges did not make it production-wired. Consumer KIND is
respected. Reconfirmed under orthogonal seeds — see §9 F3.

## 4. Same-denominator comparison (baseline vs consumer graph)

Re-run 2026-08-19; every figure reproduces exactly.

| Metric | Baseline (filename) | Consumer graph |
|---|---|---|
| Modules flagged "no test" | **843 / 914 (92%)** | — |
| Claimed coverage | **2%** | — |
| Of those flagged, actually exercised | **620 (73.5% false positive)** | — |
| — of which have DIRECT tests the baseline missed | 366 | — |
| — of which are transitively exercised | 254 | — |
| Genuine live-but-untested gaps | buried in noise | **1** (`apoptosis.listener.js`) — see §6 |
| Root cause of baseline failure | assumes `tests/codex/core/X.test.js`; real layout is `tests/core/…` and tests are integration-shaped | resolves actual import edges |

## 5. VITALITY LEDGER (classification first)

### State distribution (914 denominator modules)

| State | Count | Meaning |
|---|---|---|
| DIRECTLY_PINNED | 386 | direct test + production-reachable |
| TRANSITIVELY_EXERCISED | 254 | no direct test, exercised via test→imports |
| EXPERIMENTAL_UNDECLARED | 174 | has tests, NOT production-wired |
| STRANDED | 63 | zero inbound of any kind |
| WIP | 27 | dirty/untracked — excluded from action queue |
| RESEARCH_ONLY | 8 | only research scripts consume it |
| PRODUCTION_UNTESTED | 2 | live path, no test reaches it — **1 of the 2 is withdrawn, §6** |

### ConstellationOS is two parallel systems (117 modules)

**A. Live page path — 25 modules, 100% directly pinned.** Full direct-test coverage.
`constellationPage.service.js`, `constellation.routes.js`, `constellationRuntime.js`,
8 channel adapters, and the analysis core (`phraseAnalysis`, `governor`, `readings`,
`queryIdentity`, `pageBytecode`, `cue-arbiter`, `semanticInquiry`, `syntacticFrame`,
`discovery*`, `rarity`, `precedent`).

**B. Research substrate — 38 EXPERIMENTAL_UNDECLARED + 2 RESEARCH_ONLY, heavily tested,
NOT wired into the page.** `semantic-particles/*` (the waterfall/census/commutator
apparatus), `treebank*`, `grimoire/reactor`, `compose` family. These are the experiment
instruments — tested rigorously, but the live page never calls them.

`audition/*` belongs to this group but splits by role, and the earlier draft filed all 11
under EXPERIMENTAL_UNDECLARED. Correct breakdown: **3 EXPERIMENTAL_UNDECLARED** — the
entry barrels `index.js`, `jurors/index.js`, `schemas.js`, which tests import directly —
and **8 TRANSITIVELY_EXERCISED** internals (the 5 jurors, `audition.adapter.js`,
`candidates/index.js`, `from-compose.candidate.generator.js`), reached only through those
barrels. All 11 are `production=false` under both seed regimes.

**C. WIP — 27 modules.** Other agents' in-flight experiments. Correctly excluded, and
listed by path in the artifact (`dirtyModulesInDenominatorList`) so the run is replayable.

### The three stop-condition questions — now answerable per module

| Question | How the ledger answers it |
|---|---|
| Is it part of production? | `production` (prefix seeds) **and** `executionReachable` (orthogonal seeds) — disagreement is the interesting signal |
| How is its behavior exercised? | `directTest` / `transitiveTest` / research / diagnostic inbound |
| Is its lifecycle intentional? | state + `git` + inbound-kind columns + `prodSeedOrphan` |

## 6. Action queue (ranked AFTER classification)

**Genuine coverage gap — 1, not 2:**

1. `codex/runtime/apoptosis.listener.js` — live runtime seed, zero tests. Imported by
   `codex/server/index.js:55` (a real execution entry), so it boots with the server.
   Confirmed by hand: no test file imports it. **Stands.**

**WITHDRAWN — `codex/core/combat.session.js`.** The original entry read "live (imported by
`src/lib/codex/battle.js`), zero tests." The zero-tests half is correct — the only mention
is `tests/pb-sani/classify.test.js:193`, which passes the path as a *string argument* to
`classifySymbol`, i.e. test data, not an import. **The "live" half is wrong.** The chain is
`combat.session.js` ← `src/lib/codex/battle.js` ← `src/hooks/useBattleSession.js` ←
**nothing**. `useBattleSession.js` is 1235 lines and no module imports it; the sole
repo-wide reference is a string literal in
`tests/qa/vaelrix-law-architecture-gauntlet.test.js:197`. It was classified production only
because `src/hooks/` is seeded wholesale (§7). Writing tests here would pin dead code. The
real question is whether the combat stat tree is being revived or deleted — a lifecycle
decision, not a coverage gap.

**Lifecycle decisions, not coverage gaps:**
3. **audition/** — tested, never wired. Decide: wire it, or charter EXPERIMENTAL
   (AMP-registry truth-pass pattern).
4. **precedent.adapter.js** — `prodSeedOrphan=true`: a `codex/server` seed that nothing
   imports. The orthogonal validator independently rediscovered this (§9).
5. `semantic-particles/index.js` — a STRANDED barrel; all consumers import modules
   directly. Delete or document.
6. **`cleri-probe` (13 modules) is CLI tooling, not server code.** `investigation.runtime.js`
   is imported only by `scripts/cleri-probe/commands.js`. It sits under `codex/runtime/` so
   the prefix rule calls it production; it never boots with the server. Either relocate it
   out of `codex/runtime/` or record it as a CLI entry point.

**Do NOT action:** the 27 WIP modules (other agents' experiments), the 63 STRANDED that
are archived/vendored/jit/blender (legitimately test-optional), and the 174
EXPERIMENTAL_UNDECLARED as a group (they are research instruments, not gaps).

## 7. Known limitations — one now measured

- **The production seed rule over-claims, and the size is now known.** Seeding all of
  `codex/server/**`, `codex/runtime/**`, `src/pages/**`, `src/hooks/**` makes every module
  under them live *by construction*. Against seeds derived from execution evidence,
  **31 of the 914 modules are `production=true` but not `executionReachable`**
  (`productionOverclaim` in the artifact) and **2 are `prodSeedOrphan`** — seeded live with
  nothing importing them. The three clusters are `cleri-probe` (13, CLI tooling), the
  combat/tactical-board tree (9, reached only through the orphaned `useBattleSession`), and
  scattered engines. `state` is deliberately **left unchanged**: this is recorded
  annotate-only (§28 Step 6), observe before mutating.
- **The ledger is a snapshot of a working tree, not of a commit.** `deriveState`
  short-circuits to WIP before anything else, so 27 rows exist only because those files are
  uncommitted. `regenerableFromFrozenHeadAlone: false` is now stamped in the artifact along
  with the full dirty list and a `ledgerChecksum`, so the run can be replayed.
- **Nothing here establishes ground truth.** Two labelers agreeing is agreement. The
  RESEARCH_ONLY state (8 modules) is now *expressible* by the validator rather than folded
  into STRANDED, but it has never been checked against an external standard.

## 8. Stop condition & next experiment

Stop condition met: the ledger reliably answers all three lifecycle questions per module,
and the two questions it got wrong are now identified with their mechanism.
**No tests were written and audition was not wired**, per prereg.

**Next experiment (narrow, chosen from the corrected ledger):**
> Does pinning one high-vitality, transitively-exercised module produce regression
> protection that integration tests currently miss?
Candidate: `derivation-factors.js` (TRANSITIVELY_EXERCISED, on the semantic-particles
critical path). Deferred until this calibration is accepted.

## 9. Circularity repair (2026-08-19)

**The defect.** `coverage-calibration-labeler.mjs` was described as "deliberately DIFFERENT
implementation … so the comparison is not circular." On test detection it was. On
production reach it was not: `liveSeeds` (line 89) is the same prefix list, character for
character, as the cell's `prodSeeds` (`consumer-coverage-graph.mjs:108-113`), and both
resolve it with the same forward BFS. Production reach is the feature that decides
DIRECTLY_PINNED vs EXPERIMENTAL_UNDECLARED and carries the audition claim. It was asserted
twice and checked zero times — semantic-chemistry-skill §22 / §27.3, *generator and
validator using the same feature yields fake confidence*.

**The repair.** `coverage-calibration-labeler-v2.mjs` derives live seeds from evidence of
how the app boots — `index.html` `<script src>` and `package.json` dev/start/serve scripts —
naming no source directory. Seven seeds (`src/main.jsx`, `codex/server/index.js`, and five
launcher scripts) reaching 1260 files, against the prefix rule's 387 seeds reaching 1429.
v1 is left byte-identical so its 0.854 stays auditable.

**Results against the falsifiers declared in the repair prereg:**

- **F1 — popularity.** SURVIVED, z = −6.61 on the DP/EU split. §3.
- **F2 — was the shared seed load-bearing?** Production-axis agreement under orthogonal
  seeds = **117/120 (0.975)**; under the cell's own seeds, 120/120 by construction. The
  seed list was **not** doing the work — the conclusion holds under independent seeding —
  but the three disagreements are real and all three are the cell being wrong, not the
  validator. Checked by hand:
  - `precedent.adapter.js` — zero non-test importers. Tested orphan, not DIRECTLY_PINNED.
  - `cleri-probe/planner.js` — reachable only via `scripts/cleri-probe/commands.js`, a CLI
    tool. Not on the booted path.
  - (the third arm's disagreements are test-detection differences, itemised in the artifact)
- **F3 — audition.** SURVIVED. All 11 audition modules are `production=false` under the
  execution-derived seeds too. The headline claim is not an artifact of the prefix list.
- **F4 — clustering.** Confirmed as a real effect: the orthogonal arm's module-level point
  estimate is 0.950, but the directory-clustered 95% CI is **[0.885, 0.986]**. The
  module-level number was overconfident, as suspected.

**What this cost the original verdict:** one withdrawn action item, one downgraded headline
number (1.00 → 0.950 CI [0.885, 0.986]), two anchors relabelled as unfailable, and one
falsifier replaced with a control that can actually fail. The core claim — consumer graph
beats filename heuristic, 73.5% false-positive rate, lifecycle over boolean — survives all
of it, and now survives a matched shuffled control it was never previously run against.
