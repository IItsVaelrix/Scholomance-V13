import { TileForgePipeline } from './codex/core/pixelbrain/tile-forge/tile-forge.pipeline.js';
import { TILE_FORGE_PRESETS } from './codex/core/pixelbrain/tile-forge/tile-forge.presets.js';
import { IsoTileGeometryMicroprocessor } from './codex/core/pixelbrain/amps/geometry/processors/iso-tile-geometry.microprocessor.js';
import { TileSocketMicroprocessor } from './codex/core/pixelbrain/amps/geometry/processors/tile-socket.microprocessor.js';
import { FibonacciFieldMicroprocessor } from './codex/core/pixelbrain/amps/fibonacci/fibonacci-field.microprocessor.js';
import { VolumeMicroprocessor } from './codex/core/pixelbrain/amps/volume/processors/volume.microprocessor.js';
import { PerlinFieldMicroprocessor } from './codex/core/pixelbrain/amps/noise/perlin-field.microprocessor.js';
import { BiomeMaterialMicroprocessor } from './codex/core/pixelbrain/amps/biome/biome-material.microprocessor.js';

const MockGeometry = { run: () => ({ output: {}, diagnostics: [], processor: {id: 'geometry', version: '1.0'}, hash: 'hash' }) };
const MockSymmetry = { run: () => ({ output: {}, diagnostics: [], processor: {id: 'symmetrySoft', version: '1.0'}, hash: 'hash' }) };
const MockPropScatter = { run: () => ({ output: {}, diagnostics: [], processor: {id: 'propScatter', version: '1.0'}, hash: 'hash' }) };

class MockValidator { validate() { return { ok: true, errors: [], warnings: [] }; } }
class MockScorer { score() { return { total: 100, grade: 'S' }; } }
class MockExporter { toPixelBrainPacket() { return { type: 'pbrain_packet' }; } }
class MockMemoryStore {
  snapshotLayer() {}
  restoreLayer() { return {}; }
  snapshotCandidate() { return { layerSnapshots: {} }; }
}

const pipeline = new TileForgePipeline({
  processors: {
    geometry: MockGeometry,
    isoTile: new IsoTileGeometryMicroprocessor(),
    tileSockets: new TileSocketMicroprocessor(),
    fibonacciField: new FibonacciFieldMicroprocessor(),
    volume: new VolumeMicroprocessor(),
    symmetrySoft: MockSymmetry,
    maskedNoise: new PerlinFieldMicroprocessor(),
    biomeMaterial: new BiomeMaterialMicroprocessor(),
    propScatter: MockPropScatter
  },
  presets: TILE_FORGE_PRESETS,
  validator: new MockValidator(),
  scorer: new MockScorer(),
  snapValidator: new MockValidator(),
  memoryStore: new MockMemoryStore(),
  exporter: new MockExporter()
});

const intent = {
  id: "test_island_001",
  seed: "calm_meadow_seed",
  preset: "organicVoidIsland",
  projection: "isometric",
  tileSize: { width: 80, height: 45 },
  chunkType: "floating_island",
  biomeId: "void_ice",
  elevation: 3,
  symmetryMode: "soft",
  noise: { enabled: true, scale: 0.1, intensity: 0.1 },
  fibonacci: { enabled: true, count: 10, mode: "decorative_growth" }
};

try {
  const res = pipeline.generate(intent);
  console.log(JSON.stringify(res, null, 2).slice(0, 500));
} catch (e) {
  console.error("ERROR:", e);
}
