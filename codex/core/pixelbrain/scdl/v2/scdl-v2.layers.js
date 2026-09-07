import { evaluateCSGToCells } from './scdl-v2.booleans.js';
import { applyOpacity, formatColor, blendColors } from './scdl-v2.compositing.js';

export function createLayer({
  id,
  order = 10,
  blend = 'OVER',
  opacity = 1,
  visible = true,
  paints = [],
  sourceIndex = 0,
}) {
  return Object.freeze({
    id: String(id),
    order: Number(order),
    blend: String(blend).toUpperCase(),
    opacity: Number(opacity),
    visible: Boolean(visible),
    paints: Object.freeze(paints.map((p) => Object.freeze({ ...p }))),
    sourceIndex: Number(sourceIndex),
  });
}

export function sortLayers(layers) {
  const list = Array.isArray(layers) ? [...layers] : [];
  return list.sort((a, b) => (a.order - b.order) || (a.sourceIndex - b.sourceIndex));
}

function sortYMajorXMinor(cells) {
  return cells.sort((a, b) => a.y !== b.y ? a.y - b.y : a.x - b.x);
}

export function compositeLayerStack(canvas, layers, _options = {}) {
  const width = canvas ? canvas.width : 32;
  const height = canvas ? canvas.height : 32;
  const sorted = sortLayers(layers);
  const coordinateMap = new Map();

  for (const layer of sorted) {
    if (layer.visible === false) continue;
    const paints = layer.paints || [];

    for (const paint of paints) {
      const rawCells = evaluateCSGToCells(paint.shape, paint.raster || 'CENTER');
      const clipped = paint.clipTo
        ? rawCells.filter((c) => paint.clipTo.has(c.x, c.y))
        : rawCells;

      for (const { x, y } of clipped) {
        if (x < 0 || y < 0 || x >= width || y >= height) continue;
        const key = `${x},${y}`;
        const prev = coordinateMap.get(key);

        const effectiveOpacity = Number(layer.opacity ?? 1) * Number(paint.opacity ?? 1);
        const sourceColor = applyOpacity(paint.fill || '#ffffff', effectiveOpacity);
        let finalColor = formatColor(sourceColor);
        if (prev && (paint.blend || layer.blend) !== 'REPLACE') {
          const mode = paint.blend || layer.blend || 'OVER';
          const blended = blendColors(sourceColor, prev.color, mode);
          finalColor = formatColor(blended);
        }

        const cellData = {
          x,
          y,
          color: finalColor,
          partId: layer.id,
          role: paint.role || 'paint',
        };
        if (paint.material) cellData.material = paint.material;
        coordinateMap.set(key, cellData);
      }
    }
  }

  const coordinates = sortYMajorXMinor([...coordinateMap.values()]).map((cell) => Object.freeze({ ...cell }));

  return Object.freeze({
    ok: true,
    coordinates: Object.freeze(coordinates),
    layers: Object.freeze(sorted),
  });
}
