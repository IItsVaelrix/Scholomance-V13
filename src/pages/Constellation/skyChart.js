/**
 * Constellation sky — deterministic chart geometry + bytecode-seeded animation.
 *
 * VAELRIX Law 6: nothing here calls Math.random or Date.now. Star positions are
 * a frozen constant; every animation parameter (twinkle phase, drift offset, the
 * single ignited "lodestar") is derived from the page bytecode via a pure hash,
 * so the same page always renders the same sky (PDR §7.6 / §7.7 — a seed may
 * choose the animation route, never the analysis).
 *
 * Coordinates live in a 0..100 square viewBox; the SVG slices to fill.
 */

/**
 * Named literary constellations. Bright anchor stars (`spark`) carry the custom
 * 4-point star glyph; `dot` stars are quieter magnitude. Edges are drawn between
 * ids within a figure only — the figures should read as figures, not a mesh.
 */
export const CONSTELLATIONS = Object.freeze([
  {
    name: 'The Quill', // upper-left — the instrument of writing
    stars: [
      { id: 'q0', x: 9, y: 15, mag: 1.5, glyph: 'spark' },
      { id: 'q1', x: 14, y: 22, mag: 0.9, glyph: 'dot' },
      { id: 'q2', x: 19, y: 30, mag: 1.1, glyph: 'spark' },
      { id: 'q3', x: 23, y: 39, mag: 0.8, glyph: 'dot' },
      { id: 'q4', x: 26, y: 48, mag: 1.2, glyph: 'spark' },
      { id: 'q5', x: 17, y: 44, mag: 0.7, glyph: 'dot' }, // the plume splits
    ],
    edges: [['q0', 'q1'], ['q1', 'q2'], ['q2', 'q3'], ['q3', 'q4'], ['q2', 'q5']],
  },
  {
    name: 'The Lyre', // upper-right — song and meter
    stars: [
      { id: 'l0', x: 74, y: 12, mag: 1.6, glyph: 'spark' }, // Vega-bright
      { id: 'l1', x: 82, y: 16, mag: 1.0, glyph: 'dot' },
      { id: 'l2', x: 86, y: 25, mag: 1.2, glyph: 'spark' },
      { id: 'l3', x: 79, y: 30, mag: 0.9, glyph: 'dot' },
      { id: 'l4', x: 72, y: 24, mag: 1.1, glyph: 'spark' },
    ],
    edges: [['l0', 'l1'], ['l1', 'l2'], ['l2', 'l3'], ['l3', 'l4'], ['l4', 'l0']],
  },
  {
    name: 'The Open Book', // lower-left — the corpus
    stars: [
      { id: 'b0', x: 12, y: 74, mag: 1.3, glyph: 'spark' },
      { id: 'b1', x: 24, y: 70, mag: 1.0, glyph: 'dot' },
      { id: 'b2', x: 34, y: 76, mag: 1.4, glyph: 'spark' }, // spine
      { id: 'b3', x: 24, y: 84, mag: 0.9, glyph: 'dot' },
      { id: 'b4', x: 13, y: 86, mag: 1.0, glyph: 'spark' },
      { id: 'b5', x: 45, y: 71, mag: 0.8, glyph: 'dot' },
      { id: 'b6', x: 46, y: 83, mag: 1.1, glyph: 'spark' },
    ],
    edges: [
      ['b0', 'b1'], ['b1', 'b2'], ['b2', 'b3'], ['b3', 'b4'], ['b4', 'b0'],
      ['b2', 'b5'], ['b5', 'b6'], ['b6', 'b2'],
    ],
  },
  {
    name: 'The Morning Wound', // center-right — nods to the canonical fixture phrase
    stars: [
      { id: 'w0', x: 58, y: 52, mag: 1.5, glyph: 'spark' },
      { id: 'w1', x: 66, y: 47, mag: 1.0, glyph: 'dot' },
      { id: 'w2', x: 73, y: 55, mag: 1.3, glyph: 'spark' },
      { id: 'w3', x: 68, y: 63, mag: 0.9, glyph: 'dot' },
      { id: 'w4', x: 60, y: 64, mag: 1.1, glyph: 'spark' },
      { id: 'w5', x: 84, y: 60, mag: 1.2, glyph: 'spark' }, // the far morning star
    ],
    edges: [
      ['w0', 'w1'], ['w1', 'w2'], ['w2', 'w3'], ['w3', 'w4'], ['w4', 'w0'],
      ['w2', 'w5'],
    ],
  },
]);

/** Faint scattered star dust — never edged, pure depth. Frozen (Law 6). */
export const DUST = Object.freeze([
  { x: 5, y: 40, r: 0.4 }, { x: 30, y: 10, r: 0.5 }, { x: 41, y: 26, r: 0.35 },
  { x: 48, y: 40, r: 0.5 }, { x: 55, y: 18, r: 0.4 }, { x: 63, y: 34, r: 0.45 },
  { x: 90, y: 40, r: 0.5 }, { x: 95, y: 20, r: 0.35 }, { x: 38, y: 60, r: 0.45 },
  { x: 52, y: 88, r: 0.4 }, { x: 66, y: 78, r: 0.5 }, { x: 78, y: 88, r: 0.4 },
  { x: 90, y: 76, r: 0.45 }, { x: 8, y: 60, r: 0.35 }, { x: 33, y: 48, r: 0.4 },
  { x: 88, y: 46, r: 0.35 }, { x: 3, y: 88, r: 0.4 }, { x: 96, y: 92, r: 0.45 },
  { x: 44, y: 6, r: 0.35 }, { x: 20, y: 58, r: 0.4 },
]);

/** All anchor stars flattened, in a stable declaration order. */
export const ANCHOR_STARS = Object.freeze(
  CONSTELLATIONS.flatMap((c) => c.stars),
);

/** 4-point sparkle star, unit-ish path centred on (0,0), extent ~±1. */
export const SPARK_PATH =
  'M0,-1 C0.14,-0.34 0.34,-0.14 1,0 C0.34,0.14 0.14,0.34 0,1 C-0.14,0.34 -0.34,0.14 -1,0 C-0.34,-0.14 -0.14,-0.34 0,-1 Z';

/** FNV-1a 32-bit over a string — matches the repo's deterministic seed convention. */
export function fnv1a32(input) {
  let hash = 0x811c9dc5;
  const s = String(input);
  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Deterministic per-index float in [0,1) from a seed — a mulberry32 step. */
export function seededUnit(seed, index) {
  let t = (seed + Math.imul(index + 1, 0x6d2b79f5)) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Resolve the animation seed from a page bytecode. Idle sky uses a stable
 * constant so the entry chamber is identical across visits.
 */
export function skySeed(bytecode) {
  return fnv1a32(bytecode || 'COS-SKY-v1');
}

/**
 * Per-star twinkle timing derived from the seed — deterministic, so the same
 * page bytecode always breathes the same way. Durations sit in a slow,
 * unsynchronised band so the field shimmers rather than pulses in lockstep.
 */
export function twinkleFor(seed, index) {
  const a = seededUnit(seed, index);
  const b = seededUnit(seed, index + 977);
  return {
    delaySec: (a * 6).toFixed(2),
    durationSec: (4.5 + b * 5).toFixed(2),
  };
}

/** The one star the page ignites gold — index chosen by the seed (PDR §7.7). */
export function lodestarIndex(seed) {
  return seed % ANCHOR_STARS.length;
}
