# Floating Arena — Tile-by-Tile PixelArt + AI Enhancement Pipeline

This is the correct method for bringing the AI reference image into the Scholomance visual pipeline.

## Core Principle
1. **Break the reference image down to bare modular components** (individual tiles, edge pieces, props). Ignore NPCs/characters.
2. **Create each component as clean pixel art first** (lattice / low-resolution, deterministic, using PixelBrain/SCDL or equivalent). This is the "initial asset".
3. **AI enhance the pixel art** using Texture Upscaling + shaders. The upscaling on a solid pixel foundation produces richer, more detailed results than generating the whole thing from scratch with AI.
4. **Assemble** the enhanced (or base) tiles back into the full scene using placement data (positions, rotations, layers).
5. Keep the pixel art / SCDL / bytecode as the source of truth. Enhanced versions are for final beauty / Godot renders / hero shots.

Reference image: `refs/full-reference.jpg` (1280x720)

## Directory Structure
- `refs/` — cropped regions from the AI image used as visual guides for faithful recreation.
- `base-pixelart/` — the clean 64x64 (or appropriate size) pixel art masters. These are authored first.
- `enhanced/` — AI-upscaled + shader-enhanced versions of the base pixel art tiles.
- `placements/` — JSON maps describing how to assemble the tiles into the full arena (tile type + grid x/y + any offset/rotation).

## Workflow Steps

### 1. Decompose the Image
- Visually (or with crops) identify repeating or unique tiles:
  - Plain ice floor
  - Various unique rune tiles (the glowing blue squares with different symbols)
  - Edge / border ice pieces with icicles
  - Crystal cluster props (placeable on or between tiles)
  - Foliage accents
  - The large central ritual circle (special large prop or multi-tile + overlay)

Crops in `refs/` were extracted as guides (do not use the crops as final art).

### 2. Author Base Pixel Art
- Use small canvas SCDL (or direct lattice / Aseprite) to draw the tile faithfully.
- Keep it small (64x64 recommended here for the scale in the ref).
- Focus on clean silhouette, readable glyphs, correct light direction (upper-left in the VOID style).
- Compile with `scdl.cli.js` to get the `-png.png` as the pixel art master.
- Example:
  ```bash
  node codex/core/pixelbrain/scdl/scdl.cli.js compile rune-tile-base.scdl --export png,json --out-dir base-pixelart/
  ```

### 3. AI Enhance (the key "adds a level of detail" step)
- Take the base pixel art PNG.
- Use image enhancement (texture upscale + shaders).
- Prompt rules:
  - Preserve the *exact* pixel design, rune glyph, tile shape, and layout.
  - Add surface texture, frost, ice crystals, bevels, normal-like shading.
  - Apply glow/bloom/shaders to runes to match the reference scene's emissive look.
  - Match overall palette and cinematic lighting of the full arena.
  - Result looks like the tile as it would appear in the high-res render, but built on solid pixel foundation.

Result saved to `enhanced/`.

### 4. Create More Variations
Repeat for every unique rune/symbol, edge type, etc. seen in the original image. Aim for the exact count of distinct glyphs visible.

### 5. Assemble
Create a placement file (e.g. `arena-layout.json`):

```json
{
  "tileSize": 64,
  "view": "perspective-arena",
  "tiles": [
    {"type": "rune-tile-base", "x": 4, "y": 3},
    {"type": "rune-tile-var-a", "x": 5, "y": 3},
    ...
  ],
  "props": [
    {"type": "crystal-cluster", "x": 2, "y": 1, "scale": 1.2}
  ],
  "special": [
    {"type": "central-ritual-circle", "x": 4.5, "y": 4.5, "layer": "overlay"}
  ]
}
```

Use the placement to drive Godot scene construction, Phaser tilemap, or a custom renderer that composites the (enhanced) tile images at the correct locations.

### 6. Polish Loop
- If a tile doesn't look right when assembled, go back to the **base pixel art**, fix it, re-enhance.
- Run the full set through render fidelity pipeline / shaders if using PixelBrain exports.
- For Godot: the base lattice data can drive logic/collision; the enhanced images are for visuals.

## Current Tiles (continued work)
**Base pixel art masters (pixelart first):**
- rune-tile-base, rune-tile-var-a
- rune-01-star, rune-02-cross, rune-03-diamond, rune-04-wings
- edge-ice-border
- prop-crystal-cluster
- central-circle-base (larger feature)

**AI enhanced (texture upscaled + shaders):**
All of the above have corresponding *-enhanced.jpg versions in `enhanced/`.

**Placement & assembly:**
- placements/arena-layout-v1.json — expanded grid using the unique runes + edges + props + central overlay.
- enhanced/demo-assembly-preview.png — visual proof of reassembling the scene from the individual enhanced tiles.

## Notes for this specific arena
- The grid appears roughly square tiles viewed at a slight angle on a larger floating platform.
- The central glowing circle is the most important "hero" element — create it as a larger special asset or as a cluster of center tiles + a bright overlay glyph.
- Platform edges and icicles can be border tile variants or separate props.
- Use the SCDNA isometric integrity rules if switching to strict diamond tiles.

This method gives both the deterministic pixel foundation the engine loves and the rich, detailed look from AI enhancement.

Next: identify all distinct runes in the reference, create base for each, enhance, build the placement map, then composite a full preview.
