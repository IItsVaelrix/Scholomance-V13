import { describe, it, expect } from 'vitest';
import {
  createTileMap, createMapAsset, addMapAssets, stampMapAsset, moveMapInstance, eraseMapInstance,
  updateMapLayer, reorderMapLayer, validateTileMap, pickMapInstance, projectMapPoint, unprojectMapPoint,
  orderedMapInstances, mapStrokePoints, serializeTileMap, deserializeTileMap,
  createMapHistory, commitMapHistory, undoMapHistory, redoMapHistory,
} from '../../../codex/core/pixelbrain/tile-forge/tile-forge.map.js';
import { forgeMapAsset, compileMapAsset, addCandidateToMap, FORGE_ASSET_CHOICES } from '../../../src/lib/pixelbrain/tileForgeMap.adapter.js';
import { synthesizeTileForgeTile } from '../../../codex/core/pixelbrain/tile-forge/tile-forge.synthesizer.js';
import { assertEqual, assertTrue } from '../../qa/tools/bytecode-assertions.js';

const testContext = { testFile: 'tile-forge-map.test.js', testSuite: 'Tile Forge map integrity' };
const asset = (color = 32, name = 'Tile') => createMapAsset({ width: 2, height: 2, data: new Uint8ClampedArray([color, 40, 60, 255, 0, 0, 0, 0, color, 40, 60, 255, color, 40, 60, 255]), scdlSource: 'original source', bytecode: { bytes: [1, 2, 3] }, ampDescriptors: [], scd128Record: { scd128Wire: 'A'.repeat(128) } }, { name, kind: 'prop', anchor: { x: 0, y: 0 } });
const base = () => addMapAssets(createTileMap({ width: 8, height: 8 }), [asset()]);
const stamp = (map, overrides = {}) => stampMapAsset(map, { assetId: map.assets[0].id, layerId: 'terrain', x: 2, y: 2, z: 0, ...overrides });

describe('Tile Forge map editor contracts', () => {
  it('admits every exposed generator family with a compatible palette', () => {
    for (const choice of FORGE_ASSET_CHOICES) expect(forgeMapAsset({ type: choice.id, biome: 'void_forest', seed: 42 }).id).toMatch(/^asset-/);
  });
  it('imports a chunk beyond the initial map bounds and preserves ground and cliff as independent tiles', () => {
    const tile = synthesizeTileForgeTile({ type: 'ground' });
    const candidate = { intent: { hasGround: true }, layers: {
      scd128Synthesizer: { seed: 42, synthesizedTextures: { ground: tile, cliff: { ...tile, type: 'cliff' } } },
      isoTile: { topPlane: [{ x: 79, y: 39, z: 0 }], sidePlanes: { south: [{ x: 79, y: 39, z: 0 }] } },
    } };
    const map = addCandidateToMap(createTileMap(), candidate, true);
    expect(map.width).toBe(80); expect(map.height).toBe(40);
    expect(map.instances).toHaveLength(2);
    expect(new Set(map.instances.map(i => i.layerId))).toEqual(new Set(['cliffs', 'terrain']));
  });
  it('places separate instances while keeping source, pixels and SCD128 identity immutable', () => {
    const original = base(); const first = stamp(original); const second = stamp(first, { x: 3 });
    assertEqual(original.instances.length, 0, testContext);
    assertEqual(second.instances.length, 2, testContext);
    expect(new Set(second.instances.map(i => i.id)).size).toBe(2);
    expect(second.assets).toBe(original.assets);
    expect(Object.isFrozen(second.instances[0])).toBe(true);
    const moved = moveMapInstance(second, second.instances[0].id, { x: 5, y: 5, z: 2 });
    expect(moved.assets[0]).toBe(second.assets[0]);
    expect(second.instances[0].x).toBe(2);
  });
  it('deduplicates identical assets but distinguishes pixel changes even when the SCD128 wire matches', () => {
    const map = addMapAssets(base(), [asset(32, 'Renamed'), asset(33)]);
    expect(map.assets).toHaveLength(2);
    expect(map.assets[0].scd128Record.scd128Wire).toBe(map.assets[1].scd128Record.scd128Wire);
    expect(map.assets[0].id).not.toBe(map.assets[1].id);
  });
  it('replaces only the same layer/cell/elevation and suppresses redundant brush stamps', () => {
    const first = stamp(base()); expect(stamp(first)).toBe(first);
    let map = stamp(first, { layerId: 'props' }); map = stamp(map, { z: 1 });
    const other = asset(90); map = addMapAssets(map, [other]); map = stamp(map, { assetId: other.id });
    expect(map.instances).toHaveLength(3);
    expect(map.instances.find(i => i.id === first.instances[0].id).assetId).toBe(other.id);
  });
  it('rejects editing hidden or locked layers and rejects out-of-bounds footprints', () => {
    const initial = stamp(base()); const id = initial.instances[0].id;
    const locked = updateMapLayer(initial, 'terrain', { locked: true });
    for (const operation of [() => stamp(locked), () => eraseMapInstance(locked, id), () => moveMapInstance(locked, id, { x: 3 })]) expect(operation).toThrow(/unlocked/);
    expect(() => stamp(updateMapLayer(base(), 'terrain', { visible: false }))).toThrow(/visible/);
    expect(() => stamp(base(), { x: -1 })).toThrow(); expect(() => stamp(base(), { z: 33 })).toThrow();
    const large = createMapAsset({ ...asset(), data: new Uint8ClampedArray(16) }, { kind: 'prop', anchor: { x: 0, y: 0 }, footprint: { gridW: 2, gridH: 2 } });
    expect(() => stamp(addMapAssets(base(), [large]), { assetId: large.id, x: 7 })).toThrow(/footprint/);
    expect(() => validateTileMap({ ...initial, width: 2 })).toThrow(/footprint/);
  });
  it('round-trips grid centers and diamond boundaries at every supported elevation', () => {
    const map = base();
    for (const z of [-16, 0, 2, 32]) for (const x of [0, 3, 7]) for (const y of [0, 2, 7]) {
      expect(unprojectMapPoint(map, projectMapPoint(map, { x, y, z }), z)).toEqual({ x, y, z });
    }
    expect(unprojectMapPoint(map, { x: 19, y: 9 })).toEqual({ x: 0, y: 0, z: 0 });
  });
  it('picks only opaque pixels on visible layers and respects explicit layer order', () => {
    const ground = stamp(base()); const stacked = stamp(ground, { layerId: 'props' });
    const p = projectMapPoint(stacked, stacked.instances[0]);
    expect(pickMapInstance(stacked, p).layerId).toBe('props');
    expect(pickMapInstance(stacked, p, 'terrain').layerId).toBe('terrain');
    expect(pickMapInstance(stacked, { x: p.x + 1, y: p.y })).toBeNull();
    expect(pickMapInstance(updateMapLayer(stacked, 'props', { visible: false }), p).layerId).toBe('terrain');
    const reordered = reorderMapLayer(reorderMapLayer(stacked, 'terrain', 1), 'terrain', 1);
    expect(pickMapInstance(reordered, p).layerId).toBe('terrain');
    expect(orderedMapInstances(stacked).at(-1).layerId).toBe('props');
  });
  it('commits an interpolated stroke as one reversible edit and clears redo after a branch', () => {
    const original = base(); let map = original;
    for (const p of mapStrokePoints({ x: 0, y: 0 }, { x: 7, y: 2, z: 0 })) map = stamp(map, p);
    expect(map.instances).toHaveLength(8);
    const history = commitMapHistory(createMapHistory(original), map);
    expect(undoMapHistory(history).present).toBe(original);
    expect(redoMapHistory(undoMapHistory(history)).present).toBe(map);
    expect(commitMapHistory(undoMapHistory(history), stamp(original)).future).toHaveLength(0);
  });
  it('round-trips a generated SCDL V2 asset without rerunning the compiler or altering evidence', () => {
    const tile = forgeMapAsset({ type: 'ground', biome: 'void_forest', seed: 42 });
    const map = stamp(addMapAssets(createTileMap(), [tile]));
    const encoded = serializeTileMap(map); const decoded = deserializeTileMap(encoded);
    assertEqual(serializeTileMap(decoded), encoded, testContext);
    assertTrue(decoded.assets[0].scdlSource.startsWith('SCDL 2'), testContext);
    expect(decoded.assets[0].rgba).toBe(tile.rgba);
    expect(decoded.assets[0].bytecode).toEqual(tile.bytecode);
    expect(decoded.assets[0].scd128Record).toEqual(tile.scd128Record);
    expect(decoded.assets[0].ampDescriptors).toEqual(tile.ampDescriptors);
  });
  it('fails closed on corruption, duplicate IDs, unknown fields and missing references', () => {
    const map = stamp(base()); const envelope = JSON.parse(serializeTileMap(map));
    envelope.document.name = 'Tampered'; expect(() => deserializeTileMap(JSON.stringify(envelope))).toThrow(/checksum/);
    expect(() => deserializeTileMap('{')).toThrow(/valid/);
    expect(() => validateTileMap({ ...map, assets: [map.assets[0], map.assets[0]] })).toThrow(/Duplicate/);
    expect(() => validateTileMap({ ...map, injected: true })).toThrow();
    expect(() => validateTileMap({ ...map, assets: [] })).toThrow(/missing/);
    expect(() => validateTileMap({ ...map, assets: [{ ...map.assets[0], rgba: 'ffffffff'.repeat(4) }] })).toThrow(/integrity/);
  });
  it('compiles explicit custom source and enforces source and canvas input limits', () => {
    const source = 'SCDL 2\nASSET custom\nCANVAS WIDTH 80 HEIGHT 40\nSHAPE $p (PIXEL AT (VEC2 (PX 40) (PX 20)))\nLAYER sprite ORDER 10 BLEND REPLACE { PAINT $p FILL #65d5bc RASTER CENTER }';
    const a = compileMapAsset({ source, name: 'Custom', kind: 'terrain' });
    expect(a.width).toBe(80); expect(a.scdlSource).toBe(source);
    expect(() => compileMapAsset({ source: source.replace('WIDTH 80', 'WIDTH 99999') })).toThrow(/512/);
    expect(() => compileMapAsset({ source: 'x'.repeat(65537) })).toThrow(/65,536/);
  });
});
