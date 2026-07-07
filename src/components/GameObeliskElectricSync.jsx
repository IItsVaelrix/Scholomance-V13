import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { getGameObeliskElectricService } from '../lib/audio/gameObeliskElectric.service.js';
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion.js';

const SUPPRESSED_PREFIXES = ['/listen'];

function isSuppressedRoute(pathname = '') {
  return SUPPRESSED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Primes the obelisk lightning-strike sample pool and gesture unlock app-wide.
 */
export default function GameObeliskElectricSync() {
  const location = useLocation();
  const prefersReducedMotion = usePrefersReducedMotion();
  const shouldPrime = !prefersReducedMotion && !isSuppressedRoute(location.pathname);

  useEffect(() => {
    const service = getGameObeliskElectricService();

    if (shouldPrime) {
      service.prime();
      service.setEnabled(true);
    } else {
      service.setEnabled(false);
    }
  }, [shouldPrime]);

  return null;
}