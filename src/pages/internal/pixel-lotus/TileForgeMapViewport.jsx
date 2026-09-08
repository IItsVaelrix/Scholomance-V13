import { useEffect, useRef, useState, useMemo, useId, Children, isValidElement, cloneElement } from 'react';
import { mapAssetCanvas, orderedMapInstances, projectMapPoint } from '../../../lib/pixelbrain/tileForgeMap.adapter.js';
import { VS_SOURCE, FS_SOURCE, createProgram } from '../../../lib/pixelbrain/tileForgeShaders.js';

const WIDTH = 1100;
const HEIGHT = 680;
const ZOOMS = [0.25, 0.5, 1, 2, 3, 4];
const MODES = { off: 0, day: 1, twilight: 2, night: 3, prismatic: 4 };

export function MapField({ children, ...props }) {
  const id = useId();
  return <label {...props} htmlFor={id}>{Children.map(children, child => isValidElement(child) && ['input', 'select', 'textarea'].includes(child.type) ? cloneElement(child, { id }) : child)}</label>;
}

export function TileThumbnail({ asset }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return;
    const ctx = ref.current.getContext('2d');
    ctx.clearRect(0, 0, 88, 72);
    ctx.imageSmoothingEnabled = false;
    const scale = Math.min(1, 84 / asset.width, 68 / asset.height);
    ctx.drawImage(mapAssetCanvas(asset), Math.round((88 - asset.width * scale) / 2), Math.round((72 - asset.height * scale) / 2), Math.round(asset.width * scale), Math.round(asset.height * scale));
  }, [asset]);
  return <canvas aria-hidden="true" ref={ref} width={88} height={72} />;
}

export default function TileForgeMapViewport({ map, tool, brush, selectedId, hover, elevation, showGrid, shaderMode, glowIntensity, atmosphereWarmth, onStart, onMove, onEnd, onCancel, onKeyDown }) {
  const canvasRef = useRef(null);
  const glCanvasRef = useRef(null);
  const glState = useRef(null);
  const panRef = useRef(null);
  const [view, setView] = useState({ x: WIDTH / 2, y: 90, zoom: 0.5 });
  const [webgl, setWebgl] = useState(false);
  const textures = useMemo(() => new Map(map.assets.map(a => [a.id, mapAssetCanvas(a)])), [map.assets]);
  const ordered = useMemo(() => orderedMapInstances(map), [map]);

  useEffect(() => {
    const canvas = glCanvasRef.current;
    const gl = canvas.getContext('webgl', { alpha: false });
    if (!gl) return undefined;
    let program;
    try { program = createProgram(gl, VS_SOURCE, FS_SOURCE); } catch { return undefined; }
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    for (const name of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, name, gl.CLAMP_TO_EDGE);
    for (const name of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, name, gl.NEAREST);
    const uniforms = Object.fromEntries(['u_texture', 'u_time', 'u_mode', 'u_glow', 'u_warmth', 'u_resolution'].map(name => [name, gl.getUniformLocation(program, name)]));
    glState.current = { gl, program, texture, uniforms };
    setWebgl(true);
    const lost = e => { e.preventDefault(); glState.current = null; setWebgl(false); };
    canvas.addEventListener('webglcontextlost', lost);
    return () => {
      canvas.removeEventListener('webglcontextlost', lost);
      glState.current = null;
      gl.deleteBuffer(buffer); gl.deleteTexture(texture); gl.deleteProgram(program);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#080d13'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.imageSmoothingEnabled = false;
    ctx.setTransform(view.zoom, 0, 0, view.zoom, Math.round(view.x), Math.round(view.y));
    const diamond = (point, color, fill = false, gridW = 1, gridH = 1) => {
      const points = [[point.x - 0.5, point.y - 0.5], [point.x + gridW - 0.5, point.y - 0.5], [point.x + gridW - 0.5, point.y + gridH - 0.5], [point.x - 0.5, point.y + gridH - 0.5]];
      ctx.beginPath();
      points.forEach(([x, y], n) => { const p = projectMapPoint(map, { x, y, z: point.z }); if (n) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
      ctx.closePath(); ctx.strokeStyle = color; ctx.lineWidth = 1 / view.zoom;
      if (fill) { ctx.fillStyle = color; ctx.fill(); } else ctx.stroke();
    };
    if (showGrid) {
      // One line per row/column, independent of map area.
      ctx.beginPath();
      for (let x = 0; x <= map.width; x += 1) {
        const a = projectMapPoint(map, { x: x - 0.5, y: -0.5, z: elevation });
        const b = projectMapPoint(map, { x: x - 0.5, y: map.height - 0.5, z: elevation });
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      for (let y = 0; y <= map.height; y += 1) {
        const a = projectMapPoint(map, { x: -0.5, y: y - 0.5, z: elevation });
        const b = projectMapPoint(map, { x: map.width - 0.5, y: y - 0.5, z: elevation });
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      }
      ctx.strokeStyle = '#233341'; ctx.lineWidth = 1 / view.zoom; ctx.stroke();
    }
    for (const instance of ordered) {
      const p = projectMapPoint(map, instance);
      const a = instance.asset;
      const left = p.x - a.anchor.x;
      const top = p.y - a.anchor.y;
      if ((left + a.width) * view.zoom + view.x < 0 || left * view.zoom + view.x > WIDTH || (top + a.height) * view.zoom + view.y < 0 || top * view.zoom + view.y > HEIGHT) continue;
      ctx.drawImage(textures.get(a.id), left, top);
      if (instance.id === selectedId) {
        ctx.strokeStyle = '#f0cb83'; ctx.lineWidth = 2 / view.zoom;
        ctx.strokeRect(left, top, a.width, a.height);
        diamond(instance, '#f0cb83', false, a.footprint.gridW, a.footprint.gridH);
      }
    }
    if (hover) {
      const valid = hover.x >= 0 && hover.y >= 0 && hover.x + (brush?.footprint.gridW ?? 1) <= map.width && hover.y + (brush?.footprint.gridH ?? 1) <= map.height;
      if (tool === 'paint' && brush && valid) {
        const p = projectMapPoint(map, hover);
        ctx.globalAlpha = 0.55;
        ctx.drawImage(textures.get(brush.id), p.x - brush.anchor.x, p.y - brush.anchor.y);
        ctx.globalAlpha = 1;
      }
      diamond(hover, valid ? '#65d5bc' : '#f07e83', false, brush?.footprint.gridW ?? 1, brush?.footprint.gridH ?? 1);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const state = glState.current;
    if (state) { state.gl.bindTexture(state.gl.TEXTURE_2D, state.texture); state.gl.texImage2D(state.gl.TEXTURE_2D, 0, state.gl.RGBA, state.gl.RGBA, state.gl.UNSIGNED_BYTE, canvas); }
  }, [map, ordered, textures, view, brush, selectedId, hover, elevation, showGrid, tool, webgl]);

  useEffect(() => {
    let frame;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const render = time => {
      const state = glState.current;
      if (state && shaderMode !== 'off') {
        const { gl, program, uniforms: u } = state;
        gl.viewport(0, 0, WIDTH, HEIGHT); gl.useProgram(program);
        gl.uniform1i(u.u_texture, 0); gl.uniform1f(u.u_time, reduced.matches ? 0 : time * 0.001);
        gl.uniform1i(u.u_mode, MODES[shaderMode] ?? 0); gl.uniform1f(u.u_glow, glowIntensity); gl.uniform1f(u.u_warmth, atmosphereWarmth);
        gl.uniform2f(u.u_resolution, WIDTH, HEIGHT); gl.drawArrays(gl.TRIANGLES, 0, 6);
      }
      if (shaderMode !== 'off') frame = requestAnimationFrame(render);
    };
    render(0);
    return () => cancelAnimationFrame(frame);
  }, [shaderMode, glowIntensity, atmosphereWarmth, webgl]);

  const screenPoint = e => {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: (e.clientX - rect.left) * WIDTH / rect.width, y: (e.clientY - rect.top) * HEIGHT / rect.height };
  };
  const worldPoint = e => { const p = screenPoint(e); return { x: (p.x - Math.round(view.x)) / view.zoom, y: (p.y - Math.round(view.y)) / view.zoom }; };
  const zoomTo = value => setView(v => ({ zoom: value, x: WIDTH / 2 - (WIDTH / 2 - v.x) * value / v.zoom, y: HEIGHT / 2 - (HEIGHT / 2 - v.y) * value / v.zoom }));
  const fit = () => {
    const points = [projectMapPoint(map, { x: 0, y: 0 }), projectMapPoint(map, { x: map.width, y: 0 }), projectMapPoint(map, { x: 0, y: map.height }), projectMapPoint(map, { x: map.width, y: map.height })];
    ordered.forEach(i => { const p = projectMapPoint(map, i); points.push({ x: p.x - i.asset.anchor.x, y: p.y - i.asset.anchor.y }, { x: p.x - i.asset.anchor.x + i.asset.width, y: p.y - i.asset.anchor.y + i.asset.height }); });
    const minX = Math.min(...points.map(p => p.x)); const maxX = Math.max(...points.map(p => p.x));
    const minY = Math.min(...points.map(p => p.y)); const maxY = Math.max(...points.map(p => p.y));
    const zoom = ZOOMS.filter(z => z <= Math.min((WIDTH - 80) / (maxX - minX), (HEIGHT - 80) / (maxY - minY))).at(-1) ?? 0.25;
    setView({ zoom, x: WIDTH / 2 - (minX + maxX) / 2 * zoom, y: HEIGHT / 2 - (minY + maxY) / 2 * zoom });
  };
  return <div className="tf-map-viewport">
    <div className="tf-map-viewtools">
      <button type="button" onClick={fit}>Fit map</button>
      <MapField>Zoom <select value={view.zoom} onChange={e => zoomTo(Number(e.target.value))}>{ZOOMS.map(z => <option key={z} value={z}>{z * 100}%</option>)}</select></MapField>
      <span>{!webgl && shaderMode !== 'off' ? '2D preview · WebGL unavailable' : 'Middle-drag to pan · Wheel to zoom'}</span>
    </div>
    <div className="tf-map-canvas-stack">
      <canvas ref={glCanvasRef} width={WIDTH} height={HEIGHT} aria-hidden="true" className={`tf-map-shader ${webgl && shaderMode !== 'off' ? 'is-visible' : ''}`} />
      {/* Canvas has a full keyboard map editor, described by its application label. */}
      {/* eslint-disable-next-line jsx-a11y/no-interactive-element-to-noninteractive-role */}
      <canvas ref={canvasRef} width={WIDTH} height={HEIGHT} tabIndex={0} role="application" aria-label="Tile map canvas. Arrow keys move the cursor; Enter places or erases; B brush, V select, E erase, H pan. Control Z undoes."
        onKeyDown={onKeyDown}
        onWheel={e => { const index = ZOOMS.indexOf(view.zoom); zoomTo(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, index + (e.deltaY < 0 ? 1 : -1)))]); }}
        onPointerDown={e => {
          if (e.button !== 0 && e.button !== 1) return;
          e.preventDefault(); e.currentTarget.focus(); e.currentTarget.setPointerCapture(e.pointerId);
          if (tool === 'pan' || e.button === 1) panRef.current = { point: screenPoint(e), view };
          else onStart(worldPoint(e));
        }}
        onPointerMove={e => {
          if (panRef.current) { const p = screenPoint(e); const start = panRef.current; setView({ ...start.view, x: start.view.x + p.x - start.point.x, y: start.view.y + p.y - start.point.y }); }
          else onMove(worldPoint(e));
        }}
        onPointerUp={e => { if (!panRef.current) onEnd(); panRef.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }}
        onPointerCancel={() => { panRef.current = null; onCancel(); }}
        onLostPointerCapture={() => { panRef.current = null; onEnd(); }}
      />
    </div>
  </div>;
}
