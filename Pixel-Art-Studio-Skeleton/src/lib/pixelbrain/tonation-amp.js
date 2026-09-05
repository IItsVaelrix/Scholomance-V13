import { hashString, clamp01 } from './shared.js';
import { resolveMaterialId, SOURCE_MATERIAL } from './material-registry.js';

export const TONATION_AMP_ID = 'pixelbrain.tonation-amp';
export const TONATION_AMP_VERSION = '1.0.0';

function parseHexColor(hex) {
  const raw = String(hex || '').trim().replace('#', '');
  const normalized = raw.length === 3
    ? raw.split('').map((char) => `${char}${char}`).join('')
    : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return { r: 0, g: 0, b: 0 };
  const value = parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((channel) => {
    const safe = Math.max(0, Math.min(255, Math.round(channel)));
    return safe.toString(16).padStart(2, '0');
  }).join('').toUpperCase()}`;
}

function mixRgb(a, b, amount) {
  const t = clamp01(amount);
  return {
    r: a.r + ((b.r - a.r) * t),
    g: a.g + ((b.g - a.g) * t),
    b: a.b + ((b.b - a.b) * t),
  };
}

export function buildTonationAmpPayload(input = {}) {
  const { coordinates = [], materialId = SOURCE_MATERIAL, intensitySummary, canvas = null } = input;
  
  const resolvedMaterial = resolveMaterialId(materialId);
  
  let averageLuminanceBefore = 0;
  let averageLuminanceAfter = 0;
  
  const outputCoordinates = coordinates.map(coord => {
    if (!coord.color) return { ...coord };
    
    let rgb = parseHexColor(coord.color);
    const luma = ((0.2126 * rgb.r) + (0.7152 * rgb.g) + (0.0722 * rgb.b)) / 255;
    averageLuminanceBefore += luma;
    
    // Tonation logic: balance values slightly based on material
    if (resolvedMaterial === 'holy_fire') {
      // Warm up midtones
      if (luma > 0.4 && luma < 0.8) {
         rgb = mixRgb(rgb, {r: 245, g: 158, b: 11}, 0.1); // Mix with amber
      }
    } else if (resolvedMaterial === 'icy_fire' || resolvedMaterial === 'void_ice') {
      // Cool down midtones
      if (luma > 0.3 && luma < 0.7) {
         rgb = mixRgb(rgb, {r: 14, g: 165, b: 233}, 0.1); // Mix with cyan
      }
    }
    
    const newLuma = ((0.2126 * rgb.r) + (0.7152 * rgb.g) + (0.0722 * rgb.b)) / 255;
    averageLuminanceAfter += newLuma;
    
    return { 
      ...coord, 
      color: rgbToHex(rgb),
      preTonationColor: coord.color 
    };
  });

  if (coordinates.length > 0) {
      averageLuminanceBefore /= coordinates.length;
      averageLuminanceAfter /= coordinates.length;
  }

  return Object.freeze({
    amp: TONATION_AMP_ID,
    version: TONATION_AMP_VERSION,
    coordinates: outputCoordinates,
    diagnostics: Object.freeze({
      coordinateCount: coordinates.length,
    }),
    metadata: Object.freeze({
      averageLuminanceBefore,
      averageLuminanceAfter,
      tonalBalance: averageLuminanceAfter > averageLuminanceBefore ? 'lifted' : 'balanced'
    })
  });
}
