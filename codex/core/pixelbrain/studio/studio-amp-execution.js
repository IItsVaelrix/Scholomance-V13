import { sha256Hex } from '../sha256.js';
import { STUDIO_AMP_RECORDS } from './studio-amp-manifest.generated.js';
import {
  STUDIO_ADAPTER_DEFINITIONS,
  resolveStudioAmpAdapter,
} from './studio-amp-adapter-registry.js';
import {
  acceptMutation,
  createMutationCandidate,
  rejectMutation,
} from './studio-mutation-transaction.js';

const RECORDS_BY_ID = new Map(STUDIO_AMP_RECORDS.map((record) => [record.ampId, record]));

function cloneInput(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (ArrayBuffer.isView(value)) return new value.constructor(value);
  if (value instanceof ArrayBuffer) return value.slice(0);
  if (value instanceof Map) {
    const clonedMap = new Map();
    seen.set(value, clonedMap);
    for (const [key, entry] of value) clonedMap.set(cloneInput(key, seen), cloneInput(entry, seen));
    return clonedMap;
  }
  if (value instanceof Set) {
    const clonedSet = new Set();
    seen.set(value, clonedSet);
    for (const entry of value) clonedSet.add(cloneInput(entry, seen));
    return clonedSet;
  }
  if (Array.isArray(value)) {
    const clonedArray = [];
    seen.set(value, clonedArray);
    for (const entry of value) clonedArray.push(cloneInput(entry, seen));
    return clonedArray;
  }
  const result = {};
  seen.set(value, result);
  for (const [key, child] of Object.entries(value)) result[key] = cloneInput(child, seen);
  return result;
}

function checksumValue(value, seen = new WeakSet()) {
  if (value === undefined) return '[undefined]';
  if (typeof value === 'function') return `[function:${value.name || 'anonymous'}]`;
  if (typeof value === 'bigint') return `[bigint:${value}]`;
  if (typeof value === 'number' && !Number.isFinite(value)) return `[number:${value}]`;
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  if (ArrayBuffer.isView(value)) {
    return { $type: value.constructor.name, values: [...value] };
  }
  if (value instanceof ArrayBuffer) {
    return { $type: 'ArrayBuffer', values: [...new Uint8Array(value)] };
  }
  if (value instanceof Map) {
    return {
      $type: 'Map',
      entries: [...value.entries()]
        .map(([key, entry]) => [String(key), checksumValue(entry, seen)])
        .sort(([a], [b]) => a.localeCompare(b)),
    };
  }
  if (value instanceof Set) {
    return { $type: 'Set', values: [...value].map((entry) => checksumValue(entry, seen)).sort() };
  }
  if (Array.isArray(value)) return value.map((entry) => checksumValue(entry, seen));
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, checksumValue(value[key], seen)]),
  );
}

export function studioOutputChecksum(value) {
  return `studio-output1:${sha256Hex(JSON.stringify(checksumValue(value)))}`;
}

export async function inspectStudioSupport(ampId) {
  const record = getRecord(ampId);
  if (record.kind !== 'support') throw new Error(`PB-STUDIO-NOT-SUPPORT: ${ampId}`);
  const adapter = await resolveStudioAmpAdapter(record.adapterId);
  let output;
  switch (record.adapterId) {
    case 'deterministic-noise': {
      const rng = adapter.entrypoint(17);
      output = [rng.next(), rng.next(), rng.next()];
      break;
    }
    case 'fibonacci-seed-field':
      output = adapter.entrypoint({ fibonacci: { enabled: false, count: 0 } }, {});
      break;
    case 'material-resolver':
      output = new adapter.entrypoint().resolveBiomeMaterials('grass');
      break;
    case 'qbit-snap-profile':
      output = adapter.entrypoint([], [], { biomeCompatibility: {}, socketCompatibility: {} });
      break;
    default:
      output = cloneInput(adapter.entrypoint);
  }
  return Object.freeze({
    ampId,
    consumerId: 'studio-support-inspector',
    output,
    outputChecksum: studioOutputChecksum(output),
  });
}

function getRecord(ampId) {
  const record = RECORDS_BY_ID.get(ampId);
  if (!record) throw new Error(`PB-STUDIO-UNKNOWN-AMP: ${ampId}`);
  return record;
}

function studioCells(snapshot) {
  if (Array.isArray(snapshot?.coordinates)) return snapshot.coordinates;
  if (Array.isArray(snapshot?.cells)) return snapshot.cells;
  return (snapshot?.layers || []).flatMap((layer) => Array.isArray(layer?.cells) ? layer.cells : []);
}

function defaultArguments(adapterId, snapshot) {
  const coordinates = studioCells(snapshot).map((cell) => ({ ...cell }));
  const width = snapshot?.width || 8;
  const height = snapshot?.height || 8;
  const fills = { coordinates, width, height };
  const template = { coordinates: coordinates.map((cell) => ({ ...cell })), width, height };
  const partOf = new Map(coordinates.map((cell) => [`${cell.x},${cell.y}`, cell.partId || 'body']));
  const silhouette = { cells: coordinates, partOf, parts: [], width, height };
  const spec = snapshot?.spec || { class: 'item', archetype: 'generic', seed: snapshot?.seed || 1, parts: [] };
  const packet = { intent: snapshot?.intent || {}, input: snapshot?.input || {}, context: snapshot?.context || {} };

  switch (adapterId) {
    case 'arena-tick.processor':
      return [{ firePixels: new Float32Array(width * height), fireW: width, fireH: height, seed: snapshot?.seed || 1, torcheffects: [], plasma: null }];
    case 'noise-mask.microprocessor':
      return [packet.intent, { isoTile: { topPlane: [] }, ...packet.input }, packet.intent.noise || { enabled: false }];
    case 'heightmap.microprocessor':
      return [packet.intent, { isoTile: { topPlane: [] }, ...packet.input }, 0];
    case 'chestplate-amp':
    case 'heraldry-amp':
    case 'jewelry-amp':
    case 'shield-rim-amp':
    case 'shield-volume-amp':
      return [template, silhouette, spec];
    case 'chestplate-bevel-amp':
    case 'chestplate-surface-texture-amp':
    case 'image-segmentation-amp':
    case 'neighbor-extrapolation-amp':
    case 'palette-quantization-amp':
    case 'pixel-aa-amp':
    case 'selout-amp':
      return [fills, spec];
    case 'chunks-seam-amp': return [{ width, height, depth: snapshot?.depth || 8 }, () => null, {}];
    case 'crystal-core-amp': return [fills, spec, silhouette];
    case 'facet-amp': return [fills, spec, () => ({}), {}];
    case 'flame-tip-amp':
    case 'scholomance-character-motif-amp':
    case 'square-sharpness-contrast-amp':
      return [coordinates, {}];
    case 'geometry-amp': return [{ spec: { ...spec, canvas: spec.canvas || { width, height } }, silhouette, construction: null }];
    case 'grass-amp': return [{ width, height, seed: snapshot?.seed || 1 }];
    case 'gravity-amp': return [[], { width, height, depth: snapshot?.depth || 8 }, {}];
    case 'hair-flow-amp': return [{ width, height, seed: snapshot?.seed || 1 }];
    case 'holyfire-motif-amp': return [silhouette, {
      ...spec,
      canvas: spec.canvas || { width, height },
      parts: Array.isArray(spec.parts) && spec.parts.length ? spec.parts : [{ id: 'body', profile: 'generic' }],
    }, {}];
    case 'noise-fill-amp': return [coordinates, {}, {}];
    case 'pixel-scale-amp': return [new Uint8Array(width * height * 4), width, height];
    case 'region-fill-amp': return [{ silhouette, template, spec }];
    case 'sdf-shape-amp': return [{}, {}];
    case 'shadow-amp':
    case 'shadow-perception-amp':
    case 'tonation-amp':
    case 'vector-amp':
    case 'volume-amp': return [{ coordinates, width, height }];
    case 'volume-lift-amp': return [coordinates, {}];
    case 'coord-symmetry-amp': return [{ assetId: 'studio', coordinates, dimensions: { width, height }, symmetry: 'vertical' }];
    case 'symmetry-amp': return [{ grid: snapshot?.grid || { width, height, layers: [] }, layerIndex: 0 }];
    case 'sketch-amp': return [{ dimensions: { width, height }, parts: [] }, {}];
    default: return [snapshot];
  }
}

async function invoke(record, snapshot, options) {
  const progress = (percent, phase) => options.onProgress?.(Object.freeze({ percent, phase }));
  progress(10, 'resolve');
  const adapter = await resolveStudioAmpAdapter(record.adapterId);
  if (adapter.mode === 'support' || record.kind === 'support') {
    throw new Error(`PB-STUDIO-SUPPORT-NOT-EXECUTABLE: ${record.ampId}`);
  }

  if (options.signal?.aborted) throw new Error('PB-STUDIO-JOB-CANCELLED');
  progress(35, 'prepare');
  let output;
  if (adapter.mode === 'class') {
    const instance = new adapter.entrypoint(...cloneInput(options.constructArguments || []));
    output = await instance.run(cloneInput(options.packet ?? {
      intent: snapshot?.intent || {},
      input: snapshot?.input || {},
      context: snapshot?.context || {},
    }));
  } else {
    const args = options.arguments ?? defaultArguments(record.adapterId, snapshot);
    output = await adapter.entrypoint(...cloneInput(args));
  }
  if (options.signal?.aborted) throw new Error('PB-STUDIO-JOB-CANCELLED');
  progress(90, 'checksum');
  return output;
}

function makeReceipt(record, snapshot, output, mode, planChecksum = null) {
  return Object.freeze({
    contract: 'PB-STUDIO-AMP-RECEIPT-v1',
    ampId: record.ampId,
    adapterId: record.adapterId,
    kind: record.kind,
    mode,
    order: record.order,
    baseChecksum: snapshot.checksum,
    planChecksum,
    manifestChecksum: record.checksum,
    outputChecksum: studioOutputChecksum(output),
  });
}

function byteView(value) {
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  for (const key of ['rgba', 'pixels', 'field', 'data']) {
    if (ArrayBuffer.isView(value?.[key])) return byteView(value[key]);
  }
  return null;
}

export function diffStudioValues(before, after) {
  const beforeBytes = byteView(before);
  const afterBytes = byteView(after);
  let changedBytes = null;
  if (beforeBytes && afterBytes) {
    const length = Math.max(beforeBytes.length, afterBytes.length);
    changedBytes = 0;
    for (let index = 0; index < length; index += 1) {
      if (beforeBytes[index] !== afterBytes[index]) changedBytes += 1;
    }
  }
  const beforeChecksum = studioOutputChecksum(before);
  const afterChecksum = studioOutputChecksum(after);
  return Object.freeze({
    contract: 'PB-STUDIO-DIFF-v1',
    beforeChecksum,
    afterChecksum,
    beforeBytes: beforeBytes?.byteLength ?? null,
    afterBytes: afterBytes?.byteLength ?? null,
    changedBytes,
    changed: beforeChecksum !== afterChecksum,
  });
}

export function getStudioAdapterCoverage(records = STUDIO_AMP_RECORDS) {
  const expected = new Set(records.map((record) => record.adapterId));
  const actual = new Set(Object.keys(STUDIO_ADAPTER_DEFINITIONS));
  return Object.freeze({
    adapters: Object.freeze(records.map((record) => Object.freeze({
      ampId: record.ampId,
      adapterId: record.adapterId,
      kind: record.kind,
      consumerIds: Object.freeze([...(record.consumerIds || [])]),
    }))),
    missing: Object.freeze([...expected].filter((id) => !actual.has(id)).sort()),
    extra: Object.freeze([...actual].filter((id) => !expected.has(id)).sort()),
  });
}

export async function previewStudioAmp({ ampId, snapshot, options = {} } = {}) {
  if (!snapshot?.checksum) throw new Error('PB-STUDIO-SNAPSHOT-CHECKSUM-REQUIRED');
  const record = getRecord(ampId);
  const output = await invoke(record, snapshot, options);
  const result = Object.freeze({ output, receipt: makeReceipt(record, snapshot, output, 'preview', options.planChecksum) });
  options.onProgress?.(Object.freeze({ percent: 100, phase: 'complete' }));
  return result;
}

export async function commitStudioAmp({ ampId, snapshot, options = {} } = {}) {
  const record = getRecord(ampId);
  if (record.kind === 'mutation') throw new Error(`PB-STUDIO-MUTATION-VEHICLE-REQUIRED: ${ampId}`);
  const preview = await previewStudioAmp({ ampId, snapshot, options });
  return Object.freeze({
    output: preview.output,
    receipt: makeReceipt(record, snapshot, preview.output, 'commit', options.planChecksum),
  });
}

export async function proposeStudioMutation({ ampId, snapshot, options = {} } = {}) {
  if (!snapshot?.checksum) throw new Error('PB-STUDIO-SNAPSHOT-CHECKSUM-REQUIRED');
  const record = getRecord(ampId);
  if (record.kind !== 'mutation') throw new Error(`PB-STUDIO-NOT-A-MUTATION: ${ampId}`);
  const output = await invoke(record, snapshot, options);
  const checksum = studioOutputChecksum(output);
  const candidate = { checksum, data: output };
  const transaction = createMutationCandidate(snapshot, candidate, ampId);
  const result = Object.freeze({
    transaction,
    diff: diffStudioValues(snapshot, output),
    receipt: makeReceipt(record, snapshot, output, 'mutation-preview', options.planChecksum),
  });
  options.onProgress?.(Object.freeze({ percent: 100, phase: 'complete' }));
  return result;
}

export const acceptStudioMutation = acceptMutation;
export const rejectStudioMutation = rejectMutation;
