# PREREG — Coverage Cell Circularity Repair

- **Date:** 2026-08-19
- **Repairs:** `2026-08-18-atlas-coverage-calibration-ledger.md`
- **Skill:** `Scholomance LAW/semantic-chemistry-skill.md` §5, §12, §17, §22, §25, §26, §27.3, §33
- **Classification:** research/diagnostic. No production semantics, no grammar, no audition wiring.

---

## 0. The defect, in the skill's own terms

§27.3 **Circular Validation** — *"generator and validator use the same feature → fake confidence."*

The coverage cell (`consumer-coverage-graph.mjs`) is the generator. The calibration
labeler (`coverage-calibration-labeler.mjs`) is the validator, and §22 requires it to be
**independent from the generator**. It is not:

| Shared feature | Generator | Validator |
|---|---|---|
| production seed set | `prodSeeds`, lines 108-113 | `liveSeeds`, line 89 |
| reach operator | `forwardReach` (BFS) | `reach` (BFS) |

Both hardcode the same prefix list (`codex/server/`, `codex/runtime/`, `src/pages/`,
`src/hooks/`, `src/(App|main|index).`). Production-reach is the feature that decides
DIRECTLY_PINNED vs EXPERIMENTAL_UNDECLARED and carries the headline "audition is tested
but not wired" claim. It is asserted twice, never checked once.

Three further defects:

- §12 **conflation** — `independentLabel` has no RESEARCH_ONLY branch, so it folds
  RESEARCH_ONLY into STRANDED_OR_NONPROD. All 8 RESEARCH_ONLY modules are guaranteed
  disagreements. Roughly half the reported 0.146 disagreement is missing vocabulary.
- §33 **naming** — the script prints `precision`, which has no boring technical
  definition here: there is no ground truth and no positive class. It is inter-labeler
  agreement. The ledger's "Precision = 1.00" is agreement after the cell's own author
  broke all six ties in the cell's favour.
- §26 **clustered observations** — sample modules are drawn from directories
  (`codex/core/animation/amp/*` is 7 near-identical modules). Module-level agreement
  treats them as independent. It must be bootstrapped by directory.

Separately, three of the four reported checks cannot fail:

| Check | Why it cannot fail |
|---|---|
| NOISE anchor: "0 noise rows" | `inDenominator` returns false for `.tmp/`,`_shot`,`_diag` |
| WIP anchor: "5 dirty families are WIP" | `deriveState` returns WIP on its first line for anything dirty |
| Falsifier 1: "254 zero-direct-test modules are TRANSITIVELY_EXERCISED" | `transitiveTest` is *defined* as `testReach && directTest===0` |

---

## 1. Mechanism template (§1)

```text
PHYSICS:         Immune recognition — a validator must not share the generator's
                 receptor, or it re-affirms rather than tests.
SEMANTIC ANALOG: Module lifecycle state (DIRECTLY_PINNED / EXPERIMENTAL_UNDECLARED /
                 TRANSITIVELY_EXERCISED / RESEARCH_ONLY / PRODUCTION_UNTESTED / STRANDED).
STATE:           inbound edge multiset typed by consumer KIND; forward reach from
                 execution entry points; git dirtiness.
OPERATOR:        classify each module by (directTest?, prodReach?, testReach?, kindSet).
OBSERVABLE:      inter-labeler agreement vs an orthogonally-seeded validator;
                 DIRECTLY_PINNED/EXPERIMENTAL_UNDECLARED separation.
CONTROL:         degree-preserving KIND shuffle (§5) — reassign each edge's KIND at
                 random while holding every module's inbound degree fixed.
FALSIFIER:       see §2.
```

## 2. Falsifiers — declared before execution

- **F1 (popularity).** Under a degree-preserving KIND shuffle, if the state distribution
  and the DIRECTLY_PINNED/EXPERIMENTAL_UNDECLARED split survive at within-noise levels,
  the cell reads inbound *degree*, not consumer *kind*, and is a popularity contest.
  Threshold: shuffled DP/EU split must move by more than the shuffle's own SD across
  20 seeds. `R_excess = R_observed − mean(R_shuffled)` must exceed 3 SD.
- **F2 (circularity was load-bearing).** If the orthogonally-seeded v2 labeler agrees
  with the cell at ~0.854 or better *on the production axis specifically*, the shared
  seed list was not doing the work and the original comparison, while circular in form,
  was not circular in effect. If agreement collapses, the seed list WAS the result.
- **F3 (audition).** The headline claim is `audition/* production=false`. If v2 — which
  never mentions `codex/core/` in its seeds — puts any audition module on the live path,
  the claim was an artifact of the prefix list.
- **F4 (clustering).** If directory-bootstrapped agreement CI is much wider than the
  module-level point estimate suggests, the module-level number was overconfident.

**Committed in advance:** I will report whatever these produce, including a drop in
agreement. A v2 labeler tuned until it agrees with the cell is the same fake confidence
in a new coat (§27.3). No labeler edits after first execution.

## 3. What is being changed

1. `scripts/coverage-calibration-labeler-v2.mjs` — NEW. v1 is left byte-identical so the
   0.854 remains auditable.
   - live seeds derived from **execution evidence** (`package.json` scripts, `index.html`
     script src) — never a directory prefix list.
   - full state vocabulary incl. RESEARCH_ONLY (§12).
   - direct-test detection requires **import context**, not bare substring (v1 matched
     `'codex/core/combat.session.js'` as a string argument in `classify.test.js:193`).
   - reports agreement, not precision (§33).
   - random population sample **and** stratified sample; directory-clustered bootstrap CI (§26).
2. `scripts/coverage-popularity-falsifier.mjs` — NEW. Degree-preserving KIND shuffle (§5, §17).
3. `scripts/consumer-coverage-graph.mjs` — emit `dirtyFiles`, `seedProvenance`, `checksum` (§25).
   The 27 WIP rows depend on an uncommitted tree; the artifact stamps `frozenHead` but is
   not regenerable from it. Recording the dirty list makes it replayable.
4. `2026-08-18-atlas-coverage-calibration-ledger.md` — relabel the three unfailable checks,
   replace "precision" with agreement, correct §5.B (only 3 of 11 audition modules are
   EXPERIMENTAL_UNDECLARED; 8 are TRANSITIVELY_EXERCISED).

## 4. What this cannot do (§28 Step 4)

- It cannot establish ground truth. Two labelers agreeing is agreement, not correctness.
- It cannot validate RESEARCH_ONLY against an external standard — it can only stop
  conflating it with STRANDED.
- It does not re-open whether the 2 PRODUCTION_UNTESTED gaps are real. Those were checked
  by hand against the source and hold.
