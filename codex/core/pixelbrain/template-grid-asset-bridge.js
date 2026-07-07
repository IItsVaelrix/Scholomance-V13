import { createPixelBrainAssetPacket } from './pixelbrain-asset-packet.js';

function layerCellsToArray(layer) {
  if (!layer?.cells) return [];
  if (layer.cells instanceof Map) return Array.from(layer.cells.values());
  if (Array.isArray(layer.cells)) return layer.cells;
  return [];
}

export function templateGridToPixelBrainAssetPacket(grid, options = {}) {
  const layers = Array.isArray(grid?.layers) ? grid.layers : [];
  const cells = [];
  const coordinates = [];

  layers.forEach((layer, layerIndex) => {
    layerCellsToArray(layer).forEach((cell) => {
      const normalized = {
        x: Number(cell.x) || 0,
        y: Number(cell.y) || 0,
        snappedX: Number(cell.x) || 0,
        snappedY: Number(cell.y) || 0,
        z: layerIndex,
        color: cell.color || '#ffffff',
        emphasis: Number(cell.emphasis ?? 1),
        source: 'template-editor',
        layer: layer.name || `Layer ${layerIndex + 1}`,
      };
      cells.push({ ...normalized, layerIndex });
      coordinates.push(normalized);
    });
  });

  return createPixelBrainAssetPacket({
    id: options.id,
    source: {
      kind: 'template-editor',
      id: options.sourceId || null,
      label: options.label || 'Template Editor Grid',
      importedAt: options.importedAt || null,
    },
    canvas: {
      width: grid?.width,
      height: grid?.height,
      cellSize: grid?.cellSize,
      gridSize: grid?.cellSize,
      transparent: true,
    },
    geometry: {
      mode: 'template-grid',
      coordinates,
      cells,
      bounds: { cols: grid?.cols || 0, rows: grid?.rows || 0 },
    },
    template: {
      id: options.templateId || null,
      gridType: grid?.gridType || null,
      symmetryAxes: Array.isArray(grid?.symmetryAxes) ? [...grid.symmetryAxes] : [],
      slots: [],
      fillState: options.fillState || {},
    },
    palettes: options.palettes || [],
    material: options.material || 'source',
    provenance: {
      createdBy: 'template-grid-asset-bridge',
      operations: ['template-grid-to-pixelbrain-asset'],
    },
  });
}
