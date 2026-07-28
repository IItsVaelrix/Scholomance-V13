# Design: Retina Proof Suite (D–H)

**Date:** 2026-07-28  
**Status:** implemented — D–H proof suite shipped 2026-07-28  
**Depends on:** `docs/superpowers/specs/2026-07-28-perceptual-quality-trio-design.md` (A–C)  
**Bytecode:** `PB-REALIZATION-EQUIVALENCE-v1`, `PB-VISUAL-EXECUTION-MANIFEST-v1`, `PB-RETINA-VERDICT-EVIDENCE-v1`, `ART_MOTIF_NOMINATED`, hierarchical fidelity axis

## Locked decisions

| Decision | Choice |
|---|---|
| Architecture | Retina proof suite sibling to A–C (`src/lib/photonic-retina/`) |
| F verdicts | Evidence sidecar only — never mutate `spatialAwareness` / `verdict` |
| D vessels | Full list: reference, svg, canvas, pixi, pixel-only, vector-only, scales 1/2/4 |
| Pixi/WebGL | **Hard-required** — throw `REALIZATION_EQUIV_PIXI_REQUIRED` if init fails |
| G promotion | Nominate-only; human curation via existing art-gene gate |
| H hierarchy | Fidelity axis on non-scalar manifold (no finalScore) |

## Module layout

```
src/lib/photonic-retina/
  perceptual/          # A–C (+ H axis in phenotype-fidelity)
  realization-equivalence/
    schema.js
    vessels.js         # reference, pixel-only, vector-only, scales
    vessels-svg.js
    vessels-canvas.js
    vessels-pixi.js    # hard WebGL
    metrics.js
    evaluate.js
  visual-execution-manifest.js
  verdicts/
    art-family-weights.js
    verdict-evidence.js
  motif-nomination.js
```

## D — Realization equivalence

See conversation design §2. API: `evaluateRealizationEquivalence(specimen, options)`.

## E — VisualExecutionManifest

See design §2. API: `buildVisualExecutionManifest`, `assertManifestReplay`.

## F — Verdict evidence

Eight dimensions; art-family weights; sidecar only.

## G — Motif nomination

`nominateMotifCandidate` → BytecodeHealth `ART_MOTIF_NOMINATED` + ledger event; never `commitGene`.

## H — hierarchicalIdentityRetention

Tier regions via VisualWeightField; compare declared vs measured hierarchy on fidelity axes.

## Success criteria

- Multi-vessel equivalence classifies identical / backend-equivalent / divergent
- Manifest replay invariant holds or classifies backend-equivalence
- 8-dim verdict evidence attaches without Feel golden drift
- Motif nomination cannot write SCDNA
- hierarchicalIdentityRetention present on fidelity manifold; no finalScore
