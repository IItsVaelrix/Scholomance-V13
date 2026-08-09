# PDR: Pressure Field Governor
## Continuous Behavioral Governance as a Deterministic Decision Landscape

**Status:** Phase 0 shipped — separability clock running (since 2026-08-09). Phases 1–5 NOT approved until Phase 0 exit criteria are met.
**Classification:** Architectural | Agent Governance | Semantic Calculus | Deterministic Telemetry | Shadow-Mode
**Priority:** High
**Primary Goal:** Replace post-hoc boolean gating with a deterministic, telemetry-calibrated pressure landscape that steers candidate agent trajectories before execution, with governed Gates that the agent can never self-open.
**Bytecode Search Code:** `SCHOL-ENC-BYKE-SEARCH-PDR-PRESSURE-FIELD-GOVERNOR`

---

## Owner(s)
- **Codex:** field schema (`SCHEMA_CONTRACT.md`), core composition math, registry format and checksums, core-layer review of all imports.
- **Gemini:** backend implementation (CLI wiring, receipt telemetry, calibrator), tests, CI runs.
- **Claude:** no v1 scope (no UI surface). Re-enters only if a receipt inspector UI is requested in a follow-up PDR.
- **Escalation owner** (cross-domain conflicts): Angel (repo owner).

## Amendment record

| Rev | By | Change |
|---|---|---|
| r1 | Qwen | Initial draft. |
| r2 | Claude | Grounds-tagged every justifying claim (§5.0). Retracted the `gate_keeper.py` premise (§1, §11-Q3, §17) — unsupported, and contradicted by live code. Rebased composition on `permission.ts` (§3.1-F2, §9.1). Fixed the lexicographic-collapse defect and the all-deflected selection bug (§9.2). Added the missing outcome field that made F9 unimplementable (§3.3, F8a). Added F10 (no self-scored pressure) and the Phase 0 separability precondition. Added mutation-testing to §15. |
| r3 | Qwen | **Phase 0 implemented and live.** Added `steer_emitter.py` to §7 (shared emitter both governors call — keeps the schema in one place; the governors stay emit-only call sites). Implementation record: ledger core `steer-ledger.ts`, Python emitter, 9/9 governor block sites instrumented, `scholo-gate.mjs --resolve`, 26 TS tests + 13 Python tests green, cross-language fixture byte-identical, golden diff 24/24 byte-identical, 70/70 live checksums valid. **Two-week clock started 2026-08-09** (first receipt `steer-000001` captured 15:04:05Z). Phases 1–5 remain unapproved pending §8 exit criteria. |

## Context (seed — not the Executive Summary)
`scholo-gate.mjs` already scores candidate acts, adjudicates law, assesses speaker trust, and emits receipts — but it picks a single winner and never explains the landscape around it. Nothing records what it *didn't* choose, or why. This PDR extends that existing shadow gate into a multi-source pressure field with Ridges, Corridors, and externally-authorized Gates, and — the part with no precedent in the tree — a deflection record that can later be shown to have been wrong.

## Target Integration Area
- Primary: `scripts/scholo-gate.mjs` (extension via `--steer` / `--resolve`, shadow-only, no default behavior change).
- Core: `codex/core/semantic-calculus/` (new pure modules + declarative registries), composing inside `permission.ts`.
- Telemetry: `bench/semantic-calculus/corpus/steer-receipts.jsonl` (append-only).
- Phase 0 emit sites: `steamdeck_brain/vaelrix_forcefield/search_governor.py`, `tool_governor.py` — receipt emission only; no decision changes.
- Read-only dependencies: `codex/core/pixelbrain/simulate-law-gate.js`, `codex/core/pixelbrain/canonical-json.js`.
- **Not a dependency:** `divtube_downloader/tui/core/gate_keeper.py`. r1 cited it as precedent; the citation is retracted (§5.0) and the file is neither read nor modified.

## Core Concept
Instead of governing an agent through sequential commandments checked after it acts, place every candidate trajectory in a weighted decision landscape. Pressure sources (law, scope, evidence, uncertainty, regression risk, authorization, speaker trust, goal attraction) compose into a per-trajectory pressure vector. A Tier-0 breach is **absorbing**: the candidate leaves the set and no goal attraction can restore it. Everything below that boundary ranks by ordinary weighted sum, because that is what a gradient is for. High-pressure regions (Ridges) deflect; low-pressure corridors guide; controlled weaknesses (Gates) open only under externally verifiable conditions the agent cannot grant itself. Every deflection emits a checksummed receipt **that can later be marked wrong** — without that predicate the telemetry cannot calibrate anything. The meteorological analogy is presentation only; the engineering content is potential-field steering with an absorbing safety boundary, governed exceptions, and telemetry-driven calibration.

## Implementation Philosophy
Extend `scholo-gate.mjs`; do not build a parallel system. All pressure sources must be computed from signals that already have deterministic producers (law scale, risk profile, epistemic flags, utterance trust). No LLM participates in scoring. Nothing executes: the governor is shadow-only and produces receipts, exactly as the semantic calculus gate does today. Small composable modules, adapter seams at uncertain contracts, checksummed registries, append-only telemetry, and every phase independently shippable behind a flag.

## Ownership & Law Compliance
Every file written by this PDR appears in §7 with its owning agent. Core-layer modules live under `codex/core/` and respect the four-layer law (`CODEX.md`): no render-adjacent imports, no nondeterminism, no I/O in the composition core. Schema shapes follow `SCHEMA_CONTRACT.md`. Determinism follows `VAELRIX_LAW.md`: same input → same output → same bytes. Cross-domain conflicts go to Angel in the `**ESCALATION:**` format (§6), never resolved unilaterally.

---

# 1. Executive Summary

`scripts/scholo-gate.mjs` is a shadow-only semantic gate that scores candidate acts, adjudicates law, assesses speaker trust, and emits receipts without ever executing. It picks one winner. The pressure field governor turns that single-winner score into an explainable landscape over candidate trajectories, with Ridges (high-pressure refusals), Corridors (low-pressure preferred paths), and Gates (externally authorized exceptions).

Blast radius is deliberately minimal. v1 adds pure modules to `codex/core/semantic-calculus/`, one new CLI flag (`--steer`), one append-only receipt file, and tests. Default `scholo-gate.mjs` output must remain byte-identical when `--steer` is absent. Nothing executes, nothing enforces, no existing contract changes.

**Two architectural decisions cannot be compromised.**

*First: safety pressure is non-compensable.* A flat weighted sum lets goal attraction out-bid a law violation — reward-hacking compiled into the math. But non-compensability is a property of the **deflection boundary**, not of the ranking order: `codex/core/semantic-calculus/permission.ts` already establishes the correct shape, where a LAW block is an **absorbing zero** (`isZero`) rather than a large number, and `applyModulation` throws `PERMISSION_WIDENED` if any modulator raises authority without an explicit `lawGrant`. Its header states the property this buys: *"the only property in the design that can be proved rather than measured."* This PDR composes inside that algebra rather than beside it (§9.1). Strict lexicographic ordering across *all* tiers — the r1 design — silently kills tiers 1–3 (§9.2); it is not the fix.

*Second: a deflection that cannot be shown wrong is not telemetry.* The r1 receipt recorded which candidate was deflected and by what, but carried no field saying whether deflecting it was **correct** — while F9 proposed to fit weights "from receipt outcomes." That is this repository's named pathology (`project-checks-that-cannot-fail`: *"`Prediction` had no predicate field... Every prediction was decorative prose"*), and it made Phase 4 unimplementable as written. F8a adds the outcome field, and Phase 0 tests whether the resulting data is separable **before** the field is built (§8).

Current status: Draft. Requires §6 escalation answers before Phase 3, and a passing Phase 0 before Phase 1.

# 2. Out of Scope / Non-Goals

- **No execution.** The governor never runs a command. It is shadow-only, like `scholo-gate.mjs` itself.
- **No re-enabling of `gate_keeper.py`.** It stays disabled; this PDR does not touch runtime TUI enforcement.
- **No LLM in the scoring loop.** All pressure values derive from deterministic code paths.
- **No autonomous Gates.** The agent may request a Gate; it can never open one. No self-authorization, ever.
- **No automatic weight application.** Calibration proposes; a human commits.
- **No physical meteorology.** The analogy is naming only.
- **No replacement of the denial ledger** (`codex/core/pixelbrain/calibration/denial-store.js`); steer receipts are a sibling store with a different schema.
- **No UI.** Receipt inspection is CLI/file in v1.
- **Not in scope for v1:** recursive cross-scope field composition beyond the action level (Phase 5, flag-gated, may be deferred to a follow-up PDR).

# 3. Spec Sheet

## 3.1 Functional Spec

**F1 — Pressure vector.** Every candidate trajectory receives a pressure vector with named sources: `law`, `authorization`, `destructive` (Tier 0 — safety); `scope`, `regression`, `dependency` (Tier 1 — structure); `evidence`, `uncertainty` (Tier 2 — epistemic); `goal` as attraction, i.e. negative pressure (Tier 3).

**F2 — Composition: absorbing boundary, compensable interior.** Within a tier: weighted sum. If Tier 0 pressure reaches `RIDGE_CEILING` (fixed constant `1.0`), the trajectory is **removed from the candidate set** — not ranked last — regardless of any lower-tier value. This is the absorbing zero, modelled on `permission.ts:isZero`, and it is the *only* place non-compensability applies. Among surviving candidates, ranking is an ordinary weighted sum across tiers, because below the ridge compensation is the entire point of a gradient. *Acceptance:* (a) `goal` attraction at maximum with `law` above ceiling must still DEFLECT; (b) two candidates differing only in Tier 2 must rank in Tier-2 order — the r1 strict-lexicographic rule failed (b), which is how the defect was found.

**F2a — Permission monotonicity.** Every pressure source is expressed as a `Modulator` over `permission.ts:ModulatableState` and composed through `applyModulation`. A source may only *lower* permission; widening requires an explicit `lawGrant` and reason, recorded as a `PermissionGrantRecord`. *Acceptance:* a synthetic source that raises `kind` without a grant must throw `SEMANTIC_CALCULUS_PERMISSION_WIDENED`. This is what makes "no pressure source can smuggle authority" a proved property rather than a reviewed one.

**F3 — Ridges.** Declarative high-pressure regions: `{ id, tier, law_refs[], pressure_fn, conditions, severity }`. `pressure_fn` is a named deterministic function from a fixed registry — no arbitrary expressions.

**F4 — Corridors.** Ordered preferred paths: `{ id, goal_pattern, steps[], attraction, entry_conditions }`. The bug corridor is the reference instance: inspect → reproduce → identify-layer → trace-deps → isolate-root-cause → minimal-patch → regression-test.

**F5 — Gates.** `{ id, ridge_id, unlock_conditions[], authorizer, audit_log[], expiry }`. `unlock_conditions` reference only verifiable facts: `tests_pass`, `deps_mapped`, `law_audit_pass`, `human_approval_token`. Evaluation is a pure function `(gate, evidence, authorizer) → open | closed`. Missing or unverified evidence ⇒ closed. Agent-provided self-attestation is structurally impossible: the evidence object is loaded from artifacts, not from the agent's claims.

**F6 — Trajectory ranking.** `evaluateField(candidates, field, context)` returns a ranked list with full pressure vectors, the selected corridor, and a deflection entry for every rejected candidate.

**F7 — Local-minimum escape.** A progress term penalizes no-op and infinite deferral; if two corridors tie within `EPSILON` (fixed `1e-9`), prefer the one with more evidence receipts; bounded backtracking depth `MAX_RECONSIDER = 2`.

**F8 — Receipts.** Every evaluation appends one `PB-STEER-v1` JSONL receipt (§3.3) answering: why this action, what blocked the others, which source dominated, whether a Gate was considered, which corridor was selected.

**F8a — Outcome (the predicate).** A receipt is written with `outcome: null`. A separate command (`scholo-gate --resolve <steer-id> --outcome <verdict>`) appends a *new* row — never mutating the original, per the denial ledger's append-only discipline — carrying `succeeded | regressed | needed_rework | deflection_was_wrong`. **A deflection nobody can mark wrong is not evidence; it is decorative prose.** `deflection_was_wrong` is the load-bearing value: it is the only signal that can falsify a weight. *Acceptance:* a test asserting that a receipt with `outcome: null` is invisible to the calibrator, and that resolution rows never overwrite evaluation rows.

**F9 — Calibration (proposal-only, and gated on F8a).** An offline script fits per-tier weights **from resolved receipts only** and writes a **proposed** weights file with checksum. Applying it requires a human commit. The live field never reads uncommitted proposals. *Precondition:* the calibrator refuses to emit a proposal below `MIN_RESOLVED = 40` resolved receipts and reports the shortfall rather than fitting noise — the units trap from `project-semantic-calculus-adjudicates-scores` applies here too.

**F10 — No self-scored pressure.** No pressure value may be authored by the candidate it ranks, or by the module that proposed it. Every source resolves from an artifact with an independent producer (law scale, test results, dependency map, epistemic flags, utterance provenance). *Rationale — measured:* `steamdeck_brain/vaelrix_forcefield/determinism_auditor.py:238` hardcodes `novelty=0.7, actionability=0.9` into `ResonanceScore` and those literals are the arbiter's ranking input; the adjacent `evidenceStrength` line was already fixed for exactly this and carries the comment *"Derived, not asserted... Reporting 1.0 there claimed perfect evidence from an audit of nothing."* One of five axes was audited. *Acceptance:* a registry test asserting every `pressure_fn` names a producer module distinct from the candidate proposer.

## 3.2 Non-Functional Spec

- **Determinism:** same utterance + lexicon + registries + context → identical receipt bytes (timestamps are metadata only, excluded from the receipt checksum). Verified by 100-iteration repeat test, mirroring the BytecodeHealth determinism ritual.
- **Latency:** `--steer` evaluation < 150 ms on the dev machine for ≤ 8 candidates (measured, asserted in a perf test with generous bound).
- **Memory:** registries < 64 KB total; no unbounded in-process caches.
- **Auditability:** every receipt must be answerable by a human in < 30 seconds.
- **Failure mode:** any field-module exception degrades to the existing non-steer path with a warning line; it must never crash `scholo-gate.mjs`.

## 3.3 Contracts

Receipt schema (append-only `bench/semantic-calculus/corpus/steer-receipts.jsonl`):

```json
{
  "schema": "PB-STEER-v1",
  "id": "steer-<monotonic counter, zero-padded>",
  "utterance": "<string>",
  "candidates": [
    {
      "key": "<candidate key>",
      "pressure": {
        "law": 0.91, "authorization": 0.0, "destructive": 0.2,
        "scope": 0.88, "regression": 0.1, "dependency": 0.05,
        "evidence": 0.63, "uncertainty": 0.15, "goal": -0.84
      },
      "tiers": { "t0": 1.11, "t1": 1.03, "t2": 0.78, "t3": -0.84 },
      "result": "DEFLECTED | PERMITTED | GATED_OPEN | GATED_CLOSED | STALLED",
      "dominant_source": "law",
      "gate_considered": "<gate id or null>"
    }
  ],
  "selected_trajectory": "<corridor id or candidate key, or null when STALLED>",
  "verdict": "PERMITTED | STALLED",
  "outcome": null,
  "field_checksum": "<sha256:12 of registries+weights>",
  "capturedAt": "<ISO timestamp, EXCLUDED from checksum>"
}
```

Resolution row (appended later by `--resolve`, never a mutation of the row above):

```json
{
  "schema": "PB-STEER-RESOLVE-v1",
  "steer_id": "steer-000123",
  "outcome": "succeeded | regressed | needed_rework | deflection_was_wrong",
  "deflected_candidate": "<key, required when outcome is deflection_was_wrong>",
  "note": "<string>",
  "capturedAt": "<ISO timestamp>"
}
```

Registry checksum: `sha256(canonicalStringify(registries)).slice(0, 12)` using the existing `codex/core/pixelbrain/canonical-json.js`.

`selected_trajectory` is `null` when every candidate deflects. It is never a deflected candidate — see §9.2.

**Deferred to follow-up PDR:** recursive scope composition (action → task → subsystem → project), anomaly detector over receipt streams, receipt inspector UI.

# 4. Change Classification

- **behavioral** — candidate ranking gains a multi-source landscape and deflection receipts; single-winner behavior preserved when `--steer` is off.
- **structural** — new pure modules and declarative registries under `codex/core/semantic-calculus/`.
- **architectural** — introduces graded trajectory governance with an absorbing safety boundary as a reusable primitive, composed inside the existing `permission.ts` algebra rather than beside it. Phase 0 alone is **structural**, not architectural: it adds a ledger and changes no decision.
- Not **cosmetic** — no output formatting changes in the default path.

# 5. Assumptions and Unknowns

## 5.0 Grounds

Every justifying claim carries `measured | architectural | judgement`, per the denial ledger's axis (`scripts/deny.mjs`). **JUDGEMENT is honest, not lesser — marking a stance MEASURED lends it authority it did not earn (LBL-004).**

| Claim | Grounds | Basis |
|---|---|---|
| `scholo-gate.mjs` scores candidates, adjudicates law, and executes nothing | measured | read at `scripts/scholo-gate.mjs` |
| Permission composition can be *proved* non-widening | measured | `permission.ts:88-106`, `applyModulation` throws `PERMISSION_WIDENED` |
| A weighted-sum pressure field already exists here and has never been calibrated | measured | `council_arbiter.py:23`; `personality_weighting.py:15-33`; no resonance vector is persisted anywhere (only `persistence.py:164`, a deserializer) |
| Pressure sensors already self-score | measured | `determinism_auditor.py:238` |
| r1's strict-lexicographic ranking makes tiers 1–3 dead | architectural | follows from float tiers + `EPSILON = 1e-9`; test in §9.8 |
| A continuous landscape will produce better trajectories than the current single winner | **judgement** | **unproven. This is the PDR's central bet and Phase 0 exists to test it.** |
| Five-to-eight pressure sources are the right granularity | **judgement** | no basis yet; U1 |

**Retracted from r1 (do not reintroduce):** *"`gate_keeper.py` was disabled because binary gating was too blunt; it is the evidence this design is needed."* The commit that disabled it (`82a579d0`, *"land today's phenotypic idealism, gated truesight, and subtlety work"*) never mentions the gate — **no reason is on record**. And structurally identical boolean gating (repeated-call detection, per-phase budgets, redundancy blocks) is live right now in `tool_governor.py` and `search_governor.py`, wired at `action_engine.py:84` and `:125`, `brain_bridge.py:217`, and `code_brain.py:261`. What was switched off was a TUI tool-spam cooldown; the architecturally central boolean governor is running. The claim was `judgement` presented as `measured`, and it was carrying the PDR's headline conclusion.

## 5.1 Assumptions

- A1 *(measured)*: `lexicalProposer.propose` candidate lists are stable enough to pressure-rank (already score-sorted in `scholo-gate.mjs`).
- A2 *(measured, corrected)*: `simulate-law-gate.js` scale is **ternary** — `{0, 0.7, 1.0}`, documented at line 68 — not continuous. It is a usable Tier-0 input, but it supplies three levels, not a gradient. r1 described it as a "continuous law scale"; it is not, and no part of the design may assume gradient resolution from it.
- A3 *(architectural)*: utterance trust/taint (`userUtterance` / `derivedUtterance`) is the correct authorization signal.
- A4 *(measured)*: append-only JSONL at `bench/semantic-calculus/corpus/` is an acceptable telemetry sink (it already hosts `cli-intents.jsonl`).
- A5 *(measured)*: `permission.ts` is the composition substrate; no parallel algebra is introduced.

## 5.2 Unknowns

- U1: whether 5–8 pressure sources suffice before calibration has signal — resolve empirically in Phase 4, not by speculation.
- U2: **whether the receipt stream is separable at all.** This is not a scheduling question. `council_arbiter._score_result` is already a five-axis weighted-sum pressure field with hand-typed weights, `personality_weighting.py` adds twelve more tables, and because no resonance vector is ever persisted, it has been running uncalibrated for its entire life and structurally *cannot* be calibrated. **This repository has already run the "build the field, calibrate it later" experiment once and collected zero data.** Phase 0 exists so that failure is not repeated at larger scale. If resolved receipts cannot separate good trajectories from bad, the pressure field is refuted and the receipt ledger is kept as the deliverable.
- U3: whether Tier-0 having only three achievable levels (A2) leaves the deflection boundary too coarse to discriminate. Measured in Phase 0.

# 6. Open Questions / Escalations

**ESCALATION:** Should v1 steer receipts include the full candidate list or top-k only (corpus growth vs audit completeness)? Owner: Codex.

**ESCALATION:** May a future phase wire the field into TUI tool-call governance (replacing the disabled `gate_keeper.py` path), or does the field remain CLI-shadow-only permanently? This touches disabled-gate jurisdiction and must be decided before any runtime enforcement is even prototyped. Owner: Angel.

**ESCALATION:** Does committing a calibrated weights vector count as a core schema change requiring Codex sign-off under `SCHEMA_CONTRACT.md`, or as a data update? Owner: Codex + Angel.

# 7. Architecture / File Map

```
codex/core/semantic-calculus/
  steer-ledger.ts            NEW  Gemini  PHASE 0. receipt + resolution writers, reader, validation
  pressure-field.ts          NEW  Codex   pure composition: vectors, tiers, ranking, absorbing boundary
  field-registry.ts          NEW  Codex   ridge/corridor/gate loaders + checksum
  field-defs/
    ridges.json              NEW  Codex   declarative Ridges (seed: law-violation, destructive-rewrite, bypass-tests)
    corridors.json           NEW  Codex   declarative Corridors (seed: bug-fix corridor)
    gates.json               NEW  Codex   declarative Gates (seed: architectural-rewrite gate)
scripts/
  scholo-gate.mjs            MOD  Gemini  add --steer and --resolve; default path untouched
  calibrate-field.mjs        NEW  Gemini  offline proposal-only weight fitter (+ shuffled control)
steamdeck_brain/vaelrix_forcefield/
  steer_emitter.py           NEW  Qwen    PHASE 0 (r3). shared emitter both governors call; schema,
                                          checksum, swallow discipline in one place
  search_governor.py         MOD  Gemini  PHASE 0. emit a steer receipt on block (behaviour unchanged)
  tool_governor.py           MOD  Gemini  PHASE 0. emit a steer receipt on block (behaviour unchanged)
bench/semantic-calculus/corpus/
  steer-receipts.jsonl       NEW  (runtime artifact, append-only; live since 2026-08-09)
tests/semantic-calculus/
  steer-ledger.test.js       NEW  Gemini  PHASE 0. append-only, null-outcome invisibility, malformed-row throw
  fixtures/steer-row-from-python.jsonl  NEW  Qwen  PHASE 0 (r3). cross-language contract fixture
  pressure-field.test.js     NEW  Gemini  composition, absorbing boundary, tier reachability, determinism
  field-gates.test.js        NEW  Gemini  gate refusal, external authorization, checksums
steamdeck_brain/vaelrix_forcefield/tests/
  test_steer_emitter.py      NEW  Qwen    PHASE 0 (r3). emit-only decision parity, swallow, fixture drift
```

The two `_governor.py` modifications are **emit-only**: they add a receipt write on an already-computed block decision and must not change any allow/block outcome. A test asserts the decision is byte-identical with the emitter stubbed out.

Dependency direction: `scripts/scholo-gate.mjs` → `pressure-field.ts` → `field-registry.ts` → `field-defs/*.json`; `pressure-field.ts` reads (never writes) `simulate-law-gate.js` outputs passed in by the CLI layer. The composition core performs zero I/O; all file reads live in the registry loader and CLI.

# 8. Step-by-Step Implementation Plan

**Phase 0 — Separability precondition (Gemini, ~half a day + 2 weeks elapsed). BLOCKS PHASE 1.**
Ship *only* the deflection ledger: the `PB-STEER-v1` / `PB-STEER-RESOLVE-v1` writers, and instrumentation of the two sites that already deflect and already know why — `search_governor.should_allow_search` and `tool_governor.should_allow_tool_call`. Both already produce a structured reason and a tier and currently discard it into `field.search.blockedSearches`, which nothing reads. No field, no tiers, no ridges.

Run for two weeks. Exit criteria — **all three must hold, and any failure refutes the PDR**:
1. ≥ `MIN_RESOLVED` (40) receipts carry a non-null outcome.
2. At least one receipt carries `deflection_was_wrong`. *If nothing was ever wrongly deflected, the ledger cannot falsify a weight and the calibrator has no gradient to descend — the instrument is a check that cannot fail.*
3. A logistic fit over the recorded pressure features separates `succeeded` from `regressed ∪ needed_rework` better than a shuffled-label control, reported with the control's score alongside.

If (3) fails, **stop.** Do not build the field. The receipt ledger is a genuinely useful artifact on its own — it is the half of the denial ledger that records counterfactuals rather than refusals — and shipping it alone is a legitimate, non-embarrassing outcome to be recorded in the PIR. This inverts the r1 risk profile, which built the landscape and *hoped* telemetry would calibrate it later; see U2 for why that hope already failed once here.

**Phase 1 — Core field (Codex, ~1 day). Requires Phase 0 exit criteria met.** Milestone: `pressure-field.ts` + `field-registry.ts` + registries imported by tests only. Exit criteria: all unit tests green; 100-iteration determinism test passes; registry checksum stable across reloads.

**Phase 2 — CLI wiring + telemetry (Gemini, ~1 day).** Milestone: `scholo-gate.mjs --steer` emits receipts; default output byte-identical without the flag. Exit criteria: golden-output diff test passes for 12 existing intents; receipt answers all seven audit questions; exception in field code degrades to warn, never crash.

**Phase 3 — Gates (Codex + Gemini, ~1 day).** Requires §6 escalations answered. Milestone: seeded rewrite gate openable only with `human_approval_token` + evidence artifacts. Exit criteria: test proving agent-only evidence yields `GATED_CLOSED`; test proving a valid authorizer token yields `GATED_OPEN` with audit entry.

**Phase 4 — Calibrator, proposal-only (Gemini, ~1 day).** Milestone: `calibrate-field.mjs` reads receipts, writes `field-defs/weights.proposed.json` + checksum, and refuses to touch `weights.json`. Exit criteria: test proving no write to the live weights file; test proving a corrupted receipt line is skipped and counted, not fatal.

**Phase 5 — Recursive scopes + anomaly flag (owner TBD, deferred).** Behind `--steer-scopes`; may move to a follow-up PDR if §6 escalations delay Phase 3.

Each phase is independently shippable: everything is off unless `--steer` is passed.

# 9. Code Examples — Pivotal Changes

**9.1 Composition — absorbing boundary, compensable interior (the decision that cannot be flat-summed):**

```ts
// codex/core/semantic-calculus/pressure-field.ts
export const RIDGE_CEILING = 1.0;
export const EPSILON = 1e-9;
const TIER_SOURCES = [
  ['law', 'authorization', 'destructive'],          // T0 safety — non-compensable
  ['scope', 'regression', 'dependency'],            // T1 structure
  ['evidence', 'uncertainty'],                      // T2 epistemic
  ['goal'],                                         // T3 attraction (negative)
] as const;

export function composeTiers(p: PressureVector, weights: Record<string, number>) {
  return TIER_SOURCES.map((sources) =>
    sources.reduce((acc, s) => acc + (p[s] ?? 0) * (weights[s] ?? 1), 0));
}

// The ONLY non-compensable rule. An absorbing boundary, not a big number —
// permission.ts:isZero. Goal attraction can never rescue a Tier-0 breach.
export function deflects(tiers: number[]): boolean {
  return tiers[0] >= RIDGE_CEILING;
}

// Ranking BELOW the ridge is compensable on purpose. TIER_RANK_WEIGHTS are
// bounded and descending so a lower tier still moves the order.
const TIER_RANK_WEIGHTS = [1.0, 0.6, 0.35, 1.0] as const;   // T3 is attraction (negative)

export function rankScore(tiers: number[]): number {
  return tiers.reduce((acc, t, i) => acc + t * TIER_RANK_WEIGHTS[i], 0);
}
```

**9.2 Ranking (absorbing removal, compensable interior, deterministic total order):**

> **r1 defect, fixed here.** The r1 sort compared tiers strictly lexicographically with an `EPSILON = 1e-9` tie window. Tier scores are computed floats, so exact ties beyond 1e-9 essentially never occur — which means the loop returned on `t = 0` every time and **tiers 1–3 were dead code**. The multi-tier structure was decorative below the safety tier. Second r1 defect: deflected candidates were sorted to the *end* rather than removed, so when every candidate deflected, §9.6 wrote `ranked[0]` — a deflected candidate — into `selected_trajectory`. Both are fixed below.

```ts
export function evaluateField(candidates: Candidate[], field: Field, weights: Weights) {
  const scored = candidates.map((c) => {
    const tiers = composeTiers(c.pressure, weights);
    return {
      key: c.key, tiers,
      deflected: deflects(tiers),
      dominant: dominantSource(c.pressure, weights),
      evidenceCount: c.evidenceReceipts.length,
    };
  });

  const deflected = scored.filter((s) => s.deflected);
  const survivors = scored.filter((s) => !s.deflected).sort((a, b) => {
    const ra = rankScore(a.tiers), rb = rankScore(b.tiers);
    if (Math.abs(ra - rb) > EPSILON) return ra - rb;        // lower pressure wins
    if (a.evidenceCount !== b.evidenceCount) return b.evidenceCount - a.evidenceCount;
    return a.key < b.key ? -1 : 1;                          // total order, no RNG
  });

  // Absorbing means REMOVED. Nothing deflected may ever be selected.
  return {
    survivors, deflected,
    verdict: survivors.length ? 'PERMITTED' : 'STALLED',
    selected: survivors[0]?.key ?? null,
  };
}
```

**9.3 Registry loader with checksum (tamper-evident, deterministic):**

```ts
// codex/core/semantic-calculus/field-registry.ts
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { canonicalStringify } from '../../pixelbrain/canonical-json.js';

export function loadField(defsDir: string) {
  const ridges = JSON.parse(readFileSync(`${defsDir}/ridges.json`, 'utf8'));
  const corridors = JSON.parse(readFileSync(`${defsDir}/corridors.json`, 'utf8'));
  const gates = JSON.parse(readFileSync(`${defsDir}/gates.json`, 'utf8'));
  const field = { ridges, corridors, gates };
  const checksum = createHash('sha256').update(canonicalStringify(field)).digest('hex').slice(0, 12);
  return { field, checksum };
}
```

**9.4 Gate evaluation — the agent can never open its own gate:**

```ts
export function gateOpen(gate: Gate, evidence: EvidenceArtifacts, authorizer: string | null) {
  const factsOk = gate.unlock_conditions.every((c) => evidence[c] === true);  // artifacts, not claims
  if (!factsOk || !authorizer) return { open: false, reason: factsOk ? 'no-authorizer' : 'conditions-unmet' };
  return { open: true, audit: { gate: gate.id, authorizer, facts: gate.unlock_conditions } };
}
```

**9.5 Receipt writer (append-only, timestamp excluded from checksum):**

```ts
export function steerReceipt(entries: RankedCandidate[], selected: string, fieldChecksum: string) {
  const { checksum, capturedAt, ...body } = { /* full receipt */ } as never;
  const payload = { schema: 'PB-STEER-v1', candidates: entries, selected_trajectory: selected, field_checksum: fieldChecksum };
  const rcptChecksum = createHash('sha256').update(canonicalStringify(payload)).digest('hex').slice(0, 16);
  return JSON.stringify({ ...payload, checksum: rcptChecksum, capturedAt: new Date().toISOString() });
}
```

**9.6 scholo-gate wiring — additive, flag-gated, crash-proof:**

```js
// scripts/scholo-gate.mjs (additions only; existing paths untouched)
const asSteer = args.includes('--steer');
if (asSteer) {
  try {
    const { field, checksum } = loadField(new URL('../codex/core/semantic-calculus/field-defs/', import.meta.url).pathname);
    const r = evaluateField(proposal.candidates.map(toPressured), field, weights);
    appendFileSync(RECEIPTS, steerReceipt(r, checksum) + '\n');   // selected is null when STALLED
    console.log(r.verdict === 'STALLED'
      ? `  steer: STALLED — all ${r.deflected.length} candidates deflected; escalate to Clarify`
      : `  steer: ${r.selected}  field=${checksum}`);
  } catch (err) {
    console.log(`  steer: degraded (${err.message}) — default path unchanged`);
  }
}
```

**9.7 Determinism test (100 iterations, byte-identical):**

```js
// tests/semantic-calculus/pressure-field.test.js
it('same input → same bytes, 100 times', () => {
  const field = loadField(FIXTURES);
  const first = steerReceipt(evaluateField(CANDS, field.field, W), 'a', field.checksum);
  for (let i = 0; i < 99; i++) {
    expect(steerReceipt(evaluateField(CANDS, field.field, W), 'a', field.checksum)).toBe(first);
  }
});
```

**9.8 The falsification tests — and the mutation that proves they are real:**

Per `project-checks-that-cannot-fail`, asserting the right output is necessary but not sufficient: **the step that makes a falsifier real is breaking the code on purpose and watching it fail.** Each guard below ships with its mutation recorded in §15.

```js
it('max goal attraction cannot rescue a law violation', () => {
  const c = { key: 'rewrite', pressure: { law: 1.2, goal: -100 }, evidenceReceipts: [] };
  const r = evaluateField([c, INSPECT], loadField(FIXTURES).field, W);
  expect(r.selected).toBe('inspect');
  expect(r.deflected.map((d) => d.key)).toContain('rewrite');
  expect(r.survivors.map((s) => s.key)).not.toContain('rewrite');   // removed, not ranked last
});
// MUTATION: change `deflects` to `tiers[0] > 1e9`. Must go red.

it('all candidates deflected yields STALLED and selects nothing', () => {
  const r = evaluateField([VIOLATION_A, VIOLATION_B], loadField(FIXTURES).field, W);
  expect(r.verdict).toBe('STALLED');
  expect(r.selected).toBeNull();          // the r1 bug returned a deflected candidate here
});
// MUTATION: restore `selected: scored[0].key`. Must go red.

it('a lower tier still changes the order (tiers 1-3 are not decorative)', () => {
  const a = { key: 'a', pressure: { law: 0.5, evidence: 0.9 }, evidenceReceipts: [] };
  const b = { key: 'b', pressure: { law: 0.5, evidence: 0.1 }, evidenceReceipts: [] };
  expect(evaluateField([a, b], loadField(FIXTURES).field, W).selected).toBe('b');
});
// MUTATION: restore r1's strict lexicographic loop with EPSILON=1e-9. Must go red.
// This test is why the r1 composition was rejected; it did not exist in r1.

it('no pressure source may widen permission without a lawGrant', () => {
  const rogue = { id: 'rogue', apply: (s) => ({ ...s, kind: 'Do' }) };   // no lawGrant
  expect(() => applyModulation({ kind: 'Probe' }, [rogue]))
    .toThrow(SEMANTIC_CALCULUS_ERRORS.PERMISSION_WIDENED);
});
// MUTATION: delete the `if (!m.lawGrant) throw` line in permission.ts. Must go red.

it('an unresolved receipt is invisible to the calibrator', () => {
  const rows = [{ id: 'steer-1', outcome: null }, { id: 'steer-2', outcome: 'succeeded' }];
  expect(fitWeights(rows).sampleSize).toBe(1);
});
// MUTATION: make the calibrator treat `outcome: null` as `succeeded`. Must go red.
```

# 10. Glossary

- **Pressure field** — the composed per-trajectory resistance landscape; a deterministic function, not a physical model.
- **Ridge** — declarative high-pressure region that deflects a category of trajectories.
- **Corridor** — ordered low-pressure preferred path toward a goal class.
- **Gate** — externally authorized, auditable weakness in a Ridge; never self-openable.
- **Tier** — priority band grouping related pressure sources. Tier 0 carries the absorbing deflection boundary; tiers 1–3 are compensable ranking inputs.
- **Non-compensable** — a property of the deflection *boundary*: past `RIDGE_CEILING` the candidate is removed and no attraction can restore it. It is not a property of the ranking order.
- **Absorbing** — removed from the candidate set entirely, never ranked last. Modelled on `permission.ts:isZero`.
- **Grounds** — `measured | architectural | judgement`, borrowed from the denial ledger. Every justifying claim in this PDR carries one (§5.0).
- **Predicate** — the field on a receipt that can make it wrong. A record without one cannot calibrate anything (F8a).
- **Local minimum** — stall where all neighbors are higher pressure; escaped via evidence tiebreak and bounded reconsideration.
- **Receipt** — append-only checksummed JSONL record of one evaluation.
- **Field checksum** — sha256 prefix over canonical registries+weights; tamper evidence.
- **Shadow-only** — evaluates and records; executes nothing.

# 11. Q&A — Top 10 Implementation Concerns

**Q1: Why not a single weighted sum?** Because it makes safety purchasable: enough goal attraction out-bids a law violation. The fix is an **absorbing deflection boundary** on Tier 0 (§9.1) — a candidate over the ridge is removed from the set, not given a large number. Below that boundary a weighted sum is correct and desirable; that is what a gradient *is*. r1 answered this with strict lexicographic ordering across all four tiers, which over-applies non-compensability and makes tiers 1–3 unreachable (§9.2). Non-compensability belongs to the boundary, not the ordering — which is precisely the distinction `permission.ts` already draws between `isZero` and `permissionLte`.

**Q2: Won't the agent learn to aim for zero-pressure no-ops?** The goal term is attraction (negative pressure) and the progress term penalizes no-op; a trajectory that satisfies nothing is not low-pressure, it is stalled (result `STALLED`).

**Q3: Isn't the disabled `gate_keeper.py` proof that boolean gating fails?** No, and r1 was wrong to lean on it — see §5.0 *Retracted*. No reason for its disabling is on record, and equivalent boolean gating runs live today in `tool_governor.py` / `search_governor.py`. The honest case for this PDR is *not* "boolean failed." It is narrower and better supported: the existing gate picks one winner and **keeps no record of what it rejected or why**, so no one — human or agent — can audit a non-choice or ever discover that a rejection was wrong. That gap is measured, and Phase 0 addresses it directly. Note also that this design does *not* replace boolean gating: the Tier-0 deflection boundary is itself categorical (§9.1), exactly as `permission.ts:isZero` is.

**Q3a: Then why a field at all, rather than just the ledger?** That is the open question, and it is deliberately not assumed. Phase 0 answers it with data. If the ledger turns out not to be separable, the field is refuted and the ledger ships alone.

**Q4: Where does the law pressure come from?** `simulate-law-gate.js` scale ({0, 0.7, 1.0}) mapped into Tier 0; `adjudicateLaw` escalate/allow decisions raise authorization pressure. No new law logic is invented.

**Q5: Can the agent forge evidence to open a Gate?** No. `unlock_conditions` resolve against loaded artifacts (test results, dependency maps, approval tokens), and the evidence object is constructed by the CLI layer from files, never from agent output.

**Q6: What happens when two corridors tie?** Evidence-count tiebreak, then corridor id lexical order — deterministic, no RNG (§9.2).

**Q7: Does `--steer` change existing output?** No. The default path is untouched; steering output is additional lines, and a golden-diff test enforces byte-identical non-steer output (§13).

**Q8: How are weights versioned?** `field-defs/weights.json` is committed like code; the calibrator only ever writes `weights.proposed.json`; applying requires a human commit (§6 escalation, Phase 4).

**Q9: What if a pressure source has no signal for a candidate?** Missing sources default to `0` in composition — absence of evidence is not pressure. The receipt records the raw vector, so silent zeros are visible.

**Q10: Why JSON registries instead of code?** Declarative defs are diffable, checksummable, and editable without touching composition logic; `pressure_fn` is a *name* resolved against a fixed code registry, never an evaluated expression.

# 12. QA Plan

New tests (exact paths):
- `tests/semantic-calculus/steer-ledger.test.js` — **Phase 0.** Append-only (resolution never mutates an evaluation row); a `null` outcome is invisible to the calibrator; a malformed row **throws rather than being skipped** (denial-store discipline); governor decisions unchanged with the emitter stubbed.
- `tests/semantic-calculus/pressure-field.test.js` — composition, absorbing boundary, **tier reachability**, STALLED selects nothing, permission monotonicity, determinism (100-iter), all §9.8 falsification tests.
- `tests/semantic-calculus/field-gates.test.js` — gate refusal without authorizer, open with authorizer+artifacts, checksum tamper detection, registry reload stability.

**Mutation protocol (required, not optional).** For each of the five mutations named in §9.8: apply it, run the suite, record the failing test name and message, revert. A guard that stays green under its mutation is not a guard — delete it or fix it, and say which in the PIR. This is the step that was missing from r1's QA plan, and it is the step the denial-ledger commit (`55609070`) performed on its own two load-bearing guards.

Commands (npm + vitest, project-standard):
```bash
npx vitest run tests/semantic-calculus/pressure-field.test.js tests/semantic-calculus/field-gates.test.js
npx vitest run tests/semantic-calculus/            # no regression in the calculus suite
npm run typecheck                                  # core module typing
node scripts/scholo-gate.mjs "run the tests"       # default path unchanged
node scripts/scholo-gate.mjs --steer --json "rewrite the parser"   # receipt emitted
```

Example runnable test (determinism, §9.7) ships with the implementation; every test asserts on exact values, never ranges, except the perf bound (< 150 ms).

# 13. Regression Risks and Specific Retest Checklist

| Risk | Retest |
|---|---|
| Default scholo-gate output drifts | Golden-diff: 12 fixed intents, `node scripts/scholo-gate.mjs <intent>` output byte-compared against committed fixtures |
| Semantic calculus suite regressions | `npx vitest run tests/semantic-calculus/` all green |
| Denial store disturbed | `npx vitest run tests/core/pixelbrain/denialStore.test.js` all green |
| Law gate altered | `simulate-law-gate.js` is read-only; `npx vitest run` on any pixelbrain assay suite still green |
| Corpus pollution | `steer-receipts.jsonl` only written with `--steer`; verify absent writes in default runs |

# 14. Rollout Plan

- **Incomplete-but-safe:** the system ships inert. Without `--steer`, nothing changes. A broken field module degrades to a warning line (§3.2).
- **Shadow mode is the mode.** v1 never enforces; enforcement is a separate decision owned by the §6 escalation to Angel.
- **Feature flag:** the `--steer` flag itself. No env vars, no config toggles.
- **Phase 0 first, always.** The ledger ships and runs for two weeks before any field module is written. If its exit criteria fail, rollout ends there and the ledger stays as the deliverable.
- **Canary:** the first week of receipts is reviewed manually for false-positive deflections before any weight calibration is considered.
- **Rollback:** revert the merge commit; delete `bench/semantic-calculus/corpus/steer-receipts.jsonl` if desired (append-only, nothing reads it backwards). One commit in, one commit out.

# 15. Definition of Done

- [ ] `npx vitest run tests/semantic-calculus/pressure-field.test.js tests/semantic-calculus/field-gates.test.js` — all pass.
- [ ] 100-iteration determinism test passes (byte-identical receipts).
- [ ] **Phase 0 exit criteria met and recorded**, including the shuffled-label control score printed beside the real fit. A fit reported without its control is not evidence.
- [ ] Falsification test passes: max goal attraction cannot rescue a law violation.
- [ ] **Every guard in §9.8 mutation-tested and confirmed red when broken**, with the five mutations applied one at a time and the failure output pasted into the PIR. A green suite proves nothing until the guards have been shown capable of going red — `project-checks-that-cannot-fail`. This box may not be ticked by reading the tests.
- [ ] Tiers 1–3 demonstrably affect ranking (§9.8 test 3) — the r1 defect cannot silently return.
- [ ] `STALLED` never yields a non-null `selected_trajectory` (§9.8 test 2).
- [ ] Permission monotonicity holds: a source that widens without `lawGrant` throws (F2a).
- [ ] No `pressure_fn` resolves to a producer that is also the candidate proposer (F10).
- [ ] Calibrator refuses below `MIN_RESOLVED = 40` and reports the shortfall instead of fitting (F9).
- [ ] Gate test passes: agent-only evidence ⇒ `GATED_CLOSED`; authorizer token ⇒ `GATED_OPEN` with audit entry.
- [ ] Golden-diff: 12 default-path intents byte-identical with and without the field modules present.
- [ ] `npm run typecheck` clean for new modules.
- [ ] `steer-receipts.jsonl` written only under `--steer`; zero writes otherwise (verified by test).
- [ ] Registry checksum stable across process reloads (test).
- [ ] This PDR committed with bytecode search code; PIR filename reserved (§18).

# 16. Final Architectural Verdict

**Conditionally approved — Phase 0 only. Phases 1–5 are not approved until Phase 0 exits green.**

The design survives falsification with six named conditions, all encoded above: a non-compensable safety *boundary* rather than lexicographic ordering (F2, §9.2), composition inside `permission.ts` so no-widening is proved rather than reviewed (F2a), calibration that is proposal-only and refuses below a sample floor (F9), an outcome field without which calibration was unimplementable (F8a), no self-scored pressure (F10), and a goal/progress term preventing paralysis (F7).

The physics is borrowed — artificial potential fields (Khatib, 1986) and weighted-sum MCDA are forty years old — and this PDR says so rather than overselling the metaphor. Note the known failure mode inherited with it: potential fields stall in **local minima**, and the agent-shaped version of that is a low-pressure corridor that never reaches the goal (inspect, diagnose, read one more file, report). Harmonic fields solve it by bounding the configuration space, which an action space is not. F7 and `STALLED` are mitigations, not solutions; watch for it in canary review.

What is genuinely contributed is not the field. **It is the receipt** — a deflection record with a predicate, which has no analogue in the potential-field literature because robots need not explain themselves, and none in this tree because `blockedSearches` is written and never read.

The honest risk is epistemic, not organizational. r1 rated this "complete with acceptable risk" while resting on a retracted premise (§5.0) and specifying a calibrator with nothing to fit (F8a). The central claim — that a continuous landscape produces better trajectories than the current single winner — remains **judgement**, and this repository has already built one uncalibrated weighted-sum pressure field that has run its whole life without producing a single tunable data point (U2). Phase 0 is therefore not a warm-up; it is the experiment. Its most valuable possible outcome is a clean refutation, which would cost two weeks and a JSONL writer instead of five phases.

Secondary risk, unchanged from r1 and correctly flagged there: if the §6 escalations are never answered, Phase 3 stalls and the governor remains a CLI instrument. That is a legitimate outcome.

# 17. References

- `scripts/scholo-gate.mjs` — shadow gate being extended: candidate scoring, `assessMargin`, `adjudicateLaw`, `deriveEpistemic`, `--derived`/`--taint` trust, `SEMANTIC_ACT_v2` corpus logging.
- `codex/core/pixelbrain/simulate-law-gate.js` — PB-SIM-LAWGATE-v1; **ternary** law scale ∈ {0, 0.7, 1.0} (documented line 68), deterministic checksummed verdicts (Tier-0 pressure source). Not a continuous scale — see A2.
- `codex/core/semantic-calculus/permission.ts` — **the composition substrate.** `KIND_RANK`, `permission()` (a vector), `permissionLte` (a *partial* order), `isZero` (absorbing LAW block), `applyModulation` (throws `PERMISSION_WIDENED`). Its rev-5 note `SEMANTIC_ACT_KIND_IS_NOT_PERMISSION` records the already-made mistake of ranking policy verdicts in a total order; F2/F2a exist so this PDR does not remake it.
- `codex/core/pixelbrain/canonical-json.js` — `canonicalStringify` reused for registry/receipt checksums.
- `divtube_downloader/tui/core/gate_keeper.py` — a TUI tool-spam cooldown, disabled at line 91 for **no recorded reason** (commit `82a579d0`). Cited in r1 as proof that boolean gating failed; retracted in §5.0. Not modified.
- `steamdeck_brain/vaelrix_forcefield/tool_governor.py`, `search_governor.py` — live boolean governors (`action_engine.py:84`/`:125`, `brain_bridge.py:217`, `code_brain.py:261`). Counter-evidence to the retracted claim, **and the Phase 0 instrumentation sites**: both already compute a structured deflection reason and discard it.
- `steamdeck_brain/vaelrix_forcefield/council_arbiter.py:23` + `personality_weighting.py:15-33` — the uncalibrated weighted-sum pressure field that already exists here. The prior failure Phase 0 is designed to avoid repeating (U2).
- `steamdeck_brain/vaelrix_forcefield/determinism_auditor.py:238` — self-scored `ResonanceScore` literals feeding the arbiter's ranking. Motivates F10.
- `codex/core/pixelbrain/calibration/denial-store.js` + `scripts/deny.mjs` — PB-DENY-v1 refusal ledger; the sibling store. Steer receipts are its counterfactual half: denials record what was refused, steer receipts record what was *not chosen*. The `grounds` axis (§5.0) is borrowed from it directly.
- `codex/core/semantic-calculus/` (proposer, kind, epistemic, utterance, cliLexicon, seal) — signal producers for every pressure source.
- `bench/semantic-calculus/corpus/cli-intents.jsonl` — existing corpus precedent for the receipt sink.
- `steamdeck_brain/knowledge/scholomance-encyclopedia/PDR-archive/PDR Prompt.md` — house PDR format this document follows.
- `VAELRIX_LAW.md`, `SCHEMA_CONTRACT.md`, `CODEX.md` — determinism, schema ownership, and four-layer law compliance.

# 18. Post-Implementation Report Handoff

Required PIR: `steamdeck_brain/knowledge/scholomance-encyclopedia/post-implementation-reports/PIR-20260809-PRESSURE-FIELD-GOVERNOR.md`

The PIR must record:

- **Phase 0 result in full**, whichever way it went: resolved-receipt count, the count of `deflection_was_wrong`, the logistic fit score **and the shuffled-label control score beside it**. If Phase 0 refuted the field, the PIR says so plainly and the PDR closes at Phase 0 — that is a successful outcome, not a failure to report around.
- **The five mutation results from §9.8**, each with the failing test name and message. Any mutation that left the suite green is recorded as a dead guard, with the resolution taken.
- Final receipt count from the first week of shadow operation.
- Every `GATED_CLOSED` / `GATED_OPEN` event.
- Any false-positive deflections found in canary review, and any evidence of local-minimum stalling (§16).
- The determinism re-verification result.
- If Phase 4 ran: the proposed-vs-committed weights diff.

A PDR that ships without this PIR is incomplete. A PIR that reports a fit without its control is not evidence.
