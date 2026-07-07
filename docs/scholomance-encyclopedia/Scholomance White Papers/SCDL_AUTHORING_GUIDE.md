# SCDL Authoring Guide

**Audience:** anyone writing `.scdl` files by hand — artists, agents, engineers.
**Scope:** SCDL v1.1 (`SCDL-AST-v1` version `1.1.0`).
**Search anchor:** `SCHOL-ENC-BYKE-SEARCH-SCDL-AUTHORING`

This is the practical companion to the
[SCDL Compiler White Paper](SCDL_COMPILER_WHITE_PAPER.md) (internals, contracts,
pass pipeline) and the PDRs
([v1](../PDR-archive/scdl-v1-pdr.md),
[v1.1 frames](../PDR-archive/2026-07-03-scdl-frames-and-cli-out-dir-pdr.md)).
Every image in this guide was rendered by compiling the shown source through the
real compiler (`compileSCDL` → packet coordinates → PNG, nearest-neighbour
upscaled). Nothing is a mock-up.

---

## 1. What SCDL Is

SCDL (Scholomance Coordinate Description Language) is the human-readable
authoring language for PixelBrain pixel assets. A `.scdl` file compiles
deterministically into one `PixelBrainAssetPacket` per frame:

```
your-asset.scdl
  → parse (SCDL-AST-v1)
      → validate → frames → SemQuant → colors → materials → vector → symmetry → cells
          → PixelBrainAssetPacket(s)
              → exports: json | svg | phaser | png | aseprite
```

Two laws shape everything you author:

- **Determinism** — same source, same output, byte for byte. Packet IDs are
  content hashes; if the ID moved, the pixels moved.
- **Paint, don't algorithm** — you declare shapes and cells in painter order;
  later ops paint over earlier ones, later parts paint over earlier parts.

---

## 2. Quick Start

Minimal asset — a shaded orb in one op:

```scdl
asset my_orb canvas 24x24

palette {
  shine  = #B7F3FF
  bright = #6EE7F4
  core   = #00B8D9
  rim    = #0077A8
  shadow = #023347
}

part orb material void_core {
  sphere 12 12 radius 10 light -1 -1 shine bright core rim shadow
  glow radius 3
}

export json png
```

Compile it:

```bash
node codex/core/pixelbrain/scdl/scdl.cli.js compile my_orb.scdl --export json,png
```

Real transcript (from `fixtures/slime-sphere.scdl`):

```
[SCDL] Compiling: .../slime-sphere.scdl
  WARN: Unknown material 'crimson_ooze' in part 'body' — falling back to 'source'
  WARN: Unknown material 'emissive' in part 'highlight' — falling back to 'source'
[SCDL] Written: .../slime-sphere-json.json
[SCDL] Written: .../slime-sphere-svg.svg
[SCDL] Written: .../slime-sphere-png.png
[SCDL] Done. Packet ID: pbasset_1e332fe6
```

Outputs land **next to the source file** (never the CWD; override with
`--out-dir`) and are always named `<asset>-<target>.<ext>` — the Export Naming
Law. Lint without writing anything via
`node scdl.cli.js check my_orb.scdl`.

The compiled result of the sphere-authored slime fixture:

![slime rendered](assets/scdl-authoring-guide/fixture-slime-sphere.png)

---

## 3. File Anatomy

```scdl
asset NAME canvas WxH        # mandatory header, exactly one

palette { alias = #RRGGBB }  # optional; strict 6-digit hex only

part ID material MATERIAL {  # 0..N parts, painted in declaration order
  <ops>
}

loop NAME duration MS        # optional (v1.1): names the frame loop
frame N "label" { ... }      # optional (v1.1): per-frame part deltas

export json svg phaser png aseprite   # any subset, any order
```

Rules that bite:

- **Painter order is meaning.** Parts rasterize top-to-bottom as declared;
  within a part, ops rasterize top-to-bottom. Last write wins per pixel.
  Declare the staff *before* the body so the hand paints over it.
- **Part IDs are unique** per asset scope (duplicate → `SCDL-009`).
- **Palette aliases must exist** before use (`SCDL-006`); hex literals are
  strict `#RRGGBB` (`SCDL-004`).
- **Coordinates must be on canvas** (`SCDL-007`). Vector ops silently clip at
  canvas edges instead; only explicit `cell` coordinates hard-error.
- Comments run from `#` to end of line (but `#RRGGBB` in color position is a
  hex literal, not a comment).
- Fractional centers are legal and idiomatic: `circle 15.5 10 radius 7.5`
  centers a circle between pixel columns for even-width canvases.

---

## 4. Op Catalog — with rendered output

Every render below is the actual compiled output of the shown source.

### 4.1 `cell x y COLOR` — single pixel

The atomic op. Integer coordinates, bounds-checked (`SCDL-007`).

```scdl
part rune material gold {
  cell 3 1 ink
  cell 4 1 ink
  cell 2 2 ink
  cell 5 2 ink
  cell 2 3 gold
  ...
}
```

![cell demo](assets/scdl-authoring-guide/op-cell.png)

### 4.2 `line x0 y0 x1 y1 COLOR` — raster line

Bresenham-style via `raster-math.js`. 1px wide; lay two parallel lines for a
shaded staff.

```scdl
part staff material bark {
  line 3 2 3 13 wood
  line 4 2 4 13 wooddark
  line 7 13 14 2 glint
}
```

![line demo](assets/scdl-authoring-guide/op-line.png)

### 4.3 `rect x y w h COLOR` — filled rectangle

```scdl
part panel material void_cloth {
  rect 2 2 12 10 robe
  rect 4 4 8 6 robeshade
  rect 2 13 12 2 golddark
}
```

![rect demo](assets/scdl-authoring-guide/op-rect.png)

### 4.4 `circle cx cy radius r COLOR` — **filled** disc

Every cell with `(x−cx)² + (y−cy)² ≤ r²`. Stack two circles (big light, small
dark, offset down) for the classic hood.

```scdl
part hood material void_cloth {
  circle 7.5 7.5 radius 6.5 hoodhi
  circle 7.5 8 radius 5 hooddeep
}
```

![circle demo](assets/scdl-authoring-guide/op-circle.png)

### 4.5 `ellipse cx cy radius rx ry ry COLOR` — **outline only**

Unlike `circle`, `ellipse` currently rasterizes the *perimeter*, not the fill
(parametric samples, rounded to cells). For a filled ellipse, use `polygon`
or nested `ellipse` rings.

```scdl
part eye material sapphire {
  ellipse 9 6 radius 8 ry 5 body
  ellipse 9 6 radius 4 ry 2 frost
}
```

![ellipse demo](assets/scdl-authoring-guide/op-ellipse.png)

### 4.6 `ring cx cy radius r width w COLOR` — filled annulus

Band centered on `r`, spanning `r − w/2 .. r + w/2`.

```scdl
part halo material gold {
  ring 7.5 7.5 radius 6 width 2 gold
  ring 7.5 7.5 radius 3 width 1 golddark
}
```

![ring demo](assets/scdl-authoring-guide/op-ring.png)

### 4.7 `polygon x1 y1 x2 y2 x3 y3 ... COLOR` — filled polygon

Scanline fill, point-in-polygon at each cell center. Minimum 3 points. The
A-line robe silhouette is one polygon.

```scdl
part gown material void_cloth {
  polygon 5 2 10 2 13 13 2 13 robe
  polygon 7 2 8 2 8 13 7 13 robehi
}
```

![polygon demo](assets/scdl-authoring-guide/op-polygon.png)

### 4.8 `path "SVG-d" COLOR` — filled path region

SVG-like path data (`M L H V Q T C S A Z`; curves flattened to deterministic
10-step polylines, arcs currently straight segments). The path is **closed and
filled** — a `Q` arc renders as the filled region under the curve, not a
stroke. For strokes, use `line`.

```scdl
part sigil material cyan_glow {
  path "M 2 12 Q 8 2 13 12" eye
}
```

![path demo](assets/scdl-authoring-guide/op-path.png)

### 4.9 `sphere cx cy radius r [light lx ly] C0 C1 C2 C3 C4` — lit sphere

The workhorse. One op replaces hundreds of `cell` lines: a filled disc shaded
into five tiers by Lambert lighting. For each cell, the surface normal
`n = (dx,dy)/d` is dotted with the normalized light direction `L`
(default `(-1,-1)`, upper-left), and `cosθ = n·L` picks the tier:

| Tier | Condition | Color slot | Meaning |
|---|---|---|---|
| 0 | cosθ ≥ 0.999 | `C0` | specular shine |
| 1 | cosθ ≥ 0.70 | `C1` | lit |
| 2 | cosθ ≥ 0.10 | `C2` | body |
| 3 | cosθ ≥ −0.40 | `C3` | rim / terminator |
| 4 | otherwise (and dead center) | `C4` | shadow |

Order the five colors **brightest → darkest**. Fewer than five colors reuse
the last given.

```scdl
part orb material void_core {
  sphere 12 12 radius 10 light -1 -1 shine glowc core rim shadow
}
```

![sphere demo](assets/scdl-authoring-guide/op-sphere.png)

### 4.10 `symmetry x|y|xy` — mirror expansion

Delegates to SymmetryAMP after all the part's shape ops are rasterized to
cells. `x` mirrors left↔right around the canvas vertical centerline, `y`
top↔bottom, `xy` all four quadrants. One declaration per part (the last wins).
Author the left half; get both.

```scdl
part face material skin_light {
  symmetry x
  rect 2 3 5 10 hood
  rect 4 6 3 5 skin
  cell 5 8 eye
}
```

![symmetry demo](assets/scdl-authoring-guide/op-symmetry.png)

> **Caution:** symmetry mirrors around the **canvas** center, not the part's
> bounding box. And deliberately *skip* symmetry for light-pinned details —
> the slime fixture keeps its highlight part unmirrored so the shine stays in
> the upper-left, matching the sphere's light direction.

### 4.11 `rim COLOR at COMPASS` — canvas-edge trim

Paints the canvas edge row/column on the named side (`north`, `south`,
`east`, `west`) or a 3-cell corner bracket (`north west`, `south east`, …).
Note: edges of the **canvas**, not of the part's shape.

```scdl
part plate material voidsteel {
  rect 0 0 12 12 void0
  rim gold2 at north
  rim gold2 at west
}
```

![rim demo](assets/scdl-authoring-guide/op-rim.png)

### 4.12 Intent & hint ops — deferred to render time

These ops deliberately do **not** rasterize at compile time (compile-time
resolution would need I/O or is a material property, breaking determinism):

- **`fill COLOR`** — emits a single `fill-intent` marker cell at canvas
  center; full-region rasterization happens at render time via
  `region-fill-amp`. Don't expect the PNG export to show a filled canvas —
  it shows the one marker pixel:

  ![fill demo](assets/scdl-authoring-guide/op-fill.png)

- **`trace outline from image.region("key")`** — stored verbatim as intent
  (`SCDL-008` INFO); resolved by the runtime that owns the referenced image.

- **`glow radius N`** — an *effect hint*, not pixels. It attaches a
  `PB-NOISE-v1` descriptor to the part for the render pass (see §7).

### 4.13 Reserved verbs — parse but do not rasterize yet

The grammar accepts these, but their lowering is a placeholder today.
**Do not rely on them for geometry:**

| Verb | Status |
|---|---|
| `rotate cx cy degrees N` / `scale cx cy s [sy s]` / `translate cx cy dx dy` | parsed, currently emit nothing |
| `union a b` / `subtract a b` / `intersect a b` | boolean lowering placeholder (`lower-booleans.js`) |
| `reference` / `instance "id"` | emits a single white marker cell at (0,0) |

---

## 5. Frames & Loops (v1.1)

Animation is authored as **part-level deltas in one file** — never sibling
file copies. Frame 0 is implicitly the base asset; adding frame blocks leaves
the frame-0 packet ID byte-identical (Base Identity Invariant).

```scdl
loop idle duration 400          # loop name + default per-frame ms

frame 1 "hood-dip" {
  part hood material void_cloth {        # same ID as base → full replacement,
    circle 15.5 11 radius 7.5 hoodhi     # keeps the base part's painter slot
    circle 15.5 11.5 radius 6 hooddeep
  }
  part hoodbrow after face material void_cloth {  # new ID → 'after' anchor
    rect 12 7 8 2 hood                            # is MANDATORY (SCDL-014)
  }
}

frame 2 "glow-surge" { ... }
frame 3 "gold-glint" { omit hoodbrow ... }   # omit removes a base part
```

The three frame laws:

1. **Frame Index Law** — indices are dense and declaration-ordered
   (`1, 2, 3…`). Sparse, duplicate, or out-of-order → `SCDL-013`, never
   silently normalized. `frame 0` may not be declared explicitly.
2. **Replacement Ordering Law** — a replacement keeps the replaced part's
   painter-order slot and must **not** carry an `after` anchor (`SCDL-014`).
   An added (new-ID) part **must** carry `after <existing-part>` — appending
   at the end would paint over everything.
3. **Manifest is compiler output** — the CLI writes
   `<asset>-frameloop.json` (`SCDL-FRAME-LOOP-v1`) with the per-frame packet
   IDs. Never hand-write or hand-patch it.

The canonical example, `fixtures/void_acolyte/void_acolyte.scdl` (32×48,
12 parts, 4-frame idle loop), rendered frame by frame:

| f0 rest | f1 hood-dip | f2 glow-surge | f3 gold-glint |
|---|---|---|---|
| ![f0](assets/scdl-authoring-guide/fixture-void-acolyte-f0.png) | ![f1](assets/scdl-authoring-guide/fixture-void-acolyte-f1.png) | ![f2](assets/scdl-authoring-guide/fixture-void-acolyte-f2.png) | ![f3](assets/scdl-authoring-guide/fixture-void-acolyte-f3.png) |

Frame exports name as `<asset>-f<N>-<target>.<ext>`; single-frame assets drop
the `-f<N>-` infix but never the target suffix.

---

## 6. Material Catalog

`part <id> material <material>` tags every cell the part emits. What that
means, precisely:

- **At compile time** the material is *validated* against
  `codex/core/pixelbrain/material-registry.js` (registry v0.2.0, 60
  materials). Unknown IDs warn (`SCDL-005`) and fall back to `source` — the
  compile still succeeds, which is exactly how `crimson_ooze` and `emissive`
  slipped into the slime fixture. Check `check` output before trusting a
  material name.
- **Your authored palette colors are what the SCDL exports render.** The
  material does not recolor the packet.
- **Downstream**, the material drives *chromatic transmutation*
  (`transmuteMaterialColor`): each source color's luminance picks one of the
  material's anchor colors (bands: `whiteCore ≥0.88`, `spectral ≥0.66`,
  `glacialLavender ≥0.58`, `frost ≥0.52`, `body ≥0.34`, `deep ≥0.18`,
  `shadow ≥0.07`, else `void`). Shape and alpha are always preserved. It also
  selects the shader via `MATERIAL_SHADER_INDEX` and feeds SemQuant role
  binding.

**How to read the tiles below:** each image is the same neutral
grayscale-shaded sphere pushed through that material's transmutation (left),
followed by the material's anchor colors, brightest band → darkest (right).
This is what your art's value structure will map onto if a downstream system
transmutes it into that material.

### Source (1)

| Material ID | Label | Transmuted orb + anchors | Chromatic rules |
|---|---|---|---|
| `source` | Source | ![source](assets/scdl-authoring-guide/mat-source.png) | `passthrough` |

### Metal (13)

| Material ID | Label | Transmuted orb + anchors | Chromatic rules |
|---|---|---|---|
| `darksteel` | Darksteel | ![darksteel](assets/scdl-authoring-guide/mat-darksteel.png) | `deepenLowValuesToBlack` |
| `voidsteel` | Voidsteel | ![voidsteel](assets/scdl-authoring-guide/mat-voidsteel.png) | `deepenLowValuesToBlack` |
| `deep_indigo_steel` | Deep Indigo Steel | ![deep_indigo_steel](assets/scdl-authoring-guide/mat-deep_indigo_steel.png) | `deepenLowValuesToBlack` |
| `void_gold` | Void Gold | ![void_gold](assets/scdl-authoring-guide/mat-void_gold.png) | — |
| `void_cloth` | Void Cloth | ![void_cloth](assets/scdl-authoring-guide/mat-void_cloth.png) | `deepenLowValuesToBlack` |
| `gold` | Gold | ![gold](assets/scdl-authoring-guide/mat-gold.png) | `boostHighlightsToWhite` |
| `silver` | Silver | ![silver](assets/scdl-authoring-guide/mat-silver.png) | `boostHighlightsToWhite` |
| `bronze` | Bronze | ![bronze](assets/scdl-authoring-guide/mat-bronze.png) | — |
| `black_steel` | Black Steel | ![black_steel](assets/scdl-authoring-guide/mat-black_steel.png) | `deepenLowValuesToBlack` |
| `blacksteel` | Blacksteel | ![blacksteel](assets/scdl-authoring-guide/mat-blacksteel.png) | `deepenLowValuesToBlack` |
| `holy_steel` | Holy Steel | ![holy_steel](assets/scdl-authoring-guide/mat-holy_steel.png) | `boostHighlightsToWhite` |
| `sanctified_gold` | Sanctified Gold | ![sanctified_gold](assets/scdl-authoring-guide/mat-sanctified_gold.png) | `boostHighlightsToWhite` |
| `trim_comet_gold` | Trim Comet Gold | ![trim_comet_gold](assets/scdl-authoring-guide/mat-trim_comet_gold.png) | `boostHighlightsToWhite` |

### Gemstone (10)

| Material ID | Label | Transmuted orb + anchors | Chromatic rules |
|---|---|---|---|
| `sapphire_enamel` | Sapphire Enamel | ![sapphire_enamel](assets/scdl-authoring-guide/mat-sapphire_enamel.png) | — |
| `diamond` | Diamond | ![diamond](assets/scdl-authoring-guide/mat-diamond.png) | `boostHighlightsToWhite` |
| `sapphire` | Sapphire | ![sapphire](assets/scdl-authoring-guide/mat-sapphire.png) | `deepenLowValuesToBlack` |
| `ruby` | Ruby | ![ruby](assets/scdl-authoring-guide/mat-ruby.png) | `deepenLowValuesToBlack` |
| `emerald` | Emerald | ![emerald](assets/scdl-authoring-guide/mat-emerald.png) | — |
| `amethyst` | Amethyst | ![amethyst](assets/scdl-authoring-guide/mat-amethyst.png) | — |
| `onyx` | Onyx | ![onyx](assets/scdl-authoring-guide/mat-onyx.png) | `deepenLowValuesToBlack` |
| `obsidian` | Obsidian | ![obsidian](assets/scdl-authoring-guide/mat-obsidian.png) | `deepenLowValuesToBlack` |
| `void_core` | Void Core | ![void_core](assets/scdl-authoring-guide/mat-void_core.png) | `deepenLowValuesToBlack` |
| `amethyst_resonance` | Amethyst Resonance | ![amethyst_resonance](assets/scdl-authoring-guide/mat-amethyst_resonance.png) | — |

### Flame (11)

| Material ID | Label | Transmuted orb + anchors | Chromatic rules |
|---|---|---|---|
| `icy_fire` | Icy Fire | ![icy_fire](assets/scdl-authoring-guide/mat-icy_fire.png) | `forceColdHue` `boostHighlightsToWhite` `deepenLowValuesToBlack` `desaturateMidtones` |
| `shadow_fire` | Shadow Fire | ![shadow_fire](assets/scdl-authoring-guide/mat-shadow_fire.png) | `deepenLowValuesToBlack` |
| `holy_fire` | Holy Fire | ![holy_fire](assets/scdl-authoring-guide/mat-holy_fire.png) | `boostHighlightsToWhite` |
| `poison_flame` | Poison Flame | ![poison_flame](assets/scdl-authoring-guide/mat-poison_flame.png) | — |
| `void_ice` | Void Ice | ![void_ice](assets/scdl-authoring-guide/mat-void_ice.png) | `deepenLowValuesToBlack` |
| `cyan_lightning` | Cyan Lightning | ![cyan_lightning](assets/scdl-authoring-guide/mat-cyan_lightning.png) | — |
| `cyan_glow` | Cyan Glow | ![cyan_glow](assets/scdl-authoring-guide/mat-cyan_glow.png) | — |
| `void_rune_glow` | Void Rune Glow | ![void_rune_glow](assets/scdl-authoring-guide/mat-void_rune_glow.png) | — |
| `divine_flame_core` | Divine Flame Core | ![divine_flame_core](assets/scdl-authoring-guide/mat-divine_flame_core.png) | `boostHighlightsToWhite` `forceWarmHue` |
| `radiant_blue` | Radiant Blue | ![radiant_blue](assets/scdl-authoring-guide/mat-radiant_blue.png) | `forceColdHue` |
| `neon_mint_signal` | Neon Mint Signal | ![neon_mint_signal](assets/scdl-authoring-guide/mat-neon_mint_signal.png) | `boostHighlightsToWhite` |

### Organic (25)

| Material ID | Label | Transmuted orb + anchors | Chromatic rules |
|---|---|---|---|
| `bark` | Redwood Bark | ![bark](assets/scdl-authoring-guide/mat-bark.png) | `boostHighlightsToWhite` |
| `pine_needle` | Pine Needle | ![pine_needle](assets/scdl-authoring-guide/mat-pine_needle.png) | `forceColdHue` |
| `skin_light` | Skin Light | ![skin_light](assets/scdl-authoring-guide/mat-skin_light.png) | — |
| `skin_medium` | Skin Medium | ![skin_medium](assets/scdl-authoring-guide/mat-skin_medium.png) | — |
| `skin_dark` | Skin Dark | ![skin_dark](assets/scdl-authoring-guide/mat-skin_dark.png) | — |
| `skin_voidborne` | Skin Voidborne | ![skin_voidborne](assets/scdl-authoring-guide/mat-skin_voidborne.png) | — |
| `hair_black` | Hair Black | ![hair_black](assets/scdl-authoring-guide/mat-hair_black.png) | — |
| `hair_brown` | Hair Brown | ![hair_brown](assets/scdl-authoring-guide/mat-hair_brown.png) | — |
| `hair_blonde` | Hair Blonde | ![hair_blonde](assets/scdl-authoring-guide/mat-hair_blonde.png) | — |
| `hair_red` | Hair Red | ![hair_red](assets/scdl-authoring-guide/mat-hair_red.png) | — |
| `hair_void` | Hair Void | ![hair_void](assets/scdl-authoring-guide/mat-hair_void.png) | — |
| `eye_brown` | Eye Brown | ![eye_brown](assets/scdl-authoring-guide/mat-eye_brown.png) | — |
| `eye_blue` | Eye Blue | ![eye_blue](assets/scdl-authoring-guide/mat-eye_blue.png) | — |
| `eye_green` | Eye Green | ![eye_green](assets/scdl-authoring-guide/mat-eye_green.png) | — |
| `eye_void_glow` | Eye Void Glow | ![eye_void_glow](assets/scdl-authoring-guide/mat-eye_void_glow.png) | `boostHighlightsToWhite` |
| `cloth_linen` | Cloth Linen | ![cloth_linen](assets/scdl-authoring-guide/mat-cloth_linen.png) | — |
| `cloth_wool` | Cloth Wool | ![cloth_wool](assets/scdl-authoring-guide/mat-cloth_wool.png) | — |
| `leather_brown` | Leather Brown | ![leather_brown](assets/scdl-authoring-guide/mat-leather_brown.png) | — |
| `skin_apricot_signal` | Skin Apricot Signal | ![skin_apricot_signal](assets/scdl-authoring-guide/mat-skin_apricot_signal.png) | — |
| `hair_midnight_teal` | Hair Midnight Teal | ![hair_midnight_teal](assets/scdl-authoring-guide/mat-hair_midnight_teal.png) | `forceColdHue` |
| `hair_copper_arcade` | Hair Copper Arcade | ![hair_copper_arcade](assets/scdl-authoring-guide/mat-hair_copper_arcade.png) | — |
| `eye_psychic_cobalt` | Eye Psychic Cobalt | ![eye_psychic_cobalt](assets/scdl-authoring-guide/mat-eye_psychic_cobalt.png) | `boostHighlightsToWhite` |
| `cloth_star_jacket` | Cloth Star Jacket | ![cloth_star_jacket](assets/scdl-authoring-guide/mat-cloth_star_jacket.png) | `forceColdHue` |
| `cloth_psychic_denim` | Cloth Psychic Denim | ![cloth_psychic_denim](assets/scdl-authoring-guide/mat-cloth_psychic_denim.png) | — |
| `slime_gel` | Slime Gel | ![slime_gel](assets/scdl-authoring-guide/mat-slime_gel.png) | — |

Aliases: `resolveMaterialId` does exact-match only — there are no fuzzy
aliases. `black_steel` and `blacksteel` are two distinct registry entries;
pick the one your neighboring assets already use.

---

## 7. Effect Catalog

Effects in SCDL are declarative hints carried on the part — the compiler
never fakes them into pixels.

### 7.1 `glow radius N`

Attaches a `PB-NOISE-v1` glow descriptor to the part (`radius` becomes
`amplitude`). Renderers that honor PB-NOISE bloom the part's cells; exporters
that don't (SVG/PNG/phaser today) simply carry the geometry. Real emitted
descriptor for `glow radius 2`:

```json
{
  "contract": "PB-NOISE-v1",
  "version": "1.0.0",
  "id": "scdl_glow_gem",
  "type": "glow",
  "seed": 0,
  "octaves": 1,
  "lacunarity": 2,
  "gain": 0.5,
  "frequency": 0.1,
  "amplitude": 2,
  "outputRange": [0, 1],
  "_scdlHint": true
}
```

Pair `glow` with an emissive-reading material (`cyan_glow`, `void_rune_glow`,
`eye_void_glow`, `divine_flame_core`) so SemQuant can bind the effect — a
glow with no material binding draws a `PB-SEM-003` warning.

### 7.2 Material chromatic rules

Each registry material carries rule flags. Today only `passthrough` changes
compile-adjacent behavior (it disables transmutation — `source` only); the
rest are declarative intent for shader/render passes:

| Rule | Declared intent |
|---|---|
| `passthrough` | never transmute; authored colors are final (`source` only) |
| `preserveAlpha` / `preserveShape` | transmutation may recolor only — universal, on every material |
| `boostHighlightsToWhite` | highlights should blow out to white-hot (gold, diamond, holy/divine) |
| `deepenLowValuesToBlack` | shadows should crush to black (steels, void materials, onyx) |
| `forceColdHue` | hue-locks cold (icy_fire, void_ice, sapphire, eye_blue) |
| `forceWarmHue` | hue-locks warm (poison_flame) |
| `desaturateMidtones` | midtones grey out (icy_fire) |

### 7.3 Sphere lighting

`sphere … light lx ly` is the one *rasterized* lighting effect (§4.9). Keep
one light direction per asset — the acolyte uses `light -1 -1` on both the
orb and the face so the whole sprite reads as lit from the upper-left — and
keep pinned highlight parts (§4.10) on the same side.

### 7.4 SemQuant effect diagnostics

The semantic pass audits effects and emits `PB-SEM-*` diagnostics:
`PB-SEM-003` (effect without material binding, WARN) and `PB-SEM-004`
(effect targeting an invalid part/role, ERROR) are the two that fire on
authoring mistakes.

---

## 8. Export Targets

| Target | Output | Notes |
|---|---|---|
| `json` | `PixelBrainAssetPacket` JSON | canonical; add `--semantic` for SemQuant annotations |
| `svg` | one `<rect>` per pixel, `crispEdges` | deduped, last write wins |
| `phaser` | `scdl-phaser-v1` texture config | colors as `r<<16\|g<<8\|b` ints for `fillStyle` |
| `png` | deterministic RGBA PNG, 1px per cell | transparent background |
| `aseprite` | binary via `aseprite-binary-codec` | one payload frame per packet; parts become layers |

Raster previews are never a source of truth — canonical state is the packet
(and for animation, the frameloop manifest).

---

## 9. Error Quick Reference

`compileSCDL()` never throws; read the `errors` array. Full bytecode layout
in the white paper §6.

| Code | Severity | Trigger |
|---|---|---|
| SCDL-001 | ERROR | unknown op verb / keyword |
| SCDL-002 | ERROR | missing `asset` header |
| SCDL-003 | ERROR | malformed canvas size |
| SCDL-004 | ERROR | hex literal not `#RRGGBB` |
| SCDL-005 | WARN | unknown material → falls back to `source` |
| SCDL-006 | ERROR | undefined palette alias |
| SCDL-007 | ERROR | `cell` outside canvas bounds |
| SCDL-008 | INFO | trace intent preserved for runtime |
| SCDL-009 | ERROR | duplicate part ID |
| SCDL-010 | WARN | unknown export target (ignored) |
| SCDL-011 | ERROR | invalid vector op parameters |
| SCDL-012 | ERROR | frame targets unknown part ID |
| SCDL-013 | ERROR | Frame Index Law violation |
| SCDL-014 | ERROR | `after` anchor missing on add / present on replacement |
| SCDL-015 | WARN | frame identical to base (dead frame) |

---

## 10. Authoring Playbook

Distilled from the fixtures that shipped:

1. **Name palette entries by role, not color** — `hoodhi`, `robeshade`,
   `orbrim`, `glint`. When you re-tint, only the hex changes.
2. **Prefer `sphere` to hand-shaded `cell` grids.** `slime.scdl` is 316 cell
   lines; `slime-sphere.scdl` is one `sphere` op with identical structure.
3. **Order parts like a painter.** Staff → body → belt → hood → face → eyes.
   Comment the intent (`# staff first: body paints over it where they meet`).
4. **Symmetry for structure, never for light.** Mirror limbs and eyes;
   hand-place highlights on the lit side.
5. **Run `check` before `compile`** and treat SCDL-005 as a failure — a part
   silently tagged `source` won't transmute or bind effects downstream.
6. **Animate by delta.** If a frame block only restates the base part
   verbatim, delete it — the compiler will tell you (`SCDL-015`).
7. **Never edit generated outputs** (`-json.json`, `-frameloop.json`,
   `-png.png`). Change the `.scdl` and recompile; the Export Naming Law makes
   output paths predictable for scripts.
8. **Fractional centers for even canvases** — `15.5` centers on a 32-wide
   canvas; integer centers on odd-width ones.

---

*Assets in `assets/scdl-authoring-guide/` are regenerable: every image is the
compiled output of the SCDL shown beside it (op demos) or of the repo fixtures
(`slime-sphere.scdl`, `void_acolyte.scdl`); material tiles are the registry's
transmutation of a neutral grayscale sphere. If the compiler or registry
changes behavior, regenerate rather than hand-edit.*
