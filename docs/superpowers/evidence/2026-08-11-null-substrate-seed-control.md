# Null-Substrate Attack — Seed-Sensitivity Control

**Run after the attack, to decide whether the attack's result meant anything.**

The attack (`2026-08-11-null-substrate-attack.json`) moved `refused` from 41 to 143 while
mean energy moved only 0.0086. Two incompatible readings:

- **A. Robustness** — the gate detects a corrupted substrate.
- **B. Brittleness** — candidates cluster against thresholds, so *any* perturbation flips
  many verdicts.

Discriminator: perturb the TRUE bank in a way carrying zero semantic information — change
only the cyclotron's sampling seed. Everything else identical, 100,000 trials per arm.

## Result — four seeds, true bank

| seed | unique | refused | hypoth | meanEnergy | meanNovelty | meanGrounding | meanFinal |
|---|---|---|---|---|---|---|---|
| 0x5c4010 | 25167 | 41 | 215 | 0.812612 | 0.384111 | 0.541580 | 0.744603 |
| 0x5c4011 | 25209 | 47 | 209 | 0.812590 | 0.383081 | 0.541590 | 0.744867 |
| 0x7a1c3e | 25143 | 45 | 209 | 0.812653 | 0.384121 | 0.541385 | 0.744870 |
| 0x1d2e3f | 25103 | 47 | 208 | 0.812474 | 0.382312 | 0.541063 | 0.744649 |

## Reading B is ruled out

| metric | seed SD (n=4) | null-substrate Δ | magnitude |
|---|---|---|---|
| meanEnergy | 0.0000768 | −0.008613 | **112 SD** |
| meanGrounding | 0.0002464 | −0.026222 | **106 SD** |
| meanNovelty | 0.0008775 | −0.044596 | **51 SD** |
| refused | 2.83 | +98 (vs mean 45) | **35 SD** |
| meanFinalScore | 0.0001412 | +0.002990 | 21 SD — **wrong direction** |

Sampling noise moves `refused` within 41–47. The scramble moved it to 143. **The detection
is real.**

## Two corrections this control forced

1. **The preregistered P2 threshold was miscalibrated.** It declared "energy detected only
   if |Δ| > 0.03" and scored −0.0086 as no-detection. Against a noise floor of 0.000077
   that shift is 112 SD. The bar was set without measuring the noise floor first — the exact
   error recorded in `feedback-concept-chemistry-is-ordinal`: never use a global absolute
   threshold, ship a control with the question. Preregistering the number was right; the
   number was wrong.

2. **An interim report over-stated the ratios** (137×/128×/43×) from three seeds using
   range rather than SD. The fourth seed widened the bands. The table above is the
   corrected version.

## The finding

The architecture detects a fully deranged atom bank through **energy, grounding, and
novelty**, all far outside sampling noise, and the threshold composition converts that into
a 3.5× refusal rate — while `uniqueMolecules`/`duplicateMolecules` stay identical to the
digit, proving the attack was surgical.

**Concept Chemistry is anti-correlated with substrate integrity.** Feasibility rose +0.0208
and finalScore rose +0.0030 on the corrupted bank, both outside noise, both the wrong way.
This reproduces the 2026-07-31 negative-control failure at molecule scale.

So the system's robustness does **not** come from its most semantic-sounding component — it
survives that component. The chemistry channel's contribution to `finalScore` is worse than
a coin flip under adversarial substrate, which makes its weight a measurable liability
rather than a suspected one.

## Repro

    node scripts/null-substrate-attack.mjs
    # seed control: scratchpad/seed-sensitivity-control.mjs, seeds 0x5c4010 0x5c4011 0x7a1c3e 0x1d2e3f
