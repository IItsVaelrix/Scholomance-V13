# PDR: QBIT Immune Self-Audit
## Rule Apoptosis Auditor — Meta-Checkpoint for Diagnostic Rule Reputation and Lifecycle

## Bytecode Search Code
`SCHOL-ENC-BYKE-SEARCH-QBIT-IMMUNE-SELF-AUDIT-PDR`

**Status:** Draft
**Classification:** Architectural | Immune System | Diagnostic Memory | QBIT Substrate | Meta-Checkpoint
**Priority:** High
**Primary Goal:** Add a meta-checkpoint layer that audits diagnostic rules themselves for over-broad regex, low reliability, and feature-targeting failure modes, and applies reputation-driven apoptosis when evidence converges.

---

## Sibling PDR

This PDR is a sibling of [`QBIT-Immune-Checkpoint-PDR.md`](./QBIT-Immune-Checkpoint-PDR.md) ("QBIT Immune Checkpoint v1", status: Proposed). Read both together:

- **QBIT Immune Checkpoint** governs *findings* — should this individual observation become a violation, warn, health signal, or be suppressed?
- **QBIT Immune Self-Audit** (this PDR) governs *rules* — should this rule remain alive, be watched, be flagged for apoptosis, or be globally suppressed?

The checkpoint is the **G2/M gate on a single cell's life cycle.** The self-auditor is the **G0 senescence gate on the organ itself.**

Both share the QBIT memory substrate, both emit deterministic bytecode envelopes, both rely on half-life decay, and both escalate to Merlin when uncertain. The self-auditor reads checkpoint reputation data as one of its five inputs.

---

# 1. Executive Summary

Diagnostic rules are themselves software. They can be over-broad, mis-targeted, or quietly rot. The Scholomance immune system currently has no mechanism to notice this. A rule that fires 116 times on every `querySelector` call in a test file will continue firing forever, even when the rule's own reason text ("DOM queries in loops cause reflow") is contradicted by its own regex.

This PDR adds a **rule self-auditor** that runs after every diagnostic cycle. It computes five rule-health signals (violation entropy, confirm/refute ratio, time-coherence, file-size correlation, domain coverage), composes them into a per-rule reputation score, and applies a state machine that escalates from `HEALTHY` → `WATCH` → `APOPTOTIC_CANDIDATE` → `APOPTOTIC` → `REVIVED`. The auditor never silently kills a rule. It escalates to Merlin and emits deterministic bytecode envelopes for every state transition.

The first version is small and composable. It reuses the existing QBIT memory substrate, the existing checkpoint reputation data, and the existing diagnostic runner hook points. The cost is one new file (`rule-self-audit.js`), one config, one test file, and minor emitter additions to the five existing cells.

# 2. Problem Statement

The QBIT Immune Checkpoint (sibling PDR) governs *findings*. It answers: given this observation and the memory cell for its bytecode envelope, what action should I emit? The checkpoint is robust against repeated false positives, but it is structurally blind to a different class of failure: **bugs in the rules themselves.**

Consider the `LAYOUT_THRASHING` rule in `codex/core/diagnostic/cells/fixture-shape.cell.js`. The rule's reason text claims to detect "DOM queries in loops." The actual regex is `/querySelector|getElementsBy(ClassName|TagName|ById)/g` — a substring match with no loop-context check. The rule fires on every `querySelector` call in every test file, regardless of whether it is inside a loop.

Diagnostic run `PB-DIAG-v1-1781215698711-0000` produced **116 LAYOUT_THRASHING violations** from this single rule. All 116 share a common cause (one over-broad regex). The checkpoint, on its own, can only suppress these findings one-by-one after accumulating refutes. The rule itself remains active and continues to produce 116 noise violations per run, indefinitely.

This is a class of failure the current immune system cannot detect:

1. **Over-broad regexes** — patterns that match in many unrelated contexts
2. **Conflated patterns** — single rule firing on multiple distinct shapes
3. **Feature-targeting** — rule that points at a feature, not a bug
4. **Naive substring matching** — fire rate correlates with file size
5. **Stale rules** — fire on code that has since been removed or refactored

The system needs a *meta-checkpoint* that audits the rules themselves.

# 3. Product Goal

Create a deterministic rule self-auditor that:

1. Computes five rule-health signals from each diagnostic run
2. Composes them into a per-rule reputation score
3. Applies a state machine that escalates rules through `HEALTHY → WATCH → APOPTOTIC_CANDIDATE → APOPTOTIC`
4. Emits a `RuleLifecycle` bytecode envelope for every state transition
5. Persists rule reputation to the QBIT memory substrate with half-life decay
6. Never silently kills a rule — every transition either continues firing or escalates to Merlin
7. Reads checkpoint reputation data as one of its five inputs (composition with sibling PDR)

# 4. Non-Goals

- Do not modify or replace the QBIT Immune Checkpoint. It remains the finding-level gate.
- Do not auto-disable rules globally. `APOPTOTIC` state requires human (Merlin) reactivation.
- Do not mutate the existing diagnostic cell code beyond adding a `reputation` emitter hook.
- Do not introduce a new persistent store. The self-auditor writes only to the existing QBIT memory substrate.
- Do not run as a background daemon. The auditor runs synchronously after the diagnostic runner completes.
- Do not replace the pathogen registry. Confirmed bugs still become pathogens via the existing flow.
- Do not add UI surfaces in this phase. All output is bytecode envelopes and stdout JSON for now.
- Do not use non-deterministic ML for verdicting. All scoring is closed-form arithmetic on integer counters.

# 5. Core Design Principles

1. **Determinism is non-negotiable.** Same diagnostic output + same memory state → same rule-state assignments and same emitted bytecodes. No floating point comparison. No unseeded `Math.random()`.
2. **Reputation is a function of evidence, not opinion.** All five signals are computed from observed diagnostic data, not human input.
3. **No silent killing.** Every state transition either continues firing or emits a `RULE_LIFECYCLE` envelope requesting review.
4. **Half-life decay on reputation.** Old refutes and old confirms both lose power over time, so a rule's reputation reflects recent evidence, not ancient history.
5. **Convergent evidence required for apoptosis.** A single bad signal (e.g. one bad run) cannot trigger apoptosis. At least two signals must agree, or one signal must be catastrophic.
6. **Composition, not replacement.** The self-auditor reads checkpoint reputation. The checkpoint reads observation memory. The pathogen registry reads confirmed violations. Each layer is composable and replaceable.
7. **Reversibility.** Any rule that enters `APOPTOTIC` can be revived by a human `RULE_REVIVE` action that resets its reputation to neutral. The state machine is acyclic in the forward direction (HEALTHY → WATCH → …) and reversible from `APOPTOTIC`.

# 6. Feature Overview

The self-auditor exposes three operations and four emitted event types.

**Operations:**

| Operation | Trigger | Effect |
|---|---|---|
| `auditRules(diagnosticRunOutput)` | End of diagnostic cycle | Computes new reputations, emits state-transition events |
| `getRuleReputation(ruleId)` | Read query | Returns current reputation cell from QBIT memory |
| `reviveRule(ruleId, agentId)` | Human action | Resets reputation, clears APOPTOTIC state, emits `RULE_REVIVED` |

**Event types (bytecode envelopes):**

| Event | Trigger | Severity |
|---|---|---|
| `PB-RULE-v1-WATCH` | Rule entered WATCH state | INFO |
| `PB-RULE-v1-APOPTOSIS-CANDIDATE` | Rule entered APOPTOTIC_CANDIDATE state | WARN |
| `PB-RULE-v1-APOPTOTIC` | Rule entered APOPTOTIC state | CRIT |
| `PB-RULE-v1-REVIVED` | Rule revived from APOPTOTIC | INFO |

# 7. Architecture / File Map

```text
diagnostic cycle ends
  → diagnostic-runner.js emits DiagnosticReport
  → rule-self-audit.js invoked (post-cycle hook)
  → for each rule in the report:
      compute five signals
      compose reputation score
      apply half-life decay
      transition state machine
      emit RuleLifecycle bytecode if state changed
  → QBIT memory persistence
  → bytecode error system emission
```

**File map with ownership:**

| Path | Purpose | Owner |
|---|---|---|
| `codex/core/immune/rule-self-audit.js` *(new)* | Main auditor module | Codex (engine, schemas) |
| `codex/core/immune/rule-self-audit.config.js` *(new)* | Thresholds and weights | Codex |
| `codex/core/immune/rule-self-audit.test.js` *(new)* | Unit + integration tests | Gemini (tests) |
| `codex/core/immune/qbit-memory.js` *(extend)* | Add `getRuleReputation` and `upsertRuleReputation` | Codex |
| `codex/core/diagnostic/diagnostic-runner.js` *(modify)* | Add `runSelfAudit` post-cycle hook | Codex |
| `codex/core/diagnostic/cells/*.js` *(modify, all 5 cells)* | Emit `reputation` counters per rule | Codex |
| `codex/core/diagnostic/BytecodeHealth.js` *(extend)* | Add RuleLifecycle health encoding | Codex |

# 8. Module Breakdown

### 8.1 The Five Rule-Health Signals

All five signals are computed deterministically from the diagnostic report and the checkpoint reputation cells. They are integers or normalized floats in `[0, 1]`. No floating-point comparison is used for state transitions — only integer thresholds.

**Signal 1: Violation Entropy (H_rule)**

Shannon entropy of the rule's violation distribution across `(normalizedFilePath, layer)` buckets.

```
H_rule = -Σ p_i * log2(p_i)
        over all (file, layer) buckets the rule fired in
```

- **Low H (concentrated)** — rule has a coherent target. Good.
- **High H (spread)** — rule is over-broad or has multiple distinct shapes conflated. Bad.

Normalized via `H_norm = H_rule / log2(N_buckets + 1)`. Range: `[0, 1]`.

**Signal 2: Confirm/Refute Ratio (R_rule)**

Read from the checkpoint's reputation cells. For each `checkpointKey` derived from this rule, look up the cell's `confidence.refuteScore` and `confidence.confirmScore`. Aggregate across all keys.

```
R_rule = Σ refuteScore / (Σ confirmScore + Σ refuteScore + ε)
```

- **Low R** — rule is reliable. Good.
- **High R** — rule is unreliable. Bad.

**Signal 3: Time-Coherence (T_rule)**

For each `checkpointKey` derived from this rule, check if the cell's `lastObservedAt` is older than `timeCoherenceWindow` (default 30 runs) AND the cell has unresolved refutes. A rule that fires repeatedly on the same bytecode envelope without human verdict is either broken or pointing at a feature.

```
T_rule = (keys_with_stale_unresolved_refutes) / (total_keys_for_rule + ε)
```

- **Low T** — recent activity, recent resolution. Good.
- **High T** — stale unresolved activity. Bad.

**Signal 4: File-Size Correlation (S_rule)**

Pearson correlation between `(fileSize, ruleFireCount)` across all files the rule touched in this run. High positive correlation suggests the rule is doing naive substring matching — bigger files fire more.

```
S_rule = pearson(fileSizes, fireCounts)   ∈ [-1, 1]
        clamped to [0, 1] (only positive correlation is suspicious)
```

- **Low S** — fire rate is independent of file size. Good.
- **High S** — bigger files fire more. Bad (likely naive substring).

**Signal 5: Domain Coverage (D_rule)**

Number of distinct `layer` values the rule fired in, normalized by total possible layers.

```
D_rule = distinct_layers_fired_in / total_layers
```

- **Low D** — rule has a single domain. Good.
- **High D** — rule is touching many domains. Bad (over-broad or shared kernel).

### 8.2 Composite Reputation

```
Reputation(rule) =  w_entropy * (1 - H_norm)
                  + w_refute * (1 - R_rule)
                  + w_coherence * (1 - T_rule)
                  + w_size * (1 - max(0, S_rule))
                  + w_domain * (1 - D_rule)

where Σ w_i = 1 and all w_i default to 0.2 (equal weighting)
```

Range: `[0, 1]`. Higher is better. Default weights are configurable.

### 8.3 Half-Life Decay

Rule reputation cells decay with the same half-life model as the checkpoint memory cells (sibling PDR, §Checkpoint Decision Logic):

```
decayed_score = score * 0.5 ^ (currentRunIndex - lastObservedRunIndex) / halfLifeRuns
```

Default `halfLifeRuns = 30`. Old confirms and old refutes both decay, so a rule's reputation reflects recent evidence.

### 8.4 State Machine

```
HEALTHY (reputation ≥ 0.70)
   │
   ▼
WATCH (0.50 ≤ reputation < 0.70)
   │
   ▼
APOPTOTIC_CANDIDATE
   triggers: reputation < 0.50 for 3+ consecutive runs
           OR any single signal below its catastrophic floor
   │
   ▼
APOPTOTIC
   triggers: reputation < 0.30 for 5+ consecutive runs
           OR convergent evidence from ≥ 2 signals below their warning floor
   rule is globally suppressed, awaits human revive
   │
   ▼
REVIVED (human action only)
   reputation reset to 0.5 (neutral)
   audit history preserved
   state returns to WATCH for one cycle before HEALTHY is possible
```

**Catastrophic floors** (single-signal apoptosis):

| Signal | Catastrophic floor |
|---|---|
| H_norm | > 0.92 (rule fires everywhere) |
| R_rule | > 0.85 (rule is mostly refuted) |
| S_rule | > 0.80 (strong size correlation) |
| D_rule | > 0.80 (fires in 4+ of 5 layers) |
| T_rule | > 0.70 (stale unresolved) |

A single signal crossing its catastrophic floor escalates to `APOPTOTIC_CANDIDATE` immediately, bypassing the 3-run watch period.

### 8.5 Convergent Evidence

A rule with reputation in `[0.30, 0.50]` is escalated to `APOPTOTIC_CANDIDATE` if **at least 2 of its 5 signals** are below their respective warning floors:

| Signal | Warning floor |
|---|---|
| H_norm | > 0.75 |
| R_rule | > 0.60 |
| S_rule | > 0.50 |
| D_rule | > 0.50 |
| T_rule | > 0.40 |

Single-signal transitions use the catastrophic floors above. Convergent transitions use the warning floors. This prevents a single noisy run from killing a rule.

# 9. ByteCode IR Design

All self-audit events use the existing `PB-RULE-v1` envelope family. Shape:

```json
{
  "bytecode": "PB-RULE-v1-APOPTOSIS-CANDIDATE-IMMUNE-<base64-payload>-<checksum>",
  "version": "v1",
  "category": "RULE",
  "severity": "WARN",
  "moduleId": "IMMUNE",
  "errorCode": <int>,
  "context": {
    "ruleId": "LAYOUT_THRASHING",
    "fromState": "WATCH",
    "toState": "APOPTOTIC_CANDIDATE",
    "reputation": 0.42,
    "signals": {
      "H_norm": 0.88,
      "R_rule": 0.31,
      "T_rule": 0.05,
      "S_rule": 0.74,
      "D_rule": 0.20
    },
    "convergent": true,
    "catastrophic": false,
    "runIndex": 47,
    "checksum": "<sha-style>"
  },
  "aiMetadata": {
    "parseable": true,
    "schemaVersion": "v1",
    "deterministic": true,
    "checksumVerified": true
  }
}
```

Rule reputation cell (persisted in QBIT memory):

```json
{
  "version": 1,
  "key": "RULE:LAYOUT_THRASHING",
  "ruleId": "LAYOUT_THRASHING",
  "currentState": "APOPTOTIC_CANDIDATE",
  "reputation": 0.42,
  "signals": {
    "H_norm": 0.88,
    "R_rule": 0.31,
    "T_rule": 0.05,
    "S_rule": 0.74,
    "D_rule": 0.20
  },
  "consecutiveRunsBelowThreshold": 2,
  "lastTransitionAt": "<run-index>",
  "lastObservedAt": "<run-index>",
  "halfLifeRuns": 30,
  "history": [
    { "runIndex": 45, "state": "HEALTHY", "reputation": 0.72 },
    { "runIndex": 46, "state": "WATCH",   "reputation": 0.58 },
    { "runIndex": 47, "state": "APOPTOTIC_CANDIDATE", "reputation": 0.42 }
  ],
  "checksum": "<stable>"
}
```

Key determinism guarantees:
- `key` is stable across runs and machines
- `signals` are sorted by signal name
- `history` is append-only with a max length (default 50 entries)
- `checksum` covers all fields except `history[*].checksum` and the checksum field itself
- Floating-point scores are rounded to 4 decimal places before storage

# 10. Step-by-Step Implementation Plan

**Phase 0 — Spec freeze (this PDR, ~half a day)**
- Owner: Codex
- Milestone: PDR approved by Angel
- Exit criteria: PDR linked from QBIT-Immune-Checkpoint-PDR and from the README catalog

**Phase 1 — Module skeleton + QBIT extension (1 day)**
- Owner: Codex
- Files: `rule-self-audit.js`, `rule-self-audit.config.js`, `qbit-memory.js` extension
- Milestone: `auditRules(diagnosticReport)` returns a list of rule states without emitting envelopes yet
- Exit criteria: unit tests for signal computation pass

**Phase 2 — Cell emitter hooks (1 day)**
- Owner: Codex
- Files: all 5 cells in `codex/core/diagnostic/cells/`
- Milestone: each cell emits a `ruleStats` block alongside its errors/health
- Exit criteria: integration test confirms `ruleStats` shape and deterministic ordering

**Phase 3 — State machine + envelope emission (1 day)**
- Owner: Codex
- Files: `rule-self-audit.js`, `BytecodeHealth.js` extension
- Milestone: state transitions emit `PB-RULE-v1-*` envelopes
- Exit criteria: state machine tests cover all transitions including revival

**Phase 4 — Runner integration (half a day)**
- Owner: Codex
- Files: `diagnostic-runner.js`
- Milestone: `runSelfAudit` runs after each diagnostic cycle
- Exit criteria: end-to-end test on a known report produces expected state transitions

**Phase 5 — Test corpus + canary (1 day)**
- Owner: Gemini
- Files: `rule-self-audit.test.js`, fixture report with known-good and known-bad rules
- Milestone: 100% branch coverage of the state machine, 80% line coverage overall
- Exit criteria: `LAYOUT_THRASHING` enters WATCH on first run, APOPTOTIC_CANDIDATE within 3 runs, APOPTOTIC within 5

**Phase 6 — Shadow mode + Merlin review (3–7 days observation)**
- Owner: Angel (Merlin)
- Milestone: auditor runs in shadow mode, emits envelopes, but does not affect rule emission
- Exit criteria: Merlin has reviewed at least 5 state transitions and confirmed the auditor is correct

**Phase 7 — Enforced mode**
- Owner: Codex
- Milestone: APOPTOTIC state actually suppresses the rule's findings
- Exit criteria: `LAYOUT_THRASHING` 116 violations reduce to 0 in next diagnostic run

Each phase is safe to ship independently behind the `IMMUNE_SELF_AUDIT_ENABLED` feature flag (default off in production until Phase 7).

# 11. QA Requirements

### 11.1 Unit tests (`rule-self-audit.test.js`)

- All five signals compute correctly on synthetic report fixtures
- Composite reputation is `1.0` for a perfect rule and `0.0` for a maximally bad rule
- Half-life decay correctly reduces both confirms and refutes
- State machine transitions are deterministic across runs
- Catastrophic-floor bypass works for each of the five signals
- Convergent-evidence escalation requires ≥ 2 warning-floor signals
- Revival resets reputation to neutral but preserves audit history
- Reputation cell checksum is stable across runs

### 11.2 Integration tests

- A diagnostic run with a synthetic "broken rule" fixture produces WATCH → APOPTOTIC_CANDIDATE → APOPTOTIC within 5 runs
- A diagnostic run with the existing `LAYOUT_THRASHING` data set produces the expected state transitions
- QBIT memory persistence round-trips correctly
- The checkpoint's reputation data is read correctly (composition with sibling PDR)
- All 5 diagnostic cells emit `ruleStats` blocks in the expected shape

### 11.3 Property tests

- For any rule with all signals at maximum health, reputation is exactly `1.0`
- For any rule with all signals at minimum health, reputation is exactly `0.0`
- Sum of weights in composite reputation is always `1.0` regardless of configuration
- Reputation scores are bounded in `[0, 1]`
- State transitions are acyclic in the forward direction (HEALTHY → WATCH → APOPTOTIC_CANDIDATE → APOPTOTIC)

### 11.4 Determinism

- Same diagnostic output + same memory state → same reputation scores
- Same reputation scores → same state assignments
- Reputation cell checksums are byte-stable across machines
- No use of `Date.now()`, `Math.random()`, or non-deterministic iteration order

### 11.5 Test commands

```bash
# Unit + integration
npm run test -- codex/core/immune/rule-self-audit.test.js

# Full immune suite
npm run test -- --testPathPattern=immune

# Lint + typecheck
npm run lint
npm run typecheck

# Diagnostic run end-to-end
node codex/core/diagnostic/run-diagnostic.cli.js
```

# 12. Success Criteria

- **Quantitative:**
  - The `LAYOUT_THRASHING` false-positive rate in `tests/qa/` drops to 0 after Phase 7
  - The 1,082 `STATE-COVERAGE` "no test file found" warnings get a rule-level audit verdict
  - The diagnostic report's noise-to-signal ratio improves by ≥ 30% within 10 diagnostic runs
  - Auditor runtime is ≤ 5% of total diagnostic cycle time

- **Qualitative:**
  - A human can answer "which diagnostic rules are unreliable?" by querying QBIT memory alone
  - A human can answer "which diagnostic rules were ever killed, and why?" by reading the audit history
  - A human can revive a killed rule with a single deterministic action
  - The system never silently kills a rule — every transition is either "keep firing" or "Merlin review"

- **Architectural:**
  - Composition with QBIT Immune Checkpoint is verified (this PDR + sibling PDR + shared QBIT substrate)
  - No new persistent store introduced
  - No background daemons introduced
  - All emitted envelopes are deterministic and parseable
  - The auditor is replaceable: a different implementation with the same public API would work

# 13. References

### 13.1 Sibling PDR
- [`QBIT-Immune-Checkpoint-PDR.md`](./QBIT-Immune-Checkpoint-PDR.md) — finding-level gate. This PDR reads checkpoint reputation data as Signal 2.

### 13.2 Substrate dependencies
- `codex/core/diagnostic/QbitMemoryPersistence.js` — persistent memory envelopes
- `codex/core/immunity/BytecodeXPVaccine.js` — known-pattern vaccination
- `codex/core/immunity/pathogenRegistry.js` — learned confirmed pathogens
- `codex/core/immunity/adaptive.scanner.js` — adaptive detection layer
- `codex/core/immunity/memory-infusion.engine.js` — long-term event infusion
- `codex/core/diagnostic/BytecodeHealth.js` — health envelope encoding
- `codex/core/diagnostic/diagnostic-runner.js` — post-cycle hook integration

### 13.3 Diagnostic cells (emitters)
- `codex/core/diagnostic/cells/immunity-scan.cell.js`
- `codex/core/diagnostic/cells/layer-boundary.cell.js`
- `codex/core/diagnostic/cells/test-coverage.cell.js`
- `codex/core/diagnostic/cells/fixture-shape.cell.js` *(contains the broken `LAYOUT_THRASHING` rule that motivated this PDR)*
- `codex/core/diagnostic/cells/processor-bridge.cell.js`

### 13.4 Law and contract
- [`../Scholomance LAW/VAELRIX_LAW.md`](../Scholomance%20LAW/VAELRIX_LAW.md) — file ownership and agent jurisdiction
- [`../Scholomance LAW/SCHEMA_CONTRACT.md`](../Scholomance%20LAW/SCHEMA_CONTRACT.md) — bytecode envelope schema
- [`../Scholomance LAW/AGENTS.md`](../Scholomance%20LAW/AGENTS.md) — agent jurisdiction table

### 13.5 Related PDRs
- `2026-06-20-memory-cell-osmosis-pdr.md` — passive TurboQuant receptors (orthogonal but composable)
- `2026-06-04-BYTECODE-XP-QBIT-VACCINES.md` — the vaccine substrate this PDR sits on top of

# 14. Glossary

| Term | Definition |
|---|---|
| **Apoptosis** | Programmed cell death. Here: the rule's terminal state, awaiting human revival. |
| **Catastrophic floor** | A single-signal threshold that, if crossed, immediately escalates a rule to `APOPTOTIC_CANDIDATE` without waiting for convergent evidence. |
| **Checkpoint** | The QBIT Immune Checkpoint (sibling PDR). Governs findings. |
| **Convergent evidence** | A state-transition trigger that requires ≥ 2 of 5 signals to be below their warning floors. |
| **G0/G1/G2/M** | Phases of the biological cell cycle. Borrowed here as named states of the rule's life cycle. |
| **QBIT** | Quantum-Bit memory substrate — the project's persistent memory envelope system. |
| **Rule reputation** | A composite score in `[0, 1]` derived from five rule-health signals. Higher is better. |
| **Rule self-audit** | This PDR. A meta-checkpoint that audits diagnostic rules themselves. |
| **Signal** | One of five measurable quantities (entropy, refute ratio, time-coherence, size correlation, domain coverage) used to compute rule reputation. |
| **Watch** | An early-warning state: reputation is below healthy but above apoptotic. Emits `PB-RULE-v1-WATCH`. |

# 15. Post-Implementation Report

A PIR will be required after Phase 7 (enforced mode). Filename and date to be assigned at PIR time per the project's PIR template:

`docs/scholomance-encyclopedia/post-implementation-reports/PIR-YYYYMMDD-QBIT-IMMUNE-SELF-AUDIT.md`

The PIR must report:
- Number of rules audited per diagnostic run
- Distribution of rule states across the rule registry
- Number of false-positive rules correctly caught (precision)
- Number of true-positive rules incorrectly flagged (recall)
- Any state-transition reversals (Merlin revivals)
- Total diagnostic noise reduction achieved

---

*This PDR is a sibling of `QBIT-Immune-Checkpoint-PDR.md`. Together they form a two-layer immune system: the checkpoint gates individual findings, the self-auditor gates the rules that produce them. The checkpoint is the cell's life-cycle gate; the self-auditor is the organ's senescence gate.*
