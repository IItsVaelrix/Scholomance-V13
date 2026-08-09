# Construction Family Split — After Autopsy — 2026-08-08

**Policy:** Do **not** promote giant survivors. Split into latent families.  
**Instrument:** `scripts/construction-autopsy.mjs` (minimal adjacent firings only)

Gain definition: no spanning `S` under base BONDS → spanning `S` with candidate.

> **Provenance.** The tables below were read by hand from a run whose evidence file
> was later overwritten — the script wrote every target to one hardcoded path, so
> the last invocation won. That is fixed: each target now writes
> `2026-08-08-construction-autopsy-<l>-<r>-<result>-h<head>.md`, and the default
> slate additionally writes an index. The family percentages here are from the
> pre-compound-family grammar and are kept as the historical record; the current
> numbers live in the per-target files, which also carry a purity score the
> hand-read tables did not have:
>
> `purity = licensed share × Simpson concentration`, where licensed share is the
> fraction of firings sitting on a real gold edge and concentration is Σpᵢ² over
> licensed families.
>
> **Corrected 2026-08-09.** An earlier revision of this paragraph claimed purity
> "ranks these targets in exactly the order this note argued for by hand." It does
> not. Purity agrees on the endpoints and disagrees in the middle:
>
> | Bond | Purity | Where the hand-read table put it |
> |---|---|---|
> | `N+N` | **0.261** | #1 — agrees |
> | `NP+S` | 0.162 | lumped with `S+S` as "do not promote" — **outranks `NP+NP`** |
> | `NP+NP` | 0.131 | argued as the better of the refusals — **it is not** |
> | `S+S` | 0.080 | last — agrees |
> | `PROPN+PROPN` | **n/a** | #2, "promotion candidate" — **unrankable, see below** |
>
> So: agreement at both ends, one inversion in the middle, and the note's own
> second-place candidate carries no purity at all. Two endpoints matching is not
> "exactly the order," and writing it that way turned a partial corroboration
> into a claim the instrument had ratified the whole hand-read argument.

---

## Loop (now operational)

```
unparsed
  → fracture mining
  → can physics propose?  ──NO──→ missing OPERATION (34 gaps)
         │
        YES
         ↓
      simulate / reactor
         ↓
      survives?
         ↓
      autopsy (this note)
         ↓
   construction families
         ↓
   refined laws (next sim) — still not auto-promoted
```

---

## `N + N → N` (cleanest path to real grammar discovery)

| | |
|---|---|
| Material gains | **122** sentences |
| Minimal firings | **522** |
| Morphology | almost all **1+1 adjacent tokens** |

### Family split (minimal firings)

| Family | % | Notes |
|---|---|---|
| juxtaposition-orphan | **47.9%** | No gold edge — often mistyped “N” (`a`+`car`, `courts`+`in`) |
| **compound** | **14.8%** | Real: `car bomb`, `Washington area` |
| **modifier** (amod/nummod) | **8.8%** | `federal courts`, `two individuals` — ADJ/NUM often typed as N |
| other (nsubj, case, det, obj…) | rest | Noise from atom over-typing |

### Refine (do not promote the giant)

Replace one law with **gated families**:

1. **`compound-nn`** — both tokens content nouns (not closed-class), gold-style: left+right N, optional capital; operation `compound`, result `N`, head **1** (UD: compound head is usually the right noun — **re-check head** against gold; our sim used head 0).  
2. **Reject** N+N when either token is closed-class (DET/P/AUX/…) — kills orphan junk.  
3. **Do not** fold amod into N+N — that’s atom typing debt (adjectives as N).

**Promotion candidate #1 for a careful second sim:** gated compound-nn (not raw `N+N→N`).

---

## `PROPN + PROPN → N` (best multi-family split)

| | |
|---|---|
| Material gains | **23** |
| Firings | **35** |
| Morphology | **100% 1+1 Properish adjacent** |

### Family split

| Family | % | Example |
|---|---|---|
| **compound** | **40%** | US Marines, Investment Partners |
| **flat-name** | **23%** | Joe O’Neill, Brian Ryner |
| **flat-name-orphan** | **20%** | Fallujah Wednesday, Enron Investment (no edge) |
| **nmod** | **14%** | Miramar California, Dr Joseph |

### Refine into three laws

1. **`flat-name`** — both PROPN, person-name morphology / capital sequence; head per UD `flat` (usually first).  
2. **`proper-compound`** — both PROPN, org/place compound; head right (UD compound).  
3. **`nmod-desc`** — title/place (`Dr Joseph`, `Miramar California`); separate head convention.

**Promotion candidate #2:** split PROPN sequence chemistry — smaller, cleaner than NP+NP.

> **Superseded 2026-08-09 — and the autopsy row for it was reading a vacuum.**
>
> `proper-compound` (`PROPN+PROPN→N`, head 1) shipped in
> [the compound family retest](2026-08-08-compound-family-retest.md). Candidate #2
> is therefore closed for the compound reading; what remains unshipped is the
> three-way split — `flat-name` and `nmod-desc` are still folded into one
> compound-biased law.
>
> The autopsy slate kept targeting `PROPN|PROPN|N` at **head 0** after the law
> shipped at **head 1**, and reported `0 gains / n/a purity` under the banner
> *"absence of evidence, not evidence that the bond is bad."* That reading was
> wrong in a way worth naming: the zero was not a weak signal, it was **no signal
> at all**. `compose.js` admits one bond per `L|R|result` signature and selects by
> signature, so once the law is in the baseline the trial chart *is* the base
> chart and every count is structurally zero. The proposed head cannot change it —
> coverage gain asks only whether a spanning `S` exists, and head choice never
> affects that.
>
> The vacuity guard existed but keyed on `L|R|result|head`, so the head-0 target
> slipped past it and got filed as an honest null. Fixed: `autopsyBond` now
> derives vacuity from the signature alone and reports the head the law actually
> holds, so the row reads *already law* and points at `bond-ablation.mjs`. Note
> what the failure shape was — **a check that could not fail, reported as a
> measurement that had passed.**

---

## `NP + NP → NP` (do not promote)

| | |
|---|---|
| Material gains | **241** (largest coverage hammer) |
| Minimal firings | **1158** |

### Family split

| Family | % |
|---|---|
| juxtaposition-orphan | **44%** |
| compound | 12% |
| modifier | 8% |
| nsubj / case / det / obj … | rest |

**This is a multi-tool**, not a law. Gain comes from gluing *anything* NP-typed adjacent — including subject+verb chunks typed as NP and prepositions.

**Action:** keep as simulation artifact only. Extract:
- whatever survives as **compound** under NP (after N+N lifts)
- **flat-name** when both sides proper
- **never** a single `NP+NP→NP` grammar stamp

---

## `NP + S → S` / `S + S → S` (do not promote)

Both show **polydisperse** gold links (nsubj, nmod, conj, obj, noise).  
Dominant stories mix real “subject left of predicate-S” with junk mega-spans.

**Action:** further autopsy with **maximal-only or subject-gated** firings (NP immediately left of S whose leftmost content is a verb) before any promotion.

> **Amended 2026-08-09 — right verdict, wrong reason.** “Junk mega-spans” is not
> what these bonds are doing. The mechanism is the opposite of mega: they are
> firing on **single words**.
>
> `S|S|S`'s dominant licensed family is `compound` (17.1%), and its examples are
> one-token spans — `police`[14-14] + `station`[15-15], `wish`+`lists`,
> `arrest`+`warrants`. Every one is a dual n/v noun. The chart shows why: for
> `police` alone, `V→VP` then the imperative `VP→S` lift yields an `S` spanning
> one token with nothing bonded inside it. `S+S→S` then joins two of them and
> books an ordinary noun-noun compound as clause juxtaposition.
>
> **48.7%** of `S|S|S`'s firings stand on two such lift-only spans; `NP|S|S` is at
> 86.1%. The instrument now reports this as *borrowed share* per target.
>
> Read that share carefully — it is **floored**. No atom emits `NP`, `VP` or `S`,
> so for these bonds every one-token firing is borrowed *by construction* and the
> figure could not have come out low whatever the grammar did. It is comparable
> across clausal bonds and to nothing else; only `N|N|N` (16.0%) sits on types a
> lexical atom can carry, and only there is a low share a real measurement.
>
> This sharpens the action rather than changing it. Subject-gating is still the
> right next cut, but the gate that matters is **span arity, not span width**:
> require at least one side to contain an actual bond before `S+S` may fire.
> Maximal-only firings would not have found this — the artefact lives at the
> minimum, not the maximum.

---

## Unproposable gaps (more valuable than bad survivors)

From gap sim: **34** high-frequency adjacent pairs with **no legal hypothesis**.

Notable:

| Pair | Hint for missing operation |
|---|---|
| `S+TO` / `TO+NP` / `TO+S` | infinitival / complementizer continuation after clause |
| `S+P` / `NP+P` | oblique start — PP not yet opened from clause edge |
| `S+DET` / `DET+S` | determination / clause boundary confusion |
| `VP+TO` / `NP+TO` | valence port for infinitive not on S/VP surface |
| `S+REL` | relative/complementizer attachment to clause |

These are **missing operations / projection states**, not “add S+TO→??? with free C”.

---

## What “grammar discovery” looks like next

1. **Gate `N+N`** to content-noun only → resimulate compound-nn.  
2. **Split PROPN+PROPN** into flat-name vs compound vs nmod-desc → resimulate each.  
3. **Leave NP+NP / NP+S / S+S** unpromoted until firings are gated.  
4. **Design operations** for S+TO / S+P from particle-model gaps.

That is the loop you described:

```
survives → autopsy → family → refined law → re-simulate
```

Not:

```
survives → promote giant
```
