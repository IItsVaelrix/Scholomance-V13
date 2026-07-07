import { describe, expect, it } from 'vitest';
import { CombatStatController } from '../../../src/game/combat/combatStatController.js';
import { buildBlockedSet } from '../../../src/game/combat/combatPathfinding.js';
import {
  applyVoidAcolyteHitDamage,
  createVoidAcolyteAbilityState,
  planVoidAcolyteAttack,
  resolveVoidAcolyteAbility,
  ICICLE_BLAST_DAMAGE_PER_HIT,
  ICICLE_BLAST_HIT_COUNT,
  VOID_EXECUTION_DAMAGE,
  VOID_GRAVITY_LOCK_TURNS,
  VOID_LASH_DAMAGE,
} from '../../../src/game/combat/voidAcolyteCombatAbilities.js';
import { PORTAL_WARDEN_ID } from '../../../src/game/combat/portalPhase.js';

function setup({ playerTx = 5, playerTy = 0, wardenTx = 8, wardenTy = 0, abilities = null } = {}) {
  const stats = new CombatStatController();
  stats.registerEntity(PORTAL_WARDEN_ID, {
    hp: 120,
    maxHp: 120,
    tx: wardenTx,
    ty: wardenTy,
    overrides: { intelligence: 52, attackRange: 1, movementPoints: 4, attackPoints: 8 },
    scholomanceOverrides: { BAPO: 22 },
  });
  stats.registerEntity('player', { hp: 100, maxHp: 100, tx: playerTx, ty: playerTy });
  const record = {
    id: PORTAL_WARDEN_ID,
    abilities: abilities || createVoidAcolyteAbilityState(),
  };
  return { stats, record };
}

describe('voidAcolyteCombatAbilities', () => {
  it('void_gravity pulls, locks, and lashes on catch', () => {
    const { stats, record } = setup({
      playerTx: 5,
      playerTy: 0,
      abilities: { gravityCooldown: 0, icicleCooldown: 2 },
    });
    const plan = planVoidAcolyteAttack({ record, stats });
    expect(plan.abilityId).toBe('void_gravity');

    const blocked = buildBlockedSet([]);
    const result = resolveVoidAcolyteAbility(stats, PORTAL_WARDEN_ID, 'player', plan, blocked);
    expect(result.hit).toBe(true);
    expect(result.pulled).toBeTruthy();
    expect(stats.isVoidLocked('player')).toBe(true);
    expect(result.damage).toBe(VOID_LASH_DAMAGE);
    expect(stats.getEntity('player').hp).toBe(100 - VOID_LASH_DAMAGE);
  });

  it('icicle_blast reaches the full portal duel lane (8 tiles)', () => {
    const { stats, record } = setup({ playerTx: 4, playerTy: 8, wardenTx: 4, wardenTy: 0 });
    const plan = planVoidAcolyteAttack({ record, stats });
    expect(plan.abilityId).toBe('icicle_blast');

    const result = resolveVoidAcolyteAbility(stats, PORTAL_WARDEN_ID, 'player', plan, buildBlockedSet([]));
    expect(result.hit).toBe(true);
    expect(result.staged).toBe(true);
  });

  it('icicle_blast stages three hits at range without immediate damage', () => {
    const { stats, record } = setup({ playerTx: 6, playerTy: 0 });
    const plan = planVoidAcolyteAttack({ record, stats });
    expect(plan.abilityId).toBe('icicle_blast');
    expect(plan.hitCount).toBe(ICICLE_BLAST_HIT_COUNT);

    const result = resolveVoidAcolyteAbility(stats, PORTAL_WARDEN_ID, 'player', plan, buildBlockedSet([]));
    expect(result.hit).toBe(true);
    expect(result.staged).toBe(true);
    expect(result.damagePerHit).toBe(ICICLE_BLAST_DAMAGE_PER_HIT);
    expect(stats.getEntity('player').hp).toBe(100);

    let hp = 100;
    for (let i = 0; i < ICICLE_BLAST_HIT_COUNT; i += 1) {
      const hit = applyVoidAcolyteHitDamage(stats, 'player', result.damagePerHit);
      hp -= hit.damage;
    }
    expect(hp).toBe(100 - ICICLE_BLAST_DAMAGE_PER_HIT * ICICLE_BLAST_HIT_COUNT);
  });

  it('void_execution fires only when player is locked and adjacent', () => {
    const { stats, record } = setup({ playerTx: 7, playerTy: 0 });
    stats.setPosition('player', 9, 0);
    stats.setVoidLocked('player', VOID_GRAVITY_LOCK_TURNS);
    const plan = planVoidAcolyteAttack({ record, stats });
    expect(plan.abilityId).toBe('void_execution');

    const result = resolveVoidAcolyteAbility(stats, PORTAL_WARDEN_ID, 'player', plan, buildBlockedSet([]));
    expect(result.hit).toBe(true);
    expect(result.damage).toBe(VOID_EXECUTION_DAMAGE);
  });

  it('2–3 turn catch sequence threatens 100 HP player', () => {
    const { stats, record } = setup({
      playerTx: 5,
      playerTy: 0,
      abilities: { gravityCooldown: 0, icicleCooldown: 4 },
    });
    stats.getEntity(PORTAL_WARDEN_ID).attackPoints = 12;
    stats.getEntity(PORTAL_WARDEN_ID).attackPointsRemaining = 12;
    let hp = 100;

    const gravityPlan = planVoidAcolyteAttack({ record, stats });
    const gravity = resolveVoidAcolyteAbility(stats, PORTAL_WARDEN_ID, 'player', gravityPlan, buildBlockedSet([]));
    hp -= gravity.damage;

    stats.endTurn('player');
    stats.endTurn(PORTAL_WARDEN_ID);
    stats.setPosition('player', 9, 0);
    const execPlan = planVoidAcolyteAttack({ record, stats });
    const exec = resolveVoidAcolyteAbility(stats, PORTAL_WARDEN_ID, 'player', execPlan, buildBlockedSet([]));
    expect(exec.hit).toBe(true);
    hp -= exec.damage;

    stats.endTurn('player');
    stats.endTurn(PORTAL_WARDEN_ID);
    const exec2Plan = planVoidAcolyteAttack({ record, stats });
    const exec2 = resolveVoidAcolyteAbility(stats, PORTAL_WARDEN_ID, 'player', exec2Plan, buildBlockedSet([]));
    expect(exec2.hit).toBe(true);
    hp -= exec2.damage;

    expect(hp).toBeLessThanOrEqual(10);
  });
});