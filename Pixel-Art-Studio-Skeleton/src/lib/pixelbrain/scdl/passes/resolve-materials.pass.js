/**
 * SCDL Resolve Materials Pass
 *
 * Validates part material IDs against the existing material-registry.js.
 * Unknown materials emit a WARN (not ERROR) and fall back to 'source'.
 */

import { resolveMaterialId } from '../../material-registry.js';
import { SCDL_ERROR_CODES, scdlWarn } from '../scdl.errors.js';
import { mapParts } from '../graph-walk.js';

/**
 * @param {object} ast
 * @param {import('../scdl.errors.js').SCDLError[]} errors
 * @returns {object} new AST with materials validated/normalized
 */
export function resolveMaterialsPass(ast, errors) {
  const l = ast.sourceLocation || { line: 1, col: 1 };

  const resolvePart = part => {
    const resolved = resolveMaterialId(part.material);
    if (resolved !== part.material) {
      errors.push(scdlWarn(
        `Unknown material '${part.material}' in part '${part.id}' — falling back to '${resolved}'`,
        SCDL_ERROR_CODES.UNKNOWN_MATERIAL, part.loc || l,
        { material: part.material, fallback: resolved, partId: part.id }
      ));
    }
    return { ...part, material: resolved };
  };

  if (!ast.graphMode) {
    return { ...ast, parts: ast.parts.map(resolvePart) };
  }

  const resolveNodes = nodes => (nodes || []).map(node => {
    if (node.kind === 'part') return { ...node, part: resolvePart(node.part) };
    if (node.kind === 'group') return { ...node, children: resolveNodes(node.children) };
    if (node.kind === 'instance' && node.materialOverride) {
      const resolved = resolveMaterialId(node.materialOverride);
      if (resolved !== node.materialOverride) {
        errors.push(scdlWarn(
          `Unknown material '${node.materialOverride}' on instance '${node.name || node.ref}' — falling back to '${resolved}'`,
          SCDL_ERROR_CODES.UNKNOWN_MATERIAL, node.loc || l,
          { material: node.materialOverride, fallback: resolved, instance: node.name || node.ref }
        ));
      }
      return { ...node, materialOverride: resolved };
    }
    return node;
  });

  const roots = resolveNodes(ast.roots);
  const defs = (ast.defs || []).map(def => ({ ...def, nodes: resolveNodes(def.nodes) }));
  return {
    ...ast,
    roots,
    defs,
    parts: roots.filter(n => n.kind === 'part').map(n => n.part),
  };
}
