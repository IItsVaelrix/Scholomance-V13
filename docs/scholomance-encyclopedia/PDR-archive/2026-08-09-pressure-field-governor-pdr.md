# PDR: Pressure Field Governor
## Continuous Behavioral Governance as a Deterministic Decision Landscape

**Status:** Draft
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

## Context (seed — not the Executive Summary)
Our only runtime gate (`gate_keeper.py`) was a boolean ALLOW/BLOCKED instrument and was disabled because it was too blunt — the soft `think_before` hints are all that survived. Meanwhile `scholo-gate.mjs` already scores candidate acts and adjudicates law, but picks a single winner and never explains the landscape around it. This PDR extends that existing shadow gate into a continuous, multi-source pressure field with Ridges, Corridors, and externally-authorized Gates.

## Target Integration Area
- Primary: `scripts/scholo-gate.mjs` (extension via `--steer`, shadow-only, no default behavior change).
- Core: `codex/core/semantic-calculus/` (new pure modules + declarative registries).
- Telemetry: `bench/semantic-calculus/corpus/steer-receipts.jsonl` (append-only).
- Read-only dependencies: `codex/core/pixelbrain/simulate-law-gate.js`, `codex/core/pixelbrain/canonical-json.js`, `divtube_downloader/tui/core/gate_keeper.py` (referenced as precedent only; not modified).

## Core Concept
Instead of governing an agent through sequential commandments checked after it acts, place every candidate trajectory in a weighted decision landscape. Pressure sources (law, scope, evidence, uncertainty, regression risk, authorization, speaker trust, goal attraction) compose into a per-trajectory pressure vector. Trajectories are ranked by **lexicographic tier**: safety-tier pressure can never be compensated by goal attraction. High-pressure regions (Ridges) deflect; low-pressure corridors guide; controlled weaknesses (Gates) open only under externally verifiable conditions the agent cannot grant itself. Every deflection emits a checksummed receipt. The meteorological analogy is presentation only — the engineering content is potential-field steering with lexicographic safety composition, governed exceptions, and telemetry-driven calibration.

## Implementation Philosophy
Extend `scholo-gate.mjs`; do not build a parallel system. All pressure sources must be computed from signals that already have deterministic producers (law scale, risk profile, epistemic flags, utterance trust). No LLM participates in scoring. Nothing executes: the governor is shadow-only and produces receipts, exactly as the semantic calculus gate does today. Small composable modules, adapter seams at uncertain contracts, checksummed registries, append-only telemetry, and every phase independently shippable behind a flag.

## Ownership & Law Compliance
Every file written by this PDR appears in §7 with its owning agent. Core-layer modules live under `codex/core/` and respect the four-layer law (`CODEX.md`): no render-adjacent imports, no nondeterminism, no I/O in the composition core. Schema shapes follow `SCHEMA_CONTRACT.md`. Determinism follows `VAELRIX_LAW.md`: same input → same output → same bytes. Cross-domain conflicts go to Angel in the `**ESCALATION:**` format (§6), never resolved unilaterally.

---

# 1. Executive Summary

Scholomance already has two governance instruments that bracket the design space: `scripts/scholo-gate.mjs`, a shadow-only semantic gate that scores candidate acts, adjudicates law, assesses speaker trust, and emits receipts without ever executing; and `divtube_downloader/tui/core/gate_keeper.py`, a boolean ALLOW/BLOCKED runtime gate that was **disabled** ("Gate disabled — always allow tool execution", line 91) because binary gating was too blunt for real work. The pressure field governor closes the gap between them: it turns the single-winner score of the shadow gate into a continuous, explainable landscape over candidate trajectories, with Ridges (high-pressure refusals), Corridors (low-pressure preferred paths), and Gates (externally authorized exceptions).

Blast radius is deliberately minimal. v1 adds pure modules to `codex/core/semantic-calculus/`, one new CLI flag (`--steer`), one append-only receipt file, and tests. Default `scholo-gate.mjs` output must remain byte-identical when `--steer` is absent. Nothing executes, nothing enforces, no existing contract changes.

The one architectural decision that cannot be compromised: safety-tier pressures are **non-compensable**. A flat weighted sum would let goal attraction out-bid a law violation — that is reward-hacking compiled into the math. Lexicographic tiers are mandatory (§3, §11-Q1).

Current status: Draft. Requires §6 escalation answers before Phase 3.

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

**F2 — Lexicographic composition.** Within a tier: weighted sum. Across tiers: higher tier dominates. If Tier 0 pressure exceeds `RIDGE_CEILING` (fixed constant `1.0`), the trajectory is DEFLECTED regardless of any lower-tier value. *Acceptance:* a test with `goal` attraction at maximum and `law` pressure above ceiling must still DEFLECT.

**F3 — Ridges.** Declarative high-pressure regions: `{ id, tier, law_refs[], pressure_fn, conditions, severity }`. `pressure_fn` is a named deterministic function from a fixed registry — no arbitrary expressions.

**F4 — Corridors.** Ordered preferred paths: `{ id, goal_pattern, steps[], attraction, entry_conditions }`. The bug corridor is the reference instance: inspect → reproduce → identify-layer → trace-deps → isolate-root-cause → minimal-patch → regression-test.

**F5 — Gates.** `{ id, ridge_id, unlock_conditions[], authorizer, audit_log[], expiry }`. `unlock_conditions` reference only verifiable facts: `tests_pass`, `deps_mapped`, `law_audit_pass`, `human_approval_token`. Evaluation is a pure function `(gate, evidence, authorizer) → open | closed`. Missing or unverified evidence ⇒ closed. Agent-provided self-attestation is structurally impossible: the evidence object is loaded from artifacts, not from the agent's claims.

**F6 — Trajectory ranking.** `evaluateField(candidates, field, context)` returns a ranked list with full pressure vectors, the selected corridor, and a deflection entry for every rejected candidate.

**F7 — Local-minimum escape.** A progress term penalizes no-op and infinite deferral; if two corridors tie within `EPSILON` (fixed `1e-9`), prefer the one with more evidence receipts; bounded backtracking depth `MAX_RECONSIDER = 2`.

**F8 — Receipts.** Every evaluation appends one `PB-STEER-v1` JSONL receipt (§3.3) answering: why this action, what blocked the others, which source dominated, whether a Gate was considered, which corridor was selected.

**F9 — Calibration (proposal-only).** An offline script fits per-tier weights from receipt outcomes and writes a **proposed** weights file with checksum. Applying it requires a human commit. The live field never reads uncommitted proposals.

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
  "selected_trajectory": "<corridor id or candidate key>",
  "field_checksum": "<sha256:12 of registries+weights>",
  "capturedAt": "<ISO timestamp, EXCLUDED from checksum>"
}
```

Registry checksum: `sha256(canonicalStringify(registries)).slice(0, 12)` using the existing `codex/core/pixelbrain/canonical-json.js`.

**Deferred to follow-up PDR:** recursive scope composition (action → task → subsystem → project), anomaly detector over receipt streams, receipt inspector UI.

# 4. Change Classification

- **behavioral** — candidate ranking gains a multi-source landscape and deflection receipts; single-winner behavior preserved when `--steer` is off.
- **structural** — new pure modules and declarative registries under `codex/core/semantic-calculus/`.
- **architectural** — introduces lexicographic-tier governance as a reusable primitive (first continuous governor in the codebase).
- Not **cosmetic** — no output formatting changes in the default path.

# 5. Assumptions and Unknowns

Assumptions (explicit):
- A1: `lexicalProposer.propose` candidate lists are stable enough to pressure-rank (they are already score-sorted in `scholo-gate.mjs`).
- A2: law pressure from `simulate-law-gate.js` scale ∈ {0, 0.7, 1.0} is a usable Tier-0 input.
- A3: utterance trust/taint (`userUtterance` / `derivedUtterance`) is the correct authorization signal.
- A4: append-only JSONL at `bench/semantic-calculus/corpus/` is an acceptable telemetry sink (it already hosts `cli-intents.jsonl`).

Unknowns (surfaced):
- U1: whether 5 pressure sources suffice or more are needed before calibration has signal — resolve empirically in Phase 4, not by speculation.
- U2: whether the corpus will contain enough outcome-labeled receipts for logistic fitting within 30 days; if not, calibration stays manual and that is acceptable.

# 6. Open Questions / Escalations

**ESCALATION:** Should v1 steer receipts include the full candidate list or top-k only (corpus growth vs audit completeness)? Owner: Codex.

**ESCALATION:** May a future phase wire the field into TUI tool-call governance (replacing the disabled `gate_keeper.py` path), or does the field remain CLI-shadow-only permanently? This touches disabled-gate jurisdiction and must be decided before any runtime enforcement is even prototyped. Owner: Angel.

**ESCALATION:** Does committing a calibrated weights vector count as a core schema change requiring Codex sign-off under `SCHEMA_CONTRACT.md`, or as a data update? Owner: Codex + Angel.

# 7. Architecture / File Map

```
codex/core/semantic-calculus/
  pressure-field.ts          NEW  Codex   pure composition: vectors, tiers, ranking, epsilon ties
  field-registry.ts          NEW  Codex   ridge/corridor/gate loaders + checksum
  field-defs/
    ridges.json              NEW  Codex   declarative Ridges (seed: law-violation, destructive-rewrite, bypass-tests)
    corridors.json           NEW  Codex   declarative Corridors (seed: bug-fix corridor)
    gates.json               NEW  Codex   declarative Gates (seed: architectural-rewrite gate)
scripts/
  scholo-gate.mjs            MOD  Gemini  add --steer flag; default path untouched
  calibrate-field.mjs        NEW  Gemini  offline proposal-only weight fitter
bench/semantic-calculus/corpus/
  steer-receipts.jsonl       NEW  (runtime artifact, append-only)
tests/semantic-calculus/
  pressure-field.test.js     NEW  Gemini  composition, tiers, determinism
  field-gates.test.js        NEW  Gemini  gate refusal, external authorization, checksums
```

Dependency direction: `scripts/scholo-gate.mjs` → `pressure-field.ts` → `field-registry.ts` → `field-defs/*.json`; `pressure-field.ts` reads (never writes) `simulate-law-gate.js` outputs passed in by the CLI layer. The composition core performs zero I/O; all file reads live in the registry loader and CLI.

# 8. Step-by-Step Implementation Plan

**Phase 1 — Core field (Codex, ~1 day).** Milestone: `pressure-field.ts` + `field-registry.ts` + registries imported by tests only. Exit criteria: all unit tests green; 100-iteration determinism test passes; registry checksum stable across reloads.

**Phase 2 — CLI wiring + telemetry (Gemini, ~1 day).** Milestone: `scholo-gate.mjs --steer` emits receipts; default output byte-identical without the flag. Exit criteria: golden-output diff test passes for 12 existing intents; receipt answers all seven audit questions; exception in field code degrades to warn, never crash.

**Phase 3 — Gates (Codex + Gemini, ~1 day).** Requires §6 escalations answered. Milestone: seeded rewrite gate openable only with `human_approval_token` + evidence artifacts. Exit criteria: test proving agent-only evidence yields `GATED_CLOSED`; test proving a valid authorizer token yields `GATED_OPEN` with audit entry.

**Phase 4 — Calibrator, proposal-only (Gemini, ~1 day).** Milestone: `calibrate-field.mjs` reads receipts, writes `field-defs/weights.proposed.json` + checksum, and refuses to touch `weights.json`. Exit criteria: test proving no write to the live weights file; test proving a corrupted receipt line is skipped and counted, not fatal.

**Phase 5 — Recursive scopes + anomaly flag (owner TBD, deferred).** Behind `--steer-scopes`; may move to a follow-up PDR if §6 escalations delay Phase 3.

Each phase is independently shippable: everything is off unless `--steer` is passed.

# 9. Code Examples — Pivotal Changes

**9.1 Lexicographic composition (the decision that cannot be flat-summed):**

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

export function deflects(tiers: number[]): boolean {
  return tiers[0] >= RIDGE_CEILING;   // safety tier alone can deflect; goal can never rescue it
}
```

**9.2 Ranking with evidence tiebreak (local-minimum escape):**

```ts
export function evaluateField(candidates: Candidate[], field: Field, weights: Weights) {
  const scored = candidates.map((c) => {
    const tiers = composeTiers(c.pressure, weights);
    return { key: c.key, tiers, deflected: deflects(tiers), evidenceCount: c.evidenceReceipts.length };
  }).sort((a, b) => {
    if (a.deflected !== b.deflected) return a.deflected ? 1 : -1;
    for (let t = 0; t < 4; t++) {
      if (Math.abs(a.tiers[t] - b.tiers[t]) > EPSILON) return a.tiers[t] - b.tiers[t];
    }
    return b.evidenceCount - a.evidenceCount;   // tie → more evidence wins
  });
  return scored;
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
    const ranked = evaluateField(proposal.candidates.map(toPressured), field, weights);
    appendFileSync(RECEIPTS, steerReceipt(ranked, ranked[0]?.key ?? null, checksum) + '\n');
    console.log(`  steer: ${ranked[0]?.key ?? 'none'}  field=${checksum}`);
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

**9.8 The falsification test (goal attraction must never out-bid law):**

```js
it('max goal attraction cannot rescue a law violation', () => {
  const c = { key: 'rewrite', pressure: { law: 1.2, goal: -100 }, evidenceReceipts: [] };
  const [top] = evaluateField([c, INSPECT], loadField(FIXTURES).field, W);
  expect(top.key).toBe('inspect');
  expect(deflects(composeTiers(c.pressure, W))).toBe(true);
});
```

# 10. Glossary

- **Pressure field** — the composed per-trajectory resistance landscape; a deterministic function, not a physical model.
- **Ridge** — declarative high-pressure region that deflects a category of trajectories.
- **Corridor** — ordered low-pressure preferred path toward a goal class.
- **Gate** — externally authorized, auditable weakness in a Ridge; never self-openable.
- **Tier** — lexicographic priority band; higher tiers dominate lower ones without compensation.
- **Non-compensable** — a pressure no amount of attraction in lower tiers can offset.
- **Local minimum** — stall where all neighbors are higher pressure; escaped via evidence tiebreak and bounded reconsideration.
- **Receipt** — append-only checksummed JSONL record of one evaluation.
- **Field checksum** — sha256 prefix over canonical registries+weights; tamper evidence.
- **Shadow-only** — evaluates and records; executes nothing.

# 11. Q&A — Top 10 Implementation Concerns

**Q1: Why not a single weighted sum?** Because it makes safety purchasable: enough goal attraction out-bids a law violation. Lexicographic tiers are the fix (§9.1, §9.8). This is the whole design in one decision.

**Q2: Won't the agent learn to aim for zero-pressure no-ops?** The goal term is attraction (negative pressure) and the progress term penalizes no-op; a trajectory that satisfies nothing is not low-pressure, it is stalled (result `STALLED`).

**Q3: How is this different from the disabled `gate_keeper.py`?** That was boolean and post-hoc. This is continuous, pre-execution, and explains itself. The disabled gate is the *evidence* this design is needed, not a competitor to it.

**Q4: Where does the law pressure come from?** `simulate-law-gate.js` scale ({0, 0.7, 1.0}) mapped into Tier 0; `adjudicateLaw` escalate/allow decisions raise authorization pressure. No new law logic is invented.

**Q5: Can the agent forge evidence to open a Gate?** No. `unlock_conditions` resolve against loaded artifacts (test results, dependency maps, approval tokens), and the evidence object is constructed by the CLI layer from files, never from agent output.

**Q6: What happens when two corridors tie?** Evidence-count tiebreak, then corridor id lexical order — deterministic, no RNG (§9.2).

**Q7: Does `--steer` change existing output?** No. The default path is untouched; steering output is additional lines, and a golden-diff test enforces byte-identical non-steer output (§13).

**Q8: How are weights versioned?** `field-defs/weights.json` is committed like code; the calibrator only ever writes `weights.proposed.json`; applying requires a human commit (§6 escalation, Phase 4).

**Q9: What if a pressure source has no signal for a candidate?** Missing sources default to `0` in composition — absence of evidence is not pressure. The receipt records the raw vector, so silent zeros are visible.

**Q10: Why JSON registries instead of code?** Declarative defs are diffable, checksummable, and editable without touching composition logic; `pressure_fn` is a *name* resolved against a fixed code registry, never an evaluated expression.

# 12. QA Plan

New tests (exact paths):
- `tests/semantic-calculus/pressure-field.test.js` — composition, tiers, tiebreak, determinism (100-iter), falsification test (§9.8).
- `tests/semantic-calculus/field-gates.test.js` — gate refusal without authorizer, open with authorizer+artifacts, checksum tamper detection, registry reload stability.

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
- **Canary:** the first week of receipts is reviewed manually for false-positive deflections before any weight calibration is considered.
- **Rollback:** revert the merge commit; delete `bench/semantic-calculus/corpus/steer-receipts.jsonl` if desired (append-only, nothing reads it backwards). One commit in, one commit out.

# 15. Definition of Done

- [ ] `npx vitest run tests/semantic-calculus/pressure-field.test.js tests/semantic-calculus/field-gates.test.js` — all pass.
- [ ] 100-iteration determinism test passes (byte-identical receipts).
- [ ] Falsification test passes: max goal attraction cannot rescue a law violation.
- [ ] Gate test passes: agent-only evidence ⇒ `GATED_CLOSED`; authorizer token ⇒ `GATED_OPEN` with audit entry.
- [ ] Golden-diff: 12 default-path intents byte-identical with and without the field modules present.
- [ ] `npm run typecheck` clean for new modules.
- [ ] `steer-receipts.jsonl` written only under `--steer`; zero writes otherwise (verified by test).
- [ ] Registry checksum stable across process reloads (test).
- [ ] This PDR committed with bytecode search code; PIR filename reserved (§18).

# 16. Final Architectural Verdict

**Complete with acceptable risk.** The proposal survives falsification with five named conditions, all encoded above: lexicographic safety tiers (Q1), calibration that is proposal-only (F9), a goal/progress term preventing paralysis (F7), deterministic local-minimum escape (§9.2), and steering at planning stage rather than final-act validation only (F6). The physics is borrowed — potential fields and weighted scoring are forty years old — and this PDR says so rather than overselling the metaphor. What is genuinely contributed is the application of a continuous, software-engineering-signal-driven landscape to agent act selection, first-class governed Gates, and telemetry-calibrated, checksummed weights — layered on machinery (`scholo-gate.mjs`, `simulate-law-gate.js`, the denial ledger) that already exists and is proven. The acceptable risk is organizational, not technical: if the §6 escalations are never answered, Phase 3 stalls and the governor remains a CLI instrument. That is a legitimate outcome, and it is flagged rather than hidden.

# 17. References

- `scripts/scholo-gate.mjs` — shadow gate being extended: candidate scoring, `assessMargin`, `adjudicateLaw`, `deriveEpistemic`, `--derived`/`--taint` trust, `SEMANTIC_ACT_v2` corpus logging.
- `codex/core/pixelbrain/simulate-law-gate.js` — PB-SIM-LAWGATE-v1; continuous law scale ∈ {0, 0.7, 1.0}, deterministic checksummed verdicts (Tier-0 pressure source).
- `codex/core/pixelbrain/canonical-json.js` — canonicalStringify reused for registry/receipt checksums.
- `divtube_downloader/tui/core/gate_keeper.py` — disabled boolean gate (line 91); the precedent proving boolean gating was too blunt. Not modified.
- `codex/core/pixelbrain/calibration/denial-store.js` + `scripts/deny.mjs` — PB-DENY-v1 refusal ledger; sibling telemetry pattern.
- `codex/core/semantic-calculus/` (proposer, kind, epistemic, utterance, cliLexicon, permission, seal) — signal producers for every pressure source.
- `bench/semantic-calculus/corpus/cli-intents.jsonl` — existing corpus precedent for the receipt sink.
- `steamdeck_brain/knowledge/scholomance-encyclopedia/PDR-archive/PDR Prompt.md` — house PDR format this document follows.
- `VAELRIX_LAW.md`, `SCHEMA_CONTRACT.md`, `CODEX.md` — determinism, schema ownership, and four-layer law compliance.

# 18. Post-Implementation Report Handoff

Required PIR: `steamdeck_brain/knowledge/scholomance-encyclopedia/post-implementation-reports/PIR-20260809-PRESSURE-FIELD-GOVERNOR.md`

The PIR must record: final receipt count from the first week of shadow operation, every `GATED_CLOSED`/`GATED_OPEN` event, any false-positive deflections found in canary review, the determinism re-verification result, and — if Phase 4 ran — the proposed-vs-committed weights diff. A PDR that ships without this PIR is incomplete.
