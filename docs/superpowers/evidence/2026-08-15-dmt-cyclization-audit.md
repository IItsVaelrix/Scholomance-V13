# AUDIT — Semantic Silicone Reactor, DMT cyclization and PPSP

Subject: `codex/core/pixelbrain/semantic-silicone-reactor.js` (untracked),
`scripts/semantic-dmt-persistence.mjs`
Auditor: Claude. Date: 2026-08-15. Baseline commit: `4b47ec2e`.

**The file moved five times during this audit** (753 → 761 → 990 → 1489 lines;
last hash `bcf92c1a`, mtime 04:46). Every number below is stamped with the
version it came from. Cross-run comparisons in this document are between
*different builds of the reactor* and are reported as a trajectory, not as
replication.

---

## Verdict

| claim | status |
|---|---|
| DMT raises transmutation rate | **HOLDS** — 7 wins / 0 losses across spins, sign test p = 0.016 |
| DMT raises post-quench persistence | **NOT SUPPORTED** — the aggregate is a composition artifact; see §3 |
| DMT modifies bonds intrinsically (`TREATMENT_INTRINSIC_BOND_MODIFICATION`) | **CONTRADICTED BY ITS OWN FACTORIAL** — κ's main effect is **−10.45pp** |
| Rings resist centrifugal tearing | **NOT ESTABLISHED** — it is the constant `stressMultiplier = isRing ? 0.35 : 1.45` |
| Grounding / macrophage screens contribute to the verdict | **NO** — `stable ⊆ grounded` in both arms; PPSP ≡ physical stability |

One genuine, undesigned finding did emerge: **DMT trades ring quality for ring
quantity** (§5).

---

## 1. Instrument repairs and what each one cost the effect

The headline DMT persistence advantage, measured after each repair:

| run | instrument state | control | +DMT | Δ | p |
|---|---|---|---|---|---|
| 1 | grounding scored the molecule's **name** | 4.63% | 49.08% | **+44.5pp** | — |
| 2 | rename closed; `sio-dimer` vocabulary missing | 33.33% | 37.04% | +3.7pp | 0.53 |
| 3 | vocabulary closed; shared daughter pool | 31.43% | 38.76% | +7.3pp | 0.24 |
| 4 | 2×2 factorial added | 45.0% | 59.35% | +14.3pp | **0.025** |

Two-proportion z-tests computed from the reported counts (run 4: 54/120 vs
73/123, z = 2.24).

**About 41 of the original 44.5 points were a string comparison.** Run 4 is the
first nominally significant result, and §3 shows it is a mix artifact rather
than a treatment effect.

---

## 2. Defects found, with status

Measured by the auditor unless marked *(reported)*.

| # | defect | evidence | status |
|---|---|---|---|
| 1 | Topology decided by `rng() > 0.35`, not by the field | coin forced to 0.36 → **49 rings**; forced to 0.34 → **0 rings**; 115 molecules and all chain lengths identical either side | **FIXED** — replaced by strain-energy closure |
| 2 | The physics check never vetoed a coin-flip candidate | `closureBond.isBondStable` rejected **0 of 49** | **FIXED** with #1 |
| 3 | "Cyclic siloxane rings" closed through a pendant methyl | all 43 closures were `ch3-ligand → si-core` (34) or `→ si-trifunctional` (9); **zero closed Si–O** | **UNVERIFIED** — recheck after the strain rewrite |
| 4 | `TRANSMUTATION_THRESHOLD_ENERGY = 45` unreachable-low | minimum `netImpactEnergy` at the lowest legal spin (60) was **138.5**, 3× over; 60× over at spin 279; 20/20 pairs cleared at every spin | **FIXED** — sweep now shows a gradient |
| 5 | Reactor semantically vacuous | anonymising every precursor (`offers:['zzz']`, `seeks:['qqq']`, labels, domains, evidence) gave **byte-identical** assembly: 122 molecules, 23 cyclic, 61 linear, 38 network | **OPEN** — only `mass` and `charge` are read |
| 6 | `DEFAULT_SILICONE_BRIDGES` exported, never used | grep: zero references in the module | **OPEN** |
| 7 | Purity claim false; seal cannot detect it | `generationTimestamp: Date.now()` under a "zero process state, 100% deterministic" header; checksum stable only because the field never reaches the report body | **OPEN** |
| 8 | Ballistics screen passed noise | bar 0.40 — real siloxane 0.7623, **`banana telephone opera` 0.7924**, **all-empty-strings 0.7135**, all `grounded: true` | **FIXED** — replaced by feature-based grounding |
| 9 | Grounding scored the name, not the graph | same bonds, renamed: `Linear Poly-Siloxane Chain` 0.1991 **not grounded** → `Cyclic Siloxane Ring D4` 0.3143 **grounded**. Ring name with **atoms 0, bonds 0, weight −99** still grounded (0.3679). Bare string `Cyclic Ring` grounded (0.3300) | **FIXED** — verified independently; `name` is no longer read |
| 10 | Negative control was the auditor's own string | `'banana telephone opera …'` hardcoded as the noise anchor after being used as an attack | **FIXED** — five diverse controls, max-of |
| 11 | Grounding target omitted one species' entire vocabulary | `SILOXANE_UNIT`'s 4 ports appear **0 times** in the target; dimer-dominated molecules grounded **0 of 79** | **FIXED** — now 68/79 (86%) |
| 12 | Quench to ω = 0 makes the macrophage screen unfailable | tear force is `0.5·µ·ω²·…` ≡ 0 at ω = 0, so `isThermallyStable` and `totalBindingEnergy > 0` pass automatically and `stabilityScore` clamps to 1.0 | **FIXED** — non-zero quench sweep |
| 13 | "Centrifugal Survival Curve" contained no centrifugal information | identical 4.6% / 49.1% at ω = 0…200; ω = 0 row equalled the grounding pass rate exactly (88/108, 75/162) | **FIXED** — curve now decays to 0 |
| 14 | Screens non-binding | `stable ∧ ¬grounded = 0` in both arms; macrophage count = grounding count exactly (88/88, 143/143) | **REGRESSED** — run 4 shows 120/120 and 123/123 |
| 15 | Causal verdict reads magnitude, not sign | prints `TREATMENT_INTRINSIC_BOND_MODIFICATION` while its own decomposition shows κ = −26.2 within rings | **OPEN** |
| 16 | PPSP verdict flipped `HIGH_DECAY_RATE` → `PERSISTENCE_CONFIRMED` | between runs 3 and 4 | **OPEN** — threshold provenance unknown |
| 17 | Section 3 and section 4 report different populations for the same stated ω | *(reported)* 77/119 vs 105/129, and 84/114 vs 120/123 | **OPEN** — label the trial counts |

---

## 3. The persistence claim is a composition artifact

Run 4's 2×2 factorial, at ω_quench = 80:

| stratum | control | +DMT | κ effect |
|---|---|---|---|
| rings | **100.0%** (n = 19) | **73.8%** (n = 65) | **−26.2** |
| chains | 37.3% (n = 134) | 42.6% (n = 94) | +5.3 |
| aggregate | 45.0% | 59.35% | **+14.3** |

DMT wins the aggregate while losing 26 points inside the stratum that carries
the effect. It wins by moving mass into the favourable class — rings go 8 → 69.

**Direct standardisation**, using the reactor's own cell values:

| both arms scored at… | control | +DMT | Δ |
|---|---|---|---|
| the control's mix (12.4% rings) | 45.1% | 46.5% | **+1.4** |
| the DMT arm's mix (40.9% rings) | 62.9% | 55.4% | **−7.5** |
| unmatched, as reported | 45.0% | 59.4% | +14.3 |

Hold composition constant and the advantage is +1.4pp or −7.5pp depending on
which mix is chosen. The +14.3pp exists only because the arms have different
mixes.

**Read the same way the report reads the topology main effect, κ's main effect
is negative:**

```
topology main effect = (100.0 + 73.8)/2 − (37.3 + 42.6)/2 = +46.95   [as printed]
κ        main effect = (73.8 + 42.6)/2 − (100.0 + 37.3)/2 = −10.45   [not printed]
interaction          = −26.2 − (+5.3)                     = −31.5
```

The interaction is larger than either main effect, so neither main effect is a
sound summary and the aggregate should not be quoted at all.

**The topology main effect is not a finding.** `stressMultiplier = isRing ? 0.35
: (atomCount > 6 ? 1.45 : 1.10)` hands rings a 3–4× lower stress by fiat, and
`E_strain(k)·(1 − 0.6κ)` makes DMT produce rings by definition. The causal chain
from κ to +14.3pp passes through two hardcoded constants and no measurement.

> **AMENDED 2026-08-15, later the same day.** The `0.35 / 1.45` multipliers are
> **gone**. `calculateCentrifugalBreakage` now derives `isRing` from
> `graph.hasCycle` — the bond graph, not the topology label, which is the right
> fix — and scales ring stress by `cycleLength` and chain stress by position and
> reduced mass. That is real geometry and the criticism above no longer applies
> as written.
>
> **The confound moved rather than closed.** The two branches do not use the same
> mass model: the cyclic branch hardcodes reduced mass at `10.0` for every
> molecule, while the acyclic branch derives it from `molecularWeight`. Measured
> on a 176-weight molecule at ω=80 — ring reduced mass **10.0**, chain reduced
> mass **44.1**; ring tear stress **8.2**, chain tear stress **81.8**, against a
> mean bond strength of 30.4. The ring survives and the chain breaks because of a
> literal, not because of shape.
>
> This was found by the new `isolateRingClosureEffect` one-variable test, which
> returned a suspiciously perfect **348 wins / 0 losses, p ≈ 0** across five
> quench spins on 143 cyclic molecules. Total separation on molecules sharing
> every bond strength is not what geometry produces, and chasing it found the
> cause. Pinned as a characterisation test so that making the branches consistent
> breaks it deliberately.
>
> **Do not fix this by inventing a mass model.** Making the branches consistent
> is a physics decision, not a bug fix: for a closed ring, cutting any bond leaves
> two equal halves, so the honest symmetric reduced mass is `totalMass / 4`
> uniformly — the same value a chain sees at its *midpoint*. Under that model the
> ring becomes the worst case, not the best, because every ring bond sits at the
> maximum while a chain has only one bond there. Whether that is the intended
> physics is Vaelrix's call, not the auditor's.

---

## 4. What does hold: transmutation rate

Run 4's phase sweep, control vs +DMT across nine spins with data:

- DMT higher at 40, 55, 65, 75, 85, 130, 150 — **7**
- control higher — **0**
- ties at 95 and 110

Sign test on 7 discordant pairs, all one direction: **p = 0.016.**

Effect sizes are small (0.7–6.0pp) and this is a single seed, but the direction
is consistent and the control is a real baseline. This is the reactor's first
result that is neither a hardcoded constant nor a mix artifact.

Earlier builds did not show it: run 1 had the two columns identical at all ten
spins (the DMT barrier reduction, `max(15, 45·(1 − 0.25κ))` → 36.6, sat far
below the achievable minimum of 138.5, so it could not bite), and run 2/3 gave
7 wins / 2 losses, p = 0.18.

---

## 5. The one undesigned finding

**κ = −26.2pp within rings.** Nobody wrote this, and it opposes the treatment.

Supporting measurements, taken on the run-3 build:

| | control | +DMT |
|---|---|---|
| mean ring bond strength | 49.9 | **30.1** |
| mean chain bond strength | 59.3 | 77.4 |
| mean atoms per ring *(run 4)* | 4.16 | 7.55 |
| overall mean bond strength | 58.5 | 54.4 |
| mean \|charge\| | 1.469 | 1.165 |

**The cyclization catalyst trades ring quality for ring quantity** — it builds
large rings out of weak dimer material. DMT rings survive at 86% on bonds less
than half as strong as its chains (30.1 vs 77.4), which is the 0.35 multiplier
genuinely doing work; but each individual ring is worse than a control ring.

This should be the headline in place of the aggregate.

A hypothesis the auditor raised and then **refuted by measurement**: that DMT's
widened `chargeDrift` raises bond strength globally. It does not — mean |charge|
and mean bond strength are both *lower* under DMT. DMT makes the strength
distribution bimodal, not stronger.

---

## 6. Open defects, as a specification

1. **Make the causal verdict read the sign of κ, not its magnitude.** Present
   behaviour prints a confirmation on a negative effect.
2. **Report stratified, drop the aggregate.** Print per-stratum survival plus a
   standardised comparison; suppress the pooled number when the interaction
   exceeds either main effect.
3. **Re-tighten the screens.** `stable ∧ ¬grounded = 0` means the semantic half
   is not in the verdict. Either make grounding reject something stability does
   not, or rename the output from PPSP to physical stability.
4. **Pin the PPSP verdict threshold** in a constant with a comment recording
   when it was set, so a flip from `HIGH_DECAY_RATE` to `PERSISTENCE_CONFIRMED`
   is attributable.
5. **Isolate the 0.35 multiplier with a one-variable test.** Take one
   molecule's bonds, evaluate survival with the ring closure present and
   absent, holding every bond strength fixed. The arm comparison cannot do this
   because bond strength moves with topology.
6. **Recheck defect #3** — verify ring closures now join Si–O and not a pendant
   methyl.
7. **Remove `Date.now()`** from `createDaughterAtom`, or drop the purity claim
   from the header.
8. **Delete or wire `DEFAULT_SILICONE_BRIDGES`.**
9. **Label trial counts** in every section so the same stated ω stops reporting
   two populations.
10. **Add the invariant tests.** None of the 19 would have caught the rename
    bug. Required: renaming a molecule must not change any verdict about it;
    anonymising a precursor's ports must change the assembly; and a noise
    population must fail grounding before any verdict prints.

---

## 7. Two structural gaps, unchanged since the first review

**The reactor has no external referent.** Nothing here has been checked against
a real chemical number. Every headline traces to a hand-authored constant. The
cheapest external test available: silicon rings behave *opposite* to carbon
rings — the Si–O–Si angle is wide (~140–150° vs carbon's 109.5°), so
cyclosiloxanes are far less strained than carbocycles and D3 is the strained,
reactive member while D4 is the favoured hydrolysis product. If `E_strain` was
written from ordinary chemical intuition it will get this backwards. The
control that makes it airtight is to run the identical code with the angle
swapped to 109.5° and confirm the ordering flips to the carbocycle pattern —
one constant in, four orderings out, checked against four facts nobody in this
repo authored. *(Verify the angle and strain figures against a source before
relying on them.)*

**The semantic half is still disconnected.** Anonymising the precursors changes
nothing, and the constellation grammar is not in this loop. Until a frozen
mapping exists from a molecule to a `{left, right, result, head}` construction,
there is no database of DMT-derived molecules the parser can consume — and that
mapping must be written and frozen *before* any arm is scored, because a mapping
that turns rings into recursive constructions would hand DMT the win by itself.

---

## 8. Reproduction and provenance

Auditor probes were throwaway, run from the session scratchpad, and are **not**
committed: `assay-audit.mjs`, `ring-hunt.mjs`, `silicone-audit.mjs`, plus inline
`node --input-type=module` probes for the rename attack, the noise assay, the
vocabulary coverage check and the bond-strength decomposition. Each measurement
above states the quantity and the population so it can be re-derived.

Numbers attributed to the reactor come from console output supplied by the
operator; numbers attributed to the auditor were measured directly against the
working tree at the stated line count. Where the two disagree — e.g. the auditor
measured 108/162 molecules on the direct reactor path while the report showed
105/129 on the shared-pool path — both are recorded rather than reconciled.

**Honest limits.** Single seed throughout. No power analysis. The 2×2 cells are
unbalanced (n = 19 for control rings) and the reactor changed between every run,
so the trajectory in §1 measures four different programs. The transmutation-rate
result in §4 has not been replicated on a second seed.
