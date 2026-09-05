import { clamp01, clampNumber, hashString } from './shared.js';
import { resolveMaterialId, SOURCE_MATERIAL } from './material-registry.js';

export const FLAME_TIP_AMP_ID = 'pixelbrain.flame-tip-amp';
export const FLAME_TIP_AMP_VERSION = '1.0.0';

const DEFAULT_OPTIONS = Object.freeze({
  enabled: true,
  topRegionFraction: 0.32,
  apexCoreGuard: 0.18,
  tipCoreLuminance: 0.94,
  tipEdgeLuminance: 0.62,
  taperShoulderLuminance: 0.78,
  bodyPassthrough: true,
  taperPower: 1.618033988749895,
  baseTipRadius: 0.18,
  maxBaseTipRadius: 0.55,
  sourceConservative: true,
});

const MATERIAL_TIP_ANCHORS = Object.freeze({
  icy_fire: Object.freeze({
    profile: 'narrow',
    tipCore: '#F8FCFF',
    tipEdge: '#0EA5E9',
    taperShoulder: '#7DD3FC',
    taperPower: 1.7,
    baseTipRadius: 0.16,
  }),
  holy_fire: Object.freeze({
    profile: 'normal',
    tipCore: '#FFFBEB',
    tipEdge: '#F59E0B',
    taperShoulder: '#FDE68A',
    taperPower: 1.55,
    baseTipRadius: 0.22,
  }),
  shadow_fire: Object.freeze({
    profile: 'wide',
    tipCore: '#FAF5FF',
    tipEdge: '#7C3AED',
    taperShoulder: '#A78BFA',
    taperPower: 1.35,
    baseTipRadius: 0.28,
  }),
  void_ice: Object.freeze({
    profile: 'narrow',
    tipCore: '#EEF2FF',
    tipEdge: '#3730A3',
    taperShoulder: '#A5B4FC',
    taperPower: 1.75,
    baseTipRadius: 0.14,
  }),
  poison_flame: Object.freeze({
    profile: 'normal',
    tipCore: '#F0FDF4',
    tipEdge: '#22C55E',
    taperShoulder: '#86EFAC',
    taperPower: 1.45,
    baseTipRadius: 0.24,
  }),
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

function mixRgb(a, b, amount) {
  const t = clamp01(amount);
  return {
    r: a.r + ((b.r - a.r) * t),
    g: a.g + ((b.g - a.g) * t),
    b: a.b + ((b.b - a.b) * t),
  };
}

function luminance(rgb) {
  if (!rgb) return 0;
  return clamp01(((0.2126 * rgb.r) + (0.7152 * rgb.g) + (0.0722 * rgb.b)) / 255);
}

function resolveOptions(options = {}) {
  return Object.freeze({
    ...DEFAULT_OPTIONS,
    ...options,
    topRegionFraction: clampNumber(toFiniteNumber(options.topRegionFraction, DEFAULT_OPTIONS.topRegionFraction), 0.05, 0.85),
    taperPower: clampNumber(toFiniteNumber(options.taperPower, DEFAULT_OPTIONS.taperPower), 0.5, 4.0),
    baseTipRadius: clampNumber(toFiniteNumber(options.baseTipRadius, DEFAULT_OPTIONS.baseTipRadius), 0.0, DEFAULT_OPTIONS.maxBaseTipRadius),
  });
}

function resolveAnchors(material) {
  return MATERIAL_TIP_ANCHORS[resolveMaterialId(material)] || null;
}

function computeBoundingBox(coordinates) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const coord of coordinates) {
    if (!coord || typeof coord !== 'object') continue;
    const x = Math.round(toFiniteNumber(coord.snappedX ?? coord.x, 0));
    const y = Math.round(toFiniteNumber(coord.snappedY ?? coord.y, 0));
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    return null;
  }
  return { minX, maxX, minY, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function rowCenterline(coordinates, minX, maxX, y) {
  let sumX = 0;
  let count = 0;
  for (const coord of coordinates) {
    if (!coord || typeof coord !== 'object') continue;
    const cx = Math.round(toFiniteNumber(coord.snappedX ?? coord.x, 0));
    const cy = Math.round(toFiniteNumber(coord.snappedY ?? coord.y, 0));
    if (cy !== y) continue;
    if (cx < minX || cx > maxX) continue;
    sumX += cx;
    count += 1;
  }
  return count === 0 ? null : sumX / count;
}

function rowHalfWidth(coordinates, minX, maxX, y, centerline) {
  if (centerline === null) return 0;
  let maxAbs = 0;
  for (const coord of coordinates) {
    if (!coord || typeof coord !== 'object') continue;
    const cx = Math.round(toFiniteNumber(coord.snappedX ?? coord.x, 0));
    const cy = Math.round(toFiniteNumber(coord.snappedY ?? coord.y, 0));
    if (cy !== y) continue;
    if (cx < minX || cx > maxX) continue;
    const delta = Math.abs(cx - centerline);
    if (delta > maxAbs) maxAbs = delta;
  }
  return Math.max(maxAbs, 0);
}

function buildTaperField(coordinates, boundingBox, options, anchors) {
  if (!boundingBox) return [];
  const { minX, maxX, minY, maxY, height } = boundingBox;
  const taperPower = anchors?.taperPower ?? options.taperPower;
  const baseTipRadius = anchors?.baseTipRadius ?? options.baseTipRadius;

  const topRegionHeight = Math.max(1, Math.round(height * options.topRegionFraction));
  const topRegionYMin = minY;
  const topRegionYMax = Math.min(maxY, minY + topRegionHeight - 1);

  const taperEnvelope = new Map();
  for (let y = topRegionYMin; y <= topRegionYMax; y += 1) {
    const tHeight = topRegionHeight > 1 ? (y - topRegionYMin) / (topRegionHeight - 1) : 0;
    const inverted = 1 - tHeight;
    const taperFactor = Math.pow(Math.max(inverted, 0), taperPower);
    const localCenterline = rowCenterline(coordinates, minX, maxX, y);
    const localHalfWidth = rowHalfWidth(coordinates, minX, maxX, y, localCenterline);
    const localWidth = (localHalfWidth * 2) + 1;
    const expectedHalfWidth = Math.max(0.5, localHalfWidth * taperFactor + (baseTipRadius * 1.5 * (1 - tHeight)));
    const apexX = localCenterline !== null ? Math.round(localCenterline) : Math.round((minX + maxX) / 2);
    taperEnvelope.set(y, {
      y,
      tHeight,
      centerline: localCenterline,
      apexX,
      localWidth,
      expectedHalfWidth,
      taperRatio: localHalfWidth === 0 ? 0 : expectedHalfWidth / localHalfWidth,
    });
  }

  return { topRegionYMin, topRegionYMax, taperEnvelope, taperPower, baseTipRadius };
}

function classifyTipRole(coord, taperContext) {
  if (!taperContext) return { role: 'body', tHeight: null, taperRatio: null };
  const x = Math.round(toFiniteNumber(coord?.snappedX ?? coord?.x, 0));
  const y = Math.round(toFiniteNumber(coord?.snappedY ?? coord?.y, 0));
  const { topRegionYMin, topRegionYMax, taperEnvelope } = taperContext;
  if (y < topRegionYMin || y > topRegionYMax) {
    return { role: 'body', tHeight: null, taperRatio: null };
  }
  const envelope = taperEnvelope.get(y);
  if (!envelope || envelope.centerline === null) {
    return { role: 'tip-edge', tHeight: envelope ? envelope.tHeight : null, taperRatio: 0 };
  }
  const distanceFromCenter = Math.abs(x - envelope.centerline);
  const normalizedOffset = envelope.expectedHalfWidth > 0
    ? distanceFromCenter / envelope.expectedHalfWidth
    : (distanceFromCenter > 0 ? Infinity : 0);
  const isApex = y === topRegionYMax && distanceFromCenter <= 0.5;
  const isWithinEnvelope = normalizedOffset <= 1.0;
  const isCenterline = distanceFromCenter <= 0.5;
  let role = 'tip-edge';
  if (isApex && isCenterline) role = 'tip-core';
  else if (isWithinEnvelope && isCenterline) role = 'tip-core';
  else if (isWithinEnvelope) role = 'taper-shoulder';
  return { role, tHeight: envelope.tHeight, taperRatio: envelope.taperRatio };
}

function applyTipRule(coord, context) {
  if (!coord || typeof coord !== 'object') return coord;
  const rgb = parseHexColor(coord.color);
  if (!rgb) return coord;
  const { classification, anchors, options, materialId, vectorData, intensityRole } = context;
  const luma = luminance(rgb);
  const intensity = coord.colorIntensity?.rating;
  const intensityGuard = typeof intensity === 'number' && intensity >= options.tipCoreLuminance;

  if (materialId === SOURCE_MATERIAL) {
    if (!options.sourceConservative) return { ...coord };
    if (classification.role === 'body') return { ...coord };
    if (luma < 0.06) return { ...coord };
    let nextSourceRgb = rgb;
    if (classification.role === 'tip-core') {
      nextSourceRgb = mixRgb(rgb, { r: 255, g: 255, b: 255 }, 0.08);
    } else if (classification.role === 'taper-shoulder') {
      nextSourceRgb = mixRgb(rgb, { r: 0, g: 0, b: 0 }, 0.04);
    } else {
      nextSourceRgb = mixRgb(rgb, { r: 0, g: 0, b: 0 }, 0.08);
    }
    return {
      ...coord,
      color: rgbToHex(nextSourceRgb),
      preFlameTipColor: coord.color,
      flameTipRole: classification.role,
      flameTipMaterial: materialId,
    };
  }

  if (!anchors) {
    if (classification.role === 'body') return { ...coord };
    return { ...coord };
  }

  const tipCoreRgb = parseHexColor(anchors.tipCore);
  const tipEdgeRgb = parseHexColor(anchors.tipEdge);
  const shoulderRgb = parseHexColor(anchors.taperShoulder);

  const isProtectedHighlight = intensityRole === 'white_core' || luma >= options.tipCoreLuminance || intensityGuard;
  const isProtectedBody = !vectorData || vectorData.role !== 'spark-drift';

  let nextRgb = rgb;
  if (classification.role === 'body') {
    if (!options.bodyPassthrough) return { ...coord };
    return {
      ...coord,
      preFlameTipColor: coord.color,
      flameTipRole: 'body',
      flameTipMaterial: materialId,
    };
  }

  if (classification.role === 'tip-core') {
    if (isProtectedHighlight) {
      nextRgb = isProtectedBody ? mixRgb(rgb, tipCoreRgb, 0.22) : mixRgb(rgb, tipCoreRgb, 0.12);
    } else {
      nextRgb = mixRgb(rgb, tipCoreRgb, 0.18);
    }
  } else if (classification.role === 'taper-shoulder') {
    if (isProtectedHighlight) {
      nextRgb = mixRgb(rgb, shoulderRgb, 0.08);
    } else {
      nextRgb = mixRgb(rgb, shoulderRgb, 0.16);
    }
  } else {
    if (isProtectedHighlight) {
      nextRgb = mixRgb(rgb, tipEdgeRgb, 0.05);
    } else {
      nextRgb = mixRgb(rgb, tipEdgeRgb, 0.22);
    }
  }

  return {
    ...coord,
    color: rgbToHex(nextRgb),
    preFlameTipColor: coord.color,
    flameTipRole: classification.role,
    flameTipMaterial: materialId,
    flameTipTHeight: classification.tHeight === null ? null : Number(classification.tHeight.toFixed(4)),
    flameTipTaperRatio: classification.taperRatio === null ? null : Number(classification.taperRatio.toFixed(4)),
  };
}

export function applyFlameTipGeometry(coordinates, options = {}) {
  if (!Array.isArray(coordinates)) return [];
  const resolvedOptions = resolveOptions(options);
  const materialId = resolveMaterialId(options.material || options.materialId || SOURCE_MATERIAL);
  const anchors = resolveAnchors(materialId);

  if (!resolvedOptions.enabled || coordinates.length === 0) {
    return coordinates.map((coord) => ({
      ...coord,
      flameTipRole: 'body',
      flameTipMaterial: materialId,
    }));
  }

  const boundingBox = computeBoundingBox(coordinates);
  if (!boundingBox) {
    return coordinates.map((coord) => ({
      ...coord,
      flameTipRole: 'body',
      flameTipMaterial: materialId,
    }));
  }
  const taperContext = buildTaperField(coordinates, boundingBox, resolvedOptions, anchors);

  const vectorMap = new Map();
  if (options.vectorField && Array.isArray(options.vectorField)) {
    for (const v of options.vectorField) {
      if (!v) continue;
      vectorMap.set(`${v.x},${v.y}`, v);
    }
  }

  return coordinates.map((coord) => {
    const key = coordinateKey(coord);
    const vectorData = vectorMap.get(key) || null;
    const intensityRole = coord?.colorIntensity?.role || 'neutral';
    const classification = classifyTipRole(coord, taperContext);
    return applyTipRule(coord, {
      classification,
      anchors,
      options: resolvedOptions,
      materialId,
      vectorData,
      intensityRole,
    });
  });
}

export function buildFlameTipAmpPayload({
  coordinates = [],
  materialId = SOURCE_MATERIAL,
  vectorField = [],
  intensityRatings: _intensityRatings = {},
  canvas = null,
  options = {},
  intent = 'shape_flame_tip_taper',
} = {}) {
  const resolvedMaterial = resolveMaterialId(materialId);
  const resolvedOptions = resolveOptions(options);
  const anchors = resolveAnchors(resolvedMaterial);

  const vectorMap = new Map();
  if (Array.isArray(vectorField)) {
    for (const v of vectorField) {
      if (!v) continue;
      vectorMap.set(`${v.x},${v.y}`, v);
    }
  }

  const boundingBox = computeBoundingBox(coordinates);
  const taperContext = boundingBox
    ? buildTaperField(coordinates, boundingBox, resolvedOptions, anchors)
    : null;

  let tipCoreCount = 0;
  let tipEdgeCount = 0;
  let taperShoulderCount = 0;
  let bodyCount = 0;
  let preservedHighlightCount = 0;
  let totalTaperRatio = 0;
  let ratioSamples = 0;
  let changedCount = 0;

  const taperField = [];
  const outputCoordinates = coordinates.map((coord) => {
    const key = coordinateKey(coord);
    const vectorData = vectorMap.get(key) || null;
    const intensityRole = coord?.colorIntensity?.role || 'neutral';
    const classification = classifyTipRole(coord, taperContext);
    if (classification.role === 'tip-core') tipCoreCount += 1;
    else if (classification.role === 'taper-shoulder') taperShoulderCount += 1;
    else if (classification.role === 'tip-edge') tipEdgeCount += 1;
    else bodyCount += 1;
    if (classification.taperRatio !== null && Number.isFinite(classification.taperRatio)) {
      totalTaperRatio += classification.taperRatio;
      ratioSamples += 1;
    }
    const next = applyTipRule(coord, {
      classification,
      anchors,
      options: resolvedOptions,
      materialId: resolvedMaterial,
      vectorData,
      intensityRole,
    });
    if (intensityRole === 'white_core' && next.flameTipRole && next.flameTipRole !== 'body') {
      preservedHighlightCount += 1;
    }
    if (next.preFlameTipColor && next.color !== next.preFlameTipColor) {
      changedCount += 1;
    }
    taperField.push({
      x: Math.round(toFiniteNumber(coord?.snappedX ?? coord?.x, 0)),
      y: Math.round(toFiniteNumber(coord?.snappedY ?? coord?.y, 0)),
      role: classification.role,
      tHeight: classification.tHeight === null ? null : Number(classification.tHeight.toFixed(4)),
      taperRatio: classification.taperRatio === null ? null : Number(classification.taperRatio.toFixed(4)),
    });
    return next;
  });

  const taperProfile = anchors?.profile || 'normal';
  const averageTaperRatio = ratioSamples > 0 ? totalTaperRatio / ratioSamples : 0;

  return Object.freeze({
    amp: FLAME_TIP_AMP_ID,
    version: FLAME_TIP_AMP_VERSION,
    intent,
    material: resolvedMaterial,
    inputHash: hashString(JSON.stringify(coordinates.map((coord) => [coord?.x, coord?.y, coord?.color]))).toString(16),
    canvas,
    sourceCoordinates: coordinates,
    outputCoordinates,
    taperField: Object.freeze(taperField),
    diagnostics: Object.freeze({
      coordinateCount: coordinates.length,
      changedCount,
      enabled: resolvedOptions.enabled,
    }),
    metadata: Object.freeze({
      tipCoreCount,
      tipEdgeCount,
      taperShoulderCount,
      bodyCount,
      preservedHighlightCount,
      topRegionYMin: taperContext ? taperContext.topRegionYMin : null,
      topRegionYMax: taperContext ? taperContext.topRegionYMax : null,
      boundingBox: boundingBox || null,
      taperProfile,
      taperPower: anchors?.taperPower ?? resolvedOptions.taperPower,
      baseTipRadius: anchors?.baseTipRadius ?? resolvedOptions.baseTipRadius,
      averageTaperRatio: Number(averageTaperRatio.toFixed(4)),
    }),
  });
}
