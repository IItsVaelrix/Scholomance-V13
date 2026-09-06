export const ZOOM_LADDER = Object.freeze([0.125, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64]);

export function rasterLine(from, to) {
  let x = Math.floor(from.x);
  let y = Math.floor(from.y);
  const endX = Math.floor(to.x);
  const endY = Math.floor(to.y);
  const dx = Math.abs(endX - x);
  const sx = x < endX ? 1 : -1;
  const dy = -Math.abs(endY - y);
  const sy = y < endY ? 1 : -1;
  let error = dx + dy;
  const cells = [];
  while (true) {
    cells.push({ x, y });
    if (x === endX && y === endY) return cells;
    const twice = error * 2;
    if (twice >= dy) { error += dy; x += sx; }
    if (twice <= dx) { error += dx; y += sy; }
  }
}

export function screenToCell(point, viewport, docSize) {
  const x = Math.floor((point.x - viewport.panX) / viewport.zoom);
  const y = Math.floor((point.y - viewport.panY) / viewport.zoom);
  return x >= 0 && y >= 0 && x < docSize.width && y < docSize.height ? { x, y } : null;
}

export function cellToScreen(cell, viewport) {
  return { x: viewport.panX + cell.x * viewport.zoom, y: viewport.panY + cell.y * viewport.zoom };
}

export function zoomAt(viewport, anchor, nextZoom) {
  const worldX = (anchor.x - viewport.panX) / viewport.zoom;
  const worldY = (anchor.y - viewport.panY) / viewport.zoom;
  return { zoom: nextZoom, panX: anchor.x - worldX * nextZoom, panY: anchor.y - worldY * nextZoom };
}

export function stepZoom(viewport, anchor, direction, ladder = ZOOM_LADDER) {
  const index = ladder.indexOf(viewport.zoom);
  const current = index >= 0 ? index : 0;
  const delta = direction > 0 ? 1 : direction < 0 ? -1 : 0;
  const next = Math.max(0, Math.min(ladder.length - 1, current + delta));
  return zoomAt(viewport, anchor, ladder[next]);
}

export function fitViewport(docSize, containerSize, ladder, padding) {
  const availW = containerSize.width - padding * 2;
  const availH = containerSize.height - padding * 2;
  let zoom = ladder[0];
  for (const candidate of ladder) {
    if (docSize.width * candidate <= availW && docSize.height * candidate <= availH) {
      zoom = candidate;
    }
  }
  return {
    zoom,
    panX: (containerSize.width - docSize.width * zoom) / 2,
    panY: (containerSize.height - docSize.height * zoom) / 2,
  };
}

export function dedupeCells(cells, bounds) {
  const seen = new Set();
  const out = [];
  for (const cell of cells) {
    if (!Number.isInteger(cell.x) || !Number.isInteger(cell.y)) continue;
    if (cell.x < 0 || cell.y < 0 || cell.x >= bounds.width || cell.y >= bounds.height) continue;
    const key = `${cell.x},${cell.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ x: cell.x, y: cell.y });
  }
  return out;
}
