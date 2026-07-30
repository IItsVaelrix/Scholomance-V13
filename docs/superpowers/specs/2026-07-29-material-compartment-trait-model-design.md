# Material Compartment / Trait Model — Design Draft

**Date:** 2026-07-29
**Status:** Draft — fit-tested against all 68 registry materials, not implemented
**Origin:** palette quantization surfaced five phantom materials and six drifted assets

---

## 1. Problem

`material` is a string used as a foreign key by several subsystems that each keep
their own table. Nothing enforces that those tables agree, so a material can be
fully real to one subsystem and not exist at all to another.

Three symptoms, one cause:

| Symptom | What it is |
|---|---|
| `steel`, `iron`, `oak_bark`, `leather`, `moonstone` have textures but no registry entry | a species referenced in one compartment, undefined in another |
| six shrine-demo assets author colours far off their declared material's ramp | an asset claiming a substance whose spectrum it does not emit |
| 6 of 68 anchor sets are non-monotonic while `qbit-phosphorylation` indexes them as an energy ramp | a spec that contradicts the law reading it |

Borrowing GEM reconstruction: these are **dead-end metabolites**, **mass-balance
violations**, and **spec inconsistency**. All three are mechanically checkable
and none require aesthetic judgement.

The scope limit matters. Ramps are *authored*, not discovered — a human may
legitimately restyle `darksteel` tomorrow. The validator can therefore only check
**internal consistency**, never **correctness**. That is the same line the rest of
the pipeline draws: validate, refuse, report; never adjudicate taste.

---

## 2. The model

### 2.1 Compartments

A compartment is a table keyed by material id. Identity is `species[compartment]`,
exactly as GEM distinguishes `glucose[c]` from `glucose[m]`.

| Compartment | Source | Kind |
|---|---|---|
| `palette` | `MATERIAL_PALETTES` | **total** |
| `shader` | `MATERIAL_SHADER_INDEX` | **total** |
| `grain` | `MATERIAL_GRAIN` | sparse |
| `texture` | `MATERIAL_TO_TEXTURE` (in `vri-compiler.js`) | sparse |

**Total** means every species must appear. **Sparse** means the compartment
encodes an optional capability and absence is legal — not every material has a
procedural texture, and skin should not be forced to declare bark grain.

> **A dead-end is a species missing from a *total* compartment.** Absence from a
> sparse compartment is a capability the material does not have, not a defect.

This distinction is load-bearing. Without it the check reports 46 dead-ends,
41 of which are legitimate (every `hair_*`, `skin_*`, `eye_*`, `cloth_*` lacks a
texture mapping by design) and the signal is lost in the noise.

### 2.2 Species

A species is one row in the `palette` compartment. 68 exist, plus `source`,
which is passthrough and exempt from ramp laws.

### 2.3 Traits

A trait is a token that appears across multiple bases and modifies inherited
properties — `void ⊗ gold`, `void ⊗ bark`. Traits compose; they do **not** form a
tree. `void` appears in 11 species across all four categories, so no single
parent exists. This is the GPR pattern: boolean expressions over trait sets, not
paths through a hierarchy.

---

## 3. Fit against all 68 materials

### 3.1 Compartment analysis — works

```
species seen in any compartment      : 74
missing from a TOTAL compartment     :  5

  iron        declared only in: texture
  leather     declared only in: texture
  moonstone   declared only in: grain, texture
  oak_bark    declared only in: grain, texture
  steel       declared only in: texture
```

Exactly the five known phantoms. No false positives, no misses, no tuning.
**This half of the model is ready.**

### 3.2 Expressibility — 55/68 (81%)

13 species do not decompose into exactly one base plus known modifiers.
Most are vocabulary problems (`cloth_linen` parses as two bases because `linen`
was classified as a base rather than a qualifier). One is structural:
`radiant_blue` has no substance token at all — it is a colour with an adjective.

The residue is *fixable by reclassifying tokens*, which is precisely why the
number should not be trusted. Any classification can be tuned until it fits.
Expressibility is not evidence.

### 3.3 Trait effect — only one trait is established

```
trait    hosts  mean(host)  mean(peer)   delta   consistent across categories
void        11      0.287      0.449    -0.162   YES
black        3      0.281      0.425    -0.144   YES
dark         2      0.284      0.422    -0.138   NO — direction flips
holy         2      0.551      0.412    +0.139   NO — direction flips
```

Of ~19 candidate traits, only `void` is statistically real. `black` is plausible
at n=3. Everything else appears once or twice. **The trait model is currently
supported by one trait.**

### 3.4 Prediction test — composition does not derive ramps

Per-anchor delta between a host and its standalone base:

```
void_gold   -0.01 -0.05 -0.14 -0.15 -0.13 -0.09 -0.02
voidbark    -0.05 -0.08 -0.12 -0.16 -0.20 -0.31 -0.25
```

If `void` were an operator these rows would match. `void_gold` peaks mid-ramp and
returns near zero at both ends; `voidbark` grows monotonically to −0.31 at the
bright end. Different shapes, not different magnitudes.

Only **5** compositions in the entire registry can even be tested this way,
because most bases (`steel`, `crystal`, `rune`) do not exist standalone.

**Conclusion: a ramp cannot be derived from `base ⊗ trait`.** There is neither a
constant operator nor enough data to fit one.

---

## 4. Verdict

**Ship the compartment half. Downgrade the trait half. Do not build the family
tree yet.**

| Component | Status | Reason |
|---|---|---|
| Compartment + total/sparse gap analysis | **Ready** | isolates all 5 real defects, zero noise, no tuning |
| Ramp self-consistency laws (monotonic unless `emissive`) | **Ready** | mechanical; exceptions declared on the species |
| Palette coverage (does a value sketch span its ramp) | **Shipped** | live in `provenance.paletteCoverage`. Replaced an RGB-distance "drift" metric that was measuring hue divergence in a system that discards hue on purpose |
| Trait *declaration* (record `void ⊗ gold`) | **Cheap, do it** | costs nothing, accumulates the data needed later |
| Trait *derivation* (compute a ramp from traits) | **Not supported** | one established trait; operator is not constant |
| Family tree / inheritance hierarchy | **Premature** | topology is a lattice, and n is far too small |

The failure mode to avoid is building a generative model on n=1 and then
maintaining it forever. Declare traits now as metadata, let the registry grow,
and re-run §3.3 and §3.4 later. If a trait's operator stabilises across enough
hosts, derivation becomes justified by evidence rather than by analogy.

---

## 5. What the validator checks

Mechanical, total, taste-free:

1. **Dead-end** — species missing from a total compartment.
2. **Orphan** — species in a total compartment referenced by no asset or sparse table.
3. **Ramp monotonicity** — anchors ordered dark→bright, unless the species declares `emissive`.
4. **Duplicate species** — distinct ids with identical ramps. A registry-wide scan
   finds exactly one: `black_steel` and `blacksteel` carry byte-identical
   7-anchor ramps but occupy **different shader indices** (27 and 28). One
   spelling was almost certainly a typo that acquired its own identity.
5. **Category coherence** — declared category matches the base token. `void_cloth`
   is categorised `metal` while every other `cloth_*` species is `organic`.
6. **Coverage** — how much of a material's ramp an asset's value sketch reaches
   (already live). A part reaching one anchor cannot express a material swap.

Every exception is a **declared property of the species**, never an allowance
inside the checker. The moment the validator contains `except rune_glow`, it has
begun to rot.

---

## 6. Open decisions

1. Where does the `texture` compartment live? It is currently a private table in
   `vri-compiler.js`. Making it a field on the species removes the parallel
   authority that caused this entire class of bug.
2. Are the five phantoms resolved by *adding* species (`steel` becomes real) or by
   *retargeting* the texture keys (`steel` → `darksteel`)? This changes rendered
   output for any asset using them.
3. `void_cloth` is categorised `metal`; every other `cloth_*` is `organic`.
   Fix the category, or is `category` the wrong axis now that traits exist?
4. `black_steel` and `blacksteel` are confirmed identical in ramp and distinct in
   shader index. Merging them is a breaking change for any asset naming the
   losing spelling — verified as the registry's only duplicate, so the blast
   radius is knowable.

Decisions 2–4 are content calls. The validator can only report that they disagree.
