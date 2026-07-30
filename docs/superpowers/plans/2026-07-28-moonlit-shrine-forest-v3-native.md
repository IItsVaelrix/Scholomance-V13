# Moonlit Shrine Forest v3 Native Language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the dense moonlit skeleton and rebuild `moonlit-shrine-forest` as embryonic SCDL + material bark texture + short Wand accents (fence/torii/moon only).

**Architecture:** SCDL provides sparse silhouettes and registered materials. Wand provides gold fence bonding, cyan torii contours, moon ring, and optional invisible `grain.*` trunk spines. Rasterizer evaluates `bark`/`pine_needle`/`voidbark` grain and skips drawing `grain.*` strokes.

**Tech Stack:** SCDL CLI, `scripts/propagate-moonlit-wand.mjs`, `scripts/wand-vixel-pipeline.mjs`, `PolarisOS/scripts/vixel-rasterize.mjs`

## Global Constraints

- Canvas 160×90 → 4× evidence
- Asset id stays `moonlit-shrine-forest`
- Trees = material texture; no visible tree gold filigree
- Visible Wand only: fence gold, torii cyan, moon ring
- Gene `WAND_CHEMICAL_STROKE_PROPAGATION` = fence offset bonding only
- Registered materials only (`bark`, `pine_needle`, `voidbark`, `obsidian`, `sapphire`, `cyan_glow`, `diamond`, `astralmoss`, `source`)
- Do not commit unless the owner asks

---

### Task 1: Embryonic SCDL rewrite

**Files:**
- Modify: `PolarisOS/worldpacks/shrine-demo/scdl/moonlit-shrine-forest.scdl` (full rewrite)
- Produce: `PolarisOS/worldpacks/shrine-demo/scdl/moonlit-shrine-forest-json.json` via compile

**Interfaces:**
- Consumes: SCDL primitives (`rect`, `polygon`, `circle`, `ellipse`) + material registry ids
- Produces: compiled packet with parts matching §2 of the v3 spec

- [ ] **Step 1: Replace SCDL with embryonic scene**

Write a new `moonlit-shrine-forest.scdl` with painter-order parts from the v3 spec:
`sky_void` → `moon_body` → `distant_canopy` → `shrine_torii` → `shrine_stairs` → `path_ribbon` → `foliage_masses` → `tree_left` / `tree_right` → `fence_planks`.

Use sparse polygons/circles only (no hand-cell grids). Trees are thick trunk + canopy masses in `bark`/`voidbark`.

- [ ] **Step 2: Compile**

```bash
node codex/core/pixelbrain/scdl/scdl.cli.js compile \
  PolarisOS/worldpacks/shrine-demo/scdl/moonlit-shrine-forest.scdl \
  --export json --out PolarisOS/worldpacks/shrine-demo/scdl/moonlit-shrine-forest-json.json
```

Expected: exit 0, no unknown-material warnings.

---

### Task 2: Wand propagator + rasterizer grain

**Files:**
- Modify: `scripts/propagate-moonlit-wand.mjs` (full rewrite of seeds)
- Modify: `PolarisOS/scripts/vixel-rasterize.mjs` (`MATERIAL_GRAIN` + stroke loop)
- Produce: `PolarisOS/worldpacks/shrine-demo/wand/moonlit-shrine-forest.wand.json`

**Interfaces:**
- Consumes: stroke/edge/parametric helpers already in propagator
- Produces: ≤12 formulas; roles `moonlit.fence_*`, `moonlit.torii_*`, `moonlit.moon_halo_ring`, optional `grain.tree_left` / `grain.tree_right`

- [ ] **Step 1: Rewrite propagator**

Remove all `bifurcate` tree/canopy seeds. Emit:

1. Fence strut A/B + cross (gold mathematical_stroke; offset bonding = the three related strokes)
2. Torii lintel + two pillars (thin cyan strokes)
3. Moon parametric circle
4. Optional: `grain.tree_left` / `grain.tree_right` vertical spines, `pressure` ≤ 0.25

- [ ] **Step 2: Rasterizer MATERIAL_GRAIN**

Add entries (mirror `oak_bark` / organic feel):

```js
bark:        { direction: 0, frequency: 0.28, crossFrequency: 0.07, amplitude: 0.55 },
pine_needle: { direction: Math.PI/5, frequency: 0.35, crossFrequency: 0.09, amplitude: 0.4 },
voidbark:    { direction: 0, frequency: 0.22, crossFrequency: 0.05, amplitude: 0.45 },
astralmoss:  { direction: Math.PI/3, frequency: 0.2, crossFrequency: 0.08, amplitude: 0.3 },
```

- [ ] **Step 3: Skip-draw `grain.*`**

In `renderVixel` vector stroke loop, `continue` when `path.role` starts with `grain.`. Still load those paths into fusion via wand-vixel-pipeline (no change there).

Also tint torii roles cyan when role includes `torii` (optional but matches accents).

- [ ] **Step 4: Regenerate Wand JSON**

```bash
node scripts/propagate-moonlit-wand.mjs
```

Expected: formula count ~8–12, zero tree bifurcate roles.

---

### Task 3: Pipeline + 4× evidence

**Files:**
- Produce: `PolarisOS/evidence/vixel-moonlit-shrine-forest-4x.png`
- Produce: `PolarisOS/evidence/pixel-moonlit-shrine-forest-4x.png`

- [ ] **Step 1: Wand–Vixel pipeline**

```bash
node scripts/wand-vixel-pipeline.mjs moonlit-shrine-forest
```

Expected: determinism PASS; trees not dominating vectorSource with bifurcate roles.

- [ ] **Step 2: Rasterize**

```bash
node PolarisOS/scripts/vixel-rasterize.mjs moonlit-shrine-forest 4
```

Expected: ablation diff > 5%; deterministic PASS; visual check — bark grain on trunks, gold only on fence, cyan on torii, moon ring.

- [ ] **Step 3: Visual accept**

Open both evidence PNGs. Fail if gold spaghetti on trees.

---

## Spec coverage

| Spec requirement | Task |
|---|---|
| Delete dense skeleton / rewrite SCDL | 1 |
| Embryonic parts + registered materials | 1 |
| MATERIAL_GRAIN for bark family | 2 |
| Fence/torii/moon Wand only | 2 |
| Invisible `grain.*` + skip-draw | 2 |
| Pipeline + rasterize + pass bar | 3 |
| No commits unless asked | Global |
