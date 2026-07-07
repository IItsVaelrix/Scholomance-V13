import React, { useState } from 'react';
import TileForgeCanvas from './TileForgeCanvas.jsx';
import { TileForgePipeline } from '../../../../codex/core/pixelbrain/tile-forge/tile-forge.pipeline.js';
import { TILE_FORGE_PRESETS } from '../../../../codex/core/pixelbrain/tile-forge/tile-forge.presets.js';

import { IsoTileGeometryMicroprocessor } from '../../../../codex/core/pixelbrain/amps/geometry/processors/iso-tile-geometry.microprocessor.js';
import { TileSocketMicroprocessor } from '../../../../codex/core/pixelbrain/amps/geometry/processors/tile-socket.microprocessor.js';
import { FibonacciFieldMicroprocessor } from '../../../../codex/core/pixelbrain/amps/fibonacci/fibonacci-field.microprocessor.js';
import { VolumeMicroprocessor } from '../../../../codex/core/pixelbrain/amps/volume/processors/volume.microprocessor.js';
import { PerlinFieldMicroprocessor } from '../../../../codex/core/pixelbrain/amps/noise/perlin-field.microprocessor.js';
import { BiomeMaterialMicroprocessor } from '../../../../codex/core/pixelbrain/amps/biome/biome-material.microprocessor.js';

// Mocks
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

export default function TileForgeLab() {
  const [result, setResult] = useState(null);
  const [seed, setSeed] = useState("calm_meadow_seed");
  const [preset, setPreset] = useState("voidForest");

  const handleGenerate = () => {
    let activeBiome = "void_ice";
    let activeProps = { enabled: true, density: "sparse" };
    
    if (preset === "voidForest") {
      activeBiome = "void_forest";
      activeProps = { enabled: true, density: "dense", types: ["purple_void_tree", "hologram_fern", "void_pine", "ember_pine", "base_pine", "snow_pine"] };
    } else if (preset === "caveChunk") {
      activeBiome = "cave";
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
      seed: seed,
      preset: preset,
      projection: "isometric",
      tileSize: { width: 80, height: 45 },
      chunkType: "floating_island",
      biomeId: activeBiome,
      elevation: 3,
      symmetryMode: "soft",
      noise: { enabled: true, scale: 0.1, intensity: 0.1 },
      fibonacci: { enabled: true, count: 60, mode: "decorative_growth" },
      props: activeProps
    };

    const res = pipeline.generate(intent);
    setResult(res);
  };

  return (
    <div style={{ padding: '2rem', color: '#fff', backgroundColor: '#111', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '2rem', marginBottom: '1rem', color: '#60a5fa' }}>Tile Forge Visualizer</h1>
      
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '1rem' }}>
        <input 
          type="text" 
          value={seed}
          onChange={e => setSeed(e.target.value)}
          style={{ backgroundColor: '#1f2937', padding: '0.5rem', borderRadius: '4px', color: 'white', border: '1px solid #374151' }}
          placeholder="Seed"
        />
        <select 
          value={preset} 
          onChange={e => setPreset(e.target.value)}
          style={{ backgroundColor: '#1f2937', padding: '0.5rem', borderRadius: '4px', color: 'white', border: '1px solid #374151' }}
        >
          <option value="voidForest">Void Forest (Arboreal)</option>
          <option value="organicVoidIsland">Organic Void Island</option>
          <option value="cleanArchitectural">Clean Architectural</option>
          <option value="caveChunk">Cave Chunk</option>
          <option value="bossArena">Boss Arena</option>
        </select>
        <button 
          onClick={handleGenerate}
          style={{ backgroundColor: '#2563eb', color: 'white', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}
        >
          Forge Chunk
        </button>
      </div>

      {result && (
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem', height: '70vh' }}>
          {/* Canvas Renderer */}
          <TileForgeCanvas candidate={result.candidate} />

          {/* Diagnostics Panel */}
          <div style={{ backgroundColor: '#0f172a', padding: '1rem', borderRadius: '8px', overflow: 'auto', border: '1px solid #1e293b' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: '#94a3b8' }}>Diagnostics</h2>
            
            <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '4px', marginBottom: '1rem' }}>
              <p><strong>Top plane cells:</strong> {result.candidate.layers.isoTile.topPlane?.length}</p>
              <p><strong>Rim cells:</strong> {result.candidate.layers.isoTile.rimCells?.length}</p>
              <p><strong>Side plane cells:</strong> {Object.values(result.candidate.layers.isoTile.sidePlanes).flat().length}</p>
              <p><strong>Trees (Fibonacci seeds):</strong> {result.candidate.layers.fibonacciField.seeds?.length}</p>
            </div>
            
            <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '4px', marginBottom: '1rem' }}>
              <p><strong>North edge cells:</strong> {result.candidate.layers.tileSockets.edges.north?.length}</p>
              <p><strong>East edge cells:</strong> {result.candidate.layers.tileSockets.edges.east?.length}</p>
              <p><strong>South edge cells:</strong> {result.candidate.layers.tileSockets.edges.south?.length}</p>
              <p><strong>West edge cells:</strong> {result.candidate.layers.tileSockets.edges.west?.length}</p>
            </div>

            <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem', color: '#94a3b8' }}>Payload Extract</h2>
            <pre style={{ fontSize: '0.75rem', color: '#4ade80', whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(result.candidate.intent, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
