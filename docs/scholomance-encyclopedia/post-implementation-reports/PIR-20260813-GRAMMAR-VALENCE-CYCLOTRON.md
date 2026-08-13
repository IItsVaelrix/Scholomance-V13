# Post-Implementation Report

## 1. Change Identity

- **Report ID:** PIR-20260813-GRAMMAR-VALENCE-CYCLOTRON
- **Feature / Fix Name:** Constellation Grammar Valence Cyclotron
- **Author / Agent:** Codex Architect
- **Date:** 2026-08-13
- **Branch / Environment:** `feature/semantic-calculus-lexical-predicates`
- **Related Task / Ticket / Prompt:** “implement” the proposed antigen-bound semantic-atom detector for missing Constellation grammar
- **Classification:** Architectural / Behavioral / Diagnostic
- **Priority:** High

## 2. Executive Summary

Implemented the additive `PB-CONSTELLATION-GRAMMAR-GAP-v1` report and a pure-core
Grammar Valence Cyclotron. The scanner admits only failures already classified
`GRAMMAR`, finds adjacent maximal chart molecules with no licensed bond, turns
the frontier into semantic atoms, matches optional antigen memory cells, and
reports Result-Conserving or named construction candidates. It never injects
the diagnostic vacancy into the parser chart and never promotes a candidate to
the Grimoire. A bounded CLI emits the deterministic report as JSON without raw
sentence text.

## 3. Intent and Reasoning

### Problem Statement

Constellation already counted unlicensed failure-frontier pairs, while the
Semantic Valence Cyclotron discarded unsuccessful assembly attempts as an
aggregate `unboundTrials` count. There was no sealed artifact connecting those
two facts or distinguishing missing grammar from lexical and root-type failure.

### Why This Change Was Chosen

The implementation adds a specialized diagnostic mode beside the existing
Cyclotron rather than weakening `PB-SEMANTIC-MOLECULE-v1`, whose identity is a
set of licensed bonds. Existing gap proposal and reactor chemistry remains the
source of construction candidates.

### Assumptions Made

- Gold-POS `diagnose()` remains the canonical failure classifier.
- Antigen cells prioritize recurrent failure shapes but are not linguistic proof.
- Cleri reports prove source/registry properties only and enter by verified report reference.

### Alternatives Considered

- Preserve partial molecules inside the existing Semantic Valence Cyclotron.
- Add the detector as a real Constellation chart molecule.
- Encode grammar gaps as Cleri findings.

### Why Alternatives Were Rejected

Those paths would respectively weaken an existing schema, perturb the observed
parse, or confuse source-code verification with empirical linguistic evidence.

## 4. Scope of Change

### In Scope

- Schema registration and deterministic report identity.
- Grammar-only frontier mining with dependency evidence.
- Semantic frontier/vacancy atoms and antigen memory-cell matching.
- Lawful candidate reporting, checksum verification, CLI, and focused tests.

### Out of Scope

- Automatic bond registration or grammar mutation.
- UI rendering.
- Claiming empirical support without reactor/control/holdout evidence.

### Change Type

- [x] Logic only
- [x] Data model
- [x] Build / tooling
- [x] Documentation
- [x] Multi-layer / cross-cutting

## 5. Files and Systems Touched

| Area | File / Module / Service | Type of Change | Risk Level | Notes |
|---|---|---|---|---|
| Schema | `Scholomance LAW/SCHEMA_CONTRACT.md` | v1.43 additive contract | Medium | No existing payload changed |
| Core | `codex/core/constellation/grimoire/gap-simulation.js` | Strict grammar-only mining option | Medium | Default behavior preserved |
| Core | `codex/core/pixelbrain/grammar-valence-cyclotron.js` | New pure diagnostic | Medium | No I/O or registry mutation |
| Script | `scripts/grammar-valence-cyclotron.mjs` | Bounded offline JSON runner | Low | Allow-listed flags |
| QA | `tests/codex/core/pixelbrain/grammar-valence-cyclotron.test.js` | Focused regression coverage | Low | Determinism and false-positive boundaries |

### Dependency Impact Check

- **Imports changed:** gap miner now reuses `diagnose()` and `goldPosMap()`.
- **Shared state affected:** none.
- **Event flows affected:** none.
- **UI consumers affected:** none.
- **Data consumers affected:** optional offline/report consumers only.
- **External services affected:** none.
- **Config/env affected:** none.

## 6. Implementation Details

### Before

Gap mining treated every failed parse alike and retained raw examples for its
human-oriented simulation. The Semantic Valence Cyclotron counted unbound
trials but did not preserve their unmet ports.

### After

`grammarOnly: true` performs gold classification before pair aggregation and
attaches bounded corpus references plus only the dependency frontiers crossing
the adjacency. The new Cyclotron creates three sealed atoms per gap—left,
right, and vacancy—then reports antigen matches and construction candidates.

### Architectural Notes

- Core functions are deterministic and recursively freeze emitted artifacts.
- Existing `BONDS`, `PB-SEMANTIC-MOLECULE-v1`, and Cleri contracts are unchanged.
- Supplied Cleri report objects must pass their canonical verifier before their report IDs enter evidence.

### Tradeoffs Accepted

- The report labels proposals `CANDIDATE_ONLY`; reactor validation remains a separate empirical stage.
- Corpus references are bounded to sixteen per gap to keep reports finite.

## 7. Behavior Changes

### Internal Behavior Changes

- Gap mining accepts an optional strict failure-classification gate.
- Missing sentence IDs become deterministic sentence digests.
- A runnable JSON report now identifies observed grammar vacancies.

### User-Facing Behavior Changes

- None; this is an offline diagnostic surface.

## 8. Risk Analysis

### Primary Risks Introduced

- Gold-POS diagnosis adds a second parse in strict mode.
- Repeated maximal types can yield several pair identities for one boundary.
- Candidate presence may be mistaken for grammatical proof by downstream users.

### Blast Radius

- [x] Isolated

### Risk Reduction Measures Taken

- Strict mode is opt-in for the existing gap simulator and always-on only in the new report.
- Schema language and verdicts prohibit promotion.
- Raw examples are reconstructed out of the canonical report rather than copied.

### Rollback Readiness

- [x] Easy rollback

### Rollback Method

Remove the new module, test, script, and v1.43 notice; revert the optional
`grammarOnly` additions in `gap-simulation.js`.

## 9. Validation Performed

### Automated Validation

- [x] Unit tests passed
- [x] Integration tests passed
- [x] Type checks passed for the JavaScript target
- [x] Lint passed

### Exact Validation Notes

- Focused Vitest suites: 23/23 passed across the new detector, failure diagnosis, and Grimoire.
- Reactor plus detector suites: 26/26 passed.
- Focused ESLint completed with `--max-warnings=0`.
- Repository-wide `npm run lint` passed.
- `npx tsc -p tsconfig.checkjs.json --noEmit` passed.
- Local innate and adaptive immunity scans reported zero findings across all four changed code/test files. The MCP immunity service refused source transmission to its unverified external destination, so no remote source export was attempted.
- A 50-record DEV CLI smoke run emitted five grammar gap types, one lawful candidate, stable checksums, and no raw sentence text.
- Repository-wide `npm run typecheck` remains blocked by the pre-existing `ConstellationResult.ts` schema literal mismatch (`"1.1.0"` versus `"1.0.0"`).
- Repository-wide `npm run security:qa` remains blocked by pre-existing broad-scan findings in worktrees, archived fixtures, dependency allowlists, and unrelated runtime files; none names a changed file.

## 10. Regression Checklist

- [x] No broken imports
- [x] No orphaned state
- [x] No duplicated parser law introduced
- [x] No hidden hard-coded IDs
- [x] No contract mismatch between implementation and schema
- [x] No schema drift introduced
- [x] No unsafe fallback behavior introduced

### Specific Retest Areas

- Full DEV/TEST corpus report sizing and runtime.
- Reactor validation of high-frequency `CANDIDATE_ONLY` rows.

## 11. Performance and Stability Notes

### Performance Impact

- Strict scanning is intentionally slower because gold classification performs a second parse.
- Report size is bounded by `topPairs`, `candidateLimit`, and corpus-reference caps.

### Stability Impact

- [x] Improved

## 12. Security / Safety / Data Integrity Review

- **Auth impact:** none.
- **Permissions impact:** none.
- **Input validation impact:** CLI flags use allow lists and positive-integer bounds.
- **Data integrity concerns:** report and nested atoms are checksum-bound and frozen.
- **Logging / audit trail concerns:** stdout contains only the canonical report.
- **Secrets / env exposure risk:** none.
- **Unsafe execution paths introduced?:** no.
- **Security follow-up needed?:** no.

## 13. Documentation Updates

- [x] Schema contract updated
- [x] PIR added
- [x] Internal comments updated

## 14. Known Gaps and Follow-Up Work

### Known Incomplete Areas

- This slice detects and proposes; it does not run the DEV/control/TEST reactor inside the report command.
- No UI or persistent report store exists.

### Follow-Up Recommendations

- Bind reactor evidence into a future additive validation report rather than changing this observation contract.
- Seed antigen cells only from human-approved, recurring grammar-gap signatures.

## 15. Final Verdict

- [x] Complete with acceptable risk

### Final Notes

The requested detector is implemented as a truthful observation surface. It
can identify recurrent missing grammatical interfaces and name lawful candidate
structures, but it cannot silently convert desire-to-connect into grammar law.
