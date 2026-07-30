# Celestial Sword Recreation — Vixel Pipeline Design Specification

**Date:** 2026-07-28  
**Asset Name:** `celestial-sword`  
**Canvas Resolution:** \(32\times128\)  
**Output Resolution:** \(128\times512\) (at \(4\times\) Vixel scale)  
**Pipeline:** Wand Vector Superposition + SCDL Symbolic Scene Graph + SCDNA Art Gene Compiler + Perceptual Quality Trio  

---

## 1. Overview & Conceptual Intent

Recreate the **Celestial Sword** (`0cd89f9a-b8d7-495d-aafd-6d4ca3140205.png`) using the upgraded PolarisOS Vixel Pipeline.

The asset incorporates:
- Mathematically symmetrical \(32\times128\) SCDL asset assembly
- Stepped cyan core width modulation
- Dark steel ricasso socket mask at hilt junction
- Native Vixel Texture Engine (multi-octave vector harmonic interferometry)
- Sub-cell signed distance field anti-aliasing (zero edge checkering)
- Perceptual Quality Trio validation (`visual-weight-field.js`, `phenotype-fidelity.js`)

---

## 2. Color Palette System & SCDNA Art Genes

| Swatch | Hex Code | Material | Role |
| :--- | :--- | :--- | :--- |
| `stardust_white` | `#FFF8E7` | `diamond` | Core plasma peak & spark |
| `cyan_glow` | `#80FFFF` | `source` | Stepped internal stellar plasma |
| `bright_gold` | `#D4AF37` | `gold` | Guardian wings & contour filigree |
| `flare_gold` | `#E6AA4E` | `gold` | Guardian eye flare & pommel ring |
| `shell_blue` | `#5B86B6` | `sapphire` | Outer structural blade edge |
| `deep_violet` | `#2A1B4E` | `darksteel` | Ricasso socket & darksteel grip |
| `shadow_black` | `#120E1E` | `obsidian` | Pommel void core |

---

## 3. Structural Layer Assembly (`celestial-sword.scdl`)

Painter-order layer hierarchy across central axis \(x=16.0\):

1. **`blade_inner`**: Stepped cyan core glow (`fuller_glow`): tip (1 cell), upper (3 cells), middle (4 cells), lower (3 cells), termination (1 cell above ricasso socket).
2. **`blade_edge`**: Blue structural shell (`shell_blue`), mathematically symmetrical across \(x=16.0\).
3. **`blade_rim`**: Hard, cell-snapped gold outer trim (`bright_gold`).
4. **`ricasso`**: Dark steel socket (`deep_violet`) at \(y=90..96\) with bright gold collar trim (`#D4AF37`).
5. **`guard`**: Guardian cross wings at \(y=92..97\) extending from \(x=1\) to \(x=31\), outer tips reinforced with +1 vertical cell.
6. **`handle` & `pommel`**: Darksteel grip at \(y=98..116\) and Pommel of Origin star ring at \(y=117..125\).

---

## 4. Wand Vector Stroke Formulas (`celestial-sword.wand.json`)

1. **`celestial-sword.blade_contour` (`edge_trace`):** Golden edge filigree (`#D4AF37`).
2. **`celestial-sword.guardian_wings` (`edge_trace`):** Guardian crosswing contour (`#D4AF37`).
3. **`celestial-sword.guardian_eye` (`edge_trace`):** Guardian eye diamond outline (`#E6AA4E`).
4. **`celestial-sword.stellar_lattice` (`parametric_curve`):** Central cyan core lightning beam (`#80FFFF`).
5. **`celestial-sword.pommel_origin_ring` (`parametric_curve`):** Circular pommel ring (`#D4AF37`).

---

## 5. Pipeline Commands & Verification Criteria

* **Pipeline Commands:**
  ```bash
  node codex/core/pixelbrain/scdl/scdl.cli.js compile PolarisOS/worldpacks/shrine-demo/scdl/celestial-sword.scdl --export json --out PolarisOS/worldpacks/shrine-demo/scdl/celestial-sword-json.json
  node scripts/wand-vixel-pipeline.mjs celestial-sword
  node PolarisOS/scripts/vixel-rasterize.mjs celestial-sword 4
  ```
* **Perceptual Quality Score:** Spatial Awareness \(\ge 0.65\), Texture-Form Coherence \(\ge 0.60\).
* **Determinism Test:** 100% byte-identical hash across consecutive runs.
* **Vitest Suite:** All 46 Vitest integration tests passing.
