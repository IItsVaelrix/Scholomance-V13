import { describe, expect, it } from 'vitest';
import {
  getTransitionTimeline,
  resolveTransitionMode,
  getActivePhase,
} from '../../../src/phaser/battle-transition.fx.js';

describe('battle-transition.fx', () => {
  it('full transition lasts 3000ms (PDR §6.1)', () => {
    expect(getTransitionTimeline('full').totalDurationMs).toBe(3000);
  });

  it('compressed transition lasts 800ms', () => {
    expect(getTransitionTimeline('compressed').totalDurationMs).toBe(800);
  });

  it('resolveTransitionMode returns compressed on repeat battles', () => {
    expect(resolveTransitionMode({ battleCount: 2 })).toBe('compressed');
    expect(resolveTransitionMode({ battleCount: 0 })).toBe('full');
    expect(resolveTransitionMode({ battleCount: 5, isBoss: true })).toBe('full');
  });

  it('getActivePhase returns grid_reveal at T+2200ms full mode', () => {
    const phase = getActivePhase(2200, 'full');
    expect(phase?.id).toBe('grid_reveal');
  });
});