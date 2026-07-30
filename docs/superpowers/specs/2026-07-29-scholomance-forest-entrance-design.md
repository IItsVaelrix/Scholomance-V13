# Design Specification: Scholomance Forest Entrance

**Date:** 2026-07-29  
**Status:** Approved  
**Asset ID:** `scholomance-forest-entrance`  
**Canvas:** 160×90 → 4× (640×360)  
**Reference Image:** [ChatGPT Image Jul 29, 2026, 12_36_02 AM.png](file:///home/deck/Downloads/Scholomance-V12-main/PolarisOS/evidence/ChatGPT%20Image%20Jul%2029,%202026,%2012_36_02%20AM.png)

---

## 1. Intent & Scene Composition

Recreate the official **Scholomance Academy Forest Entrance** scene using native Vixel material textures, dual-lighting field physics, and Wand vector superposition.

### Core Visual Elements

1. **Left Framing Structure**:
   - Gnarled ancient tree trunk (`bark` material) with climbing vines (`astralmoss`).
   - Wooden signpost attached to tree reading `Scholomance: Knowledge, Discipline, Creation`.
   - Hanging purple banner (`banner_purple`) displaying the golden Scholomance 'S' emblem (`banner_gold`).
   - Stone altar (`stone_mid`) holding an open glowing spellbook emitting purple arcane light (`arcane_purple` / `source`).

2. **Center Path & Distant Horizon**:
   - Winding cobblestone trail (`path_stone` / `path_earth`) flowing from foreground bottom-center toward center horizon.
   - Standing rune monoliths (`stone_dark`) flanked along the path with glowing cyan glyphs (`cyan_hi`).
   - Distant sunlit golden Scholomance Citadel spire (`citadel_gold` / `sun_haze`) framed by top canopy gap.

3. **Right Framing Structure**:
   - Ancient oak trunk (`bark`) with hanging iron chain (`darksteel`) holding an arcane purple lantern (`holy_fire`).
   - Hanging purple banner (`banner_purple`) with 'S' emblem.
   - Winding brook / stream (`stream_blue` / `stream_foam`) flowing over mossy rocks with purple crystal clusters (`crystal_purple`).

---

## 2. Dual Lighting Field Physics

- **Background Sunbeam Field**: Directional golden falloff $I_{\text{sun}}(x,y,z)$ centered at $(x=80, y=10)$ illuminating the upper canopy gap and citadel spires.
- **Foreground Arcane Field**: Point-light radial falloff $I_{\text{arcane}}(x,y,z)$ centered at the open spellbook $(x=27, y=72)$ and lantern $(x=120, y=24)$, shifting nearby foliage and stone values toward purple/magenta specular steps.

---

## 3. Wand Vector Formulas

1. `scholomance.sign_border`: Gold line border framing the wooden sign.
2. `scholomance.banner_left_emblem`: Gold 'S' emblem on the left banner.
3. `scholomance.banner_right_emblem`: Gold 'S' emblem on the right banner.
4. `scholomance.book_pages`: Arcane purple/gold open page vector contours.
5. `scholomance.lantern_chain`: Chain link vector segments holding the right lantern.
6. `scholomance.rune_glyphs`: Cyan vector rune marks on standing stones.
7. `scholomance.path_borders`: Warm gold specular path border vectors.

---

## 4. Verification & Pass Criteria

- SCDL compiles cleanly to JSON via `scdl.cli.js`.
- Wand formulas propagate via `scripts/propagate-scholomance-wand.mjs`.
- Vixel rasterization builds 4× PNG artifacts at `PolarisOS/evidence/vixel-scholomance-forest-entrance-4x.png`.
- 100% deterministic hash match across runs.
