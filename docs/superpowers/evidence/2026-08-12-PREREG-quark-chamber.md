# PREREG — Quark Chamber v1 (PB-QUARK-CHAMBER-v1)

**Written:** 2026-08-12, before any measurement in this plan was run.
**Design:** docs/superpowers/specs/2026-08-12-quark-chamber-design.md (commit 6b642359)
**Plan:** docs/superpowers/plans/2026-08-12-quark-chamber.md

Four falsifiers. Each can kill the design. Statistics, thresholds and the
multiple-comparison correction are fixed here and may not be changed after a
result is seen. Any statistic added later is a new prereg, not an amendment.

## Correction

Four statistics per family, alpha = 0.05, Bonferroni m = 4, so the
per-statistic threshold is **p < 0.0125**.

Empirical p-values use the conservative estimator
`p = (1 + #{null >= real}) / (1 + N)`, never `#{null >= real} / N`.
This differs slightly from the exploratory p = 0.030 quoted in design
section 4.1; the design's figure is exploratory and is not a result.

## F1 — Confinement exceeds the degree-matched configuration null

- Substrate: full bank, 56 atoms, 20 authored bridges.
- Null: bipartite double-edge-swap preserving per-atom offer/seek counts AND
  per-port global offer/seek frequencies. N = 200 shuffles, seed 0x51554152.
- Statistics, declared in advance: `edges`, `rules`, `confined`, `maxWaypoints`.
- Threshold: >= 2 witnesses (fixed before this run).
- **Design fails** if `confined` does not exceed the null at p < 0.0125.
- Note in advance: the `rules` statistic is expected to run the OTHER way
  (the real bank emits FEWER distinct candidates than chance). Any claim that
  the slingshot "finds many new rules" is refuted by this table, not supported
  by it. The predicted signature is concentration, not yield.

## F2 — Authored-bridge recovery

- Hold out all 20 authored bridges. The graph becomes exact-match-only.
- Ask: does the generator rediscover the held-out (from-port, to-port) pairs?
- Statistic: `recall` = recovered / 20. Relation LABELS are authored and are
  NOT expected to be recovered; only the port pair counts.
- Control: the same holdout over 200 degree-matched shuffles.
- **Design fails** if real recall does not exceed the null at p < 0.0125.
- Declared in advance: recovery may be ZERO. Exact-match-only licensing may
  simply not reach the pairs a human bridged. That is a clean refutation of
  the claim that authored bridges are derivable, and it must be reported as
  one rather than reframed.

## F3 — Grant outcome predicate (F8a)

- Every committed quark must be markable `grant_was_wrong`.
- **Design fails** if any proposed grant cannot be resolved to one of
  `succeeded | regressed | needed_rework | grant_was_wrong`.
- A quark nobody can mark wrong is decorative prose.

## F4 — Novelty is not self-fulfilling

- Novelty is `1 - max similarity to constituent atoms`, so admitting ANY bond
  between distant ports raises it by construction.
- Control: permuted relation algebra — same count of admitted quarks, same
  lambda, `DECLARED_COMPOSITIONS` permuted across the composition universe.
- Statistics: two-sample Kolmogorov-Smirnov on shortlist molecule novelty, and
  a chi-square on verdict counts.
- **Design fails** if real and permuted algebras are indistinguishable
  (both p >= 0.0125). Then the algebra carries no information and the chamber
  is a noise injector.

## APPENDIX — written AFTER F2 was run (2026-08-12). NOT pre-registered.

Everything above this line was fixed before any measurement. Everything below
was written after seeing F2's result and must never be cited as a prediction.

**F2 returned recall 0/20 (null 0.005 ± 0.0705, p = 1). It is REFUTED.**

Measuring why showed the test was **unpassable by construction on this
substrate**. A depth-1 slingshot can emit rule `X -> Y` only when some waypoint
atom both SEEKS X and OFFERS Y. Nineteen of the twenty authored bridges have no
such waypoint anywhere in the bank; the one that does
(`diagnostic-event -> anomaly-signal`, via `subtlety-fingerprint`) has a single
witness, below the confinement threshold of two. Maximum attainable recall was
therefore 1/20 before confinement and 0/20 after — for ANY implementation.

So F2's zero is evidence about the bank's topology, not about the generator. A
check that cannot succeed is as broken an instrument as one that cannot fail
(`project-checks-that-cannot-fail`), and this one could not succeed.

**Consequence for the remaining work, decided by the reviewer:** the chamber
continues on COMPLEMENTARY grounds. The claim "derived quarks rediscover human
judgement" is dead and is not revived. The claim now under test is the weaker
and disjoint one: quarks generalise where a waypoint already exists, which is
precisely where humans did not need to author a bridge.

F1, F3 and F4 are untouched by this. None of them depends on recovery, and all
three remain as pre-registered above.

## What no result here licenses

None of these tests establish that a quark is USEFUL. They establish that the
generator's output is not a degree artifact, that the algebra is not inert,
and that grants are falsifiable. Utility requires 40 resolved grants through
F8a and is explicitly out of scope for v1 (PDR F9, MIN_RESOLVED = 40).
