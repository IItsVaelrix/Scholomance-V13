export function emitScdlRaster(fills, palette, spec = {}) {
  const {
    canvasName = 'imported_sprite',
    width = fills.width,
    height = fills.height
  } = spec;

  let scdl = `asset ${canvasName} canvas ${width}x${height}\n\n`;

  scdl += `palette {\n`;
  for (const [role, color] of Object.entries(palette)) {
    scdl += `  ${role} = ${color}\n`;
  }
  scdl += `}\n\n`;

  const groups = new Map();
  for (const cell of fills.coordinates) {
    const partId = cell.partId || 'raster_import';
    const mat = cell.material || 'source';
    const key = `${partId} material ${mat}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(cell);
  }

  for (const [groupKey, cells] of groups.entries()) {
    scdl += `part ${groupKey} {\n`;
    for (const cell of cells) {
      // Use roleName instead of raw color
      const colorRef = cell.roleName || cell.color;
      scdl += `  cell ${cell.x} ${cell.y} ${colorRef}\n`;
    }
    scdl += `}\n\n`;
  }

  scdl += `export json png aseprite\n`;

  return scdl;
}
