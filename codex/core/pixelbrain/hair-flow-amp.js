/**
 * HairFlowAMP - Generates deterministic rasterized hair clumps and strands
 */

// Simple seeded RNG for deterministic results
function seededRng(seedStr) {
  let h = 0xdeadbeef;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 2654435761);
  }
  return function() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

function hash2i(x, y, seed) {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function valueNoise2D(x, y, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep(x - x0);
  const ty = smoothstep(y - y0);

  const a = hash2i(x0, y0, seed);
  const b = hash2i(x0 + 1, y0, seed);
  const c = hash2i(x0, y0 + 1, seed);
  const d = hash2i(x0 + 1, y0 + 1, seed);

  const ab = a + (b - a) * tx;
  const cd = c + (d - c) * tx;
  return ab + (cd - ab) * ty;
}

function fbm2D(x, y, seed, octaves = 3) {
  let value = 0;
  let amp = 0.5;
  let freq = 1;

  for (let i = 0; i < octaves; i++) {
    value += valueNoise2D(x * freq, y * freq, seed + i * 1013) * amp;
    freq *= 2;
    amp *= 0.5;
  }

  return value;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function normalizeHairFlowConfig(config) {
  return {
    partId: config.partId ?? 'hair_flow',
    material: config.material ?? 'hair_red',
    canvas: config.canvas ?? { w: 96, h: 96 },

    origin: config.origin ?? { x: 48, y: 24 },
    flow: config.flow ?? { dx: 1, dy: -0.25 },
    gravity: config.gravity ?? { dx: 0.05, dy: 0.12 },

    length: Math.max(1, config.length ?? 32),
    width: Math.max(1, config.width ?? 24),
    clumpCount: Math.max(1, config.clumpCount ?? 12),

    taper: Math.max(0, Math.min(1, config.taper ?? 0.85)),
    curl: config.curl ?? 0.2,
    chaos: Math.max(0, config.chaos ?? 0.08),

    noise: {
      scale: config.noise?.scale ?? 0.08,
      strength: config.noise?.strength ?? 0.65,
      octaves: config.noise?.octaves ?? 3
    },

    scattering: {
      light: config.scattering?.light ?? { x: -0.45, y: -0.9 },
      strength: config.scattering?.strength ?? 0.55,
      rim: config.scattering?.rim ?? 0.35
    },

    paletteRoles: {
      shadow: config.paletteRoles?.shadow ?? 'hairShadow',
      body: config.paletteRoles?.body ?? 'hairBody',
      bright: config.paletteRoles?.bright ?? 'hairBright',
      hot: config.paletteRoles?.hot ?? 'hairHot'
    },

    seed: String(config.seed ?? 'hair-flow-default')
  };
}

function buildHairGroups(config, rng) {
  const groups = [];
  for (let i = 0; i < config.clumpCount; i++) {
    const t = config.clumpCount === 1 ? 0.5 : i / (config.clumpCount - 1);
    const spread = (t - 0.5) * config.width;

    const rootX = config.origin.x + spread * 0.28 + (rng() - 0.5) * 2;
    const rootY = config.origin.y + Math.sin(t * Math.PI) * 4 + (rng() - 0.5) * 3;

    groups.push({
      id: `group_${i}`,
      x: rootX,
      y: rootY,
      t,
      length: config.length * (0.65 + rng() * 0.55),
      width: lerp(2, 6, rng()),
      phase: rng() * Math.PI * 2,
      groupBias: i
    });
  }
  return groups;
}

function traceGroupSpine(group, config, seedInt) {
  const points = [];
  let x = group.x;
  let y = group.y;

  let dx = config.flow.dx;
  let dy = config.flow.dy;

  const steps = Math.floor(group.length);

  for (let step = 0; step < steps; step++) {
    const t = step / Math.max(1, steps - 1);
    points.push({ x: Math.round(x), y: Math.round(y), t, step });

    const n = fbm2D(
      x * config.noise.scale,
      y * config.noise.scale,
      // Shared bias per group for cohesive locks
      seedInt + group.groupBias * 97,
      config.noise.octaves
    );

    const angle = (n - 0.5) * config.noise.strength + Math.sin(t * Math.PI + group.phase) * config.curl * 0.08;

    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const vx = dx * cos - dy * sin;
    const vy = dx * sin + dy * cos;

    dx = vx + config.gravity.dx * t;
    dy = vy + config.gravity.dy * t;

    const mag = Math.sqrt(dx * dx + dy * dy) || 1;
    dx = dx / mag;
    dy = dy / mag;

    x += dx * 1.35;
    y += dy * 1.35;
  }

  return points;
}

function computeSpineNormals(spine) {
  for (let i = 0; i < spine.length; i++) {
    const pt = spine[i];
    const prev = spine[Math.max(0, i - 1)];
    const next = spine[Math.min(spine.length - 1, i + 1)];

    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const mag = Math.sqrt(tx * tx + ty * ty) || 1;

    pt.tx = tx / mag;
    pt.ty = ty / mag;
    pt.px = -ty / mag;
    pt.py = tx / mag;
  }
}

function rasterizeTaperedRibbon(spine, maxWidth, taper) {
  const ribbonPixels = [];
  for (let i = 0; i < spine.length; i++) {
    const pt = spine[i];
    const currentWidth = Math.max(1, maxWidth * (1 - pt.t * taper));
    const half = Math.floor(currentWidth / 2);

    for (let w = -half; w <= half; w++) {
      ribbonPixels.push({
        x: Math.round(pt.x + pt.px * w),
        y: Math.round(pt.y + pt.py * w),
        step: pt.step,
        t: pt.t,
        w: half === 0 ? 0 : w / half,
        tx: pt.tx,
        ty: pt.ty
      });
    }
  }
  return ribbonPixels;
}

function shadeHairGroup(ribbon, config, rng) {
  const highlightPhase = rng();
  
  return ribbon.map(p => {
    let color = config.paletteRoles.body;
    
    // Group volume shading
    if (p.w > 0.3) {
      color = config.paletteRoles.shadow; 
    }
    
    // Anisotropic scattering on the ribbon
    const lx = config.scattering.light.x;
    const ly = config.scattering.light.y;
    const lmag = Math.sqrt(lx * lx + ly * ly) || 1;
    
    const dot = (p.tx * lx + p.ty * ly) / lmag;
    const glint = Math.abs(dot);
    
    const inReadableMiddle = p.t > 0.12 && p.t < 0.75;
    const brokenRhythm = ((p.step + Math.floor(highlightPhase * 7)) % 4) !== 0;

    // Apply scattering highlights primarily to the upper edge/body of the ribbon
    if (p.w <= 0.1 && glint > 0.82 && inReadableMiddle && brokenRhythm && rng() > 0.45) {
      color = config.paletteRoles.bright;
    }
    
    // Core shadows for strands pointing away from light
    if (dot < -0.25) {
      color = config.paletteRoles.shadow;
    }
    
    // Hot tips
    if (p.t > 0.92) {
      color = config.paletteRoles.hot;
    }

    return { x: p.x, y: p.y, colorAlias: color };
  });
}

function emitTipPixels(spine, roles, rng) {
  const tips = [];
  if (spine.length > 0) {
    const tip = spine[spine.length - 1];
    
    // Scatter sparks along the forward tangent
    if (rng() > 0.5) {
      tips.push({ 
        x: Math.round(tip.x + tip.tx * 1.5), 
        y: Math.round(tip.y + tip.ty * 1.5), 
        colorAlias: roles.hot 
      });
    }
    if (rng() > 0.7) {
      tips.push({ 
        x: Math.round(tip.x + tip.tx * 3 + (rng() - 0.5)), 
        y: Math.round(tip.y + tip.ty * 3 + (rng() - 0.5)), 
        colorAlias: roles.hot 
      });
    }
  }
  return tips;
}

function clipCellsToCanvas(cells, canvas) {
  return cells.filter(cell =>
    cell.x >= 0 &&
    cell.y >= 0 &&
    cell.x < canvas.w &&
    cell.y < canvas.h
  );
}

function dedupePainterOrder(cells) {
  const map = new Map();
  for (const cell of cells) {
    map.set(`${cell.x},${cell.y}`, cell);
  }
  return Array.from(map.values());
}

export function generateHairFlowCells(config) {
  const safeConfig = normalizeHairFlowConfig(config);
  const rng = seededRng(safeConfig.seed);
  const seedInt = Math.floor(rng() * 0x7fffffff);

  const cells = [];

  // Generate cohesive "groups" or locks of hair steered by the FBM vector field
  const groups = buildHairGroups(safeConfig, rng);
  for (const group of groups) {
    const spine = traceGroupSpine(group, safeConfig, seedInt);
    computeSpineNormals(spine);
    
    const ribbon = rasterizeTaperedRibbon(spine, group.width, safeConfig.taper);
    
    cells.push(...shadeHairGroup(ribbon, safeConfig, rng));
    cells.push(...emitTipPixels(spine, safeConfig.paletteRoles, rng));
  }

  return dedupePainterOrder(
    clipCellsToCanvas(cells, safeConfig.canvas)
  );
}
