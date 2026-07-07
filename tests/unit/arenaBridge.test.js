import { describe, expect, it, vi } from 'vitest';
import { bridgeArenaScene } from '../../src/pages/Combat/arenaBridge.js';

// Minimal Phaser-style EventEmitter stand-in.
function makeEmitter() {
  const listeners = new Map();
  return {
    on(event, fn) { (listeners.get(event) || listeners.set(event, []).get(event)).push(fn); },
    once(event, fn) {
      const wrap = (...args) => { this.off(event, wrap); fn(...args); };
      this.on(event, wrap);
    },
    off(event) { listeners.delete(event); },
    emit(event, ...args) { (listeners.get(event) || []).forEach((fn) => fn(...args)); },
  };
}

/**
 * Fake game reproducing the Phaser 4 boot race: scenes passed via config are
 * not in the keyed registry until the game's `ready` event fires, so
 * getScene() returns null synchronously at mount time.
 */
function makeBootingGame() {
  const sceneEvents = makeEmitter();
  const gameEvents = makeEmitter();
  let booted = false;
  gameEvents.on('ready', () => { booted = true; });
  return {
    isRunning: false,
    events: gameEvents,
    scene: { getScene: () => (booted ? { events: sceneEvents } : null) },
    _sceneEvents: sceneEvents,
    _gameEvents: gameEvents,
  };
}

describe('bridgeArenaScene', () => {
  it('does NOT attach at mount time (getScene is null before ready) — the bug', () => {
    const game = makeBootingGame();
    const handler = vi.fn();
    const onSpy = vi.spyOn(game._sceneEvents, 'on');

    bridgeArenaScene(game, 'CombatArenaScene', handler);

    expect(onSpy).not.toHaveBeenCalled(); // nothing to attach to yet
  });

  it('attaches tile-inspect/tile-error once the game becomes ready — the fix', () => {
    const game = makeBootingGame();
    const handler = vi.fn();

    bridgeArenaScene(game, 'CombatArenaScene', handler);
    game._gameEvents.emit('ready'); // scene now registered

    game._sceneEvents.emit('tile-inspect', { type: 'inspect', tx: 3, ty: 4, screenX: 120, screenY: 80 });
    game._sceneEvents.emit('tile-error', { type: 'error', text: 'boom' });

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenNthCalledWith(1, expect.objectContaining({ type: 'inspect', tx: 3, ty: 4 }));
    expect(handler).toHaveBeenNthCalledWith(2, expect.objectContaining({ type: 'error' }));
  });

  it('wires immediately when the game is already running (fast remount)', () => {
    const sceneEvents = makeEmitter();
    const game = {
      isRunning: true,
      events: makeEmitter(),
      scene: { getScene: () => ({ events: sceneEvents }) },
    };
    const handler = vi.fn();

    bridgeArenaScene(game, 'CombatArenaScene', handler);
    sceneEvents.emit('tile-inspect', { type: 'inspect' });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('is a safe no-op when the scene never resolves', () => {
    const game = {
      isRunning: true,
      events: makeEmitter(),
      scene: { getScene: () => null },
    };
    expect(() => bridgeArenaScene(game, 'CombatArenaScene', vi.fn())).not.toThrow();
  });
});
