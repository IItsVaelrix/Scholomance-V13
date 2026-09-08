/**
 * SCDL Expand Symmetry Pass
 *
 * Delegates to SymmetryAMP's `applySymmetryToLattice()`.
 *
 * For each part that has a `symmetry` op:
 *  1. Collect the part's existing `cell` ops into a minimal lattice Map
 *  2. Call applySymmetryToLattice(lattice, { type, significant: true })
 *  3. Convert the result back into `cell` ops
 *  4. Remove the `symmetry` op (it has been expanded)
 *
 * SCDL → SymmetryAMP axis vocabulary:
 *   'x'  → 'vertical'   (mirror left↔right)
 *   'y'  → 'horizontal' (mirror top↔bottom)
 *   'xy' → 'radial'     (mirror all four quadrants)
 */

import { applySymmetryToLattice } from '../../symmetry-amp.js';

const AXIS_MAP = Object.freeze({
  x:  'vertical',
  y:  'horizontal',
  xy: 'radial',
});

/**
 * @param {object} ast
 * @param {import('../scdl.errors.js').SCDLError[]} _errors - unused (symmetry expansion never errors)
 * @returns {object} new AST with symmetry ops expanded into cell ops
 */
export function expandSymmetryPass(ast, _errors) {
  const { canvas } = ast;
  const cols = canvas.width;
  const rows = canvas.height;

  const expandedParts = ast.parts.map(part => {
    const symmetryOps = part.ops.filter(op => op.op === 'symmetry');
    if (symmetryOps.length === 0) return part; // nothing to expand

    // Use the last symmetry declaration (overrides earlier ones)
    const symmetryOp = symmetryOps[symmetryOps.length - 1];
    const symmetryType = AXIS_MAP[symmetryOp.axis] || 'vertical';

    // Build minimal lattice from existing cell ops
    const cells = new Map();
    for (const op of part.ops) {
      if (op.op !== 'cell') continue;
      const key = `${op.x},${op.y}`;
      cells.set(key, {
        col:   op.x,
        row:   op.y,
        color: op.color || '#ffffff',
        emphasis: 1,
        partId:   part.id,
        material: part.material,
      });
    }

    // Apply symmetry via SymmetryAMP
    const lattice = { cols, rows, cells };
    const symmetryDescriptor = { type: symmetryType, significant: true, confidence: 1.0 };
    const mirrored = applySymmetryToLattice(lattice, symmetryDescriptor);

    // Convert result back to cell ops
    const mirroredCellOps = [];
    mirrored.cells.forEach(cell => {
      mirroredCellOps.push({
        op:     'cell',
        x:      cell.col,
        y:      cell.row,
        color:  cell.color,
        _mirrored: true,
      });
    });

    // Replace original cell ops with mirrored set; remove symmetry ops
    const nonCellNonSymmetryOps = part.ops.filter(op => op.op !== 'cell' && op.op !== 'symmetry');
    const newOps = [...nonCellNonSymmetryOps, ...mirroredCellOps];

    return { ...part, ops: newOps, _symmetryApplied: symmetryType };
  });

  return { ...ast, parts: expandedParts };
}
