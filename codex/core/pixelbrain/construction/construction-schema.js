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
import {
  assertValidConstructionSpec,
  validateConstructionSpec as validateConstructionInput,
} from './construction-validation.js';

export const CONSTRUCTION_CONTRACT = 'PB-GEOMETRY-CONSTRUCTION-v1';
export const CONSTRUCTION_VERSION = '1.0.0';
export const SOLVER_VERSION = '1.0.0';

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

/** Validate a construction spec without throwing. */
export function validateConstructionSpec(spec) {
  return validateConstructionInput(spec);
}

/**
 * Create a frozen PB-GEOMETRY-CONSTRUCTION-v1 packet.
 * Throws on invalid spec.
 */
export function createConstruction(spec) {
  // Canonicalization performs lossless-domain validation before any field is
  // projected into the packet, so unsupported extras cannot disappear.
  canonicalConstructionStringify(spec);

  assertValidConstructionSpec(spec);

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
    // Laws are opt-in, so the packet records an explicit "asserts nothing" for
    // every law the author left out. The defaults are inert by design: a missing
    // law must never turn into a refusal the author did not ask for. The
    // constraints above are always verified either way.
    validation: {
      closedParts: [...(spec.validation?.closedParts ?? [])],
      forbidSelfIntersections: spec.validation?.forbidSelfIntersections ?? false,
      minimumCurvatureRadius: spec.validation?.minimumCurvatureRadius ?? 0,
      requireConnectedAssembly: spec.validation?.requireConnectedAssembly ?? false,
      // Winding has no inert value — omitting it means "do not check winding".
      ...(spec.validation?.consistentWinding === undefined
        ? {}
        : { consistentWinding: spec.validation.consistentWinding }),
      ...(spec.validation?.requireCanvasContainment === undefined
        ? {}
        : { requireCanvasContainment: spec.validation.requireCanvasContainment }),
      ...(spec.validation?.connectionTolerance === undefined
        ? {}
        : { connectionTolerance: spec.validation.connectionTolerance }),
    },
  };

  return deepCloneAndFreeze({
    ...body,
    checksum: computeConstructionChecksum(body),
  });
}
