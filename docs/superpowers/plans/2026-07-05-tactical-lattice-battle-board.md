# Tactical Lattice Battle Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the existing Tactical Lattice core modules into playable combat — deterministic board compilation from the arena map, tile modifiers affecting spell scores, chess-layer overlays, matrix transition sync, and basic enemy tile awareness — satisfying PDR acceptance criteria TLB-1 through TLB-15.

**Architecture:** Pure logic stays in `codex/core/combat/tactical-board.*.js` (already scaffolded). A thin `src/game/combat/` bridge layer adapts `CombatArenaScene` voxel/grid data into `MapState`, compiles `BattleBoardState` on battle engage, and exposes it to React via `arenaBridge` events. Spell scoring gains a post-normalize hook through `resolveTacticalCast` in `combatCastScoring.js`. Phaser renders tile glyphs/colors from compiled board; React hosts `TacticalTileTooltip` + `TacticalOverlayControls`. Matrix intro timing aligns with `battle-transition.fx.js` phase contract.

**Tech Stack:** ES modules (`"type": "module"`), Node `20.20.2`, React 18, Phaser `^4.1.0`, Vitest `^4.0.18` (tests under `tests/` only).

## Current State (read before coding)

| Asset | Status |
|-------|--------|
| `codex/core/combat/tactical-board.{compiler,tiles,modifiers,threat-map,resolver,ai}.js` | Implemented, **zero tests**, **not imported** by runtime |
| `src/phaser/battle-transition.fx.js` | Implemented, **not wired** to scene or `CombatMatrixIntro` |
| `src/pages/Combat/Tactical{TileTooltip,OverlayControls}.jsx` + `TacticalBattleBoard.css` | Implemented, **not mounted** in `CombatPage.jsx` |
| `src/data/combat/{battleTileDefinitions,tacticalBoardPalettes}.json` | Present, unused |
| `src/ui/combat/CombatMatrixIntro.jsx` | Partial matrix flood (3.6s); no phase sync with PDR §6.1 |
| `src/phaser/CombatArenaScene.js` | Hardcoded 9×9 grid + leylines; no `BattleBoardState` |
| Unit tests per PDR §20 | **Missing entirely** |

**Blocker to fix first:** `tactical-board.tiles.js` stores modifier `value` as fractions (`0.15`), while `tactical-board.modifiers.js` presets use whole percentages (`15`). `computeTileMultiplier` divides by 100; `applyTileModifierToScore` does not. Unify on **fractional values (0.15 = +15%)** everywhere before integration.

## Global Constraints

- ES modules only; repo is `"type": "module"`.
- Node `20.20.2`.
- Vitest include glob: `tests/**/*.{test,spec}.{js,jsx,ts,tsx}` — new tests **must** live under `tests/`.
- Run a single test file: `npx vitest run <path>`.
- `compilerVersion` must be exactly `"TACTICAL-LATTICE-v1"`.
- Tile distribution: 70% normal / 20% school / 10% premium (PDR §10).
- Same `sourceSceneId` + `encounterId` + `mapHash` + compiler version → same `computeBoardHash` (TLB-1).
- Tile modifiers consume cast context; do **not** rewrite Spellweave grammar (PDR §12).
- Do not permanently destroy overworld geometry — battle projection only (TLB-3).
- Transition skip rule (PDR §6.3): first battle in area = full 3s; repeats = compressed 1s; boss/discovery = full forced.
- Early tile values per PDR §24.1: school +10–15%, rune +1 die or +8% bridge, high ground +1 range or +10% accuracy, null −20% modifier effectiveness.

---

### Task 0: Unify Modifier Value Convention

**Files:**
- Modify: `codex/core/combat/tactical-board.modifiers.js`
- Modify: `tests/unit/combat/tactical-board.modifiers.test.js` (create)
- Test: `tests/unit/combat/tactical-board.modifiers.test.js`

**Interfaces:**
- Consumes: `BATTLE_TILE_MODIFIERS` from `tactical-board.tiles.js` (fractional values).
- Produces: `computeTileMultiplier(modifier, school)` where `modifier.value` is a **fraction** (0.15 → multiplier 1.15).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/combat/tactical-board.modifiers.test.js`:

```js
import { describe, expect, it } from 'vitest';
import {
  computeTileMultiplier,
  getSchoolTileBonus,
  computeNullTileEffect,
} from '../../../codex/core/combat/tactical-board.modifiers.js';

describe('tactical-board.modifiers value convention', () => {
  it('treats modifier.value as a fraction (+15% → 1.15)', () => {
    const mod = { id: 'fire', kind: 'school_boost', school: 'FIRE', value: 0.15, appliesTo: 'caster_tile' };
    expect(computeTileMultiplier(mod, 'FIRE')).toBeCloseTo(1.15, 5);
  });

  it('nullification reduces effectiveness by 20%', () => {
    const mod = { id: 'null', kind: 'nullification', value: -0.20, appliesTo: 'area' };
    expect(computeTileMultiplier(mod, 'FIRE')).toBeCloseTo(0.80, 5);
  });

  it('getSchoolTileBonus returns fractional bonus for matching schools', () => {
    expect(getSchoolTileBonus('FIRE', 'FIRE')).toBeCloseTo(0.15, 5);
  });

  it('computeNullTileEffect reduces non-nullification modifier values by 20%', () => {
    const reduced = computeNullTileEffect([
      { id: 'rune', kind: 'spell_roll_bonus', value: 0.08, appliesTo: 'caster_tile' },
    ]);
    expect(reduced[0].value).toBeCloseTo(0.064, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/combat/tactical-board.modifiers.test.js`
Expected: FAIL — `computeTileMultiplier` returns wrong magnitude (divides fractional by 100).

- [ ] **Step 3: Fix `computeTileMultiplier` and presets**

In `codex/core/combat/tactical-board.modifiers.js`:

1. Change `computeTileMultiplier` to use fractional math (match `applyTileModifierToScore` in tiles.js):

```js
export function computeTileMultiplier(modifier, school) {
  if (!modifier || typeof modifier.value !== 'number') return 1.0;

  if (modifier.kind === 'nullification') {
    return Math.max(0.5, 1.0 + modifier.value); // value is negative fraction
  }

  if (modifier.kind === 'zone_denial') return 1.0;

  let effectiveValue = modifier.value;

  if (modifier.school && school) {
    const modSchool = modifier.school.toUpperCase();
    const casterSchool = school.toUpperCase();
    if (modSchool !== casterSchool) effectiveValue *= 0.5;
  }

  return 1.0 + effectiveValue;
}
```

2. Update every entry in `TILE_MODIFIER_PRESETS` to fractional values (`15` → `0.15`, `20` → `0.20`, etc.).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/combat/tactical-board.modifiers.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add codex/core/combat/tactical-board.modifiers.js tests/unit/combat/tactical-board.modifiers.test.js
git commit -m "fix(combat): unify tactical tile modifier values as fractions"
```

---

### Task 1: Board Compiler Tests + Deterministic Hash Gate

**Files:**
- Create: `tests/unit/combat/tactical-board.compiler.test.js`
- Reference: `codex/core/combat/tactical-board.compiler.js`

**Interfaces:**
- Consumes: `compileBattleBoard(seed, mapState)`, `computeBoardHash(boardState)`.
- Produces: passing TLB-1 gate — identical hash for identical inputs.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/combat/tactical-board.compiler.test.js`:

```js
import { describe, expect, it } from 'vitest';
import {
  compileBattleBoard,
  computeBoardHash,
  getBoardDimensions,
} from '../../../codex/core/combat/tactical-board.compiler.js';

function makeMapState(width = 10, height = 10) {
  const cells = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => ({
      x, y, z: 1, terrainType: 'snow', walkable: true, blocksLineOfSight: false,
    }))
  );
  return { sceneId: 'void-courtyard', width, height, cells };
}

const BASE_SEED = {
  sourceSceneId: 'void-courtyard',
  encounterId: 'sentinel-intro',
  mapHash: 'map-abc123',
  playerPosition: { x: 5, y: 7 },
  enemySet: ['hollow-student', 'void-acolyte'],
};

describe('tactical-board.compiler', () => {
  it('returns TACTICAL-LATTICE-v1 compiler version', () => {
    const board = compileBattleBoard(BASE_SEED, makeMapState());
    expect(board.compilerVersion).toBe('TACTICAL-LATTICE-v1');
  });

  it('produces identical board hash for identical seed + map (TLB-1)', () => {
    const map = makeMapState();
    const a = compileBattleBoard(BASE_SEED, map);
    const b = compileBattleBoard(BASE_SEED, map);
    expect(computeBoardHash(a)).toBe(computeBoardHash(b));
  });

  it('changes hash when encounter seed changes', () => {
    const map = makeMapState();
    const a = compileBattleBoard(BASE_SEED, map);
    const b = compileBattleBoard({ ...BASE_SEED, encounterId: 'other-encounter' }, map);
    expect(computeBoardHash(a)).not.toBe(computeBoardHash(b));
  });

  it('uses 10x10 board when enemy count exceeds threshold', () => {
    const dims = getBoardDimensions(makeMapState(12, 12), {
      ...BASE_SEED,
      enemySet: ['e1', 'e2', 'e3', 'e4'],
    });
    expect(dims).toEqual({ width: 10, height: 10 });
  });

  it('places player and all enemies on walkable tiles', () => {
    const board = compileBattleBoard(BASE_SEED, makeMapState());
    for (const unit of board.units) {
      const tile = board.tiles[unit.y * board.width + unit.x];
      expect(tile?.walkable).toBe(true);
    }
    expect(board.units.find((u) => u.entityId === 'player')).toBeTruthy();
    expect(board.units.filter((u) => u.side === 'enemy')).toHaveLength(2);
  });

  it('removes clutter objects but preserves landmarks', () => {
    const map = makeMapState();
    map.cells[3][3] = { ...map.cells[3][3], objectId: 'sign-1', objectType: 'decor' };
    map.cells[4][4] = { ...map.cells[4][4], objectId: 'obelisk-1', objectType: 'obelisk' };
    const board = compileBattleBoard(BASE_SEED, map);
    expect(board.removedObjects.some((o) => o.id === 'sign-1')).toBe(true);
    expect(board.preservedObjects.some((o) => o.id === 'obelisk-1')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it passes (modules already exist)**

Run: `npx vitest run tests/unit/combat/tactical-board.compiler.test.js`
Expected: PASS (6 tests). If any fail, fix `tactical-board.compiler.js` — do not weaken assertions.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/combat/tactical-board.compiler.test.js
git commit -m "test(combat): tactical board compiler deterministic hash gate"
```

---

### Task 2: Map Adapter + Arena Board Compilation Bridge

**Files:**
- Create: `src/game/combat/tacticalBoardMapAdapter.js`
- Create: `src/game/combat/tacticalBoardSession.js`
- Modify: `src/phaser/CombatArenaScene.js` (engageCombatBattle path)
- Modify: `src/pages/Combat/arenaBridge.js`
- Test: `tests/unit/combat/tacticalBoardMapAdapter.test.js`

**Interfaces:**
- Consumes: arena snapshot `{ gridSize, leylines, heightmap, playerGridPos, sentinelIds }`.
- Produces:
  - `buildMapStateFromArena(snapshot) => MapState`
  - `buildBattleBoardSeed(snapshot) => BattleBoardSeed`
  - `compileArenaBattleBoard(snapshot) => BattleBoardState`
  - Phaser event `battle-board-compiled` with `{ boardState }` payload.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/combat/tacticalBoardMapAdapter.test.js`:

```js
import { describe, expect, it } from 'vitest';
import {
  buildMapStateFromArena,
  buildBattleBoardSeed,
  compileArenaBattleBoard,
} from '../../../src/game/combat/tacticalBoardMapAdapter.js';

const ARENA_SNAPSHOT = {
  sceneId: 'combat-arena',
  gridSize: 9,
  playerGridPos: { tx: 4, ty: 6 },
  leylines: [
    { id: 'ley-1', coord: { x: 2, y: 3 }, affinity: 'SONIC' },
    { id: 'ley-2', coord: { x: 6, y: 1 }, affinity: 'VOID' },
  ],
  enemies: ['sentinel-scout', 'sentinel-brawler'],
  encounterId: 'sentinel-aggro-1',
  mapHash: 'arena-v1',
};

describe('tacticalBoardMapAdapter', () => {
  it('builds a square MapState matching gridSize', () => {
    const map = buildMapStateFromArena(ARENA_SNAPSHOT);
    expect(map.width).toBe(9);
    expect(map.height).toBe(9);
    expect(map.cells[3][2].terrainType).toBe('sonic'); // leyline affinity maps to school terrain
  });

  it('centers board seed on player grid position', () => {
    const seed = buildBattleBoardSeed(ARENA_SNAPSHOT);
    expect(seed.playerPosition).toEqual({ x: 4, y: 6 });
    expect(seed.enemySet).toEqual(['sentinel-scout', 'sentinel-brawler']);
  });

  it('compileArenaBattleBoard returns a deterministic board', () => {
    const a = compileArenaBattleBoard(ARENA_SNAPSHOT);
    const b = compileArenaBattleBoard(ARENA_SNAPSHOT);
    expect(a.boardId).toBe(b.boardId);
    expect(a.tiles).toHaveLength(a.width * a.height);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/combat/tacticalBoardMapAdapter.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement adapter**

Create `src/game/combat/tacticalBoardMapAdapter.js`:

```js
import { stableHash } from '../../../codex/core/leyline.engine.js';
import { compileBattleBoard } from '../../../codex/core/combat/tactical-board.compiler.js';

const AFFINITY_TO_TERRAIN = {
  FIRE: 'fire', VOID: 'void', SONIC: 'sonic', HOLY: 'holy', ICE: 'ice',
};

export function buildMapStateFromArena(snapshot = {}) {
  const size = snapshot.gridSize || 9;
  const leylineByCoord = new Map(
    (snapshot.leylines || []).map((l) => [`${l.coord.x},${l.coord.y}`, l])
  );

  const cells = Array.from({ length: size }, (_, y) =>
    Array.from({ length: size }, (_, x) => {
      const ley = leylineByCoord.get(`${x},${y}`);
      const terrainType = ley
        ? (AFFINITY_TO_TERRAIN[ley.affinity] || 'rune')
        : (x === 4 && y === 4 ? 'anchor' : 'snow');
      const cell = {
        x, y, z: 1, terrainType, walkable: true, blocksLineOfSight: false,
      };
      if (x === 4 && y === 4) {
        cell.objectId = 'center-obelisk';
        cell.objectType = 'obelisk';
      }
      return cell;
    })
  );

  return { sceneId: snapshot.sceneId || 'combat-arena', width: size, height: size, cells };
}

export function buildBattleBoardSeed(snapshot = {}) {
  const pos = snapshot.playerGridPos || { tx: 0, ty: 0 };
  return {
    sourceSceneId: snapshot.sceneId || 'combat-arena',
    encounterId: snapshot.encounterId || 'arena-default',
    mapHash: snapshot.mapHash || String(stableHash(`${snapshot.sceneId}:${snapshot.gridSize}`)),
    playerPosition: { x: pos.tx, y: pos.ty },
    enemySet: snapshot.enemies || [],
  };
}

export function compileArenaBattleBoard(snapshot = {}) {
  return compileBattleBoard(buildBattleBoardSeed(snapshot), buildMapStateFromArena(snapshot));
}
```

Create `src/game/combat/tacticalBoardSession.js`:

```js
/** @type {import('../../../codex/core/combat/tactical-board.compiler.js').BattleBoardState|null} */
let activeBoard = null;

export function setActiveBattleBoard(boardState) {
  activeBoard = boardState;
}

export function getActiveBattleBoard() {
  return activeBoard;
}

export function clearActiveBattleBoard() {
  activeBoard = null;
}

export function getTileAt(x, y) {
  if (!activeBoard) return null;
  const { width, height, tiles } = activeBoard;
  if (x < 0 || y < 0 || x >= width || y >= height) return null;
  return tiles[y * width + x] || null;
}
```

- [ ] **Step 4: Wire CombatArenaScene**

In `src/phaser/CombatArenaScene.js`, inside `engageCombatBattle()` (after `battleLeylinesActive = true`):

```js
import { compileArenaBattleBoard } from '../game/combat/tacticalBoardMapAdapter.js';
import { setActiveBattleBoard } from '../game/combat/tacticalBoardSession.js';

// ... inside engageCombatBattle():
const boardState = compileArenaBattleBoard({
  sceneId: 'combat-arena',
  gridSize: this.combatGridSize || 9,
  playerGridPos: this.playerGridPos,
  leylines: this.leylines || [],
  enemies: this.getActiveEnemyIds?.() || ['sentinel-scout'],
  encounterId: this.currentEncounterId || 'arena-default',
  mapHash: `arena-${this.combatGridSize}`,
});
this.battleBoardState = boardState;
setActiveBattleBoard(boardState);
this.applyBattleBoardToGrid(boardState);
this.events.emit('battle-board-compiled', { boardState });
```

Add method `applyBattleBoardToGrid(boardState)` that, for each tile in `boardState.tiles`, updates `this.gridTiles.get(\`${x},${y}\`)` with `battleTile` data and tints the top face using `tile.visual.colorHint` from compiled state. Special tiles get `pulseIntensity > 0`.

In `disengageCombatBattle()`, call `clearActiveBattleBoard()` and restore default grid palette.

- [ ] **Step 5: Extend arenaBridge**

In `src/pages/Combat/arenaBridge.js`, add listener:

```js
scene.events.off('battle-board-compiled');
scene.events.on('battle-board-compiled', handler);
```

- [ ] **Step 6: Run tests**

Run: `npx vitest run tests/unit/combat/tacticalBoardMapAdapter.test.js`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add src/game/combat/tacticalBoardMapAdapter.js src/game/combat/tacticalBoardSession.js \
  src/phaser/CombatArenaScene.js src/pages/Combat/arenaBridge.js \
  tests/unit/combat/tacticalBoardMapAdapter.test.js
git commit -m "feat(combat): compile tactical battle board from arena snapshot"
```

---

### Task 3: Tile Modifiers in Combat Scoring + Spell Preview Traces

**Files:**
- Modify: `src/game/combat/combatCastScoring.js`
- Modify: `codex/core/combat.scoring.js` (optional trace field)
- Create: `tests/unit/combat/tactical-board.resolver.test.js`
- Test: `tests/unit/combat/tactical-board.resolver.test.js`

**Interfaces:**
- Consumes: `getActiveBattleBoard()`, `buildTacticalCastContext`, `resolveTacticalCast`.
- Produces: `enrichScoreWithTacticalBoard(scoreData, castOptions)` adding `tacticalCast` trace and adjusted `damage`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/combat/tactical-board.resolver.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { compileBattleBoard } from '../../../codex/core/combat/tactical-board.compiler.js';
import {
  buildTacticalCastContext,
  resolveTacticalCast,
} from '../../../codex/core/combat/tactical-board.resolver.js';

function fixtureBoardWithFireTile() {
  const map = {
    sceneId: 'test', width: 3, height: 3,
    cells: Array.from({ length: 3 }, (_, y) =>
      Array.from({ length: 3 }, (_, x) => ({ x, y, terrainType: 'snow', walkable: true }))
    ),
  };
  map.cells[2][1].terrainType = 'fire';
  const seed = {
    sourceSceneId: 'test', encounterId: 'enc', mapHash: 'hash',
    playerPosition: { x: 1, y: 2 }, enemySet: ['enemy-1'],
  };
  return compileBattleBoard(seed, map);
}

describe('tactical-board.resolver', () => {
  it('boosts fire spell score when caster stands on fire tile (TLB-5)', () => {
    const board = fixtureBoardWithFireTile();
    const player = board.units.find((u) => u.side === 'player');
    const enemy = board.units.find((u) => u.side === 'enemy');
    const ctx = buildTacticalCastContext(
      player.entityId, enemy.entityId, board,
      { school: 'FIRE', intent: 'damage' },
      { school: 'FIRE' },
      { arenaSchool: 'FIRE' }
    );
    const base = resolveTacticalCast(ctx, 100, { movementUsed: 0, maxMovement: 3 });
    expect(base.adjustedScore).toBeGreaterThan(100);
    expect(base.traces.join(' ')).toMatch(/Fire Tile/i);
  });

  it('applies movement-casting penalty when player moved full budget (PDR §14.3)', () => {
    const board = fixtureBoardWithFireTile();
    const player = board.units.find((u) => u.side === 'player');
    const ctx = buildTacticalCastContext(
      player.entityId, null, board, { school: 'FIRE' }, {}, {}
    );
    const still = resolveTacticalCast(ctx, 100, { movementUsed: 0, maxMovement: 3 });
    const moved = resolveTacticalCast(ctx, 100, { movementUsed: 3, maxMovement: 3 });
    expect(still.adjustedScore).toBeGreaterThan(moved.adjustedScore);
  });
});
```

- [ ] **Step 2: Run test — expect PASS or fix resolver**

Run: `npx vitest run tests/unit/combat/tactical-board.resolver.test.js`

- [ ] **Step 3: Hook combatCastScoring**

Add to `src/game/combat/combatCastScoring.js`:

```js
import { getActiveBattleBoard } from './tacticalBoardSession.js';
import { buildTacticalCastContext, resolveTacticalCast } from '../../../codex/core/combat/tactical-board.resolver.js';

export function enrichScoreWithTacticalBoard(scoreData, {
  casterId = 'player',
  targetId = null,
  weave = '',
  movementUsed = 0,
  maxMovement = 3,
} = {}) {
  const boardState = getActiveBattleBoard();
  if (!boardState) return scoreData;

  const ctx = buildTacticalCastContext(
    casterId,
    targetId,
    boardState,
    { school: scoreData?.school, intent: scoreData?.intent, raw: weave },
    { school: scoreData?.school, intent: scoreData?.intent },
    scoreData?.sceneContext || {}
  );

  const baseScore = Number(scoreData?.totalScore ?? scoreData?.score ?? 0);
  const tactical = resolveTacticalCast(ctx, baseScore, { movementUsed, maxMovement });
  const priorDamage = Number(scoreData?.damage) || 0;
  const damageRatio = baseScore > 0 ? priorDamage / baseScore : 1;

  return {
    ...scoreData,
    totalScore: tactical.adjustedScore,
    score: tactical.adjustedScore,
    damage: Math.max(1, Math.round(tactical.adjustedScore * damageRatio)),
    tacticalCast: tactical,
    commentary: [scoreData?.commentary, ...tactical.traces].filter(Boolean).join(' '),
  };
}
```

Call `enrichScoreWithTacticalBoard` at the end of `resolveCombatCastScore` after defender chess enrichment, passing `movementUsed` / `maxMovement` from `CombatStatController` snapshot if available.

- [ ] **Step 4: Run all tactical tests**

Run: `npx vitest run tests/unit/combat/tactical-board.resolver.test.js tests/unit/combat/tactical-board.modifiers.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/combat/combatCastScoring.js tests/unit/combat/tactical-board.resolver.test.js
git commit -m "feat(combat): apply tactical tile modifiers to cast scoring"
```

---

### Task 4: Chess Layer — Threat Map, Overlays, Tile Tooltip UI

**Files:**
- Create: `tests/unit/combat/tactical-board.threat-map.test.js`
- Modify: `src/pages/Combat/CombatPage.jsx`
- Modify: `src/pages/Combat/arenaBridge.js`
- Modify: `src/phaser/CombatArenaScene.js` (overlay rendering)
- Import: `src/pages/Combat/TacticalTileTooltip.jsx`, `TacticalOverlayControls.jsx`, `TacticalBattleBoard.css`

**Interfaces:**
- Consumes: `computeThreatMap(boardState, entities)`, `getMovementRange(entity, boardState)`.
- Produces: React state `{ battleBoard, threatMap, hoveredTile, activeOverlays }`; Phaser overlay tint layers.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/combat/tactical-board.threat-map.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { compileBattleBoard } from '../../../codex/core/combat/tactical-board.compiler.js';
import { computeThreatMap, getMovementRange } from '../../../codex/core/combat/tactical-board.threat-map.js';

describe('tactical-board.threat-map', () => {
  it('marks adjacent tiles as melee-threatened by enemy', () => {
    const map = { sceneId: 't', width: 5, height: 5, cells: Array.from({ length: 5 }, (_, y) =>
      Array.from({ length: 5 }, (_, x) => ({ x, y, terrainType: 'snow', walkable: true }))
    ) };
    const board = compileBattleBoard({
      sourceSceneId: 't', encounterId: 'e', mapHash: 'h',
      playerPosition: { x: 2, y: 4 }, enemySet: ['enemy-1'],
    }, map);

    const enemy = board.units.find((u) => u.side === 'enemy');
    const threat = computeThreatMap(board, [{
      id: enemy.entityId, x: enemy.x, y: enemy.y, side: 'enemy', meleeRange: 1, attack: 10,
    }]);

    const threatened = threat.controlledTiles.find((t) => t.x === enemy.x && t.y === enemy.y + 1);
    expect(threatened).toBeTruthy();
    expect(threatened.controlledBy).toContain(enemy.entityId);
  });

  it('returns movement range within budget', () => {
    const map = { sceneId: 't', width: 5, height: 5, cells: Array.from({ length: 5 }, (_, y) =>
      Array.from({ length: 5 }, (_, x) => ({ x, y, terrainType: 'snow', walkable: true }))
    ) };
    const board = compileBattleBoard({
      sourceSceneId: 't', encounterId: 'e', mapHash: 'h',
      playerPosition: { x: 2, y: 2 }, enemySet: [],
    }, map);
    const player = board.units.find((u) => u.side === 'player');
    const range = getMovementRange({ ...player, id: player.entityId, movementRange: 2 }, board);
    expect(range.length).toBeGreaterThan(0);
    expect(range.every((t) => t.costToReach <= 2)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/unit/combat/tactical-board.threat-map.test.js`
Expected: PASS.

- [ ] **Step 3: Mount tactical UI in CombatPage**

In `src/pages/Combat/CombatPage.jsx`:

1. `import './TacticalBattleBoard.css'`
2. `import TacticalTileTooltip from './TacticalTileTooltip.jsx'`
3. `import TacticalOverlayControls from './TacticalOverlayControls.jsx'`
4. Add state:

```js
const [battleBoard, setBattleBoard] = useState(null);
const [threatMap, setThreatMap] = useState(null);
const [hoveredTile, setHoveredTile] = useState(null);
const [tileMousePos, setTileMousePos] = useState(null);
const [activeOverlays, setActiveOverlays] = useState({
  movement: false, threat: false, spell: false, premium: false, school: false, lineOfSight: false,
});
```

5. In arena action handler, on `battle-board-compiled` action: store board, compute threat map from `codex/core/combat/tactical-board.threat-map.js`.
6. On `tile-inspect` with `isGrid`: resolve `battleBoard.tiles[y * width + x]`, set hovered tile + mouse position.
7. Render:

```jsx
<TacticalOverlayControls
  activeOverlays={activeOverlays}
  onToggleOverlay={(key) => setActiveOverlays((prev) => ({ ...prev, [key]: !prev[key] }))}
/>
<TacticalTileTooltip
  tile={hoveredTile}
  threatMap={threatMap}
  mousePosition={tileMousePos}
  visible={Boolean(hoveredTile)}
/>
```

8. Dispatch overlay state to Phaser via `window.dispatchEvent(new CustomEvent('tactical-overlay-change', { detail: activeOverlays }))`.

- [ ] **Step 4: Phaser overlay renderer**

In `CombatArenaScene.js`, listen for `tactical-overlay-change`. When `activeOverlays.threat`, tint tiles listed in `computeThreatMap`. When `activeOverlays.movement`, highlight `getMovementRange` for selected unit. Reuse existing `gridTiles` polygon depth 15 — add a `tacticalOverlayGraphics` layer at depth 14.

- [ ] **Step 5: Manual QA gate (TLB-6, TLB-7)**

Load `/combat`, trigger battle, hover a rune/fire tile — tooltip shows modifier lines. Toggle threat overlay — enemy-adjacent tiles highlight.

- [ ] **Step 6: Commit**

```bash
git add tests/unit/combat/tactical-board.threat-map.test.js src/pages/Combat/CombatPage.jsx \
  src/phaser/CombatArenaScene.js src/pages/Combat/arenaBridge.js
git commit -m "feat(combat): threat map overlays and tactical tile tooltip"
```

---

### Task 5: Matrix Transition Phase Sync

**Files:**
- Modify: `src/ui/combat/CombatMatrixIntro.jsx`
- Modify: `src/game/combat/combatBattleIntro.js`
- Modify: `src/phaser/CombatArenaScene.js`
- Create: `tests/unit/combat/battle-transition.fx.test.js`
- Reference: `src/phaser/battle-transition.fx.js`

**Interfaces:**
- Consumes: `getTransitionTimeline(mode)`, `resolveTransitionMode(context)`, `getActivePhase(elapsedMs, mode)`.
- Produces: synced events on `window` and Phaser `this.events` matching PDR §17.1 names.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/combat/battle-transition.fx.test.js`:

```js
import { describe, expect, it } from 'vitest';
import {
  getTransitionTimeline,
  resolveTransitionMode,
  getActivePhase,
} from '../../../src/phaser/battle-transition.fx.js';

describe('battle-transition.fx', () => {
  it('full transition lasts 3000ms (PDR §6.1)', () => {
    expect(getTransitionTimeline('full').totalDurationMs).toBe(3000);
  });

  it('compressed transition lasts 800ms', () => {
    expect(getTransitionTimeline('compressed').totalDurationMs).toBe(800);
  });

  it('resolveTransitionMode returns compressed on repeat battles', () => {
    expect(resolveTransitionMode({ battleCount: 2 })).toBe('compressed');
    expect(resolveTransitionMode({ battleCount: 0 })).toBe('full');
    expect(resolveTransitionMode({ battleCount: 5, isBoss: true })).toBe('full');
  });

  it('getActivePhase returns grid_reveal at T+2200ms full mode', () => {
    const phase = getActivePhase(2200, 'full');
    expect(phase?.id).toBe('grid_reveal');
  });
});
```

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/unit/combat/battle-transition.fx.test.js`
Expected: PASS (4 tests).

- [ ] **Step 3: Sync CombatMatrixIntro timing**

In `src/game/combat/combatBattleIntro.js`, add:

```js
export const COMBAT_MATRIX_INTRO_DURATION_MS = 3000; // align to PDR §6.1 full transition
export const COMBAT_MATRIX_INTRO_COMPRESSED_MS = 800;
```

In `CombatMatrixIntro.jsx`, accept `mode` prop (`'full'|'compressed'`) and set `durationMs` from `getTransitionTimeline(mode).totalDurationMs`. Emit phase status lines from `getActivePhase` instead of hardcoded `STATUS_LINES`.

- [ ] **Step 4: Wire skip rule in CombatPage**

Track per-area battle count in `sessionStorage` key `tactical-battle-count:<sceneId>`. On battle engage:

```js
import { resolveTransitionMode } from '../../phaser/battle-transition.fx.js';

const battleCount = Number(sessionStorage.getItem(`tactical-battle-count:${sceneId}`) || 0);
const mode = resolveTransitionMode({ battleCount, isBoss: encounter?.isBoss, isDiscovery: encounter?.isDiscovery });
```

Pass `mode` to `CombatMatrixIntro`. Increment count after `onComplete`.

- [ ] **Step 5: Phaser phase hooks**

In `engageCombatBattle()`, start a timeline using `getTransitionTimeline(mode)`:
- At `grid_reveal` phase → call `applyBattleBoardToGrid`
- At `tile_reveal` phase → pulse special tiles (brief scale tween on glyphs)
- At `combat_ready` → unlock input, show HUD

Dispatch `battle.transition.*` events on both `this.events` and `window` for audio sync.

- [ ] **Step 6: Commit**

```bash
git add src/ui/combat/CombatMatrixIntro.jsx src/game/combat/combatBattleIntro.js \
  src/phaser/CombatArenaScene.js src/pages/Combat/CombatPage.jsx \
  tests/unit/combat/battle-transition.fx.test.js
git commit -m "feat(combat): sync matrix transition to tactical lattice phases"
```

---

### Task 6: Enemy AI Tile Awareness

**Files:**
- Create: `tests/unit/combat/tactical-board.ai.test.js`
- Modify: `src/game/combat/sentinelRobots.js` or enemy turn handler in `CombatArenaScene.js`
- Reference: `codex/core/combat/tactical-board.ai.js`

**Interfaces:**
- Consumes: `selectAIAction(boardState, entity, personality)`, `AI_PERSONALITY_WEIGHTS`.
- Produces: enemy move target tile that prefers school/premium tiles (TLB-9).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/combat/tactical-board.ai.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { compileBattleBoard } from '../../../codex/core/combat/tactical-board.compiler.js';
import { selectBestTile, selectAIAction, AI_PERSONALITY_WEIGHTS } from '../../../codex/core/combat/tactical-board.ai.js';

describe('tactical-board.ai', () => {
  it('FIRE_CASTER prefers fire terrain over normal when both are reachable', () => {
    const board = compileBattleBoard({
      sourceSceneId: 't', encounterId: 'e', mapHash: 'h',
      playerPosition: { x: 4, y: 4 }, enemySet: ['fire-caster'],
    }, {
      sceneId: 't', width: 5, height: 5,
      cells: Array.from({ length: 5 }, (_, y) =>
        Array.from({ length: 5 }, (_, x) => ({
          x, y,
          terrainType: x === 2 && y === 1 ? 'fire' : 'snow',
          walkable: true,
        }))
      ),
    });

    const enemy = board.units.find((u) => u.side === 'enemy');
    const aiBoard = {
      width: board.width,
      height: board.height,
      tiles: board.tiles,
      entities: board.units.map((u) => ({
        id: u.entityId, x: u.x, y: u.y, side: u.side, movement: 3,
      })),
      turnCount: 1,
      getTile: (x, y) => board.tiles[y * board.width + x],
    };

    const decision = selectAIAction(aiBoard, {
      id: enemy.entityId, x: enemy.x, y: enemy.y, ownerId: enemy.entityId,
      stats: { movement: 3 }, school: 'FIRE',
    }, 'FIRE_CASTER');

    expect(decision.action).toBe('move');
    expect(decision.targetTileId).toBe('2,1');
  });

  it('exposes personality weights for all PDR §16.3 types', () => {
    expect(Object.keys(AI_PERSONALITY_WEIGHTS)).toEqual(
      expect.arrayContaining(['FIRE_CASTER', 'VOID_CULTIST', 'KNIGHT', 'WRAITH', 'HEALER', 'CONSTRUCT'])
    );
  });
});
```

- [ ] **Step 2: Run test — fix AI if needed**

Run: `npx vitest run tests/unit/combat/tactical-board.ai.test.js`

- [ ] **Step 3: Wire enemy turn**

In sentinel/enemy turn resolution (where enemy moves toward player), replace greedy step with:

```js
import { selectAIAction } from '../../../codex/core/combat/tactical-board.ai.js';
import { getActiveBattleBoard } from './tacticalBoardSession.js';

const board = getActiveBattleBoard();
if (board) {
  const decision = selectAIAction(toAIBoard(board), enemyEntity, enemyEntity.personality || 'FIRE_CASTER');
  if (decision.action === 'move' && decision.targetTileId) {
    const [tx, ty] = decision.targetTileId.split(',').map(Number);
    moveEnemyTo(tx, ty);
    return;
  }
}
// fallback: existing chase logic
```

- [ ] **Step 4: Commit**

```bash
git add tests/unit/combat/tactical-board.ai.test.js src/phaser/CombatArenaScene.js
git commit -m "feat(combat): enemy AI tile-aware movement"
```

---

### Task 7: Polish, Balance & Acceptance Verification

**Files:**
- Modify: `src/data/combat/battleTileDefinitions.json` (sync values with code)
- Modify: `src/game/combat/combatInspectCopy.js` (premium tile tutorial clue)
- Modify: `src/pages/Combat/TacticalTileTooltip.jsx` (spell bonus line per PDR §18.1)

**Interfaces:**
- Produces: tutorial inspect copy for first premium tile; passing acceptance checklist.

- [ ] **Step 1: Add first-time premium tile tutorial clue**

In `combatInspectCopy.js`, when `tile.terrain` is `rune|anchor|null` and `localStorage.getItem('tactical-premium-hint-seen')` is falsy, append:

```txt
Premium tiles score your spells. Standing on them before you cast can change the outcome.
```

Set flag after first display.

- [ ] **Step 2: Run full tactical test suite**

Run:

```bash
npx vitest run tests/unit/combat/tactical-board.compiler.test.js \
  tests/unit/combat/tactical-board.modifiers.test.js \
  tests/unit/combat/tactical-board.resolver.test.js \
  tests/unit/combat/tactical-board.threat-map.test.js \
  tests/unit/combat/tactical-board.ai.test.js \
  tests/unit/combat/battle-transition.fx.test.js \
  tests/unit/combat/tacticalBoardMapAdapter.test.js
```

Expected: all PASS.

- [ ] **Step 3: Acceptance checklist (PDR §22)**

| ID | Verification |
|----|-------------|
| TLB-1 | `tactical-board.compiler.test.js` hash test |
| TLB-2 | Screenshot: compiled board footprint matches arena plateau |
| TLB-3 | Disengage battle → voxel terrain unchanged |
| TLB-4 | Modifier tests cover ≥5 tile types |
| TLB-5 | `tactical-board.resolver.test.js` |
| TLB-6 | Hover tooltip in browser QA |
| TLB-7 | Overlay toggles in browser QA |
| TLB-8 | High ground modifier in resolver trace |
| TLB-9 | `tactical-board.ai.test.js` |
| TLB-10 | Matrix transition → playable board |
| TLB-11 | Repeat battle uses compressed intro |
| TLB-12 | Resolver test with scene target context |
| TLB-13 | Null tile test in modifiers |
| TLB-14 | Rune tile trace in resolver test |
| TLB-15 | Board readable after transition (no full-screen rain during play) |

- [ ] **Step 4: Commit**

```bash
git add src/data/combat/battleTileDefinitions.json src/game/combat/combatInspectCopy.js \
  src/pages/Combat/TacticalTileTooltip.jsx
git commit -m "chore(combat): tactical lattice polish and acceptance fixes"
```

---

## Spec Coverage Self-Review

| PDR Section | Task |
|-------------|------|
| §6 Battle Transition | Task 5 |
| §7 Battle Board Compiler | Tasks 1–2 |
| §8–9 Tile Contract + Modifiers | Tasks 0, 3 |
| §10 Scrabble Distribution | Task 1 (compiler test) |
| §11 Chess / Threat Map | Task 4 |
| §12–13 Spellweave Integration | Task 3 |
| §14 Action Economy | Task 3 (movement-cast penalty) |
| §15 Elevation / LOS | Task 4 (threat-map uses `hasLineOfSight`) |
| §16 Enemy AI | Task 6 |
| §17 Matrix Transition Contract | Task 5 |
| §18 UI | Task 4, 7 |
| §19 Deterministic Seed | Tasks 1–2 |
| §22 Acceptance Criteria | Task 7 |

**Gaps intentionally deferred (out of PDR scope):** networked multiplayer sync, grandmaster AI, full terrain editor, separate random arenas.

---

## Execution Notes

- **Do not rewrite** the six `codex/core/combat/tactical-board.*.js` files unless tests expose a real bug (Task 0 convention fix is the known one).
- **CombatArenaScene.js is large** — keep changes localized to `engageCombatBattle`, `disengageCombatBattle`, and one new `applyBattleBoardToGrid` method; do not refactor unrelated voxel code.
- **Existing `CombatMatrixIntro`** stays the React-side flood; Phaser handles grid/tile reveal phases. Avoid duplicating the full rain in both layers simultaneously (TLB-15).
- **Parallelizable after Task 0:** Tasks 1, 5 (tests only) can run in parallel. Task 2 blocks 3–6.