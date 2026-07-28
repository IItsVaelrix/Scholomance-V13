# CelestialSwordVixel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the \(32\times128\) `CelestialSwordVixel` asset based on `0cd89f9a-b8d7-495d-aafd-6d4ca3140205.png`, using SCDL scene graph, Wand vector formulas, Native Vixel Texture Engine, and Perceptual Quality Trio.

**Architecture:** Author a 6-layer SCDL symbolic scene graph asset (`CelestialSwordVixel.scdl`), pair it with a 5-formula Wand vector definition (`CelestialSwordVixel.wand.json`), and run end-to-end Vixel rasterization at \(4\times\) scale (\(128\times512\) RGBA PNG output).

**Tech Stack:** SCDL Parser/Compiler (`scdl.cli.js`), Wand Formula Evaluator (`formula-to-coordinates.js`), Vixel Fusion Pipeline (`wand-vixel-pipeline.mjs`), Native Vixel Rasterizer (`vixel-rasterize.mjs`), Vitest.

## Global Constraints

- **Canvas Size:** Exactly \(32\times128\) lattice cells
- **Export Scale:** \(4\times\) rendering scale producing \(128\times512\) RGBA PNG
- **Output Paths:**
  - SCDL Source: `PolarisOS/worldpacks/shrine-demo/scdl/CelestialSwordVixel.scdl`
  - JSON Packet: `PolarisOS/worldpacks/shrine-demo/scdl/CelestialSwordVixel-json.json`
  - Wand Definition: `PolarisOS/worldpacks/shrine-demo/wand/CelestialSwordVixel.wand.json`
  - Vixel PNG Output: `PolarisOS/evidence/vixel-CelestialSwordVixel-4x.png`
  - Pixel PNG Output: `PolarisOS/evidence/pixel-CelestialSwordVixel-4x.png`

---

### Task 1: Author SCDL Scene Graph (`CelestialSwordVixel.scdl`)

**Files:**
- Create: `PolarisOS/worldpacks/shrine-demo/scdl/CelestialSwordVixel.scdl`

**Interfaces:**
- Produces: `pbasset_CelestialSwordVixel` JSON packet upon compilation via `scdl.cli.js`.

- [ ] **Step 1: Write `CelestialSwordVixel.scdl`**

Write the complete 6-layer SCDL source file:
```scdl
# CelestialSwordVixel — Vixel Scene Architecture (32x128)
asset CelestialSwordVixel canvas 32x128

palette {
  stardust_white = #FFF8E7
  cyan_glow      = #80FFFF
  bright_gold    = #D4AF37
  flare_gold     = #E6AA4E
  shell_blue     = #5B86B6
  deep_violet    = #2A1B4E
  shadow_black   = #120E1E
}

# 1. Blade Core Plasma Glow (Stepped Width Modulation)
part blade_inner material source {
  # Stepped Cyan Core: Tip (1 cell) -> Upper (3 cells) -> Middle (4 cells) -> Lower (3 cells) -> Termination (1 cell)
  rect 15.5 4 1 12 cyan_glow
  rect 14.5 16 3 24 cyan_glow
  rect 14.0 40 4 28 cyan_glow
  rect 14.5 68 3 21 cyan_glow
  rect 15.5 89 1 4 cyan_glow
}

# 2. Outer Structural Blade Shell
part blade_edge material sapphire {
  polygon 16 0 21 22 23 58 19 88 13 88 9 58 11 22 #5B86B6
}

# 3. Celestial Gold Outer Trim
part blade_rim material gold {
  polygon 16 0 22 22 24 58 20 88 19 88 23 58 21 22 #D4AF37
  polygon 16 0 10 22 8 58 12 88 13 88 9 58 11 22 #D4AF37
}

# 4. Ricasso Socket Mask (Dark Steel Junction)
part ricasso material darksteel {
  rect 12 90 8 6 #2A1B4E
  rect 11 90 10 1 #D4AF37
}

# 5. Guardian Cross Wings & Guardian Eye
part guard material gold {
  polygon 1 92 14 96 16 97 18 96 31 92 31 97 18 100 16 101 14 100 1 97 #D4AF37
  polygon 16 94 19 96 16 98 13 96 #E6AA4E
  circle 16 96 radius 1 stardust_white
}

# 6. Hilt Grip & Pommel of Origin Ring
part handle material darksteel {
  rect 14 100 4 17 #2A1B4E
  rect 13 104 6 1 #D4AF37
  rect 13 110 6 1 #D4AF37
}

part pommel material moonstone {
  circle 16 122 radius 5 #D4AF37
  circle 16 122 radius 3 #120E1E
  circle 16 122 radius 1.5 #FFF8E7
}

export json
```

- [ ] **Step 2: Compile SCDL source to JSON packet**

Run: `node codex/core/pixelbrain/scdl/scdl.cli.js compile PolarisOS/worldpacks/shrine-demo/scdl/CelestialSwordVixel.scdl --export json --out PolarisOS/worldpacks/shrine-demo/scdl/CelestialSwordVixel-json.json`
Expected: `[SCDL] Done.` written to `CelestialSwordVixel-json.json`.

- [ ] **Step 3: Commit**

Run: `git add PolarisOS/worldpacks/shrine-demo/scdl/CelestialSwordVixel.scdl PolarisOS/worldpacks/shrine-demo/scdl/CelestialSwordVixel-json.json`
Run: `git commit -m "feat(scdl): author CelestialSwordVixel 32x128 asset"`

---

### Task 2: Author Wand Vector Formulas (`CelestialSwordVixel.wand.json`)

**Files:**
- Create: `PolarisOS/worldpacks/shrine-demo/wand/CelestialSwordVixel.wand.json`

**Interfaces:**
- Consumed by: `scripts/wand-vixel-pipeline.mjs` and `PolarisOS/scripts/vixel-rasterize.mjs`.

- [ ] **Step 1: Write `CelestialSwordVixel.wand.json`**

Write the complete Wand vector definition file:
```json
{
  "asset": "CelestialSwordVixel",
  "canvas": { "width": 32, "height": 128 },
  "formulas": [
    {
      "role": "CelestialSwordVixel.blade_contour",
      "type": "edge_trace",
      "description": "Gold vector stroke tracing the celestial blade contour",
      "formula": {
        "coordinateFormula": {
          "type": "edge_trace",
          "tracePath": [
            { "x": 16, "y": 0 },
            { "x": 22, "y": 22 },
            { "x": 24, "y": 58 },
            { "x": 20, "y": 88 },
            { "x": 12, "y": 88 },
            { "x": 8, "y": 58 },
            { "x": 10, "y": 22 },
            { "x": 16, "y": 0 }
          ],
          "strokeWidth": 0.8
        }
      },
      "pressure": 0.95
    },
    {
      "role": "CelestialSwordVixel.guardian_wings",
      "type": "edge_trace",
      "description": "Gold vector stroke tracing the crossguard wings",
      "formula": {
        "coordinateFormula": {
          "type": "edge_trace",
          "tracePath": [
            { "x": 1, "y": 92 },
            { "x": 14, "y": 96 },
            { "x": 16, "y": 97 },
            { "x": 18, "y": 96 },
            { "x": 31, "y": 92 },
            { "x": 31, "y": 97 },
            { "x": 18, "y": 100 },
            { "x": 16, "y": 101 },
            { "x": 14, "y": 100 },
            { "x": 1, "y": 97 },
            { "x": 1, "y": 92 }
          ],
          "strokeWidth": 0.8
        }
      },
      "pressure": 0.95
    },
    {
      "role": "CelestialSwordVixel.guardian_eye",
      "type": "edge_trace",
      "description": "Gold vector stroke tracing the guardian eye diamond",
      "formula": {
        "coordinateFormula": {
          "type": "edge_trace",
          "tracePath": [
            { "x": 16, "y": 94 },
            { "x": 19, "y": 96 },
            { "x": 16, "y": 98 },
            { "x": 13, "y": 96 },
            { "x": 16, "y": 94 }
          ],
          "strokeWidth": 0.7
        }
      },
      "pressure": 1.0
    },
    {
      "role": "CelestialSwordVixel.stellar_lattice",
      "type": "parametric_curve",
      "description": "Cyan vector lightning beam running along central blade axis",
      "formula": {
        "coordinateFormula": {
          "type": "parametric_curve",
          "curveType": "line",
          "origin": { "x": 16, "y": 4 },
          "target": { "x": 16, "y": 89 },
          "strokeWidth": 0.8
        }
      },
      "pressure": 0.95
    },
    {
      "role": "CelestialSwordVixel.pommel_origin_ring",
      "type": "parametric_curve",
      "description": "Gold vector ring tracing the Pommel of Origin",
      "formula": {
        "coordinateFormula": {
          "type": "parametric_curve",
          "curveType": "circle",
          "center": { "x": 16, "y": 122 },
          "radius": 5.0,
          "strokeWidth": 0.8
        }
      },
      "pressure": 0.95
    }
  ]
}
```

- [ ] **Step 2: Commit**

Run: `git add PolarisOS/worldpacks/shrine-demo/wand/CelestialSwordVixel.wand.json`
Run: `git commit -m "feat(wand): author CelestialSwordVixel vector formulas"`

---

### Task 3: Execute Pipeline & Verify Scene Output

**Files:**
- Output: `PolarisOS/evidence/vixel-CelestialSwordVixel-4x.png`
- Output: `PolarisOS/evidence/pixel-CelestialSwordVixel-4x.png`

- [ ] **Step 1: Execute Wand-Vixel Pipeline**

Run: `node scripts/wand-vixel-pipeline.mjs CelestialSwordVixel`
Expected output:
- `Loading SCDL packet...`
- `Evaluating Wand formulas... 5 paths`
- `Fusing pixel + vector -> VixelField... Hash: PASS`
- `Photonic Feel: Spatial Awareness score PASS`

- [ ] **Step 2: Execute Vixel Rasterizer at 4x scale**

Run: `node PolarisOS/scripts/vixel-rasterize.mjs CelestialSwordVixel 4`
Expected output:
- `Canvas: 32x128  Scale: 4x`
- `Vixel PNG: PolarisOS/evidence/vixel-CelestialSwordVixel-4x.png (128x512 RGBA)`
- `Ablation A/B diff > 5% PASS`
- `Deterministic: PASS`

- [ ] **Step 3: Run Vitest Integration Suite**

Run: `npx vitest run tests/vixel-lattice/wand-integration.test.js tests/photonic-retina/retina-vixel.test.js`
Expected: 46/46 tests passing.

- [ ] **Step 4: Commit Evidence**

Run: `git add PolarisOS/evidence/vixel-CelestialSwordVixel-4x.png PolarisOS/evidence/pixel-CelestialSwordVixel-4x.png`
Run: `git commit -m "feat(evidence): rasterize 128x512 vixel CelestialSwordVixel asset"`
