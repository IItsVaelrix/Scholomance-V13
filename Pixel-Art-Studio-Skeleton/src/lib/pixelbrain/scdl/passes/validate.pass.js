/**
 * SCDL Validate Pass
 *
 * Checks:
 *  - `asset` declaration present
 *  - canvas dimensions > 0
 *  - No duplicate part IDs
 *  - All op verbs are recognized
 *  - Export targets are supported
 */

import { SCDL_ERROR_CODES, scdlError } from '../scdl.errors.js';
import { walkSceneNodes } from '../graph-walk.js';

const SUPPORTED_EXPORTS = new Set(['json', 'svg', 'phaser', 'png', 'aseprite']);
const KNOWN_OPS = new Set([
  'symmetry', 'trace', 'fill', 'rim', 'cell', 'glow',
  'circle', 'ring', 'rect', 'polygon', 'path', 'sphere',
  // Wired extensions
  'ellipse', 'line', 'rotate', 'scale', 'translate',
  'union', 'subtract', 'intersect',
  'reference', 'instance',
]);

/**
 * @param {object} ast - SCDL-AST-v1 (raw from parser)
 * @param {SCDLError[]} errors - mutable array to push into
 * @returns {object} ast (unchanged)
 */
export function validatePass(ast, errors) {
  const l = ast.sourceLocation || { line: 1, col: 1 };

  // 1 — asset present
  if (!ast.asset || ast.asset === 'unnamed') {
    errors.push(scdlError(`Missing 'asset' declaration`, SCDL_ERROR_CODES.MISSING_ASSET, l));
  }

  // 2 — canvas dimensions
  if (!ast.canvas || ast.canvas.width <= 0 || ast.canvas.height <= 0) {
    errors.push(scdlError(
      `Invalid canvas '${ast.canvas?.width}x${ast.canvas?.height}' — must be WxH with W,H > 0`,
      SCDL_ERROR_CODES.INVALID_CANVAS, l
    ));
  }

  // 3 — duplicate part IDs
  const seen = new Set();
  for (const part of (ast.parts || [])) {
    if (seen.has(part.id)) {
      errors.push(scdlError(
        `Duplicate part ID '${part.id}'`,
        SCDL_ERROR_CODES.DUPLICATE_PART_ID,
        part.loc || l,
        { partId: part.id }
      ));
    }
    seen.add(part.id);

    // 4 — unknown ops
    for (const op of (part.ops || [])) {
      if (!KNOWN_OPS.has(op.op)) {
        errors.push(scdlError(
          `Unknown op '${op.op}' in part '${part.id}'`,
          SCDL_ERROR_CODES.UNKNOWN_VERB,
          op.loc || l,
          { op: op.op, partId: part.id }
        ));
      }
      validateVectorOp(op, part, errors, l);
    }
  }

  // 5 — export targets
  for (const target of (ast.exports || [])) {
    if (!SUPPORTED_EXPORTS.has(target)) {
      errors.push(scdlError(
        `Unknown export target '${target}' — supported: json, svg, phaser, png, aseprite`,
        SCDL_ERROR_CODES.UNKNOWN_EXPORT_TARGET,
        l,
        { target }
      ));
    }
  }

  // ── SCDL v1.2 scene-graph structural checks ──────────────────────────────
  if (ast.graphMode) {
    // 4b — op verbs + vector params inside def/group parts (root parts were
    // already covered by the ast.parts loop above; skip them here)
    walkSceneNodes(ast, (node, containerKind) => {
      if (node.kind === 'part' && containerKind !== 'root') {
        for (const op of (node.part.ops || [])) {
          if (!KNOWN_OPS.has(op.op)) {
            errors.push(scdlError(
              `Unknown op '${op.op}' in part '${node.part.id}'`,
              SCDL_ERROR_CODES.UNKNOWN_VERB, op.loc || l, { op: op.op, partId: node.part.id }
            ));
          }
          validateVectorOp(op, node.part, errors, l);
        }
      }
      // transform sanity (groups + instances)
      const t = node.transform;
      if (t) {
        const bad =
          t._missingAt ||
          ![t.tx, t.ty, t.theta, t.sx, t.sy].every(Number.isFinite) ||
          t.sx === 0 || t.sy === 0;
        if (bad) {
          errors.push(scdlError(
            t._missingAt
              ? `Instance '${node.ref || node.id}' is missing its mandatory 'at x y' clause`
              : `Invalid transform on '${node.id || node.ref}' — params must be finite, scale nonzero`,
            SCDL_ERROR_CODES.INVALID_TRANSFORM, node.loc || l,
            { node: node.id || node.ref, transform: { ...t } }
          ));
        }
      }
    });

    // Shared id namespace per scope (root scope + each group + each def body)
    const checkScope = (nodes, scopeLabel) => {
      const seenIds = new Set();
      for (const node of nodes || []) {
        const id = node.kind === 'part' ? node.part.id
                 : node.kind === 'group' ? node.id
                 : node.name; // instance: only named instances claim an id
        if (id) {
          if (seenIds.has(id)) {
            errors.push(scdlError(
              `Duplicate node id '${id}' in ${scopeLabel}`,
              SCDL_ERROR_CODES.DUPLICATE_PART_ID, node.loc || l, { partId: id, scope: scopeLabel }
            ));
          }
          seenIds.add(id);
        }
        if (node.kind === 'group') checkScope(node.children, `group '${node.id}'`);
      }
    };
    checkScope(ast.roots, 'scene root');
    for (const def of (ast.defs || [])) checkScope(def.nodes, `def '${def.id}'`);
  }

  return ast;
}

function validateVectorOp(op, part, errors, fallbackLoc) {
  if (!['circle', 'ring', 'rect', 'polygon', 'path', 'sphere'].includes(op.op)) return;

  const loc = op.loc || fallbackLoc;
  const fail = (message, context = {}) => {
    errors.push(scdlError(
      message,
      SCDL_ERROR_CODES.INVALID_VECTOR_OP,
      loc,
      { op: op.op, partId: part.id, ...context }
    ));
  };
  const finite = value => Number.isFinite(value);
  const positive = value => finite(value) && value > 0;

  if (op.op === 'circle' && !positive(op.radius)) {
    fail(`Invalid circle radius '${op.radius}' — must be > 0`, { radius: op.radius });
  }
  if (op.op === 'ring') {
    if (!positive(op.radius)) fail(`Invalid ring radius '${op.radius}' — must be > 0`, { radius: op.radius });
    if (!positive(op.width)) fail(`Invalid ring width '${op.width}' — must be > 0`, { width: op.width });
  }
  if (op.op === 'rect') {
    if (!positive(op.w)) fail(`Invalid rect width '${op.w}' — must be > 0`, { width: op.w });
    if (!positive(op.h)) fail(`Invalid rect height '${op.h}' — must be > 0`, { height: op.h });
  }
  if (op.op === 'polygon' && (!Array.isArray(op.points) || op.points.length < 3)) {
    fail(`Invalid polygon — at least 3 points are required`, { pointCount: op.points?.length || 0 });
  }
  if (op.op === 'path' && !String(op.d || '').trim()) {
    fail(`Invalid path — path data string is required`);
  }
  if (op.op === 'sphere') {
    if (!positive(op.radius)) fail(`Invalid sphere radius '${op.radius}' — must be > 0`, { radius: op.radius });
    if (!Array.isArray(op.tierColorRefs) || op.tierColorRefs.length !== 5) {
      fail(`Invalid sphere tier color count '${op.tierColorRefs?.length || 0}' — expected 5`, {
        tierColorCount: op.tierColorRefs?.length || 0,
      });
    }
    if (!finite(op.lx) || !finite(op.ly) || (op.lx === 0 && op.ly === 0)) {
      fail(`Invalid sphere light vector '${op.lx},${op.ly}' — must be a non-zero finite vector`, {
        lx: op.lx,
        ly: op.ly,
      });
    }
  }
}
