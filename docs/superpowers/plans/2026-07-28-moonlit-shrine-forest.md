# Moonlit Shrine Forest Scene Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a \(160\times90\) Moonlit Shrine Forest Vixel scene (`moonlit-shrine-forest`) based on `ChatGPT Image Jul 28, 2026, 12_36_31 PM.png`, using the SCDL scene graph, Wand vector superposition, and Native Vixel Texture Engine.

**Architecture:** Author a 5-layer SCDL symbolic scene graph asset (`moonlit-shrine-forest.scdl`), pair it with a 5-formula Wand vector definition (`moonlit-shrine-forest.wand.json`), and run end-to-end Vixel rasterization at \(4\times\) scale (\(640\times360\) PNG output).

**Tech Stack:** SCDL Parser/Compiler (`scdl.cli.js`), Wand Formula Evaluator (`formula-to-coordinates.js`), Vixel Fusion Pipeline (`wand-vixel-pipeline.mjs`), Native Vixel Rasterizer (`vixel-rasterize.mjs`), Vitest.

## Global Constraints

- **Canvas Size:** Exactly \(160\times90\) lattice cells
- **Export Scale:** \(4\times\) rendering scale producing \(640\times360\) RGBA PNG
- **Output Paths:**
  - SCDL Source: `PolarisOS/worldpacks/shrine-demo/scdl/moonlit-shrine-forest.scdl`
  - JSON Packet: `PolarisOS/worldpacks/shrine-demo/scdl/moonlit-shrine-forest-json.json`
  - Wand Definition: `PolarisOS/worldpacks/shrine-demo/wand/moonlit-shrine-forest.wand.json`
  - Vixel PNG Output: `PolarisOS/evidence/vixel-moonlit-shrine-forest-4x.png`
  - Pixel PNG Output: `PolarisOS/evidence/pixel-moonlit-shrine-forest-4x.png`

---

### Task 1: Author SCDL Scene Graph (`moonlit-shrine-forest.scdl`)

**Files:**
- Create: `PolarisOS/worldpacks/shrine-demo/scdl/moonlit-shrine-forest.scdl`

**Interfaces:**
- Produces: `pbasset_moonlit_shrine_forest` JSON packet upon compilation via `scdl.cli.js`.

- [ ] **Step 1: Write `moonlit-shrine-forest.scdl`**

Write the complete 5-layer SCDL source file:
```scdl
# Moonlit Shrine Forest — Vixel Scene Architecture (160x90)
asset moonlit_shrine_forest canvas 160x90

palette {
  void_night      = #060A14
  midnight_navy   = #121B2D
  moonlight_blue  = #243656
  cosmic_mist     = #4B6FA8
  pale_moonlight  = #9BB8D8
  stardust_white  = #FFF8E7
  deep_shadow     = #0A120B
  pine_dark       = #142417
  moss_green      = #243D2A
  leaf_green      = #3D6345
  pale_leaf       = #709977
  mud_brown       = #26201B
  earth_brown     = #4E4238
  stone_gray      = #8A7866
  path_light      = #D4C4AE
  bright_gold     = #D4AF37
  flare_gold      = #E6AA4E
  cyan_glow       = #80FFFF
}

# 1. Layer 1: Sky & Full Moon
part sky material obsidian {
  rect 0 0 160 90 void_night
  polygon 0 0 160 0 160 45 0 35 midnight_navy
}

part moon material moonstone {
  circle 105 18 radius 9 pale_moonlight
  circle 105 18 radius 7 stardust_white
}

# 2. Layer 2: Distant Mountains & Forest Canopy
part distant_mountains material obsidian {
  polygon 0 35 30 20 70 30 110 15 160 25 160 55 0 55 midnight_navy
  polygon 10 40 45 28 85 38 125 22 160 32 160 60 0 60 moonlight_blue
}

# 3. Layer 3: Distant Torii Shrine Gate & Stone Stairs
part shrine_gate material source {
  rect 98 28 14 2 cyan_glow
  polygon 96 26 114 26 112 28 98 28 cyan_glow
  rect 100 28 2 12 cyan_glow
  rect 108 28 2 12 cyan_glow
  rect 100 32 10 1 cyan_glow
  polygon 104 33 106 33 105 35 cyan_glow
}

part shrine_stairs material steel {
  rect 96 38 18 2 stone_gray
  rect 94 40 22 2 stone_gray
  rect 92 42 26 2 stone_gray
  rect 90 44 30 2 stone_gray
  rect 88 46 34 2 stone_gray
  rect 86 48 38 2 stone_gray
  rect 84 50 42 2 stone_gray
  circle 88 43 radius 2 stone_gray
  circle 88 43 radius 1 stardust_white
  circle 122 43 radius 2 stone_gray
  circle 122 43 radius 1 stardust_white
}

# 4. Layer 4: Winding Earth Path & Ground Foliage
part winding_path material leather {
  polygon 84 52 126 52 110 65 75 75 95 90 60 90 60 78 85 62 earth_brown
  polygon 88 52 122 52 106 65 72 75 90 90 68 90 65 78 88 62 path_light
}

part ground_foliage material oak_bark {
  polygon 0 55 84 52 60 78 0 85 pine_dark
  polygon 126 52 160 55 160 90 95 90 moss_green
  rect 0 80 60 10 deep_shadow
  rect 0 85 160 5 deep_shadow
}

# 5. Layer 5: Ancient Framing Trees & Fallen Wooden Fence
part tree_left material oak_bark {
  polygon 0 0 25 0 28 50 20 90 0 90 pine_dark
  polygon 20 30 52 15 48 20 22 35 pine_dark
  polygon 15 45 42 32 40 36 17 48 moss_green
}

part tree_right material oak_bark {
  polygon 135 0 160 0 160 90 128 90 pine_dark
  polygon 138 25 115 15 118 12 142 22 moss_green
}

part fallen_fence material leather {
  polygon 8 72 42 62 44 67 10 77 mud_brown
  polygon 22 55 35 88 30 89 17 56 earth_brown
  circle 26 71 radius 1.5 flare_gold
}
```

- [ ] **Step 2: Compile SCDL source to JSON packet**

Run: `node codex/core/pixelbrain/scdl/scdl.cli.js compile PolarisOS/worldpacks/shrine-demo/scdl/moonlit-shrine-forest.scdl --export json --out PolarisOS/worldpacks/shrine-demo/scdl/moonlit-shrine-forest-json.json`
Expected: `[SCDL] Done. Packet ID: pbasset_...` written to `moonlit-shrine-forest-json.json`.

- [ ] **Step 3: Commit**

Run: `git add PolarisOS/worldpacks/shrine-demo/scdl/moonlit-shrine-forest.scdl PolarisOS/worldpacks/shrine-demo/scdl/moonlit-shrine-forest-json.json`
Run: `git commit -m "feat(scdl): author moonlit-shrine-forest 160x90 asset"`

---

### Task 2: Author Wand Vector Formulas (`moonlit-shrine-forest.wand.json`)

**Files:**
- Create: `PolarisOS/worldpacks/shrine-demo/wand/moonlit-shrine-forest.wand.json`

**Interfaces:**
- Consumed by: `scripts/wand-vixel-pipeline.mjs` and `PolarisOS/scripts/vixel-rasterize.mjs`.

- [ ] **Step 1: Write `moonlit-shrine-forest.wand.json`**

Write the complete Wand vector definition file:
```json
{
  "asset": "moonlit-shrine-forest",
  "canvas": { "width": 160, "height": 90 },
  "formulas": [
    {
      "role": "moonlit-shrine-forest.tree_left_filigree",
      "type": "edge_trace",
      "description": "Gold vector filigree tracing the left ancient tree trunk and branch",
      "formula": {
        "coordinateFormula": {
          "type": "edge_trace",
          "tracePath": [
            { "x": 25, "y": 0 },
            { "x": 28, "y": 50 },
            { "x": 20, "y": 90 },
            { "x": 22, "y": 35 },
            { "x": 52, "y": 15 },
            { "x": 48, "y": 20 },
            { "x": 20, "y": 30 },
            { "x": 25, "y": 0 }
          ],
          "strokeWidth": 0.8
        }
      },
      "pressure": 0.95
    },
    {
      "role": "moonlit-shrine-forest.tree_right_filigree",
      "type": "edge_trace",
      "description": "Gold vector filigree tracing the right framing trunk",
      "formula": {
        "coordinateFormula": {
          "type": "edge_trace",
          "tracePath": [
            { "x": 135, "y": 0 },
            { "x": 128, "y": 90 },
            { "x": 138, "y": 25 },
            { "x": 115, "y": 15 },
            { "x": 118, "y": 12 },
            { "x": 142, "y": 22 },
            { "x": 135, "y": 0 }
          ],
          "strokeWidth": 0.8
        }
      },
      "pressure": 0.95
    },
    {
      "role": "moonlit-shrine-forest.fallen_fence_structure",
      "type": "edge_trace",
      "description": "Warm gold vector lines tracing the fallen wooden cross planks",
      "formula": {
        "coordinateFormula": {
          "type": "edge_trace",
          "tracePath": [
            { "x": 8, "y": 72 },
            { "x": 42, "y": 62 },
            { "x": 44, "y": 67 },
            { "x": 10, "y": 77 },
            { "x": 8, "y": 72 }
          ],
          "strokeWidth": 0.9
        }
      },
      "pressure": 0.9
    },
    {
      "role": "moonlit-shrine-forest.torii_gate_contour",
      "type": "edge_trace",
      "description": "Ethereal cyan vector stroke tracing the distant Torii shrine gate",
      "formula": {
        "coordinateFormula": {
          "type": "edge_trace",
          "tracePath": [
            { "x": 96, "y": 26 },
            { "x": 114, "y": 26 },
            { "x": 112, "y": 28 },
            { "x": 98, "y": 28 },
            { "x": 96, "y": 26 }
          ],
          "strokeWidth": 0.7
        }
      },
      "pressure": 1.0
    },
    {
      "role": "moonlit-shrine-forest.moon_halo_ring",
      "type": "parametric_curve",
      "description": "Smooth circular vector ring tracing the full moon rim",
      "formula": {
        "coordinateFormula": {
          "type": "parametric_curve",
          "curveType": "circle",
          "center": { "x": 105, "y": 18 },
          "radius": 7.5,
          "strokeWidth": 0.8
        }
      },
      "pressure": 0.95
    }
  ]
}
```

- [ ] **Step 2: Commit**

Run: `git add PolarisOS/worldpacks/shrine-demo/wand/moonlit-shrine-forest.wand.json`
Run: `git commit -m "feat(wand): author moonlit-shrine-forest vector formulas"`

---

### Task 3: Execute Pipeline & Verify Scene Output

**Files:**
- Output: `PolarisOS/evidence/vixel-moonlit-shrine-forest-4x.png`
- Output: `PolarisOS/evidence/pixel-moonlit-shrine-forest-4x.png`

- [ ] **Step 1: Execute Wand-Vixel Pipeline**

Run: `node scripts/wand-vixel-pipeline.mjs moonlit-shrine-forest`
Expected output:
- `Loading SCDL packet... 3886+ cells`
- `Evaluating Wand formulas... 5 paths`
- `Fusing pixel + vector -> VixelField... Hash: PASS`
- `Photonic Feel: Spatial Awareness score PASS`

- [ ] **Step 2: Execute Vixel Rasterizer at 4x scale**

Run: `node PolarisOS/scripts/vixel-rasterize.mjs moonlit-shrine-forest 4`
Expected output:
- `Canvas: 160x90  Scale: 4x`
- `Vixel PNG: PolarisOS/evidence/vixel-moonlit-shrine-forest-4x.png (640x360 RGBA)`
- `Ablation A/B diff > 5% PASS`
- `Deterministic: PASS`

- [ ] **Step 3: Run Vitest Integration Suite**

Run: `npx vitest run tests/vixel-lattice/wand-integration.test.js tests/photonic-retina/retina-vixel.test.js`
Expected: 46/46 tests passing.

- [ ] **Step 4: Commit Evidence**

Run: `git add PolarisOS/evidence/vixel-moonlit-shrine-forest-4x.png PolarisOS/evidence/pixel-moonlit-shrine-forest-4x.png`
Run: `git commit -m "feat(evidence): rasterize 640x360 vixel moonlit shrine forest scene"`
