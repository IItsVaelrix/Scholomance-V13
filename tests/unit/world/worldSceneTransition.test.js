import { describe, expect, it, vi } from 'vitest';
import {
  installWorldTransitionListener,
  transitionToWorldMap,
} from '../../../src/game/world/worldSceneTransition.js';
import {
  POLARIS_TELEPORT_READY_EVENT,
  POLARIS_TRANSITION_START_EVENT,
} from '../../../src/game/world/polarisTransition.js';

function createMockGame() {
  const scenes = new Map();
  const makeScene = (key) => ({
    key,
    cutsceneInputLock: true,
    polarisTransitActive: true,
    events: {
      emit: vi.fn(),
      off: vi.fn(),
      on: vi.fn(),
    },
    sys: { isActive: vi.fn(() => key === 'CombatArenaScene') },
  });

  scenes.set('CombatArenaScene', makeScene('CombatArenaScene'));
  scenes.set('PolarisForestScene', makeScene('PolarisForestScene'));

  const sceneApi = {
    isActive: vi.fn((key) => key === 'CombatArenaScene'),
    isSleeping: vi.fn(() => false),
    isVisible: vi.fn((key) => key === 'CombatArenaScene'),
    sleep: vi.fn(),
    switch: vi.fn(),
    launch: vi.fn(),
    wake: vi.fn(),
    start: vi.fn(),
    bringToTop: vi.fn(),
    setVisible: vi.fn(),
    getScene: vi.fn((key) => scenes.get(key)),
  };

  const gameEvents = {
    once: vi.fn(),
    on: vi.fn(),
  };

  return {
    scene: sceneApi,
    events: gameEvents,
    isRunning: true,
  };
}

describe('worldSceneTransition', () => {
  it('switches tutorial to polaris without stopping it', () => {
    const game = createMockGame();
    const handler = vi.fn();

    const ok = transitionToWorldMap(game, 'polaris-sonic-forest', handler, {
      sourceMapId: 'tutorial-island',
    });

    expect(ok).toBe(true);
    expect(game.scene.setVisible).toHaveBeenCalledWith('CombatArenaScene', false);
    expect(game.scene.switch).toHaveBeenCalledWith(
      'CombatArenaScene',
      'PolarisForestScene',
      expect.objectContaining({
        entryConnection: expect.objectContaining({ from: 'tutorial-island' }),
      }),
    );
    expect(game.scene.bringToTop).toHaveBeenCalledWith('PolarisForestScene');
    expect(game.scene.setVisible).toHaveBeenCalledWith('PolarisForestScene', true);
    expect(scenesUnlock(game)).toBe(true);
  });

  it('starts polaris when source is visible-only (not active)', () => {
    const game = createMockGame();
    game.scene.isActive = vi.fn(() => false);
    game.scene.isVisible = vi.fn((key) => key === 'CombatArenaScene');
    const handler = vi.fn();

    const ok = transitionToWorldMap(game, 'polaris-sonic-forest', handler, {
      sourceMapId: 'tutorial-island',
    });

    expect(ok).toBe(true);
    expect(game.scene.start).toHaveBeenCalledWith(
      'PolarisForestScene',
      expect.objectContaining({
        entryConnection: expect.objectContaining({ from: 'tutorial-island' }),
      }),
    );
    expect(game.scene.setVisible).toHaveBeenCalledWith('PolarisForestScene', true);
    expect(game.scene.setVisible).toHaveBeenCalledWith('CombatArenaScene', false);
  });

  it('transitions once on matrix intro start and ignores the ready fallback', () => {
    const game = createMockGame();
    const handler = vi.fn();
    const getGame = vi.fn(() => game);

    const remove = installWorldTransitionListener(getGame, handler);

    window.dispatchEvent(new CustomEvent(POLARIS_TRANSITION_START_EVENT));
    window.dispatchEvent(new CustomEvent(POLARIS_TELEPORT_READY_EVENT));

    expect(game.scene.switch).toHaveBeenCalledTimes(1);
    remove();
  });
});

function scenesUnlock(game) {
  const tutorial = game.scene.getScene('CombatArenaScene');
  return tutorial.cutsceneInputLock === false && tutorial.polarisTransitActive === false;
}