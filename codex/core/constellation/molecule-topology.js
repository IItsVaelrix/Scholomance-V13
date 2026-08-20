/**
 * DERIVATION TOPOLOGY (§2.3)
 *
 * Packed molecules are not PixelBrain silicone graphs. This classifies the
 * first-derivation child graph only:
 *   linear   — a spine (0–1 child per node, no rejoin)
 *   cyclic   — a child points at an ancestor
 *   network  — a node has two+ children or a rejoin
 *
 * Annotate-only. Not a quench. Not a new bond.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/molecule-topology
 */

export const MOLECULE_TOPOLOGY_CONTRACT = 'PB-MOLECULE-TOPOLOGY-v1';

function childrenOf(d) {
  if (!d) return [];
  if (d.lift && d.child) return [d.child];
  const kids = [];
  if (d.left) kids.push(d.left);
  if (d.right) kids.push(d.right);
  return kids;
}

export function classifyMoleculeTopology(node) {
  if (!node) return 'linear';
  let branched = false;
  const ancestors = new Set();
  const seen = new Set();
  let cyclic = false;

  function visit(cur) {
    if (!cur || cyclic) return;
    if (ancestors.has(cur)) {
      cyclic = true;
      return;
    }
    if (seen.has(cur)) {
      branched = true;
      return;
    }
    seen.add(cur);
    ancestors.add(cur);
    const d = (cur.derivations && cur.derivations[0]) || null;
    const kids = childrenOf(d);
    for (const kid of kids) visit(kid);
    ancestors.delete(cur);
  }

  visit(node);
  if (cyclic) return 'cyclic';
  if (branched) return 'network';
  return 'linear';
}

export function annotateMoleculeTopology(chart) {
  for (const node of chart?.molecules || []) {
    node.topology = classifyMoleculeTopology(node);
  }
  return chart;
}
