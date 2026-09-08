import { z as schema } from 'zod';
import { sha256Hex } from '../sha256.js';
import { BytecodeError, ERROR_CATEGORIES, ERROR_SEVERITY, MODULE_IDS, ERROR_CODES } from '../bytecode-error.js';

export const TILE_MAP_CONTRACT = 'PB-TILE-MAP-v1';
export const TILE_MAP_LIMITS = Object.freeze({ fileBytes: 32 * 1024 * 1024, assets: 256, instances: 20000, dimension: 256, pixels: 2097152 });
const integer = (min, max) => schema.number().int().min(min).max(max);
const label = schema.string().trim().min(1).max(120);
const key = schema.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const json = schema.json();
const footprintSchema = schema.object({ gridW: integer(1, 32), gridH: integer(1, 32) }).strict();
const assetSchema = schema.object({
  id: schema.string().regex(/^asset-[a-f0-9]{64}$/), name: label,
  kind: schema.enum(['terrain', 'prop']), width: integer(1, 512), height: integer(1, 512),
  anchor: schema.object({ x: integer(0, 512), y: integer(0, 512) }).strict(),
  footprint: footprintSchema,
  rgba: schema.string().max(512 * 512 * 8).regex(/^(?:[0-9a-f]{8})+$/),
  scdlSource: schema.string().max(1024 * 1024), bytecode: json,
  ampDescriptors: schema.array(json).max(256),
  scd128Record: schema.object({ scd128Wire: schema.string().regex(/^[0-9A-F]{128}$/) }).catchall(json),
}).strict();
const layerSchema = schema.object({ id: key, name: label, visible: schema.boolean(), locked: schema.boolean() }).strict();
const instanceSchema = schema.object({
  id: key, assetId: schema.string(), layerId: key,
  x: integer(0, 255), y: integer(0, 255), z: integer(-16, 32),
}).strict();
const mapSchema = schema.object({
  contract: schema.literal(TILE_MAP_CONTRACT), name: label,
  width: integer(1, 256), height: integer(1, 256), tileWidth: schema.literal(80), tileHeight: schema.literal(40),
  nextId: integer(1, Number.MAX_SAFE_INTEGER - 1),
  assets: schema.array(assetSchema).max(TILE_MAP_LIMITS.assets),
  layers: schema.array(layerSchema).min(1).max(32),
  instances: schema.array(instanceSchema).max(TILE_MAP_LIMITS.instances),
}).strict();

export function mapError(message) {
  return new BytecodeError(ERROR_CATEGORIES.VALUE, ERROR_SEVERITY.WARN, MODULE_IDS.CORE, ERROR_CODES.INVALID_VALUE, { reason: message, source: TILE_MAP_CONTRACT });
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}

function digest(value) { return sha256Hex(JSON.stringify(canonical(value))).toLowerCase(); }
function assetId(asset) {
  const { id: _id, name: _name, ...content } = asset;
  return `asset-${digest(content)}`;
}

function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export function createTileMap({ name = 'Untitled map', width = 24, height = 24 } = {}) {
  return validateTileMap({ contract: TILE_MAP_CONTRACT, name, width, height, tileWidth: 80, tileHeight: 40, nextId: 1, assets: [], instances: [], layers: [
    { id: 'cliffs', name: 'Cliffs', visible: true, locked: false },
    { id: 'terrain', name: 'Terrain', visible: true, locked: false },
    { id: 'details', name: 'Details', visible: true, locked: false },
    { id: 'props', name: 'Props', visible: true, locked: false },
  ] });
}

/** Snapshot source, witness and realized pixels together; no compiler work happens on placement. */
export function createMapAsset(buffer, { name, kind = 'terrain', anchor, footprint } = {}) {
  const width = buffer.width;
  const height = buffer.height;
  const data = buffer.data ?? buffer.buffer?.data;
  if (!data || data.length !== width * height * 4) throw mapError('Asset has no complete RGBA raster.');
  const body = {
    name: name || buffer.propType || buffer.type || 'Tile', kind, width, height,
    anchor: anchor || { x: Math.floor(width / 2), y: kind === 'terrain' ? 20 : height - 1 },
    footprint: footprint || { gridW: 1, gridH: 1 },
    rgba: Array.from(data, n => n.toString(16).padStart(2, '0')).join(''),
    scdlSource: buffer.scdlSource || '', bytecode: buffer.bytecode ?? null,
    ampDescriptors: buffer.ampDescriptors || [], scd128Record: buffer.scd128Record,
  };
  const parsed = assetSchema.safeParse({ ...body, id: assetId(body) });
  if (!parsed.success) throw mapError(`Invalid tile asset: ${parsed.error.issues[0].message}`);
  return freeze(parsed.data);
}

export function validateTileMap(input) {
  const parsed = mapSchema.safeParse(input);
  if (!parsed.success) throw mapError(`Invalid map: ${parsed.error.issues[0].path.join('.')} ${parsed.error.issues[0].message}`);
  const map = parsed.data;
  const assets = new Map(map.assets.map(a => [a.id, a]));
  const layers = new Set(map.layers.map(l => l.id));
  const instances = new Set(map.instances.map(i => i.id));
  if (assets.size !== map.assets.length || layers.size !== map.layers.length || instances.size !== map.instances.length) throw mapError('Duplicate map identities.');
  if (map.assets.reduce((sum, a) => sum + a.width * a.height, 0) > TILE_MAP_LIMITS.pixels) throw mapError('Map asset pixel budget exceeded.');
  for (const a of map.assets) {
    if (a.rgba.length !== a.width * a.height * 8 || a.id !== assetId(a) || a.anchor.x > a.width || a.anchor.y > a.height) throw mapError(`Asset integrity check failed: ${a.name}`);
  }
  for (const i of map.instances) {
    const a = assets.get(i.assetId);
    if (!a || !layers.has(i.layerId)) throw mapError('Placement references a missing asset or layer.');
    if (i.x + a.footprint.gridW > map.width || i.y + a.footprint.gridH > map.height) throw mapError('Placement footprint exceeds map bounds.');
  }
  return freeze(map);
}

export function addMapAssets(map, assets) {
  const catalog = new Map(map.assets.map(a => [a.id, a]));
  assets.forEach(a => catalog.set(a.id, a));
  return validateTileMap({ ...map, assets: [...catalog.values()] });
}

function editableLayer(map, layerId) {
  const layer = map.layers.find(l => l.id === layerId);
  if (!layer || layer.locked || !layer.visible) throw mapError('Choose a visible, unlocked layer.');
  return layer;
}

function nextIdentity(map, prefix) {
  let n = map.nextId;
  const used = new Set([...map.instances, ...map.layers].map(i => i.id));
  while (used.has(`${prefix}-${n}`)) n += 1;
  return { id: `${prefix}-${n}`, nextId: n + 1 };
}

export function stampMapAsset(map, { assetId: id, layerId, x, y, z = 0 }) {
  editableLayer(map, layerId);
  const asset = map.assets.find(a => a.id === id);
  if (!asset) throw mapError('Choose a tile from the palette first.');
  if (![x, y, z].every(Number.isInteger) || z < -16 || z > 32 || x < 0 || y < 0 || x + asset.footprint.gridW > map.width || y + asset.footprint.gridH > map.height) throw mapError('Tile footprint is outside the map or elevation range.');
  const existing = map.instances.find(i => i.layerId === layerId && i.x === x && i.y === y && i.z === z);
  if (existing?.assetId === id) return map;
  if (!existing && map.instances.length >= TILE_MAP_LIMITS.instances) throw mapError('Placement limit reached.');
  const identity = existing ? { id: existing.id, nextId: map.nextId } : nextIdentity(map, 'tile');
  const instance = freeze({ id: identity.id, assetId: id, layerId, x, y, z });
  return freeze({ ...map, nextId: identity.nextId, instances: [...map.instances.filter(i => i.id !== instance.id), instance] });
}

export function moveMapInstance(map, id, position) {
  const instance = map.instances.find(i => i.id === id);
  if (!instance) return map;
  editableLayer(map, instance.layerId);
  const updated = instanceSchema.safeParse({ ...instance, ...position, id, assetId: instance.assetId });
  if (!updated.success) throw mapError('Invalid placement coordinates.');
  editableLayer(map, updated.data.layerId);
  const a = map.assets.find(asset => asset.id === instance.assetId);
  if (updated.data.x + a.footprint.gridW > map.width || updated.data.y + a.footprint.gridH > map.height) throw mapError('Tile footprint is outside the map.');
  if (JSON.stringify(updated.data) === JSON.stringify(instance)) return map;
  return freeze({ ...map, instances: map.instances.map(i => i.id === id ? freeze(updated.data) : i) });
}

export function eraseMapInstance(map, id) {
  const instance = map.instances.find(i => i.id === id);
  if (!instance) return map;
  editableLayer(map, instance.layerId);
  return freeze({ ...map, instances: map.instances.filter(i => i.id !== id) });
}

export function updateMapLayer(map, id, changes) {
  const layer = map.layers.find(l => l.id === id);
  if (!layer) throw mapError('Layer does not exist.');
  const parsed = layerSchema.safeParse({ ...layer, ...changes, id });
  if (!parsed.success) throw mapError('Invalid layer settings.');
  return freeze({ ...map, layers: map.layers.map(l => l.id === id ? parsed.data : l) });
}

export function addMapLayer(map) {
  if (map.layers.length >= 32) throw mapError('Layer limit reached.');
  const identity = nextIdentity(map, 'layer');
  return freeze({ ...map, nextId: identity.nextId, layers: [...map.layers, { id: identity.id, name: `Layer ${map.layers.length + 1}`, visible: true, locked: false }] });
}

export function reorderMapLayer(map, id, direction) {
  const from = map.layers.findIndex(l => l.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= map.layers.length || ![-1, 1].includes(direction)) return map;
  const layers = [...map.layers];
  [layers[from], layers[to]] = [layers[to], layers[from]];
  return freeze({ ...map, layers });
}

export function projectMapPoint(map, { x, y, z = 0 }) {
  return { x: (x - y) * map.tileWidth / 2, y: (x + y) * map.tileHeight / 2 - z * map.tileHeight };
}

export function unprojectMapPoint(map, point, z = 0) {
  const sum = (point.y + z * map.tileHeight) / (map.tileHeight / 2);
  const difference = point.x / (map.tileWidth / 2);
  return { x: Math.floor((sum + difference) / 2 + 0.5), y: Math.floor((sum - difference) / 2 + 0.5), z };
}

export function orderedMapInstances(map) {
  const layerOrder = new Map(map.layers.map((l, n) => [l.id, { ...l, order: n }]));
  const assets = new Map(map.assets.map(a => [a.id, a]));
  return map.instances.filter(i => layerOrder.get(i.layerId)?.visible).map(i => ({ ...i, asset: assets.get(i.assetId) })).sort((a, b) => {
    const band = layerOrder.get(a.layerId).order - layerOrder.get(b.layerId).order;
    const south = i => i.x + i.y + i.asset.footprint.gridW + i.asset.footprint.gridH;
    return band || south(a) - south(b) || a.z - b.z || a.id.localeCompare(b.id, 'en');
  });
}

/** Alpha-aware picking follows the same back-to-front ordering as rendering. */
export function pickMapInstance(map, point, layerId = null) {
  const ordered = orderedMapInstances(map);
  for (let n = ordered.length - 1; n >= 0; n -= 1) {
    const i = ordered[n];
    if (layerId && i.layerId !== layerId) continue;
    const p = projectMapPoint(map, i);
    const x = Math.floor(point.x - p.x + i.asset.anchor.x);
    const y = Math.floor(point.y - p.y + i.asset.anchor.y);
    if (x >= 0 && y >= 0 && x < i.asset.width && y < i.asset.height && parseInt(i.asset.rgba.slice((y * i.asset.width + x) * 8 + 6, (y * i.asset.width + x) * 8 + 8), 16) > 0) return i;
  }
  return null;
}

export function mapStrokePoints(start, end) {
  const points = [];
  const steps = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y));
  for (let n = 0; n <= steps; n += 1) {
    const t = steps ? n / steps : 0;
    points.push({ x: Math.round(start.x + (end.x - start.x) * t), y: Math.round(start.y + (end.y - start.y) * t), z: end.z });
  }
  return points;
}

export function serializeTileMap(map) {
  const document = validateTileMap(map);
  const text = JSON.stringify(canonical({ contract: 'PB-TILE-MAP-FILE-v1', checksum: digest(document), document }));
  if (new TextEncoder().encode(text).length > TILE_MAP_LIMITS.fileBytes) throw mapError('Map file size limit exceeded.');
  return text;
}

export function deserializeTileMap(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > TILE_MAP_LIMITS.fileBytes) throw mapError('Map file is too large.');
  let envelope;
  try { envelope = JSON.parse(text); } catch { throw mapError('This is not a valid Tile Forge map file.'); }
  if (envelope?.contract !== 'PB-TILE-MAP-FILE-v1' || typeof envelope.checksum !== 'string') throw mapError('Unsupported map format.');
  const document = validateTileMap(envelope.document);
  if (digest(document) !== envelope.checksum) throw mapError('Map checksum mismatch; the current map was kept.');
  return document;
}

export function createMapHistory(present) { return { present, past: [], future: [] }; }
export function commitMapHistory(history, present) {
  if (present === history.present) return history;
  return { present, past: [...history.past.slice(-49), history.present], future: [] };
}
export function undoMapHistory(history) {
  if (!history.past.length) return history;
  return { present: history.past.at(-1), past: history.past.slice(0, -1), future: [history.present, ...history.future] };
}
export function redoMapHistory(history) {
  if (!history.future.length) return history;
  return { present: history.future[0], past: [...history.past, history.present], future: history.future.slice(1) };
}
