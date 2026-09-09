import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, type ReactNode } from 'react';
import { useGameChannel, useGameStore, useUiSettings } from '../../hooks/mmorpg/useGameUi';
import { clampWindow, isTextInput, UI_LIMITS, validateDrop, windowReducer } from '../../lib/mmorpg/state';
import { suspendGameKeyboard } from '../../lib/mmorpg/gameUi.adapter';
import type { DragPayload, DropTarget, Receipt, WindowAction, WindowRecord } from '../../lib/mmorpg/contracts';
const EMPTY_WINDOWS: WindowRecord[] = [];
export interface TooltipState { id: string; content: ReactNode; anchor: HTMLElement }
interface InteractionApi {
  window: (action: WindowAction) => void;
  tooltip: (value: TooltipState | null, delay?: number) => void;
  pickup: (payload: DragPayload) => void;
  drop: (target: DropTarget, commit: (payload: DragPayload) => Receipt) => void;
  cancel: () => void;
  notify: (message: string, kind?: string) => void;
}
const InteractionContext = createContext<InteractionApi | null>(null);
export interface Notice { id: number; message: string; kind: string }
const EMPTY_NOTICES: Notice[] = [];
const SHORTCUTS: Record<string, string> = { i: 'inventory', c: 'character', j: 'quests', m: 'map', o: 'social', p: 'progression' };
export function InteractionProvider({ children }: { children: ReactNode }) {
  const store = useGameStore();
  const tooltipTimer = useRef<ReturnType<typeof setTimeout>>();
  const noticeTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const noticeId = useRef(0);
  const openers = useRef(new Map<string, HTMLElement>());
  const loaded = useRef(false);
  const act = useCallback((action: WindowAction) => {
    const current = (store.get('windows') as WindowRecord[]) || EMPTY_WINDOWS;
    if (['open', 'toggle'].includes(action.type) && document.activeElement instanceof HTMLElement) openers.current.set(action.id, document.activeElement);
    let next = windowReducer(current, action).map(w => ({ ...w, ...clampWindow(w, { width: window.innerWidth, height: window.innerHeight }) }));
    store.publish('windows', next);
    if (action.type === 'close') {
      const opener = openers.current.get(action.id);
      if (opener?.isConnected) opener.focus();
    }
    if (['move', 'resize', 'settle'].includes(action.type)) {
      try { localStorage.setItem('scholomance.ui.windows.v1', JSON.stringify(next.map(({ id, x, y, width, height }) => ({ id, x, y, width, height })))); } catch { /* Memory-only layout still works. */ }
    }
  }, [store]);
  const tooltip = useCallback((value: TooltipState | null, delay = 0) => {
    clearTimeout(tooltipTimer.current);
    if (!value || !delay) store.publish('tooltip', value);
    else tooltipTimer.current = setTimeout(() => store.publish('tooltip', value), delay);
  }, [store]);
  const notify = useCallback((message: string, kind = 'informational') => {
    const entry = { id: ++noticeId.current, message, kind };
    store.publish('notices', [...((store.get('notices') as Notice[]) || []), entry].slice(-UI_LIMITS.notificationLimit));
    const timer = setTimeout(() => { store.publish('notices', ((store.get('notices') as Notice[]) || []).filter(n => n.id !== entry.id)); noticeTimers.current.delete(timer); }, UI_LIMITS.notificationMs);
    noticeTimers.current.add(timer);
  }, [store]);
  const api = useMemo<InteractionApi>(() => ({ window: act, tooltip, notify,
    pickup: payload => { tooltip(null); store.publish('drag', payload); notify('Picked up. Select a compatible destination, or press Escape to cancel.', 'low'); },
    cancel: () => store.publish('drag', null),
    drop: (target, commit) => {
      const payload = store.get('drag') as DragPayload | undefined;
      if (!payload) return;
      const validation = validateDrop(payload, target);
      const receipt = validation.ok ? commit(payload) : validation;
      if (!receipt.ok) notify(receipt.message || 'The item could not be moved.', 'warning');
      store.publish('drag', null);
    },
  }), [act, tooltip, notify, store]);
  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true;
      try {
        const saved = JSON.parse(localStorage.getItem('scholomance.ui.windows.v1') || '[]');
        if (Array.isArray(saved)) store.publish('windows', saved.filter(w => w && typeof w.id === 'string' && /^[a-z-]+$/.test(w.id)).slice(0, 40).map(w => ({ id: w.id, status: 'closed', ...clampWindow(w, windowViewport()) })));
      } catch { /* Ignore malformed local presentation preferences. */ }
    }
    const resize = () => store.publish('windows', ((store.get('windows') as WindowRecord[]) || []).map(w => ({ ...w, ...clampWindow(w, windowViewport()) })));
    const keydown = (event: KeyboardEvent) => {
      const windows = ((store.get('windows') as WindowRecord[]) || []).filter(w => !['closed', 'minimized'].includes(w.status));
      if (event.key === 'Escape') {
        if (store.get('tooltip')) tooltip(null);
        else if (store.get('drag')) store.publish('drag', null);
        else if (windows.length) act({ type: 'close', id: windows[windows.length - 1].id });
        else return;
        event.preventDefault(); event.stopImmediatePropagation(); return;
      }
      if (isTextInput(event.target) || event.altKey || event.ctrlKey || event.metaKey || event.repeat) return;
      const id = SHORTCUTS[event.key.toLowerCase()];
      if (id) { event.preventDefault(); event.stopImmediatePropagation(); act({ type: 'toggle', id }); }
    };
    let restoreKeyboard = () => {};
    const focus = () => {
      restoreKeyboard(); restoreKeyboard = () => {};
      if (document.activeElement?.closest('[data-game-ui],input,textarea,[contenteditable="true"]')) restoreKeyboard = suspendGameKeyboard();
    };
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('resize', resize);
    document.addEventListener('focusin', focus);
    return () => {
      window.removeEventListener('keydown', keydown, true); window.removeEventListener('resize', resize);
      document.removeEventListener('focusin', focus); restoreKeyboard(); clearTimeout(tooltipTimer.current);
      noticeTimers.current.forEach(clearTimeout);
    };
  }, [act, store, tooltip]);
  return <InteractionContext.Provider value={api}>{children}</InteractionContext.Provider>;
}
function windowViewport() { return { width: window.innerWidth, height: window.innerHeight }; }
export function useInteractions() { const api = useContext(InteractionContext); if (!api) throw new Error('InteractionProvider is required'); return api; }
export function useWindows() { return useGameChannel('windows', EMPTY_WINDOWS); }
export function useDrag() { return useGameChannel<DragPayload | null>('drag', null); }
export function useTooltip(content: ReactNode) {
  const id = useId(); const api = useInteractions(); const { settings } = useUiSettings();
  const current = useGameChannel<TooltipState | null>('tooltip', null);
  return { 'aria-describedby': current?.id === id ? id : undefined,
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => { if (settings.tooltips && content) api.tooltip({ id, content, anchor: e.currentTarget }, settings.tooltipDelay); },
    onMouseLeave: () => api.tooltip(null),
    onFocus: (e: React.FocusEvent<HTMLElement>) => { if (settings.tooltips && content) api.tooltip({ id, content, anchor: e.currentTarget }); },
    onBlur: () => api.tooltip(null),
  };
}
export function Notices() {
  const notices = useGameChannel('notices', EMPTY_NOTICES); const store = useGameStore();
  return <div className="sui-notices" aria-label="Notifications">{notices.map(notice => <div className="sui-notice" data-kind={notice.kind} key={notice.id} role={notice.kind === 'critical' ? 'alert' : 'status'}><span>{notice.kind === 'warning' || notice.kind === 'critical' ? '⚠ ' : ''}{notice.message}</span><button aria-label="Dismiss notification" onClick={() => store.publish('notices', notices.filter(n => n.id !== notice.id))}>×</button></div>)}</div>;
}
