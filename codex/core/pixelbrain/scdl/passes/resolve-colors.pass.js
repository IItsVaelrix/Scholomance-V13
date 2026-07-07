/**
 * SCDL Resolve Colors Pass
 *
 * Resolves all `colorRef` fields in ops:
 *   - { kind: 'alias', value: 'gold2' } → { kind: 'hex', value: '#D8B84C' }
 *   - { kind: 'hex',   value: '#D8B84C' } → validated hex
 *
 * Errors on:
 *   - Invalid hex format
 *   - Undefined palette alias
 */

import { SCDL_ERROR_CODES, scdlError } from '../scdl.errors.js';
import { mapParts } from '../graph-walk.js';

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * @param {object} ast
 * @param {import('../scdl.errors.js').SCDLError[]} errors
 * @returns {object} new AST with all colorRefs resolved to hex strings
 */
export function resolveColorsPass(ast, errors) {
  const palette = ast.palette || {};
  const l = ast.sourceLocation || { line: 1, col: 1 };

  function resolveRef(colorRef, opLoc) {
    if (!colorRef) return '#000000';
    const loc = opLoc || l;

    if (colorRef.kind === 'hex') {
      if (!HEX_RE.test(colorRef.value)) {
        errors.push(scdlError(
          `Invalid hex color '${colorRef.value}' — must be #RRGGBB`,
          SCDL_ERROR_CODES.INVALID_HEX_COLOR,
          loc,
          { color: colorRef.value }
        ));
        return '#000000';
      }
      return colorRef.value;
    }

    if (colorRef.kind === 'alias') {
      const resolved = palette[colorRef.value];
      if (!resolved) {
        errors.push(scdlError(
          `Undefined palette alias '${colorRef.value}'`,
          SCDL_ERROR_CODES.UNDEFINED_PALETTE_REF,
          loc,
          { alias: colorRef.value }
        ));
        return '#000000';
      }
      if (!HEX_RE.test(resolved)) {
        errors.push(scdlError(
          `Palette entry '${colorRef.value}' has invalid hex '${resolved}'`,
          SCDL_ERROR_CODES.INVALID_HEX_COLOR,
          loc,
          { alias: colorRef.value, color: resolved }
        ));
        return '#000000';
      }
      return resolved;
    }

    return '#000000';
  }

  // Also validate all palette entries up front
  for (const [name, hex] of Object.entries(palette)) {
    if (!HEX_RE.test(hex)) {
      errors.push(scdlError(
        `Palette entry '${name}' has invalid hex '${hex}'`,
        SCDL_ERROR_CODES.INVALID_HEX_COLOR,
        l,
        { alias: name, color: hex }
      ));
    }
  }

  const resolvePart = part => ({
    ...part,
    ops: part.ops.map(op => {
      const opLoc = op.loc || l;
      if (op.colorRef) {
        return { ...op, color: resolveRef(op.colorRef, opLoc), colorRef: undefined };
      }
      if (op.tierColorRefs) {
        return {
          ...op,
          tierColors: op.tierColorRefs.map(r => resolveRef(r, opLoc)),
          tierColorRefs: undefined,
        };
      }
      return op;
    }),
  });

  if (!ast.graphMode) {
    return { ...ast, parts: ast.parts.map(resolvePart) };
  }

  const roots = mapParts(ast.roots, resolvePart);
  const defs = (ast.defs || []).map(def => ({ ...def, nodes: mapParts(def.nodes, resolvePart) }));
  return {
    ...ast,
    roots,
    defs,
    parts: roots.filter(n => n.kind === 'part').map(n => n.part),
  };
}
