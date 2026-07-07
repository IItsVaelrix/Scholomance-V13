import { test, expect } from "vitest";
import { TileForgePipeline } from '../../codex/core/pixelbrain/tile-forge/tile-forge.pipeline.js';
import { TILE_FORGE_PRESETS } from '../../codex/core/pixelbrain/tile-forge/tile-forge.presets.js';

import { IsoTileGeometryMicroprocessor } from '../../codex/core/pixelbrain/amps/geometry/processors/iso-tile-geometry.microprocessor.js';
import { TileSocketMicroprocessor } from '../../codex/core/pixelbrain/amps/geometry/processors/tile-socket.microprocessor.js';
import { FibonacciFieldMicroprocessor } from '../../codex/core/pixelbrain/amps/fibonacci/fibonacci-field.microprocessor.js';
import { VolumeMicroprocessor } from '../../codex/core/pixelbrain/amps/volume/processors/volume.microprocessor.js';
import { PerlinFieldMicroprocessor } from '../../codex/core/pixelbrain/amps/noise/perlin-field.microprocessor.js';
import { BiomeMaterialMicroprocessor } from '../../codex/core/pixelbrain/amps/biome/biome-material.microprocessor.js';

// Mocks
const MockGeometry = { run: () => ({ output: {}, diagnostics: [], processor: {id: 'geometry', version: '1.0.0'}, hash: 'geom-hash' }) };
const MockSymmetry = { run: () => ({ output: {}, diagnostics: [], processor: {id: 'symmetrySoft', version: '1.0.0'}, hash: 'sym-hash' }) };
const MockPropScatter = { run: () => ({ output: {}, diagnostics: [], processor: {id: 'propScatter', version: '1.0.0'}, hash: 'prop-hash' }) };

class MockValidator { validate() { return { ok: true, errors: [], warnings: [] }; } }
class MockScorer { score() { return { total: 100, grade: 'S' }; } }
class MockExporter { toPixelBrainPacket() { return { type: 'pbrain_packet' }; } }
const globalMockStore = {};

class MockMemoryStore {
  snapshotLayer({ intent, processorId, result }) { 
    if (!globalMockStore[intent.id]) globalMockStore[intent.id] = {};
    globalMockStore[intent.id][processorId] = result.output;
  }
  restoreLayer({ intent, processorId }) { 
    return globalMockStore[intent.id] ? globalMockStore[intent.id][processorId] : {}; 
  }
  snapshotCandidate({ candidate }) { 
    return { 
      layerSnapshots: {
        isoTileHash: candidate.layers.isoTile ? "isoTile-hash-" + (candidate.layers.isoTile.topPlane?.length || 0) : null,
        noiseHash: candidate.layers.maskedNoise ? "noise-hash-" + candidate.intent.seed : null,
      } 
    }; 
  }
}

export function createTestPipeline() {
  return new TileForgePipeline({
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
}

export function generateTileForgeCandidate(intent) {
  const pipeline = createTestPipeline();
  return pipeline.generate(intent);
}
