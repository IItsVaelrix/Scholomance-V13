import React, { useEffect, useRef } from 'react';
import { mountPhaserGame } from '../../lib/phaser/phaser-runtime.adapter';
import { getGameBrazierFireService } from '../../lib/audio/gameBrazierFire.service.js';
import { getGameFireballImpactService } from '../../lib/audio/gameFireballImpact.service.js';
import { getGameIceSpellImpactService } from '../../lib/audio/gameIceSpellImpact.service.js';
import { getGameSwordSliceService } from '../../lib/audio/gameSwordSlice.service.js';
import { getGameChestUnlockService } from '../../lib/audio/gameChestUnlock.service.js';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion.js';
import { bridgeArenaScene } from './arenaBridge.js';
import { installWorldTransitionListener } from '../../game/world/worldSceneTransition.js';
import { registerCombatGame, unregisterCombatGame } from '../../game/combat/combatGameBridge.js';

import createCombatArenaScene from '../../phaser/CombatArenaScene';
import createPolarisForestScene from '../../phaser/PolarisForestScene';

export default function ArenaCombatView({ onCast }) {
  const containerRef = useRef(null);
  const gameRef = useRef(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  const onCastRef = useRef(onCast);
  useEffect(() => {
    onCastRef.current = onCast;
  }, [onCast]);

  useEffect(() => {
    const fire = getGameBrazierFireService();
    const sword = getGameSwordSliceService();
    const fireball = getGameFireballImpactService();
    const iceImpact = getGameIceSpellImpactService();
    const chestUnlock = getGameChestUnlockService();
    if (!prefersReducedMotion) {
      fire.prime();
      fire.setEnabled(true);
      void fire.start();

      sword.prime();
      sword.setEnabled(true);

      fireball.prime();
      fireball.setEnabled(true);

      iceImpact.prime();
      iceImpact.setEnabled(true);

      chestUnlock.prime();
      chestUnlock.setEnabled(true);
    } else {
      fire.setEnabled(false);
      void fire.stop();
      sword.setEnabled(false);
      fireball.setEnabled(false);
      iceImpact.setEnabled(false);
      chestUnlock.setEnabled(false);
    }

    return () => {
      void fire.stop();
    };
  }, [prefersReducedMotion]);

  useEffect(() => {
    const controller = new AbortController();
    let removeWorldTransition = () => {};

    async function start() {
      if (!containerRef.current) return;

      const result = await mountPhaserGame({
        parent: containerRef.current,
        buildScenes: [createCombatArenaScene, createPolarisForestScene],
        signal: controller.signal,
        config: {
          type: 2,
          width: '100%',
          height: '100%',
          transparent: false,
          scale: {
            mode: 3,
            autoCenter: 1,
          },
          physics: { default: 'arcade' },
          banner: false,
          disableContextMenu: true,
          audio: { noAudio: true },
        },
      });

      if (controller.signal.aborted || !result) return;

      gameRef.current = result;
      registerCombatGame(result.game);

      const dispatchAction = (action) => {
        if (onCastRef.current) {
          onCastRef.current(action);
        }
      };

      bridgeArenaScene(result.game, 'CombatArenaScene', dispatchAction);
      removeWorldTransition = installWorldTransitionListener(
        () => gameRef.current?.game,
        dispatchAction,
      );
    }

    start();

    return () => {
      removeWorldTransition();
      unregisterCombatGame();
      controller.abort();
      if (gameRef.current?.destroy) {
        gameRef.current.destroy(true);
      }
      gameRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="combat-arena-mount"
    />
  );
}