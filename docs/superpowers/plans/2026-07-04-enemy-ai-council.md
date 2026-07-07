# Enemy AI Council Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the sentinels' fixed "walk-at-player → fireball" logic with a pure, deterministic Council of weighted mini-brains that plans each enemy turn (move + action), reusable by any future enemy through one bestiary registration.

**Architecture:** A pure `planEnemyTurn(context)` enumerates candidate turn-plans (movement goal × action), scores each with a council of read-only mini-brains whose weights come from a per-enemy personality vector (INT-tier × role × overrides), and picks the argmax. The sentinel is the first consumer via a `combatAI` block on its bestiary entry. No Phaser/DOM in the core; the scene only animates the returned `TurnPlan`.

**Tech Stack:** ES modules, Vitest, existing `combatPathfinding` A*/BFS, existing `combatIntelligence` INT tiers.

## Global Constraints

- ES modules only; pure core (no Phaser/React/DOM imports under `src/game/combat/ai/`). Copied verbatim from spec §2/§4.
- Deterministic: all randomness via an injected `rng` param (default `Math.random`); stable ordering with an index tie-break. Spec §2.
- Basic-attack AP cost is `3` (`BASIC_ATTACK_AP_COST` in `src/game/combat/combatStats.js`). Spec §7.
- Guard mitigation constant `GUARD_DAMAGE_MULTIPLIER = 0.5`. Spec §8.
- Council brain ids (exact strings): `AGGRO_BRAIN`, `SURVIVAL_BRAIN`, `POSITION_BRAIN`, `RESOURCE_BRAIN`, `COORDINATION_BRAIN`. Spec §7.
- Run a single test file with: `npx vitest run <path>`.
- Every commit message ends with the trailer:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Do NOT `git add -A`; add only the exact files listed in each task's commit step (the working tree has unrelated changes).

---

## File Structure

**New — reusable core (`src/game/combat/ai/`):**
- `enemyPersonality.js` — INT-tier/role weight tables + `computeEnemyPersonality`.
- `enemyStance.js` — `evaluateStance`.
- `enemyBrainContract.js` — `validateBrainContext` + diagnostic codes.
- `enemyMovement.js` — `planHold/planAdvance/planKite/planRetreat/planFlank`.
- `council/aggroBrain.js`, `survivalBrain.js`, `positionBrain.js`, `resourceBrain.js`, `coordinationBrain.js`.
- `council/index.js` — `DEFAULT_COUNCIL`, `scoreCandidate`.
- `enemyTurnPlanner.js` — `planEnemyTurn`.
- `enemyCombatDriver.js` — `driveEnemyTurn`.

**Modified — existing:**
- `src/game/combat/combatStats.js` — add `GUARD_DAMAGE_MULTIPLIER`.
- `src/game/combat/combatStatController.js` — guard reduction in `resolveAttack`, `resolveSpellCast`.
- `src/game/combat/sentinelCombatAbilities.js` — guard reduction in `resolveSentinelAbilityDamage`; `planSentinelAttack` gains `stance`.
- `src/game/combat/bestiary/combatBestiary.types.js` — add `combatAI` to the entry typedef.
- `src/game/combat/bestiary/entries/sentinelBrazier.entry.js` — implement `combatAI`.
- `src/phaser/CombatArenaScene.js` — turn loop calls `driveEnemyTurn`.

---

### Task 1: Guard damage mitigation

**Files:**
- Modify: `src/game/combat/combatStats.js`
- Modify: `src/game/combat/combatStatController.js`
- Modify: `src/game/combat/sentinelCombatAbilities.js`
- Test: `tests/unit/combat/combatStatController.test.js`

**Interfaces:**
- Produces: `GUARD_DAMAGE_MULTIPLIER` (number `0.5`) exported from `combatStats.js`; guarded targets take `Math.max(1, Math.round(rawDamage * 0.5))` in all three resolve paths.

- [ ] **Step 1: Write the failing test** — append inside the `describe('CombatStatController — attack', …)` block in `tests/unit/combat/combatStatController.test.js`:

```js
  it('halves basic-attack damage against a guarding target', () => {
    const c = makeController();
    c.setGuarding('dummy', true);
    const res = c.resolveAttack('player', 'dummy'); // base 5 → guarded 3 (round(2.5))
    expect(res.damage).toBe(3);
    expect(c.getEntity('dummy').hp).toBe(97);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/combat/combatStatController.test.js`
Expected: FAIL — `res.damage` is `5`, not `3`.

- [ ] **Step 3a: Add the constant** — in `src/game/combat/combatStats.js`, directly below the existing `export const BASIC_ATTACK_AP_COST = 3;` line:

```js
/** Fraction of incoming damage a guarding entity takes. */
export const GUARD_DAMAGE_MULTIPLIER = 0.5;
```

- [ ] **Step 3b: Apply it in `combatStatController.js`** — add to the import from `./combatStats.js`:

```js
import { buildDefaultStatBlock, BASIC_ATTACK_AP_COST, GUARD_DAMAGE_MULTIPLIER } from './combatStats.js';
```

In `resolveAttack`, replace:

```js
    const damage = computeBasicAttackDamage(attacker.scholomance);
    const targetHp = Math.max(0, (target.hp ?? 0) - damage);
```

with:

```js
    const rawDamage = computeBasicAttackDamage(attacker.scholomance);
    const damage = target.guarding
      ? Math.max(1, Math.round(rawDamage * GUARD_DAMAGE_MULTIPLIER))
      : rawDamage;
    const targetHp = Math.max(0, (target.hp ?? 0) - damage);
```

In `resolveSpellCast`, replace:

```js
    const spellDamage = Math.max(MIN_COMBAT_DAMAGE, Math.round(Number(damage) || 0));
    const targetHp = Math.max(0, (target.hp ?? 0) - spellDamage);
```

with:

```js
    const rawSpellDamage = Math.max(MIN_COMBAT_DAMAGE, Math.round(Number(damage) || 0));
    const spellDamage = target.guarding
      ? Math.max(1, Math.round(rawSpellDamage * GUARD_DAMAGE_MULTIPLIER))
      : rawSpellDamage;
    const targetHp = Math.max(0, (target.hp ?? 0) - spellDamage);
```

- [ ] **Step 3c: Apply it in `sentinelCombatAbilities.js`** — add the import at the top:

```js
import { GUARD_DAMAGE_MULTIPLIER } from './combatStats.js';
```

In `resolveSentinelAbilityDamage`, replace:

```js
  const baseDamage = computeBasicAttackDamage(attacker.scholomance);
  const damage = Math.max(1, Math.round(baseDamage * (plan.damageMultiplier || 1)));
```

with:

```js
  const baseDamage = computeBasicAttackDamage(attacker.scholomance);
  const boosted = Math.max(1, Math.round(baseDamage * (plan.damageMultiplier || 1)));
  const damage = target.guarding
    ? Math.max(1, Math.round(boosted * GUARD_DAMAGE_MULTIPLIER))
    : boosted;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/combat/combatStatController.test.js`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add src/game/combat/combatStats.js src/game/combat/combatStatController.js src/game/combat/sentinelCombatAbilities.js tests/unit/combat/combatStatController.test.js
git commit -m "feat(combat): guarding halves incoming damage

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: `planSentinelAttack` stance conservation

**Files:**
- Modify: `src/game/combat/sentinelCombatAbilities.js`
- Test: `tests/unit/combat/sentinelCombatAbilities.stance.test.js` (create)

**Interfaces:**
- Consumes: existing `planSentinelAttack({ record, sentinels, stats, intelligence, rng })`.
- Produces: `planSentinelAttack` accepts an added `stance` option (default `'AGGRESSIVE'`); when `stance !== 'AGGRESSIVE'` and the pick would apply Matrix Burn without ML being ready, it downgrades to `fireball` and does NOT consume the burn cooldown (conserve).

- [ ] **Step 1: Write the failing test** — create `tests/unit/combat/sentinelCombatAbilities.stance.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { CombatStatController } from '../../../src/game/combat/combatStatController.js';
import { createSentinelAbilityState, planSentinelAttack } from '../../../src/game/combat/sentinelCombatAbilities.js';

function setup() {
  const stats = new CombatStatController();
  stats.registerEntity('sentinel-west', { hp: 40, maxHp: 40, tx: 4, ty: 5, overrides: { intelligence: 40 } });
  stats.registerEntity('player', { hp: 100, maxHp: 100, tx: 4, ty: 6 });
  const record = { id: 'sentinel-west', shortLabel: 'α', abilities: createSentinelAbilityState() };
  return { stats, record };
}

describe('planSentinelAttack stance conservation', () => {
  it('conserves Matrix Burn when stance is not AGGRESSIVE', () => {
    const { stats, record } = setup();
    const plan = planSentinelAttack({ record, sentinels: [record], stats, stance: 'KITE', rng: () => 0.99 });
    expect(plan.applyBurn).toBe(false);
    expect(record.abilities.burnCooldown).toBe(0);
  });

  it('still applies Matrix Burn when AGGRESSIVE (default)', () => {
    const { stats, record } = setup();
    const plan = planSentinelAttack({ record, sentinels: [record], stats, rng: () => 0.99 });
    expect(plan.applyBurn).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/combat/sentinelCombatAbilities.stance.test.js`
Expected: FAIL — first test: `applyBurn` is `true`.

- [ ] **Step 3: Implement** — in `src/game/combat/sentinelCombatAbilities.js`, change the `planSentinelAttack` signature to add `stance`:

```js
export function planSentinelAttack({
  record,
  sentinels,
  stats = null,
  intelligence = null,
  stance = 'AGGRESSIVE',
  rng = Math.random,
} = {}) {
```

Then, immediately after the existing block that assigns `abilityId`/`applyBurn`/`machineLearning` (the `if (abilityId === 'machine_learning') { … } else if (applyBurn) { abilities.burnCooldown = …; }` block), insert a conservation guard. Replace that block:

```js
  if (abilityId === 'machine_learning') {
    machineLearning = pickMachineLearningCounter(abilities, { intelligence: int });
    abilities.turnsSincePlayerCast = null;
  } else if (applyBurn) {
    abilities.burnCooldown = SENTINEL_BURN_DEBUFF.cooldownTurns;
  }
```

with:

```js
  if (abilityId === 'burn' && applyBurn && stance !== 'AGGRESSIVE') {
    // Conserve Matrix Burn while kiting/retreating — cheap swing instead.
    abilityId = 'fireball';
    applyBurn = false;
  }

  if (abilityId === 'machine_learning') {
    machineLearning = pickMachineLearningCounter(abilities, { intelligence: int });
    abilities.turnsSincePlayerCast = null;
  } else if (applyBurn) {
    abilities.burnCooldown = SENTINEL_BURN_DEBUFF.cooldownTurns;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/combat/sentinelCombatAbilities.stance.test.js`
Expected: PASS. Also run the existing sentinel/combat suite to confirm no regression:
`npx vitest run tests/unit/combat/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/combat/sentinelCombatAbilities.js tests/unit/combat/sentinelCombatAbilities.stance.test.js
git commit -m "feat(combat): planSentinelAttack conserves burn when not aggressive

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `enemyPersonality.js` — weight vectors

**Files:**
- Create: `src/game/combat/ai/enemyPersonality.js`
- Test: `tests/unit/combat/ai/enemyPersonality.test.js` (create)

**Interfaces:**
- Produces: `computeEnemyPersonality({ role, intTier, overrides }) → Record<brainId, number>` = `base × INT_TIER_WEIGHTS[intTier] × ROLE_WEIGHTS[role] × overrides`, per brain id, rounded to 3 decimals. Exports `BASE_WEIGHTS`, `INT_TIER_WEIGHTS`, `ROLE_WEIGHTS`.

- [ ] **Step 1: Write the failing test** — create `tests/unit/combat/ai/enemyPersonality.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { computeEnemyPersonality } from '../../../../src/game/combat/ai/enemyPersonality.js';

describe('computeEnemyPersonality', () => {
  it('zeroes non-aggro brains for a brute', () => {
    const w = computeEnemyPersonality({ role: 'bruiser', intTier: 'brute' });
    expect(w.AGGRO_BRAIN).toBeGreaterThan(0);
    expect(w.SURVIVAL_BRAIN).toBe(0);
    expect(w.POSITION_BRAIN).toBe(0);
  });

  it('applies role and override multipliers on top of the INT tier', () => {
    const w = computeEnemyPersonality({
      role: 'skirmisher', intTier: 'tactical', overrides: { SURVIVAL_BRAIN: 2 },
    });
    // tactical SURVIVAL 0.8 × skirmisher 1.2 × override 2 = 1.92
    expect(w.SURVIVAL_BRAIN).toBeCloseTo(1.92, 3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/combat/ai/enemyPersonality.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — create `src/game/combat/ai/enemyPersonality.js`:

```js
/**
 * Per-enemy personality weight vectors over the council of mini-brains.
 * Product formula ported from steamdeck_brain personality_weighting.py:
 *   weight = base × INT-tier boost × role boost × per-enemy override.
 */

export const BASE_WEIGHTS = Object.freeze({
  AGGRO_BRAIN: 1,
  SURVIVAL_BRAIN: 1,
  POSITION_BRAIN: 1,
  RESOURCE_BRAIN: 1,
  COORDINATION_BRAIN: 1,
});

export const INT_TIER_WEIGHTS = Object.freeze({
  brute: { AGGRO_BRAIN: 1, SURVIVAL_BRAIN: 0, POSITION_BRAIN: 0, RESOURCE_BRAIN: 0, COORDINATION_BRAIN: 0 },
  trained: { AGGRO_BRAIN: 1, SURVIVAL_BRAIN: 0.4, POSITION_BRAIN: 0.2, RESOURCE_BRAIN: 0.1, COORDINATION_BRAIN: 0.3 },
  tactical: { AGGRO_BRAIN: 1, SURVIVAL_BRAIN: 0.8, POSITION_BRAIN: 0.7, RESOURCE_BRAIN: 0.3, COORDINATION_BRAIN: 0.7 },
  mastermind: { AGGRO_BRAIN: 1, SURVIVAL_BRAIN: 1.2, POSITION_BRAIN: 1, RESOURCE_BRAIN: 0.5, COORDINATION_BRAIN: 0.9 },
});

export const ROLE_WEIGHTS = Object.freeze({
  bruiser: { AGGRO_BRAIN: 1.2 },
  skirmisher: { POSITION_BRAIN: 1.3, SURVIVAL_BRAIN: 1.2 },
  caster: { POSITION_BRAIN: 1.3, RESOURCE_BRAIN: 1.2 },
});

/**
 * @param {{ role?: string, intTier?: string, overrides?: Record<string, number> }} params
 * @returns {Record<string, number>}
 */
export function computeEnemyPersonality({ role = 'bruiser', intTier = 'trained', overrides = {} } = {}) {
  const tier = INT_TIER_WEIGHTS[intTier] || INT_TIER_WEIGHTS.trained;
  const roleBoost = ROLE_WEIGHTS[role] || {};
  const weights = {};
  for (const id of Object.keys(BASE_WEIGHTS)) {
    let w = BASE_WEIGHTS[id];
    w *= tier[id] ?? 1;
    w *= roleBoost[id] ?? 1;
    w *= overrides[id] ?? 1;
    weights[id] = Math.round(w * 1000) / 1000;
  }
  return weights;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/combat/ai/enemyPersonality.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/combat/ai/enemyPersonality.js tests/unit/combat/ai/enemyPersonality.test.js
git commit -m "feat(combat-ai): per-enemy personality weight vectors

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `enemyStance.js`

**Files:**
- Create: `src/game/combat/ai/enemyStance.js`
- Test: `tests/unit/combat/ai/enemyStance.test.js` (create)

**Interfaces:**
- Consumes: `getIntelligenceTier` from `../combatIntelligence.js`; `manhattan` from `../combatPathfinding.js`.
- Produces: `evaluateStance(context) → { stance, hpRatio, targetHpRatio, tier, dist }` where `stance ∈ {AGGRESSIVE, KITE, RETREAT, HOLD}`. `context` shape: `{ self:{ position, hp, maxHp, attackRange, intelligence }, target:{ position, hp, maxHp }, abilityKit:{ isRanged, preferredRange } }`.

- [ ] **Step 1: Write the failing test** — create `tests/unit/combat/ai/enemyStance.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { evaluateStance } from '../../../../src/game/combat/ai/enemyStance.js';

const base = {
  self: { position: { tx: 0, ty: 0 }, hp: 40, maxHp: 40, attackRange: 2, intelligence: 60 },
  target: { position: { tx: 3, ty: 0 }, hp: 100, maxHp: 100 },
  abilityKit: { isRanged: true, preferredRange: 3 },
};

describe('evaluateStance', () => {
  it('retreats when badly hurt (non-brute)', () => {
    const ctx = { ...base, self: { ...base.self, hp: 8 } };
    expect(evaluateStance(ctx).stance).toBe('RETREAT');
  });

  it('kites when a ranged attacker is inside preferred range', () => {
    const ctx = { ...base, target: { ...base.target, position: { tx: 1, ty: 0 } } };
    expect(evaluateStance(ctx).stance).toBe('KITE');
  });

  it('is always AGGRESSIVE for a brute regardless of HP', () => {
    const ctx = { ...base, self: { ...base.self, hp: 4, intelligence: 5 } };
    expect(evaluateStance(ctx).stance).toBe('AGGRESSIVE');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/combat/ai/enemyStance.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — create `src/game/combat/ai/enemyStance.js`:

```js
import { getIntelligenceTier } from '../combatIntelligence.js';
import { manhattan } from '../combatPathfinding.js';

const LOW_HP_RATIO = 0.3;

/**
 * @param {object} ctx
 * @returns {{ stance: string, hpRatio: number, targetHpRatio: number, tier: string, dist: number }}
 */
export function evaluateStance(ctx) {
  const hpRatio = ctx.self.maxHp > 0 ? ctx.self.hp / ctx.self.maxHp : 1;
  const targetHpRatio = ctx.target.maxHp > 0 ? ctx.target.hp / ctx.target.maxHp : 1;
  const tier = getIntelligenceTier(ctx.self.intelligence);
  const dist = manhattan(ctx.self.position, ctx.target.position);
  const preferred = ctx.abilityKit?.preferredRange ?? ctx.self.attackRange ?? 1;

  let stance = 'AGGRESSIVE';
  if (tier !== 'brute') {
    if (hpRatio <= LOW_HP_RATIO) stance = 'RETREAT';
    else if (ctx.abilityKit?.isRanged && dist < preferred) stance = 'KITE';
    else if (dist > preferred) stance = 'AGGRESSIVE';
    else stance = 'HOLD';
  }
  return { stance, hpRatio, targetHpRatio, tier, dist };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/combat/ai/enemyStance.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/combat/ai/enemyStance.js tests/unit/combat/ai/enemyStance.test.js
git commit -m "feat(combat-ai): enemy stance evaluation

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `enemyBrainContract.js`

**Files:**
- Create: `src/game/combat/ai/enemyBrainContract.js`
- Test: `tests/unit/combat/ai/enemyBrainContract.test.js` (create)

**Interfaces:**
- Produces: `validateBrainContext(brain, probe) → { ok, failures }` where `brain.consumes` is an array of dotted paths resolved against `probe`; each unresolved path yields `{ code: 'AI_BRAIN_CONTEXT_MISSING', selector, message, fatal: true }`. Exports `AI_DIAGNOSTIC_CODES`.

- [ ] **Step 1: Write the failing test** — create `tests/unit/combat/ai/enemyBrainContract.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { validateBrainContext } from '../../../../src/game/combat/ai/enemyBrainContract.js';

const brain = { id: 'AGGRO_BRAIN', consumes: ['self.hp', 'target.position.tx'] };

describe('validateBrainContext', () => {
  it('passes when every consumed path resolves', () => {
    const probe = { self: { hp: 10 }, target: { position: { tx: 3 } } };
    expect(validateBrainContext(brain, probe).ok).toBe(true);
  });

  it('reports a missing consumed path', () => {
    const probe = { self: { hp: 10 }, target: { position: {} } };
    const result = validateBrainContext(brain, probe);
    expect(result.ok).toBe(false);
    expect(result.failures[0]).toMatchObject({ code: 'AI_BRAIN_CONTEXT_MISSING', selector: 'target.position.tx' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/combat/ai/enemyBrainContract.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — create `src/game/combat/ai/enemyBrainContract.js`:

```js
/**
 * Lightweight consumes-contract for council mini-brains — ported from the
 * consumes-check half of pixelbrain seam-contract.js. Brains are read-only
 * scorers, so there is deliberately no emits/mutates half.
 */

export const AI_DIAGNOSTIC_CODES = Object.freeze({
  CONTEXT_MISSING: 'AI_BRAIN_CONTEXT_MISSING',
});

function resolvePath(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/**
 * @param {{ id: string, consumes?: string[] }} brain
 * @param {object} probe - merged context, e.g. { ...context, candidate }
 * @returns {{ ok: boolean, failures: Array<{code:string,selector:string,message:string,fatal:boolean}> }}
 */
export function validateBrainContext(brain, probe) {
  const failures = [];
  for (const selector of brain.consumes || []) {
    if (resolvePath(probe, selector) === undefined) {
      failures.push({
        code: AI_DIAGNOSTIC_CODES.CONTEXT_MISSING,
        selector,
        message: `${brain.id} consumes '${selector}' which the context does not provide.`,
        fatal: true,
      });
    }
  }
  return { ok: failures.length === 0, failures };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/combat/ai/enemyBrainContract.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/combat/ai/enemyBrainContract.js tests/unit/combat/ai/enemyBrainContract.test.js
git commit -m "feat(combat-ai): brain consumes-contract validator

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: `enemyMovement.js`

**Files:**
- Create: `src/game/combat/ai/enemyMovement.js`
- Test: `tests/unit/combat/ai/enemyMovement.test.js` (create)

**Interfaces:**
- Consumes: `findPath`, `getReachableTiles`, `manhattan`, `buildBlockedSet` from `../combatPathfinding.js`.
- Produces: `planHold/planAdvance/planKite/planRetreat/planFlank(ctx) → { kind, steps:[{tx,ty}], destination:{tx,ty} } | null`. `ctx` shape: `{ self:{ position:{tx,ty}, movementPointsRemaining, attackRange }, target:{ position:{tx,ty} }, allies:[{tx,ty}], blocked:Set, abilityKit:{ preferredRange, minRange } }`. `null` means the goal is not applicable this turn. `planHold` never returns null.

- [ ] **Step 1: Write the failing test** — create `tests/unit/combat/ai/enemyMovement.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { buildBlockedSet, manhattan } from '../../../../src/game/combat/combatPathfinding.js';
import { planAdvance, planRetreat, planKite, planFlank, planHold } from '../../../../src/game/combat/ai/enemyMovement.js';

function ctx(overrides = {}) {
  return {
    self: { position: { tx: 1, ty: 1 }, movementPointsRemaining: 3, attackRange: 2 },
    target: { position: { tx: 6, ty: 1 } },
    allies: [],
    blocked: buildBlockedSet([]),
    abilityKit: { preferredRange: 3, minRange: 1 },
    ...overrides,
  };
}

describe('enemyMovement', () => {
  it('planHold stays put', () => {
    expect(planHold(ctx()).destination).toEqual({ tx: 1, ty: 1 });
  });

  it('planAdvance closes distance to the target', () => {
    const before = manhattan({ tx: 1, ty: 1 }, { tx: 6, ty: 1 });
    const plan = planAdvance(ctx());
    expect(manhattan(plan.destination, { tx: 6, ty: 1 })).toBeLessThan(before);
  });

  it('planRetreat increases distance from the target', () => {
    const before = manhattan({ tx: 1, ty: 1 }, { tx: 6, ty: 1 });
    const plan = planRetreat(ctx({ target: { position: { tx: 3, ty: 1 } } }));
    expect(manhattan(plan.destination, { tx: 3, ty: 1 })).toBeGreaterThan(manhattan({ tx: 1, ty: 1 }, { tx: 3, ty: 1 }));
    expect(before).toBeGreaterThan(0);
  });

  it('planKite settles near preferred range', () => {
    const plan = planKite(ctx({ target: { position: { tx: 2, ty: 1 } }, self: { position: { tx: 1, ty: 1 }, movementPointsRemaining: 4, attackRange: 2 } }));
    expect(manhattan(plan.destination, { tx: 2, ty: 1 })).toBeGreaterThanOrEqual(2);
  });

  it('planFlank prefers tiles away from allies', () => {
    const plan = planFlank(ctx({
      target: { position: { tx: 4, ty: 1 } },
      allies: [{ tx: 3, ty: 1 }],
      abilityKit: { preferredRange: 2, minRange: 1 },
    }));
    expect(plan).not.toBeNull();
    expect(manhattan(plan.destination, { tx: 3, ty: 1 })).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/combat/ai/enemyMovement.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — create `src/game/combat/ai/enemyMovement.js`:

```js
import { findPath, getReachableTiles, manhattan } from '../combatPathfinding.js';

function parseKey(key) {
  const [tx, ty] = key.split(',').map(Number);
  return { tx, ty };
}

function movementBudget(ctx) {
  return Math.max(0, Math.floor(ctx.self.movementPointsRemaining || 0));
}

function stepsTo(ctx, dest) {
  const path = findPath(ctx.self.position, dest, ctx.blocked);
  return path.slice(0, movementBudget(ctx));
}

function reachableTiles(ctx) {
  return [...getReachableTiles(ctx.self.position, movementBudget(ctx), ctx.blocked)].map(parseKey);
}

/** Pick the reachable tile maximising scoreFn; excludes the current tile. */
function bestReachable(ctx, scoreFn) {
  let best = null;
  let bestScore = -Infinity;
  for (const tile of reachableTiles(ctx)) {
    if (tile.tx === ctx.self.position.tx && tile.ty === ctx.self.position.ty) continue;
    const s = scoreFn(tile);
    if (s > bestScore) {
      bestScore = s;
      best = tile;
    }
  }
  return best;
}

export function planHold(ctx) {
  return { kind: 'hold', steps: [], destination: { ...ctx.self.position } };
}

export function planAdvance(ctx) {
  if (movementBudget(ctx) === 0) return null;
  const path = findPath(ctx.self.position, ctx.target.position, ctx.blocked);
  if (!path.length) return null;
  const range = ctx.abilityKit?.preferredRange ?? ctx.self.attackRange ?? 1;
  const cap = Math.min(path.length, movementBudget(ctx));
  let k = cap;
  for (let i = 0; i < cap; i += 1) {
    if (manhattan(path[i], ctx.target.position) <= range) { k = i + 1; break; }
  }
  const steps = path.slice(0, k);
  if (!steps.length) return null;
  return { kind: 'advance', steps, destination: steps[steps.length - 1] };
}

export function planRetreat(ctx) {
  const best = bestReachable(ctx, (t) => manhattan(t, ctx.target.position));
  if (!best) return null;
  const steps = stepsTo(ctx, best);
  if (!steps.length) return null;
  return { kind: 'retreat', steps, destination: steps[steps.length - 1] };
}

export function planKite(ctx) {
  const preferred = ctx.abilityKit?.preferredRange ?? ctx.self.attackRange ?? 1;
  const min = ctx.abilityKit?.minRange ?? 0;
  const best = bestReachable(ctx, (t) => {
    const d = manhattan(t, ctx.target.position);
    if (d < min) return -Infinity;
    return -Math.abs(d - preferred); // closest to preferred range wins
  });
  if (!best) return null;
  const steps = stepsTo(ctx, best);
  if (!steps.length) return null;
  return { kind: 'kite', steps, destination: steps[steps.length - 1] };
}

export function planFlank(ctx) {
  const range = ctx.abilityKit?.preferredRange ?? ctx.self.attackRange ?? 1;
  const allies = ctx.allies || [];
  const best = bestReachable(ctx, (t) => {
    if (manhattan(t, ctx.target.position) > range) return -Infinity; // must be able to strike
    return allies.length ? Math.min(...allies.map((a) => manhattan(t, a))) : 0;
  });
  if (!best) return null;
  const steps = stepsTo(ctx, best);
  return { kind: 'flank', steps, destination: steps.length ? steps[steps.length - 1] : { ...ctx.self.position } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/combat/ai/enemyMovement.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/combat/ai/enemyMovement.js tests/unit/combat/ai/enemyMovement.test.js
git commit -m "feat(combat-ai): candidate movement goals (advance/kite/retreat/flank)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Council mini-brains + `scoreCandidate`

**Files:**
- Create: `src/game/combat/ai/council/aggroBrain.js`, `survivalBrain.js`, `positionBrain.js`, `resourceBrain.js`, `coordinationBrain.js`, `index.js`
- Test: `tests/unit/combat/ai/council.test.js` (create)

**Interfaces:**
- Consumes: `manhattan` from `../../combatPathfinding.js`; `BASIC_ATTACK_AP_COST` from `../../combatStats.js`.
- Produces: each brain exports `{ id, domain, activationSignals, consumes, weight, score(candidate, ctx) }` where `score` returns `{ brainId, score, findings, tieredSignals }`. `council/index.js` exports `DEFAULT_COUNCIL` (array) and `scoreCandidate(candidate, ctx, weights, council=DEFAULT_COUNCIL) → { score, terms, votes }`.
- Candidate shape: `{ movement, action:{kind}, endTile:{tx,ty} }`. Ctx shape adds `self:{ attackPointsRemaining, maxHp, hp }`, `target:{ position, attackRange, estimateAttackDamage:number }`, `abilityKit:{ preferredRange, canActFromRange(dist), estimateAttackDamage() }`, `allies:[{tx,ty}]`.

- [ ] **Step 1: Write the failing test** — create `tests/unit/combat/ai/council.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { scoreCandidate, DEFAULT_COUNCIL } from '../../../../src/game/combat/ai/council/index.js';

function ctx(overrides = {}) {
  return {
    self: { hp: 40, maxHp: 40, attackPointsRemaining: 6 },
    target: { position: { tx: 5, ty: 1 }, attackRange: 1, estimateAttackDamage: 8 },
    allies: [],
    abilityKit: { preferredRange: 3, canActFromRange: (d) => d <= 3, estimateAttackDamage: () => 5 },
    ...overrides,
  };
}
const attackAt = (tx, ty) => ({ movement: { kind: 'hold' }, action: { kind: 'attack' }, endTile: { tx, ty } });

describe('council', () => {
  it('AggroBrain rewards an in-range attack', () => {
    const flat = Object.fromEntries(DEFAULT_COUNCIL.map((b) => [b.id, b.id === 'AGGRO_BRAIN' ? 1 : 0]));
    const s = scoreCandidate(attackAt(3, 1), ctx(), flat).score; // dist 2 ≤ range 3
    expect(s).toBe(5);
  });

  it('SurvivalBrain prefers guarding while hurt', () => {
    const w = Object.fromEntries(DEFAULT_COUNCIL.map((b) => [b.id, b.id === 'SURVIVAL_BRAIN' ? 1 : 0]));
    const hurt = ctx({ self: { hp: 8, maxHp: 40, attackPointsRemaining: 6 } });
    const guard = { movement: { kind: 'hold' }, action: { kind: 'guard' }, endTile: { tx: 4, ty: 1 } };
    const stand = attackAt(4, 1);
    expect(scoreCandidate(guard, hurt, w).score).toBeGreaterThan(scoreCandidate(stand, hurt, w).score);
  });

  it('CoordinationBrain penalises clumping adjacent to an ally', () => {
    const w = Object.fromEntries(DEFAULT_COUNCIL.map((b) => [b.id, b.id === 'COORDINATION_BRAIN' ? 1 : 0]));
    const near = scoreCandidate(attackAt(3, 1), ctx({ allies: [{ tx: 3, ty: 2 }] }), w).score;
    const far = scoreCandidate(attackAt(3, 1), ctx({ allies: [{ tx: 8, ty: 8 }] }), w).score;
    expect(near).toBeLessThan(far);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/combat/ai/council.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3a: Implement `council/aggroBrain.js`:**

```js
import { manhattan } from '../../combatPathfinding.js';
import { BASIC_ATTACK_AP_COST } from '../../combatStats.js';

export const AggroBrain = {
  id: 'AGGRO_BRAIN',
  domain: ['offense'],
  activationSignals: ['target-reachable'],
  consumes: ['self.attackPointsRemaining', 'target.position', 'abilityKit'],
  weight: 1,
  score(candidate, ctx) {
    let score = 0;
    const findings = [];
    if (candidate.action.kind === 'attack') {
      const dist = manhattan(candidate.endTile, ctx.target.position);
      if (ctx.abilityKit.canActFromRange(dist) && ctx.self.attackPointsRemaining >= BASIC_ATTACK_AP_COST) {
        score = ctx.abilityKit.estimateAttackDamage();
        findings.push(`strike for ~${score}`);
      }
    }
    return { brainId: 'AGGRO_BRAIN', score, findings, tieredSignals: [] };
  },
};
```

- [ ] **Step 3b: Implement `council/survivalBrain.js`:**

```js
import { manhattan } from '../../combatPathfinding.js';
import { GUARD_DAMAGE_MULTIPLIER } from '../../combatStats.js';

export const SurvivalBrain = {
  id: 'SURVIVAL_BRAIN',
  domain: ['defense'],
  activationSignals: ['low-hp'],
  consumes: ['self.hp', 'self.maxHp', 'target.estimateAttackDamage'],
  weight: 1,
  score(candidate, ctx) {
    const hpRatio = ctx.self.maxHp > 0 ? ctx.self.hp / ctx.self.maxHp : 1;
    const incoming = ctx.target.estimateAttackDamage ?? 0;
    const dist = manhattan(candidate.endTile, ctx.target.position);
    const targetReach = ctx.target.attackRange ?? 1;
    const exposure = dist <= targetReach ? 1 : 0.25;
    let expectedHit = incoming * exposure;
    if (candidate.action.kind === 'guard') expectedHit *= GUARD_DAMAGE_MULTIPLIER;
    const damageAvoided = Math.max(0, incoming - expectedHit);
    const score = (1 - hpRatio) * damageAvoided;
    return {
      brainId: 'SURVIVAL_BRAIN',
      score,
      findings: score > 0 ? [`avoids ~${Math.round(damageAvoided)} while hurt`] : [],
      tieredSignals: [],
    };
  },
};
```

- [ ] **Step 3c: Implement `council/positionBrain.js`:**

```js
import { manhattan } from '../../combatPathfinding.js';

export const PositionBrain = {
  id: 'POSITION_BRAIN',
  domain: ['positioning'],
  activationSignals: [],
  consumes: ['abilityKit', 'target.position'],
  weight: 1,
  score(candidate, ctx) {
    const preferred = ctx.abilityKit?.preferredRange ?? 1;
    const dist = manhattan(candidate.endTile, ctx.target.position);
    const score = 5 - Math.abs(dist - preferred); // peaks at exactly preferred range
    return { brainId: 'POSITION_BRAIN', score, findings: [], tieredSignals: [] };
  },
};
```

- [ ] **Step 3d: Implement `council/resourceBrain.js`:**

```js
import { BASIC_ATTACK_AP_COST } from '../../combatStats.js';

export const ResourceBrain = {
  id: 'RESOURCE_BRAIN',
  domain: ['economy'],
  activationSignals: [],
  consumes: [],
  weight: 1,
  score(candidate) {
    const cost = candidate.action.kind === 'attack' ? BASIC_ATTACK_AP_COST : 0;
    return { brainId: 'RESOURCE_BRAIN', score: -cost, findings: [], tieredSignals: [] };
  },
};
```

- [ ] **Step 3e: Implement `council/coordinationBrain.js`:**

```js
import { manhattan } from '../../combatPathfinding.js';

export const CoordinationBrain = {
  id: 'COORDINATION_BRAIN',
  domain: ['coordination'],
  activationSignals: ['has-allies'],
  consumes: ['allies'],
  weight: 1,
  score(candidate, ctx) {
    const allies = ctx.allies || [];
    if (!allies.length) return { brainId: 'COORDINATION_BRAIN', score: 0, findings: [], tieredSignals: [] };
    const minAlly = Math.min(...allies.map((a) => manhattan(candidate.endTile, a)));
    const score = minAlly >= 2 ? 2 : (minAlly === 1 ? -3 : -6);
    return { brainId: 'COORDINATION_BRAIN', score, findings: [], tieredSignals: [] };
  },
};
```

- [ ] **Step 3f: Implement `council/index.js`:**

```js
import { AggroBrain } from './aggroBrain.js';
import { SurvivalBrain } from './survivalBrain.js';
import { PositionBrain } from './positionBrain.js';
import { ResourceBrain } from './resourceBrain.js';
import { CoordinationBrain } from './coordinationBrain.js';

export const DEFAULT_COUNCIL = Object.freeze([
  AggroBrain, SurvivalBrain, PositionBrain, ResourceBrain, CoordinationBrain,
]);

/**
 * @returns {{ score: number, terms: Record<string, number>, votes: object[] }}
 */
export function scoreCandidate(candidate, ctx, weights, council = DEFAULT_COUNCIL) {
  let total = 0;
  const terms = {};
  const votes = [];
  for (const brain of council) {
    const vote = brain.score(candidate, ctx);
    const weighted = (weights[brain.id] ?? 0) * vote.score;
    total += weighted;
    terms[brain.id] = weighted;
    votes.push(vote);
  }
  return { score: total, terms, votes };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/combat/ai/council.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/combat/ai/council tests/unit/combat/ai/council.test.js
git commit -m "feat(combat-ai): council mini-brains and weighted scoring

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: `enemyTurnPlanner.js`

**Files:**
- Create: `src/game/combat/ai/enemyTurnPlanner.js`
- Test: `tests/unit/combat/ai/enemyTurnPlanner.test.js` (create)

**Interfaces:**
- Consumes: `evaluateStance`, `computeEnemyPersonality`, movement goals, `scoreCandidate`, `manhattan`, `BASIC_ATTACK_AP_COST`.
- Produces: `planEnemyTurn(ctx) → TurnPlan` = `{ stance, movement:{kind,steps,destination}, action:{kind}, score, terms, reasons:[] }`. Deterministic argmax with an index tie-break. Full ctx shape is the union of the shapes used by stance/movement/council plus `{ selfId, profile:{ role, weightOverrides } }`.

- [ ] **Step 1: Write the failing test** — create `tests/unit/combat/ai/enemyTurnPlanner.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { buildBlockedSet } from '../../../../src/game/combat/combatPathfinding.js';
import { planEnemyTurn } from '../../../../src/game/combat/ai/enemyTurnPlanner.js';

function ctx(overrides = {}) {
  return {
    selfId: 'sentinel-test',
    self: { position: { tx: 4, ty: 4 }, hp: 40, maxHp: 40, attackPointsRemaining: 6, attackRange: 2, intelligence: 60 },
    target: { position: { tx: 6, ty: 4 }, hp: 100, maxHp: 100, attackRange: 1, estimateAttackDamage: 8 },
    allies: [],
    blocked: buildBlockedSet([]),
    abilityKit: { isRanged: true, preferredRange: 3, minRange: 1, canActFromRange: (d) => d <= 3, estimateAttackDamage: () => 5 },
    profile: { role: 'caster', weightOverrides: {} },
    rng: () => 0.5,
    ...overrides,
  };
}

describe('planEnemyTurn', () => {
  it('a brute rushes and attacks', () => {
    const plan = planEnemyTurn(ctx({ self: { position: { tx: 4, ty: 4 }, hp: 40, maxHp: 40, attackPointsRemaining: 6, attackRange: 2, intelligence: 5 } }));
    expect(plan.stance).toBe('AGGRESSIVE');
    expect(plan.action.kind).toBe('attack');
  });

  it('a wounded mastermind stops attacking to preserve itself', () => {
    const plan = planEnemyTurn(ctx({
      self: { position: { tx: 5, ty: 4 }, hp: 6, maxHp: 40, attackPointsRemaining: 6, attackRange: 2, intelligence: 90 },
    }));
    expect(plan.stance).toBe('RETREAT');
    expect(plan.action.kind).not.toBe('attack');
  });

  it('is deterministic and emits reason lines', () => {
    const a = planEnemyTurn(ctx());
    const b = planEnemyTurn(ctx());
    expect(a.action.kind).toBe(b.action.kind);
    expect(a.reasons.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/combat/ai/enemyTurnPlanner.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — create `src/game/combat/ai/enemyTurnPlanner.js`:

```js
import { evaluateStance } from './enemyStance.js';
import { computeEnemyPersonality } from './enemyPersonality.js';
import { planHold, planAdvance, planKite, planRetreat, planFlank } from './enemyMovement.js';
import { scoreCandidate } from './council/index.js';
import { manhattan } from '../combatPathfinding.js';
import { BASIC_ATTACK_AP_COST } from '../combatStats.js';

function actionsFor(movement, ctx, stance) {
  const dist = manhattan(movement.destination, ctx.target.position);
  const canAttack = ctx.abilityKit.canActFromRange(dist)
    && (ctx.self.attackPointsRemaining >= BASIC_ATTACK_AP_COST);
  const out = [];
  if (canAttack) out.push({ kind: 'attack' });
  if (stance.tier !== 'brute') {
    out.push({ kind: 'guard' });
    out.push({ kind: 'wait' });
  } else if (!canAttack) {
    out.push({ kind: 'wait' });
  }
  return out;
}

function enumerateCandidates(ctx, stance) {
  const goals = stance.tier === 'brute'
    ? [planHold(ctx), planAdvance(ctx)]
    : [planHold(ctx), planAdvance(ctx), planKite(ctx), planRetreat(ctx), planFlank(ctx)];
  const candidates = [];
  for (const movement of goals.filter(Boolean)) {
    for (const action of actionsFor(movement, ctx, stance)) {
      candidates.push({ movement, action, endTile: movement.destination });
    }
  }
  return candidates;
}

/**
 * @param {object} ctx
 * @returns {{ stance:string, movement:object, action:object, score:number, terms:object, reasons:string[] }}
 */
export function planEnemyTurn(ctx) {
  const stance = evaluateStance(ctx);
  const weights = computeEnemyPersonality({
    role: ctx.profile?.role,
    intTier: stance.tier,
    overrides: ctx.profile?.weightOverrides,
  });

  const candidates = enumerateCandidates(ctx, stance);
  const scored = candidates.map((candidate, index) => ({ candidate, index, ...scoreCandidate(candidate, ctx, weights) }));
  scored.sort((a, b) => (b.score - a.score) || (a.index - b.index)); // stable tie-break

  const chosen = scored[0];
  if (!chosen) {
    return {
      stance: stance.stance,
      movement: { kind: 'hold', steps: [], destination: { ...ctx.self.position } },
      action: { kind: 'wait' },
      score: 0, terms: {}, reasons: [],
    };
  }

  const runnerUp = scored[1];
  const reasons = [
    `[BRAIN] ${ctx.selfId} ${stance.stance} (INT ${ctx.self.intelligence}/${stance.tier}) → `
    + `${chosen.candidate.movement.kind}+${chosen.candidate.action.kind} (score ${chosen.score.toFixed(1)}).`,
  ];
  if (runnerUp) {
    reasons.push(
      `[BRAIN] ${ctx.selfId} chose over ${runnerUp.candidate.movement.kind}+${runnerUp.candidate.action.kind} `
      + `(Δ ${(chosen.score - runnerUp.score).toFixed(1)}).`,
    );
  }

  return {
    stance: stance.stance,
    movement: chosen.candidate.movement,
    action: chosen.candidate.action,
    score: chosen.score,
    terms: chosen.terms,
    reasons,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/combat/ai/enemyTurnPlanner.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/combat/ai/enemyTurnPlanner.js tests/unit/combat/ai/enemyTurnPlanner.test.js
git commit -m "feat(combat-ai): utility-scored enemy turn planner

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Bestiary `combatAI` typedef + sentinel kit

**Files:**
- Modify: `src/game/combat/bestiary/combatBestiary.types.js`
- Modify: `src/game/combat/bestiary/entries/sentinelBrazier.entry.js`
- Test: `tests/unit/combat/ai/sentinelCombatAI.test.js` (create)

**Interfaces:**
- Produces: `sentinelBrazierBestiaryEntry.combatAI = { buildProfile(context) → { isRanged, preferredRange, minRange, role, aggression, weightOverrides }, buildAbilityKit(context) → { isRanged, preferredRange, minRange, estimateAttackDamage(), canActFromRange(dist) } }`. The kit closes over the full entity from `context.entity` (so it can read `scholomance`/`attackRange`).

- [ ] **Step 1: Write the failing test** — create `tests/unit/combat/ai/sentinelCombatAI.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { sentinelBrazierBestiaryEntry } from '../../../../src/game/combat/bestiary/entries/sentinelBrazier.entry.js';

describe('sentinel combatAI kit', () => {
  const entity = { scholomance: { BAPO: 14 }, attackRange: 2 };
  const ctx = { enemyId: 'sentinel-west', entity };

  it('exposes a profile and an ability kit', () => {
    expect(typeof sentinelBrazierBestiaryEntry.combatAI.buildProfile).toBe('function');
    const kit = sentinelBrazierBestiaryEntry.combatAI.buildAbilityKit(ctx);
    expect(kit.estimateAttackDamage()).toBe(7); // round(14/2)
    expect(kit.canActFromRange(2)).toBe(true);
    expect(kit.canActFromRange(3)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/combat/ai/sentinelCombatAI.test.js`
Expected: FAIL — `combatAI` is undefined.

- [ ] **Step 3a: Extend the typedef** — in `src/game/combat/bestiary/combatBestiary.types.js`, add above the closing `export {};` line, extending the `CombatBestiaryEntry` typedef block with two extra properties:

```js
/**
 * @typedef {Object} CombatAIBlock
 * @property {(context: BestiaryRuntimeContext) => object} [buildProfile]
 * @property {(context: BestiaryRuntimeContext) => object} [buildAbilityKit]
 */
```

And add this line inside the existing `CombatBestiaryEntry` typedef comment (after the `buildDefender` property line):

```js
 * @property {CombatAIBlock} [combatAI]
```

- [ ] **Step 3b: Implement the sentinel kit** — in `src/game/combat/bestiary/entries/sentinelBrazier.entry.js`, add the import:

```js
import { computeBasicAttackDamage } from '../../scholomanceStats.js';
```

Then add a `combatAI` property to the exported `sentinelBrazierBestiaryEntry` object (after `buildDossier`):

```js
  combatAI: {
    buildProfile() {
      return {
        isRanged: true,
        preferredRange: 3,
        minRange: 1,
        role: 'caster',
        aggression: 0.7,
        weightOverrides: {},
      };
    },
    buildAbilityKit(context) {
      const entity = context?.entity || {};
      const damage = computeBasicAttackDamage(entity.scholomance);
      const attackRange = Number.isFinite(entity.attackRange) ? entity.attackRange : 2;
      return {
        isRanged: true,
        preferredRange: 3,
        minRange: 1,
        estimateAttackDamage: () => damage,
        canActFromRange: (dist) => dist <= attackRange,
      };
    },
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/combat/ai/sentinelCombatAI.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/combat/bestiary/combatBestiary.types.js src/game/combat/bestiary/entries/sentinelBrazier.entry.js tests/unit/combat/ai/sentinelCombatAI.test.js
git commit -m "feat(combat-ai): sentinel combatAI profile + ability kit on bestiary entry

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: `enemyCombatDriver.js`

**Files:**
- Create: `src/game/combat/ai/enemyCombatDriver.js`
- Test: `tests/unit/combat/ai/enemyCombatDriver.test.js` (create)

**Interfaces:**
- Consumes: `resolveCombatBestiaryEntry` from `../bestiary/combatBestiary.registry.js`; `buildBlockedSet` from `../combatPathfinding.js`; `computeBasicAttackDamage` from `../scholomanceStats.js`; `planEnemyTurn` from `./enemyTurnPlanner.js`.
- Produces: `driveEnemyTurn({ entityId, record, stats, allies, targetId, blocked, rng }) → TurnPlan | null`. Resolves the bestiary `combatAI`, builds the immutable context (self/target snapshots, ally tiles, blocked `Set`), and returns `planEnemyTurn(ctx)`. `blocked` may be a `Set` or an array of `{tx,ty}`.

- [ ] **Step 1: Write the failing test** — create `tests/unit/combat/ai/enemyCombatDriver.test.js`:

```js
import { afterAll, describe, expect, it } from 'vitest';
import { CombatStatController } from '../../../../src/game/combat/combatStatController.js';
import { registerCombatBestiaryEntry, listCombatBestiaryEntries } from '../../../../src/game/combat/bestiary/combatBestiary.registry.js';
import { driveEnemyTurn } from '../../../../src/game/combat/ai/enemyCombatDriver.js';

// Self-contained fake enemy so the test does not depend on real entries.
const FAKE = {
  id: 'test-dummy-ai',
  priority: 999,
  matches: (ctx) => ctx.record?.role === 'test-dummy',
  combatAI: {
    buildProfile: () => ({ isRanged: false, preferredRange: 1, minRange: 0, role: 'bruiser', weightOverrides: {} }),
    buildAbilityKit: () => ({ isRanged: false, preferredRange: 1, minRange: 0, estimateAttackDamage: () => 5, canActFromRange: (d) => d <= 1 }),
  },
};
registerCombatBestiaryEntry(FAKE);
afterAll(() => {
  const idx = listCombatBestiaryEntries().findIndex((e) => e.id === FAKE.id);
  if (idx >= 0) listCombatBestiaryEntries().splice(idx, 1);
});

describe('driveEnemyTurn', () => {
  it('produces a TurnPlan for a registered enemy via its combatAI', () => {
    const stats = new CombatStatController();
    stats.registerEntity('mob', { hp: 30, maxHp: 30, tx: 1, ty: 1, overrides: { intelligence: 10 } });
    stats.registerEntity('player', { hp: 100, maxHp: 100, tx: 4, ty: 1 });
    const plan = driveEnemyTurn({ entityId: 'mob', record: { role: 'test-dummy' }, stats, allies: [], targetId: 'player', rng: () => 0.5 });
    expect(plan).not.toBeNull();
    expect(['advance', 'hold']).toContain(plan.movement.kind);
    expect(plan.reasons.length).toBeGreaterThan(0);
  });

  it('returns null when no combatAI entry matches', () => {
    const stats = new CombatStatController();
    stats.registerEntity('mob', { hp: 30, maxHp: 30, tx: 1, ty: 1 });
    stats.registerEntity('player', { hp: 100, maxHp: 100, tx: 4, ty: 1 });
    expect(driveEnemyTurn({ entityId: 'mob', record: { role: 'nope' }, stats })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/combat/ai/enemyCombatDriver.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — create `src/game/combat/ai/enemyCombatDriver.js`:

```js
import { resolveCombatBestiaryEntry } from '../bestiary/combatBestiary.registry.js';
import { buildBlockedSet } from '../combatPathfinding.js';
import { computeBasicAttackDamage } from '../scholomanceStats.js';
import { planEnemyTurn } from './enemyTurnPlanner.js';

function toBlockedSet(blocked) {
  if (blocked instanceof Set) return blocked;
  if (Array.isArray(blocked)) return buildBlockedSet(blocked);
  return buildBlockedSet();
}

/**
 * @param {object} params
 * @returns {object|null} TurnPlan
 */
export function driveEnemyTurn({
  entityId, record = null, stats, allies = [], targetId = 'player', blocked = null, rng = Math.random,
} = {}) {
  const entry = resolveCombatBestiaryEntry({ enemyId: entityId, record });
  const ai = entry?.combatAI;
  const self = stats?.getEntity(entityId);
  const target = stats?.getEntity(targetId);
  if (!ai || !self || !target) return null;

  const buildCtx = { enemyId: entityId, record, entity: self };
  const profile = ai.buildProfile ? ai.buildProfile(buildCtx) : {};
  const abilityKit = ai.buildAbilityKit ? ai.buildAbilityKit(buildCtx) : {};

  const ctx = {
    selfId: entityId,
    targetId,
    self: {
      position: { ...self.position },
      hp: self.hp,
      maxHp: self.maxHp,
      attackPointsRemaining: self.attackPointsRemaining,
      attackRange: self.attackRange,
      intelligence: self.intelligence,
      guarding: self.guarding,
    },
    target: {
      position: { ...target.position },
      hp: target.hp,
      maxHp: target.maxHp,
      attackRange: target.attackRange,
      estimateAttackDamage: computeBasicAttackDamage(target.scholomance),
    },
    allies: allies
      .map((id) => stats.getEntity(id))
      .filter(Boolean)
      .map((e) => ({ id: e.id, tx: e.position.tx, ty: e.position.ty })),
    blocked: toBlockedSet(blocked),
    abilityKit,
    profile,
    rng,
  };

  return planEnemyTurn(ctx);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/combat/ai/enemyCombatDriver.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/combat/ai/enemyCombatDriver.js tests/unit/combat/ai/enemyCombatDriver.test.js
git commit -m "feat(combat-ai): enemy turn driver bridging stats + bestiary combatAI

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Wire the scene turn loop to `driveEnemyTurn`

**Files:**
- Modify: `src/phaser/CombatArenaScene.js` (`performSentinelAttack`, ~lines 989-1011; imports ~lines 60-69)

**Interfaces:**
- Consumes: `driveEnemyTurn` (Task 10), existing `planSentinelAttack` (now stance-aware, Task 2), existing `this.applySentinelRepositionSteps`, `this.stats.setGuarding`, `this.launchSentinelFireball`.
- Produces: `performSentinelAttack` that plans via the council, animates the movement, then guards / attacks / waits per the plan.

This task changes Phaser scene code that is not unit-testable in isolation; it is verified by driving the real combat page (see Step 3).

- [ ] **Step 1: Replace the import** — in `src/phaser/CombatArenaScene.js`, replace the line:

```js
import { planSentinelReposition } from '../game/combat/combatIntelligence.js';
```

with:

```js
import { driveEnemyTurn } from '../game/combat/ai/enemyCombatDriver.js';
```

- [ ] **Step 2: Rewrite `performSentinelAttack`** — replace the whole method body:

```js
    performSentinelAttack(sentinelId, delay = 0) {
      const record = this.getSentinelRecords().find((entry) => entry.id === sentinelId);
      if (!record?.aggroed || record.defeated || !this.stats) return;

      const repositionSteps = planSentinelReposition({
        sentinelId,
        stats: this.stats,
        blocked: this.getBlockedTiles?.() || this._blockedTiles,
      });
      if (repositionSteps.length) {
        this.applySentinelRepositionSteps(sentinelId, repositionSteps);
      }

      record._pendingAttackPlan = planSentinelAttack({
        record,
        sentinels: this.getSentinelRecords(),
        stats: this.stats,
      });

      const launch = () => this.launchSentinelFireball(sentinelId);
      if (delay > 0) this.time.delayedCall(delay, launch);
      else launch();
    }
```

with:

```js
    performSentinelAttack(sentinelId, delay = 0) {
      const record = this.getSentinelRecords().find((entry) => entry.id === sentinelId);
      if (!record?.aggroed || record.defeated || !this.stats) return;

      const allies = this.getSentinelRecords()
        .filter((entry) => entry.aggroed && !entry.defeated && entry.id !== sentinelId)
        .map((entry) => entry.id);

      const plan = driveEnemyTurn({
        entityId: sentinelId,
        record,
        stats: this.stats,
        allies,
        targetId: 'player',
        blocked: this.getBlockedTiles?.() || this._blockedTiles,
        rng: Math.random,
      });
      if (!plan) return;

      if (plan.reasons?.length) {
        this.events.emit('sentinel-ability', {
          type: 'sentinel-ability',
          sentinelId,
          logLines: plan.reasons,
        });
      }

      if (plan.movement?.steps?.length) {
        this.applySentinelRepositionSteps(sentinelId, plan.movement.steps);
      }

      if (plan.action?.kind === 'guard') {
        this.stats.setGuarding(sentinelId, true);
        return;
      }
      if (plan.action?.kind !== 'attack') return;

      record._pendingAttackPlan = planSentinelAttack({
        record,
        sentinels: this.getSentinelRecords(),
        stats: this.stats,
        stance: plan.stance,
      });

      const launch = () => this.launchSentinelFireball(sentinelId);
      if (delay > 0) this.time.delayedCall(delay, launch);
      else launch();
    }
```

- [ ] **Step 3: Verify in the running app**

Start the DEV server (the combat scene 404s under `preview`; use DEV per project notes):

Run: `npm run dev`
Then open `http://localhost:5173`, enter combat, step onto an obelisk-adjacent tile to aggro the sentinels, and end a turn. Confirm in the combat terminal log that `[BRAIN]` lines appear, sentinels reposition (not always straight-in), and a low-HP sentinel guards/retreats instead of always fireballing. Stop the server when done.

- [ ] **Step 4: Run the full combat unit suite for regressions**

Run: `npx vitest run tests/unit/combat/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/phaser/CombatArenaScene.js
git commit -m "feat(combat): drive sentinel turns through the enemy AI council

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notes for the implementer

- After all tasks, run the SCD64 self-check per project convention:
  `npm run scd64:intellisense -- --fail-on=error "src/game/combat/ai/**/*.js" "src/phaser/CombatArenaScene.js"`
- `planSentinelReposition` in `combatIntelligence.js` becomes unused by the scene after Task 11. Leave it exported (other callers/tests may reference it); do not delete in this plan.
- Tuning knobs live in `enemyPersonality.js` (weight tables) and `enemyStance.js` (`LOW_HP_RATIO`) — the spec (§7) flags these as opening balance numbers.
