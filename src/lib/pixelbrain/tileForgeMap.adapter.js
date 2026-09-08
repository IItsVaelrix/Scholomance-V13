import { createMapAsset, addMapAssets, stampMapAsset, validateTileMap, mapError } from '../../../codex/core/pixelbrain/tile-forge/tile-forge.map.js';
import { synthesizeTileForgeTile, synthesizeTileForgeProp, synthesizeTileForgeAsset } from '../../../codex/core/pixelbrain/tile-forge/tile-forge.synthesizer.js';
import { compileTileForgeScdl } from '../../../codex/core/pixelbrain/tile-forge/tile-forge.scdl-generator.js';
import { TILE_FORGE_FOREST_ACTOR_TYPES } from '../../../codex/core/pixelbrain/tile-forge/tile-forge.forest-actor-synthesizer.js';
export * from '../../../codex/core/pixelbrain/tile-forge/tile-forge.map.js';

export const FORGE_ASSET_CHOICES = Object.freeze([
  { id: 'top', name: 'Surface tile', kind: 'terrain', family: 'tile' },
  { id: 'ground', name: 'Ground with soil', kind: 'terrain', family: 'tile' },
  { id: 'rim', name: 'Rim tile', kind: 'terrain', family: 'tile' },
  { id: 'cliff', name: 'Cliff tile', kind: 'terrain', family: 'tile' },
  { id: 'crystal_tree', name: 'Crystal tree', kind: 'prop', family: 'prop' },
  { id: 'void_pine', name: 'Pine', kind: 'prop', family: 'prop' },
  { id: 'hologram_fern', name: 'Fern', kind: 'prop', family: 'prop' },
  { id: 'void_flowers', name: 'Flowers', kind: 'prop', family: 'prop' },
  ...[
    ['grandfather_oak', 'Grandfather oak'], ['autumn_maple', 'Autumn maple'],
    ['stone_well', 'Stone well'], ['ancient_dolmen', 'Ancient dolmen'],
    ['timber_fence', 'Timber fence'], ['sunflower_patch', 'Sunflower patch'],
    ['ruined_structure', 'Ruined structure'], ['quiet_meadow', 'Meadow fabric'],
    ['organic_road', 'Flagstone road'], ['lotus_spring', 'Lotus spring'], ['mossy_cliff', 'Mossy cliff'],
  ].map(([id, name]) => ({ id, name, kind: ['quiet_meadow', 'organic_road', 'lotus_spring', 'mossy_cliff'].includes(id) ? 'terrain' : 'prop', family: 'asset' })),
  ...TILE_FORGE_FOREST_ACTOR_TYPES.filter(id => !['timber_fence', 'sunflower_patch'].includes(id)).map(id => ({ id, name: id.replaceAll('_', ' '), kind: 'prop', family: 'asset' })),
]);

function snapshot(buffer, choice, name) {
  const visual = buffer.visualBounds ?? buffer.assetSpec?.visualBounds;
  const logical = buffer.logicalFootprint ?? buffer.assetSpec?.logicalFootprint;
  return createMapAsset(buffer, {
    name: name || choice.name, kind: choice.kind,
    anchor: visual ? { x: Math.round(visual.anchorX * buffer.width), y: Math.round(visual.anchorY * buffer.height) } : undefined,
    footprint: logical ? { gridW: logical.gridW ?? logical.widthTiles ?? 1, gridH: logical.gridH ?? logical.heightTiles ?? 1 } : undefined,
  });
}

export function forgeMapAsset({ type, biome, seed, paletteFamily = 'scholomance_sunlit_glade' }) {
  const choice = FORGE_ASSET_CHOICES.find(c => c.id === type);
  if (!choice) throw mapError('Unknown Tile Forge asset type.');
  const buffer = choice.family === 'tile' ? synthesizeTileForgeTile({ type, biome, seed })
    : choice.family === 'prop' ? synthesizeTileForgeProp({ propType: type, biome, seed })
      : synthesizeTileForgeAsset({ semanticType: type, biome, paletteFamily, seed });
  return snapshot(buffer, choice, `${choice.name} · ${seed}`);
}

export function compileMapAsset({ source, name, kind, anchor, footprint, biome }) {
  if (!source.trim() || source.length > 65536) throw mapError('SCDL source must contain 1–65,536 characters.');
  const canvas = source.match(/^\s*CANVAS\s+WIDTH\s+(\d+)\s+HEIGHT\s+(\d+)\s*$/im);
  if (!canvas || Number(canvas[1]) > 512 || Number(canvas[2]) > 512) throw mapError('Declare a CANVAS no larger than 512 × 512.');
  const result = compileTileForgeScdl(source, { assetClass: kind, biome });
  return createMapAsset(result, { name, kind, anchor, footprint });
}

export function candidateMapAssets(candidate) {
  const textures = candidate?.layers?.scd128Synthesizer?.synthesizedTextures;
  if (!textures) throw mapError('Forge a chunk before adding its tiles.');
  // Alias names share buffers; enumerate the producer rather than imposing a fixed eight-tile ceiling.
  const seen = new Set();
  return Object.entries(textures).flatMap(([name, buffer]) => {
    if (seen.has(buffer)) return [];
    seen.add(buffer);
    const choice = FORGE_ASSET_CHOICES.find(c => c.id === name) || { name, kind: buffer.propType ? 'prop' : 'terrain' };
    return [{ key: name, asset: snapshot(buffer, choice, `${choice.name} · ${candidate.layers.scd128Synthesizer.seed}`) }];
  });
}

export function addCandidateToMap(map, candidate, includePlacements = false) {
  const entries = candidateMapAssets(candidate);
  let next = addMapAssets(map, entries.map(e => e.asset));
  if (!includePlacements) return next;
  const byKey = new Map(entries.map(e => [e.key, e.asset]));
  const iso = candidate.layers?.isoTile;
  const groups = [
    [candidate.intent?.hasGround !== false ? 'ground' : 'top', iso?.topPlane || [], 'terrain'],
    ['rim', iso?.rimCells || [], 'details'],
    ['cliff', Object.values(iso?.sidePlanes || {}).flat(), 'cliffs'],
  ];
  const vegetation = ['crystal_tree', 'void_pine', 'hologram_fern', 'void_flowers'];
  (candidate.layers?.fibonacciField?.seeds || []).forEach((point, n) => groups.push([vegetation[n % vegetation.length], [point], 'props']));
  let width = next.width;
  let height = next.height;
  for (const [key, points] of groups) {
    const asset = byKey.get(key);
    if (!asset) continue;
    for (const point of points) {
      width = Math.max(width, Math.round(point.x) + asset.footprint.gridW);
      height = Math.max(height, Math.round(point.y) + asset.footprint.gridH);
    }
  }
  const neededLayers = [...new Set(groups.filter(([, points]) => points.length).map(([, , layer]) => layer))];
  const missing = neededLayers.filter(id => !next.layers.some(l => l.id === id)).map(id => ({ id, name: id[0].toUpperCase() + id.slice(1), visible: true, locked: false }));
  next = validateTileMap({ ...next, width, height, layers: [...missing, ...next.layers] });
  for (const [key, points, preferredLayer] of groups) {
    const asset = byKey.get(key);
    if (!asset) continue;
    const layerId = next.layers.find(l => l.id === preferredLayer)?.id ?? next.layers[0].id;
    for (const point of points) next = stampMapAsset(next, { assetId: asset.id, layerId, x: Math.round(point.x), y: Math.round(point.y), z: Math.round(point.z || 0) });
  }
  return next;
}

export function mapAssetCanvas(asset) {
  const canvas = document.createElement('canvas');
  canvas.width = asset.width;
  canvas.height = asset.height;
  const bytes = new Uint8ClampedArray(asset.width * asset.height * 4);
  for (let n = 0; n < bytes.length; n += 1) bytes[n] = parseInt(asset.rgba.slice(n * 2, n * 2 + 2), 16);
  canvas.getContext('2d').putImageData(new ImageData(bytes, asset.width, asset.height), 0, 0);
  return canvas;
}

export function downloadMapFile(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'tile-forge'}.tilemap.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
