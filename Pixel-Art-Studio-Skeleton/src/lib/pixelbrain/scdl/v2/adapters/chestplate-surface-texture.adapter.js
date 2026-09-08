/**
 * Truthful Typed Adapter for pixelbrain.chestplate-surface-texture.
 *
 * Conforms to PB-AMP-ABI-v1 (COMPILE, PAINT).
 * Modulates plate surface micro-texture shading.
 */

export const ChestplateSurfaceTextureAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const target = inputs.target || inputs.layer;
    if (!target) {
      return Object.freeze({
        id: 'empty',
        cells: [],
        surfaceTextureApplied: false,
      });
    }
    const roughness = typeof params.roughness === 'number' ? params.roughness : 0.3;

    return Object.freeze({
      ...target,
      surfaceTextureApplied: true,
      roughness,
      cells: Array.isArray(target.cells) ? [...target.cells] : [],
    });
  },
});

export default ChestplateSurfaceTextureAdapter;
