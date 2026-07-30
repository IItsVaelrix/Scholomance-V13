# Design: Moonlit Shrine Forest Vixel v3 (Native Language)

**Date:** 2026-07-28  
**Status:** owner-approved (Approach 1; design §§1–4)  
**Asset:** `moonlit-shrine-forest` — 160×90 → 4× (640×360)  
**Gene:** `WAND_CHEMICAL_STROKE_PROPAGATION` — fence bonding only (not trees)

## Intent

Translate the reference’s **scene grammar** (night frame → winding path → stairs → cyan torii under moon, flanked by ancient trunks and a fallen fence) into native Vixel language:

- **SCDL** = embryonic silhouettes + registered materials (craft)
- **Wand** = short visible accents + optional invisible grain guides (art instrument)
- **Trees** = bark **texture** via materials / Native Vixel Texture Engine — **not** gold stroke filigree

This replaces the prior dense hand-cell skeleton and chemical trunk-spaghetti unfold (v1/v2).

## Decisions locked

| Topic | Choice |
|---|---|
| Fidelity | **B** — full scene grammar, sparse craft |
| Approach | **1** — embryonic SCDL + material grain |
| Tree treatment | Material texture; no visible tree line-work |
| Visible vectors | **B** — torii cyan + moon ring + fence gold only |

## Delete / rewrite in place

Same asset id. Wipe and rewrite:

- Dense illustration-style `moonlit-shrine-forest.scdl`
- Tree/canopy chemical bifurcate formulas in Wand + propagator seeds
- Regenerated compiled packet and 4× evidence after rewrite

Keep: canvas 160×90, shrine-demo paths, Wand→Vixel→Feel→rasterize chain.

## SCDL craft (embryonic scene graph)

Painter order; sparse `ellipse` / `polygon` / `rect` only; named palette swatches; **registered materials only**.

| Part | Material | Role |
|---|---|---|
| `sky_void` | `obsidian` | Full-canvas night plate |
| `moon_body` | `sapphire` + pale core (`diamond` / `source`) | Disc + soft halo |
| `distant_canopy` | `sapphire` | Soft mountain/canopy blobs |
| `shrine_torii` | `cyan_glow` | Gate silhouette |
| `shrine_stairs` | `obsidian` (mid values) | Short step stack |
| `path_ribbon` | `bark` (warm body tones) | Winding path to stairs |
| `foliage_masses` | `pine_needle` / `astralmoss` | Side moss clumps |
| `tree_left` / `tree_right` | `bark` + `voidbark` shadow edge | Trunk/canopy masses (texture here) |
| `fence_planks` | `bark` | 2–3 plank polygons |

**Rasterizer gap:** `MATERIAL_GRAIN` today knows `oak_bark` but not `bark` / `pine_needle` / `voidbark`. Add grain entries for those registry ids so trunk texture actually evaluates.

## Wand accents

### Visible (~8–12 formulas total)

- Fence: `fence_strut_a`, `fence_strut_b`, `fence_cross` — gold strokes; chemical **offset bonding** only here
- Torii: `torii_lintel`, `torii_pillar_l`, `torii_pillar_r` — thin cyan contours
- Moon: `moon_halo_ring` — `parametric_curve` circle

### Invisible grain guides

- One low-pressure vertical spine per trunk (`pressure` ≤ 0.25), role prefix `grain.*`
- Used for fusion nearest-path / grain flow axis only
- Rasterizer **skips stroke draw** for `grain.*` roles (no bright filigree)

### Hard bans

- No chemical bifurcate unfold on trees/canopy
- No gold edge traces on bark masses
- Propagator rewritten to emit fence/torii/moon (+ optional grain spines) only

## Verification

```bash
node codex/core/pixelbrain/scdl/scdl.cli.js compile \
  PolarisOS/worldpacks/shrine-demo/scdl/moonlit-shrine-forest.scdl \
  --export json --out PolarisOS/worldpacks/shrine-demo/scdl/moonlit-shrine-forest-json.json
node scripts/propagate-moonlit-wand.mjs
node scripts/wand-vixel-pipeline.mjs moonlit-shrine-forest
node PolarisOS/scripts/vixel-rasterize.mjs moonlit-shrine-forest 4
```

### Pass bar

- Scene grammar readable at 4×: path → stairs → torii under moon; textured trunks; fence
- Trees show material grain, not gold spaghetti
- Visible vectors only on fence / torii / moon
- Ablation: vixel vs pixel differ on accents (not tree filigree)
- Deterministic `vixelHash` / `feelHash`

### Out of scope

- Art-gene surface pass (Approach 2)
- Dense chemical canopy
- Pixel-for-pixel match to the ChatGPT reference

## Files touched (implementation)

- `PolarisOS/worldpacks/shrine-demo/scdl/moonlit-shrine-forest.scdl` (rewrite)
- `PolarisOS/worldpacks/shrine-demo/scdl/moonlit-shrine-forest-json.json` (recompile)
- `scripts/propagate-moonlit-wand.mjs` (rewrite)
- `PolarisOS/worldpacks/shrine-demo/wand/moonlit-shrine-forest.wand.json` (regen)
- `PolarisOS/scripts/vixel-rasterize.mjs` (`MATERIAL_GRAIN` + `grain.*` skip-draw)
- `PolarisOS/evidence/*moonlit-shrine-forest-4x.png` (regen)
- This spec supersedes v2 design for implementation intent; leave v1/v2 docs as history
