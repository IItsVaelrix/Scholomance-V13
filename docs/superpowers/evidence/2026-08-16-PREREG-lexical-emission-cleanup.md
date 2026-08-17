# PREREGISTRATION — Lexical emission cleanup

**Written 2026-08-16 BEFORE any emission change is applied.**
This arm is not part of the T1 substrate treatment. The 2026-08-16
unknown-remainder census found `i::PROPN`, `if::PROPN`, discourse-as-content,
and particle-as-N/ADJ inside the remaining UNKNOWN mass. Those keys must not
receive semantic particles.

## Question

If closed-class words stop emitting implausible content types, does the
hypothesis space shrink without collapsing coverage, containment, or the
already-passed T1 disagreement gates?

## Treatment

One emission change, declared before running:

- suppress `PROPN` on closed-class lemmas except all-caps acronyms of length ≥ 2
- suppress N/V/ADJ on discourse words that are never nominal, verbal, or
  adjectival (`so`, `very`, `then`, `here`, `there`, …)
- optional second slice, only if the first slice is clean: particle lemmas
  as N/ADJ (`out`, `up`, `back`)

No particle is authored for a C key. No `ADMIT_BOND`. No TEST file.

## Why this is a new baseline

Emission changes the actual parser hypothesis space. After this arm:

- forest fingerprints may change
- coverage and containment must be re-measured and frozen
- T1 exposure is restarted from the new baseline
- the previous 46.6% / 53.4% numbers are retired, not compared as a fitted delta

## Controls

Replay the current atomizer on the same DEV chamber. The only allowed
difference is the declared emission rule. A silent inventory edit in the
same commit fails the prereg.

## Endpoints

Primary: C-key emission count on DEV ambiguous tokens goes to 0 for the
declared slice.

Protection: throws stay 0. Coverage and containment are reported, not
required to stay identical. If either drops, the drop is the result, not
a reason to add particles to the suppressed types.

T1: do not interpret accuracy. Re-run the frozen exposure gate on the new
baseline. Score disagreement must still be ≥ 10% and rank disagreements
≥ 30 after any later substrate work; this arm alone is not required to
move those.

## Census prediction (not a success criterion)

Dropping current C atoms without adding particles was estimated at:

- 436 items leave the 8,073-item chamber
- evidence 48.3%, UNKNOWN 51.7%

This arm is for hypothesis quality, not for buying the 13.4 points to 60%.

## Reproduction (after implementation)

A dedicated script, not `scripts/semantic-substrate-dev.mjs` with a flag
that also edits the inventory.
