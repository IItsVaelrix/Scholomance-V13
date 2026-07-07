# Portal Warden — Void Acolyte Mini-Boss

**Date:** 2026-07-05  
**Status:** Design approved (interact-to-spawn confirmed)  
**Author:** Damien + Claude  
**Depends on:** Enemy AI Council (`docs/superpowers/specs/2026-07-04-enemy-ai-council-design.md`)

## 1. Goal

After both flank sentinels are defeated, defer combat victory and unlock the NE dimensional portal. A PixelBrain ice-biome transformation and Phaser cutscene sell the world shift. The player **chooses** to engage by interacting with the portal; a **Void Acolyte** mini-boss spawns and threatens a 2–3 turn kill if VOID Gravity catches them.

Secondary goal: prove the `combatAI` bestiary plug-in on a **second species** with a distinct role (`bruiser`) and a custom ability kit (not sentinel burn/ML).

## 2. Combat flow (three acts)

| Act | Trigger | Outcome |
|-----|---------|---------|
| **I — Sentinels** | Obelisk threatened | Existing sentinel fight; council AI |
| **II — The Freeze** | `areAllSentinelsDefeated()` | **No victory.** Ice-ray cutscene → ice biome → portal unlocks |
| **III — Void Acolyte** | Player adjacent to portal + interact | Boss spawns, aggro, fierce fight; victory only on boss death |

`triggerCombatVictory()` must **not** run when the last sentinel dies. It runs when `portal-warden` HP reaches 0.

## 3. Act II — Ice-ray cutscene (Phaser, in-scene)

**Duration:** ~3.5s (full); ~0.8s (reduced motion).

**Sequence:**

1. Freeze player input.
2. Camera zoom-out vignette; starfield overlay; island shrinks toward center.
3. Additive **ice ray** from off-screen top → island center; bloom + camera shake on impact.
4. White-blue flash; mid-flash call `applyIceBiome(scene)`.
5. Ice-smoke particle burst on all `icePeakPositions`; portal energy shifts purple → cyan.
6. Release input; terminal: `[PORTAL] The ward unseals. The island freezes.`
7. Set `scene.portalPhase = 'beckoning'`.

**Reduced motion (`prefers-reduced-motion`):** skip zoom/starfield; flash + palette swap only.

## 4. PixelBrain ice biome conversion

**Module:** `src/game/combat/arenaBiomeTransform.js`

**Authority:** Palette from PixelBrain `void_ice_floor.scdl` fixture (`frost`, `snowbase`, `snowlit`) via `transmuteMaterialPalette` / material registry — not ad-hoc hex swaps.

**`applyIceBiome(scene)`:**

- Retint voxel terrain graphics: obsidian/voidsteel bands → `void_ice`-dominant + `cyan_glow` accents.
- Update lattice interactive tile fills to ice sheen.
- Increase ice-smoke emitter frequency.
- Set `scene.arenaBiome = 'frozen'`.

Deterministic; unit-testable palette remap table.

## 5. Portal interaction

**Tile:** `(8, 0)` — existing `drawTeleportationPortal()` anchor.

**After Act II:**

- Add `combat-portal` to scene target registry.
- `portalPhase === 'beckoning'` → interactable; not a combat target until boss spawns.
- Inspect tooltip (`buildInspectPresentation`):

  > **Dimensional Portal**  
  > *The Portal beckons... if you dare.*

**Spawn trigger:** Player on tile adjacent to `(8,0)` + interact action (same pattern as obelisk). **Not** auto-spawn on cutscene end.

**On interact:**

- Spawn `portal-warden` entity at portal platform tile.
- Register in `CombatStatController`; aggro immediately.
- `portalPhase = 'engaged'`.
- Re-engage battle music.
- Terminal: `[PORTAL] A Void Acolyte steps through the seal.`
- Lock portal from re-interact.

## 6. Void Acolyte — stats & AI

| Field | Value |
|-------|-------|
| Entity id | `portal-warden` |
| Bestiary id | `void-acolyte` |
| Role | `bruiser` |
| INT | 52 (`tactical`) |
| HP / maxHp | 120 |
| BAPO (scholomance) | 22 |
| attackRange | 1 |
| movementPoints | 4 |
| Personality | High `AGGRO_BRAIN`, low `SURVIVAL_BRAIN` |

**`combatAI` block** on `voidAcolyte.entry.js`:

- `buildProfile`: melee, `preferredRange: 1`, `role: 'bruiser'`, `weightOverrides: { SURVIVAL_BRAIN: 0.3 }`.
- `buildAbilityKit`: `estimateAttackDamage`, `canActFromRange` (dist ≤ 1).

Council drives movement (advance/flank); ability kit handles burst when `action.kind === 'attack'`.

## 7. VOID Gravity & burst kit

**New module:** `src/game/combat/voidAcolyteCombatAbilities.js` (mirrors `sentinelCombatAbilities.js`).

### VOID Gravity

| Param | Value |
|-------|-------|
| Trigger range | Manhattan ≤ 3 from player |
| Cooldown | 4 turns |
| Pull | Move player to nearest free tile **adjacent** to acolyte (path/block aware) |
| Lock | `void_gravity_lock` for **2 turns** |
| Lock effect | `canMove('player') === false`; `movementPointsRemaining = 0` |
| Log | `[VOID] Gravity well — you are anchored in the hollow.` |

Player **may still cast weave** while locked; cannot reposition.

### Burst abilities

| Ability | Condition | Damage | AP |
|---------|-----------|--------|-----|
| `void_gravity` | dist ≤ 3, CD ready | 0 + pull + lock | — |
| `void_lash` | dist ≤ 1 | ~12 | 3 |
| `void_execution` | dist ≤ 1 **and** player locked | **~40** | 5 |
| `basic` | fallback | ~11 | 3 |

**Kill budget (100 HP player, caught):**

- Catch turn: lash ~12 after pull
- Turn +1: execution ~40
- Turn +2: execution ~40 → dead

**Selection (`planVoidAcolyteAttack`):**

1. If gravity ready and dist ≤ 3 → `void_gravity`
2. Else if dist ≤ 1 and player locked → `void_execution`
3. Else if dist ≤ 1 → `void_lash`
4. Else → `basic` (should rarely fire; council closes first)

**Counterplay:** Stay outside range 3 after acolyte moves; use Guard before close (halves execution); weave while locked.

### CombatStatController extensions

- `setVoidLocked(id, turns)` / decrement on `endTurn`
- `isVoidLocked(id)` checked in `canMove`
- `pullEntityAdjacent(pullerId, targetId, blocked)` — pure, tested

## 8. Scene integration

### Sentinel defeat hook

Replace `triggerCombatVictory()` call in `defeatSentinel` when all sentinels down with `triggerPortalUnseal()`:

- Plays ice cutscene
- Applies ice biome
- Sets portal phase; **does not** stop music for final victory yet

### Enemy turn generalization

Extract `performEnemyTurn(entityId, launchFn)` from `performSentinelAttack`:

- `driveEnemyTurn` → movement → guard/wait/attack
- Attack: `planVoidAcolyteAttack` + `resolveVoidAcolyteAbility` for warden; existing sentinel path for sentinels

### Victory

On `portal-warden` defeated:

```
[VICTORY] The Void Acolyte falls. The dimensional seal collapses.
```

Telemetry flag: `portalWardenDefeated: true`.

## 9. Module layout

**New:**

| Path | Responsibility |
|------|----------------|
| `src/game/combat/arenaBiomeTransform.js` | PixelBrain ice palette remap + scene retint |
| `src/game/combat/voidAcolyteCombatAbilities.js` | Gravity, lash, execution, plan/resolve |
| `src/game/combat/bestiary/entries/voidAcolyte.entry.js` | `combatAI` + dossier |
| `src/ui/combat/PortalIceCutscene.jsx` OR Phaser method | Ice-ray cutscene (Phaser in-scene per design) |
| `tests/unit/combat/voidAcolyteCombatAbilities.test.js` | Gravity lock, execution gate, damage |
| `tests/unit/combat/arenaBiomeTransform.test.js` | Palette remap |
| `tests/unit/combat/ai/voidAcolyteCombatAI.test.js` | Kit + profile |
| `tests/unit/combat/portalPhase.test.js` | Phase state machine (if extracted) |

**Modified:**

| Path | Change |
|------|--------|
| `src/phaser/CombatArenaScene.js` | Cutscene, biome, portal interact, warden spawn, generalized enemy turn |
| `src/game/combat/combatStatController.js` | Void lock, pull adjacent |
| `src/game/combat/combatInspectCopy.js` | Portal inspect copy |
| `src/game/combat/bestiary/index.js` | Register void acolyte |
| `src/pages/Combat/CombatPage.jsx` | Portal phase terminal lines |

## 10. Testing

- **voidAcolyteCombatAbilities:** gravity pulls to adjacent tile; lock blocks `canMove`; execution only when locked; 2–3 turn damage sim ≥ 90 on 100 HP dummy.
- **arenaBiomeTransform:** frozen palette keys map correctly.
- **driveEnemyTurn:** warden produces advance+attack when distant.
- **combatStatController:** void lock lifecycle across `endTurn`.
- **Regression:** full `tests/unit/combat/` green; SCD64 on new modules.

## 11. Out of scope (YAGNI v1)

- Second arena layout or scene transition
- Portal weave-casting
- Void Acolyte unique sprite animation (placeholder silhouette OK; SCDL `void_acolyte` asset exists for future)
- Line-of-sight beyond existing reachability
- Multi-phase boss (adds, enrage timers)
- Auto-spawn on cutscene end

## 12. Migration notes

- `planSentinelReposition` stays exported; unused by scene after council work.
- Battle music: pause after sentinel phase optional; re-engage on warden spawn.
- `combatVictoryAchieved` remains false until warden dies; `shouldEngageCombatBattle` respects warden aggro.