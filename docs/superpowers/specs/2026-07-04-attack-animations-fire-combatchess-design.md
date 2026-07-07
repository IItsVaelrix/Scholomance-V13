# Attack Animations + Fire Combat-Chess (Slice 2)

**Date:** 2026-07-04
**Status:** Approved (design), pending implementation plan
**Target surface:** the Phaser combat arena (`src/phaser/CombatArenaScene.js`) + the pure
combat modules (`src/game/combat/*`) + a new plug-and-play element database (`src/data/*`).
**Builds on:** Slice 1 (combat stat tree) — see
`docs/superpowers/specs/2026-07-04-combat-stat-tree-slice1-design.md`.

## Goal

Give the basic attack real presentation and depth:

1. A **crusader sword swing** driven by the existing gear-glide-amp rotation logic.
2. A **white speed-streak** that sweeps the swing arc (recolored per element).
3. The dummy **glows** momentarily on a connecting hit (red for a plain hit, the element's
   color for an elemental hit).
4. **Floating damage numbers** above the dummy for hits and damage-over-time ticks.
5. **Combat chess:** an incantation (verse + weave) can make the swing **elemental** — starting
   with **fire**. Whether the enchant succeeds depends on the **linguistic quality** of the spell.
   Elements are defined in a **database that mirrors the equipment database**, so ice/poison/etc.
   are added as data, not code.

## Current state (verified)

- The player is a Phaser container of frame-locked sprites (base + armor + `weapon`), all sharing
  SCDL frames `f0` (idle) / `f1..f8` (walk). **There are no swing frames.** The `weapon` layer is a
  full-canvas sprite, so it cannot pivot at the hand by itself.
- Slice 1 added `performBasicAttack` (in-range check → `resolveAttack` → alpha-flash on dummy →
  `emitCombatStats`) and a sparring `dummy` entity via the pure `CombatStatController`
  (`src/game/combat/combatStatController.js`).
- `codex/core/pixelbrain/gear-glide-amp.js` exports **time-based** rotation:
  `getRotationAtTime(absoluteTimeMs, bpm, degreesPerBeat = 90, config = {})` → radians
  (frame-rate independent, BPM-syncable). This is the rotation logic to reuse.
- `codex/core/combat.scoring.js` `calculateCombatScore({ text, weave })` returns
  `{ totalScore, cohesionScore, damage, school, intent, statusEffect, rarity, failureCast, … }`.
  `CombatPage.handleCast` already runs it on verse+weave and dispatches a `combat-cast` event.
- Equipment DB convention (`src/data/itemDatabase.js`): a keyed object; each entry has
  `{ id, assetId, name, type, rarity, icon, sprite }`; the scene iterates it to register
  `${assetId}-walk` anims from `${assetId}-f{n}` frames.
- The existing "enchant flame" precedent (`handleCombatCast`) tints the sword and adds
  `doom-fire` particles — the seed of elemental swings, to be generalized by this slice.

## Architecture (5 units)

### 1. Element database — `src/data/combatElementDatabase.js` (new, data-only)

A keyed object mirroring `ITEM_DATABASE` conventions, one entry per element. Adding an element is
adding an entry — the scene iterates the DB, never hard-codes an element.

```js
export const COMBAT_ELEMENT_DATABASE = {
  element_fire: {
    id: 'element_fire',
    assetId: 'FireStreak',            // asset base; -f0 naming parity with items
    name: 'Immolation',
    type: 'fire',                     // element key (parallels item 'type')
    rarity: 'common',
    icon: '/assets/elements/FireStreak-icon.png',
    sprite: '/assets/elements/FireStreak-f0-png.png',
    triggers: ['fire', 'flame', 'burn', 'incinerat', 'immolat'], // incantation keyword match
    streakColor: 0xff6600,            // recolors the swing streak
    glowColor: 0xff3300,              // dummy hit-glow tint
    particleTint: 0xffaa00,           // particle color for the elemental swing
    status: { chainId: 'burn', damagePerTurn: 3, turns: 3, disposition: 'DEBUFF' },
  },
};

// Helper: first element whose triggers appear in the combined verse+weave text (or null).
export function matchElement(text) { /* lowercase scan over entries' triggers */ }
export function getElement(id) { /* lookup */ }
```

Asset paths mirror items for parity/future authored art, but the fire slice **must not depend on
those PNGs existing** — the swing streak is generated procedurally (unit 3) and tinted by
`streakColor`. If an authored `${assetId}-f0` texture is later added, the scene may prefer it.

### 2. Enchant resolution — `src/game/combat/enchantResolver.js` (new, pure)

Framework-free, deterministic (RNG injected), unit-tested.

- `computeEnchantSuccess(scoreData, rng) => { success: boolean, probability: number }`
  - `quality01 = clamp01(scoreData.cohesionScore ?? 0)` (primary linguistic-quality signal;
    tunable). 
  - `probability = failureCast ? 0 : (FLOOR + (CEIL - FLOOR) * quality01)`, with
    `FLOOR = 0.10`, `CEIL = 0.98`. So a crisp incantation is near-guaranteed, a sloppy one usually
    fizzles, a syntactic collapse (`failureCast`) always fizzles, and nothing is ever a perfect
    lock.
  - `success = rng() < probability`.
- `resolveEnchant({ text, weave }, scoreData, rng) => { element, success, probability } | { element: null }`
  - `element = matchElement(text + ' ' + weave)`; if none, return `{ element: null }` (plain swing).
  - Otherwise run `computeEnchantSuccess` and return the element + outcome.

`scoreData` is supplied by the caller (the scene runs `calculateCombatScore` on the current
verse+weave, reusing the live scoring pipeline).

### 3. Swing + streak + hit feedback — scene methods in `CombatArenaScene.js` (modified)

- **Procedural streak texture:** in `create()`, generate a white crescent `swing-streak` texture
  once via Phaser Graphics → `generateTexture` (no art dependency). Tinted white for a plain swing,
  `element.streakColor` for an elemental swing.
- **`performSwing(element)`** (element may be `null`):
  - Hide the equipped `weapon` layer for the swing's duration; show a standalone **swing-blade
    sprite** (same weapon texture as the equipped sword) anchored at a tunable **hand pivot**
    (`HAND_PIVOT = { x, y }` constant, calibrated against the running arena) so it rotates around
    the hand.
  - Rotate the blade through a **crusader overhead arc** (≈ `-135°` → `+45°`) using
    `getRotationAtTime` from gear-glide-amp to advance the angle smoothly over ~250 ms, clamped to
    the arc bounds. Restore the equipped weapon on completion.
  - Sweep the `swing-streak` sprite along the arc (fade out), tinted per `element` (white if
    plain). For an elemental swing, also emit a short particle burst tinted `element.particleTint`
    (reusing the `doom-fire`/existing particle path).
- **`showHitFeedback(targetId, { color, amount })`:** tint-glow the target container to `color`
  (red `0xff3300` for plain, `element.glowColor` for elemental) via a short yoyo tween, and spawn a
  **floating damage number** (Phaser text at the target's screen position, tween up + fade, then
  destroy). White text for plain hits, element color for elemental hits, orange for burn ticks.

### 4. Status / damage-over-time — extend `CombatStatController` (modified, pure)

- Entity records gain `statuses: []`.
- `applyStatus(id, { chainId, damagePerTurn, turns, disposition })` — upsert onto the entity
  (refresh `turns` if the same `chainId` already present). Returns the entity.
- `tickStatuses(id) => Array<{ chainId, damage, targetHp, targetDefeated }>` — for each active
  status: subtract `damagePerTurn` from `hp` (clamped ≥ 0), decrement `turns`, drop at 0. Returns
  one entry per tick so the scene can render floating numbers + glow and handle defeat.
- Existing `endTurn(id)` is unchanged (refills MP, clears `attackUsed`). Turn order: when the
  player ends their turn, the scene calls `tickStatuses('dummy')` **then** `endTurn('player')`, so
  burn ticks each round.

### 5. Rewire the attack — `performBasicAttack` in `CombatArenaScene.js` (modified)

New flow when a target is in range and `resolveAttack` succeeds (base `attackPoints` damage as
today):

1. Read the current verse+weave (from a `combat-cast`-style event the HUD provides, or an
   `input-state` request — see Data flow). Run `calculateCombatScore` on them.
2. `resolveEnchant({ text, weave }, scoreData, sceneRng)`.
3. `performSwing(outcome.success ? outcome.element : null)`.
4. `showHitFeedback('dummy', { color: elementalHit ? element.glowColor : 0xff3300, amount })`.
5. If elemental success, `stats.applyStatus('dummy', element.status)`.
6. If an element matched but the enchant **failed**, show a brief "fizzle" tell (small gray puff /
   desaturated streak); the swing still lands base damage (attack never wasted).
7. `emitCombatStats()` (now also includes active `dummy` statuses for the HUD).

## Data flow

The scene needs the current verse+weave at swing time. The HUD (`CombatPage`) already owns those
fields. Add a tiny request/response over `window` events (same pattern as `request-equipment-state`
→ `equipment-changed`):

- Scene dispatches `request-incantation-state`; HUD responds by dispatching `incantation-state`
  with `{ verse, weave }`. The scene caches the latest and uses it in `performBasicAttack`.
- HUD also proactively dispatches `incantation-state` on each verse/weave change so the cache stays
  warm. On no incantation, `{ verse: '', weave: '' }` → plain swing.

Hit/DoT numbers are rendered in-scene (Phaser), so no new HUD surface is required beyond the
existing MP/ATK/RNG/dummy-HP readout (which already reflects HP changes via `combat-stats-changed`).

## Error handling

- `matchElement` / `getElement` return `null` for no match / unknown id; the swing degrades to
  plain. `resolveEnchant` never throws on empty text.
- `computeEnchantSuccess` clamps `probability` to `[0, 1]`; missing/NaN `cohesionScore` → `0`
  (treated as lowest quality, not a crash).
- `performSwing` guards on missing sprites/textures and always restores the equipped weapon (via a
  tween `onComplete` **and** a safety `delayedCall`) so an interrupted swing can't leave the weapon
  hidden.
- `tickStatuses` tolerates entities without HP or without statuses (returns `[]`).
- If `calculateCombatScore` throws, the scene catches it and treats the swing as plain (logged).

## Testing

- **Unit — element DB** (`combatElementDatabase.test.js`): fire entry present with the documented
  fields; `matchElement('… flame …')` returns fire; `matchElement('nothing')` returns `null`;
  `getElement('element_fire')` returns the entry, unknown id → `null`.
- **Unit — enchant resolver** (`enchantResolver.test.js`): high `cohesionScore` → probability near
  `CEIL`; low → near `FLOOR`; `failureCast: true` → probability `0`; `success` follows the injected
  RNG deterministically (rng below prob → success, above → fizzle); no element match → `{ element:
  null }`.
- **Unit — controller DoT** (`combatStatController.test.js`, extended): `applyStatus` adds/refreshes
  a status; `tickStatuses` deals `damagePerTurn`, decrements `turns`, drops at 0, clamps HP ≥ 0, and
  reports `targetDefeated`.
- **In-app (Playwright, dev server `:5173`):** move adjacent to the dummy; with a strong fire
  incantation in the HUD, attack → observe an orange streak, red/orange dummy glow, a floating
  damage number, and (over subsequent End-Turns) burn ticks reducing dummy HP with their own
  numbers; with an empty incantation, attack → plain white streak + red glow + number, no burn;
  with a deliberately weak fire incantation, observe frequent fizzle-to-plain while still dealing
  base damage. (Per Slice 1: verify on the **dev server**, not `vite preview` — preview 404s the
  scene.)

## Out of scope (deferred)

- Additional elements (ice, poison, …) — they are added later as DB entries + assets; the fire
  slice proves the loop.
- Authored SCDL swing frames / authored streak & element PNG art (procedural streak is used now).
- Enemy AI, retaliation, or the dummy attacking back.
- Opponent-side status effects, resistances, or elemental interactions (fire vs ice, etc.).
- BPM/music syncing of the swing beyond what `getRotationAtTime` provides with a fixed bpm.
- Reworking the frame-locked equipment model or adding a real skeletal rig.
