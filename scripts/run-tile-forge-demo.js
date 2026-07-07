import { TileForgePipeline } from '../codex/core/pixelbrain/tile-forge/tile-forge.pipeline.js';
import { TILE_FORGE_PRESETS } from '../codex/core/pixelbrain/tile-forge/tile-forge.presets.js';

import { IsoTileGeometryMicroprocessor } from '../codex/core/pixelbrain/amps/geometry/processors/iso-tile-geometry.microprocessor.js';
import { TileSocketMicroprocessor } from '../codex/core/pixelbrain/amps/geometry/processors/tile-socket.microprocessor.js';
import { FibonacciFieldMicroprocessor } from '../codex/core/pixelbrain/amps/fibonacci/fibonacci-field.microprocessor.js';
import { VolumeMicroprocessor } from '../codex/core/pixelbrain/amps/volume/processors/volume.microprocessor.js';
import { PerlinFieldMicroprocessor } from '../codex/core/pixelbrain/amps/noise/perlin-field.microprocessor.js';
import { BiomeMaterialMicroprocessor } from '../codex/core/pixelbrain/amps/biome/biome-material.microprocessor.js';

// Mock Processors for missing steps in organicVoidIsland preset
const MockGeometry = { run: () => ({ output: {}, diagnostics: [], processor: {id: 'geometry', version: '1.0.0'}, hash: 'geom-hash' }) };
const MockSymmetry = { run: () => ({ output: {}, diagnostics: [], processor: {id: 'symmetrySoft', version: '1.0.0'}, hash: 'sym-hash' }) };
const MockPropScatter = { run: () => ({ output: {}, diagnostics: [], processor: {id: 'propScatter', version: '1.0.0'}, hash: 'prop-hash' }) };

class MockValidator { validate() { return { ok: true, errors: [], warnings: [] }; } }
class MockScorer { score() { return { total: 100, grade: 'S' }; } }
class MockExporter { toPixelBrainPacket() { return { type: 'pbrain_packet' }; } }
class MockMemoryStore {
  snapshotLayer() {}
  restoreLayer() { return {}; }
  snapshotCandidate() { return { layerSnapshots: {} }; }
}

const processors = {
  geometry: MockGeometry,
  isoTile: new IsoTileGeometryMicroprocessor(),
  tileSockets: new TileSocketMicroprocessor(),
  fibonacciField: new FibonacciFieldMicroprocessor(),
  volume: new VolumeMicroprocessor(),
  symmetrySoft: MockSymmetry,
  maskedNoise: new PerlinFieldMicroprocessor(),
  biomeMaterial: new BiomeMaterialMicroprocessor(),
  propScatter: MockPropScatter
};

const pipeline = new TileForgePipeline({
  processors,
  presets: TILE_FORGE_PRESETS,
  validator: new MockValidator(),
  scorer: new MockScorer(),
  snapValidator: new MockValidator(),
  memoryStore: new MockMemoryStore(),
  exporter: new MockExporter()
});

const intent = {
  id: "test_void_ice_001",
  preset: "organicVoidIsland",
  tileSize: { width: 80, height: 45 },
  chunkType: "floating_island",
  biomeId: "void_ice",
  elevation: 3,
  noise: { enabled: true, scale: 0.12, intensity: 0.35 },
  fibonacci: { enabled: true, count: 24, mode: "decorative_growth" }
};

console.log("Running organicVoidIsland generation...");
const result = pipeline.generate(intent);
console.log("Generation complete!");

const l = result.candidate.layers;
const topPlaneCells = l.isoTile.topPlane?.length || 0;
const sidePlanes = l.isoTile.sidePlanes || {};
const sidePlaneCells = Object.values(sidePlanes).flat().length;
const rimCells = l.isoTile.rimCells?.length || 0;
const edges = l.tileSockets.edges || {};
const northEdgeCells = edges.north?.length || 0;
const eastEdgeCells = edges.east?.length || 0;
const southEdgeCells = edges.south?.length || 0;
const westEdgeCells = edges.west?.length || 0;
const fibonacciSeeds = l.fibonacciField.seeds?.length || 0;
const noiseAffectedCells = l.maskedNoise.affectedCells?.length || 0;
const heightMapCells = l.volume.heightMap?.length || 0;
const thicknessCells = l.volume.thickness?.length || 0;
const cavityCells = l.volume.cavities?.length || 0;
const materialAssignedCells = l.biomeMaterial.materialCells?.length || 0;
const exportHash = result.memorySnapshot?.layerSnapshots?.isoTileHash || "no-hash";

const allEdgeCells = Object.values(edges).flat();
const snapProfileCoverage = allEdgeCells.length > 0 && allEdgeCells.every(c => c.snapProfile && c.snapProfile.biomeId) ? "100%" : "Missing";

console.log(`
Top plane cells: ${topPlaneCells}
Side plane cells: ${sidePlaneCells}
Rim cells: ${rimCells}
North edge cells: ${northEdgeCells}
East edge cells: ${eastEdgeCells}
South edge cells: ${southEdgeCells}
West edge cells: ${westEdgeCells}
Fibonacci seeds: ${fibonacciSeeds}
Noise affected cells: ${noiseAffectedCells}
Height map cells: ${heightMapCells}
Thickness cells: ${thicknessCells}
Cavity cells: ${cavityCells}
Material assigned cells: ${materialAssignedCells}
Snap profile coverage: ${snapProfileCoverage}
Validation OK: ${result.validation.ok}
Snap validation OK: ${result.snapValidation.ok}
Export hash: ${exportHash}
`);
