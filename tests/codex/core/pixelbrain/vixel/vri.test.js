/**
 * VRI Test Suite v2 — Vixel Render IR
 *
 * Covers all 5 QA fixes:
 *   1. Scene-graph input preservation
 *   2. True content-addressed checksums
 *   3. Material seed diversity (fnv1aNum bug)
 *   4. Object-space texture coherence
 *   5. Art-gene expressiveness (binding channels)
 *
 * Plus: schema, compiler, renderer, determinism, blend modes, lighting, texture.
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  VRI_VERSION, LAYER_TYPES, BLEND_MODES, TEXTURE_KINDS, LIGHT_KINDS, QUANTIZATION_MODES,
  createGeometryLayer, createTextureLayer, createMarkLayer,
  createRasterPatchLayer, createVRIScene,
} from '../../../../../codex/core/pixelbrain/vixel/vri-schema.js';
import { compileVRI, fnv1aNum, fnv1aHex } from '../../../../../codex/core/pixelbrain/vixel/vri-compiler.js';
import { renderVRI } from '../../../../../codex/core/pixelbrain/vixel/vri-renderer.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makeTestPacket() {
  return {
    id: 'test-sword-001',
    canvas: { width: 12, height: 32 },
    geometry: {
      mode: 'coordinates',
      coordinates: [
        { x: 5, y: 2, color: '#8A9BB0', partId: 'blade', material: 'steel', signedDistance: -1.2, t: 0.1, tangent: [0, 1], normal: [1, 0], curvature: 0.0, arcLength: 30 },
        { x: 6, y: 2, color: '#8A9BB0', partId: 'blade', material: 'steel', signedDistance: -0.8, t: 0.1, tangent: [0, 1], normal: [1, 0], curvature: 0.0, arcLength: 30 },
        { x: 5, y: 3, color: '#8A9BB0', partId: 'blade', material: 'steel', signedDistance: -1.0, t: 0.15, tangent: [0, 1], normal: [1, 0], curvature: 0.0, arcLength: 30 },
        { x: 6, y: 3, color: '#8A9BB0', partId: 'blade', material: 'steel', signedDistance: -0.6, t: 0.15, tangent: [0, 1], normal: [1, 0], curvature: 0.0, arcLength: 30 },
        { x: 4, y: 20, color: '#4A4A52', partId: 'guard', material: 'iron', signedDistance: -0.5, t: 0.5, tangent: [1, 0], normal: [0, -1], curvature: 0.0, arcLength: 8 },
        { x: 5, y: 20, color: '#4A4A52', partId: 'guard', material: 'iron', signedDistance: -0.3, t: 0.5, tangent: [1, 0], normal: [0, -1], curvature: 0.0, arcLength: 8 },
        { x: 6, y: 20, color: '#4A4A52', partId: 'guard', material: 'iron', signedDistance: -0.3, t: 0.5, tangent: [1, 0], normal: [0, -1], curvature: 0.0, arcLength: 8 },
        { x: 7, y: 20, color: '#4A4A52', partId: 'guard', material: 'iron', signedDistance: -0.5, t: 0.5, tangent: [1, 0], normal: [0, -1], curvature: 0.0, arcLength: 8 },
        { x: 5, y: 28, color: '#B8963C', partId: 'pommel', material: 'gold', signedDistance: -0.4, t: 0.3, tangent: [1, 0], normal: [0, -1], curvature: 1.5, arcLength: 6 },
        { x: 6, y: 28, color: '#B8963C', partId: 'pommel', material: 'gold', signedDistance: -0.4, t: 0.7, tangent: [1, 0], normal: [0, -1], curvature: 1.5, arcLength: 6 },
      ],
    },
  };
}

function makeTestGenes() {
  return [
    {
      geneId: 'edge-highlight',
      geneType: 'art-direction',
      geometryHints: {
        color: '#C8D8E8',
        cells: [
          { x: 5, y: 2, pressure: 0.9 },
          { x: 5, y: 3, pressure: 0.8 },
        ],
      },
    },
  ];
}

function makeCoord(x, y, color, material) {
  return { x, y, color, partId: 'test', material, signedDistance: -0.5, t: 0.5, tangent: [1, 0], normal: [0, -1], curvature: 0, arcLength: 10 };
}

function makeMinimalPacket(coords) {
  return {
    id: 'test-minimal',
    canvas: { width: 8, height: 8 },
    geometry: { mode: 'coordinates', coordinates: coords },
  };
}

// ─── Schema Tests ────────────────────────────────────────────────────────────

describe('VRI Schema', () => {
  it('exports correct version', () => {
    expect(VRI_VERSION).toBe('PB-VRI-v1');
  });

  it('freezes layer types', () => {
    expect(Object.isFrozen(LAYER_TYPES)).toBe(true);
    expect(LAYER_TYPES.GEOMETRY).toBe('geometry');
    expect(LAYER_TYPES.TEXTURE_FIELD).toBe('texture');
    expect(LAYER_TYPES.MARK).toBe('mark');
    expect(LAYER_TYPES.RASTER_PATCH).toBe('raster');
  });

  it('creates frozen geometry layer', () => {
    const layer = createGeometryLayer('geo', [{ x: 0, y: 0, color: '#FF0000' }]);
    expect(Object.isFrozen(layer)).toBe(true);
    expect(layer.type).toBe(LAYER_TYPES.GEOMETRY);
    expect(layer.blendMode).toBe(BLEND_MODES.NORMAL);
    expect(layer.opacity).toBe(1.0);
    expect(layer.payload.coordinates).toHaveLength(1);
  });

  it('creates frozen texture layer with defaults', () => {
    const layer = createTextureLayer('tex-bark', TEXTURE_KINDS.BARK);
    expect(Object.isFrozen(layer)).toBe(true);
    expect(layer.type).toBe(LAYER_TYPES.TEXTURE_FIELD);
    expect(layer.payload.kind).toBe('bark');
    expect(layer.payload.octaves).toBe(3);
    expect(layer.blendMode).toBe(BLEND_MODES.OVERLAY);
  });

  it('creates texture layer with coordinateSpace (Fix #4)', () => {
    const layer = createTextureLayer('tex-water', TEXTURE_KINDS.WATER, { coordinateSpace: 'surface' });
    expect(layer.payload.coordinateSpace).toBe('surface');
  });

  it('defaults coordinateSpace to object', () => {
    const layer = createTextureLayer('tex-bark', TEXTURE_KINDS.BARK);
    expect(layer.payload.coordinateSpace).toBe('object');
  });

  it('creates frozen mark layer', () => {
    const marks = [{ x: 1, y: 1, pressure: 0.5 }];
    const layer = createMarkLayer('mark-1', 'stamp', marks, { color: '#FFD700' });
    expect(Object.isFrozen(layer)).toBe(true);
    expect(layer.payload.marks).toHaveLength(1);
    expect(layer.payload.color).toBe('#FFD700');
  });

  it('creates frozen raster patch layer', () => {
    const pixels = [{ x: 0, y: 0, color: '#FF0000', alpha: 1.0 }];
    const layer = createRasterPatchLayer('patch-1', pixels);
    expect(Object.isFrozen(layer)).toBe(true);
    expect(layer.type).toBe(LAYER_TYPES.RASTER_PATCH);
  });

  it('creates frozen scene', () => {
    const scene = createVRIScene(16, 24, [], [], null, {});
    expect(Object.isFrozen(scene)).toBe(true);
    expect(scene.version).toBe(VRI_VERSION);
    expect(scene.width).toBe(16);
    expect(scene.height).toBe(24);
  });
});

// ─── Fix #3: Material Seed Diversity ─────────────────────────────────────────

describe('Fix #3: fnv1aNum seed diversity', () => {
  it('fnv1aNum returns a numeric uint32', () => {
    const h = fnv1aNum('steel');
    expect(typeof h).toBe('number');
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xFFFFFFFF);
  });

  it('fnv1aHex returns an 8-char hex string', () => {
    const h = fnv1aHex('steel');
    expect(typeof h).toBe('string');
    expect(h).toMatch(/^[0-9a-f]{8}$/);
  });

  it('fnv1aNum and fnv1aHex are consistent', () => {
    const n = fnv1aNum('gold');
    const h = fnv1aHex('gold');
    expect(h).toBe(n.toString(16).padStart(8, '0'));
  });

  it('assigns distinct nonzero deterministic seeds', () => {
    const packet = makeMinimalPacket([
      makeCoord(1, 1, '#8B4513', 'bark'),
      makeCoord(2, 2, '#228B22', 'pine_needle'),
      makeCoord(3, 3, '#9966CC', 'amethyst'),
    ]);
    const scene = compileVRI(packet);
    const seeds = scene.layers
      .filter(layer => layer.type === LAYER_TYPES.TEXTURE_FIELD)
      .map(layer => layer.payload.seed);

    // All seeds must be integers
    expect(seeds.every(Number.isInteger)).toBe(true);
    // All seeds must be nonzero (the old bug made them all 0)
    expect(seeds.every(seed => seed !== 0)).toBe(true);
    // All seeds must be distinct
    expect(new Set(seeds).size).toBe(seeds.length);
  });

  it('bitwise AND on fnv1aNum works correctly (regression)', () => {
    // The old bug: fnv1a returned hex string, "53da78e3" & 0xFFFF = NaN & 0xFFFF = 0
    const seed = fnv1aNum('bark') & 0xFFFF;
    expect(seed).not.toBe(0);
    expect(seed).toBeGreaterThan(0);
    expect(seed).toBeLessThanOrEqual(0xFFFF);
  });

  it('same material always produces same seed (determinism)', () => {
    const s1 = fnv1aNum('steel') & 0xFFFF;
    const s2 = fnv1aNum('steel') & 0xFFFF;
    expect(s1).toBe(s2);
  });
});

// ─── Fix #2: True Content-Addressed Checksums ────────────────────────────────

describe('Fix #2: content-addressed checksums', () => {
  it('changes checksum when visual values change without structural changes', () => {
    const red = compileVRI(makeMinimalPacket([makeCoord(1, 1, '#FF0000', 'bark')]));
    const cyan = compileVRI(makeMinimalPacket([makeCoord(1, 1, '#00FFFF', 'bark')]));
    expect(red.checksum).not.toBe(cyan.checksum);
  });

  it('changes checksum when light intensity changes', () => {
    const packet = makeTestPacket();
    const a = compileVRI(packet, { lighting: { key: { intensity: 0.5 } } });
    const b = compileVRI(packet, { lighting: { key: { intensity: 0.9 } } });
    expect(a.checksum).not.toBe(b.checksum);
  });

  it('changes checksum when light color changes', () => {
    const packet = makeTestPacket();
    const a = compileVRI(packet, { lighting: { key: { color: '#FFFFFF' } } });
    const b = compileVRI(packet, { lighting: { key: { color: '#FF8800' } } });
    expect(a.checksum).not.toBe(b.checksum);
  });

  it('changes checksum when texture amplitude changes', () => {
    // Different materials → different texture params → different checksum
    const a = compileVRI(makeMinimalPacket([makeCoord(1, 1, '#888', 'steel')]));
    const b = compileVRI(makeMinimalPacket([makeCoord(1, 1, '#888', 'bark')]));
    expect(a.checksum).not.toBe(b.checksum);
  });

  it('changes checksum when atmosphere density changes', () => {
    const packet = makeTestPacket();
    const a = compileVRI(packet, { atmosphere: { fog: { color: '#1A1A2E', density: 0.2, near: 0, far: 32 }, bloom: null, grading: null } });
    const b = compileVRI(packet, { atmosphere: { fog: { color: '#1A1A2E', density: 0.8, near: 0, far: 32 }, bloom: null, grading: null } });
    expect(a.checksum).not.toBe(b.checksum);
  });

  it('changes checksum when raster-patch alpha changes', () => {
    const packet = makeTestPacket();
    const a = compileVRI(packet, { rasterPatches: [{ id: 'p', pixels: [{ x: 0, y: 0, color: '#FF0000', alpha: 0.5 }] }] });
    const b = compileVRI(packet, { rasterPatches: [{ id: 'p', pixels: [{ x: 0, y: 0, color: '#FF0000', alpha: 1.0 }] }] });
    expect(a.checksum).not.toBe(b.checksum);
  });

  it('changes checksum when mark width changes', () => {
    const packet = makeTestPacket();
    const geneA = [{ geneId: 'g', geometryHints: { color: '#FFF', cells: [{ x: 5, y: 2, pressure: 1.0, width: 1.0 }] } }];
    const geneB = [{ geneId: 'g', geometryHints: { color: '#FFF', cells: [{ x: 5, y: 2, pressure: 1.0, width: 2.0 }] } }];
    const a = compileVRI(packet, { artGenes: geneA });
    const b = compileVRI(packet, { artGenes: geneB });
    expect(a.checksum).not.toBe(b.checksum);
  });

  it('same input always produces same checksum (determinism)', () => {
    const packet = makeTestPacket();
    const a = compileVRI(packet, { artGenes: makeTestGenes() });
    const b = compileVRI(packet, { artGenes: makeTestGenes() });
    expect(a.checksum).toBe(b.checksum);
    expect(a.id).toBe(b.id);
  });
});

// ─── Fix #1: Scene-Graph Input Preservation ──────────────────────────────────

describe('Fix #1: scene-graph input preservation', () => {
  it('accepts pre-lowered coordinates for scene-graph packets', () => {
    const packet = {
      id: 'graph-test',
      canvas: { width: 32, height: 32 },
      geometry: {
        mode: 'scene-graph',
        sceneGraph: { contract: 'PB-SCENE-GRAPH-v1', defs: {}, groups: [] },
        coordinates: [], // empty by design for scene-graph mode
      },
    };
    const lowered = [
      { x: 8, y: 8, color: '#FFD700', partId: 'dot', material: 'gold' },
      { x: 9, y: 8, color: '#FFD700', partId: 'dot', material: 'gold' },
      { x: 18, y: 12, color: '#FFD700', partId: 'dot', material: 'gold' },
    ];
    const scene = compileVRI(packet, { loweredCoordinates: lowered });
    const geoLayer = scene.layers.find(l => l.type === LAYER_TYPES.GEOMETRY);
    expect(geoLayer.payload.coordinates).toHaveLength(3);
    expect(scene.provenance.geometryMode).toBe('scene-graph');
  });

  it('throws explicit diagnostic when scene-graph has no lowered coords', () => {
    const packet = {
      id: 'graph-empty',
      canvas: { width: 16, height: 16 },
      geometry: {
        mode: 'scene-graph',
        sceneGraph: { contract: 'PB-SCENE-GRAPH-v1', defs: {}, groups: [] },
        coordinates: [],
      },
    };
    expect(() => compileVRI(packet)).toThrow(/scene-graph packet requires lowered coordinates/);
  });

  it('throws when sceneGraph is missing entirely', () => {
    const packet = {
      id: 'graph-missing',
      canvas: { width: 16, height: 16 },
      geometry: { mode: 'scene-graph', coordinates: [] },
    };
    expect(() => compileVRI(packet)).toThrow(/sceneGraph is missing/);
  });

  it('throws on unsupported scene-graph contract', () => {
    const packet = {
      id: 'graph-bad-contract',
      canvas: { width: 16, height: 16 },
      geometry: {
        mode: 'scene-graph',
        sceneGraph: { contract: 'PB-SCENE-GRAPH-v99', defs: {}, groups: [] },
        coordinates: [],
      },
    };
    expect(() => compileVRI(packet, { loweredCoordinates: [{ x: 0, y: 0, color: '#FFF' }] })).toThrow(/unsupported scene-graph contract/);
  });

  it('never quietly produces empty geometry from scene-graph', () => {
    const packet = {
      id: 'graph-silent',
      canvas: { width: 16, height: 16 },
      geometry: {
        mode: 'scene-graph',
        sceneGraph: { contract: 'PB-SCENE-GRAPH-v1', defs: {}, groups: [] },
        coordinates: [],
      },
    };
    // Must throw, not return empty scene
    expect(() => compileVRI(packet)).toThrow();
  });

  it('flat coordinate packets still work unchanged', () => {
    const scene = compileVRI(makeTestPacket());
    const geoLayer = scene.layers.find(l => l.type === LAYER_TYPES.GEOMETRY);
    expect(geoLayer.payload.coordinates).toHaveLength(10);
    expect(scene.provenance.geometryMode).toBe('coordinates');
  });
});

// ─── Fix #4: Object-Space Texture Coherence ──────────────────────────────────

describe('Fix #4: texture coordinate space', () => {
  it('assigns object space to bark textures', () => {
    const packet = makeMinimalPacket([makeCoord(1, 1, '#8B4513', 'bark')]);
    const scene = compileVRI(packet);
    const texLayer = scene.layers.find(l => l.type === LAYER_TYPES.TEXTURE_FIELD && l.id === 'tex-bark');
    expect(texLayer).toBeTruthy();
    expect(texLayer.payload.coordinateSpace).toBe('object');
  });

  it('assigns surface space to water textures', () => {
    const packet = makeMinimalPacket([makeCoord(1, 1, '#4488CC', 'slime_gel')]);
    const scene = compileVRI(packet);
    const texLayer = scene.layers.find(l => l.type === LAYER_TYPES.TEXTURE_FIELD);
    expect(texLayer).toBeTruthy();
    expect(texLayer.payload.coordinateSpace).toBe('surface');
  });

  it('assigns world space to cloud textures', () => {
    const packet = makeMinimalPacket([makeCoord(1, 1, '#FFAA00', 'holy_fire')]);
    const scene = compileVRI(packet);
    const texLayer = scene.layers.find(l => l.type === LAYER_TYPES.TEXTURE_FIELD);
    expect(texLayer).toBeTruthy();
    expect(texLayer.payload.coordinateSpace).toBe('world');
  });

  it('assigns object space to metal textures', () => {
    const packet = makeMinimalPacket([makeCoord(1, 1, '#888', 'steel')]);
    const scene = compileVRI(packet);
    const texLayer = scene.layers.find(l => l.type === LAYER_TYPES.TEXTURE_FIELD);
    expect(texLayer).toBeTruthy();
    expect(texLayer.payload.coordinateSpace).toBe('object');
  });

  it('object-space texture differs from world-space for same cell', () => {
    // Two cells with same position but different tangent → object-space gives different grain
    const cellA = { x: 3, y: 3, color: '#8B4513', partId: 'a', material: 'bark', signedDistance: -0.5, t: 0.0, tangent: [0, 1], normal: [1, 0], curvature: 0, arcLength: 10 };
    const cellB = { x: 3, y: 3, color: '#8B4513', partId: 'b', material: 'bark', signedDistance: -0.5, t: 0.9, tangent: [1, 0], normal: [0, -1], curvature: 0, arcLength: 10 };

    const sceneA = compileVRI(makeMinimalPacket([cellA]));
    const sceneB = compileVRI(makeMinimalPacket([cellB]));
    const rA = renderVRI(sceneA, 4);
    const rB = renderVRI(sceneB, 4);

    // Sample the same pixel — object-space should give different grain
    const idx = (3 * 4 * 32 + 3 * 4) * 4;
    const diff = Math.abs(rA.data[idx] - rB.data[idx]) +
                 Math.abs(rA.data[idx + 1] - rB.data[idx + 1]) +
                 Math.abs(rA.data[idx + 2] - rB.data[idx + 2]);
    expect(diff).toBeGreaterThan(0);
  });
});

// ─── Fix #5: Art-Gene Expressiveness (Binding Channels) ──────────────────────

describe('Fix #5: gene-binding channels', () => {
  it('increase-rim binding adds or boosts rim light', () => {
    const genes = [{
      geneId: 'sacred-verticality',
      bindings: [{ channel: 'lighting', operation: 'increase-rim', amount: 0.25 }],
    }];
    const scene = compileVRI(makeTestPacket(), { artGenes: genes });
    const rimLights = scene.lights.filter(l => l.kind === LIGHT_KINDS.RIM);
    expect(rimLights.length).toBeGreaterThanOrEqual(1);
    // Default has no rim, so gene should add one
    const geneRim = rimLights.find(l => l.id.includes('gene-rim'));
    expect(geneRim).toBeTruthy();
    expect(geneRim.intensity).toBeCloseTo(0.25);
  });

  it('add-glow binding adds a point light', () => {
    const genes = [{
      geneId: 'pommel-glow',
      bindings: [{
        channel: 'lighting',
        operation: 'add-glow',
        amount: 0.8,
        targets: { position: [6, 28], color: '#FFD700', radius: 4 },
      }],
    }];
    const scene = compileVRI(makeTestPacket(), { artGenes: genes });
    const glow = scene.lights.find(l => l.id.includes('gene-glow'));
    expect(glow).toBeTruthy();
    expect(glow.kind).toBe(LIGHT_KINDS.POINT);
    expect(glow.intensity).toBeCloseTo(0.8);
    expect(glow.color).toBe('#FFD700');
  });

  it('add-fog binding sets atmosphere fog', () => {
    const genes = [{
      geneId: 'misty-depth',
      bindings: [{ channel: 'atmosphere', operation: 'add-fog', amount: 0.4 }],
    }];
    const scene = compileVRI(makeTestPacket(), { artGenes: genes });
    expect(scene.atmosphere.fog).toBeTruthy();
    expect(scene.atmosphere.fog.density).toBeCloseTo(0.4);
  });

  it('increase-bloom binding sets atmosphere bloom', () => {
    const genes = [{
      geneId: 'holy-bloom',
      bindings: [{ channel: 'atmosphere', operation: 'increase-bloom', amount: 0.6 }],
    }];
    const scene = compileVRI(makeTestPacket(), { artGenes: genes });
    expect(scene.atmosphere.bloom).toBeTruthy();
    expect(scene.atmosphere.bloom.intensity).toBeCloseTo(0.6);
  });

  it('increase-grain binding boosts texture amplitude', () => {
    const genes = [{
      geneId: 'rough-bark',
      bindings: [{
        channel: 'texture',
        operation: 'increase-grain',
        amount: 0.5,
        targets: { materials: ['bark'] },
      }],
    }];
    const packet = makeMinimalPacket([makeCoord(1, 1, '#8B4513', 'bark')]);
    const sceneNoGene = compileVRI(packet);
    const sceneWithGene = compileVRI(packet, { artGenes: genes });

    const texNoGene = sceneNoGene.layers.find(l => l.id === 'tex-bark');
    const texWithGene = sceneWithGene.layers.find(l => l.id === 'tex-bark');

    expect(texWithGene.payload.amplitude).toBeGreaterThan(texNoGene.payload.amplitude);
    expect(texWithGene.payload.octaves).toBeGreaterThan(texNoGene.payload.octaves);
  });

  it('sharpen contour binding reduces AA width', () => {
    const genes = [{
      geneId: 'crisp-edges',
      bindings: [{ channel: 'contour', operation: 'sharpen', amount: 0.4 }],
    }];
    const scene = compileVRI(makeTestPacket(), { artGenes: genes });
    const geoLayer = scene.layers.find(l => l.type === LAYER_TYPES.GEOMETRY);
    expect(geoLayer.payload.aaWidth).toBeLessThan(1.0);
  });

  it('soften contour binding increases AA width', () => {
    const genes = [{
      geneId: 'soft-dream',
      bindings: [{ channel: 'contour', operation: 'soften', amount: 0.4 }],
    }];
    const scene = compileVRI(makeTestPacket(), { artGenes: genes });
    const geoLayer = scene.layers.find(l => l.type === LAYER_TYPES.GEOMETRY);
    expect(geoLayer.payload.aaWidth).toBeGreaterThan(1.0);
  });

  it('geometry bindings are recorded as intents (not applied directly)', () => {
    const genes = [{
      geneId: 'tower-stretch',
      bindings: [{ channel: 'geometry', operation: 'elongate', amount: 0.15 }],
    }];
    const scene = compileVRI(makeTestPacket(), { artGenes: genes });
    expect(scene.provenance.geometryIntents).toHaveLength(1);
    expect(scene.provenance.geometryIntents[0].operation).toBe('elongate');
  });

  it('palette bindings are recorded as intents', () => {
    const genes = [{
      geneId: 'warm-palette',
      bindings: [{ channel: 'palette', operation: 'shift-hue', amount: 0.1 }],
    }];
    const scene = compileVRI(makeTestPacket(), { artGenes: genes });
    expect(scene.provenance.paletteIntents).toHaveLength(1);
  });

  it('multiple bindings from one gene all apply', () => {
    const genes = [{
      geneId: 'sacred-verticality',
      bindings: [
        { channel: 'geometry', operation: 'elongate', amount: 0.15 },
        { channel: 'contour', operation: 'sharpen', amount: 0.2 },
        { channel: 'lighting', operation: 'increase-rim', amount: 0.25 },
      ],
    }];
    const scene = compileVRI(makeTestPacket(), { artGenes: genes });
    expect(scene.provenance.geometryIntents).toHaveLength(1);
    expect(scene.provenance.geneBindingCount).toBe(3);
    const rimLights = scene.lights.filter(l => l.kind === LIGHT_KINDS.RIM);
    expect(rimLights.length).toBeGreaterThanOrEqual(1);
    const geoLayer = scene.layers.find(l => l.type === LAYER_TYPES.GEOMETRY);
    expect(geoLayer.payload.aaWidth).toBeLessThan(1.0);
  });

  it('genes without bindings still work (backward compat)', () => {
    const scene = compileVRI(makeTestPacket(), { artGenes: makeTestGenes() });
    const markLayers = scene.layers.filter(l => l.type === LAYER_TYPES.MARK);
    expect(markLayers).toHaveLength(1);
    expect(scene.provenance.geneBindingCount).toBe(0);
  });
});

// ─── Compiler Tests ──────────────────────────────────────────────────────────

describe('VRI Compiler', () => {
  it('compiles a packet into a valid VRI scene', () => {
    const packet = makeTestPacket();
    const scene = compileVRI(packet);

    expect(scene.version).toBe(VRI_VERSION);
    expect(scene.width).toBe(12);
    expect(scene.height).toBe(32);
    expect(scene.checksum).toBeTruthy();
    expect(scene.id).toContain('vri-');
  });

  it('creates geometry layer from packet coordinates', () => {
    const scene = compileVRI(makeTestPacket());
    const geoLayer = scene.layers.find(l => l.type === LAYER_TYPES.GEOMETRY);
    expect(geoLayer).toBeTruthy();
    expect(geoLayer.payload.coordinates).toHaveLength(10);
  });

  it('creates texture layers for materials in scene', () => {
    const scene = compileVRI(makeTestPacket());
    const texLayers = scene.layers.filter(l => l.type === LAYER_TYPES.TEXTURE_FIELD);
    expect(texLayers.length).toBe(3);
    expect(texLayers.every(l => l.payload.kind === TEXTURE_KINDS.METAL_GRAIN)).toBe(true);
  });

  it('creates mark layers from art genes', () => {
    const scene = compileVRI(makeTestPacket(), { artGenes: makeTestGenes() });
    const markLayers = scene.layers.filter(l => l.type === LAYER_TYPES.MARK);
    expect(markLayers).toHaveLength(1);
    expect(markLayers[0].payload.marks).toHaveLength(2);
  });

  it('creates default lights when none specified', () => {
    const scene = compileVRI(makeTestPacket());
    expect(scene.lights.length).toBe(2);
    expect(scene.lights[0].kind).toBe(LIGHT_KINDS.DIRECTIONAL);
    expect(scene.lights[1].kind).toBe(LIGHT_KINDS.AMBIENT);
  });

  it('uses custom lighting when provided', () => {
    const scene = compileVRI(makeTestPacket(), {
      lighting: {
        key: { position: [3, 1], direction: [-1, -1], intensity: 0.9 },
        rim: { color: '#88CCFF', intensity: 0.5 },
        points: [{ position: [6, 28], color: '#FFD700', radius: 5, intensity: 0.7 }],
      },
    });
    expect(scene.lights.length).toBe(3);
    expect(scene.lights[0].kind).toBe(LIGHT_KINDS.DIRECTIONAL);
    expect(scene.lights[1].kind).toBe(LIGHT_KINDS.RIM);
    expect(scene.lights[2].kind).toBe(LIGHT_KINDS.POINT);
  });

  it('integrates raster patches', () => {
    const patches = [{ id: 'patch-1', pixels: [{ x: 0, y: 0, color: '#FF0000' }] }];
    const scene = compileVRI(makeTestPacket(), { rasterPatches: patches });
    const rasterLayers = scene.layers.filter(l => l.type === LAYER_TYPES.RASTER_PATCH);
    expect(rasterLayers).toHaveLength(1);
  });

  it('is deterministic (same input → same checksum)', () => {
    const packet = makeTestPacket();
    const scene1 = compileVRI(packet);
    const scene2 = compileVRI(packet);
    expect(scene1.checksum).toBe(scene2.checksum);
    expect(scene1.id).toBe(scene2.id);
  });

  it('records provenance metadata', () => {
    const scene = compileVRI(makeTestPacket(), { artGenes: makeTestGenes() });
    expect(scene.provenance.compiler).toBe('PB-VRI-COMPILE-v2');
    expect(scene.provenance.geneCount).toBe(1);
    expect(scene.provenance.materialCount).toBe(3);
    expect(scene.provenance.textureLayerCount).toBe(3);
    expect(scene.provenance.markLayerCount).toBe(1);
  });
});

// ─── Renderer Tests ──────────────────────────────────────────────────────────

describe('VRI Renderer', () => {
  it('renders a scene to RGBA buffer', () => {
    const scene = compileVRI(makeTestPacket());
    const result = renderVRI(scene, 4);

    expect(result.width).toBe(48);
    expect(result.height).toBe(128);
    expect(result.data).toBeInstanceOf(Uint8Array);
    expect(result.data.length).toBe(48 * 128 * 4);
  });

  it('produces non-zero pixels where geometry exists', () => {
    const scene = compileVRI(makeTestPacket());
    const result = renderVRI(scene, 4);

    const idx = (8 * 48 + 20) * 4;
    expect(result.data[idx + 3]).toBeGreaterThan(0);
  });

  it('produces transparent pixels where no geometry exists', () => {
    const scene = compileVRI(makeTestPacket());
    const result = renderVRI(scene, 4);

    const idx = 0;
    expect(result.data[idx + 3]).toBe(0);
  });

  it('is deterministic (same scene → same pixels)', () => {
    const scene = compileVRI(makeTestPacket());
    const r1 = renderVRI(scene, 4);
    const r2 = renderVRI(scene, 4);

    expect(r1.data.length).toBe(r2.data.length);
    for (let i = 0; i < r1.data.length; i++) {
      if (r1.data[i] !== r2.data[i]) {
        expect.fail(`Pixel mismatch at byte ${i}: ${r1.data[i]} !== ${r2.data[i]}`);
      }
    }
  });

  it('applies texture grain (non-uniform color within a cell)', () => {
    const scene = compileVRI(makeTestPacket());
    const result = renderVRI(scene, 8);

    const baseX = 5 * 8;
    const baseY = 2 * 8;
    const colors = new Set();
    for (let sy = 0; sy < 8; sy++) {
      for (let sx = 0; sx < 8; sx++) {
        const idx = ((baseY + sy) * 96 + (baseX + sx)) * 4;
        if (result.data[idx + 3] > 0) {
          colors.add(`${result.data[idx]},${result.data[idx + 1]},${result.data[idx + 2]}`);
        }
      }
    }
    expect(colors.size).toBeGreaterThan(1);
  });

  it('applies raster patches as final override', () => {
    const patches = [{
      id: 'red-dot',
      pixels: [{ x: 0, y: 0, color: '#FF0000', alpha: 1.0 }],
    }];
    const scene = compileVRI(makeTestPacket(), { rasterPatches: patches });
    const result = renderVRI(scene, 1);

    expect(result.data[0]).toBe(255);
    expect(result.data[1]).toBe(0);
    expect(result.data[2]).toBe(0);
    expect(result.data[3]).toBe(255);
  });

  it('scales correctly at different resolutions', () => {
    const scene = compileVRI(makeTestPacket());
    const r1 = renderVRI(scene, 1);
    const r4 = renderVRI(scene, 4);
    const r8 = renderVRI(scene, 8);

    expect(r1.width).toBe(12);
    expect(r1.height).toBe(32);
    expect(r4.width).toBe(48);
    expect(r4.height).toBe(128);
    expect(r8.width).toBe(96);
    expect(r8.height).toBe(256);
  });
});

// ─── Integration: Full Pipeline ──────────────────────────────────────────────

describe('VRI Integration', () => {
  it('full pipeline: packet → VRI → RGBA is deterministic across 10 runs', () => {
    const packet = makeTestPacket();
    const genes = makeTestGenes();
    const results = [];

    for (let i = 0; i < 10; i++) {
      const scene = compileVRI(packet, { artGenes: genes });
      const rgba = renderVRI(scene, 4);
      results.push(rgba.data);
    }

    for (let i = 1; i < 10; i++) {
      expect(results[i].length).toBe(results[0].length);
      for (let j = 0; j < results[0].length; j++) {
        if (results[i][j] !== results[0][j]) {
          expect.fail(`Run ${i} diverged at byte ${j}`);
        }
      }
    }
  });

  it('different materials produce different texture signatures', () => {
    const packet = makeTestPacket();
    const scene = compileVRI(packet);
    const result = renderVRI(scene, 8);

    const bladeColors = new Set();
    const pommelColors = new Set();

    for (let sy = 0; sy < 8; sy++) {
      for (let sx = 0; sx < 8; sx++) {
        const bIdx = ((2 * 8 + sy) * 96 + (5 * 8 + sx)) * 4;
        if (result.data[bIdx + 3] > 0) bladeColors.add(result.data[bIdx]);

        const pIdx = ((28 * 8 + sy) * 96 + (5 * 8 + sx)) * 4;
        if (result.data[pIdx + 3] > 0) pommelColors.add(result.data[pIdx]);
      }
    }

    expect(bladeColors.size).toBeGreaterThan(1);
    expect(pommelColors.size).toBeGreaterThan(1);
  });

  it('gene bindings produce visibly different renders', () => {
    const packet = makeTestPacket();
    const scenePlain = compileVRI(packet);
    const sceneBound = compileVRI(packet, {
      artGenes: [{
        geneId: 'dramatic',
        bindings: [
          { channel: 'lighting', operation: 'increase-rim', amount: 0.5 },
          { channel: 'atmosphere', operation: 'add-fog', amount: 0.3 },
        ],
      }],
    });

    const rPlain = renderVRI(scenePlain, 4);
    const rBound = renderVRI(sceneBound, 4);

    let diffCount = 0;
    for (let i = 0; i < rPlain.data.length; i += 4) {
      if (rPlain.data[i] !== rBound.data[i] ||
          rPlain.data[i + 1] !== rBound.data[i + 1] ||
          rPlain.data[i + 2] !== rBound.data[i + 2]) {
        diffCount++;
      }
    }
    expect(diffCount).toBeGreaterThan(0);
  });
});

// ─── Locked reference render ─────────────────────────────────────────────────
//
// Every other determinism test here compares the pipeline against itself:
// "same scene, same scale, same bytes". That proves self-consistency, not that
// the blade still looks like the blade. A refactor that changed every pixel
// identically would pass all of them.
//
// This fixture is deliberately frozen and exercises every implemented pass —
// SDF coverage, stroke-band coverage, snapped coordinates, three materials'
// texture fields, gene marks, a gene raster patch, four light kinds, fog,
// grading, and an authored patch. The digests below are the approved output.
// If one changes, the render changed: confirm the new output is intended,
// then update the digest in the same commit as the renderer change.

describe('locked reference render', () => {
  const referencePacket = () => ({
    id: 'golden-reference-blade',
    canvas: { width: 12, height: 32 },
    geometry: {
      mode: 'coordinates',
      coordinates: [
        { x: 5, y: 2, color: '#8A9BB0', partId: 'blade', material: 'steel', signedDistance: -1.2, t: 0.10, tangent: [0, 1], normal: [1, 0], curvature: 0.0, arcLength: 30 },
        { x: 6, y: 2, color: '#8A9BB0', partId: 'blade', material: 'steel', signedDistance: -0.8, t: 0.10, tangent: [0, 1], normal: [1, 0], curvature: 0.0, arcLength: 30 },
        { x: 5, y: 3, color: '#8A9BB0', partId: 'blade', material: 'steel', signedDistance: -1.0, t: 0.15, tangent: [0, 1], normal: [1, 0], curvature: 0.0, arcLength: 30 },
        { x: 6, y: 3, color: '#8A9BB0', partId: 'blade', material: 'steel', signedDistance: -0.6, t: 0.15, tangent: [0, 1], normal: [1, 0], curvature: 0.0, arcLength: 30, strokeHalfWidth: 0.9 },
        { x: 4, y: 20, color: '#4A4A52', partId: 'guard', material: 'iron', signedDistance: -0.5, t: 0.50, tangent: [1, 0], normal: [0, -1], curvature: 0.0, arcLength: 8 },
        { x: 5, y: 20, color: '#4A4A52', partId: 'guard', material: 'iron', signedDistance: -0.3, t: 0.50, tangent: [1, 0], normal: [0, -1], curvature: 0.0, arcLength: 8 },
        { x: 5, y: 28, color: '#B8963C', partId: 'pommel', material: 'gold', signedDistance: -0.4, t: 0.30, tangent: [1, 0], normal: [0, -1], curvature: 1.5, arcLength: 6 },
        { x: 6, y: 28, color: '#B8963C', partId: 'pommel', material: 'gold', signedDistance: -0.4, t: 0.70, tangent: [1, 0], normal: [0, -1], curvature: 1.5, arcLength: 6, snappedX: 6, snappedY: 28 },
      ],
    },
  });

  const referenceOptions = () => ({
    artGenes: [{
      geneId: 'edge',
      geometryHints: { color: '#C8D8E8', cells: [{ x: 5, y: 2, pressure: 0.9 }, { x: 5, y: 3, pressure: 0.8 }] },
      coordinates: [{ x: 6, y: 28, color: '#FFE9A8', alpha: 0.85 }],
    }],
    lighting: {
      key: { intensity: 0.8 }, rim: { intensity: 0.4 }, ambient: { intensity: 0.2 },
      points: [{ id: 'pommel-glint', position: [6, 28], intensity: 0.5, radius: 4 }],
    },
    atmosphere: {
      fog: { color: '#1A1A2E', near: 18, far: 32, density: 0.35 },
      bloom: null,
      grading: { contrast: 1.1, saturation: 1.05 },
    },
    rasterPatches: [{ id: 'nick', pixels: [{ x: 5, y: 10, color: '#FFFFFF', alpha: 0.6 }] }],
  });

  // Re-approved when the lighting pass changed from adding light to the surface
  // colour to modulating it (and when the key's to-light vector stopped being
  // negated). The previous bytes encoded a render in which 51% of a sprite's
  // pixels were brighter than its own brightest authored colour and 17-29% of the
  // night backgrounds were clipped to near-white. Superseded values:
  //   1x 22bae721401b3b83834220e385e5211c58f8462a68e35b4890f8b9b10a4f6853
  //   2x e1e0773d10db699d13b801218f4ace174b775cf85dcd92ff2729f6acd4bde23c
  //   4x b47e9e8a214c73cbfbe98a69a3c919e4ac6c28c897b3737155373a308977014c
  //   8x ee30b3ed22ba6b6ccc35eb1304c457357bc7c1bf6f7828e880893bae8f13ccf2
  const GOLDEN_RGBA_SHA256 = {
    1: '92ec3a9e684e74b0027b423adef1abbb394f140d1bd9c0f7c36662d0d180ca6e',
    2: 'afc03d7255ad6ae523cce9b80a277db576ae4c7648c9a55e4e65957505339490',
    4: 'b9ac07048c55cb19b45eb0102985182dd9c84a37a09cf3081326553b30257769',
    8: '5375759a910eced9c81274736fea2f1e3d76df7ef73618cf1c5c842d659335c2',
  };
  const GOLDEN_SCENE_CHECKSUM = 'b62ca8c3';

  it('compiles to the approved scene checksum', () => {
    expect(compileVRI(referencePacket(), referenceOptions()).checksum).toBe(GOLDEN_SCENE_CHECKSUM);
  });

  it('declares nothing the renderer will not execute', () => {
    const scene = compileVRI(referencePacket(), referenceOptions());
    expect(scene.provenance.unrenderedDeclarations).toEqual([]);
  });

  for (const scale of [1, 2, 4, 8]) {
    it(`renders the approved bytes at ${scale}×`, () => {
      const scene = compileVRI(referencePacket(), referenceOptions());
      const { width, height, data } = renderVRI(scene, scale);
      expect(width).toBe(12 * scale);
      expect(height).toBe(32 * scale);
      expect(createHash('sha256').update(data).digest('hex')).toBe(GOLDEN_RGBA_SHA256[scale]);
    });
  }
});

// ─── Palette quantization ────────────────────────────────────────────────────

describe('palette quantization', () => {
  // `darksteel` and `gold` both exist in MATERIAL_PALETTES. `steel` and `iron`
  // deliberately do not — see the phantom-material test at the end of this block.
  const quantPacket = () => makeMinimalPacket([
    makeCoord(1, 1, '#8A9BB0', 'darksteel'),
    makeCoord(2, 1, '#8A9BB0', 'darksteel'),
    makeCoord(3, 1, '#B8963C', 'gold'),
    makeCoord(4, 1, '#B8963C', 'gold'),
  ]);
  const litOptions = (extra = {}) => ({
    lighting: { key: { intensity: 0.8 }, rim: { intensity: 0.4 }, ambient: { intensity: 0.2 } },
    atmosphere: { fog: null, bloom: null, grading: { contrast: 1.15, saturation: 1.1 } },
    ...extra,
  });

  const coloursOf = (scene, scale) => {
    const { data } = renderVRI(scene, scale);
    const set = new Set();
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      set.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    }
    return set;
  };

  it('is off by default and leaves output unchanged', () => {
    const scene = compileVRI(quantPacket(), litOptions());
    expect(scene.quantization.mode).toBe(QUANTIZATION_MODES.OFF);
    expect(scene.provenance.quantizationMode).toBe(QUANTIZATION_MODES.OFF);
  });

  it('collapses procedural colour onto the material ramps', () => {
    const raw = coloursOf(compileVRI(quantPacket(), litOptions()), 4);
    const snapped = coloursOf(compileVRI(quantPacket(), litOptions({ quantize: true })), 4);
    expect(snapped.size).toBeLessThan(raw.size);
  });

  it('emits only colours that exist on the resolved ramps', () => {
    const scene = compileVRI(quantPacket(), litOptions({ quantize: true }));
    const allowed = new Set();
    for (const colors of Object.values(scene.quantization.ramps)) {
      for (const hex of colors) {
        const n = parseInt(hex.slice(1), 16);
        allowed.add(`${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`);
      }
    }
    for (const c of coloursOf(scene, 4)) expect(allowed.has(c)).toBe(true);
  });

  it('holds the colour count steady across output scales', () => {
    const scene = compileVRI(quantPacket(), litOptions({ quantize: true }));
    const counts = [1, 2, 4, 8].map(s => coloursOf(scene, s).size);
    // A ramp has no notion of resolution: rendering larger must not invent colours.
    expect(new Set(counts).size).toBe(1);
  });

  it('resolves a ramp for every textured material present', () => {
    const scene = compileVRI(quantPacket(), litOptions({ quantize: true }));
    expect(Object.keys(scene.quantization.ramps).sort()).toEqual(['darksteel', 'gold']);
    expect(scene.provenance.quantizedMaterialCount).toBe(2);
  });

  it('leaves passthrough and unknown materials unquantized', () => {
    const packet = makeMinimalPacket([
      makeCoord(1, 1, '#8A9BB0', 'source'),
      makeCoord(2, 1, '#8A9BB0', 'not-a-real-material'),
    ]);
    const scene = compileVRI(packet, litOptions({ quantize: true }));
    expect(scene.quantization.ramps).toEqual({});
  });

  it('does not re-colour authored raster patches', () => {
    const authored = '#FF00FF'; // deliberately absent from any ramp
    const scene = compileVRI(quantPacket(), litOptions({
      quantize: true,
      rasterPatches: [{ id: 'authored', pixels: [{ x: 1, y: 1, color: authored, alpha: 1.0 }] }],
    }));
    const { data, width } = renderVRI(scene, 4);
    const idx = ((1 * 4) * width + (1 * 4)) * 4;
    expect([data[idx], data[idx + 1], data[idx + 2]]).toEqual([255, 0, 255]);
  });

  it('does not re-colour curated gene coordinates', () => {
    const geneColour = '#00FF7F'; // absent from any ramp
    const scene = compileVRI(quantPacket(), litOptions({
      quantize: true,
      artGenes: [{ geneId: 'curated', coordinates: [{ x: 2, y: 1, color: geneColour, alpha: 1.0 }] }],
    }));
    const { data, width } = renderVRI(scene, 4);
    const idx = ((1 * 4) * width + (2 * 4)) * 4;
    expect([data[idx], data[idx + 1], data[idx + 2]]).toEqual([0, 255, 127]);
  });

  it('changes the scene checksum when quantization is toggled', () => {
    const off = compileVRI(quantPacket(), litOptions());
    const on = compileVRI(quantPacket(), litOptions({ quantize: true }));
    expect(off.checksum).not.toBe(on.checksum);
  });

  it('accepts an explicit caller-supplied ramp', () => {
    const scene = compileVRI(quantPacket(), litOptions({
      quantize: { mode: QUANTIZATION_MODES.NEAREST_ANCHOR, ramps: { darksteel: ['#000000', '#FFFFFF'] } },
    }));
    expect(scene.quantization.ramps).toEqual({ darksteel: ['#000000', '#FFFFFF'] });
    const { data, width } = renderVRI(scene, 4);
    const idx = ((1 * 4) * width + (1 * 4)) * 4;
    expect([[0, 0, 0], [255, 255, 255]]).toContainEqual([data[idx], data[idx + 1], data[idx + 2]]);
  });

  it('reports quantization enabled with no resolvable ramp', () => {
    const packet = makeMinimalPacket([makeCoord(1, 1, '#8A9BB0', 'source')]);
    const scene = compileVRI(packet, litOptions({ quantize: true }));
    const fields = scene.provenance.unrenderedDeclarations.map(d => d.field);
    expect(fields).toContain('quantization.ramps');
  });

  it('names a material that resolves to no registry ramp', () => {
    // A material can carry a texture without existing in MATERIAL_PALETTES --
    // that split is how `steel`, `iron`, `oak_bark`, `leather` and `moonstone`
    // silently rendered as passthrough before being authored on 2026-07-29.
    // MATERIAL_TO_TEXTURE currently has no such entries left, so this uses a
    // synthetic one to keep the report locked against the split returning.
    const packet = makeMinimalPacket([
      makeCoord(1, 1, '#8A9BB0', 'darksteel'),
      makeCoord(2, 1, '#8A9BB0', 'not-a-registered-material'),
    ]);
    const scene = compileVRI(packet, litOptions({ quantize: true }));
    expect(Object.keys(scene.quantization.ramps)).toEqual(['darksteel']);
    const d = scene.provenance.unrenderedDeclarations.find(
      x => x.field === 'quantization.material' && x.value === 'not-a-registered-material');
    expect(d).toBeDefined();
  });

  it('dithers between adjacent anchors by default', () => {
    const scene = compileVRI(quantPacket(), litOptions({ quantize: true }));
    expect(scene.quantization.dither).toBe(true);
  });

  it('dithering yields more gradation than rounding', () => {
    const on = compileVRI(quantPacket(), litOptions({ quantize: true }));
    const off = { ...on, quantization: { ...on.quantization, dither: false } };
    expect(coloursOf(on, 4).size).toBeGreaterThanOrEqual(coloursOf(off, 4).size);
  });

  it('dithers in logical cell space, not output pixel space', () => {
    // Output-space dithering would put one sample per cell at 1x and 64 at 8x,
    // so the emitted colour set would change with output size.
    const scene = compileVRI(quantPacket(), litOptions({ quantize: true }));
    const at4 = [...coloursOf(scene, 4)].sort();
    const at8 = [...coloursOf(scene, 8)].sort();
    expect(at8).toEqual(at4);
  });

  it('every dithered colour is still on the ramp', () => {
    const scene = compileVRI(quantPacket(), litOptions({ quantize: true }));
    const allowed = new Set();
    for (const colors of Object.values(scene.quantization.ramps)) {
      for (const hex of colors) {
        const n = parseInt(hex.slice(1), 16);
        allowed.add(`${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`);
      }
    }
    for (const c of coloursOf(scene, 4)) expect(allowed.has(c)).toBe(true);
  });

  it('bounds texture grain to a fraction of the ramp step when quantizing', () => {
    const scene = compileVRI(quantPacket(), litOptions({ quantize: true }));
    const tex = scene.layers.find(l => l.type === LAYER_TYPES.TEXTURE_FIELD);
    // gold has 7 anchors -> 6 steps; default textureGrainSteps 0.5 -> 0.5/6
    expect(tex.payload.maxLuminanceDelta).toBeCloseTo(0.5 / 6, 5);
  });

  it('leaves texture grain unbounded when not quantizing', () => {
    const scene = compileVRI(quantPacket(), litOptions());
    const tex = scene.layers.find(l => l.type === LAYER_TYPES.TEXTURE_FIELD);
    expect(tex.payload.maxLuminanceDelta).toBeNull();
  });

  it('nearest-anchor is unaffected by the dither flag', () => {
    const base = compileVRI(quantPacket(), litOptions({
      quantize: { mode: QUANTIZATION_MODES.NEAREST_ANCHOR, ramps: { gold: ['#140D02', '#D4AF37', '#FFFBE6'] } },
    }));
    const off = { ...base, quantization: { ...base.quantization, dither: false } };
    expect(Array.from(renderVRI(base, 4).data)).toEqual(Array.from(renderVRI(off, 4).data));
  });

  it('reports coverage for every material with a resolvable ramp', () => {
    const scene = compileVRI(quantPacket(), litOptions());
    expect(scene.provenance.paletteCoverage.map(c => c.material).sort())
      .toEqual(['darksteel', 'gold']);
  });

  it('flags a part painted one flat colour', () => {
    // One colour reaches one anchor, so every material renders it as a block.
    const packet = makeMinimalPacket([
      makeCoord(1, 1, '#D4AF37', 'gold'),
      makeCoord(2, 1, '#D4AF37', 'gold'),
    ]);
    const c = compileVRI(packet, litOptions()).provenance.paletteCoverage[0];
    expect(c.material).toBe('gold');
    expect(c.anchorsUsed).toBe(1);
    expect(c.flat).toBe(true);
    expect(c.span).toBe(0);
  });

  it('does not flag a part whose values span the ramp', () => {
    const packet = makeMinimalPacket([
      makeCoord(1, 1, '#140D02', 'gold'),
      makeCoord(2, 1, '#8A6D1F', 'gold'),
      makeCoord(3, 1, '#F0D86E', 'gold'),
      makeCoord(4, 1, '#FFFBE6', 'gold'),
    ]);
    const c = compileVRI(packet, litOptions()).provenance.paletteCoverage[0];
    expect(c.flat).toBe(false);
    expect(c.anchorsUsed).toBeGreaterThan(1);
    expect(c.span).toBeGreaterThan(0.5);
  });

  it('does not treat authored hue as a defect', () => {
    // holy_steel painted gold is luminance 0.70 landing on an upper anchor,
    // which is the value-sketch semantics working, not drift.
    const packet = makeMinimalPacket([
      makeCoord(1, 1, '#140D02', 'holy_steel'),
      makeCoord(2, 1, '#D4AF37', 'holy_steel'),
    ]);
    const c = compileVRI(packet, litOptions()).provenance.paletteCoverage[0];
    expect(c.flat).toBe(false);
  });

  it('sorts least-covered first', () => {
    const packet = makeMinimalPacket([
      makeCoord(1, 1, '#D4AF37', 'gold'),
      makeCoord(2, 1, '#000000', 'darksteel'),
      makeCoord(3, 1, '#4B4B5E', 'darksteel'),
      makeCoord(4, 1, '#8A8A9E', 'darksteel'),
    ]);
    const cov = compileVRI(packet, litOptions()).provenance.paletteCoverage;
    expect(cov[0].material).toBe('gold');
    expect(cov[0].anchorsUsed).toBeLessThanOrEqual(cov[1].anchorsUsed);
  });

  it('reports coverage whether or not quantization is enabled', () => {
    const off = compileVRI(quantPacket(), litOptions()).provenance.paletteCoverage;
    const on = compileVRI(quantPacket(), litOptions({ quantize: true })).provenance.paletteCoverage;
    expect(on).toEqual(off);
  });

  it('reports an unknown quantization mode', () => {
    const scene = compileVRI(quantPacket(), litOptions({ quantize: { mode: 'k-means', ramps: { darksteel: ['#000000'] } } }));
    const d = scene.provenance.unrenderedDeclarations.find(x => x.field === 'quantization.mode');
    expect(d).toBeDefined();
    expect(d.value).toBe('k-means');
  });

  it('an unknown mode leaves pixels as computed', () => {
    const asComputed = renderVRI(compileVRI(quantPacket(), litOptions()), 4).data;
    const unknown = renderVRI(compileVRI(quantPacket(), litOptions({
      quantize: { mode: 'k-means', ramps: { darksteel: ['#000000'] } },
    })), 4).data;
    expect(Array.from(unknown)).toEqual(Array.from(asComputed));
  });
});

// ─── Checksum completeness ───────────────────────────────────────────────────
// The compiler claims "two scenes that differ in ANY visible way produce
// different strings". These lock that claim against the fields the renderer
// actually reads off a coordinate, each of which was previously dropped by the
// canonical projection.

describe('checksum covers every render-affecting coordinate field', () => {
  const withField = (over) => makeMinimalPacket([{ ...makeCoord(3, 3, '#8A9BB0', 'steel'), ...over }]);

  const renderDiffers = (a, b) => {
    const da = renderVRI(compileVRI(a), 4).data;
    const db = renderVRI(compileVRI(b), 4).data;
    for (let i = 0; i < da.length; i++) if (da[i] !== db[i]) return true;
    return false;
  };

  const cases = [
    ['normal', { normal: [1, 0] }],
    ['tangent', { tangent: [0, 1] }],
    ['curvature', { curvature: 2.5 }],
    ['t (parametric position)', { t: 0.9 }],
    ['arcLength', { arcLength: 40 }],
    ['strokeHalfWidth', { strokeHalfWidth: 0.2 }],
    ['snappedX', { snappedX: 6 }],
    ['snappedY', { snappedY: 6 }],
  ];

  for (const [label, over] of cases) {
    it(`changes checksum when ${label} changes`, () => {
      const a = withField({});
      const b = withField(over);
      // Guard: the field must actually move pixels, or this test proves nothing.
      expect(renderDiffers(a, b)).toBe(true);
      expect(compileVRI(a).checksum).not.toBe(compileVRI(b).checksum);
    });
  }

  it('changes checksum when geometry-layer aaWidth changes (contour binding)', () => {
    const packet = makeTestPacket();
    const plain = compileVRI(packet);
    const sharp = compileVRI(packet, {
      artGenes: [{ geneId: 'g', bindings: [{ channel: 'contour', operation: 'sharpen', amount: 1.0 }] }],
    });
    expect(sharp.layers[0].payload.aaWidth).not.toBe(plain.layers[0].payload.aaWidth);
    expect(plain.checksum).not.toBe(sharp.checksum);
  });

  it('is insensitive to key insertion order in caller-supplied atmosphere', () => {
    const packet = makeTestPacket();
    const a = compileVRI(packet, { atmosphere: { fog: null, bloom: null, grading: { contrast: 1.2, saturation: 0.9 } } });
    const b = compileVRI(packet, { atmosphere: { grading: { saturation: 0.9, contrast: 1.2 }, bloom: null, fog: null } });
    expect(a.checksum).toBe(b.checksum);
  });
});

// ─── Renderer correctness regressions ────────────────────────────────────────

describe('light.affects targeting', () => {
  const cellOf = (material) => makeMinimalPacket([{ ...makeCoord(3, 3, '#202020', material) }]);
  const litWith = (material, affects) => {
    const base = compileVRI(cellOf(material));
    const lit = { ...base, lights: [{ id: 'amb', kind: LIGHT_KINDS.AMBIENT, position: [4, 4], direction: [0, 0], color: '#FF0000', intensity: 0.9, radius: 24, angle: 360, affects }] };
    const dark = { ...base, lights: [] };
    const a = renderVRI(lit, 4).data;
    const b = renderVRI(dark, 4).data;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return true;
    return false;
  };

  it('lights a cell whose material is listed', () => {
    expect(litWith('steel', ['steel'])).toBe(true);
  });

  it('does not light a cell whose material is not listed', () => {
    expect(litWith('gold', ['steel'])).toBe(false);
  });

  it('does not light a cell that has no material at all', () => {
    expect(litWith(undefined, ['steel'])).toBe(false);
  });

  it('an empty affects list still lights everything', () => {
    expect(litWith('gold', [])).toBe(true);
    expect(litWith(undefined, [])).toBe(true);
  });
});

describe('raster patch coordinates', () => {
  const bare = () => createVRIScene(8, 8, [createGeometryLayer('geo', [makeCoord(3, 3, '#202020', 'steel')], {})], [], null, {});
  const withPatch = (x, y) => createVRIScene(8, 8, [
    createGeometryLayer('geo', [makeCoord(3, 3, '#202020', 'steel')], {}),
    createRasterPatchLayer('rp', [{ x, y, color: '#FF0000', alpha: 1.0 }], {}),
  ], [], null, {});

  const paintedBytes = (x, y) => {
    const a = renderVRI(withPatch(x, y), 4).data;
    const b = renderVRI(bare(), 4).data;
    let n = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
    return n;
  };

  it('paints a patch at integer coordinates', () => {
    expect(paintedBytes(3, 3)).toBeGreaterThan(0);
  });

  it('does not silently discard a patch at fractional coordinates', () => {
    // 3.1 * 4 = 12.4 — a fractional buffer index writes nowhere on a Uint8Array.
    expect(paintedBytes(3.1, 3.1)).toBeGreaterThan(0);
  });

  it('covers the same cell block for every fraction that rounds to the same cell', () => {
    const whole = paintedBytes(3, 3);
    expect(paintedBytes(3.1, 3.1)).toBe(whole);
    expect(paintedBytes(3.25, 3.25)).toBe(whole);
    expect(paintedBytes(3.49, 3.49)).toBe(whole);
    // 3.5 rounds up to cell 4 — a different cell, not a partial block.
    expect(paintedBytes(3.5, 3.5)).toBe(paintedBytes(4, 4));
  });
});

describe('non-illuminating light kinds', () => {
  it('a fog/bloom entry in scene.lights does not wash the buffer', () => {
    const base = compileVRI(makeMinimalPacket([makeCoord(3, 3, '#202020', 'steel')]));
    const dark = { ...base, lights: [] };
    const fogLight = {
      ...base,
      lights: [{ id: 'f', kind: LIGHT_KINDS.FOG, position: [4, 4], direction: [0, 0], color: '#FF0000', intensity: 1.0, radius: 24, angle: 360, affects: [] }],
    };
    const a = renderVRI(dark, 4).data;
    const b = renderVRI(fogLight, 4).data;
    expect(Array.from(b)).toEqual(Array.from(a));
  });
});

// ─── Capability manifest ─────────────────────────────────────────────────────

describe('unrendered declaration reporting', () => {
  it('reports nothing for a scene that uses only executed features', () => {
    const scene = compileVRI(makeTestPacket());
    expect(scene.provenance.unrenderedDeclarations).toEqual([]);
  });

  it('reports bloom carried but not rendered', () => {
    const scene = compileVRI(makeTestPacket(), {
      atmosphere: { fog: null, bloom: { threshold: 0.7, radius: 3, intensity: 0.5 }, grading: null },
    });
    const fields = scene.provenance.unrenderedDeclarations.map(d => d.field);
    expect(fields).toContain('atmosphere.bloom');
  });

  it('reports a bloom raised by a gene binding', () => {
    const scene = compileVRI(makeTestPacket(), {
      artGenes: [{ geneId: 'g', bindings: [{ channel: 'atmosphere', operation: 'increase-bloom', amount: 0.8 }] }],
    });
    const fields = scene.provenance.unrenderedDeclarations.map(d => d.field);
    expect(fields).toContain('atmosphere.bloom');
  });

  it('reports an unexecuted blend mode', () => {
    const scene = compileVRI(makeTestPacket(), {
      rasterPatches: [{ id: 'p', pixels: [{ x: 0, y: 0, color: '#FF0000', alpha: 1 }], blendMode: BLEND_MODES.HARD_LIGHT }],
    });
    const d = scene.provenance.unrenderedDeclarations.find(x => x.field === 'layer.blendMode');
    expect(d).toBeDefined();
    expect(d.value).toBe(BLEND_MODES.HARD_LIGHT);
  });

  it('reports a maskRef that the renderer will ignore', () => {
    const packet = makeTestPacket();
    const scene = compileVRI(packet, {
      rasterPatches: [{ id: 'p', pixels: [{ x: 0, y: 0, color: '#FF0000', alpha: 1 }], maskRef: 'some-mask' }],
    });
    const fields = scene.provenance.unrenderedDeclarations.map(d => d.field);
    expect(fields).toContain('layer.maskRef');
  });

  it('reports an unknown gene binding channel instead of silently dropping it', () => {
    const scene = compileVRI(makeTestPacket(), {
      artGenes: [{ geneId: 'g', bindings: [{ channel: 'flavour', operation: 'zesty', amount: 1 }] }],
    });
    const d = scene.provenance.unrenderedDeclarations.find(x => x.field === 'gene.binding.channel');
    expect(d).toBeDefined();
    expect(d.value).toBe('flavour');
  });

  it('reports the contour binding as recorded-but-inert', () => {
    const scene = compileVRI(makeTestPacket(), {
      artGenes: [{ geneId: 'g', bindings: [{ channel: 'contour', operation: 'sharpen', amount: 1.0 }] }],
    });
    const fields = scene.provenance.unrenderedDeclarations.map(d => d.field);
    expect(fields).toContain('geometry.aaWidth');
  });

  it('declarations are inert metadata, not a refusal', () => {
    const scene = compileVRI(makeTestPacket(), {
      atmosphere: { fog: null, bloom: { threshold: 0.7, radius: 3, intensity: 0.5 }, grading: null },
    });
    expect(() => renderVRI(scene, 2)).not.toThrow();
  });
});

// ─── Lighting model ──────────────────────────────────────────────────────────

describe('lighting modulates the surface instead of adding to it', () => {
  const flatCoord = (x, y, color, material = 'bark') => ({
    ...makeCoord(x, y, color, material), normal: [0, 0],
  });
  const lum = (r, g, b) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

  const renderFlat = (colors, options = {}) => {
    const packet = makeMinimalPacket(colors.map((c, i) => flatCoord(1 + i, 1, c)));
    return renderVRI(compileVRI(packet, options), 1);
  };
  const pixel = (raster, x, y) => {
    const i = (y * raster.width + x) * 4;
    return [raster.data[i], raster.data[i + 1], raster.data[i + 2], raster.data[i + 3]];
  };

  it('never renders a pixel brighter than the colour it was painted', () => {
    // Additive lighting pushed a mid-grey surface to 306 and clipped it to white.
    const authored = ['#8A9BB0', '#404040', '#241708', '#C99A4A'];
    const r = renderFlat(authored);
    authored.forEach((hex, i) => {
      const [pr, pg, pb] = pixel(r, 1 + i, 1);
      const a = [1, 3, 5].map(o => parseInt(hex.slice(o, o + 2), 16));
      expect(lum(pr, pg, pb)).toBeLessThanOrEqual(lum(a[0], a[1], a[2]) + 0.02);
    });
  });

  it('preserves hue: a near-black warm cell does not render as a light neutral', () => {
    // #241708 is (36,23,8) — strongly warm. Additive white light turned it into
    // (214,201,186), a near-neutral, and `material iron` stopped being visible.
    const [pr, pg, pb] = pixel(renderFlat(['#241708']), 1, 1);
    const chroma = c => (Math.max(...c) === 0 ? 0 : (Math.max(...c) - Math.min(...c)) / Math.max(...c));
    expect(chroma([pr, pg, pb])).toBeGreaterThan(0.5);
    expect(lum(pr, pg, pb)).toBeLessThan(0.25);
  });

  it('renders a flat viewer-facing cell at its authored colour', () => {
    // The exposure reference is an unsculpted surface, so authored colours mean
    // what they look like rather than being uniformly darkened.
    const [pr, pg, pb] = pixel(renderFlat(['#8A9BB0']), 1, 1);
    for (const [got, want] of [[pr, 0x8A], [pg, 0x9B], [pb, 0xB0]]) {
      expect(Math.abs(got - want)).toBeLessThan(24);
    }
  });

  it('still shades: relief facing the key is brighter than relief facing away', () => {
    // default key points up-left, so an up-left normal must beat a down-right one
    const packet = makeMinimalPacket([
      { ...makeCoord(1, 1, '#8A9BB0', 'bark'), normal: [-0.707, -0.707] },
      { ...makeCoord(3, 1, '#8A9BB0', 'bark'), normal: [0.707, 0.707] },
    ]);
    const r = renderVRI(compileVRI(packet), 1);
    const toward = pixel(r, 1, 1);
    const away = pixel(r, 3, 1);
    expect(lum(...toward)).toBeGreaterThan(lum(...away));
  });

  it('leaves no lit surface fully black just because it faces away', () => {
    const packet = makeMinimalPacket([
      { ...makeCoord(1, 1, '#8A9BB0', 'bark'), normal: [0.707, 0.707] },
    ]);
    const [pr, pg, pb] = pixel(renderVRI(compileVRI(packet), 1), 1, 1);
    expect(pr + pg + pb).toBeGreaterThan(0);
  });

  it('treats a coloured light as a filter, not an amplifier', () => {
    // A luminance-normalised reference scaled a pure-red light's red channel by
    // 4.7x. The strongest channel keeps it at or below the authored value.
    const packet = makeMinimalPacket([flatCoord(1, 1, '#8A9BB0')]);
    const base = compileVRI(packet);
    const red = {
      ...base,
      lights: [{
        id: 'k', kind: LIGHT_KINDS.AMBIENT, position: [4, 4], direction: [0, 0],
        color: '#FF0000', intensity: 0.9, radius: 24, angle: 360, affects: [],
      }],
    };
    const [pr, pg, pb] = pixel(renderVRI(red, 1), 1, 1);
    expect(pr).toBeLessThanOrEqual(0x8A + 1);
    expect(pg).toBe(0);
    expect(pb).toBe(0);
  });

  it('lights an overlapping pixel once, not once per coordinate', () => {
    // Two coordinates on the same cell used to accumulate two doses of light.
    //
    // Compared as an illumination *ratio* rather than absolute pixels: duplicate
    // coordinates also run the texture pass twice, so their albedo differs before
    // lighting is reached. That is a separate pre-existing behaviour of the
    // texture pass; what this pins is that each pixel receives one dose of light
    // regardless of how many coordinates land on it.
    const illuminationRatio = (packet) => {
      const scene = compileVRI(packet);
      const lit = pixel(renderVRI(scene, 1), 1, 1);
      const unlit = pixel(renderVRI({ ...scene, lights: [] }, 1), 1, 1);
      return [0, 1, 2].map(i => (unlit[i] === 0 ? 0 : lit[i] / unlit[i]));
    };

    const one = illuminationRatio(makeMinimalPacket([flatCoord(1, 1, '#8A9BB0')]));
    const two = illuminationRatio(makeMinimalPacket([
      flatCoord(1, 1, '#8A9BB0'), flatCoord(1, 1, '#8A9BB0'),
    ]));
    one.forEach((r, i) => expect(Math.abs(r - two[i])).toBeLessThan(0.02));
    // and the dose is a dimming, not a doubling
    one.forEach(r => expect(r).toBeLessThanOrEqual(1.001));
  });
});
