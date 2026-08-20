# DESIGN — Parser Failure Atlas

Status: **RESEARCH LEDGER** — not a grammar change.
Date: 2026-08-18.
Contract: `PB-PARSER-FAILURE-ATLAS-v1`.
Target: `codex/research/parser-failure-atlas/`.

---

## 1. Question

When the packed composer fails to produce a warranted parse of a gold
treebank sentence, *where* did the chart stop, *what* is the failure
layer, and *which constructions* recur as sole causes?

This is not a request to raise coverage. The atlas measures. It does
not admit roots, add bonds, or retune a doorway.

## 2. Jurisdiction

Production already exposes:

- `diagnose()` / `OUTCOME` — `PARSED`, `LEXICAL`, `GRAMMAR`, `ROOT_TYPE_MISMATCH`
- `runTreebank()` — coverage / containment / decision
- leftover types on dark spanning charts (`SBAR`, `RELC`, `INV`, `FRONTED`, `PUNCT`, `PP`, `APPOS`, …)
- perturbation telemetry (optional later plate)

The atlas consumes those. It does not modify `compose.js` or
`compose-packed.js`. `MIN_COVERAGE_SPLIT` and Ballistics are a different
volume (semantic adjudication).

## 3. What enters the atlas

A sentence is a failure plate if any of these hold:

| Plate | Meaning |
|---|---|
| `LEXICAL` | fails with the real POS table, parses with gold UPOS |
| `GRAMMAR` | fails with both; frontier is a missing construction |
| `ROOT_TYPE_MISMATCH` | chart spans, type is not a licensed root |
| `CONTAINMENT_MISS` | a spanning `S` exists, gold `{subject, verb}` is not among projections |
| `OVERGENERATED` | parses with the real table, gold UPOS forbids the parse |

Successes (`PARSED`, contained, not over-generated) are counted for
rates and then dropped. They are not atlas cases.

`test` is sealed. Plates are built from `train` + `dev`. Test may be
scored into a sealed file; ranking must not read it.

## 4. Frozen packet

```
{
  caseId,
  split,          // train | dev | test
  sentId,
  text,
  tokens,
  gold: { subject, verb, rootUpos },
  plate,
  diagnosis: { outcome, overGenerated, categories, nonProjective },
  chart: {
    spanningTypes,
    stableTypes,
    moleculeCount,
    frontierSignature,
    leftoverTypes
  },
  metrics: { contained, decided },
  versions: { packetContract, composer, diagnosis, corpus }
}
```

No proposed bond. No recommended root. Location comes from the chart;
the name comes from UD; the ranking comes from our failures.

## 5. Ranking construction holes

Only `GRAMMAR` cases with a named frontier enter construction ranking.

```
soleCause  = sentences whose entire frontier is this one category
```

That number is the falsifiable prediction: *a bond for this relation
unblocks N sentences.* Mixed frontiers are reported and must not be
promised.

`ROOT_TYPE_MISMATCH` leftover types are ranked separately. They are
not construction holes. Illumination is not admission.

`LEXICAL` cases are a tagger plate. Do not invent grammar for them.

## 6. First milestone

```
EWT train + dev (max 28 tokens)
  → score with composePacked + diagnose
  → freeze failure packets
  → plate
  → rank GRAMMAR sole-cause constructions
  → rank leftover types on ROOT_TYPE_MISMATCH
  → seal test
```

Stop. Do not add a bond. Do not open a doorway.

## 7. Isolation

```
codex/research/parser-failure-atlas/
scripts/parser-failure-atlas.mjs
tests/research/parser-failure-atlas/
```

Production compose stays the thing measured.
