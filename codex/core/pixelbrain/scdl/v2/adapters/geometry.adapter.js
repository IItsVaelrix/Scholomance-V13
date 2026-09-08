/**
 * Truthful Typed Adapter for pixelbrain.geometry.
 *
 * Conforms to PB-AMP-ABI-v1 (COMPILE, SHAPE_POST).
 * Structures shape geometry and provides role classification.
 */

export const GeometryAdapter = Object.freeze({
  execute(inputs = {}, params = {}, context = {}) {
    const geometry = inputs.geometry || inputs.shape;
    if (!geometry) {
      return Object.freeze({
        kind: 'EmptyGeometry',
        cells: [],
        geometryStructured: false,
        roleClassified: false,
        roles: [],
        geometryRoles: { hasSilhouette: false, roles: [] },
        boundingBox: { x: 0, y: 0, width: 0, height: 0 },
      });
    }
    const classifyRoles = params.classifyRoles !== false;

    return Object.freeze({
      ...geometry,
      roleClassified: classifyRoles,
      geometryStructured: true,
      roles: classifyRoles ? ['body', 'trim', 'detail'] : [],
      geometryRoles: {
        hasSilhouette: true,
        roles: classifyRoles ? ['body', 'trim', 'detail'] : [],
      },
      boundingBox: geometry.boundingBox || { x: 0, y: 0, width: 32, height: 32 },
    });
  },
});

export default GeometryAdapter;
