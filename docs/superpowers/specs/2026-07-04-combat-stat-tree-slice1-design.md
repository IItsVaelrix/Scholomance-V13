# Combat Stat Tree — Slice 1 (Movement / Attack / Range)

**Date:** 2026-07-04
**Status:** Approved (design), pending implementation plan
**Target surface:** the **Phaser combat arena** (`src/phaser/CombatArenaScene.js` +
`src/pages/Combat/CombatPage.jsx`) — the combat that is actually rendered and playable.

## Goal

Establish the first three stats of the game's MMORPG stat tree — **movement points**,
**attack points**, and **attack range** — as canonical, stat-driven combat primitives, and wire
them into the arena the player actually sees so they genuinely function.

This is the first slice of a stat system designed to grow. The registry defined here is the tree
root; future stats are added as new registry entries.

## Current state (verified)

- **The rendered combat is the Phaser arena.** `CombatPage.jsx` renders `ArenaCombatView` →
  `CombatArenaScene.js` and a spell-writing HUD that dispatches `combat-cast` CustomEvents to the
  scene. This is the surface players interact with.
- The arena already has a **player character** on an iso grid (`this.playerGridPos = { tx, ty }`)
  with **working keyboard movement** (`handleGlobalKeydown`, arrow/WASD, walk animation + iso
  tween). That movement is **unlimited**: no point cost, no turn, no cap.
- The arena has **no enemy/target entity, no HP, no attack, no attack range, no stats, and no
  turn concept.**
- `src/hooks/useBattleSession.js` is a rich battle-state hook, but it has **zero consumers** —
  nothing renders it. It is NOT the target of this slice.
- `codex/core/tactical.engine.js` / `battle.schemas.js` are a separate card-battler system with
  its own `movement`/`attack`/`range` stats. Not touched here.
- `tests/unit/combatSelectors.movement.test.js` imports a nonexistent
  `src/pages/Combat/state/combatSelectors.js` — a pre-existing broken test, unrelated to the
  arena. Left as-is (out of scope; it belongs to the orphaned hook path).

## Decisions

- **Target surface:** the Phaser arena (confirmed). Work must be visible/playable.
- **Movement model:** a per-turn **movement-point pool** (default **3 MP**). Each tile stepped
  costs **1 MP**. When the pool hits 0, the existing keyboard walk is blocked until End-Turn.
- **Attack model:** a **new basic-attack action** — target an enemy within `attackRange`
  (Manhattan tiles); deal `attackPoints` damage; usable **once per turn**.
- **Attack target:** the arena has no enemy, so this slice adds a minimal **sparring dummy**
  (reusing the existing `ideal-human-*` textures) at a fixed grid tile, carrying `hp`/`maxHp`. It
  is the attack target and makes damage visible/testable. No dummy AI.
- **Turn boundary:** an explicit **End-Turn control** (Space/Enter key **and** a HUD button) that
  refills movement points to full and re-arms the basic attack. No opponent AI in this slice.
- **Architecture principle:** stat/turn logic lives in **pure, framework-free modules** (fully
  unit-tested). The Phaser scene and React HUD are thin consumers. No game logic buried in the
  2400-line render file.

## Architecture (4 units)

### 1. `combatStats` registry — the stat-tree root *(new, pure)*

Location: `src/game/combat/combatStats.js`.

Data-only definitions, one entry per stat: `{ key, label, category, base, min, max, description }`.

Slice-1 entries:

| key             | category | base | min | max | meaning                                    |
| --------------- | -------- | ---- | --- | --- | ------------------------------------------ |
| `movementPoints`| mobility | 3    | 0   | 12  | MP pool per turn; 1 MP per tile stepped    |
| `attackPoints`  | offense  | 10   | 0   | 999 | damage dealt by a basic attack             |
| `attackRange`   | offense  | 1    | 0   | 12  | max Manhattan tiles a basic attack reaches |

Exports:
- `COMBAT_STATS` — ordered array of the definitions above.
- `buildDefaultStatBlock(overrides = {})` — returns
  `{ movementPoints, movementPointsRemaining, attackPoints, attackRange }` seeded from `base`
  values (with `movementPointsRemaining === movementPoints`), then shallow-merged with
  `overrides`. If `overrides.movementPoints` is given without `movementPointsRemaining`, the
  remaining pool is seeded to the overridden `movementPoints`.

The tree grows by adding registry entries here; consumers iterate `COMBAT_STATS`.

> **Vocabulary note:** the card-battler schema uses `movement`/`attack`/`range`. Not unified here
> (YAGNI). Future mapping only: `movementPoints↔movement`, `attackPoints↔attack`,
> `attackRange↔range`.

### 2. `CombatStatController` — pure turn/stat engine *(new, pure)*

Location: `src/game/combat/combatStatController.js`.

Framework-free class holding per-entity state; the scene syncs grid positions into it and reads
decisions back out. No Phaser, no React, no DOM — fully unit-testable.

Per-entity record: `{ ...statBlock, hp, maxHp, position: { tx, ty }, attackUsed }`.

Interface (exact):
- `constructor()`
- `registerEntity(id, { overrides = {}, hp = null, maxHp = null, tx = 0, ty = 0 } = {})` — builds
  the stat block via `buildDefaultStatBlock(overrides)`, sets position and (optional) HP,
  `attackUsed = false`. Returns the record.
- `getEntity(id)` → the record (or `undefined`).
- `setPosition(id, tx, ty)` → updates stored position.
- `canMove(id)` → `boolean` (`movementPointsRemaining >= 1`).
- `spendMove(id)` → if `canMove`, decrement `movementPointsRemaining` by 1 and return `true`;
  else return `false` (no mutation).
- `manhattan(id, targetId)` → `number` (`|dtx| + |dty|` between stored positions).
- `inRangeTargetIds(attackerId, candidateIds)` → array of ids from `candidateIds` that are living
  (`hp > 0` when HP tracked) and within `attackRange` Manhattan of the attacker.
- `canAttack(attackerId, targetId)` → `boolean` (attacker `!attackUsed`, target within
  `attackRange`, target `hp > 0` when HP tracked).
- `resolveAttack(attackerId, targetId)` → if `canAttack`, subtract attacker `attackPoints` from
  target `hp` (clamped ≥ 0), set attacker `attackUsed = true`, and return
  `{ damage, targetHp, targetDefeated }`; else return `null`.
- `endTurn(id)` → set `movementPointsRemaining = movementPoints` and `attackUsed = false`;
  returns the record.

### 3. `CombatArenaScene` wiring *(modified — `src/phaser/CombatArenaScene.js`)*

- Instantiate one `CombatStatController` in `create()`. `registerEntity('player', { tx:4, ty:6 })`
  and spawn a **sparring dummy**: a container reusing `ideal-human-f0` (+ existing idle tween) at
  a fixed tile (e.g. `tx:4, ty:3`), registered as `registerEntity('dummy', { hp:100, maxHp:100,
  tx:4, ty:3 })`.
- **Gate movement:** in `handleGlobalKeydown`, before starting the walk, require
  `controller.canMove('player')`; if false, ignore the key (optionally flash "No MP"). On a
  committed move, call `controller.spendMove('player')` and `controller.setPosition('player',
  newTx, newTy)` (keep `playerGridPos` as-is; controller mirrors it).
- **Basic attack:** on the attack key **`F`** (and on a `combat-attack` window event from the
  HUD), pick the first `controller.inRangeTargetIds('player', ['dummy'])`; if present, call
  `controller.resolveAttack('player', targetId)`, play a brief attack animation/flash on the
  dummy, and — on `targetDefeated` — fade the dummy out.
- **End turn:** on **Space or Enter** (and on a `combat-endturn` window event), call
  `controller.endTurn('player')`.
- **HUD sync:** after any state change (move/attack/end-turn/spawn), dispatch a
  `window` CustomEvent `combat-stats-changed` with
  `detail: { movementPointsRemaining, movementPoints, attackPoints, attackRange, attackUsed,
  dummyHp, dummyMaxHp }`. Listen for `combat-attack` and `combat-endturn` events from the HUD.
  Register/remove these listeners alongside the scene's existing keydown listener lifecycle.

### 4. Stat HUD *(modified — `src/pages/Combat/CombatPage.jsx`)*

- A small overlay panel (styled to match the existing DivWand HUD) showing:
  `MP {remaining}/{max} · ATK {attackPoints} · RNG {attackRange}` and `Dummy HP {hp}/{max}`.
- State comes from a `combat-stats-changed` window-event listener (registered in a `useEffect`,
  cleaned up on unmount).
- Two buttons: **Attack** (dispatch `combat-attack`, disabled when `attackUsed`) and **End Turn**
  (dispatch `combat-endturn`). These mirror the `F` / `Space` keys.

## Turn / data flow

Per turn: move up to 3 tiles (1 MP each) **and** take one basic attack (if a target is in range).
Space/Enter (or the End-Turn button) refills MP to 3 and re-arms the attack. The scene owns
rendering + input; the controller owns all stat/turn decisions; the HUD is a read-only mirror
plus two event-dispatching buttons.

## Error handling

- Controller methods are guard-first and side-effect-free on failure: `spendMove`, `resolveAttack`
  return `false`/`null` without mutating when preconditions fail. `manhattan`/`inRangeTargetIds`
  tolerate missing entities by returning `Infinity`/`[]`.
- The scene ignores movement when `canMove` is false and ignores attacks when there is no in-range
  target; neither throws.
- HUD event listeners are defensive: a malformed/absent `detail` leaves the last known state.

## Testing

- **Unit — registry** (`combatStats.test.js`): `buildDefaultStatBlock()` returns
  `{ movementPoints:3, movementPointsRemaining:3, attackPoints:10, attackRange:1 }`; overrides
  merge; overriding `movementPoints` seeds `movementPointsRemaining` to match.
- **Unit — controller** (`combatStatController.test.js`):
  - `spendMove` decrements and refuses at 0.
  - `endTurn` refills `movementPointsRemaining` to `movementPoints` and clears `attackUsed`.
  - `canAttack`/`inRangeTargetIds` respect `attackRange` (in vs out of range) and `hp > 0`.
  - `resolveAttack` subtracts `attackPoints` (clamped ≥ 0), sets `attackUsed`, reports
    `targetDefeated` at 0 HP, and refuses a second attack in the same turn.
- **Manual (in-app):** load the arena, walk and watch MP tick 3→0 and further moves blocked; press
  End-Turn (Space) and confirm MP refills; stand within `attackRange` of the dummy, press `F`,
  confirm dummy HP drops by `attackPoints` and a second attack is refused until End-Turn; verify
  the HUD readout + buttons stay in sync.

## Out of scope (deferred)

- Opponent/dummy AI, movement, or retaliation.
- Terrain-weighted movement cost, diagonal movement, pathfinding around obstacles.
- Tile-highlight rendering of reachable/attackable tiles in Phaser.
- Armor/mitigation on damage.
- Unifying with the card-battler `TacticalCardStats` schema, or wiring the orphaned
  `useBattleSession` hook.
- Any progression/skill-tree UI for *spending* points to raise stats.
