/**
 * VIXEL SCHEMA — The QBIT Lattice Cell
 *
 * A Vixel is a lattice cell that carries DUAL-MEDIUM IDENTITY simultaneously:
 * pixel-state (color, material) and vector-state (curve provenance, normals).
 * Neither medium is subordinate. They exist in superposition within the same
 * cell until the renderer collapses them into whichever representation the
 * context demands.
 *
 * The QBIT framing is literal: a vixel is simultaneously a pixel and a vector
 * sample. The lattice doesn't get bigger in resolution — it gets DEEPER in
 * information per cell.
 *
 * DETERMINISM: All vixel fields are content-addressable. Identical inputs
 * produce identical vixelHash. No randomness, no Date.now(), no external state.
 *
 * @bytecode VIXEL-SCHEMA-v1
 */

export const VIXEL_SCHEMA_VERSION = 'VIXEL-SCHEMA-v1';

/**
 * @typedef {object} VixelPixelState
 * @property {string}  color     - Hex color (#RRGGBB or #RRGGBBAA)
 * @property {string}  material  - SCDL material ID (e.g. 'obsidian', 'holy_fire')
 * @property {string}  partId    - SCDL part that owns this cell (e.g. 'rim', 'bowl')
 * @property {number}  emphasis  - Visual weight (0-1), from SCDL or Wand
 * @property {number}  depthBand - Z-layer for atmospheric perspective (0 = back)
 */

/**
 * @typedef {object} VixelVectorState
 * @property {string}  pathRef    - Which Wand composite role this cell belongs to
 * @property {number}  parametricT - Position on the source curve (0-1)
 * @property {number}  normalX    - Surface normal X at this point (-1 to 1)
 * @property {number}  normalY    - Surface normal Y at this point (-1 to 1)
 * @property {number}  curvature  - How sharply the form bends here (0 = straight)
 * @property {number}  pressure   - Wand stroke pressure at this point (0-1)
 */

/**
 * @typedef {object} VixelFeelState
 * @property {string}  role      - Perceptual role: 'contour' | 'interior' | 'focal' | 'ground'
 * @property {number}  salience  - How much this cell pulls the eye (0-1)
 * @property {boolean} isBoundary - True if adjacent to empty space (silhouette edge)
 */

/**
 * @typedef {object} Vixel
 * @property {number} x - Grid X coordinate
 * @property {number} y - Grid Y coordinate
 * @property {VixelPixelState}  pixel  - The pixel identity
 * @property {VixelVectorState} vector - The vector identity
 * @property {VixelFeelState}   feel   - The perceptual identity
 */

/**
 * @typedef {object} VixelField
 * @property {string}  schemaVersion - Always VIXEL_SCHEMA_VERSION
 * @property {string}  id            - Content-addressed field ID
 * @property {number}  width         - Grid width in cells
 * @property {number}  height        - Grid height in cells
 * @property {Vixel[]} vixels        - The lattice cells (sparse: only occupied)
 * @property {object}  provenance    - What produced this field
 * @property {string}  vixelHash     - Deterministic content hash
 */

/**
 * Validate a VixelPixelState.
 * @param {object} state
 * @returns {string[]} errors (empty = valid)
 */
export function validatePixelState(state) {
  const errors = [];
  if (!state || typeof state !== 'object') {
    errors.push('pixel state must be an object');
    return errors;
  }
  if (typeof state.color !== 'string' || !state.color.startsWith('#')) {
    errors.push('pixel.color must be a hex string');
  }
  if (typeof state.material !== 'string') {
    errors.push('pixel.material must be a string');
  }
  if (typeof state.emphasis !== 'number' || state.emphasis < 0 || state.emphasis > 1) {
    errors.push('pixel.emphasis must be 0-1');
  }
  return errors;
}

/**
 * Validate a VixelVectorState.
 * @param {object} state
 * @returns {string[]} errors (empty = valid)
 */
export function validateVectorState(state) {
  const errors = [];
  if (!state || typeof state !== 'object') {
    errors.push('vector state must be an object');
    return errors;
  }
  if (typeof state.pathRef !== 'string') {
    errors.push('vector.pathRef must be a string');
  }
  if (typeof state.parametricT !== 'number' || state.parametricT < 0 || state.parametricT > 1) {
    errors.push('vector.parametricT must be 0-1');
  }
  if (typeof state.normalX !== 'number' || typeof state.normalY !== 'number') {
    errors.push('vector.normalX and vector.normalY must be numbers');
  }
  return errors;
}

/**
 * Validate a complete VixelField.
 * @param {object} field
 * @returns {string[]} errors (empty = valid)
 */
export function validateVixelField(field) {
  const errors = [];
  if (!field || typeof field !== 'object') {
    errors.push('field must be an object');
    return errors;
  }
  if (field.schemaVersion !== VIXEL_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${VIXEL_SCHEMA_VERSION}`);
  }
  if (typeof field.width !== 'number' || field.width <= 0) {
    errors.push('width must be a positive number');
  }
  if (typeof field.height !== 'number' || field.height <= 0) {
    errors.push('height must be a positive number');
  }
  if (!Array.isArray(field.vixels)) {
    errors.push('vixels must be an array');
    return errors;
  }
  for (let i = 0; i < field.vixels.length; i++) {
    const v = field.vixels[i];
    if (typeof v.x !== 'number' || typeof v.y !== 'number') {
      errors.push(`vixel[${i}]: x and y must be numbers`);
      continue;
    }
    const pixelErrors = validatePixelState(v.pixel);
    for (const e of pixelErrors) errors.push(`vixel[${i}].pixel: ${e}`);
    const vectorErrors = validateVectorState(v.vector);
    for (const e of vectorErrors) errors.push(`vixel[${i}].vector: ${e}`);
  }
  return errors;
}
