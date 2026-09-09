/**
 * Tutorial Forest — Shared Wind Field
 *
 * One clock, one direction, one gust wave for the entire forest. Every tree
 * samples this same field, so at any instant the whole canopy leans coherently:
 * a west wind shifts every crown to the left, an east wind to the right.
 *
 * Why this exists: the previous sway gave each tree a private oscillator phase
 * derived from its tile coordinates (`tx * 0.4 + ty * 0.7`). Neighbouring trees
 * therefore leaned in OPPOSITE directions at the same moment — twenty-four
 * independent metronomes rather than one wind. That reads as broken, not alive.
 *
 * The model is a prevailing lean plus a traveling gust wave:
 *
 *   lean(t, tx, ty) = direction * (meanLean + gustAmplitude * sin(phase))
 *   phase = TAU * (t / gustPeriod) - TAU * ((tx*axisX + ty*axisY) / wavelength)
 *
 * Two properties matter for immersion and both are enforced by construction:
 *
 * 1. `gustAmplitude < meanLean`, so the sine term can never flip the sign of the
 *    lean. Trees breathe and ripple but never swing past vertical to the other
 *    side — the wind keeps blowing the way the wind is blowing.
 * 2. `wavelength` spans many tiles, so the spatial term is a slow ripple moving
 *    across the forest (you can watch a gust travel) instead of per-tree noise.
 *
 * Angles are in degrees, Phaser screen convention: negative leans the crown
 * left (west), positive leans it right (east).
 */

const TAU = Math.PI * 2;

/**
 * Compass presets. `axis` is the tile-space direction the gust wave travels
 * along; `sign` orients the crown lean on screen.
 */
export const WIND_DIRECTIONS = Object.freeze({
  WEST: Object.freeze({ label: 'west', sign: -1, axis: Object.freeze({ x: -1, y: 0 }) }),
  EAST: Object.freeze({ label: 'east', sign: 1, axis: Object.freeze({ x: 1, y: 0 }) }),
  NORTH_WEST: Object.freeze({ label: 'north-west', sign: -1, axis: Object.freeze({ x: -1, y: -1 }) }),
  NORTH_EAST: Object.freeze({ label: 'north-east', sign: 1, axis: Object.freeze({ x: 1, y: -1 }) }),
  SOUTH_WEST: Object.freeze({ label: 'south-west', sign: -1, axis: Object.freeze({ x: -1, y: 1 }) }),
  SOUTH_EAST: Object.freeze({ label: 'south-east', sign: 1, axis: Object.freeze({ x: 1, y: 1 }) }),
});

export const WIND_FIELD_DEFAULTS = Object.freeze({
  direction: 'WEST',
  // Prevailing lean at the crown. Subtle: on a 96px sprite this is ~0.9px.
  meanLeanDeg: 0.55,
  // Gust modulation. Held strictly below meanLeanDeg so direction never inverts.
  gustAmplitudeDeg: 0.25,
  // One slow breath of wind across the whole glade.
  gustPeriodMs: 5200,
  // Tiles per gust wavelength. Large => neighbours stay nearly in phase.
  wavelengthTiles: 14,
});

function resolveDirection(direction) {
  const key = String(direction ?? WIND_FIELD_DEFAULTS.direction).toUpperCase().replace(/\s+/g, '_');
  const normalized = key.replace(/^WIND_/, '');
  return WIND_DIRECTIONS[normalized] || WIND_DIRECTIONS[WIND_FIELD_DEFAULTS.direction];
}

/**
 * Create an immutable wind field. Amplitude is clamped below the mean lean so a
 * caller cannot accidentally configure trees that swing through vertical.
 */
export function createWindField(options = {}) {
  const direction = resolveDirection(options.direction);
  const meanLeanDeg = Number.isFinite(options.meanLeanDeg)
    ? Math.abs(options.meanLeanDeg)
    : WIND_FIELD_DEFAULTS.meanLeanDeg;
  const requestedGust = Number.isFinite(options.gustAmplitudeDeg)
    ? Math.abs(options.gustAmplitudeDeg)
    : WIND_FIELD_DEFAULTS.gustAmplitudeDeg;
  // Enforce invariant (1): the gust may never exceed the prevailing lean.
  const gustAmplitudeDeg = Math.min(requestedGust, meanLeanDeg * 0.9);
  const gustPeriodMs = Number.isFinite(options.gustPeriodMs) && options.gustPeriodMs > 0
    ? options.gustPeriodMs
    : WIND_FIELD_DEFAULTS.gustPeriodMs;
  const wavelengthTiles = Number.isFinite(options.wavelengthTiles) && options.wavelengthTiles > 0
    ? options.wavelengthTiles
    : WIND_FIELD_DEFAULTS.wavelengthTiles;

  return Object.freeze({
    contract: 'PB-TUTORIAL-FOREST-WIND-FIELD-v1',
    direction: direction.label,
    sign: direction.sign,
    axis: direction.axis,
    meanLeanDeg,
    gustAmplitudeDeg,
    gustPeriodMs,
    wavelengthTiles,
    maxLeanDeg: meanLeanDeg + gustAmplitudeDeg,
  });
}

/**
 * Sample the shared lean angle for one tree at one instant.
 *
 * `tx`/`ty` only shift the tree along the traveling gust wave; they never give
 * it an independent clock. Two trees sampled at the same `timeMs` always lean
 * the same direction.
 *
 * @returns {number} lean in degrees, Phaser screen convention.
 */
export function sampleWindLean(field, timeMs, tx = 0, ty = 0) {
  if (!field) return 0;
  const safeTime = Number.isFinite(timeMs) ? timeMs : 0;
  const spatial = (Number.isFinite(tx) ? tx : 0) * field.axis.x
    + (Number.isFinite(ty) ? ty : 0) * field.axis.y;
  const phase = TAU * (safeTime / field.gustPeriodMs) - TAU * (spatial / field.wavelengthTiles);
  const lean = field.meanLeanDeg + field.gustAmplitudeDeg * Math.sin(phase);
  return field.sign * lean;
}

/**
 * Normalized gust intensity in [0, 1] for the whole forest at one instant —
 * shared by every shader so the GPU and CPU paths breathe together.
 */
export function sampleWindIntensity(field, timeMs) {
  if (!field || field.gustAmplitudeDeg <= 0) return 1;
  const safeTime = Number.isFinite(timeMs) ? timeMs : 0;
  const phase = TAU * (safeTime / field.gustPeriodMs);
  return (field.meanLeanDeg + field.gustAmplitudeDeg * Math.sin(phase)) / field.maxLeanDeg;
}

/**
 * Crown displacement as a fraction of sprite width, for the GLSL shear path.
 * Keeps the shader and the CPU rotation sourced from one shared field.
 */
export function sampleWindShear(field, timeMs, tx = 0, ty = 0, spriteWidth = 1) {
  const leanDeg = sampleWindLean(field, timeMs, tx, ty);
  const width = Number.isFinite(spriteWidth) && spriteWidth > 0 ? spriteWidth : 1;
  // A crown at 0.95 * height from the pivot travels height * sin(lean).
  return (0.95 * width * Math.sin((leanDeg * Math.PI) / 180)) / width;
}
