import { describe, expect, it } from 'vitest';
import {
  SHADOW_DELTA_EPSILON,
  diffShadowField,
} from '../../src/lib/photonic-retina/retina-shadow-field.js';

describe('diffShadowField', () => {
  it('flags cells whose lighting changed beyond epsilon', () => {
    const prev = [0.10, 0.50, 0.90];
    const curr = [0.10, 0.80, 0.90];
    expect(Array.from(diffShadowField(prev, curr))).toEqual([0, 1, 0]);
  });

  it('ignores sub-epsilon jitter', () => {
    const prev = [0.5];
    const curr = [0.5 + (SHADOW_DELTA_EPSILON / 2)];
    expect(Array.from(diffShadowField(prev, curr))).toEqual([0]);
  });

  it('treats null prev as first-tick full change', () => {
    expect(Array.from(diffShadowField(null, [0.1, 0.2]))).toEqual([1, 1]);
  });

  it('attends cells with missing/non-finite current values (fail-safe)', () => {
    expect(Array.from(diffShadowField([0.1, 0.2], [0.1, undefined]))).toEqual([0, 1]);
    expect(Array.from(diffShadowField([0.1, 0.2], [0.1, NaN]))).toEqual([0, 1]);
  });
});
