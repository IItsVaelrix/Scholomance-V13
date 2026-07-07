import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  COMBAT_BATTLE_ENDED_EVENT,
  COMBAT_BATTLE_STARTED_EVENT,
} from '../game/combat/combatBattleIntro.js';
import {
  COMBAT_FOREST_MUSIC_EVENT,
  isPolarisForestRegion,
} from '../game/combat/combatMusicRegion.js';
import {
  isCombatMusicRoute,
  resolveBattleMusicProfile,
  resolveForestMusicProfile,
  resolveMusicProfileForPath,
} from '../lib/audio/gameBackgroundMusic.config.js';
import { getGameBackgroundMusicService } from '../lib/audio/gameBackgroundMusic.service.js';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js';

/** Routes where the school radio owns the soundscape. */
const SUPPRESSED_PREFIXES = ['/listen'];

function isSuppressedRoute(pathname = '') {
  return SUPPRESSED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Route-aware game music: ambient "The Beginning" by default.
 * "Battle On!" only after combat-battle-started on /combat (sentinel aggro).
 * Autoplay unlocks on the first user gesture (browser policy).
 */
export default function GameBackgroundMusicSync() {
  const location = useLocation();
  const prefersReducedMotion = usePrefersReducedMotion();
  const shouldPlay = !prefersReducedMotion && isCombatMusicRoute(location.pathname);

  useEffect(() => {
    const service = getGameBackgroundMusicService();
    let cancelled = false;

    const applyProfile = async (profile) => {
      if (cancelled) return;
      await service.setMusicProfile(profile);
      if (shouldPlay) {
        service.prime();
        if (service.getState().enabled) {
          await service.start();
        }
      } else {
        await service.stop();
      }
    };

    const syncAmbient = () => applyProfile(resolveMusicProfileForPath(location.pathname));

    const onBattleStarted = () => {
      if (!isCombatMusicRoute(location.pathname)) return;
      void applyProfile(resolveBattleMusicProfile());
    };

    const syncCombatAmbient = () => {
      if (isPolarisForestRegion()) {
        return applyProfile(resolveForestMusicProfile());
      }
      return syncAmbient();
    };

    const onBattleEnded = () => {
      if (!isCombatMusicRoute(location.pathname)) return;
      void syncCombatAmbient();
    };

    const onForestMusic = () => {
      if (!isCombatMusicRoute(location.pathname)) return;
      void applyProfile(resolveForestMusicProfile());
    };

    void syncAmbient();
    window.addEventListener(COMBAT_BATTLE_STARTED_EVENT, onBattleStarted);
    window.addEventListener(COMBAT_BATTLE_ENDED_EVENT, onBattleEnded);
    window.addEventListener(COMBAT_FOREST_MUSIC_EVENT, onForestMusic);

    return () => {
      cancelled = true;
      window.removeEventListener(COMBAT_BATTLE_STARTED_EVENT, onBattleStarted);
      window.removeEventListener(COMBAT_BATTLE_ENDED_EVENT, onBattleEnded);
      window.removeEventListener(COMBAT_FOREST_MUSIC_EVENT, onForestMusic);
      void service.stop();
    };
  }, [shouldPlay, location.pathname]);

  return null;
}