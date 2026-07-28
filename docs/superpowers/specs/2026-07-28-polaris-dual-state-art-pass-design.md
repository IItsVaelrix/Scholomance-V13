# PolarisOS Dual-State Art Pass — Design Spec

**Date:** 2026-07-28

**Status:** Approved design; pending written review

**Surface:** `PolarisOS` — `packages/renderer-pixi`, `scripts/build-pixelbrain-assets.ts`,
`scripts/build-polaris-console-ui.ts`, `apps/client/src/styles/polaris-console.css`

**Parent design:** `2026-07-28-polarisos-arcane-terminal-ui-design.md`
(Stateful Lattice Console). This spec is a companion art pass over that shell.
Where the two could have overlapped, this spec defers to the parent.

## 1. Purpose

The Polaris scene and console currently render at placeholder fidelity:

- The Pixi scene draws flat procedural glyphs (rects, circles, diamonds,
  two-arc flames) with two full-canvas lighting tints and no gradients, glow,
  particles, or blend-mode work.
- The PixelBrain pipeline is fully wired (generator → pb1 hash-verified
  packets → fingerprinted registry → resolver/texture cache → glyph fallback)
  but ships only 4 world assets (`brazier`, `brazier_lit`, `lantern`,
  `players/marker_default`). `entities/altar`, `entities/well`, and
  `entities/sign` still render as glyphs; no background packets exist.
- The parent spec's `ArcanePanel` defines chrome ornament slots
  (`corner-nw/ne/sw/se`, `seal`, `state-glyph`, `divider`) with no SCDL chrome
  packets yet authored for them.

This pass raises the scene and console to a deliberate dual-state art
identity without touching world authority, contracts, or the plan hash.

## 2. Locked Decisions

| Topic | Decision |
|---|---|
| Scope | Full pass: scene atmosphere + world assets + console chrome |
| Mood identity | Dual-state duality: firelight and moonlight are two fully realized moods |
| Architecture | Presentation-layer atmosphere (Approach A). No contract changes; `SceneManifest`, `SceneRenderPlan`, and `planHash` untouched |
| Scene technique | Pure `atmospherePlan` projection + Pixi execution; no Pixi blur/bloom filters |
| Chrome technique | Parent-spec §10 SCDL variant families + restrained CSS transitions (latent ritualism). No CSS-native rim/glow ornament system |
| Palette law | Parent §9: obsidian + desaturated brass; cyan reserved for focus |
| Randomness | Seeded hashes only. No `Math.random()`, no per-frame reseeding (QUANT-0101/0102 clean) |
| Fallback law | Glyph fallbacks and `fallbackLines` text projection remain intact and authoritative |

## 3. Goals

1. Firelight and moonlight each deliver a complete, distinct scene mood.
2. All seven known world asset keys have real PixelBrain packets; backgrounds
   exist for both lighting moods.
3. Chrome ornament slots defined by the parent spec gain real SCDL variant
   families.
4. Every visual is removable ornamentation: strip it and the scene/console
   remain operable and accessible (Compose PDR §8.6).
5. Determinism: same manifest → same plan → same atmosphere, byte-exact.
6. No measurable frame regression at 1280×800 (Steam Deck).

## 4. Non-Goals

- Changing `SceneManifest` / contracts / scene-compiler / world-kernel
  (Approach B — deferred).
- Static PNG raster pipelines (Approach C — rejected).
- Multi-frame PixelBrain packet animation (parent §4 non-goal).
- Replacing or augmenting Pixi as world renderer.
- Scanline overlays, text halos, always-on panel glow (rejected as
  inconsistent with latent ritualism; would require a parent-spec amendment).
- New server mechanics, world state, or lighting states.

## 5. Scene Atmosphere Engine

### 5.1 Architecture

New pure module `PolarisOS/packages/renderer-pixi/src/atmospherePlan.ts`,
mirroring `scenePlan.ts` discipline:

```text
SceneRenderPlan
  -> buildAtmospherePlan(plan)   (pure, browser-safe, node-testable)
  -> AtmospherePlan              (glow fields, emitters, gradient stops, starfield)
  -> AtmosphereRenderer          (Pixi execution, inside PixiSceneRenderer)
```

- Seeded via the existing FNV-1a utility from `sceneId + lightingState` (plus
  emitter index for per-emitter streams).
- `AtmospherePlan` carries its own FNV-1a `atmosphereHash` folded from every
  visually meaningful field.
- Animation advances by frame delta against seeded phases; no per-frame
  reseeding; no `Math.random()`.
- The scene plan, `planHash`, and `fallbackLines` are never read or altered
  beyond what the plan already exposes (`lightingState`, `ambientEffects`,
  sprite positions/glyphs).

### 5.2 warm_firelight treatment

- Seeded ember particles rising from flame-shaped sprites (`brazier_lit`,
  `lantern`): sinuous drift, alpha fade with altitude.
- Radial warm glow (additive blend) around each light source; slow seeded
  flicker on glow alpha.
- Background: vertical amber-to-void gradient replacing flat `0x2a1c10`;
  soft warm vignette.

### 5.3 ambient_moonlight treatment

- Moonbeam shafts: low-alpha additive light polygons from the top edge.
- Seeded starfield with slow twinkle; drifting dust motes.
- Cool silver-blue rim glow on entity sprites; indigo vignette.

### 5.4 Ambient effects mapping

`plan.ambientEffects` strings map to emitter configs (e.g. `embers` → ember
emitter, `motes` → dust motes). Unknown effects keep the existing 12px-circle
glyph fallback so the effect layer never regresses.

### 5.5 Transitions and reduced motion

- `lightingState` change cross-fades atmospheres over the slow motion token
  (~360ms).
- `prefers-reduced-motion`: one static seeded frame — glow and stars present,
  zero animation. Applies to canvas and CSS alike.

### 5.6 Performance law

- No Pixi filter pipeline (no blur/bloom filters — Steam Deck GPU cost).
  Glow is faked with pre-rendered radial-gradient textures generated once at
  init and cached.
- Particle count capped (~120 sprites) in one shared `ParticleContainer`.
- Canvas stays 800×480; nearest-neighbor sampling and integer placement
  retained (parent §6.1.5).

## 6. PixelBrain World Asset Expansion

Through the existing `scripts/build-pixelbrain-assets.ts` generator
(deterministic authors → pb1 hash-verified packets → regenerated registry;
no hand-edited generated files):

1. **Three missing entities:** `entities/altar`, `entities/well`,
   `entities/sign` — following the established brazier/lantern packet format.
2. **Two background packets** keyed to the manifest-owned
   `backgroundAssetKey`: one hearth-warm room backdrop, one moonlit
   observatory backdrop (floor plane, wall structure, window/opening that the
   atmosphere's moonbeams and fire glow layer over).
3. **Glyph law preserved:** every packet keeps its existing glyph spec as
   fallback (PDR §5.4 playable-when-asset-fails). Glyph-only types
   (`hotspot`, `lighting`, `effect`, `player-marker` default) untouched.
4. **Pixel discipline:** authored at chunky pixel-art scale for
   `image-rendering: pixelated`; integer dimensions and whole-number display
   scales (parent §10.3 raster law).

## 7. Console Chrome (aligned to parent spec)

Primary technique is the parent's own ornament system — this pass supplies
the missing assets, not a competing CSS technique.

1. **Author SCDL chrome packets** via the build-time bridge for the parent
   §10 registry roles: `arcane-panel/*/corners`, divider rails, connection
   seal, command-execution sigil. Variant families across
   `rest | focus | pending | success | warning | corrupted | disconnected`,
   identical dimensions and anchors per family (variant switches never shift
   layout, parent §10.2).
2. **Awakening, not always-on:** ornament transitions follow parent §10.3 —
   variant swap + restrained opacity transitions on state change. Rest stays
   dormant and readable.
3. **CSS stays in its lane:** `polaris-console.css` changes are limited to
   variant switching and transitions. New tokens (via
   `scripts/build-polaris-console-ui.ts` only, additive names, existing
   values untouched) are limited to what the variant system needs. Focus glow
   remains cyan-only per parent §9 palette law.
4. **Media queries unchanged:** 1280px and 720px layouts behave identically;
   no new `!important`; `prefers-reduced-motion` behavior preserved.

## 8. Guardrails, Testing, Delivery

### 8.1 Determinism

- `buildAtmospherePlan` pure; `atmosphereHash` byte-exact per input plan
  (extends §15.4 parity to atmosphere).
- Immunity scan (`immunity_scan`) run on every new/changed file; must be
  clean (no QUANT-0101/0102, no stray unicode).
- Photonic Observation Bench (parent §12) fixtures remain valid; atmosphere
  is inside the Pixi portal raster and will appear in bench captures —
  thresholds for the scene region are updated deliberately, not silently.

### 8.2 Testing

- `renderer-pixi` node tests: atmosphere fixtures for both lighting states;
  seed-determinism (same seed twice → identical emitter specs);
  reduced-motion static frame; unknown-effect fallback; hash stability.
- PixelBrain: generator hash-verification covers new packets; add
  registry-completeness check (every packeted key keeps a glyph).
- Chrome: `verify:css-tokens` passes; token diff shows additive names only.
- Manual taste gate: run the client, toggle fire/moon, screenshot both
  states for human sign-off (agent cannot self-administer visual judgment).

### 8.3 Performance budget

Zero new runtime dependencies; no filter pipeline; ≤120 particle sprites;
one-time gradient texture generation; pure-CSS chrome. Target: no measurable
frame regression at 1280×800.

### 8.4 File map

| File | Change |
|---|---|
| `renderer-pixi/src/atmospherePlan.ts` | **new** — pure projection + hash |
| `renderer-pixi/src/AtmosphereRenderer.ts` | **new** — Pixi execution |
| `renderer-pixi/src/PixiSceneRenderer.ts` | hook atmosphere pass around sprite pass |
| `renderer-pixi/tests/` | atmosphere fixtures + determinism tests |
| `scripts/build-pixelbrain-assets.ts` | 5 new packet authors (3 entities, 2 backgrounds) |
| `apps/client/src/generated/pixelbrainAssetRegistry.ts` | regenerated |
| `apps/client/public/assets/generated/*.pixelbrain.json` | regenerated/new packets |
| chrome SCDL sources + bridge output | new variant families (corners, dividers, seal, sigil) |
| `scripts/build-polaris-console-ui.ts` | additive tokens for variant system |
| `apps/client/src/generated/polaris-console.tokens.css` | regenerated |
| `apps/client/src/styles/polaris-console.css` | variant switching + transitions only |

### 8.5 Phasing

1. Atmosphere engine + tests (renderer-pixi only).
2. PixelBrain world assets (entities, then backgrounds).
3. Chrome SCDL variant families + CSS transitions.
4. Human visual sign-off (screenshots, both moods, both viewports).

Each phase is independently shippable and reversible.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Atmosphere read as world-state change | Atmosphere is presentation-only; plan/manifest untouched; fallback text unchanged |
| Particle/GPU cost on Deck | No filters, capped sprites, shared container, pre-rendered textures |
| Chrome scope creep into CSS ornament | Locked to parent §10 technique; CSS limited to variant switching |
| Bench threshold drift | Fixture thresholds updated explicitly in the same change, with rationale |
| Taste mismatch at sign-off | Phase 4 human review before merge; phases 1–3 reversible independently |
