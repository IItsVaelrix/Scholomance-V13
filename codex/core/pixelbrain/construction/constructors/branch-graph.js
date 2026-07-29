/**
 * Branch-graph constructor — recursive branching structure (trees, lightning, rivers).
 * PDR §3: { kind:'branch-graph', root: AnchorRef, branches: BranchSpec[] }
 * Bounded recursion depth (max 6).
 */

import { qp, buildSolvedPart } from '../geometry-utils.js';

const MAX_DEPTH = 6;

/**
 * Solve a branch-graph primitive.
 * Each branch spec: { angle, length, children?: BranchSpec[] }
 * Angle is relative to parent direction (radians).
 */
export function solveBranchGraph(spec, ctx) {
  const rootAnchor = ctx.anchors[spec.root.anchor];
  if (!rootAnchor) throw new Error(`BranchGraph: unknown anchor "${spec.root.anchor}"`);

  const root = [
    rootAnchor[0] + (spec.root.offset?.[0] ?? 0),
    rootAnchor[1] + (spec.root.offset?.[1] ?? 0),
  ];

  const allSegments = [];
  const allPoints = [root];

  function recurse(origin, parentAngle, childBranches, depth) {
    if (depth > MAX_DEPTH) return;
    if (!Array.isArray(childBranches)) return;

    for (const branch of childBranches) {
      const angle = parentAngle + (branch.angle ?? 0);
      const length = branch.length ?? 5;
      const end = [
        origin[0] + length * Math.cos(angle),
        origin[1] + length * Math.sin(angle),
      ];

      allSegments.push({ start: qp(origin), end: qp(end), depth });
      allPoints.push(end);

      if (branch.children && branch.children.length > 0) {
        recurse(end, angle, branch.children, depth + 1);
      }
    }
  }

  // Default parent angle: upward (-π/2)
  recurse(root, -Math.PI / 2, spec.branches, 0);

  // Spine: the root-to-deepest-leaf path (first branch chain)
  const spine = [root];
  let current = root;
  let currentAngle = -Math.PI / 2;
  let branches = spec.branches;
  for (let d = 0; d <= MAX_DEPTH && branches && branches.length > 0; d++) {
    const b = branches[0]; // follow first branch as spine
    const angle = currentAngle + (b.angle ?? 0);
    const length = b.length ?? 5;
    current = [current[0] + length * Math.cos(angle), current[1] + length * Math.sin(angle)];
    spine.push(current);
    currentAngle = angle;
    branches = b.children;
  }

  const namedPoints = {
    root: root,
    tip: spine[spine.length - 1],
    center: spine[Math.floor(spine.length / 2)],
  };

  const part = buildSolvedPart(spec._partId || 'branch-graph', 'branch-graph', {
    spine,
    namedPoints,
    closed: false,
  });

  // Attach branch segments as extra metadata
  part.branchSegments = allSegments;

  return part;
}
