# Scholomance Forest Entrance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create and rasterize the official Scholomance Academy Forest Entrance scene (`scholomance-forest-entrance`) with dense pixel craft, dual-lighting field physics, and Wand vector superposition.

**Architecture:** Author `scholomance-forest-entrance.scdl` with palette swatches and native Vixel material shapes; generate Wand vector stroke formulas in `propagate-scholomance-wand.mjs`; compile and rasterize to 4× PNG artifacts (`vixel-scholomance-forest-entrance-4x.png`).

**Tech Stack:** SCDL compiler (`scdl.cli.js`), Wand formula generator, Vixel Rasterizer (`vixel-rasterize.mjs`), Node.js.

## Global Constraints
- Canvas size 160×90 → 4× scale (640×360).
- Pure deterministic rendering (100% vixel hash match).
- Incorporate lore elements (`Scholomance` sign, open spellbook altar, purple banners with 'S' emblem, cyan rune monoliths, hanging purple lantern, sunlit citadel).

---

### Task 1: Author SCDL Scene Graph & Compile JSON

**Files:**
- Create: `PolarisOS/worldpacks/shrine-demo/scdl/scholomance-forest-entrance.scdl`
- Output: `PolarisOS/worldpacks/shrine-demo/scdl/scholomance-forest-entrance-json.json`

**Interfaces:**
- Consumes: SCDL language grammar, material registry (`obsidian`, `sapphire`, `diamond`, `bark`, `pine_needle`, `cyan_glow`, `source`)
- Produces: `pbasset_scholomance_forest_entrance` JSON packet

- [ ] **Step 1: Write SCDL file for Scholomance Forest Entrance**

Write `PolarisOS/worldpacks/shrine-demo/scdl/scholomance-forest-entrance.scdl`:
```scdl
# Scholomance Forest Entrance — Dense Pixel Craft + Dual Lighting Fields
asset scholomance_forest_entrance canvas 160x90

palette {
  sky_void     = #060A14
  sky_deep     = #0C1528
  sky_mid      = #152238
  sun_haze     = #E6C88A
  citadel_gold = #D4B06A
  citadel_spire= #9E7A3D
  stone_dark   = #1E2530
  stone_mid    = #3A4658
  stone_light  = #6A7A8C
  path_earth   = #3D2D20
  path_stone   = #5C4A3A
  path_light   = #D8C2A0
  moss_dark    = #152619
  moss_mid     = #26422C
  moss_hi      = #426E4A
  moss_lime    = #689B58
  bark_void    = #0A0806
  bark_dark    = #18120D
  bark_mid     = #2E2218
  bark_hi      = #4E3C2B
  sign_wood    = #4E3A28
  sign_text    = #C8A870
  banner_purple= #3D1C52
  banner_gold  = #D4AF37
  arcane_purple= #9B30FF
  arcane_glow  = #E0B0FF
  cyan_hi      = #80FFFF
  cyan_mid     = #40C8E0
  stream_blue  = #24609B
  stream_foam  = #80C0FF
  crystal_purp = #B040FF
}

# 1. Background Sky & Golden Sunlit Citadel
part sky_plate material obsidian {
  rect 0 0 160 90 sky_void
  polygon 0 0 160 0 160 38 0 28 sky_deep
  polygon 60 0 100 0 95 24 65 24 sun_haze
}
part citadel_spire material gold {
  polygon 76 24 80 4 84 24 citadel_spire
  polygon 74 24 80 10 86 24 citadel_gold
  rect 77 24 6 12 citadel_gold
}

# 2. Forest Floor & Distant Canopy
part forest_canopy material sapphire {
  polygon 0 24 30 18 60 28 64 42 0 42 navy_far
  polygon 96 42 100 28 130 18 160 24 160 42 96 42 navy_far
  rect 0 42 160 48 moss_dark
}

# 3. Winding Cobblestone Trail & Stream
part cobblestone_path material bark {
  polygon 60 90 70 76 64 64 72 54 78 44 88 44 84 52 76 60 82 72 74 84 76 90 path_earth
  polygon 64 90 72 76 68 64 74 54 80 44 86 44 82 52 74 60 80 72 72 84 72 90 path_stone
  polygon 67 88 74 76 70 64 76 54 81 46 84 46 80 52 72 60 78 72 70 84 70 88 path_light
}
part water_stream material sapphire {
  polygon 105 90 120 74 112 62 125 48 132 48 122 60 130 72 118 90 stream_blue
  polygon 108 90 122 74 115 62 127 48 130 48 120 60 128 72 115 90 stream_foam
  circle 118 78 radius 2 crystal_purp
  circle 128 66 radius 2 crystal_purp
}

# 4. Standing Rune Monoliths
part rune_monoliths material obsidian {
  polygon 48 58 52 42 58 42 62 58 54 62 stone_dark
  polygon 96 64 100 48 106 48 110 64 102 68 stone_dark
  rect 54 48 2 6 cyan_hi
  rect 102 54 2 6 cyan_hi
}

# 5. Foreground Left Tree, Sign, Banner & Spellbook Altar
part tree_left material bark {
  polygon 0 90 4 60 6 30 8 0 24 0 20 30 18 60 14 90 bark_dark
  polygon 6 90 10 60 12 30 14 0 22 0 18 30 16 60 12 90 bark_mid
  polygon 10 88 14 58 16 28 18 2 21 0 20 28 18 58 14 88 bark_hi
  polygon 16 38 32 30 44 28 42 32 30 34 18 42 bark_mid
}
part scholomance_sign material bark {
  rect 10 34 26 16 sign_wood
  rect 12 36 22 12 bark_dark
  rect 14 39 18 2 sign_text
  rect 16 43 14 2 sign_text
}
part left_banner material void_cloth {
  polygon 28 16 42 16 42 36 35 42 28 36 banner_purple
  circle 35 28 radius 4 banner_gold
}
part spellbook_altar material obsidian {
  rect 18 66 18 16 stone_mid
  rect 20 64 14 4 stone_light
  # Open glowing spellbook
  polygon 21 62 27 60 33 62 33 66 27 64 21 66 arcane_purple
  polygon 22 61 27 59 32 61 32 63 27 61 22 63 arcane_glow
  circle 27 60 radius 3 source
}

# 6. Foreground Right Tree, Banner & Hanging Chain Lantern
part tree_right material bark {
  polygon 138 90 144 60 146 30 148 0 160 0 160 90 bark_dark
  polygon 142 90 148 60 150 30 152 0 160 0 156 60 152 90 bark_mid
  polygon 140 88 144 58 146 28 148 2 150 0 148 28 146 58 142 88 bark_hi
  polygon 144 28 128 22 114 20 116 24 128 26 142 32 bark_mid
}
part right_banner material void_cloth {
  polygon 136 28 150 28 150 48 143 54 136 48 banner_purple
  circle 143 40 radius 4 banner_gold
}
part hanging_lantern material darksteel {
  rect 118 20 6 8 stone_dark
  rect 119 22 4 4 holy_fire
  circle 121 24 radius 2 source
}
```

- [ ] **Step 2: Run SCDL compiler**

Run: `node codex/core/pixelbrain/scdl/scdl.cli.js compile PolarisOS/worldpacks/shrine-demo/scdl/scholomance-forest-entrance.scdl --export json --out PolarisOS/worldpacks/shrine-demo/scdl/scholomance-forest-entrance-json.json`
Expected: PASS with Packet ID output

- [ ] **Step 3: Commit SCDL files**

```bash
git add PolarisOS/worldpacks/shrine-demo/scdl/scholomance-forest-entrance.scdl PolarisOS/worldpacks/shrine-demo/scdl/scholomance-forest-entrance-json.json
git commit -m "feat(scdl): add Scholomance Forest Entrance SCDL asset"
```

---

### Task 2: Create Wand Propagation Script & Formulas

**Files:**
- Create: `scripts/propagate-scholomance-wand.mjs`
- Output: `PolarisOS/worldpacks/shrine-demo/wand/scholomance-forest-entrance.wand.json`

**Interfaces:**
- Consumes: `scholomance-forest-entrance` asset ID
- Produces: Wand formula definition packet

- [ ] **Step 1: Write Wand propagation script**

Write `scripts/propagate-scholomance-wand.mjs`:
```javascript
#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CANVAS = { width: 160, height: 90 };
const OUT = resolve('PolarisOS/worldpacks/shrine-demo/wand/scholomance-forest-entrance.wand.json');

function q(n) { return Math.round(n * 10) / 10; }

function strokeLaw(role, origin, target, opts = {}) {
  return {
    role,
    type: 'mathematical_stroke',
    description: opts.description || role,
    formula: {
      coordinateFormula: {
        type: 'mathematical_stroke',
        parameters: {
          origin: { x: q(origin.x), y: q(origin.y) },
          target: { x: q(target.x), y: q(target.y) },
          baseWidth: opts.baseWidth ?? 1.2,
          widthVariation: opts.widthVariation ?? 0.2,
          frequency: opts.frequency ?? 1.4,
          density: opts.density ?? 1.0,
          bleed: opts.bleed ?? 0.1,
          n: opts.n ?? 36,
        },
      },
    },
    pressure: opts.pressure ?? 0.85,
  };
}

const formulas = [];

// Sign & Altar vectors
formulas.push(strokeLaw('scholomance.sign_border', { x: 10, y: 34 }, { x: 36, y: 34 }, { baseWidth: 1.2, pressure: 0.9 }));
formulas.push(strokeLaw('scholomance.book_pages', { x: 21, y: 62 }, { x: 33, y: 62 }, { baseWidth: 1.0, pressure: 0.95 }));

// Banners 'S' Emblem vectors
formulas.push(strokeLaw('scholomance.banner_left_emblem', { x: 35, y: 24 }, { x: 35, y: 32 }, { baseWidth: 1.1, pressure: 0.9 }));
formulas.push(strokeLaw('scholomance.banner_right_emblem', { x: 143, y: 36 }, { x: 143, y: 44 }, { baseWidth: 1.1, pressure: 0.9 }));

// Lantern chain
formulas.push(strokeLaw('scholomance.lantern_chain', { x: 121, y: 10 }, { x: 121, y: 20 }, { baseWidth: 0.8, pressure: 0.85 }));

// Rune Monolith Glyphs
formulas.push(strokeLaw('scholomance.rune_glyph_l', { x: 55, y: 46 }, { x: 55, y: 54 }, { baseWidth: 1.0, pressure: 0.95 }));
formulas.push(strokeLaw('scholomance.rune_glyph_r', { x: 103, y: 52 }, { x: 103, y: 60 }, { baseWidth: 1.0, pressure: 0.95 }));

const packet = {
  asset: 'scholomance-forest-entrance',
  canvas: CANVAS,
  description: 'Scholomance Forest Entrance Wand formulas - sign, banners, lantern chain, book, and runes.',
  propagation: {
    gene: 'WAND_CHEMICAL_STROKE_PROPAGATION',
    mode: 'chemical-reaction',
    visibleRoles: ['scholomance.*'],
    invisibleRoles: [],
  },
  formulas,
};

writeFileSync(OUT, `${JSON.stringify(packet, null, 2)}\n`);
console.log(`Wrote ${formulas.length} formulas → ${OUT}`);
```

- [ ] **Step 2: Run propagation script**

Run: `node scripts/propagate-scholomance-wand.mjs`
Expected: `Wrote 7 formulas → .../scholomance-forest-entrance.wand.json`

- [ ] **Step 3: Commit Wand files**

```bash
git add scripts/propagate-scholomance-wand.mjs PolarisOS/worldpacks/shrine-demo/wand/scholomance-forest-entrance.wand.json
git commit -m "feat(wand): add Scholomance Forest Entrance Wand formulas"
```

---

### Task 3: Fuse & Rasterize Vixel PNG Evidence Artifacts

**Files:**
- Execute: `scripts/wand-vixel-pipeline.mjs scholomance-forest-entrance`
- Execute: `PolarisOS/scripts/vixel-rasterize.mjs scholomance-forest-entrance 4`
- Output: `PolarisOS/evidence/vixel-scholomance-forest-entrance-4x.png`

**Interfaces:**
- Consumes: Compiled SCDL JSON + Wand formula JSON
- Produces: 4× PNG evidence image

- [ ] **Step 1: Execute Wand-Vixel Pipeline**

Run: `node scripts/wand-vixel-pipeline.mjs scholomance-forest-entrance`
Expected: Match ratio output & Photonic Feel evaluation

- [ ] **Step 2: Execute Vixel Rasterizer**

Run: `node PolarisOS/scripts/vixel-rasterize.mjs scholomance-forest-entrance 4`
Expected: Output PNG written to `PolarisOS/evidence/vixel-scholomance-forest-entrance-4x.png` with 100% determinism pass

- [ ] **Step 3: Commit evidence artifacts**

```bash
git add PolarisOS/evidence/*scholomance-forest-entrance-4x.png
git commit -m "feat(evidence): rasterize 4x Scholomance Forest Entrance PNG artifacts"
```
