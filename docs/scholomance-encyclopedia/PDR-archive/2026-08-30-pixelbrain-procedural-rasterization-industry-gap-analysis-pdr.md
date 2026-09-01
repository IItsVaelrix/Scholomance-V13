# PDR: PixelBrain vs. Professional Procedural Pixel-Art Pipelines
## An Evidence-Grounded Gap Analysis and Phased Integration Roadmap

**Status:** Proposed (research + audit, no code changes in this document)
**Classification:** Art pipeline | PixelBrain/SCDL | Rasterization | Research
**Priority:** Medium — informs, but does not gate, ongoing PixelBrain work
**Date:** 2026-08-30 (revised same day after external review — see §0)
**Audited tree:** commit `3f0371e0d9fd65ec6778e1e60eb34c16951ebf03`, plus uncommitted working-tree changes present in the session that produced this report (SCDL grammar/passes/render were mid-edit; not a clean-commit audit)
**Corpus available vs. audited:** 76 `.scdl` files exist in-repo (53 under `assets/ASSETS`+`docs`, 23 under `codex/core/pixelbrain/scdl/fixtures`). This audit traced **one** asset (`lightning_scimitar_handdrawn.scdl`) through live compilation; every other finding is verified by reading the rendering source directly (grep + line-level read), not by running the compiler across the corpus. Findings below are **code-structure-verified**, not **corpus-incidence-measured** — a claim like "most assets get no benefit" is an inference from code structure, not a count of affected files.
**Primary Goal:** Determine, from real external sources and a direct audit of this repo's own rendering code, which techniques professional/indie studios actually use for procedural and semi-procedural pixel art, which of those PixelBrain/SCDL already has a working parallel for, which it's missing outright, and what a phased path to closing those gaps looks like.

## Bytecode Search Code

`SCHOL-ENC-BYKE-SEARCH-PDR-PIXELBRAIN-INDUSTRY-GAP-2026-08-30`

---

## 0. Revision Log

The first draft of this PDR was reviewed the same day. Four claims were checked against the code cited and corrected; two more were downgraded from overclaimed evidence to properly-labeled evidence. Nothing below was accepted on the reviewer's say-so alone — every correction was independently re-verified against the file and line cited before being incorporated. This section exists so the correction is traceable, not silently absorbed.

| # | Original claim | Verified correction |
|---|---|---|
| 1 | "`BAYER_8` is declared once, referenced nowhere else — a dead constant." | **False.** `BAYER_8` feeds `dither8Rgb` (`scene-graph-renderer.js:105`), called from 7 shading branches (lines 238, 247, 258, 267, 274, 282, 289). It is live, just narrowly scoped. Re-verified by grep before correcting. |
| 2 | "`materialShadeColor` handles 8 of ~70 materials." | **Metric was conflated and denominator was an estimate.** Re-counted directly: `material-registry.js` defines **75 unique material IDs** at runtime (85 raw key declarations, 10 are duplicate keys — later declaration silently wins in JS object literals, meaning 10 of those definitions are dead code; a separate, smaller finding, noted in §3.2). `materialShadeColor`'s 7 branches explicitly name **11 material IDs** (`void_ice`, `diamond`, `snow`, `amethyst`, `cyan_glow`, `void_rune_glow`, `voidsteel`, `blacksteel`, `black_steel`, `gold`, `void_gold`) — 7 branches, 11 IDs, because three branches each cover 2–3 ID aliases. Corrected metric: **11 / 75**. |
| 3 | "No procedural loot/variant orchestration layer exists." | **False as stated.** `loot-chest-shared.js:9–26` defines a real, working tier→material orchestration: `LOOT_CHEST_TIERS` (common/uncommon/rare/mythic/legendary/source) mapped to concrete materials (`leather_brown`/`emerald`/`gold`/`amethyst`/`ruby`/`obsidian`), consumed by `transmuteLootChestPacket`. The actual gap is scope: this pattern is chest-specific and hasn't been generalized to other item types or into a full affix/rarity framework. |
| 4 | "Nothing in the pipeline can support relighting." | **Overbroad.** Narrowed to: the canonical SCDL asset packet (`PixelBrainAssetPacket`) has no normal-map channel and no proven runtime relighting consumer. Separately, `shader-packet.js` (`PB-SHADER-v1`, line 15) defines a real GLSL-fragment-shader packet contract with `sdfDescriptors`/`noiseDescriptors`, with real consumers (`item-effect-shader.js`, `phaser-shader-export.js`, `src/lib/pixelbrain.adapter.js`). Checked those consumers directly: none does normal-map-based sprite relighting — they're generic effect/glow shaders. So a separate shader-packet system exists and is wired up, but it is not the relighting system §2.5 describes, and nothing connects it to one. |
| 5 | "Ordered/Bayer dithering is the industry default" (cited a hobbyist blog experiment as the support). | **Source misused.** The 30fps.net article is one person's implementation experiment and explicitly qualifies itself as not highest-quality and image-dependent — it is not evidence of an industry default. Downgraded to a general-reference claim (Wikipedia) plus the observation that several specific retro palettes use Bayer-family thresholds; the "why studios use it" claim (frame-to-frame stability, determinism, speed) is retained but no longer attributed to that source. |
| 6 | Phase 6 (ML suggestion stage) presented as an equal roadmap phase. | Moved to §6 (Future Research), out of the main phased roadmap — it was speculative and non-actionable relative to Phases 1–5. |

---

## 1. Executive Summary

This session audited one real asset through the live compile pipeline, then checked findings against how professional and indie studios build procedural pixel art. After the correction pass in §0, the picture is narrower and more accurate than the first draft: PixelBrain has more working infrastructure than the first draft credited it with (a live Bayer-dithering path, a real tier-driven material orchestration for one item type, a separate shader-packet system with real consumers) — but each of those is **narrowly scoped or unconnected**, not absent. The load-bearing gap is consistently the same shape across every section: real, working mechanisms that solve one instance of a problem, not generalized into a mechanism that solves the class of problem.

Nothing in this report argues for stochastic/generative-AI asset generation. Sources are labeled by evidence class in §2 and §7 so this document's own confidence is checkable at a glance, not just asserted.

---

## 2. Evidence-Grounded External Research

Each subsection is labeled with its source's evidence class: **[Practitioner]** (a studio/developer describing their own shipped pipeline), **[Academic]** (a peer-reviewed or arXiv survey), **[Reference]** (a general encyclopedic description), or **[Experiment]** (one person's implementation write-up — informative, not authoritative about industry practice).

### 2.1 Hybrid 3D→2D pipelines — **[Practitioner]**

Motion Twin shipped *Dead Cells'* 30fps hand-quality pixel animation with a single artist for its first year by building rough 3D models and skeletons, animating them in 3D, then rendering each frame through an in-house pixel-art rasterizer. Gamedeveloper.com's deep-dive is explicit about the technical specifics, not just the headline: **low-resolution rendering** of the 3D output, **normal-map export** from the 3D geometry, a **toon-shading** pass over that, and the retake/reuse economics (re-render instead of re-draw when animation needs revising). This is the strongest single source in this report. [Art Design Deep Dive: Using a 3D pipeline for 2D animation in Dead Cells](https://www.gamedeveloper.com/production/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-i-dead-cells-i-), [Dead Cells: A 3D Pipeline For 2D Animation — Game Anim](https://www.gameanim.com/2018/01/31/dead-cells-3d-pipeline-2d-animation/)

**Parallel:** structurally the same shape as PixelBrain's `evaluateMathematicalStroke` → `forgeCharacterFromWandVector` → SCDL fill/silhouette pipeline: a deterministic procedural layer generates geometry, then the same rasterizer handles it as hand-authored parts. Confirmed working this session on one asset's lightning-vein detail. Note the sharper parallel Dead Cells actually offers that PixelBrain doesn't yet have: their pipeline exports a **normal map** from the 3D source *for free*, because the geometry was always 3D. PixelBrain's geometry is native 2D/vector, so it has no equivalent free byproduct — any normal map would have to be synthesized after the fact (§2.5).

### 2.2 Dithering — **[Reference] + [Experiment], corrected**

Ordered dithering compares each pixel to a position-dependent threshold from a small tiled matrix (classically Bayer). It's deterministic and frame-stable (no "swimming" the way error-diffusion dithering can show across animation frames), which is why several specific retro/palette-constrained targets (Game Boy-, NES-, PICO-8-style palettes) are commonly implemented with Bayer-family thresholds. [Ordered dithering — Wikipedia](https://en.wikipedia.org/wiki/Ordered_dithering)

One implementation write-up (an **[Experiment]**, not evidence of a studio standard) documents combining Bayer-order dithering with k-means palette refinement, and is explicit that the result is not the highest-quality dithering available and that quality is image-dependent. [Single-pass palette refinement and ordered dithering — 30fps.net](https://30fps.net/pages/bayer-order-online-kmeans/) — cited here only for the technique combination, not as proof of an "industry default."

**Parallel — corrected per §0.1:** PixelBrain already has a live Bayer-dithering path. `BAYER_8` (`scene-graph-renderer.js:37`) feeds `dither8Rgb` (line 105), called from all 7 branches of `materialShadeColor` that do procedural micro-shading. The real gap is not absence — it's that this mechanism is **hardcoded per-material inside 7 specific `if (mat === ...)` branches**, not exposed as a general, configurable "dither this tone-band transition" pass any of the other 64 material IDs (or a `path`/`polygon`/`cell`-authored asset generally) could opt into.

### 2.3 Color quantization — **[Reference] + [Academic]**

Median cut recursively splits the color-space box along its longest axis; k-means clusters by distance but is initialization-sensitive; NeuQuant (a small self-organizing net) handles gradients well but under-represents rare, distinct hues. [Median cut — Wikipedia](https://en.wikipedia.org/wiki/Median_cut), [Forty years of color quantization: a modern, algorithmic survey](https://dl.acm.org/doi/abs/10.1007/s10462-023-10406-6)

**Parallel:** `palette-role-quantizer.js` already runs k-means in RGB space with deterministic seeded centroids (sorted colors, strided initial picks — reproducible, not random). Gap: plain Euclidean distance, not perceptual (Lab/Oklab); no post-quantization dithering to hide banding introduced by the reduction.

### 2.4 Distance-transform outline/bevel automation — **[Academic]**

The normal-map survey (§2.5) documents **beveling**: auto-generating a height map by merging distance transforms of a sprite's silhouette and internal-edge masks. Read closely, the paper frames this technique as arising specifically because **documentation on manual height-painting practice was scarce** — it's a research response to a gap in available guidance, not a proven industry-standard shortcut — and the paper itself warns the technique **merges small shapes together and loses fine internal detail** without explicit segmentation hints. [Analysis and Compilation of Normal Map Generation Techniques for Pixel Art](https://ar5iv.labs.arxiv.org/html/2212.09692)

**Parallel:** none. No distance-transform code exists anywhere in `raster-core.js` or `scene-graph-renderer.js`. Every outline on every asset audited this session was 100% hand-placed cells. SCDL's `rim` op looks superficially similar but only emits edges along the four *canvas* compass sides (`COMPASS_EDGES` in `expand-cells.pass.js`) — correct for a border/frame effect, not usable for silhouette-hugging outlines on an off-axis shape. Any implementation of this technique needs to design around the paper's own warning: explicit rules for **segmentation** (which cells belong to which sub-shape), **override** (hand-authored cells always win), **clipping** (auto-outline never exceeds the part's own footprint — see the existing `[[project mutation]]`-style silhouette-ownership lesson already learned elsewhere in this codebase for boolean ops), and **adjacency** (how touching parts resolve a shared edge) — none of which the source paper itself resolves cleanly.

### 2.5 Normal-map dynamic lighting ("hi-bit" pixel art) — **[Academic] + [Practitioner tooling]**

The survey paper compares six normal-map methods: hand-painting (best, most labor), Sobel-from-color (bad — bakes shading in as false geometry), Sobel-from-height-map, beveling (§2.4), four-angle illumination merging (closest automated match to hand-painted), and deep generative models (weak, over-smoothed, trained on non-pixel-art data). **No automated technique matched hand-painted quality** at the time of that survey. Commercial tools (SpriteIlluminator, Sprite DLight) exist specifically to build this pipeline for indie teams; Unity, Godot, Phaser, and Defold all support normal-mapped 2D sprites once the maps exist. [Analysis and Compilation of Normal Map Generation Techniques for Pixel Art](https://ar5iv.labs.arxiv.org/html/2212.09692), [SpriteIlluminator](https://www.codeandweb.com/spriteilluminator), [Normal map lighting for 2D Pixel Art sprites — Defold forum](https://forum.defold.com/t/normal-map-lighting-for-2d-pixel-art-sprites/70967)

**Parallel — corrected per §0.4:** `rasterizeSphere` (`raster-core.js:571–631`) is the only true lit-form primitive PixelBrain has — genuine Lambert shading, documented hemisphere-normal math, 5 measured tone tiers. The canonical `PixelBrainAssetPacket` (the SCDL compile output) carries no per-pixel normal channel and has no proven runtime relighting consumer. Separately, `shader-packet.js` defines a real, consumed (`item-effect-shader.js`, `phaser-shader-export.js`) GLSL-fragment shader-packet contract — a genuine shader layer exists in this codebase — but its consumers are generic effect/glow shaders, not normal-map sprite relighting, and nothing currently bridges the two systems.

### 2.6 Procedural loot/item variation — **[Reference], weak sourcing**

Diablo- and Path of Exile-style systems pair affix databases with rarity tiers driving stats and, separately, palette/material swaps. Public technical detail on the actual sprite-variation implementation is thin — this remains the weakest-sourced section in this report. [Path of Exile 2 — Wikipedia](https://en.wikipedia.org/wiki/Path_of_Exile_2)

**Parallel — corrected per §0.3:** PixelBrain already has a working instance of this exact pattern: `loot-chest-shared.js` defines `LOOT_CHEST_TIERS` (common/uncommon/rare/mythic/legendary/source) mapped to concrete materials and applied via `transmuteLootChestPacket`. The gap is not "this doesn't exist" — it's that the pattern is hardcoded to one item type (chests) with a fixed 1:1 tier→material table, not a general rarity/affix framework other item types (weapons, armor) can plug into.

### 2.7 Where generative ML actually sits — **[Reference/trend summary]**

2025–2026 industry-trend sources describe GANs, VAEs, diffusion, and transformers as active PCG research directions, but consistently frame the deployed pattern as *AI generates a rough base, artists refine and polish it*. [Game Art Trends 2026 — VSQUAD](https://vsquad.art/blog/articles/new-trends-in-game-art-industry/), [The Five-Dollar Model: Generating Game Maps and Sprites from Sentence Embeddings](https://arxiv.org/pdf/2308.04052)

This corroborates the recommendation already given earlier this session against Conditional GANs for PixelBrain: the industry's deployed pattern is stochastic suggestion, deterministic/hand-authored finish — the shape PixelBrain already has, just without an ML suggestion stage bolted on. This source class is the softest in the report (trend summaries, not audited implementations) and is treated accordingly — as corroboration, not as the primary basis for that recommendation.

### 2.8 Wave Function Collapse — **[Reference]**

WFC generates globally-consistent tile arrangements from local adjacency constraints — a *placement* algorithm, not an asset generator; output quality is bounded by the input tileset's own art. [Procedural Generation with Wave Function Collapse](https://www.gridbugs.org/wave-function-collapse/)

**Parallel:** none found. `codex/core/pixelbrain/scdl/tiles` is a 137KB opaque data file, not source; no WFC or constraint-propagation code found anywhere under `codex/core/pixelbrain/`. Out of scope for a single weapon-icon asset; relevant only if PixelBrain is later pointed at tilemap/dungeon-tile generation.

---

## 3. Evidence-Grounded Current PixelBrain State

### 3.1 Verified capabilities

| Capability | Evidence | Industry parallel |
|---|---|---|
| Deterministic procedural formula → rasterized cells | `formula-to-coordinates.js:evaluateMathematicalStroke`, live-compiled this session | Dead Cells 3D→2D pipeline (§2.1) |
| True Lambert-shaded lighting primitive | `raster-core.js:571–631` (`rasterizeSphere`) | Manual "fake 3D" shading standard technique |
| Palette k-means quantizer | `palette-role-quantizer.js` | Median-cut/k-means quantization (§2.3) |
| Live Bayer-ordered dithering (narrowly scoped) | `scene-graph-renderer.js:37` (`BAYER_8`) → `dither8Rgb` (line 105), 7 call sites | Ordered dithering (§2.2) |
| Material-driven procedural micro-shading | `scene-graph-renderer.js:materialShadeColor`, 11/75 material IDs handled | Palette-swap material shaders |
| Edge antialiasing + emission bloom post-process | `applyEdgeAntialias`/`applyEmissionBloom`, gated behind `--shade material` | Standard post-process AA/bloom |
| Working tier→material orchestration (chest-scoped) | `loot-chest-shared.js:9–26`, `transmuteLootChestPacket` | Diablo/PoE-style rarity-driven variants (§2.6) |
| Separate GLSL shader-packet contract, real consumers | `shader-packet.js:15` (`createShaderPacket`), consumed by `item-effect-shader.js`, `phaser-shader-export.js`, `src/lib/pixelbrain.adapter.js` | Runtime shader effect layer |

### 3.2 Verified gaps

| Gap | Evidence | Consequence |
|---|---|---|
| `materialShadeColor` handles 11 of 75 registered material IDs | Direct count: `material-registry.js` has 75 unique IDs (85 raw declarations, 10 duplicate keys — dead definitions, see below); `materialShadeColor` names 11 IDs across 7 branches | Most material IDs get zero benefit from the one real "polish" pass PixelBrain has |
| `material-registry.js` has 10 dead duplicate-key material definitions | `obsidian`, `darksteel`, `holy_fire`, `holy_steel`, `void_cloth`, `void_rune_glow`, `oak_bark`, `moonstone`, `diamond`, `sapphire` are each declared twice; JS object-literal semantics mean the second declaration silently wins and the first is unreachable dead code | Minor, separate code-quality finding surfaced while re-counting for §0.2 — not part of the shading-coverage gap itself |
| `--shade material` never reaches the `aseprite` export target | `scdl.cli.js` `cmdCompile`'s `aseprite` branch (~line 126) calls `buildAsepritePayload` directly, bypassing the `_latticeFor`/`options.shade` routing every other target uses (`scdl.exporters.js:91`) | The actual game-usable `.aseprite` deliverable can never carry AA/bloom/material shading through this CLI, regardless of flags |
| `glow radius N` is inert in every SCDL exporter | `applyEmissionBloom` reads only raw pixel RGB energy, never `part.noiseDescriptors` | An author can attach a glow hint that visibly does nothing in any SCDL-exported preview |
| Bayer dithering hardcoded per-material, not general | `dither8Rgb` calls are inline inside 7 `if (mat === ...)` branches, not a reusable pass | The other 64 material IDs (and non-`cell` ops generally) have no path to the same dithering treatment |
| No shape-aware outline/bevel automation | No distance-transform code anywhere in `raster-core.js`/`scene-graph-renderer.js`; `rim` is canvas-edge-only | Every outline on every asset audited is 100% hand-placed; no automation for a technique with known industry precedent (§2.4) |
| No normal-map channel on the canonical asset packet, no relighting consumer | Absent from `PixelBrainAssetPacket`; `shader-packet.js` exists but its real consumers do generic effects, not relighting | No PixelBrain asset compiled through the SCDL path can be dynamically relit at runtime today |
| Palette quantizer is RGB-Euclidean only | `colorDistance()` in `palette-role-quantizer.js` is plain `sqrt(Δr²+Δg²+Δb²)` | Can visibly misjudge which colors are perceptually close |
| Tier→material orchestration is chest-specific | `loot-chest-shared.js` hardcodes 6 tiers to 6 materials for one item type | Not reusable for weapons/armor without duplicating the pattern by hand |

### 3.3 Parallel-mapping summary

| Industry technique | PixelBrain equivalent | Maturity |
|---|---|---|
| Hybrid procedural + hand pipeline (Dead Cells) | Wand `mathematical_stroke` + hand-drawn base | **Working**, proven live this session |
| Ordered/Bayer dithering | Live, but hardcoded to 7 material branches | **Working, narrowly scoped** |
| Color quantization | `palette-role-quantizer.js` k-means | **Working, naive** |
| Material-driven shading | `materialShadeColor` | **Working for 11/75 material IDs** |
| Tier→material variant orchestration | `loot-chest-shared.js` | **Working, single-item-type scoped** |
| GLSL shader-packet layer | `shader-packet.js` + 3 real consumers | **Working, not a relighting system** |
| Distance-transform outline/bevel | — | **Absent** |
| Normal-map dynamic lighting (on the canonical packet) | `sphere` Lambert only, no normal channel, no proven consumer | **Absent** |
| General rarity/affix framework across item types | — (only the chest-specific instance exists) | **Absent as a general framework** |
| WFC tile generation | — | **Absent**, likely out of scope |
| ML-assisted base generation | — | **Correctly absent** per §2.7 — not a gap |

---

## 4. Non-Goals / Boundary Statement

This document does not authorize implementation of any listed item. It does not recommend generative-AI (GAN/diffusion) asset generation — §2.7 reaffirms the opposite. It does not scope tile/level WFC generation as near-term work. Phase 4 (normal maps) touches the canonical packet schema and, per the review that produced §0, is explicitly gated behind naming a real runtime consumer before implementation starts — not scoped for immediate work. Every phase below requires its own review before implementation.

---

## 5. Phased Integration Roadmap

Ordered by leverage-to-effort ratio, cheapest/highest-impact first. Each phase now carries a falsifier (what would show the phase failed) and a Definition of Done, per external review.

**Phase 1 — Fix the two confirmed wiring bugs.**
1. Route the CLI's `aseprite` export target through `_latticeFor`/`options.shade` the same way json/svg/phaser/png already are (`scdl.cli.js` ~line 126 vs. `scdl.exporters.js:91`).
2. Decide, explicitly, whether the other 64 material IDs get a generic anchor-driven micro-shade or stay unshaded on purpose — document whichever is chosen; the current silent gap is the actual problem, not the coverage number itself.
*DoD:* compiling the same `.scdl` with `--export aseprite --shade material` produces a `.aseprite` file with measurably different (AA/bloom-affected) pixel data than without the flag. *Falsifier:* if the two outputs are byte-identical, the fix didn't take.

**Phase 2 — Generalize the existing Bayer/dither8Rgb mechanism (reframed per §0.1, not "wire up a dead constant").**
Extract `dither8Rgb` + `BAYER_8` into a shade-mode option any material can opt into at tone-band transitions, instead of 7 hardcoded branches. *DoD:* a material outside the current 11 (e.g. `darksteel`) visibly dithers under `--shade material` without a new bespoke branch being written for it. *Falsifier:* if enabling it requires still writing one `if (mat === ...)` branch per material, this phase didn't generalize anything.

**Phase 3 — Distance-transform outline/bevel pass, with explicit rules the source paper doesn't resolve.**
Must define, before implementation: **segmentation** (how sub-shapes within one part are distinguished so beveling doesn't merge them — the paper's own documented failure mode), **override** (hand-authored outline cells always win), **clipping** (auto-outline never exceeds the part's own footprint), and **adjacency** (shared-edge resolution between touching parts). *DoD:* run against 3 assets with known-tricky topology (concave silhouette, two touching parts, a thin 1px-wide sub-shape) and hand-review each. *Falsifier:* any of the three loses distinguishable internal detail the paper warned about.

**Phase 4 — Normal-map channel: gated, not scheduled.**
Do not start until a named runtime consumer exists and an acceptance test is defined: the encoded convention (channel layout, coordinate space), frame alignment guarantees for animated assets, the specific engine-side shader that will consume it, and a moving-light visual test that shows the relighting actually working end-to-end. Candidate bridge: `shader-packet.js` already has real consumers and an `sdfDescriptors`/`noiseDescriptors` shape — investigate whether normal data belongs there before extending the SCDL packet schema itself. *DoD:* the acceptance test above passes. *Falsifier:* a normal-map channel ships with no consumer able to demonstrate relighting.

**Phase 5 — Generalize the existing chest-specific tier→material path (reframed per §0.3, not "build the missing layer").**
`loot-chest-shared.js`'s pattern (`LOOT_CHEST_TIERS` → material table → `transmuteLootChestPacket`) already works for one item type. Generalize the same shape to be item-type-parametric instead of duplicating it by hand for weapons/armor. *DoD:* a second item type (e.g. weapons) gets rarity-tier variants by adding a data table, not new transmutation logic. *Falsifier:* adding a second item type requires copy-pasting `transmuteLootChestPacket` with renamed variables.

---

## 6. Future Research (not a roadmap phase)

**Artist-in-the-loop ML suggestion stage.** Moved out of the phased roadmap per §0.6 — it's speculative relative to Phases 1–5, none of which it depends on or blocks. If ever revisited: an ML step proposes a rough base layout, always compiled through the existing deterministic SCDL pipeline and always hand-refined before shipping — never a replacement for the deterministic compile. Matches §2.7's finding of how the industry actually deploys ML for pixel art; does not contradict the earlier recommendation against cGANs, it restates it.

---

## 7. Sources, Labeled by Evidence Class

**[Practitioner]** — a studio/developer describing their own shipped pipeline:
- [Art Design Deep Dive: Using a 3D pipeline for 2D animation in Dead Cells](https://www.gamedeveloper.com/production/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-i-dead-cells-i-)
- [Dead Cells: A 3D Pipeline For 2D Animation — Game Anim](https://www.gameanim.com/2018/01/31/dead-cells-3d-pipeline-2d-animation/)

**[Academic]** — peer-reviewed / arXiv survey:
- [Analysis and Compilation of Normal Map Generation Techniques for Pixel Art (ar5iv)](https://ar5iv.labs.arxiv.org/html/2212.09692)
- [Forty years of color quantization: a modern, algorithmic survey](https://dl.acm.org/doi/abs/10.1007/s10462-023-10406-6)
- [The Five-Dollar Model: Generating Game Maps and Sprites from Sentence Embeddings](https://arxiv.org/pdf/2308.04052)

**[Reference]** — general encyclopedic description:
- [Ordered dithering — Wikipedia](https://en.wikipedia.org/wiki/Ordered_dithering)
- [Median cut — Wikipedia](https://en.wikipedia.org/wiki/Median_cut)
- [Path of Exile 2 — Wikipedia](https://en.wikipedia.org/wiki/Path_of_Exile_2)
- [Procedural Generation with Wave Function Collapse](https://www.gridbugs.org/wave-function-collapse/)

**[Experiment]** — one person's implementation write-up, informative not authoritative:
- [Single-pass palette refinement and ordered dithering — 30fps.net](https://30fps.net/pages/bayer-order-online-kmeans/)

**[Practitioner tooling]** — commercial/community tool documentation:
- [SpriteIlluminator — Normal map editor for 2d dynamic lighting](https://www.codeandweb.com/spriteilluminator)
- [Normal map lighting for 2D Pixel Art sprites — Defold forum](https://forum.defold.com/t/normal-map-lighting-for-2d-pixel-art-sprites/70967)

**[Trend summary]** — softest class, corroboration only:
- [Game Art Trends 2026 — VSQUAD](https://vsquad.art/blog/articles/new-trends-in-game-art-industry/)

**Internal evidence** (this repo, commit `3f0371e0` + session working tree): `codex/core/pixelbrain/scdl/render/raster-core.js`, `codex/core/pixelbrain/scene-graph-renderer.js`, `codex/core/pixelbrain/scdl/scdl.exporters.js`, `codex/core/pixelbrain/scdl/scdl.cli.js`, `codex/core/pixelbrain/scdl/passes/expand-cells.pass.js`, `codex/core/pixelbrain/palette-role-quantizer.js`, `codex/core/pixelbrain/material-registry.js`, `codex/core/pixelbrain/formula-to-coordinates.js`, `codex/core/pixelbrain/character-foundry.js`, `codex/core/pixelbrain/loot-chest-shared.js`, `codex/core/pixelbrain/shader-packet.js`, `codex/core/pixelbrain/item-effect-shader.js`, `codex/core/pixelbrain/phaser-shader-export.js`, live compiles of `assets/ASSETS/lightning_scimitar_handdrawn.scdl`.
