# Moonlit Shrine Forest Scene — Vixel Design Specification

**Date:** 2026-07-28  
**Asset Name:** `moonlit-shrine-forest`  
**Canvas Resolution:** \(160\times90\)  
**Output Resolution:** \(640\times360\) (at \(4\times\) Vixel scale)  
**Pipeline:** Wand Vector Superposition + SCDL Symbolic Scene Graph + Native Vixel Texture Engine  

---

## 1. Overview & Conceptual Intent

Replicate and elevate the **Moonlit Mystical Shrine Forest Scene** (`ChatGPT Image Jul 28, 2026, 12_36_31 PM.png`) using the PolarisOS Vixel Pipeline.

The scene features a moonlit forest glade framed by giant ancient trees, with a winding earth path leading up a stone staircase to a distant glowing Torii shrine gate under a full moon. Golden vector line-art filigree wraps the framing tree trunks and fallen wooden fence, superposing continuous vector curves over pixel-art lattice materials.

---

## 2. Color Palette System

| Swatch | Hex Code | Material | Role |
| :--- | :--- | :--- | :--- |
| `void_night` | `#060A14` | `obsidian` | Deep night sky base void |
| `midnight_navy` | `#121B2D` | `obsidian` | Distant mountain / canopy silhouettes |
| `moonlight_blue` | `#243656` | `sapphire` | Midground forest fog / haze |
| `cosmic_mist` | `#4B6FA8` | `void_rune_glow` | Moonlit light shaft atmosphere |
| `pale_moonlight` | `#9BB8D8` | `moonstone` | Moon halo & highlights |
| `stardust_white` | `#FFF8E7` | `diamond` | Moon core & firefly sparkles |
| `deep_shadow` | `#0A120B` | `oak_bark` | Deep forest shadow |
| `pine_dark` | `#142417` | `oak_bark` | Dark tree bark & canopy shadow |
| `moss_green` | `#243D2A` | `oak_bark` | Midground foliage & grass |
| `leaf_green` | `#3D6345` | `oak_bark` | Moonlit leaf highlights |
| `pale_leaf` | `#709977` | `oak_bark` | Bright leaf tips & highlights |
| `mud_brown` | `#26201B` | `leather` | Earth path shadow |
| `earth_brown` | `#4E4238` | `leather` | Dirt path surface |
| `stone_gray` | `#8A7866` | `steel` | Shrine stairs & rocks |
| `path_light` | `#D4C4AE` | `sand` | Moonlit path highlight |
| `bright_gold` | `#D4AF37` | `gold` | Tree filigree & fence vector lines |
| `flare_gold` | `#E6AA4E` | `gold` | Fence highlight & lantern glow |
| `cyan_glow` | `#80FFFF` | `source` | Ethereal Torii shrine gate glow |

---

## 3. Layer & Geometry Assembly (`moonlit-shrine-forest.scdl`)

Painter-order layer hierarchy (back to front):

1. **`sky_and_moon`**: Night sky gradient void, full moon at `(105, 18)` radius 7, lunar atmosphere halo.
2. **`distant_mountains_and_canopy`**: Layered mountain peak silhouettes and soft distant forest canopy.
3. **`shrine_and_stairs`**: Torii shrine gate (`rect`/`polygon` at `x=98..112`, `y=28..38`), stone stairs (`x=95..115`, `y=38..52`), stone lanterns (`x=90`, `x=120`, `y=44`).
4. **`winding_path_and_foliage`**: Winding moonlit dirt/stone path (`polygon` curving from `(70,90)` to `(105,50)`), ground moss, rocks, and grass tufts.
5. **`foreground_trees_and_fence`**:
   * **Left Tree:** Thick ancient trunk (`x=8..28`, `y=0..90`) with sweeping diagonal branch (`x=20..50`, `y=20..40`).
   * **Right Tree:** Straight framing trunk (`x=130..152`, `y=0..90`).
   * **Fallen Wooden Fence:** Interlocking fallen planks in bottom-left (`x=10..48`, `y=65..85`).

---

## 4. Wand Vector Formulas (`moonlit-shrine-forest.wand.json`)

1. **`tree_left_filigree` (`edge_trace`):** Traces outer contour and major branch split of left ancient tree in bright gold (`#D4AF37`).
2. **`tree_right_filigree` (`edge_trace`):** Traces right framing trunk contour in bright gold (`#D4AF37`).
3. **`fallen_fence_structure` (`edge_trace`):** Traces geometry of fallen wooden cross/fence planks in flare gold (`#E6AA4E`).
4. **`torii_gate_contour` (`parametric_curve` & `edge_trace`):** Traces Torii gate roof beam and pillars in radiant cyan (`#80FFFF`).
5. **`moon_halo_ring` (`parametric_curve`):** Smooth circular vector ring around full moon at `(105, 18)` radius 7.5.

---

## 5. Verification & Acceptance Criteria

* **Pipeline Commands:**
  ```bash
  node codex/core/pixelbrain/scdl/scdl.cli.js compile PolarisOS/worldpacks/shrine-demo/scdl/moonlit-shrine-forest.scdl --export json --out PolarisOS/worldpacks/shrine-demo/scdl/moonlit-shrine-forest-json.json
  node scripts/wand-vixel-pipeline.mjs moonlit-shrine-forest
  node PolarisOS/scripts/vixel-rasterize.mjs moonlit-shrine-forest 4
  ```
* **Ablation A/B Test:** `vixel-moonlit-shrine-forest-4x.png` and `pixel-moonlit-shrine-forest-4x.png` must pass with `diff > 5%`.
* **Determinism Test:** 100% byte-identical hash across consecutive runs.
* **Vitest Suite:** All 46 Vitest integration tests passing.
