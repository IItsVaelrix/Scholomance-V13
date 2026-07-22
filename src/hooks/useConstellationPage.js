import { useMemo } from 'react';
import { resolveConstellationFixture } from '../pages/Constellation/fixtures/samplePagePacket.js';

/**
 * @param {string | null} query
 * @returns {{ status: 'idle' | 'ready', packet: import('../pages/Constellation/types.js').ConstellationPhase1Packet | null }}
 */
export function useConstellationPage(query) {
  return useMemo(() => {
    if (query == null || String(query).trim() === '') {
      return { status: 'idle', packet: null };
    }
    return { status: 'ready', packet: resolveConstellationFixture(query) };
  }, [query]);
}
