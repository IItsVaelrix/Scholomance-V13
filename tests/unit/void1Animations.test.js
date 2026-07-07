import { describe, it, expect } from 'vitest';
import { VOID1_ANIMATION_MANIFEST } from '../../src/data/void1Animations.js';

describe('void1Animations manifest', () => {
  it('declares finalized frame counts for all combat loops', () => {
    expect(VOID1_ANIMATION_MANIFEST.idle.frames).toBe(4);
    expect(VOID1_ANIMATION_MANIFEST.walk.frames).toBe(5);
    expect(VOID1_ANIMATION_MANIFEST.cast.frames).toBe(5);
    expect(VOID1_ANIMATION_MANIFEST.attack.frames).toBe(4);
  });

  it('marks one-shot abilities as non-looping', () => {
    expect(VOID1_ANIMATION_MANIFEST.idle.loop).toBe(true);
    expect(VOID1_ANIMATION_MANIFEST.walk.loop).toBe(true);
    expect(VOID1_ANIMATION_MANIFEST.cast.loop).toBe(false);
    expect(VOID1_ANIMATION_MANIFEST.attack.loop).toBe(false);
  });
});