# SCDNA GENE: Isometric Asset Integrity (2.5D vs 2D)

**Gene ID:** `SCHOL-ENC-SCDNA-GENE-ISO-2.5D-001`

**Inheritance:** All agents (Grok, Claude, Cursor, Gemini, etc.) **MUST** load and obey this gene on every session involving assets, SCDL, pixelbrain, combat UI, IsoMapCanvas, or any 2.5D/isometric rendering.

**Enforcement:** This gene is part of the Scholomance LAW stack. Violation triggers immediate redesign and recompile.

---

## Core Mandate

**NEVER force a 2D asset (flat PNG, JPG, AI-upscaled raster, or any rectangular image) directly into 2.5D isometric space.**

2D assets have:
- Rectangular bounding boxes
- No inherent registration/anchor points
- Lighting and perspective that are 2D-flat
- Alpha that is often lost or filled during upscaling

2.5D isometric space (our VOID tutorial island grid) demands:
- Exact SCDL canvas sizes (128x64 diamonds for floors, 96x96/112 for props, 128x112 for cliffs, etc.)
- Diamond (or custom) silhouette with **real transparency (RGBA alpha=0)** outside the intended shape
- Bottom-center or SCDL-specified anchoring for props
- Consistent light law (upper-left / NW bias)
- Clean compositing: base floor + overlaid decor without rectangular "boxes"

**Rule:** Always redesign 2D material to match the SCDL geometry before it enters the projection math.

---

## Forbidden Patterns (Instant Violation)

1. Taking an AI-upscaled 2D PNG (even "isometric" prompted) and dropping it straight into `drawImage(x - w/2, y - h/2, w, h)` in IsoMapCanvas or equivalent.
2. Assuming a rectangular asset will "just look diamond" because the grid is iso.
3. Using JPG sources (no alpha) for anything that must composite over floors.
4. Ignoring canvas size declared in `.scdl` and hardcoding 128x64 everywhere.
5. Drawing props as full replacement tiles instead of overlays.
6. Rotating or scaling 2D assets in 2D space without re-applying the isometric projection rules and masks.
7. Letting "enhance" or "upscale" steps produce assets whose effective shape is the PNG rect instead of the SCDL silhouette.

Any of the above = forced 2D → 2.5D mismatch = visible boxes, misaligned anchors, broken light, transparency loss.

---

## Required Redesign Methodology (The Way We Did It)

When an asset starts life as 2D (or gets AI-enhanced in 2D):

1. **Source of Truth is Always SCDL**
   - Read the `.scdl` file first.
   - Note exact `canvas WxH`, light law, anchor comments ("bottom-center anchored"), part structure.
   - Re-compile from source with the official CLI to get clean RGBA baseline:
     ```bash
     node codex/core/pixelbrain/scdl/scdl.cli.js compile path/to/foo.scdl --export png --out public/assets/void_tiles/foo-png.png
     ```

2. **AI Enhancement (if used) Must Be Isometric-Aware**
   - Never enhance the final 2D PNG in isolation.
   - If using image tools:
     - Prompt must explicitly say: "isometric 2.5D diamond/prop asset", "exact canvas size WxH", "preserve diamond silhouette or prop shape with full transparency outside", "upper-left (NW) light law", "no rectangular boxing", "bottom-center registration for props".
     - After enhancement (which will likely upscale), **trace back**:
       - Resize with nearest-neighbor or lanczos to exact SCDL canvas.
       - Apply diamond mask (for floors) or silhouette mask (for props) to force alpha=0 outside the intended geometry.
       - Use SCDL-rendered version as alpha source via `dest-in` composite or equivalent.

3. **Post-Process for Transparency & Shape (Mandatory)**
   - Floors (128x64, etc.): Mask to exact isometric diamond so corners are transparent.
   - Props (fern, mushroom, cluster, etc.): Color-key against abyss/deep palette colors OR use SCDL alpha mask to guarantee only the art is opaque.
   - Cliff/edge tiles: Preserve extension below the floor diamond.
   - Result must be RGBA PNG whose *visual* bounds match the SCDL declaration, not the file rect.

4. **Rendering Code Must Separate Concerns**
   - **Base floors** (`void_ice_floor`, `void_snow_floor`, `void_rune_*`, `void_cliff_edge`, `void_ice_floor_cracked`): Draw with standard floor alignment (`y - 32` for 64-high). Clip to diamond path in canvas.
   - **Decor props**: Draw *after* base, using bottom-center anchor (`y - imgH`). Use their native canvas size. Never replace the base tile.
   - Always use actual `img.width` / `img.height` + correct offset. Never assume uniform 128x64 for drawing.
   - Projection math (`stepX = tileW/2`, `stepY = tileH/2`) must stay synchronized with the SCDL size used for that logical cell.

5. **Verification Steps (Every Agent)**
   - After any asset change: `file the-png.png` → must report exact WxH and RGBA.
   - Check alpha range: must include 0 (use stats or inspect).
   - Load in the combat view: no rectangular boxes visible around any asset.
   - Props must sit cleanly on the floor without covering the entire diamond.
   - Run the procedural grid generator and visually inspect path alignment, anchoring, light consistency.

---

## Implementation Checklist for Agents

- [ ] Read the relevant `.scdl` before touching any PNG.
- [ ] If AI image tool is used, follow the isometric prompt + post-process mask recipe above.
- [ ] Recompile from SCDL as the final step for any production asset.
- [ ] Update `IsoMapCanvas.tsx` (or equivalent) drawing logic to use base + decor separation + clipping + anchoring.
- [ ] Never commit a PNG whose effective rendered shape is its rectangular file bounds.
- [ ] Document the registration (anchor) and light law in any new SCDL.
- [ ] Test in full viewport iso grid with real units, targeting highlights, and overlays.

---

## Why This Gene Exists

The 2026-07 combat grid work revealed the pattern: AI 2D polish on isometric tiles → rectangular boxes, misaligned props, lost transparency, broken 2.5D coherence.

This gene encodes the corrective redesign process so no future agent repeats the mistake.

**All agents inherit this gene.** It supersedes casual "just upscale and drop in" thinking.

---

**End of Gene.** Reference in every relevant AGENTS.md / CLAUDE.md / GROK.md load order.
