import type { DragPayload, DropTarget, WindowAction, WindowGeometry, WindowRecord } from './contracts';
export const UI_LIMITS = Object.freeze({ windowWidth: 900, windowHeight: 620, minWidth: 340, minHeight: 260, margin: 12, origin: 64, tooltipDelay: 350, tooltipGap: 12, rowHeight: 64, overscan: 4, notificationLimit: 5, notificationMs: 6500, historyLimit: 100, chatLimit: 1000 });
export function createChannelStore(initial: Record<string, unknown> = {}) {
  const values = new Map(Object.entries(initial));
  const listeners = new Map<string, Set<() => void>>();
  return {
    get: (key: string): unknown => values.get(key),
    publish(key: string, value: unknown) {
      if (Object.is(values.get(key), value)) return;
      values.set(key, value); listeners.get(key)?.forEach(listener => listener());
    },
    subscribe(key: string, listener: () => void) {
      let bucket = listeners.get(key);
      if (!bucket) { bucket = new Set(); listeners.set(key, bucket); }
      bucket.add(listener); return () => { bucket?.delete(listener); };
    },
  };
}
export type ChannelStore = ReturnType<typeof createChannelStore>;
export function clampWindow(rect: WindowGeometry, viewport: { width: number; height: number }): WindowGeometry {
  const safe = (value: number, fallback: number) => Number.isFinite(value) ? value : fallback;
  const width = Math.min(Math.max(UI_LIMITS.minWidth, safe(rect.width, UI_LIMITS.windowWidth)), Math.max(1, viewport.width - UI_LIMITS.margin * 2));
  const height = Math.min(Math.max(UI_LIMITS.minHeight, safe(rect.height, UI_LIMITS.windowHeight)), Math.max(1, viewport.height - UI_LIMITS.margin * 2));
  return { width, height, x: Math.max(0, Math.min(safe(rect.x, UI_LIMITS.origin), viewport.width - width)), y: Math.max(0, Math.min(safe(rect.y, UI_LIMITS.origin), viewport.height - height)) };
}
export function windowReducer(state: WindowRecord[], action: WindowAction): WindowRecord[] {
  const old = state.find(w => w.id === action.id);
  const base: WindowRecord = old || { id: action.id, status: 'closed', x: UI_LIMITS.origin, y: UI_LIMITS.origin, width: UI_LIMITS.windowWidth, height: UI_LIMITS.windowHeight };
  let next = { ...base, ...action.geometry };
  if (action.type === 'toggle') next.status = base.status === 'closed' || base.status === 'minimized' ? 'opening' : 'closed';
  if (action.type === 'open') next = { ...next, status: 'opening', modal: action.modal ?? base.modal };
  if (action.type === 'close') next.status = 'closed';
  if (action.type === 'minimize' && !base.modal) next.status = 'minimized';
  if (action.type === 'move') next.status = 'dragging';
  if (action.type === 'resize') next.status = 'resizing';
  if (action.type === 'settle') next.status = 'open';
  const remaining = state.filter(w => w.id !== action.id);
  const modal = remaining.find(w => w.modal && w.status !== 'closed');
  if (modal && !next.modal) return [...remaining.filter(w => w !== modal), next, modal];
  return [...remaining, next];
}
export function validateDrop(payload: DragPayload, target: DropTarget) {
  if (!target.accepts.includes(payload.kind)) return { ok: false, message: 'Incompatible slot' };
  if (payload.revision !== undefined && target.revision !== undefined && payload.revision !== target.revision) return { ok: false, message: 'Contents changed. Pick up the item again.' };
  return { ok: true };
}
export function isTextInput(target: EventTarget | null) {
  return target instanceof HTMLElement && !!target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]');
}
