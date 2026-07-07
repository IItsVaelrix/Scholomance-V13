# Aspirations — AI-Enhanced Visual Reference Seeds

**Purpose**: Temporary home for AI-generated (Grok Imagine, upscaled, style-transferred, etc.) or external reference imagery. These are **never** the final visual truth.

**Law**: 
- Lattice is law. Bytecode / SCDL / .pbrain blueprints / sealed .silh are authoritative.
- AI rasters are aspirations only — used once to derive structure (silhouette moulds, construction skeletons, visual intent).
- Follow SCDNA Gene: Isometric Asset Integrity for any 2.5D/isometric work. Never paste raw AI PNGs into renderers.
- Final assets are always recompiled from source (SCDL compile, forgeItemAsset, blueprint forge) + fidelity AMPs + gate approval.

## The Smooth AI → Deterministic Pipeline

```
AI image tool (prompt with grid/light/silhouette awareness)
        ↓
Raw reference PNG(s)  [store here or subdir]
        ↓
scripts/prepare-ai-reference.mjs  (resize, alpha clean, pad to exact grid)
        ↓
Prepared view PNGs (front/side/top or tile canvas)
        ↓
scripts/pixelbrain-silhouette-scan.mjs  → sealed .silh  (mould + inspector)
        ↓  (hand-author ANIM block for animation)
Forge / SCDL compile (constrained by .silh front)
        ↓
forge-craft-gate (--blueprint) + silhouetteBlueprint audits + math auditor
        ↓
Render Fidelity Pipeline (AMPs: intensity, vector, tonation, shadow, volume, sharpness)
        ↓
Export: PNG preview, Aseprite (roundtrip via foundry-aseprite-bridge), Godot packets, etc.
        ↓
Place in public/, dist/data/, Godot asset tree, Scholomance OS/...
        ↓
Visual QA + runtime test (no boxes, correct anchors, light law, silhouette match)
```

### Step-by-Step

1. **Prompt for good references** (critical for clean scan):
   - Specify **exact target canvas** (e.g. "64x64 orthographic front view").
   - "Clean strong silhouette, high edge contrast, transparent background preferred or solid keyable bg".
   - "No anti-aliasing, no soft gradients unless deliberate material, limited palette, pixel-art reference style".
   - Lighting: "consistent upper-left (NW) light bias" or per asset spec.
   - For items/characters: "orthographic, no perspective distortion, suitable for 3-view silhouette projection and voxel reconstruction".
   - For isometric tiles/props (per SCDNA gene):
     "exact 128x64 isometric diamond floor tile, or 96x96 prop, upper-left light law, full RGBA alpha outside the diamond/prop silhouette, no rectangular boxing, bottom-center registration".
   - Style anchor: grimoire, arcane, crystalline, void-touched, Scholomance material language (voidmetal, holyfire, etc.).
   - Generate multiple angles separately if the tool supports; one strong front + manual side/top is acceptable fallback.

2. **Prepare**:
   ```bash
   mkdir -p assets/aspirations/my-asset/prepared
   node scripts/prepare-ai-reference.mjs \
     assets/aspirations/my-asset/raw-front.png \
     --grid 64x64 --view front \
     --out assets/aspirations/my-asset/prepared/front.png

   # Repeat for side/top. For tiles use the SCDL-declared canvas size.
   ```

3. **Scan to sealed blueprint**:
   ```bash
   node scripts/pixelbrain-silhouette-scan.mjs \
     --front assets/aspirations/my-asset/prepared/front.png \
     --side ... --top ... \
     --id weapon.foo.v1 --grid 64x64x16 \
     --out specs/my-foo.silh
   ```
   - Edit the output .silh to add `ANIM_START ... ANIM_END` block(s) describing animation phases if the asset animates.
   - The `.silh` digest + front contour acts as the mould.

4. **Forge under constraint** + gate:
   - Use the .silh when running item foundry or craft gate.
   - `node scripts/pixelbrain-forge-gate.mjs specs/my-spec.v1.json --blueprint specs/my-foo.silh --strict`
   - Fix until all silhouetteBlueprint + craft audits pass (no PB-ERR).

5. **Polish & fidelity**:
   - Run render-fidelity-pipeline.
   - For manual cell-level polish: export via `foundry-aseprite-bridge`, edit in Aseprite or PixelBrain cockpit, re-import.
   - Re-gate after edits.

6. **Export & integrate**:
   - Use the standard exporters (PNG via renderer, Godot via packets, Phaser, etc.).
   - Update any asset manifests, character profiles, tile registries.
   - Place final derived files only in canonical locations (never source AI PNGs).

7. **Archive / clean**:
   - Keep the .silh + spec in specs/ or versioned.
   - Raw AI refs can be deleted or moved to archive/ after the asset is locked (the sealed .silh preserves the intent).

## Isometric / Tiles Special Case (SCDNA Gene)

- Read the `.scdl` first for exact canvas + light law + anchor.
- Prompt AI with diamond/prop shape + transparency + NW light.
- After AI output: **always** apply diamond mask (or SCDL alpha) and recompile from SCDL source.
- Never `drawImage` a raw rectangular AI PNG into IsoMapCanvas or equivalent.
- Verify: `file the.png` shows correct WxH + alpha=0 present; no rect boxes in viewport.

## Character / Chibi / Blueprint Path

- Use `image-to-construction-skeleton` (or equivalent) on prepared AI reference.
- Feed landmarks into blueprint authoring or character-foundry.
- Validate with character silhouette composer + profile math auditor (`pixelbrain-math-auditor-repairman` skill).
- Maintain 3-view or animation lockstep where applicable.

## Other Asset Types

- **UI glyphs, icons, emblems**: Trace or manually transcribe into SCDL rect/circle/path or lattice coords. AI ref for composition only.
- **Full scenes / volumes**: SCDL scene graph + volume amps. AI for mood/lighting ref.
- **Remotion / video / thumbnails (DivTube)**: PixelBrain exports feed frame generators. AI refs inform but final frames derive from bytecode.
- **Godot runtime**: Use the Godot frame printers / exporters. Same lattice source.

## Tooling

- Scan: `scripts/pixelbrain-silhouette-scan.mjs`
- Prepare (new): `scripts/prepare-ai-reference.mjs`
- Forge gate: `scripts/pixelbrain-forge-gate.mjs` (see its PDR)
- SCDL compile: `node codex/core/pixelbrain/scdl/scdl.cli.js compile ...`
- Aseprite bridge: `codex/core/pixelbrain/foundry-aseprite-bridge.js`
- Audits: craft gate, silhouetteBlueprint gate, pixelbrain-math-auditor-repairman skill.
- Preview: PixelBrain cockpit (`/pixelbrain` surface), renderers.

## Conventions & Hygiene

- aspirations/ may contain:
  - `raw-*/` or direct PNGs from image tool.
  - `prepared/` subdirs for scan-ready.
  - `*.prompt.txt` or small sidecar JSON describing grid, id, source prompt hash, date.
- Do **not** commit huge AI image sets. Keep minimal (the .silh is the permanent record).
- All prepared images must be exact integer grid sizes.
- After successful gate + ship, consider pruning raw AI files (keep .silh + spec + final exports).

## Common Pitfalls to Avoid

- Treating AI PNG as the deliverable.
- Skipping the prepare step → poor contour quality → loose tolerance or gate fails.
- Using perspective renders for 3-view blueprints (must be orthographic).
- Ignoring light law or registration → shadow projection mismatch.
- Forgetting to recompile/forge after reference changes.
- Dropping 2D AI into 2.5D render code (SCDNA violation).

## References

- SCDNA_Gene_Isometric_Asset_Integrity.md (LAW)
- 2026-06-19-pixelbrain-silhouette-blueprint-gate-pdr.md
- 2026-06-19-pixelbrain-craft-gate-immunity-pdr.md
- pixelbrain-render-fidelity-pipeline-pdr.md
- foundry-aseprite-bridge-pdr.md
- `codex/core/pixelbrain/silhouette-blueprint.js`, `forge-craft-gate.js`, `silhouette-scan.js`
- PixelBrain skill (pair programmer + references/ for technique)
- Imagine skill guidance for prompt craft

**Rule of thumb**: AI helps you *see* the thing. PixelBrain + gates *make* the thing that always matches the law.

If in doubt, escalate before baking raster.
