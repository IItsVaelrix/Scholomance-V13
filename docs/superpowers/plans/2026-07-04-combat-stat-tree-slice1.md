# Combat Stat Tree — Slice 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add movement points, attack points, and attack range as canonical, stat-driven combat primitives, wired into the playable Phaser arena (gated keyboard movement + a basic attack on a sparring dummy + End-Turn refill + a HUD readout).

**Architecture:** Two pure, framework-free modules hold all stat/turn logic — a data-only `combatStats` registry (the stat-tree root) and a `CombatStatController` class (MP pool, attack-once-per-turn, range checks, HP). The Phaser scene (`CombatArenaScene.js`) and a small React HUD (`CombatPage.jsx`) are thin consumers that talk to the controller and to each other via `window` CustomEvents, following the scene's existing `combat-cast` event pattern.

**Tech Stack:** ES modules (`"type": "module"`), React 18, **Phaser 4.1**, Vitest (jsdom, globals enabled).

## Global Constraints

- ES modules only (`import`/`export`); repo is `"type": "module"`. One line each below is verbatim from the environment/spec:
- Node `20.20.2`.
- Vitest include glob is `tests/**/*.{test,spec}.{js,jsx,ts,tsx}` and root `*.{test,spec}...` — **new tests MUST live under `tests/`** or they will not run.
- Stat defaults (verbatim from spec): `movementPoints` base **3**, `attackPoints` base **10**, `attackRange` base **1**. Dummy HP **100**.
- Do NOT touch `src/hooks/useBattleSession.js`, the card-battler engine, or the pre-existing broken `tests/unit/combatSelectors.movement.test.js`.
- Run a single test file with: `npx vitest run <path>`.

---

### Task 1: `combatStats` registry (stat-tree root)

**Files:**
- Create: `src/game/combat/combatStats.js`
- Test: `tests/unit/combat/combatStats.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `COMBAT_STATS` — array of `{ key, label, category, base, min, max, description }`.
  - `buildDefaultStatBlock(overrides = {}) => { movementPoints, movementPointsRemaining, attackPoints, attackRange }`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/combat/combatStats.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { COMBAT_STATS, buildDefaultStatBlock } from '../../../src/game/combat/combatStats.js';

describe('combatStats registry', () => {
  it('defines the three slice-1 stats with the documented bases', () => {
    const byKey = Object.fromEntries(COMBAT_STATS.map((s) => [s.key, s]));
    expect(byKey.movementPoints.base).toBe(3);
    expect(byKey.attackPoints.base).toBe(10);
    expect(byKey.attackRange.base).toBe(1);
  });

  it('buildDefaultStatBlock seeds defaults with a full movement pool', () => {
    expect(buildDefaultStatBlock()).toEqual({
      movementPoints: 3,
      movementPointsRemaining: 3,
      attackPoints: 10,
      attackRange: 1,
    });
  });

  it('overrides merge, and overriding movementPoints seeds the remaining pool', () => {
    expect(buildDefaultStatBlock({ movementPoints: 5, attackPoints: 20 })).toEqual({
      movementPoints: 5,
      movementPointsRemaining: 5,
      attackPoints: 20,
      attackRange: 1,
    });
  });

  it('respects an explicit movementPointsRemaining override', () => {
    expect(buildDefaultStatBlock({ movementPoints: 5, movementPointsRemaining: 2 }).movementPointsRemaining).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/combat/combatStats.test.js`
Expected: FAIL — cannot resolve `src/game/combat/combatStats.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/game/combat/combatStats.js`:

```js
/**
 * combatStats.js — the root of the MMORPG stat tree.
 *
 * Data-only, framework-free. The tree grows by adding entries to COMBAT_STATS;
 * consumers iterate the registry rather than hard-coding stat names.
 */

export const COMBAT_STATS = [
  {
    key: 'movementPoints',
    label: 'Movement Points',
    category: 'mobility',
    base: 3,
    min: 0,
    max: 12,
    description: 'Points spent to move; one point per tile stepped, refilled each turn.',
  },
  {
    key: 'attackPoints',
    label: 'Attack Points',
    category: 'offense',
    base: 10,
    min: 0,
    max: 999,
    description: 'Damage dealt by a basic attack.',
  },
  {
    key: 'attackRange',
    label: 'Attack Range',
    category: 'offense',
    base: 1,
    min: 0,
    max: 12,
    description: 'Maximum Manhattan tile distance a basic attack can reach.',
  },
];

/**
 * Build a fresh stat block seeded from the registry bases, then apply overrides.
 * `movementPointsRemaining` follows `movementPoints` unless explicitly overridden.
 * @param {Partial<{movementPoints:number, movementPointsRemaining:number, attackPoints:number, attackRange:number}>} overrides
 */
export function buildDefaultStatBlock(overrides = {}) {
  const base = Object.fromEntries(COMBAT_STATS.map((s) => [s.key, s.base]));
  const movementPoints = overrides.movementPoints ?? base.movementPoints;
  return {
    movementPoints,
    movementPointsRemaining: overrides.movementPointsRemaining ?? movementPoints,
    attackPoints: overrides.attackPoints ?? base.attackPoints,
    attackRange: overrides.attackRange ?? base.attackRange,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/combat/combatStats.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/combat/combatStats.js tests/unit/combat/combatStats.test.js
git commit -m "feat(combat): stat-tree registry + default stat block"
```

---

### Task 2: `CombatStatController` (pure turn/stat engine)

**Files:**
- Create: `src/game/combat/combatStatController.js`
- Test: `tests/unit/combat/combatStatController.test.js`

**Interfaces:**
- Consumes: `buildDefaultStatBlock` from Task 1.
- Produces a class `CombatStatController` with methods:
  `registerEntity(id, opts)`, `getEntity(id)`, `setPosition(id, tx, ty)`, `canMove(id)`,
  `spendMove(id)`, `manhattan(id, targetId)`, `inRangeTargetIds(attackerId, candidateIds)`,
  `canAttack(attackerId, targetId)`, `resolveAttack(attackerId, targetId)`, `endTurn(id)`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/combat/combatStatController.test.js`:

```js
import { describe, expect, it, beforeEach } from 'vitest';
import { CombatStatController } from '../../../src/game/combat/combatStatController.js';

function makeController() {
  const c = new CombatStatController();
  c.registerEntity('player', { tx: 4, ty: 6 });
  c.registerEntity('dummy', { hp: 100, maxHp: 100, tx: 4, ty: 5 }); // 1 tile away
  return c;
}

describe('CombatStatController — movement', () => {
  it('spends one movement point per move and refuses at zero', () => {
    const c = makeController();
    expect(c.canMove('player')).toBe(true);
    expect(c.spendMove('player')).toBe(true);
    expect(c.spendMove('player')).toBe(true);
    expect(c.spendMove('player')).toBe(true);
    expect(c.getEntity('player').movementPointsRemaining).toBe(0);
    expect(c.canMove('player')).toBe(false);
    expect(c.spendMove('player')).toBe(false);
    expect(c.getEntity('player').movementPointsRemaining).toBe(0);
  });

  it('endTurn refills the pool and re-arms the attack', () => {
    const c = makeController();
    c.spendMove('player');
    c.resolveAttack('player', 'dummy');
    c.endTurn('player');
    expect(c.getEntity('player').movementPointsRemaining).toBe(3);
    expect(c.getEntity('player').attackUsed).toBe(false);
  });
});

describe('CombatStatController — attack', () => {
  it('respects attackRange for in/out of range targets', () => {
    const c = makeController();
    expect(c.canAttack('player', 'dummy')).toBe(true);       // 1 tile, range 1
    c.setPosition('dummy', 4, 3);                              // now 3 tiles away
    expect(c.canAttack('player', 'dummy')).toBe(false);
    expect(c.inRangeTargetIds('player', ['dummy'])).toEqual([]);
  });

  it('resolveAttack applies attackPoints, marks used, and refuses a second attack', () => {
    const c = makeController();
    const first = c.resolveAttack('player', 'dummy');
    expect(first).toEqual({ damage: 10, targetHp: 90, targetDefeated: false });
    expect(c.getEntity('player').attackUsed).toBe(true);
    expect(c.resolveAttack('player', 'dummy')).toBe(null);    // once per turn
    expect(c.getEntity('dummy').hp).toBe(90);
  });

  it('clamps HP at zero and reports defeat', () => {
    const c = makeController();
    c.registerEntity('glass', { hp: 5, maxHp: 5, tx: 4, ty: 5 });
    const res = c.resolveAttack('player', 'glass');
    expect(res).toEqual({ damage: 10, targetHp: 0, targetDefeated: true });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/combat/combatStatController.test.js`
Expected: FAIL — cannot resolve `combatStatController.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/game/combat/combatStatController.js`:

```js
/**
 * combatStatController.js — pure, framework-free turn/stat engine.
 *
 * Owns per-entity stat state (movement-point pool, attack-once-per-turn, HP)
 * and all combat decisions. No Phaser, no React, no DOM. Callers sync grid
 * positions in and read decisions out.
 */
import { buildDefaultStatBlock } from './combatStats.js';

export class CombatStatController {
  constructor() {
    /** @type {Map<string, any>} */
    this.entities = new Map();
  }

  registerEntity(id, { overrides = {}, hp = null, maxHp = null, tx = 0, ty = 0 } = {}) {
    const record = {
      id,
      ...buildDefaultStatBlock(overrides),
      hp,
      maxHp,
      position: { tx, ty },
      attackUsed: false,
    };
    this.entities.set(id, record);
    return record;
  }

  getEntity(id) {
    return this.entities.get(id);
  }

  setPosition(id, tx, ty) {
    const e = this.entities.get(id);
    if (e) e.position = { tx, ty };
    return e;
  }

  canMove(id) {
    const e = this.entities.get(id);
    return !!e && e.movementPointsRemaining >= 1;
  }

  spendMove(id) {
    if (!this.canMove(id)) return false;
    this.entities.get(id).movementPointsRemaining -= 1;
    return true;
  }

  manhattan(id, targetId) {
    const a = this.entities.get(id);
    const b = this.entities.get(targetId);
    if (!a || !b) return Infinity;
    return Math.abs(a.position.tx - b.position.tx) + Math.abs(a.position.ty - b.position.ty);
  }

  canAttack(attackerId, targetId) {
    const attacker = this.entities.get(attackerId);
    const target = this.entities.get(targetId);
    if (!attacker || !target) return false;
    if (attacker.attackUsed) return false;
    if (target.hp !== null && target.hp <= 0) return false;
    return this.manhattan(attackerId, targetId) <= attacker.attackRange;
  }

  inRangeTargetIds(attackerId, candidateIds) {
    return candidateIds.filter((tid) => this.canAttack(attackerId, tid));
  }

  resolveAttack(attackerId, targetId) {
    if (!this.canAttack(attackerId, targetId)) return null;
    const attacker = this.entities.get(attackerId);
    const target = this.entities.get(targetId);
    const damage = attacker.attackPoints;
    const targetHp = Math.max(0, (target.hp ?? 0) - damage);
    target.hp = targetHp;
    attacker.attackUsed = true;
    return { damage, targetHp, targetDefeated: targetHp <= 0 };
  }

  endTurn(id) {
    const e = this.entities.get(id);
    if (!e) return e;
    e.movementPointsRemaining = e.movementPoints;
    e.attackUsed = false;
    return e;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/combat/combatStatController.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/combat/combatStatController.js tests/unit/combat/combatStatController.test.js
git commit -m "feat(combat): pure stat/turn controller (MP pool, basic attack, end-turn)"
```

---

### Task 3: Wire the controller into the Phaser arena (movement gate, dummy, attack, end-turn, HUD events)

**Files:**
- Modify: `src/phaser/CombatArenaScene.js`

**Interfaces:**
- Consumes: `CombatStatController` (Task 2).
- Produces (event contract for Task 4):
  - Dispatches `window` CustomEvent `combat-stats-changed` with
    `detail: { movementPointsRemaining, movementPoints, attackPoints, attackRange, attackUsed, dummyHp, dummyMaxHp }`.
  - Listens for `window` events `combat-attack` and `combat-endturn` (no detail required).

This task has no unit test (Phaser scene requires a WebGL/canvas runtime); it is verified manually in the app (see Task 5). Keep the diff minimal and mirror the existing `combat-cast` listener lifecycle.

- [ ] **Step 1: Import the controller**

At the top of `src/phaser/CombatArenaScene.js`, add alongside the existing imports:

```js
import { CombatStatController } from '../game/combat/combatStatController.js';
```

- [ ] **Step 2: Instantiate controller, register player, spawn + register the sparring dummy**

Inside `create()`, immediately AFTER the line `this.playerGridPos = { tx: 4, ty: 6 };` (around line 389), add:

```js
      // --- Combat stat tree (slice 1) ---
      this.stats = new CombatStatController();
      this.stats.registerEntity('player', { tx: 4, ty: 6 });

      // Sparring dummy: reuse the IdealHuman idle pose as a fixed attack target.
      this.dummyGridPos = { tx: 4, ty: 4 };
      const dummyPos = this.getIsoTarget
        ? this.getIsoTarget(this.dummyGridPos.tx, this.dummyGridPos.ty)
        : toIso(this.dummyGridPos.tx, this.dummyGridPos.ty);
      this.dummyContainer = this.add.container(dummyPos.x, dummyPos.y);
      this.dummyContainer.setDepth(24);
      const dummyImg = this.add.sprite(0, 0, 'ideal-human-f0');
      dummyImg.setOrigin(0.5, FEET_ORIGIN_Y);
      dummyImg.setTint(0x88aacc); // cool tint so it reads as "not the player"
      this.dummyContainer.add(dummyImg);
      this.dummyImg = dummyImg;
      this.stats.registerEntity('dummy', { hp: 100, maxHp: 100, tx: this.dummyGridPos.tx, ty: this.dummyGridPos.ty });
```

> Note: `this.getIsoTarget` is defined later in `create()` (around line 400). If this block runs before that assignment, the `toIso(...)` fallback (already imported/used at line 316) is used. Confirm `toIso` is in scope where you paste; if not, move the dummy spawn to just after the `this.getIsoTarget = (tx, ty) => {…}` assignment and drop the fallback.

- [ ] **Step 3: Add a HUD-sync helper**

Add this as a class method on the scene (near `handleGlobalKeydown`):

```js
    emitCombatStats = () => {
      const p = this.stats?.getEntity('player');
      const d = this.stats?.getEntity('dummy');
      if (!p) return;
      window.dispatchEvent(new CustomEvent('combat-stats-changed', {
        detail: {
          movementPointsRemaining: p.movementPointsRemaining,
          movementPoints: p.movementPoints,
          attackPoints: p.attackPoints,
          attackRange: p.attackRange,
          attackUsed: p.attackUsed,
          dummyHp: d ? d.hp : null,
          dummyMaxHp: d ? d.maxHp : null,
        },
      }));
    };
```

- [ ] **Step 4: Gate keyboard movement on movement points**

In `handleGlobalKeydown`, AFTER the teleporter-collision `return` block and BEFORE `this.isWalking = true;` (around line 559), insert:

```js
      if (this.stats && !this.stats.canMove('player')) {
        return; // Out of movement points this turn.
      }
```

Then, immediately AFTER `this.playerGridPos.ty = newTy;` (around line 562), insert:

```js
      if (this.stats) {
        this.stats.spendMove('player');
        this.stats.setPosition('player', newTx, newTy);
        this.emitCombatStats();
      }
```

- [ ] **Step 5: Add basic-attack + end-turn handlers**

Add these two class methods on the scene:

```js
    performBasicAttack = () => {
      if (!this.stats) return;
      const [targetId] = this.stats.inRangeTargetIds('player', ['dummy']);
      if (!targetId) return; // No valid target in range.
      const result = this.stats.resolveAttack('player', targetId);
      if (!result) return;
      // Quick hit-flash on the dummy (tween-based; no setTintFill — Phaser 4 safe).
      if (this.dummyContainer) {
        this.tweens.add({
          targets: this.dummyContainer,
          alpha: 0.35,
          yoyo: true,
          duration: 80,
          repeat: 1,
        });
        if (result.targetDefeated) {
          this.tweens.add({ targets: this.dummyContainer, alpha: 0, duration: 400, delay: 200 });
        }
      }
      this.emitCombatStats();
    };

    endPlayerTurn = () => {
      if (!this.stats) return;
      this.stats.endTurn('player');
      this.emitCombatStats();
    };
```

Extend `handleGlobalKeydown` to bind the keys. AT THE TOP of `handleGlobalKeydown`, after `if (this.isWalking) return;`, insert:

```js
      if (e.key === 'f' || e.key === 'F') { this.performBasicAttack(); return; }
      if (e.key === ' ' || e.key === 'Enter') { this.endPlayerTurn(); return; }
```

- [ ] **Step 6: Register the HUD event listeners + emit initial state**

In `create()`, immediately AFTER the existing `combat-cast` listener block (the `this.events.once('destroy', …)` around lines 470-474), add:

```js
      this.boundHandleHudAttack = () => this.performBasicAttack();
      this.boundHandleHudEndTurn = () => this.endPlayerTurn();
      window.addEventListener('combat-attack', this.boundHandleHudAttack);
      window.addEventListener('combat-endturn', this.boundHandleHudEndTurn);
      this.events.once('destroy', () => {
        window.removeEventListener('combat-attack', this.boundHandleHudAttack);
        window.removeEventListener('combat-endturn', this.boundHandleHudEndTurn);
      });
      this.emitCombatStats(); // seed the HUD with initial values
```

- [ ] **Step 7: Verify the app builds and the scene loads**

Run: `npx vite build`
Expected: build completes without errors referencing `CombatArenaScene.js` or the new imports.

- [ ] **Step 8: Commit**

```bash
git add src/phaser/CombatArenaScene.js
git commit -m "feat(combat): gate arena movement on MP, add basic attack + sparring dummy + end-turn"
```

---

### Task 4: Stat HUD readout + Attack / End-Turn buttons

**Files:**
- Modify: `src/pages/Combat/CombatPage.jsx`

**Interfaces:**
- Consumes the event contract from Task 3: listens for `combat-stats-changed`; dispatches
  `combat-attack` and `combat-endturn`.

This is a React view change (no unit test; verified in Task 5). Keep styling consistent with the existing inline HUD styles in the file.

- [ ] **Step 1: Add stat state + event listener**

In `CombatPage()`, after the existing `const [tooltip, setTooltip] = useState(null);` line, add:

```jsx
  const [combatStats, setCombatStats] = useState(null);

  useEffect(() => {
    const onStats = (e) => {
      if (e && e.detail) setCombatStats(e.detail);
    };
    window.addEventListener('combat-stats-changed', onStats);
    return () => window.removeEventListener('combat-stats-changed', onStats);
  }, []);
```

- [ ] **Step 2: Render the stat panel**

Inside the returned JSX, immediately AFTER the closing `)}` of the `{tooltip && ( … )}` block and BEFORE the `{/* DivWand HUD Overlay */}` comment, add:

```jsx
      {/* Combat Stat Tree — Slice 1 readout */}
      {combatStats && (
        <div style={{
          position: 'absolute',
          top: 24,
          left: 24,
          zIndex: 200,
          background: 'linear-gradient(135deg, rgba(9,15,30,0.85), rgba(5,8,15,0.95))',
          border: '1px solid rgba(0,255,255,0.25)',
          borderRadius: 12,
          padding: '12px 16px',
          color: '#e6faff',
          fontFamily: 'var(--dw-font-mono, monospace)',
          fontSize: 13,
          backdropFilter: 'blur(12px)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6), inset 0 0 16px rgba(0,255,255,0.08)',
          minWidth: 190,
        }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 8, letterSpacing: 0.5 }}>
            <span>MP <b style={{ color: '#00ffff' }}>{combatStats.movementPointsRemaining}</b>/{combatStats.movementPoints}</span>
            <span>ATK <b style={{ color: '#ffcc66' }}>{combatStats.attackPoints}</b></span>
            <span>RNG <b style={{ color: '#aaffcc' }}>{combatStats.attackRange}</b></span>
          </div>
          {combatStats.dummyHp != null && (
            <div style={{ marginBottom: 8, opacity: 0.85 }}>
              Dummy HP <b style={{ color: '#ff88aa' }}>{combatStats.dummyHp}</b>/{combatStats.dummyMaxHp}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('combat-attack'))}
              disabled={combatStats.attackUsed}
              style={{
                flex: 1, padding: '6px 10px', borderRadius: 6, cursor: combatStats.attackUsed ? 'not-allowed' : 'pointer',
                border: '1px solid rgba(255,204,102,0.4)', background: combatStats.attackUsed ? 'rgba(60,60,60,0.4)' : 'rgba(255,204,102,0.15)',
                color: combatStats.attackUsed ? '#888' : '#ffcc66', fontFamily: 'inherit', fontSize: 12,
              }}
            >
              Attack (F)
            </button>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('combat-endturn'))}
              style={{
                flex: 1, padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                border: '1px solid rgba(0,255,255,0.4)', background: 'rgba(0,255,255,0.12)',
                color: '#00ffff', fontFamily: 'inherit', fontSize: 12,
              }}
            >
              End Turn (Space)
            </button>
          </div>
        </div>
      )}
```

- [ ] **Step 3: Verify the app builds**

Run: `npx vite build`
Expected: build completes without errors in `CombatPage.jsx`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Combat/CombatPage.jsx
git commit -m "feat(combat): stat HUD readout with Attack + End-Turn controls"
```

---

### Task 5: End-to-end manual verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full new unit suite**

Run: `npx vitest run tests/unit/combat`
Expected: PASS (9 tests across both files).

- [ ] **Step 2: Launch the app and open the combat arena**

Use the project's run path (see `/run` skill or `npm run dev`) and navigate to the Combat page.

- [ ] **Step 3: Verify movement points**

Walk with arrow/WASD. Confirm the HUD `MP` ticks 3 → 2 → 1 → 0, and that a 4th move is blocked (character does not move). Confirm the character reached at most 3 tiles from start.

- [ ] **Step 4: Verify End-Turn refill**

Press Space (or click **End Turn**). Confirm `MP` returns to 3/3 and movement works again.

- [ ] **Step 5: Verify basic attack + range + once-per-turn**

Move adjacent to the sparring dummy (within `RNG` = 1). Press `F` (or click **Attack**). Confirm `Dummy HP` drops by 10 (100 → 90) and the dummy flashes. Confirm a second `F` in the same turn does nothing (button shows disabled). Press End Turn, attack again, confirm HP drops another 10.

- [ ] **Step 6: Verify defeat**

Repeatedly End-Turn + Attack (or temporarily lower dummy HP) until HP hits 0. Confirm HP clamps at 0 and the dummy fades out.

- [ ] **Step 7: Commit any verification notes (optional)**

If you captured a screenshot or notes, add them under `docs/` and commit; otherwise no commit needed.

---

## Self-Review

- **Spec coverage:** registry (Task 1) ✔; controller with MP pool / attack-once / range / HP (Task 2) ✔; Phaser wiring — movement gate, dummy target, basic attack, end-turn, HUD events (Task 3) ✔; HUD readout + buttons (Task 4) ✔; testing (Tasks 1–2 unit + Task 5 manual) ✔. Deferred items remain deferred.
- **Type consistency:** event `detail` keys emitted in Task 3 (`movementPointsRemaining`, `movementPoints`, `attackPoints`, `attackRange`, `attackUsed`, `dummyHp`, `dummyMaxHp`) match exactly the keys consumed in Task 4. Controller method names in Task 2 tests match the Task 2 implementation and the Task 3 call sites (`canMove`, `spendMove`, `setPosition`, `inRangeTargetIds`, `resolveAttack`, `endTurn`, `getEntity`).
- **Placeholder scan:** none — every code step is complete.
