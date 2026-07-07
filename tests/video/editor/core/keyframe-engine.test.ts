import { describe, it, expect } from 'vitest';
import { evaluateKeyframes, getValueAtFrame, type Keyframe } from '../../../../src/video/editor/core/keyframe-engine';

describe('keyframe-engine', () => {
  it('should return defaultValue if no keyframes exist', () => {
    expect(evaluateKeyframes([], 10, { defaultValue: 100 })).toBe(100);
    expect(evaluateKeyframes(undefined, 10, { defaultValue: 100 })).toBe(100);
  });

  it('should clamp to first keyframe if playhead is before it', () => {
    const kfs: Keyframe[] = [
      { frame: 10, value: 50, easing: 'linear' },
      { frame: 20, value: 100, easing: 'linear' }
    ];
    expect(evaluateKeyframes(kfs, 5, { defaultValue: 0 })).toBe(50);
  });

  it('should clamp to last keyframe if playhead is after it', () => {
    const kfs: Keyframe[] = [
      { frame: 10, value: 50, easing: 'linear' },
      { frame: 20, value: 100, easing: 'linear' }
    ];
    expect(evaluateKeyframes(kfs, 25, { defaultValue: 0 })).toBe(100);
  });

  it('should interpolate linearly between keyframes', () => {
    const kfs: Keyframe[] = [
      { frame: 10, value: 50, easing: 'linear' },
      { frame: 20, value: 100, easing: 'linear' }
    ];
    expect(evaluateKeyframes(kfs, 15, { defaultValue: 0 })).toBe(75);
    expect(evaluateKeyframes(kfs, 12, { defaultValue: 0 })).toBe(60);
  });

  it('should handle hold easing correctly', () => {
    const kfs: Keyframe[] = [
      { frame: 10, value: 50, easing: 'hold' },
      { frame: 20, value: 100, easing: 'linear' }
    ];
    expect(evaluateKeyframes(kfs, 15, { defaultValue: 0 })).toBe(50);
    expect(evaluateKeyframes(kfs, 19, { defaultValue: 0 })).toBe(50);
    expect(evaluateKeyframes(kfs, 20, { defaultValue: 0 })).toBe(100);
  });

  it('should correctly normalize angles for shortest path', () => {
    const kfs: Keyframe[] = [
      { frame: 0, value: 10, easing: 'linear' },
      { frame: 10, value: 350, easing: 'linear' }
    ];
    // Interpolating normally between 10 and 350 would hit 180 at frame 5.
    // Shortest path interpolation should hit 0 at frame 5.
    const v = evaluateKeyframes(kfs, 5, { defaultValue: 0, interpolation: 'angle' });
    expect(Math.abs(v)).toBe(0); 
  });

  describe('getValueAtFrame', () => {
    it('wraps evaluateKeyframes correctly', () => {
      const anim = {
        defaultValue: 42,
        keyframes: [
          { frame: 0, value: 0, easing: 'linear' as const },
          { frame: 10, value: 100, easing: 'linear' as const }
        ]
      };
      expect(getValueAtFrame(anim, 5)).toBe(50);
    });
  });
});
