import { useEffect, useRef, useCallback, useState } from "react";
import { motion } from "framer-motion";
import { FormulaLibrary } from "./FormulaLibrary";
import { formulaToBytecode } from "../../lib/pixelbrain.adapter";
import "./PixelBrainTerminal.css";

/**
 * Map the /api/pixelbrain/compile response into the analysisResult shape the
 * terminal already renders. The backend packet is canonical; we only project
 * it for display (never recompute color/geometry here — COLOR_DRAGON).
 */
function mapCompileResultToAnalysis(data) {
  const packet = data?.packet || {};
  const digest = data?.digest || {};
  const canvas = packet.canvas || digest.canvas || { width: 64, height: 64, gridSize: 1 };
  const sourceColors = Array.isArray(digest.sourcePalette) && digest.sourcePalette.length > 0
    ? digest.sourcePalette
    : ["#888888"];
  const rawCoords = packet.geometry?.coordinates || digest.coordinates || [];
  const coordinates = rawCoords.map((c) => {
    const x = Math.round(Number(c?.snappedX ?? c?.x) || 0);
    const y = Math.round(Number(c?.snappedY ?? c?.y) || 0);
    return {
      snappedX: x,
      snappedY: y,
      emphasis: Number(c?.emphasis) || 0.6,
      // Authoritative source-palette color, chosen deterministically by position.
      color: c?.color || sourceColors[(x + y) % sourceColors.length],
      paletteKey: "source",
    };
  });
  const palettes = [
    { key: "source", colors: sourceColors },
    ...(Array.isArray(digest.semanticPalette) && digest.semanticPalette.length > 0
      ? [{ key: "mood", colors: digest.semanticPalette }]
      : []),
  ];
  const params = data?.params || {};
  return {
    coordinates,
    canvas,
    palettes,
    tokenCount: coordinates.length,
    activeTokenCount: coordinates.length,
    paletteCount: palettes.length,
    dominantAxis: params.form?.dominantAxis,
    dominantSymmetry: params.form?.symmetry,
    bytecode: data?.checksum ? `PB-NL-${data.checksum}` : null,
    intent: data?.intent,
    checksum: data?.checksum,
  };
}

function LatticeCanvas({ coordinates, canvas, palettes, isAnalyzing }) {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const progressRef = useRef(0);

  const drawLattice = useCallback((ctx, width, height, progress = 1) => {
    // Clear canvas
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = "#1a1a1a";
    ctx.lineWidth = 0.5;
    const gridSize = canvas?.gridSize || 1;
    for (let x = 0; x <= width; x += gridSize * 4) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += gridSize * 4) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw golden point
    if (canvas?.goldenPoint) {
      const gpX = (canvas.goldenPoint.x / canvas.width) * width;
      const gpY = (canvas.goldenPoint.y / canvas.height) * height;
      ctx.fillStyle = "#ffd700";
      ctx.beginPath();
      ctx.arc(gpX, gpY, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffd700";
      ctx.lineWidth = 0.5;
      ctx.setLineDash([2, 2]);
      ctx.beginPath();
      ctx.moveTo(gpX, 0);
      ctx.lineTo(gpX, height);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, gpY);
      ctx.lineTo(width, gpY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Build palette lookup
    const paletteMap = new Map();
    (palettes || []).forEach((palette) => {
      paletteMap.set(palette.key, palette.colors);
    });

    // Draw coordinates with progressive reveal
    const safeCoords = (coordinates || []).slice(0, Math.ceil((coordinates || []).length * progress));

    safeCoords.forEach((coord, index) => {
      // Use native canvas dimensions (no arbitrary standard)
      const canvasW = canvas?.width || 32;
      const canvasH = canvas?.height || 32;
      
      const x = (coord.snappedX / canvasW) * width;
      const y = (coord.snappedY / canvasH) * height;
      
      // Use direct color if available (from image), otherwise use palette
      let color = coord.color;
      if (!color) {
        const colors = paletteMap.get(coord.paletteKey) || ["#666666"];
        const colorIndex = Math.floor(coord.emphasis * (colors.length - 1));
        color = colors[Math.min(colorIndex, colors.length - 1)];
      }

      // Draw node
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(x, y, 4 + coord.emphasis * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Draw connection to next point
      if (index < safeCoords.length - 1) {
        const nextCoord = safeCoords[index + 1];
        const nextX = (nextCoord.snappedX / canvasW) * width;
        const nextY = (nextCoord.snappedY / canvasH) * height;

        ctx.strokeStyle = color;
        ctx.lineWidth = 1 + coord.emphasis * 2;
        ctx.globalAlpha = 0.4 + coord.emphasis * 0.4;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(nextX, nextY);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Draw token label (only for non-image sources that carry a token word).
      if (coord.token && (!coord.source || !coord.source.startsWith('image'))) {
        ctx.fillStyle = "#888";
        ctx.font = "8px 'JetBrains Mono', monospace";
        ctx.textAlign = "center";
        ctx.fillText(String(coord.token).substring(0, 6), x, y + 18);
      }
    });

    // Draw scan line effect
    if (isAnalyzing) {
      const scanY = (Date.now() / 5) % height;
      ctx.fillStyle = "rgba(0, 255, 136, 0.1)";
      ctx.fillRect(0, scanY - 20, width, 40);
    }
  }, [coordinates, canvas, palettes, isAnalyzing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const width = 320;
    const height = 288;
    canvas.width = width;
    canvas.height = height;

    if (isAnalyzing) {
      progressRef.current = 0;
      const animate = () => {
        progressRef.current = Math.min(1, progressRef.current + 0.02);
        drawLattice(ctx, width, height, progressRef.current);
        if (progressRef.current < 1) {
          animationRef.current = requestAnimationFrame(animate);
        }
      };
      animationRef.current = requestAnimationFrame(animate);
    } else {
      drawLattice(ctx, width, height, 1);
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [coordinates, canvas, palettes, isAnalyzing, drawLattice]);

  return (
    <div className="lattice-container">
      <canvas
        ref={canvasRef}
        className="lattice-canvas"
        aria-label="Phonetic lattice visualization"
        role="img"
      />
      <div className="lattice-overlay" aria-hidden="true">
        <div className="overlay-corner top-left"></div>
        <div className="overlay-corner top-right"></div>
        <div className="overlay-corner bottom-left"></div>
        <div className="overlay-corner bottom-right"></div>
      </div>
    </div>
  );
}

function PaletteDisplay({ palettes }) {
  if (!palettes || palettes.length === 0) {
    return (
      <div className="palette-section empty">
        <div className="section-header">
          <span className="header-icon">&#x25A0;</span>
          <span>PALETTE REGISTRY</span>
        </div>
        <div className="empty-message">NO PALETTES STABILIZED</div>
      </div>
    );
  }

  return (
    <div className="palette-section">
      <div className="section-header">
        <span className="header-icon">&#x25A0;</span>
        <span>PALETTE REGISTRY</span>
      </div>
      <div className="palette-grid">
        {palettes.map((palette, index) => (
          <motion.div
            key={palette.key}
            className="palette-entry"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <div className="palette-header">
              <span className="palette-school">{palette.schoolId}</span>
              <span className="palette-rarity">{palette.rarity}</span>
              <span className="palette-effect">{palette.effect}</span>
            </div>
            <div className="palette-swatches">
              {palette.colors.map((color, colorIndex) => (
                <div
                  key={colorIndex}
                  className="palette-swatch"
                  style={{ backgroundColor: color }}
                  title={`Color ${colorIndex}: ${color}`}
                  aria-label={`Palette color ${colorIndex + 1}: ${color}`}
                />
              ))}
            </div>
            <div className="palette-bytecode">
              {palette.bytecode}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function AnalysisMetrics({ result, onExport }) {
  if (!result) return null;

  if (result.message) {
    return (
      <div className="metrics-section">
        <div className="section-header">
          <span className="header-icon">◆</span>
          <span>ANALYSIS METRICS</span>
        </div>
        <div className="empty-message" style={{ textAlign: "center", padding: "20px" }}>
          {result.message}
        </div>
      </div>
    );
  }

  if (result.error) {
    return (
      <div className="metrics-section">
        <div className="section-header">
          <span className="header-icon">◆</span>
          <span>ANALYSIS METRICS</span>
        </div>
        <div className="error-message" style={{ textAlign: "center", padding: "20px", color: "#ff6b6b" }}>
          {result.error}
        </div>
      </div>
    );
  }

  const metrics = [
    { label: "TOKENS", value: result.tokenCount },
    { label: "ACTIVE", value: result.activeTokenCount },
    { label: "PALETTES", value: result.paletteCount },
    { label: "AXIS", value: result.dominantAxis?.toUpperCase() || "N/A" },
    { label: "SYMMETRY", value: result.dominantSymmetry?.toUpperCase() || "N/A" },
    { label: "COVERAGE", value: `${Math.round((result.activeTokenCount / Math.max(1, result.tokenCount)) * 100)}%` },
  ];
  const photonicRoute = result.photonicRoute;

  return (
    <div className="metrics-section">
      <div className="section-header">
        <span className="header-icon">◆</span>
        <span>ANALYSIS METRICS</span>
        {onExport && (
          <button className="mini-export-btn" onClick={onExport} title="Export Sigil">
            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>download</span>
          </button>
        )}
      </div>
      <div className="metrics-grid">
        {metrics.map((metric, index) => (
          <motion.div
            key={metric.label}
            className="metric-cell"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: index * 0.05 }}
          >
            <div className="metric-label">{metric.label}</div>
            <div className="metric-value">{metric.value}</div>
          </motion.div>
        ))}
      </div>
      {photonicRoute && (
        <PhotonicTrace route={photonicRoute} />
      )}
    </div>
  );
}

function formatPacketId(packetId) {
  const value = String(packetId || 'retina_null');
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function byteClass(value) {
  if (value < 0) return 'negative';
  if (value > 0) return 'positive';
  return 'zero';
}

function PhotonicTrace({ route }) {
  const previewValues = Array.isArray(route?.preview?.values)
    ? route.preview.values.slice(0, 24)
    : [];
  const bridgeGrade = route?.bridgeReport?.compatibilityGrade || 'N/A';
  const opticalFit = Math.round((Number(route?.opticalSimulation?.opticalFit) || 0) * 100);
  const deltaCount = Number(route?.delta?.changedCount) || 0;
  const packetId = route?.packet?.packetId || route?.preview?.packetId;

  return (
    <div className="photonic-trace" aria-label="Photonic Retina bridge trace">
      <div className="photonic-trace-head">
        <span className="photonic-trace-title">PHOTONIC TRACE</span>
        <span className="photonic-packet-id" title={packetId}>{formatPacketId(packetId)}</span>
      </div>
      <div className="photonic-trace-grid">
        <div className="photonic-trace-cell">
          <span>RETINA</span>
          <strong>{previewValues.length}B</strong>
        </div>
        <div className="photonic-trace-cell">
          <span>BRIDGE</span>
          <strong>{bridgeGrade}</strong>
        </div>
        <div className="photonic-trace-cell">
          <span>OPTICAL</span>
          <strong>{opticalFit}%</strong>
        </div>
        <div className="photonic-trace-cell">
          <span>DELTA</span>
          <strong>{deltaCount}</strong>
        </div>
      </div>
      <div className="photonic-byte-strip" aria-label="Photonic low-bit preview bytes">
        {previewValues.map((value, index) => (
          <span
            key={`${index}-${value}`}
            className={`photonic-byte ${byteClass(value)}`}
            title={`Byte ${index}: ${value}`}
          />
        ))}
      </div>
    </div>
  );
}

function IdleState() {
  return (
    <div className="terminal-idle">
      <div className="idle-glyph" aria-hidden="true">
        <svg viewBox="0 0 100 100" className="glyph-svg">
          <circle cx="50" cy="50" r="40" fill="none" stroke="#333" strokeWidth="1" />
          <circle cx="50" cy="50" r="30" fill="none" stroke="#222" strokeWidth="1" />
          <circle cx="50" cy="50" r="20" fill="none" stroke="#1a1a1a" strokeWidth="1" />
          <line x1="50" y1="10" x2="50" y2="90" stroke="#222" strokeWidth="0.5" />
          <line x1="10" y1="50" x2="90" y2="50" stroke="#222" strokeWidth="0.5" />
          <line x1="22" y1="22" x2="78" y2="78" stroke="#222" strokeWidth="0.5" />
          <line x1="78" y1="22" x2="22" y2="78" stroke="#222" strokeWidth="0.5" />
        </svg>
      </div>
      <div className="idle-message">
        <p>AWAITING INPUT STREAM</p>
        <p className="idle-subtext">Initialize phonetic lattice synthesis</p>
      </div>
      <div className="idle-commands">
        <span className="command-key">ENTER</span>
        <span className="command-text">verse text above</span>
        <span className="command-key">CLICK</span>
        <span className="command-text">select preset</span>
        <span className="command-key">SCAN</span>
        <span className="command-text">initiate analysis</span>
      </div>
    </div>
  );
}

function AnalyzingState() {
  return (
    <div className="terminal-analyzing">
      <div className="analyzing-ring" aria-hidden="true">
        <div className="ring-outer"></div>
        <div className="ring-middle"></div>
        <div className="ring-inner"></div>
      </div>
      <div className="analyzing-text">
        <span className="text-line">PARSING PHONEMES</span>
        <span className="text-line">GENERATING BYTECODE</span>
        <span className="text-line">MAPPING COORDINATES</span>
        <span className="text-line">STABILIZING PALETTES</span>
      </div>
      <div className="analyzing-progress">
        <div className="progress-bar">
          <div className="progress-fill"></div>
        </div>
      </div>
    </div>
  );
}

export default function PixelBrainTerminal({ mode: propMode, analysisResult: propAnalysisResult, onFormulaSelect, onClose }) {
  const [prompt, setPrompt] = useState("");
  const [compiled, setCompiled] = useState(null);
  const [compileState, setCompileState] = useState("idle"); // idle | compiling | error
  const [compileError, setCompileError] = useState(null);

  const handleCompile = useCallback(async () => {
    const text = prompt.trim();
    if (!text || compileState === "compiling") return;
    setCompileState("compiling");
    setCompileError(null);
    try {
      const res = await fetch("/api/pixelbrain/compile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ prompt: text }),
      });
      if (!res.ok) throw new Error(`Compile failed (${res.status})`);
      const data = await res.json();
      setCompiled(mapCompileResultToAnalysis(data));
      setCompileState("idle");
    } catch (err) {
      setCompileError(err?.message || "Compilation failed");
      setCompileState("error");
    }
  }, [prompt, compileState]);

  // An internally compiled prompt takes precedence over the prop-driven flow,
  // so the existing result JSX below renders it without further changes.
  const analysisResult = compiled || propAnalysisResult;
  const mode = compileState === "compiling"
    ? "analyzing"
    : (compiled ? "result" : propMode);

  const handleExport = () => {
    if (!analysisResult) return;
    
    // Generate bytecode
    const bytecode = analysisResult.bytecode || (analysisResult.formula ? formulaToBytecode(analysisResult.formula) : "0x000");
    
    // Create export payload
    const data = JSON.stringify({
      version: "11.3",
      timestamp: Date.now(),
      analysis: {
        tokenCount: analysisResult.tokenCount,
        palettes: analysisResult.palettes,
        bytecode
      }
    }, null, 2);

    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pixelbrain_sigil_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="pixelbrain-terminal">
      {onClose && (
        <button 
          className="terminal-close-btn" 
          onClick={onClose}
          aria-label="Close terminal"
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            zIndex: 100,
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: 'white',
            borderRadius: '4px',
            cursor: 'pointer',
            padding: '4px'
          }}
        >
          <span className="material-symbols-outlined">close</span>
        </button>
      )}
      {/* CRT Effects */}
      <div className="crt-overlay" aria-hidden="true">
        <div className="scanlines"></div>
        <div className="phosphor-glow"></div>
        <div className="screen-curve"></div>
      </div>

      {/* Terminal Content */}
      <div className="terminal-screen">
        {mode === "input" && (
          <div
            className="terminal-input-state"
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", padding: "24px" }}
          >
            <div className="idle-message" style={{ textAlign: "center", color: "#7affa0", letterSpacing: "2px" }}>
              PHONETIC LATTICE SYNTHESIS
            </div>
            <form
              onSubmit={(e) => { e.preventDefault(); handleCompile(); }}
              style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%", maxWidth: "440px" }}
            >
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the sigil — e.g. a heroic golden sword"
                rows={2}
                aria-label="PixelBrain compile prompt"
                style={{
                  resize: "vertical",
                  background: "rgba(0,0,0,0.4)",
                  color: "#d8ffe0",
                  border: "1px solid rgba(120,255,160,0.3)",
                  borderRadius: "4px",
                  padding: "8px",
                  fontFamily: "monospace",
                }}
              />
              <button
                type="submit"
                disabled={!prompt.trim() || compileState === "compiling"}
                style={{
                  background: "rgba(120,255,160,0.12)",
                  color: "#d8ffe0",
                  border: "1px solid rgba(120,255,160,0.4)",
                  borderRadius: "4px",
                  padding: "8px",
                  cursor: prompt.trim() ? "pointer" : "not-allowed",
                  fontFamily: "monospace",
                  letterSpacing: "2px",
                }}
              >
                {compileState === "compiling" ? "FORGING…" : "FORGE"}
              </button>
              {compileError && (
                <div style={{ color: "#ff8080", fontFamily: "monospace", fontSize: "12px" }}>{compileError}</div>
              )}
            </form>
            <IdleState />
          </div>
        )}
        {mode === "analyzing" && <AnalyzingState />}
        {mode === "result" && analysisResult && (
          <motion.div
            className="terminal-results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <div className="results-header">
              <span className="header-status">
                {analysisResult.error ? "ANALYSIS FAILED" : analysisResult.message ? "LIMITED RESULT" : "ANALYSIS COMPLETE"}
              </span>
              <span className="header-timestamp">
                {new Date().toLocaleTimeString()}
              </span>
            </div>

            <div className="results-content">
              {analysisResult.error || analysisResult.message ? (
                <div className="results-message">
                  <div className="message-content">
                    {analysisResult.error || analysisResult.message}
                  </div>
                </div>
              ) : (
                <LatticeCanvas
                  coordinates={analysisResult.coordinates}
                  canvas={analysisResult.canvas}
                  palettes={analysisResult.palettes}
                  isAnalyzing={false}
                />
              )}

              <div className="results-sidebar">
                {analysisResult.referenceImage ? (
                  <div className="reference-image-display">
                    <div className="sidebar-label">REFERENCE</div>
                    <img
                      src={analysisResult.referenceImage.preview}
                      alt="Reference"
                      className="reference-thumbnail"
                    />
                    {analysisResult.referenceImage.analysis && (
                      <div className="reference-analysis-mini">
                        <div className="mini-colors">
                          {analysisResult.referenceImage.analysis.colors?.slice(0, 4).map((color, i) => (
                            <div
                              key={i}
                              className="mini-swatch"
                              style={{ backgroundColor: color.hex }}
                              title={`${color.hex} (${color.percentage}%)`}
                            />
                          ))}
                        </div>
                        <div className="mini-stats">
                          {analysisResult.referenceImage.analysis.composition?.dominantAxis}
                          {analysisResult.referenceImage.analysis.composition?.hasSymmetry ? ' • symmetric' : ''}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <FormulaLibrary 
                    onSelect={onFormulaSelect} 
                    currentFormulaId={analysisResult.formula?.id} 
                  />
                )}
                <AnalysisMetrics result={analysisResult} onExport={handleExport} />
                <PaletteDisplay palettes={analysisResult.palettes} />
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Terminal Bezel */}
      <div className="terminal-bezel" aria-hidden="true">
        <div className="bezel-brand">PIXELBRAIN</div>
        {/* Holographic Bezel Emitters */}
        <div className="bezel-emitter emitter-left">
          <div className="emitter-core">0xL</div>
          <div className="emitter-rings"></div>
        </div>
        <div className="bezel-emitter emitter-right">
          <div className="emitter-core">0xR</div>
          <div className="emitter-rings"></div>
        </div>
      </div>
    </div>
  );
}
