import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createChannelStore, type ChannelStore } from '../../lib/mmorpg/state';
import { connectGameUi, readInventory, readXp } from '../../lib/mmorpg/gameUi.adapter';
import type { SystemResource, UiSettings } from '../../lib/mmorpg/contracts';
const StoreContext = createContext<ChannelStore | null>(null);
export const EMPTY_RESOURCE: SystemResource = Object.freeze({ state: 'unavailable', data: Object.freeze({}), message: 'No records are available in this world yet.' });
export const DEFAULT_SETTINGS: UiSettings = { textScale: 'normal', contrast: false, reducedMotion: false, tooltips: true, tooltipDelay: 350, compact: false, hudOpacity: 'solid', actionBars: true };
const SETTINGS_KEY = 'scholomance.ui.preferences.v1';
function readSettings(): UiSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return { textScale: ['normal', 'large', 'largest'].includes(raw.textScale) ? raw.textScale : 'normal', contrast: raw.contrast === true, reducedMotion: raw.reducedMotion === true, tooltips: raw.tooltips !== false, tooltipDelay: [0, 350, 700].includes(raw.tooltipDelay) ? raw.tooltipDelay : 350, compact: raw.compact === true, hudOpacity: raw.hudOpacity === 'soft' ? 'soft' : 'solid', actionBars: raw.actionBars !== false };
  } catch { return DEFAULT_SETTINGS; }
}
export function GameUiProvider({ children, resources, store: providedStore }: { children: ReactNode; resources?: Record<string, SystemResource>; store?: ChannelStore }) {
  const [store] = useState(() => providedStore || createChannelStore({ inventory: readInventory(), xp: readXp(), settings: readSettings() }));
  useEffect(() => connectGameUi(store), [store]);
  const previous = useRef<string[]>([]);
  useEffect(() => {
    previous.current.forEach(key => { if (!resources?.[key]) store.publish(`system:${key}`, EMPTY_RESOURCE); });
    Object.entries(resources || {}).forEach(([key, value]) => store.publish(`system:${key}`, value));
    previous.current = Object.keys(resources || {});
  }, [resources, store]);
  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}
export function useGameStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error('GameUiProvider is required');
  return store;
}
export function useGameChannel<T>(key: string, fallback: T): T {
  const store = useGameStore();
  const subscribe = useCallback((listener: () => void) => store.subscribe(key, listener), [store, key]);
  const snapshot = useCallback(() => (store.get(key) as T | undefined) ?? fallback, [store, key, fallback]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
export function useSystem(id: string) { return useGameChannel(`system:${id}`, EMPTY_RESOURCE); }
export function useUiSettings() {
  const store = useGameStore(); const settings = useGameChannel('settings', DEFAULT_SETTINGS);
  const update = useCallback((patch: Partial<UiSettings>) => {
    const next = { ...(store.get('settings') as UiSettings || DEFAULT_SETTINGS), ...patch };
    store.publish('settings', next);
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch { /* Preferences remain usable in memory. */ }
  }, [store]);
  return useMemo(() => ({ settings, update }), [settings, update]);
}
