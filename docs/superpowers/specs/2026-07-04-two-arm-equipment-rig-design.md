# Two-Arm Equipment Rig — swing · shield-block · dual-wield (Slice 3)

**Date:** 2026-07-04
**Status:** Approved (design), pending implementation plan
**Target surface:** the Phaser combat arena (`src/phaser/CombatArenaScene.js`) + new pure/data
modules + SCDL assets + `CombatPage.jsx` HUD.
**Builds on:** Slice 1 (stat tree) and Slice 2 (attack animations + fire combat-chess). The fire
enchant / damage / DoT logic from Slice 2 is preserved; only the *swing visual* changes.

## Goal

Replace the flat, frame-locked character arms with a **runtime joint rig** so the arms articulate:

1. Both arms become jointed chains (shoulder → elbow → wrist → hand), driven at runtime.
2. The **right arm** performs the crusader **sword swing** as real joint rotation (via
   `gear-glide-amp`), replacing Slice-2's single-sprite weapon rotation.
3. The **left arm** holds a **shield** and can **block** (raise to a guard pose + a `guarding`
   flag, ready to mitigate future incoming attacks).
4. Hands are **equipment-driven**: a main-hand slot and an off-hand slot. The off-hand takes a
   shield or a weapon (**dual-wield**, cosmetic this slice).

The joint machinery already exists in the offline pipeline (`voxel-rig.js`, `voxel-keyframe.js`,
`character-construction-skeleton.js` anchors); this slice brings that *idea* into the live combat
runtime with focused 2D modules.

## Current state (verified)

- The combat player is a Phaser container of frame-locked full-canvas sprites (base + armor +
  `weapon`), all sharing baked SCDL frames `f0`(idle)/`f1..f8`(walk). The **arms are baked into
  those flat frames** — no runtime pivots.
- `IdealHuman.scdl` authors the body as named `part`s including **`armL`** and **`armR`** (each
  with deltoid/elbow/forearm/hand geometry), and `frame N` blocks reposition parts per walk frame.
  The SCDL CLI (`codex/core/pixelbrain/scdl/scdl.cli.js`) compiles a **whole file** to composite
  per-frame PNGs — there is **no per-part export flag**, so segments must come from separate SCDL
  files.
- Equipment: `equipment-changed` CustomEvent (dispatched by `src/ui/inventory/InventoryOverlay.jsx`)
  carries `detail` keyed by slot (`head/chest/legs/boots/weapon`) → item. The scene's
  `handleEquipmentChange` maps each slot to an armor-layer sprite and sets `${assetId}-f0`. There is
  **no off-hand slot** today.
- `src/data/itemDatabase.js` entries: `{ id, assetId, name, type, rarity, icon, sprite }` — no
  `slot` field, no `shield` type.
- `CombatStatController` (Slice 1) holds per-entity combat state; it has no guard concept.
- Slice-2's `performSwing(element)` rotates the single weapon sprite; the fire streak/particles/
  enchant/DoT are separate and stay.

## Decisions (from brainstorming)

- **Both arms rigged**, right = main hand (swings), left = off hand (shield/weapon).
- **One-handed** main-hand swing (single open kinematic chain, no IK).
- **Block** = left-arm shield-raise pose + a `guarding` flag; **mitigation math deferred** (nothing
  attacks the player yet).
- **Dual-wield** = off-hand can hold a weapon **cosmetically**; only the right arm attacks.
- Segments **authored in SCDL** (split the existing `armL`/`armR` geometry); the baked body is
  re-authored **armless**.
- **Walk-swing deferred:** both rig arms hold a static carry pose during walk this slice.

## Architecture (7 units)

### 1. SCDL assets (art pipeline)

Authored `.scdl` sources compiled via `scdl.cli.js --export png` (per SCDL naming/out-dir law):

- **`IdealHuman-body-noArms.scdl`** — `IdealHuman.scdl` with the `armL` and `armR` parts and their
  per-frame overrides removed → compiles to `body-noArms-f0…f8` (full walk, no arms).
- **`armR-upper.scdl`, `armR-fore.scdl`, `armR-hand.scdl`** and **`armL-upper.scdl`,
  `armL-fore.scdl`, `armL-hand.scdl`** — the existing arm geometry partitioned into three
  canvas-framed segment sprites per arm (6 single-frame PNGs). Split lines: upper = deltoid→elbow,
  fore = elbow→wrist, hand = wrist→fingertips (the hand carries the grip).

### 2. Equipment slots + shield — `src/data/itemDatabase.js` (extended)

- Add a **`slot`** field to entries: `mainHand` | `offHand` | (armor slots keep their `type`).
- Add a **`shield`** `type` and at least one shield entry (`slot: 'offHand'`), plus allow existing
  weapons to be equipped in `offHand` (dual-wield).
- The `weapon` slot is treated as `mainHand`; a new `offHand` slot renders the left-hand payload.

### 3. Arm-rig config (plug-and-play data) — `src/data/armRigConfig.js`

Data-only (mirrors the element-DB philosophy). Defines, per arm (`right`, `left`):

- `segments`: ordered `[{ key, spriteKey, pivot:{x,y}, childOffset:{x,y}, restAngleDeg }]` from
  shoulder outward; the hand segment adds `gripPoint:{x,y}` (where a held item's hilt attaches).
- `mirror`: boolean (left arm renders mirrored).

And a shared **pose library** — named joint-angle sets consumed by animations:

- `carry` (both arms, rest), `swing` (right: windup + strike angles), `block` (left: shield-raise
  angles). Poses are data → new poses/weapons need no scene edits.

Pivots/angles are tuned against the sprites (like Slice-2's `HAND_PIVOT`), exposed as constants.

### 4. Arm-rig forward kinematics (pure, tested) — `src/game/combat/armRig.js`

- `solveArm(armConfig, jointAnglesDeg) => [{ key, x, y, rotation }]` — parent-chained
  rotate-about-pivot from the shoulder outward (the 2D sibling of `voxel-keyframe.js`'s
  `T(−pivot)→R→T(+pivot)→T(childOffset)` compose order), mirror-aware for the left arm.
- `gripWorld(armConfig, jointAnglesDeg) => { x, y, rotation }` — resolves the hand's `gripPoint` in
  world space so a held item (sword/shield) can be parented to it.
- No Phaser, no DOM — fully unit-testable (known chain + angles → expected transforms; grip lands at
  the hilt).

### 5. Guard state — `CombatStatController` (extended, pure)

- `setGuarding(id, boolean)` sets `entity.guarding`; `endTurn` clears it. `registerEntity` seeds
  `guarding: false`. No mitigation math yet (documented hook for when enemies can attack).

### 6. Phaser integration — `CombatArenaScene.js` (modified)

- Load `body-noArms-f*` + the 6 segment sprites; build a `right` and `left` rig from `armRigConfig`.
- Each frame, set the 6 segment sprites' `{x,y,rotation}` from `solveArm(...)` for the current pose.
- Parent the **main-hand** payload to the right hand's `gripWorld`, and the **off-hand** payload to
  the left hand's `gripWorld`. Extend `handleEquipmentChange` to route `weapon`→mainHand and a new
  `offHand`→off-hand payload (shield or weapon).
- **Attack (`F`)** → animate the right arm from `carry`→`swing`→`carry` across the crusader arc with
  `gear-glide-amp` time-based rotation on the shoulder/elbow angles. This **replaces** Slice-2's
  `performSwing` weapon rotation; the fire streak + particles + `resolveEnchant`/DoT calls remain.
- **Block (`B` key + HUD button)** → animate the left arm to `block`, call
  `stats.setGuarding('player', true)`, emit stats; auto-return to `carry` and clear guard on End
  Turn.
- Walk/idle: both arms hold `carry`.

### 7. HUD — `CombatPage.jsx` (modified)

- Add a **Block** button (dispatches `combat-block`, mirrored by the `B` key) next to Attack/End
  Turn, and a small **guarding** indicator driven by `dummyStatuses`-style stat fields
  (`guarding` added to the `combat-stats-changed` payload).

## Data flow

Input → scene: existing `combat-attack` / `combat-endturn` plus new `combat-block` window events
(and `F`/`B`/Space keys). Equipment → scene: existing `equipment-changed` (now including `offHand`).
Scene → HUD: `combat-stats-changed` gains a `guarding` boolean. Each render frame, the scene asks
`armRig.solveArm` for segment transforms and applies them to sprites; held items follow
`gripWorld`.

## Error handling

- `armRig.solveArm` tolerates a missing/short angle array (falls back to each segment's
  `restAngleDeg`) and never throws; unknown pose name → `carry`.
- If a segment sprite texture is missing (asset not built yet), the scene hides that segment and
  logs once, so the character still renders (armless) rather than crashing.
- Equipment routing ignores unknown slots and missing textures (mirrors current
  `handleEquipmentChange` behavior: hide when absent).
- `setGuarding` on a missing entity is a no-op; `guarding` defaults to `false`.
- The swing animation always returns the arm to `carry` (tween `onComplete` **and** a safety
  `delayedCall`), so an interrupted swing can't strand a raised arm.

## Testing

- **Unit — `armRig`** (`armRig.test.js`): a two-segment chain at known angles yields the expected
  child position/rotation; `gripWorld` returns the hand tip for a rest pose; mirror flips X;
  missing angles fall back to rest without throwing.
- **Unit — item DB** (`itemDatabase.rig.test.js`): the shield entry has `type:'shield'`,
  `slot:'offHand'`; a weapon entry resolves to `mainHand`; an off-hand weapon is allowed.
- **Unit — guard** (`combatStatController.guard.test.js`): `setGuarding` toggles the flag;
  `endTurn` clears it; missing entity is a no-op.
- **In-app (Playwright, dev server `:5173`):** load the arena → the right arm articulates through
  the swing with the sword tracking the hand and returns to rest; press Block → the left arm raises
  the shield and the HUD shows guarding, which clears on End Turn; equip an off-hand weapon → it
  appears in the left hand (dual-wield) while only the right arm swings. (Verify on the **dev
  server**, not `vite preview`.)

## Out of scope (deferred)

- Block **mitigation math** and any enemy/dummy attacks to block against.
- **Dual-wield mechanics** (off-hand hits) — cosmetic only here.
- Arm articulation **during walk** (both arms hold a carry pose).
- **Two-handed** grips / inverse kinematics (off-hand tracking a moving hilt).
- Full-body rig (legs/spine/head remain baked frames).
- Left-arm swinging/attacking; per-arm elemental enchants beyond the existing right-hand path.
