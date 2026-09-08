import { useEffect, useRef, useState } from 'react';
import {
  synthesizeTileForgeTile,
  synthesizeTileForgeProp,
} from '../../../lib/pixelbrain/tileForge.adapter.js';

const VS_SOURCE = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = (a_position + 1.0) * 0.5;
  v_uv.y = 1.0 - v_uv.y; // Flip Y for canvas texture coordinates
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

const FS_SOURCE = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_texture;
uniform float u_time;
uniform int u_mode; // 0=off, 1=day, 2=twilight, 3=night, 4=prismatic
uniform float u_glow;
uniform float u_warmth;
uniform vec2 u_resolution;

void main() {
  vec4 base = texture2D(u_texture, v_uv);
  if (u_mode == 0) {
    gl_FragColor = base;
    return;
  }

  // Emissive detection: identify glowing crystals, flowers, and rims
  float isCyan = step(0.65, base.b) * step(0.55, base.g);
  float isMagenta = step(0.65, base.r) * step(0.65, base.b) * (1.0 - step(0.6, base.g));
  float isEmerald = step(0.7, base.g) * (1.0 - step(0.8, base.b));
  float isBright = step(0.82, max(base.r, max(base.g, base.b)));
  float emissive = max(max(isCyan, isMagenta), max(isEmerald, isBright));

  float pulse = 0.85 + 0.35 * sin(u_time * 3.0 + v_uv.x * 15.0 + v_uv.y * 15.0);

  // Optical bloom 4-tap neighbor sample
  vec2 px = 2.0 / u_resolution;
  vec4 s1 = texture2D(u_texture, v_uv + vec2(px.x, 0.0));
  vec4 s2 = texture2D(u_texture, v_uv - vec2(px.x, 0.0));
  vec4 s3 = texture2D(u_texture, v_uv + vec2(0.0, px.y));
  vec4 s4 = texture2D(u_texture, v_uv - vec2(0.0, px.y));

  float neighborEmissive = (
    step(0.75, max(s1.r, max(s1.g, s1.b))) +
    step(0.75, max(s2.r, max(s2.g, s2.b))) +
    step(0.75, max(s3.r, max(s3.g, s3.b))) +
    step(0.75, max(s4.r, max(s4.g, s4.b)))
  ) * 0.25;

  vec3 bloom = (base.rgb * emissive * pulse + (s1.rgb + s2.rgb + s3.rgb + s4.rgb) * 0.25 * neighborEmissive) * u_glow;
  vec3 col = base.rgb;

  // Atmosphere grading passes
  if (u_mode == 1) {
    // Day Glade: Warm golden sunlight & crisp contrast
    col += vec3(0.06, 0.04, -0.02) * u_warmth;
    col = mix(col, col * 1.05, 0.5);
    col += bloom * 0.6;
  } else if (u_mode == 2) {
    // Twilight Amber: Purple dusk shadows with warm amber rims
    col = mix(col, vec3(col.r * 1.15, col.g * 0.82, col.b * 1.3), 0.4);
    if (base.r > 0.45 && base.g > 0.35) {
      col += vec3(0.12, 0.06, 0.0) * u_warmth;
    }
    col += bloom * 1.0;
  } else if (u_mode == 3) {
    // Night Bioluminescent: Abyssal darkness with vivid glowing crystal/spore nodes
    col *= vec3(0.28, 0.38, 0.68);
    col += bloom * 2.2;
  } else if (u_mode == 4) {
    // Prismatic Glacial: Crystalline icy shimmer
    float shimmer = sin(v_uv.y * 40.0 + u_time * 2.0) * 0.04;
    col = vec3(col.r * 0.9 + shimmer, col.g * 1.08, col.b * 1.25);
    col += bloom * 1.4;
  }

  // Soft dimetric edge vignette
  float dist = distance(v_uv, vec2(0.5));
  col *= smoothstep(0.85, 0.35, dist * 0.7);

  gl_FragColor = vec4(col, base.a);
}
`;

function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${info}`);
  }
  return shader;
}

function createProgram(gl, vsSource, fsSource) {
  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(prog);
    gl.deleteProgram(prog);
    throw new Error(`Program link failed: ${info}`);
  }
  return prog;
}

export default function TileForgeCanvas({
  candidate,
  onSelectTile,
  shaderMode = 'day',
  glowIntensity = 1.0,
  atmosphereWarmth = 1.0,
}) {
  const canvasRef = useRef(null);
  const hiddenCanvasRef = useRef(null);
  const glRef = useRef(null);
  const programRef = useRef(null);
  const textureRef = useRef(null);
  const animFrameRef = useRef(null);
  const [selectedCell, setSelectedCell] = useState(null);

  // Initialize hidden 2D compositing canvas
  if (!hiddenCanvasRef.current && typeof document !== 'undefined') {
    const hCanvas = document.createElement('canvas');
    hCanvas.width = 1100;
    hCanvas.height = 650;
    hiddenCanvasRef.current = hCanvas;
  }

  // 1. Composite authoritative discrete 1x pixel art onto hidden canvas
  useEffect(() => {
    if (!candidate || !hiddenCanvasRef.current) return;

    const canvas = hiddenCanvasRef.current;
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    // Enforce Anti-Vector Invariant: Crisp nearest-neighbour pixel scaling
    ctx.imageSmoothingEnabled = false;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Deep void ambient background
    ctx.fillStyle = '#030712';
    ctx.fillRect(0, 0, width, height);

    // Biome determination
    const biome = candidate.intent?.biomeId || 'void_forest';
    const seed = typeof candidate.intent?.seed === 'number' ? candidate.intent.seed : 4242;

    // Retrieve or synthesize authoritative discrete 1x pixel art buffers
    const synthLayer = candidate.layers?.scd128Synthesizer?.synthesizedTextures;
    const topTile = synthLayer?.top || synthesizeTileForgeTile({ type: 'top', biome, seed });
    const groundTile = synthLayer?.ground || synthesizeTileForgeTile({ type: 'ground', biome, seed });
    const rimTile = synthLayer?.rim || synthesizeTileForgeTile({ type: 'rim', biome, seed });
    const cliffTile = synthLayer?.cliff || synthesizeTileForgeTile({ type: 'cliff', biome, seed, elevation: candidate.intent?.elevation || 1 });
    const treeProp = synthLayer?.crystal_tree || synthesizeTileForgeProp({ propType: 'crystal_tree', biome, seed });
    const pineProp = synthLayer?.void_pine || synthesizeTileForgeProp({ propType: 'void_pine', biome, seed });
    const fernProp = synthLayer?.hologram_fern || synthesizeTileForgeProp({ propType: 'hologram_fern', biome, seed });
    const flowerProp = synthLayer?.void_flowers || synthesizeTileForgeProp({ propType: 'void_flowers', biome, seed });

    // Render texture canvases
    const topCanvas = topTile.toCanvas();
    const groundCanvas = groundTile.toCanvas();
    const rimCanvas = rimTile.toCanvas();
    const cliffCanvas = cliffTile.toCanvas();
    const treeCanvas = treeProp.toCanvas();
    const pineCanvas = pineProp.toCanvas();
    const fernCanvas = fernProp.toCanvas();
    const flowerCanvas = flowerProp.toCanvas();

    // Isometric projection sizing
    // Tile size: 40x20 diamond (crisp 0.5x integer scaling of 80x40 pixel art)
    const tileW = 40;
    const tileH = 20;
    const offsetX = width / 2;
    const offsetY = 70;

    const { isoTile, fibonacciField } = candidate.layers || {};
    if (!isoTile || !isoTile.topPlane) return;

    // Collect all cells with authoritative SCDL V2 and AMP descriptors
    const allCells = [];
    const hasGround = candidate.intent?.hasGround !== false;
    const activeTopTile = hasGround ? groundTile : topTile;

    isoTile.topPlane.forEach((cell) => {
      allCells.push({
        ...cell,
        type: hasGround ? 'ground' : 'top',
        assetClass: hasGround ? 'isometric_ground_soil' : 'isometric_top_diamond',
        biome,
        elevation: cell.z || 0,
        scdlSource: activeTopTile.scdlSource,
        ampDescriptors: activeTopTile.ampDescriptors || [],
        scd128Record: activeTopTile.scd128Record,
      });
    });

    if (isoTile.rimCells) {
      isoTile.rimCells.forEach((cell) => {
        allCells.push({
          ...cell,
          type: 'rim',
          assetClass: 'isometric_rim_diamond',
          biome,
          elevation: cell.z || 0,
          scdlSource: rimTile.scdlSource,
          ampDescriptors: rimTile.ampDescriptors || [],
          scd128Record: rimTile.scd128Record,
        });
      });
    }

    if (isoTile.sidePlanes) {
      Object.values(isoTile.sidePlanes).flat().forEach((cell) => {
        allCells.push({
          ...cell,
          type: 'side',
          assetClass: 'isometric_cliff_skirt',
          biome,
          elevation: cell.z || 0,
          scdlSource: cliffTile.scdlSource,
          ampDescriptors: cliffTile.ampDescriptors || [],
          scd128Record: cliffTile.scd128Record,
        });
      });
    }

    // Mix in Fibonacci seeds for procedural trees and vegetation
    if (fibonacciField && fibonacciField.seeds) {
      fibonacciField.seeds.forEach((seedPt, index) => {
        const propTypes = ['tree', 'pine', 'fern', 'flowers'];
        const pType = propTypes[index % propTypes.length];
        const propObj = pType === 'tree' ? treeProp
          : pType === 'pine' ? pineProp
          : pType === 'fern' ? fernProp
          : flowerProp;

        allCells.push({
          ...seedPt,
          type: pType,
          assetClass: `prop_${pType}`,
          biome,
          elevation: seedPt.z || 0,
          scdlSource: propObj.scdlSource,
          ampDescriptors: propObj.ampDescriptors || [],
          scd128Record: propObj.scd128Record,
        });
      });
    }

    // Depth Sorting (Back to Front)
    allCells.sort((a, b) => {
      const depthA = a.x + a.y;
      const depthB = b.x + b.y;
      if (depthA === depthB) {
        const order = { ground: 0, side: 1, top: 2, rim: 3, flowers: 4, fern: 5, pine: 6, tree: 7 };
        return (order[a.type] || 0) - (order[b.type] || 0);
      }
      return depthA - depthB;
    });

    // Draw all cells into discrete 2D buffer
    for (let idx = 0; idx < allCells.length; idx += 1) {
      const cell = allCells[idx];
      const px = offsetX + (cell.x - cell.y) * (tileW / 2);
      let py = offsetY + (cell.x + cell.y) * (tileH / 2);

      const elevationOffset = (cell.z || 0) * tileH;
      py -= elevationOffset;

      if (cell.type === 'side') {
        if (cliffCanvas) {
          ctx.drawImage(cliffCanvas, px - tileW / 2, py, tileW, 28);
        }
      } else if (cell.type === 'ground') {
        if (groundCanvas) {
          ctx.drawImage(groundCanvas, px - tileW / 2, py, tileW, 28);
        }
      } else if (cell.type === 'top') {
        if (topCanvas) {
          ctx.drawImage(topCanvas, px - tileW / 2, py, tileW, tileH);
        }
      } else if (cell.type === 'rim') {
        if (rimCanvas) {
          ctx.drawImage(rimCanvas, px - tileW / 2, py, tileW, tileH);
        }
      } else if (cell.type === 'tree') {
        if (treeCanvas) {
          ctx.drawImage(treeCanvas, px - 18, py + 10 - 54, 36, 54);
        }
      } else if (cell.type === 'pine') {
        if (pineCanvas) {
          ctx.drawImage(pineCanvas, px - 20, py + 10 - 64, 40, 64);
        }
      } else if (cell.type === 'fern') {
        if (fernCanvas) {
          ctx.drawImage(fernCanvas, px - 12, py + 10 - 20, 24, 20);
        }
      } else if (cell.type === 'flowers') {
        if (flowerCanvas) {
          ctx.drawImage(flowerCanvas, px - 10, py + 10 - 16, 20, 16);
        }
      }
    }

    // Save interactive cells list for click picking with full SCDL metadata
    const visibleCanvas = canvasRef.current;
    if (visibleCanvas) {
      visibleCanvas._cells = allCells.map((cell) => {
        const px = offsetX + (cell.x - cell.y) * (tileW / 2);
        let py = offsetY + (cell.x + cell.y) * (tileH / 2);
        py -= (cell.z || 0) * tileH;
        return { ...cell, screenX: px, screenY: py };
      });
    }

    // Upload texture to WebGL
    const gl = glRef.current;
    const texture = textureRef.current;
    if (gl && texture) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    }
  }, [candidate]);

  // 2. Initialize WebGL Shader Context on visible canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let gl = canvas.getContext('webgl');
    if (!gl) {
      gl = canvas.getContext('experimental-webgl');
    }
    if (!gl) {
      console.warn('[TileForgeCanvas] WebGL not supported, falling back to 2D');
      return;
    }
    glRef.current = gl;

    let prog;
    try {
      prog = createProgram(gl, VS_SOURCE, FS_SOURCE);
      programRef.current = prog;
    } catch (e) {
      console.error('[TileForgeCanvas] WebGL program creation failed:', e);
      return;
    }

    // Quad geometry covering full screen
    const quadBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([
        -1, -1,
        1, -1,
        -1, 1,
        -1, 1,
        1, -1,
        1, 1,
      ]),
      gl.STATIC_DRAW
    );

    const posAttr = gl.getAttribLocation(prog, 'a_position');
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    // Create texture
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    textureRef.current = texture;

    if (hiddenCanvasRef.current) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, hiddenCanvasRef.current);
    }

    return () => {
      if (quadBuffer) gl.deleteBuffer(quadBuffer);
      if (texture) gl.deleteTexture(texture);
      if (prog) gl.deleteProgram(prog);
    };
  }, []);

  // 3. WebGL Shader Render Loop
  useEffect(() => {
    let startTime = performance.now();
    let isRunning = true;

    const render = (time) => {
      if (!isRunning) return;

      const gl = glRef.current;
      const prog = programRef.current;
      const canvas = canvasRef.current;

      if (gl && prog && canvas) {
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.useProgram(prog);

        const elapsed = (time - startTime) * 0.001;

        const modeMap = {
          off: 0,
          day: 1,
          twilight: 2,
          night: 3,
          prismatic: 4,
        };
        const uModeVal = modeMap[shaderMode] ?? 1;

        gl.uniform1i(gl.getUniformLocation(prog, 'u_texture'), 0);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_time'), elapsed);
        gl.uniform1i(gl.getUniformLocation(prog, 'u_mode'), uModeVal);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_glow'), Number(glowIntensity) || 1.0);
        gl.uniform1f(gl.getUniformLocation(prog, 'u_warmth'), Number(atmosphereWarmth) || 1.0);
        gl.uniform2f(gl.getUniformLocation(prog, 'u_resolution'), canvas.width, canvas.height);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      isRunning = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [shaderMode, glowIntensity, atmosphereWarmth]);

  const handleCanvasClick = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || !canvas._cells) return;

    const rect = canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) * (canvas.width / rect.width);
    const clickY = (e.clientY - rect.top) * (canvas.height / rect.height);

    // Find nearest cell
    let closest = null;
    let minDist = 30;

    for (const cell of canvas._cells) {
      const dist = Math.hypot(clickX - cell.screenX, clickY - (cell.screenY + 10));
      if (dist < minDist) {
        minDist = dist;
        closest = cell;
      }
    }

    if (closest) {
      setSelectedCell(closest);
      if (onSelectTile) {
        onSelectTile(closest);
      }
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: '8px', overflow: 'hidden', border: '1px solid #1e293b' }}>
      <canvas
        ref={canvasRef}
        width={1100}
        height={650}
        onClick={handleCanvasClick}
        style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair', imageRendering: 'pixelated' }}
      />
      {selectedCell && (
        <div style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          background: 'rgba(15, 23, 42, 0.9)',
          padding: '8px 14px',
          borderRadius: '6px',
          border: '1px solid #38bdf8',
          color: '#f8fafc',
          fontSize: '0.8rem',
          pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
        }}>
          Selected: <strong>{selectedCell.type.toUpperCase()}</strong> ({selectedCell.x}, {selectedCell.y}) · Z:{selectedCell.z || 0}
          {selectedCell.ampDescriptors?.length > 0 && (
            <span style={{ marginLeft: '0.5rem', color: '#a78bfa' }}>
              ({selectedCell.ampDescriptors.length} active AMPs)
            </span>
          )}
        </div>
      )}
    </div>
  );
}
