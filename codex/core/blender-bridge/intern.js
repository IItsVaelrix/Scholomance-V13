/**
 * String interning for categorical wire fields.
 *
 * ShaderNodeAttribute outputs only Color, Vector, Factor and Alpha — a shader
 * cannot read a STRING attribute, even though STRING attributes exist and
 * GeometryNodeInputNamedAttribute accepts them. Categorical PixelBrain fields
 * (partId, shading, motifRole, squareAmpClass, source) are therefore interned
 * to INT so the shader path can consume them.
 *
 * Ids are assigned in SORTED order so the table is a pure function of the value
 * set. Insertion-order ids would make the wire depend on packet traversal order
 * and break SCENE_GRAPH reproducibility.
 */

/** Reserved id for null / undefined / absent. Never collides with a real id. */
export const ABSENT_ID = -1;

export function internTable(values) {
  const distinct = [...new Set(values.filter((v) => v !== null && v !== undefined))]
    .map(String)
    .sort();

  const table = Object.create(null);
  distinct.forEach((s, i) => {
    table[s] = i;
  });

  return Object.freeze({
    table: Object.freeze({ ...table }),
    lookup(value) {
      if (value === null || value === undefined) return ABSENT_ID;
      const key = String(value);
      if (!(key in table)) {
        throw new Error(`"${key}" is not interned in this table`);
      }
      return table[key];
    },
  });
}
