/**
 * Radial-shard-cluster constructor — radial shards from a center point.
 * PDR §3: { kind:'radial-shard-cluster', center, count, innerRadius, outerRadius }
 */

import { q, qp, buildSolvedPart } from '../geometry-utils.js';

/**
 * Solve a radial-shard-cluster primitive.
 * Produces `count` thin triangular shards radiating from center,
 * evenly spaced angularly, from innerRadius to outerRadius.
 */
export function solveRadialShardCluster(spec, ctx) {
  const centerAnchor = ctx.anchors[spec.center.anchor];
  if (!centerAnchor) throw new Error(`RadialShardCluster: unknown anchor "${spec.center.anchor}"`);

  const cx = centerAnchor[0] + (spec.center.offset?.[0] ?? 0);
  const cy = centerAnchor[1] + (spec.center.offset?.[1] ?? 0);
  const count = spec.count;
  const innerR = spec.innerRadius;
  const outerR = spec.outerRadius;

  if (count < 1) throw new Error('RadialShardCluster: count must be ≥ 1');

  const shards = [];
  const shardWidth = (2 * Math.PI) / count * 0.3; // 30% of angular slot

  for (let i = 0; i < count; i++) {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2; // start from top
    const innerPt = [cx + innerR * Math.cos(angle), cy + innerR * Math.sin(angle)];
    const outerPt = [cx + outerR * Math.cos(angle), cy + outerR * Math.sin(angle)];

    // Shard is a thin triangle: inner-left, outer, inner-right
    const halfW = shardWidth / 2;
    const innerLeft = [
      cx + innerR * Math.cos(angle - halfW),
      cy + innerR * Math.sin(angle - halfW),
    ];
    const innerRight = [
      cx + innerR * Math.cos(angle + halfW),
      cy + innerR * Math.sin(angle + halfW),
    ];

    shards.push({
      angle: q(angle),
      triangle: [qp(innerLeft), qp(outerPt), qp(innerRight)],
      inner: qp(innerPt),
      outer: qp(outerPt),
    });
  }

  // Spine: center to first shard tip
  const spine = [
    [cx, cy],
    shards[0].outer,
  ];

  const namedPoints = {
    center: [cx, cy],
    topShard: shards[0].outer,
  };

  const part = buildSolvedPart(spec._partId || 'radial-shard-cluster', 'radial-shard-cluster', {
    spine,
    namedPoints,
    closed: false,
  });

  part.shards = shards;
  return part;
}
