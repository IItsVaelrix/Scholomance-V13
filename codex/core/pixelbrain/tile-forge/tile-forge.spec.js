/**
 * Tile Forge — Polymorphic Asset Specification & Schema
 *
 * Decouples logical gameplay footprints from visual asset bounds and provides
 * explicit contracts for production-grade procedural synthesis in PixelBrain / SCD128.
 *
 * Invariants Enforced:
 * - Anti-Grid Invariant: Decoupled visual bounds and logical footprint.
 * - Semantic Variation Invariant: Meaningful parameter definitions.
 * - Controlled Detail Invariant: Explicit detail density tiers.
 * - Lighting Consistency Invariant: Standardized upper-left light direction.
 * - Determinism: Namespaced seed derivation.
 */

export const ASSET_CLASSES = Object.freeze({
  TERRAIN_FABRIC: 'TerrainFabric',
  TERRAIN_FEATURE: 'TerrainFeature',
  BOTANICAL_ACTOR: 'BotanicalActor',
  PROP: 'Prop',
  LANDMARK: 'Landmark',
  ARCHITECTURE: 'Architecture',
  WATER_REGION: 'WaterRegion',
  CLIFF_REGION: 'CliffRegion',
  PATH_REGION: 'PathRegion',
});

export const DETAIL_DENSITIES = Object.freeze({
  QUIET: 'quiet',     // 0.05 - 0.12 detail fill, expansive restful negative space
  LOW: 'low',         // 0.15 - 0.22 detail fill, gentle ambient texture
  MEDIUM: 'medium',   // 0.25 - 0.35 detail fill, balanced ground/prop fidelity
  RICH: 'rich',       // 0.40 - 0.55 detail fill, hero props & active clusters
  FOCAL: 'focal',     // 0.60 - 0.85 detail fill, primary environmental centerpieces
});

export const MATERIAL_GRAMMARS = Object.freeze({
  FOLIAGE: 'foliage', // Volumetric cloud lobes, spherical normals, sunlit crests
  WOOD: 'wood',       // Directional grain striations, buttressed roots, cylindrical lighting
  STONE: 'stone',     // Planar facet normals, chiseled bevels, fractures, moss in occlusion
  WATER: 'water',     // Depth falloffs, shoreline silt, foam fringes, tranquil reflections
  EARTH: 'earth',     // Loam ruts, cobblestone paver integration, organic grass encroachment
  METAL: 'metal',     // Sharp specular highlights, oxidation, edge bevels
});

export const DEFAULT_LIGHTING = Object.freeze({
  direction: Object.freeze([-0.65, -0.75, 0.5]),
  ambientIntensity: 0.28,
  keyIntensity: 0.72,
});

/**
 * Deterministically derives namespaced 32-bit integer sub-seeds from a base seed.
 * Ensures that modifying details or materials does not disrupt silhouette or structure.
 *
 * @param {number|string} baseSeed
 * @returns {Record<string, number>}
 */
export function deriveSubStreamSeeds(baseSeed) {
  let s = 0x811C9DC5;
  const str = String(baseSeed ?? 4242);
  for (let i = 0; i < str.length; i += 1) {
    s ^= str.charCodeAt(i);
    s = Math.imul(s, 0x01000193);
  }

  function hashWithNamespace(namespace) {
    let h = s;
    for (let i = 0; i < namespace.length; i += 1) {
      h ^= namespace.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0);
  }

  return {
    silhouette: hashWithNamespace('silhouette'),
    structure: hashWithNamespace('structure'),
    material: hashWithNamespace('material'),
    lighting: hashWithNamespace('lighting'),
    detail: hashWithNamespace('detail'),
    microdetail: hashWithNamespace('microdetail'),
  };
}

/**
 * Derives a deterministic 32-bit integer seed for a specific semantic feature.
 * Changing pebble density or adding a feature does not disrupt other features.
 *
 * @param {number|string} baseSeed
 * @param {string} featureKey
 * @returns {number}
 */
export function seedForFeature(baseSeed, featureKey) {
  let s = 0x811C9DC5;
  const str = `${baseSeed ?? 4242}::feature::${featureKey}`;
  for (let i = 0; i < str.length; i += 1) {
    s ^= str.charCodeAt(i);
    s = Math.imul(s, 0x01000193);
  }
  return (s >>> 0);
}

/**
 * Computes canonical shared edge key ensuring adjacent tiles share exact deterministic profile.
 *
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @param {string} [edgeName]
 * @returns {string}
 */
export function sharedEdgeKey(x1, y1, x2, y2, edgeName = '') {
  const p1 = `${x1},${y1}`;
  const p2 = `${x2},${y2}`;
  const [first, second] = [p1, p2].sort();
  return `edge::${first}<->${second}::${edgeName ? String(edgeName).toUpperCase() : 'SHARED'}`;
}

/**
 * Creates and normalizes a Tile Forge Asset Specification.
 *
 * @param {Object} options
 * @returns {Object} Validated AssetSpec
 */
export function createAssetSpec(options = {}) {
  const assetClass = options.assetClass || ASSET_CLASSES.TERRAIN_FABRIC;
  const id = options.id || `tf_asset_${Date.now()}`;
  const semanticType = options.semanticType || 'custom';
  const baseSeed = options.seed ?? 4242;
  const seeds = deriveSubStreamSeeds(baseSeed);

  // Decoupled logical vs visual dimensions (TIL-04)
  const gridW = options.logicalFootprint?.gridW ?? options.logicalFootprint?.widthTiles ?? 1;
  const gridH = options.logicalFootprint?.gridH ?? options.logicalFootprint?.heightTiles ?? 1;
  const elevation = options.logicalFootprint?.elevation ?? options.elevationUnits ?? 0;
  const walkable = options.logicalFootprint?.walkable ?? true;

  const logicalFootprint = {
    gridW,
    gridH,
    widthTiles: gridW,
    heightTiles: gridH,
    originTx: options.logicalFootprint?.originTx ?? 0,
    originTy: options.logicalFootprint?.originTy ?? 0,
    elevation,
    walkable,
  };

  const width = options.visualBounds?.width ?? (logicalFootprint.gridW * 80);
  const height = options.visualBounds?.height ?? (logicalFootprint.gridH * 40);
  const anchorX = options.visualBounds?.anchorX ?? 0.5;
  const anchorY = options.visualBounds?.anchorY ?? 0.5;

  const visualBounds = {
    width,
    height,
    anchorX,
    anchorY,
    padTop: options.visualBounds?.padTop ?? 0,
    padBot: options.visualBounds?.padBot ?? 0,
    groundAnchor: options.visualBounds?.groundAnchor || { x: anchorX, y: anchorY },
    pivot: options.visualBounds?.pivot || { x: Math.round(width * anchorX), y: Math.round(height * anchorY) },
    collisionBounds: options.visualBounds?.collisionBounds || {
      minX: 0,
      minY: 0,
      maxX: width,
      maxY: height,
      width,
      height,
    },
  };

  // Physical & volume dimensions (TIL-05)
  const groundDepthPx = options.groundDepthPx ?? 16;
  const elevationUnits = options.elevationUnits ?? elevation;
  const solidity = options.solidity || (walkable ? 'WALKABLE' : 'SOLID');

  return {
    id,
    assetClass,
    semanticType,
    biome: options.biome || 'verdant_dofus',
    paletteFamily: options.paletteFamily || 'verdant_dofus',
    materialGrammar: options.materialGrammar || MATERIAL_GRAMMARS.EARTH,
    detailDensity: options.detailDensity || DETAIL_DENSITIES.MEDIUM,
    lighting: {
      ...DEFAULT_LIGHTING,
      ...(options.lighting || {}),
    },
    logicalFootprint,
    visualBounds,
    groundDepthPx,
    elevationUnits,
    solidity,
    seed: baseSeed,
    subSeeds: seeds,
    customParams: options.customParams || {},
  };
}
