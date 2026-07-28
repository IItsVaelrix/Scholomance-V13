/**
 * Vixel Ablation Acceptance Test
 * 
 * Phase 0 of the Vixel build plan.
 * 
 * An actual Vixel image = a PNG that cannot be produced by either half alone.
 * Proven by ablation: render twice, once with vector identity nulled.
 * The two files must differ visibly and measurably.
 * If the ablation looks the same, we rendered a pixel image with extra metadata.
 * 
 * The demonstration: brazier rim at 4×
 * - Sub-cell coverage AA from signed distance to op boundary → smooth curve at scale
 * - Grain oriented along rim tangent → obsidian texture bends around the bowl
 * Both are impossible without the vector half. Both are visible at a glance.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function loadCompiledPacket(name: string): any {
  const p = JSON.parse(readFileSync(resolve(root, `worldpacks/shrine-demo/scdl/${name}-json.json`), 'utf8'));
  return p;
}

function getCoords(packet: any): any[] {
  return packet.geometry?.coordinates || packet.coordinates || [];
}

/**
 * Render a vixel field to an RGBA buffer at scale S.
 * 
 * For each output pixel at scale S:
 *   coverage = smoothstep over signedDistance → antialiased curve
 *   sample the material grain in a frame rotated to the cell's tangent → texture follows form
 *   composite
 * 
 * @param {object} vixelField - { canvas, cells, opTable }
 * @param {number} scale - render scale (1, 4, 8)
 * @param {boolean} nullVector - if true, null all vector identity (ablation)
 * @returns {{ width: number, height: number, data: Uint8Array }}
 */
function renderVixelPNG(vixelField: any, scale: number, nullVector = false) {
  const { canvas, cells, opTable } = vixelField;
  const W = canvas.width * scale;
  const H = canvas.height * scale;
  const buf = new Uint8Array(W * H * 4); // RGBA

  for (const cell of cells) {
    const cx = cell.x;
    const cy = cell.y;
    const baseColor = hexToRGBA(cell.color);

    // Vector identity (nulled in ablation)
    const sd = nullVector ? null : cell.signedDistance;
    const tangent = nullVector ? null : cell.tangent;
    const normal = nullVector ? null : cell.normal;
    const curvature = nullVector ? null : cell.curvature;
    const material = cell.material;

    // Get grain params from material
    const grain = getGrainParams(material);

    for (let sy = 0; sy < scale; sy++) {
      for (let sx = 0; sx < scale; sx++) {
        const px = cx * scale + sx;
        const py = cy * scale + sy;
        const idx = (py * W + px) * 4;

        // Sub-cell position within the lattice cell (0..1)
        const u = (sx + 0.5) / scale;
        const v = (sy + 0.5) / scale;

        let coverage = 1.0;
        let grainMod = 0;

        if (!nullVector && sd !== null && sd !== undefined) {
          // ── VECTOR PATH: sub-cell AA + tangent-aligned grain ──

          // Signed distance interpolation across the cell:
          // sd is the distance at cell center. Approximate the field
          // across the cell using the normal direction.
          const localSD = sd + ((u - 0.5) * (normal ? normal[0] : 0) + (v - 0.5) * (normal ? normal[1] : 0));

          // Smoothstep coverage: 1.0 inside, 0.0 outside, smooth at boundary
          coverage = smoothstep(-0.5, 0.5, -localSD);

          // Grain: sample in a frame rotated to the tangent
          if (grain && tangent) {
            // Project sub-cell position onto tangent and normal axes
            const tx = tangent[0], ty = tangent[1];
            const nx = normal ? normal[0] : -ty;
            const ny = normal ? normal[1] : tx;
            const along = (u - 0.5) * tx + (v - 0.5) * ty;
            const across = (u - 0.5) * nx + (v - 0.5) * ny;

            // Grain = sinusoidal modulation along the tangent direction
            grainMod = grain.amplitude * Math.sin(
              (along * scale + cx) * grain.frequency * Math.PI * 2 +
              across * grain.crossFrequency * Math.PI * 2
            );
          }
        } else {
          // ── PIXEL PATH: no AA, grid-aligned grain ──
          coverage = 1.0;
          if (grain) {
            // Grid-aligned grain (no tangent rotation)
            grainMod = grain.amplitude * Math.sin(
              (cx + u) * grain.frequency * Math.PI * 2
            );
          }
        }

        // Apply grain to color
        const r = clamp255(baseColor[0] + grainMod * 40);
        const g = clamp255(baseColor[1] + grainMod * 35);
        const b = clamp255(baseColor[2] + grainMod * 30);
        const a = Math.round(baseColor[3] * coverage);

        buf[idx] = r;
        buf[idx + 1] = g;
        buf[idx + 2] = b;
        buf[idx + 3] = a;
      }
    }
  }

  return { width: W, height: H, data: buf };
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function clamp255(v: number) {
  return Math.max(0, Math.min(255, Math.round(v)));
}

function hexToRGBA(hex: string) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) : 255;
  return [r, g, b, a];
}

/**
 * Material grain parameters.
 * Phase 4 will add these to material-registry.js properly.
 * For now, hardcoded per the SCDL white paper material categories.
 */
const GRAIN_TABLE = {
  obsidian:      { frequency: 0.8, crossFrequency: 0.3, amplitude: 0.6 },
  darksteel:     { frequency: 1.2, crossFrequency: 0.5, amplitude: 0.4 },
  holy_fire:     { frequency: 0.4, crossFrequency: 0.2, amplitude: 0.8 },
  oak_bark:      { frequency: 1.5, crossFrequency: 0.2, amplitude: 0.5 },
  moonstone:     { frequency: 0.3, crossFrequency: 0.3, amplitude: 0.3 },
  void_cloth:    { frequency: 2.0, crossFrequency: 0.1, amplitude: 0.2 },
  holy_steel:    { frequency: 1.0, crossFrequency: 0.4, amplitude: 0.45 },
};

function getGrainParams(materialId: string) {
  if (!materialId) return null;
  return (GRAIN_TABLE as Record<string, any>)[materialId] || null;
}

/**
 * Pixel-diff two RGBA buffers. Returns { totalPixels, diffPixels, diffRatio, maxChannelDelta }.
 */
function pixelDiff(a: any, b: any) {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`Size mismatch: ${a.width}×${a.height} vs ${b.width}×${b.height}`);
  }
  const total = a.width * a.height;
  let diffPixels = 0;
  let maxDelta = 0;
  let sumDelta = 0;

  for (let i = 0; i < a.data.length; i += 4) {
    const dr = Math.abs(a.data[i] - b.data[i]);
    const dg = Math.abs(a.data[i + 1] - b.data[i + 1]);
    const db = Math.abs(a.data[i + 2] - b.data[i + 2]);
    const da = Math.abs(a.data[i + 3] - b.data[i + 3]);
    const delta = dr + dg + db + da;
    if (delta > 0) {
      diffPixels++;
      sumDelta += delta;
      maxDelta = Math.max(maxDelta, delta);
    }
  }

  return {
    totalPixels: total,
    diffPixels,
    diffRatio: diffPixels / total,
    avgDelta: diffPixels > 0 ? sumDelta / diffPixels : 0,
    maxChannelDelta: maxDelta,
  };
}

/**
 * Build a vixel field from a compiled SCDL packet.
 * Phase 2: vector identity is now stamped at raster time by the compiler.
 * We read it directly from the packet coordinates — no inference needed.
 */
function buildVixelField(packet: any) {
  const coords = getCoords(packet);
  const canvas = packet.canvas || { width: 16, height: 24 };

  const cells = coords.map(c => ({
    x: c.snappedX ?? c.x,
    y: c.snappedY ?? c.y,
    color: c.color,
    material: c.material || null,
    partId: c.partId || null,
    role: c.role || null,
    sourceOpId: c.sourceOpId || null,
    // Read compiler-emitted vector identity directly
    signedDistance: c.signedDistance ?? null,
    tangent: c.tangent || null,
    normal: c.normal || null,
    curvature: c.curvature ?? null,
    t: c.t ?? null,
  }));

  return { canvas, cells, opTable: new Map() };
}

/**
 * Build an op table from the compiled packet.
 * Maps opId → analytic geometry descriptor.
 */
function buildOpTable(packet: any) {
  const table = new Map();

  // Extract from formula ops if available
  const formula = packet.formula;
  if (formula && Array.isArray(formula.ops)) {
    for (const op of formula.ops) {
      if (op.id) {
        table.set(op.id, op);
      }
      if (op.partId) {
        table.set(op.partId, op);
      }
    }
  }

  // Also extract from source ops
  const source = packet.source;
  if (source && Array.isArray(source.ops)) {
    for (const op of source.ops) {
      if (op.id && !table.has(op.id)) {
        table.set(op.id, op);
      }
      if (op.partId && !table.has(op.partId)) {
        table.set(op.partId, op);
      }
    }
  }

  // Fallback: synthesize ops from cell partIds if no formula/source
  if (table.size === 0) {
    const coords = getCoords(packet);
    const partCells = new Map<string, any[]>();
    for (const c of coords) {
      const pid = c.partId || c.sourceOpId;
      if (pid) {
        if (!partCells.has(pid)) partCells.set(pid, []);
        partCells.get(pid)!.push(c);
      }
    }
    for (const [pid, cells] of partCells) {
      // Fit a bounding ellipse to the part's cells
      const xs = cells.map(c => c.snappedX ?? c.x);
      const ys = cells.map(c => c.snappedY ?? c.y);
      const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
      const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
      const rx = Math.max(1, (Math.max(...xs) - Math.min(...xs)) / 2);
      const ry = Math.max(1, (Math.max(...ys) - Math.min(...ys)) / 2);
      table.set(pid, { id: pid, partId: pid, op: 'ellipse', cx, cy, rx, ry });
    }
  }

  return table;
}

/**
 * Compute analytic vector identity for a cell relative to its op.
 * Returns { signedDistance, tangent, normal, curvature, t }.
 */
function computeVectorIdentity(op: any, px: number, py: number) {
  const type = op.op || op.type;

  if (type === 'ellipse' || type === 'circle') {
    const cx = op.cx;
    const cy = op.cy;
    const rx = op.rx ?? op.radius ?? 1;
    const ry = op.ry ?? op.radius ?? 1;

    // Normalized distance
    const dx = (px - cx) / rx;
    const dy = (py - cy) / ry;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Signed distance (negative inside)
    const signedDistance = (dist - 1) * Math.min(rx, ry);

    // Parametric angle
    const angle = Math.atan2(dy, dx);
    const t = (angle + Math.PI) / (2 * Math.PI); // 0..1

    // Tangent (perpendicular to radial, counterclockwise)
    const tx = -Math.sin(angle);
    const ty = Math.cos(angle);

    // Normal (outward radial)
    const nx = Math.cos(angle);
    const ny = Math.sin(angle);

    // Curvature of ellipse at this angle: κ = (rx*ry) / (rx²sin²θ + ry²cos²θ)^(3/2)
    const sinA = Math.sin(angle);
    const cosA = Math.cos(angle);
    const denom = Math.pow(rx * rx * sinA * sinA + ry * ry * cosA * cosA, 1.5);
    const curvature = denom > 0 ? (rx * ry) / denom : 0;

    return { signedDistance, tangent: [tx, ty], normal: [nx, ny], curvature, t };
  }

  if (type === 'rect') {
    const { x, y, w, h } = op;
    const cx = x + w / 2;
    const cy = y + h / 2;

    // SDF for axis-aligned rect
    const dx = Math.abs(px - cx) - w / 2;
    const dy = Math.abs(py - cy) - h / 2;
    const outside = Math.sqrt(Math.max(dx, 0) ** 2 + Math.max(dy, 0) ** 2);
    const inside = Math.min(Math.max(dx, dy), 0);
    const signedDistance = outside + inside;

    // Normal: direction of steepest ascent of SDF
    let nx = 0, ny = 0;
    if (dx > dy) nx = Math.sign(px - cx);
    else ny = Math.sign(py - cy);
    const len = Math.sqrt(nx * nx + ny * ny) || 1;
    nx /= len; ny /= len;

    // Tangent: perpendicular to normal
    const tx = -ny, ty = nx;

    // Curvature: 0 for flat edges, high at corners
    const atCorner = dx > -0.5 && dy > -0.5;
    const curvature = atCorner ? 2.0 : 0.0;

    // t: parametric position along perimeter
    const perim = 2 * (w + h);
    let t;
    if (py <= y) t = (px - x) / perim; // top edge
    else if (px >= x + w) t = (w + (py - y)) / perim; // right edge
    else if (py >= y + h) t = (w + h + (x + w - px)) / perim; // bottom edge
    else t = (w + h + w + (y + h - py)) / perim; // left edge

    return { signedDistance, tangent: [tx, ty], normal: [nx, ny], curvature, t };
  }

  if (type === 'polygon') {
    const pts = op.points || [];
    if (pts.length < 3) return { signedDistance: 0, tangent: [1, 0], normal: [0, 1], curvature: 0, t: 0 };

    // Find nearest edge
    let minDist = Infinity;
    let bestTangent = [1, 0];
    let bestNormal = [0, 1];
    let bestT = 0;
    let inside = false;

    // Point-in-polygon
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / ((yj - yi) || 1e-9) + xi)) {
        inside = !inside;
      }
    }

    // Nearest edge
    let totalLen = 0;
    const edgeLengths = [];
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      const len = Math.sqrt((xj - xi) ** 2 + (yj - yi) ** 2);
      edgeLengths.push(len);
      totalLen += len;
    }

    let accLen = 0;
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      const [xi, yi] = pts[i];
      const [xj, yj] = pts[j];
      const ex = xj - xi, ey = yj - yi;
      const len = edgeLengths[i];
      if (len === 0) continue;

      // Project point onto edge
      const tEdge = Math.max(0, Math.min(1, ((px - xi) * ex + (py - yi) * ey) / (len * len)));
      const closestX = xi + tEdge * ex;
      const closestY = yi + tEdge * ey;
      const dist = Math.sqrt((px - closestX) ** 2 + (py - closestY) ** 2);

      if (dist < minDist) {
        minDist = dist;
        bestTangent = [ex / len, ey / len];
        bestNormal = [-ey / len, ex / len];
        bestT = (accLen + tEdge * len) / totalLen;
      }
      accLen += len;
    }

    const signedDistance = inside ? -minDist : minDist;
    // Curvature at polygon vertices is high, along edges is 0
    const curvature = minDist < 0.5 ? 1.5 : 0.0;

    return { signedDistance, tangent: bestTangent, normal: bestNormal, curvature, t: bestT };
  }

  // Fallback: no vector identity
  return { signedDistance: 0, tangent: [1, 0], normal: [0, 1], curvature: 0, t: 0 };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Vixel Ablation — Phase 0 Acceptance', () => {
  it('compiled brazier packet has full provenance (material, partId, role)', () => {
    const packet = loadCompiledPacket('brazier');
    const coords = getCoords(packet);

    expect(coords.length).toBeGreaterThan(100);

    // Every cell must have material
    const withMaterial = coords.filter(c => c.material);
    expect(withMaterial.length).toBe(coords.length);

    // Every cell must have partId
    const withPartId = coords.filter(c => c.partId);
    expect(withPartId.length).toBe(coords.length);

    // Every cell must have role
    const withRole = coords.filter(c => c.role);
    expect(withRole.length).toBe(coords.length);
  });

  it('vixel field has per-cell vector identity (signedDistance, tangent, normal, curvature)', () => {
    const packet = loadCompiledPacket('brazier');
    const field = buildVixelField(packet);

    expect(field.cells.length).toBeGreaterThan(100);

    // At least 75% of cells should have vector identity
    // (some cells from fill ops may not map to a named op in the table)
    const withSD = field.cells.filter(c => c.signedDistance !== null && c.signedDistance !== undefined);
    expect(withSD.length).toBeGreaterThan(field.cells.length * 0.75);

    const withTangent = field.cells.filter(c => c.tangent !== null);
    expect(withTangent.length).toBeGreaterThan(field.cells.length * 0.75);

    const withNormal = field.cells.filter(c => c.normal !== null);
    expect(withNormal.length).toBeGreaterThan(field.cells.length * 0.75);
  });

  it('ABLATION: vixel render at 4× differs measurably from pixel-only render', () => {
    const packet = loadCompiledPacket('brazier');
    const field = buildVixelField(packet);

    const vixelRender = renderVixelPNG(field, 4, false);
    const pixelRender = renderVixelPNG(field, 4, true);

    expect(vixelRender.width).toBe(pixelRender.width);
    expect(vixelRender.height).toBe(pixelRender.height);

    const diff = pixelDiff(vixelRender, pixelRender);

    // The two renders MUST differ. If they don't, vector identity is decorative metadata.
    expect(diff.diffPixels).toBeGreaterThan(0);

    // At least 5% of pixels should differ (AA edges + grain rotation)
    expect(diff.diffRatio).toBeGreaterThan(0.05);

    // The difference should be visible, not sub-pixel noise
    expect(diff.maxChannelDelta).toBeGreaterThan(10);

    console.log(`  Ablation diff: ${diff.diffPixels}/${diff.totalPixels} pixels (${(diff.diffRatio * 100).toFixed(1)}%)`);
    console.log(`  Avg delta: ${diff.avgDelta.toFixed(1)}, Max delta: ${diff.maxChannelDelta}`);
  });

  it('ABLATION: at 4× the vixel produces a smooth AA gradient (many distinct alpha levels) vs 1× binary', () => {
    const packet = loadCompiledPacket('brazier');
    const field = buildVixelField(packet);

    // Count distinct alpha values at each scale
    const vixel1x = renderVixelPNG(field, 1, false);
    const alphas1x = new Set<number>();
    for (let i = 3; i < vixel1x.data.length; i += 4) {
      if (vixel1x.data[i] > 0 && vixel1x.data[i] < 255) alphas1x.add(vixel1x.data[i]);
    }

    const vixel4x = renderVixelPNG(field, 4, false);
    const alphas4x = new Set<number>();
    for (let i = 3; i < vixel4x.data.length; i += 4) {
      if (vixel4x.data[i] > 0 && vixel4x.data[i] < 255) alphas4x.add(vixel4x.data[i]);
    }

    // At 4×, the smoothstep across sub-pixels produces a gradient of alpha values
    // At 1×, each cell gets a single sample → far fewer distinct alpha levels
    expect(alphas4x.size).toBeGreaterThan(alphas1x.size);

    // 4× should have a meaningful smooth gradient (at least 10 distinct alpha levels)
    expect(alphas4x.size).toBeGreaterThan(10);

    console.log(`  Distinct semi-transparent alpha levels: 1×=${alphas1x.size}, 4×=${alphas4x.size}`);
  });

  it('render is deterministic (same input → same output)', () => {
    const packet = loadCompiledPacket('brazier');
    const field = buildVixelField(packet);

    const a = renderVixelPNG(field, 4, false);
    const b = renderVixelPNG(field, 4, false);

    expect(Buffer.from(a.data).equals(Buffer.from(b.data))).toBe(true);
  });

  it('grain follows tangent, not grid (obsidian cells on curved rim differ from grid grain)', () => {
    const packet = loadCompiledPacket('brazier');
    const field = buildVixelField(packet);

    // Find rim cells (partId === 'rim' with obsidian material)
    const rimCells = field.cells.filter(c => c.partId === 'rim' && c.material === 'obsidian');
    expect(rimCells.length).toBeGreaterThan(5);

    // Render vixel and pixel-only at 4×
    const vixel = renderVixelPNG(field, 4, false);
    const pixel = renderVixelPNG(field, 4, true);

    // For rim cells, the sub-pixel pattern should differ
    // (tangent-aligned grain vs grid-aligned grain)
    let rimDiffPixels = 0;
    let rimTotalPixels = 0;

    for (const cell of rimCells) {
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          const px = cell.x * 4 + sx;
          const py = cell.y * 4 + sy;
          const idx = (py * vixel.width + px) * 4;
          rimTotalPixels++;
          if (vixel.data[idx] !== pixel.data[idx] ||
              vixel.data[idx + 1] !== pixel.data[idx + 1] ||
              vixel.data[idx + 2] !== pixel.data[idx + 2]) {
            rimDiffPixels++;
          }
        }
      }
    }

    // At least 30% of rim sub-pixels should differ (grain rotation is visible)
    const rimDiffRatio = rimDiffPixels / rimTotalPixels;
    expect(rimDiffRatio).toBeGreaterThan(0.3);

    console.log(`  Rim grain diff: ${rimDiffPixels}/${rimTotalPixels} sub-pixels (${(rimDiffRatio * 100).toFixed(1)}%)`);
  });
});
