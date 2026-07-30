# Design: Moonlit Shrine Forest Vixel v2

**Date:** 2026-07-28  
**Status:** owner-approved Approach 1  
**Gene:** `WAND_CHEMICAL_STROKE_PROPAGATION`  
**Asset:** `moonlit-shrine-forest` — 160×90 → 4× (640×360)

## Approach

Law-first Wand propagation + denser SCDL craft. No param jitter / score-and-pick.

## SCDL layers

1. sky_and_moon  
2. distant_mountains_and_canopy  
3. shrine_and_stairs  
4. winding_path_and_foliage  
5. foreground_trees_and_fence  

## Wand chemical seeds → unfolded formulas

- Trunk spines → recursive bifurcate (mirror/scale) → filigree  
- Fence strut → offset bonding → cross planks  
- Torii → path/ring cyan contour  
- Moon → parametric circle + halo harmonics  

## Verification

```bash
# compile SCDL → json packet
# wand-vixel-pipeline moonlit-shrine-forest
# vixel-rasterize moonlit-shrine-forest 4
```
