# From Nucleus to Harness — the first cyclotron proposal that shipped

Nucleus: `bytecode-seal + canonical-serializer + diagnostic-event-bus + immutable-packet
+ schema-verifier`, topology **T2** (the fully-executable one of 7 bond arrangements).
Geometry verified sound in `2026-08-11-nucleus-geometry-results.md` — dangling 0 / 6 seeks.

Built: `scripts/evidence-integrity-harness.mjs`

## The nucleus's port chain IS the pipeline

    structure -> [canonical-serializer] -> artifact -+-> [bytecode-seal]   -> checksum
                                                     +-> [schema-verifier] -> verdict
               artifact + checksum -> [immutable-packet] -> sealed-packet
                                   -> [diagnostic-event-bus] -> diagnostic-event

Each stage is a named function implementing exactly one atom's `offers`/`seeks` contract.
The harness was not designed and then matched to the nucleus; the nucleus's ports
determined the stage boundaries.

## Why this problem

Three real integrity failures occurred in a single session on 2026-08-11:

1. A 100,000-trial evidence artifact was **overwritten by a 1,500-trial smoke test**.
   Caught only because someone thought to print `trials`.
2. A sealed benchmark was **rewritten mid-session by another process** (12:53). Caught only
   because the split checksum happened to be compared.
3. A scoring change **silently altered every downstream benchmark number**. Caught only by
   a hand calculation.

Nothing in the repository audited its own evidence. Each catch was luck.

## The harness can fail — verified, not assumed

Both detectors were tested against deliberate tampering, because a check that cannot fail
is worthless (see `project-checks-that-cannot-fail`).

| test | tamper | result |
|---|---|---|
| A | `control.nuclei` 26 → 999, checksum untouched | `CONTENT_DRIFT` — **caught** |
| B | `fission_reactor.correct` → 240, checksum untouched | `SELF_CHECKSUM_MISMATCH` **and** `CONTENT_DRIFT` — **caught** |
| restore | revert both | `errors 0` — **no false positives** |

`SELF_CHECKSUM_MISMATCH` works without any prior manifest — it recomputes the artifact's
own declared seal against its own body. `CONTENT_DRIFT` catches anything that changes since
baseline, including artifacts that carry no seal at all. The two are independent.

## What it found on first run — 46 artifacts

| finding | count | meaning |
|---|---|---|
| `NO_REPRO_COMMAND` | 10 | markdown evidence with no way to reproduce it |
| `NO_CHEMISTRY_PROVENANCE` | 5 | numbers depend on `concept-chemistry.js`, no weights version recorded |
| `NO_SELF_CHECKSUM` | 1 | **defect in this session's own null-substrate script** |

The `NO_CHEMISTRY_PROVENANCE` count is the defect identified by hand earlier the same day —
now detected mechanically instead of by memory. The five are exactly the artifacts produced
before `chemistryProvenance()` existed.

`NO_SELF_CHECKSUM` flagged `2026-08-11-null-substrate-attack.json`: the script built a body
and wrote it without sealing it. **The harness audited its own author's work from the same
session and found a real omission.** Fixed in `scripts/null-substrate-attack.mjs`; the
artifact is now sealed `null-substrate1:57106041…` and the finding is gone.

## Current state

    audited 46 artifacts
    errors 0   warnings 15

Baseline manifest at `docs/superpowers/evidence/INTEGRITY-MANIFEST.json`. Any future
overwrite, deletion, or silent edit of a sealed artifact now produces a non-zero exit code.

## Honest limits

- **Improvement is demonstrated, not quantified against a baseline.** The prior detection
  rate for these three failure classes was zero because no detector existed; "0 → caught"
  is a real improvement but it is not a measured effect size.
- The harness proves the *shape* was buildable and useful. It does **not** retroactively
  validate the cyclotron's ranking — the geometry result (n = 3 distinct compositions,
  sign test p = 0.25) still stands as suggestive, not established.
- One atom in the nucleus cites `codex/runtime/event-bus.js`, **which does not exist**. The
  bus stage is implemented inline. The atom bank carries an aspirational evidence path, and
  that is a defect in the bank worth fixing before the next run.

## Repro

    node scripts/evidence-integrity-harness.mjs           # audit
    node scripts/evidence-integrity-harness.mjs --write   # record baseline
