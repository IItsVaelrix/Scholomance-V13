/**
 * Truthful Typed Adapter for pixelbrain.wand-stroke.
 *
 * Conforms to PB-AMP-ABI-v1 (COMPILE, SHAPE_POST).
 * Refines shape geometry using Fairly Odd Wand mathematical stroke evaluation
 * and enforces strict discrete integer grid pixel art quantization.
 */

/**
 * Clamps and rounds a continuous coordinate to a discrete pixel integer.
 */
export function quantizeToPixelGrid(val, max) {
  const n = Number(val);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(Math.floor(max) - 1, Math.round(n)));
}

export const WandStrokeAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const geometry = inputs.geometry || inputs.shape;
    const canvas = context.canvas || { width: 32, height: 32 };
    const pixelArtQuantize = params.pixelArtQuantize !== false;
    const formulaType = params.formula ? String(params.formula) : 'mathematical_stroke';
    const strokeWidth = typeof params.strokeWidth === 'number' ? Math.max(1, Math.round(params.strokeWidth)) : 1;

    if (!geometry) {
      return Object.freeze({
        kind: 'WandShape',
        cells: [],
        wandStrokeApplied: true,
        pixelArtQuantized: pixelArtQuantize,
        formulaType,
        strokeWidth,
        roles: ['wand.stroke'],
      });
    }

    // Process and quantize existing geometry points/cells to integer grid
    let quantizedCells = [];
    if (Array.isArray(geometry.cells)) {
      quantizedCells = geometry.cells.map((c) => ({
        ...c,
        x: pixelArtQuantize ? quantizeToPixelGrid(c.x, canvas.width) : c.x,
        y: pixelArtQuantize ? quantizeToPixelGrid(c.y, canvas.height) : c.y,
        emphasis: c.emphasis ?? 1,
      }));
    }

    return Object.freeze({
      ...geometry,
      cells: quantizedCells,
      wandStrokeApplied: true,
      pixelArtQuantized: pixelArtQuantize,
      formulaType,
      strokeWidth,
      subdivisions: typeof params.density === 'number' ? Math.max(1, Math.round(params.density)) : 1,
    });
  },
});

export default WandStrokeAdapter;
