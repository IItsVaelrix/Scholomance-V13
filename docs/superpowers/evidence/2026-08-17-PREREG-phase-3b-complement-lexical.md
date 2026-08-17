# PREREG — Phase 3B: complement lexical values (OBSERVE-only)

**Frozen before implementation.** Parent prereg:
`2026-08-17-PREREG-semantic-competition-coverage.md`. Baseline:
`2026-08-17-compat-waterfall-census.md` (post-3A). Demand evidence:
`2026-08-17-complement-dark-ends.md`.

## Question

Phase 3A named the complement relations. When complement relations exist,
does supplying TRAIN-derived lexical content move the value stages
(left/right value availability) without altering relation coverage or
COMPAT behavior?

One variable at a time: this act supplies **lexical material only**.
No COMPAT rows. No weights. No projection changes. No composition changes.

## Chamber (inherited, unchanged)

- Same 1,824 DEV sentences ≤ 28 tokens
- Same token limit, same decision-competitive cell definition
- Same glue exclusions, same stable forest, same TRAIN-only authorship rule
- TEST sealed. OBSERVE only. SCORE not licensed.

## Demand census findings that bound this act

Over 6,361 complement-relation decision edges (INFINITIVAL_COMPLEMENT
1,884; PROPOSITIONAL_COMPLEMENT 4,477): **0 edges have both ends lit.**

- Right (complement) end: 6,361/6,361 dark. Types INF, SBAR, S have **no
  reachable provider entry at all** (type-level darkness, structural).
- Left (governor) end: 6,093/6,361 dark.
  - S governors 2,034 (type-level dark), SBAR governors 1,245 (type-level).
  - VP governors 2,187: feature seed has no `::VP` entries even though the
    lexical layer already aliases VP→V (TYPE_ALIASES). Plumbing asymmetry,
    not missing lexicon: `like::VP` is dark while `like::V` is lit.
  - V governors: genuinely dark lemmas with TRAIN mass — want::V (mass 130,
    50 edges), need::V (mass 130, 29 edges).

## Change set (exhaustive and closed)

1. `classifyLemma` type branches (lemma-independent structural classes):
   - `S`    → entity.abstract:true, entity.concrete:false, entity.animate:false
   - `SBAR` → entity.abstract:true, entity.concrete:false, entity.animate:false
   - `INF`  → function.infinitival:true, function.adposition:false
   Rationale: an INF constituent is infinitival by construction (same fact
   as `*::TO`); a clause constituent composed as a complement denotes
   propositional content — abstract, not concrete/animate. No other
   dimensions touched. These are facts about the constituents, not about
   which derivation should win.
2. `compileSeed`: emit `*::S`, `*::SBAR`, `*::INF` defaults; emit
   `lemma::VP` copies for every lexically classified verbal lemma
   (VP inherits its head verb's classification — alias law made explicit
   in the seed, no machinery change in feature-provider.js).
   NP/NPO/NC aliases are NOT included: no NP end appears on any
   complement-relation edge in the census. Deferred until demanded.
3. COGNITION bag += `want`, `need`. Rationale: propositional-attitude
   verbs, class-consistent with existing members (hope, wish, expect,
   intend, plan). TRAIN terminal mass 130 each; top-ranked dark governors
   by cells affected. `prefer`, `threaten`, `happen`, `allow` fall outside
   the frozen authoring cutoff (top-80 dark ends by cells affected, mass
   ≥ 30 under the lexical type) and STAY DARK — honest abstention, next
   census will surface them again.
4. IRREGULAR += `tried → try`. Morphological form correction only ('try'
   is already bagged in CREATION; the stemmer maps tried→tri, missing it).
5. EXPERIMENTAL_FEATURE_SCHEMA_VERSION 1.1.0 → 1.2.0 (lexical growth,
   lattice unchanged).

Nothing else. No FEATURE_COMPAT rows. No projectRelation changes. No
composeMeanings changes. No weight changes. No TEST access.

## Frozen predictions

Baseline (post-3A): edges 57,012 · relationAvailable 29,570 ·
leftValue 7,305 · rightValue 1,967 · mapping 390 · fire 342 ·
namedComplete 44,546 · silent 12,350 · C1 12,466 · C2 27,777 · C3 16,543 ·
bothNamed 15,063 · bothT1 85.

Exact (falsifiers — any miss means the implementation is wrong):

- **P1** relationAvailable = 29,570 (no projection change)
- **P2** namedComplete = 44,546 (roles were already filled; only `unknown`
  flags clear)
- **P3** silent = 12,350 / 21.7% (complement edges were already
  named+complete; silence definition unaffected)
- **P4** actualCompatFire on complement-relation edges = 0 exactly
  (no mappings exist for INFINITIVAL_COMPLEMENT / PROPOSITIONAL_COMPLEMENT)
- **P9** C1 = 12,466 exactly (no composition change)
- **P10-sum** C1 + C2 + C3 = 56,786 exactly (reclassification only)
- **P12** protection: 1,824 analysed / 585 parsed / 0 throws /
  eventsMean identical / fingerprints 8/8 / TEST sealed

Directional with floors/ceilings:

- **P6** rightValueAvailable ≥ 7,967 (baseline + all 6,361 complement
  right ends; plus declared spillover only)
- **P7** leftValueAvailable ≥ 10,700 (baseline + 3,279 S/SBAR governors
  + want/need/tried V governors + VP governors with classified heads)
- **P8** C2 ≤ 24,700 (governor senses supplied: 3,279 S/SBAR-governed
  edges + ~190 want/need/tried governor edges + declared spillover)
- **P10** C3 ≥ 19,500 (C2→C3 reclassification of now-complete-but-unfired
  edges)
- **P11** bothNamed = 15,063 exactly; bothT1 = 85, subject to the P5
  spillover rule

Spillover rule (P5): global actualCompatFire is predicted to remain 342.
The VP seed alias lights VP ends on non-complement edges too (e.g.
NP+VP clause edges with 'subject-like' relations), where mappings already
exist. Fire movement is permitted ONLY through that declared channel and
MUST be enumerated edge-class by edge-class in the evidence; any movement
not decomposable into VP-alias spillover on pre-existing relations is a
falsification and triggers rollback. compatMappingAvailable follows the
same rule.

## Success criteria

3B succeeds if: P1–P4, P9, P10-sum, P12 hold exactly; P6–P10 floors met;
and all movement decomposes into the declared channels. Fire staying flat
is a SUCCESS: it means wall two (lexical values) was removed and the
reactor is now pointing at wall three (COMPAT mappings for the new
relations — Phase 8).

## What this act forbids

- No COMPAT authoring, no weight changes (mapping→fire starvation is the
  next wall, not this one)
- No classes for lemmas outside the frozen cutoff (place, time, company,
  sources, based, married, allowed, happen, prefer, threaten stay dark)
- No NP alias, no new dimensions, no schema keys beyond the change set
- No TEST access, no SCORE

## Next expected wall (post-3B)

Edges reach stage ≤ 3 on complement relations with no mapping rows:
compatMappingAvailable stays ~0.7% while values rise sharply. That is the
signal to author the relation-keyed COMPAT registry (Phase 8) before
widening to inversion (Phase 4).
