import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  peekSceneContext,
  requestSceneContext,
  setLatestSceneContext,
} from '../../../src/game/combat/sceneContextBridge.js';

describe('sceneContextBridge', () => {
  beforeEach(() => {
    setLatestSceneContext(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the freshest snapshot from a request/response cycle', async () => {
    vi.useFakeTimers();
    const snapshot = {
      sceneId: 'combat-arena',
      casterId: 'player',
      targets: [],
    };

    const promise = requestSceneContext({ timeoutMs: 50 });
    window.dispatchEvent(new CustomEvent('scene-context-state', { detail: snapshot }));
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toEqual(snapshot);
    expect(peekSceneContext()).toEqual(snapshot);
  });

  it('falls back to the last known snapshot when the arena does not answer', async () => {
    vi.useFakeTimers();
    const stale = {
      sceneId: 'combat-arena',
      casterId: 'player',
      targets: [{ id: 'dummy', label: 'Dummy', kind: 'combatant', weaveObjects: ['FLESH'], inRange: true }],
    };
    setLatestSceneContext(stale);

    const promise = requestSceneContext({ timeoutMs: 20 });
    await vi.runAllTimersAsync();

    await expect(promise).resolves.toEqual(stale);
  });
});