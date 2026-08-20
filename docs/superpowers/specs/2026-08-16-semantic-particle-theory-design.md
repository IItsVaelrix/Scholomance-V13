# DESIGN — Semantic Particle Theory (implementation)

Status: **IMPLEMENTED 2026-08-16** (Phases 0–5 as annotation / scoring
observers). No theory in this document has been shown to improve the parser.
Date: 2026-08-16.
Source paper: Semantic Particle Theory for ConstellationOS (16 August 2026).
Target: `codex/core/constellation/semantic-particles/`.

---

## 1. What landed

The paper's jurisdictional architecture, not a wider bond table.

- Grammar remains authoritative. There is no `ADMIT_BOND` permission.
- Particles attach after `composePacked` freezes. Default **OFF**.
- Score modes write `chart.semanticParticles.rankedDerivations`. They do not
  rewrite `ranked`, the forest, or admission.
- Promotion to the Grimoire remains a human act. T9 emits sandbox ranks only.

## 2. Module map (paper §8.2)

| Paper name | File | Theories |
|---|---|---|
| schema.js | `semantic-particles/schema.js` | Phase 0 contract |
| feature-provider.js | `semantic-particles/feature-provider.js` | T1 |
| selectional-index.js | `semantic-particles/selectional-index.js` | T2 |
| capability-transfer.js | `semantic-particles/capability-transfer.js` | T4 |
| (root reachability) | `semantic-particles/root-reachability.js` | T5 |
| derivation-factors.js | `semantic-particles/derivation-factors.js` | T3 local + T7 |
| forest-inference.js | `semantic-particles/forest-inference.js` | T3 Viterbi / inside-outside |
| contrastive-probes.js | `semantic-particles/contrastive-probes.js` | T6 |
| evidence-ledger.js | `semantic-particles/evidence-ledger.js` | T8 |
| experimental-design.js | `semantic-particles/experimental-design.js` | T9 |
| diverse-shortlist.js | `semantic-particles/diverse-shortlist.js` | T10 |
| orchestrator | `semantic-particles/annotate.js` | I4 frozen-chart |
| lexical-semantics.js | `semantic-particles/lexical-semantics.js` | senses, synonyms, polysemy, role frames |
| compositional-semantics.js | `semantic-particles/compositional-semantics.js` | logic-rule composition on frozen bonds |

Existing `descendFromRoots` in `resonance-beacon.js` remains the T5 proof
layer. The new module adds per-root walks, refusal joining, and identity
keys that are not the 32-bit aura.

Existing `clauseProvenance` in `bond-admission.js` remains the T4 admission
law. The new transfer table must agree with it. The cycle census observes;
it does not replace the receptor.

## 3. Compose hook

`options.semanticParticles` is opt-in.

- omitted / falsy → `chart.semanticParticles === null`
- `true` or `{ mode: 'observe' }` → annotate only
- `{ mode: 'score-token' | 'score-derivation' }` → parallel ranks, forest
  fingerprint unchanged

## 4. What this is not

- Not a claim that any theory improved UPOS, heads, or containment.
- Not a consumer of unlit marks (Phase 2 of descending light is still gated).
- Not a Grimoire writer.
- Physical metaphors are translated: electron → offered constraint, proton →
  required/role constraint, photon → root-reachability mark, purification →
  T8 subset selection, superposition → packed alternatives.

## 5. Tests

`tests/core/constellation/semantic-particles/`

Repro: `npx vitest run tests/core/constellation/semantic-particles`

Preregistration for confirmatory experiments:
`docs/superpowers/evidence/2026-08-16-PREREG-semantic-particle-theory.md`
