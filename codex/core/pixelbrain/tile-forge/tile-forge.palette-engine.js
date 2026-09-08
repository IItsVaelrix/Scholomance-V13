/**
 * Tile Forge — Centralized Palette Engine & Lighting Grammars
 *
 * Implements:
 * - Palette Cohesion Invariant: Unified named palette families with calibrated tone ramps.
 * - Lighting Consistency Invariant: Shared upper-left key light vector [-0.65, -0.75, 0.5] and ambient fills.
 * - Anti-Vector Invariant: 2x2 Bayer ordered dithering, discrete RGB color quantization.
 */

export const BAYER_2X2 = Object.freeze([
  [0, 2],
  [3, 1],
]);

export function getBayerOffset(x, y, strength = 0.2) {
  const norm = (BAYER_2X2[y % 2][x % 2] / 4.0) - 0.375;
  return norm * strength;
}

export function hexToRgb(hex) {
  const clean = String(hex).replace('#', '').padEnd(6, '0');
  const num = parseInt(clean, 16);
  return [
    (num >> 16) & 255,
    (num >> 8) & 255,
    num & 255,
  ];
}

export function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${((1 << 24) + (clamp(r) << 16) + (clamp(g) << 8) + clamp(b)).toString(16).slice(1).toUpperCase()}`;
}

export function lerpColor(c1, c2, t) {
  const clampedT = Math.max(0, Math.min(1, t));
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * clampedT),
    Math.round(c1[1] + (c2[1] - c1[1]) * clampedT),
    Math.round(c1[2] + (c2[2] - c1[2]) * clampedT),
  ];
}

// ART-02: Face-semantic lighting grammars
export const ISOMETRIC_FACE_NORMALS = Object.freeze({
  TOP: Object.freeze([0, -0.7071, 0.7071]),
  SW_LIT: Object.freeze([-0.7071, 0.5, 0.5]),
  SE_SHADOW: Object.freeze([0.7071, 0.5, 0.5]),
});

export function computeFaceLightIntensity(faceName, lightDir = [-0.65, -0.75, 0.5]) {
  const normal = ISOMETRIC_FACE_NORMALS[faceName] || ISOMETRIC_FACE_NORMALS.TOP;
  const dot = normal[0] * lightDir[0] + normal[1] * lightDir[1] + normal[2] * lightDir[2];
  const ambient = 0.28;
  const key = 0.72;
  return Math.max(0.1, Math.min(1.0, ambient + key * Math.max(0, dot)));
}

// ART-03: Semantic color roles & palette transmutation
export const SEMANTIC_COLOR_ROLES = Object.freeze([
  'surface',
  'flank_lit',
  'flank_shadow',
  'strata',
  'mineral',
  'root',
  'glint',
  'bedrock',
]);

export function transmutePalette(sourcePalette, targetPaletteFamily) {
  const normKey = String(targetPaletteFamily || '').toLowerCase();
  const targetFamily = TILE_FORGE_PALETTE_FAMILIES[targetPaletteFamily] ||
    TILE_FORGE_PALETTE_FAMILIES[`scholomance_${normKey}`] ||
    Object.values(TILE_FORGE_PALETTE_FAMILIES).find((f) => (f.name || '').toLowerCase().includes(normKey));
  if (!targetFamily) return sourcePalette;
  return {
    ...sourcePalette,
    family: targetPaletteFamily,
    colors: getTileForgePaletteColors(targetFamily),
    roles: targetFamily.roles || {},
  };
}

// ART-05: Explicit pixel style profiles
export const PIXEL_STYLE_PROFILES = Object.freeze({
  STRICT_PIXEL: 'STRICT_PIXEL',
  BAYER_DITHER: 'BAYER_DITHER',
  SMOOTH_AA: 'SMOOTH_AA',
});

const SUNLIT_GLADE_COLORS = Object.freeze([
  '#17241B', '#223226', '#2C3E30', '#354A38',
  '#3F5940', '#4B6847', '#58794E', '#678B55',
  '#78A05E', '#8DB46B', '#A7CA7D', '#C9E29A',
  '#454840', '#5C5F55', '#74776A', '#929386', '#B8B8A6',
  '#285864', '#367581', '#4A9299', '#72B6B1',
  '#493022', '#65432C', '#835A38', '#A77A4C',
  '#D87955', '#E1A943', '#E8D16E',
  '#63D2CD', '#ADF1E3',
  '#68518E', '#9B7BC2',
]);

const SUNLIT_GLADE_ROLES = Object.freeze({
  ink: Object.freeze(SUNLIT_GLADE_COLORS.slice(0, 2)),
  castShadow: Object.freeze(SUNLIT_GLADE_COLORS.slice(2, 4)),
  meadow: Object.freeze(SUNLIT_GLADE_COLORS.slice(4, 12)),
  verge: Object.freeze(SUNLIT_GLADE_COLORS.slice(3, 10)),
  path: Object.freeze(SUNLIT_GLADE_COLORS.slice(12, 17)),
  pond: Object.freeze(SUNLIT_GLADE_COLORS.slice(17, 21)),
  cliff: Object.freeze([
    SUNLIT_GLADE_COLORS[0],
    SUNLIT_GLADE_COLORS[2],
    ...SUNLIT_GLADE_COLORS.slice(12, 16),
  ]),
  wood: Object.freeze(SUNLIT_GLADE_COLORS.slice(21, 25)),
  foliage: Object.freeze([
    SUNLIT_GLADE_COLORS[1],
    SUNLIT_GLADE_COLORS[3],
    ...SUNLIT_GLADE_COLORS.slice(4, 12),
  ]),
  soil: Object.freeze(SUNLIT_GLADE_COLORS.slice(21, 25)),
  flower: Object.freeze(SUNLIT_GLADE_COLORS.slice(25, 28)),
  sun: Object.freeze(SUNLIT_GLADE_COLORS.slice(26, 28)),
  magicCyan: Object.freeze(SUNLIT_GLADE_COLORS.slice(28, 30)),
  magicViolet: Object.freeze(SUNLIT_GLADE_COLORS.slice(30, 32)),
});

export const TILE_FORGE_PALETTE_FAMILIES = Object.freeze({
  scholomance_sunlit_glade: Object.freeze({
    name: 'Scholomance Sunlit Glade',
    colors: SUNLIT_GLADE_COLORS,
    roles: SUNLIT_GLADE_ROLES,
    ramp: SUNLIT_GLADE_ROLES.meadow,
    wood: Object.freeze({
      shadow: SUNLIT_GLADE_COLORS[21],
      dark: SUNLIT_GLADE_COLORS[22],
      mid: SUNLIT_GLADE_COLORS[23],
      light: SUNLIT_GLADE_COLORS[24],
      highlight: SUNLIT_GLADE_COLORS[27],
    }),
    stone: Object.freeze({
      shadow: SUNLIT_GLADE_COLORS[12],
      dark: SUNLIT_GLADE_COLORS[13],
      mid: SUNLIT_GLADE_COLORS[14],
      light: SUNLIT_GLADE_COLORS[15],
      highlight: SUNLIT_GLADE_COLORS[16],
    }),
    earth: Object.freeze({
      crevice: SUNLIT_GLADE_COLORS[21],
      dark: SUNLIT_GLADE_COLORS[22],
      mid: SUNLIT_GLADE_COLORS[23],
      light: SUNLIT_GLADE_COLORS[24],
      highlight: SUNLIT_GLADE_COLORS[26],
    }),
    accents: Object.freeze({
      flower_white: SUNLIT_GLADE_COLORS[27],
      flower_yellow: SUNLIT_GLADE_COLORS[26],
      flower_red: SUNLIT_GLADE_COLORS[25],
      flower_blue: SUNLIT_GLADE_COLORS[28],
      moss_glow: SUNLIT_GLADE_COLORS[29],
      pebble_hi: SUNLIT_GLADE_COLORS[16],
    }),
  }),

  verdant_dofus: Object.freeze({
    name: 'Verdant Dofus Meadow',
    ramp: Object.freeze([
      '#425810', // 0: Deep foliage / root occlusion
      '#65821A', // 1: Under-canopy shadow grass
      '#7A9422', // 2: Muted grass mid-dark
      '#8DA829', // 3: Rich meadow midtone
      '#A8C838', // 4: Primary Dofus grass tone
      '#C2E048', // 5: Warm sunlit meadow green
      '#DDF46A', // 6: Sunlit clover highlight
      '#F4FEA2', // 7: Crest specular sheen
    ]),
    wood: Object.freeze({
      shadow: '#321D08',
      dark: '#5A3816',
      mid: '#9E703A',
      light: '#C49862',
      highlight: '#DEC496',
    }),
    stone: Object.freeze({
      shadow: '#2C3028',
      dark: '#4A4D44',
      mid: '#6E7068',
      light: '#9EA094',
      highlight: '#D2D4C8',
    }),
    earth: Object.freeze({
      crevice: '#2A1808',
      dark: '#4A2E14',
      mid: '#784E25',
      light: '#A5733E',
      highlight: '#CAA06A',
    }),
    accents: Object.freeze({
      flower_white: '#FFFFFF',
      flower_yellow: '#FDE047',
      flower_red: '#EF4444',
      flower_blue: '#38BDF8',
      moss_glow: '#BEF264',
      pebble_hi: '#E2E8F0',
    }),
  }),

  autumnal_gold: Object.freeze({
    name: 'Autumnal Golden Forest',
    ramp: Object.freeze([
      '#451A03', // 0: Burnt sienna occlusion
      '#78350F', // 1: Deep shadow umber
      '#92400E', // 2: Russet mid-dark
      '#B45309', // 3: Warm cinnamon midtone
      '#D97706', // 4: Vibrant amber body
      '#F59E0B', // 5: Golden sunlit crown
      '#FBBF24', // 6: Warm yellow highlight
      '#FEF08A', // 7: Radiant crest shimmer
    ]),
    wood: Object.freeze({
      shadow: '#2E1505',
      dark: '#52280C',
      mid: '#7C3F16',
      light: '#A7602B',
      highlight: '#CC8A4E',
    }),
    stone: Object.freeze({
      shadow: '#27272A',
      dark: '#3F3F46',
      mid: '#52525B',
      light: '#71717A',
      highlight: '#A1A1AA',
    }),
    earth: Object.freeze({
      crevice: '#241206',
      dark: '#45220C',
      mid: '#6C3A18',
      light: '#965A2C',
      highlight: '#BA7E4A',
    }),
    accents: Object.freeze({
      flower_white: '#FEF9C3',
      flower_yellow: '#FDE047',
      flower_red: '#DC2626',
      flower_blue: '#60A5FA',
      moss_glow: '#F59E0B',
      pebble_hi: '#CBD5E1',
    }),
  }),

  weathered_granite: Object.freeze({
    name: 'Weathered Granite Highlands',
    ramp: Object.freeze([
      '#0F172A', // 0: Slate chasm occlusion
      '#1E293B', // 1: Deep slate shadow
      '#334155', // 2: Shaded mortar joint
      '#475569', // 3: Basalt stone body
      '#64748B', // 4: Flagstone midtone
      '#94A3B8', // 5: Sunlit stone highlight
      '#CBD5E1', // 6: Quartz facet sheen
      '#F1F5F9', // 7: Mineral specular
    ]),
    wood: Object.freeze({
      shadow: '#1E1B18',
      dark: '#3A3530',
      mid: '#5E564E',
      light: '#887E72',
      highlight: '#B4AA9E',
    }),
    stone: Object.freeze({
      shadow: '#0F172A',
      dark: '#334155',
      mid: '#64748B',
      light: '#94A3B8',
      highlight: '#E2E8F0',
    }),
    earth: Object.freeze({
      crevice: '#181C16',
      dark: '#2E332A',
      mid: '#4A5244',
      light: '#6C7764',
      highlight: '#93A08A',
    }),
    accents: Object.freeze({
      flower_white: '#F8FAFC',
      flower_yellow: '#E2E8F0',
      flower_red: '#F43F5E',
      flower_blue: '#38BDF8',
      moss_glow: '#86EFAC',
      pebble_hi: '#FFFFFF',
    }),
  }),

  sacred_water: Object.freeze({
    name: 'Sacred Mineral Basin',
    ramp: Object.freeze([
      '#042F2E', // 0: Abyss depth
      '#0E7490', // 1: Deep cyan trench
      '#0891B2', // 2: Sub-surface aqua
      '#06B6D4', // 3: Clear basin body
      '#22D3EE', // 4: Sunlit spring blue
      '#67E8F9', // 5: Surface reflection
      '#A5F3FC', // 6: Shoreline foam crest
      '#E0F2FE', // 7: Specular glint
    ]),
    wood: Object.freeze({
      shadow: '#1F2937',
      dark: '#374151',
      mid: '#4B5563',
      light: '#6B7280',
      highlight: '#9CA3AF',
    }),
    stone: Object.freeze({
      shadow: '#134E4A',
      dark: '#115E59',
      mid: '#0F766E',
      light: '#14B8A6',
      highlight: '#5EEAD4',
    }),
    earth: Object.freeze({
      crevice: '#321D08',
      dark: '#5A3816',
      mid: '#7A5228',
      light: '#9E703A',
      highlight: '#C49862',
    }),
    accents: Object.freeze({
      flower_white: '#FFFFFF',
      flower_yellow: '#FDE047',
      flower_red: '#F43F5E',
      flower_blue: '#38BDF8',
      moss_glow: '#5EEAD4',
      pebble_hi: '#CCFBF1',
    }),
  }),

  void_crystalline: Object.freeze({
    name: 'Void Crystalline Sanctuary',
    ramp: Object.freeze([
      '#020617', // 0: Void abyss
      '#0F172A', // 1: Obsidian humus
      '#1E1B4B', // 2: Dark root soil
      '#2E1065', // 3: Shadowed purple base
      '#4C1D95', // 4: Deep indigo body
      '#6B21A8', // 5: Rich cosmic purple
      '#9333EA', // 6: Luminous lilac highlight
      '#C084FC', // 7: Radiant crystal shimmer
    ]),
    wood: Object.freeze({
      shadow: '#0B0A1A',
      dark: '#1B1430',
      mid: '#312250',
      light: '#4C3575',
      highlight: '#7255A6',
    }),
    stone: Object.freeze({
      shadow: '#0F172A',
      dark: '#1E293B',
      mid: '#334155',
      light: '#475569',
      highlight: '#64748B',
    }),
    earth: Object.freeze({
      crevice: '#020617',
      dark: '#0B0F19',
      mid: '#141B2D',
      light: '#232D48',
      highlight: '#394668',
    }),
    accents: Object.freeze({
      flower_white: '#F5D0FE',
      flower_yellow: '#FDE047',
      flower_red: '#F43F5E',
      flower_blue: '#38BDF8',
      moss_glow: '#A855F7',
      pebble_hi: '#E0E7FF',
    }),
  }),
});

/**
 * Return the unique authored RGB colors for a family in declaration order.
 */
export function getTileForgePaletteColors(familyOrName) {
  const family = typeof familyOrName === 'string'
    ? TILE_FORGE_PALETTE_FAMILIES[familyOrName]
    : familyOrName;
  if (!family) return Object.freeze([]);
  if (Array.isArray(family.colors)) return family.colors;

  const colors = [];
  const seen = new Set();
  const visit = (value) => {
    if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) {
      const normalized = value.toUpperCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        colors.push(normalized);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(family);
  return Object.freeze(colors);
}

/**
 * Evaluates the standard upper-left dimetric light projection for a pixel.
 * Light direction: L = [-0.65, -0.75, 0.5] (upper-left overhead).
 *
 * @param {number} x
 * @param {number} y
 * @param {number} cx Center X
 * @param {number} cy Center Y
 * @param {number} rx Radius X
 * @param {number} ry Radius Y
 * @returns {number} Normalized shade factor in [0, 1]
 */
export function evaluateDimetricShade(x, y, cx, cy, rx, ry, bayerJitter = 0) {
  const u = (x - cx) / (rx || 1);
  const v = (y - cy) / (ry || 1);
  const lightProj = -0.65 * u - 0.75 * v;
  const shade = 0.5 + lightProj * 0.35 + bayerJitter;
  return Math.max(0, Math.min(1, shade));
}

/**
 * Samples a color from an 8-stop palette ramp using shade and Bayer dithering.
 *
 * @param {string[]} ramp 8-stop hex color array
 * @param {number} shade [0, 1]
 * @param {number} [minStop=0]
 * @param {number} [maxStop=7]
 * @returns {[number, number, number]} RGB
 */
export function sampleRampColor(ramp, shade, minStop = 0, maxStop = 7) {
  const t = Math.max(0, Math.min(1, shade));
  const range = maxStop - minStop;
  const rawStop = minStop + t * range;
  const stopIndex = Math.min(maxStop, Math.max(minStop, Math.floor(rawStop)));
  const nextIndex = Math.min(maxStop, stopIndex + 1);
  const frac = rawStop - Math.floor(rawStop);

  const c1 = hexToRgb(ramp[stopIndex]);
  const c2 = hexToRgb(ramp[nextIndex]);
  return lerpColor(c1, c2, frac > 0.6 ? 1 : 0);
}
