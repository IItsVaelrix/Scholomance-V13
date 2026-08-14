import { useEffect, useRef, useState } from 'react';
import { buildEngineUnreachablePacket } from '../pages/Constellation/fixtures/samplePagePacket.js';

/**
 * Fetches a live ConstellationOS page on submit; when the backend is
 * unreachable it emits an EXPLICIT engine-unreachable packet — empty channels,
 * no sample semantics — rather than a rich fixture marked degraded (feedback
 * report 2026-08-19). Never recomputes engine truth on the client — it maps
 * the server packet verbatim.
 *
 * THE SAME QUESTION IS A NEW REQUEST. `attempt` exists because the query alone
 * cannot express "ask again": re-submitting an identical string is a React state
 * bail-out, the effect below never re-runs, and the page silently refuses to
 * retry. That turned a transient backend failure into a dead end — the reader is
 * handed the offline fixture and pressing Enter again does nothing at all, for
 * as long as the text is unchanged. Callers bump `attempt` per submission.
 *
 * @param {string | null} query
 * @param {number} [attempt] monotonic submission counter; any change refetches
 * @returns {{ status: 'idle' | 'loading' | 'ready', packet: import('./constellation.types.js').ConstellationPhase1Packet | null }}
 */
export function useConstellationPage(query, attempt = 0) {
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
          // Epistemically clean failure (feedback report 2026-08-19): an
          // EXPLICIT engine-unreachable packet with empty channels. The old
          // path served the rich sample fixture marked degraded — responsible
          // disclosure, but a rich sample can still be mistaken for partial
          // live analysis. Now the page says exactly what happened: nothing
          // was analyzed, and the diagnostics carry the whole truth.
          setState({
            status: 'ready',
            packet: buildEngineUnreachablePacket(query, err?.message ?? 'unknown error'),
          });
        }
      }
    })();

    return () => controller.abort();
  }, [query, attempt]);

  return state;
}
