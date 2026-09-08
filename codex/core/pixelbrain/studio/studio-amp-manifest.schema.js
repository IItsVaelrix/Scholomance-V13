import { sha256Hex } from '../sha256.js';

export const STUDIO_AMP_MANIFEST_CONTRACT = 'PB-STUDIO-AMP-MANIFEST-v1';
export const STUDIO_AMP_KINDS = Object.freeze([
  'runnable',
  'mutation',
  'runtime-gated',
  'support',
  'blocked-with-reason',
]);
export const STUDIO_TABS = Object.freeze([
  'canvas', 'blueprint', 'foundry', 'amps', 'mutations',
  'finish', 'mentor', 'library', 'diagnostics',
]);

const MUTATION_NAMES = new Set([
  'coord-symmetry-amp',
  'image-segmentation-amp',
  'neighbor-extrapolation-amp',
  'noise-fill-amp',
  'palette-quantization-amp',
  'pixel-aa-amp',
  'pixel-scale-amp',
  'selout-amp',
  'square-sharpness-contrast-amp',
  'symmetry-amp',
]);

const SUPPORT_CONSUMERS = Object.freeze({
  'deterministic-noise': ['noise-mask.microprocessor', 'perlin-field.microprocessor', 'studio-support-inspector'],
  'fibonacci-seed-field': ['fibonacci-field.microprocessor', 'studio-support-inspector'],
  'material-resolver': ['biome-material.microprocessor', 'studio-support-inspector'],
  'qbit-snap-profile': ['studio-support-inspector'],
  'turboquant-layer-snapshot': ['studio-support-inspector'],
});

const RUNTIME_NAMES = new Set([
  'arena-tick.processor',
  'biome-material.microprocessor',
  'fibonacci-field.microprocessor',
  'heightmap.microprocessor',
  'iso-tile-geometry.microprocessor',
  'tile-shape.microprocessor',
  'noise-mask.microprocessor',
  'perlin-field.microprocessor',
  'tile-socket.microprocessor',
  'volume.microprocessor',
  'biome-coherence-amp',
  'chunks-seam-amp',
  'gear-glide-amp',
  'gravity-amp',
  'hollowness-amp',
  'school-tag-amp',
]);

function tabFor(entry, kind) {
  if (kind === 'mutation') return 'mutations';
  if (kind === 'support' || kind === 'runtime-gated') return 'diagnostics';
  if (/shader|palette|color|shadow|tonation|facet|bevel|texture|rim|volume/.test(entry.name)) return 'finish';
  if (/sketch|geometry|sdf|symmetry/.test(entry.name)) return 'blueprint';
  if (/grass|biome|tile|chunk|qbit|voxel/.test(entry.name)) return 'foundry';
  return 'amps';
}

function kindFor(entry) {
  if (MUTATION_NAMES.has(entry.name)) return 'mutation';
  if (SUPPORT_CONSUMERS[entry.name]) return 'support';
  if (RUNTIME_NAMES.has(entry.name)) return 'runtime-gated';
  return 'runnable';
}

function makeRecord(entry, order) {
  const kind = kindFor(entry);
  const ampId = entry.ampId || entry.name;
  const base = {
    contract: STUDIO_AMP_MANIFEST_CONTRACT,
    ampId,
    modulePath: entry.path,
    system: entry.system,
    status: entry.status,
    kind,
    tab: tabFor(entry, kind),
    pipeline: kind === 'mutation' ? 'editor-mutation' : entry.system,
    order,
    adapterId: entry.name,
    mutates: kind === 'mutation',
    reads: Object.freeze(['asset.snapshot']),
    writes: Object.freeze(kind === 'mutation' ? ['asset.pixels'] : []),
    exports: [...(entry.exports || [])].sort(),
    summary: entry.summary || `Exports ${[...(entry.exports || [])].sort().join(', ') || entry.name}`,
    consumerIds: [...(SUPPORT_CONSUMERS[entry.name] || [])].sort(),
  };
  return Object.freeze({ ...base, checksum: sha256Hex(JSON.stringify(base)) });
}

export function buildStudioAmpManifest(entries = []) {
  return Object.freeze(
    [...entries]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((entry, index) => makeRecord(entry, index + 1)),
  );
}

export function validateStudioAmpManifest(records, catalogPaths = []) {
  const errors = [];
  const ids = new Set();
  const paths = new Set();

  for (const [index, record] of (records || []).entries()) {
    const at = `records[${index}]`;
    if (record?.contract !== STUDIO_AMP_MANIFEST_CONTRACT) errors.push(`${at}.contract`);
    if (!STUDIO_AMP_KINDS.includes(record?.kind)) errors.push(`${at}.kind`);
    if (!STUDIO_TABS.includes(record?.tab)) errors.push(`${at}.tab`);
    if (!record?.ampId || ids.has(record.ampId)) errors.push(`${at}.ampId`);
    if (!record?.modulePath || paths.has(record.modulePath)) errors.push(`${at}.modulePath`);
    if (record?.kind === 'mutation' && record?.tab !== 'mutations') errors.push(`${at}.mutationTab`);
    if (record?.kind === 'support' && (!Array.isArray(record.consumerIds) || record.consumerIds.length === 0)) {
      errors.push(`${at}.consumerIds`);
    }
    const { checksum, ...base } = record || {};
    if (checksum !== sha256Hex(JSON.stringify(base))) errors.push(`${at}.checksum`);
    ids.add(record?.ampId);
    paths.add(record?.modulePath);
  }

  const expected = [...catalogPaths].sort();
  const actual = [...paths].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) errors.push('coverage');
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}
