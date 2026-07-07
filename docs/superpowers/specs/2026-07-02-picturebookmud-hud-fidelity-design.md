# Design: pictureBookMUD Full-Fidelity MMORPG HUD

**Date:** 2026-07-02
**Status:** Approved
**Parent PDR:** `docs/scholomance-encyclopedia/PDR-archive/2026-07-02-pixelbrain-mmorpg-ui-system-pdr.md`
**Implementation home:** `Scholomance OS/client/pixelbrain-ui/`

## Goal

Take the existing Phase-1 PixelBrain MMORPG UI shell from flat prototype panels to a
professional-grade HUD: layered visual depth, a full layout edit mode (move + resize +
persist), and a unique high-fidelity storybook aesthetic — all generated as deterministic
PixelBrain lattices, never stretched bitmaps.

## Decisions (locked with Damien)

| Question | Decision |
| --- | --- |
| Aesthetic | Evolve `pictureBookMUD` (storybook ink/parchment) to full fidelity |
| Resizable | Full layout edit mode: drag-move, corner/edge resize, z-order, save/restore |
| Scope | Combat-HUD deep pass; hidden panels inherit chrome only |
| Asset model | Deterministic seeded lattice generators (PDR §6.1 lattice-first) |
| Architecture | Panel-module compositor per PDR §18 module layout |

## 1. Visual Language

Every panel is a stack of lattice layers, like physical storybook collage:

1. **Cast shadow** — offset, dither-softened (dense at contact, sparse outward).
   Grows on hover/drag ("lifted page"), shrinks when pressed.
2. **Backing board** — dark leather/wood tone, slightly larger than the sheet,
   visible at the edges.
3. **Parchment sheet** — **deckled (torn) edges** from seeded noise: unique per
   panel, identical every session. Surface carries parchment grain (seeded
   value-noise mapped to a 3-tone palette ramp) and **woodcut crosshatch
   shading** along the inner bottom/right edges for carved depth.
4. **Ink border** — double stroke with **ink bleed** (adjacent darker cells with
   falloff, wet-nib look) and corner flourishes.
5. **Motifs** — wax seal (quest tracker), compass rose (minimap), stitched/rope
   sockets (hotbar slots), illuminated capital (panel titles).

**Bars** become inked gauges: carved groove with inner shadow, crosshatch fill,
ink-meniscus leading edge, rune tick marks, ink-splatter cracks at low health.

**Interactive states:** hover = ink darkens + lift; pressed = pushed in
(shadow shrinks); cooldown = radial ink-burn wipe; proc = gold-leaf glint.

**Determinism law:** all animation keys off `currentTick`; no `Math.random`,
`Date.now`, or `performance.now` anywhere in chrome or animation paths.

## 2. Lattice Chrome Generators — `core/latticeChrome.js`

Pure seeded functions produce `PixelBrainCell[]` (integer cells with `partId`
per layer: `shadow | board | parchment | rim | motif`):

- Seed = string hash of panel id mixed with dimensions; PRNG is mulberry32-style.
- Sub-generators: `deckledEdge`, `parchmentGrain`, `inkBorder`,
  `crosshatchRegion`, `waxSeal`, `ropeSocket`, `cornerFlourish`, `compassRose`.
- Same inputs ⇒ byte-identical cell lists (unit-tested).

**Baking:** each panel's chrome lattice is painted once to an OffscreenCanvas
keyed by `(variant, w, h, themeId)`. Per-frame cost is a blit, keeping the HUD
inside the PDR §15 2 ms budget. Resize **regenerates** the lattice at the new
size — pixels are never stretched. Cache is invalidated on resize and theme swap.

## 3. Panel Painter Modules — `panels/`

The monolithic per-id `if` chain in `canvasRenderer.js` (~950 lines) splits into
one module per panel, each exporting
`paint(ctx, node, rect, theme, tick, gameState)`:

`playerFrame`, `targetFrame`, `limbDiorama`, `hotbar`, `minimap`,
`questTracker`, `chat`, `spellInput`, `bossAlerts`, `partyFrames`.

A registry maps node id/type → painter. `canvasRenderer.js` becomes a thin
compositor: resolve layout → blit baked chrome → call painter for dynamic
content → draw edit-mode overlays.

Hidden panels (inventory, skill tree, social) render through the same chrome
system automatically; their **content** is untouched this pass.

## 4. Edit Mode + Interaction — `core/interaction.js`

- `L` (Layout) toggles edit mode (chosen to sit beside the existing H/I/K/O
  panel toggles); panels show dashed ink outlines and ink-bracket corner/edge
  handles.
- **Move:** drag panel body; 4 px grid snap; anchor-aware (panel stays glued to
  its screen corner/edge on window resize).
- **Resize:** drag handles within per-panel min/max; chrome re-bakes live at
  the new size.
- **Z-order:** click brings a panel to front; `locked` panels are immovable.
- **Persistence:** `SavedUILayout` JSON (PDR §25 schema) in localStorage;
  restored on boot; reset-to-default action provided.

## 5. Verification

- **Vitest** (already configured in the submodule):
  - lattice determinism: same seed → identical cells,
  - layout save/load roundtrip,
  - hit-testing and resize clamping math.
- **Visual:** Playwright windowed screenshots of the running client, default
  and edited layouts, at 1280×800 (Steam Deck) and 1920×1080.

## Out of Scope (this pass)

- Inventory / skill-tree / social panel content redesigns
- Controller navigation, colorblind palettes (theme tokens stay compatible)
- The arcane-glass second theme (machinery is theme-agnostic; theme comes later)
