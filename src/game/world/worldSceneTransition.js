import { resolveWorldMap, TUTORIAL_ISLAND_MAP_ID } from './worldMapRegistry.js';
import {
  POLARIS_TELEPORT_READY_EVENT,
  POLARIS_TRANSITION_START_EVENT,
} from './polarisTransition.js';
import { bridgeArenaScene } from '../../pages/Combat/arenaBridge.js';
import { releaseTutorialTransitLock } from '../../phaser/combatSceneShared.js';

/**
 * Switches Phaser to a different world map scene without destroying the source map.
 *
 * @param {import('phaser').Game} game
 * @param {string} targetMapId
 * @param {(action: object) => void} onArenaAction
 * @param {{ sourceMapId?: string, entryData?: object }} [options]
 */
export function transitionToWorldMap(game, targetMapId, onArenaAction, options = {}) {
  const target = resolveWorldMap(targetMapId);
  if (!game?.scene || !target) {
    console.error('[worldSceneTransition] Missing game or map', { targetMapId, target });
    return false;
  }

  const sourceKey = resolveWorldMap(options.sourceMapId || TUTORIAL_ISLAND_MAP_ID)?.sceneKey
    || 'CombatArenaScene';
  const sourceScene = game.scene.getScene(sourceKey);
  const targetScene = game.scene.getScene(target.sceneKey);

  if (!targetScene) {
    console.error('[worldSceneTransition] Target scene not registered', { sceneKey: target.sceneKey });
    return false;
  }

  releaseTutorialTransitLock(sourceScene);

  const entryData = {
    entryConnection: {
      from: options.sourceMapId ?? TUTORIAL_ISLAND_MAP_ID,
      ...options.entryData,
    },
  };

  bridgeArenaScene(game, target.sceneKey, onArenaAction);

  const targetKey = target.sceneKey;
  const switchingMaps = sourceKey !== targetKey;

  if (switchingMaps && game.scene.isActive(sourceKey)) {
    game.scene.switch(sourceKey, targetKey, entryData);
  } else if (game.scene.isSleeping(targetKey)) {
    game.scene.wake(targetKey, entryData);
    if (game.scene.isActive(sourceKey)) {
      game.scene.sleep(sourceKey);
    }
  } else if (!game.scene.isActive(targetKey)) {
    game.scene.start(targetKey, entryData);
    if (game.scene.isActive(sourceKey)) {
      game.scene.sleep(sourceKey);
    }
  }

  game.scene.bringToTop(targetKey);
  game.scene.setVisible(targetKey, true);
  if (switchingMaps) {
    game.scene.setVisible(sourceKey, false);
  }

  return true;
}

/**
 * @param {() => import('phaser').Game | null | undefined} getGame
 * @param {(action: object) => void} onArenaAction
 * @returns {() => void}
 */
export function installWorldTransitionListener(getGame, onArenaAction) {
  let transitioned = false;

  const onTransit = () => {
    if (transitioned) return;

    const game = getGame();
    if (!game) {
      console.error('[worldSceneTransition] Game not mounted when Polaris transit began');
      return;
    }

    const ok = transitionToWorldMap(game, 'polaris-sonic-forest', onArenaAction, {
      sourceMapId: TUTORIAL_ISLAND_MAP_ID,
    });

    if (ok) {
      transitioned = true;
      return;
    }

    window.dispatchEvent(new CustomEvent('world-transition-failed', {
      detail: { targetMapId: 'polaris-sonic-forest' },
    }));
  };

  // Load the forest behind the matrix overlay as soon as the intro mounts.
  window.addEventListener(POLARIS_TRANSITION_START_EVENT, onTransit);
  // Fallback if the overlay was skipped or the start event was missed.
  window.addEventListener(POLARIS_TELEPORT_READY_EVENT, onTransit);

  return () => {
    window.removeEventListener(POLARIS_TRANSITION_START_EVENT, onTransit);
    window.removeEventListener(POLARIS_TELEPORT_READY_EVENT, onTransit);
  };
}