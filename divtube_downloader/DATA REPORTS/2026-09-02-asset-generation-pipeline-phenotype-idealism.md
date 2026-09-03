# Phenotype Idealism Audit of the Scholomance Asset Generation Pipeline

**Rasterization fidelity, perceptual color transport, and the golden rules of machine-authored pixel art**

| Field | Value |
|---|---|
| **Document ID** | DR-2026-09-02-ASSETGEN-PI |
| **Status** | Complete — findings measured, recommendations unimplemented |
| **Date** | 2026-09-02 |
| **Branch** | `feature/semantic-calculus-lexical-predicates` @ `b3735aa5` |
| **Scope** | `codex/core/pixelbrain/**`, `codex/core/pixelbrain/scdl/**`, `src/lib/photonic-retina/**` |
| **Method** | Static trace + executable probes against live modules + external literature review |
| **Reproducibility** | All probes in Appendix A; runnable against this commit with `node` |

---

## Abstract

We audited the Scholomance asset generation pipeline using the Phenotypic Idealism frame — stating the *ideal* connective structure, measuring the *observed* structure, and reporting the *gap* — cross-referenced against external literature on rasterization, perceptual color quantization, and the practices of shipped pixel-art titles.

The pipeline's geometry layer is stronger than its color layer. The SCDL rasterizer already computes analytic signed-distance coverage and propagates it through to the emitted packet; the material registry already encodes hue-shifted color ramps, which is the single most-cited "golden rule" of professional pixel art. Both are genuine strengths and neither needs replacing.

The gap is concentrated in three places, all downstream of geometry, and all of the same species: **a perceptual quantity is computed correctly somewhere in the repository and then consumed by a naïve numeric proxy somewhere else.**

1. **Palette selection is lexicographic, not perceptual or frequency-weighted — and it fires on the real shipped asset.** `palette-quantization-amp.js` selects the surviving palette by `Array.prototype.sort()` on hex strings followed by `slice(0, budget)`, appended *after* material anchors. Forging the production VOID chestplate (`scripts/generate-void-chestplate.mjs`, 9 materials, default budget 64) recolored **1962 of 2202 cells (89.1%)** and destroyed **138 distinct colors** — while the final output uses only **34 colors, leaving 30 of the 64 budgeted slots unused.** The mechanism is exact: 9 materials × 7 anchors = **63 anchor colors are collected before a single artwork color is considered**, leaving precisely **1 slot** for the artwork. Every shade the amp chain computed is snapped onto a material anchor.
2. **Color distance and color blending are computed in non-linear sRGB.** The quantizer's nearest-color search uses raw RGB Euclidean distance; the anti-aliasing amp averages channel values directly in gamma-encoded sRGB. The repository already contains OKLab/OKLCH and CIELAB ΔE implementations in `src/lib/photonic-retina/perceptual/` and `src/lib/truesight/color/`, which the asset path never imports.
3. **Analytic coverage is computed, carried, and then discarded at the PNG export boundary.** `raster-core.js` derives `signedDistance` and `strokeHalfWidth`; `expand-cells` and `emit-packet` faithfully carry them; the VIXEL renderer consumes them. The SCDL PNG exporter — the path that produces shipped raster assets — writes `alpha = 255` unconditionally and never reads either field.

None of the three requires new subsystems. Each is a bridge between two components that already exist. We rank five boons by the merge-skill dimensions and give the smallest reversible bridge for each.

**Principal recommendation — revised.** An earlier draft recommended replacing lexicographic truncation with frequency-weighted selection. **Probe 4 refuted the premise and that recommendation is withdrawn.** Zero of the 138 destroyed colors were authored; all were amp-generated intermediates, and anchor dominance is what keeps the asset on its authored 28-color design language. Ship instead a **diagnostic that separates destroyed-noise from destroyed-signal** (§5, Boon 1), run it across the corpus, and touch the allocator only for specs it flags. The allocation *policy* is still incoherent; it has not been shown to cause harm.

**Methodological note.** This report reversed its own headline twice under measurement — first when a synthetic "no harm at defaults" probe was refuted by the real asset, then when the real asset's severity was itself refuted by the authored-palette check. Both reversals are retained in place rather than edited away, because the sequence is the evidence: each framing survived until the next control was run.

---

## 1. Motivation and framing

### 1.1 Why Phenotype Idealism

The Phenotypic Idealism protocol (`docs/superpowers/specs/2026-07-19-phenotypic-idealism-design.md`) asks three questions in a fixed order:

- **Ideal** — what *should* already be connected or reused, given what the repository demonstrably contains?
- **Observed** — what is actually wired, per evidence?
- **Gap** — the structured delta, expressed as *latent boons*: connective tissue, not neat refactors.

This frame is well suited to the asset pipeline specifically because the pipeline is not underbuilt. It contains 75 registered materials, an SDF-capable rasterizer, a perceptual retina subsystem, and a fidelity amp chain. The plausible failure mode for a codebase in that state is not "missing capability" — it is **capability that exists but is not reachable from the path that needs it.** Phenotype Idealism is a detector for exactly that.

### 1.2 Deviation from the standard protocol — declared

The canonical protocol consumes a machine-generated `PHENOTYPIC-IDEAL-v1` packet and requires every boon to cite `evidenceRefs` into that packet's `hits` and `capabilities` arrays. **This audit did not generate such a packet.** Evidence here is direct: file paths with line numbers, and executable probes whose full source and output are reproduced in Appendix A.

This is a deliberate substitution, and it is a *stronger* evidence class than the packet for this particular question — packet hits are similarity-ranked text excerpts, whereas the claims below are about runtime behavior, which only execution can establish. We flag the deviation rather than silently claiming protocol compliance. The protocol's hard rule "do not invent archaeology" is honored in the strict sense: no capability is asserted below that was not read or executed.

### 1.3 What "improvement" means here

We reject "the output looks better" as a success criterion, because it is unfalsifiable in a report. Every recommendation below is stated with a **falsifier**: a specific measurement whose failure would retire the recommendation. Section 7 collects them.

---

## 2. Background: what the external literature actually says

### 2.1 Rasterization and coverage

Bresenham's algorithm is a binary scan-conversion: a pixel is in or out, producing "jagged edges, or alias artifacts" by construction ([US5815162A](https://patents.google.com/patent/US5815162A/en)). The two established remedies are **area sampling** — computing the fraction of each pixel covered and blending accordingly — and **multi-point sampling**. Modified integer Bresenham variants can recover "optimally accurate coverage values" while preserving integer arithmetic ([AntiAliased Bresenham Lines for X](https://link.springer.com/content/pdf/10.1007/978-4-431-68204-2_39.pdf)).

The alternative family is analytic signed distance fields. Rather than rasterizing a path to a bitmap and post-filtering, analytic SDF methods "calculate the minimum distance for each pixel to the nearest segment directly" ([Practical analytic 2D SDF generation, SIGGRAPH 2016](https://dl.acm.org/doi/10.1145/2897839.2927417)). SDFs offer effectively unbounded level of detail, but are conventionally antialiased only by expensive supersampling or post-process filters ([Cone-Traced Supersampling for SDF Rendering](https://openreview.net/forum?id=FYhiH9IyBq)).

**The relevant point for a pixel-art pipeline:** coverage is not primarily an alpha-blending input. It is a *decision signal*. Knowing that a cell is 40% covered lets a system choose an intermediate **palette** color — which is what manual anti-aliasing is — without ever emitting a translucent pixel.

### 2.2 Perceptual color and quantization

OKLab is a perceptual space fitted so that "Euclidean operations behave reasonably," is numerically simple and invertible, and best approximates Munsell space among practical candidates ([Ottosson](https://bottosson.github.io/posts/oklab/)). It specifically avoids the hue-uniformity and linearity problems CIELAB exhibits in blue regions.

An important negative result constrains how OKLab should be applied. Work on median cut finds that **it is more important to perform pixel-to-palette mapping in a perceptual space than to perform the palette *selection* in one** ([30fps.net](https://30fps.net/pages/median-cut-lab-problem/); corroborated by [ubitux](http://blog.pkh.me/p/39-improving-color-quantization-heuristics.html)). This matters because it tells us *where* to spend effort: the nearest-color search is the high-value site.

Palette selection algorithms divide into splitting techniques (median cut, octree, Wu's greedy orthogonal bipartitioning) and clustering (k-means, fuzzy c-means). Splitting is fast but "the resulting images often contain colors substantially different from the original"; k-means with sampling outperforms median cut, and Wu's algorithm is an effective deterministic initializer for k-means ([Celebi, IMAVIS 2011](https://faculty.uca.edu/ecelebi/documents/IMAVIS_2011.pdf)). **Every one of these methods is frequency-aware.** None of them selects by color name or numeric encoding order.

On blending: RGB mixing must occur in linear-gamma space. Averaging in gamma-encoded sRGB yields results "darker than [they] should be and sometimes acquir[ing] a noticeable color cast" — the canonical demonstration being that the sRGB midpoint of black and white, ~128, corresponds to only **21% linear luminance, not 50%** ([ninedegreesbelow](https://ninedegreesbelow.com/photography/linear-gamma-blur-normal-blend.html); [LearnOpenGL](https://learnopengl.com/Advanced-Lighting/Gamma-Correction)).

### 2.3 Golden rules from practitioners and shipped titles

**Anti-aliasing** ([Pixel Parmesan](https://pixelparmesan.com/blog/anti-aliasing-fundamentals-for-pixel-artists)):
- AA is *not* universally required; applying it thoughtlessly harms sprites.
- Keep AA **inside** the sprite. Outer-edge AA is background-dependent and "can really inhibit the readability of a sprite" when the background changes at runtime.
- AA length should be **proportional to segment length** — "the longer the segment, the longer the AA" — and longer runs may need more than one intermediate shade.
- Select AA colors **by perceived value (lightness), not by simple color averaging.**
- Apply intermediate pixels only at step corners. The most common failure is banding a 3–4 shade ramp around the entire outline ([Divoom](https://divoom.com/blogs/setup-ideas/fix-jaggies-pixel-art-without-blur)).

**Color ramps and hue shifting** ([Slynyrd Pixelblog 1](https://www.slynyrd.com/blog/2018/1/10/pixelblog-1-color-palettes)): shadows should shift hue, not merely darken. Slynyrd's working recommendation is ~9 swatches per ramp with roughly 20° of positive hue shift between swatches; hue shift is what "creates harmony between ramps." Corroborated broadly — shifting a red object's shadows toward purple reads as richer than desaturated darkening ([Pixnote](https://pixnote.net/en/learn/shading/)).

**Outlines** ([Pixnote sel-out guide](https://pixnote.net/en/learn/outlines/)): "The same sprite can read as amateur or pro depending entirely on how its outline is handled." The professional default is selective outline — dark only where the sprite meets the background, lighter inner color on the lit side.

**Clustering and orphans**: isolated 1×1 pixels read as noise; grouping same-colored pixels into clusters is a core readability technique ([Derek Yu](https://www.derekyu.com/makegames/pixelart.html); [Pedro Medeiros](https://medium.com/pixel-grimoire/how-to-start-making-pixel-art-4-ff4bfcd2d085)). Banding — thick uniform parallel bands — draws the eye to the boundaries rather than the forms.

**Light direction**: must be consistent within a scene; mismatched light sources across characters, backgrounds and items create visual dissonance.

**Dead Cells' production pipeline** ([Game Developer deep dive](https://www.gamedeveloper.com/production/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-i-dead-cells-i-)) is the most directly comparable shipped system:
- 3D models authored in 3DS Max from 2D pixel sketches, deliberately low-effort because "when the ingame height of the character will only be 50 pixels… spending lots and lots of time and energy on the 3D model seems quite cost inefficient."
- A custom tool rendered the mesh "in a very small size and **without antialiasing**, giving us that pixelated look."
- Frames exported as PNG **with normal maps**, then run through "a basic toon shader" for volumetric shading.
- Flickering pixels between frames were never fully solved and required manual cleanup.

Two lessons transfer. First, the winning architecture is *geometry + normals + a hard-quantizing shading pass* — which is structurally what PixelBrain already is. Second, **temporal stability across frames is the unsolved hard problem**, even for a shipped, critically acclaimed title.

### 2.4 AI-driven pixel art generation

Latent diffusion models fail at pixel art for a structural reason: they "operate in latent space where images start as noise… There's no concept of hard edges, clean pixels, or fixed palettes." The characteristic artifacts are **mixels** (pixels not sharing a common grid or size), soft edges, and "dozens of almost-identical colors" where a readable sprite needs few ([DEV](https://dev.to/jenissimo/how-to-tame-your-ai-pixel-art-3pk5)). The operative critique from developers: AI pixel art "should be judged by engine readiness, not gallery quality."

The state of the art responds by moving the constraints *inside* the model rather than post-processing them on. **PixDiff-PIG** ([ResearchGate](https://www.researchgate.net/publication/398825200_PixDiff-PIG_Palette-Informed_Diffusion_for_Pixel_Art_Generation)) integrates k-means palette quantization, OKLab color modeling, and language-vision guidance into a compact TinyUNet DDPM operating **directly in OKLab space**. Each sprite is compressed into a quantized palette, a palette *index map*, a luminance channel, and a caption.

Its ablation is the single most decision-relevant number we found: **removing OKLab normalization and training in RGB raises FID from 19.6 to 23.7 and drops Palette Consistency Score from 0.82 to 0.74.** OKLab "provides more stable gradients for quantized palettes." For context, PixDiff-PIG's 19.6 FID compares against StyleGAN2 at 41.7 and latent diffusion at 28.4.

The deterministic counterpart is constraint solving. Wave Function Collapse generates content from a small exemplar set while "preserving local compatibility between neighbouring elements," reducing per-cell possibility sets by constraint propagation ([arXiv 2308.07307](https://arxiv.org/abs/2308.07307)). Its known limits are constraint conflict and time complexity at scale.

**Synthesis.** Both the generative and deterministic frontiers converge on the same principle: *represent the asset as an index into a small, perceptually-spaced palette, and make the palette a first-class constrained object rather than a post-hoc filter.* That is precisely the representation SCDL already uses — cells carry material and anchor references. The Scholomance pipeline is, structurally, on the correct side of this line. Its defect is in how the palette object is chosen.

---

## 3. Method

**Static trace.** For each candidate quantity (coverage, color distance, palette membership) we traced producer → carrier → consumer by grep across `codex/` and `src/`, recording the exact line where the quantity is created, each pass that propagates it, and every site that reads it. A quantity that is produced and propagated but never read at the output boundary is recorded as an *unconsumed capability*.

**Executable probes.** Where a claim concerned runtime behavior, we imported the live module and ran it on constructed inputs. Probes were designed so that the *expected-correct* behavior and the *observed* behavior differ visibly, and so that a fix would change the output. Full sources and raw outputs are in Appendix A.

**Severity bounding.** For every defect found by probe, we ran a second probe under *realistic* configuration (default budget, material anchors present) to establish whether the defect is reachable in production. We report the boundary rather than the worst case alone. This is deliberate: a probe that only fires under configurations the product never uses is not a finding, and reporting it as one would be dishonest.

**Literature cross-reference.** Each finding is checked against §2. Where the repository already complies with a golden rule, we say so; a report that returns only defects has not been calibrated.

---

## 4. Findings

### 4.1 Confirmed strengths (no action recommended)

**S1 — Material ramps already hue-shift.** `codex/core/pixelbrain/material-registry.js` defines 75 materials, 74 carrying anchor ramps, 508 anchor entries total. The ramps are not value-only darkening. `icy_fire` runs `void #02070A → shadow #06131C → deep #06324A → body #0EA5E9 → frost #7DD3FC → whiteCore #F8FCFF`, moving cyan-ward and desaturating into white; `shadow_fire` runs `#030106 → #12051D → #2E1065 → #7C3AED`, a hue-shifted purple ramp. Materials additionally carry declarative rules (`forceColdHue`, `boostHighlightsToWhite`, `deepenLowValuesToBlack`, `desaturateMidtones`). This satisfies the Slynyrd hue-shift rule (§2.3) at the registry level and is the pipeline's strongest asset.

**S2 — Anti-aliasing is correctly scoped to the sprite interior.** `pixel-aa-amp.js:31` returns early on `cell.isRim || cell.isMotif`, restricting AA to interior cells, and `:53` fires only on the inner-corner pattern (empty diagonal, two rim neighbors). `:63–65` explicitly exempts hard 90° corners by checking whether both rim runs continue. This matches Pixel Parmesan's two central rules — keep AA inside the sprite, and apply it at step corners rather than along whole edges — and is a more disciplined implementation than the naïve version of this pass.

**S3 — The SCDL rasterizer is analytic, not merely Bresenham.** `scdl/render/raster-core.js` computes a per-cell `signedDistance` with tangent, normal, curvature and arc length (`:110–116`), and distinguishes **band coverage** for strokes (edge at `|sd| = halfWidth`) from **half-space coverage** for fills (edge at `sd = 0`) — see the comments at `:54–56` and `:110–111`. This is the correct model per §2.1 and is materially better than the binary scan-conversion used elsewhere in the tree.

### 4.2 Finding F1 — Palette selection is lexicographic (Severity: high, conditionally reachable)

**Location:** `codex/core/pixelbrain/palette-quantization-amp.js:73–76`

```js
const sourcePalette = collectSpecPalette(spec);
const uniqueOriginal = [...new Set(coordinates.map((cell) => cell.color).filter(Boolean))].sort();
for (const color of uniqueOriginal) uniquePush(sourcePalette, color);
const palette = sourcePalette.slice(0, Math.max(1, budget));
```

The surviving palette is: material anchors in a fixed order, then **every observed color sorted as a hex string**, truncated at the budget. There is no frequency term, no perceptual clustering, no variance-based splitting. `.sort()` with no comparator on `#RRGGBB` strings orders by ASCII, which approximates "lowest red channel first" and is otherwise arbitrary with respect to anything a viewer perceives.

Against §2.2 this is not a weak quantizer; it is **not a quantizer**. Median cut, Wu, and k-means are all frequency- or variance-driven. Hex-string order correlates with neither image content nor perception.

**Probe 1 — unmasked behavior** (no material anchors, budget 3). Input: three dominant colors covering 1200 cells, three single-cell strays with hex-early codes.

| | Input cells | Survived |
|---|---|---|
| `#F05A2A` | 500 | ✗ deleted |
| `#E8C15B` | 400 | ✗ deleted |
| `#D94F6A` | 300 | ✗ deleted |
| `#010203` | 1 | ✓ kept |
| `#020304` | 1 | ✓ kept |
| `#030405` | 1 | ✓ kept |

Result: **1200 of 1203 cells (99.75%) recolored.** 1201 cells collapsed onto `#030405`. The sprite's entire color identity was replaced by three near-black pixels of noise.

**Probe 2 — severity boundary.** We then asked whether production configuration masks this.

| Case | Budget | Anchors | Distinct art colors | Cells recolored | Notes |
|---|---|---|---|---|---|
| A | 64 (default) | `icy_fire` (9) | 4 | **0 / 1201 (0.0%)** | Budget does not bind — no harm |
| B | 8 | `icy_fire` (9) | 4 | **0 / 1201 (0.0%)** | Still no harm |
| C | 16 | `icy_fire` (9) | 42 | **1650 / 2002 (82.4%)** | Budget binds — defect fires |

Case C is the realistic shape of a shaded sprite. Three sub-failures compound:
1. Two of sixteen palette slots went to the single-cell strays `#010203` and `#020304`, which outranked all 40 real shades on hex order.
2. Only the 7 hex-earliest art colors (`#900000`–`#906666`) survived. The remaining 33 shades — 1650 cells — collapsed onto `#906666`, converting a smooth 40-step ramp into a 7-step ramp with a hard clamp at one end.
3. `uniqueColors` came back as **11, not 16**: five palette slots were reserved and then never mapped to. The budget was simultaneously over-subscribed for noise and under-utilized for signal.

**Probe 3 — the real shipped asset (decisive).** Probes 1 and 2 were synthetic. We then forged the production VOID chestplate via `forgeItemAsset(buildVoidChestplateSpec())` (`scripts/generate-void-chestplate.mjs` → `item-foundry.js:413`) at its declared `paletteBudget: 64`:

| Measure | Value |
|---|---|
| Cells in asset | 2202 |
| Cells carrying `quantizedFrom` (recolored) | **1962 (89.1%)** |
| Distinct colors destroyed | **138** |
| Distinct colors in final output | **34** |
| Budget | 64 |
| **Budget slots left unused** | **30** |

The mechanism, confirmed by replicating `collectSpecPalette` against the real spec: the chestplate references **9 materials**; at 7 anchors each the collector accumulates **63 anchor colors before a single artwork color is appended**. Against a budget of 64 this leaves **exactly 1 slot** for the artwork's own 138+ colors. Everything the amp chain computed — bevel, crystal core, surface texture, square-sharpness, AA — is then snapped onto a material anchor.

**Severity statement — corrected.** Our initial synthetic masking case (Probe 2A/2B, 0% recolored) used a *single*-material spec, which collects only 9 anchors and leaves 55 free slots. That configuration is **not representative**: real specs are multi-material, and anchor crowding scales at 7 colors per material, so a spec referencing ≥10 materials exhausts the default budget on anchors alone. The defect is therefore **reachable and active in the production path**, not a corner case. We record the superseded synthetic boundary above rather than deleting it, because the contrast is what identifies material count — not art-color count — as the true trigger variable.

**Probe 4 — REFUTATION of this finding's severity.** The VOID chestplate has a hand-authored 28-color palette, `VOID_CHESTPLATE_EXACT_PALETTE`, declared in both `scripts/generate-void-chestplate.mjs:29` and `codex/core/pixelbrain/void-chestplate-profile.js:91` (verified byte-identical, 28 entries each). Checking the 138 destroyed colors against it:

| Measure | Value |
|---|---|
| Authored palette size | 28 |
| Final unique colors | 34 |
| Final colors that ARE authored | 20 / 34 |
| **Destroyed colors that were authored** | **0 / 138** |

**Not one authored color was destroyed.** All 138 casualties were amp-generated intermediate shades (bevel, surface-texture, square-sharpness gradients).

**This retracts the "smoking crater" reading, including our own.** Three corrections follow:

1. **The "30 unused slots" argument was wrong.** `paletteBudget: 64` is a *ceiling*, not a target. The asset is authored for 28 colors; landing on 34 is close to design intent. Unused capacity is not evidence of loss.
2. **Anchor crowding is, on this asset, accidentally load-bearing.** The 63 anchors that consume the budget *are* the material design vocabulary. By filling the palette with them, the pass pins output to the authored color language and suppresses amp smear. Per §2.4, "dozens of almost-identical colors" is the signature failure of machine-generated pixel art — this pass is actively preventing it.
3. **Boon 1 as originally written could therefore make output worse.** Letting amp-generated shades compete with anchors on raw frequency would admit exactly the smear the pass currently suppresses. See the revised Boon 1.

**What still stands.** The *policy* remains incoherent — hex-lexicographic ordering is arbitrary and defensible on no grounds; it is merely near-inert here because only 1 slot was contested. The mechanism is a live hazard for any spec whose material count and authored palette are less fortuitously aligned. But this audit has **not** demonstrated harm on a shipped asset, and §4.2's earlier framing overstated it.

**Scope note.** The conformance tests (`tests/core/pixelbrain/new-void-chestplate-color-accuracy.test.js`) assert against `output/foundry/new-void-chestplate/` — the *new* generator. The asset probed here is the older `generate-void-chestplate.mjs`, which has no palette-conformance test. Its 14 non-authored final colors are therefore unpoliced, which is a real gap but a different one.

**Secondary observation (minor, quantified).** `ANCHOR_ORDER` at `:10` enumerates seven anchor names. Across the registry, **2 of 508 anchor entries (0.4%), in 1 of 74 materials (1.4%)** — `glacialLavender` and `moonlitGray` on `icy_fire` — are not in that list and are therefore invisible to `collectSpecPalette`'s ordered loop unless a part explicitly names them via `target.anchor`. This is real but small; we record it for completeness and do not rank it as a boon.

### 4.3 Finding F2 — Color distance and blending are computed in non-linear sRGB (Severity: medium)

Two independent sites, one defect class.

**F2a — Nearest-color search.** `palette-quantization-amp.js:19–21`:

```js
function distance(a, b) {
  return ((a.r - b.r) ** 2) + ((a.g - b.g) ** 2) + ((a.b - b.b) ** 2);
}
```

Squared Euclidean distance in gamma-encoded sRGB, used by `nearestColor` at `:50–63` to decide every cell's final color. Per §2.2 this is the highest-value site in the entire quantizer for a perceptual metric — the 30fps.net result specifically finds that pixel *mapping* space matters more than selection space.

**F2b — AA blending.** `pixel-aa-amp.js:81–94` averages the two rim colors and then averages that against the cell color, channel-by-channel in sRGB, recording `formula: 'cell50_rimAverage50'`. Per §2.2 this produces a result systematically darker than the perceptual midpoint. It also directly contradicts Pixel Parmesan's explicit instruction to choose AA colors "based on perceived value… not simple color averaging" (§2.3).

**The gap is a bridge, not a build.** The repository already contains the needed machinery, in the asset pipeline's sibling tree:
- `src/lib/photonic-retina/perceptual/preprocessing.js` — `toLabLattice`, `deltaE76`
- `src/lib/truesight/color/oklch.js` and `codex/core/shared/truesight/color/oklch.js` — OKLCH conversions
- consumed already by `features-v1.js`, `visual-weight-field.js`, `region-partition.js`, `composition-graph.js`, `evaluate.js`

`palette-quantization-amp.js` imports exactly one module: `./material-registry.js`. The asset generation path and the perceptual evaluation path do not touch. This is the textbook Phenotype Idealism gap — the capability exists, is tested, and is one import away from the consumer that needs it.

**External support for the magnitude.** PixDiff-PIG's ablation (§2.4) isolates precisely this variable: OKLab → RGB costs 4.1 FID and 0.08 PCS. That is a generative-model result and does not transfer numerically to a deterministic quantizer, but it establishes the direction and that the effect is measurable rather than aesthetic.

### 4.4 Finding F3 — Analytic coverage is discarded at the PNG export boundary (Severity: medium)

The producer/carrier/consumer trace:

| Stage | File | Evidence |
|---|---|---|
| Produced | `scdl/render/raster-core.js` | `:110–116` computes `signedDistance`, `halfWidth`; `:54–56` attaches `strokeHalfWidth` |
| Carried | `scdl/passes/expand-cells.pass.js` | `:102`, `:108` copy both onto the coord |
| Carried | `scdl/passes/emit-packet.pass.js` | `:42`, `:51` emit both into the packet |
| **Consumed** | `codex/core/pixelbrain/vixel/vri-renderer.js` | `:89` `coverageMode` — "coverage is chosen by `strokeHalfWidth` presence"; reads `sd` at `:417`, `:471` |
| **Not consumed** | `scdl/scdl.exporters.js` | `renderPngBytes` at `:359–379` |

`renderPngBytes` writes `rgba[off + 3] = 255` unconditionally and never references `signedDistance` or `strokeHalfWidth`. Upscaling is nearest-neighbour (`:389`). A grep for `coverage` across `scdl.exporters.js` returns zero hits.

The pipeline therefore has **two renderers with different fidelity contracts** over the same packet: VIXEL is coverage-aware, PNG export is not.

**This is not straightforwardly a bug, and we decline to call it one.** Hard alpha is defensible and arguably correct for pixel art — Dead Cells rendered explicitly "without antialiasing" (§2.3), and translucent edge pixels are exactly the "soft edges" that mark AI-generated sprites as unusable (§2.4). Emitting fractional alpha would make the output *worse*.

The boon is different: **coverage is a decision signal, not an alpha value.** A cell with `|sd|` inside the half-width band is precisely a cell where a manual-AA intermediate *palette* color belongs. The pipeline currently derives AA from an 8-neighbor pattern match on the finished cell grid (`pixel-aa-amp.js:36–53`) — a topological reconstruction of information the rasterizer already had exactly, and threw away. Coverage additionally gives what F2/the golden rules say the current amp lacks: a continuous measure to scale AA strength by, satisfying "the longer the segment, the longer the AA."

### 4.5 Finding F4 — Two rasterizers with different fidelity contracts (Severity: low, structural)

`codex/core/pixelbrain/raster-math.js` provides binary Bresenham primitives. `rasterLine` (`:6–23`) is standard integer Bresenham. `rasterArc` (`:25–40`) rounds `cos`/`sin` **independently** per sample before connecting with Bresenham segments — independent per-axis rounding is the classic source of asymmetric arcs, and it discards subpixel position before any coverage could be derived from it.

Five modules consume it: `heraldry-library.js`, `semantic-bridge.js`, `image-to-construction-skeleton.js`, `geometry/raster-fill.js`, `construction-line-microprocessor.js` — plus `raster-core.js` itself.

This is the ScholomanceCompile skill's own pattern #5 (*duplicate tokenizers/parsers drift silently*) in its rasterizer form: two implementations of "put a shape on the grid" with materially different fidelity, no differential test between them, and consumers selecting one by import history rather than by fidelity requirement. We rank this low because both paths are individually correct for their consumers; the risk is drift and inconsistent output between subsystems, not present breakage.

---

## 5. Ranked boons

Scored on the merge-skill dimensions (Coherence · Velocity · Safety · Reuse · Future-proof, 1–5).

### Boon 1 — Frequency-weighted, perceptually-spaced palette selection
**Classification:** behavioral · **Bridge:** shared_util · **Scores:** C5 · V4 · S4 · R4 · F5 · **Confidence:** 0.95

**Gap.** *Ideal:* palette slots are allocated to the colors that carry the most of the image, spaced to cover its perceptual range. *Observed:* anchors are enumerated first and exhaust the budget, then remaining slots go by hex-string ASCII order (`palette-quantization-amp.js:73–76`). *Delta:* on the real VOID chestplate, **1962/2202 cells (89.1%) recolored, 138 colors destroyed, 30 of 64 budget slots left unused** (§4.2, Probe 3).

**REVISED after Probe 4. Do not implement the original recommendation.**

The original text proposed ranking anchors and artwork colors together by frequency, to "recover the 30 wasted slots." Probe 4 refutes the premise: no authored color was lost, and anchor dominance is what keeps the asset on-model. Frequency-ranking artwork colors against anchors would admit amp smear and **degrade** palette discipline.

**Ship the diagnostic first, not a fix.** The question this finding could not answer — *is a destroyed color noise or signal?* — is answerable in ~15 lines and should have been the first deliverable. Add to `applyPaletteQuantization`'s diagnostics:

- `destroyedAuthored` — destroyed colors that appear in a spec-declared exact palette
- `destroyedSemantic` — destroyed colors that were the color of a cell carrying `crystalCore`, `crystalGlow`, `isMotif`, or `motifRole`
- `destroyedNoise` — the remainder
- `slotsUnused` — budget minus final unique colors

`destroyedAuthored > 0` or `destroyedSemantic > 0` is the real alarm. `destroyedNoise` is the pass working. Run it across the asset corpus; only specs that trip the first two justify touching allocation.

**Then, only for specs that trip it:** reserve rather than re-rank. Three tiers, per review:
1. Anchors named explicitly via `target.anchor` — **already implemented** at `palette-quantization-amp.js:34–37`, and used at 20+ sites in the real spec.
2. Anchors that are the nearest attractor of a semantically-marked cell — protects the crystal-highlight case regardless of frequency.
3. Remaining anchors and artwork colors — rank by attraction count.

**Do not compute tier 2 by exact color equality.** Only **242 of 2202 cells (11.0%)** have a pre-quantization color exactly equal to any anchor, because the amp chain shifts colors off their anchors. Exact matching would report ~89% of the artwork as anchor-unbacked and demote anchors that hundreds of cells are perturbations of. Use nearest-anchor attraction instead — which also merges tiers 2 and 3 into one measurement and needs no provenance the cells don't carry (verified: `anchor`, `material`, `materialId` are all absent from every cell; only `color` survives).

**Files:** `codex/core/pixelbrain/palette-quantization-amp.js` (only).

---

### Boon 1 — SHIPPED (diagnostic stage), and it fired

Implemented 2026-09-02: `palette-quantization-amp.js` v1.1.0 now emits `slotsUnused`, `destroyedTotal`, `destroyedAuthored`, `destroyedSemantic`, `destroyedNoise`, `authoredPaletteDeclared`, `alarm`. Quantization behavior is unchanged — diagnostics are observation only, asserted by test. `item-spec.js` gained an optional `fidelity.exactPalette`, emitted only when declared so existing spec hashes are unaffected (verified: `item-foundry.test.js`'s hardcoded `fnv1a_7cde379c` still passes). The VOID generator now declares its authored palette on the spec rather than only as post-forge editor metadata.

Tests: `tests/unit/palette-quantization-diagnostics.test.js`, 12 cases, baseline confirmed failing 10/12 before implementation. Regression: 38/38 across `item-foundry`, `void-chestplate`, `quantization-zero-honesty`.

**Result on the VOID chestplate:**

| Diagnostic | Value |
|---|---|
| `uniqueInputColors` → `uniqueColors` | 140 → 34 |
| `slotsUnused` | 30 |
| `destroyedTotal` | 138 |
| `destroyedAuthored` | **0** |
| `destroyedSemantic` | **17** |
| `destroyedNoise` | 121 |
| `alarm` | **true** |

**The alarm caught what both prior passes missed.** Probe 4's authored-palette check reported a clean bill (0 authored colors lost) and would have closed this finding. But 17 destroyed colors were carried by semantically-marked cells — `crystalCore`, `crystalGlow`, `motifRole` — and those colors are not in the authored 28, so no palette check could ever have seen them. This is precisely the low-frequency/high-meaning case raised in review.

Characterization:

- **148 of 148** semantically-marked cells were recolored (100%).
- Their distinct colors collapsed **17 → 7** (−59%).
- **92 of 148 (62%)** now share a final color with the non-semantic body — their identity merged into the surrounding armor.
- `crystalGlow` collapsed hardest: 78 cells, 9 → 3 colors.

**Visual check (first in this report).** The asset was forged to PNG and inspected. It reads as intended — gold-rimmed pauldrons, blue crystal shoulders, purple core and rune channels — but the torso is a large, nearly tonally flat dark field with no visible bevel gradient, despite `bevelStrength: 1.1` and a stated "polished metal look" intent, and the central glow reads banded rather than smooth. This is **consistent with** the semantic-flattening measurement but is **not proof**: void materials are authored dark, so dark-on-dark flatness is partly by design. The decisive evidence is a before/after render once tier-2 reservation lands — which does not exist yet.

**Separate observation.** The spec sets `outline: { material: 'void_gold', anchor: 'body' }` with the comment "make outer silhouette border gold." In the render, gold appears only on the pauldron arcs, not around the silhouette. Unverified; logged for follow-up, not claimed as a defect.

**Status:** the gate defined in review was met, so tier-2 reservation followed.

---

### Boon 1 — SHIPPED (tier-2 reservation). Correct, and visually inert on this asset.

`collectSpecPalette` now returns two tiers instead of one flat list: `required` (anchors the spec names via `target.anchor`) and `available` (the blanket per-material `ANCHOR_ORDER` sweep). Budget allocation is now, highest claim first: **required → semantic → available → observed**. Tiers 3 and 4 keep their previous relative order, so this promotes semantic colors *without* disturbing the anchor dominance Probe 4 showed to be load-bearing.

Semantic colors are read straight off the cells, so the exact-match trap identified in review never arises — no anchor-usage inference is performed at all.

**Deliberately not done:** the authored exact palette is *not* auto-reserved. `destroyedAuthored` measured 0, so reserving it fixes nothing observed and would disable a live alarm. YAGNI until the diagnostic says otherwise.

**Measured effect on the VOID chestplate:**

| Diagnostic | Before tier-2 | After tier-2 |
|---|---|---|
| `destroyedSemantic` | 17 | **0** |
| `alarm` | true | **false** |
| Semantic cells recolored | 148 / 148 | **0 / 148** |
| Semantic distinct colors | 17 → 7 | **17 → 17** |
| Merged into body color | 92 / 148 (62%) | **0 / 148** |
| `uniqueColors` | 34 | 43 |
| `slotsUnused` | 30 | 21 |
| `destroyedAuthored` | 0 | 0 |

Tests 14/14; regression 61/61 across item-foundry, void-chestplate, holyfire-paladin-sword, quantization-zero-honesty. Spec hash `fnv1a_b467409f` unchanged across the fix.

**Visual acceptance test: FAILED to show a difference.** Both renders were forged and inspected. They are near-identical. A per-cell A/B against a faithful replica of the old allocation policy explains why:

- **672 of 2202 cells (30.5%) changed final color** — but the shifts are sub-perceptual. The largest single group is `#000000 → #000004` (×174). Others: `#7463E8 → #7361EF` (×34), `#6B35B8 → #6A31BB` (×30), `#A66BE0 → #A86AE6` (×28). Only `#B8B0FF → #D2B5F4` (×20) is a visible hue move.

**Honest verdict.** The semantic colors that were being merged were themselves near-duplicates of what they merged into, so preserving them changes the measurement far more than the image. The fix is retained because it is correct by construction, cheap, tested, and closes a real failure class that *would* be visible on an asset whose highlights contrast with its body — but it should **not** be credited with improving this asset's appearance, and the "boot on PixelBrain's neck" framing is not supported.

**The torso flatness has a different cause.** It survives this fix unchanged, so it is not palette allocation. `bevelStrength: 1.1` is declared and no bevel gradient is visible; that points at the amp chain or the shading model, and is unexamined by this audit.

### Boon 2 — Route color distance through the existing perceptual modules
**Classification:** structural · **Bridge:** adapter · **Scores:** C5 · V4 · S4 · R5 · F4 · **Confidence:** 0.85

**Gap.** *Ideal:* a repository containing tested OKLab/ΔE implementations uses them wherever it compares colors. *Observed:* `palette-quantization-amp.js` imports only `material-registry.js` and compares in sRGB Euclidean; `pixel-aa-amp.js` averages in gamma-encoded sRGB. *Delta:* the asset pipeline and the perceptual retina tree share no imports.

**Smallest bridge.** Extract a single `colorDistanceOklab(a, b)` / `mixPerceptual(a, b, t)` utility wrapping the existing `src/lib/truesight/color/oklch.js`, and swap it into `distance()` (F2a) and the AA blend (F2b). Two call sites. Because both currently take hex in and return hex out, the adapter is drop-in and the change is behaviorally isolated.

**Note on sequencing.** Per the 30fps.net result (§2.2), do F2a (the *mapping* site) before touching selection space — mapping is where perceptual distance pays.

### Boon 3 — Feed rasterizer coverage into palette-snapped AA
**Classification:** architectural · **Bridge:** sync_layer · **Scores:** C4 · V2 · S3 · R4 · F5 · **Confidence:** 0.70

**Gap.** *Ideal:* the AA pass consumes the exact subpixel coverage the rasterizer computed. *Observed:* AA reconstructs edge topology from an 8-neighbor pattern match, while `signedDistance`/`strokeHalfWidth` sit unread on the same cells (§4.4). *Delta:* exact information is recomputed approximately, and the continuous magnitude needed to scale AA by segment length is discarded.

**Smallest bridge.** Where `pixel-aa-amp` finds an inner-corner candidate, prefer `cell.signedDistance` when present to (a) gate whether AA applies and (b) pick the ramp step, snapping to an existing anchor rather than emitting a blended hex. **Critically, emit an anchor, not a blend** — this preserves hard alpha, keeps the output inside the palette, and avoids the soft-edge failure mode of §2.4.

**Explicit non-goal.** Do not write fractional alpha into `renderPngBytes`. Hard alpha is correct (§4.4).

### Boon 4 — Order-of-operations guard between AA and quantization
**Classification:** behavioral · **Bridge:** schema · **Scores:** C3 · V4 · S5 · R3 · F3 · **Confidence:** 0.55

**Gap.** `pixel-aa-amp.js:78–80` states in-comment that "palette-quantization-amp will snap it to the palette." AA deliberately introduces a color absent from the ramp; quantization then maps every color to its nearest palette member. If the blended color did not win a palette slot, it snaps — plausibly back to one of its own parents, silently reverting the AA.

**Honesty note.** We did **not** measure this end-to-end and do not assert it occurs in production. It is a structural risk identified by reading, with a clearly defined falsifier. Boon 1 changes the conditions under which it would fire, so it should be re-checked after Boon 1 rather than fixed speculatively now.

**Smallest bridge.** `pixel-aa-amp` already writes `colorProvenance.inputs` (`:105`). Add a diagnostic to `applyPaletteQuantization` counting cells whose provenance amp is `pixel-aa-amp` and whose post-quantization color is a member of its own `inputs` — i.e. AA that was undone. Ship the counter before shipping any fix; if it reads zero on real assets, close the finding.

### Boon 5 — Differential test between the two rasterizers
**Classification:** structural · **Bridge:** registry · **Scores:** C3 · V3 · S4 · R3 · F4 · **Confidence:** 0.60

**Gap.** *Ideal:* one rasterization contract, or an explicit documented split with a test pinning the difference. *Observed:* `raster-math.js` (binary Bresenham, independently-rounded arcs) and `raster-core.js` (analytic SDF with band/half-space coverage) both live, with six consumers split between them and no test comparing them (§4.5).

**Smallest bridge.** Add a differential test rendering the same circle, arc, and line through both paths and asserting a bounded cell-set difference. This does not force convergence; it makes divergence visible and pins it, which is the actual requirement. Fix `rasterArc`'s independent per-axis rounding while there.

---

## 6. Limitations and threats to validity

1. **No protocol packet.** This audit substituted direct measurement for the `PHENOTYPIC-IDEAL-v1` packet (§1.2). Boon rankings are therefore our judgment against the merge-skill dimensions, not packet-derived `confidence` scores. The `confidence` values above are ours and should be read as such.
2. **Probes 1 and 2 are synthetic, and Probe 2 was initially misleading.** Probes 1–2 used constructed inputs. Probe 2's "no harm at default budget" result came from a single-material spec and **wrongly suggested the defect was unreachable in production**; Probe 3 on the real asset refuted it. This is a worked example of a fixture inheriting its author's blind spot — we varied art-color count and budget, the two variables we were already thinking about, and held material count at 1 without noticing it was the actual trigger. Findings F2–F4 have **not** received a Probe-3-equivalent and should be treated as static-trace claims until they do.
3. **No visual verification.** Per prior standing guidance, diffs and metrics cannot validate aesthetics. **Nothing in this report has been rendered and looked at.** This is the largest open gap: "89.1% of cells recolored" bounds the *information* discarded, not the *visible* damage. If the amp chain generated 138 near-identical shades, snapping them to 34 anchors may be barely perceptible. Someone must forge the chestplate to PNG before and after Boon 1 and compare on screen before this report's principal recommendation is credited.
4. **F4 (Boon 4) is unmeasured.** Stated as a structural risk with a falsifier, not as an observed defect. It is ranked fourth for that reason.
5. **External numbers do not transfer directly.** PixDiff-PIG's FID/PCS deltas describe a diffusion model trained in OKLab; they establish that the color-space choice is measurable, not that this pipeline will see a comparable effect.
6. **Coverage of the tree is partial.** `codex/core/pixelbrain/` contains well over 200 modules. We traced the color and rasterization paths. The amp chain (bevel, texture, crystal core), the VIXEL/VRI renderer, and the Aseprite export path were read only where they intersected those. The report does not license claims about them.

---

## 7. Falsifiers

Each recommendation is retired if its falsifier holds. **Per standing practice, the control must fail before the fix is credited.**

| Boon | Falsifier — retire the recommendation if… |
|---|---|
| 1 | ~~Instrumenting real production specs shows `paletteBudget` never binds.~~ **Discharged — Probe 3 shows it binds on the shipped VOID chestplate (89.1% recolored, 30/64 slots unused).** Remaining falsifier: rendering the asset before and after the fix shows no perceptible difference on screen. Then the loss is real but cosmetically inert, and Boon 1 drops to housekeeping. |
| 2 | Swapping `distance()` to OKLab changes the assigned color for <1% of cells across the real asset corpus. Then sRGB Euclidean is an adequate proxy at this palette granularity. |
| 3 | `signedDistance` is absent or `undefined` on the cells reaching `pixel-aa-amp` in the production path — i.e. the SCDL and amp paths do not actually share packets. Then there is no bridge to build. |
| 4 | The proposed AA-reversion counter reads 0 across the real asset corpus. Then the risk is theoretical. |
| 5 | Only one of the two rasterizers is reachable from any shipped asset path. Then there is no drift surface. |

**Baseline requirement.** Before crediting Boon 1, run the current quantizer on the chosen real corpus and record `changedCount` / `uniqueColors` per asset. If the baseline shows no damage, Boon 1 has not been demonstrated to help regardless of how the fixed version scores.

---

## 8. Future work

- **Temporal coherence.** Dead Cells never solved inter-frame pixel flicker (§2.3) and neither has this pipeline addressed it. With frame expansion already present (`expand-frames.pass.js`), a cross-frame palette-stability constraint — quantize an animation against one shared palette rather than per-frame — is the natural extension, and is a strictly harder problem than anything in §5.
- **Palette as a constrained object.** Both frontiers in §2.4 converge on treating the palette as a first-class constrained entity. SCDL's cell/material/anchor model is already an index representation; promoting `paletteBudget` from a post-hoc truncation to a solver constraint at `expand-cells` time would put the pipeline structurally ahead of the post-processing approaches that dominate current tooling.
- **A pixel-art-specific quality metric.** FID is "not always a perfect indicator" and can stay low while perceptual quality degrades. A Palette Consistency Score analogue (§2.4) computed against the material registry's own ramps would be cheap, deterministic, and directly aligned with this pipeline's notion of correctness — and would give §7's falsifiers a sharper instrument than cell-difference counts.
- **Selective outline from normals.** `selout-amp.js` uses a fixed `threshold = 0.3` on `n · L` with a three-way branch. Dead Cells achieved its look with normal maps into a toon shader (§2.3); `normal-estimation.js` already exists here. Making the threshold material-dependent is a small, well-scoped follow-on.

---

## Appendix A — Probe sources and raw output

Probes were run against `feature/semantic-calculus-lexical-predicates` @ `b3735aa5` with Node v20.20.2. Imports use absolute paths; substitute your checkout root.

### A.1 Registry anchor reachability

```js
import { MATERIAL_PALETTES } from '<root>/codex/core/pixelbrain/material-registry.js';
const ANCHOR_ORDER = ['void','shadow','deep','body','frost','spectral','whiteCore'];
let mats=0, withAnchors=0, totalAnchors=0, reachable=0;
const unreachableNames = new Map(); let matsWithUnreachable=0;
for (const [id, def] of Object.entries(MATERIAL_PALETTES)) {
  mats++;
  const keys = Object.keys(def.anchors || {});
  if (!keys.length) continue;
  withAnchors++; totalAnchors += keys.length;
  const unreach = keys.filter(k => !ANCHOR_ORDER.includes(k));
  reachable += keys.length - unreach.length;
  if (unreach.length) { matsWithUnreachable++; for (const u of unreach) unreachableNames.set(u,(unreachableNames.get(u)||0)+1); }
}
```

```
materials total: 75
materials with anchors: 74
total anchor entries: 508
reachable via ANCHOR_ORDER: 506
UNREACHABLE anchor entries: 2 (0.4%)
materials with >=1 unreachable anchor: 1 of 74 (1.4%)
distinct unreachable anchor names: 2
[ [ 'glacialLavender', 1 ], [ 'moonlitGray', 1 ] ]
```

### A.2 Probe 1 — unmasked palette selection

```js
import { applyPaletteQuantization } from '<root>/codex/core/pixelbrain/palette-quantization-amp.js';
const mk = (color, n) => Array.from({length:n}, (_,i)=>({x:i,y:0,color}));
const spec = { parts: [], fidelity: { paletteBudget: 3 } };
const coords = [
  ...mk('#F05A2A', 500), ...mk('#E8C15B', 400), ...mk('#D94F6A', 300),
  ...mk('#010203', 1),   ...mk('#020304', 1),   ...mk('#030405', 1),
];
const res = applyPaletteQuantization(coords, spec);
```

```
INPUT (color -> cell count):
  #F05A2A  500
  #E8C15B  400
  #D94F6A  300
  #010203  1
  #020304  1
  #030405  1

Budget: 3
SURVIVING PALETTE: [ '#010203', '#020304', '#030405' ]
cells recolored: 1200 of 1203

OUTPUT (color -> cell count):
  #030405  1201
  #010203  1
  #020304  1
```

### A.3 Probe 2 — severity boundary

```js
const specMat = (budget) => ({
  parts: [{ id:'core', fill:{ material:'icy_fire' } }],
  fidelity: { paletteBudget: budget },
});
const art = [ ...mk('#0EA5E9',500), ...mk('#7DD3FC',400), ...mk('#06324A',300), ...mk('#010203',1) ];
const many = [];
for (let i=0;i<40;i++)
  many.push(...mk('#'+(0x900000+i*0x1111).toString(16).padStart(6,'0').toUpperCase(), 50));
many.push(...mk('#010203',1), ...mk('#020304',1));
```

```
--- A: default budget 64, material anchors present ---
budget: 64 | uniqueIn: 4 | uniqueOut: 4
cells recolored: 0 / 1201 (0.0%)

--- B: budget 8, material anchors present ---
budget: 8 | uniqueIn: 4 | uniqueOut: 4
cells recolored: 0 / 1201 (0.0%)

--- C: budget 16, 42 distinct art colors, anchors present ---
budget: 16 | uniqueIn: 42 | uniqueOut: 11
cells recolored: 1650 / 2002 (82.4%)
palette: [ '#02070A','#06131C','#06324A','#0EA5E9','#7DD3FC','#B8F7FF','#F8FCFF',
           '#010203','#020304','#900000','#901111','#902222','#903333','#904444',
           '#905555','#906666' ]
```

### A.4 Probe 3 — the real shipped asset (decisive)

```js
const R = '<root>';
const { forgeItemAsset } = await import(`${R}/codex/core/pixelbrain/item-foundry.js`);
const { buildVoidChestplateSpec } = await import(`${R}/scripts/generate-void-chestplate.mjs`);
const bundle = forgeItemAsset(buildVoidChestplateSpec());
const coords = bundle.assetPacket.geometry.coordinates;
const requant = coords.filter(c => c.quantizedFrom);
// unique final colors; requant.length; new Set(requant.map(c=>c.quantizedFrom)).size
```

```
budget: 64
materials referenced: 9

cells: 2202
unique FINAL colors: 34
cells carrying quantizedFrom (i.e. RECOLORED): 1962 (89.1%)
distinct colors DESTROYED by quantization: 138
```

Mechanism check — replicating `collectSpecPalette` against the same spec:

```
budget: 64
ANCHOR colors collected BEFORE any artwork color: 63
slots left for the actual artwork: 1
```

---

## Appendix B — Evidence index

| Ref | Path | Lines | Claim supported |
|---|---|---|---|
| E1 | `codex/core/pixelbrain/palette-quantization-amp.js` | 19–21 | sRGB Euclidean distance (F2a) |
| E2 | `codex/core/pixelbrain/palette-quantization-amp.js` | 50–63 | `nearestColor` mapping site |
| E3 | `codex/core/pixelbrain/palette-quantization-amp.js` | 73–76 | Lexicographic selection + truncation (F1) |
| E4 | `codex/core/pixelbrain/palette-quantization-amp.js` | 10 | `ANCHOR_ORDER` fixed 7-name list |
| E5 | `codex/core/pixelbrain/pixel-aa-amp.js` | 29–33 | Interior-only AA scoping (S2) |
| E6 | `codex/core/pixelbrain/pixel-aa-amp.js` | 63–65 | Hard-corner exemption (S2) |
| E7 | `codex/core/pixelbrain/pixel-aa-amp.js` | 81–94 | sRGB channel averaging (F2b) |
| E8 | `codex/core/pixelbrain/pixel-aa-amp.js` | 78–80, 101–107 | AA→quantization handoff + provenance (Boon 4) |
| E9 | `codex/core/pixelbrain/scdl/render/raster-core.js` | 54–56, 110–116 | Band vs half-space coverage (S3, F3) |
| E10 | `codex/core/pixelbrain/scdl/passes/expand-cells.pass.js` | 102, 108 | Coverage carried onto coords |
| E11 | `codex/core/pixelbrain/scdl/passes/emit-packet.pass.js` | 42, 51 | Coverage emitted into packet |
| E12 | `codex/core/pixelbrain/vixel/vri-renderer.js` | 89, 417, 419, 471 | Coverage consumed by VIXEL |
| E13 | `codex/core/pixelbrain/scdl/scdl.exporters.js` | 359–379, 389 | Hard alpha 255; nearest-neighbour upscale (F3) |
| E14 | `codex/core/pixelbrain/raster-math.js` | 6–23, 25–40 | Bresenham; independently-rounded arcs (F4) |
| E15 | `codex/core/pixelbrain/material-registry.js` | 26–75 | Hue-shifted ramps (S1) |
| E16 | `codex/core/pixelbrain/item-spec.js` | 194 | `paletteBudget` default 64, clamp [8,128] |
| E17 | `codex/core/pixelbrain/chestplate-fidelity-pipeline.js` | 38 | Quantization applied at finalize |
| E18 | `src/lib/photonic-retina/perceptual/preprocessing.js` | — | `toLabLattice`, `deltaE76` exist unused by asset path |
| E19 | `src/lib/truesight/color/oklch.js` | — | OKLCH conversions exist unused by asset path |

---

## References

**Rasterization and coverage**
- [US5815162A — Anti-aliased lines via modified Bresenham](https://patents.google.com/patent/US5815162A/en)
- [Antialiased Bresenham Lines for X (Springer)](https://link.springer.com/content/pdf/10.1007/978-4-431-68204-2_39.pdf)
- [Practical analytic 2D signed distance field generation — SIGGRAPH 2016](https://dl.acm.org/doi/10.1145/2897839.2927417)
- [Cone-Traced Supersampling for SDF Rendering — OpenReview](https://openreview.net/forum?id=FYhiH9IyBq)
- [How to Scale Down Pixel Art: A Technical Deep Dive — Pixelera](https://pixelera.art/blog/how-to-scale-down-pixel-art)
- [Pixel art anti-aliasing — Bevy discussion #10083](https://github.com/bevyengine/bevy/discussions/10083)

**Perceptual color and quantization**
- [Ottosson — Oklab: a perceptual color space for image processing](https://bottosson.github.io/posts/oklab/)
- [Why CIELAB doesn't improve median cut — 30fps.net](https://30fps.net/pages/median-cut-lab-problem/)
- [Improving color quantization heuristics — ubitux](http://blog.pkh.me/p/39-improving-color-quantization-heuristics.html)
- [Celebi — Improving the performance of k-means for color quantization (IMAVIS 2011)](https://faculty.uca.edu/ecelebi/documents/IMAVIS_2011.pdf)
- [Fast Color Quantization Using MacQueen's K-Means Algorithm](https://uca.edu/cse/files/2020/07/Fast_Color_Quantization_Using_MacQueens_K-Means_Algorithm.pdf)
- [Efficient Color Quantization Using Superpixels (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9416436/)
- [Linear gamma RGB: blur, normal blend — ninedegreesbelow](https://ninedegreesbelow.com/photography/linear-gamma-blur-normal-blend.html)
- [LearnOpenGL — Gamma Correction](https://learnopengl.com/Advanced-Lighting/Gamma-Correction)

**Pixel art golden rules and studio practice**
- [Anti-Aliasing Fundamentals for Pixel Artists — Pixel Parmesan](https://pixelparmesan.com/blog/anti-aliasing-fundamentals-for-pixel-artists)
- [Pixelblog 1: Color Palettes — Slynyrd](https://www.slynyrd.com/blog/2018/1/10/pixelblog-1-color-palettes)
- [Pixelblog 5: Back to Basics — Slynyrd](https://www.slynyrd.com/blog/2018/5/16/pixelblog-5-back-to-basics)
- [Pixel Art Tutorial: Basics — Derek Yu](https://www.derekyu.com/makegames/pixelart.html)
- [Anti-Alias and Banding — Pedro Medeiros, Pixel Grimoire](https://medium.com/pixel-grimoire/how-to-start-making-pixel-art-4-ff4bfcd2d085)
- [Pixel Art Outlines & Selective Outline (Sel-Out) — Pixnote](https://pixnote.net/en/learn/outlines/)
- [Pixel Art Shading & Lighting — Pixnote](https://pixnote.net/en/learn/shading/)
- [How to Fix Jaggies Without Making Pixel Art Blurry — Divoom](https://divoom.com/blogs/setup-ideas/fix-jaggies-pixel-art-without-blur)
- [Art Design Deep Dive: Using a 3D pipeline for 2D animation in Dead Cells — Game Developer](https://www.gamedeveloper.com/production/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-i-dead-cells-i-)
- [Pixel Art Tutorial (WIP) — AndroidArts](https://androidarts.com/pixtut/pixelart.htm)

**AI-driven and procedural generation**
- [PixDiff-PIG: Palette-Informed Diffusion for Pixel Art Generation](https://www.researchgate.net/publication/398825200_PixDiff-PIG_Palette-Informed_Diffusion_for_Pixel_Art_Generation)
- [Generating Pixel Art Character Sprites using GANs — arXiv 2208.06413](https://arxiv.org/pdf/2208.06413)
- [A Missing Data Imputation GAN for Character Sprite Generation — arXiv 2409.10721](https://arxiv.org/pdf/2409.10721)
- [Extend Wave Function Collapse to Large-Scale Content Generation — arXiv 2308.07307](https://arxiv.org/abs/2308.07307)
- [Exploring Palette based Color Guidance in Diffusion Models — arXiv 2508.08754](https://arxiv.org/html/2508.08754v1)
- [How to Tame Your AI Pixel Art — DEV Community](https://dev.to/jenissimo/how-to-tame-your-ai-pixel-art-3pk5)
- [AI Pixel Art Generator for Games: Sprite Workflow Guide — Seeles](https://www.seeles.ai/resources/blogs/ai-pixel-art-generator-for-games)

**Internal**
- `docs/superpowers/specs/2026-07-19-phenotypic-idealism-design.md`
- `divtube_downloader/tui/skills/phenotypic_idealism.md`
- `docs/scholomance-encyclopedia/Scholomance White Papers/SCDL_COMPILER_WHITE_PAPER.md`
- `.claude/skills/ScholomanceCompile/references/compiler-engineering-patterns.md`
