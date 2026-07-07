# Attack Animations + Fire Combat-Chess Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the basic attack a gear-glide-driven crusader sword swing with a white speed-streak, a red/element hit-glow on the dummy, floating damage numbers, and a fire "combat-chess" enchant (incantation → elemental swing whose success depends on linguistic quality), with elements defined in a plug-and-play database mirroring the equipment DB.

**Architecture:** Three new pure/data modules (element DB, enchant resolver, controller DoT) hold all data and decisions and are unit-tested; the Phaser scene consumes them to render the swing (rotation via `gear-glide-amp`), streak, glow, and floating numbers; the React HUD feeds the current verse+weave to the scene over `window` CustomEvents (same pattern as Slice 1's `combat-stats-changed`).

**Tech Stack:** ES modules, React 18, Phaser 4.1, Vitest (jsdom, globals), gear-glide-amp time-based rotation.

## Global Constraints

- ES modules only; repo is `"type": "module"`. Node `20.20.2`.
- New tests MUST live under `tests/` (vitest include glob `tests/**/*.{test,spec}...`). Run one file: `npx vitest run <path>`.
- Builds on Slice 1: `src/game/combat/combatStats.js`, `src/game/combat/combatStatController.js`, the `CombatArenaScene.js` combat-stat wiring, and `CombatPage.jsx` HUD already exist.
- Verify the arena on the **dev server** (`npx vite`, `:5173`), NOT `vite preview` (preview 404s the runtime-loaded scene).
- Element DB entry shape mirrors `src/data/itemDatabase.js`: keyed object; each entry has `{ id, assetId, name, type, rarity, icon, sprite, ... }`.
- Success curve (verbatim): `FLOOR = 0.10`, `CEIL = 0.98`; `failureCast` → probability `0`. Quality signal: `cohesionScore`.
- Fire status (verbatim): `{ chainId: 'burn', damagePerTurn: 3, turns: 3, disposition: 'DEBUFF' }`.
- Do NOT touch the orphaned `useBattleSession.js` or the card-battler engine.

---

### Task 1: Element database (plug-and-play, mirrors ITEM_DATABASE)

**Files:**
- Create: `src/data/combatElementDatabase.js`
- Test: `tests/unit/combat/combatElementDatabase.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `COMBAT_ELEMENT_DATABASE` — keyed object of element entries.
  - `matchElement(text: string) => element | null` — first entry whose any `triggers` substring appears in lowercased `text`.
  - `getElement(id: string) => element | null`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/combat/combatElementDatabase.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { COMBAT_ELEMENT_DATABASE, matchElement, getElement } from '../../../src/data/combatElementDatabase.js';

describe('combatElementDatabase', () => {
  it('defines the fire element with the documented visual + effect fields', () => {
    const fire = COMBAT_ELEMENT_DATABASE.element_fire;
    expect(fire).toMatchObject({
      id: 'element_fire',
      assetId: 'FireStreak',
      type: 'fire',
      streakColor: 0xff6600,
      glowColor: 0xff3300,
      status: { chainId: 'burn', damagePerTurn: 3, turns: 3, disposition: 'DEBUFF' },
    });
    expect(Array.isArray(fire.triggers)).toBe(true);
  });

  it('matchElement finds fire from an incantation mentioning flame/burn', () => {
    expect(matchElement('I call the FLAME to me').id).toBe('element_fire');
    expect(matchElement('let it burn').id).toBe('element_fire');
  });

  it('matchElement returns null when no trigger is present', () => {
    expect(matchElement('a gentle breeze')).toBe(null);
    expect(matchElement('')).toBe(null);
  });

  it('getElement looks up by id and returns null for unknown', () => {
    expect(getElement('element_fire').type).toBe('fire');
    expect(getElement('element_nope')).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/combat/combatElementDatabase.test.js`
Expected: FAIL — cannot resolve `src/data/combatElementDatabase.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/data/combatElementDatabase.js`:

```js
/**
 * combatElementDatabase.js — plug-and-play combat elements.
 *
 * Mirrors src/data/itemDatabase.js conventions: a keyed object where each entry
 * carries id/assetId/name/type/rarity/icon/sprite, plus element-specific visual,
 * trigger, and status fields. Adding an element (ice, poison, …) is adding an
 * entry here — no scene code changes.
 */

export const COMBAT_ELEMENT_DATABASE = {
  element_fire: {
    id: 'element_fire',
    assetId: 'FireStreak',
    name: 'Immolation',
    type: 'fire',
    rarity: 'common',
    icon: '/assets/elements/FireStreak-icon.png',
    sprite: '/assets/elements/FireStreak-f0-png.png',
    triggers: ['fire', 'flame', 'burn', 'incinerat', 'immolat'],
    streakColor: 0xff6600,
    glowColor: 0xff3300,
    particleTint: 0xffaa00,
    status: { chainId: 'burn', damagePerTurn: 3, turns: 3, disposition: 'DEBUFF' },
  },
};

/** First element whose any trigger substring appears in `text` (case-insensitive), else null. */
export function matchElement(text) {
  const hay = String(text || '').toLowerCase();
  if (!hay) return null;
  for (const el of Object.values(COMBAT_ELEMENT_DATABASE)) {
    if (el.triggers.some((t) => hay.includes(t))) return el;
  }
  return null;
}

/** Look up an element by id, or null. */
export function getElement(id) {
  return COMBAT_ELEMENT_DATABASE[id] || null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/combat/combatElementDatabase.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/combatElementDatabase.js tests/unit/combat/combatElementDatabase.test.js
git commit -m "feat(combat): plug-and-play element database (fire)"
```

---

### Task 2: Enchant resolver (quality-gated success)

**Files:**
- Create: `src/game/combat/enchantResolver.js`
- Test: `tests/unit/combat/enchantResolver.test.js`

**Interfaces:**
- Consumes: `matchElement` (Task 1).
- Produces:
  - `computeEnchantSuccess(scoreData, rng) => { success: boolean, probability: number }`.
  - `resolveEnchant({ text, weave }, scoreData, rng) => { element, success, probability } | { element: null }`.
  - Constants `ENCHANT_FLOOR = 0.10`, `ENCHANT_CEIL = 0.98`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/combat/enchantResolver.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { computeEnchantSuccess, resolveEnchant, ENCHANT_FLOOR, ENCHANT_CEIL } from '../../../src/game/combat/enchantResolver.js';

const rng = (v) => () => v; // deterministic

describe('computeEnchantSuccess', () => {
  it('maps high cohesion near the ceiling and low near the floor', () => {
    expect(computeEnchantSuccess({ cohesionScore: 1 }, rng(0)).probability).toBeCloseTo(ENCHANT_CEIL, 5);
    expect(computeEnchantSuccess({ cohesionScore: 0 }, rng(0)).probability).toBeCloseTo(ENCHANT_FLOOR, 5);
  });

  it('failureCast forces probability 0 (always fizzles)', () => {
    const r = computeEnchantSuccess({ cohesionScore: 1, failureCast: true }, rng(0));
    expect(r.probability).toBe(0);
    expect(r.success).toBe(false);
  });

  it('success follows the injected rng deterministically', () => {
    const sd = { cohesionScore: 0.5 }; // prob = 0.10 + 0.88*0.5 = 0.54
    expect(computeEnchantSuccess(sd, rng(0.53)).success).toBe(true);
    expect(computeEnchantSuccess(sd, rng(0.55)).success).toBe(false);
  });

  it('missing cohesionScore is treated as lowest quality, not a crash', () => {
    expect(computeEnchantSuccess({}, rng(0)).probability).toBeCloseTo(ENCHANT_FLOOR, 5);
  });
});

describe('resolveEnchant', () => {
  it('returns element:null when no trigger matches (plain swing)', () => {
    expect(resolveEnchant({ text: 'a calm river', weave: '' }, { cohesionScore: 1 }, rng(0))).toEqual({ element: null });
  });

  it('returns the matched element with success outcome when a trigger matches', () => {
    const out = resolveEnchant({ text: 'unleash the flame', weave: '' }, { cohesionScore: 1 }, rng(0));
    expect(out.element.id).toBe('element_fire');
    expect(out.success).toBe(true);
  });

  it('matches against verse and weave combined', () => {
    const out = resolveEnchant({ text: 'strike now', weave: 'enchant burn' }, { cohesionScore: 1 }, rng(0));
    expect(out.element.id).toBe('element_fire');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/combat/enchantResolver.test.js`
Expected: FAIL — cannot resolve `enchantResolver.js`.

- [ ] **Step 3: Write minimal implementation**

Create `src/game/combat/enchantResolver.js`:

```js
/**
 * enchantResolver.js — pure, deterministic (RNG injected).
 *
 * Decides whether an incantation ignites the swing with an element, and with what
 * probability. Success scales with the spell's linguistic quality (cohesionScore);
 * a syntactic collapse (failureCast) always fizzles.
 */
import { matchElement } from '../../data/combatElementDatabase.js';

export const ENCHANT_FLOOR = 0.10;
export const ENCHANT_CEIL = 0.98;

function clamp01(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** @param {object} scoreData @param {() => number} rng */
export function computeEnchantSuccess(scoreData, rng) {
  const quality01 = clamp01(scoreData?.cohesionScore);
  const probability = scoreData?.failureCast
    ? 0
    : ENCHANT_FLOOR + (ENCHANT_CEIL - ENCHANT_FLOOR) * quality01;
  return { success: rng() < probability, probability };
}

/**
 * @param {{text?: string, weave?: string}} incantation
 * @param {object} scoreData
 * @param {() => number} rng
 */
export function resolveEnchant(incantation, scoreData, rng) {
  const combined = `${incantation?.text || ''} ${incantation?.weave || ''}`;
  const element = matchElement(combined);
  if (!element) return { element: null };
  const { success, probability } = computeEnchantSuccess(scoreData, rng);
  return { element, success, probability };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/combat/enchantResolver.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/combat/enchantResolver.js tests/unit/combat/enchantResolver.test.js
git commit -m "feat(combat): quality-gated enchant resolver"
```

---

### Task 3: Damage-over-time in the stat controller

**Files:**
- Modify: `src/game/combat/combatStatController.js`
- Test: `tests/unit/combat/combatStatController.dot.test.js`

**Interfaces:**
- Consumes: existing `CombatStatController` (Slice 1).
- Produces (new methods):
  - `applyStatus(id, { chainId, damagePerTurn, turns, disposition })` — upsert onto `entity.statuses` (refresh `turns` if `chainId` already present).
  - `tickStatuses(id) => Array<{ chainId, damage, targetHp, targetDefeated }>` — apply each status, decrement, drop at 0.
  - `registerEntity` now seeds `statuses: []`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/combat/combatStatController.dot.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { CombatStatController } from '../../../src/game/combat/combatStatController.js';

function withDummy() {
  const c = new CombatStatController();
  c.registerEntity('dummy', { hp: 20, maxHp: 20, tx: 0, ty: 0 });
  return c;
}

describe('CombatStatController — damage over time', () => {
  it('registers entities with an empty statuses array', () => {
    expect(withDummy().getEntity('dummy').statuses).toEqual([]);
  });

  it('applyStatus adds a status and refreshes turns for the same chainId', () => {
    const c = withDummy();
    c.applyStatus('dummy', { chainId: 'burn', damagePerTurn: 3, turns: 3, disposition: 'DEBUFF' });
    expect(c.getEntity('dummy').statuses).toHaveLength(1);
    c.tickStatuses('dummy'); // turns -> 2
    c.applyStatus('dummy', { chainId: 'burn', damagePerTurn: 3, turns: 3, disposition: 'DEBUFF' });
    expect(c.getEntity('dummy').statuses).toHaveLength(1);
    expect(c.getEntity('dummy').statuses[0].turns).toBe(3);
  });

  it('tickStatuses deals damage, decrements, drops at 0, clamps hp, reports defeat', () => {
    const c = withDummy();
    c.applyStatus('dummy', { chainId: 'burn', damagePerTurn: 3, turns: 2, disposition: 'DEBUFF' });
    const t1 = c.tickStatuses('dummy');
    expect(t1).toEqual([{ chainId: 'burn', damage: 3, targetHp: 17, targetDefeated: false }]);
    const t2 = c.tickStatuses('dummy');
    expect(t2[0].targetHp).toBe(14);
    expect(c.getEntity('dummy').statuses).toHaveLength(0); // 2 turns used up
    expect(c.tickStatuses('dummy')).toEqual([]); // nothing left
  });

  it('tickStatuses clamps hp at zero and reports defeat', () => {
    const c = new CombatStatController();
    c.registerEntity('glass', { hp: 2, maxHp: 2, tx: 0, ty: 0 });
    c.applyStatus('glass', { chainId: 'burn', damagePerTurn: 5, turns: 1, disposition: 'DEBUFF' });
    expect(c.tickStatuses('glass')).toEqual([{ chainId: 'burn', damage: 5, targetHp: 0, targetDefeated: true }]);
  });

  it('tolerates entities without statuses/hp', () => {
    const c = new CombatStatController();
    c.registerEntity('ghost', {});
    expect(c.tickStatuses('ghost')).toEqual([]);
    expect(c.tickStatuses('missing')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/combat/combatStatController.dot.test.js`
Expected: FAIL — `applyStatus is not a function` (and `statuses` undefined).

- [ ] **Step 3: Write the implementation**

In `src/game/combat/combatStatController.js`, add `statuses: []` to the record built in `registerEntity`. Find:

```js
      position: { tx, ty },
      attackUsed: false,
    };
```

Replace with:

```js
      position: { tx, ty },
      attackUsed: false,
      statuses: [],
    };
```

Then add these two methods to the class (e.g. immediately before `endTurn(id)`):

```js
  applyStatus(id, { chainId, damagePerTurn, turns, disposition }) {
    const e = this.entities.get(id);
    if (!e) return e;
    if (!Array.isArray(e.statuses)) e.statuses = [];
    const existing = e.statuses.find((s) => s.chainId === chainId);
    if (existing) {
      existing.damagePerTurn = damagePerTurn;
      existing.turns = turns;
      existing.disposition = disposition;
    } else {
      e.statuses.push({ chainId, damagePerTurn, turns, disposition });
    }
    return e;
  }

  tickStatuses(id) {
    const e = this.entities.get(id);
    if (!e || !Array.isArray(e.statuses) || e.statuses.length === 0) return [];
    const ticks = [];
    for (const s of e.statuses) {
      const damage = s.damagePerTurn;
      const targetHp = Math.max(0, (e.hp ?? 0) - damage);
      e.hp = targetHp;
      s.turns -= 1;
      ticks.push({ chainId: s.chainId, damage, targetHp, targetDefeated: targetHp <= 0 });
    }
    e.statuses = e.statuses.filter((s) => s.turns > 0);
    return ticks;
  }
```

- [ ] **Step 4: Run tests (new file + Slice-1 controller test both pass)**

Run: `npx vitest run tests/unit/combat/combatStatController.dot.test.js tests/unit/combat/combatStatController.test.js`
Expected: PASS (5 new + 5 existing).

- [ ] **Step 5: Commit**

```bash
git add src/game/combat/combatStatController.js tests/unit/combat/combatStatController.dot.test.js
git commit -m "feat(combat): status effects + damage-over-time in stat controller"
```

---

### Task 4: HUD feeds the current incantation to the scene

**Files:**
- Modify: `src/pages/Combat/CombatPage.jsx`

**Interfaces:**
- Produces the event contract the scene consumes in Task 6:
  - HUD listens for `request-incantation-state`; responds by dispatching `incantation-state` with `detail: { verse, weave }`.
  - HUD also dispatches `incantation-state` whenever `verse` or `weave` changes (keeps the scene's cache warm).

No unit test (React view/event wiring; verified in Task 7). Keep it minimal.

- [ ] **Step 1: Add the incantation-state effects**

In `src/pages/Combat/CombatPage.jsx`, find the existing stats listener effect added in Slice 1:

```jsx
  useEffect(() => {
    const onStats = (e) => {
      if (e && e.detail) setCombatStats(e.detail);
    };
    window.addEventListener('combat-stats-changed', onStats);
    return () => window.removeEventListener('combat-stats-changed', onStats);
  }, []);
```

Immediately AFTER that effect, add:

```jsx
  // Feed the current incantation (verse + weave) to the Phaser scene so a swing
  // can be enchanted. Respond to the scene's request, and push on every change.
  useEffect(() => {
    const emit = () => window.dispatchEvent(new CustomEvent('incantation-state', { detail: { verse, weave } }));
    const onRequest = () => emit();
    window.addEventListener('request-incantation-state', onRequest);
    emit(); // push current value now (covers scene mounting before/after this effect)
    return () => window.removeEventListener('request-incantation-state', onRequest);
  }, [verse, weave]);
```

- [ ] **Step 2: Verify the app builds**

Run: `npx vite build 2>&1 | grep -E "error|CombatPage|built in" | tail -5`
Expected: `✓ built in …`, no errors in `CombatPage.jsx`.

- [ ] **Step 3: Commit**

```bash
git add src/pages/Combat/CombatPage.jsx
git commit -m "feat(combat): HUD publishes incantation state to the arena"
```

---

### Task 5: Scene — swing, streak, and hit feedback (visual methods)

**Files:**
- Modify: `src/phaser/CombatArenaScene.js`

**Interfaces:**
- Consumes: `getRotationAtTime`, `getTimeForRotation` (gear-glide-amp).
- Produces scene methods used by Task 6:
  - `createSwingTextures()` — generates the procedural `swing-streak` texture (idempotent).
  - `performSwing(element | null)` — plays the crusader arc + streak sweep.
  - `showHitFeedback(targetId, { color, amount, prefix })` — dummy glow + floating number.
  - `showFizzle()` — small gray puff for a failed enchant.

No unit test (Phaser runtime); verified by build here and in-app in Task 7.

- [ ] **Step 1: Import gear-glide rotation helpers**

At the top of `src/phaser/CombatArenaScene.js`, after the existing `import { CombatStatController } …` line, add:

```js
import { getRotationAtTime, getTimeForRotation } from '../../codex/core/pixelbrain/gear-glide-amp.js';
```

- [ ] **Step 2: Generate the streak texture in create()**

Find the combat-stats block added in Slice 1 (ends with the dummy `registerEntity('dummy', …)` line). Immediately AFTER that line, add:

```js
      this.createSwingTextures();
```

Then add this method to the scene class (near `emitCombatStats`):

```js
    createSwingTextures = () => {
      if (this.textures.exists('swing-streak')) return;
      // A white crescent: outer arc minus inner arc, so it reads as a fast blade trail.
      const g = this.add.graphics();
      g.fillStyle(0xffffff, 1);
      g.beginPath();
      g.arc(60, 60, 58, Phaser.Math.DegToRad(-70), Phaser.Math.DegToRad(70), false);
      g.arc(60, 60, 30, Phaser.Math.DegToRad(70), Phaser.Math.DegToRad(-70), true);
      g.closePath();
      g.fillPath();
      g.generateTexture('swing-streak', 120, 120);
      g.destroy();
    };
```

- [ ] **Step 3: Add the swing method (gear-glide rotation + streak sweep)**

Add this method to the scene class (near `performBasicAttack`):

```js
    performSwing = (element) => {
      const SWING_BPM = 120;
      const SWING_DEG_PER_BEAT = 360;   // 250ms for a 180° arc
      const ARC = Math.PI;              // 180°
      const START_ANGLE = Phaser.Math.DegToRad(-135); // overhead
      const durationMs = getTimeForRotation(ARC, SWING_BPM, SWING_DEG_PER_BEAT);
      const streakColor = element ? element.streakColor : 0xffffff;

      // Optional blade: rotate the equipped weapon layer around the hand if one is shown.
      const weapon = this.playerArmorLayers && this.playerArmorLayers.weapon;
      const bladeActive = weapon && weapon.visible;
      const restoreRotation = bladeActive ? weapon.rotation : 0;

      // Streak sprite riding the arc in front of the player.
      const px = this.playerContainer ? this.playerContainer.x : 0;
      const py = this.playerContainer ? this.playerContainer.y : 0;
      const streak = this.add.sprite(px, py - 40, 'swing-streak');
      streak.setDepth(30);
      streak.setTint(streakColor);
      streak.setBlendMode(Phaser.BlendModes.ADD);
      streak.setAlpha(0.9);

      if (element && this.add.particles && this.textures.exists('doom-fire')) {
        const burst = this.add.particles(px, py - 40, 'doom-fire', {
          speed: { min: 40, max: 120 }, lifespan: 350, quantity: 12,
          scale: { start: 0.5, end: 0 }, alpha: { start: 0.9, end: 0 },
          blendMode: 'ADD', tint: element.particleTint,
        });
        this.time.delayedCall(120, () => burst && burst.stop());
        this.time.delayedCall(600, () => burst && burst.destroy());
      }

      const proxy = { v: 0 };
      const finish = () => {
        if (bladeActive) weapon.rotation = restoreRotation;
      };
      this.tweens.add({
        targets: proxy, v: 1, duration: durationMs, ease: 'Sine.easeIn',
        onUpdate: () => {
          const elapsed = proxy.v * durationMs;
          const swept = Math.min(ARC, getRotationAtTime(elapsed, SWING_BPM, SWING_DEG_PER_BEAT));
          const angle = START_ANGLE + swept;
          if (bladeActive) weapon.rotation = angle;
          streak.rotation = angle;
        },
        onComplete: finish,
      });
      // Safety: guarantee the weapon is restored even if the tween is interrupted.
      this.time.delayedCall(durationMs + 60, finish);
      // Streak fades and lifts, then destroys.
      this.tweens.add({ targets: streak, alpha: 0, y: py - 70, duration: durationMs + 80, ease: 'Quad.easeOut', onComplete: () => streak.destroy() });
    };
```

- [ ] **Step 4: Add hit-feedback and fizzle methods**

Add these methods to the scene class (near `performSwing`):

```js
    floatingNumber = (x, y, text, color) => {
      const label = this.add.text(x, y, text, {
        fontFamily: 'monospace', fontSize: '22px', color, fontStyle: 'bold',
        stroke: '#000000', strokeThickness: 4,
      }).setOrigin(0.5).setDepth(60);
      this.tweens.add({ targets: label, y: y - 48, alpha: 0, duration: 900, ease: 'Quad.easeOut', onComplete: () => label.destroy() });
    };

    showHitFeedback = (targetId, { color, amount, prefix = '-' }) => {
      const container = targetId === 'dummy' ? this.dummyContainer : null;
      const sprite = targetId === 'dummy' ? this.dummyImg : null;
      if (sprite) {
        const base = 0x88aacc;
        sprite.setTint(color);
        this.tweens.add({
          targets: sprite, alpha: 0.6, yoyo: true, duration: 90, repeat: 1,
          onComplete: () => sprite.setTint(base),
        });
      }
      if (container) {
        const hex = '#' + color.toString(16).padStart(6, '0');
        this.floatingNumber(container.x, container.y - 60, `${prefix}${amount}`, hex);
      }
    };

    showFizzle = () => {
      if (!this.playerContainer) return;
      const puff = this.add.text(this.playerContainer.x, this.playerContainer.y - 70, 'fizzle', {
        fontFamily: 'monospace', fontSize: '14px', color: '#9aa0a6', fontStyle: 'italic',
      }).setOrigin(0.5).setDepth(60);
      this.tweens.add({ targets: puff, y: puff.y - 30, alpha: 0, duration: 700, onComplete: () => puff.destroy() });
    };
```

- [ ] **Step 5: Verify the app builds**

Run: `npx vite build 2>&1 | grep -E "error|CombatArenaScene|built in" | tail -5`
Expected: `✓ built in …`, no errors referencing `CombatArenaScene.js`.

- [ ] **Step 6: Commit**

```bash
git add src/phaser/CombatArenaScene.js
git commit -m "feat(combat): crusader swing (gear-glide), speed streak, hit-glow + floating numbers"
```

---

### Task 6: Scene — rewire the attack + End-Turn DoT

**Files:**
- Modify: `src/phaser/CombatArenaScene.js`

**Interfaces:**
- Consumes: `resolveEnchant` (Task 2), `getElement` (Task 1), `calculateCombatScore` (codex), `applyStatus`/`tickStatuses` (Task 3), and the `performSwing`/`showHitFeedback`/`showFizzle` methods (Task 5), plus the `incantation-state` events (Task 4).
- Produces: an enchant-aware `performBasicAttack`, an End-Turn that ticks the dummy's DoT, and `combat-stats-changed` now carrying `dummyStatuses`.

- [ ] **Step 1: Add imports**

At the top of `src/phaser/CombatArenaScene.js`, after the gear-glide import from Task 5, add:

```js
import { resolveEnchant } from '../game/combat/enchantResolver.js';
import { getElement } from '../data/combatElementDatabase.js';
import { calculateCombatScore } from '../../codex/core/combat.scoring.js';
```

- [ ] **Step 2: Cache the incantation + register listeners in create()**

Find the Slice-1 HUD listener block that ends with `this.emitCombatStats(); // seed the HUD with initial values`. Immediately AFTER that line, add:

```js
      this._incantation = { verse: '', weave: '' };
      this.enchantRng = () => (typeof window !== 'undefined' && window.__forceEnchant ? 0 : Math.random());
      this.boundHandleIncantation = (e) => { if (e && e.detail) this._incantation = { verse: e.detail.verse || '', weave: e.detail.weave || '' }; };
      window.addEventListener('incantation-state', this.boundHandleIncantation);
      this.events.once('destroy', () => window.removeEventListener('incantation-state', this.boundHandleIncantation));
      window.dispatchEvent(new CustomEvent('request-incantation-state'));
```

- [ ] **Step 3: Extend emitCombatStats with dummy statuses**

In `emitCombatStats`, find:

```js
          dummyHp: d ? d.hp : null,
          dummyMaxHp: d ? d.maxHp : null,
```

Replace with:

```js
          dummyHp: d ? d.hp : null,
          dummyMaxHp: d ? d.maxHp : null,
          dummyStatuses: d && Array.isArray(d.statuses) ? d.statuses.map((s) => ({ chainId: s.chainId, turns: s.turns })) : [],
```

- [ ] **Step 4: Replace performBasicAttack body**

Replace the entire `performBasicAttack = () => { … };` method (from Slice 1, the one that does the alpha-flash) with:

```js
    performBasicAttack = () => {
      if (!this.stats) return;
      const [targetId] = this.stats.inRangeTargetIds('player', ['dummy']);
      if (!targetId) return; // No valid target in range.
      const result = this.stats.resolveAttack('player', targetId);
      if (!result) return;

      // Combat chess: does the current incantation ignite the swing?
      let scoreData = {};
      try {
        scoreData = calculateCombatScore({ text: this._incantation.verse, weave: this._incantation.weave }) || {};
      } catch (err) {
        console.warn('[combat] score failed; plain swing.', err);
      }
      const outcome = resolveEnchant(this._incantation, scoreData, this.enchantRng);
      const elemental = !!(outcome.element && outcome.success);
      const element = elemental ? outcome.element : null;

      this.performSwing(element);

      const hitColor = elemental ? element.glowColor : 0xff3300;
      this.showHitFeedback('dummy', { color: hitColor, amount: result.damage });
      if (elemental) {
        this.stats.applyStatus('dummy', element.status);
      } else if (outcome.element && !outcome.success) {
        this.showFizzle(); // matched an element but the enchant failed
      }

      if (result.targetDefeated && this.dummyContainer) {
        this.tweens.add({ targets: this.dummyContainer, alpha: 0, duration: 400, delay: 200 });
      }
      this.emitCombatStats();
    };
```

- [ ] **Step 5: Tick the dummy's DoT on End Turn**

Replace the Slice-1 `endPlayerTurn = () => { … };` method with:

```js
    endPlayerTurn = () => {
      if (!this.stats) return;
      // Damage-over-time resolves at end of the player's turn.
      const ticks = this.stats.tickStatuses('dummy');
      ticks.forEach((t) => {
        this.showHitFeedback('dummy', { color: 0xffaa00, amount: t.damage });
        if (t.targetDefeated && this.dummyContainer) {
          this.tweens.add({ targets: this.dummyContainer, alpha: 0, duration: 400 });
        }
      });
      this.stats.endTurn('player');
      this.emitCombatStats();
    };
```

- [ ] **Step 6: Verify the app builds**

Run: `npx vite build 2>&1 | grep -E "error|built in" | tail -5`
Expected: `✓ built in …`, no errors.

- [ ] **Step 7: Commit**

```bash
git add src/phaser/CombatArenaScene.js
git commit -m "feat(combat): enchant-aware attack + end-turn burn ticks"
```

---

### Task 7: End-to-end verification (dev server)

**Files:** Create (temporary, deleted after): `_drive-slice2.mjs` in repo root.

- [ ] **Step 1: Run the full combat unit suite**

Run: `npx vitest run tests/unit/combat/combatElementDatabase.test.js tests/unit/combat/enchantResolver.test.js tests/unit/combat/combatStatController.dot.test.js tests/unit/combat/combatStatController.test.js tests/unit/combat/combatStats.test.js`
Expected: PASS (all green — 4 + 7 + 5 + 5 + 4).

- [ ] **Step 2: Start the dev server**

Run (background): `npx vite --port 5173 &` then wait ~6s and confirm: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/combat` → `200`.

- [ ] **Step 3: Drive the arena and assert the combat-chess loop**

Create `_drive-slice2.mjs`:

```js
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--enable-unsafe-swiftshader'] });
const page = await browser.newPage();
await page.addInitScript(() => { window.__forceEnchant = 1; }); // deterministic enchant success
await page.goto('http://localhost:5173/combat', { waitUntil: 'load', timeout: 60000 });
const panel = page.locator('div').filter({ hasText: /MP\s*\d+\/\d+/ }).first();
await panel.waitFor({ timeout: 45000 });
const hud = async () => (await panel.innerText()).replace(/\s+/g, ' ').split(' Attack')[0].trim();
const canvas = page.locator('canvas').first();
const move = async (k) => { await canvas.click({ position: { x: 60, y: 60 } }).catch(()=>{}); await page.keyboard.press(k); await page.waitForTimeout(650); };
const out = [];

out.push('INITIAL => ' + await hud());
// Write a fire incantation into the verse box.
await page.locator('textarea').first().fill('Unleash the raging flame and let it burn');
await page.waitForTimeout(150);
// Move adjacent to dummy (player 4,6 -> 4,5).
await move('ArrowRight');
// Attack (forced enchant success -> fire + burn).
await page.getByRole('button', { name: /Attack/ }).click();
await page.waitForTimeout(600);
out.push('AFTER FIRE ATTACK (dummy ~90) => ' + await hud());
// End turn: burn ticks 3.
await page.getByRole('button', { name: /End Turn/ }).click();
await page.waitForTimeout(400);
out.push('AFTER END TURN 1 (burn tick, ~87) => ' + await hud());
await page.getByRole('button', { name: /End Turn/ }).click();
await page.waitForTimeout(400);
out.push('AFTER END TURN 2 (burn tick, ~84) => ' + await hud());
await page.screenshot({ path: './_slice2-verify.png' });
await browser.close();
console.log(out.join('\n'));
```

Run: `node _drive-slice2.mjs`
Expected: dummy HP shows ~90 after the fire attack (base 10), then decreases by 3 on each End Turn (burn DoT) — e.g. 90 → 87 → 84. The screenshot shows the arena.

- [ ] **Step 4: Clean up**

Run: `rm -f _drive-slice2.mjs _slice2-verify.png` and stop the dev server (`kill %1` or the vite pid). No commit needed (temp files).

---

## Self-Review

- **Spec coverage:** element DB mirroring items + `matchElement`/`getElement` (Task 1) ✔; quality-gated enchant with FLOOR/CEIL/failureCast (Task 2) ✔; DoT status system (Task 3) ✔; HUD→scene incantation feed (Task 4) ✔; gear-glide swing + procedural streak + hit-glow + floating numbers + fizzle (Task 5) ✔; enchant-aware attack + end-turn burn ticks + `dummyStatuses` emit (Task 6) ✔; unit + in-app verification incl. the dev-server caveat (Task 7) ✔. Deferred items (other elements, authored art, AI, resistances) remain out of scope.
- **Type consistency:** element fields (`streakColor`, `glowColor`, `particleTint`, `status`, `triggers`) are identical across Tasks 1/5/6. `resolveEnchant`/`computeEnchantSuccess` signatures in Task 2 match Task 6 call sites. Controller `applyStatus`/`tickStatuses` shapes in Task 3 match Task 6 usage. Event names (`incantation-state`, `request-incantation-state`, `combat-stats-changed`) match between Task 4 (HUD) and Task 6 (scene). `performSwing(element|null)`, `showHitFeedback(id,{color,amount})`, `showFizzle()` defined in Task 5 match Task 6 calls.
- **Placeholder scan:** none — every code step is complete.
- **Test seam note:** `window.__forceEnchant` (set only by the Task 7 driver) forces `rng()→0` so a matched element always succeeds; in normal play it is undefined and success is `Math.random()`-gated by quality.
