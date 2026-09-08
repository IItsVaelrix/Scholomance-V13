/**
 * lower-booleans.js
 *
 * Cross-part boolean geometry lowering: union/subtract/intersect combine a
 * part's own accumulated cells with one or more SIBLING PARTS, addressed by
 * their part id — the only name an SCDL author can actually write (op ids
 * are auto-generated internally and never typable in source).
 *
 * "Shape" (which cells belong to a given part) is resolved via
 * geometry-amp.js's buildPartMask(), reusing the same part->cells lookup
 * the item-foundry shading pipeline already relies on. That helper takes a
 * silhouette-style {x,y}->partId map and resolves an overlapping cell to a
 * single owner (last writer wins) — correct for item-foundry's specs, whose
 * parts are deliberately exclusive, disjoint territory. SCDL parts carry no
 * such guarantee: two parts can legitimately draw the same coordinate, and
 * subtract/intersect exist specifically to combine that raw overlap. So
 * each part gets its OWN scoped map containing only its own cells before
 * being handed to buildPartMask — never one shared map across the asset —
 * which keeps the helper's ownership-resolution semantics from silently
 * reassigning a legitimately shared cell away from an earlier part.
 *
 * Target parts keep rendering standalone in the final packet — a boolean op
 * only affects the CURRENT part's own op list. If you don't want a
 * modifier/cutter part visible on its own, don't give it drawing ops beyond
 * what it needs to define its shape.
 *
 * Semantic ownership rules (unchanged from the op-id design this replaces):
 *   union A B     -> dominant/outer role (first wins)
 *   subtract A B  -> role of A
 *   intersect A B -> ambiguous unless explicit; conflicting roles WARN (SCDL-024)
 *
 * Called from expand-vector.pass.js, once per asset, after every part's own
 * (non-boolean) vector ops have been rasterized into cells.
 */

import { buildPartMask } from '../../geometry-amp.js';
import { SCDL_ERROR_CODES, scdlError, scdlWarn } from '../scdl.errors.js';

const BOOLEAN_VERBS = new Set(['union', 'subtract', 'intersect']);

function cellKey(c) { return `${c.x},${c.y}`; }

/** A part's own {x,y}->partId map, scoped to exactly its own cells — see
 *  the module doc for why this must never be shared across parts. */
function ownPartOf(part) {
  const partOf = new Map();
  for (const op of part.ops) {
    if (op.op === 'cell') partOf.set(cellKey(op), part.id);
  }
  return partOf;
}

/** The coordinate set a part occupies, via geometry-amp.js's silhouette mask. */
function shapeKeysOf(part) {
  return new Set(buildPartMask(ownPartOf(part), part.id).map(cellKey));
}

/**
 * Resolve every union/subtract/intersect op across all parts of a compiled
 * asset. Non-boolean ops are left exactly as rasterized; parts with no
 * boolean ops are returned unchanged.
 *
 * @param {object[]} parts - parts whose vector ops are already rasterized to cells
 * @param {import('../scdl.errors.js').SCDLError[]} errors
 * @returns {object[]} new parts array
 */
export function resolveBooleanOpsPass(parts, errors) {
  if (!parts.some(part => part.ops.some(op => BOOLEAN_VERBS.has(op.op)))) {
    return parts;
  }

  const partIds = new Set(parts.map(p => p.id));
  const partsById = new Map(parts.map(p => [p.id, p]));

  return parts.map(part => {
    const booleanOps = part.ops.filter(op => BOOLEAN_VERBS.has(op.op));
    if (booleanOps.length === 0) return part;

    let ops = part.ops.filter(op => !BOOLEAN_VERBS.has(op.op));
    for (const op of booleanOps) {
      ops = applyBooleanOp(op, part, ops, { partIds, partsById }, errors);
    }
    return { ...part, ops };
  });
}

/** Apply one boolean op to a part's accumulated (non-boolean-verb) ops. */
function applyBooleanOp(op, part, ops, { partIds, partsById }, errors) {
  const targets = Array.isArray(op.targets) ? op.targets : [];

  if (targets.length < 2) {
    errors.push(scdlError(
      `Boolean op '${op.op}' requires at least 2 target parts, got ${targets.length}`,
      SCDL_ERROR_CODES.BOOLEAN_OP_ARITY,
      op.loc,
      { op: op.op, partId: part.id, targets }
    ));
    return ops;
  }

  const badTargets = targets.filter(t => t === part.id || !partIds.has(t));
  if (badTargets.length > 0) {
    errors.push(scdlError(
      `Boolean op '${op.op}' in part '${part.id}' references invalid target(s) `
      + `${badTargets.map(t => `'${t}'`).join(', ')} — targets must name a different, existing part`,
      SCDL_ERROR_CODES.INVALID_BOOLEAN_TARGET,
      op.loc,
      { op: op.op, partId: part.id, targets, badTargets }
    ));
    return ops;
  }

  const [baseId, ...modIds] = targets;
  const baseCells = partsById.get(baseId).ops.filter(c => c.op === 'cell');
  const modCells = modIds.flatMap(id => partsById.get(id).ops.filter(c => c.op === 'cell'));

  // Each target's own shape (coordinate set), used only for overlap testing —
  // the actual renderable cells come straight from the part's own ops above.
  const modUnionKeys = new Set(modIds.flatMap(id => [...shapeKeysOf(partsById.get(id))]));

  const baseRole = baseCells.find(c => c.role)?.role || null;
  const modRoles = new Set(modCells.map(c => c.role).filter(Boolean));

  if (op.op === 'intersect') {
    for (const mRole of modRoles) {
      if (baseRole && mRole && baseRole !== mRole) {
        errors.push(scdlWarn(
          `Semantic role conflict in intersection: '${baseRole}' vs '${mRole}'`,
          SCDL_ERROR_CODES.SEMANTIC_ROLE_CONFLICT,
          op.loc,
          { op: op.op, partId: part.id, baseRole, conflictingRole: mRole }
        ));
      }
    }
  }

  // A cell pulled in from a target part now lives in, and renders as part
  // of, THIS part — not the part it was originally rasterized under. Retag
  // partId accordingly so emitPacketPass (which trusts coord.partId over
  // its containing part) attributes it correctly; the target part is
  // untouched and keeps rendering its own original cells standalone.
  const retag = role => c => ({ ...c, role, partId: part.id, sourceOpId: op.id });

  if (op.op === 'union') {
    const role = baseRole || 'union-result';
    // Later-declared target wins on an overlapping cell, matching the
    // codebase's existing painter-order convention (later paints over
    // earlier — see scene-graph-renderer.js).
    const merged = new Map();
    for (const c of baseCells) merged.set(cellKey(c), c);
    for (const c of modCells) merged.set(cellKey(c), c);
    return [...ops, ...[...merged.values()].map(retag(role))];
  }

  if (op.op === 'subtract') {
    const role = baseRole || part.material || 'body';
    return [...ops, ...baseCells.filter(c => !modUnionKeys.has(cellKey(c))).map(retag(role))];
  }

  // intersect
  const role = baseRole || 'intersect-ambiguous';
  return [...ops, ...baseCells.filter(c => modUnionKeys.has(cellKey(c))).map(retag(role))];
}
