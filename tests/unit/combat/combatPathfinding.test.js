import { describe, expect, it } from 'vitest';
import {
  buildBlockedSet,
  canReachWithinSteps,
  findPath,
  getReachableTiles,
  tileKey,
} from '../../../src/game/combat/combatPathfinding.js';

const blocked = buildBlockedSet();

describe('combatPathfinding', () => {
  it('finds a shortest path around the obelisk core', () => {
    const path = findPath({ tx: 4, ty: 6 }, { tx: 4, ty: 5 }, blocked);
    expect(path).toEqual([{ tx: 4, ty: 5 }]);
  });

  it('routes around blocked tiles instead of cutting through them', () => {
    const path = findPath({ tx: 3, ty: 4 }, { tx: 5, ty: 4 }, blocked);
    expect(path.length).toBeGreaterThan(2);
    expect(path.every((step) => step.tx !== 4 || step.ty !== 4)).toBe(true);
    expect(path[path.length - 1]).toEqual({ tx: 5, ty: 4 });
  });

  it('returns an empty path when the goal is blocked or unreachable', () => {
    expect(findPath({ tx: 4, ty: 6 }, { tx: 4, ty: 4 }, blocked)).toEqual([]);
    expect(findPath({ tx: 4, ty: 6 }, { tx: 8, ty: 0 }, blocked)).toEqual([]);
  });

  it('marks only tiles within movement range as reachable', () => {
    const reachable = getReachableTiles({ tx: 4, ty: 6 }, 2, blocked);
    expect(reachable.has(tileKey(4, 6))).toBe(true);
    expect(reachable.has(tileKey(4, 5))).toBe(true);
    expect(reachable.has(tileKey(3, 6))).toBe(true);
    expect(reachable.has(tileKey(4, 3))).toBe(false);
  });

  it('validates reachability against remaining movement points', () => {
    expect(canReachWithinSteps({ tx: 4, ty: 6 }, { tx: 4, ty: 5 }, 1, blocked)).toBe(true);
    expect(canReachWithinSteps({ tx: 4, ty: 6 }, { tx: 2, ty: 6 }, 1, blocked)).toBe(false);
  });
});