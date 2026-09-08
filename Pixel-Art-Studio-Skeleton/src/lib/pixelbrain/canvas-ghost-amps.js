import { previewStudioAmpExecution, proposeStudioMutationExecution, getStudioAmpManifest } from "./studio-facade.js";
import { cellsFromOutput } from "./studio-document.js";
import { CANONICAL_TO_MANIFEST_MAP } from "./studio-authoring-facade.js";

/**
 * Palettes for elemental flame variations.
 */
export const FLAME_PALETTES = Object.freeze({
  classic: Object.freeze({
    core: "#fff7c2",
    inner: "#fde047",
    mid: "#fb923c",
    outer: "#ef4444",
    ember: "#fef08a",
    bladeGlow: "#fed7aa",
  }),
  holy: Object.freeze({
    core: "#fffbeb",
    inner: "#fde68a",
    mid: "#f59e0b",
    outer: "#d97706",
    ember: "#fef3c7",
    bladeGlow: "#fef08a",
  }),
  icy: Object.freeze({
    core: "#f8fcff",
    inner: "#bae6fd",
    mid: "#38bdf8",
    outer: "#0284c7",
    ember: "#e0f2fe",
    bladeGlow: "#7dd3fc",
  }),
  shadow: Object.freeze({
    core: "#faf5ff",
    inner: "#e9d5ff",
    mid: "#c084fc",
    outer: "#9333ea",
    ember: "#f3e8ff",
    bladeGlow: "#d8b4fe",
  }),
  poison: Object.freeze({
    core: "#f0fdf4",
    inner: "#bbf7d0",
    mid: "#4ade80",
    outer: "#16a34a",
    ember: "#dcfce7",
    bladeGlow: "#86efac",
  }),
});

export const FLAME_ELEMENTS = Object.freeze([
  { id: "classic", name: "Classic Fire", icon: "🔥", desc: "Incandescent red, orange, and golden core" },
  { id: "holy", name: "Holy Fire", icon: "☀️", desc: "Sacred golden amber with radiant white core" },
  { id: "icy", name: "Frostfire / Icy", icon: "❄️", desc: "Frigid cyan, arctic azure, and frost core" },
  { id: "shadow", name: "Shadow Flame", icon: "🔮", desc: "Nether violet, ethereal purple, and void ember" },
  { id: "poison", name: "Poison / Toxic", icon: "🧪", desc: "Acid emerald, venom lime, and toxic glow" },
]);

export const GHOST_AMP_PRESETS = Object.freeze([
  {
    id: "flame",
    name: "Flame AMP",
    badge: "Fire & Embers",
    icon: "🔥",
    ampId: "pixelbrain.flame-tip-amp",
    description: "Projects dynamic flame plumes, blazing core highlights, and floating embers over weapons and props.",
    hasElements: true,
    hasIntensity: true,
  },
  {
    id: "bevel",
    name: "Bevel & Specular",
    badge: "Light & Edge",
    icon: "🛡️",
    ampId: "chestplate-bevel-amp",
    description: "Calculates directional lighting and generates specular glints on lit edges and bevel shadows on underside.",
    hasElements: false,
    hasIntensity: true,
  },
  {
    id: "shadow",
    name: "Drop Shadow & Depth",
    badge: "Contact & Cast",
    icon: "🌑",
    ampId: "pixelbrain.shadow-amp",
    description: "Generates ground contact occlusion underneath sprites and directional cast drop shadow.",
    hasElements: false,
    hasIntensity: true,
  },
  {
    id: "selout",
    name: "Selout (Soft Outline)",
    badge: "Outline Harmony",
    icon: "✏️",
    ampId: "selout-amp",
    description: "Softens harsh borders with color-harmonized selective outline pixels derived from adjacent clusters.",
    hasElements: false,
    hasIntensity: false,
  },
  {
    id: "pixel-aa",
    name: "Pixel Anti-Aliasing",
    badge: "Smooth Curves",
    icon: "🔍",
    ampId: "pixel-aa-amp",
    description: "Identifies diagonal staircasing and recommends intermediate blend pixels to smooth jagged edges.",
    hasElements: false,
    hasIntensity: false,
  },
  {
    id: "crystal-core",
    name: "Crystal Core & Glow",
    badge: "Focal Luminescence",
    icon: "💎",
    ampId: "crystal-core-amp",
    description: "Places a radiant focal core and gem energy dissipation halo at the artwork's center of mass.",
    hasElements: false,
    hasIntensity: true,
  },
  {
    id: "hair-flow",
    name: "Flowing Strands",
    badge: "Organic Curves",
    icon: "🌊",
    ampId: "hair-flow-amp",
    description: "Generates graceful organic trailing curves, ribbons, and strand tips from silhouette corners.",
    hasElements: false,
    hasIntensity: true,
  },
  {
    id: "noise-fill",
    name: "Micro-Texture & Stipple",
    badge: "Surface Shading",
    icon: "🎲",
    ampId: "noise-fill",
    description: "Adds subtle deterministic dither and micro-shading variation to break up flat surfaces.",
    hasElements: false,
    hasIntensity: false,
  },
]);

function parseHex(hex) {
  const raw = String(hex || "").trim().replace("#", "");
  const norm = raw.length === 3 ? raw.split("").map((c) => `${c}${c}`).join("") : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(norm)) return { r: 128, g: 128, b: 128 };
  const num = parseInt(norm, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHex(r, g, b) {
  const safe = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${safe(r)}${safe(g)}${safe(b)}`;
}

function mixColors(c1, c2, t) {
  const rgb1 = parseHex(c1);
  const rgb2 = parseHex(c2);
  return rgbToHex(
    rgb1.r + (rgb2.r - rgb1.r) * t,
    rgb1.g + (rgb2.g - rgb1.g) * t,
    rgb1.b + (rgb2.b - rgb1.b) * t
  );
}

function adjustBrightness(hex, delta) {
  const { r, g, b } = parseHex(hex);
  return rgbToHex(r + delta, g + delta, b + delta);
}

function colorLuminance(hex) {
  const { r, g, b } = parseHex(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/**
 * Extracts visible or non-empty cells from snapshot layers.
 */
export function getSnapshotVisibleCells(snapshot) {
  const cells = [];
  for (const layer of snapshot?.layers || []) {
    if (layer?.visible === false) continue;
    const raw = layer.cells instanceof Map ? [...layer.cells.values()] : Array.isArray(layer.cells) ? layer.cells : [];
    for (const c of raw) {
      if (c && Number.isInteger(c.x) && Number.isInteger(c.y) && c.color != null) {
        cells.push({ x: c.x, y: c.y, color: c.color });
      }
    }
  }
  return cells;
}

/**
 * Flame AMP Ghost Hint Generator
 * Analyzes blade/prop geometry, apex, and edges to project rising flame plumes,
 * floating spark embers, and superheated blade-tip incandescence.
 */
export function generateFlameGhostHints(cells, width, height, options = {}) {
  if (!cells || cells.length === 0) {
    return {
      cells: [],
      hintCount: 0,
      summary: "Draw something on the canvas (e.g. a sword or prop) to generate flame hints.",
    };
  }

  const element = options.element || "classic";
  const intensity = options.intensity || "medium";
  const seed = (options.seed ?? 17) >>> 0;
  const pal = FLAME_PALETTES[element] || FLAME_PALETTES.classic;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const occupied = new Set();
  for (const c of cells) {
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y);
    maxY = Math.max(maxY, c.y);
    occupied.add(`${c.x},${c.y}`);
  }

  const objWidth = Math.max(1, maxX - minX + 1);
  const objHeight = Math.max(1, maxY - minY + 1);
  const cx = Math.round((minX + maxX) / 2);

  // Identify tip/top region (top 30% of object)
  const tipThresholdY = minY + Math.max(1, Math.floor(objHeight * 0.3));
  const tipCells = cells.filter((c) => c.y <= tipThresholdY);
  const tipYKeys = [...new Set(tipCells.map((c) => c.y))].sort((a, b) => a - b);
  const apexY = tipYKeys[0] ?? minY;

  const hintCells = [];
  const hintOccupied = new Set();

  function addHint(x, y, color, role, label) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const key = `${x},${y}`;
    if (occupied.has(key) && role !== "blade-glow") return;
    if (hintOccupied.has(key)) return;
    hintOccupied.add(key);
    hintCells.push({ x, y, color, role, label });
  }

  // 1. Blade superheating/incandescence on top tip cells
  for (const tc of tipCells) {
    if (tc.y <= minY + 2) {
      addHint(tc.x, tc.y, pal.bladeGlow, "blade-glow", "Blade Heat");
    }
  }

  // 2. Rising flame plumes
  const plumeCount = intensity === "subtle" ? 2 : intensity === "intense" ? 5 : 3;
  const nominalHeight = intensity === "subtle" ? 5 : intensity === "intense" ? 12 : 8;
  const headroom = Math.max(2, apexY);
  const baseHeight = Math.min(headroom, nominalHeight);

  // Find tip origins across top width
  const topRows = cells.filter((c) => c.y <= minY + 1);
  const originXs = [...new Set(topRows.map((c) => c.x))].sort((a, b) => a - b);
  const midOriginX = originXs.length ? originXs[Math.floor(originXs.length / 2)] : cx;

  for (let p = 0; p < plumeCount; p += 1) {
    const h = Math.max(2, baseHeight + ((p * 2 + seed) % 3) - 1);
    const plumeOffsetX = (p - Math.floor(plumeCount / 2)) * 1.5;
    const startX = Math.round(midOriginX + plumeOffsetX);
    const startY = apexY;

    for (let step = 0; step < h; step += 1) {
      const t = step / h;
      const wave = Math.sin(t * Math.PI * 1.5 + p + seed) * (1.2 + (1 - t) * 1.4);
      const curX = Math.round(startX + wave);
      const curY = startY - step - 1;

      let col = pal.outer;
      let role = "flame-outer";
      let label = "Outer Flame";
      if (t < 0.25) {
        col = pal.core;
        role = "flame-core";
        label = "White Core";
      } else if (t < 0.55) {
        col = pal.inner;
        role = "flame-inner";
        label = "Inner Flame";
      } else if (t < 0.85) {
        col = pal.mid;
        role = "flame-mid";
        label = "Flame Body";
      }

      addHint(curX, curY, col, role, label);

      // Flame width body
      if (t < 0.4 && step % 2 === 0) {
        addHint(curX - 1, curY, pal.mid, "flame-mid", "Flame Body");
        addHint(curX + 1, curY, pal.mid, "flame-mid", "Flame Body");
      }
    }
  }

  // 3. Floating embers
  const emberCount = intensity === "subtle" ? 2 : intensity === "intense" ? 6 : 4;
  for (let e = 0; e < emberCount; e += 1) {
    const ex = Math.round(cx + Math.sin(e * 2.3 + seed) * (objWidth * 0.7));
    // Placed above apex within available bounds
    const maxLift = Math.max(1, apexY);
    const ey = Math.max(0, apexY - 1 - (e % maxLift));
    addHint(ex, ey, pal.ember, "ember", "Spark Ember");
  }

  return {
    cells: hintCells,
    hintCount: hintCells.length,
    summary: `Flame AMP (${element}): ${hintCells.length} hint pixels (${plumeCount} rising plumes, embers, and blade tip heat).`,
  };
}

/**
 * Bevel AMP Ghost Hint Generator
 * Computes specular directional edge highlights (top-left) and bevel shadows (bottom-right).
 */
export function generateBevelGhostHints(cells, width, height, options = {}) {
  if (!cells || cells.length === 0) {
    return { cells: [], hintCount: 0, summary: "No artwork detected on canvas." };
  }
  const occupied = new Map();
  for (const c of cells) occupied.set(`${c.x},${c.y}`, c);

  const intensity = options.intensity || "medium";
  const lift = intensity === "subtle" ? 30 : intensity === "intense" ? 70 : 50;

  const hintCells = [];
  const visited = new Set();

  for (const c of cells) {
    const hasTop = occupied.has(`${c.x},${c.y - 1}`);
    const hasLeft = occupied.has(`${c.x - 1},${c.y}`);
    const hasBottom = occupied.has(`${c.x},${c.y + 1}`);
    const hasRight = occupied.has(`${c.x + 1},${c.y}`);

    const key = `${c.x},${c.y}`;
    if (visited.has(key)) continue;

    if (!hasTop || !hasLeft) {
      visited.add(key);
      hintCells.push({
        x: c.x,
        y: c.y,
        color: adjustBrightness(c.color, lift),
        role: "specular-highlight",
        label: "Specular Edge",
      });
    } else if (!hasBottom || !hasRight) {
      visited.add(key);
      hintCells.push({
        x: c.x,
        y: c.y,
        color: adjustBrightness(c.color, -lift),
        role: "bevel-shadow",
        label: "Bevel Shadow",
      });
    }
  }

  return {
    cells: hintCells,
    hintCount: hintCells.length,
    summary: `Bevel AMP: ${hintCells.length} edge highlights & bevel shadows recommended.`,
  };
}

/**
 * Shadow AMP Ghost Hint Generator
 * Computes ground contact occlusion and directional drop cast shadow.
 */
export function generateShadowGhostHints(cells, width, height, options = {}) {
  if (!cells || cells.length === 0) {
    return { cells: [], hintCount: 0, summary: "No artwork detected on canvas." };
  }
  const occupied = new Set();
  let minX = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const c of cells) {
    occupied.add(`${c.x},${c.y}`);
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x);
    maxY = Math.max(maxY, c.y);
  }

  const hintCells = [];
  const added = new Set();

  // 1. Cast shadow (offset +1, +1)
  for (const c of cells) {
    const sx = c.x + 1;
    const sy = c.y + 1;
    const key = `${sx},${sy}`;
    if (sx < width && sy < height && !occupied.has(key) && !added.has(key)) {
      added.add(key);
      hintCells.push({
        x: sx,
        y: sy,
        color: "#181a17",
        role: "cast-shadow",
        label: "Cast Shadow",
      });
    }
  }

  // 2. Ground contact shadow
  const groundY = maxY + 1;
  if (groundY < height) {
    for (let x = Math.max(0, minX - 1); x <= Math.min(width - 1, maxX + 1); x += 1) {
      const key = `${x},${groundY}`;
      if (!occupied.has(key) && !added.has(key)) {
        added.add(key);
        hintCells.push({
          x,
          y: groundY,
          color: "#111410",
          role: "ground-shadow",
          label: "Ground Contact",
        });
      }
    }
  }

  return {
    cells: hintCells,
    hintCount: hintCells.length,
    summary: `Shadow AMP: ${hintCells.length} ground contact and cast shadow hints.`,
  };
}

/**
 * Selout (Selective Outline) Ghost Hint Generator
 * Recommends softening harsh borders into tinted harmonic transitions.
 */
export function generateSeloutGhostHints(cells, width, height) {
  if (!cells || cells.length === 0) {
    return { cells: [], hintCount: 0, summary: "No artwork detected on canvas." };
  }
  const occupied = new Map();
  for (const c of cells) occupied.set(`${c.x},${c.y}`, c);

  const hintCells = [];
  for (const c of cells) {
    const isPerimeter =
      !occupied.has(`${c.x},${c.y - 1}`) ||
      !occupied.has(`${c.x},${c.y + 1}`) ||
      !occupied.has(`${c.x - 1},${c.y}`) ||
      !occupied.has(`${c.x + 1},${c.y}`);

    if (isPerimeter) {
      const luma = colorLuminance(c.color);
      // If harsh black or dark border, suggest softened tint
      if (luma < 0.2) {
        hintCells.push({
          x: c.x,
          y: c.y,
          color: adjustBrightness(c.color, 35),
          role: "selout",
          label: "Soft Outline",
        });
      }
    }
  }

  return {
    cells: hintCells,
    hintCount: hintCells.length,
    summary: `Selout AMP: ${hintCells.length} perimeter outline softening hints.`,
  };
}

/**
 * Pixel Anti-Aliasing Ghost Hint Generator
 * Finds diagonal staircased jaggies and recommends 50% transitional blend pixels in corners.
 */
export function generatePixelAAGhostHints(cells, width, height) {
  if (!cells || cells.length === 0) {
    return { cells: [], hintCount: 0, summary: "No artwork detected on canvas." };
  }
  const occupied = new Map();
  for (const c of cells) occupied.set(`${c.x},${c.y}`, c);

  const hintCells = [];
  const added = new Set();

  for (const c of cells) {
    // Check diagonal neighbors with orthogonal empty steps
    const corners = [
      { dx: 1, dy: 1, ox1: 1, oy1: 0, ox2: 0, oy2: 1 },
      { dx: -1, dy: 1, ox1: -1, oy1: 0, ox2: 0, oy2: 1 },
      { dx: 1, dy: -1, ox1: 1, oy1: 0, ox2: 0, oy2: -1 },
      { dx: -1, dy: -1, ox1: -1, oy1: 0, ox2: 0, oy2: -1 },
    ];

    for (const corner of corners) {
      const diagCell = occupied.get(`${c.x + corner.dx},${c.y + corner.dy}`);
      const orth1 = occupied.get(`${c.x + corner.ox1},${c.y + corner.oy1}`);
      const orth2 = occupied.get(`${c.x + corner.ox2},${c.y + corner.oy2}`);

      // Classic jagged step: diagonal is filled, one orthogonal is empty
      if (diagCell && !orth1 && !orth2) {
        const hx = c.x + corner.ox1;
        const hy = c.y + corner.oy1;
        const key = `${hx},${hy}`;
        if (hx >= 0 && hx < width && hy >= 0 && hy < height && !added.has(key)) {
          added.add(key);
          const blendColor = mixColors(c.color, diagCell.color, 0.5);
          hintCells.push({
            x: hx,
            y: hy,
            color: blendColor,
            role: "anti-aliasing",
            label: "AA Blend",
          });
        }
      }
    }
  }

  return {
    cells: hintCells,
    hintCount: hintCells.length,
    summary: `Pixel AA AMP: ${hintCells.length} stair-step smoothing blend hints.`,
  };
}

/**
 * Crystal Core & Glow Ghost Hint Generator
 * Recommends central focal point mana core and energy glow halo.
 */
export function generateCrystalCoreGhostHints(cells, width, height, options = {}) {
  if (!cells || cells.length === 0) {
    return { cells: [], hintCount: 0, summary: "No artwork detected on canvas." };
  }
  let sumX = 0, sumY = 0;
  for (const c of cells) {
    sumX += c.x;
    sumY += c.y;
  }
  const cx = Math.round(sumX / cells.length);
  const cy = Math.round(sumY / cells.length);

  const hintCells = [];
  const added = new Set();
  function add(x, y, color, role, label) {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const key = `${x},${y}`;
    if (added.has(key)) return;
    added.add(key);
    hintCells.push({ x, y, color, role, label });
  }

  // Diamond core
  add(cx, cy, "#ffffff", "core-center", "Focal Apex");
  add(cx - 1, cy, "#67e8f9", "core-inner", "Mana Core");
  add(cx + 1, cy, "#67e8f9", "core-inner", "Mana Core");
  add(cx, cy - 1, "#67e8f9", "core-inner", "Mana Core");
  add(cx, cy + 1, "#67e8f9", "core-inner", "Mana Core");

  // Outer aura
  add(cx - 2, cy, "#06b6d4", "core-aura", "Aura Glow");
  add(cx + 2, cy, "#06b6d4", "core-aura", "Aura Glow");
  add(cx, cy - 2, "#06b6d4", "core-aura", "Aura Glow");
  add(cx, cy + 2, "#06b6d4", "core-aura", "Aura Glow");
  add(cx - 1, cy - 1, "#0891b2", "core-aura", "Aura Glow");
  add(cx + 1, cy - 1, "#0891b2", "core-aura", "Aura Glow");
  add(cx - 1, cy + 1, "#0891b2", "core-aura", "Aura Glow");
  add(cx + 1, cy + 1, "#0891b2", "core-aura", "Aura Glow");

  return {
    cells: hintCells,
    hintCount: hintCells.length,
    summary: `Crystal Core AMP: ${hintCells.length} focal crystal core & mana aura hints.`,
  };
}

/**
 * Hair & Flow Strands Ghost Hint Generator
 * Recommends organic trailing strands and dynamic curve tips.
 */
export function generateHairFlowGhostHints(cells, width, height, options = {}) {
  if (!cells || cells.length === 0) {
    return { cells: [], hintCount: 0, summary: "No artwork detected on canvas." };
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const c of cells) {
    minX = Math.min(minX, c.x);
    maxX = Math.max(maxX, c.x);
    minY = Math.min(minY, c.y);
    maxY = Math.max(maxY, c.y);
  }

  const hintCells = [];
  const added = new Set();
  const seed = (options.seed ?? 31) >>> 0;

  // Flow strands trailing down and back
  const strandCount = 4;
  for (let s = 0; s < strandCount; s += 1) {
    const originX = minX + Math.round((maxX - minX) * (s / (strandCount - 1 || 1)));
    const originY = maxY;

    for (let step = 1; step <= 6; step += 1) {
      const sx = Math.round(originX + Math.sin(step * 0.8 + s + seed) * 2 + step * 0.5);
      const sy = originY + step;
      const key = `${sx},${sy}`;
      if (sx >= 0 && sx < width && sy >= 0 && sy < height && !added.has(key)) {
        added.add(key);
        hintCells.push({
          x: sx,
          y: sy,
          color: step < 3 ? "#94a3b8" : "#64748b",
          role: "flow-strand",
          label: "Flow Strand",
        });
      }
    }
  }

  return {
    cells: hintCells,
    hintCount: hintCells.length,
    summary: `Hair Flow AMP: ${hintCells.length} organic strand flow hints.`,
  };
}

/**
 * Noise / Texture Ghost Hint Generator
 * Adds subtle micro-dither variation hints to solid regions.
 */
export function generateNoiseGhostHints(cells, width, height, options = {}) {
  if (!cells || cells.length === 0) {
    return { cells: [], hintCount: 0, summary: "No artwork detected on canvas." };
  }
  const hintCells = [];
  for (let i = 0; i < cells.length; i += 1) {
    const c = cells[i];
    // Deterministic checker/dither pattern on every other cell
    if ((c.x + c.y) % 3 === 0) {
      hintCells.push({
        x: c.x,
        y: c.y,
        color: adjustBrightness(c.color, 18),
        role: "texture-stipple",
        label: "Texture Stipple",
      });
    }
  }

  return {
    cells: hintCells,
    hintCount: hintCells.length,
    summary: `Noise Texture AMP: ${hintCells.length} micro-shading & stipple texture hints.`,
  };
}

/**
 * Universal Ghost Hint Dispatcher.
 * Dispatches to preset generators or executes any manifest AMP.
 */
export async function generateGhostHints(ampId, snapshot, options = {}) {
  const cells = getSnapshotVisibleCells(snapshot);
  const width = snapshot?.width || 32;
  const height = snapshot?.height || 32;
  const normalizedId = CANONICAL_TO_MANIFEST_MAP[ampId] || ampId;

  // 1. Direct Presets
  if (ampId === "flame" || ampId === "pixelbrain.flame-tip-amp" || ampId === "pixelbrain.holyfireMotif" || normalizedId === "pixelbrain.flame-tip-amp") {
    const res = generateFlameGhostHints(cells, width, height, options);
    return {
      ampId: "pixelbrain.flame-tip-amp",
      ampName: "Flame AMP",
      ...res,
      baseChecksum: snapshot?.checksum || "",
    };
  }

  if (ampId === "bevel" || ampId === "chestplate-bevel-amp" || ampId === "shield-rim-amp" || normalizedId === "chestplate-bevel-amp") {
    const res = generateBevelGhostHints(cells, width, height, options);
    return {
      ampId: "chestplate-bevel-amp",
      ampName: "Bevel & Specular",
      ...res,
      baseChecksum: snapshot?.checksum || "",
    };
  }

  if (ampId === "shadow" || ampId === "pixelbrain.shadow" || ampId === "pixelbrain.shadow-amp" || ampId === "pixelbrain.shadow-perception-amp" || normalizedId === "pixelbrain.shadow-amp") {
    const res = generateShadowGhostHints(cells, width, height, options);
    return {
      ampId: "pixelbrain.shadow-amp",
      ampName: "Drop Shadow & Depth",
      ...res,
      baseChecksum: snapshot?.checksum || "",
    };
  }

  if (ampId === "selout" || ampId === "pixelbrain.selout" || ampId === "selout-amp" || normalizedId === "selout-amp") {
    const res = generateSeloutGhostHints(cells, width, height, options);
    return {
      ampId: "selout-amp",
      ampName: "Selout (Soft Outline)",
      ...res,
      baseChecksum: snapshot?.checksum || "",
    };
  }

  if (ampId === "pixel-aa" || ampId === "pixelbrain.pixel-aa" || ampId === "pixel-aa-amp" || normalizedId === "pixel-aa-amp") {
    const res = generatePixelAAGhostHints(cells, width, height, options);
    return {
      ampId: "pixel-aa-amp",
      ampName: "Pixel Anti-Aliasing",
      ...res,
      baseChecksum: snapshot?.checksum || "",
    };
  }

  if (ampId === "crystal-core" || ampId === "crystal-core-amp" || normalizedId === "crystal-core-amp") {
    const res = generateCrystalCoreGhostHints(cells, width, height, options);
    return {
      ampId: "crystal-core-amp",
      ampName: "Crystal Core Glow",
      ...res,
      baseChecksum: snapshot?.checksum || "",
    };
  }

  if (ampId === "hair-flow" || ampId === "hair-flow-amp" || normalizedId === "hair-flow-amp") {
    const res = generateHairFlowGhostHints(cells, width, height, options);
    return {
      ampId: "hair-flow-amp",
      ampName: "Flowing Strands",
      ...res,
      baseChecksum: snapshot?.checksum || "",
    };
  }

  if (ampId === "noise-fill" || ampId === "noise" || normalizedId === "noise-fill") {
    const res = generateNoiseGhostHints(cells, width, height, options);
    return {
      ampId: "noise-fill",
      ampName: "Micro-Texture",
      ...res,
      baseChecksum: snapshot?.checksum || "",
    };
  }

  // 2. Generic Manifest AMP fallback execution
  const manifest = getStudioAmpManifest();
  const record = manifest.find((r) => r.ampId === normalizedId || r.ampId === ampId);
  const targetId = record?.ampId || normalizedId || ampId;

  try {
    let output;
    if (record?.kind === "mutation") {
      const proposal = await proposeStudioMutationExecution({ ampId: targetId, snapshot, options });
      output = proposal.transaction?.candidate?.data ?? proposal.transaction?.candidate;
    } else {
      const result = await previewStudioAmpExecution({ ampId: targetId, snapshot, options });
      output = result.output;
    }

    const outputCells = cellsFromOutput(output);
    const existingMap = new Map(cells.map((c) => [`${c.x},${c.y}`, c.color]));

    // Find recommended delta cells
    const hintCells = outputCells
      .filter((oc) => {
        const existing = existingMap.get(`${oc.x},${oc.y}`);
        return !existing || existing !== oc.color;
      })
      .map((oc) => ({
        x: oc.x,
        y: oc.y,
        color: oc.color || "#38bdf8",
        role: "amp-recommendation",
        label: `${record?.summary || ampId}`,
      }));

    return {
      ampId,
      ampName: record?.summary || ampId,
      cells: hintCells,
      hintCount: hintCells.length,
      summary: `${record?.summary || ampId}: ${hintCells.length} hint pixels recommended.`,
      baseChecksum: snapshot?.checksum || "",
    };
  } catch (error) {
    // If generic execution fails, return friendly error hint
    return {
      ampId,
      ampName: record?.summary || ampId,
      cells: [],
      hintCount: 0,
      summary: `Unable to project hints: ${error.message}`,
      baseChecksum: snapshot?.checksum || "",
    };
  }
}

export function isGhostLayerStale(ghostLayer, currentChecksum) {
  if (!ghostLayer || !ghostLayer.baseChecksum) return false;
  return ghostLayer.baseChecksum !== currentChecksum;
}
