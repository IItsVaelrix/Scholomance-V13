import { describe, expect, it, vi } from 'vitest';
import {
  DEFEATED_ENEMY_DISAPPEAR_MS,
  destroyPortalWardenEffect,
  destroySentinelTorchEffect,
} from '../../../src/game/combat/defeatedEnemyCleanup.js';

describe('defeatedEnemyCleanup', () => {
  it('uses a ten second disappear delay', () => {
    expect(DEFEATED_ENEMY_DISAPPEAR_MS).toBe(10_000);
  });

  it('destroys sentinel torch layers', () => {
    const bobContainer = { destroy: vi.fn() };
    const shadow = { destroy: vi.fn() };
    const ambient = { destroy: vi.fn() };
    destroySentinelTorchEffect({ bobContainer, shadow, ambient });
    expect(bobContainer.destroy).toHaveBeenCalledWith(true);
    expect(shadow.destroy).toHaveBeenCalled();
    expect(ambient.destroy).toHaveBeenCalled();
  });

  it('destroys portal warden container', () => {
    const container = { destroy: vi.fn() };
    destroyPortalWardenEffect({ container });
    expect(container.destroy).toHaveBeenCalledWith(true);
  });
});