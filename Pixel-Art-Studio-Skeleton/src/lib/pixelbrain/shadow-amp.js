import { hashString, clamp01 } from './shared.js';

export const SHADOW_AMP_ID = 'pixelbrain.shadow-amp';
export const SHADOW_AMP_VERSION = '1.0.0';

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

export function buildShadowAmpPayload(input = {}) {
  const { coordinates = [], materialId, intensityRatings = {}, vectorField = [], canvas = null } = input;
  
  let changedCount = 0;
  let edgeShadowCount = 0;
  let pocketShadowCount = 0;
  let preservedCoreCount = 0;
  
  const vectorMap = new Map();
  vectorField.forEach(v => {
      vectorMap.set(`${v.x},${v.y}`, v);
  });

  const outputCoordinates = coordinates.map(coord => {
    if (!coord.color) return { ...coord };
    
    const role = coord.colorIntensity?.role || 'neutral';
    
    // Core rule: Never darken core, glow, or spark cells blindly. Protect important light.
    if (role === 'white_core' || role === 'hot_chroma') {
      preservedCoreCount++;
      return { ...coord };
    }

    const vectorData = vectorMap.get(`${coord.snappedX ?? coord.x},${coord.snappedY ?? coord.y}`);
    let rgb = parseHexColor(coord.color);
    let modified = false;

    // Darken silhouette edges
    if (vectorData && vectorData.role === 'edge-flow') {
        rgb = mixRgb(rgb, {r: 0, g: 0, b: 0}, 0.25); // Darken 25% towards black
        edgeShadowCount++;
        modified = true;
    }
    // Darken lower value support cells (pockets/shadows)
    else if (role === 'black_anchor' || role === 'cold_chroma') {
        rgb = mixRgb(rgb, {r: 0, g: 0, b: 0}, 0.15); // Darken pockets
        pocketShadowCount++;
        modified = true;
    }

    if (modified) {
        changedCount++;
        return {
            ...coord,
            color: rgbToHex(rgb),
            preShadowColor: coord.color
        };
    }
    
    return { ...coord };
  });

  return Object.freeze({
    amp: SHADOW_AMP_ID,
    version: SHADOW_AMP_VERSION,
    coordinates: outputCoordinates,
    diagnostics: Object.freeze({
      coordinateCount: coordinates.length,
    }),
    metadata: Object.freeze({
      changedCount,
      edgeShadowCount,
      pocketShadowCount,
      preservedCoreCount
    })
  });
}
