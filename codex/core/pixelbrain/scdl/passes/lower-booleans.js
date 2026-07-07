/**
 * lower-booleans.js
 * Modular boolean geometry lowering for expand-vector.
 * Enforces semantic ownership rules:
 *   union A B     -> dominant/outer role (first wins)
 *   subtract A B  -> role of A
 *   intersect A B -> ambiguous unless explicit
 *
 * Called from expand-vector.pass.js
 */

import { pushCell, inBounds } from '../render/raster-core.js'; // shared helpers extracted to raster-core

export function applyBooleanOp(boolOp, targets, part, W, H, ops, errors) {
  if (!Array.isArray(targets) || targets.length < 2) {
    if (errors) errors.push({ code: 'PB-SEM-ERR', message: `Boolean op ${boolOp} requires at least 2 targets.` });
    return;
  }

  const baseTarget = targets[0];
  const modTargets = new Set(targets.slice(1));

  const modCellSet = new Set();
  const modRoles = new Set();
  let baseRole = null;

  for (let i = 0; i < ops.length; i++) {
    const cell = ops[i];
    if (cell.sourceOpId === baseTarget) {
      if (cell.role) baseRole = cell.role;
    } else if (modTargets.has(cell.sourceOpId)) {
      modCellSet.add(`${cell.x},${cell.y}`);
      if (cell.role) modRoles.add(cell.role);
    }
  }

  let role = null;
  let material = part.material || 'source';

  if (boolOp === 'union') {
    role = baseRole || 'union-result'; 
  } else if (boolOp === 'subtract') {
    role = baseRole || part.role || 'body';
  } else if (boolOp === 'intersect') {
    role = baseRole || 'intersect-ambiguous';
    // Enforce Semantic Role Conflicts (PB-SEM-002)
    for (const mRole of modRoles) {
      if (baseRole && mRole && baseRole !== mRole) {
        if (errors) {
          errors.push({
            code: 'PB-SEM-002',
            message: `Semantic role conflict in intersection: ${baseRole} vs ${mRole}`
          });
        }
      }
    }
  }

  if (boolOp === 'subtract') {
    const newOps = ops.filter(cell => {
      if (cell.sourceOpId === baseTarget) return !modCellSet.has(`${cell.x},${cell.y}`);
      if (modTargets.has(cell.sourceOpId)) return false;
      return true;
    });
    ops.length = 0;
    ops.push(...newOps);
    ops.forEach(cell => {
      if (cell.sourceOpId === baseTarget) cell.role = role;
    });
  } else if (boolOp === 'intersect') {
    const newOps = ops.filter(cell => {
      if (cell.sourceOpId === baseTarget) return modCellSet.has(`${cell.x},${cell.y}`);
      if (modTargets.has(cell.sourceOpId)) return false;
      return true;
    });
    ops.length = 0;
    ops.push(...newOps);
    ops.forEach(cell => {
      if (cell.sourceOpId === baseTarget) cell.role = role;
    });
  } else if (boolOp === 'union') {
    ops.forEach(cell => {
      if (cell.sourceOpId === baseTarget || modTargets.has(cell.sourceOpId)) {
        cell.role = role;
        cell.sourceOpId = baseTarget; // Combine into single addressable group
      }
    });
  }
}