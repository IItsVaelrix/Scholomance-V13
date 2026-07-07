/**
 * armRig.js — pure 2D forward kinematics for a jointed arm.
 *
 * The 2D sibling of voxel-keyframe.js's compose order: each segment rotates
 * about its pivot, and the child joint is the parent's childOffset carried
 * through the accumulated rotation. Works in SCDL canvas pixel space.
 */

const deg2rad = (d) => (d * Math.PI) / 180;

function advance(jointX, jointY, dx, dy, angleRad, mirror) {
  const mx = mirror ? -dx : dx;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  return { x: jointX + mx * cos - dy * sin, y: jointY + mx * sin + dy * cos };
}

/** @returns {Array<{key,jointX,jointY,angleRad}>} */
export function solveArm(arm, anglesDeg = []) {
  const results = [];
  let jointX = arm.shoulder.x;
  let jointY = arm.shoulder.y;
  let accDeg = 0;
  arm.segments.forEach((seg, i) => {
    const delta = Number.isFinite(anglesDeg[i]) ? anglesDeg[i] : 0;
    const local = (arm.mirror ? -1 : 1) * (seg.restAngleDeg + delta);
    accDeg += local;
    const angleRad = deg2rad(accDeg);
    results.push({ key: seg.key, jointX, jointY, angleRad });
    const dx = seg.childOffset.x - seg.pivot.x;
    const dy = seg.childOffset.y - seg.pivot.y;
    const next = advance(jointX, jointY, dx, dy, angleRad, arm.mirror);
    jointX = next.x;
    jointY = next.y;
  });
  return results;
}

/** Resolve a hand-segment anchor (gripPoint, cradlePoint, …) in canvas space. */
export function anchorWorld(arm, anglesDeg = [], anchorKey = 'gripPoint') {
  const solved = solveArm(arm, anglesDeg);
  const handIdx = arm.segments.findIndex((s) => s[anchorKey]);
  if (handIdx < 0) return { x: 0, y: 0, angleRad: 0 };
  const seg = arm.segments[handIdx];
  const anchor = seg[anchorKey];
  const { jointX, jointY, angleRad } = solved[handIdx];
  const dx = anchor.x - seg.pivot.x;
  const dy = anchor.y - seg.pivot.y;
  const p = advance(jointX, jointY, dx, dy, angleRad, arm.mirror);
  return { x: p.x, y: p.y, angleRad };
}

/** Resolve the hand segment's gripPoint in canvas space. */
export function gripWorld(arm, anglesDeg = []) {
  return anchorWorld(arm, anglesDeg, 'gripPoint');
}
