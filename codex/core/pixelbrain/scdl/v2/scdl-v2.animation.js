/**
 * SCDL v2 Step 4 — mathematical animation sampling.
 *
 * A TIMELINE is time-dependent mathematics compiled to a FINITE sample table.
 * Nothing here runs at asset playback time: the compiler evaluates every frame
 * once, rasterizes it, and emits an immutable packet per frame. SCDL source
 * never ships into a game runtime.
 *
 * Per-frame evaluation order (architecture spec §14):
 *
 *   timeline time -> formulas and keyframes -> symbolic transforms and geometry
 *     -> masks and booleans -> rasterization -> layer compositing
 *     -> immutable frame packet
 *
 * This module owns the first two steps and the transform application; the
 * compiler then hands each derived construction back through the existing
 * rasterizer and compositor unchanged, so an animated frame is rasterized by
 * exactly the same code path as a static one.
 *
 * Determinism: easing curves are versioned (EASING_VERSION) and their floating
 * point results are quantized to 1e9 before re-entering rational space, matching
 * the precedent the geometry kernel already sets for non-cardinal angles. Two
 * runs of the same program produce byte-identical sample tables.
 */

import {
  makeRational, mulRational, addRational, subRational, divRational,
  rationalToString, rationalToNumber, compareRational,
} from './scdl-v2.rational.js';
import { EASING_CURVES, EASING_VERSION, ANIMATION_CODES } from './scdl-v2.types.js';
export { EASING_CURVES, EASING_VERSION };
import {
  createAngle, translateTransform, rotateTransform, scaleTransform,
  composeTransforms, applyTransformToShape,
} from './scdl-v2.transforms.js';
import { computeBounds } from './scdl-v2.geometry.js';
import { evaluateTrackFormula } from './scdl-v2.analyzer.js';

// Easing results are quantized to this denominator before returning to exact
// rational space, so a sample table has a stable identity across runs.
const EASING_QUANTUM = 1000000000n;

const R_0 = makeRational(0);
const R_1 = makeRational(1);
const R_HALF = makeRational(1, 2);

function quantizeEased(value) {
  if (!Number.isFinite(value)) return R_0;
  const clamped = Math.min(1, Math.max(0, value));
  const scaled = Math.round(clamped * Number(EASING_QUANTUM));
  return makeRational(BigInt(scaled), EASING_QUANTUM);
}

/**
 * Versioned deterministic easing curves. `t` and the result are both in [0, 1].
 * Changing any of these mathematics is a language-version change, not a patch:
 * the curve name is part of program identity.
 */
export const EASING_FUNCTIONS = Object.freeze({
  LINEAR: (t) => t,
  STEP: (t) => (t < 1 ? 0 : 1),
  SINE_IN: (t) => 1 - Math.cos((t * Math.PI) / 2),
  SINE_OUT: (t) => Math.sin((t * Math.PI) / 2),
  SINE_IN_OUT: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  QUAD_IN: (t) => t * t,
  QUAD_OUT: (t) => 1 - (1 - t) * (1 - t),
  QUAD_IN_OUT: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  CUBIC_IN: (t) => t * t * t,
  CUBIC_OUT: (t) => 1 - Math.pow(1 - t, 3),
  CUBIC_IN_OUT: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  SMOOTHSTEP: (t) => t * t * (3 - 2 * t),
});

/** Apply a named easing curve to a normalized rational t, returning a rational. */
export function applyEasing(curve, tRational) {
  const name = EASING_CURVES.includes(curve) ? curve : 'LINEAR';
  const t = Math.min(1, Math.max(0, rationalToNumber(tRational)));
  return quantizeEased(EASING_FUNCTIONS[name](t));
}

function isNumericType(type) {
  return type === 'I32' || type === 'FIXED' || type === 'RATIO' || type === 'PX';
}

function parseHexColor(hex) {
  const raw = String(hex || '').replace('#', '');
  const body = raw.length === 8 ? raw.slice(0, 6) : raw;
  if (body.length !== 6) return null;
  const int = Number.parseInt(body, 16);
  if (!Number.isFinite(int)) return null;
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function toHexColor(r, g, b) {
  const clamp = (v) => Math.min(255, Math.max(0, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Interpolate two resolved analyzer values by an exact rational t.
 *
 * Type rules mirror the rest of the compiler: numerics lerp in rational space
 * and keep their unit, colors lerp per channel in integer space, booleans step
 * (a visibility flip is never a blend), and angles lerp their turn count.
 */
export function lerpResolvedValue(a, b, t) {
  if (!a || !b) return a || b || null;
  if (a.type !== b.type) return a;

  switch (a.type) {
    case 'BOOL':
      // Step, never blend: compareRational(t, half) >= 0 picks the later value.
      return compareRational(t, R_HALF) < 0 ? a : b;

    case 'COLOR': {
      const from = parseHexColor(a.value);
      const to = parseHexColor(b.value);
      if (!from || !to) return a;
      const f = rationalToNumber(t);
      return Object.freeze({
        type: 'COLOR',
        value: toHexColor(
          from.r + (to.r - from.r) * f,
          from.g + (to.g - from.g) * f,
          from.b + (to.b - from.b) * f,
        ),
      });
    }

    case 'ANGLE': {
      const turns = addRational(a.value.turns, mulRational(subRational(b.value.turns, a.value.turns), t));
      return Object.freeze({ type: 'ANGLE', value: createAngle(turns, 'TURNS') });
    }

    case 'I32': {
      const mixed = addRational(
        makeRational(BigInt(a.value)),
        mulRational(makeRational(BigInt(b.value - a.value)), t),
      );
      const rounded = Number(roundHalfUp(mixed));
      return Object.freeze({ type: 'I32', value: rounded });
    }

    case 'PX':
    case 'FIXED':
    case 'RATIO': {
      const mixed = addRational(a.value, mulRational(subRational(b.value, a.value), t));
      return Object.freeze({ type: a.type, value: mixed });
    }

    default:
      return a;
  }
}

function roundHalfUp(rational) {
  const numerator = 2n * BigInt(rational.numerator) + BigInt(rational.denominator);
  const denominator = 2n * BigInt(rational.denominator);
  return numerator / denominator;
}

/** Time symbols bound inside a FORMULA for one frame. */
export function buildTimeBindings(frameIndex, frameCount, fps) {
  const span = frameCount > 1 ? frameCount - 1 : 1;
  const normalized = makeRational(BigInt(frameIndex), BigInt(span));
  const seconds = makeRational(BigInt(frameIndex), BigInt(fps));
  return Object.freeze({
    $frame: Object.freeze({ type: 'I32', value: frameIndex }),
    $time: Object.freeze({ type: 'RATIO', value: seconds }),
    $time_normalized: Object.freeze({ type: 'RATIO', value: normalized }),
    $t: Object.freeze({ type: 'RATIO', value: normalized }),
  });
}

/**
 * Sample one track at one integer tick.
 *
 * A FORMULA track is re-evaluated from its preserved AST with the time symbols
 * bound. A KEYFRAME track finds the bracketing pair and interpolates through
 * the later keyframe's easing curve; before the first keyframe the value holds,
 * after the last it holds too, so a timeline never extrapolates off its end.
 */
export function sampleTrackValue(track, tick, timeline, frameIndex) {
  if (track.formula) {
    const bindings = buildTimeBindings(frameIndex, timeline.frameCount, timeline.fps);
    const result = evaluateTrackFormula(track.formula.node, timeline.scopeSnapshot, bindings);
    return result.ok ? result.value : null;
  }

  const rows = track.keyframes;
  if (!rows || rows.length === 0) return null;
  if (rows.length === 1) return rows[0].value;
  if (tick <= rows[0].tick) return rows[0].value;

  const last = rows[rows.length - 1];
  if (tick >= last.tick) return last.value;

  for (let i = 0; i < rows.length - 1; i += 1) {
    const from = rows[i];
    const to = rows[i + 1];
    if (tick >= from.tick && tick <= to.tick) {
      const spanTicks = to.tick - from.tick;
      if (spanTicks <= 0) return to.value;
      const localT = makeRational(BigInt(tick - from.tick), BigInt(spanTicks));
      // The easing curve belongs to the keyframe being travelled TOWARD.
      const eased = applyEasing(to.easing, localT);
      return lerpResolvedValue(from.value, to.value, eased);
    }
  }
  return last.value;
}

/**
 * Sample every track of a timeline at one frame index.
 *
 * @returns {Map<string, Map<string, object>>} layerId -> property -> resolved value
 */
export function sampleTimelineFrame(timeline, frameIndex) {
  const tick = frameIndex;
  const byLayer = new Map();
  for (const track of timeline.tracks) {
    const value = sampleTrackValue(track, tick, timeline, frameIndex);
    if (!value) continue;
    if (!byLayer.has(track.target)) byLayer.set(track.target, new Map());
    byLayer.get(track.target).set(track.property, value);
  }
  return byLayer;
}

function layerPivot(layer) {
  // Rotation and scale pivot about the layer's own painted bounds centre, so a
  // limb swings about itself rather than about the canvas origin. Authors place
  // the layer's geometry to choose the effective joint.
  let minX = null;
  let minY = null;
  let maxX = null;
  let maxY = null;
  for (const paint of layer.paints || []) {
    if (!paint || !paint.shape) continue;
    let bounds;
    try {
      bounds = computeBounds(paint.shape);
    } catch (_error) {
      continue;
    }
    if (!bounds) continue;
    const x0 = bounds.x;
    const y0 = bounds.y;
    const x1 = addRational(bounds.x, bounds.width);
    const y1 = addRational(bounds.y, bounds.height);
    minX = minX === null ? x0 : (compareRational(x0, minX) < 0 ? x0 : minX);
    minY = minY === null ? y0 : (compareRational(y0, minY) < 0 ? y0 : minY);
    maxX = maxX === null ? x1 : (compareRational(x1, maxX) > 0 ? x1 : maxX);
    maxY = maxY === null ? y1 : (compareRational(y1, maxY) > 0 ? y1 : maxY);
  }
  if (minX === null) return null;
  return Object.freeze({
    x: mulRational(addRational(minX, maxX), R_HALF),
    y: mulRational(addRational(minY, maxY), R_HALF),
  });
}

function buildLayerTransform(values, pivot) {
  let transform = null;

  const dx = values.get('TRANSFORM_X');
  const dy = values.get('TRANSFORM_Y');
  if (dx || dy) {
    const offsetX = dx && isNumericType(dx.type) ? dx.value : R_0;
    const offsetY = dy && isNumericType(dy.type) ? dy.value : R_0;
    transform = translateTransform(Object.freeze({ x: offsetX, y: offsetY }));
  }

  const rotation = values.get('ROTATION');
  if (rotation) {
    let angle = null;
    if (rotation.type === 'ANGLE') {
      angle = rotation.value;
    } else if (isNumericType(rotation.type)) {
      // A numeric rotation track is authored in degrees.
      angle = createAngle(rotation.value, 'DEGREES');
    }
    if (angle) {
      const rotate = rotateTransform(angle, pivot ? { x: pivot.x, y: pivot.y } : null);
      transform = transform ? composeTransforms(transform, rotate) : rotate;
    }
  }

  const scale = values.get('SCALE');
  if (scale && isNumericType(scale.type)) {
    const scaled = scaleTransform(scale.value, scale.value, pivot ? { x: pivot.x, y: pivot.y } : null);
    transform = transform ? composeTransforms(transform, scaled) : scaled;
  }

  return transform;
}

/**
 * Derive one frame's construction from the base construction plus sampled track
 * values. Pure: the input construction is never mutated, and a frame with no
 * tracks affecting a layer returns that layer untouched.
 */
export function applyFrameToConstruction(construction, frameValues) {
  const layers = Array.isArray(construction?.layers) ? construction.layers : [];
  if (!frameValues || frameValues.size === 0) return construction;

  const nextLayers = layers.map((layer) => {
    const values = frameValues.get(layer.id);
    if (!values || values.size === 0) return layer;

    const patch = {};

    const opacity = values.get('OPACITY');
    if (opacity && isNumericType(opacity.type)) {
      patch.opacity = Math.min(1, Math.max(0, rationalToNumber(opacity.value)));
    }

    const visible = values.get('VISIBLE');
    if (visible && visible.type === 'BOOL') patch.visible = visible.value;

    const order = values.get('ORDER');
    if (order && order.type === 'I32') patch.order = order.value;

    const fill = values.get('FILL');
    const transform = buildLayerTransform(values, layerPivot(layer));

    let paints = layer.paints;
    if (transform || (fill && fill.type === 'COLOR')) {
      paints = (layer.paints || []).map((paint) => {
        const next = { ...paint };
        if (transform && paint.shape) {
          next.shape = applyTransformToShape(transform, paint.shape);
        }
        if (fill && fill.type === 'COLOR') next.fill = fill.value;
        return Object.freeze(next);
      });
      patch.paints = Object.freeze(paints);
    }

    return Object.freeze({ ...layer, ...patch });
  });

  // ORDER tracks can re-sort painter order; keep the compositor's contract that
  // layers are consumed in ascending order.
  const sorted = [...nextLayers].sort((a, b) => (a.order || 0) - (b.order || 0));
  return Object.freeze({ layers: Object.freeze(sorted) });
}

/**
 * Sample an entire timeline into a finite table of derived constructions.
 *
 * Frame count is decided by the analyzer: a seamless loop excludes its duplicate
 * endpoint, a one-shot includes the final pose.
 */
export function sampleTimeline(timeline, construction) {
  const frames = [];
  for (let index = 0; index < timeline.frameCount; index += 1) {
    const values = sampleTimelineFrame(timeline, index);
    frames.push(Object.freeze({
      index,
      tick: index,
      timeMs: Math.round((index * 1000) / timeline.fps),
      durationMs: Math.round(1000 / timeline.fps),
      trackValues: Object.freeze([...values.entries()].map(([layerId, props]) => Object.freeze({
        layerId,
        properties: Object.freeze([...props.entries()].map(([property, value]) => Object.freeze({
          property,
          type: value.type,
          value: value.type === 'COLOR' || value.type === 'BOOL' || value.type === 'I32'
            ? value.value
            : rationalToString(isNumericType(value.type) ? value.value : R_0),
        }))),
      }))),
      construction: applyFrameToConstruction(construction, values),
    }));
  }
  return Object.freeze(frames);
}

/**
 * Build the SCDL-PACKAGE-v2 animation manifest: the durable mathematical
 * description exporters consume, independent of any raster.
 */
export function buildAnimationManifest(timelines, clips) {
  if (!timelines || timelines.length === 0) return null;
  return Object.freeze({
    contract: 'SCDL-ANIMATION-v2',
    easingVersion: EASING_VERSION,
    timelines: Object.freeze(timelines.map((timeline) => Object.freeze({
      id: timeline.id,
      fps: timeline.fps,
      durationTicks: timeline.durationTicks,
      frameCount: timeline.frameCount,
      loop: timeline.loop,
      poses: timeline.poses,
      tracks: Object.freeze(timeline.tracks.map((track) => Object.freeze({
        target: track.target,
        property: track.property,
        pose: track.pose,
        driver: track.formula ? 'FORMULA' : 'KEYFRAME',
        keyframeCount: track.keyframes.length,
        keyframes: Object.freeze(track.keyframes.map((row) => Object.freeze({
          tick: row.tick,
          easing: row.easing,
          type: row.value.type,
        }))),
      }))),
      events: timeline.events,
      variants: timeline.variants,
    }))),
    clips: Object.freeze((clips || []).map((clip) => Object.freeze({ ...clip }))),
  });
}

export const ANIMATION_SAMPLE_CODES = ANIMATION_CODES;
