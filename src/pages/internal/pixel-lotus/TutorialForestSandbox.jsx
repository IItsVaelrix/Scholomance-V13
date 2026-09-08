import { useEffect, useRef, useState, useCallback } from 'react';
import { mountPhaserGame } from '../../../lib/phaser/phaser-runtime.adapter.js';
import createTutorialForestScene from '../../../game/tutorial-forest/phaser/TutorialForestScene.js';
import './TutorialForestSandbox.css';

export default function TutorialForestSandbox() {
  const containerRef = useRef(null);
  const gameRef = useRef(null);
  const sceneRef = useRef(null);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [lightingMode, setLightingMode] = useState('day');
  const [seed, setSeed] = useState(4242);
  const [windEnabled, setWindEnabled] = useState(true);
  const [particlesEnabled, setParticlesEnabled] = useState(true);
  const [shaderCausticsEnabled, setShaderCausticsEnabled] = useState(true);
  const [glowEnabled, setGlowEnabled] = useState(true);

  const handleSelectEntity = useCallback((entity) => {
    setSelectedEntity(entity);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function mountScene() {
      if (!containerRef.current) return;

      const sceneFactory = (Phaser) => {
        const SceneClass = createTutorialForestScene(Phaser);
        const sceneInstance = new SceneClass();
        sceneRef.current = sceneInstance;
        sceneInstance.init({
          seed: 4242,
          onSelectEntity: handleSelectEntity,
          windEnabled: true,
          particlesEnabled: true,
          shaderCausticsEnabled: true,
          glowEnabled: true,
          lightingMode: 'day',
        });
        return sceneInstance;
      };

      const result = await mountPhaserGame({
        parent: containerRef.current,
        buildScenes: [sceneFactory],
        signal: controller.signal,
        config: {
          type: 2, // WebGL
          width: '100%',
          height: '100%',
          transparent: false,
          pixelArt: true,
          roundPixels: true,
          backgroundColor: '#03050a',
          scale: {
            mode: 3, // RESIZE
            autoCenter: 1,
          },
          physics: { default: 'arcade' },
          banner: false,
          disableContextMenu: true,
        },
      });

      if (controller.signal.aborted || !result) return;
      gameRef.current = result;
    }

    mountScene();

    return () => {
      controller.abort();
      if (gameRef.current) {
        gameRef.current.destroy();
        gameRef.current = null;
        sceneRef.current = null;
      }
    };
  }, [handleSelectEntity]);

  const cycleLighting = () => {
    const next = lightingMode === 'day' ? 'twilight' : lightingMode === 'twilight' ? 'night' : 'day';
    setLightingMode(next);
    sceneRef.current?.setLightingMode(next);
  };

  const toggleWind = () => {
    const next = !windEnabled;
    setWindEnabled(next);
    sceneRef.current?.setWindEnabled(next);
  };

  const toggleParticles = () => {
    const next = !particlesEnabled;
    setParticlesEnabled(next);
    sceneRef.current?.setParticlesEnabled(next);
  };

  const toggleShaderCaustics = () => {
    const next = !shaderCausticsEnabled;
    setShaderCausticsEnabled(next);
    sceneRef.current?.setShaderCausticsEnabled(next);
  };

  const toggleGlow = () => {
    const next = !glowEnabled;
    setGlowEnabled(next);
    sceneRef.current?.setGlowEnabled(next);
  };

  const regenerateWorld = () => {
    const nextSeed = Math.floor(Math.random() * 99999) + 1;
    setSeed(nextSeed);
    sceneRef.current?.reseed(nextSeed);
  };

  const formatHexBlocks = (hexString) => {
    if (!hexString || hexString.length !== 128) return hexString;
    const blocks = [];
    for (let i = 0; i < 16; i += 1) {
      blocks.push(hexString.slice(i * 8, (i + 1) * 8));
    }
    return blocks;
  };

  const wireBlocks = selectedEntity?.scd128Record?.scd128Wire
    ? formatHexBlocks(selectedEntity.scd128Record.scd128Wire)
    : null;

  return (
    <div className="tf-sandbox-root">
      <header className="tf-header">
        <div className="tf-header-left">
          <span className="tf-badge">SCD128 + WebGL Shaders + Phaser 4</span>
          <h1 className="tf-title">Living Tutorial Forest</h1>
          <span className="tf-subtitle">Seed #{seed}</span>
        </div>

        <div className="tf-controls-bar">
          <button
            type="button"
            className={`tf-btn ${lightingMode !== 'day' ? 'active' : ''}`}
            onClick={cycleLighting}
            title="Cycle Day / Twilight / Bioluminescent Night camera grading"
          >
            Grade: {lightingMode.toUpperCase()}
          </button>

          <button
            type="button"
            className={`tf-btn ${shaderCausticsEnabled ? 'active' : ''}`}
            onClick={toggleShaderCaustics}
            title="Toggle WebGL real-time water caustic shader"
          >
            Caustics: {shaderCausticsEnabled ? 'ON' : 'OFF'}
          </button>

          <button
            type="button"
            className={`tf-btn ${glowEnabled ? 'active' : ''}`}
            onClick={toggleGlow}
            title="Toggle WebGL bioluminescent bloom glow"
          >
            Bloom Glow: {glowEnabled ? 'ON' : 'OFF'}
          </button>

          <button
            type="button"
            className={`tf-btn ${windEnabled ? 'active' : ''}`}
            onClick={toggleWind}
            title="Toggle tree canopy wind sway animation"
          >
            Wind: {windEnabled ? 'ON' : 'OFF'}
          </button>

          <button
            type="button"
            className={`tf-btn ${particlesEnabled ? 'active' : ''}`}
            onClick={toggleParticles}
            title="Toggle floating spores & fireflies"
          >
            Spores: {particlesEnabled ? 'ON' : 'OFF'}
          </button>

          <button
            type="button"
            className="tf-btn tf-btn-primary"
            onClick={regenerateWorld}
            title="Re-seed procedural forest"
          >
            Re-seed World
          </button>
        </div>
      </header>

      <main className="tf-main-stage">
        <div className="tf-viewport-container">
          <div ref={containerRef} className="tf-canvas-target" />

          <div className="tf-viewport-hints">
            <span className="tf-hint-tag">🖱️ Click tile to walk (BFS Pathfinding)</span>
            <span className="tf-hint-tag">🔍 Click landmark / tree / lotus to inspect SCD128</span>
            <span className="tf-hint-tag">🖐️ Drag canvas to pan · Scroll to zoom</span>
          </div>
        </div>

        <aside className="tf-inspector-panel">
          <div className="tf-inspector-header">
            <h2 className="tf-inspector-title">PixelBrain Inspector</h2>
            <p style={{ margin: 0, fontSize: '0.75rem', color: '#64748b' }}>
              Deterministic Dual-Witness & SCDL V2
            </p>
          </div>

          <div className="tf-inspector-body">
            {selectedEntity ? (
              <>
                <div className="tf-card">
                  <h3 className="tf-card-title">Selected Entity</h3>
                  <h4 className="tf-entity-name">{selectedEntity.name || selectedEntity.type}</h4>
                  <p className="tf-entity-desc">{selectedEntity.description}</p>
                </div>

                {wireBlocks && (
                  <div className="tf-card">
                    <h3 className="tf-card-title">SCD128 128-Hex Wire Record</h3>
                    <div className="tf-scd128-wire">
                      <div style={{ marginBottom: '0.25rem' }}>
                        <strong style={{ color: '#60a5fa' }}>FORM64 (Blocks 01-08):</strong>
                        <div className="tf-wire-form">
                          {wireBlocks.slice(0, 8).join(' ')}
                        </div>
                      </div>
                      <div>
                        <strong style={{ color: '#a78bfa' }}>REALIZATION64 (Blocks 09-16):</strong>
                        <div className="tf-wire-real">
                          {wireBlocks.slice(8, 16).join(' ')}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {selectedEntity.scd128Record?.form?.slots && (
                  <div className="tf-card">
                    <h3 className="tf-card-title">FORM64 Physical Slots (Geometry)</h3>
                    <div className="tf-slot-list">
                      {selectedEntity.scd128Record.form.slots.map((s) => (
                        <div key={s.slot} className="tf-slot-row">
                          <span className="tf-slot-key">{s.slot}</span>
                          <span className="tf-slot-val">{s.canonicalCategory}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedEntity.scd128Record?.realization?.slots && (
                  <div className="tf-card">
                    <h3 className="tf-card-title">REALIZATION64 Physical Slots (Art)</h3>
                    <div className="tf-slot-list">
                      {selectedEntity.scd128Record.realization.slots.map((s) => (
                        <div key={s.slot} className="tf-slot-row">
                          <span className="tf-slot-key">{s.slot}</span>
                          <span className="tf-slot-val">{s.canonicalCategory}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedEntity.scdlAssetId && (
                  <div className="tf-card">
                    <h3 className="tf-card-title">SCDL V2 Character Spec</h3>
                    <div className="tf-slot-list">
                      <div className="tf-slot-row">
                        <span className="tf-slot-key">Asset ID</span>
                        <span className="tf-slot-val">{selectedEntity.scdlAssetId}</span>
                      </div>
                      <div className="tf-slot-row">
                        <span className="tf-slot-key">Canvas Dimensions</span>
                        <span className="tf-slot-val">32 x 48 (4 heads tall)</span>
                      </div>
                      <div className="tf-slot-row">
                        <span className="tf-slot-key">Compiler</span>
                        <span className="tf-slot-val">SCDL 2.0.0 (Pure IR)</span>
                      </div>
                      <div className="tf-slot-row">
                        <span className="tf-slot-key">Animation Loops</span>
                        <span className="tf-slot-val">idle (2f) / walk (4f)</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="tf-empty-inspect">
                Click any tile, tree, lotus bloom, or prop on the map to inspect its SCD128 Dual-Witness packet and metadata.
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}
