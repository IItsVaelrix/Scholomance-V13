import { useEffect, useRef, useState } from 'react';
import { resolveConstellationFixture } from '../pages/Constellation/fixtures/samplePagePacket.js';

/**
 * Fetches a live ConstellationOS page on submit; falls back to the deterministic
 * fixture when the backend is unavailable (PDR §7.8). Never recomputes engine
 * truth on the client — it maps the server packet verbatim.
 * @param {string | null} query
 * @returns {{ status: 'idle' | 'loading' | 'ready', packet: import('./constellation.types.js').ConstellationPhase1Packet | null }}
 */
export function useConstellationPage(query) {
  const [state, setState] = useState({ status: 'idle', packet: null });
  const requestId = useRef(0);

  useEffect(() => {
    if (query == null || String(query).trim() === '') {
      setState({ status: 'idle', packet: null });
      return undefined;
    }

    const id = requestId.current + 1;
    requestId.current = id;
    const controller = new AbortController();
    setState((prev) => ({ status: 'loading', packet: prev.packet }));

    (async () => {
      try {
        const res = await fetch(`/api/constellation/page?query=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const packet = await res.json();
        if (requestId.current === id && !controller.signal.aborted) {
          setState({ status: 'ready', packet });
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        if (requestId.current === id) {
          setState({ status: 'ready', packet: resolveConstellationFixture(query) });
        }
      }
    })();

    return () => controller.abort();
  }, [query]);

  return state;
}
