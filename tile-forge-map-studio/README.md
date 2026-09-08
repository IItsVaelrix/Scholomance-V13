# Tile Forge Map Studio implementation

Repository: IItsVaelrix/Scholomance-V13
Baseline: 857a5a4bfba103fe30aa8ab89f11ecb1bdff4869
Base branch: codex/pixelbrain-sward-studio-unification
Local review branch: codex/tile-forge-map-editor

This package contains the complete 12-file implementation as one Git patch,
plus the detailed implementation and validation report. The patch was applied
to a temporary index at the release baseline and verified to reproduce the
committed implementation tree exactly.

## Apply

Start in a clean checkout of Scholomance-V13. Create a review branch from the
release baseline and replace /path/to with the extracted package location:

```bash
git switch -c codex/tile-forge-map-editor 857a5a4bfba103fe30aa8ab89f11ecb1bdff4869
git apply --check /path/to/tile-forge-map-studio.patch
git apply --index /path/to/tile-forge-map-studio.patch
git commit -m "feat(tile-forge): add individual tile placement and map authoring studio"
```

Use another branch name if that name already exists locally. If applying to a
newer baseline, inspect and resolve differences rather than forcing the patch.
The patch adds source, tests, schema documentation, and the implementation report.
It makes no dependency or compiler module changes.

## Open and use

Run the project using its normal development setup and open the existing internal
route /internal/pixel-lotus/tile-forge. Map Studio is the default tab.
Forge a tile, select it in the palette, and click or drag to place it on the map.
Use Select / move, the inspector, and the instance list to manipulate individual
placements. Layers, elevation, undo/redo, pan/zoom, custom SCDL compilation,
and portable JSON map save/load are included. Existing Chunk Preview remains.

## Validation

- 73 Tile Forge tests pass across 10 files, including new core and React UI tests.
- Changed-file ESLint, typecheck, and CSS token checks pass.
- Production build passes after running build prerequisites with node --import tsx
  to avoid the environment's tsx CLI IPC restriction.
- Broader repository lint and QA are not green; see IMPLEMENTATION-REPORT.md.
- Browser visual testing remains outstanding: available Chromium crashed before
  page load. Interaction tests use mocked canvas drawing, not visual screenshots.

## Publication status

All changes are committed locally. GitHub rejected the write with HTTP 403,
"Resource not accessible by integration". No remote branch or PR was created.
GitHub write access is required to publish the review branch. This is an initial
Tiled-inspired placement editor; full Tiled feature and file-format parity is
not claimed. See the report for known limitations and required visual retests.
