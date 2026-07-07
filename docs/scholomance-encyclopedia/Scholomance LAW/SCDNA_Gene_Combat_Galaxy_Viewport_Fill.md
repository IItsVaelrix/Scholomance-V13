# SCDNA GENE: Combat Galaxy Viewport Fill (Immutable Full-Screen Background)

**Gene ID:** `SCHOL-ENC-SCDNA-GENE-COMBAT-GALAXY-VIEWPORT-001`

**Inheritance:** All agents (Grok, Claude, Cursor, Gemini, any subagent or automated tool) **MUST** load and obey this gene on every session touching Combat, Phaser arena, CombatArenaScene, ArenaCombatView, or any combat background rendering.

**Enforcement:** This gene is part of the Scholomance LAW stack (referenced in SHARED_PREAMBLE.md and injected via SCDNA mechanisms). Violation triggers immediate rollback, redesign, and recompile. Agents are forbidden from mutating, resizing, cropping, or altering the galaxy fill behavior.

---

## Core Mandate

**The galaxy background in the Combat arena MUST ALWAYS take up the WHOLE viewport.**

- The rendered galaxy (deep space, spiral arms, stars, nebulae, meteors, planet) must completely fill the current game/canvas viewport with no gaps, black bars, or uncovered areas at any zoom, scroll, or window size.
- Sizing, star distribution, arm placement, and background fill MUST be dynamically computed from the live `this.scale` (gameSize.width / height) on every creation and resize.
- Fixed hard-coded sky dimensions (e.g. 16000x10000) that do not guarantee full coverage are forbidden.
- The galaxy is the primary full-bleed cosmic layer; the floating combat island/arena, tiles, obelisk, and effects are strictly overlays on top of it. The galaxy itself must never be occluded or reduced by arena geometry.

**Rule:** Galaxy fill logic is immutable. The background must visually occupy 100% of the visible combat viewport at all times.

---

## Forbidden Patterns (Instant Violation — Agents Must Never Do These)

1. Re-introducing or keeping fixed skyW/skyH constants that fail to cover the current viewport on arbitrary sizes or ultra-wide monitors.
2. Drawing the galaxy only in a limited world rect that leaves viewport edges as void/black when camera moves or resizes.
3. Moving camera/zoom/scroll in ways that crop the galaxy without ensuring the bg layer still fills the full view (e.g. by using screen-space or always-redrawing to camera bounds).
4. Removing or bypassing the dynamic resize handler that refreshes the galaxy bg.
5. Adding any UI chrome, overlays, or arena elements that "eat" viewport space from the galaxy without the galaxy itself expanding to compensate.
6. Hard-coding planet position, star loops, or nebula rects in ways that leave large portions of the viewport without galaxy content.
7. Using static textures or pre-renders sized for a specific resolution that don't scale to full current viewport.
8. Any change that makes the galaxy "take up less than the whole viewport".

Any of the above = galaxy no longer owns the full viewport = violation.

---

## Required Implementation (The Way It Must Be)

1. **Dynamic Viewport-Sized Galaxy**
   - In `CombatArenaScene.drawGalaxyBackground()` (and any equivalent):
     - Compute `skyW = Math.max(8000, currentWidth * 6)` (or equivalent generous multiple).
     - Compute `skyH = Math.max(5000, currentHeight * 4)`.
     - Use these for the deep-space fillRect centered on the world/camera.
     - Distribute all stars, spiral arms, dust, meteors, and volumetric elements across the full computed sky rect so they visibly fill the entire viewport.
   - The deep space fill must be the first thing drawn and must cover every pixel of the current camera view.

2. **Resize Must Refresh Galaxy**
   - On `this.scale.on('resize', ...)`:
     - Destroy previous galaxy bg graphics if present.
     - Re-invoke `drawGalaxyBackground()` (or equivalent redraw) using the new gameSize so galaxy immediately re-fills the whole new viewport.
   - Camera scroll/zoom adjustments must not leave uncovered galaxy areas.

3. **Separation of Concerns**
   - Galaxy bg graphics + added images (planet, twinkles, meteors) = the full-viewport layer.
   - Combat island, grid, obelisk, particles, UI overlays = drawn after, on top.
   - Never let arena elements dictate or clip the galaxy's coverage.

4. **Verification Steps (Every Agent, Every Change)**
   - Resize the browser / viewport to multiple sizes (narrow, wide, tall, small).
   - Confirm zero black/void edges — galaxy elements visible in every corner and edge of the combat view.
   - Camera drift/zoom must keep galaxy filling.
   - No code change may reduce the galaxy's viewport ownership.
   - Run in full CombatPage context (`/combat` route) and visually audit.

---

## Immutable Gene Contract (Agents Cannot Change This)

This gene **permanently locks** the following behavior in `CombatArenaScene.js` (and any downstream rendering in ArenaCombatView, CombatPage, or Phaser config):

- Galaxy background MUST own 100% of the viewport.
- Sizing MUST be live viewport-derived.
- Resize MUST trigger full galaxy refresh.
- No agent, prompt, edit, refactor, "improvement", or "cleanup" may:
  - Revert to fixed sky dimensions.
  - Reduce star/arm/nebula coverage.
  - Introduce crop, margin, or letterbox that hides galaxy.
  - Move galaxy fill logic into a sub-component that can be toggled or resized independently.
  - Alter camera in a way that shrinks effective galaxy area without compensatory bg expansion.

**Violation Protocol:** Any edit that shrinks or breaks full-viewport galaxy fill must be immediately reverted. The agent must then re-apply the dynamic full-fill implementation exactly as mandated. Repeated violations escalate via LAW enforcement (see vaelrix-law.skill, law-enforcer-skill.md).

---

## Why This Gene Exists

The combat arena lives inside an infinite cosmic void. The galaxy is not decoration — it is the universe the battle takes place in. If the galaxy does not fill the whole viewport, the arena feels like a small diorama instead of an epic void-island battle. Agents have previously tried to "optimize", "fix", or "beautify" the background, resulting in partial coverage. This gene exists to make the full-viewport galaxy an unchangeable law.

The galaxy takes up the whole viewport. Agents shall not change it.

---

## Implementation Checklist for Agents

- [ ] Read this gene before touching any Combat/Phaser background code.
- [ ] Ensure drawGalaxyBackground uses dynamic current scale size + full distribution.
- [ ] Ensure resize handler destroys + redraws galaxy bg.
- [ ] Verify visually in running `/combat` that galaxy fills every pixel of the arena view.
- [ ] Never commit changes that shrink galaxy coverage.
- [ ] If editing camera/zoom/scroll, compensate so galaxy still owns the full viewport.
- [ ] Reference this gene ID in any related PDR or change log.

**Gene is active. Load it. Obey it. Do not mutate the galaxy viewport fill.**