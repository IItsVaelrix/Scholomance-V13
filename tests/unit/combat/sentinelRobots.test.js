import { describe, expect, it } from 'vitest';
import {
  areAllSentinelsDefeated,
  buildSentinelBlockedTiles,
  buildSentinelSceneTargets,
  getAggroableSentinels,
  getSentinelAtTile,
  getSentinelIntelligenceProfile,
  isPlayerNearObelisk,
  isSentinelId,
  shouldEngageCombatBattle,
  OBELISK_AGGRO_RADIUS,
  SENTINEL_ROBOTS,
} from '../../../src/game/combat/sentinelRobots.js';

describe('sentinelRobots', () => {
  const alive = SENTINEL_ROBOTS.map((entry) => ({ ...entry, defeated: false }));

  it('assigns per-sentinel INT profiles', () => {
    expect(getSentinelIntelligenceProfile('sentinel-west').intelligence).toBe(58);
    expect(getSentinelIntelligenceProfile('sentinel-east').intelligence).toBe(82);
    expect(getSentinelIntelligenceProfile('sentinel-east').cognitionLabel).toBe('mastermind');
  });

  it('recognizes sentinel ids', () => {
    expect(isSentinelId('sentinel-west')).toBe(true);
    expect(isSentinelId('sentinel-east')).toBe(true);
    expect(isSentinelId('player')).toBe(false);
  });

  it('builds combatant scene targets with attack range', () => {
    const stats = {
      isInAttackRange: (attackerId, targetId) => (
        attackerId === 'player' && targetId === 'sentinel-west'
      ),
    };
    const targets = buildSentinelSceneTargets({ sentinels: alive, stats });
    expect(targets).toHaveLength(2);
    expect(targets[0]).toMatchObject({
      id: 'sentinel-west',
      kind: 'combatant',
      inRange: true,
    });
    expect(targets[1]).toMatchObject({
      id: 'sentinel-east',
      kind: 'combatant',
      inRange: false,
    });
  });

  it('omits defeated sentinels from scene targets and blocked tiles', () => {
    const sentinels = alive.map((entry, index) => (
      index === 0 ? { ...entry, defeated: true } : entry
    ));
    const targets = buildSentinelSceneTargets({ sentinels });
    expect(targets).toHaveLength(1);
    expect(targets[0].id).toBe('sentinel-east');

    const blocked = buildSentinelBlockedTiles(sentinels, [{ tx: 4, ty: 4 }]);
    expect(blocked).toEqual([
      { tx: 4, ty: 4 },
      { tx: 6, ty: 4 },
    ]);
  });

  it('finds a sentinel by combat tile', () => {
    expect(getSentinelAtTile(2, 4, alive)?.id).toBe('sentinel-west');
    expect(getSentinelAtTile(6, 4, alive)?.id).toBe('sentinel-east');
    expect(getSentinelAtTile(4, 4, alive)).toBeNull();
  });

  it('detects obelisk proximity for sentinel aggro', () => {
    expect(isPlayerNearObelisk(4, 6)).toBe(false);
    expect(isPlayerNearObelisk(4, 5)).toBe(true);
    expect(isPlayerNearObelisk(3, 4)).toBe(true);
    expect(isPlayerNearObelisk(4, 4, OBELISK_AGGRO_RADIUS)).toBe(true);
  });

  it('detects when every sentinel has been defeated', () => {
    expect(areAllSentinelsDefeated(alive)).toBe(false);
    const oneDown = alive.map((entry, index) => (
      index === 0 ? { ...entry, defeated: true } : entry
    ));
    expect(areAllSentinelsDefeated(oneDown)).toBe(false);
    const allDown = alive.map((entry) => ({ ...entry, defeated: true }));
    expect(areAllSentinelsDefeated(allDown)).toBe(true);
  });

  it('blocks battle engagement after victory or when all sentinels are down', () => {
    const allDown = alive.map((entry) => ({ ...entry, defeated: true }));
    expect(shouldEngageCombatBattle({ sentinels: alive })).toBe(true);
    expect(shouldEngageCombatBattle({ sentinels: allDown })).toBe(false);
    expect(shouldEngageCombatBattle({
      sentinels: allDown,
      portalWarden: { aggroed: true, defeated: false },
    })).toBe(true);
    expect(shouldEngageCombatBattle({ sentinels: alive, combatVictoryAchieved: true })).toBe(false);
  });

  it('lists aggroable sentinels only when the player threatens the tower', () => {
    expect(getAggroableSentinels(alive, 4, 6)).toEqual([]);
    expect(getAggroableSentinels(alive, 4, 5)).toHaveLength(2);
    const defeatedWest = alive.map((entry) => (
      entry.id === 'sentinel-west' ? { ...entry, defeated: true } : entry
    ));
    expect(getAggroableSentinels(defeatedWest, 5, 4)).toHaveLength(1);
  });
});