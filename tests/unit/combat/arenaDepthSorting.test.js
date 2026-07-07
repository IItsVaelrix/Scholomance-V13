import { describe, expect, test } from 'vitest';
import { ARENA_SORT_LAYER, getGridSortDepth } from '../../../src/game/combat/arenaDepthSorting.js';

describe('arenaDepthSorting', () => {
  test('player south of brazier renders in front', () => {
    const playerDepth = getGridSortDepth(4, 6, ARENA_SORT_LAYER.PLAYER);
    const torchDepth = getGridSortDepth(2, 4, ARENA_SORT_LAYER.TORCH_BODY);
    expect(playerDepth).toBeGreaterThan(torchDepth);
  });

  test('player north of brazier renders behind', () => {
    const playerDepth = getGridSortDepth(4, 3, ARENA_SORT_LAYER.PLAYER);
    const torchDepth = getGridSortDepth(4, 4, ARENA_SORT_LAYER.TORCH_BODY);
    expect(playerDepth).toBeLessThan(torchDepth);
  });

  test('tile directly south of west brazier renders in front', () => {
    const playerDepth = getGridSortDepth(3, 5, ARENA_SORT_LAYER.PLAYER);
    const torchDepth = getGridSortDepth(2, 4, ARENA_SORT_LAYER.TORCH_BODY);
    expect(playerDepth).toBeGreaterThan(torchDepth);
  });
});