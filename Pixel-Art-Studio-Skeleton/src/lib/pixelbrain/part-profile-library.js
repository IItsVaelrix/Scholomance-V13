/**
 * PART PROFILE LIBRARY — parametric archetypes for any item part.
 *
 * A profile is a pure function `(params, options) -> { cells, anchors }` that
 * emits its part's occupancy in a PART-LOCAL coordinate system and declares
 * named attachment points the silhouette-composer can align against a parent.
 *
 * The library is open: callers register new profiles via `registerPartProfile`
 * (used by tests and by future Foundry extensions). Built-in profiles cover
 * every shape the existing scimitar, sword, and amulet scripts emitted.
 *
 * Contract:
 *   cells:   Array<{ x: number, y: number }>  (part-local, integer)
 *   anchors: Object<string, { x: number, y: number }>  (part-local)
 *
 * Profiles MUST be deterministic (no Math.random; the test in item-foundry
 * verifies the QUANT-0101 invariant) and emit only cells within the part's
 * declared width/height. Composers are responsible for connectivity and
 * bridging; profiles are responsible for occupancy and anchor declaration.
 */

import { hashString, GOLDEN_RATIO } from './shared.js';

const REGISTRY = Object.create(null);
const METADATA_REGISTRY = Object.create(null);

export function registerPartProfile(id, profile, metadata = {}) {
  if (typeof id !== 'string' || !id) {
    throw new Error('registerPartProfile: id must be a non-empty string');
  }
  if (typeof profile !== 'function') {
    throw new Error('registerPartProfile: profile must be a function');
  }
  REGISTRY[id] = profile;
  if (Object.keys(metadata).length > 0) {
    METADATA_REGISTRY[id] = metadata;
  }
  return REGISTRY[id];
}

export function getPartProfile(id) {
  const profile = REGISTRY[id];
  if (!profile) {
    throw new Error(`Part profile "${id}" is not registered. Call registerPartProfile() or use a built-in.`);
  }
  return profile;
}

// Per SDF+Noise PDR: profiles may now return a PB-SDF-v1 descriptor (and/or noise) instead of or in addition to imperative cells.
// The profile function can be (params, options) => ({ cells, anchors, sdf: PB_SDF_v1, noise: PB_NOISE_v1 })
// The caller (SDFShapeAMP or factory) is responsible for consuming the descriptor to emit lattice cells.
export function profileSupportsSDF(profileFn) {
  // duck check or convention: if the registered profile mentions sdf in docs or returns object with sdf
  return true; // profiles opt-in by returning the field when called with sdf-aware options
}


export function listPartProfiles() {
  return Object.freeze(Object.keys(REGISTRY));
}

export function getPartProfileMeta(id) {
  return METADATA_REGISTRY[id] ?? null;
}

function roundInt(value) {
  return Math.round(Number(value) || 0);
}

// ── Built-in profiles ──────────────────────────────────────────────────

// BLADE — straight centerline with parametric half-width.
registerPartProfile('blade.straight', (params = {}, options = {}) => {
  const { width, height } = options;
  const span = Array.isArray(params.span) && params.span.length === 2
    ? [roundInt(params.span[0]), roundInt(params.span[1])]
    : [0, Math.max(1, (height || 96) - 1)];
  const cells = [];
  const cx = roundInt(params.cx ?? 0); // straight: cx doesn't curve
  // Anchors must sit on the centerline (cx), matching blade.curved —
  // anchors at x:0 placed attached parts off the blade entirely.
  const anchors = { base: { x: cx, y: span[1] }, tip: { x: cx, y: span[0] } };
  for (let y = span[0]; y <= span[1]; y += 1) {
    const half = pickBladeHalfWidth(y, params);
    for (let dx = -half; dx <= half; dx += 1) cells.push({ x: cx + dx, y });
  }
  return { cells, anchors };
});

// BLADE — curved centerline (scimitar sweep). Half-width follows a yelman
// belly: thin tip → wide belly → narrows back near the guard.
registerPartProfile('blade.curved', (params = {}, options = {}) => {
  const { width, height } = options;
  const cxBase = roundInt(params.cx ?? 0);
  const sweep = Number(params.sweep) || 0;
  const span = Array.isArray(params.span) && params.span.length === 2
    ? [roundInt(params.span[0]), roundInt(params.span[1])]
    : [0, Math.max(1, (height || 96) - 1)];
  const cells = [];
  const anchors = { base: { x: cxBase, y: span[1] }, tip: { x: cxBase, y: span[0] } };
  const spanLen = Math.max(1, span[1] - span[0]);
  for (let y = span[0]; y <= span[1]; y += 1) {
    const t = (span[1] - y) / spanLen;
    const cx = cxBase + Math.round(sweep * options.width * t * t);
    const half = pickBladeHalfWidth(y, params);
    for (let dx = -half; dx <= half; dx += 1) cells.push({ x: cx + dx, y });
  }
  return { cells, anchors };
});

// GUARD — marquise polygon (diamond bezel), centered on (0,0), built in
// part-local Y in [0, height]. Anchors base (top, attach-to-blade) and
// tip (bottom, attach-to-grip).
registerPartProfile('guard.marquise', (params = {}, options = {}) => {
  const profile = params.profile && typeof params.profile === 'object' ? params.profile : null;
  const halfAt = profile
    ? profile
    : { 0: 3, 1: 5, 2: 7, 3: 8, 4: 8, 5: 7, 6: 5, 7: 3 };
  const cx = roundInt(params.cx ?? 0);
  const cells = [];
  const yKeys = Object.keys(halfAt).map((k) => Number(k)).sort((a, b) => a - b);
  for (const y of yKeys) {
    const half = roundInt(halfAt[y]);
    for (let dx = -half; dx <= half; dx += 1) cells.push({ x: cx + dx, y });
  }
  return {
    cells,
    anchors: {
      base: { x: cx, y: yKeys[0] ?? 0 },
      tip: { x: cx, y: yKeys[yKeys.length - 1] ?? 0 },
    },
  };
});

// GUARD — straight crossguard (sword), full width with optional quillons.
registerPartProfile('guard.cross', (params = {}, options = {}) => {
  const width = options.width || 32;
  const cx = roundInt(params.cx ?? width / 2);
  const halfBase = roundInt(params.halfBase ?? Math.floor(width * 0.4));
  const height = roundInt(params.height ?? 6);
  const quillonTip = roundInt(params.quillonTip ?? 1);
  const cells = [];
  for (let y = 0; y < height; y += 1) {
    const isEdge = y === 0 || y === height - 1;
    const half = isEdge ? halfBase - 1 : halfBase;
    for (let dx = -half; dx <= half; dx += 1) cells.push({ x: cx + dx, y });
    if (!isEdge && quillonTip > 0) {
      cells.push({ x: cx - halfBase - 1, y });
      cells.push({ x: cx + halfBase + 1, y });
    }
  }
  return {
    cells,
    anchors: { base: { x: cx, y: 0 }, tip: { x: cx, y: height - 1 } },
  };
});

// GRIP — uniform 3-wide handle with metal rings at top and bottom.
registerPartProfile('grip.uniform', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const half = roundInt(params.half ?? 1);
  const height = roundInt(params.height ?? 18);
  const ringRows = roundInt(params.ringRows ?? 2);
  const cells = [];
  for (let y = 0; y < height; y += 1) {
    const inRing = y < ringRows || y >= height - ringRows;
    const localHalf = inRing ? half + 1 : half;
    for (let dx = -localHalf; dx <= localHalf; dx += 1) cells.push({ x: cx + dx, y });
  }
  return {
    cells,
    anchors: { base: { x: cx, y: 0 }, tip: { x: cx, y: height - 1 } },
  };
});

// GRIP — wrapped handle with periodic flares (scimitar cord wrap).
registerPartProfile('grip.wrapped', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const half = roundInt(params.half ?? 1);
  const height = roundInt(params.height ?? 18);
  const flarePeriod = roundInt(params.flarePeriod ?? 3);
  const cells = [];
  for (let y = 0; y < height; y += 1) {
    for (let dx = -half; dx <= half; dx += 1) cells.push({ x: cx + dx, y });
    if (y % flarePeriod === 0) {
      cells.push({ x: cx - half - 1, y });
      cells.push({ x: cx + half + 1, y });
    }
  }
  return {
    cells,
    anchors: { base: { x: cx, y: 0 }, tip: { x: cx, y: height - 1 } },
  };
});

// POMMEL — symmetric gem polygon. The profile is a per-row half-width map.
registerPartProfile('pommel.gem', (params = {}, options = {}) => {
  const profile = params.profile && typeof params.profile === 'object' ? params.profile : null;
  const halfAt = profile
    ? profile
    : { 0: 1, 1: 2, 2: 3, 3: 4, 4: 4, 5: 4, 6: 3, 7: 2, 8: 1, 9: 1 };
  const cx = roundInt(params.cx ?? 0);
  const cells = [];
  const yKeys = Object.keys(halfAt).map((k) => Number(k)).sort((a, b) => a - b);
  for (const y of yKeys) {
    const half = roundInt(halfAt[y]);
    for (let dx = -half; dx <= half; dx += 1) cells.push({ x: cx + dx, y });
  }
  return {
    cells,
    anchors: { base: { x: cx, y: 0 }, tip: { x: cx, y: yKeys[yKeys.length - 1] ?? 0 } },
  };
});

// POMMEL — round cap with hemicircle profile (rounded bottom).
registerPartProfile('pommel.round', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const radius = roundInt(params.radius ?? 4);
  const cells = [];
  for (let y = 0; y <= radius * 2; y += 1) {
    const ny = (y - radius) / radius;
    const half = Math.max(0, Math.round(radius * Math.sqrt(Math.max(0, 1 - ny * ny))));
    for (let dx = -half; dx <= half; dx += 1) cells.push({ x: cx + dx, y });
  }
  return {
    cells,
    anchors: { base: { x: cx, y: 0 }, tip: { x: cx, y: radius * 2 } },
  };
});

// RING — radial band (closed circle at given radius, hollow).
registerPartProfile('ring.band', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const radius = roundInt(params.radius ?? 8);
  const inner = roundInt(params.inner ?? radius - 2);
  const cells = [];
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= radius && d >= inner) cells.push({ x, y });
    }
  }
  return {
    cells,
    anchors: { center: { x: cx, y: cy }, edge: { x: cx, y: cy - radius } },
  };
});

// SPIKE — radial arm extending from origin to tip at given angle.
registerPartProfile('spike.radial', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const angle = Number(params.angle) || 0;
  const baseR = roundInt(params.baseR ?? 0);
  const tipR = roundInt(params.tipR ?? 10);
  const baseHalfWidth = roundInt(params.baseHalfWidth ?? 2);
  const cells = [];
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  // 3-vertex triangle: two base vertices + tip
  const baseLeftX = Math.round(cx + cosA * baseR - sinA * baseHalfWidth);
  const baseLeftY = Math.round(cy + sinA * baseR + cosA * baseHalfWidth);
  const baseRightX = Math.round(cx + cosA * baseR + sinA * baseHalfWidth);
  const baseRightY = Math.round(cy + sinA * baseR - cosA * baseHalfWidth);
  const tipX = Math.round(cx + cosA * tipR);
  const tipY = Math.round(cy + sinA * tipR);
  // Scanline-fill the triangle in cell space (deterministic, integer-only).
  const minY = Math.min(baseLeftY, baseRightY, tipY);
  const maxY = Math.max(baseLeftY, baseRightY, tipY);
  const edges = [[baseLeftX, baseLeftY, tipX, tipY], [baseRightX, baseRightY, tipX, tipY], [baseLeftX, baseLeftY, baseRightX, baseRightY]];
  for (let y = minY; y <= maxY; y += 1) {
    const xs = [];
    for (const [ax, ay, bx, by] of edges) {
      if ((ay <= y && by > y) || (by <= y && ay > y)) {
        const t = (y - ay) / (by - ay);
        xs.push(ax + t * (bx - ax));
      }
    }
    if (xs.length >= 2) {
      const xL = Math.min(...xs);
      const xR = Math.max(...xs);
      for (let x = Math.ceil(xL); x <= Math.floor(xR); x += 1) cells.push({ x, y });
    }
  }
  return {
    cells,
    anchors: { base: { x: baseLeftX + Math.round((baseRightX - baseLeftX) / 2), y: Math.round((baseLeftY + baseRightY) / 2) }, tip: { x: tipX, y: tipY } },
  };
});

// VIRTUAL — no geometry of its own. Used for parts whose cells are assigned
// by a later stage (e.g. heraldry emblems retag face cells to this part so
// region-fill colors them with the virtual part's material).
registerPartProfile('none', () => ({
  cells: [],
  anchors: { base: { x: 0, y: 0 }, tip: { x: 0, y: 0 }, center: { x: 0, y: 0 } },
}));

// GEM — solid ellipse.
registerPartProfile('gem.ellipse', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const rx = roundInt(params.rx ?? 4);
  const ry = roundInt(params.ry ?? 4);
  const cells = [];
  for (let y = cy - ry; y <= cy + ry; y += 1) {
    for (let x = cx - rx; x <= cx + rx; x += 1) {
      const d = Math.hypot((x - cx) / Math.max(1, rx), (y - cy) / Math.max(1, ry));
      if (d <= 1) cells.push({ x, y });
    }
  }
  return { cells, anchors: { center: { x: cx, y: cy }, base: { x: cx, y: cy } } };
});

// GEM.ROUND
registerPartProfile('gem.round', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const r = roundInt(params.r ?? 6);
  const cells = [];
  for (let y = -r; y <= r; y += 1) {
    for (let x = -r; x <= r; x += 1) {
      if (x*x + y*y <= r*r) cells.push({ x: cx + x, y: cy + y });
    }
  }
  return { cells, anchors: { center: { x: cx, y: cy }, base: { x: cx, y: cy } } };
});

// ORB.SLIME — asymmetrical gooey orb.
registerPartProfile('orb.slime', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const r = roundInt(params.r ?? 8);
  const cells = [];
  for (let y = -r; y <= r; y += 1) {
    for (let x = -r; x <= r; x += 1) {
      if (x*x + y*y <= r*r) {
        // Less perfect circular edge: omit a couple pixels on the top right
        if (x >= r - 1 && y <= -r + 2) continue;
        if (x >= r - 2 && y <= -r + 1) continue;
        // Omit one pixel on the left
        if (x === -r && y === 0) continue;
        
        cells.push({ x: cx + x, y: cy + y });
      }
    }
  }
  // Droopy goo pixels on the bottom right
  cells.push({ x: cx + r - 3, y: cy + r + 1 });
  cells.push({ x: cx + r - 2, y: cy + r + 1 });
  cells.push({ x: cx + r - 2, y: cy + r + 2 });
  
  // Droop on the lower edge
  cells.push({ x: cx, y: cy + r + 1 });
  cells.push({ x: cx, y: cy + r + 2 });
  cells.push({ x: cx + 1, y: cy + r + 1 });
  
  return { cells, anchors: { center: { x: cx, y: cy }, base: { x: cx, y: cy + Math.floor(r * 0.8) } } };
});

function getOrbSlimeCells(r) {
  const cells = [];
  for (let y = -r; y <= r; y += 1) {
    for (let x = -r; x <= r; x += 1) {
      if (x*x + y*y <= r*r) {
        if (x >= r - 1 && y <= -r + 2) continue;
        if (x >= r - 2 && y <= -r + 1) continue;
        if (x === -r && y === 0) continue;
        cells.push({ x, y });
      }
    }
  }
  cells.push({ x: r - 3, y: r + 1 });
  cells.push({ x: r - 2, y: r + 1 });
  cells.push({ x: r - 2, y: r + 2 });
  cells.push({ x: 0, y: r + 1 });
  cells.push({ x: 0, y: r + 2 });
  cells.push({ x: 1, y: r + 1 });
  return cells;
}

registerPartProfile('orb.slime_shadow', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const r = roundInt(params.r ?? 8);
  const cells = [];
  for (const { x, y } of getOrbSlimeCells(r)) {
    let sag = 0;
    if (y > 0) sag = (x / r) * 1.5; 
    const dist = Math.sqrt(x*x + (y - sag)*(y - sag));
    if (x > 0 && y > 0 && dist > r - 3) {
      cells.push({ x: cx + x, y: cy + y });
    }
  }
  return { cells, anchors: { center: { x: cx, y: cy }, base: { x: cx, y: cy + r } } };
});

registerPartProfile('orb.slime_deep_shadow', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const r = roundInt(params.r ?? 8);
  const cells = [];
  for (const { x, y } of getOrbSlimeCells(r)) {
    if (x + y > 10) {
      cells.push({ x: cx + x, y: cy + y });
    }
  }
  return { cells, anchors: { center: { x: cx, y: cy }, base: { x: cx, y: cy + r } } };
});

registerPartProfile('orb.slime_frost', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const r = roundInt(params.r ?? 8);
  const cells = [];
  for (const { x, y } of getOrbSlimeCells(r)) {
    let sag = 0;
    if (y > 0) sag = (x / r) * 1.5; 
    const dist = Math.sqrt(x*x + (y - sag)*(y - sag));
    if (x < -2 && y < 0 && dist > r - 3 && dist <= r) {
      cells.push({ x: cx + x, y: cy + y });
    }
  }
  return { cells, anchors: { center: { x: cx, y: cy }, base: { x: cx, y: cy + r } } };
});

// ORB.RING — thin elliptical halo around the slime orb.
// Slightly squashed vertically (aspect 0.85) so it reads as orbiting rather
// than flat. Cells at elliptical radius (r) to (r+2) in part-local space.
// Distance measured with Y*aspect (squash) matching the test assertion formula.
registerPartProfile('orb.ring', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const r = roundInt(params.r ?? 9);
  const outerR = r + 2;
  const innerR = r + 1;
  const aspect = 0.85; // Y compression — squash Y to create elliptical shape
  const cells = [];
  for (let y = cy - outerR; y <= cy + outerR; y += 1) {
    for (let x = cx - outerR; x <= cx + outerR; x += 1) {
      const d = Math.hypot(x - cx, (y - cy) * aspect);
      if (d >= innerR && d <= outerR) {
        // Upper-left quadrant highlight break (makes it read as a 3D ring)
        if (x - cx < -1 && y - cy < -1) continue;
        cells.push({ x, y });
      }
    }
  }
  return { cells, anchors: { base: { x: cx, y: cy }, center: { x: cx, y: cy } } };
});

// ORB.PERFECT — mathematically pure circle, no asymmetric drips or missing pixels.
registerPartProfile('orb.perfect', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const r = roundInt(params.r ?? 9);
  const cells = [];
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r) cells.push({ x: cx + x, y: cy + y });
    }
  }
  return { cells, anchors: { center: { x: cx, y: cy }, base: { x: cx, y: cy + Math.floor(r * 0.8) } } };
});

// ORB.PERFECT_SHADOW — lower-right rim shading of the perfect circle.
registerPartProfile('orb.perfect_shadow', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const r = roundInt(params.r ?? 9);
  const cells = [];
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d <= r && d >= r - 3 && (x > 0 || y > 0)) cells.push({ x: cx + x, y: cy + y });
    }
  }
  return { cells, anchors: { center: { x: cx, y: cy }, base: { x: cx, y: cy + r } } };
});

// ORB.PERFECT_DEEP_SHADOW — bottom-right corner of the perfect circle.
registerPartProfile('orb.perfect_deep_shadow', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const r = roundInt(params.r ?? 9);
  const cells = [];
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r && x + y > Math.floor(r * 0.67)) cells.push({ x: cx + x, y: cy + y });
    }
  }
  return { cells, anchors: { center: { x: cx, y: cy }, base: { x: cx, y: cy + r } } };
});

// ORB.PERFECT_FROST — upper-left rim of the perfect circle.
registerPartProfile('orb.perfect_frost', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const r = roundInt(params.r ?? 9);
  const cells = [];
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d <= r && d >= r - 3 && x < -2 && y < 0) cells.push({ x: cx + x, y: cy + y });
    }
  }
  return { cells, anchors: { center: { x: cx, y: cy }, base: { x: cx, y: cy + r } } };
});

// ORB.CORONA — full symmetric rim band of exact width around a perfect circle.
// All cells at Euclidean dist in [r-width, r]. No gaps, no quadrant breaks.
registerPartProfile('orb.corona', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const r = roundInt(params.r ?? 9);
  const width = roundInt(params.width ?? 2);
  const cells = [];
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const d = Math.sqrt(x * x + y * y);
      if (d <= r && d >= r - width) cells.push({ x: cx + x, y: cy + y });
    }
  }
  return { cells, anchors: { center: { x: cx, y: cy }, base: { x: cx, y: cy } } };
});

// ORB.RING.SYMMETRIC — true elliptical ring, no quadrant gaps, perfectly centered.
registerPartProfile('orb.ring.symmetric', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const r = roundInt(params.r ?? 9);
  const outerR = r + 2;
  const innerR = r + 1;
  const aspect = 0.85;
  const cells = [];
  for (let y = cy - outerR; y <= cy + outerR; y++) {
    for (let x = cx - outerR; x <= cx + outerR; x++) {
      const d = Math.hypot(x - cx, (y - cy) * aspect);
      if (d >= innerR && d <= outerR) cells.push({ x, y });
    }
  }
  return { cells, anchors: { base: { x: cx, y: cy }, center: { x: cx, y: cy } } };
});

// ORB.RING_GLOW — 1px larger bleed layer for the spectral halo.
registerPartProfile('orb.ring_glow', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const r = roundInt(params.r ?? 9);
  const outerR = r + 3;
  const innerR = r + 2;
  const aspect = 0.85;
  const cells = [];
  for (let y = cy - outerR; y <= cy + outerR; y += 1) {
    for (let x = cx - outerR; x <= cx + outerR; x += 1) {
      const d = Math.hypot(x - cx, (y - cy) * aspect);
      if (d >= innerR && d <= outerR) cells.push({ x, y });
    }
  }
  return { cells, anchors: { base: { x: cx, y: cy }, center: { x: cx, y: cy } } };
});

// SHAFT.RUNE_LATTICE — sparse repeating single-pixel rune marks along the
// shaft. Every 8px a 3-cell crosshatch fragment, offset 1px right of center
// so marks read as engravings rather than surface decoration.
registerPartProfile('shaft.rune_lattice', (params = {}, options = {}) => {
  const { height } = options;
  const span = Array.isArray(params.span) && params.span.length === 2
    ? [roundInt(params.span[0]), roundInt(params.span[1])]
    : [0, Math.max(1, (height || 96) - 1)];
  const cx = roundInt(params.cx ?? 0);
  const cells = [];
  const period = 8;
  for (let y = span[0]; y <= span[1]; y += 1) {
    const offset = y - span[0];
    if (offset % period === 0) {
      // Crosshatch: one horizontal tick + one vertical tick, offset +1 from center
      cells.push({ x: cx + 1, y });
      cells.push({ x: cx + 2, y });
      if (y + 1 <= span[1]) cells.push({ x: cx + 1, y: y + 1 });
    }
    if (offset % period === 4) {
      // Alternate: mirror on the left
      cells.push({ x: cx - 1, y });
      cells.push({ x: cx - 2, y });
      if (y + 1 <= span[1]) cells.push({ x: cx - 1, y: y + 1 });
    }
  }
  return {
    cells,
    anchors: { base: { x: cx, y: span[1] }, tip: { x: cx, y: span[0] } },
  };
});

// GUARD.VOID_WINGS — marquise diamond core with jagged asymmetric lateral
// extensions. Left wing is longer than right to signal eldritch asymmetry.
// Anchors: base = top (attach to shaft), tip = bottom (attach to grip).
registerPartProfile('guard.void_wings', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cells = [];

  // Diamond core (same shape as guard.marquise default)
  const coreRows = { 0: 3, 1: 5, 2: 7, 3: 8, 4: 8, 5: 7, 6: 5, 7: 3 };
  const yKeys = Object.keys(coreRows).map(Number).sort((a, b) => a - b);
  for (const y of yKeys) {
    const half = coreRows[y];
    for (let dx = -half; dx <= half; dx += 1) cells.push({ x: cx + dx, y });
  }

  // Left wing — jagged, extends from rows 2–5, longest at row 3 (cx-12)
  const leftWing = {
    2: [-9, -10],
    3: [-9, -10, -11, -12],
    4: [-9, -10, -11],
    5: [-9, -10],
  };
  for (const [row, xs] of Object.entries(leftWing)) {
    for (const x of xs) cells.push({ x: cx + x, y: Number(row) });
  }

  // Right wing — jagged, extends from rows 2–5, longest at row 3 (cx+10)
  const rightWing = {
    2: [9],
    3: [9, 10],
    4: [9],
    5: [9],
  };
  for (const [row, xs] of Object.entries(rightWing)) {
    for (const x of xs) cells.push({ x: cx + x, y: Number(row) });
  }

  return {
    cells,
    anchors: {
      base: { x: cx, y: yKeys[0] },
      tip: { x: cx, y: yKeys[yKeys.length - 1] },
      center: { x: cx, y: 3 },
    },
  };
});

// POMMEL.VOID_ORB — small filled circle; echoes the top orb in miniature.
// No cradle, no outline — sits bare against the grip.
registerPartProfile('pommel.void_orb', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const r = roundInt(params.r ?? 3);
  const cells = [];
  for (let y = -r; y <= r; y += 1) {
    for (let x = -r; x <= r; x += 1) {
      if (x * x + y * y <= r * r) cells.push({ x: cx + x, y: cy + y });
    }
  }
  return {
    cells,
    anchors: {
      base: { x: cx, y: cy - r },
      tip: { x: cx, y: cy + r },
      center: { x: cx, y: cy },
    },
  };
});

// POMMEL.VOID_ORB_GLOW — 1px larger bleed ring for the shadow orb halo.
registerPartProfile('pommel.void_orb_glow', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const r = roundInt(params.r ?? 3) + 1;
  const cells = [];
  for (let y = -r; y <= r; y += 1) {
    for (let x = -r; x <= r; x += 1) {
      if (x * x + y * y <= r * r) cells.push({ x: cx + x, y: cy + y });
    }
  }
  return {
    cells,
    anchors: {
      base: { x: cx, y: cy - r },
      tip: { x: cx, y: cy + r },
      center: { x: cx, y: cy },
    },
  };
});

// HIGHLIGHT.BLOB — internal slime reflection/crescent
registerPartProfile('highlight.blob', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const cells = [
    // Pale green shine blob on the upper-left
    { x: cx - 4, y: cy - 3 }, { x: cx - 3, y: cy - 4 },
    { x: cx - 2, y: cy - 5 }, { x: cx - 1, y: cy - 5 },
    { x: cx - 3, y: cy - 3 }, { x: cx - 2, y: cy - 4 },
    { x: cx - 1, y: cy - 4 }
  ];
  return { cells, anchors: { center: { x: cx, y: cy }, base: { x: cx, y: cy } } };
});

// BUBBLE.TINY
registerPartProfile('bubble.tiny', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const cells = [
    { x: cx + 2, y: cy + 1 }, { x: cx + 3, y: cy + 1 },
    { x: cx + 2, y: cy + 2 }, { x: cx + 3, y: cy + 2 }
  ];
  return { cells, anchors: { center: { x: cx, y: cy }, base: { x: cx, y: cy } } };
});

// SLIME.RIBBON — thin gooey ribbon wrapping a staff shaft
registerPartProfile('slime.ribbon', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const length = roundInt(params.length ?? 40);
  const cells = [];
  
  // Base coating at the top
  for(let x=-2; x<=2; x++) {
    cells.push({ x: cx + x, y: 0 });
    cells.push({ x: cx + x, y: 1 });
  }
  cells.push({ x: cx - 1, y: 2 });
  cells.push({ x: cx + 1, y: 2 });

  // --- Left Drip ---
  // Long main drip
  for (let y = 4; y <= 30; y++) cells.push({ x: cx - 2, y });
  // Weight where it meets the shaft
  cells.push({ x: cx - 3, y: 4 });
  cells.push({ x: cx - 3, y: 5 });
  cells.push({ x: cx - 1, y: 4 });
  cells.push({ x: cx - 1, y: 5 });
  cells.push({ x: cx - 1, y: 6 });
  cells.push({ x: cx, y: 4 });

  // Bulb // Extra thickness near top
  for(let y=2; y<=6; y++) {
    cells.push({ x: cx - 1, y });
  }
  // Bulb
  cells.push({ x: cx - 3, y: 20 });
  cells.push({ x: cx - 2, y: 20 });
  cells.push({ x: cx - 1, y: 20 });
  cells.push({ x: cx - 2, y: 21 });

  // --- Middle Drip ---
  for(let y=2; y<=11; y++) {
    cells.push({ x: cx, y });
  }
  // Bulb
  cells.push({ x: cx - 1, y: 12 });
  cells.push({ x: cx, y: 12 });
  cells.push({ x: cx + 1, y: 12 });
  cells.push({ x: cx, y: 13 });

  // --- Right Drip ---
  for(let y=2; y<=7; y++) {
    cells.push({ x: cx + 2, y });
  }
  // Bulb
  cells.push({ x: cx + 1, y: 8 });
  cells.push({ x: cx + 2, y: 8 });
  cells.push({ x: cx + 3, y: 8 });
  cells.push({ x: cx + 2, y: 9 });

  return { cells, anchors: { center: { x: cx, y: Math.floor(length / 2) }, base: { x: cx, y: 0 } } };
});

// RIBBON.HIGHLIGHT
registerPartProfile('ribbon.highlight', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const length = roundInt(params.length ?? 40);
  const cells = [];
  
  // Left bulb highlight
  cells.push({ x: cx - 3, y: 20 });
  // Middle bulb highlight
  cells.push({ x: cx - 1, y: 12 });
  // Right bulb highlight
  cells.push({ x: cx + 1, y: 8 });

  return { cells, anchors: { center: { x: cx, y: Math.floor(length / 2) }, base: { x: cx, y: 0 } } };
});

// RIBBON.SHADOW
registerPartProfile('ribbon.shadow', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const length = roundInt(params.length ?? 40);
  const cells = [];
  
  // Shadow under the base coating
  cells.push({ x: cx - 1, y: 3 });
  cells.push({ x: cx + 1, y: 3 });
  
  // Right side of left bulb
  cells.push({ x: cx - 1, y: 20 });
  // Right side of middle bulb
  cells.push({ x: cx + 1, y: 12 });
  // Right side of right bulb
  cells.push({ x: cx + 3, y: 8 });
  
  return { cells, anchors: { center: { x: cx, y: Math.floor(length / 2) }, base: { x: cx, y: 0 } } };
});

// SETTING.CRADLE_HIGHLIGHT
registerPartProfile('setting.cradle_highlight', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const r = roundInt(params.r ?? 10);
  const cells = [];
  
  // 1 bright pixel on each side arm
  cells.push({ x: cx - r, y: cy + 2 });
  cells.push({ x: cx + r, y: cy + 2 });
  
  // A small band directly under the orb (y = cy + r)
  for (let x = -2; x <= 2; x += 1) {
    cells.push({ x: cx + x, y: cy + r });
    if (x >= -1 && x <= 1) cells.push({ x: cx + x, y: cy + r + 1 });
  }
  
  return { cells, anchors: { center: { x: cx, y: cy }, base: { x: cx, y: cy + 7 } } };
});

// GUARD.HIGHLIGHT
registerPartProfile('guard.highlight', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  // Just one bright pixel
  const cells = [{ x: cx - 1, y: cy }];
  return { cells, anchors: { center: { x: cx, y: cy }, base: { x: cx, y: cy } } };
});

// GEM.OVAL
registerPartProfile('gem.oval', (params = {}, options = {}) => {
  return getPartProfile('gem.ellipse')(params, options);
});

// GEM.SQUARE
registerPartProfile('gem.square', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const size = roundInt(params.size ?? 6);
  const cells = [];
  for (let y = -size; y <= size; y += 1) {
    for (let x = -size; x <= size; x += 1) {
      cells.push({ x: cx + x, y: cy + y });
    }
  }
  return { cells, anchors: { center: { x: cx, y: cy }, base: { x: cx, y: cy } } };
});

// CORE.MOUNT
registerPartProfile('core.mount', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const cells = [];
  for (let x = -5; x <= 5; x++) {
    for (let y = -5; y <= 5; y++) {
      if (Math.abs(x) === 5 && Math.abs(y) >= 4) continue;
      if (Math.abs(y) === 5 && Math.abs(x) >= 4) continue;
      if (Math.abs(x) + Math.abs(y) <= 4) continue;
      cells.push({ x: cx + x, y: cy + y });
    }
  }
  return { cells, anchors: { center: { x: cx, y: cy }, base: { x: cx, y: cy } } };
});

// CORE.MOUNT_SHADOW
registerPartProfile('core.mount_shadow', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const cells = [];
  for (let x = -5; x <= 5; x++) {
    for (let y = -5; y <= 5; y++) {
      if (Math.abs(x) === 5 && Math.abs(y) >= 4) continue;
      if (Math.abs(y) === 5 && Math.abs(x) >= 4) continue;
      if (Math.abs(x) + Math.abs(y) <= 4) continue;
      
      const isOuterShadow = (x >= 2 && y >= -1) || (y >= 2 && x >= -1);
      const isInnerShadow = (x <= 0 && y <= 0 && (Math.abs(x) + Math.abs(y) === 5));
      if (isOuterShadow || isInnerShadow) {
        cells.push({ x: cx + x, y: cy + y });
      }
    }
  }
  return { cells, anchors: { center: { x: cx, y: cy }, base: { x: cx, y: cy } } };
});

// CORE.MOUNT_HIGHLIGHT
registerPartProfile('core.mount_highlight', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const cells = [];
  cells.push({ x: cx - 4, y: cy - 3 });
  cells.push({ x: cx - 3, y: cy - 4 });
  cells.push({ x: cx - 4, y: cy - 4 });
  cells.push({ x: cx - 5, y: cy - 2 });
  cells.push({ x: cx - 2, y: cy - 5 });
  
  cells.push({ x: cx + 1, y: cy + 4 });
  cells.push({ x: cx + 2, y: cy + 3 });
  cells.push({ x: cx + 3, y: cy + 2 });
  cells.push({ x: cx + 4, y: cy + 1 });
  return { cells, anchors: { center: { x: cx, y: cy }, base: { x: cx, y: cy } } };
});

// CORE.GEM
registerPartProfile('core.gem', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const cells = [];
  for (let x = -3; x <= 3; x++) {
    for (let y = -3; y <= 3; y++) {
      if (Math.abs(x) + Math.abs(y) <= 4) {
        cells.push({ x: cx + x, y: cy + y });
      }
    }
  }
  return { cells, anchors: { center: { x: cx, y: cy }, base: { x: cx, y: cy } } };
});

// CORE.GEM_HIGHLIGHT
registerPartProfile('core.gem_highlight', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const cells = [{ x: cx - 1, y: cy - 1 }, { x: cx, y: cy - 1 }, { x: cx - 1, y: cy }];
  return { cells, anchors: { center: { x: cx, y: cy }, base: { x: cx, y: cy } } };
});

// CORE.GEM_SHADOW
registerPartProfile('core.gem_shadow', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const cells = [];
  for (let x = 0; x <= 3; x++) {
    for (let y = 0; y <= 3; y++) {
      if (x + y >= 2 && x + y <= 4) {
        cells.push({ x: cx + x, y: cy + y });
      }
    }
  }
  return { cells, anchors: { center: { x: cx, y: cy }, base: { x: cx, y: cy } } };
});

// GEM.EMERALD-CUT
registerPartProfile('gem.emerald-cut', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const rx = roundInt(params.rx ?? 4);
  const ry = roundInt(params.ry ?? 6);
  const corner = roundInt(params.corner ?? 2);
  const cells = [];
  for (let y = -ry; y <= ry; y += 1) {
    for (let x = -rx; x <= rx; x += 1) {
      if (Math.abs(x) + Math.abs(y) <= (rx + ry - corner)) {
         cells.push({ x: cx + x, y: cy + y });
      }
    }
  }
  return { cells, anchors: { center: { x: cx, y: cy }, base: { x: cx, y: cy } } };
});

// FRAME.OVAL
registerPartProfile('frame.oval', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? (options.width ? options.width / 2 : 0));
  const cy = roundInt(params.cy ?? (options.height ? options.height / 2 : 0));
  const rx = roundInt(params.rx ?? 26);
  const ry = roundInt(params.ry ?? 28);
  const cells = [];
  for (let y = -ry; y <= ry; y += 1) {
    for (let x = -rx; x <= rx; x += 1) {
      if (Math.hypot(x / Math.max(1, rx), y / Math.max(1, ry)) <= 1) {
        cells.push({ x: cx + x, y: cy + y });
      }
    }
  }
  return { cells, anchors: { center: { x: cx, y: cy }, base: { x: cx, y: cy } } };
});

// BAIL
registerPartProfile('bail', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? (options.width ? options.width / 2 : 0));
  const cy = roundInt(params.y ?? 14);
  const rOuter = roundInt(params.rOuter ?? 11);
  const rInner = roundInt(params.rInner ?? 8);
  const cells = [];
  for (let y = cy - rOuter; y <= cy + rOuter; y += 1) {
    for (let x = cx - rOuter; x <= cx + rOuter; x += 1) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= rOuter && d >= rInner) cells.push({ x, y });
    }
  }
  return { cells, anchors: { center: { x: cx, y: cy }, base: { x: cx, y: cy + rOuter } } };
});

// SPIRE
registerPartProfile('spire', (params = {}, options = {}) => {
  return getPartProfile('spike.radial')(params, options);
});

// BAND
registerPartProfile('band', (params = {}, options = {}) => {
  return getPartProfile('ring.band')(params, options);
});

// CHAIN.LINK
registerPartProfile('chain.link', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const rOuter = roundInt(params.rOuter ?? 4);
  const rInner = roundInt(params.rInner ?? 2);
  const cells = [];
  for (let y = cy - rOuter; y <= cy + rOuter; y += 1) {
    for (let x = cx - rOuter; x <= cx + rOuter; x += 1) {
      const d = Math.hypot(x - cx, y - cy);
      if (d <= rOuter && d >= rInner) cells.push({ x, y });
    }
  }
  return { cells, anchors: { center: { x: cx, y: cy }, top: { x: cx, y: cy - rOuter }, bottom: { x: cx, y: cy + rOuter }, base: { x: cx, y: cy - rOuter } } };
});

// SETTING.PRONG and SETTING.BEZEL
// SETTING.CRADLE — a U-shaped prong or cradle holding an orb
registerPartProfile('setting.cradle', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const r = roundInt(params.r ?? 10);
  const cells = [];
  
  // Draw an arc from bottom (y=r) up to the sides (y=0)
  for (let x = -r; x <= r; x += 1) {
    for (let y = -2; y <= r + 1; y += 1) {
      const distSq = x*x + y*y;
      // Hollow arc
      if (distSq >= (r-2)*(r-2) && distSq <= r*r) {
        cells.push({ x: cx + x, y: cy + y });
      }
    }
  }
  
  // Base to connect to the shaft
  cells.push({ x: cx - 2, y: cy + r + 1 });
  cells.push({ x: cx - 1, y: cy + r + 1 });
  cells.push({ x: cx, y: cy + r + 1 });
  cells.push({ x: cx + 1, y: cy + r + 1 });
  cells.push({ x: cx + 2, y: cy + r + 1 });
  cells.push({ x: cx - 1, y: cy + r + 2 });
  cells.push({ x: cx, y: cy + r + 2 });
  cells.push({ x: cx + 1, y: cy + r + 2 });
  cells.push({ x: cx, y: cy + r + 3 });
  
  return { cells, anchors: { center: { x: cx, y: cy }, tip: { x: cx, y: cy - r }, base: { x: cx, y: cy + 7 } } };
});

registerPartProfile('setting.prong', (params, options) => getPartProfile('none')(params, options));
registerPartProfile('setting.bezel', (params, options) => getPartProfile('none')(params, options));

// STAFF SHAFT — straight uniform cylinder.
registerPartProfile('staff.shaft', (params = {}, options = {}) => {
  const { height } = options;
  const span = Array.isArray(params.span) && params.span.length === 2
    ? [roundInt(params.span[0]), roundInt(params.span[1])]
    : [0, Math.max(1, (height || 96) - 1)];
  const cx = roundInt(params.cx ?? 0);
  const half = roundInt(params.half ?? 2);
  const cells = [];
  for (let y = span[0]; y <= span[1]; y += 1) {
    for (let dx = -half; dx <= half; dx += 1) cells.push({ x: cx + dx, y });
  }
  return { cells, anchors: { center: { x: cx, y: span[0] + Math.floor((span[1] - span[0]) / 2) }, tip: { x: cx, y: span[0] }, base: { x: cx, y: span[1] } } };
});

// STAFF.HANDLE
registerPartProfile('staff.handle', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const length = roundInt(params.length ?? 20);
  const half = roundInt(params.half ?? 2);
  const cells = [];
  for (let y = 0; y <= length; y += 1) {
    for (let x = -half; x <= half; x += 1) {
      cells.push({ x: cx + x, y: cy + y });
    }
  }
  // base is top (attachment point), tip is bottom
  return { cells, anchors: { center: { x: cx, y: cy + Math.floor(length / 2) }, base: { x: cx, y: cy + 1 }, tip: { x: cx, y: cy + length } } };
});

// STAFF.HANDLE_TRIM
registerPartProfile('staff.handle_trim', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const length = roundInt(params.length ?? 20);
  const half = roundInt(params.half ?? 2); 
  const cells = [];
  for(let x=-half-1; x<=half+1; x++) cells.push({ x: cx + x, y: cy + 1 });
  for(let x=-half-1; x<=half+1; x++) cells.push({ x: cx + x, y: cy + length - 1 });
  const midY = cy + Math.floor(length/2);
  cells.push({ x: cx, y: midY - 2 });
  cells.push({ x: cx - 1, y: midY - 1 });
  cells.push({ x: cx, y: midY - 1 });
  cells.push({ x: cx + 1, y: midY - 1 });
  cells.push({ x: cx - 2, y: midY });
  cells.push({ x: cx - 1, y: midY });
  cells.push({ x: cx, y: midY });
  cells.push({ x: cx + 1, y: midY });
  cells.push({ x: cx + 2, y: midY });
  cells.push({ x: cx - 1, y: midY + 1 });
  cells.push({ x: cx, y: midY + 1 });
  cells.push({ x: cx + 1, y: midY + 1 });
  cells.push({ x: cx, y: midY + 2 });
  return { cells, anchors: { center: { x: cx, y: midY }, base: { x: cx, y: cy + 1 }, tip: { x: cx, y: cy + length } } };
});

// CYLINDER.SHADOW
registerPartProfile('cylinder.shadow', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const length = roundInt(params.length ?? 60);
  const half = roundInt(params.half ?? 2);
  const cells = [];
  for (let y = 0; y <= length; y += 1) cells.push({ x: cx + half, y }); 
  return { cells, anchors: { base: { x: cx, y: length + 1 }, tip: { x: cx, y: 0 } } };
});

// CYLINDER.HIGHLIGHT
registerPartProfile('cylinder.highlight', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const length = roundInt(params.length ?? 60);
  const half = roundInt(params.half ?? 2);
  const cells = [];
  for (let y = 0; y <= length; y += 1) cells.push({ x: cx - half, y }); 
  return { cells, anchors: { base: { x: cx, y: length + 1 }, tip: { x: cx, y: 0 } } };
});

// STAFF.POMMEL
registerPartProfile('staff.pommel', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const r = roundInt(params.r ?? 3);
  const cells = [];
  cells.push({ x: cx, y: cy });
  for(let x=-1; x<=1; x++) cells.push({ x: cx+x, y: cy+1 });
  for(let x=-2; x<=2; x++) cells.push({ x: cx+x, y: cy+2 });
  for(let x=-1; x<=1; x++) cells.push({ x: cx+x, y: cy+3 });
  cells.push({ x: cx, y: cy+4 });
  return { cells, anchors: { base: { x: cx, y: cy + 1 }, tip: { x: cx, y: cy + 4 } } };
});

// ── Helpers ────────────────────────────────────────────────────────────

function pickBladeHalfWidth(canvasY, params) {
  if (typeof params.halfWidthAt === 'function') return roundInt(params.halfWidthAt(canvasY));
  // Default scimitar profile, expressed in canvas-y coordinates (matches
  // the scimitar's bladeHalfWidth(y) exactly so the byte-identical
  // reproduction bar holds). Spec authors can pass `halfWidthAt` for any
  // other blade shape.
  const y = roundInt(canvasY);
  if (y <= 1) return 0;
  if (y <= 4) return 1;
  if (y <= 12) return 2;
  if (y <= 15) return 3;
  if (y <= 24) return roundInt(params.belly ?? 4);
  if (y <= 45) return 3;
  return 2;
}

// ── Deterministic jitter (used by motif-engraver) ──────────────────────

export function seededJitter(seed, segment, magnitude) {
  // Stable 2D hash → [-magnitude, +magnitude] offset, NO Math.random.
  const h = hashString(`${seed}::${segment}`);
  const norm = (h / 0xffffffff) - 0.5;
  return norm * 2 * magnitude;
}

// ── ARMOR / CHESTPLATE PROFILES (ChestplateAMP) ──────────────────────────
// Added per ChestplateAMP PDR. All deterministic, return {cells, anchors}.

registerPartProfile('armor.chestplate.classic', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const shoulderW = roundInt(params.shoulderWidth ?? 50);
  const waistW = roundInt(params.waistWidth ?? 26);
  const h = roundInt(params.torsoHeight ?? 58);
  const neckW = roundInt(params.neckWidth ?? 12);
  const neckD = roundInt(params.neckDepth ?? 7);

  const cells = [];
  for (let y = 0; y < h; y += 1) {
    const t = y / Math.max(1, h - 1);
    let half = Math.round(shoulderW / 2 * (1 - t * 0.55) + waistW / 2 * t);
    half = Math.max(4, half);
    const isNeckZone = y < neckD;
    const nHalf = Math.floor(neckW / 2);
    for (let dx = -half; dx <= half; dx += 1) {
      if (isNeckZone && Math.abs(dx) <= nHalf) continue;
      cells.push({ x: cx + dx, y });
    }
  }

  return {
    cells,
    anchors: {
      top: { x: cx, y: 0 },
      centerChest: { x: cx, y: Math.floor(h * 0.38) },
      leftShoulder: { x: cx - Math.floor(shoulderW * 0.36), y: Math.floor(h * 0.1) },
      rightShoulder: { x: cx + Math.floor(shoulderW * 0.36), y: Math.floor(h * 0.1) },
      waist: { x: cx, y: h - 4 },
      bottom: { x: cx, y: h - 1 },
    },
  };
});

registerPartProfile('armor.chestplate.angular', (params = {}, options = {}) => {
  const base = getPartProfile('armor.chestplate.classic')(params, options);
  const cx = roundInt(params.cx ?? 0);
  const extra = roundInt(params.shoulderExtra ?? 5);
  const added = [];
  base.cells.forEach((c) => {
    if (c.y < 14) {
      added.push({ x: c.x - extra, y: c.y });
      added.push({ x: c.x + extra, y: c.y });
    }
  });
  return { cells: [...base.cells, ...added], anchors: base.anchors };
});

registerPartProfile('armor.chestplate.void_royal', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? Math.floor((options.canvas?.width ?? options.width ?? 64) / 2));
  const halfAt = params.halfAt || {
    8: 18, 9: 22, 10: 24, 11: 25, 12: 25, 13: 24,
    14: 23, 15: 22, 16: 21, 17: 20, 18: 20, 19: 19,
    20: 18, 21: 18, 22: 17, 23: 17, 24: 16, 25: 16,
    26: 15, 27: 15, 28: 15, 29: 14, 30: 14, 31: 14,
    32: 13, 33: 13, 34: 12, 35: 12, 36: 12, 37: 13,
    38: 14, 39: 14, 40: 15, 41: 15, 42: 14, 43: 13,
    44: 12, 45: 10,
  };
  const neckCut = params.neckCut || {
    8: 7, 9: 6, 10: 5, 11: 4,
  };
  const cells = [];
  for (const [yKey, halfRaw] of Object.entries(halfAt)) {
    const y = roundInt(yKey);
    const half = roundInt(halfRaw);
    const cut = neckCut[yKey];
    for (let dx = -half; dx <= half; dx += 1) {
      if (cut !== undefined && Math.abs(dx) <= roundInt(cut)) continue;
      cells.push({ x: cx + dx, y });
    }
  }
  return {
    cells,
    anchors: {
      top: { x: cx, y: 8 },
      base: { x: cx, y: 45 },
      centerChest: { x: cx, y: 25 },
      leftShoulder: { x: cx - 22, y: 12 },
      rightShoulder: { x: cx + 22, y: 12 },
      safeZoneCenter: { x: cx, y: 25 },
      safeZoneUpperLower: { x: cx, y: 31 },
      waist: { x: cx, y: 36 },
      bottom: { x: cx, y: 45 },
    },
  };
});

registerPartProfile('armor.chestplate.void_royal_human', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? Math.floor((options.canvas?.width ?? options.width ?? 64) / 2));

  // Emergent boon: when harmonic sketch is available via options.constructionHints,
  // profiles can derive proportions from golden/fib + symmetry instead of pure hand tuning.
  const harmonic = options?.constructionHints?.harmonic || params.harmonic || false;
  if (harmonic && options?.harmonicCenter) {
    // Example: bias shoulderWidth toward golden ratio from center for natural harmony
    // (non-destructive; only adjusts if not explicitly overridden)
    if (!params.shoulderWidth) {
      const goldenOffset = Math.round((options.canvas?.width || 64) / GOLDEN_RATIO * 0.7);
      params = { ...params, shoulderWidth: goldenOffset };
    }
  }
  const shoulderWidth = roundInt(params.shoulderWidth ?? 46);
  const chestWidth = roundInt(params.chestWidth ?? 38);
  const waistWidth = roundInt(params.waistWidth ?? 26);
  const torsoHeight = roundInt(params.torsoHeight ?? 58);
  const topY = roundInt(params.topY ?? 8);
  const neckWidth = roundInt(params.neckWidth ?? 12);
  const neckDepth = roundInt(params.neckDepth ?? 7);
  const cells = [];

  for (let y = 0; y < torsoHeight; y += 1) {
    const t = y / Math.max(1, torsoHeight - 1);
    const chestFalloff = t < 0.32 ? t / 0.32 : 1;
    const waistFalloff = Math.max(0, (t - 0.34) / 0.66);
    const topHalf = (shoulderWidth / 2) * (1 - chestFalloff) + (chestWidth / 2) * chestFalloff;
    const half = Math.max(4, Math.round(topHalf * (1 - waistFalloff) + (waistWidth / 2) * waistFalloff));
    const absoluteY = topY + y;
    const neckCutHalf = y < neckDepth ? Math.floor((neckWidth / 2) * (1 - (y / Math.max(1, neckDepth)) * 0.28)) : -1;

    for (let dx = -half; dx <= half; dx += 1) {
      if (neckCutHalf >= 0 && Math.abs(dx) <= neckCutHalf) continue;
      const lowerCornerTrim = y > torsoHeight * 0.78 && Math.abs(dx) > half - Math.round((y - torsoHeight * 0.78) * 0.45);
      if (lowerCornerTrim) continue;
      cells.push({ x: cx + dx, y: absoluteY });
    }
  }

  return {
    cells,
    anchors: {
      top: { x: cx, y: topY },
      base: { x: cx, y: topY + torsoHeight - 1 },
      centerChest: { x: cx, y: topY + Math.floor(torsoHeight * 0.38) },
      leftShoulder: { x: cx - Math.floor(shoulderWidth * 0.36), y: topY + Math.floor(torsoHeight * 0.1) },
      rightShoulder: { x: cx + Math.floor(shoulderWidth * 0.36), y: topY + Math.floor(torsoHeight * 0.1) },
      safeZoneCenter: { x: cx, y: topY + Math.floor(torsoHeight * 0.38) },
      safeZoneUpperLower: { x: cx, y: topY + Math.floor(torsoHeight * 0.52) },
      waist: { x: cx, y: topY + Math.floor(torsoHeight * 0.7) },
      bottom: { x: cx, y: topY + torsoHeight - 1 },
    },
    sdf: {
      contract: 'PB-SDF-v1',
      primitives: [
        {
          type: 'box',
          params: {
            center: { x: cx, y: topY + torsoHeight / 2 },
            size: { x: chestWidth, y: torsoHeight },
          },
        },
      ],
      operations: [],
    },
  };
});

registerPartProfile('armor.pauldron.round', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const r = roundInt(params.r ?? 7);
  const cells = [];
  for (let y = -r; y <= r; y += 1) {
    const hh = Math.round(Math.sqrt(Math.max(0, r * r - y * y)));
    for (let dx = -hh; dx <= hh; dx += 1) cells.push({ x: cx + dx, y: cy + y });
  }
  return {
    cells,
    anchors: {
      base: { x: cx, y: cy + r - 1 },
      outer: { x: cx + r - 1, y: cy },
      leftShoulder: { x: cx, y: cy + r - 1 },
      rightShoulder: { x: cx, y: cy + r - 1 },
    },
    sdf: {
      contract: 'PB-SDF-v1',
      primitives: [{ type: 'circle', params: { center: { x: cx, y: cy }, radius: r } }],
      operations: [],
    },
  };
});

registerPartProfile('armor.pauldron.angular_royal', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const halfAt = params.halfAt || {
    '-4': 4,
    '-3': 7,
    '-2': 10,
    '-1': 12,
    0: 13,
    1: 12,
    2: 11,
    3: 9,
    4: 7,
    5: 4,
  };
  const cells = [];
  for (const [yKey, halfRaw] of Object.entries(halfAt)) {
    const y = roundInt(yKey);
    const half = roundInt(halfRaw);
    for (let dx = -half; dx <= half; dx += 1) {
      const outerBias = params.side === 'right' ? -2 : 2;
      const crown = y <= -2 && Math.sign(dx || outerBias) === Math.sign(outerBias)
        ? Math.min(2, Math.abs(y + 2))
        : 0;
      cells.push({ x: cx + dx + crown * Math.sign(outerBias), y: cy + y });
    }
  }
  const _yKeys = Object.keys(halfAt).map(Number);
  const _sdfMinY = Math.min(..._yKeys), _sdfMaxY = Math.max(..._yKeys);
  const _sdfMaxHalf = Math.max(...Object.values(halfAt).map(Number));
  return {
    cells,
    anchors: {
      base: { x: cx, y: cy + 5 },
      leftShoulder: { x: cx, y: cy + 5 },
      rightShoulder: { x: cx, y: cy + 5 },
      outer: { x: cx + 13, y: cy },
    },
    sdf: {
      contract: 'PB-SDF-v1',
      primitives: [{ type: 'box', params: { center: { x: cx, y: cy + (_sdfMinY + _sdfMaxY) / 2 }, size: { x: _sdfMaxHalf * 2, y: _sdfMaxY - _sdfMinY + 1 } } }],
      operations: [],
    },
  };
});

registerPartProfile('armor.pauldron.angular_human', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const side = params.side === 'right' ? 'right' : 'left';
  const halfAt = params.halfAt || {
    '-3': 3,
    '-2': 5,
    '-1': 7,
    0: 8,
    1: 8,
    2: 7,
    3: 5,
    4: 3,
  };
  const cells = [];
  for (const [yKey, halfRaw] of Object.entries(halfAt)) {
    const y = roundInt(yKey);
    const half = roundInt(halfRaw);
    for (let dx = -half; dx <= half; dx += 1) {
      const outward = side === 'right' ? 1 : -1;
      const shoulderSlope = y < 0 && Math.sign(dx || outward) === outward
        ? Math.min(1, Math.abs(y + 1))
        : 0;
      cells.push({ x: cx + dx + (shoulderSlope * outward), y: cy + y });
    }
  }
  const _yKeys2 = Object.keys(halfAt).map(Number);
  const _sdfMinY2 = Math.min(..._yKeys2), _sdfMaxY2 = Math.max(..._yKeys2);
  const _sdfMaxHalf2 = Math.max(...Object.values(halfAt).map(Number));
  return {
    cells,
    anchors: {
      base: { x: cx, y: cy + 4 },
      leftShoulder: { x: cx, y: cy + 4 },
      rightShoulder: { x: cx, y: cy + 4 },
      outer: { x: cx + (side === 'right' ? 9 : -9), y: cy },
    },
    sdf: {
      contract: 'PB-SDF-v1',
      primitives: [{ type: 'box', params: { center: { x: cx, y: cy + (_sdfMinY2 + _sdfMaxY2) / 2 }, size: { x: _sdfMaxHalf2 * 2, y: _sdfMaxY2 - _sdfMinY2 + 1 } } }],
      operations: [],
    },
  };
});

registerPartProfile('armor.pauldron.void_reference_human', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const side = params.side === 'right' ? 'right' : 'left';
  const outward = side === 'right' ? 1 : -1;
  const halfAt = params.halfAt || {
    '-4': 4,
    '-3': 8,
    '-2': 10,
    '-1': 11,
    0: 12,
    1: 12,
    2: 10,
    3: 8,
    4: 5,
  };
  const cells = [];
  for (const [yKey, halfRaw] of Object.entries(halfAt)) {
    const y = roundInt(yKey);
    const half = roundInt(halfRaw);
    for (let dx = -half; dx <= half; dx += 1) {
      const sweep = y <= -2 && Math.sign(dx || outward) === outward ? 1 : 0;
      const innerCut = y >= 2 && Math.sign(dx || -outward) === -outward && Math.abs(dx) > half - 2;
      if (innerCut) continue;
      cells.push({ x: cx + dx + (sweep * outward), y: cy + y });
    }
  }
  const _yKeys3 = Object.keys(halfAt).map(Number);
  const _sdfMinY3 = Math.min(..._yKeys3), _sdfMaxY3 = Math.max(..._yKeys3);
  const _sdfMaxHalf3 = Math.max(...Object.values(halfAt).map(Number));
  return {
    cells,
    anchors: {
      base: { x: cx, y: cy + 4 },
      leftShoulder: { x: cx, y: cy + 4 },
      rightShoulder: { x: cx, y: cy + 4 },
      outer: { x: cx + (outward * 12), y: cy },
    },
    sdf: {
      contract: 'PB-SDF-v1',
      primitives: [{ type: 'box', params: { center: { x: cx, y: cy + (_sdfMinY3 + _sdfMaxY3) / 2 }, size: { x: _sdfMaxHalf3 * 2, y: _sdfMaxY3 - _sdfMinY3 + 1 } } }],
      operations: [],
    },
  };
});

registerPartProfile('armor.panel.void_reference_mantle', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const cells = [];
  const halfAt = {
    '-9': 16,
    '-8': 18,
    '-7': 19,
    '-6': 19,
    '-5': 18,
    '-4': 17,
    '-3': 15,
    '-2': 13,
    '-1': 13,
    0: 12,
    1: 11,
    2: 10,
  };
  for (const [yKey, halfRaw] of Object.entries(halfAt)) {
    const y = roundInt(yKey);
    const half = roundInt(halfRaw);
    for (let dx = -half; dx <= half; dx += 1) {
      if (y <= -7 && Math.abs(dx) <= 5) continue;
      if (y >= -2 && Math.abs(dx) < 4) continue;
      cells.push({ x: cx + dx, y: cy + y });
    }
  }
  return {
    cells,
    anchors: {
      base: { x: cx, y: cy },
      center: { x: cx, y: cy - 4 },
    },
  };
});

registerPartProfile('armor.panel.void_reference_harness', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const cells = [];
  const halfAt = {
    '-6': 8,
    '-5': 10,
    '-4': 11,
    '-3': 12,
    '-2': 11,
    '-1': 10,
    0: 9,
    1: 8,
    2: 7,
    3: 6,
    4: 5,
    5: 4,
    6: 3,
    7: 2,
  };
  for (const [yKey, halfRaw] of Object.entries(halfAt)) {
    const y = roundInt(yKey);
    const half = roundInt(halfRaw);
    for (let dx = -half; dx <= half; dx += 1) {
      if (Math.abs(dx) + Math.max(0, y - 1) > half + 1) continue;
      cells.push({ x: cx + dx, y: cy + y });
    }
  }
  return {
    cells,
    anchors: {
      base: { x: cx, y: cy },
      center: { x: cx, y: cy - 1 },
    },
  };
});

registerPartProfile('gem.socket.void_reference_top', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const r = roundInt(params.r ?? 4);
  const cells = [];
  for (let y = -r; y <= r; y += 1) {
    for (let x = -r; x <= r; x += 1) {
      if (Math.abs(x) + Math.abs(y) <= r + 1) cells.push({ x: cx + x, y: cy + y });
    }
  }
  // Faceted top gem + small cross accent for solid look
  cells.push({ x: cx, y: cy - r - 1 });
  cells.push({ x: cx - 1, y: cy - r });
  cells.push({ x: cx + 1, y: cy - r });
  return { 
    cells, 
    anchors: { 
      center: { x: cx, y: cy }, 
      base: { x: cx, y: cy },
      top: { x: cx, y: cy - r - 1 }
    } 
  };
});

registerPartProfile('gem.socket.void_reference_drop', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const cells = [];
  const halfAt = {
    '-2': 3,
    '-1': 3,
    0: 2,
    1: 2,
    2: 1,
    3: 1,
    4: 0,
  };
  for (const [yKey, halfRaw] of Object.entries(halfAt)) {
    const y = roundInt(yKey);
    const half = roundInt(halfRaw);
    for (let dx = -half; dx <= half; dx += 1) cells.push({ x: cx + dx, y: cy + y });
  }
  return { cells, anchors: { center: { x: cx, y: cy + 1 }, base: { x: cx, y: cy } } };
});

registerPartProfile('armor.pauldron.spiked', (params = {}, options = {}) => {
  const base = getPartProfile('armor.pauldron.round')(params, options);
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const r = roundInt(params.r ?? 7);
  const spikes = [];
  [-2, 0, 2].forEach((i) => {
    const sy = cy + Math.round(i * 1.8);
    spikes.push({ x: cx + r + 2, y: sy });
    spikes.push({ x: cx + r + 1, y: sy - 1 });
    spikes.push({ x: cx + r + 1, y: sy + 1 });
  });
  return { cells: [...base.cells, ...spikes], anchors: {
    ...base.anchors,
    leftShoulder: base.anchors.base,
    rightShoulder: base.anchors.base,
  } };
});

registerPartProfile('armor.collar.high', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const w = roundInt(params.width ?? 20);
  const h = roundInt(params.height ?? 5);
  const cells = [];
  for (let y = 0; y < h; y += 1) {
    const half = Math.round((w / 2) * (1 - (y / h) * 0.25));
    for (let dx = -half; dx <= half; dx += 1) cells.push({ x: cx + dx, y: cy + y });
  }
  const n = Math.floor(w * 0.22);
  for (let y = 0; y < Math.min(2, h); y += 1) {
    for (let dx = -n; dx <= n; dx += 1) {
      const idx = cells.findIndex((c) => c.x === cx + dx && c.y === cy + y);
      if (idx > -1) cells.splice(idx, 1);
    }
  }
  return { cells, anchors: { base: { x: cx, y: cy + h - 1 }, top: { x: cx, y: cy } } };
});

registerPartProfile('armor.collar.high_void', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const halfAt = params.halfAt || {
    0: 13,
    1: 15,
    2: 16,
    3: 15,
    4: 13,
    5: 10,
  };
  const cells = [];
  for (const [yKey, halfRaw] of Object.entries(halfAt)) {
    const y = roundInt(yKey);
    const half = roundInt(halfRaw);
    const neckCut = y <= 2 ? 5 : 3;
    for (let dx = -half; dx <= half; dx += 1) {
      if (Math.abs(dx) <= neckCut) continue;
      cells.push({ x: cx + dx, y: cy + y });
    }
  }
  return {
    cells,
    anchors: {
      base: { x: cx, y: cy + 5 },
      top: { x: cx, y: cy },
      center: { x: cx, y: cy + 3 },
    },
  };
});

registerPartProfile('gem.socket.diamond', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const r = roundInt(params.r ?? 3);
  const cells = [];
  for (let y = -r; y <= r; y += 1) {
    for (let x = -r; x <= r; x += 1) {
      if (Math.abs(x) + Math.abs(y) <= r + 1) cells.push({ x: cx + x, y: cy + y });
    }
  }
  return { cells, anchors: { center: { x: cx, y: cy }, base: { x: cx, y: cy } } };
});

registerPartProfile('gem.socket.void_orb', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const r = roundInt(params.r ?? 5);
  const height = roundInt(params.height ?? r * 2);
  const cells = [];
  // More solid faceted orb: layered ellipses + center cross for "solid" jewel look (using new deterministic style)
  for (let y = -Math.floor(height/2); y <= Math.floor(height/2); y += 1) {
    const yf = y / (height / 2);
    const xr = Math.round(r * Math.sqrt(1 - yf * yf * 0.7)); // squashed for 3d
    for (let x = -xr; x <= xr; x += 1) {
      const d = Math.hypot(x / xr, yf);
      if (d <= 1.05) {
        cells.push({ x: cx + x, y: cy + y });
      }
    }
  }
  // Add facet highlights (small inner structure for solidity)
  for (let i = -1; i <= 1; i++) {
    cells.push({ x: cx + i, y: cy - 2 });
    cells.push({ x: cx + i, y: cy + 2 });
  }
  return {
    cells,
    anchors: {
      center: { x: cx, y: cy },
      base: { x: cx, y: cy },
      top: { x: cx, y: cy - Math.floor(height/2) },
    },
  };
});

// ── ARCANE / FUTURISTIC UI PROFILES for Mystical HUD (VOID palette: obsidian, indigo, purple, crimson, silver)
// These are small, high-detail pixel frames for MMORPG-style overlay that "breathes" with resonance.
// Use harmonic proportions for natural arcane elegance.
// Generate as small assets, then in Phaser animate for breathing (pulse alpha/scale on glow layers).

registerPartProfile('ui.arcane.frame', (params = {}, options = {}) => {
  const w = roundInt(params.width ?? 128);
  const h = roundInt(params.height ?? 32);
  const thickness = roundInt(params.thickness ?? 4);
  const cx = roundInt(params.cx ?? w / 2);
  const cy = roundInt(params.cy ?? h / 2);
  const cells = [];

  // Outer silver border
  for (let x = 0; x < w; x++) {
    for (let t = 0; t < thickness; t++) {
      cells.push({ x, y: t, color: '#A8A8B8' });
      cells.push({ x, y: h - 1 - t, color: '#A8A8B8' });
    }
  }
  for (let y = 0; y < h; y++) {
    for (let t = 0; t < thickness; t++) {
      cells.push({ x: t, y, color: '#A8A8B8' });
      cells.push({ x: w - 1 - t, y, color: '#A8A8B8' });
    }
  }

  // Inner obsidian fill
  for (let x = thickness; x < w - thickness; x++) {
    for (let y = thickness; y < h - thickness; y++) {
      cells.push({ x, y, color: '#11111A' });
    }
  }

  // Indigo inner bevel
  for (let x = thickness + 1; x < w - thickness - 1; x++) {
    cells.push({ x, y: thickness + 1, color: '#2E2A5A' });
    cells.push({ x, y: h - thickness - 2, color: '#2E2A5A' });
  }
  for (let y = thickness + 1; y < h - thickness - 1; y++) {
    cells.push({ x: thickness + 1, y, color: '#2E2A5A' });
    cells.push({ x: w - thickness - 2, y, color: '#2E2A5A' });
  }

  // Purple glowing inner area (for breathing core)
  const glowW = w - thickness * 3;
  const glowH = h - thickness * 3;
  for (let x = thickness * 1.5; x < w - thickness * 1.5; x++) {
    for (let y = thickness * 1.5; y < h - thickness * 1.5; y++) {
      if ((hashString(`${Math.floor(x)}:${Math.floor(y)}`) / 0xffffffff) < 0.3) {
        cells.push({ x: Math.floor(x), y: Math.floor(y), color: '#4A2C6A' });
      }
    }
  }

  // Crimson accent lines (mystical energy veins)
  for (let i = 0; i < 3; i++) {
    const lx = thickness + 4 + i * 8;
    if (lx < w - thickness - 4) {
      cells.push({ x: lx, y: Math.floor(h / 2), color: '#8B1E3D' });
    }
  }

  // Silver corner runes (arcane sigils)
  const runeColor = '#A8A8B8';
  // Top left rune
  cells.push({ x: 3, y: 3, color: runeColor });
  cells.push({ x: 4, y: 3, color: runeColor });
  cells.push({ x: 3, y: 4, color: runeColor });
  // Similar for other corners (symmetric)
  cells.push({ x: w - 4, y: 3, color: runeColor });
  cells.push({ x: w - 5, y: 3, color: runeColor });
  cells.push({ x: w - 4, y: 4, color: runeColor });

  cells.push({ x: 3, y: h - 4, color: runeColor });
  cells.push({ x: 4, y: h - 4, color: runeColor });
  cells.push({ x: 3, y: h - 5, color: runeColor });

  cells.push({ x: w - 4, y: h - 4, color: runeColor });
  cells.push({ x: w - 5, y: h - 4, color: runeColor });
  cells.push({ x: w - 4, y: h - 5, color: runeColor });

  return {
    cells,
    anchors: {
      center: { x: cx, y: cy },
      topLeft: { x: thickness, y: thickness },
      topRight: { x: w - thickness, y: thickness },
      bottomLeft: { x: thickness, y: h - thickness },
      bottomRight: { x: w - thickness, y: h - thickness },
    },
  };
});

registerPartProfile('ui.hotbar.bar', (params = {}, options = {}) => {
  const w = roundInt(params.width ?? 512);
  const h = roundInt(params.height ?? 80);
  const cx = roundInt(params.cx ?? w / 2);
  const cy = roundInt(params.cy ?? h / 2);
  // Use the frame profile and extend for long bar
  const frame = getPartProfile('ui.arcane.frame')({ width: w, height: h, thickness: 6 }, options);
  // Add horizontal energy lines for futuristic flow (crimson pulse lines)
  for (let x = 8; x < w - 8; x += 4) {
    if ((hashString(`bar:${x}`) / 0xffffffff) > 0.6) {
      frame.cells.push({ x, y: Math.floor(h / 2) - 1, color: '#8B1E3D' });
      frame.cells.push({ x, y: Math.floor(h / 2) + 1, color: '#8B1E3D' });
    }
  }
  return {
    cells: frame.cells,
    anchors: frame.anchors,
  };
});

registerPartProfile('ui.slot', (params = {}, options = {}) => {
  const size = roundInt(params.size ?? 48);
  const cx = roundInt(params.cx ?? size / 2);
  const cy = roundInt(params.cy ?? size / 2);
  const frame = getPartProfile('ui.arcane.frame')({ width: size, height: size, thickness: 3 }, options);
  // Central glow area for icon (indigo/purple for breathing core)
  for (let x = 6; x < size - 6; x++) {
    for (let y = 6; y < size - 6; y++) {
      if (Math.abs(x - cx) + Math.abs(y - cy) < size / 3) {
        if ((hashString(`slot:${x}:${y}`) / 0xffffffff) < 0.4) frame.cells.push({ x, y, color: '#4A2C6A' });
      }
    }
  }
  // Small silver cross or sigil in center for arcane
  frame.cells.push({ x: cx, y: cy - 2, color: '#A8A8B8' });
  frame.cells.push({ x: cx, y: cy + 2, color: '#A8A8B8' });
  frame.cells.push({ x: cx - 2, y: cy, color: '#A8A8B8' });
  frame.cells.push({ x: cx + 2, y: cy, color: '#A8A8B8' });
  return {
    cells: frame.cells,
    anchors: frame.anchors,
  };
});

registerPartProfile('ui.minimap.border', (params = {}, options = {}) => {
  const size = roundInt(params.size ?? 160);
  const cx = roundInt(params.cx ?? size / 2);
  const cy = roundInt(params.cy ?? size / 2);
  const r = size / 2 - 4;
  const cells = [];
  // Outer silver ring (arcane circle for minimap)
  for (let a = 0; a < 360; a += 3) {
    const rad = a * Math.PI / 180;
    const x = Math.floor(cx + Math.cos(rad) * r);
    const y = Math.floor(cy + Math.sin(rad) * r);
    cells.push({ x, y, color: '#A8A8B8' });
    // Thicker
    const x2 = Math.floor(cx + Math.cos(rad) * (r - 1));
    const y2 = Math.floor(cy + Math.sin(rad) * (r - 1));
    cells.push({ x: x2, y: y2, color: '#A8A8B8' });
  }
  // Inner obsidian fill with purple glow
  for (let x = cx - r + 4; x <= cx + r - 4; x++) {
    for (let y = cy - r + 4; y <= cy + r - 4; y++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 < (r - 4) ** 2) {
        cells.push({ x, y, color: '#11111A' });
        if ((hashString(`mm:${x}:${y}`) / 0xffffffff) < 0.1) cells.push({ x, y, color: '#4A2C6A' });
      }
    }
  }
  // Crimson cardinal points for arcane compass
  const card = r - 8;
  cells.push({ x: cx, y: cy - card, color: '#8B1E3D' });
  cells.push({ x: cx, y: cy + card, color: '#8B1E3D' });
  cells.push({ x: cx - card, y: cy, color: '#8B1E3D' });
  cells.push({ x: cx + card, y: cy, color: '#8B1E3D' });

  return {
    cells,
    anchors: {
      center: { x: cx, y: cy },
    },
  };
});

registerPartProfile('ui.chatbox.frame', (params = {}, options = {}) => {
  const w = roundInt(params.width ?? 320);
  const h = roundInt(params.height ?? 160);
  const frame = getPartProfile('ui.arcane.frame')({ width: w, height: h, thickness: 5 }, options);
  // Add vertical rune lines on sides for chat mysticism (indigo)
  for (let y = 10; y < h - 10; y += 8) {
    frame.cells.push({ x: 8, y, color: '#2E2A5A' });
    frame.cells.push({ x: w - 9, y, color: '#2E2A5A' });
  }
  // Top header bar with silver text line simulation
  for (let x = 10; x < w - 10; x++) {
    if (x % 3 === 0) frame.cells.push({ x, y: 8, color: '#A8A8B8' });
  }
  return {
    cells: frame.cells,
    anchors: frame.anchors,
  };
});

registerPartProfile('ui.indicator.player', (params = {}, options = {}) => {
  const size = roundInt(params.size ?? 40);
  const cx = roundInt(params.cx ?? size / 2);
  const cy = roundInt(params.cy ?? size / 2);
  const cells = [];
  // Silver outer circle
  for (let a = 0; a < 360; a += 8) {
    const rad = a * Math.PI / 180;
    cells.push({ x: Math.floor(cx + Math.cos(rad) * (size/2 - 2)), y: Math.floor(cy + Math.sin(rad) * (size/2 - 2)), color: '#A8A8B8' });
  }
  // Inner purple fill
  for (let x = 4; x < size - 4; x++) {
    for (let y = 4; y < size - 4; y++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 < (size/2 - 6) ** 2) {
        cells.push({ x, y, color: '#4A2C6A' });
      }
    }
  }
  // Crimson cross for player marker
  for (let i = -3; i <= 3; i++) {
    cells.push({ x: cx + i, y: cy, color: '#8B1E3D' });
    cells.push({ x: cx, y: cy + i, color: '#8B1E3D' });
  }
  return { cells, anchors: { center: { x: cx, y: cy } } };
});

registerPartProfile('ui.indicator.enemy', (params = {}, options = {}) => {
  const size = roundInt(params.size ?? 36);
  const cx = roundInt(params.cx ?? size / 2);
  const cy = roundInt(params.cy ?? size / 2);
  const cells = [];
  // Crimson outer diamond/reticle
  for (let i = -size/2 + 2; i <= size/2 - 2; i++) {
    cells.push({ x: cx + i, y: cy - Math.abs(i) / 1.5 + 2, color: '#8B1E3D' });
    cells.push({ x: cx + i, y: cy + Math.abs(i) / 1.5 - 2, color: '#8B1E3D' });
  }
  // Inner obsidian
  for (let x = cx - 4; x <= cx + 4; x++) {
    for (let y = cy - 4; y <= cy + 4; y++) {
      if (Math.abs(x - cx) + Math.abs(y - cy) < 6) cells.push({ x, y, color: '#11111A' });
    }
  }
  // Silver center dot
  cells.push({ x: cx, y: cy, color: '#A8A8B8' });
  return { cells, anchors: { center: { x: cx, y: cy } } };
});

registerPartProfile('heraldry.void_eye', (params, options) => getPartProfile('none')(params, options));

registerPartProfile('motif.harmonic_channels', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const span = roundInt(params.span ?? 13);
  const cells = [];
  for (let dx = -span; dx <= span; dx += 1) {
    if (Math.abs(dx) <= 4) continue;
    if (dx % 2 === 0) {
      cells.push({ x: cx + dx, y: cy - 4 });
      cells.push({ x: cx + dx, y: cy + 4 });
    }
    if (Math.abs(dx) % 5 === 0) cells.push({ x: cx + dx, y: cy });
  }
  for (let dy = -3; dy <= 3; dy += 1) {
    if (dy !== 0) {
      cells.push({ x: cx - 10, y: cy + dy });
      cells.push({ x: cx + 10, y: cy + dy });
    }
  }
  return {
    cells,
    anchors: {
      base: { x: cx, y: cy },
      center: { x: cx, y: cy },
    },
  };
});


// ── SCHOLMINE PICKAXE PROFILES ───────────────────────────────────────
// Minecraft-readable tool silhouette, authored as lattice parts so the
// Godot viewmodel is only a projection of the PixelBrain asset packet.

registerPartProfile('tool.pickaxe.head.minecraft_void', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? Math.floor((options.canvas?.width ?? 64) / 2));
  const y0 = roundInt(params.y ?? 8);
  const rows = [
    { y: -2, ranges: [[-2, 2]] },
    { y: -1, ranges: [[-6, 6]] },
    { y: 0, ranges: [[-12, 12]] },
    { y: 1, ranges: [[-16, -7], [-5, 5], [7, 16]] },
    { y: 2, ranges: [[-20, -12], [-4, 4], [12, 20]] },
    { y: 3, ranges: [[-24, -16], [-3, 3], [16, 24]] },
    { y: 4, ranges: [[-27, -20], [-2, 2], [20, 27]] },
    { y: 5, ranges: [[-29, -23], [-2, 2], [23, 29]] },
    { y: 6, ranges: [[-30, -25], [-1, 1], [25, 30]] },
    { y: 7, ranges: [[-30, -27], [27, 30]] },
    { y: 8, ranges: [[-30, -28], [28, 30]] },
    { y: 9, ranges: [[-29, -28], [28, 29]] },
  ];
  const cells = [];
  const seen = new Set();
  const place = (x, y) => {
    const key = String(x) + ',' + String(y);
    if (seen.has(key)) return;
    seen.add(key);
    cells.push({ x, y });
  };
  for (const row of rows) {
    for (const [from, to] of row.ranges) {
      for (let dx = from; dx <= to; dx += 1) place(cx + dx, y0 + row.y);
    }
  }
  return {
    cells,
    anchors: {
      base: { x: cx, y: y0 + 6 },
      center: { x: cx, y: y0 + 1 },
      left_tip: { x: cx - 29, y: y0 + 9 },
      right_tip: { x: cx + 29, y: y0 + 9 },
      rune_track: { x: cx, y: y0 + 2 },
    },
  };
});

registerPartProfile('tool.pickaxe.handle.diagonal', (params = {}, options = {}) => {
  const length = roundInt(params.length ?? 38);
  const dxTotal = roundInt(params.dx ?? -25);
  const thickness = Math.max(0, roundInt(params.thickness ?? 1));
  const cells = [];
  const seen = new Set();
  const place = (x, y) => {
    const key = String(x) + ',' + String(y);
    if (seen.has(key)) return;
    seen.add(key);
    cells.push({ x, y });
  };
  for (let i = 0; i <= length; i += 1) {
    const t = i / Math.max(1, length);
    const cx = Math.round(dxTotal * t);
    const cy = i;
    for (let ox = -thickness; ox <= thickness; ox += 1) {
      for (let oy = -thickness; oy <= thickness; oy += 1) {
        if (Math.abs(ox) + Math.abs(oy) <= thickness + 1) place(cx + ox, cy + oy);
      }
    }
  }
  return {
    cells,
    anchors: {
      base: { x: 0, y: 0 },
      tip: { x: dxTotal, y: length },
      center: { x: Math.round(dxTotal / 2), y: Math.round(length / 2) },
    },
  };
});

registerPartProfile('tool.pickaxe.handle.wrap', (params = {}, options = {}) => {
  const length = roundInt(params.length ?? 38);
  const dxTotal = roundInt(params.dx ?? -25);
  const spacing = Math.max(3, roundInt(params.spacing ?? 6));
  const cells = [];
  const seen = new Set();
  const place = (x, y) => {
    const key = String(x) + ',' + String(y);
    if (seen.has(key)) return;
    seen.add(key);
    cells.push({ x, y });
  };
  for (let i = 4; i <= length - 3; i += spacing) {
    const t = i / Math.max(1, length);
    const cx = Math.round(dxTotal * t);
    for (let offset = -2; offset <= 2; offset += 1) {
      place(cx + offset, i - offset);
      place(cx + offset, i - offset + 1);
    }
  }
  return {
    cells,
    anchors: {
      base: { x: 0, y: 0 },
      tip: { x: dxTotal, y: length },
      center: { x: Math.round(dxTotal / 2), y: Math.round(length / 2) },
    },
  };
});

registerPartProfile('tool.pickaxe.collar.socket', (params = {}, options = {}) => {
  const half = roundInt(params.half ?? 5);
  const height = roundInt(params.height ?? 6);
  const cells = [];
  for (let y = 0; y < height; y += 1) {
    const inset = y === 0 || y === height - 1 ? 1 : 0;
    for (let x = -half + inset; x <= half - inset; x += 1) cells.push({ x, y });
  }
  return {
    cells,
    anchors: {
      base: { x: 0, y: 0 },
      tip: { x: 0, y: height - 1 },
      center: { x: 0, y: Math.floor(height / 2) },
    },
  };
});

registerPartProfile('tool.pickaxe.void_inlay', (params = {}, options = {}) => {
  const span = roundInt(params.span ?? 15);
  const cells = [];
  for (let dx = -span; dx <= span; dx += 1) {
    if (dx % 2 === 0) cells.push({ x: dx, y: 0 });
    if (Math.abs(dx) % 5 === 0) cells.push({ x: dx, y: 1 });
  }
  for (let dy = -2; dy <= 2; dy += 1) {
    cells.push({ x: -5, y: dy });
    cells.push({ x: 5, y: dy });
  }
  return {
    cells,
    anchors: {
      base: { x: 0, y: 0 },
      center: { x: 0, y: 0 },
    },
  };
});

// ── HOLY FIRE PALADIN SWORD PROFILES (per 2026-06-12 PDR) ─────────────
// All deterministic, integer-cell formulas. The PDR's formulas at §4
// translate directly to the part-local coordinate system.
//
// Layout (canvas 64x96):
//   blade:    y =  8 .. 72  (root part; base anchor at bottom)
//   guard:    y = 73 .. 75  (attaches to blade's base)
//   hilt:     y = 76 .. 88  (attaches to guard's base)
//   pommel:   y = 89 .. 94  (attaches to hilt's base)
//   holyFire: flame cells emitted post-silhouette (no profile of its own)

// Blade — integer-quantized taper formula
//   w(y) = floor(w_base * (1 - k * (y - y_0) / L)^p + 0.5)
// with w_base = 6, k = 0.67, p = 0.85, L = 64, y_0 = 8
// Tip half-width ≈ 2, base half-width = 6.
registerPartProfile('weapon.sword.holyfire_paladin_blade', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? Math.floor((options.canvas?.width ?? 64) / 2));
  const wBase = roundInt(params.baseHalfWidth ?? 6);
  const tipHalf = roundInt(params.tipHalfWidth ?? 2);
  const k = Number(params.taperK ?? 0.67);
  const p = Number(params.taperPower ?? 0.85);
  const y0 = roundInt(params.yStart ?? 8);
  const length = roundInt(params.length ?? 64);
  const yEnd = y0 + length - 1;
  const cells = [];
  for (let y = y0; y <= yEnd; y += 1) {
    const t = (y - y0) / Math.max(1, length - 1);
    const raw = wBase * Math.pow(Math.max(0, 1 - k * t), p);
    const half = Math.max(tipHalf, Math.floor(raw + 0.5));
    for (let dx = -half; dx <= half; dx += 1) cells.push({ x: cx + dx, y });
  }
  return {
    cells,
    anchors: {
      base: { x: cx, y: yEnd },
      tip: { x: cx, y: y0 },
      center: { x: cx, y: Math.round((y0 + yEnd) / 2) },
    },
  };
});

// Crossguard — horizontal bar; canonical attach is `at: 'base'`.
registerPartProfile('weapon.sword.holyfire_paladin_guard', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? Math.floor((options.canvas?.width ?? 64) / 2));
  const halfBase = roundInt(params.halfBase ?? 14); // x: cx-14..cx+14 → 28 cells
  const height = roundInt(params.height ?? 3);
  const cells = [];
  for (let y = 0; y < height; y += 1) {
    const isEdge = y === 0 || y === height - 1;
    const half = isEdge ? halfBase - 1 : halfBase;
    for (let dx = -half; dx <= half; dx += 1) cells.push({ x: cx + dx, y });
  }
  return {
    cells,
    anchors: {
      base: { x: cx, y: 0 },
      tip: { x: cx, y: height - 1 },
      center: { x: cx, y: Math.floor(height / 2) },
    },
  };
});

// Hilt — uniform 3-cell wide grip with optional cord flares.
registerPartProfile('weapon.sword.holyfire_paladin_grip', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? Math.floor((options.canvas?.width ?? 64) / 2));
  const half = roundInt(params.half ?? 1);     // 3-cell wide
  const height = roundInt(params.height ?? 13);
  const ringRows = roundInt(params.ringRows ?? 2);
  const cells = [];
  for (let y = 0; y < height; y += 1) {
    const inRing = y < ringRows || y >= height - ringRows;
    const localHalf = inRing ? half + 1 : half;
    for (let dx = -localHalf; dx <= localHalf; dx += 1) cells.push({ x: cx + dx, y });
  }
  return {
    cells,
    anchors: {
      base: { x: cx, y: 0 },
      tip: { x: cx, y: height - 1 },
    },
  };
});

// Pommel — 5×5 sphere with center marker.
// (x - cx)² + (y - cy)² ≤ r² with r = 4 quantized (2 * Math.round(2.25) = 4 → 25 cells minus corners)
registerPartProfile('weapon.sword.holyfire_paladin_pommel', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? Math.floor((options.canvas?.width ?? 64) / 2));
  const cy = roundInt(params.cy ?? 0);
  const r = roundInt(params.radius ?? 4);
  const cells = [];
  for (let y = -r; y <= r; y += 1) {
    for (let x = -r; x <= r; x += 1) {
      // Integer-radius test (avoids floating-point drift in canonical path)
      if (x * x + y * y <= r * r) cells.push({ x: cx + x, y: cy + y });
    }
  }
  return {
    cells,
    anchors: {
      base: { x: cx, y: -r },
      tip: { x: cx, y: r },
      center: { x: cx, y: 0 },
    },
  };
});

// HOLY FIRE MOTIF — virtual profile. The part declares the holyFire id
// so the heraldry/fill pipeline can resolve it; the actual flame cells
// are emitted post-silhouette by the holyfire-motif-amp (deterministic
// sin-based formula, no Math.random). The virtual anchor sits at the
// blade's center column so the attach graph remains 4-connected.
registerPartProfile('weapon.sword.holyfire_motif', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? Math.floor((options.canvas?.width ?? 64) / 2));
  return {
    cells: [],
    anchors: {
      base: { x: cx, y: 0 },
      tip: { x: cx, y: 0 },
      center: { x: cx, y: 0 },
    },
  };
});

// ── REDWOOD TREE PROFILES (using harmonic/golden construction for natural tall form) ──

registerPartProfile('tree.trunk.redwood', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? Math.floor((options.canvas?.width ?? 48) / 2));
  const height = roundInt(params.height ?? 90);
  const baseHalf = roundInt(params.baseHalf ?? 6);
  const topHalf = roundInt(params.topHalf ?? 3);
  const cells = [];
  for (let y = 0; y < height; y += 1) {
    const t = y / (height - 1);
    // Slight base flare + linear taper
    const half = Math.round(baseHalf * (1 - t * 0.5) + topHalf * t);
    for (let dx = -half; dx <= half; dx += 1) {
      cells.push({ x: cx + dx, y });
    }
    // Subtle vertical bark grooves (every few columns, skip for texture later via noise)
    if (y % 3 === 0) {
      for (let dx = -half + 1; dx <= half - 1; dx += 3) {
        // These will be same part; region fill + noise will differentiate
      }
    }
  }
  return {
    cells,
    anchors: {
      base: { x: cx, y: height - 1 },
      tip: { x: cx, y: 0 },
      mid: { x: cx, y: Math.floor(height / 2) },
      // Multiple layer anchors for whorls, positioned higher up the trunk
      // for classic redwood form: long bare lower trunk, canopy starting mid-upper
      layer1: { x: cx, y: Math.floor(height * 0.12) },
      layer2: { x: cx, y: Math.floor(height * 0.20) },
      layer3: { x: cx, y: Math.floor(height * 0.28) },
      layer4: { x: cx, y: Math.floor(height * 0.36) },
      layer5: { x: cx, y: Math.floor(height * 0.38) },
      layer6: { x: cx, y: Math.floor(height * 0.45) },
    },
  };
});

registerPartProfile('tree.foliage.tier', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const width = roundInt(params.width ?? 28);
  const thickness = roundInt(params.thickness ?? 5);
  const droop = roundInt(params.droop ?? 3); // how much lower edges hang
  const cells = [];
  for (let y = -Math.floor(thickness / 2); y <= Math.floor(thickness / 2); y += 1) {
    const yt = (y + Math.floor(thickness / 2)) / thickness;
    const half = Math.round((width / 2) * (1 - Math.pow(yt - 0.5, 2) * 0.8)); // slightly rounded
    for (let dx = -half; dx <= half; dx += 1) {
      // Add some needle-like jaggedness
      if (Math.abs(dx) === half && (y % 2 === 0)) continue; // notch edges
      const actualY = cy + y + (y > 0 ? Math.floor(droop * (y / (thickness / 2))) : 0);
      cells.push({ x: cx + dx, y: actualY });
    }
  }
  return {
    cells,
    anchors: {
      base: { x: cx, y: cy },
      center: { x: cx, y: cy },
      top: { x: cx, y: cy - Math.floor(thickness / 2) },
    },
  };
});

registerPartProfile('tree.foliage.top', (params = {}, options = {}) => {
  // Narrow top spire for classic redwood silhouette
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const height = roundInt(params.height ?? 12);
  const baseWidth = roundInt(params.baseWidth ?? 10);
  const cells = [];
  for (let y = 0; y < height; y += 1) {
    const t = y / height;
    const half = Math.max(1, Math.round(baseWidth / 2 * (1 - t)));
    for (let dx = -half; dx <= half; dx += 1) {
      cells.push({ x: cx + dx, y: cy - y });
    }
  }
  return {
    cells,
    anchors: {
      base: { x: cx, y: cy },
      tip: { x: cx, y: cy - height + 1 },
    },
  };
});

// ── VOID PICKAXE REV2 PROFILES ───────────────────────────────────────
// Proper parametric pickaxe: curved arms with quadratic taper,
// chunky central block, straight handle, heavy collar, runic inlay.

registerPartProfile('tool.pickaxe.head.void_heavy', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? Math.floor((options.canvas?.width ?? 64) / 2));
  const yTop = roundInt(params.yTop ?? 0);

  // Unified head shape: each row declares one or two contiguous x-ranges.
  // Arms curve outward and upward from the central block. Block is solid.
  const rows = [
    // Arms — tips are sharp and far apart, widening toward center
    { ranges: [[-29, -26], [26, 29]] },        // y+0: tips
    { ranges: [[-29, -23], [23, 29]] },        // y+1
    { ranges: [[-28, -20], [20, 28]] },        // y+2
    { ranges: [[-27, -16], [16, 27]] },        // y+3
    { ranges: [[-25, -13], [13, 25]] },        // y+4
    { ranges: [[-23, -10], [10, 23]] },        // y+5
    { ranges: [[-20, -8],  [8, 20]] },         // y+6: arms nearly merged
    // Block — solid rectangular mass where handle mounts
    { ranges: [[-7, 7]] },                     // y+7
    { ranges: [[-7, 7]] },                     // y+8
    { ranges: [[-7, 7]] },                     // y+9
    { ranges: [[-7, 7]] },                     // y+10
    { ranges: [[-7, 7]] },                     // y+11
    { ranges: [[-7, 7]] },                     // y+12
    { ranges: [[-7, 7]] },                     // y+13
    // Bottom taper into collar
    { ranges: [[-6, 6]] },                     // y+14
    { ranges: [[-5, 5]] },                     // y+15
    { ranges: [[-4, 4]] },                     // y+16
  ];

  const cells = [];
  const seen = new Set();
  const place = (x, y) => {
    const key = String(x) + ',' + String(y);
    if (seen.has(key)) return;
    seen.add(key);
    cells.push({ x, y });
  };

  for (let i = 0; i < rows.length; i += 1) {
    const y = yTop + i;
    for (const [from, to] of rows[i].ranges) {
      for (let dx = from; dx <= to; dx += 1) place(cx + dx, y);
    }
  }

  return {
    cells,
    anchors: {
      base: { x: cx, y: yTop + rows.length - 1 },
      tip_left: { x: cx - 29, y: yTop },
      tip_right: { x: cx + 29, y: yTop },
      center: { x: cx, y: Math.round(yTop + 8) },
      rune_track: { x: cx, y: yTop + 9 },
    },
  };
});

registerPartProfile('tool.pickaxe.handle.void_straight', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const length = roundInt(params.length ?? 30);
  const half = roundInt(params.half ?? 3);
  const cells = [];
  for (let y = 0; y < length; y += 1) {
    for (let x = cx - half; x <= cx + half; x += 1) {
      cells.push({ x, y });
    }
  }
  return {
    cells,
    anchors: {
      base: { x: cx, y: 0 },
      tip: { x: cx, y: length - 1 },
      center: { x: cx, y: Math.floor(length / 2) },
    },
  };
});

registerPartProfile('tool.pickaxe.handle.void_wrap', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const length = roundInt(params.length ?? 30);
  const half = roundInt(params.half ?? 4);
  const spacing = roundInt(params.spacing ?? 5);
  const bandWidth = roundInt(params.bandWidth ?? 3);
  const cells = [];
  for (let y = 4; y < length - 4; y += spacing) {
    for (let row = 0; row < bandWidth; row += 1) {
      if (y + row >= length) break;
      for (let x = cx - half; x <= cx + half; x += 1) {
        cells.push({ x, y: y + row });
      }
    }
  }
  return {
    cells,
    anchors: {
      base: { x: cx, y: 0 },
      tip: { x: cx, y: length - 1 },
      center: { x: cx, y: Math.floor(length / 2) },
    },
  };
});

registerPartProfile('tool.pickaxe.collar.void_heavy', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const half = roundInt(params.half ?? 8);
  const height = roundInt(params.height ?? 5);
  const cells = [];
  for (let y = 0; y < height; y += 1) {
    const isTop = y === 0;
    const isBot = y === height - 1;
    const inset = (isTop || isBot) ? 1 : 0;
    for (let x = cx - half + inset; x <= cx + half - inset; x += 1) {
      cells.push({ x, y });
    }
  }
  return {
    cells,
    anchors: {
      base: { x: cx, y: height - 1 },
      tip: { x: cx, y: 0 },
      center: { x: cx, y: Math.floor(height / 2) },
    },
  };
});

registerPartProfile('tool.pickaxe.inlay.void_runes', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 0);
  const cy = roundInt(params.cy ?? 0);
  const cells = [];
  const seen = new Set();
  const place = (x, y) => {
    const key = String(x) + ',' + String(y);
    if (seen.has(key)) return;
    seen.add(key);
    cells.push({ x, y });
  };
  // Clean horizontal rune stripe across the head block
  for (let dx = -6; dx <= 6; dx += 1) {
    place(cx + dx, cy);
  }
  // Small diamond eye at center
  place(cx, cy - 1);
  place(cx, cy + 1);
  return {
    cells,
    anchors: {
      base: { x: cx, y: cy },
      center: { x: cx, y: cy },
    },
  };
});

/** Loot chest body — tapered crate base; recolored via semantic `source` material. */
registerPartProfile('loot.chest.body', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 20);
  const half = roundInt(params.half ?? 11);
  const top = roundInt(params.top ?? 14);
  const bottom = roundInt(params.bottom ?? 23);
  const cells = [];
  for (let y = top; y <= bottom; y += 1) {
    const taper = Math.floor((y - top) * 0.12);
    const span = Math.max(5, half - taper);
    for (let x = cx - span; x <= cx + span; x += 1) cells.push({ x, y });
  }
  for (let x = cx - half + 1; x <= cx + half - 1; x += 1) cells.push({ x, y: bottom + 1 });
  return {
    cells,
    anchors: {
      base: { x: cx, y: bottom + 1 },
      top: { x: cx, y: top },
      center: { x: cx, y: Math.floor((top + bottom) / 2) },
    },
  };
});

/** Loot chest lid — arched cover hinged at the body seam. */
registerPartProfile('loot.chest.lid', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 20);
  const half = roundInt(params.half ?? 12);
  const top = roundInt(params.top ?? 5);
  const hinge = roundInt(params.hinge ?? 13);
  const cells = [];
  for (let y = top; y <= hinge; y += 1) {
    const t = (y - top) / Math.max(1, hinge - top);
    const arch = Math.max(4, Math.round(half * (1 - t * t * 0.32)));
    for (let x = cx - arch; x <= cx + arch; x += 1) cells.push({ x, y });
  }
  return {
    cells,
    anchors: {
      base: { x: cx, y: hinge },
      tip: { x: cx, y: top },
      center: { x: cx, y: Math.floor((top + hinge) / 2) },
    },
  };
});

/** Horizontal reinforcement band across the chest front. */
registerPartProfile('loot.chest.band', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 20);
  const half = roundInt(params.half ?? 10);
  const y0 = roundInt(params.y0 ?? 15);
  const y1 = roundInt(params.y1 ?? 16);
  const cells = [];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = cx - half; x <= cx + half; x += 1) cells.push({ x, y });
  }
  return {
    cells,
    anchors: {
      base: { x: cx, y: y1 },
      center: { x: cx, y: Math.floor((y0 + y1) / 2) },
    },
  };
});

/** Central clasp / lock plate. */
registerPartProfile('loot.chest.lock', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 20);
  const cy = roundInt(params.cy ?? 12);
  const half = roundInt(params.half ?? 2);
  const cells = [];
  for (let y = cy - half; y <= cy + half; y += 1) {
    for (let x = cx - half; x <= cx + half; x += 1) cells.push({ x, y });
  }
  cells.push({ x: cx, y: cy - half - 1 });
  return {
    cells,
    anchors: {
      base: { x: cx, y: cy + half },
      center: { x: cx, y: cy },
    },
  };
});

/** Soft outer halo used for high-tier chest glow. */
registerPartProfile('loot.chest.glow', (params = {}, options = {}) => {
  const cx = roundInt(params.cx ?? 20);
  const cy = roundInt(params.cy ?? 10);
  const rx = roundInt(params.rx ?? 14);
  const ry = roundInt(params.ry ?? 10);
  const cells = [];
  for (let y = cy - ry - 1; y <= cy + ry + 1; y += 1) {
    for (let x = cx - rx - 1; x <= cx + rx + 1; x += 1) {
      const nx = (x - cx) / rx;
      const ny = (y - cy) / ry;
      const d = nx * nx + ny * ny;
      if (d >= 0.82 && d <= 1.12) cells.push({ x, y });
    }
  }
  return {
    cells,
    anchors: {
      center: { x: cx, y: cy },
    },
  };
});
