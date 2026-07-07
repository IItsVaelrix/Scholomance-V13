import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getGameAudioForgeService } from '../lib/audio/gameAudioForge.service.js';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js';

const SUPPRESSED_PREFIXES = ['/listen'];

function isSuppressedRoute(pathname = '') {
  return SUPPRESSED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Primes Audio Forge gesture unlock and keeps procedural SFX ready app-wide.
 */
export default function GameAudioForgeSync() {
  const location = useLocation();
  const prefersReducedMotion = usePrefersReducedMotion();
  const shouldPrime = !prefersReducedMotion && !isSuppressedRoute(location.pathname);

  useEffect(() => {
    const service = getGameAudioForgeService();

    if (shouldPrime) {
      service.prime();
      service.setEnabled(true);
    } else {
      service.setEnabled(false);
    }

    return () => {
      // Keep forge alive for the session; dispose only on full app teardown if needed.
    };
  }, [shouldPrime]);

  return null;
}