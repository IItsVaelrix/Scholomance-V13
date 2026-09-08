/**
 * Truthful Typed Adapter for pixelbrain.symmetry.
 *
 * Conforms to PB-AMP-ABI-v1 (COMPILE, SHAPE_POST).
 * Mirrors shape geometry across vertical or horizontal axes.
 */

export const SymmetryAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const geometry = inputs.geometry || inputs.shape;
    if (!geometry) {
      return Object.freeze({
        kind: 'EmptyShape',
        cells: [],
        symmetryApplied: false,
        symmetrical: false,
        symmetryAxis: 'VERTICAL',
      });
    }
    const axis = params.axis === 'HORIZONTAL' ? 'HORIZONTAL' : 'VERTICAL';
    const canvasWidth = typeof context.canvasWidth === 'number' ? context.canvasWidth : 32;
    const canvasHeight = typeof context.canvasHeight === 'number' ? context.canvasHeight : 32;

    const baseCells = Array.isArray(geometry.cells) ? geometry.cells : [];
    const mirroredCells = baseCells.map((c) => {
      if (axis === 'VERTICAL') {
        return { ...c, x: canvasWidth - 1 - c.x };
      } else {
        return { ...c, y: canvasHeight - 1 - c.y };
      }
    });

    const combinedCells = [...baseCells, ...mirroredCells];

    return Object.freeze({
      ...geometry,
      symmetryApplied: true,
      symmetrical: true,
      symmetryAxis: axis,
      cells: combinedCells,
    });
  },
});

export default SymmetryAdapter;
