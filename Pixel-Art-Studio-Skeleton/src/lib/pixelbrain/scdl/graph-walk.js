/**
 * SCDL Graph Walk — shared traversal helpers for scene-graph ASTs.
 * Pure functions; no pass logic lives here.
 */

/** Depth-first visit of every scene node in roots and def bodies. */
export function walkSceneNodes(ast, fn) {
  const visit = (nodes, containerKind) => {
    for (const node of nodes || []) {
      fn(node, containerKind);
      if (node.kind === 'group') visit(node.children, 'group');
    }
  };
  visit(ast.roots || [], 'root');
  for (const def of ast.defs || []) visit(def.nodes, 'def');
}

/** Immutably map every part in a node array (recursing through groups). */
export function mapParts(nodes, mapPartFn) {
  return (nodes || []).map(node => {
    if (node.kind === 'part') return { ...node, part: mapPartFn(node.part) };
    if (node.kind === 'group') return { ...node, children: mapParts(node.children, mapPartFn) };
    return node;
  });
}
