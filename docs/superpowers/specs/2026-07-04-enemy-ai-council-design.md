# Enemy AI — Council of Weighted Mini-Brains

**Date:** 2026-07-04
**Status:** Design approved, pending spec review
**Author:** Damien + Claude

## 1. Goal

Overhaul combat enemy logic across four concerns the current sentinel AI handles
poorly or not at all:

1. **Positioning & movement** — kiting, flanking, spreading, holding range, obstacle-aware pathing (today: walk straight at the player, then fireball).
2. **Survival / self-preservation** — retreat, disengage, or guard when low HP (today: fights to the death).
3. **Threat & coordination** — spacing, focus timing, not clumping (today: only a flat +25% WiFi damage buff).
4. **Ability decision-making** — resource-aware (AP/mana) picks that conserve burn/ML for the right moment.

The solution must be **modular**: adding a future enemy is one registration with
zero edits to the decision core.

## 2. Approach

A **utility-scored turn planner** reframed as a **Council of weighted mini-brains**,
reusing the coding conventions of `codex/core/pixelbrain/` (microprocessors/amps)
and `steamdeck_brain/vaelrix_forcefield/` (the Council Arbiter). The runtime is
**pure JS, deterministic, injected-rng** — the real brain daemon is never called in
the combat loop (its `brain_bridge_client.ask()` is LLM-backed with a 120 s timeout
and non-deterministic output; that would break determinism and tests).

Each turn:

```
candidates = enumerate(movementGoal × action)         // pruned by stance / activationSignals
for each candidate:
    votes = [ brain.score(candidate, ctx) for brain in council ]     // AmplifierResult-shaped
    total = Σ  personality.weight[brain.id] · vote.score
chosen = argmax(total)                                 // CouncilArbiterOutput
```

### Why this shape

- It is the same **scored-candidate** pattern already in `selectSentinelAbilityByIntelligence`.
- The Council/personality-weighting maps 1:1 onto `personality_weighting.py`: each enemy
  is a **personality weight-vector** over the council. A cowardly imp = `{Survival: 1.5,
  Aggro: 0.5}`; a berserker = `{Aggro: 2, Survival: 0}` (== today's brute tier).
- **Adding a new behaviour** (e.g. `AmbushBrain`) = one new mini-brain the whole roster
  can be weighted on — no per-enemy edits.

## 3. Coding conventions adopted

**From `pixelbrain/` (JS):**
- **Consumes-contract** — each brain declares `consumes: ['self.hp', …]` (dotted namespaced
  keys); a `validateBrainContext` ported from `seam-contract.js`'s consumes-check emits
  structured diagnostics `{ ok, failures:[{ code, selector, message, fatal }] }` (code
  `AI_BRAIN_CONTEXT_MISSING`).
- **Deterministic route** — `planEnemyTurn` is an ordered, stable evaluation.
- **Matcher registry** — brains attach through the bestiary entry (§6).

**From `vaelrix_forcefield/` (the Council):**
- `AmplifierBrain` declaration shape: `{ id, domain[], activationSignals[], weight }`.
- `AmplifierResult` vote shape: `{ brainId, summary, findings[], tieredSignals[], score }`.
- `compute_personality_weights` product formula: `base × role-boost × intTier-boost × override`.
- `CouncilArbiterOutput`: `{ acceptedFindings, rejectedFindings, contradictions, nextAction }`.
- `DeterminismField`: injected seed/rng, stable ordering.

**Deliberately NOT adopted:** the `emits`/`mutates` half of the seam contract. That exists
because pixelbrain processors mutate a shared lattice in sequence. Council brains are
**independent read-only scorers** over an immutable turn context — they get `consumes`
(validated) but no `emits`/`mutates`. Borrowing that half would be ceremony without meaning.

## 4. Module layout

All new code is pure (no Phaser/React/DOM), under `src/game/combat/ai/`.

### Reusable core (never changes when an enemy is added)

| Module | Responsibility |
|---|---|
| `enemyTurnPlanner.js` | `planEnemyTurn(context) → TurnPlan`. Enumerate → prune → score via council → argmax → reasons. |
| `enemyStance.js` | `evaluateStance(context) → { stance, hpRatio, targetHpRatio, tier }`. Cheap prune/weight signal. |
| `enemyMovement.js` | `planAdvance / planKite / planRetreat / planFlank / planHold(context) → { kind, steps, destination }`. Uses `combatPathfinding`. Subsumes `planSentinelReposition`. |
| `council/index.js` | Registers the default council; exports `scoreCandidate(candidate, ctx, weights)`. |
| `council/aggroBrain.js` | Maximise expected damage dealt this turn. |
| `council/survivalBrain.js` | Minimise expected death; values retreat/guard when hurt. |
| `council/positionBrain.js` | Hold `preferredRange` / adjacency; flanking value. |
| `council/resourceBrain.js` | Penalise AP/mana spend; conserve for tempo. |
| `council/coordinationBrain.js` | Penalise clumping adjacent to allies (spread/coordination term). |
| `enemyPersonality.js` | `computeEnemyPersonality({ role, intTier, overrides }) → weights` (the product formula). |
| `enemyBrainContract.js` | `validateBrainContext(brain, context)` (ported consumes-check) + diagnostic codes. |
| `enemyCombatDriver.js` | `driveEnemyTurn({ entityId, stats, allies, targetId, blocked, rng })` — resolves the AI entry, builds `abilityKit` + `profile` + `context`, runs `planEnemyTurn`, returns a `TurnPlan`. |

### Consumer (the sentinel = instance #1)

The bestiary entry `combatBestiary.types.js` gains an optional `combatAI` block; the
sentinel entry `sentinelBrazier.entry.js` implements it, wrapping the **existing**
`planSentinelAttack` / `resolveSentinelAbilityDamage` (all burn/ML/alert/WiFi richness
preserved behind the kit interface). No sentinel-specific branches in the scene turn loop.

## 5. Data shapes

### TurnPlan (returned by `planEnemyTurn`, animated by the scene)

```js
{
  stance: 'AGGRESSIVE' | 'KITE' | 'RETREAT' | 'HOLD' | 'GUARD',
  movement: { kind: 'advance'|'kite'|'retreat'|'flank'|'hold', steps: [{tx,ty}], destination },
  action:   { kind: 'attack'|'guard'|'wait', abilityId?, applyEffect? },
  score, terms: { aggro, survival, position, resource, coordination },
  reasons: [],                 // CouncilArbiterOutput.rejectedFindings → '[BRAIN]' log lines
}
```

### abilityKit descriptor (entity-agnostic; what the core consumes)

```js
{
  isRanged, preferredRange, minRange,
  estimateAttackDamage(self, target) -> number,
  canActFromRange(dist) -> bool,
  // when action.kind === 'attack', the consumer picks the concrete ability
  selectAbility({ stance, self, target, allies, rng }) -> { abilityId, applyEffect },
}
```

### profile (static per-species traits)

```js
{ isRanged, preferredRange, minRange, role, aggression, weightOverrides }
```

## 6. Plug-in contract (adding an enemy)

One registration, on the bestiary entry:

```js
registerCombatBestiaryEntry({
  id: 'gargoyle', matches, buildDefender, buildDossier,
  combatAI: {
    buildProfile: (ctx) => ({ isRanged:false, preferredRange:1, minRange:0,
                              role:'bruiser', aggression:0.8,
                              weightOverrides:{ survival:0.5 } }),
    buildAbilityKit: (ctx) => ({ estimateAttackDamage, canActFromRange, selectAbility }),
  },
});
```

The core supplies stance, movement, council scoring, INT/role personality weighting,
coordination spacing, guard/survival, and reason-logging — for free.

## 7. Scoring model

`score = Σ  weight[brain] · brain.score(candidate, ctx)` over the council:

- **AggroBrain** — expected damage to target from the action at the end tile
  (`abilityKit.estimateAttackDamage`); 0 for guard/wait/out-of-range.
- **SurvivalBrain** — `(1 − hpRatio) · damageAvoided(candidate)`; expected retaliation ≈
  `target.attack × reachability(target → endTile)`, halved when guarding. Only bites when hurt.
- **PositionBrain** — `+` holding `preferredRange` (ranged) or adjacency (melee); `+` flanking.
- **ResourceBrain** — `−` AP/mana spent.
- **CoordinationBrain** — `−` clumping adjacent to an ally end tile (spread).

### Personality weights — `computeEnemyPersonality`

Product formula ported from `personality_weighting.py`:
`weight[b] = base[b] × ROLE_WEIGHTS[role][b] × INT_TIER_WEIGHTS[tier][b] × overrides[b]`.

Initial INT-tier table (centralised constants, tunable like `BASIC_ATTACK_BAPO_DIVISOR`):

| tier | AGGRO | SURVIVAL | POSITION | RESOURCE | COORDINATION | behaviour |
|---|---|---|---|---|---|---|
| brute (<25) | 1 | 0 | 0 | 0 | 0 | greedy rush (unchanged) |
| trained (25–49) | 1 | .4 | .2 | .1 | .3 | basic self-preservation |
| tactical (50–74) | 1 | .8 | .7 | .3 | .7 | kites, flanks, spreads |
| mastermind (75+) | 1 | 1.2 | 1 | .5 | .9 | full utility, retreats to survive |

Brute-tier pruning keeps candidates to `{advance,hold}×{attack}`, preserving today's feel.

## 8. Guard mechanic (new)

`guarding` is set today but never reduces damage. Add `GUARD_DAMAGE_MULTIPLIER = 0.5`,
honoured in `resolveAttack` / `resolveSpellCast` / `resolveSentinelAbilityDamage` when the
target is `guarding`. The guarding entity's own `endTurn` already clears it. This is what
gives SurvivalBrain's `guard` action real value.

## 9. Scene integration

`runSentinelRetaliation` / `performSentinelAttack` become species-agnostic:

```
for each aggroed enemy:
  plan = driveEnemyTurn({ entityId, stats, allies: otherAggroed, targetId:'player', blocked, rng })
  animate plan.movement.steps            // generalise applySentinelRepositionSteps
  switch plan.action.kind:
    'guard'  -> stats.setGuarding(id,true) + emit '[BRAIN]' log
    'attack' -> planSentinelAttack({ ..., stance: plan.stance }) + launchSentinelFireball
    'wait'   -> nothing
```

`planSentinelAttack` gains a `stance` param so it conserves burn/ML when not AGGRESSIVE.

## 10. Testing (pure, deterministic, injected rng)

- `enemyStance` — stance transitions across HP/range/INT.
- `enemyMovement` — kite holds range, retreat increases distance, flank avoids ally axis, advance closes.
- `enemyPersonality` — product formula per role/tier; overrides apply.
- each council brain — monotonic scoring on the dimension it owns.
- `enemyTurnPlanner` — brute rushes; mastermind retreats at low HP; tactical kites vs. adjacency; spreads from ally; argmax stable under a fixed seed.
- `enemyBrainContract` — `validateBrainContext` flags a missing `consumes` key.
- guard-reduction controller test (damage halved when target guarding).
- `driveEnemyTurn` integration test resolving through the bestiary `combatAI` entry.

## 11. Migration / touch list

- `combatBestiary.types.js` — add optional `combatAI` to the entry typedef.
- `sentinelBrazier.entry.js` — implement `combatAI.buildProfile` + `buildAbilityKit` (wraps existing sentinel ability code).
- `combatStatController.js` — guard damage multiplier in the three resolve paths.
- `sentinelCombatAbilities.js` — `planSentinelAttack` accepts `stance`.
- `CombatArenaScene.js` — turn loop calls `driveEnemyTurn`; generalise reposition-step application; replace direct `planSentinelReposition` import (subsumed by `enemyMovement`).
- Keep `planSentinelReposition` as a thin re-export shim or delete after callers move.

## 12. Out of scope (YAGNI)

- Multi-target selection beyond `'player'` (only one player target exists).
- Live LLM/brain-daemon calls in combat (offline authoring/barks is a possible *future* hook, not this spec).
- Line-of-sight raycasting beyond the reachability proxy already used.
- New enemy species (the framework is proven against the two sentinels only).
