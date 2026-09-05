export const RASTER_CANVAS_SIZE = Object.freeze({ width: 256, height: 128 });

export function rasterizeTextToPixels(text, options = {}) {
  const {
    fontSize = 48,
    fontFamily = 'serif',
    createCanvas: createCanvasFn = () => document.createElement('canvas'),
    canvasSize = RASTER_CANVAS_SIZE,
  } = options;

  const canvas = createCanvasFn();
  canvas.width  = canvasSize.width;
  canvas.height = canvasSize.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return [];

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);
  ctx.fillStyle = '#ffffff';
  ctx.font          = `${fontSize}px ${fontFamily}`;
  ctx.textAlign     = 'center';
  ctx.textBaseline  = 'middle';
  ctx.fillText(text, canvasSize.width / 2, canvasSize.height / 2);

  const { data } = ctx.getImageData(0, 0, canvasSize.width, canvasSize.height);
  const cells = [];
  for (let y = 0; y < canvasSize.height; y++) {
    for (let x = 0; x < canvasSize.width; x++) {
      if (data[(y * canvasSize.width + x) * 4] > 128) {
        cells.push({ x, y });
      }
    }
  }
  return cells;
}

export function extractGlyphOutline(cells) {
  if (cells.length === 0) return [];
  const occupied = new Set(cells.map(c => `${c.x},${c.y}`));
  return cells.filter(c =>
    !occupied.has(`${c.x - 1},${c.y}`) ||
    !occupied.has(`${c.x + 1},${c.y}`) ||
    !occupied.has(`${c.x},${c.y - 1}`) ||
    !occupied.has(`${c.x},${c.y + 1}`)
  );
}
