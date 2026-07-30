/**
 * VRI — Vixel Render IR Schema
 *
 * The missing layer between SCDL scene semantics and final raster.
 * SCDL says WHAT exists. VRI says HOW it looks.
 *
 * Architecture:
 *   SCDNA / aesthetic intent (art genes)
 *       ↓
 *   SCDL scene semantics (geometry, parts, materials)
 *       ↓
 *   VRI — Vixel Render IR  ← YOU ARE HERE
 *       ↓
 *   deterministic material, texture, light, and contour passes
 *       ↓
 *   final raster (RGBA)
 *
 * A VRI scene is a layered, lit, textured, mark-bearing description
 * that a deterministic renderer can collapse into pixels at any scale.
 *
 * @bytecode PB-VRI-v1
 */

export const VRI_VERSION = 'PB-VRI-v1';

// ─── Layer Types ─────────────────────────────────────────────────────────────

export const LAYER_TYPES = Object.freeze({
  GEOMETRY: 'geometry',       // SDF-backed filled/stroked forms
  TEXTURE_FIELD: 'texture',   // Deterministic procedural texture (bark, moss, stone...)
  MARK: 'mark',               // Brush strokes, stamps, dither patterns
  LIGHT: 'light',             // Light sources and their influence
  ATMOSPHERE: 'atmosphere',   // Fog, bloom, depth grading
  COMPOSITE: 'composite',     // Blend mode groups, masks, clipping
  RASTER_PATCH: 'raster',     // Authored pixel escape hatch
});

// ─── Blend Modes ─────────────────────────────────────────────────────────────

export const BLEND_MODES = Object.freeze({
  NORMAL: 'normal',
  MULTIPLY: 'multiply',
  SCREEN: 'screen',
  OVERLAY: 'overlay',
  ADDITIVE: 'additive',
  SOFT_LIGHT: 'soft-light',
  HARD_LIGHT: 'hard-light',
});

// ─── Texture Field Kinds ─────────────────────────────────────────────────────

export const TEXTURE_KINDS = Object.freeze({
  BARK: 'bark',
  FOLIAGE: 'foliage',
  MOSS: 'moss',
  STONE: 'stone',
  DIRT: 'dirt',
  WATER: 'water',
  CLOUD: 'cloud',
  FABRIC: 'fabric',
  CORROSION: 'corrosion',
  CRYSTAL: 'crystal',
  METAL_GRAIN: 'metal-grain',
  WOOD_GRAIN: 'wood-grain',
});

// ─── Mark Kinds ──────────────────────────────────────────────────────────────

export const MARK_KINDS = Object.freeze({
  BRUSH_STROKE: 'brush-stroke',
  STAMP: 'stamp',
  DITHER_MATRIX: 'dither-matrix',
  EDGE_BREAKUP: 'edge-breakup',
  HIGHLIGHT_PATTERN: 'highlight-pattern',
  CLUSTER: 'cluster',
});

// ─── Light Kinds ─────────────────────────────────────────────────────────────

export const LIGHT_KINDS = Object.freeze({
  POINT: 'point',
  DIRECTIONAL: 'directional',
  AMBIENT: 'ambient',
  RIM: 'rim',
  FOG: 'fog',
  BLOOM: 'bloom',
});

// ─── Palette Quantization ────────────────────────────────────────────────────
//
// Every procedural pass computes in continuous RGB: lighting adds, grading
// multiplies, texture modulates. A nine-colour authored sprite therefore
// leaves the renderer carrying hundreds of colours, and the count grows with
// output scale, so the asset has no stable identity across sizes.
//
// Quantization snaps procedural colour back onto the material's authored
// anchor ramp. It runs after every generative pass and before authored raster
// patches, so curated pixels are never re-coloured by it.

export const QUANTIZATION_MODES = Object.freeze({
  /** Leave procedural colour as computed. */
  OFF: 'off',
  /**
   * Map each covered pixel onto its material's ramp by **luminance position**,
   * normalised to that ramp's own range.
   *
   * This is the mode that makes a material name carry colour intent: the
   * authored hex is a value sketch, the material supplies the hue. Swapping
   * `material crystal` for `material ruby` recolours the part while preserving
   * its value structure. Mirrors `transmuteMaterialColor`, but relative to the
   * ramp rather than against absolute thresholds -- a ramp confined to a narrow
   * luminance band (`abyss` spans 0.00-0.15) would otherwise collapse to one or
   * two anchors.
   */
  LUMINANCE_BAND: 'luminance-band',
  /**
   * Snap each covered pixel to the nearest colour on its material's ramp, by
   * luma-weighted RGB distance. Preserves authored hue, so it is the wrong
   * choice when the material is meant to *supply* hue: cyan snapped onto a red
   * ramp lands on whichever anchor is least far in RGB, which collapses
   * distinct values onto one anchor and destroys form.
   */
  NEAREST_ANCHOR: 'nearest-anchor',
});

/**
 * Build the scene-level quantization spec.
 *
 * `ramps` maps a material id to its ordered anchor colours. The renderer never
 * reads the material registry: the compiler resolves ramps and the scene
 * carries them, so rendering stays a pure function of the scene it is given.
 *
 * A material absent from `ramps` is not quantized — that is how `source` and
 * other passthrough materials keep their authored colour.
 */
export function createQuantizationSpec(mode, ramps, opts = {}) {
  const frozenRamps = {};
  for (const [material, colors] of Object.entries(ramps || {})) {
    if (Array.isArray(colors) && colors.length > 0) {
      frozenRamps[material] = Object.freeze([...colors]);
    }
  }
  return Object.freeze({
    mode: mode || QUANTIZATION_MODES.OFF,
    ramps: Object.freeze(frozenRamps),
    // Ordered dithering between adjacent anchors. Only meaningful for
    // LUMINANCE_BAND, which has an ordered axis to dither along.
    dither: opts.dither ?? true,
  });
}

// ─── Schema Constructors ─────────────────────────────────────────────────────

/**
 * @typedef {object} VRIScene
 * @property {string} version - Always VRI_VERSION
 * @property {string} id - Content-addressed scene ID
 * @property {number} width - Logical canvas width
 * @property {number} height - Logical canvas height
 * @property {VRILayer[]} layers - Ordered back-to-front
 * @property {VRILight[]} lights - Light sources
 * @property {VRIAtmosphere} atmosphere - Global atmospheric effects
 * @property {object} provenance - What produced this scene
 * @property {string} checksum - Deterministic content hash
 */

/**
 * @typedef {object} VRILayer
 * @property {string} id
 * @property {string} type - LAYER_TYPES value
 * @property {string} blendMode - BLEND_MODES value
 * @property {number} opacity - 0..1
 * @property {string|null} maskRef - ID of a mask layer (clipping)
 * @property {number} depthBand - Z-order for atmospheric perspective
 * @property {object} payload - Type-specific data
 */

/**
 * @typedef {object} VRILight
 * @property {string} id
 * @property {string} kind - LIGHT_KINDS value
 * @property {number[]} position - [x, y] in logical coords
 * @property {number[]} direction - [dx, dy] normalized (directional/rim)
 * @property {string} color - Hex
 * @property {number} intensity - 0..1
 * @property {number} radius - Falloff radius (point)
 * @property {number} angle - Cone angle (spot, degrees)
 * @property {string[]} affects - Material IDs this light influences (empty = all)
 */

/**
 * @typedef {object} VRIAtmosphere
 * @property {object|null} fog - { color, near, far, density }
 * @property {object|null} bloom - { threshold, radius, intensity }
 * @property {object|null} grading - { shadows, midtones, highlights, contrast, saturation }
 */

/**
 * Create a geometry layer from SCDL packet coordinates.
 */
export function createGeometryLayer(id, coordinates, opts = {}) {
  return Object.freeze({
    id,
    type: LAYER_TYPES.GEOMETRY,
    blendMode: opts.blendMode || BLEND_MODES.NORMAL,
    opacity: opts.opacity ?? 1.0,
    maskRef: opts.maskRef || null,
    depthBand: opts.depthBand ?? 0,
    payload: Object.freeze({
      coordinates,
      coverageMode: opts.coverageMode || 'sdf', // 'sdf' | 'solid' | 'band'
      aaWidth: opts.aaWidth ?? 1.0,
    }),
  });
}

/**
 * Create a texture field layer.
 *
 * coordinateSpace controls how the texture field is evaluated:
 *   'object'  — texture follows each part's local surface frame (bark, metal)
 *   'world'   — texture is fixed in canvas space (dirt, clouds)
 *   'surface' — texture aligns to the flow direction of the surface (water)
 *   'screen'  — texture is fixed in output-pixel space (grading, fog)
 */
export function createTextureLayer(id, kind, opts = {}) {
  return Object.freeze({
    id,
    type: LAYER_TYPES.TEXTURE_FIELD,
    blendMode: opts.blendMode || BLEND_MODES.OVERLAY,
    opacity: opts.opacity ?? 0.6,
    maskRef: opts.maskRef || null,
    depthBand: opts.depthBand ?? 0,
    payload: Object.freeze({
      kind,
      seed: opts.seed ?? 0,
      frequency: opts.frequency ?? 0.2,
      crossFrequency: opts.crossFrequency ?? 0.1,
      amplitude: opts.amplitude ?? 0.5,
      direction: opts.direction ?? 0,
      octaves: opts.octaves ?? 3,
      lacunarity: opts.lacunarity ?? 2.13,
      persistence: opts.persistence ?? 0.45,
      curvatureModulation: opts.curvatureModulation ?? 1.5,
      envelopeSigma: opts.envelopeSigma ?? 2.2,
      // Fix #4: texture coordinate space
      coordinateSpace: opts.coordinateSpace || 'object',
      // Upper bound on how far this texture may move a pixel's luminance,
      // in 0..1 units. null = unbounded (original behaviour).
      //
      // Unbounded grain is only safe when the output is continuous. Once
      // quantization is active the output is a ramp, and a grain sample of
      // ~0.14 luminance against a 7-anchor step of ~0.167 reassigns the band
      // instead of texturing it -- which reads as specular gloss, not grain.
      // The compiler sets this relative to the material's own ramp step.
      maxLuminanceDelta: opts.maxLuminanceDelta ?? null,
      // Region constraint: only apply where these materials/parts exist
      materialFilter: opts.materialFilter || null,
      partFilter: opts.partFilter || null,
    }),
  });
}

/**
 * Create a mark-making layer.
 */
export function createMarkLayer(id, kind, marks, opts = {}) {
  return Object.freeze({
    id,
    type: LAYER_TYPES.MARK,
    blendMode: opts.blendMode || BLEND_MODES.NORMAL,
    opacity: opts.opacity ?? 1.0,
    maskRef: opts.maskRef || null,
    depthBand: opts.depthBand ?? 0,
    payload: Object.freeze({
      kind,
      marks: Object.freeze(marks),
      pressure: opts.pressure ?? 1.0,
      strokeWidth: opts.strokeWidth ?? 1.0,
      taperStart: opts.taperStart ?? 1.0,
      taperEnd: opts.taperEnd ?? 1.0,
      color: opts.color || '#FFFFFF',
      ditherMatrix: opts.ditherMatrix || null,
    }),
  });
}

/**
 * Create a raster escape-hatch layer (authored pixels).
 */
export function createRasterPatchLayer(id, pixels, opts = {}) {
  return Object.freeze({
    id,
    type: LAYER_TYPES.RASTER_PATCH,
    blendMode: opts.blendMode || BLEND_MODES.NORMAL,
    opacity: opts.opacity ?? 1.0,
    maskRef: opts.maskRef || null,
    depthBand: opts.depthBand ?? 0,
    payload: Object.freeze({
      pixels: Object.freeze(pixels), // [{x, y, color, alpha}]
      source: opts.source || 'authored',
    }),
  });
}

/**
 * Create the full VRI scene.
 */
export function createVRIScene(width, height, layers, lights, atmosphere, provenance, quantization) {
  return Object.freeze({
    version: VRI_VERSION,
    id: null, // computed by compiler
    width,
    height,
    layers: Object.freeze(layers),
    lights: Object.freeze(lights || []),
    atmosphere: Object.freeze(atmosphere || { fog: null, bloom: null, grading: null }),
    quantization: quantization || createQuantizationSpec(QUANTIZATION_MODES.OFF, {}),
    provenance: Object.freeze(provenance || {}),
    checksum: null, // computed by compiler
  });
}
