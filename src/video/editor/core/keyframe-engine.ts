/**
 * Universal keyframe engine for Scholomance Remotion Forge.
 * Deterministic. Frame-based. No wall time.
 * Easing and interpolation are pure.
 */

export type Easing =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'hold'
  | 'spring'
  | 'bounce'
  | 'customBezier';

export interface Keyframe {
  frame: number;
  value: number;
  easing: Easing;
  bezier?: [number, number, number, number];
  interpolation?: 'number' | 'angle' | 'color' | 'vector';
}

export interface EvaluateOptions {
  defaultValue: number;
  interpolation?: 'number' | 'angle';
}

function applyEasing(t: number, easing: Easing, bezier?: [number, number, number, number]): number {
  switch (easing) {
    case 'linear':
      return t;
    case 'easeIn':
      return t * t;
    case 'easeOut':
      return 1 - (1 - t) * (1 - t);
    case 'easeInOut':
      return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    case 'hold':
      return 0; // caller decides to hold previous
    case 'spring': {
      // Very light spring approximation (deterministic, overshoot small)
      const s = Math.sin((t - 0.1) * Math.PI * 2.2) * (1 - t) * 0.2;
      return t + s;
    }
    case 'bounce': {
      const n1 = 7.5625;
      const d1 = 2.75;
      let tt = t;
      if (tt < 1 / d1) {
        return n1 * tt * tt;
      } else if (tt < 2 / d1) {
        tt -= 1.5 / d1;
        return n1 * tt * tt + 0.75;
      } else if (tt < 2.5 / d1) {
        tt -= 2.25 / d1;
        return n1 * tt * tt + 0.9375;
      }
      tt -= 2.625 / d1;
      return n1 * tt * tt + 0.984375;
    }
    case 'customBezier': {
      if (!bezier || bezier.length !== 4) return t;
      // Extremely small cubic bezier approx (P1x, P1y, P2x, P2y)
      const [x1, y1, x2, y2] = bezier;
      // Simple iterative solve for x(t) ~ u
      let u = t;
      for (let i = 0; i < 5; i++) {
        const x = 3 * u * (1 - u) * (1 - u) * x1 + 3 * u * u * (1 - u) * x2 + u * u * u;
        const dx = x - t;
        if (Math.abs(dx) < 0.001) break;
        u -= dx * 0.5;
      }
      const y = 3 * u * (1 - u) * (1 - u) * y1 + 3 * u * u * (1 - u) * y2 + u * u * u;
      return y;
    }
    default:
      return t;
  }
}

function normalizeAngle(a: number): number {
  // Keep in -180..180 or 0..360 range for clean interpolation
  let r = a % 360;
  if (r > 180) r -= 360;
  if (r < -180) r += 360;
  return r;
}

export function evaluateKeyframes(
  keyframes: Keyframe[] | undefined,
  frame: number,
  opts: EvaluateOptions
): number {
  const kfs = (keyframes ?? []).slice().sort((a, b) => a.frame - b.frame);
  if (kfs.length === 0) return opts.defaultValue;

  if (frame <= kfs[0].frame) {
    return kfs[0].value;
  }
  const last = kfs[kfs.length - 1];
  if (frame >= last.frame) {
    return last.value;
  }

  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (frame >= a.frame && frame <= b.frame) {
      if (a.easing === 'hold') {
        return a.value;
      }
      const span = Math.max(1, b.frame - a.frame);
      const t = (frame - a.frame) / span;

      let vA = a.value;
      let vB = b.value;

      const interp = opts.interpolation ?? a.interpolation ?? 'number';
      if (interp === 'angle') {
        vA = normalizeAngle(vA);
        vB = normalizeAngle(vB);
        // shortest path
        const diff = vB - vA;
        if (diff > 180) vB -= 360;
        if (diff < -180) vB += 360;
      }

      const eased = applyEasing(t, a.easing, a.bezier);
      return vA + (vB - vA) * eased;
    }
  }
  return last.value;
}

export function getValueAtFrame(
  anim: { defaultValue: number; keyframes?: Keyframe[] },
  frame: number,
  interpolation?: 'number' | 'angle'
): number {
  return evaluateKeyframes(anim.keyframes, frame, {
    defaultValue: anim.defaultValue,
    interpolation,
  });
}
