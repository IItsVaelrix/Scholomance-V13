/**
 * PB-GEOMETRY-CONSTRUCTION-v1 — Construction IR schema, validation, checksum.
 * PDR: 2026-07-25-geometric-construction-solver-pdr.md §3
 *
 * A construction is a frozen, checksummed packet of primitives, anchors,
 * constraints, and validation laws. The solver derives coordinates from it;
 * it never authors constructions (Curation Law).
 */

import { roundTo } from '../shared.js';
import { sha256Hex } from '../sha256.js';
import { constructionError } from './construction-error.js';

export const CONSTRUCTION_CONTRACT = 'PB-GEOMETRY-CONSTRUCTION-v1';
export const CONSTRUCTION_VERSION = '1.0.0';
export const SOLVER_VERSION = '1.0.0';

const PRIMITIVE_KINDS = new Set([
  'ellipse', 'conic-bowl', 'tapered-ribbon', 'capsule',
  'width-profile-ribbon', 'branch-graph', 'radial-shard-cluster',
  'architectural-module-stack', 'offset-contour', 'rounded-polygon',
  'bezier-chain',
]);

const CONSTRAINT_KINDS = new Set([
  'coaxial', 'tangent', 'coincident', 'connected', 'concentric',
  'parallel', 'perpendicular', 'symmetric', 'mirror-symmetry',
  'contained', 'equal-length', 'ratio', 'minimum-distance',
  'maximum-curvature', 'monotonic-taper',
]);

const WINDING_DIRECTIONS = new Set(['clockwise', 'counterclockwise']);

/** Quantize a value to 3 decimal places (PDR §5 assumption). */
export function quantize(v) {
  return roundTo(v, 3);
}

/** Quantize a point [x, y]. */
export function quantizePoint(p) {
  return [quantize(p[0]), quantize(p[1])];
}

/**
 * Serialize supported construction data with recursive lexical key sorting.
 * Arrays retain authored order. Unsupported, cyclic, or non-finite values
 * refuse instead of being silently discarded by JSON.stringify().
 */
export function canonicalConstructionStringify(value, seen = new Set()) {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw constructionError('RANGE', 'non-finite canonical number', { value: String(value) });
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (
    typeof value !== 'object'
    || ArrayBuffer.isView(value)
    || value instanceof Map
    || value instanceof Set
  ) {
    throw constructionError('VALUE', 'unsupported canonical value', {
      valueType: value?.constructor?.name ?? typeof value,
    });
  }
  if (seen.has(value)) {
    throw constructionError('STATE', 'cyclic construction graph');
  }

  seen.add(value);
  let encoded;
  if (Array.isArray(value)) {
    encoded = `[${value.map(entry => canonicalConstructionStringify(entry, seen)).join(',')}]`;
  } else {
    encoded = `{${Object.keys(value).sort().map(key => {
      if (value[key] === undefined) {
        throw constructionError('VALUE', 'undefined canonical value', { key });
      }
      return `${JSON.stringify(key)}:${canonicalConstructionStringify(value[key], seen)}`;
    }).join(',')}}`;
  }
  seen.delete(value);
  return encoded;
}

/** Clone accepted arrays/plain objects and recursively freeze the clone. */
export function deepCloneAndFreeze(value) {
  if (Array.isArray(value)) {
    return Object.freeze(value.map(deepCloneAndFreeze));
  }
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, deepCloneAndFreeze(entry)]),
    ));
  }
  return value;
}

/**
 * Compute a stable checksum over the construction's semantic content.
 * Solver version is bound into the checksum (PDR §1 risk mitigation).
 */
export function computeConstructionChecksum(fields) {
  const canonical = canonicalConstructionStringify({
    contract: CONSTRUCTION_CONTRACT,
    version: CONSTRUCTION_VERSION,
    solverVersion: SOLVER_VERSION,
    id: fields.id,
    canvas: fields.canvas,
    anchors: fields.anchors,
    parts: fields.parts,
    constraints: fields.constraints,
    validation: fields.validation,
  });
  return `sha256-canonical-v1:${sha256Hex(canonical)}`;
}

/**
 * Validate a construction spec. Returns { valid, errors }.
 */
export function validateConstructionSpec(spec) {
  const errors = [];

  if (!spec || typeof spec !== 'object') {
    return { valid: false, errors: ['spec must be an object'] };
  }
  if (typeof spec.id !== 'string' || spec.id.length === 0) {
    errors.push('id must be a non-empty string');
  }
  if (!spec.canvas || typeof spec.canvas.width !== 'number' || typeof spec.canvas.height !== 'number') {
    errors.push('canvas must have numeric width and height');
  }
  if (!spec.anchors || typeof spec.anchors !== 'object') {
    errors.push('anchors must be an object');
  } else {
    for (const [name, pt] of Object.entries(spec.anchors)) {
      if (!Array.isArray(pt) || pt.length !== 2 || typeof pt[0] !== 'number' || typeof pt[1] !== 'number') {
        errors.push(`anchor "${name}" must be a [number, number] pair`);
      }
    }
  }
  if (!Array.isArray(spec.parts)) {
    errors.push('parts must be an array');
  } else {
    const partIds = new Set();
    for (const part of spec.parts) {
      if (!part.id || typeof part.id !== 'string') {
        errors.push('each part must have a string id');
        continue;
      }
      if (partIds.has(part.id)) {
        errors.push(`duplicate part id "${part.id}"`);
      }
      partIds.add(part.id);
      if (!part.primitive || !PRIMITIVE_KINDS.has(part.primitive.kind)) {
        errors.push(`part "${part.id}" has unknown primitive kind "${part.primitive?.kind}"`);
      }
    }
  }
  if (!Array.isArray(spec.constraints)) {
    errors.push('constraints must be an array');
  } else {
    for (const c of spec.constraints) {
      if (!CONSTRAINT_KINDS.has(c.kind)) {
        errors.push(`unknown constraint kind "${c.kind}"`);
      }
    }
  }
  if (!spec.validation || typeof spec.validation !== 'object') {
    errors.push('validation must be an object');
  } else {
    const v = spec.validation;
    if (!Array.isArray(v.closedParts)) errors.push('validation.closedParts must be an array');
    if (typeof v.forbidSelfIntersections !== 'boolean') errors.push('validation.forbidSelfIntersections must be boolean');
    if (!WINDING_DIRECTIONS.has(v.consistentWinding)) errors.push('validation.consistentWinding must be clockwise or counterclockwise');
    if (typeof v.minimumCurvatureRadius !== 'number') errors.push('validation.minimumCurvatureRadius must be a number');
    if (typeof v.requireConnectedAssembly !== 'boolean') errors.push('validation.requireConnectedAssembly must be boolean');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Create a frozen PB-GEOMETRY-CONSTRUCTION-v1 packet.
 * Throws on invalid spec.
 */
export function createConstruction(spec) {
  // Canonicalization performs lossless-domain validation before any field is
  // projected into the packet, so unsupported extras cannot disappear.
  canonicalConstructionStringify(spec);

  const { valid, errors } = validateConstructionSpec(spec);
  if (!valid) {
    throw constructionError('VALUE', 'invalid construction spec', { errors });
  }

  const body = {
    contract: CONSTRUCTION_CONTRACT,
    version: CONSTRUCTION_VERSION,
    solverVersion: SOLVER_VERSION,
    id: spec.id,
    canvas: { width: spec.canvas.width, height: spec.canvas.height },
    anchors: Object.fromEntries(
      Object.entries(spec.anchors).map(([key, point]) => [key, quantizePoint(point)]),
    ),
    parts: spec.parts.map(part => ({
      id: part.id,
      primitive: { ...part.primitive },
    })),
    constraints: spec.constraints.map(constraint => ({ ...constraint })),
    validation: {
      closedParts: [...spec.validation.closedParts],
      forbidSelfIntersections: spec.validation.forbidSelfIntersections,
      consistentWinding: spec.validation.consistentWinding,
      minimumCurvatureRadius: spec.validation.minimumCurvatureRadius,
      requireConnectedAssembly: spec.validation.requireConnectedAssembly,
      ...(spec.validation.requireCanvasContainment === undefined
        ? {}
        : { requireCanvasContainment: spec.validation.requireCanvasContainment }),
      ...(spec.validation.connectionTolerance === undefined
        ? {}
        : { connectionTolerance: spec.validation.connectionTolerance }),
    },
  };

  return deepCloneAndFreeze({
    ...body,
    checksum: computeConstructionChecksum(body),
  });
}
