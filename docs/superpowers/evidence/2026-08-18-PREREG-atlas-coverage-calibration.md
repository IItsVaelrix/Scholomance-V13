# PREREG — Atlas Coverage Cell Calibration

- **Date frozen:** 2026-08-18
- **Classification:** research / diagnostic. No production semantics, no parser grammar, no audition wiring.
- **Frozen HEAD:** `b508e924273f3d98c331a795abf08415531c232a`
- **Worktree dirty at freeze:** 119 files (other agents' in-flight work; NOT to be touched or staged)

## Question

Can Atlas distinguish actually-stranded modules from modules merely missing
basename-matched tests, without drowning the signal in scratch files?

## Hypothesis A

A consumer-graph coverage cell will produce a much smaller, causally-meaningful
set than the current filename heuristic while preserving known positives.

## Preregistered anchors (must all reproduce, or STOP)

| ID | Module(s) | Ground truth | Must surface as |
|----|-----------|--------------|-----------------|
| POSITIVE | `codex/core/constellation/audition/*` | committed, 0 production consumers, 0 test consumers, diagnostic-only | STRANDED or EXPERIMENTAL-UNDECLARED |
| TRANSITIVE | `codex/core/constellation/derivation-factors.js` | production-reachable, indirectly exercised, no direct unit pin | TRANSITIVELY_EXERCISED (NOT stranded) |
| WIP | `subordination / inversion / punctuation / relative / list` (grimoire families + list) | dirty or untracked | reported but marked WIP, EXCLUDED from action queue |
| NOISE | `.tmp/*`, `_shot*`, `_diag*` | scratch | must NOT count as source coverage violations |

## Preregistered metrics

- consumer-graph precision ≥ 0.90 (vs hand-labeled calibration set)
- known-stranded recall = 1.00 (every audition module surfaced)
- scratch false positives = 0

## Crucial falsifiers (experiment FAILS if)

1. Modules with zero direct tests are labeled deficient DESPITE strong
   production + transitive-test reachability → popularity contest recreated.
2. Audition disappears because diagnostic scripts are counted as consumers.
   **Consumer KIND matters.** A diagnostic inbound edge must not make a
   subsystem production-wired.

## Primary metric

Precision against a hand-labeled calibration set (~40 modules), NOT
"violation count decreased."

## State vocabulary (consumer-graph cell)

DIRECTLY_PINNED · TRANSITIVELY_EXERCISED · PRODUCTION_UNTESTED ·
RESEARCH_ONLY · DIAGNOSTIC_ONLY · STRANDED · WIP

## Scope rules

**Include (coverage denominator):** `codex/core/**`, `codex/runtime/**`,
`src/hooks/constellation*`, relevant `codex/server` constellation surfaces.

**Exclude from denominator (may still appear as consumers):** `.tmp/**`,
generated evidence, fixtures, snapshots, `_shot*.mjs`, `_diag*.mjs`, one-off
probes, vendor/generated code.

## Stop condition

When the rerun reliably answers: (1) is this module part of production?
(2) how, if at all, is its behavior exercised? (3) is its current lifecycle
state intentional? → STOP. Do NOT write tests or wire audition. Next
intervention is chosen from the corrected ledger.

## Output

Atlas Vitality Ledger. Classification FIRST, prioritization SECOND.
