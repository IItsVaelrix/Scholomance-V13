import { describe, it, expect, vi } from 'vitest';
import { createChannelStore, clampWindow, windowReducer, validateDrop } from '../../../src/lib/mmorpg/state';

describe('MMORPG presentation boundaries', () => {
  it('combat publication does not notify inventory subscribers', () => {
    const store = createChannelStore({ combat: null, inventory: { slots: [] } });
    const listener = vi.fn();
    store.subscribe('inventory', listener);
    store.publish('combat', { hp: 10 });
    expect(listener).not.toHaveBeenCalled();
    expect(store.get('combat')).toEqual({ hp: 10 });
  });
  it('unchanged publication is silent and unsubscribe works', () => {
    const store = createChannelStore({ value: 1 });
    const listener = vi.fn(); const off = store.subscribe('value', listener);
    store.publish('value', 1); expect(listener).not.toHaveBeenCalled();
    off(); store.publish('value', 2); expect(listener).not.toHaveBeenCalled();
  });
  it('clamps oversized persisted windows at Steam Deck bounds', () => {
    const result = clampWindow({ x: 1800, y: -20, width: 1700, height: 1000 }, { width: 1280, height: 800 });
    expect(result.x).toBeGreaterThanOrEqual(0); expect(result.y).toBeGreaterThanOrEqual(0);
    expect(result.x + result.width).toBeLessThanOrEqual(1280);
    expect(result.y + result.height).toBeLessThanOrEqual(800);
  });
  it('closing top window restores underlying window order', () => {
    let state = windowReducer([], { type: 'open', id: 'inventory' });
    state = windowReducer(state, { type: 'open', id: 'character' });
    state = windowReducer(state, { type: 'close', id: 'character' });
    expect(state.filter(w => w.status !== 'closed').map(w => w.id)).toEqual(['inventory']);
  });
  it('rejects stale drags and incompatible socket types', () => {
    const payload = { kind: 'item' as const, id: 'a', source: 'inventory', index: 0, revision: 3 };
    expect(validateDrop(payload, { kind: 'equipment', accepts: ['ability'], revision: 3 }).ok).toBe(false);
    expect(validateDrop(payload, { kind: 'equipment', accepts: ['item'], revision: 4 }).ok).toBe(false);
    expect(validateDrop(payload, { kind: 'equipment', accepts: ['item'], revision: 3 }).ok).toBe(true);
  });
});
