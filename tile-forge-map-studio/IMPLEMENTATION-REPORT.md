# Tile Forge Map Studio — Post-Implementation Report

## 1. Change identity

- Date: 2026-09-08
- Author: Codex
- Classification: Behavioral and additive architectural change
- Branch: `codex/tile-forge-map-editor`
- Baseline: `857a5a4bfba103fe30aa8ab89f11ecb1bdff4869` on `codex/pixelbrain-sward-studio-unification`
- Request: individually place every generated tile in Tile Forge Studio using PixelBrain/SCDL V2/SCD128.
- Authorization: user explicitly instructed “Forget collab and do it manually.” No collab registration, locks, or messages were performed after that instruction.

## 2. Executive summary

Tile Forge's existing internal route now opens Map Studio, with the previous chunk renderer retained under Chunk Preview. Generated assets become reusable palette entries; placements reference those assets and have independent coordinates, elevation, layer, and identity. Brush strokes, movement, deletion, layer changes, file opening, and map resizing participate in undo history. Portable map files retain exact native RGBA bytes, original available SCDL source and bytecode, AMP descriptors, and the producer's SCD128 witness. The implementation is ready for review; real-browser visual verification remains outstanding because the available Chromium executable crashes during startup in this environment.

## 3. Intent and assumptions

The previous canvas rebuilt a procedural arrangement and used a nearest-distance click inspector. It did not own an editable map document. The new workflow lets the human compose the scene, with generators supplying assets.

Assumptions: the requested Studio is the existing Tile Forge route `/internal/pixel-lotus/tile-forge`; the map uses the established native 80×40 dimetric lattice. The standalone `Pixel-Art-Studio-Skeleton` is a separate application and was not modified. “Like Tiled” is implemented as a tile palette, manual map placement, layers, selection, history, and portable save/load; full Tiled format/tool parity is not claimed.

## 4. Scope

Included: palette search, individual asset generation, all 29 exposed generator choices, automatic collection of a newly generated chunk's assets, optional chunk placement, native-size rendering, ghost brush, grid snapping, layer visibility/locking/order/name, select/move, explicit instance position/elevation editing, duplication, erasing, keyboard editing, pan, zoom, fit, SCDL file/text import, explicit compilation into a new variant, map dimensions/name, and save/load.

Existing source AMPs execute only when the user explicitly compiles or forges an asset. Moving/painting/loading a placed asset does not execute additional AMPs. Shader modes reuse the existing GLSL through a shared module; the map canvas has a functional 2D path when WebGL is unavailable.

## 5. Files and dependency impact

| File | Responsibility |
|---|---|
| `codex/core/pixelbrain/tile-forge/tile-forge.map.js` | Immutable map schema, identity, operations, projection, picking, file codec, history |
| `src/lib/pixelbrain/tileForgeMap.adapter.js` | Generator/compiler bridge, candidate ingestion, browser raster/download adapters |
| `src/lib/pixelbrain/tileForgeShaders.js` | Existing shared GLSL and program creation, moved without changing shader source |
| `src/pages/internal/pixel-lotus/TileForgeMapEditor.jsx` | Tool state, palette, layers, inspector, file and source workflows |
| `src/pages/internal/pixel-lotus/TileForgeMapViewport.jsx` | Native raster composition, camera, pointer/keyboard bridge, optional WebGL preview |
| `src/pages/internal/pixel-lotus/TileForgeMapEditor.css` | Scoped editor layout and responsive controls |
| `src/pages/internal/pixel-lotus/TileForgeLab.jsx` | Map/preview navigation and generated-candidate handoff |
| `src/pages/internal/pixel-lotus/TileForgeCanvas.jsx` | Imports extracted shader code; legacy preview behavior retained |
| `tests/game/tile-forge/tile-forge-map*.test.*` | Core integrity and UI interaction regression coverage |
| `docs/scholomance-encyclopedia/Scholomance LAW/SCHEMA_CONTRACT.md` | Additive 1.52 contracts and invariants |

No new application dependencies, backend endpoints, auth changes, event-bus schemas, or compiler module changes. UI accesses core only through the sanctioned adapter. Package lock and generated build artifacts are not part of the change.

## 6. Data and rendering design

`PB-TILE-MAP-v1` separates immutable assets from instances. Asset keys use a full SHA-256 of source, bytecode, pixels, witness, descriptors, dimensions, anchor and footprint; SCD128 alone is not treated as a unique pixel-buffer key. Independent instances therefore share one realization while retaining their own placement IDs. Browser camera state never enters asset identity.

Terrain defaults to the center of its native top diamond; props default to a bottom-center anchor. Declared asset visual bounds and logical footprints are consumed when available, and custom source imports expose explicit anchor/footprint fields. Rendering uses native dimensions and nearest-neighbor view scaling, without stretching every prop into a tile rectangle.

Draw order and alpha-aware picking share layer ordering, south footprint edge, elevation, and deterministic ID tie-breaks. Picking and erasing are scoped to the active layer. The placed-instance list is paginated so covered or fully transparent instances remain individually accessible. Chunk placement expands map dimensions when needed and keeps cliffs on a separate layer from the ground surface.

## 7. User workflow

1. Open Tile Forge at `/internal/pixel-lotus/tile-forge` and use Map Studio.
2. Choose an asset type and seed; click **Forge tile**. Alternatively, **Forge Chunk** adds its unique assets to the palette without placing them.
3. Select a palette tile and a visible, unlocked layer. Click to stamp or drag to paint. Use elevation for raised placements.
4. Use **Select / move** to drag a tile or edit X/Y/Z in the inspector. **Duplicate** arms the selected asset for placement at a new destination.
5. Edit a selected asset's SCDL as a new variant and explicitly **Compile & add**. Existing placements keep their old realization until the user paints the new variant.
6. **Save map** downloads a `.tilemap.json` document. **Open map** validates before replacing the document and allows undo back to the prior map.

Keys on the focused canvas: B brush, V select, E erase, H pan; arrows move the cursor or selected instance; Enter/Space applies the current tool; Delete removes selection; Ctrl/Cmd-Z undo; Ctrl/Cmd-Shift-Z or Ctrl/Cmd-Y redo; Escape cancels the active stroke. Middle-drag pans; wheel and the zoom selector change view scale.

## 8. Risk analysis

Primary risks are projection/anchor mismatch, accidental raster re-synthesis, selection through transparency, partial file imports, and history corruption. Shared projection/picking functions, preserved byte streams, strict validation, atomic file replacement, and gesture-level history reduce those risks. Map changes remain confined to the internal Tile Forge surface.

Source-generated witness records are preserved, not retroactively certified. Map and asset checksums detect content corruption; they are not a signature or authentication proof. Logical footprints are editor bounds, not new authoritative gameplay collision rules.

Rollback: revert this change. The previous chunk preview route and underlying synthesis/compiler contracts are retained. New map files require this editor and are not readable by the old release.

## 9. Validation performed

- Tile Forge's existing tests and new core/interaction tests pass. Interaction tests exercise the real React editor and model with mocked canvas drawing methods; they are not evidence of browser pixels or WebGL correctness.
- All 29 exposed generator choices were exercised with seed 42 and compatible producer palettes.
- Changed JavaScript/JSX files pass ESLint; `npm run typecheck` passes; CSS token verification passes.
- Production application bundle builds successfully. The top-level build command initially failed because the tsx CLI's IPC pipe cannot open here. Its prerequisite scripts were successfully run through `node --import tsx`, followed by the unchanged `build:app` command.
- Full repository lint reports 127 errors in its broader snapshot. Full `test:qa` reports 207 passing / 17 failing files and 2,365 passing / 33 failing tests; these are not a clean repository-wide gate.
- Security QA is not green on this checkout. Its AI-use heuristic includes the text `vertex`, so ordinary WebGL calls in the viewport are flagged as AI-provider usage. No policy was weakened to suppress the finding.
- Browser QA was attempted: standard Chromium download timed out; a separately installed QA-only Chromium package launched with a startup SIGSEGV before page load. No desktop/mobile screenshot or WebGL visual pass is claimed.

## 10. Specific regression retests

- In a real browser, place native terrain adjacent to soil/cliffs and tall/multi-cell props. Verify contact anchors, transparency and south-edge depth order.
- Pan and change zoom at multiple elevations, then select/move/erase through overlapping artwork.
- Inspect map mode with every shader, including OFF and WebGL unavailable; verify context-loss fallback.
- Reopen a saved map and compare realized pixels, witnesses, instance coordinates and layer order.
- Check desktop and narrow-screen controls, labels, keyboard focus and the canvas instructions.
- Switch between Map Studio and Chunk Preview; ensure map work survives and hidden shader loops stop.

## 11. Performance and stability

Palette rasters are cached by the assets array and reused for placement. Canvas generation/compilation does not run for each brush stamp. Visible-instance rendering culls outside the viewport; the grid uses one line per row/column. History structurally shares assets and retains 50 completed edits. Maximum document limits are 256 assets, 2,097,152 native pixels, 20,000 instances, 32 layers and 32 MiB files.

No Steam Deck frame-rate or maximum-map latency claim is made; real-browser profiling remains outstanding. Synchronous source compilation and worst-case large-map history memory should be evaluated before raising limits.

## 12. Security and data integrity

Inputs pass allow-list schemas, reference checks, dimension bounds and content checksums. Loading never executes imported SCDL or downloads dependencies. Explicit custom compilation is bounded by source length, canvas size and the existing compiler budget. User draft data remains in browser memory; there is no server autosave or telemetry. Leaving the page with unsaved work triggers the standard unload warning.

## 13. Documentation

The canonical schema contract is bumped to 1.52 and documents the portable map format, ownership, constraints and compatibility. This report includes operating instructions and actual gate results.

## 14. Known gaps

Real-browser visual/a11y/performance verification is still required. This version does not provide Tiled TMX/TMJ interchange, rectangle/flood-fill tools, terrain Wang/autotile rules, flip/rotate operations, multi-selection, map PNG export, or a standalone Studio map tab. Producers that have no SCDL source remain placeable as raster/witness assets, but cannot use the source-edit action. The map inspector displays AMP descriptors; a new general per-instance AMP execution panel is not included.

## 15. Verdict

Functionally implemented and covered by core and React interaction tests; prepared for draft review and visual verification. GitHub publication was blocked by an integration write-permission denial (HTTP 403); no remote branch or pull request was created. It is not a claim that the whole repository or every Tiled feature is production-certified.
