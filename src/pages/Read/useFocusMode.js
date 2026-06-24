import { useEffect, useRef } from 'react';
import { getAmbienceMixerService } from '../../lib/ambient/ambienceMixer.service.js';

export function useFocusMode(active, setActive, service = getAmbienceMixerService()) {
  const prevActive = useRef(active);

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setActive(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, setActive]);

  useEffect(() => {
    if (prevActive.current && !active) service.stop();
    prevActive.current = active;
  }, [active, service]);
}
