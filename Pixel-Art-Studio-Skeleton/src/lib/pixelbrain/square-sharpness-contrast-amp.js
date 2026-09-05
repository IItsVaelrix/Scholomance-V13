import { clamp01, hashString } from './shared.js';
import { MATERIAL_PALETTES, SOURCE_MATERIAL, resolveMaterialId } from './material-registry.js';

export const SQUARE_SHARPNESS_CONTRAST_AMP_ID = 'square-sharpness-contrast';
export const SQUARE_SHARPNESS_CONTRAST_VERSION = '0.2.0';

// Edge anchors are derived from the material registry's palette anchors, so
// every registered material (flame, gemstone, metal) gets HD edge support
// without a parallel hand-maintained table.
const MATERIAL_EDGE_ANCHORS = Object.freeze(
  Object.fromEntries(
    Object.entries(MATERIAL_PALETTES)
      .filter(([id, definition]) => id !== SOURCE_MATERIAL && definition.anchors?.body)
      .map(([id, definition]) => [id, Object.freeze({
        edge: definition.anchors.void,
        shadow: definition.anchors.shadow,
        body: definition.anchors.body,
        support: definition.anchors.frost,
        highlight: definition.anchors.whiteCore,
      })]),
  ),
);

const DEFAULT_OPTIONS = Object.freeze({
  enabled: true,
  neighborRadius: 1,
  edgeContrast: 0.42,
  interiorContrast: 0.16,
  highlightGuard: 0.88,
  shadowGuard: 0.14,
  midtoneSupport: 0.22,
  isolatedEmphasisScale: 0.45,
  isolatedAccentIntensity: 0.7,
  sourceMaterialContrast: 0.08,
});

function toFiniteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function coordinateKey(coord) {
  const x = Math.round(toFiniteNumber(coord?.snappedX ?? coord?.x, 0));
  const y = Math.round(toFiniteNumber(coord?.snappedY ?? coord?.y, 0));
  return `${x},${y}`;
}

function parseHexColor(hex) {
  const raw = String(hex || '').trim().replace('#', '');
  const normalized = raw.length === 3
    ? raw.split('').map((char) => `${char}${char}`).join('')
    : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return null;
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

function luminance(rgb) {
  if (!rgb) return 0;
  return clamp01(((0.2126 * rgb.r) + (0.7152 * rgb.g) + (0.0722 * rgb.b)) / 255);
}

function saturation(rgb) {
  if (!rgb) return 0;
  const max = Math.max(rgb.r, rgb.g, rgb.b) / 255;
  const min = Math.min(rgb.r, rgb.g, rgb.b) / 255;
  if (max === 0) return 0;
  return clamp01((max - min) / max);
}

function fallbackIntensityRating(rgb, luma) {
  const sat = saturation(rgb);
  const whiteCoreScore = luma >= 0.82 ? (luma - 0.82) / 0.18 : 0;
  const blackAnchorScore = luma <= 0.12 ? (0.12 - luma) / 0.12 : 0;
  return clamp01(Math.max(whiteCoreScore, blackAnchorScore, sat * 0.88));
}

function mixRgb(a, b, amount) {
  const t = clamp01(amount);
  return {
    r: a.r + ((b.r - a.r) * t),
    g: a.g + ((b.g - a.g) * t),
    b: a.b + ((b.b - a.b) * t),
  };
}

function contrastRgb(rgb, amount) {
  const factor = 1 + amount;
  return {
    r: 128 + ((rgb.r - 128) * factor),
    g: 128 + ((rgb.g - 128) * factor),
    b: 128 + ((rgb.b - 128) * factor),
  };
}

function getNeighborStats(coord, coordinateMap, radius) {
  const x = Math.round(toFiniteNumber(coord?.snappedX ?? coord?.x, 0));
  const y = Math.round(toFiniteNumber(coord?.snappedY ?? coord?.y, 0));
  const neighborLumas = [];
  let cardinalCount = 0;
  let diagonalCount = 0;
  let missingCardinalCount = 0;

  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const isCardinal = Math.abs(dx) + Math.abs(dy) === 1;
      const neighbor = coordinateMap.get(`${x + dx},${y + dy}`);
      if (!neighbor) {
        if (isCardinal) missingCardinalCount += 1;
        continue;
      }
      const rgb = parseHexColor(neighbor.color);
      neighborLumas.push(luminance(rgb));
      if (isCardinal) cardinalCount += 1;
      else diagonalCount += 1;
    }
  }

  const averageNeighborLuma = neighborLumas.length
    ? neighborLumas.reduce((sum, value) => sum + value, 0) / neighborLumas.length
    : null;

  return {
    cardinalCount,
    diagonalCount,
    totalCount: cardinalCount + diagonalCount,
    missingCardinalCount,
    averageNeighborLuma,
  };
}

function resolveOptions(options = {}) {
  return Object.freeze({
    ...DEFAULT_OPTIONS,
    ...options,
    neighborRadius: Math.max(1, Math.round(toFiniteNumber(options.neighborRadius, DEFAULT_OPTIONS.neighborRadius))),
  });
}

function resolveAnchors(material) {
  return MATERIAL_EDGE_ANCHORS[resolveMaterialId(material)] || null;
}

function enhanceCoordinate(coord, context) {
  if (!coord || typeof coord !== 'object') return coord;
  const rgb = parseHexColor(coord.color);
  if (!rgb) return coord;

  const { materialId, options, coordinateMap } = context;
  const anchors = resolveAnchors(materialId);
  const stats = getNeighborStats(coord, coordinateMap, options.neighborRadius);
  const luma = luminance(rgb);
  const neighborDelta = stats.averageNeighborLuma === null ? 0 : Math.abs(luma - stats.averageNeighborLuma);
  const isSilhouetteEdge = stats.missingCardinalCount > 0;
  const isIsolated = stats.totalCount <= 1;
  const isHighlight = luma >= options.highlightGuard;
  const isShadow = luma <= options.shadowGuard;
  const nearHighlight = stats.averageNeighborLuma !== null && stats.averageNeighborLuma >= options.highlightGuard;
  const intensityRating = clamp01(toFiniteNumber(
    coord.colorIntensity?.rating,
    fallbackIntensityRating(rgb, luma),
  ));
  const isIsolatedAccent = isIsolated && intensityRating >= options.isolatedAccentIntensity;

  let nextRgb = rgb;
  let emphasis = clamp01(toFiniteNumber(coord.emphasis, 1));
  const source = coord.squareAmpSource || coord.source;

  if (materialId === SOURCE_MATERIAL || !anchors) {
    const genericAmount = isSilhouetteEdge ? options.sourceMaterialContrast : options.sourceMaterialContrast * 0.5;
    nextRgb = contrastRgb(rgb, genericAmount + (neighborDelta * 0.12));
  } else if (isHighlight) {
    nextRgb = mixRgb(rgb, parseHexColor(anchors.highlight), 0.18);
    emphasis = Math.max(emphasis, 0.86);
  } else if (isSilhouetteEdge) {
    const target = isShadow ? anchors.edge : anchors.shadow;
    nextRgb = mixRgb(rgb, parseHexColor(target), options.edgeContrast);
    emphasis = Math.max(emphasis, 0.68);
  } else if (nearHighlight && !isHighlight) {
    nextRgb = mixRgb(rgb, parseHexColor(anchors.support), options.midtoneSupport);
  } else {
    nextRgb = contrastRgb(rgb, options.interiorContrast + (neighborDelta * 0.18));
    if (!isShadow && luma < 0.58) {
      nextRgb = mixRgb(nextRgb, parseHexColor(anchors.body), 0.08);
    }
  }

  if (isIsolated && !isHighlight && !isIsolatedAccent) {
    emphasis = Math.max(0.08, emphasis * options.isolatedEmphasisScale);
  } else if (isIsolatedAccent) {
    emphasis = Math.max(emphasis, 0.72 + (intensityRating * 0.18));
  }

  // Consume color intensity rating if present
  if (coord.colorIntensity?.rating !== undefined) {
    const intensity = intensityRating;
    if (intensity > 0.7) {
      // High intensity gets slightly more emphasis or contrast
      emphasis = Math.max(emphasis, 0.5 + (intensity * 0.4));
    } else if (intensity < 0.25) {
      // Muted gets slightly less emphasis
      emphasis = emphasis * 0.8;
    }
  }

  return {
    ...coord,
    source,
    color: rgbToHex(nextRgb),
    preSquareColor: coord.preSquareColor || coord.color,
    squareAmp: SQUARE_SHARPNESS_CONTRAST_AMP_ID,
    squareAmpMaterial: materialId,
    squareAmpClass: [
      isHighlight ? 'highlight' : null,
      isShadow ? 'shadow' : null,
      isSilhouetteEdge ? 'edge' : null,
      isIsolated ? 'isolated' : null,
      isIsolatedAccent ? 'isolated-accent' : null,
      nearHighlight ? 'near-highlight' : null,
    ].filter(Boolean).join('|') || 'interior',
    localContrastDelta: Number(neighborDelta.toFixed(4)),
    squareAmpIntensityRating: Number(intensityRating.toFixed(4)),
    emphasis,
  };
}

export function enhanceSquaresForRender(coordinates, options = {}) {
  if (!Array.isArray(coordinates)) return [];
  const resolvedOptions = resolveOptions(options);
  if (!resolvedOptions.enabled) return coordinates.map((coord) => ({ ...coord }));

  const materialId = resolveMaterialId(options.material || options.materialId || SOURCE_MATERIAL);
  const coordinateMap = new Map();
  coordinates.forEach((coord) => {
    if (coord && typeof coord === 'object') coordinateMap.set(coordinateKey(coord), coord);
  });

  return coordinates.map((coord) => enhanceCoordinate(coord, {
    materialId,
    options: resolvedOptions,
    coordinateMap,
  }));
}

export function buildSquareSharpnessContrastPayload({
  coordinates = [],
  material = SOURCE_MATERIAL,
  canvas = null,
  options = {},
  intent = 'enhance_square_render_readability',
} = {}) {
  const materialId = resolveMaterialId(material);
  const outputCoordinates = enhanceSquaresForRender(coordinates, {
    ...options,
    material: materialId,
  });
  const changedCount = outputCoordinates.reduce((count, coord, index) => (
    coord?.color !== coordinates[index]?.color || coord?.emphasis !== coordinates[index]?.emphasis
      ? count + 1
      : count
  ), 0);

  return Object.freeze({
    amp: SQUARE_SHARPNESS_CONTRAST_AMP_ID,
    version: SQUARE_SHARPNESS_CONTRAST_VERSION,
    intent,
    material: materialId,
    inputHash: hashString(JSON.stringify(coordinates.map((coord) => [coord?.x, coord?.y, coord?.color, coord?.emphasis]))).toString(16),
    canvas,
    sourceCoordinates: coordinates,
    outputCoordinates,
    diagnostics: Object.freeze({
      coordinateCount: coordinates.length,
      changedCount,
      enabled: options.enabled !== false,
    }),
  });
}
