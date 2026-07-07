# Two-Arm Equipment Rig Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un-bake the character's arms into a runtime joint rig so the right arm swings the sword as real articulation, the left arm holds a shield and blocks, and hands are equipment-driven (main-hand + off-hand, cosmetic dual-wield).

**Architecture:** Phase A builds pure, fully-tested foundations (item-DB slots, guard state, forward-kinematics `armRig`, `armRigConfig` data, and a deterministic `scdlArmSplitter` that derives the armless body + 6 segment SCDL files from the single `IdealHuman.scdl` source) plus a build script that compiles them to PNGs. Phase B wires those assets into the Phaser scene: compose the player from the armless body + segments, drive segment sprites each frame with `armRig` FK, reimplement the swing as right-arm rotation via `gear-glide-amp`, and add shield-block + off-hand equipment.

**Tech Stack:** ES modules, React 18, Phaser 4.1, Vitest (jsdom, globals), SCDL CLI (`codex/core/pixelbrain/scdl/scdl.cli.js`), gear-glide-amp.

## Global Constraints

- ES modules only; repo is `"type": "module"`. Node `20.20.2`.
- New tests MUST live under `tests/` (vitest include glob). Run one file: `npx vitest run <path>`.
- Builds on Slice 1 (`combatStatController.js`) and Slice 2 (`performSwing`, streak, `resolveEnchant`/DoT). Slice-2 fire logic MUST be preserved; only the swing visual changes.
- Verify the arena on the **dev server** (`npx vite`, `:5173`), NOT `vite preview`.
- SCDL source of truth: `generated-assets/IdealHuman/IdealHuman.scdl` (canvas `64x128`). Body origin in the scene is `(0.5, 0.875)` → canvas point `(32, 112)` sits at container-local `(0,0)`; a canvas point `(px,py)` sits at local `(px-32, py-112)`.
- Confirmed pivot coords (canvas px), to be fine-tuned in Task 8: armR shoulder `(43,30)`, elbow `(44,44)`, wrist `(44,58)`, grip `(45,62)`; armL shoulder `(21,30)`, elbow `(20,44)`, wrist `(19,58)`, grip `(19,62)`.
- Segment Y-bands: `upper` = y < 46, `fore` = 46 ≤ y < 59, `hand` = y ≥ 59.
- Do NOT touch the orphaned `useBattleSession.js` or the card-battler engine.

---

## PHASE A — Pure foundation + assets

### Task 1: Item-DB off-hand slots + shield

**Files:**
- Modify: `src/data/itemDatabase.js`
- Test: `tests/unit/combat/itemDatabase.rig.test.js`

**Interfaces:**
- Produces: entries gain `slot`; a `shield` entry exists; `equipSlotOf(item) => 'mainHand'|'offHand'|null`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/combat/itemDatabase.rig.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { ITEM_DATABASE, equipSlotOf } from '../../../src/data/itemDatabase.js';

describe('itemDatabase rig slots', () => {
  it('has a shield in the off-hand slot', () => {
    const shield = Object.values(ITEM_DATABASE).find((i) => i.type === 'shield');
    expect(shield).toBeTruthy();
    expect(shield.slot).toBe('offHand');
  });

  it('routes a weapon to the main hand and a shield to the off hand', () => {
    const weapon = Object.values(ITEM_DATABASE).find((i) => i.type === 'weapon');
    const shield = Object.values(ITEM_DATABASE).find((i) => i.type === 'shield');
    expect(equipSlotOf(weapon)).toBe('mainHand');
    expect(equipSlotOf(shield)).toBe('offHand');
  });

  it('honors an explicit offHand slot on a weapon (dual-wield)', () => {
    expect(equipSlotOf({ type: 'weapon', slot: 'offHand' })).toBe('offHand');
  });

  it('returns null for a non-hand item', () => {
    expect(equipSlotOf({ type: 'head' })).toBe(null);
    expect(equipSlotOf(null)).toBe(null);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/combat/itemDatabase.rig.test.js`
Expected: FAIL — `equipSlotOf is not a function` / no shield.

- [ ] **Step 3: Implement**

In `src/data/itemDatabase.js`, add a `slot` to the sword entry and append a shield entry + the helper. Change the sword entry to include `slot: 'mainHand'`:

```js
  'item_sword_void': {
    id: 'item_sword_void',
    assetId: 'VoidIceGreatsword',
    name: 'Void Ice Greatsword',
    type: 'weapon',
    slot: 'mainHand',
    rarity: 'legendary',
    icon: '/assets/items/VoidIceGreatsword-icon.png',
    sprite: '/assets/items/VoidIceGreatsword-f0-png.png',
  },
  'item_shield_void': {
    id: 'item_shield_void',
    assetId: 'VoidIceShield',
    name: 'Void Ice Aegis',
    type: 'shield',
    slot: 'offHand',
    rarity: 'legendary',
    icon: '/assets/items/VoidIceShield-icon.png',
    sprite: '/assets/items/VoidIceShield-f0-png.png',
  }
```

Then at the end of the file (after the `ITEM_DATABASE` object), add:

```js
/**
 * Which hand an item occupies, or null if it is not a hand item.
 * An explicit `slot` wins (lets a weapon be dual-wielded in the off hand);
 * otherwise weapons default to the main hand and shields to the off hand.
 */
export function equipSlotOf(item) {
  if (!item) return null;
  if (item.slot === 'mainHand' || item.slot === 'offHand') return item.slot;
  if (item.type === 'weapon') return 'mainHand';
  if (item.type === 'shield') return 'offHand';
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/combat/itemDatabase.rig.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/itemDatabase.js tests/unit/combat/itemDatabase.rig.test.js
git commit -m "feat(combat): off-hand slot + shield in item database"
```

---

### Task 2: Guard state in the stat controller

**Files:**
- Modify: `src/game/combat/combatStatController.js`
- Test: `tests/unit/combat/combatStatController.guard.test.js`

**Interfaces:**
- Produces: `registerEntity` seeds `guarding: false`; `setGuarding(id, bool)`; `endTurn` clears guarding.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/combat/combatStatController.guard.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { CombatStatController } from '../../../src/game/combat/combatStatController.js';

describe('CombatStatController — guard', () => {
  it('registers entities not guarding', () => {
    const c = new CombatStatController();
    c.registerEntity('player', {});
    expect(c.getEntity('player').guarding).toBe(false);
  });

  it('setGuarding toggles the flag and endTurn clears it', () => {
    const c = new CombatStatController();
    c.registerEntity('player', {});
    c.setGuarding('player', true);
    expect(c.getEntity('player').guarding).toBe(true);
    c.endTurn('player');
    expect(c.getEntity('player').guarding).toBe(false);
  });

  it('setGuarding on a missing entity is a no-op', () => {
    const c = new CombatStatController();
    expect(() => c.setGuarding('nobody', true)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/combat/combatStatController.guard.test.js`
Expected: FAIL — `setGuarding is not a function` / `guarding` undefined.

- [ ] **Step 3: Implement**

In `src/game/combat/combatStatController.js`, add `guarding: false` to the record in `registerEntity` (next to `statuses: []`):

```js
      attackUsed: false,
      statuses: [],
      guarding: false,
    };
```

Add a `setGuarding` method (place it before `endTurn`):

```js
  setGuarding(id, value) {
    const e = this.entities.get(id);
    if (!e) return e;
    e.guarding = !!value;
    return e;
  }
```

In `endTurn`, clear guarding — change:

```js
    e.movementPointsRemaining = e.movementPoints;
    e.attackUsed = false;
    return e;
```

to:

```js
    e.movementPointsRemaining = e.movementPoints;
    e.attackUsed = false;
    e.guarding = false;
    return e;
```

- [ ] **Step 4: Run tests (new + Slice-1 controller both pass)**

Run: `npx vitest run tests/unit/combat/combatStatController.guard.test.js tests/unit/combat/combatStatController.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/combat/combatStatController.js tests/unit/combat/combatStatController.guard.test.js
git commit -m "feat(combat): guard state on the stat controller"
```

---

### Task 3: Arm-rig forward kinematics

**Files:**
- Create: `src/game/combat/armRig.js`
- Test: `tests/unit/combat/armRig.test.js`

**Interfaces:**
- Produces:
  - `solveArm(arm, anglesDeg) => Array<{ key, jointX, jointY, angleRad }>` — canvas-space joint position + accumulated rotation per segment.
  - `gripWorld(arm, anglesDeg) => { x, y, angleRad }` — canvas-space grip point + hand rotation.
- `arm` = `{ shoulder: {x,y}, mirror: boolean, segments: [{ key, pivot:{x,y}, childOffset:{x,y}, restAngleDeg, gripPoint?:{x,y} }] }` (Task 4 supplies concrete ones).

- [ ] **Step 1: Write the failing test**

Create `tests/unit/combat/armRig.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { solveArm, gripWorld } from '../../../src/game/combat/armRig.js';

// A 2-segment horizontal chain rooted at origin; each segment 10 long.
const arm = {
  shoulder: { x: 0, y: 0 },
  mirror: false,
  segments: [
    { key: 'upper', pivot: { x: 0, y: 0 }, childOffset: { x: 10, y: 0 }, restAngleDeg: 0 },
    { key: 'fore', pivot: { x: 0, y: 0 }, childOffset: { x: 5, y: 0 }, restAngleDeg: 0, gripPoint: { x: 5, y: 0 } },
  ],
};

const near = (a, b) => Math.abs(a - b) < 1e-6;

describe('armRig forward kinematics', () => {
  it('places segments along the chain at rest', () => {
    const [upper, fore] = solveArm(arm, [0, 0]);
    expect(upper.jointX).toBe(0);
    expect(upper.jointY).toBe(0);
    expect(near(fore.jointX, 10)).toBe(true);
    expect(near(fore.jointY, 0)).toBe(true);
    expect(gripWorld(arm, [0, 0]).x).toBeCloseTo(15, 6);
  });

  it('rotates the chain about the shoulder', () => {
    const [, fore] = solveArm(arm, [90, 0]); // upper rotates +90°
    expect(near(fore.jointX, 0)).toBe(true);
    expect(near(fore.jointY, 10)).toBe(true);
    expect(gripWorld(arm, [90, 0]).y).toBeCloseTo(15, 6);
  });

  it('accumulates child rotation', () => {
    const grip = gripWorld(arm, [0, 90]); // fore bends +90° at the elbow
    expect(grip.x).toBeCloseTo(10, 6);
    expect(grip.y).toBeCloseTo(5, 6);
  });

  it('mirror flips the X advance', () => {
    const [, fore] = solveArm({ ...arm, mirror: true }, [0, 0]);
    expect(near(fore.jointX, -10)).toBe(true);
  });

  it('missing angles fall back to rest without throwing', () => {
    expect(() => solveArm(arm, [])).not.toThrow();
    expect(solveArm(arm, [])[1].jointX).toBeCloseTo(10, 6);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/combat/armRig.test.js`
Expected: FAIL — cannot resolve `armRig.js`.

- [ ] **Step 3: Implement**

Create `src/game/combat/armRig.js`:

```js
/**
 * armRig.js — pure 2D forward kinematics for a jointed arm.
 *
 * The 2D sibling of voxel-keyframe.js's compose order: each segment rotates
 * about its pivot, and the child joint is the parent's childOffset carried
 * through the accumulated rotation. Works in SCDL canvas pixel space.
 */

const deg2rad = (d) => (d * Math.PI) / 180;

function advance(jointX, jointY, dx, dy, angleRad, mirror) {
  const mx = mirror ? -dx : dx;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return { x: jointX + mx * cos - dy * sin, y: jointY + mx * sin + dy * cos };
}

/** @returns {Array<{key,jointX,jointY,angleRad}>} */
export function solveArm(arm, anglesDeg = []) {
  const results = [];
  let jointX = arm.shoulder.x;
  let jointY = arm.shoulder.y;
  let accDeg = 0;
  arm.segments.forEach((seg, i) => {
    const delta = Number.isFinite(anglesDeg[i]) ? anglesDeg[i] : 0;
    const local = (arm.mirror ? -1 : 1) * (seg.restAngleDeg + delta);
    accDeg += local;
    const angleRad = deg2rad(accDeg);
    results.push({ key: seg.key, jointX, jointY, angleRad });
    const dx = seg.childOffset.x - seg.pivot.x;
    const dy = seg.childOffset.y - seg.pivot.y;
    const next = advance(jointX, jointY, dx, dy, angleRad, arm.mirror);
    jointX = next.x;
    jointY = next.y;
  });
  return results;
}

/** Resolve the hand segment's gripPoint in canvas space. */
export function gripWorld(arm, anglesDeg = []) {
  const solved = solveArm(arm, anglesDeg);
  const handIdx = arm.segments.findIndex((s) => s.gripPoint);
  if (handIdx < 0) return { x: 0, y: 0, angleRad: 0 };
  const seg = arm.segments[handIdx];
  const { jointX, jointY, angleRad } = solved[handIdx];
  const dx = seg.gripPoint.x - seg.pivot.x;
  const dy = seg.gripPoint.y - seg.pivot.y;
  const p = advance(jointX, jointY, dx, dy, angleRad, arm.mirror);
  return { x: p.x, y: p.y, angleRad };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/combat/armRig.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/combat/armRig.js tests/unit/combat/armRig.test.js
git commit -m "feat(combat): pure 2D forward-kinematics arm rig"
```

---

### Task 4: Arm-rig config (chains + pose library)

**Files:**
- Create: `src/data/armRigConfig.js`
- Test: `tests/unit/combat/armRigConfig.test.js`

**Interfaces:**
- Consumes: shape expected by `solveArm` (Task 3).
- Produces: `ARM_RIG = { right, left }` (each an `arm` for `solveArm`, with `spriteKey` per segment) and `ARM_POSES = { carry, swing, block }` (per-arm joint-angle arrays); `getPose(name)`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/combat/armRigConfig.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { ARM_RIG, ARM_POSES, getPose } from '../../../src/data/armRigConfig.js';
import { solveArm, gripWorld } from '../../../src/game/combat/armRig.js';

describe('armRigConfig', () => {
  it('defines both arms with three segments and sprite keys', () => {
    for (const side of ['right', 'left']) {
      expect(ARM_RIG[side].segments).toHaveLength(3);
      ARM_RIG[side].segments.forEach((s) => expect(typeof s.spriteKey).toBe('string'));
      expect(ARM_RIG[side].segments[2].gripPoint).toBeTruthy(); // hand holds the grip
    }
    expect(ARM_RIG.left.mirror).toBe(true);
  });

  it('poses provide a 3-angle array per relevant arm', () => {
    expect(getPose('carry').right).toHaveLength(3);
    expect(getPose('swing').right).toHaveLength(3);
    expect(getPose('block').left).toHaveLength(3);
    expect(getPose('unknown')).toEqual(getPose('carry')); // fallback
  });

  it('is solvable — the right arm carry pose yields a grip below the shoulder', () => {
    const grip = gripWorld(ARM_RIG.right, getPose('carry').right);
    expect(grip.y).toBeGreaterThan(ARM_RIG.right.shoulder.y); // hand hangs down
    expect(() => solveArm(ARM_RIG.right, getPose('swing').right)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/combat/armRigConfig.test.js`
Expected: FAIL — cannot resolve `armRigConfig.js`.

- [ ] **Step 3: Implement**

Create `src/data/armRigConfig.js`:

```js
/**
 * armRigConfig.js — data-only joint definition for the two-arm rig.
 *
 * Pivots are SCDL canvas coordinates (64x128). restAngleDeg is 0 because each
 * segment sprite is drawn in its rest position; poses supply angle DELTAS.
 * Tune pivots against the running arena (see plan Task 8). New poses/weapons
 * drop in here without touching the scene.
 */

export const ARM_RIG = {
  right: {
    shoulder: { x: 43, y: 30 },
    mirror: false,
    segments: [
      { key: 'upper', spriteKey: 'armR-upper', pivot: { x: 43, y: 30 }, childOffset: { x: 44, y: 44 }, restAngleDeg: 0 },
      { key: 'fore', spriteKey: 'armR-fore', pivot: { x: 44, y: 44 }, childOffset: { x: 44, y: 58 }, restAngleDeg: 0 },
      { key: 'hand', spriteKey: 'armR-hand', pivot: { x: 44, y: 58 }, childOffset: { x: 44, y: 64 }, restAngleDeg: 0, gripPoint: { x: 45, y: 62 } },
    ],
  },
  left: {
    shoulder: { x: 21, y: 30 },
    mirror: true,
    segments: [
      { key: 'upper', spriteKey: 'armL-upper', pivot: { x: 21, y: 30 }, childOffset: { x: 20, y: 44 }, restAngleDeg: 0 },
      { key: 'fore', spriteKey: 'armL-fore', pivot: { x: 20, y: 44 }, childOffset: { x: 19, y: 58 }, restAngleDeg: 0 },
      { key: 'hand', spriteKey: 'armL-hand', pivot: { x: 19, y: 58 }, childOffset: { x: 19, y: 64 }, restAngleDeg: 0, gripPoint: { x: 19, y: 62 } },
    ],
  },
};

// Pose = per-arm array of angle DELTAS (deg) applied to [upper, fore, hand].
export const ARM_POSES = {
  carry: { right: [0, 0, 0], left: [0, 0, 0] },
  // Windup back and a downward strike come from animating between these at runtime;
  // the pose here is the strike endpoint used as the animation target.
  swing: { right: [40, 25, 0], left: [0, 0, 0] },
  // Left forearm raises across the body to bring the shield up.
  block: { right: [0, 0, 0], left: [-35, 60, 0] },
};

export function getPose(name) {
  return ARM_POSES[name] || ARM_POSES.carry;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/combat/armRigConfig.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/armRigConfig.js tests/unit/combat/armRigConfig.test.js
git commit -m "feat(combat): arm-rig config (chains + pose library)"
```

---

### Task 5: SCDL arm splitter (derive armless body + segments)

**Files:**
- Create: `src/game/combat/scdlArmSplitter.js`
- Test: `tests/unit/combat/scdlArmSplitter.test.js`

**Interfaces:**
- Produces: `splitArms(scdlText) => { bodyNoArms: string, segments: Record<'armR-upper'|'armR-fore'|'armR-hand'|'armL-upper'|'armL-fore'|'armL-hand', string> }`.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/combat/scdlArmSplitter.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { splitArms } from '../../../src/game/combat/scdlArmSplitter.js';

const SAMPLE = `asset IdealHuman canvas 64x128
palette {
  skin = #C08850
}
part torso material skin_light {
  rect 26 20 12 30 skin
}
part armR material skin_light {
  sphere 43 28 radius 4 skin
  polygon 41 33 47 33 46 43 42 43 skin
  rect 42 44 4 2 skinshade
  polygon 42 46 47 46 45 58 43 58 skin
  polygon 43 59 47 59 46 64 44 64 skin
}
part armL material skin_light {
  sphere 21 28 radius 4 skin
  polygon 17 33 23 33 22 43 18 43 skin
  polygon 18 46 23 46 21 58 19 58 skin
  polygon 17 59 21 59 20 64 18 64 skin
}
loop walk duration 800
frame 1 "a" {
  part armR material skin_light { polygon 41 30 47 30 46 43 42 43 skin }
}`;

describe('scdlArmSplitter', () => {
  const out = splitArms(SAMPLE);

  it('body keeps the torso and drops both arm parts (base and frame overrides)', () => {
    expect(out.bodyNoArms).toContain('part torso');
    expect(out.bodyNoArms).not.toContain('part armR');
    expect(out.bodyNoArms).not.toContain('part armL');
    expect(out.bodyNoArms).toContain('loop walk'); // walk preserved
  });

  it('emits six segment assets, each a standalone SCDL with the palette', () => {
    const keys = Object.keys(out.segments);
    expect(keys.sort()).toEqual(['armL-fore','armL-hand','armL-upper','armR-fore','armR-hand','armR-upper']);
    for (const text of Object.values(out.segments)) {
      expect(text).toMatch(/^asset /);
      expect(text).toContain('canvas 64x128');
      expect(text).toContain('palette');
    }
  });

  it('buckets primitives by Y-band', () => {
    expect(out.segments['armR-upper']).toContain('sphere 43 28'); // y28 -> upper
    expect(out.segments['armR-upper']).toContain('rect 42 44');   // y44 -> upper (elbow)
    expect(out.segments['armR-fore']).toContain('polygon 42 46'); // y46 -> fore
    expect(out.segments['armR-hand']).toContain('polygon 43 59'); // y59 -> hand
    expect(out.segments['armR-fore']).not.toContain('sphere 43 28');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/combat/scdlArmSplitter.test.js`
Expected: FAIL — cannot resolve `scdlArmSplitter.js`.

- [ ] **Step 3: Implement**

Create `src/game/combat/scdlArmSplitter.js`:

```js
/**
 * scdlArmSplitter.js — derive the armless body + 6 arm-segment SCDL assets
 * from a single IdealHuman.scdl source. Pure text transformation.
 *
 * Segments bucket a part's primitive lines by their first Y coordinate
 * (token index 2: `<op> <x> <y> ...`): upper y<46, fore 46..58, hand y>=59.
 */

const BANDS = [
  { name: 'upper', test: (y) => y < 46 },
  { name: 'fore', test: (y) => y >= 46 && y < 59 },
  { name: 'hand', test: (y) => y >= 59 },
];

// Extract the header (everything up to the first top-level `part`) which holds
// `asset ...` and the `palette { ... }` block.
function extractHeader(text) {
  const idx = text.indexOf('\npart ');
  return (idx < 0 ? text : text.slice(0, idx)).trim();
}

function extractPaletteBlock(text) {
  const start = text.indexOf('palette');
  if (start < 0) return 'palette {\n}';
  let i = text.indexOf('{', start);
  let depth = 0;
  for (let j = i; j < text.length; j += 1) {
    if (text[j] === '{') depth += 1;
    else if (text[j] === '}') { depth -= 1; if (depth === 0) return text.slice(start, j + 1); }
  }
  return text.slice(start);
}

// Find each top-level `part <name> ... { ... }` block; returns {name, start, end, body}.
function findParts(text) {
  const parts = [];
  const re = /part\s+(\w+)[^\{]*\{/g;
  let m;
  while ((m = re.exec(text))) {
    const braceStart = text.indexOf('{', m.index);
    let depth = 0;
    let end = braceStart;
    for (let j = braceStart; j < text.length; j += 1) {
      if (text[j] === '{') depth += 1;
      else if (text[j] === '}') { depth -= 1; if (depth === 0) { end = j; break; } }
    }
    parts.push({ name: m[1], start: m.index, end: end + 1, body: text.slice(braceStart + 1, end) });
    re.lastIndex = end + 1;
  }
  return parts;
}

function stripArmParts(text) {
  // Remove every `part armL|armR { ... }` block anywhere (base + inside frames).
  const parts = findParts(text);
  let out = text;
  for (const p of parts.filter((x) => x.name === 'armL' || x.name === 'armR').sort((a, b) => b.start - a.start)) {
    out = out.slice(0, p.start) + out.slice(p.end);
  }
  return out.replace(/\n{3,}/g, '\n\n').trim();
}

function firstY(line) {
  const toks = line.trim().split(/\s+/);
  return Number.parseInt(toks[2], 10);
}

function bandOf(line) {
  const y = firstY(line);
  if (!Number.isFinite(y)) return null;
  return (BANDS.find((b) => b.test(y)) || {}).name || null;
}

export function splitArms(scdlText) {
  const header = extractHeader(scdlText);
  const palette = extractPaletteBlock(scdlText);
  const assetLine = (header.match(/^asset\s+\w+\s+canvas\s+\S+/m) || ['asset IdealHuman canvas 64x128'])[0];

  const bodyNoArms = stripArmParts(scdlText);

  const parts = findParts(scdlText);
  const segments = {};
  for (const arm of ['armR', 'armL']) {
    // The BASE part is the first occurrence (frame overrides come later).
    const base = parts.find((p) => p.name === arm);
    if (!base) continue;
    const buckets = { upper: [], fore: [], hand: [] };
    for (const raw of base.body.split('\n')) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;
      const band = bandOf(line);
      if (band) buckets[band].push('  ' + line);
    }
    for (const band of ['upper', 'fore', 'hand']) {
      const name = `${arm}-${band}`;
      const asset = assetLine.replace(/asset\s+\w+/, `asset ${arm[0].toUpperCase()}${arm.slice(1)}${band[0].toUpperCase()}${band.slice(1)}`);
      segments[name] = `${asset}\n${palette}\npart ${arm} material skin_light {\n${buckets[band].join('\n')}\n}\n`;
    }
  }
  return { bodyNoArms, segments };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/combat/scdlArmSplitter.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/game/combat/scdlArmSplitter.js tests/unit/combat/scdlArmSplitter.test.js
git commit -m "feat(combat): pure SCDL arm splitter (armless body + segments)"
```

---

### Task 6: Build script — generate + compile the rig assets

**Files:**
- Create: `scripts/build-arm-rig-assets.mjs`
- Modify: `package.json` (add `assets:armrig` script)

**Interfaces:**
- Consumes: `splitArms` (Task 5), `scdl.cli.js`.
- Produces (to `generated-assets/IdealHuman/`): `IdealHuman-body-noArms-f0..f8-png.png` and six `IdealHuman{ArmRUpper,…}-png.png`.

- [ ] **Step 1: Write the build script**

Create `scripts/build-arm-rig-assets.mjs`:

```js
// Derives the armless body + 6 arm-segment SCDL files from IdealHuman.scdl and
// compiles each to PNG via the SCDL CLI. Run: npm run assets:armrig
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitArms } from '../src/game/combat/scdlArmSplitter.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'generated-assets', 'IdealHuman');
const cli = join(root, 'codex', 'core', 'pixelbrain', 'scdl', 'scdl.cli.js');

const src = readFileSync(join(dir, 'IdealHuman.scdl'), 'utf8');
const { bodyNoArms, segments } = splitArms(src);

const files = { 'IdealHuman-body-noArms.scdl': bodyNoArms };
for (const [name, text] of Object.entries(segments)) files[`${name}.scdl`] = text;

for (const [fname, text] of Object.entries(files)) {
  const path = join(dir, fname);
  writeFileSync(path, text);
  console.log('[armrig] wrote', fname);
  execFileSync('node', [cli, 'compile', path, '--export', 'png', '--out-dir', dir], { stdio: 'inherit' });
}
console.log('[armrig] done');
```

- [ ] **Step 2: Add the npm script**

In `package.json` `scripts`, add:

```json
    "assets:armrig": "node scripts/build-arm-rig-assets.mjs",
```

- [ ] **Step 3: Run the build and verify the PNGs exist**

Run: `npm run assets:armrig`
Then: `ls generated-assets/IdealHuman/IdealHuman-body-noArms-f0-png.png generated-assets/IdealHuman/armR-upper-png.png generated-assets/IdealHuman/armL-hand-png.png`
Expected: all three paths listed (build printed each `wrote` + compiled without error). Output filenames follow the source `.scdl` stem, so `armR-upper.scdl` → `armR-upper-png.png`.

- [ ] **Step 4: Sanity-check the body is armless**

Run: `node -e "const {readFileSync}=require('fs');const t=readFileSync('generated-assets/IdealHuman/IdealHuman-body-noArms.scdl','utf8');console.log('armR' in {} ? 'x' : (t.includes('part armR')?'HAS ARM':'ARMLESS OK'))"`
Expected: `ARMLESS OK`.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-arm-rig-assets.mjs package.json generated-assets/IdealHuman/
git commit -m "build(combat): generate armless body + arm-segment assets from SCDL"
```

---

## PHASE B — Scene integration + block (in-app, calibrated)

> Phase B edits the 2400-line `CombatArenaScene.js` and is verified in-app on the dev server. Pivots in `armRigConfig.js` are starting estimates; Task 8 includes a calibration step.

### Task 7: Compose the player from armless body + segments (rest pose)

**Files:**
- Modify: `src/phaser/CombatArenaScene.js`

**Interfaces:**
- Consumes: `ARM_RIG`, `getPose` (Task 4), `solveArm`, `gripWorld` (Task 3), `equipSlotOf` (Task 1).
- Produces: `this.armSegments` (map key→sprite), `this.applyArmPose(poseName)`, `this.handPayloads` (`{mainHand, offHand}`), routed by `handleEquipmentChange`.

- [ ] **Step 1: Preload the new textures**

In `CombatArenaScene.js` `preload()` (near the existing `this.load.image('ideal-human-f${i}', …)`), add the body-noArms frames and the six segments:

```js
      for (let i = 0; i <= 8; i += 1) {
        this.load.image(`body-noarms-f${i}`, `/generated-assets/IdealHuman/IdealHuman-body-noArms-f${i}-png.png`);
      }
      // The SCDL CLI names outputs after the SOURCE FILENAME stem, so the
      // segment files armR-upper.scdl… compile to armR-upper-png.png…, and the
      // texture key equals the armRigConfig spriteKey.
      const SEG_KEYS = ['armR-upper', 'armR-fore', 'armR-hand', 'armL-upper', 'armL-fore', 'armL-hand'];
      for (const key of SEG_KEYS) {
        this.load.image(key, `/generated-assets/IdealHuman/${key}-png.png`);
      }
```

- [ ] **Step 2: Add imports**

At the top of the file, after the Slice-2 imports, add:

```js
import { ARM_RIG, getPose } from '../data/armRigConfig.js';
import { solveArm, gripWorld } from '../game/combat/armRig.js';
import { equipSlotOf } from '../data/itemDatabase.js';
```

- [ ] **Step 3: Build the rig sprites in create()**

Where the player container is assembled (right after `playerContainer.add(armorLayers.weapon);`), swap the base body texture to the armless body and add segment + hand-payload sprites:

```js
      // Two-arm rig: armless body + jointed segment sprites (canvas 64x128,
      // origin at each segment's joint pivot). Body origin (0.5,0.875) => a
      // canvas point (px,py) maps to container-local (px-32, py-112).
      playerImg.setTexture('body-noarms-f0');
      const CANVAS_W = 64, CANVAS_H = 128, OX = 32, OY = 112;
      this.armSegments = {};
      for (const side of ['right', 'left']) {
        for (const seg of ARM_RIG[side].segments) {
          const s = this.add.sprite(0, 0, seg.spriteKey);
          s.setOrigin(seg.pivot.x / CANVAS_W, seg.pivot.y / CANVAS_H);
          playerContainer.add(s);
          this.armSegments[seg.spriteKey] = s;
        }
      }
      // Hand payloads (main = right, off = left); textures set by equipment.
      this.handPayloads = {
        mainHand: this.add.sprite(0, 0, 'ideal-human-f0').setVisible(false),
        offHand: this.add.sprite(0, 0, 'ideal-human-f0').setVisible(false),
      };
      playerContainer.add(this.handPayloads.mainHand);
      playerContainer.add(this.handPayloads.offHand);
      this._rigCanvas = { OX, OY, CANVAS_W, CANVAS_H };
```

- [ ] **Step 4: Add the pose-application method**

Add this scene method (near `emitCombatStats`):

```js
    applyArmPose = (poseName) => {
      if (!this.armSegments) return;
      const pose = getPose(poseName);
      const { OX, OY } = this._rigCanvas;
      for (const side of ['right', 'left']) {
        const arm = ARM_RIG[side];
        const solved = solveArm(arm, pose[side]);
        solved.forEach((r, i) => {
          const sprite = this.armSegments[arm.segments[i].spriteKey];
          if (!sprite) return;
          sprite.setPosition(r.jointX - OX, r.jointY - OY);
          sprite.setRotation(r.angleRad);
        });
        // Place the hand payload at the grip.
        const grip = gripWorld(arm, pose[side]);
        const payload = side === 'right' ? this.handPayloads.mainHand : this.handPayloads.offHand;
        payload.setPosition(grip.x - OX, grip.y - OY);
        payload.setRotation(grip.angleRad);
      }
    };
```

- [ ] **Step 5: Apply the rest pose after building the rig + on the equipment hook**

After the seed calls at the end of the player build (near `this.emitCombatStats();`), add:

```js
      this.applyArmPose('carry');
```

Replace the body of `handleEquipmentChange` so hands route through `equipSlotOf` (keep the armor-layer loop for head/chest/legs/boots):

```js
    handleEquipmentChange = (event) => {
      const equipment = event.detail || {};
      if (!this.playerArmorLayers) return;
      const armorMap = {
        head: this.playerArmorLayers.head,
        chest: this.playerArmorLayers.chest,
        legs: this.playerArmorLayers.legs,
        boots: this.playerArmorLayers.boots,
      };
      for (const [slot, sprite] of Object.entries(armorMap)) {
        if (!sprite) continue;
        const item = equipment[slot];
        const frame0Id = item ? `${item.assetId}-f0` : null;
        if (frame0Id && this.textures.exists(frame0Id)) { sprite.setTexture(frame0Id); sprite.setVisible(true); }
        else sprite.setVisible(false);
      }
      // Hands: route every equipped item by its slot.
      const hands = { mainHand: null, offHand: null };
      for (const item of Object.values(equipment)) {
        const slot = equipSlotOf(item);
        if (slot) hands[slot] = item;
      }
      for (const slot of ['mainHand', 'offHand']) {
        const payload = this.handPayloads[slot];
        const item = hands[slot];
        const frame0Id = item ? `${item.assetId}-f0` : null;
        if (payload && frame0Id && this.textures.exists(frame0Id)) { payload.setTexture(frame0Id); payload.setVisible(true); }
        else if (payload) payload.setVisible(false);
      }
    };
```

- [ ] **Step 6: Build + load the arena; confirm the character reconstructs**

Run: `npx vite build 2>&1 | grep -E "error|built in" | grep -v "dynamically imported" | tail -3`
Then start the dev server and open `/combat` (see Task 10 harness). Expected: the character renders whole — the armless body plus the six segment sprites overlay into the original silhouette at rest (arms in place). If arms are visibly offset, adjust the pivots in `armRigConfig.js` (Task 8 calibration).

- [ ] **Step 7: Commit**

```bash
git add src/phaser/CombatArenaScene.js
git commit -m "feat(combat): compose player from armless body + jointed arm segments"
```

---

### Task 8: Reimplement the swing as right-arm articulation

**Files:**
- Modify: `src/phaser/CombatArenaScene.js`

**Interfaces:**
- Consumes: `applyArmPose` (Task 7), `getRotationAtTime`/`getTimeForRotation` (Slice 2 import), `getPose`.
- Produces: `performSwing(element)` now animates the right arm carry→swing→carry; streak + particles + Slice-2 enchant/DoT preserved.

- [ ] **Step 1: Calibrate the rest pivots (in-app)**

With the dev server running and `/combat` open, visually confirm the arms sit correctly at `carry`. If a segment is offset, nudge that segment's `pivot`/`childOffset` (and `shoulder`) in `src/data/armRigConfig.js` by the observed pixel delta and reload. Iterate until the rest silhouette matches the original character. (Pure-math values from the SCDL are close; this is fine-tuning only.)

- [ ] **Step 2: Replace performSwing to animate the arm**

Replace the Slice-2 `performSwing = (element) => { … }` method with an arm-driven version (keeps the streak + particles):

```js
    performSwing = (element) => {
      const SWING_BPM = 120, SWING_DEG_PER_BEAT = 360, ARC = Math.PI;
      const durationMs = getTimeForRotation(ARC, SWING_BPM, SWING_DEG_PER_BEAT);
      const streakColor = element ? element.streakColor : 0xffffff;
      const strike = getPose('swing').right;   // strike endpoint angles
      const rest = getPose('carry').right;

      // Streak + particle flourish (unchanged from Slice 2).
      const px = this.playerContainer ? this.playerContainer.x : 0;
      const py = this.playerContainer ? this.playerContainer.y : 0;
      const streak = this.add.sprite(px, py - 40, 'swing-streak');
      streak.setDepth(30); streak.setTint(streakColor); streak.setBlendMode(Phaser.BlendModes.ADD); streak.setAlpha(0.9);
      if (element && this.add.particles && this.textures.exists('doom-fire')) {
        const burst = this.add.particles(px, py - 40, 'doom-fire', { speed: { min: 40, max: 120 }, lifespan: 350, quantity: 12, scale: { start: 0.5, end: 0 }, alpha: { start: 0.9, end: 0 }, blendMode: 'ADD', tint: element.particleTint });
        this.time.delayedCall(120, () => burst && burst.stop());
        this.time.delayedCall(600, () => burst && burst.destroy());
      }

      // Animate the right arm along the arc using gear-glide time-based rotation:
      // phase 0->1 eased by gear-glide, interpolating carry -> strike angles.
      const proxy = { v: 0 };
      const applyPhase = (phase) => {
        const angles = strike.map((a, i) => rest[i] + (a - rest[i]) * phase);
        this._overrideRightArm(angles);
        streak.setRotation(Phaser.Math.DegToRad(-135) + ARC * phase);
      };
      const finish = () => { this._overrideRightArm(null); this.applyArmPose('carry'); };
      this.tweens.add({
        targets: proxy, v: 1, duration: durationMs, yoyo: true, ease: 'Sine.easeInOut',
        onUpdate: () => {
          const elapsed = proxy.v * durationMs;
          const swept = Math.min(ARC, getRotationAtTime(elapsed, SWING_BPM, SWING_DEG_PER_BEAT));
          applyPhase(swept / ARC);
        },
        onComplete: finish,
      });
      this.time.delayedCall(durationMs * 2 + 60, finish); // safety restore
      this.tweens.add({ targets: streak, alpha: 0, y: py - 70, duration: durationMs + 80, ease: 'Quad.easeOut', onComplete: () => streak.destroy() });
    };

    // Apply explicit right-arm angles for one animation frame (null = clear).
    _overrideRightArm = (angles) => {
      const { OX, OY } = this._rigCanvas;
      const arm = ARM_RIG.right;
      const use = angles || getPose('carry').right;
      const solved = solveArm(arm, use);
      solved.forEach((r, i) => {
        const s = this.armSegments[arm.segments[i].spriteKey];
        if (!s) return;
        s.setPosition(r.jointX - OX, r.jointY - OY);
        s.setRotation(r.angleRad);
      });
      const grip = gripWorld(arm, use);
      this.handPayloads.mainHand.setPosition(grip.x - OX, grip.y - OY);
      this.handPayloads.mainHand.setRotation(grip.angleRad);
    };
```

- [ ] **Step 3: Build + verify the swing in-app**

Run: `npx vite build 2>&1 | grep -E "error|built in" | grep -v "dynamically imported" | tail -3`
Then on the dev server, move adjacent to the dummy and press `F`. Expected: the right arm articulates through the overhead arc (segments rotate about their joints, sword tracks the hand) and returns to rest; the white/element streak still sweeps; Slice-2 fire enchant + burn still work (dummy HP/DoT unchanged in behavior).

- [ ] **Step 4: Commit**

```bash
git add src/phaser/CombatArenaScene.js src/data/armRigConfig.js
git commit -m "feat(combat): swing as right-arm articulation via gear-glide (rig)"
```

---

### Task 9: Shield block + guard state + HUD

**Files:**
- Modify: `src/phaser/CombatArenaScene.js`, `src/pages/Combat/CombatPage.jsx`

**Interfaces:**
- Consumes: `applyArmPose` (Task 7), `setGuarding`/`endTurn` guard (Task 2).
- Produces: `combat-block` window event + `B` key → left-arm block pose + `guarding`; `combat-stats-changed` gains `guarding`; HUD Block button + indicator.

- [ ] **Step 1: Scene — block handler + guard, block key, listener, clear on end turn**

Add a scene method (near `endPlayerTurn`):

```js
    performBlock = () => {
      if (!this.stats) return;
      this.stats.setGuarding('player', true);
      this.applyArmPose('block');
      this.emitCombatStats();
    };
```

In `handleGlobalKeydown`, after the attack/end-turn keys, add the block key:

```js
      if (e.key === 'b' || e.key === 'B') { this.performBlock(); return; }
```

Register a HUD listener next to the Slice-2 `combat-attack`/`combat-endturn` listeners:

```js
      this.boundHandleHudBlock = () => this.performBlock();
      window.addEventListener('combat-block', this.boundHandleHudBlock);
      this.events.once('destroy', () => window.removeEventListener('combat-block', this.boundHandleHudBlock));
```

In `endPlayerTurn`, drop the guard/block pose after `this.stats.endTurn('player')` (which already clears the flag):

```js
      this.stats.endTurn('player');
      this.applyArmPose('carry');
      this.emitCombatStats();
```

In `emitCombatStats`, add `guarding` to the payload (next to `dummyStatuses`):

```js
          guarding: p.guarding || false,
```

- [ ] **Step 2: HUD — Block button + guarding indicator**

In `src/pages/Combat/CombatPage.jsx`, inside the stat panel's button row (the `div` holding Attack + End Turn), add a Block button before End Turn:

```jsx
            <button
              onClick={() => window.dispatchEvent(new CustomEvent('combat-block'))}
              style={{
                flex: 1, padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                border: '1px solid rgba(120,180,255,0.4)', background: combatStats.guarding ? 'rgba(120,180,255,0.35)' : 'rgba(120,180,255,0.12)',
                color: '#8ab4ff', fontFamily: 'inherit', fontSize: 12,
              }}
            >
              {combatStats.guarding ? 'Guarding' : 'Block (B)'}
            </button>
```

- [ ] **Step 3: Build + verify block in-app**

Run: `npx vite build 2>&1 | grep -E "error|built in" | grep -v "dynamically imported" | tail -3`
Then on the dev server: equip a shield (or with the default off-hand), press `B` (or the HUD button). Expected: the left arm raises to the block pose, the HUD button reads "Guarding"; press End Turn → the arm returns to carry and the indicator clears.

- [ ] **Step 4: Commit**

```bash
git add src/phaser/CombatArenaScene.js src/pages/Combat/CombatPage.jsx
git commit -m "feat(combat): shield block pose + guard state + HUD control"
```

---

### Task 10: End-to-end verification

**Files:** Create (temporary): `_drive-slice3.mjs`.

- [ ] **Step 1: Full combat unit suite**

Run: `npx vitest run tests/unit/combat`
Expected: all combat unit files green (Slice 1–3), no regressions.

- [ ] **Step 2: Start the dev server**

Run: `npx vite --port 5173 &`; wait ~7s; `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/combat` → `200`.

- [ ] **Step 3: Drive the arena**

Create `_drive-slice3.mjs`:

```js
import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
p.on('pageerror', (e) => console.log('[PAGEERROR]', e.message));
await p.addInitScript(() => { window.__lastStats = null; window.addEventListener('combat-stats-changed', (e) => { window.__lastStats = e.detail; }); });
await p.goto('http://localhost:5173/combat', { waitUntil: 'load', timeout: 60000 });
await p.locator('div').filter({ hasText: /MP\s*\d+\/\d+/ }).first().waitFor({ timeout: 45000 });
const canvas = p.locator('canvas').first();
await canvas.click({ position: { x: 60, y: 60 } }).catch(()=>{});
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(650);
await p.getByRole('button', { name: /Attack/ }).click(); await p.waitForTimeout(800); // swing
await p.getByRole('button', { name: /Block|Guarding/ }).click(); await p.waitForTimeout(300);
console.log('guarding after block =', (await p.evaluate(() => window.__lastStats))?.guarding);
await p.getByRole('button', { name: /End Turn/ }).click(); await p.waitForTimeout(300);
console.log('guarding after end turn =', (await p.evaluate(() => window.__lastStats))?.guarding);
await p.screenshot({ path: './_slice3-verify.png' });
await b.close();
```

Run: `node _drive-slice3.mjs`
Expected: `guarding after block = true`, `guarding after end turn = false`, no `[PAGEERROR]`. The screenshot shows the arena with arms composed.

- [ ] **Step 4: Clean up**

Run: `rm -f _drive-slice3.mjs _slice3-verify.png` and stop the dev server. No commit (temp files).

---

## Self-Review

- **Spec coverage:** SCDL armless body + 6 segments (Task 5–6) ✔; item-DB slot + shield (Task 1) ✔; `armRigConfig` chains + pose library (Task 4) ✔; `armRig` FK (Task 3) ✔; guard state (Task 2) ✔; scene composition + equipment routing (Task 7) ✔; right-arm swing via gear-glide (Task 8) ✔; block + guard + HUD (Task 9) ✔; testing incl. dev-server caveat (Task 10) ✔. Deferred items (mitigation math, dual-wield hits, walk-swing, two-handed IK, full-body rig) remain out of scope.
- **Type consistency:** `solveArm(arm, anglesDeg)` / `gripWorld` shapes match between Task 3, Task 4 test, Task 7/8 call sites. `ARM_RIG`/`getPose`/`ARM_POSES` names consistent (Task 4 → 7/8/9). `equipSlotOf` (Task 1) matches Task 7 usage. `setGuarding`/`endTurn`-clears-guard (Task 2) matches Task 9. `splitArms` return shape (Task 5) matches Task 6 script. Segment sprite keys (`armR-upper`…) consistent between config, splitter output names, and preload `segMap`. Event names (`combat-block`, `combat-stats-changed.guarding`) match scene (Task 9) and HUD (Task 9).
- **Placeholder scan:** none — every code step is complete; Phase-B calibration steps (Task 8 Step 1) are explicit tuning instructions, not code gaps.
