import { hashString, clamp01 } from './shared.js';

export const VOLUME_AMP_ID = 'pixelbrain.volume-amp';
export const VOLUME_AMP_VERSION = '1.0.0';

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

function multiplyRgb(rgb, factor) {
    return {
        r: clamp01((rgb.r / 255) * factor) * 255,
        g: clamp01((rgb.g / 255) * factor) * 255,
        b: clamp01((rgb.b / 255) * factor) * 255,
    };
}

export function buildVolumeAmpPayload(input = {}) {
  const { coordinates = [], materialId, intensityRatings = {}, vectorField = [], canvas = null } = input;
  
  let coreContainmentCount = 0;
  let bodySupportCount = 0;
  let volumeLiftCount = 0;
  let volumeDampenCount = 0;

  const vectorMap = new Map();
  vectorField.forEach(v => {
      vectorMap.set(`${v.x},${v.y}`, v);
  });

  const outputCoordinates = coordinates.map(coord => {
    if (!coord.color) return { ...coord };
    
    let rgb = parseHexColor(coord.color);
    const role = coord.colorIntensity?.role || 'neutral';
    const vectorData = vectorMap.get(`${coord.snappedX ?? coord.x},${coord.snappedY ?? coord.y}`);
    const isEdge = vectorData && vectorData.role === 'edge-flow';
    const isSpark = vectorData && vectorData.role === 'spark-drift';

    // Core rule: Reshape color/value relationships at the cell level.
    if (role === 'white_core') {
      // Keep core bright, maybe lift slightly to ensure mass distinction
      rgb = multiplyRgb(rgb, 1.05);
      coreContainmentCount++;
      volumeLiftCount++;
    } else if (isSpark) {
      // Sparks stay separate and punchy
      rgb = multiplyRgb(rgb, 1.1);
      volumeLiftCount++;
    } else if (isEdge) {
      // Edges contain shape, dampen slightly for weight
      rgb = multiplyRgb(rgb, 0.9);
      volumeDampenCount++;
    } else {
      // Body wraps around core
      bodySupportCount++;
    }
    
    return { 
        ...coord,
        color: rgbToHex(rgb),
        preVolumeColor: coord.color
    };
  });

  return Object.freeze({
    amp: VOLUME_AMP_ID,
    version: VOLUME_AMP_VERSION,
    coordinates: outputCoordinates,
    diagnostics: Object.freeze({
      coordinateCount: coordinates.length,
    }),
    metadata: Object.freeze({
      coreContainmentCount,
      bodySupportCount,
      volumeLiftCount,
      volumeDampenCount
    })
  });
}
