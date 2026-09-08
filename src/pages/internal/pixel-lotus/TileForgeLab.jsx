import { useState } from 'react';
import TileForgeCanvas from './TileForgeCanvas.jsx';
import {
  BiomeMaterialMicroprocessor,
  FibonacciFieldMicroprocessor,
  IsoTileGeometryMicroprocessor,
  PerlinFieldMicroprocessor,
  TileForgePipeline,
  TILE_FORGE_PRESETS,
  TileSocketMicroprocessor,
  VolumeMicroprocessor,
  TileForgeScd128Microprocessor,
  TileShapeMicroprocessor,
} from '../../../lib/pixelbrain/tileForge.adapter.js';

// Mocks for auxiliary pipeline steps
const MockGeometry = { run: () => ({ output: {}, diagnostics: [], processor: { id: 'geometry', version: '1.0' }, hash: 'hash' }) };
const MockSymmetry = { run: () => ({ output: {}, diagnostics: [], processor: { id: 'symmetrySoft', version: '1.0' }, hash: 'hash' }) };
const MockPropScatter = { run: () => ({ output: {}, diagnostics: [], processor: { id: 'propScatter', version: '1.0' }, hash: 'hash' }) };

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
  const [seed, setSeed] = useState('void_sanctuary_seed');
  const [preset, setPreset] = useState('voidForest');
  const [selectedTile, setSelectedTile] = useState(null);
  const [hasGround, setHasGround] = useState(true);
  const [shaderMode, setShaderMode] = useState('day');
  const [glowIntensity, setGlowIntensity] = useState(1.2);
  const [atmosphereWarmth, setAtmosphereWarmth] = useState(1.0);
  const [copiedScdl, setCopiedScdl] = useState(false);

  const handleGenerate = () => {
    let activeBiome = 'void_forest';
    let activeProps = { enabled: true, density: 'dense' };

    if (preset === 'voidForest') {
      activeBiome = 'void_forest';
    } else if (preset === 'organicVoidIsland') {
      activeBiome = 'void_ice';
    } else if (preset === 'verdantGlade') {
      activeBiome = 'verdant_glade';
    } else if (preset === 'caveChunk') {
      activeBiome = 'cave_chasm';
    } else if (preset === 'sunlitGlade') {
      activeBiome = 'scholomance_sunlit_glade';
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
        propScatter: MockPropScatter,
        scd128Synthesizer: new TileForgeScd128Microprocessor(),
      },
      presets: TILE_FORGE_PRESETS,
      validator: new MockValidator(),
      scorer: new MockScorer(),
      snapValidator: new MockValidator(),
      memoryStore: new MockMemoryStore(),
      exporter: new MockExporter(),
    });

    const intent = {
      id: 'test_island_001',
      seed,
      preset: (preset === 'verdantGlade' || preset === 'sunlitGlade') ? 'voidForest' : preset,
      projection: 'isometric',
      tileSize: { width: 80, height: 40 },
      chunkType: 'floating_island',
      biomeId: activeBiome,
      elevation: 2,
      hasGround,
      groundDepth: 16,
      symmetryMode: 'soft',
      noise: { enabled: true, scale: 0.1, intensity: 0.1 },
      fibonacci: { enabled: true, count: 50, mode: 'decorative_growth' },
      props: activeProps,
    };

    const res = pipeline.generate(intent);
    setResult(res);
    setSelectedTile(null);
  };

  const formatHexBlocks = (hexString) => {
    if (!hexString || hexString.length !== 128) return hexString;
    const blocks = [];
    for (let i = 0; i < 16; i += 1) {
      blocks.push(hexString.slice(i * 8, (i + 1) * 8));
    }
    return blocks;
  };

  const wireBlocks = selectedTile?.scd128Record?.scd128Wire
    ? formatHexBlocks(selectedTile.scd128Record.scd128Wire)
    : null;

  const handleCopyScdl = () => {
    if (selectedTile?.scdlSource && typeof navigator !== 'undefined') {
      navigator.clipboard.writeText(selectedTile.scdlSource);
      setCopiedScdl(true);
      setTimeout(() => setCopiedScdl(false), 2000);
    }
  };

  return (
    <div style={{ padding: '1.5rem', color: '#fff', backgroundColor: '#090d16', minHeight: '100vh', fontFamily: 'sans-serif' }}>
      <header style={{ marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#38bdf8', fontWeight: 'bold' }}>
              PixelBrain Core · SCDL V2 + AMP Conveyor + WebGL Shaders
            </span>
          </div>
          <h1 style={{ fontSize: '1.6rem', margin: '0.2rem 0 0', color: '#f8fafc' }}>
            Tile Forge — Procedural Chunk Synthesizer
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Preset Selector */}
          <select
            value={preset}
            onChange={(e) => setPreset(e.target.value)}
            style={{ backgroundColor: '#1e293b', padding: '0.45rem 0.65rem', borderRadius: '6px', color: 'white', border: '1px solid #334155', fontSize: '0.85rem' }}
          >
            <option value="voidForest">Void Forest (Crystalline Purple)</option>
            <option value="organicVoidIsland">Void Ice (Prismatic Glacial)</option>
            <option value="verdantGlade">Verdant Glade (Emerald Foliage)</option>
            <option value="sunlitGlade">Scholomance Sunlit Glade (Professional Glade)</option>
            <option value="caveChunk">Subterranean Chasm (Slate & Lichen)</option>
          </select>

          {/* WebGL Shader Mode Selector */}
          <select
            value={shaderMode}
            onChange={(e) => setShaderMode(e.target.value)}
            style={{
              backgroundColor: shaderMode === 'off' ? '#1e293b' : '#042f2e',
              padding: '0.45rem 0.65rem',
              borderRadius: '6px',
              color: shaderMode === 'off' ? '#94a3b8' : '#2dd4bf',
              border: `1px solid ${shaderMode === 'off' ? '#334155' : '#14b8a6'}`,
              fontSize: '0.85rem',
              fontWeight: 'bold',
            }}
            title="Switch WebGL atmospheric & emissive bloom shaders"
          >
            <option value="day">WebGL: Day Glade (Sunlight)</option>
            <option value="twilight">WebGL: Twilight Amber (Dusk)</option>
            <option value="night">WebGL: Night Bioluminescent</option>
            <option value="prismatic">WebGL: Prismatic Glacial</option>
            <option value="off">Shaders: OFF (Discrete 1x Pure)</option>
          </select>

          {/* Bloom & Warmth Sliders (when shaders enabled) */}
          {shaderMode !== 'off' && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#1e293b', padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid #334155', fontSize: '0.75rem' }}>
                <span style={{ color: '#2dd4bf', fontWeight: 'bold' }}>Bloom:</span>
                <input
                  type="range"
                  min="0.2"
                  max="2.5"
                  step="0.1"
                  value={glowIntensity}
                  onChange={(e) => setGlowIntensity(parseFloat(e.target.value))}
                  style={{ width: '55px', accentColor: '#2dd4bf' }}
                  title="Bioluminescent Bloom Intensity"
                />
                <span style={{ width: '24px', color: '#94a3b8' }}>{glowIntensity.toFixed(1)}x</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', background: '#1e293b', padding: '0.35rem 0.6rem', borderRadius: '6px', border: '1px solid #334155', fontSize: '0.75rem' }}>
                <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>Warmth:</span>
                <input
                  type="range"
                  min="0.0"
                  max="2.0"
                  step="0.1"
                  value={atmosphereWarmth}
                  onChange={(e) => setAtmosphereWarmth(parseFloat(e.target.value))}
                  style={{ width: '55px', accentColor: '#fbbf24' }}
                  title="Atmosphere Lighting Warmth"
                />
                <span style={{ width: '24px', color: '#94a3b8' }}>{atmosphereWarmth.toFixed(1)}x</span>
              </div>
            </>
          )}

          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              backgroundColor: hasGround ? '#0c4a6e' : '#1e293b',
              padding: '0.45rem 0.65rem',
              borderRadius: '6px',
              border: `1px solid ${hasGround ? '#0284c7' : '#334155'}`,
              fontSize: '0.85rem',
              cursor: 'pointer',
              fontWeight: hasGround ? 'bold' : 'normal',
              color: hasGround ? '#38bdf8' : '#94a3b8',
            }}
            title="Toggle ground / dirt fullness underneath tile surfaces"
          >
            <input
              type="checkbox"
              checked={hasGround}
              onChange={(e) => setHasGround(e.target.checked)}
              style={{ accentColor: '#38bdf8', cursor: 'pointer' }}
            />
            <span>Full Ground</span>
          </label>

          <input
            type="text"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            style={{ backgroundColor: '#1e293b', padding: '0.45rem 0.65rem', borderRadius: '6px', color: 'white', border: '1px solid #334155', width: '130px', fontSize: '0.85rem' }}
            placeholder="Seed"
          />

          <button
            type="button"
            onClick={handleGenerate}
            style={{ backgroundColor: '#38bdf8', color: '#090d16', padding: '0.5rem 1.1rem', borderRadius: '6px', cursor: 'pointer', border: 'none', fontWeight: 'bold', fontSize: '0.85rem' }}
          >
            Forge Chunk
          </button>
        </div>
      </header>

      {result ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1.2fr', gap: '1.25rem', height: '78vh' }}>
          {/* WebGL + Discrete Canvas Viewport */}
          <TileForgeCanvas
            candidate={result.candidate}
            onSelectTile={setSelectedTile}
            shaderMode={shaderMode}
            glowIntensity={glowIntensity}
            atmosphereWarmth={atmosphereWarmth}
          />

          {/* Right Inspector: SCDL V2 Source, AMPs Conveyor, & SCD128 Dual-Witness */}
          <div style={{ backgroundColor: '#0f172a', padding: '1.25rem', borderRadius: '8px', overflow: 'auto', border: '1px solid #1e293b' }}>
            {selectedTile ? (
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#38bdf8', fontWeight: 'bold', letterSpacing: '0.05em' }}>
                    Asset Sovereign Inspector
                  </span>
                  <span style={{ fontSize: '0.7rem', background: '#1e293b', color: '#38bdf8', padding: '2px 8px', borderRadius: '4px', border: '1px solid #334155' }}>
                    {selectedTile.assetClass || selectedTile.type}
                  </span>
                </div>

                <h2 style={{ fontSize: '1.2rem', margin: '0.2rem 0 0.3rem', color: '#f8fafc' }}>
                  {selectedTile.type.toUpperCase()} ({selectedTile.x}, {selectedTile.y}) · Z:{selectedTile.elevation || 0}
                </h2>
                <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0 0 0.75rem' }}>
                  Biome: <span style={{ color: '#f1f5f9' }}>{selectedTile.biome || 'void_forest'}</span> · Discrete 1x Cell Lattice
                </p>

                {/* 1. Authoritative SCDL V2 Program */}
                {selectedTile.scdlSource && (
                  <div style={{ background: '#020617', padding: '0.75rem', borderRadius: '6px', border: '1px solid #1e293b', marginBottom: '0.9rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                      <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 'bold' }}>
                        Authoritative SCDL V2 Construction Source:
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyScdl}
                        style={{
                          background: '#1e293b',
                          border: '1px solid #334155',
                          color: copiedScdl ? '#4ade80' : '#94a3b8',
                          fontSize: '0.68rem',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                      >
                        {copiedScdl ? '✓ Copied' : 'Copy SCDL'}
                      </button>
                    </div>
                    <pre style={{
                      fontFamily: 'monospace',
                      fontSize: '0.68rem',
                      color: '#93c5fd',
                      margin: 0,
                      maxHeight: '160px',
                      overflow: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      background: '#090d16',
                      padding: '0.5rem',
                      borderRadius: '4px',
                      border: '1px solid #1e293b',
                    }}>
                      {selectedTile.scdlSource}
                    </pre>
                  </div>
                )}

                {/* 2. Active Anchor Micro-Passes (AMPs) */}
                {selectedTile.ampDescriptors && selectedTile.ampDescriptors.length > 0 && (
                  <div style={{ background: '#0f172a', border: '1px solid #334155', padding: '0.75rem', borderRadius: '6px', marginBottom: '0.9rem' }}>
                    <div style={{ fontSize: '0.72rem', color: '#a78bfa', fontWeight: 'bold', marginBottom: '0.4rem' }}>
                      Active Anchor Micro-Passes (PB-AMP-ABI-v1):
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      {selectedTile.ampDescriptors.map((amp, aIdx) => (
                        <div key={`${amp.kind}-${aIdx}`} style={{ background: '#1e293b', padding: '0.4rem 0.6rem', borderRadius: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem' }}>
                          <div>
                            <span style={{ color: '#c084fc', fontWeight: 'bold' }}>{amp.kind}</span>
                            <span style={{ color: '#64748b', marginLeft: '0.4rem', fontSize: '0.65rem' }}>({amp.contract || 'AMP'})</span>
                          </div>
                          <span style={{ color: '#4ade80', fontSize: '0.65rem', fontWeight: 'bold' }}>✓ EXECUTED</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 3. Formal SCD128 Dual-Witness Wire */}
                {wireBlocks && (
                  <div style={{ background: '#020617', padding: '0.75rem', borderRadius: '6px', border: '1px solid #1e293b', marginBottom: '0.9rem' }}>
                    <div style={{ fontSize: '0.7rem', color: '#60a5fa', fontWeight: 'bold', marginBottom: '0.2rem' }}>
                      FORM64 (Topology & Sockets):
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.68rem', color: '#93c5fd', wordBreak: 'break-all', marginBottom: '0.4rem' }}>
                      {wireBlocks.slice(0, 8).join(' ')}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#c084fc', fontWeight: 'bold', marginBottom: '0.2rem' }}>
                      REALIZATION64 (Material & Palette Proof):
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: '0.68rem', color: '#d8b4fe', wordBreak: 'break-all' }}>
                      {wireBlocks.slice(8, 16).join(' ')}
                    </div>
                  </div>
                )}

                {/* 4. FORM64 Physical Shape Slots */}
                {selectedTile.scd128Record?.form?.slots && (
                  <div style={{ background: '#1e293b', padding: '0.65rem 0.75rem', borderRadius: '6px', marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#60a5fa', marginBottom: '0.35rem' }}>
                      FORM64 Physical Shape Slots (Geometry & Sockets)
                    </div>
                    {selectedTile.scd128Record.form.slots.map((s) => (
                      <div key={s.slot} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#cbd5e1', marginBottom: '0.18rem' }}>
                        <span style={{ color: '#94a3b8' }}>{s.slot}:</span>
                        <span style={{ color: '#38bdf8', fontFamily: 'monospace', fontWeight: 'bold' }}>{s.canonicalCategory}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* 5. REALIZATION64 Style & Material Slots */}
                {selectedTile.scd128Record?.realization?.slots && (
                  <div style={{ background: '#1e293b', padding: '0.65rem 0.75rem', borderRadius: '6px', marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 'bold', color: '#c084fc', marginBottom: '0.35rem' }}>
                      REALIZATION64 Style Slots (Material & Palette)
                    </div>
                    {selectedTile.scd128Record.realization.slots.map((s) => (
                      <div key={s.slot} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: '#cbd5e1', marginBottom: '0.18rem' }}>
                        <span style={{ color: '#94a3b8' }}>{s.slot}:</span>
                        <span style={{ color: '#d8b4fe', fontFamily: 'monospace', fontWeight: 'bold' }}>{s.canonicalCategory}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ background: '#1e293b', padding: '1rem', borderRadius: '6px', marginBottom: '1.5rem', color: '#94a3b8', fontSize: '0.85rem' }}>
                💡 Click any tile, cliff, or tree on the canvas to inspect its authoritative SCDL V2 program, active AMPs, and SCD128 Dual-Witness record.
              </div>
            )}

            {/* Chunk-Level Diagnostics */}
            <h3 style={{ fontSize: '0.95rem', marginBottom: '0.6rem', color: '#94a3b8' }}>
              Chunk Architecture Diagnostics
            </h3>

            <div style={{ background: '#1e293b', padding: '0.75rem', borderRadius: '6px', marginBottom: '0.8rem', fontSize: '0.78rem' }}>
              <p style={{ margin: '0 0 0.3rem' }}><strong>Top plane cells:</strong> {result.candidate.layers.isoTile?.topPlane?.length || 0}</p>
              <p style={{ margin: '0 0 0.3rem' }}><strong>Rim cells:</strong> {result.candidate.layers.isoTile?.rimCells?.length || 0}</p>
              <p style={{ margin: '0 0 0.3rem' }}><strong>Extruded cliff cells:</strong> {Object.values(result.candidate.layers.isoTile?.sidePlanes || {}).flat().length}</p>
              <p style={{ margin: '0' }}><strong>Vegetation seeds:</strong> {result.candidate.layers.fibonacciField?.seeds?.length || 0}</p>
            </div>

            {/* Chunk Active AMPs Conveyor */}
            {result.candidate.layers.scd128Synthesizer?.ampDescriptors?.length > 0 && (
              <div style={{ background: '#1e293b', padding: '0.75rem', borderRadius: '6px', marginBottom: '0.8rem', fontSize: '0.78rem' }}>
                <div style={{ fontSize: '0.72rem', color: '#a78bfa', fontWeight: 'bold', marginBottom: '0.3rem' }}>
                  Chunk Pipeline AMPs ({result.candidate.layers.scd128Synthesizer.ampDescriptors.length} passes):
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
                  {[...new Set(result.candidate.layers.scd128Synthesizer.ampDescriptors.map(a => a.kind))].map((kind) => (
                    <span key={kind} style={{ background: '#090d16', color: '#38bdf8', padding: '2px 6px', borderRadius: '4px', fontSize: '0.68rem', fontFamily: 'monospace' }}>
                      {kind}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div style={{ background: '#1e293b', padding: '0.75rem', borderRadius: '6px', fontSize: '0.78rem' }}>
              <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 'bold', marginBottom: '0.2rem' }}>
                Chunk SCD128 Hash:
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: '0.68rem', color: '#4ade80', wordBreak: 'break-all' }}>
                {result.candidate.layers.scd128Synthesizer?.chunkWireHash || 'N/A'}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: '4rem', textAlign: 'center', backgroundColor: '#0f172a', borderRadius: '8px', border: '1px dashed #334155' }}>
          <p style={{ color: '#94a3b8', fontSize: '1.1rem', margin: '0 0 1rem' }}>
            No chunk currently forged. Select a biome preset above and click <strong>Forge Chunk</strong>.
          </p>
          <button
            type="button"
            onClick={handleGenerate}
            style={{ backgroundColor: '#38bdf8', color: '#090d16', padding: '0.6rem 1.5rem', borderRadius: '6px', cursor: 'pointer', border: 'none', fontWeight: 'bold' }}
          >
            Forge Chunk Now
          </button>
        </div>
      )}
    </div>
  );
}
