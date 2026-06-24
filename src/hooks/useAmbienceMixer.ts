import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getAmbienceMixerService,
  AMBIENCE_STORAGE_KEY,
  AMBIENCE_CHANNELS,
} from '../lib/ambient/ambienceMixer.service.js';

function readConfig(): any {
  try {
    const raw = localStorage.getItem(AMBIENCE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeConfig(state: any) {
  try {
    const channels = Object.fromEntries(
      AMBIENCE_CHANNELS.map((id) => [
        id,
        { enabled: state.channels[id].enabled, volume: state.channels[id].volume },
      ]),
    );
    localStorage.setItem(
      AMBIENCE_STORAGE_KEY,
      JSON.stringify({ master: state.master, channels }),
    );
  } catch {
    // ignore storage errors
  }
}

export function useAmbienceMixer(service: any = getAmbienceMixerService()) {
  const [state, setState] = useState<any>(() => service.getState());
  const loadedRef = useRef(false);

  useEffect(() => {
    if (!loadedRef.current) {
      const cfg = readConfig();
      if (cfg) service.loadConfig(cfg);
      loadedRef.current = true;
      setState(service.getState());
    }
    return service.subscribe(setState);
  }, [service]);

  useEffect(() => {
    if (loadedRef.current) writeConfig(state);
  }, [state]);

  const setChannelEnabled = useCallback((id: string, enabled: boolean) => service.setChannelEnabled(id, enabled), [service]);
  const setChannelVolume = useCallback((id: string, value: number) => service.setChannelVolume(id, value), [service]);
  const setMasterVolume = useCallback((value: number) => service.setMasterVolume(value), [service]);
  const stop = useCallback(() => service.stop(), [service]);

  return { state, setChannelEnabled, setChannelVolume, setMasterVolume, stop };
}
