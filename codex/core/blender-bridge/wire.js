/**
 * wire — .pbrain packet → Python-safe wire projection.
 *
 * The projection is not a no-op, and its rules differ from the Defold bridge's.
 * Blender/Python hazards:
 *   - None on an RNA property raises TypeError            -> no nulls
 *   - RNA floats are float32                              -> int32 + declared scale
 *   - ShaderNodeAttribute cannot read STRING attributes   -> categoricals interned
 *   - datablock names silently collide-rename             -> ids in custom props
 *   - view_transform enum is dynamic (RNA says ['NONE'])  -> pinned allowlist here
 *
 * Blender does NOT need Lua's *Count fields: Python distinguishes [] from {}.
 */

import { quantize, SCALES } from './quantize.js';
import { internTable, ABSENT_ID } from './intern.js';

export class WireError extends Error {
  constructor(message) {
    super(message);
    this.name = 'WireError';
  }
}

export const WIRE_VERSION = 1;
export const COLOR_POLICIES = Object.freeze(['EXACT', 'SYNTHESIZED']);
export const ENERGY_CHANNELS = 8;

/** Scalar coordinate fields carried as quantized attributes. */
const SCALAR_FIELDS = Object.freeze({
  pb_emphasis: { key: 'emphasis', scale: SCALES.UNIT },
  pb_local_contrast_delta: { key: 'localContrastDelta', scale: SCALES.UNIT },
  pb_square_amp_intensity: { key: 'squareAmpIntensityRating', scale: SCALES.UNIT },
  pb_structural_energy: { key: 'structuralEnergy', scale: SCALES.UNIT },
  pb_slot: { key: 'slot', scale: SCALES.PIXEL },
  pb_nx: { key: 'nx', scale: SCALES.UNIT },
  pb_ny: { key: 'ny', scale: SCALES.UNIT },
});

/** Boolean coordinate fields carried as 0/1. */
const BOOL_FIELDS = Object.freeze({
  pb_is_rim: 'isRim',
  pb_is_motif: 'isMotif',
});

/** Categorical fields interned to int. */
const CATEGORICAL_FIELDS = Object.freeze({
  pb_part_id: 'partId',
  pb_shading: 'shading',
  pb_motif_role: 'motifRole',
  pb_square_amp_class: 'squareAmpClass',
  pb_source: 'source',
});

function hexToInt(hex) {
  if (typeof hex !== 'string') return 0;
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  return parseInt(m[1], 16);
}

export function toPythonWire(packet, options = {}) {
  const { colorPolicy } = options;
  if (!COLOR_POLICIES.includes(colorPolicy)) {
    throw new WireError(
      `colorPolicy must be one of ${COLOR_POLICIES.join(' | ')}, got ${JSON.stringify(colorPolicy)}`,
    );
  }
  const coords = packet.coordinates;
  if (!Array.isArray(coords) || coords.length === 0) {
    throw new WireError('packet.coordinates must be a non-empty array');
  }

  const intern = {};
  for (const [attr, key] of Object.entries(CATEGORICAL_FIELDS)) {
    intern[key] = internTable(coords.map((c) => c[key]));
  }

  const attributes = {};
  const scales = {};

  for (const [attr, { key, scale }] of Object.entries(SCALAR_FIELDS)) {
    attributes[attr] = coords.map((c) => quantize(Number(c[key] ?? 0), scale));
    scales[attr] = scale;
  }
  for (const [attr, key] of Object.entries(BOOL_FIELDS)) {
    attributes[attr] = coords.map((c) => (c[key] ? 1 : 0));
    scales[attr] = SCALES.PIXEL;
  }
  for (const [attr, key] of Object.entries(CATEGORICAL_FIELDS)) {
    attributes[attr] = coords.map((c) => intern[key].lookup(c[key]));
    scales[attr] = SCALES.PIXEL;
  }

  const energy = {};
  for (let t = 0; t < ENERGY_CHANNELS; t += 1) {
    energy[String(t)] = coords.map((c) => {
      const hit = (c.energies ?? []).find((e) => e.type === t);
      return quantize(hit ? Number(hit.value) : 0, SCALES.UNIT);
    });
  }

  const wire = {
    wireVersion: WIRE_VERSION,
    packetId: String(packet.bytecode ?? ''),
    kind: String(packet.kind ?? ''),
    colorPolicy,
    canvas: {
      width: packet.canvas.width,
      height: packet.canvas.height,
      gridSize: packet.canvas.gridSize,
    },
    coordinateCount: coords.length,
    scales,
    intern: Object.fromEntries(Object.entries(intern).map(([k, v]) => [k, v.table])),
    attributes,
    positions: {
      x: coords.map((c) => quantize(Number(c.x), SCALES.PIXEL)),
      y: coords.map((c) => quantize(Number(c.y), SCALES.PIXEL)),
      z: coords.map((c) => quantize(Number(c.z ?? 0), SCALES.PIXEL)),
    },
    colors: {
      color: coords.map((c) => hexToInt(c.color)),
      preSquareColor: coords.map((c) => hexToInt(c.preSquareColor)),
    },
    energy,
    sourceChecksum: String(packet.checksum?.value ?? ''),
    absentId: ABSENT_ID,
  };

  assertNoNulls(wire);
  return wire;
}

export function serializeWirePacket(packet, options) {
  return JSON.stringify(toPythonWire(packet, options));
}

export function assertNoNulls(value, path = '$') {
  if (value === null || value === undefined) {
    throw new WireError(`Null found at ${path} — None on an RNA property raises TypeError`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoNulls(item, `${path}[${i}]`));
  } else if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) assertNoNulls(v, `${path}.${k}`);
  }
}
