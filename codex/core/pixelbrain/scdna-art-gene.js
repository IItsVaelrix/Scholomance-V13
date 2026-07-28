/**
 * SCDNA Art-Direction Gene Packet
 *
 * Extends PB-SCDNA-GENE-v1 with geneType: 'art-direction'.
 * Implements §8.2 (ArtGenePacket), §8.3 (mode validation), §6.1–6.4 invariants.
 *
 * PDR: docs/scholomance-encyclopedia/PDR-archive/2026-07-25-ontological-art-direction-pipeline-pdr-revised.md
 */

import crypto from 'node:crypto';

// ─── Version Constants (§8.1) ────────────────────────────────────────────────

export const PROJECTION_ALGO_VERSION = 1;
export const CONFLICT_POLICY_VERSION = 1;
export const ART_GENE_CONTRACT = 'PB-SCDNA-GENE-v1';
export const ART_GENE_VERSION = '1.1.0';

// ─── Feature Flag (§6.5, Phase 1) ───────────────────────────────────────────

export function isArtGenesEnabled() {
  return process.env.SCDNA_ART_GENES_ENABLED === 'true';
}

// ─── Supported Geometry Hints (§8.3) ────────────────────────────────────────

const OPERATIONAL_HINT_KEYS = Object.freeze([
  'lightDir', 'valueRamp', 'contourFollow', 'contourPartId',
  'rimWidth', 'occlusionPolicy', 'cornerPolicy',
]);

const VALID_LIGHT_DIRS = Object.freeze([
  'upper-left', 'upper-right', 'lower-left', 'lower-right', 'top', 'bottom',
]);

const VALID_OCCLUSION_POLICIES = Object.freeze(['respect-silhouette', 'ignore-occlusion']);
const VALID_CORNER_POLICIES = Object.freeze(['preserve', 'bevel', 'round']);
const VALID_PROJECTION_MODES = Object.freeze(['explicit', 'derived', 'hybrid']);

const VALID_BALANCE_MODES = Object.freeze([
  'symmetric',
  'radial',
  'dynamic',
  'deliberately-imbalanced',
]);

// ─── Mode Validation (§8.3) ─────────────────────────────────────────────────

/**
 * Validate that a gene's projectionMode is consistent with its fields.
 * Throws on invalid combinations.
 */
export function validateProjectionMode(gene) {
  const mode = gene.projectionMode;
  const hasCoords = Array.isArray(gene.coordinates) && gene.coordinates.length > 0;
  const hasContour = gene.geometryHints?.contourFollow === true && !!gene.geometryHints?.contourPartId;

  switch (mode) {
    case 'explicit':
      if (!hasCoords) {
        throw new Error('ART_GENE_EXPLICIT_REQUIRES_COORDINATES: explicit mode requires at least one coordinate');
      }
      break;

    case 'derived':
      if (hasCoords) {
        throw new Error('ART_GENE_DERIVED_REJECTS_COORDINATES: derived mode must have empty coordinates');
      }
      if (!hasContour) {
        throw new Error('ART_GENE_DERIVED_REQUIRES_CONTOUR: derived mode requires contourFollow=true and contourPartId');
      }
      break;

    case 'hybrid':
      if (!hasCoords) {
        throw new Error('ART_GENE_HYBRID_REQUIRES_COORDINATES: hybrid mode requires at least one coordinate');
      }
      if (!hasContour) {
        throw new Error('ART_GENE_HYBRID_REQUIRES_CONTOUR: hybrid mode requires contourFollow=true and contourPartId');
      }
      break;

    default:
      throw new Error(`ART_GENE_UNKNOWN_MODE: unknown projectionMode '${mode}'`);
  }
}

// ─── Geometry Hints Validation ───────────────────────────────────────────────

function validateGeometryHints(hints) {
  if (!hints || typeof hints !== 'object') return;

  for (const key of Object.keys(hints)) {
    if (key === 'extensions') continue; // non-operational metadata
    if (!OPERATIONAL_HINT_KEYS.includes(key)) {
      throw new Error(`ART_GENE_UNKNOWN_HINT: unknown operational geometry hint '${key}' — use geometryHints.extensions for metadata`);
    }
  }

  if (hints.lightDir !== undefined && !VALID_LIGHT_DIRS.includes(hints.lightDir)) {
    throw new Error(`ART_GENE_INVALID_LIGHT_DIR: '${hints.lightDir}' not in [${VALID_LIGHT_DIRS.join(', ')}]`);
  }

  if (hints.occlusionPolicy !== undefined && !VALID_OCCLUSION_POLICIES.includes(hints.occlusionPolicy)) {
    throw new Error(`ART_GENE_INVALID_OCCLUSION_POLICY: '${hints.occlusionPolicy}'`);
  }

  if (hints.cornerPolicy !== undefined && !VALID_CORNER_POLICIES.includes(hints.cornerPolicy)) {
    throw new Error(`ART_GENE_INVALID_CORNER_POLICY: '${hints.cornerPolicy}'`);
  }

  if (hints.rimWidth !== undefined && (typeof hints.rimWidth !== 'number' || hints.rimWidth <= 0)) {
    throw new Error('ART_GENE_INVALID_RIM_WIDTH: rimWidth must be a positive number');
  }
}

function validateCompositionIntent(input) {
  if (input.balanceMode !== undefined) {
    if (!VALID_BALANCE_MODES.includes(input.balanceMode)) {
      throw new Error(
        `ART_GENE_INVALID_BALANCE_MODE: '${input.balanceMode}' not in [${VALID_BALANCE_MODES.join(', ')}]`,
      );
    }
  }
  if (input.intendedFocalCenter !== undefined) {
    const c = input.intendedFocalCenter;
    if (!c || typeof c !== 'object'
      || !Number.isFinite(c.x) || !Number.isFinite(c.y)
      || c.x < 0 || c.x > 1 || c.y < 0 || c.y > 1) {
      throw new Error('ART_GENE_INVALID_FOCAL_CENTER: intendedFocalCenter.x/y must be finite in [0,1]');
    }
  }
  if (input.regionWeightPriors !== undefined) {
    if (!input.regionWeightPriors || typeof input.regionWeightPriors !== 'object'
      || Array.isArray(input.regionWeightPriors)) {
      throw new Error('ART_GENE_INVALID_REGION_WEIGHT_PRIORS: expected object map');
    }
    for (const [k, v] of Object.entries(input.regionWeightPriors)) {
      if (!Number.isFinite(v)) {
        throw new Error(`ART_GENE_INVALID_REGION_WEIGHT_PRIORS: non-finite weight for '${k}'`);
      }
    }
  }
}

// ─── Coordinate Normalization ────────────────────────────────────────────────

function normalizeArtCoordinates(coordinates) {
  return [...(coordinates ?? [])]
    .map((cell) => ({
      x: toInt(cell.x),
      y: toInt(cell.y),
      color: cell.color ? String(cell.color).toUpperCase() : undefined,
      role: cell.role ? String(cell.role) : 'explicit',
      partId: cell.partId ? String(cell.partId) : undefined,
    }))
    .sort((a, b) => {
      if (a.y !== b.y) return a.y - b.y;
      if (a.x !== b.x) return a.x - b.x;
      return (a.role ?? '').localeCompare(b.role ?? '');
    });
}

// ─── Deep Freeze ─────────────────────────────────────────────────────────────

export function deepFreeze(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return obj;
}

// ─── Stable Checksum (§6.2) ─────────────────────────────────────────────────

export function stableStringify(value) {
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function checksumStableJSON(value) {
  const json = stableStringify(value);
  const hash = crypto.createHash('sha256').update(json, 'utf8').digest('hex');
  return `scd64:${hash.slice(0, 64)}`;
}

// ─── Art Gene Packet Factory (§8.2) ─────────────────────────────────────────

/**
 * Create a deeply frozen PB-SCDNA-GENE-v1 art-direction gene packet.
 *
 * @param {object} input
 * @returns {Readonly<ArtGenePacket>}
 */
export function createArtGenePacket(input) {
  const coordinates = normalizeArtCoordinates(input.coordinates);

  const geometryHints = Object.freeze({
    ...(input.geometryHints ?? {}),
  });

  // Validate before building
  validateGeometryHints(geometryHints);
  validateCompositionIntent(input);

  const intendedFocalCenter = input.intendedFocalCenter
    ? Object.freeze({ x: Number(input.intendedFocalCenter.x), y: Number(input.intendedFocalCenter.y) })
    : undefined;

  const regionWeightPriors = input.regionWeightPriors
    ? Object.freeze({ ...input.regionWeightPriors })
    : undefined;

  const packet = {
    contract: ART_GENE_CONTRACT,
    version: ART_GENE_VERSION,

    assetId: String(input.assetId),
    geneId: String(input.geneId),
    geneType: 'art-direction',

    priority: toInt(input.priority ?? 0),
    projectionMode: String(input.projectionMode ?? 'explicit'),

    canvas: Object.freeze({
      width: toInt(input.canvas?.width),
      height: toInt(input.canvas?.height),
    }),

    bounds: input.bounds
      ? Object.freeze({
          x: toInt(input.bounds.x),
          y: toInt(input.bounds.y),
          w: toInt(input.bounds.w),
          h: toInt(input.bounds.h),
        })
      : (coordinates.length > 0 ? computeBounds(coordinates) : null),

    role: String(input.role ?? 'unknown'),
    materialHint: String(input.materialHint ?? 'source'),

    // Set semantics: canonically normalized, deduplicated, and sorted
    paletteRoles: Object.freeze([...new Set((input.paletteRoles ?? []).map(String))].sort()),

    // Ordered semantics: never sorted (preserve authoring order)
    coordinates: Object.freeze(coordinates),

    geometryHints,

    // Composition intent (optional; missing ⇒ intentDeclared false downstream)
    ...(input.balanceMode !== undefined ? { balanceMode: String(input.balanceMode) } : {}),
    ...(intendedFocalCenter ? { intendedFocalCenter } : {}),
    ...(regionWeightPriors ? { regionWeightPriors } : {}),
  };

  // Validate mode after all fields are set
  validateProjectionMode(packet);

  // Compute checksum over the packet body (excluding checksum itself)
  const checksum = checksumStableJSON(packet);

  return deepFreeze({ ...packet, checksum });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function computeBounds(coordinates) {
  if (coordinates.length === 0) return null;
  const xs = coordinates.map((c) => c.x);
  const ys = coordinates.map((c) => c.y);
  return Object.freeze({
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs) + 1,
    h: Math.max(...ys) - Math.min(...ys) + 1,
  });
}
