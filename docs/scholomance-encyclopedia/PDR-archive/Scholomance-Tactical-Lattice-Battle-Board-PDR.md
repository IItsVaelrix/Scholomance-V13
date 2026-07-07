# PDR — Scholomance Tactical Lattice Battle Board

**Status:** Proposed design, pre-implementation
**Date:** 2026-07-04
**Author:** Scholomance Developer
**Feature Name:** Tactical Lattice Battle Board
**Classification:** Architectural, tactical combat, board-state system
**Priority:** High
**Related Systems:** Spellweave, Intent Octree, Combat Scoring, Phaser Combat Arena, Scene Target Registry, Iso Lattice Projection, Obelisk Tutorial Secret

---

## 1. Problem Statement

Scholomance combat is evolving from direct action into a tactical spell system, but the battlefield itself is not yet carrying enough strategic weight.

Current combat has several strong pieces:

```txt
Spellweave gives the player a grammar.
The intent octree gives spells a typed vocabulary.
The combat scene gives those spells a place to happen.
The obelisk secret proves world objects can react to spell logic.
```

However, the battle board still needs to become a **tactical decision space**, not merely a backdrop where attacks occur.

The target design is not a generic RPG battle arena. Scholomance combat should feel like:

```txt
Chess      = positioning, threat, reach, control, sacrifice
Scrabble   = premium board squares, tactical multipliers, positional scoring
Spellweave = language-driven action grammar
PixelBrain = readable magical tile identity
```

The missing layer is a deterministic **Tactical Lattice Battle Board** that converts the current map into a clean combat board, removes visual clutter, exposes special tile rules, and makes movement itself part of spell strategy.

---

## 2. Product Vision

When combat begins, the overworld does not vanish.

Instead, reality **decompiles**.

```txt
Exploration map
  ↓
Matrix / glyph / binary flood for ~3 seconds
  ↓
Buildings and noncombat clutter dissolve into code
  ↓
The same location becomes a tactical lattice
  ↓
Special battle tiles reveal hidden magical rules
  ↓
Combat begins on a readable chess-like board
```

The player should understand:

> “I am still in the same place, but the world has revealed its combat grammar.”

This gives combat spatial continuity while making the board more tactical, more readable, and more magical.

---

## 3. Design Pillars

### 3.1 Chess First

The combat board must reward:

```txt
position
threat range
line control
zone denial
tempo
sacrifice
baiting
flanking
height
tile occupation
```

The player should win because they understood the board, not because they only picked the biggest damage spell.

### 3.2 Scrabble as Tactical Geography

The Scrabble inspiration is not about spelling words on the board.

It is about **premium positional value**.

Scrabble has ordinary squares, double-letter squares, triple-word squares, center anchors, and high-value placement choices. Scholomance should use that logic for spell tactics:

```txt
Fire tile       = boosts fire actions
Void tile       = improves siphon, corruption, teleport, or drain
Rune tile       = improves spell quality or adds dice
Sonic tile      = improves resonance, chaining, machinery interactions
Null tile       = weakens or blocks magic
High tile       = improves range and accuracy
Anchor tile     = ritual center or control point
```

The board should make the player ask:

```txt
Can I reach that tile before the enemy?
Can I force the enemy off that tile?
Can I stand on a dangerous tile for one powerful cast?
Can I use this tile to overload a machine?
Can I deny the opponent their best square?
```

### 3.3 Same Map, Combat Projection

The player should recognize the original map footprint.

Combat mode should remove:

```txt
buildings
clutter
decorative props
noncombat obstacles
visual noise
```

But preserve:

```txt
terrain shape
elevation
walkable paths
important landmarks
interactive machines
hazards
special tiles
```

The battle scene is a **projection** of the map, not a separate map.

### 3.4 Deterministic Board State

The same encounter seed and same map state must produce the same battle board.

No hidden randomness in tactical tile placement unless seeded and recorded.

```txt
same map + same encounter seed + same battle compiler version
= same tactical board
```

### 3.5 Tactical Readability Over Visual Excess

Matrix code, tile glow, spell VFX, and HUD feedback must not become visual soup.

The transition can be intense.

The battle board itself must become readable.

---

## 4. Scope

| In Scope                                       | Out of Scope                               |
| ---------------------------------------------- | ------------------------------------------ |
| Matrix / binary / glyph transition into combat | Full cinematic cutscene system             |
| Same-map battle projection                     | Separate random battle arenas              |
| Clutter removal during battle projection       | Destroying overworld buildings permanently |
| Tactical tile modifier system                  | Full terrain editor UI                     |
| Chess-like movement and threat rules           | Real-time action combat                    |
| Scrabble-style premium tiles                   | Literal word placement on map              |
| Spellweave interaction with tile modifiers     | Rewriting Spellweave grammar               |
| Deterministic board compiler                   | Networked multiplayer sync v1              |
| Basic enemy tile awareness                     | Grandmaster AI v1                          |
| Tile hover / inspect / tooltip rules           | Full tutorial campaign redesign            |

---

## 5. Core Battle Loop

```txt
1. Encounter triggers
2. Screen floods with Matrix binary / Scholomance glyph code
3. Current map freezes
4. Battle compiler creates tactical board projection
5. Buildings and clutter dissolve into code silhouettes
6. Combat-relevant terrain remains
7. Special tiles ignite and label themselves briefly
8. Player and enemies snap to legal battle cells
9. Tactical HUD appears
10. Player acts using movement + Spellweave + tile strategy
11. Combat ends
12. Board projection collapses
13. Overworld returns
```

---

## 6. Battle Transition

### 6.1 Visual Sequence

```txt
T+0.0s  Encounter detected
T+0.2s  Screen edges crawl with green / violet binary code
T+0.6s  World geometry flickers into wireframe
T+1.2s  Buildings become translucent code silhouettes
T+1.8s  Noncombat clutter dissolves upward
T+2.2s  Tactical grid appears under characters
T+2.6s  Special tiles pulse once by school
T+3.0s  Combat camera locks and HUD opens
```

### 6.2 Transition Meaning

The transition should communicate:

```txt
The world is not loading a new arena.
The world is revealing its battle lattice.
```

### 6.3 Skip Rule

After the player has seen the full transition several times, allow a shortened version.

```txt
First battle in area: full 3s transition
Repeat battles: 1s compressed transition
Boss / discovery battles: full transition forced
```

---

## 7. Tactical Board Compiler

### 7.1 Purpose

The Battle Board Compiler converts an exploration map into a tactical board state.

```txt
ExplorationMapState
  → BattleBoardCompiler
  → BattleBoardState
```

### 7.2 Responsibilities

The compiler must:

```txt
preserve recognizable map footprint
remove noncombat clutter
convert terrain into walkable / blocked / hazard cells
assign elevation
assign tactical tile modifiers
place units on valid cells
preserve important interactive objects
emit deterministic board state
```

### 7.3 Suggested Contract

```ts
type BattleBoardState = {
  boardId: string;
  sourceSceneId: string;
  encounterSeed: string;
  compilerVersion: "TACTICAL-LATTICE-v1";

  width: number;
  height: number;

  tiles: BattleTile[];

  units: BattleUnitPlacement[];

  preservedObjects: BattleObject[];

  removedObjects: Array<{
    id: string;
    reason: "clutter" | "building_projection_removed" | "noncombat_decor";
  }>;

  rules: {
    movementMode: "turn_based_grid";
    lineOfSight: "iso_lattice";
    elevationEnabled: boolean;
    tileModifiersEnabled: boolean;
  };
};
```

---

## 8. Battle Tile Contract

```ts
type BattleTile = {
  x: number;
  y: number;
  z: number;

  terrain:
    | "normal"
    | "high_ground"
    | "low_ground"
    | "blocked"
    | "hazard"
    | "void"
    | "fire"
    | "ice"
    | "sonic"
    | "holy"
    | "null"
    | "rune"
    | "anchor";

  walkable: boolean;
  blocksLineOfSight: boolean;

  modifier?: BattleTileModifier;

  control?: {
    occupiedBy?: string;
    threatenedBy: string[];
    controlledBy?: "player" | "enemy" | "neutral";
  };

  visual: {
    glyph?: string;
    colorHint?: string;
    pulseIntensity?: number;
  };

  interactionPriority: number;
};
```

---

## 9. Tactical Tile Modifiers

### 9.1 Modifier Contract

```ts
type BattleTileModifier = {
  id: string;

  kind:
    | "school_boost"
    | "damage_boost"
    | "range_boost"
    | "mana_discount"
    | "spell_roll_bonus"
    | "status_amplifier"
    | "chain_multiplier"
    | "accuracy_boost"
    | "line_of_sight_bonus"
    | "zone_denial"
    | "ritual_anchor"
    | "nullification";

  school?:
    | "FIRE"
    | "VOID"
    | "SONIC"
    | "HOLY"
    | "ICE"
    | "PSYCHIC"
    | "MYTH";

  value: number;

  appliesTo:
    | "caster_tile"
    | "target_tile"
    | "path_tiles"
    | "adjacent_tiles"
    | "area";

  duration?: "static" | "one_use" | "turn_decay";
};
```

### 9.2 Tile Types

| Tile        | Tactical Function               | Example Effect                                         |
| ----------- | ------------------------------- | ------------------------------------------------------ |
| Normal      | Baseline movement               | No modifier                                            |
| Fire        | Aggressive damage square        | Fire spells +15 percent                                |
| Void        | Risk/reward drain square        | Siphon and corruption +20 percent, healing -10 percent |
| Sonic       | Resonance and machinery square  | SONIC spells +15 percent, chain effects +1             |
| Ice         | Control square                  | Slow/freeze effects +15 percent                        |
| Holy        | Defensive square                | Healing and shielding +15 percent                      |
| Null        | Denial square                   | Spell modifiers reduced or cancelled                   |
| Rune        | Premium spellcraft square       | +1 spell die or bridge bonus                           |
| Anchor      | Ritual control square           | Sustained spells last longer                           |
| High Ground | Chess-like positional advantage | Range +1, accuracy +10 percent                         |
| Low Ground  | Vulnerable position             | Accuracy penalty when attacking upward                 |
| Hazard      | Tempo pressure                  | Damage or debuff at turn start                         |

---

## 10. Scrabble Layer as Tactical Premium Squares

The board should include premium cells, but they should be limited.

Recommended distribution:

```txt
70 percent normal / terrain cells
20 percent school / modifier cells
10 percent premium / rare tactical cells
```

The goal is not to make every tile magical.

The goal is to create **positional arguments**.

### 10.1 Premium Tile Examples

| Premium Tile  | Chess Meaning             | Scrabble Analogy              |
| ------------- | ------------------------- | ----------------------------- |
| Rune Tile     | High-value casting square | Double letter / triple letter |
| Ritual Anchor | Central control point     | Center star                   |
| School Tile   | Specialized spell value   | Letter multiplier             |
| Chain Tile    | Enables combo extension   | Word multiplier               |
| Null Tile     | Denies opponent action    | Blocking square               |
| High Ground   | Controls lanes            | Strong central file           |

### 10.2 Tactical Principle

A premium tile should create a choice:

```txt
Taking this tile gives power.
Taking this tile may expose me.
Ignoring this tile may let the enemy control tempo.
```

---

## 11. Chess Layer

### 11.1 Movement as Threat Control

Units should not move only to “get closer.”

They should move to:

```txt
control tiles
block paths
escape lines
threaten enemy movement
occupy premium squares
protect ritual anchors
bait enemies into hazards
set up future Spellweave casts
```

### 11.2 Threat Map

Every turn, the board should compute threat zones.

```ts
type ThreatMap = {
  controlledTiles: Array<{
    x: number;
    y: number;
    z: number;
    controlledBy: string[];
    threatType: "melee" | "spell" | "ranged" | "hazard" | "aura";
    dangerScore: number;
  }>;
};
```

The HUD can show this optionally:

```txt
hover enemy → show threatened tiles
hold tactical key → show board control overlay
hover spell → show projected spell path
```

### 11.3 Tempo

A tactical game needs tempo.

Examples:

```txt
Spend one turn moving to Rune Tile for a stronger next cast.
Interrupt enemy before they reach Void Tile.
Hold high ground instead of attacking immediately.
Use weak spell now to deny enemy premium square.
```

### 11.4 Sacrifice

The board should allow sacrifice decisions:

```txt
Stand on hazard for one powerful cast.
Move into enemy range to control a ritual anchor.
Use a defensive tile instead of attacking.
Let enemy take Fire Tile, then push them onto Null Tile.
```

---

## 12. Spellweave Integration

Spellweave should consume board context, not own it.

The existing Spellweave system already moved toward an intent-first grammar with a 325-token intent octree. The battle board should become an input to spell resolution, not a replacement for Spellweave.

### 12.1 Cast Context

```ts
type TacticalCastContext = {
  casterId: string;
  casterTile: BattleTile;
  targetId?: string;
  targetTile?: BattleTile;
  pathTiles: BattleTile[];

  parsedWeave: ParsedWeave;
  bridgeResult: BridgeResult;

  sceneContext: SceneContextSnapshot;
  boardState: BattleBoardState;
};
```

### 12.2 Tile Modifier Resolution

```txt
Spell is parsed.
Spell intent is resolved.
Target is bound.
Board context is read.
Tile modifiers are applied.
Combat score is finalized.
Effect resolves.
```

### 12.3 Example Interactions

| Weave            | Position                          | Result                        |
| ---------------- | --------------------------------- | ----------------------------- |
| REND FLESH       | Caster on Rune Tile               | +1 spell die or bridge bonus  |
| OFFENSIVE FIRE   | Caster on Fire Tile               | Fire damage boosted           |
| DISRUPTION STONE | Adjacent to obelisk on Sonic Tile | Obelisk overload bias         |
| UTILITY STONE    | Near ore spire on Rune Tile       | Gathering/transmutation bonus |
| HEALING FLESH    | Caster on Holy Tile               | Healing boosted               |
| SUSTAINED VOID   | Caster on Anchor Tile             | Drain lasts longer            |

---

## 13. Target Binding and Board Context

The battle board must cooperate with the Scene Target Registry.

Spells should not blindly hit hardcoded targets.

```txt
REND FLESH
  → find FLESH-compatible targets
  → prefer in-range combatants
  → apply line-of-sight and board rules
  → bind to target
```

```txt
DISRUPTION STONE
  → find STONE-compatible targets
  → obelisk, ore spire, stone wall, terrain cell
  → choose by intent, range, priority, and board state
```

### 13.1 Resolution Layers

```txt
1. Spellweave parse
2. Intent octree classification
3. Scene target registry
4. Tactical board rules
5. Range / reach / line-of-sight
6. Tile modifiers
7. Combat scoring
8. State mutation
```

---

## 14. Action Economy

### 14.1 Suggested Turn Structure

Each unit receives:

```txt
Movement Budget
Action Budget
Reaction Budget
Optional Focus / Channel State
```

Example:

```ts
type TurnBudget = {
  movementPoints: number;
  actions: number;
  reactions: number;
  focusAvailable: boolean;
};
```

### 14.2 Tactical Choices

On turn, the player may:

```txt
move
cast
basic attack
inspect tile
gather / interact
channel spell
hold reaction
end turn
```

### 14.3 Movement and Casting Tradeoff

Important design choice:

```txt
Moving should affect spell quality.
```

Possible rule:

```txt
No movement before cast: +focus bonus
Partial movement: normal cast
Full movement: slight accuracy or bridge penalty
Standing on matching tile: offsets movement penalty
```

This creates chess-like positioning decisions.

---

## 15. Elevation and Line-of-Sight

Elevation should matter.

### 15.1 High Ground

High ground gives:

```txt
range bonus
accuracy bonus
improved line-of-sight
better targeting over low blockers
```

### 15.2 Low Ground

Low ground gives:

```txt
penalty when attacking upward
reduced sight over blockers
increased vulnerability to ranged/sonic attacks
```

### 15.3 Blockers

Removed buildings should not block combat unless preserved as tactical objects.

Preserved blockers may include:

```txt
pillars
obelisk
walls
large crystals
void spires
ritual stones
```

---

## 16. Enemy AI

Enemy AI does not need to be brilliant in v1, but it must understand tile value.

### 16.1 AI Scoring

```ts
type TileAIScore = {
  tileId: string;
  distanceCost: number;
  offensiveValue: number;
  defensiveValue: number;
  hazardRisk: number;
  playerDenialValue: number;
  objectiveValue: number;
  total: number;
};
```

### 16.2 Basic AI Rules

Enemies should:

```txt
prefer tiles matching their school
avoid hazard tiles unless payoff is high
contest premium tiles
avoid standing on Null if caster-based
use high ground for ranged attacks
move out of player threat zones when low HP
deny Rune Tiles when player can reach them
```

### 16.3 Tactical Personality

Different enemies can value tiles differently.

| Enemy Type   | Tile Preference                      |
| ------------ | ------------------------------------ |
| Fire caster  | Fire, Rune, High Ground              |
| Void cultist | Void, Anchor, Null                   |
| Knight       | High Ground, defensive chokepoints   |
| Wraith       | Void, flank lanes                    |
| Healer       | Holy, rear-line Rune                 |
| Construct    | Sonic, Stone, machine-adjacent tiles |

---

## 17. Matrix Transition Technical Contract

```ts
type BattleTransitionEvent = {
  type: "BATTLE_TRANSITION";
  sourceSceneId: string;
  encounterId: string;
  encounterSeed: string;
  durationMs: number;
  mode: "full" | "compressed";

  visual: {
    codeFlood: boolean;
    dissolveClutter: boolean;
    revealGrid: boolean;
    revealSpecialTiles: boolean;
  };

  audio: {
    cue: "battle_decompile";
    syncToBeat?: boolean;
  };
};
```

### 17.1 Transition Events

```txt
battle.transition.start
battle.transition.codeFlood
battle.transition.clutterDissolve
battle.transition.gridReveal
battle.transition.tileReveal
battle.transition.ready
```

The music system may hook into these as moment cues.

---

## 18. UI Requirements

### 18.1 Tile Hover

Hovering a tile should show:

```txt
tile type
modifier
movement cost
threatened by
line-of-sight status
spell bonus if applicable
```

Example:

```txt
RUNE TILE
+1 Spell Die
+8 percent bridge stability
Threatened by: Hollow Student
```

### 18.2 Spell Preview

Before casting, show:

```txt
target binding
path tiles
tile modifiers applied
damage / effect estimate
risk warnings
```

Example:

```txt
REND FLESH → Sparring Dummy
Caster Tile: Fire Tile +15 percent
Path: clear
Target Tile: Normal
Projected: 24 damage, Burn 1 turn
```

### 18.3 Tactical Overlay

Optional overlays:

```txt
movement range
enemy threat
spell range
premium tiles
school tiles
line-of-sight
```

Do not show everything at once by default.

---

## 19. Data Model

### 19.1 Board Seed

```ts
type BattleBoardSeed = {
  sourceSceneId: string;
  encounterId: string;
  mapHash: string;
  playerPosition: { x: number; y: number; z?: number };
  enemySet: string[];
  timestampBucket?: string;
};
```

### 19.2 Deterministic Tile Assignment

Use seeded logic:

```txt
map landmarks influence tile type
encounter type influences school density
boss fights may pin special tiles
normal encounters use weighted deterministic distribution
```

Example:

```txt
near obelisk → more Sonic / Stone / Rune tiles
near lava → more Fire tiles
near graveyard → more Void / Soul tiles
near church → more Holy tiles
```

---

## 20. File Structure

```txt
codex/core/combat/
  tactical-board.compiler.js
  tactical-board.tiles.js
  tactical-board.modifiers.js
  tactical-board.threat-map.js
  tactical-board.ai.js
  tactical-board.resolver.js

src/phaser/
  battle-transition.fx.js
  CombatArenaScene.js

src/pages/Combat/
  CombatPage.jsx
  CombatPage.css
  TacticalTileTooltip.jsx
  TacticalOverlayControls.jsx

src/data/combat/
  battleTileDefinitions.json
  tacticalBoardPalettes.json

tests/unit/combat/
  tactical-board.compiler.test.js
  tactical-board.modifiers.test.js
  tactical-board.threat-map.test.js
  tactical-board.ai.test.js
```

---

## 21. Implementation Phases

### Phase 1 — Board Compiler

* [ ] Implement `tactical-board.tiles.js`
* [ ] Implement `tactical-board.compiler.js`
* [ ] Convert current combat scene into `BattleBoardState`
* [ ] Preserve map footprint
* [ ] Remove buildings/clutter in battle projection only
* [ ] Unit test deterministic board generation

**Gate:** Same map + same seed generates same board hash.

---

### Phase 2 — Tile Modifiers

* [ ] Add tile modifier definitions
* [ ] Apply caster tile modifiers to combat score
* [ ] Add basic Fire, Void, Sonic, Holy, Rune, Null tiles
* [ ] Display tile tooltip on hover
* [ ] Add tests for each modifier type

**Gate:** Standing on matching school tile changes spell outcome predictably.

---

### Phase 3 — Chess Layer

* [ ] Movement range overlay
* [ ] Enemy threat overlay
* [ ] Line-of-sight checks
* [ ] High ground / low ground modifiers
* [ ] Basic zone control

**Gate:** Player can use movement and tile control to create better spell outcomes.

---

### Phase 4 — Matrix Transition

* [ ] Implement code flood transition
* [ ] Dissolve clutter into code silhouettes
* [ ] Reveal tactical grid
* [ ] Reveal special tiles
* [ ] Sync audio cue to transition moment

**Gate:** Combat starts from same map and clearly transforms into battle projection.

---

### Phase 5 — Enemy AI Tile Awareness

* [ ] Add tile scoring function
* [ ] Enemies prefer useful tiles
* [ ] Enemies avoid hazards
* [ ] Enemies contest premium squares
* [ ] Add simple personality weights

**Gate:** Enemy can make at least one obviously tactical tile decision per fight.

---

### Phase 6 — Polish and Balance

* [ ] Tune tile distribution
* [ ] Tune tile values
* [ ] Add hover clarity
* [ ] Add skip/shortened transition
* [ ] Add tutorial clue for premium tiles

**Gate:** New player understands at least one tile modifier without reading docs.

---

## 22. Acceptance Criteria

| ID     | Criterion                                             | Verification                                  |
| ------ | ----------------------------------------------------- | --------------------------------------------- |
| TLB-1  | Same map + seed produces same board                   | Unit test board hash                          |
| TLB-2  | Combat board preserves recognizable map footprint     | Manual QA screenshot comparison               |
| TLB-3  | Buildings/clutter removed only from battle projection | Return to overworld confirms originals remain |
| TLB-4  | At least 5 tile types work                            | Unit tests and manual cast checks             |
| TLB-5  | Tile modifier affects spell result deterministically  | Combat scoring test                           |
| TLB-6  | Hovering tile explains modifier                       | UI QA                                         |
| TLB-7  | Movement range and threat overlays function           | Manual QA                                     |
| TLB-8  | High ground affects range or accuracy                 | Unit and manual test                          |
| TLB-9  | Enemy chooses a valuable tile when available          | AI test fixture                               |
| TLB-10 | Matrix transition completes into playable board       | Manual browser QA                             |
| TLB-11 | Repeated battles can use compressed transition        | Manual QA                                     |
| TLB-12 | Spellweave target binding respects board context      | Resolver test                                 |
| TLB-13 | Null tile reduces or blocks modifier effects          | Unit test                                     |
| TLB-14 | Rune tile adds spell die or bridge bonus              | Combat test                                   |
| TLB-15 | Visual effects do not obscure tile readability        | Manual QA                                     |

---

## 23. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|
| Visual overload from Matrix + tile glow + spell VFX | High | High | Let transition be intense, then calm board readability |
| Too many special tiles reduce strategy | Medium | High | 70/20/10 tile distribution rule |
| Tile bonuses become mandatory | Medium | High | Keep early bonuses modest |
| Enemy AI ignores board | Medium | Medium | Add simple tile scoring v1 |
| Player cannot understand tile effects | Medium | High | Hover tooltip + one tutorial example |
| Same-map projection creates blocked path bugs | Medium | High | Compiler tests for walkability |
| Special tiles break encounter balance | Medium | Medium | Encounter seed and tile budget caps |
| Transition becomes annoying | Medium | Medium | Compressed repeat transition |
| Spellweave and tile rules become tangled | Medium | High | Tile modifiers consume cast context, not grammar internals |
| Elevation makes targeting confusing | Medium | Medium | Preview line-of-sight and range before cast |

---

## 24. Balancing Guidelines

### 24.1 Early Tile Values

Use modest bonuses early:

```txt
School Tile: +10 to +15 percent
Rune Tile: +1 spell die or +8 percent bridge stability
High Ground: +1 range or +10 percent accuracy
Void Tile: +15 percent drain, but +10 percent backlash risk
Null Tile: -20 percent spell modifier effectiveness
```

### 24.2 Avoid Mandatory Squares

A player should want premium tiles, but not feel doomed without them.

```txt
Good: premium tiles create advantage
Bad: premium tiles decide the entire fight
```

### 24.3 Tactical Density

Recommended board size and density for early fights:

```txt
Board: 8x8 or 10x10
Special tiles: 8 to 14 total
Premium rare tiles: 2 to 4 total
Hard blockers: 4 to 8
Hazards: 0 to 3
```

---

## 25. Example Encounter

### 25.1 Setup

Player enters a snowy void courtyard.

Combat triggers.

The Matrix flood begins.

Buildings dissolve.

The courtyard becomes a 10x10 battle lattice.

### 25.2 Board Features

```txt
2 Rune Tiles near center
3 Ice Tiles near northern ridge
2 Void Tiles near broken altar
1 Null Tile near enemy spawn
2 High Ground ledges
Obelisk preserved as structure target
```

### 25.3 Tactical Outcome

The player can:

```txt
rush Rune Tile for stronger spell roll
take Ice Tile to control enemy movement
bait enemy onto Null Tile
stand near obelisk and use STONE / SONIC interaction
take high ground for range
```

The enemy can:

```txt
contest center Rune Tile
avoid player’s Fire Tile angle
force player off high ground
```

The battle becomes a board argument.

---

## 26. Design Law

The Tactical Lattice Battle Board must obey this law:

```txt
The board is not decoration.
The board is grammar.
```

Every battle tile should either:

```txt
change movement
change threat
change spell value
change target logic
change risk
change tempo
```

If a tile does none of these, it is visual dressing and should not be treated as tactical.

---

## 27. Final Verdict

This system should become the tactical heart of Scholomance combat.

The final experience should feel like:

```txt
The world decompiles.
The battlefield reveals its syntax.
The player moves like chess.
The tiles score like Scrabble.
The spells resolve like language.
The environment answers like a living machine.
```

This is not a separate minigame.

This is Scholomance combat becoming readable, tactical, and strange in the correct way.
