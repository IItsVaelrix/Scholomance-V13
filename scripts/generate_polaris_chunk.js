import fs from 'fs';
import { TileForgePipeline } from '../codex/core/pixelbrain/tile-forge/tile-forge.pipeline.js';
import { TILE_FORGE_PRESETS } from '../codex/core/pixelbrain/tile-forge/tile-forge.presets.js';
import { IsoTileGeometryMicroprocessor } from '../codex/core/pixelbrain/amps/geometry/processors/iso-tile-geometry.microprocessor.js';
import { TileSocketMicroprocessor } from '../codex/core/pixelbrain/amps/geometry/processors/tile-socket.microprocessor.js';
import { FibonacciFieldMicroprocessor } from '../codex/core/pixelbrain/amps/fibonacci/fibonacci-field.microprocessor.js';
import { VolumeMicroprocessor } from '../codex/core/pixelbrain/amps/volume/processors/volume.microprocessor.js';
import { PerlinFieldMicroprocessor } from '../codex/core/pixelbrain/amps/noise/perlin-field.microprocessor.js';
import { BiomeMaterialMicroprocessor } from '../codex/core/pixelbrain/amps/biome/biome-material.microprocessor.js';

const MockGeometry = { run: () => ({ output: { foo: "bar" }, diagnostics: [], processor: {id: 'geometry', version: '1.0'}, hash: 'hash' }) };
const MockSymmetry = { run: () => ({ output: { foo: "bar" }, diagnostics: [], processor: {id: 'symmetrySoft', version: '1.0'}, hash: 'hash' }) };
const MockPropScatter = { run: () => ({ output: { foo: "bar" }, diagnostics: [], processor: {id: 'propScatter', version: '1.0'}, hash: 'hash' }) };
class MockValidator { validate() { return { ok: true, errors: [], warnings: [] }; } }
class MockScorer { score() { return { total: 100, grade: 'S' }; } }
class MockExporter { toPixelBrainPacket({ candidate }) { return candidate; } }
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
  id: "polaris_forest_chunk_001",
  seed: "polaris_forest_phaser",
  preset: "voidForest",
  projection: "isometric",
  tileSize: { width: 30, height: 30 }, // Smaller chunk size to fit the screen
  chunkType: "floating_island",
  biomeId: "void_forest",
  elevation: 3,
  symmetryMode: "soft",
  noise: { enabled: true, scale: 0.1, intensity: 0.1 },
  fibonacci: { enabled: true, count: 60, mode: "decorative_growth" },
  props: { enabled: true, density: "dense", types: ["purple_void_tree", "hologram_fern", "void_pine", "ember_pine", "base_pine", "snow_pine"] }
};

const res = pipeline.generate(intent);
fs.writeFileSync('public/assets/void_tiles/polaris_forest_chunk.scdl', JSON.stringify(res.exportPacket, null, 2));
console.log("Chunk generated and saved to public/assets/void_tiles/polaris_forest_chunk.scdl");
