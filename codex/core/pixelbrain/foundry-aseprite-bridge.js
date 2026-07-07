import {
  GRID_TYPES,
  importFromAseprite,
  validateAsepriteImportPayload,
} from './template-grid-engine.js';
import { createPixelBrainAssetPacket } from './pixelbrain-asset-packet.js';
import {
  decodeAsepriteBinary,
  encodeAsepriteBinary,
} from './aseprite-binary-codec.js';

export const FOUNDRY_ASEPRITE_BRIDGE_VERSION = '0.1.0';

function normalizeCoord(coord = {}) {
  const x = Math.round(Number(coord.snappedX ?? coord.x) || 0);
  const y = Math.round(Number(coord.snappedY ?? coord.y) || 0);
  return {
    ...coord,
    x,
    y,
    snappedX: x,
    snappedY: y,
    z: Number(coord.z) || 0,
    color: coord.color || '#FFFFFF',
    emphasis: Number.isFinite(Number(coord.emphasis)) ? Number(coord.emphasis) : 1,
  };
}

function sourceCoordinatesFromFoundry(foundry) {
  if (Array.isArray(foundry?.coordinates)) return foundry.coordinates;
  if (Array.isArray(foundry?.assetPacket?.geometry?.coordinates)) return foundry.assetPacket.geometry.coordinates;
  if (Array.isArray(foundry?.sharpness?.outputCoordinates)) return foundry.sharpness.outputCoordinates;
  if (Array.isArray(foundry?.fills?.coordinates)) return foundry.fills.coordinates;
  return [];
}

function sourceCanvasFromFoundry(foundry, coordinates) {
  const canvas = foundry?.assetPacket?.canvas || foundry?.spec?.canvas || foundry?.canvas;
  if (canvas?.width && canvas?.height) {
    return {
      width: Math.max(1, Math.round(Number(canvas.width))),
      height: Math.max(1, Math.round(Number(canvas.height))),
      cellSize: Math.max(1, Math.round(Number(canvas.cellSize ?? canvas.gridSize ?? 1))),
    };
  }

  const xs = coordinates.map((coord) => Number(coord.x) || 0);
  const ys = coordinates.map((coord) => Number(coord.y) || 0);
  return {
    width: Math.max(1, Math.max(...xs, 0) + 1),
    height: Math.max(1, Math.max(...ys, 0) + 1),
    cellSize: 1,
  };
}

function layerKeyForCoord(coord, options) {
  if (typeof options.layerBy === 'function') return options.layerBy(coord);
  if (options.layerBy === 'shield') {
    const partId = String(coord.partId || coord.part || '').toLowerCase();
    const motifRole = String(coord.motifRole || '').toLowerCase();
    const shading = String(coord.shading || '').toLowerCase();
    if (partId.includes('ring') || partId.includes('energy')) return '20_Energy';
    if (partId.includes('core') || partId.includes('emblem') || motifRole) return '30_Focal';
    if (shading === 'shade' || shading === 'shadow' || partId.includes('shade')) return '40_Shading';
    if (partId.includes('glow') || partId.includes('effect')) return '50_Glow_Effects';
    return '10_Structure';
  }
  if (options.layerBy === 'role') {
    if (coord.isRim) return 'rim';
    if (coord.isMotif) return `motif_${coord.motifRole || 'cell'}`;
    return coord.partId || coord.part || 'body';
  }
  if (options.layerBy === 'single') return options.layerName || 'Foundry Edit';
  return coord.partId || coord.part || (coord.isMotif ? 'motif' : 'foundry');
}

function sortCells(a, b) {
  if (a.y !== b.y) return a.y - b.y;
  if (a.x !== b.x) return a.x - b.x;
  return String(a.color).localeCompare(String(b.color));
}

function buildLayerCells(coordinates, options) {
  const layers = new Map();
  coordinates.forEach((rawCoord) => {
    const coord = normalizeCoord(rawCoord);
    const key = String(layerKeyForCoord(coord, options) || 'foundry');
    if (!layers.has(key)) layers.set(key, []);
    layers.get(key).push({
      x: coord.x,
      y: coord.y,
      color: coord.color,
      emphasis: coord.emphasis,
      metadata: {
        partId: coord.partId || null,
        slot: coord.slot || null,
        materialId: coord.materialId || coord.squareAmpMaterial || null,
        isRim: Boolean(coord.isRim),
        isMotif: Boolean(coord.isMotif),
        motifRole: coord.motifRole || null,
        source: coord.source || null,
      },
    });
  });

  return Array.from(layers.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, cells]) => ({
      name,
      cells: cells.sort(sortCells),
    }));
}

function isShieldLikeFoundry(foundry) {
  const candidates = [
    foundry?.spec?.class,
    foundry?.spec?.archetype,
    foundry?.assetPacket?.source?.id,
    foundry?.assetPacket?.source?.label,
    foundry?.assetPacket?.metadata?.compatibility?.spec?.class,
    foundry?.assetPacket?.metadata?.compatibility?.spec?.archetype,
  ].filter(Boolean).map((value) => String(value).toLowerCase());

  return candidates.some((value) => value.includes('shield') || value.includes('targe'));
}

function cellsForReference(coordinates) {
  return coordinates.map((coord) => ({
    x: coord.x,
    y: coord.y,
    color: coord.color,
    emphasis: Number.isFinite(Number(coord.emphasis)) ? Math.max(0.25, Math.min(0.45, Number(coord.emphasis))) : 0.35,
    metadata: {
      partId: coord.partId || null,
      source: 'foundry_reference',
      editable: false,
      role: 'reference',
    },
  })).sort(sortCells);
}

/**
 * Build bright construction guide cells for the 00_Reference layer.
 * Uses the microprocessor output when available (preferred over dimmed final art).
 */
function cellsForConstructionGuides(constructionResult, fallbackCoordinates) {
  if (constructionResult && Array.isArray(constructionResult.referenceCells) && constructionResult.referenceCells.length > 0) {
    return constructionResult.referenceCells.map((c) => ({
      x: c.x,
      y: c.y,
      color: c.color || '#00E5FF',
      emphasis: Math.max(0.15, Math.min(0.35, c.emphasis ?? 0.22)),
      metadata: {
        partId: 'reference',
        role: 'construction',
        source: 'construction-line-microprocessor',
        editable: false,
        ringRole: c.ringRole || null,
        isGuide: true,
      },
    })).sort(sortCells);
  }
  // Fallback to old dimmed final (for backward compat when no construction)
  return cellsForReference(fallbackCoordinates);
}

function buildShieldEditorialLayers(layers, coordinates, constructionResult = null) {
  const byName = new Map(layers.map((layer) => [layer.name, layer]));
  const refCells = cellsForConstructionGuides(constructionResult, coordinates);

  const editorialLayers = [
    {
      name: '00_Reference',
      opacity: 72,
      visible: true,
      editable: false,
      locked: true,
      role: 'reference',
      cells: refCells,
    },
    byName.get('10_Structure') || { name: '10_Structure', cells: [] },
    byName.get('20_Energy') || { name: '20_Energy', group: true, cells: [] },
    byName.get('30_Focal') || { name: '30_Focal', cells: [] },
    byName.get('40_Shading') || { name: '40_Shading', cells: [] },
    byName.get('50_Glow_Effects') || { name: '50_Glow_Effects', cells: [] },
    {
      name: '99_Final',
      opacity: 255,
      visible: false,
      editable: false,
      locked: true,
      role: 'final-preview',
      cells: coordinates.map((coord) => ({
        x: coord.x,
        y: coord.y,
        color: coord.color,
        emphasis: coord.emphasis,
        metadata: {
          partId: coord.partId || null,
          source: 'foundry_final_preview',
          editable: false,
          role: 'final-preview',
        },
      })).sort(sortCells),
    },
  ];

  return editorialLayers.map((layer) => ({
    opacity: layer.opacity ?? 255,
    visible: layer.visible ?? true,
    editable: layer.editable ?? true,
    locked: layer.locked ?? false,
    role: layer.role || null,
    ...layer,
    cells: Array.isArray(layer.cells) ? layer.cells : [],
  }));
}

export function exportFoundryToAseprite(foundry, options = {}) {
  const sourceCoordinates = sourceCoordinatesFromFoundry(foundry);
  const coordinates = sourceCoordinates.map(normalizeCoord);
  const canvas = sourceCanvasFromFoundry(foundry, coordinates);
  const layerBy = options.layerBy || (isShieldLikeFoundry(foundry) ? 'shield' : 'part');
  const rawLayers = buildLayerCells(coordinates, {
    layerBy,
    layerName: options.layerName,
  });
  // Pass construction result if present in the foundry bundle (from item-foundry SketchAMP stage)
  let constructionResult = null;
  if (foundry?.construction && Array.isArray(foundry.construction.referenceCells)) {
    constructionResult = foundry.construction;
  } else if (foundry?.assetPacket?.metadata?.constructionHints && foundry.construction) {
    constructionResult = foundry.construction;
  }
  const layers = layerBy === 'shield' ? buildShieldEditorialLayers(rawLayers, coordinates, constructionResult) : rawLayers;
  const spec = foundry?.spec || foundry?.assetPacket?.metadata?.compatibility?.spec || null;
  const id = options.id || foundry?.spec?.id || foundry?.assetPacket?.source?.id || 'foundry-asset';
  const paletteColors = Array.from(new Set(coordinates.map((coord) => String(coord.color).toUpperCase()))).sort();

  return {
    version: `foundry-aseprite-bridge/${FOUNDRY_ASEPRITE_BRIDGE_VERSION}`,
    width: canvas.width,
    height: canvas.height,
    cellSize: canvas.cellSize,
    gridType: GRID_TYPES.RECTANGULAR,
    snapStrength: 1,
    colorMode: 'indexed',
    frames: [{
      frame: 0,
      duration: Number(options.duration) || 100,
      layers,
    }],
    anchorPoints: [],
    symmetryAxes: [],
    palette: {
      source: 'foundry',
      mode: 'indexed',
      locked: true,
      transparentIndex: 0,
      colors: paletteColors,
    },
    meta: {
      bridge: 'foundry-aseprite',
      bridgeVersion: FOUNDRY_ASEPRITE_BRIDGE_VERSION,
      id,
      sourceKind: foundry?.assetPacket ? 'foundry-bundle' : 'foundry-coordinates',
      editable: true,
      pixelPerfect: true,
      grid: {
        width: 1,
        height: 1,
      },
      layerConvention: layerBy === 'shield' ? 'shield-energy-v1' : 'foundry-part-v1',
      roundTrip: {
        importFunction: 'importAsepriteToFoundryAsset',
        preserves: ['x', 'y', 'color', 'emphasis', 'layer.name', 'cell.metadata'],
      },
      spec: spec ? {
        id: spec.id || foundry?.spec?.id || null,
        hash: foundry?.assetPacket?.metadata?.compatibility?.spec?.hash || spec.hash || null,
        class: foundry?.spec?.class || null,
        archetype: foundry?.spec?.archetype || null,
      } : null,
    },
  };
}

export function exportFoundryToAsepriteBinary(foundry, options = {}) {
  return encodeAsepriteBinary(exportFoundryToAseprite(foundry, options));
}

export function decodeFoundryAsepriteBinary(buffer) {
  return decodeAsepriteBinary(buffer);
}

export function importAsepriteBinaryToFoundryAsset(buffer, options = {}) {
  return importAsepriteToFoundryAsset(decodeFoundryAsepriteBinary(buffer), options);
}

export function importAsepriteToFoundryAsset(payload, options = {}) {
  const validation = validateAsepriteImportPayload(payload, options);
  if (!validation.ok) {
    return {
      ok: false,
      error: validation.error,
      details: validation.details || [],
      warnings: validation.warnings || [],
    };
  }

  const grid = importFromAseprite(payload, options);
  if (!grid.ok) {
    return {
      ok: false,
      error: grid.error || 'IMPORT_FAILED',
      details: grid.details || [],
      warnings: grid.warnings || [],
    };
  }

  const coordinates = [];
  const sourcePalette = new Set();
  payload.frames[0].layers.forEach((layer, layerIndex) => {
    const layerName = String(layer.name || '');
    if (layer.editable === false || layer.role === 'reference' || layer.role === 'final-preview') return;
    if (layerName.startsWith('00_Reference') || layerName.startsWith('99_Final')) return;
    layer.cells.forEach((cell) => {
      if (cell.metadata?.editable === false || cell.metadata?.role === 'reference' || cell.metadata?.role === 'final-preview') return;
      const coord = normalizeCoord({
        ...cell,
        z: layerIndex,
        partId: cell.metadata?.partId || layer.name,
        slot: cell.metadata?.slot || null,
        materialId: cell.metadata?.materialId || null,
        isRim: Boolean(cell.metadata?.isRim),
        isMotif: Boolean(cell.metadata?.isMotif),
        motifRole: cell.metadata?.motifRole || null,
        source: 'aseprite_manual_edit',
      });
      coordinates.push(coord);
      sourcePalette.add(String(coord.color).toUpperCase());
    });
  });

  const assetPacket = createPixelBrainAssetPacket({
    id: options.assetId || `${payload.meta?.id || 'foundry'}-aseprite-edit`,
    source: {
      kind: 'aseprite-manual-edit',
      id: payload.meta?.id || null,
      label: options.label || `${payload.meta?.id || 'Foundry'} Aseprite Edit`,
    },
    canvas: {
      width: payload.width,
      height: payload.height,
      cellSize: payload.cellSize,
      gridSize: payload.cellSize,
      transparent: true,
    },
    coordinates,
    palettes: [{
      key: 'aseprite_manual_edit',
      colors: Array.from(sourcePalette),
      source: 'aseprite',
    }],
    bytecode: options.bytecode || '',
    material: options.material || 'source',
    metadata: {
      tags: ['foundry', 'aseprite', 'manual-edit'],
      compatibility: {
        bridge: 'foundry-aseprite',
        bridgeVersion: FOUNDRY_ASEPRITE_BRIDGE_VERSION,
        sourceMeta: payload.meta || {},
      },
    },
    provenance: {
      createdBy: 'foundry-aseprite-bridge',
      operations: ['import-aseprite-to-foundry-asset'],
    },
  });

  return {
    ok: true,
    grid,
    coordinates,
    assetPacket,
    warnings: validation.warnings || [],
  };
}
