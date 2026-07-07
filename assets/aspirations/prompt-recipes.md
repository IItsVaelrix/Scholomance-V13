# PixelBrain AI Reference Prompt Recipes

Use these as starting templates when generating reference images with image tools (Grok Imagine, etc.). The goal is **scan-friendly** rasters: clean silhouettes, high edge contrast, correct proportions, easy alpha, minimal noise that would confuse `generateSilhouetteFromImage`.

Copy-paste and customize the [ASSET] and [STYLE] parts. Generate separate images for each view when possible.

## General Principles (apply to all prompts)
- State the **exact pixel dimensions** up front.
- "orthographic", "no perspective", "front view only" or "true side elevation".
- "strong clean silhouette", "high contrast edges", "suitable for automatic contour tracing".
- "transparent background" or "pure black / pure white background for easy keying".
- "nearest-neighbor pixel art aesthetic, no anti-aliasing, no soft blur, limited palette".
- Lighting: "upper-left (NW) light source at ~45 degrees" or "consistent with Scholomance voidmetal / holyfire material".
- "reference image for voxel / lattice reconstruction", "three-view blueprint ready".
- End with: "PNG, exact WxH canvas, 1:1 pixel mapping intent".

## Item / Weapon / Tool (e.g. pickaxe, sword, staff)
Front (primary):
"Orthographic front view of a [grim arcane voidmetal pickaxe with glowing runes and crystalline inlay], 64x64 pixel reference, clean bold silhouette, high edge contrast, transparent background, no anti-aliasing, limited 12-16 color palette, upper-left NW lighting at 45 degrees, exact proportions for 64x64x16 voxel grid, suitable for silhouette blueprint tracing and shadow projection match, Scholomance grimoire aesthetic"

Side:
"True orthographic side elevation of the same [voidmetal pickaxe], 16x64 (depth x height) pixel reference for voxel reconstruction..."

Top:
"True orthographic top-down view of the same [voidmetal pickaxe], 64x16 ..."

## Isometric Tiles & Props (CRITICAL: follow SCDNA gene)
Floor example (128x64 diamond):
"Isometric 2.5D diamond floor tile, 128x64 exact canvas, void ice cracked floor with subtle rune etching, upper-left NW light bias, full RGBA transparency outside the isometric diamond shape (alpha=0 in corners), no rectangular box, clean edges, pixel art, limited palette, reference for SCDL compilation, bottom registration"

Prop example (e.g. 96x96):
"Orthographic front view of a void crystal fern prop, 96x96 exact canvas, upper-left light, full transparency outside the prop silhouette, pixel art reference for isometric scene overlay, bottom-center anchored"

After generation for iso:
- Always run prepare with `--isometric-diamond`
- Final step: recompile the authoritative `.scdl` and use its rendered PNG as the production asset.

## Character / Chibi (64x64 example)
"64x64 pixel art orthographic front view of Vaelrix chibi sorceress, compact chibi proportions (head ~40% height), clean silhouette matching standard chibi construction skeleton (midline, head circle, shoulder/waist/hip/knee divisions), transparent background, high contrast outline, upper-left lighting, no AA, grimoire arcane robes with subtle glows, suitable for image-to-construction-skeleton extraction and .pbrain blueprint"

Side view for 3/4 or profile lockstep if animating.

## UI Glyph / Emblem / Shield
"48x48 or 64x64 pixel emblem, [concentric energy shield motif with central focal rune], strong radial symmetry, clean silhouette, transparent outside, limited high-contrast palette, no gradients except deliberate energy ramp, reference for SCDL or lattice glyph authoring"

## Full Scene / Environment Mood
Use only for composition, lighting, and palette inspiration. Author the real structure in SCDL scene graph + volumes.
"Atmospheric Scholomance void island arena at night, distant crystal clusters, aurora, parchment and gold accents, reference photo for lighting direction and color harmony only — will be reinterpreted as SCDL + volume + fidelity pipeline"

## Post-Generation Checklist (before prepare)
- [ ] Dimensions close to target (or larger is ok — prepare will scale).
- [ ] Silhouette is unambiguous (no hair-thin bits or noise on outline).
- [ ] Background is either transparent or a single solid easy-to-key color.
- [ ] No heavy dither or film grain that will create false edges.
- [ ] Consistent with target registration (centered or bottom-anchored).
- [ ] For iso: corners outside diamond are uniform (will be masked).

## Example Full Command Chain
```
# 1. Generate with your image tool using the recipe above. Save as:
assets/aspirations/void-poleaxe/raw-front.png
assets/aspirations/void-poleaxe/raw-side.png

# 2. Prepare
node scripts/prepare-ai-reference.mjs assets/aspirations/void-poleaxe/raw-front.png \
  --grid 64x64 --registration center --out assets/aspirations/void-poleaxe/prepared/front.png

node scripts/prepare-ai-reference.mjs .../raw-side.png \
  --grid 16x64 --registration center --out .../prepared/side.png

# 3. (optional top)

# 4. Scan
node scripts/pixelbrain-silhouette-scan.mjs \
  --front .../prepared/front.png --side .../prepared/side.png \
  --id weapon.poleaxe.v1 --grid 64x64x16 \
  --out specs/void-poleaxe.silh

# 5. Hand-edit .silh to add animation if needed, then forge + gate.
```

Keep the sealed .silh + the item spec + final exports as the permanent record.
Raw AI files and even prepared PNGs can be pruned later.

**Remember**: The AI image is the question ("what should this feel like?"). The .silh + forge + gates + fidelity is the answer that obeys the world's laws.
