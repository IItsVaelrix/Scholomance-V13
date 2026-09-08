/**
 * PixelBrain Scene-Graph Forward Renderer (PB-SCENE-GRAPH-v1)
 *
 * The runtime seam of SCDL v1.2: exporters call this at compile time and
 * runtimes call it on packet load. Formula → deterministic render; the
 * framebuffer is derived state, never canonical.
 *
 * Forward pipeline per node, depth-first, painter order:
 *   1. compose  M_world = M_parent · M_local
 *   2. rasterize memoized def-local cells → inverse-map into world space
 *      (integer translations take the exact lattice fast path)
 *   3. write, last write wins
 * Material shading is derived state (`shade: 'material'`). It never changes
 * the canonical scene-graph packet; exporters can ask for flat geometry when
 * they need byte-for-byte raw color inspection.
 *
 * Determinism: same sceneGraph + canvas → identical framebuffer bytes.
 */

import {
  identity, matFromTransform, matMul, matInvert, matApply,
  isIntegerTranslation, transformAABB,
} from './scdl/render/transform2d.js';
import {
  acceptAll, makeCanvasAccept,
  rasterizeCircle, rasterizeRing, rasterizeRect, rasterizePolygon,
  rasterizePath, rasterizeSphere, rasterizeEllipse, rasterizeLine,
} from './scdl/render/raster-core.js';
import { applySymmetryToLattice } from './symmetry-amp.js';

const VECTOR_RASTERIZERS = Object.freeze({
  circle: rasterizeCircle, ring: rasterizeRing, rect: rasterizeRect,
  polygon: rasterizePolygon, path: rasterizePath, sphere: rasterizeSphere,
  ellipse: rasterizeEllipse, line: rasterizeLine,
});

const BAYER_8 = Object.freeze([
  0, 48, 12, 60, 3, 51, 15, 63,
  32, 16, 44, 28, 35, 19, 47, 31,
  8, 56, 4, 52, 11, 59, 7, 55,
  40, 24, 36, 20, 43, 27, 39, 23,
  2, 50, 14, 62, 1, 49, 13, 61,
  34, 18, 46, 30, 33, 17, 45, 29,
  10, 58, 6, 54, 9, 57, 5, 53,
  42, 26, 38, 22, 41, 25, 37, 21,
]);

function hexToPacked(hexColor) {
  const raw = String(hexColor || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return 0;
  return ((parseInt(raw, 16) << 8) | 0xff) >>> 0;
}

function packedToHex(packed) {
  return `#${(packed >>> 8).toString(16).padStart(6, '0')}`;
}

function packedToRgb(packed) {
  return {
    r: (packed >>> 24) & 255,
    g: (packed >>> 16) & 255,
    b: (packed >>> 8) & 255,
  };
}

function hexToRgb(hexColor) {
  const raw = String(hexColor || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return { r: 0, g: 0, b: 0 };
  const n = parseInt(raw, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex({ r, g, b }) {
  const rr = clamp255(r).toString(16).padStart(2, '0');
  const gg = clamp255(g).toString(16).padStart(2, '0');
  const bb = clamp255(b).toString(16).padStart(2, '0');
  return `#${rr}${gg}${bb}`;
}

function clamp01(v) {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}

function clamp255(v) {
  return Math.max(0, Math.min(255, Math.round(Number.isFinite(v) ? v : 0)));
}

function mixRgb(a, b, t) {
  const k = clamp01(t);
  return {
    r: a.r + (b.r - a.r) * k,
    g: a.g + (b.g - a.g) * k,
    b: a.b + (b.b - a.b) * k,
  };
}

function scaleRgb(a, k) {
  return { r: a.r * k, g: a.g * k, b: a.b * k };
}

function addRgb(a, b, k = 1) {
  return { r: a.r + b.r * k, g: a.g + b.g * k, b: a.b + b.b * k };
}

function dither8Rgb(rgb, x, y, strength = 0) {
  if (!strength) return rgb;
  const threshold = (BAYER_8[(Math.floor(y) & 7) * 8 + (Math.floor(x) & 7)] + 0.5) / 64;
  const signed = (threshold - 0.5) * 2 * strength;
  return {
    r: rgb.r + signed,
    g: rgb.g + signed * 0.92,
    b: rgb.b + signed * 1.08,
  };
}

function luminance(rgb) {
  return rgb.r * 0.2126 + rgb.g * 0.7152 + rgb.b * 0.0722;
}

function packRgb(rgb) {
  const r = clamp255(rgb.r);
  const g = clamp255(rgb.g);
  const b = clamp255(rgb.b);
  return (((r << 24) | (g << 16) | (b << 8) | 0xff) >>> 0);
}

function applyEdgeAntialias(fb, strength = 0.24) {
  const { width: W, height: H } = fb;
  const src = fb.pixels;
  const dst = new Uint32Array(src);
  const alphaAt = (x, y) => src[y * W + x] & 0xff;
  const colorAt = (x, y) => packedToRgb(src[y * W + x]);

  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const idx = y * W + x;
      if ((src[idx] & 0xff) === 0) continue;

      const current = colorAt(x, y);
      const currentLuma = luminance(current);
      const neighbors = [
        [x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1],
        [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1], [x + 1, y + 1],
      ];

      let edge = false;
      let count = 0;
      let average = { r: 0, g: 0, b: 0 };
      for (const [nx, ny] of neighbors) {
        if (!alphaAt(nx, ny)) {
          edge = true;
          continue;
        }
        const n = colorAt(nx, ny);
        if (Math.abs(luminance(n) - currentLuma) > 52) edge = true;
        average.r += n.r;
        average.g += n.g;
        average.b += n.b;
        count++;
      }

      if (!edge || count === 0) continue;
      average = scaleRgb(average, 1 / count);
      const blend = mixRgb(current, average, strength);
      dst[idx] = packRgb(blend);
    }
  }

  fb.pixels = dst;
  return fb;
}

function applyEmissionBloom(fb, strength = 0.26) {
  const { width: W, height: H } = fb;
  const src = fb.pixels;
  const dst = new Uint32Array(src);

  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const idx = y * W + x;
      const packed = src[idx];
      if ((packed & 0xff) === 0) continue;
      const rgb = packedToRgb(packed);
      const cyanEnergy = Math.max(0, rgb.g + rgb.b - rgb.r * 0.85 - 260) / 250;
      const violetEnergy = Math.max(0, rgb.r + rgb.b - rgb.g * 0.7 - 245) / 260;
      const energy = clamp01(Math.max(cyanEnergy, violetEnergy));
      if (energy <= 0.03) continue;

      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (ox === 0 && oy === 0) continue;
          const nIdx = (y + oy) * W + (x + ox);
          if ((src[nIdx] & 0xff) === 0) continue;
          const falloff = (Math.abs(ox) + Math.abs(oy)) === 1 ? 1 : 0.62;
          const tint = rgb.b >= rgb.r ? { r: 42, g: 236, b: 255 } : { r: 206, g: 126, b: 255 };
          const n = packedToRgb(dst[nIdx]);
          dst[nIdx] = packRgb(addRgb(n, tint, energy * strength * falloff));
        }
      }
    }
  }

  fb.pixels = dst;
  return fb;
}

function applyMaterialPostProcess(fb, options = {}) {
  if (options.antialias !== false) {
    applyEdgeAntialias(fb, Number.isFinite(options.antialiasStrength) ? options.antialiasStrength : 0.24);
  }
  if (options.bloom !== false) {
    applyEmissionBloom(fb, Number.isFinite(options.bloomStrength) ? options.bloomStrength : 0.26);
  }
  return fb;
}

function hash2(x, y, salt = 0) {
  let n = (Math.imul(Math.floor(x), 374761393) + Math.imul(Math.floor(y), 668265263) + Math.imul(salt, 2246822519)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function materialShadeColor(color, material, worldX, worldY, localX, localY, fb, shade) {
  if (shade !== 'material') return color;

  const base = hexToRgb(color);
  const mat = String(material || 'source');
  const nw = clamp01(0.42 + (1 - worldX / Math.max(1, fb.width)) * 0.18 + (1 - worldY / Math.max(1, fb.height)) * 0.14);
  const grain = hash2(worldX, worldY, 11);
  const block = hash2(Math.floor(worldX / 9), Math.floor(worldY / 7), 23);
  const glintLine = Math.abs(((localX - localY) % 17 + 17) % 17);

  if (mat === 'void_ice') {
    let out = mixRgb(base, { r: 226, g: 243, b: 255 }, 0.08 + nw * 0.12);
    out = mixRgb(out, { r: 92, g: 198, b: 234 }, block * 0.035);
    out = scaleRgb(out, 0.94 + grain * 0.045 + nw * 0.08);
    if (glintLine === 0 && grain > 0.935) out = addRgb(out, { r: 220, g: 252, b: 255 }, 0.22);
    out = dither8Rgb(out, worldX, worldY, 7);
    return rgbToHex(out);
  }

  if (mat === 'diamond') {
    let out = mixRgb(base, { r: 245, g: 252, b: 255 }, 0.16 + nw * 0.22);
    out = mixRgb(out, { r: 78, g: 210, b: 255 }, block * 0.06);
    out = scaleRgb(out, 0.9 + grain * 0.12 + nw * 0.18);
    if (glintLine <= 1 && grain > 0.76) out = addRgb(out, { r: 235, g: 252, b: 255 }, 0.36);
    out = dither8Rgb(out, worldX, worldY, 10);
    return rgbToHex(out);
  }

  if (mat === 'snow') {
    let out = mixRgb(base, { r: 250, g: 253, b: 255 }, 0.22 + nw * 0.16);
    const powder = hash2(Math.floor(worldX / 2), Math.floor(worldY / 2), 67);
    const drift = hash2(Math.floor(worldX / 11), Math.floor(worldY / 5), 71);
    out = mixRgb(out, { r: 176, g: 198, b: 222 }, drift * 0.055);
    out = scaleRgb(out, 0.98 + powder * 0.055 + nw * 0.045);
    if (powder > 0.965) out = addRgb(out, { r: 255, g: 255, b: 255 }, 0.30);
    out = dither8Rgb(out, worldX, worldY, 4);
    return rgbToHex(out);
  }

  if (mat === 'amethyst') {
    let out = mixRgb(base, { r: 203, g: 146, b: 255 }, 0.10 + nw * 0.18);
    out = scaleRgb(out, 0.82 + grain * 0.22 + nw * 0.24);
    if (glintLine <= 2 && grain > 0.46) out = addRgb(out, { r: 255, g: 224, b: 255 }, 0.48);
    if (hash2(localX, localY, 41) > 0.88) out = addRgb(out, { r: 110, g: 245, b: 255 }, 0.18);
    out = dither8Rgb(out, worldX, worldY, 12);
    return rgbToHex(out);
  }

  if (mat === 'cyan_glow' || mat === 'void_rune_glow') {
    let out = mixRgb(base, { r: 190, g: 252, b: 255 }, 0.34);
    out = addRgb(out, { r: 46, g: 233, b: 255 }, 0.20 + grain * 0.18);
    out = dither8Rgb(out, worldX, worldY, 5);
    return rgbToHex(out);
  }

  if (mat === 'voidsteel' || mat === 'blacksteel' || mat === 'black_steel') {
    let out = mixRgb(base, { r: 3, g: 6, b: 16 }, 0.28);
    out = scaleRgb(out, 0.72 + nw * 0.12 + grain * 0.08);
    if (grain > 0.965) out = addRgb(out, { r: 36, g: 210, b: 255 }, 0.55);
    out = dither8Rgb(out, worldX, worldY, 6);
    return rgbToHex(out);
  }

  if (mat === 'gold' || mat === 'void_gold') {
    let out = mixRgb(base, { r: 255, g: 241, b: 184 }, 0.18 + nw * 0.18);
    if (grain > 0.76) out = addRgb(out, { r: 255, g: 255, b: 255 }, 0.18);
    out = dither8Rgb(out, worldX, worldY, 5);
    return rgbToHex(out);
  }

  return color;
}

export function framebufferToCoordinates(fb) {
  const out = [];
  for (let y = 0; y < fb.height; y++) {
    for (let x = 0; x < fb.width; x++) {
      const v = fb.pixels[y * fb.width + x];
      if ((v & 0xff) === 0) continue;
      out.push({ x, y, color: packedToHex(v) });
    }
  }
  return out;
}

export function renderMaterialCoordinateFramebuffer(coordinates, canvas, options = {}) {
  const width = Math.max(1, Math.round(Number(canvas?.width) || 1));
  const height = Math.max(1, Math.round(Number(canvas?.height) || 1));
  const fb = { width, height, pixels: new Uint32Array(width * height), cellIndex: null };
  const shade = options.shade || 'material';

  for (const c of coordinates || []) {
    const x = Math.round(c?.x ?? c?.snappedX ?? -1);
    const y = Math.round(c?.y ?? c?.snappedY ?? -1);
    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    fb.pixels[y * width + x] = hexToPacked(materialShadeColor(
      c.color,
      c.material,
      x,
      y,
      Number.isFinite(c.localX) ? c.localX : x,
      Number.isFinite(c.localY) ? c.localY : y,
      fb,
      shade
    ));
  }

  return shade === 'material' ? applyMaterialPostProcess(fb, options) : fb;
}

/**
 * Rasterize one canonical part into a local lattice.
 * @returns {{ cells: Map<string, {x:number,y:number,color:string}>, bounds: {minX,minY,maxX,maxY}|null }}
 */
function rasterizePartLocal(part, { atSceneRoot, canvas }) {
  const cellOps = [];
  const accept = atSceneRoot ? makeCanvasAccept(canvas.width, canvas.height) : acceptAll;

  for (const op of part.ops || []) {
    const raster = VECTOR_RASTERIZERS[op.op];
    if (raster) {
      raster({ ...op, partId: part.id, material: part.material }, accept, cellOps);
    } else if (op.op === 'cell') {
      if (accept(op.x, op.y)) cellOps.push({ x: op.x, y: op.y, color: op.color });
    } else if (op.op === 'rim' && atSceneRoot) {
      const { width: w, height: h } = canvas;
      const edges = {
        'north': () => Array.from({ length: w }, (_, x) => ({ x, y: 0 })),
        'south': () => Array.from({ length: w }, (_, x) => ({ x, y: h - 1 })),
        'west':  () => Array.from({ length: h }, (_, y) => ({ x: 0, y })),
        'east':  () => Array.from({ length: h }, (_, y) => ({ x: w - 1, y })),
      };
      const make = edges[op.compass] || edges.north;
      for (const { x, y } of make()) cellOps.push({ x, y, color: op.color });
    }
    // fill / glow / trace / symmetry: not rasterized here (symmetry below; rest PR-2+)
  }

  // symmetry: last declaration wins (mirrors legacy pass behavior)
  const sym = (part.ops || []).filter(o => o.op === 'symmetry').pop();
  let cells = new Map();
  for (const c of cellOps) cells.set(`${c.x},${c.y}`, { x: c.x, y: c.y, color: c.color });

  if (sym) {
    if (atSceneRoot) {
      // canvas-center law — delegate to SymmetryAMP exactly like the legacy pass
      const AXIS_MAP = { x: 'vertical', y: 'horizontal', xy: 'radial' };
      const lattice = {
        cols: canvas.width, rows: canvas.height,
        cells: new Map([...cells].map(([k, c]) => [k, { col: c.x, row: c.y, color: c.color, emphasis: 1 }])),
      };
      const mirrored = applySymmetryToLattice(lattice, {
        type: AXIS_MAP[sym.axis] || 'vertical', significant: true, confidence: 1.0,
      });
      cells = new Map();
      mirrored.cells.forEach(c => cells.set(`${c.col},${c.row}`, { x: c.col, y: c.row, color: c.color }));
    } else {
      // local-axes law — reflect through x=0 / y=0 (mirrors paint on top)
      const reflected = new Map(cells);
      for (const c of cells.values()) {
        if (sym.axis === 'x' || sym.axis === 'xy') reflected.set(`${-c.x},${c.y}`, { x: -c.x, y: c.y, color: c.color });
        if (sym.axis === 'y' || sym.axis === 'xy') reflected.set(`${c.x},${-c.y}`, { x: c.x, y: -c.y, color: c.color });
        if (sym.axis === 'xy') reflected.set(`${-c.x},${-c.y}`, { x: -c.x, y: -c.y, color: c.color });
      }
      cells = reflected;
    }
  }

  let bounds = null;
  for (const c of cells.values()) {
    if (!bounds) bounds = { minX: c.x, minY: c.y, maxX: c.x + 1, maxY: c.y + 1 };
    else {
      bounds.minX = Math.min(bounds.minX, c.x);
      bounds.minY = Math.min(bounds.minY, c.y);
      bounds.maxX = Math.max(bounds.maxX, c.x + 1);
      bounds.maxY = Math.max(bounds.maxY, c.y + 1);
    }
  }
  return { cells, bounds };
}

function paintLattice(fb, lattice, M, meta, cellIndex, shade) {
  if (!lattice.bounds) return;
  const { width: W, height: H } = fb;

  const write = (x, y, cell) => {
    const i = y * W + x;
    fb.pixels[i] = hexToPacked(materialShadeColor(cell.color, meta.material, x, y, cell.x, cell.y, fb, shade));
    if (cellIndex) {
      cellIndex[i] = {
        partId: meta.partId, material: meta.material,
        role: meta.role, sourceOpId: meta.sourceOpId,
      };
    }
  };

  if (isIntegerTranslation(M)) {
    for (const cell of lattice.cells.values()) {
      const x = cell.x + M.e, y = cell.y + M.f;
      if (x >= 0 && x < W && y >= 0 && y < H) write(x, y, cell);
    }
    return;
  }

  const Minv = matInvert(M);
  if (!Minv) return; // degenerate — validate already errored
  const world = transformAABB(M, lattice.bounds);
  const x0 = Math.max(0, Math.floor(world.minX));
  const y0 = Math.max(0, Math.floor(world.minY));
  const x1 = Math.min(W - 1, Math.ceil(world.maxX));
  const y1 = Math.min(H - 1, Math.ceil(world.maxY));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const [u, v] = matApply(Minv, x + 0.5, y + 0.5); // the Rounding Law
      const cell = lattice.cells.get(`${Math.floor(u)},${Math.floor(v)}`);
      if (cell) write(x, y, cell);
    }
  }
}

export function renderSceneGraph(sceneGraph, canvas, options = {}) {
  const shade = options.shade || 'geometry';
  if (!['geometry', 'material'].includes(shade)) {
    throw new Error(`renderSceneGraph: unsupported shade mode '${shade}'`);
  }
  if (!sceneGraph || sceneGraph.contract !== 'PB-SCENE-GRAPH-v1') {
    throw new Error('renderSceneGraph: expected a PB-SCENE-GRAPH-v1 sceneGraph');
  }

  const width = canvas.width, height = canvas.height;
  const fb = { width, height, pixels: new Uint32Array(width * height), cellIndex: null };
  const cellIndex = options.semantics ? new Array(width * height).fill(null) : null;
  fb.cellIndex = cellIndex;

  const partCache = new Map(); // `${cacheKey}` → lattice (defs rasterize once)

  const renderNodes = (nodes, M, path, atSceneRoot, cacheScope) => {
    for (const node of nodes || []) {
      if (node.kind === 'part') {
        const key = `${cacheScope}#${node.id}#${atSceneRoot}`;
        let lattice = partCache.get(key);
        if (!lattice) {
          lattice = rasterizePartLocal(node, { atSceneRoot, canvas });
          partCache.set(key, lattice);
        }
        paintLattice(fb, lattice, M, {
          partId: node.id, material: node.material, role: 'explicit',
          sourceOpId: path ? `${path}/${node.id}` : node.id,
        }, cellIndex, shade);
      } else if (node.kind === 'group') {
        renderNodes(
          node.children,
          matMul(M, matFromTransform(node.transform)),
          path ? `${path}/${node.id}` : node.id,
          false,
          cacheScope
        );
      } else if (node.kind === 'instance') {
        const def = sceneGraph.defs[node.ref];
        if (!def) continue; // compile already errored SCDL-016
        renderNodes(
          def.nodes,
          matMul(M, matFromTransform(node.transform)),
          path ? `${path}/${node.name || node.ref}` : (node.name || node.ref),
          false,
          `def:${node.ref}`
        );
      }
    }
  };

  renderNodes(sceneGraph.roots, identity(), '', true, 'root');
  if (shade === 'material') applyMaterialPostProcess(fb, options);
  return fb;
}
