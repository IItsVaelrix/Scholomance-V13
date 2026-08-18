# Atlas Coverage Cell Calibration — Vitality Ledger & Verdict

- **Date:** 2026-08-18
- **Frozen HEAD:** `b508e924` (worktree dirty=119, other agents' WIP untouched)
- **Prereg:** `2026-08-18-PREREG-atlas-coverage-calibration.md`
- **Ledger artifact:** `consumer-coverage-ledger.json` (914 modules)
- **Classification:** research/diagnostic. No production semantics, no grammar, no audition wiring.

---

## VERDICT: Hypothesis A CONFIRMED

A consumer-graph coverage cell produces a **dramatically smaller, causally-meaningful**
set than the filename heuristic while preserving every known positive. The filename
heuristic is a popularity contest with a **73.5% false-positive rate**; the consumer
graph turns "coverage" from a boolean into a lifecycle state.

---

## 1. The four prereg anchors — all PASS

| Anchor | Expected | Measured | Result |
|---|---|---|---|
| **POSITIVE** audition/* | surfaced, not production-wired | all 11 modules `prod=False`; entry points = EXPERIMENTAL_UNDECLARED, internals = TRANSITIVELY_EXERCISED | ✅ PASS |
| **TRANSITIVE** derivation-factors.js | TRANSITIVELY_EXERCISED, not stranded | `state=TRANSITIVELY_EXERCISED, transitiveTest=true, directTest=0` | ✅ PASS |
| **WIP** subordination/inversion/punctuation/relative/list | marked WIP, excluded | all 5 `state=WIP, git=DIRTY` | ✅ PASS |
| **NOISE** .tmp/_shot/_diag | not counted | **0** noise rows in denominator | ✅ PASS |

**Audition refinement discovered by evidence:** audition is *not* bare-stranded — it has
3 direct test files importing its entry points, but **zero external production consumers**
(self-imports only). True state = **tested-but-not-production-wired**. The consumer graph
surfaced exactly this; the baseline's basename match would have hidden it by seeing
`audition.adapter.test.js` and calling it "covered."

## 2. Precision / recall

- **Stranded recall = 1.00** — every audition module surfaced, correctly flagged non-production.
- **Scratch false positives = 0** — denominator excludes all `.tmp`/`_shot`/`_diag`.
- **Precision = 1.00** (41/41) on the stratified hand-labeled calibration set, after
  manual adjudication of all disagreements.
  - Raw agreement vs a deliberately-coarser independent labeler = **0.854**.
  - All 6 disagreements were adjudicated **in the cell's favor** by direct evidence:
    1 independent labeler missed a transitive live chain; 1 it missed a dynamic
    `await import()`; 3 it couldn't express RESEARCH_ONLY; 1 it false-positived on a
    string literal. The cell was correct in every case.

## 3. The two falsifiers — both SURVIVED (not violated)

1. **No popularity contest recreated:** 254 modules have **zero direct tests** yet are
   correctly `TRANSITIVELY_EXERCISED`, not "deficient." Zero-direct-test ≠ deficient
   when production + transitive-test reachability is strong.
2. **Audition did not disappear:** diagnostic/research/test inbound edges did **not**
   make it production-wired. Consumer KIND is respected.

## 4. Same-denominator comparison (baseline vs consumer graph)

| Metric | Baseline (filename) | Consumer graph |
|---|---|---|
| Modules flagged "no test" | **843 / 914 (92%)** | — |
| Claimed coverage | **2%** | — |
| Of those flagged, actually exercised | **620 (73.5% false positive)** | — |
| — of which have DIRECT tests the baseline missed | 366 | — |
| — of which are transitively exercised | 254 | — |
| Genuine live-but-untested gaps | buried in noise | **2** (`combat.session.js`, `apoptosis.listener.js`) |
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
| PRODUCTION_UNTESTED | 2 | live path, no test reaches it |

### ConstellationOS is two parallel systems (117 modules)

**A. Live page path — 25 modules, 100% directly pinned.** Full direct-test coverage.
`constellationPage.service.js`, `constellation.routes.js`, `constellationRuntime.js`,
8 channel adapters, and the analysis core (`phraseAnalysis`, `governor`, `readings`,
`queryIdentity`, `pageBytecode`, `cue-arbiter`, `semanticInquiry`, `syntacticFrame`,
`discovery*`, `rarity`, `precedent`).

**B. Research substrate — 38 EXPERIMENTAL_UNDECLARED + 2 RESEARCH_ONLY, heavily tested,
NOT wired into the page.** `semantic-particles/*` (the waterfall/census/commutator
apparatus), `audition/*`, `treebank*`, `grimoire/reactor`, `compose` family. These are
the experiment instruments — tested rigorously, but the live page never calls them.

**C. WIP — 26 modules.** Other agents' in-flight experiments. Correctly excluded.

### The three stop-condition questions — now answerable per module

| Question | How the ledger answers it |
|---|---|
| Is it part of production? | `production` (forward-reach from shipped surface) |
| How is its behavior exercised? | `directTest` / `transitiveTest` / research / diagnostic inbound |
| Is its lifecycle intentional? | state + `git` + inbound-kind columns |

## 6. Action queue (ranked AFTER classification)

**Genuine coverage gaps (small, causal):**
1. `codex/core/combat.session.js` — live (imported by `src/lib/codex/battle.js`), zero tests.
2. `codex/runtime/apoptosis.listener.js` — live runtime seed, zero tests.

**Lifecycle decisions, not coverage gaps:**
3. **audition/** — tested, never wired. Decide: wire it, or charter EXPERIMENTAL
   (AMP-registry truth-pass pattern).
4. **precedent.adapter.js** — a `codex/server` seed with `prodIn=0` (nothing imports it).
   The prior "tested orphan" finding is preserved in the `prodIn=0` column.
5. `semantic-particles/index.js` — a STRANDED barrel; all consumers import modules
   directly. Delete or document.

**Do NOT action:** the 26 WIP modules (other agents' experiments), the 63 STRANDED that
are archived/vendored/jit/blender (legitimately test-optional), and the 174
EXPERIMENTAL_UNDECLARED as a group (they are research instruments, not gaps).

## 7. Known limitations / next refinements

- Seeding all `codex/server/**` as live makes orphan server files `prodReach=true` by
  construction. The `productionInbound=0` column preserves the truth, but a future
  refinement should flag "seed with zero inbound" as a candidate orphan entry-point.
- The independent calibration labeler was deliberately coarser (static-only imports, no
  RESEARCH_ONLY state) — that is why raw agreement was 0.854 before adjudication.

## 8. Stop condition & next experiment

Stop condition met: the ledger reliably answers all three lifecycle questions per module.
**No tests were written and audition was not wired**, per prereg.

**Next experiment (narrow, chosen from the corrected ledger):**
> Does pinning one high-vitality, transitively-exercised module produce regression
> protection that integration tests currently miss?
Candidate: `derivation-factors.js` (TRANSITIVELY_EXERCISED, on the semantic-particles
critical path). Deferred until this calibration is accepted.
