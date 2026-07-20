import { useEffect, useRef, useState } from 'react';
import { NodeEditor } from 'rete';
import { createReteEditor } from './createReteEditor';
import { exportReteToGraphPacket, importGraphPacketToRete } from './reteGraphAdapter';
import { ScholomanceGraphPacketV1 } from './graphPacketSchema';
import { listNodeKinds, getNodeDefinition } from './nodeRegistry';
import { createReteNodeFromDefinition } from './reteNodeFactory';
import { PixelBrainGrammarGlossary } from './PixelBrainGrammarGlossary';

function LiveSlimeRenderer({ editor, refreshNonce }: { editor: NodeEditor<any> | null, refreshNonce: number }) {
  if (!editor) return <div style={{ color: '#666' }}>Engine offline</div>;

  // Find the required nodes in the live graph
  const nodes = editor.getNodes();
  const colorNode = nodes.find(n => (n as any).kind === 'pixelbrain.colorResolve') as any;
  const geomNode = nodes.find(n => (n as any).kind === 'pixelbrain.geometryKernel') as any;
  const compileNode = nodes.find(n => (n as any).kind === 'pixelbrain.compile') as any;

  if (!colorNode || !geomNode) {
    return <div style={{ color: '#882222', fontSize: 12 }}>Missing geometry/color dependencies...</div>;
  }

  // Extract raw params
  const colors = colorNode.data || { primary: '#DC143C', secondary: '#FF4500' };
  const geom = geomNode.data || { shape: 'blob', vertices: 12, tension: 0.8, scale: 1.5, goldenRatio: true };
  const compileParams = compileNode?.data || { useSymmetry: true };

  // Calculate Geometry Kernel Math on the fly
  const n = geom.vertices || 12;
  const tension = geom.tension || 0.8;
  const scale = geom.scale || 1.5;
  const goldenFactor = geom.goldenRatio ? 1.618 : 1.0;
  const useSymmetry = compileParams.useSymmetry;

  const pts: {x: number, y: number}[] = [];
  
  if (geom.shape === 'wand') {
    // Wand Math Formula: Linear spine with radial edge curves
    // The n vertices are split across top, right edge, bottom, and left edge
    const length = 60 * scale;
    const thickness = 8 * scale * (1 + tension);
    
    for (let i = 0; i < n; i++) {
      const t = i / n; // 0 to 1 progression along the perimeter
      
      let x = 50;
      let y = 50;
      
      // Determine which quadrant of the wand's perimeter we are on
      // We map the unit circle to a capsule shape
      const angle = t * Math.PI * 2;
      
      // Parametric Capsule / Wand equation
      // If angle is between -PI/2 and PI/2, we are at the bottom radial curve
      // If angle is between PI/2 and 3PI/2, we are at the top radial curve
      const isTop = Math.cos(angle) < 0;
      
      // Spine offsets
      const spineY = isTop ? -length / 2 : length / 2;
      
      // Radial Edge Curves
      const rX = Math.sin(angle) * thickness;
      const rY = Math.cos(angle) * thickness;
      
      // Add noise to make the wand magical/wobbly if tension > 0
      const hashX = useSymmetry ? Math.abs(rX) : rX;
      const noise = Math.sin(hashX * 38.2 + rY * 19.8);
      const magicalWobble = (noise * 5 * tension * goldenFactor);

      x = 50 + rX + (isTop ? magicalWobble : -magicalWobble);
      y = 50 + spineY + rY;

      pts.push({ x, y });
    }
  } else {
    // Standard Blob / Orb shape
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2;
      
      // For bilateral symmetry across the Y-axis, we mirror the X coordinate hash
      const hashX = useSymmetry ? Math.abs(Math.cos(angle)) : Math.cos(angle);
      const hashY = Math.sin(angle);
      // Pseudo-random deterministic hash based on coordinates
      const noise = Math.sin(hashX * 3824.23 + hashY * 1928.34);
      
      // Apply tension to radius variance
      const r = 25 * scale * (1 + (noise * 0.2 * tension * goldenFactor));
      const x = 50 + Math.cos(angle) * r;
      const y = 50 + Math.sin(angle) * r * (geom.goldenRatio ? 0.9 : 1.0); // squat it slightly
      pts.push({ x, y });
    }
  }

  // Generate smooth cubic bezier SVG path from points (closed loop)
  const catmullRom2bezier = (points: {x:number, y:number}[]) => {
    if (points.length < 3) return "";
    let d = "";
    for (let i = 0; i < points.length; i++) {
      const p0 = points[(i - 1 + points.length) % points.length];
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      const p3 = points[(i + 2) % points.length];
      
      const cp1x = p1.x + (p2.x - p0.x) / 6;
      const cp1y = p1.y + (p2.y - p0.y) / 6;
      const cp2x = p2.x - (p3.x - p1.x) / 6;
      const cp2y = p2.y - (p3.y - p1.y) / 6;
      
      if (i === 0) d += `M ${p1.x} ${p1.y} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y} `;
      else d += `C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y} `;
    }
    return d + "Z";
  };
  
  const polyPoints = pts.map(p => `${p.x},${p.y}`).join(' ');
  const smoothPath = catmullRom2bezier(pts);

  const primary = colors.primary || '#DC143C';
  const secondary = colors.secondary || '#FF4500';
  const glow = colors.glow || '#FFD700';

  // If the user provided a complex composite formula, render that instead of the default blob/wand
  const actualFormula = geom.proposedFormula?.formula || geom.formula;
  const role = geom.proposedFormula?.role || geom.role || '';
  
  if (actualFormula?.type === 'composite' && Array.isArray(actualFormula.children)) {
    const isTerrain = role.includes('terrain');
    return (
      <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ filter: `drop-shadow(0 0 15px ${secondary})` }}>
        <g transform={isTerrain ? "" : "scale(2)"}>
          {actualFormula.children.map((child: any, idx: number) => {
            let pathData = "";
            let fill = "none";
            let stroke = primary;
            let strokeWidth = "1";
            let strokeDasharray = "none";
            let opacity = 1;

            let animationClass = "";
            let transformOrigin = "50px 50px"; // approximate center for scaling

            // Material and Palette Mapping
            if (child.paletteChannel?.includes('void.purple') || child.material?.includes('void_glow')) {
              fill = '#8a2be2'; stroke = '#b026ff'; opacity = 0.9;
              animationClass = "slime-breathe";
              if (child.formula.type === 'parametric_curve') {
                fill = 'none'; strokeDasharray = "2,4"; animationClass = "orbit-spin";
              }
            } else if (child.paletteChannel?.includes('void.cyan') || child.material?.includes('cyan') || child.material?.includes('pool')) {
              fill = child.formula.type === 'edge_trace' ? '#00ffff' : 'none';
              stroke = '#00ffff'; strokeWidth = "1.5"; opacity = 0.8;
              animationClass = child.formula.type === 'edge_trace' ? "slime-breathe" : "heat-pulse";
            } else if (child.paletteChannel?.includes('void.magenta') || child.material?.includes('magenta')) {
              fill = 'none'; stroke = '#ff00ff'; strokeWidth = "1.5";
              animationClass = "heat-pulse";
            } else if (child.material?.includes('fungus')) {
              fill = '#9932cc'; stroke = '#dda0dd'; strokeWidth = "0.5";
              animationClass = "slime-breathe";
            } else if (child.paletteChannel?.includes('wood') || child.material?.includes('wood') || child.material?.includes('root')) {
              fill = child.formula.type === 'edge_trace' && child.formula.closed ? '#362a24' : 'none';
              stroke = child.paletteChannel?.includes('twisted') ? '#2a1f26' : '#1f1612';
              strokeWidth = child.formula.type === 'mathematical_stroke' ? "0" : "1";
            } else if (child.paletteChannel?.includes('ground') || child.material?.includes('soil') || child.material?.includes('rock')) {
              fill = child.paletteChannel?.includes('edge') ? '#1a1a1a' : (child.paletteChannel?.includes('shadow') ? '#050505' : '#222222');
              stroke = child.paletteChannel?.includes('shadow') ? 'none' : '#333';
              strokeWidth = "1";
            } else if (child.paletteChannel?.includes('flora')) {
              fill = 'none'; stroke = '#666'; strokeWidth = "1.5";
            } else if (child.material?.includes('glow') || child.paletteChannel?.includes('glow')) {
              fill = glow; opacity = 0.8; stroke = "none";
              animationClass = "slime-breathe";
            } else if (child.material?.includes('pink') || child.paletteChannel?.includes('highlight')) {
              fill = "rgba(255,255,255,0.6)"; stroke = "none";
              animationClass = "slime-breathe";
            } else if (child.material?.includes('charcoal') || child.paletteChannel?.includes('dark')) {
              fill = "#222"; stroke = "none";
              animationClass = "slime-breathe";
            } else if (child.paletteChannel?.includes('fire') || child.material?.includes('flame') || child.material?.includes('orange')) {
              fill = secondary; stroke = glow; strokeWidth = "0.5"; opacity = 0.9;
              animationClass = "fire-flicker";
              transformOrigin = "50px 100px"; // flicker from bottom up
            } else if (child.paletteChannel?.includes('heat') || child.material?.includes('transparent')) {
              fill = "none"; stroke = glow; strokeWidth = "0.5"; strokeDasharray = "2,2"; opacity = 0.5;
              animationClass = "heat-pulse";
            } else if (child.paletteChannel?.includes('embers') || child.material?.includes('lava') || child.material?.includes('sparks')) {
              fill = glow; stroke = secondary; strokeWidth = "0.5"; opacity = 0.8;
              if (child.formula.type === 'parametric_curve') {
                strokeDasharray = "1,4"; // dotted orbit
                fill = "none";
                animationClass = "orbit-spin";
                transformOrigin = "24px 24px"; // specific to the parametric center
              } else {
                animationClass = "fire-flicker"; // e.g. for edge_trace lava drops
              }
            } else {
              // Base body and shadows (fallback)
              fill = primary; 
              stroke = secondary; 
              strokeWidth = "1";
              if (child.paletteChannel?.includes('shadow')) {
                 fill = '#8B0000'; // darker red for shadow
                 stroke = 'none';
              }
              animationClass = "slime-breathe";
            }

            const f = child.formula;
            if (f.type === 'edge_trace' && Array.isArray(f.tracePath)) {
              pathData = catmullRom2bezier(f.tracePath);
              if (!f.closed) pathData = pathData.replace(/Z$/, '');
            } else if (f.type === 'parametric_curve' && f.parameters) {
              const { cx, cy, a, b } = f.parameters;
              return (
                <ellipse 
                  key={idx} 
                  cx={cx} 
                  cy={cy} 
                  rx={a} 
                  ry={b} 
                  fill={fill} 
                  stroke={stroke} 
                  strokeWidth={strokeWidth} 
                  strokeDasharray={strokeDasharray} 
                  opacity={opacity}
                  className={animationClass}
                  style={{ transformOrigin, transformBox: 'fill-box' }} 
                />
              );
            } else if (f.type === 'mathematical_stroke' && f.parameters) {
              const { cx, cy, length } = f.parameters;
              // Just draw a curved squiggle/mouth line
              pathData = `M ${cx - length/2} ${cy - 2} Q ${cx} ${cy + 4} ${cx + length/2} ${cy - 2}`;
              
              // If it's a stroke, we need to map the fill color to the stroke so it's visible, unless it's already set
              if (fill !== "none") {
                 stroke = fill;
              }
              fill = "none";
              strokeWidth = "1.5";
            }

            if (!pathData) return null;

            return (
              <path 
                key={idx} 
                d={pathData} 
                fill={fill} 
                stroke={stroke} 
                strokeWidth={strokeWidth} 
                opacity={opacity} 
                strokeLinejoin="round" 
                strokeDasharray={strokeDasharray}
                className={animationClass}
                style={{ transformOrigin, transformBox: 'fill-box' }}
              />
            );
          })}
        </g>
        <style dangerouslySetInnerHTML={{__html: `
          @keyframes slime-breathe {
            0%, 100% { transform: scale(1, 1); }
            50% { transform: scale(1.03, 0.97); }
          }
          @keyframes fire-flicker {
            0%, 100% { transform: scale(1, 1); opacity: 0.9; }
            25% { transform: scale(1.02, 1.1); opacity: 1; }
            50% { transform: scale(0.98, 0.95); opacity: 0.8; }
            75% { transform: scale(1.05, 1.15); opacity: 1; }
          }
          @keyframes heat-pulse {
            0%, 100% { transform: scale(1); opacity: 0.5; }
            50% { transform: scale(1.1); opacity: 0.2; }
          }
          @keyframes orbit-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          .slime-breathe { animation: slime-breathe 4s ease-in-out infinite; }
          .fire-flicker { animation: fire-flicker 0.4s ease-in-out infinite; }
          .heat-pulse { animation: heat-pulse 2s ease-in-out infinite; }
          .orbit-spin { animation: orbit-spin 6s linear infinite; }
        `}} />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ filter: `drop-shadow(0 0 15px ${secondary})` }}>
      <defs>
        <radialGradient id="slimeGrad" cx="40%" cy="30%" r="60%">
          <stop offset="0%" stopColor={glow} />
          <stop offset="30%" stopColor={secondary} />
          <stop offset="100%" stopColor={primary} />
        </radialGradient>
      </defs>
      
      {/* Vector Path */}
      {geom.shape === 'polygon' ? (
         <polygon points={polyPoints} fill="url(#slimeGrad)" stroke={primary} strokeWidth="2" strokeLinejoin="miter" />
      ) : (
         <path d={smoothPath} fill="url(#slimeGrad)" stroke={primary} strokeWidth="1" strokeLinejoin="round" />
      )}
      
      {/* Specular highlight */}
      <ellipse cx="40" cy="30" rx={8 * scale} ry={5 * scale} fill="rgba(255,255,255,0.4)" transform="rotate(-20 40 30)" />
      
      {/* Inner core */}
      <circle cx="50" cy="55" r={5 * scale} fill={glow} opacity="0.8" filter="blur(2px)" />
    </svg>
  );
}

interface Props {
  initialPacket?: ScholomanceGraphPacketV1;
  onPacketChange?: (packet: ScholomanceGraphPacketV1) => void;
  seed?: string;
}

export function ScholomanceGraphEditor({ initialPacket, onPacketChange, seed = '42' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<NodeEditor<any> | null>(null);
  
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [inspectorRerender, setInspectorRerender] = useState(0);
  const [showGlossary, setShowGlossary] = useState(false);
  const [localJsonText, setLocalJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const editor = createReteEditor(containerRef.current);
    editorRef.current = editor;

    // Load initial packet if provided
    if (initialPacket) {
      importGraphPacketToRete(initialPacket, editor);
    }

    const handleChange = async () => {
      if (!editorRef.current) return;
      const packet = await exportReteToGraphPacket(editorRef.current, {
        positions: {}, // in real impl collect from editor
        viewport: undefined,
      }, {
        graphId: initialPacket?.graphId || `graph-${Date.now()}`,
        title: initialPacket?.title || 'Untitled Graph',
        seed,
        domain: 'mixed',
      });
      onPacketChange?.(packet);
    };

    // Attach listeners (simplified)
    editor.addPipe((context: any) => {
      if (['nodecreate', 'connectioncreate', 'noderemove', 'connectionremove'].includes(context.type)) {
        // debounce in real code
        setTimeout(handleChange, 100);
      }
      return context;
    });

    const area = (editor as any).__area;
    if (area) {
      area.addPipe((context: any) => {
        if (context.type === 'nodepicked') {
          setSelectedNodeId(context.data.id);
          const n = editor.getNode(context.data.id) as any;
          setLocalJsonText(JSON.stringify(n?.data || {}, null, 2));
          setJsonError(null);
        } else if (context.type === 'pointerdown') {
          // Clear selection when clicking the background
          setSelectedNodeId(null);
        }
        return context;
      });
    }

    return () => {
      // cleanup editor
      editor.clear();
    };
    // The Rete editor owns a mount-scoped lifecycle; changing these inputs is
    // handled by packet import rather than reconstructing editor listeners.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addNode = async (kind: string) => {
    if (!editorRef.current) return;
    const def = getNodeDefinition(kind);
    if (!def) {
      setJsonError(`Unknown node kind: ${kind}`);
      return;
    }
    console.log('[editor] Adding node', kind);
    const reteNode = createReteNodeFromDefinition(def);
    
    // Ensure node.data exists
    (reteNode as any).data = (reteNode as any).data || {};

    await editorRef.current.addNode(reteNode);
  };

  const handleExport = async () => {
    if (!editorRef.current) return;
    const packet = await exportReteToGraphPacket(editorRef.current, {
      positions: {},
      viewport: undefined,
    }, {
      graphId: initialPacket?.graphId || `graph-${Date.now()}`,
      title: initialPacket?.title || 'Exported Graph',
      seed,
    });
    
    // Trigger actual file download for the user
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(packet, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", packet.graphId + ".json");
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    
    onPacketChange?.(packet);
  };

  const handleParamsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setLocalJsonText(newText);
    
    if (!editorRef.current || !selectedNodeId) return;
    try {
      const node = editorRef.current.getNode(selectedNodeId);
      if (node) {
        const parsed = JSON.parse(newText);
        (node as any).data = parsed;
        setJsonError(null);
        setInspectorRerender(prev => prev + 1);
      }
    } catch (err: any) {
      setJsonError(err.message);
    }
  };

  let selectedNode = null;
  let selectedNodeDef = null;
  if (selectedNodeId && editorRef.current) {
    try {
      selectedNode = editorRef.current.getNode(selectedNodeId) as any;
      if (selectedNode) {
        selectedNodeDef = getNodeDefinition(selectedNode.kind || selectedNode.label || selectedNode.name);
      }
    } catch (e) {
      // getNode throws if not found
    }
  }

  return (
    <div className="scholomance-graph-editor" style={{ display: 'flex', height: '100%', width: '100%', fontFamily: 'system-ui, sans-serif' }}>
      
      {showGlossary && <PixelBrainGrammarGlossary onClose={() => setShowGlossary(false)} />}

      {/* Node Palette (Left) */}
      <div style={{ width: 220, borderRight: '1px solid #333', padding: 12, overflow: 'auto', background: '#1e1e1e', color: '#fff' }}>
        
        <button 
          onClick={() => setShowGlossary(true)}
          style={{ width: '100%', padding: '8px', background: 'rgba(255, 0, 255, 0.2)', border: '1px solid rgba(255, 0, 255, 0.5)', color: '#fff', borderRadius: 4, cursor: 'pointer', fontSize: 13, marginBottom: 16, fontWeight: 'bold' }}
        >
          📖 Grammar Guide (F1)
        </button>

        <h4 style={{ margin: '0 0 8px 0' }}>Node Palette</h4>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 12 }}>
          Phase 0 — Shadow mode.
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {listNodeKinds().map(kind => {
            const def = getNodeDefinition(kind)!;
            return (
              <button
                key={kind}
                onClick={() => addNode(kind)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  width: '100%',
                  padding: '8px',
                  textAlign: 'left',
                  background: '#2d2d2d',
                  border: '1px solid #444',
                  borderRadius: '4px',
                  color: '#eee',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                <span>{def.ui.icon}</span> 
                <span>{def.label}</span>
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 24, fontSize: 11, color: '#aaa' }}>
          <strong>Canonical Packet</strong> is the truth.
        </div>
      </div>

      {/* Editor Canvas (Center) */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <div 
          style={{ 
            position: 'absolute', 
            top: 12, 
            right: 12, 
            zIndex: 10 
          }}
        >
          <button 
            onClick={handleExport}
            style={{
              padding: '6px 12px',
              background: '#0e639c',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '12px'
            }}
          >
            Export Packet
          </button>
        </div>
        <div ref={containerRef} style={{ flex: 1, background: '#111' }} />
      </div>

      {/* Inspector & Display (Right) */}
      <div style={{ width: 340, borderLeft: '1px solid #333', display: 'flex', flexDirection: 'column', background: '#1e1e1e', color: '#fff', height: '100%' }}>
        
        {/* Real-time Display Window */}
        <div style={{ padding: 16, borderBottom: '1px solid #333', background: 'rgba(0,0,0,0.2)' }}>
          <h4 style={{ margin: '0 0 12px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Live Render</span>
            <span style={{ fontSize: 10, color: '#00ffcc', padding: '2px 6px', background: 'rgba(0, 255, 204, 0.1)', borderRadius: 12, border: '1px solid rgba(0, 255, 204, 0.3)' }}>SYNCED</span>
          </h4>
          <div style={{ 
            width: '100%', 
            aspectRatio: '1', 
            background: '#050505', 
            borderRadius: 8, 
            border: '1px solid #333',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)'
          }}>
            <LiveSlimeRenderer editor={editorRef.current} refreshNonce={inspectorRerender} />
            <div style={{ position: 'absolute', bottom: 6, right: 8, fontSize: 10, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>VECTOR ENGINE v1</div>
            <div style={{ position: 'absolute', top: 6, left: 8, fontSize: 10, color: 'rgba(0,255,204,0.4)', fontFamily: 'monospace' }}>TARGET: SVG</div>
          </div>
        </div>

        {/* Node Inspector */}
        <div style={{ flex: 1, padding: 16, overflow: 'auto' }}>
          <h4 style={{ margin: '0 0 12px 0' }}>Node Inspector</h4>
        
        {!selectedNode ? (
          <div style={{ opacity: 0.6, fontSize: 13 }}>Select a node to edit params.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
            <div>
              <div style={{ fontWeight: 600, color: '#aaa', marginBottom: 2 }}>ID</div>
              <div style={{ wordBreak: 'break-all', opacity: 0.9 }}>{selectedNode.id}</div>
            </div>
            
            <div>
              <div style={{ fontWeight: 600, color: '#aaa', marginBottom: 2 }}>Label</div>
              <div>{selectedNode.label || selectedNode.name}</div>
            </div>

            <div>
              <div style={{ fontWeight: 600, color: '#aaa', marginBottom: 2 }}>Category</div>
              <div>{selectedNodeDef?.category || 'Unknown'}</div>
            </div>

            <div>
              <div style={{ fontWeight: 600, color: '#aaa', marginBottom: 4, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Params (JSON)</span>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {jsonError && <span style={{ color: '#ff4444', fontSize: 10 }}>Syntax Error</span>}
                  <button
                    onClick={() => {
                      setLocalJsonText("{\n  \n}");
                      if (editorRef.current && selectedNodeId) {
                        const node = editorRef.current.getNode(selectedNodeId);
                        if (node) {
                          (node as any).data = {};
                          setJsonError(null);
                          setInspectorRerender(prev => prev + 1);
                        }
                      }
                    }}
                    style={{
                      background: 'transparent',
                      border: '1px solid #444',
                      color: '#aaa',
                      borderRadius: 4,
                      padding: '2px 8px',
                      fontSize: 10,
                      cursor: 'pointer'
                    }}
                    title="Clear all parameters"
                  >
                    Clear
                  </button>
                </div>
              </div>
              
              <textarea
                key={selectedNode.id}
                style={{
                  width: '100%',
                  height: '150px',
                  background: '#111',
                  color: jsonError ? '#ff4444' : '#00ffcc',
                  border: jsonError ? '1px solid #ff4444' : '1px solid #333',
                  borderRadius: '4px',
                  padding: '8px',
                  fontFamily: 'monospace',
                  fontSize: '12px',
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
                value={localJsonText}
                onChange={handleParamsChange}
              />
              
              {jsonError && (
                <div style={{ background: '#331111', color: '#ff8888', padding: 8, fontSize: 11, borderRadius: 4, marginTop: 4, fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {jsonError}
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ marginTop: 24, fontSize: 10, opacity: 0.5, borderTop: '1px solid #333', paddingTop: 8 }}>
          Seed: {seed} (determinism preserved)
        </div>
        </div>
      </div>
    </div>
  );
}
