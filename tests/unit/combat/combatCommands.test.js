import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  executeWarpCommand,
  parseCombatCommand,
  resolveWarpTarget,
  tryExecuteCombatCommandInput,
} from '../../../src/game/combat/combatCommands.js';
import { registerCombatGame, unregisterCombatGame } from '../../../src/game/combat/combatGameBridge.js';
import { POLARIS_FOREST_MAP_ID, TUTORIAL_ISLAND_MAP_ID } from '../../../src/game/world/worldMapRegistry.js';

function createWarpMockGame() {
  const scenes = new Map();
  const makeScene = (key) => ({ key, sys: { isActive: vi.fn(() => key === 'CombatArenaScene') } });

  scenes.set('CombatArenaScene', makeScene('CombatArenaScene'));
  scenes.set('PolarisForestScene', makeScene('PolarisForestScene'));

  return {
    scene: {
      isActive: vi.fn((key) => key === 'CombatArenaScene'),
      isSleeping: vi.fn(() => false),
      isVisible: vi.fn((key) => key === 'CombatArenaScene'),
      switch: vi.fn(),
      wake: vi.fn(),
      start: vi.fn(),
      sleep: vi.fn(),
      bringToTop: vi.fn(),
      setVisible: vi.fn(),
      getScene: vi.fn((key) => scenes.get(key)),
    },
    events: { once: vi.fn(), on: vi.fn() },
    isRunning: true,
  };
}

describe('combatCommands', () => {
  afterEach(() => {
    unregisterCombatGame();
  });
  it('parseCombatCommand reads slash commands', () => {
    expect(parseCombatCommand('/warp polaris')).toEqual({
      name: 'warp',
      args: ['polaris'],
      raw: '/warp polaris',
    });
    expect(parseCombatCommand('rend flesh')).toBeNull();
  });

  it('resolveWarpTarget maps aliases to map ids', () => {
    expect(resolveWarpTarget('polaris')).toBe(POLARIS_FOREST_MAP_ID);
    expect(resolveWarpTarget('tutorial')).toBe(TUTORIAL_ISLAND_MAP_ID);
    expect(resolveWarpTarget('nowhere')).toBeNull();
  });

  it('executeWarpCommand fails gracefully without a mounted game', () => {
    const result = executeWarpCommand('polaris');
    expect(result.ok).toBe(false);
    expect(result.message).toContain('loading');
  });

  it('tryExecuteCombatCommandInput handles /help', () => {
    const result = tryExecuteCombatCommandInput('/help');
    expect(result?.ok).toBe(true);
    expect(result?.message).toContain('/warp');
  });

  it('executeWarpCommand switches to polaris when game is mounted', () => {
    const game = createWarpMockGame();
    registerCombatGame(game);
    const onArenaAction = vi.fn();

    const result = executeWarpCommand('polaris', { onArenaAction });

    expect(result.ok).toBe(true);
    expect(result.message).toContain('Warped');
    expect(result.sideEffects).toContain('skip-polaris-intro');
    expect(game.scene.switch).toHaveBeenCalledWith(
      'CombatArenaScene',
      'PolarisForestScene',
      expect.objectContaining({
        entryConnection: expect.objectContaining({
          viaCommand: true,
          target: POLARIS_FOREST_MAP_ID,
        }),
      }),
    );
  });

  it('tryExecuteCombatCommandInput defaults bare /warp to polaris', () => {
    const game = createWarpMockGame();
    registerCombatGame(game);

    const result = tryExecuteCombatCommandInput('/warp');

    expect(result?.ok).toBe(true);
    expect(game.scene.switch).toHaveBeenCalledWith(
      'CombatArenaScene',
      'PolarisForestScene',
      expect.any(Object),
    );
  });
});