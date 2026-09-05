/**
 * HOLY FIRE MOTIF AMP — deterministic flame emission for the Holy Fire
 * Paladin Sword (per 2026-06-12 PDR §4.4).
 *
 * The amp consumes blade + guard cells from the silhouette and emits
 * flame-shaped motif cells adjacent to the blade edge, tagged with the
 * `holyFire` part id. Flames are NOT geometry invention — they are
 * deterministic projections from the blade's edge cells.
 *
 * Formula (integer-quantized, no Math.random):
 *
 *   for i = 0..h_max:
 *     offset_x(i) = floor(A * sin(2π * f * i / h + φ) + 0.5)
 *     y           = o_y - i
 *
 * Where:
 *   A       = amplitude in cells (default 2.5 → quantized)
 *   f       = frequency (default 1.3)
 *   φ       = FNV-1a hash of (partId + seed) mod 2π
 *   h_max   = per-flame height (9..14 cells)
 *
 * Multiple overlapping flame layers (3 vertical plumes by default) create
 * depth. Phase is deterministic and stable across machines.
 *
 * The amp NEVER introduces nondeterminism: sin() is replaced by a 256-entry
 * integer lookup table that is identity-stable.
 */
import { hashString } from './shared.js';

export const HOLYFIRE_MOTIF_AMP_ID = 'pixelbrain.holyfireMotif';
export const HOLYFIRE_MOTIF_AMP_VERSION = '1.0.0';

const DEFAULT_FLAMES = 3;
const DEFAULT_HEIGHT = 11;
const DEFAULT_AMPLITUDE = 2.5;
const DEFAULT_FREQUENCY = 1.3;

const SIN_TABLE_SIZE = 256;
const SIN_TABLE = (() => {
  const table = new Float32Array(SIN_TABLE_SIZE);
  for (let i = 0; i < SIN_TABLE_SIZE; i += 1) {
    table[i] = Math.sin((i / SIN_TABLE_SIZE) * 2 * Math.PI);
  }
  return table;
})();

function err(reason, context) {
  const e = new Error(`holyfire-motif-amp: ${reason}`);
  e.cause = context;
  return e;
}

function toFiniteNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toPositiveInt(value, fallback) {
  return Math.max(1, Math.round(toFiniteNumber(value, fallback)));
}

function quantizeSin(phase) {
  // phase is in [0, 1) (normalized to 2π)
  const idx = ((phase % 1) + 1) % 1;
  return SIN_TABLE[Math.floor(idx * SIN_TABLE_SIZE) % SIN_TABLE_SIZE];
}

/**
 * Compute the deterministic phase offset for a given part + seed.
 * Stable across machines — only the FNV-1a hash and a modulo 2π.
 */
function deterministicPhase(partId, seed) {
  const h = hashString(`${partId}::${seed}`);
  // Map to [0, 1) for the SIN_TABLE lookup
  return (h % 1000003) / 1000003;
}

/**
 * Find a vertical column of `count` cells along the blade's vertical
 * center (x=cx), distributed evenly across the blade's Y range. These
 * become the flame origin points.
 */
function pickBladeTipOrigins(bladeCells, count, tipCutoffY) {
  if (bladeCells.length === 0) return [];
  const tipCells = bladeCells.filter((c) => c.y <= tipCutoffY);
  const yKeys = [...new Set(tipCells.map((c) => c.y))].sort((a, b) => a - b);
  if (yKeys.length === 0) return [];
  const step = Math.max(1, Math.floor(yKeys.length / count));
  const origins = [];
  for (let i = 0; i < count; i += 1) {
    const y = yKeys[Math.min(yKeys.length - 1, i * step)];
    origins.push(y);
  }
  return origins;
}

/**
 * Emit a single flame's cells starting at origin (o_x, o_y) using the
 * deterministic sin formula. Returns an array of {x, y} cells, clamped to
 * the canvas.
 */
function emitFlame(o_x, o_y, h, A, f, phi, canvas) {
  const out = [];
  for (let i = 0; i < h; i += 1) {
    const t = i / Math.max(1, h);
    const phase = (f * t + phi) % 1;
    const s = quantizeSin(phase);
    const offsetX = Math.floor(A * s + 0.5);
    const x = o_x + offsetX;
    const y = o_y - i;
    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) continue;
    out.push({ x, y });
  }
  return out;
}

/**
 * Apply holy fire motifs to a silhouette. Adds flame cells adjacent to
 * the blade and tags them as the `holyFire` part id. Returns:
 *   { cells: newCells, partOf: updatedMap, motifCells: emittedCells }
 */
export function applyHolyFireMotif(silhouette, spec, opts = {}) {
  if (!silhouette || !silhouette.cells || !silhouette.partOf) {
    throw err('silhouette with cells and partOf is required');
  }
  if (!spec || !Array.isArray(spec.parts) || spec.parts.length === 0) {
    throw err('spec with parts is required');
  }

  const holyFirePart = spec.parts.find((p) => p.profile === 'weapon.sword.holyfire_motif'
    || p.id === 'holyFire' || p.id === 'holy_fire');
  if (!holyFirePart) {
    return { cells: silhouette.cells.slice(), partOf: new Map(silhouette.partOf), motifCells: [] };
  }

  const canvas = spec.canvas;
  const seed = (spec.seed >>> 0) || 0;
  const flames = toPositiveInt(opts.flames ?? holyFirePart.params?.flames ?? DEFAULT_FLAMES);
  const baseHeight = toPositiveInt(opts.height ?? holyFirePart.params?.height ?? DEFAULT_HEIGHT);
  const amplitude = Number(opts.amplitude ?? holyFirePart.params?.amplitude ?? DEFAULT_AMPLITUDE);
  const frequency = Number(opts.frequency ?? holyFirePart.params?.frequency ?? DEFAULT_FREQUENCY);

  const partId = holyFirePart.id;

  // Gather blade cells
  const bladeCells = [];
  const bladePart = spec.parts.find((p) => p.id === 'blade' || p.profile === 'weapon.sword.holyfire_paladin_blade');
  if (!bladePart) {
    return { cells: silhouette.cells.slice(), partOf: new Map(silhouette.partOf), motifCells: [] };
  }
  for (const [key, pid] of silhouette.partOf.entries()) {
    if (pid === bladePart.id) {
      const [x, y] = key.split(',').map(Number);
      bladeCells.push({ x, y });
    }
  }

  if (bladeCells.length === 0) {
    return { cells: silhouette.cells.slice(), partOf: new Map(silhouette.partOf), motifCells: [] };
  }

  // Blade center column (use blade profile cx or canvas center)
  const cx = Math.round(holyFirePart.params?.cx ?? canvas.width / 2);

  // Origins are taken from the blade's tip row only (top of blade) so the
  // flames rise into the empty canvas above the blade and avoid the
  // no-overwrite collision with blade cells. Multiple flames share the
  // same tip Y but use different sin phases for horizontal spread,
  // producing a fan-shaped holy-fire plume.
  const bladeYKeys = [...new Set(bladeCells.map((c) => c.y))].sort((a, b) => a - b);
  const tipY = bladeYKeys[0] ?? null;
  if (tipY === null) {
    return { cells: silhouette.cells.slice(), partOf: new Map(silhouette.partOf), motifCells: [] };
  }
  // Each flame gets its own sin-phase offset (deterministic per index) but
  // shares the same origin Y (the blade tip). The horizontal fan emerges
  // from the sin offsetX at each i.
  const origins = [];
  for (let i = 0; i < flames; i += 1) origins.push({ x: cx, y: tipY });
  if (origins.length === 0) {
    return { cells: silhouette.cells.slice(), partOf: new Map(silhouette.partOf), motifCells: [] };
  }

  // Build a fresh occupied set so we don't double-add or step on the blade
  const occupied = new Set(silhouette.cells.map((c) => `${c.x},${c.y}`));
  const partOf = new Map(silhouette.partOf);
  const motifCells = [];
  const newCells = silhouette.cells.slice();

  origins.forEach((origin, index) => {
    const phi = deterministicPhase(`${partId}::flame-${index}`, seed + index);
    const h = baseHeight + (index % 3); // 9..11..13 by zone, deterministic
    const flame = emitFlame(origin.x, origin.y, h, amplitude, frequency, phi, canvas);
    for (const cell of flame) {
      const key = `${cell.x},${cell.y}`;
      if (occupied.has(key)) continue;  // never overwrite existing silhouette cells
      occupied.add(key);
      newCells.push(cell);
      partOf.set(key, partId);
      motifCells.push({ ...cell, partId });
    }
  });

  return Object.freeze({
    cells: Object.freeze(newCells),
    partOf,
    motifCells: Object.freeze(motifCells),
  });
}

/**
 * Seam descriptor for the holyfire-motif-amp. Per Agent Operating Manual §5.4.
 */
export const HOLYFIRE_MOTIF_AMP_SEAM = Object.freeze({
  id: 'holyfire-motif-v1',
  processor: HOLYFIRE_MOTIF_AMP_ID,
  version: HOLYFIRE_MOTIF_AMP_VERSION,
  consumes: ['silhouette.cells', 'silhouette.partOf', 'spec.parts', 'spec.seed', 'spec.canvas'],
  emits: ['motif.cells'],
  mutates: ['silhouette.cells', 'silhouette.partOf'],
  mergeContract: 'flame-cells-append-after-silhouette-v1',
  validates: [
    'holyFire.cells.length > 0 when a holyFire part is declared',
    'no flame cell overwrites a blade cell',
  ],
});

export default applyHolyFireMotif;
