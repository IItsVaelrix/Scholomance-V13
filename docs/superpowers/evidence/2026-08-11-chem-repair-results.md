# Concept Chemistry — Three Repairs, Verified on a Held-Out Attack

Repairs to `codex/core/pixelbrain/concept-chemistry.js`, 2026-08-11. v1 is preserved as
`WEIGHTS_V1` so every claim below is A/B-able.

## The three defects (measured before repairing)

1. **`coherence` was a tautology.** `cosine(a + b, product)`, with callers that build the
   product by concatenating the reactants. Flipping `satisfies` → `destroys` moved it
   **0.8234 → 0.8252** — the score *rose* when the claim was negated.
2. **`bond` is order-blind.** Hashed bag of tokens + char n-grams: 0.5095 vs 0.5271 for a
   reversed relation.
3. **`grounding` (0.65 of the score) is not relational.** `(attestA + attestB) / 2` attests
   each concept separately. Net: negating a claim moved feasibility **0.487800 → 0.488100**,
   upward, by 0.0003.

## The repairs

1. **`relationScore()`** folds the signed `corpusPMI` in — computed since inception and
   explicitly discarded ("Diagnostic only — NOT folded into feasibility"). `tanh(meanPMI)`
   centred to [0,1], dragged toward 0 by `flooredNeverCooccur / pairs`, so never-co-occurring
   pairs penalize rather than merely failing to help.
2. **`residualCoherence()`** scores what the product asserts *beyond restating its
   reactants*. Pure concatenation returns exactly 0 — no claim was made.
3. **`WEIGHTS_V2 = {bond 0.10, grounding 0.30, coherence 0.15, relation 0.45}`** —
   **derived, not fitted.** The negative control has 7 reactions; fitting 4 weights to 7
   points would manufacture the result. The file's own header already declares co-occurrence
   to be the compatibility channel; v2 routes the dominant weight there, preserving the
   header's intended ordering.

### Abstention — a defect the guard caught in the repair itself

First pass dropped the determinism run to **7/8**. On the explicit-grounding path there is no
corpus index, so `relation` had no signal and still absorbed 45% of the weight as a flat 0.5,
compressing every channel that did have signal. Fixed: a channel with no evidence **abstains**
and redistributes its weight proportionally. Restored 8/8.

## Results

| harness | role | result |
|---|---|---|
| `concept-chem-determinism.mjs` | regression guard | **8/8**, ordinally valid — held |
| `concept-chem-absent-capability.mjs` | documented v1 failure | unchanged — **cannot test this path** |
| null-substrate attack | **blind holdout** | **repair confirmed** |

### The absent-capability control is hand-mode

It passes `groundingA`/`groundingB` from a local estimator and never a corpus index, so
`corpusPMI` is null and v2 collapses to renormalized v1. Its continued failure is **not**
evidence about the repair. It also means the long-standing "Concept Chemistry failed its
negative control" finding was measured on a path with no relational channel at all — the
negative control has never tested the production path.

### Held-out null-substrate attack — v1 vs v2

Attack delta = (deranged bank − true bank). Negative = correctly penalizes corruption.

| metric | v1 delta | v2 delta |
|---|---|---|
| meanChemistryFeasibility | **+0.020848** (wrong way) | **−0.156907** |
| meanFinalScore | **+0.002990** (wrong way) | **−0.059224** |
| meanEnergy | −0.008613 | −0.008613 (untouched — clean isolation) |

Against the seed-control noise floor (finalScore SD = 0.0001412), the v2 delta is ~419 SD.
**Both channels flipped sign.** Chemistry moved from voting *for* the corrupted bank to being
the single strongest detector in the pipeline — stronger than energy (−0.0086).

### The unanticipated result: nuclei

| arm | v1 nuclei | v2 nuclei |
|---|---|---|
| true bank | 0 | **26** |
| deranged bank | 0 | **0** |

Verdicts, v2 true bank: `{NUCLEUS: 26, HYPOTHESIS: 189, REFUSED: 41}`. Exactly the top 26
hypotheses were promoted; 189 + 26 = 215 = v1's hypothesis count.

**This is not a loosened bar.** Every threshold is untouched (`nucleusScoreFloor: 0.765`,
`nucleusNoveltyFloor: 0.32`, `nucleusMinDomains: 3`), and mean finalScore went **down**
(0.7446 → 0.7242). v2 increased *discrimination*, not magnitude: it pushes good candidates up
and bad ones down, putting mass in the upper tail while lowering the mean. And the nuclei are
substrate-dependent — all 26 vanish on the deranged bank.

`refused` is unchanged at 41 → 143 in both versions, confirming the refusal gate is driven by
the energy/novelty floors and was not touched by this repair.

## What these 26 nuclei are, and are not

They are **proposals for human Grimoire review, never auto-merged**. The standing house rule
holds: purity alone can never promote — certification requires the gate **and** family autopsy
**and** human review. 26 nuclei is 26 things to examine, not 26 discoveries.

## Supersedes

The 2026-08-11 null-substrate finding that "the architecture's robustness does not come from
its most semantic-sounding component — it survives that component" was true of v1. Under v2
the chemistry layer is the strongest detector in the pipeline. The underlying lesson stands:
that fact was only discoverable because a channel was measured against an adversarial control
rather than trusted.

## Repro

    node scripts/concept-chem-determinism.mjs        # guard: 8/8
    node scripts/concept-chem-absent-capability.mjs  # hand-mode; cannot test the repair
    node scripts/null-substrate-attack.mjs           # holdout
