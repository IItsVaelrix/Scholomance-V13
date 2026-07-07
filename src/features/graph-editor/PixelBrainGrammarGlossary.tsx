import React, { useState } from 'react';

export function PixelBrainGrammarGlossary({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState('axioms');

  const tabs = [
    { id: 'axioms', label: 'The Ten Axioms' },
    { id: 'nodes', label: 'Node & Packet Syntax' },
    { id: 'errors', label: 'PB-ERR (Errors)' },
    { id: 'fixes', label: 'PB-FIX (Solutions)' },
    { id: 'math', label: '0xF: (Math Tongue)' },
    { id: 'architecture', label: 'Architecture Laws' }
  ];

  return (
    <div style={{
      position: 'absolute', top: 40, left: 40, right: 40, bottom: 40,
      background: 'rgba(15, 15, 18, 0.95)', border: '1px solid #333',
      borderRadius: 12, boxShadow: '0 0 50px rgba(0,0,0,0.8)',
      display: 'flex', flexDirection: 'column', zIndex: 9999,
      backdropFilter: 'blur(10px)', color: '#fff', overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{ padding: '16px 24px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 18, color: '#00ffcc' }}>PixelBrain Grammar Glossary</h2>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>Canonical Operating Manual & Language Reference (WP-PIXELBRAIN-LANGUAGE-v1)</div>
        </div>
        <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 20 }}>✕</button>
      </div>

      {/* Body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* Sidebar Tabs */}
        <div style={{ width: 220, borderRight: '1px solid #333', background: '#16161a', display: 'flex', flexDirection: 'column' }}>
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{
                padding: '16px', textAlign: 'left', background: activeTab === t.id ? '#222' : 'transparent',
                border: 'none', color: activeTab === t.id ? '#00ffcc' : '#888',
                borderLeft: activeTab === t.id ? '3px solid #00ffcc' : '3px solid transparent',
                cursor: 'pointer', fontSize: 14, fontWeight: activeTab === t.id ? 'bold' : 'normal',
                transition: 'all 0.2s'
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <div style={{ flex: 1, padding: 32, overflowY: 'auto', fontSize: 14, lineHeight: 1.6 }}>
          {activeTab === 'axioms' && (
            <div>
              <h3 style={{ color: '#00ffcc', marginTop: 0 }}>The Ten Axioms of PixelBrain</h3>
              <p>Every valid construct in the language conforms to all ten of these axioms.</p>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <li><strong style={{ color: '#fff' }}>1. Bytecode Is Truth:</strong> Whenever state crosses a boundary, it is encoded as structured bytecode. Renders are projections, not sources.</li>
                <li><strong style={{ color: '#fff' }}>2. Lattice Is Law:</strong> Visual geometry lives on an integer-cell grid. Canonical state is coordinates (x, y, color, partId).</li>
                <li><strong style={{ color: '#fff' }}>3. Symmetry Is Automatic:</strong> Symmetries (radial, axial, diagonal) are first-class values. If missing, the blueprint hasn't been analyzed.</li>
                <li><strong style={{ color: '#fff' }}>4. Errors Are Bytecode:</strong> Every failure mode has a canonical bytecode shape (PB-ERR-v1). Stack traces are decorative.</li>
                <li><strong style={{ color: '#fff' }}>5. Determinism Is Non-Negotiable:</strong> Same input → same output. No Math.random(). Allowed: coordinate-hashed noise, FNV-1a.</li>
                <li><strong style={{ color: '#fff' }}>6. Checksum Integrity Is Required:</strong> Every bytecode carries an 8-digit FNV-1a hex checksum.</li>
                <li><strong style={{ color: '#fff' }}>7. Context Is Base64(JSON):</strong> Payloads in bytecode are JSON, UTF-8 encoded, then base64 encoded into a single field.</li>
                <li><strong style={{ color: '#fff' }}>8. Versioning Is Explicit:</strong> Every family is suffixed with a version (e.g., -v1). Backward compatibility is announced, never assumed.</li>
                <li><strong style={{ color: '#fff' }}>9. Strictness Is Loud:</strong> Missing requirements fail with FATAL or CRIT severity. Warnings are only for polish.</li>
                <li><strong style={{ color: '#fff' }}>10. The Schema Is Sovereign:</strong> New shapes require a SCHEMA CHANGE NOTICE. Parallel schemas are forbidden.</li>
              </ul>
            </div>
          )}

          {activeTab === 'nodes' && (
            <div>
              <h3 style={{ color: '#00ffcc', marginTop: 0 }}>Node & Packet Syntax</h3>
              <p>The JSON structure used for authoring PixelBrain Graph Packets.</p>
              
              <h4 style={{ color: '#aaa' }}>ScholomanceGraphPacketV1</h4>
              <pre style={{ background: '#0a0a0c', padding: 12, borderRadius: 8, fontFamily: 'monospace', border: '1px solid #333', overflowX: 'auto', fontSize: 12 }}>{`{
  "contract": "SCHOLOMANCE-GRAPH-PACKET-v1",
  "graphId": "slime-generator",
  "title": "Crimson Slime",
  "domain": "mixed",
  "seed": "42",
  "nodes": [ ... ],
  "edges": [ ... ]
}`}</pre>

              <h4 style={{ color: '#aaa' }}>Common Node Params (JSON)</h4>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <li>
                  <strong style={{ color: '#ff4444' }}>pixelbrain.geometryKernel</strong>
                  <pre style={{ margin: '4px 0 0 0', background: '#1a1a1a', padding: 8, borderRadius: 4, fontSize: 11, borderLeft: '3px solid #ff4444' }}>{`{
  "shape": "blob", // or "polygon", "bezier", "morph"
  "vertices": 12,
  "tension": 0.8,
  "scale": 1.5,
  "goldenRatio": true
}`}</pre>
                </li>
                <li>
                  <strong style={{ color: '#00ffcc' }}>pixelbrain.compile (Rasterize)</strong>
                  <pre style={{ margin: '4px 0 0 0', background: '#1a1a1a', padding: 8, borderRadius: 4, fontSize: 11, borderLeft: '3px solid #00ffcc' }}>{`{
  "targetResolution": 64,
  "useSymmetry": true,  // Automatically mirrors noise on Y-axis
  "antiAlias": true
}`}</pre>
                </li>
                <li>
                  <strong style={{ color: '#ff00ff' }}>pixelbrain.colorResolve</strong>
                  <pre style={{ margin: '4px 0 0 0', background: '#1a1a1a', padding: 8, borderRadius: 4, fontSize: 11, borderLeft: '3px solid #ff00ff' }}>{`{
  "primary": "#DC143C",
  "secondary": "#FF4500",
  "glow": "#FFD700"
}`}</pre>
                </li>
              </ul>
            </div>
          )}

          {activeTab === 'errors' && (
            <div>
              <h3 style={{ color: '#ff4444', marginTop: 0 }}>PB-ERR-v1: The Error Tongue</h3>
              <p>Used to encode failure modes structurally for agents, humans, and CI.</p>
              
              <div style={{ background: '#0a0a0c', padding: 16, borderRadius: 8, fontFamily: 'monospace', marginBottom: 16, border: '1px solid #333' }}>
                PB-ERR-v1 - CATEGORY - SEVERITY - MODULE - CODE - CONTEXT_B64 - CHECKSUM
              </div>
              
              <h4 style={{ color: '#aaa' }}>Severities</h4>
              <ul style={{ marginBottom: 24 }}>
                <li><strong style={{ color: '#ff4444' }}>FATAL:</strong> Process cannot continue. Throw immediately.</li>
                <li><strong style={{ color: '#ff8800' }}>CRIT:</strong> Subsystem cannot continue. Bubble up.</li>
                <li><strong style={{ color: '#ffff00' }}>WARN:</strong> Degraded behavior; tolerable. Log and continue.</li>
                <li><strong style={{ color: '#00ffcc' }}>INFO:</strong> Diagnostic only.</li>
              </ul>

              <h4 style={{ color: '#aaa' }}>Example Breakdown</h4>
              <div style={{ background: '#1a1a24', padding: 12, borderRadius: 6, fontSize: 12, fontFamily: 'monospace', borderLeft: '3px solid #ff4444' }}>
                PB-ERR-v1-TYPE-CRIT-IMGPIX-0001-[base64...]-3E9895BB
              </div>
              <ul style={{ fontSize: 13, marginTop: 8 }}>
                <li><strong>TYPE</strong>: Category (Type mismatch)</li>
                <li><strong>CRIT</strong>: Severity</li>
                <li><strong>IMGPIX</strong>: Module (Image Pixel Engine)</li>
                <li><strong>0001</strong>: Code</li>
                <li><strong>[base64]</strong>: Decodes to {"{ \"parameterName\": \"pixelData\", \"expectedType\": \"string\" }"}</li>
              </ul>
            </div>
          )}

          {activeTab === 'fixes' && (
            <div>
              <h3 style={{ color: '#00ffcc', marginTop: 0 }}>PB-FIX-v1: The Solution Tongue</h3>
              <p>Records a known-good fix recipe for a corresponding PB-ERR.</p>
              
              <div style={{ background: '#0a0a0c', padding: 16, borderRadius: 8, fontFamily: 'monospace', marginBottom: 16, border: '1px solid #333' }}>
                PB-FIX-v1 - CATEGORY - OP - CODE - CONTEXT_B64 - CHECKSUM
              </div>

              <h4 style={{ color: '#aaa' }}>Canonical Verbs (OP)</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
                <div style={{ background: '#222', padding: 8, borderRadius: 4 }}><code>validate_type</code> - Add typeof guard</div>
                <div style={{ background: '#222', padding: 8, borderRadius: 4 }}><code>clamp</code> - Clamp to [min, max]</div>
                <div style={{ background: '#222', padding: 8, borderRadius: 4 }}><code>default_value</code> - Substitute default</div>
                <div style={{ background: '#222', padding: 8, borderRadius: 4 }}><code>coerce</code> - Force Number/String</div>
                <div style={{ background: '#222', padding: 8, borderRadius: 4 }}><code>register</code> - Add to registry</div>
                <div style={{ background: '#222', padding: 8, borderRadius: 4 }}><code>fallback</code> - Use fallback path</div>
              </div>

              <h4 style={{ color: '#aaa', marginTop: 24 }}>Example</h4>
              <div style={{ background: '#1a2420', padding: 12, borderRadius: 6, fontSize: 12, fontFamily: 'monospace', borderLeft: '3px solid #00ffcc' }}>
                PB-FIX-v1-TYPE-validate_type-0001-[base64...]-3E733C19
              </div>
            </div>
          )}

          {activeTab === 'math' && (
            <div>
              <h3 style={{ color: '#ff00ff', marginTop: 0 }}>0xF: The Pixel-Art Math Tongue</h3>
              <p>Describes a pixel-art transformation as a pure function in a tiny, deterministic syntax.</p>
              
              <div style={{ background: '#0a0a0c', padding: 16, borderRadius: 8, fontFamily: 'monospace', marginBottom: 16, border: '1px solid #333' }}>
                0xF : KIND : BODY
              </div>

              <h4 style={{ color: '#aaa' }}>Formula Kinds</h4>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <li><strong>1d:</strong> <code>0xF:1d:f(x)=2*x+1</code></li>
                <li><strong>2d:</strong> <code>0xF:2d:g(x,y)=0.5*x+0.5*y+0</code></li>
                <li><strong>noise:</strong> <code>0xF:noise:n(x,y,s)=fnv1a(x*73+y*131+s)</code></li>
                <li><strong>sdf:</strong> <code>0xF:sdf:s(p)=length(p-vec2(32,32))-8</code></li>
                <li><strong>trig:</strong> <code>0xF:trig:t(t)=sin(2*pi*t/800)*0.5+0.5</code></li>
                <li><strong>fill:</strong> <code>0xF:fill:region(0,0,16,16,material=voidsteel)</code></li>
              </ul>
              
              <div style={{ marginTop: 24, padding: 12, background: 'rgba(255,0,255,0.1)', border: '1px solid rgba(255,0,255,0.3)', borderRadius: 6 }}>
                <strong>Rule:</strong> Constants must be literals. No Math.random() or Date.now(). Functions must be from the fixed library (sin, cos, tan, length, normalize, floor, ceil, clamp, fnv1a, mix, step, smoothstep).
              </div>
            </div>
          )}

          {activeTab === 'architecture' && (
            <div>
              <h3 style={{ color: '#00ffcc', marginTop: 0 }}>Architecture & Operating Rules</h3>
              <p>Guidelines for working with PixelBrain engines.</p>
              
              <h4 style={{ color: '#aaa' }}>Anti-Patterns</h4>
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <li><strong>Screenshot as Source:</strong> Never treat a canvas snapshot as the canonical asset. The lattice coordinates are the source.</li>
                <li><strong>Shader Invents Geometry:</strong> Shaders consume masks to add VFX; they must never invent geometry where the mask is empty.</li>
                <li><strong>Silent Missing Materials:</strong> Do not silently fall back to '#000000'. Required materials must fail loudly.</li>
                <li><strong>UI Becomes Authority:</strong> The DOM state is never canonical geometry. Always map back to Template Grid state.</li>
              </ul>

              <h4 style={{ color: '#aaa' }}>Export Packets</h4>
              <p>Use <code>derivePixelBrainExportPacket()</code> when crossing boundaries. Outputs include:</p>
              <ul>
                <li>JSON data payloads</li>
                <li>Godot <code>.pbrain</code> artifact payloads</li>
                <li>Phaser helpers</li>
                <li>Shader packets (<code>PB-SHADER-v1</code>)</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
