/**
 * SCDL Build Scene Graph Pass (v1.2)
 *
 * Consumes a color/material-resolved graph AST and emits ast.sceneGraph
 * (PB-SCENE-GRAPH-v1): the canonical, identity-bearing program form.
 *
 * Laws enforced here:
 *  - SCDL-016 every instance ref resolves to a declared def
 *  - SCDL-017 the def-reference digraph is acyclic
 *  - SCDL-018 expansion depth ≤ DEPTH_CAP (8) — fail-closed bounded recursion
 *  - SCDL-020 WARN instance whose world AABB misses the canvas
 *  - SCDL-021 WARN def never reachable from the roots
 *
 * Canonical nodes carry NO source locations, NO semantic annotations —
 * the packet ID hashes this structure (spec §6 identity law).
 */

import { SCDL_ERROR_CODES, scdlError, scdlWarn } from '../scdl.errors.js';
import { identity, matFromTransform, matMul, transformAABB } from '../render/transform2d.js';

export const DEPTH_CAP = 8;

// Identity-bearing op fields per verb; everything else (loc, ids, annotations) is dropped.
const OP_FIELDS = Object.freeze({
  cell:     ['x', 'y', 'color'],
  line:     ['x0', 'y0', 'x1', 'y1', 'color'],
  rect:     ['x', 'y', 'w', 'h', 'color'],
  circle:   ['cx', 'cy', 'radius', 'color'],
  ellipse:  ['cx', 'cy', 'rx', 'ry', 'color'],
  ring:     ['cx', 'cy', 'radius', 'width', 'color'],
  polygon:  ['points', 'color'],
  path:     ['d', 'color'],
  sphere:   ['cx', 'cy', 'radius', 'lx', 'ly', 'tierColors'],
  symmetry: ['axis', 'count'],
  rim:      ['color', 'compass'],
  fill:     ['color'],
  glow:     ['radius'],
  trace:    ['source'],
});

export function canonicalOp(op) {
  const fields = OP_FIELDS[op.op];
  if (!fields) return { op: op.op };
  const out = { op: op.op };
  for (const f of fields) {
    if (op[f] !== undefined) out[f] = op[f];
  }
  return out;
}

function canonicalNodes(nodes) {
  return (nodes || []).map(node => {
    if (node.kind === 'part') {
      return {
        kind: 'part',
        id: node.part.id,
        material: node.part.material,
        ops: (node.part.ops || []).map(canonicalOp),
      };
    }
    if (node.kind === 'group') {
      return {
        kind: 'group',
        id: node.id,
        transform: canonicalTransform(node.transform),
        children: canonicalNodes(node.children),
      };
    }
    return {
      kind: 'instance',
      ref: node.ref,
      name: node.name ?? null,
      transform: canonicalTransform(node.transform),
      materialOverride: node.materialOverride ?? null,
    };
  });
}

function canonicalTransform(t = {}) {
  return {
    tx: t.tx ?? 0, ty: t.ty ?? 0, theta: t.theta ?? 0,
    sx: t.sx ?? 1, sy: t.sy ?? 1, mirror: t.mirror ?? null,
  };
}

// ── analysis helpers ─────────────────────────────────────────────────────────

function opAABB(op) {
  switch (op.op) {
    case 'cell': return { minX: op.x, minY: op.y, maxX: op.x + 1, maxY: op.y + 1 };
    case 'rect': return { minX: op.x, minY: op.y, maxX: op.x + op.w, maxY: op.y + op.h };
    case 'line': return {
      minX: Math.min(op.x0, op.x1), minY: Math.min(op.y0, op.y1),
      maxX: Math.max(op.x0, op.x1) + 1, maxY: Math.max(op.y0, op.y1) + 1,
    };
    case 'circle': case 'sphere':
      return { minX: op.cx - op.radius, minY: op.cy - op.radius, maxX: op.cx + op.radius + 1, maxY: op.cy + op.radius + 1 };
    case 'ring': {
      const r = op.radius + (op.width || 1) / 2;
      return { minX: op.cx - r, minY: op.cy - r, maxX: op.cx + r + 1, maxY: op.cy + r + 1 };
    }
    case 'ellipse':
      return { minX: op.cx - op.rx, minY: op.cy - op.ry, maxX: op.cx + op.rx + 1, maxY: op.cy + op.ry + 1 };
    case 'polygon': {
      const xs = (op.points || []).map(p => p[0]);
      const ys = (op.points || []).map(p => p[1]);
      if (!xs.length) return null;
      return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs) + 1, maxY: Math.max(...ys) + 1 };
    }
    default: return null; // path/fill/rim/glow/trace/symmetry — skip for AABB purposes
  }
}

function unionAABB(a, b) {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY),
  };
}

// Local AABB of a def body / node list (transforms of children applied).
function nodesAABB(nodes, defTable, seen = new Set()) {
  let box = null;
  for (const node of nodes || []) {
    if (node.kind === 'part') {
      // symmetry x/y/xy inside defs mirrors around local axes → reflect AABB
      let partBox = null;
      for (const op of node.part.ops || []) partBox = unionAABB(partBox, opAABB(op));
      const sym = (node.part.ops || []).filter(o => o.op === 'symmetry').pop();
      if (partBox && sym && (sym.axis === 'x' || sym.axis === 'xy')) {
        partBox = unionAABB(partBox, { minX: -partBox.maxX, minY: partBox.minY, maxX: -partBox.minX, maxY: partBox.maxY });
      }
      if (partBox && sym && (sym.axis === 'y' || sym.axis === 'xy')) {
        partBox = unionAABB(partBox, { minX: partBox.minX, minY: -partBox.maxY, maxX: partBox.maxX, maxY: -partBox.minY });
      }
      box = unionAABB(box, partBox);
    } else if (node.kind === 'group') {
      const childBox = nodesAABB(node.children, defTable, seen);
      if (childBox) box = unionAABB(box, transformAABB(matFromTransform(node.transform), childBox));
    } else if (node.kind === 'instance') {
      const def = defTable.get(node.ref);
      if (def && !seen.has(node.ref)) {
        seen.add(node.ref); // cycle guard (real cycles already errored)
        const defBox = nodesAABB(def.nodes, defTable, seen);
        seen.delete(node.ref);
        if (defBox) box = unionAABB(box, transformAABB(matFromTransform(node.transform), defBox));
      }
    }
  }
  return box;
}

/**
 * @param {object} ast - color/material-resolved graph AST
 * @param {import('../scdl.errors.js').SCDLError[]} errors
 */
export function buildSceneGraphPass(ast, errors) {
  if (!ast.graphMode) return ast;
  const l = ast.sourceLocation || { line: 1, col: 1 };
  const defTable = new Map((ast.defs || []).map(d => [d.id, d]));

  // ── SCDL-016: every ref resolves ──
  const eachInstance = (nodes, fn) => {
    for (const node of nodes || []) {
      if (node.kind === 'instance') fn(node);
      if (node.kind === 'group') eachInstance(node.children, fn);
    }
  };
  const allScopes = [ast.roots, ...(ast.defs || []).map(d => d.nodes)];
  let refsOk = true;
  for (const scope of allScopes) {
    eachInstance(scope, node => {
      if (!defTable.has(node.ref)) {
        refsOk = false;
        errors.push(scdlError(
          `Instance references undeclared def '${node.ref}'`,
          SCDL_ERROR_CODES.UNKNOWN_DEF_REF, node.loc || l, { ref: node.ref }
        ));
      }
    });
  }
  if (!refsOk) return ast;

  // ── SCDL-017: acyclicity of def→def edges ──
  const VISITING = 1, DONE = 2;
  const state = new Map();
  let cyclic = false;
  const visitDef = (id, path) => {
    if (state.get(id) === DONE || cyclic) return;
    if (state.get(id) === VISITING) {
      cyclic = true;
      errors.push(scdlError(
        `Def reference cycle: ${[...path, id].join(' → ')}`,
        SCDL_ERROR_CODES.DEF_CYCLE, defTable.get(id)?.loc || l, { cycle: [...path, id] }
      ));
      return;
    }
    state.set(id, VISITING);
    eachInstance(defTable.get(id)?.nodes, node => visitDef(node.ref, [...path, id]));
    state.set(id, DONE);
  };
  for (const id of defTable.keys()) visitDef(id, []);
  if (cyclic) return ast;

  // ── SCDL-018: expansion depth (memoized def depths; acyclic by now) ──
  const defDepth = new Map();
  const depthOfNodes = nodes => {
    let max = 0;
    for (const node of nodes || []) {
      if (node.kind === 'part') max = Math.max(max, 1);
      else if (node.kind === 'group') max = Math.max(max, 1 + depthOfNodes(node.children));
      else max = Math.max(max, 1 + depthOfDef(node.ref));
    }
    return max;
  };
  const depthOfDef = id => {
    if (!defDepth.has(id)) defDepth.set(id, depthOfNodes(defTable.get(id).nodes));
    return defDepth.get(id);
  };
  const totalDepth = depthOfNodes(ast.roots);
  if (totalDepth > DEPTH_CAP) {
    errors.push(scdlError(
      `Scene graph depth ${totalDepth} exceeds cap ${DEPTH_CAP}`,
      SCDL_ERROR_CODES.DEPTH_CAP, l, { depth: totalDepth, cap: DEPTH_CAP }
    ));
    return ast;
  }

  // ── SCDL-021: dead defs (unreachable from roots) ──
  const reachable = new Set();
  const markFrom = nodes => eachInstance(nodes, node => {
    if (!reachable.has(node.ref)) {
      reachable.add(node.ref);
      markFrom(defTable.get(node.ref).nodes);
    }
  });
  markFrom(ast.roots);
  for (const def of ast.defs || []) {
    if (!reachable.has(def.id)) {
      errors.push(scdlWarn(
        `Def '${def.id}' is declared but never instanced`,
        SCDL_ERROR_CODES.DEAD_DEF, def.loc || l, { def: def.id }
      ));
    }
  }

  // ── SCDL-020: dead instances (world AABB misses canvas) — roots only ──
  const { width: W, height: H } = ast.canvas;
  const checkDead = (nodes, parentM) => {
    for (const node of nodes || []) {
      if (node.kind === 'group') {
        checkDead(node.children, matMul(parentM, matFromTransform(node.transform)));
      } else if (node.kind === 'instance') {
        const localBox = nodesAABB(defTable.get(node.ref).nodes, defTable);
        if (localBox) {
          const M = matMul(parentM, matFromTransform(node.transform));
          const w = transformAABB(M, localBox);
          if (w.maxX <= 0 || w.maxY <= 0 || w.minX >= W || w.minY >= H) {
            errors.push(scdlWarn(
              `Instance '${node.name || node.ref}' is fully outside the ${W}x${H} canvas`,
              SCDL_ERROR_CODES.DEAD_INSTANCE, node.loc || l,
              { ref: node.ref, worldAABB: w }
            ));
          }
        }
      }
    }
  };
  checkDead(ast.roots, identity());

  // ── Canonical program form ──
  const sceneGraph = {
    contract: 'PB-SCENE-GRAPH-v1',
    version:  '1.0.0',
    depthCap: DEPTH_CAP,
    canvas:   { width: W, height: H },
    defs: Object.fromEntries(
      (ast.defs || []).map(d => [d.id, { nodes: canonicalNodes(d.nodes) }])
    ),
    roots: canonicalNodes(ast.roots),
  };

  return { ...ast, sceneGraph };
}
